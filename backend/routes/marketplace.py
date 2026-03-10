"""Route module: marketplace."""
from fastapi import APIRouter, HTTPException, Request, Response, BackgroundTasks
from fastapi.responses import JSONResponse, PlainTextResponse
from typing import List, Optional, Dict, Any, Tuple
from database import db
from config import *
from models import *
from services import *
from cache import _catalog_cache, _catalog_cache_time
from deps import limiter
import uuid
import logging
import asyncio
import random
import secrets
import hashlib
import re
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/marketplace/listings")
async def get_marketplace_listings(
    sort: str = "newest",
    rarity: str = None,
    search: str = None,
    limit: int = 50,
    offset: int = 0
):
    """Get active marketplace listings with filtering and sorting"""
    query = {"status": "active"}
    
    if rarity and rarity != "all":
        query["item_rarity"] = rarity
    
    if search:
        query["item_name"] = {"$regex": search, "$options": "i"}
    
    sort_key = [("created_at", -1)]  # default: newest
    if sort == "price_asc":
        sort_key = [("price", 1)]
    elif sort == "price_desc":
        sort_key = [("price", -1)]
    elif sort == "rarity":
        sort_key = [("rarity_order", -1), ("price", 1)]
    
    total = await db.marketplace_listings.count_documents(query)
    listings = await db.marketplace_listings.find(
        query, {"_id": 0}
    ).sort(sort_key).skip(offset).limit(limit).to_list(limit)
    
    return {
        "listings": listings,
        "total": total,
        "offset": offset,
        "limit": limit
    }


