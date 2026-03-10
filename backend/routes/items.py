"""Route module: items."""
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

@router.get("/items")
async def get_all_items():
    """Get all item definitions (for reference/admin)"""
    items = await db.items.find({}, {"_id": 0}).to_list(100)
    return items

# Simple catalog cache (30s TTL)
@router.get("/items/catalog")
async def get_items_catalog(
    search: str = None,
    rarity: str = None,
    sort: str = "name",
    limit: int = 100,
    offset: int = 0
):
    """Get all items as a public catalog with market data (cached 30s)"""
    cache_key = f"{search}:{rarity}:{sort}:{limit}:{offset}"
    now = datetime.now(timezone.utc).timestamp()
    
    if cache_key in _catalog_cache and (now - _catalog_cache_time.get(cache_key, 0)) < CATALOG_CACHE_TTL:
        return _catalog_cache[cache_key]
    
    query = {}
    if rarity and rarity != "all":
        query["rarity"] = rarity
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    # Exclude chests from the catalog by default
    query["category"] = {"$ne": "chest"}
    
    sort_key = [("name", 1)]
    if sort == "rap_desc":
        sort_key = [("rap", -1)]
    elif sort == "rap_asc":
        sort_key = [("rap", 1)]
    elif sort == "value_desc":
        sort_key = [("value", -1)]
    elif sort == "rarity":
        sort_key = [("rarity", -1)]
    
    total = await db.items.count_documents(query)
    items = await db.items.find(query, {"_id": 0}).sort(sort_key).skip(offset).limit(limit).to_list(limit)
    
    # Enrich each item with market data
    enriched = []
    for item in items:
        active_count = await db.marketplace_listings.count_documents({
            "item_id": item["item_id"], "status": "active"
        })
        cheapest = await db.marketplace_listings.find(
            {"item_id": item["item_id"], "status": "active"}, {"_id": 0, "price": 1}
        ).sort("price", 1).limit(1).to_list(1)
        
        total_qty = await db.user_inventory.count_documents({"item_id": item["item_id"]})

        ever_pipeline = await db.shop_listings.aggregate([
            {"$match": {"item_id": item["item_id"]}},
            {"$group": {"_id": None, "total": {"$sum": "$stock_sold"}}}
        ]).to_list(1)
        total_ever = ever_pipeline[0]["total"] if ever_pipeline else total_qty

        enriched.append({
            "item_id": item["item_id"],
            "name": item.get("name", "Unknown"),
            "flavor_text": item.get("flavor_text", ""),
            "rarity": item.get("rarity", "common"),
            "base_value": item.get("base_value", 0),
            "image_url": item.get("image_url"),
            "rap": item.get("rap", 0),
            "value": item.get("value", 0),
            "active_listings": active_count,
            "cheapest_price": cheapest[0]["price"] if cheapest else None,
            "total_quantity": total_qty,
            "total_ever_created": total_ever,
        })
    
    result = {"items": enriched, "total": total, "offset": offset, "limit": limit}
    _catalog_cache[cache_key] = result
    _catalog_cache_time[cache_key] = now
    return result

@router.get("/items/{item_id}")
async def get_item(item_id: str):
    """Get a specific item definition"""
    item = await db.items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@router.get("/shop")
async def get_shop_items():
    """Get all active shop items"""
    now = datetime.now(timezone.utc)
    now_naive = datetime.utcnow()
    
    # Find active listings
    listings = await db.shop_listings.find({
        "is_active": True
    }, {"_id": 0}).to_list(100)
    
    # Filter by availability window - handle both datetime objects and ISO strings
    active_listings = []
    for listing in listings:
        available_from = listing.get("available_from")
        available_until = listing.get("available_until")
        
        # Convert to datetime for comparison if it's a string
        if isinstance(available_from, str):
            try:
                available_from = datetime.fromisoformat(available_from.replace("Z", "+00:00"))
                if available_from.tzinfo:
                    available_from = available_from.replace(tzinfo=None)
            except:
                available_from = None
        
        if isinstance(available_until, str):
            try:
                available_until = datetime.fromisoformat(available_until.replace("Z", "+00:00"))
                if available_until.tzinfo:
                    available_until = available_until.replace(tzinfo=None)
            except:
                available_until = None
        
        # Check if currently available
        if available_from and available_from > now_naive:
            continue  # Not yet available
        
        if available_until and available_until < now_naive:
            continue  # Expired
        
        active_listings.append(listing)
    
    # Enrich with rarity info
    for listing in active_listings:
        rarity_info = ITEM_RARITIES.get(listing.get("item_rarity", "common"), ITEM_RARITIES["common"])
        listing["rarity_display"] = rarity_info["name"]
        listing["rarity_color"] = rarity_info["color"]
        
        # Convert dates to ISO strings for JSON
        if listing.get("available_from"):
            af = listing["available_from"]
            if isinstance(af, datetime):
                listing["available_from"] = af.isoformat()
        
        if listing.get("available_until"):
            au = listing["available_until"]
            if isinstance(au, datetime):
                remaining = au - now_naive
                listing["days_remaining"] = max(0, remaining.days)
                listing["hours_remaining"] = max(0, int(remaining.seconds / 3600))
                listing["total_hours_remaining"] = max(0, int(remaining.total_seconds() / 3600))
                listing["available_until"] = au.isoformat()
            elif isinstance(au, str):
                try:
                    au_dt = datetime.fromisoformat(au.replace("Z", "+00:00"))
                    if au_dt.tzinfo:
                        au_dt = au_dt.replace(tzinfo=None)
                    remaining = au_dt - now_naive
                    listing["days_remaining"] = max(0, remaining.days)
                    listing["hours_remaining"] = max(0, int(remaining.seconds / 3600))
                    listing["total_hours_remaining"] = max(0, int(remaining.total_seconds() / 3600))
                except:
                    listing["days_remaining"] = None
                    listing["hours_remaining"] = None
        else:
            listing["days_remaining"] = None
            listing["hours_remaining"] = None
    
    return active_listings

@router.get("/shop/history")
async def get_shop_history():
    """Get expired/out of print shop items"""
    now = datetime.now(timezone.utc)
    
    # Find listings that have expired (out of print)
    expired = await db.shop_listings.find({
        "is_active": False
    }, {"_id": 0}).sort("available_until", -1).to_list(50)
    
    for listing in expired:
        rarity_info = ITEM_RARITIES.get(listing.get("item_rarity", "common"), ITEM_RARITIES["common"])
        listing["rarity_display"] = rarity_info["name"]
        listing["rarity_color"] = rarity_info["color"]
    
    return expired

@router.post("/shop/purchase")
async def purchase_shop_item(purchase: ShopPurchaseRequest, request: Request):
    """Purchase an item from the shop"""
    user = await get_current_user(request)
    now_naive = datetime.utcnow()
    
    # Find the shop listing
    listing = await db.shop_listings.find_one({
        "shop_listing_id": purchase.shop_listing_id,
        "is_active": True
    })
    
    if not listing:
        raise HTTPException(status_code=404, detail="Shop listing not found or no longer available")
    
    # Check availability window
    if listing.get("available_until"):
        until = listing["available_until"]
        if isinstance(until, str):
            until = datetime.fromisoformat(until.replace('Z', '+00:00')).replace(tzinfo=None)
        if now_naive > until:
            raise HTTPException(status_code=400, detail="This item is no longer available in the shop")
    
    # Check stock limit
    if listing.get("stock_limit") is not None:
        if listing.get("stock_sold", 0) >= listing["stock_limit"]:
            raise HTTPException(status_code=400, detail="This item is sold out")
    
    # Check user balance
    price = listing["price"]
    user_doc = await db.users.find_one({"user_id": user["user_id"]})
    if not user_doc or user_doc.get("balance", 0) < price:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Check if user already owns this item (optional - can own multiple)
    # For now, allow multiple purchases (collectibles can stack)
    
    # Deduct balance
    new_balance = round(user_doc["balance"] - price, 2)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"balance": new_balance}}
    )
    
    # Add item to inventory - store purchase_price for sell calculation
    # Also store untradeable_until from shop listing
    inventory_item = {
        "inventory_id": f"inv_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "item_id": listing["item_id"],
        "item_name": listing["item_name"],
        "item_rarity": listing["item_rarity"],
        "item_image": listing.get("item_image"),
        "item_flavor_text": listing.get("item_flavor_text", ""),
        "purchase_price": price,  # Store actual purchase price for sell calculation
        "acquired_at": now_naive.isoformat(),
        "acquired_from": "shop",
        "untradeable_until": listing.get("untradeable_until")  # From shop listing
    }
    await db.user_inventory.insert_one(inventory_item)
    
    # Update stock sold
    await db.shop_listings.update_one(
        {"shop_listing_id": purchase.shop_listing_id},
        {"$inc": {"stock_sold": 1}}
    )

    # Invalidate catalog cache so counts update immediately
    _catalog_cache.clear()
    _catalog_cache_time.clear()
    
    # Track purchase in activity/bet_history
    activity_doc = {
        "bet_id": f"item_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "game_type": "item_purchase",
        "bet_amount": price,
        "win_amount": 0,
        "net_outcome": -price,  # Negative because spending G
        "result": "purchase",
        "timestamp": now_naive.isoformat(),
        "details": {
            "item_id": listing["item_id"],
            "item_name": listing["item_name"],
            "item_rarity": listing["item_rarity"],
            "action": "buy"
        }
    }
    await db.bet_history.insert_one(activity_doc)
    
    # Record inventory value event (buy = positive delta)
    await record_inventory_value_event(
        user_id=user["user_id"],
        event_type="buy",
        delta_value=price,  # Positive - inventory value increased
        related_item_id=listing["item_id"],
        related_item_name=listing["item_name"],
        details={"source": "shop", "rarity": listing["item_rarity"]}
    )
    
    # Record account activity (item purchase = expense)
    await record_account_activity(
        user_id=user["user_id"],
        event_type="item_purchase",
        amount=-price,
        source=f"Shop: {listing['item_name']}",
        details={"item_id": listing["item_id"], "item_name": listing["item_name"]}
    )
    
    return {
        "success": True,
        "message": f"Successfully purchased {listing['item_name']}!",
        "item": {
            "inventory_id": inventory_item["inventory_id"],
            "item_id": listing["item_id"],
            "item_name": listing["item_name"],
            "item_rarity": listing["item_rarity"]
        },
        "new_balance": new_balance
    }