@router.get("/marketplace/my-listings")
async def get_my_marketplace_listings(request: Request):
    """Get current user's active marketplace listings"""
    user = await get_current_user(request)
    
    listings = await db.marketplace_listings.find(
        {"seller_id": user["user_id"], "status": "active"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"listings": listings}


@router.get("/marketplace/history")
async def get_marketplace_history(item_id: str = None, limit: int = 20):
    """Get recent marketplace sales history"""
    query = {}
    if item_id:
        query["item_id"] = item_id
    
    history = await db.item_price_history.find(
        query, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {"history": history, "total": len(history)}


@router.post("/marketplace/list")
async def marketplace_list_item(data: MarketplaceListRequest, request: Request):
    """List an inventory item on the marketplace for sale"""
    user = await get_current_user(request)
    
    if data.price <= 0:
        raise HTTPException(status_code=400, detail="Price must be greater than 0")
    
    if data.price > 999999999:
        raise HTTPException(status_code=400, detail="Price exceeds maximum")
    
    # Find the item in user's inventory
    inv_item = await db.user_inventory.find_one({
        "inventory_id": data.inventory_id,
        "user_id": user["user_id"]
    })
    
    if not inv_item:
        raise HTTPException(status_code=404, detail="Item not found in your inventory")
    
    # Check if item is a chest (chests can't be listed)
    if inv_item.get("item_id", "").endswith("_chest") or inv_item.get("category") == "chest":
        item_def = await db.items.find_one({"item_id": inv_item["item_id"]})
        if item_def and item_def.get("category") == "chest":
            raise HTTPException(status_code=400, detail="Chests cannot be listed on the marketplace")
    
    # Check trade lock
    untradeable_until = inv_item.get("untradeable_until")
    if untradeable_until:
        if isinstance(untradeable_until, str):
            lock_time = datetime.fromisoformat(untradeable_until.replace("Z", "+00:00"))
        else:
            lock_time = untradeable_until
        if datetime.now(timezone.utc) < lock_time:
            raise HTTPException(status_code=400, detail="This item is still trade-locked")
    
    # Check if this specific item is already listed
    existing = await db.marketplace_listings.find_one({
        "inventory_id": data.inventory_id,
        "status": "active"
    })
    if existing:
        raise HTTPException(status_code=400, detail="This item is already listed on the marketplace")
    
    # Get item definition for enrichment
    item_def = await db.items.find_one({"item_id": inv_item["item_id"]}, {"_id": 0})
    
    rarity_order = {"common": 0, "uncommon": 1, "rare": 2, "epic": 3, "legendary": 4}
    
    listing_id = f"ml_{uuid.uuid4().hex[:12]}"
    listing = {
        "listing_id": listing_id,
        "inventory_id": data.inventory_id,
        "item_id": inv_item["item_id"],
        "item_name": inv_item.get("item_name", "Unknown"),
        "item_rarity": inv_item.get("item_rarity", "common"),
        "item_image": inv_item.get("item_image"),
        "item_flavor_text": inv_item.get("item_flavor_text", ""),
        "rarity_order": rarity_order.get(inv_item.get("item_rarity", "common"), 0),
        "seller_id": user["user_id"],
        "seller_username": user["username"],
        "price": round(data.price, 2),
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "rap": item_def.get("rap", 0) if item_def else 0,
    }
    
    await db.marketplace_listings.insert_one(listing)
    
    # Remove _id before returning
    listing.pop("_id", None)
    
    return {"success": True, "listing": listing}


@router.post("/marketplace/buy")
async def marketplace_buy_item(data: MarketplaceBuyRequest, request: Request):
    """Buy an item from the marketplace"""
    user = await get_current_user(request)
    
    # Find the listing
    listing = await db.marketplace_listings.find_one({
        "listing_id": data.listing_id,
        "status": "active"
    })
    
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found or already sold")
    
    # Can't buy own listing
    if listing["seller_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot buy your own listing")
    
    price = listing["price"]
    
    # Check buyer has enough G
    buyer = await db.users.find_one({"user_id": user["user_id"]})
    if buyer.get("balance", 0) < price:
        raise HTTPException(status_code=400, detail="Insufficient G balance")
    
    # Verify the inventory item still exists and belongs to seller
    inv_item = await db.user_inventory.find_one({
        "inventory_id": listing["inventory_id"],
        "user_id": listing["seller_id"]
    })
    
    if not inv_item:
        # Item was removed/traded while listed - clean up
        await db.marketplace_listings.update_one(
            {"listing_id": data.listing_id},
            {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=400, detail="Item is no longer available")
    
    # Calculate fee
    fee = round(price * MARKETPLACE_FEE_PERCENT / 100, 2)
    seller_receives = round(price - fee, 2)
    
    # Execute transaction:
    # 1. Deduct G from buyer
    new_buyer_balance = round(buyer["balance"] - price, 2)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"balance": new_buyer_balance}}
    )
    
    # 2. Add G to seller (minus fee)
    seller = await db.users.find_one({"user_id": listing["seller_id"]})
    new_seller_balance = round(seller.get("balance", 0) + seller_receives, 2)
    await db.users.update_one(
        {"user_id": listing["seller_id"]},
        {"$set": {"balance": new_seller_balance}}
    )
    
    # 3. Transfer item ownership
    await db.user_inventory.update_one(
        {"inventory_id": listing["inventory_id"]},
        {"$set": {
            "user_id": user["user_id"],
            "acquired_from": "marketplace",
            "acquired_at": datetime.now(timezone.utc).isoformat(),
            "purchase_price": price
        }}
    )
    
    # 3b. Record owner history
    await record_owner_change(
        listing["inventory_id"], listing["item_id"],
        listing["seller_id"], user["user_id"], "marketplace"
    )
    
    # 4. Mark listing as sold
    await db.marketplace_listings.update_one(
        {"listing_id": data.listing_id},
        {"$set": {
            "status": "sold",
            "buyer_id": user["user_id"],
            "buyer_username": user["username"],
            "sold_at": datetime.now(timezone.utc).isoformat(),
            "fee_amount": fee,
            "seller_received": seller_receives
        }}
    )
    
    # 5. Record in item_price_history for RAP calculation
    sale_record = {
        "sale_id": f"sale_{uuid.uuid4().hex[:12]}",
        "item_id": listing["item_id"],
        "price": price,
        "seller_id": listing["seller_id"],
        "seller_username": listing["seller_username"],
        "buyer_id": user["user_id"],
        "buyer_username": user["username"],
        "listing_id": data.listing_id,
        "fee_amount": fee,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.item_price_history.insert_one(sale_record)
    
    # 6. Recalculate RAP for this item
    new_rap = await calculate_rap(listing["item_id"])
    
    # 6b. Store RAP snapshot in sale record for chart history
    await db.item_price_history.update_one(
        {"sale_id": sale_record["sale_id"]},
        {"$set": {"rap_at_sale": new_rap}}
    )
    
    # 7. Record activity for both parties
    await record_account_activity(
        user_id=user["user_id"],
        event_type="marketplace_buy",
        amount=-price,
        source=f"Marketplace: {listing['item_name']} gekauft",
        details={"item_id": listing["item_id"], "listing_id": data.listing_id, "price": price}
    )
    
    await record_account_activity(
        user_id=listing["seller_id"],
        event_type="marketplace_sell",
        amount=seller_receives,
        source=f"Marketplace: {listing['item_name']} verkauft",
        details={"item_id": listing["item_id"], "listing_id": data.listing_id, "price": price, "fee": fee}
    )
    
    # Cancel any other active listings for this same inventory_id
    await db.marketplace_listings.update_many(
        {"inventory_id": listing["inventory_id"], "status": "active", "listing_id": {"$ne": data.listing_id}},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "success": True,
        "item_name": listing["item_name"],
        "price": price,
        "fee": fee,
        "seller_received": seller_receives,
        "new_balance": new_buyer_balance,
        "new_rap": new_rap
    }


@router.post("/marketplace/delist")
async def marketplace_delist_item(data: MarketplaceDelistRequest, request: Request):
    """Remove an item from the marketplace"""
    user = await get_current_user(request)
    
    listing = await db.marketplace_listings.find_one({
        "listing_id": data.listing_id,
        "seller_id": user["user_id"],
        "status": "active"
    })
    
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    
    await db.marketplace_listings.update_one(
        {"listing_id": data.listing_id},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True, "message": "Listing removed"}


@router.get("/items/{item_id}/details")
async def get_item_details(item_id: str):
    """Get detailed item info including RAP, value, demand, and recent sales"""
    item = await db.items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Get active listings count and cheapest price
    active_listings = await db.marketplace_listings.count_documents({
        "item_id": item_id, "status": "active"
    })
    cheapest = await db.marketplace_listings.find(
        {"item_id": item_id, "status": "active"}, {"_id": 0, "price": 1}
    ).sort("price", 1).limit(1).to_list(1)
    
    # Get recent sales
    recent_sales = await db.item_price_history.find(
        {"item_id": item_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(20).to_list(20)
    
    # Get total owners
    owner_count = len(await db.user_inventory.distinct("user_id", {"item_id": item_id}))
    
    # Get total in circulation
    total_quantity = await db.user_inventory.count_documents({"item_id": item_id})

    # Get total ever created (sum of stock_sold across all shop listings)
    ever_pipeline = await db.shop_listings.aggregate([
        {"$match": {"item_id": item_id}},
        {"$group": {"_id": None, "total": {"$sum": "$stock_sold"}}}
    ]).to_list(1)
    total_ever_created = ever_pipeline[0]["total"] if ever_pipeline else total_quantity

    # Calculate demand
    demand = await calculate_demand(item_id)
    
    # Get owner history (last 20 changes)
    owner_history = await db.item_owner_history.find(
        {"item_id": item_id}, {"_id": 0}
    ).sort("acquired_at", -1).limit(20).to_list(20)
    
    # Enrich owner history with usernames
    enriched_history = []
    for record in owner_history:
        user_doc = await db.users.find_one({"user_id": record["user_id"]}, {"_id": 0, "username": 1})
        enriched_history.append({
            **record,
            "username": user_doc["username"] if user_doc else "Unknown",
        })
    
    return {
        **item,
        "created_at": item.get("created_at").isoformat() if isinstance(item.get("created_at"), datetime) else str(item.get("created_at", "")),
        "rap": item.get("rap", 0),
        "value": item.get("value", 0),
        "active_listings": active_listings,
        "cheapest_price": cheapest[0]["price"] if cheapest else None,
        "recent_sales": recent_sales,
        "owner_count": owner_count,
        "total_quantity": total_quantity,
        "total_ever_created": total_ever_created,
        "demand": demand,
        "owner_history": enriched_history,
    }


@router.get("/items/{item_id}/chart-data")
async def get_item_chart_data(item_id: str):
    """Get time-series data for item charts: Value history, RAP history, Sales"""
    item = await db.items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Sales with RAP snapshots (price history)
    sales = await db.item_price_history.find(
        {"item_id": item_id}, {"_id": 0}
    ).sort("timestamp", 1).to_list(500)
    
    sales_data = [{
        "timestamp": s["timestamp"],
        "price": s["price"],
        "rap": s.get("rap_at_sale", 0),
        "buyer": s.get("buyer_username", ""),
        "seller": s.get("seller_username", ""),
    } for s in sales]
    
    # Value history
    value_changes = await db.item_value_history.find(
        {"item_id": item_id}, {"_id": 0}
    ).sort("timestamp", 1).to_list(500)
    
    value_data = [{
        "timestamp": v["timestamp"],
        "value": v["value"],
    } for v in value_changes]
    
    return {
        "item_id": item_id,
        "current_rap": item.get("rap", 0),
        "current_value": item.get("value", 0),
        "sales": sales_data,
        "value_history": value_data,
    }


@router.get("/marketplace/recent-sales")
async def get_recent_marketplace_sales(limit: int = 20):
    """Get recent marketplace sales for live feed"""
    sales = await db.item_price_history.find(
        {}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Enrich with item data
    enriched = []
    for sale in sales:
        item = await db.items.find_one({"item_id": sale["item_id"]}, {"_id": 0, "rarity": 1, "image_url": 1, "name": 1})
        enriched.append({
            **sale,
            "item_rarity": item.get("rarity", "common") if item else "common",
            "item_image": item.get("image_url") if item else None,
            "item_name": item.get("name", sale.get("item_id", "Unknown")) if item else sale.get("item_id", "Unknown"),
        })
    
    return {"sales": enriched}


# ============== TRADE ADS ENDPOINTS ==============

