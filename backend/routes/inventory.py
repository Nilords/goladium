"""Route module: inventory."""
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

@router.get("/inventory")
async def get_user_inventory(request: Request):
    """Get current user's inventory with stacking for identical items"""
    user = await get_current_user(request)
    
    # Get total count first
    total_count = await db.user_inventory.count_documents({"user_id": user["user_id"]})
    
    # Aggregate items by item_id for stacking
    pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$sort": {"acquired_at": -1}},
        {"$group": {
            "_id": "$item_id",
            "item_id": {"$first": "$item_id"},
            "item_name": {"$first": "$item_name"},
            "item_rarity": {"$first": "$item_rarity"},
            "item_image": {"$first": "$item_image"},
            "item_flavor_text": {"$first": "$item_flavor_text"},
            "category": {"$first": "$category"},
            "purchase_price": {"$first": "$purchase_price"},
            "is_tradeable": {"$first": "$is_tradeable"},
            "is_sellable": {"$first": "$is_sellable"},
            "count": {"$sum": 1},
            "inventory_ids": {"$push": "$inventory_id"},
            "first_inventory_id": {"$first": "$inventory_id"},
            "acquired_at": {"$first": "$acquired_at"}
        }},
        {"$sort": {"acquired_at": -1}},
        {"$limit": 500}
    ]
    
    stacked_items = await db.user_inventory.aggregate(pipeline).to_list(500)

    # Batch-fetch value/rap from db.items for all item_ids
    item_ids = list({i["item_id"] for i in stacked_items})
    item_defs_cursor = db.items.find({"item_id": {"$in": item_ids}}, {"_id": 0, "item_id": 1, "value": 1, "rap": 1})
    item_defs_map = {d["item_id"]: d async for d in item_defs_cursor}

    # Sell fee percentage (30% fee = 70% return)
    SELL_FEE_PERCENT = 30
    SELL_RETURN_PERCENT = 100 - SELL_FEE_PERCENT

    # Enrich with rarity info and sell values
    items = []
    for item in stacked_items:
        rarity_info = ITEM_RARITIES.get(item.get("item_rarity", "common"), ITEM_RARITIES["common"])
        
        # Use first_inventory_id as the main inventory_id for actions
        enriched_item = {
            "inventory_id": item["first_inventory_id"],
            "item_id": item["item_id"],
            "item_name": item["item_name"],
            "item_rarity": item["item_rarity"],
            "item_image": item.get("item_image"),
            "item_flavor_text": item.get("item_flavor_text"),
            "category": item.get("category"),
            "rarity_display": rarity_info["name"],
            "rarity_color": rarity_info["color"],
            "count": item["count"],
            "inventory_ids": item["inventory_ids"][:1000],  # Limit for performance
            "acquired_at": item.get("acquired_at"),
            "is_tradeable": item.get("is_tradeable", False),
            "is_sellable": item.get("is_sellable", False)
        }
        
        # Get purchase price
        purchase_price = item.get("purchase_price", 0) or 0
        
        if purchase_price <= 0:
            # Try to get current shop price
            shop_listing = await db.shop_listings.find_one(
                {"item_id": item["item_id"], "is_active": True},
                {"_id": 0, "price": 1}
            )
            if shop_listing:
                purchase_price = shop_listing.get("price", 0)
        
        enriched_item["purchase_price"] = purchase_price
        enriched_item["sell_value"] = round(purchase_price * SELL_RETURN_PERCENT / 100, 2)
        enriched_item["sell_fee_percent"] = SELL_FEE_PERCENT
        item_def_data = item_defs_map.get(item["item_id"], {})
        enriched_item["value"] = item_def_data.get("value", 0) or 0
        enriched_item["rap"] = item_def_data.get("rap", 0) or 0
        
        items.append(enriched_item)
    
    return {
        "items": items,
        "total_items": total_count
    }

# ============== CHEST OPENING SYSTEM ==============
# Simple chest system - one chest per GamePass level up

# G Drop rates and ranges
# CHEST_G_DROPS, ITEM_DROP_CHANCE -> config.py


@router.get("/chest/payout-table")
async def get_chest_payout_table():
    """Get the chest payout table for display"""
    # Count shop items for display
    now = datetime.now(timezone.utc)
    shop_count = await db.shop_listings.count_documents({
        "available_until": {"$gt": now.isoformat()},
        "stock": {"$gt": 0}
    })
    
    return {
        "g_drops": [
            {
                "tier": "normal",
                "label": CHEST_G_DROPS["normal"]["label"],
                "range": f"{CHEST_G_DROPS['normal']['min']}-{CHEST_G_DROPS['normal']['max']} G",
                "chance": CHEST_G_DROPS["normal"]["chance"],
                "color": CHEST_G_DROPS["normal"]["color"]
            },
            {
                "tier": "good",
                "label": CHEST_G_DROPS["good"]["label"],
                "range": f"{CHEST_G_DROPS['good']['min']}-{CHEST_G_DROPS['good']['max']} G",
                "chance": CHEST_G_DROPS["good"]["chance"],
                "color": CHEST_G_DROPS["good"]["color"]
            },
            {
                "tier": "rare",
                "label": CHEST_G_DROPS["rare"]["label"],
                "range": f"{CHEST_G_DROPS['rare']['min']}-{CHEST_G_DROPS['rare']['max']} G",
                "chance": CHEST_G_DROPS["rare"]["chance"],
                "color": CHEST_G_DROPS["rare"]["color"]
            }
        ],
        "item_drop": {
            "chance": ITEM_DROP_CHANCE,
            "label": "Item Drop",
            "description": "Zufälliges Shop-Item!",
            "color": "#eab308",
            "pool_size": shop_count
        }
    }


@router.post("/inventory/open-chest")
async def open_chest(data: OpenChestRequest, request: Request):
    """
    Open a chest item from inventory and receive random rewards.
    The chest is consumed in the process.
    1% chance to get a random shop item!
    """
    user = await get_current_user(request)
    user_id = user["user_id"]
    now = datetime.now(timezone.utc)
    
    # Find the chest in inventory
    chest_item = await db.user_inventory.find_one({
        "inventory_id": data.inventory_id,
        "user_id": user_id
    })
    
    if not chest_item:
        raise HTTPException(status_code=404, detail="Chest not found in inventory")
    
    # Verify it's a chest
    item_def = await db.items.find_one({"item_id": chest_item["item_id"]})
    if not item_def or item_def.get("category") != "chest":
        raise HTTPException(status_code=400, detail="This item is not a chest")
    
    chest_id = chest_item["item_id"]
    chest_name = chest_item.get("item_name", item_def.get("name", "Chest"))
    chest_rarity = chest_item.get("item_rarity", item_def.get("rarity", "common"))
    chest_value = chest_item.get("purchase_price", item_def.get("base_value", 0))
    
    # Generate reward
    reward = generate_simple_chest_reward_sync()
    
    processed_reward = None
    total_g_gained = 0
    item_gained = None
    
    if reward["type"] == "item_roll":
        # 1% item drop - get random shop item!
        shop_item = await get_random_shop_item()
        
        if shop_item:
            # Get full item definition
            item_id = shop_item.get("item_id")
            reward_item_def = await db.items.find_one({"item_id": item_id})
            
            if reward_item_def:
                # Add item to inventory
                new_inventory_item = {
                    "inventory_id": f"inv_{uuid.uuid4().hex[:12]}",
                    "user_id": user_id,
                    "item_id": item_id,
                    "item_name": reward_item_def.get("name", shop_item.get("item_name", "Unknown Item")),
                    "item_rarity": reward_item_def.get("rarity", shop_item.get("item_rarity", "common")),
                    "item_flavor_text": reward_item_def.get("flavor_text", ""),
                    "purchase_price": reward_item_def.get("base_value", shop_item.get("price", 0)),
                    "acquired_at": now.isoformat(),
                    "acquired_from": "chest_1%_drop",
                    "source": "gamepass_chest_jackpot"
                }
                await db.user_inventory.insert_one(new_inventory_item)
                
                item_value = reward_item_def.get("base_value", shop_item.get("price", 0))
                item_gained = {
                    "inventory_id": new_inventory_item["inventory_id"],
                    "item_id": item_id,
                    "name": reward_item_def.get("name", shop_item.get("item_name")),
                    "rarity": reward_item_def.get("rarity", shop_item.get("item_rarity")),
                    "value": item_value,
                    "flavor_text": reward_item_def.get("flavor_text", "")
                }
                
                processed_reward = {
                    "type": "item",
                    "item_id": item_id,
                    "name": reward_item_def.get("name", shop_item.get("item_name")),
                    "rarity": reward_item_def.get("rarity", shop_item.get("item_rarity")),
                    "value": item_value,
                    "tier": "legendary",
                    "tier_label": "🎉 JACKPOT!",
                    "tier_color": "#eab308"
                }
                
                # Record inventory value event
                await record_inventory_value_event(
                    user_id=user_id,
                    event_type="drop",
                    delta_value=item_value,
                    related_item_id=item_id,
                    related_item_name=reward_item_def.get("name"),
                    details={"source": "chest_1%_jackpot", "chest_name": chest_name}
                )
        
        # If no shop item found, give rare G instead
        if not processed_reward:
            import random
            g_amount = round(random.uniform(41, 100), 2)
            total_g_gained = g_amount
            processed_reward = {
                "type": "currency",
                "currency": "G",
                "amount": g_amount,
                "tier": "rare",
                "tier_label": "Selten",
                "tier_color": "#a855f7"
            }
    
    elif reward["type"] == "currency":
        # G reward
        total_g_gained = reward["amount"]
        processed_reward = {
            "type": "currency",
            "currency": "G",
            "amount": reward["amount"],
            "tier": reward["tier"],
            "tier_label": reward["tier_label"],
            "tier_color": reward["tier_color"]
        }
    
    # Apply G reward to user balance
    if total_g_gained > 0:
        await db.users.update_one(
            {"user_id": user_id},
            {"$inc": {"balance": total_g_gained}}
        )
        
        # Record account value snapshot
        updated_user = await db.users.find_one({"user_id": user_id})
        await record_value_snapshot(
            user_id,
            updated_user.get("balance", 0),
            updated_user.get("balance_a", 0),
            "chest_opening"
        )
        
        # Record account activity (G from chest = profit)
        await record_account_activity(
            user_id=user_id,
            event_type="chest",
            amount=total_g_gained,
            source=f"Chest: {chest_name}",
            details={"chest_id": chest_id, "chest_rarity": chest_rarity, "reward_tier": reward.get("tier", "common")}
        )
    
    # Remove the chest from inventory
    await db.user_inventory.delete_one({"inventory_id": data.inventory_id})
    
    # Record inventory value event for consumed chest
    await record_inventory_value_event(
        user_id=user_id,
        event_type="drop",
        delta_value=-chest_value,
        related_item_id=chest_id,
        related_item_name=chest_name,
        details={"action": "chest_opened"}
    )
    
    # Get rarity info for display
    rarity_info = ITEM_RARITIES.get(chest_rarity, ITEM_RARITIES["common"])
    
    return {
        "success": True,
        "chest_opened": {
            "item_id": chest_id,
            "name": chest_name,
            "rarity": chest_rarity,
            "rarity_display": rarity_info["name"],
            "rarity_color": rarity_info["color"]
        },
        "reward": processed_reward,
        "total_g_gained": total_g_gained,
        "item_gained": item_gained,
        "new_balance": (await db.users.find_one({"user_id": user_id})).get("balance", 0)
    }


@router.post("/inventory/open-chests-batch")
async def open_chests_batch(data: OpenChestsBatchRequest, request: Request):
    """
    Open multiple chests at once - ALL results are calculated FIRST before any response.
    This prevents duplication bugs as all chests are consumed atomically.
    """
    user = await get_current_user(request)
    user_id = user["user_id"]
    now = datetime.now(timezone.utc)
    
    if not data.inventory_ids:
        raise HTTPException(status_code=400, detail="No chests provided")
    
    if len(data.inventory_ids) > 1000:
        raise HTTPException(status_code=400, detail="Maximum 1000 chests per batch")
    
    # STEP 1: Find ALL chests and verify ownership FIRST
    chests = await db.user_inventory.find({
        "inventory_id": {"$in": data.inventory_ids},
        "user_id": user_id
    }).to_list(1000)
    
    if not chests:
        raise HTTPException(status_code=404, detail="No valid chests found")
    
    # Verify all are actually chests
    valid_chest_ids = []
    for chest in chests:
        if chest.get("category") == "chest" or "chest" in chest.get("item_id", ""):
            valid_chest_ids.append(chest["inventory_id"])
    
    if not valid_chest_ids:
        raise HTTPException(status_code=400, detail="No valid chests found in selection")
    
    # STEP 2: DELETE all chests FIRST (atomic - prevents duplication)
    delete_result = await db.user_inventory.delete_many({
        "inventory_id": {"$in": valid_chest_ids},
        "user_id": user_id
    })
    
    # STEP 3: Now generate ALL rewards (chests are already gone from inventory)
    results = []
    total_g = 0
    items_won = []
    
    for chest in chests:
        if chest["inventory_id"] not in valid_chest_ids:
            continue
            
        # Generate reward
        reward = generate_simple_chest_reward_sync()
        
        if reward["type"] == "item_roll":
            # 1% item drop
            shop_item = await get_random_shop_item()
            
            if shop_item:
                item_id = shop_item.get("item_id")
                reward_item_def = await db.items.find_one({"item_id": item_id})
                
                if reward_item_def:
                    new_inv_id = f"inv_{uuid.uuid4().hex[:12]}"
                    new_inventory_item = {
                        "inventory_id": new_inv_id,
                        "user_id": user_id,
                        "item_id": item_id,
                        "item_name": reward_item_def.get("name", "Unknown"),
                        "item_rarity": reward_item_def.get("rarity", "common"),
                        "item_flavor_text": reward_item_def.get("flavor_text", ""),
                        "purchase_price": reward_item_def.get("base_value", 0),
                        "acquired_at": now.isoformat(),
                        "acquired_from": "chest_1%_drop"
                    }
                    await db.user_inventory.insert_one(new_inventory_item)
                    
                    item_value = reward_item_def.get("base_value", 0)
                    items_won.append({
                        "name": reward_item_def.get("name"),
                        "rarity": reward_item_def.get("rarity"),
                        "value": item_value
                    })
                    
                    results.append({
                        "type": "item",
                        "name": reward_item_def.get("name"),
                        "rarity": reward_item_def.get("rarity"),
                        "value": item_value,
                        "tier": "legendary",
                        "tier_label": "🎉 JACKPOT!",
                        "tier_color": "#eab308"
                    })
                    
                    await record_inventory_value_event(
                        user_id=user_id,
                        event_type="drop",
                        delta_value=item_value,
                        related_item_id=item_id,
                        related_item_name=reward_item_def.get("name"),
                        details={"source": "chest_batch_jackpot"}
                    )
                    continue
            
            # Fallback to rare G
            import random
            g_amount = round(random.uniform(41, 100), 2)
            total_g += g_amount
            results.append({
                "type": "currency",
                "amount": g_amount,
                "tier": "rare",
                "tier_label": "Selten",
                "tier_color": "#a855f7"
            })
        else:
            # Normal G reward
            total_g += reward["amount"]
            results.append({
                "type": "currency",
                "amount": reward["amount"],
                "tier": reward["tier"],
                "tier_label": reward["tier_label"],
                "tier_color": reward["tier_color"]
            })
    
    # STEP 4: Apply total G to user balance (one update, not per chest)
    if total_g > 0:
        await db.users.update_one(
            {"user_id": user_id},
            {"$inc": {"balance": total_g}}
        )
    
    # Get final balance
    updated_user = await db.users.find_one({"user_id": user_id})
    new_balance = updated_user.get("balance", 0)
    
    # Record single value snapshot for the batch
    if total_g > 0:
        await record_value_snapshot(user_id, new_balance, updated_user.get("balance_a", 0), "chest_batch")
        
        # Record account activity (G from chests = profit)
        await record_account_activity(
            user_id=user_id,
            event_type="chest",
            amount=total_g,
            source=f"Chests geöffnet: {len(results)}x",
            details={"chests_count": len(results), "items_won": items_won}
        )
    
    # Calculate summary
    tier_counts = {"normal": 0, "good": 0, "rare": 0}
    for r in results:
        if r["type"] == "currency":
            tier_counts[r["tier"]] = tier_counts.get(r["tier"], 0) + 1
    
    return {
        "success": True,
        "chests_opened": len(results),
        "results": results,  # All pre-calculated rewards for animation
        "summary": {
            "total_g": round(total_g, 2),
            "items_won": items_won,
            "tier_counts": tier_counts
        },
        "new_balance": round(new_balance, 2)
    }


@router.get("/inventory/{user_id}")
async def get_user_inventory_public(user_id: str):
    """Get a user's inventory (public view - for profiles)"""
    # Verify user exists
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    items = await db.user_inventory.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("acquired_at", -1).to_list(500)
    
    # Enrich with rarity info
    for item in items:
        rarity_info = ITEM_RARITIES.get(item.get("item_rarity", "common"), ITEM_RARITIES["common"])
        item["rarity_display"] = rarity_info["name"]
        item["rarity_color"] = rarity_info["color"]
    
    return {
        "user_id": user_id,
        "username": user.get("username"),
        "items": items,
        "total_items": len(items)
    }

@router.get("/inventory/item/{inventory_id}")
async def get_inventory_item_detail(inventory_id: str, request: Request):
    """Get details of a specific inventory item"""
    user = await get_current_user(request)
    
    item = await db.user_inventory.find_one({
        "inventory_id": inventory_id,
        "user_id": user["user_id"]
    }, {"_id": 0})
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in your inventory")
    
    # Sell fee percentage (30% fee = 70% return)
    SELL_FEE_PERCENT = 30
    SELL_RETURN_PERCENT = 100 - SELL_FEE_PERCENT
    
    # Get full item definition
    item_def = await db.items.find_one({"item_id": item["item_id"]}, {"_id": 0})
    if item_def:
        item["is_tradeable"] = item_def.get("is_tradeable", False)
        item["is_sellable"] = item_def.get("is_sellable", False)
        item["category"] = item_def.get("category", "collectible")
    
    # Calculate sell value based on purchase price
    purchase_price = item.get("purchase_price", 0)
    item["purchase_price"] = purchase_price
    item["sell_value"] = round(purchase_price * SELL_RETURN_PERCENT / 100, 2)
    item["sell_fee_percent"] = SELL_FEE_PERCENT
    
    rarity_info = ITEM_RARITIES.get(item.get("item_rarity", "common"), ITEM_RARITIES["common"])
    item["rarity_display"] = rarity_info["name"]
    item["rarity_color"] = rarity_info["color"]
    
    return item

@router.post("/inventory/sell")
async def sell_inventory_item(sell_request: SellItemRequest, request: Request):
    """Sell an item from inventory for 70% of purchase price (30% fee)"""
    user = await get_current_user(request)
    
    # Sell fee percentage (30% fee = 70% return)
    SELL_FEE_PERCENT = 30
    SELL_RETURN_PERCENT = 100 - SELL_FEE_PERCENT
    
    # Find the inventory item
    item = await db.user_inventory.find_one({
        "inventory_id": sell_request.inventory_id,
        "user_id": user["user_id"]
    })
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in your inventory")
    
    # Check if item is listed on marketplace
    mp_listed = await db.marketplace_listings.find_one({"inventory_id": sell_request.inventory_id, "status": "active"})
    if mp_listed:
        raise HTTPException(status_code=400, detail="This item is currently listed on the marketplace. Delist it first.")
    
    # Sell price is always purchase_price — prevents RAP-exploit quick-selling
    base_price = item.get("purchase_price", 0) or 0

    if base_price <= 0:
        raise HTTPException(status_code=400, detail="This item has no recorded purchase price and cannot be sold.")

    sell_amount = round(base_price * SELL_RETURN_PERCENT / 100, 2)
    fee_amount = round(base_price * SELL_FEE_PERCENT / 100, 2)
    
    # Remove item from inventory
    await db.user_inventory.delete_one({
        "inventory_id": sell_request.inventory_id,
        "user_id": user["user_id"]
    })

    # Invalidate catalog cache so counts update immediately
    _catalog_cache.clear()
    _catalog_cache_time.clear()

    # Add sell amount to user balance
    user_doc = await db.users.find_one({"user_id": user["user_id"]})
    new_balance = round(user_doc.get("balance", 0) + sell_amount, 2)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"balance": new_balance}}
    )
    
    # Track sale in activity/bet_history
    now_naive = datetime.utcnow()
    activity_doc = {
        "bet_id": f"item_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "game_type": "item_sale",
        "bet_amount": 0,
        "win_amount": sell_amount,
        "net_outcome": sell_amount,  # Positive because receiving G
        "result": "sale",
        "timestamp": now_naive.isoformat(),
        "details": {
            "item_id": item["item_id"],
            "item_name": item["item_name"],
            "item_rarity": item.get("item_rarity", "common"),
            "original_value": base_price,
            "fee_amount": fee_amount,
            "fee_percent": SELL_FEE_PERCENT,
            "action": "sell"
        }
    }
    await db.bet_history.insert_one(activity_doc)
    
    # Record inventory value event (sell = negative delta based on purchase price)
    await record_inventory_value_event(
        user_id=user["user_id"],
        event_type="sell",
        delta_value=-base_price,  # Negative - inventory value decreased
        related_item_id=item["item_id"],
        related_item_name=item["item_name"],
        details={"sell_amount": sell_amount, "fee_amount": fee_amount, "rarity": item.get("item_rarity", "common")}
    )
    
    # Record account activity (item sale = profit)
    await record_account_activity(
        user_id=user["user_id"],
        event_type="item_sale",
        amount=sell_amount,
        source=f"Item verkauft: {item['item_name']}",
        details={"item_id": item["item_id"], "item_name": item["item_name"], "purchase_price": base_price, "fee": fee_amount}
    )
    
    return {
        "success": True,
        "message": f"Sold {item['item_name']} for {sell_amount} G",
        "item_name": item["item_name"],
        "value": base_price,
        "sell_amount": sell_amount,
        "fee_amount": fee_amount,
        "fee_percent": SELL_FEE_PERCENT,
        "new_balance": new_balance
    }


@router.post("/inventory/sell-batch")
async def sell_inventory_items_batch(data: SellItemsBatchRequest, request: Request):
    """Sell multiple items at once for 70% of purchase price (30% fee). Chests cannot be sold."""
    user = await get_current_user(request)
    user_id = user["user_id"]
    
    if not data.inventory_ids:
        raise HTTPException(status_code=400, detail="No items provided")
    
    if len(data.inventory_ids) > 1000:
        raise HTTPException(status_code=400, detail="Maximum 1000 items per batch")
    
    SELL_FEE_PERCENT = 30
    SELL_RETURN_PERCENT = 100 - SELL_FEE_PERCENT
    
    # Find all items and verify ownership
    items = await db.user_inventory.find({
        "inventory_id": {"$in": data.inventory_ids},
        "user_id": user_id
    }).to_list(1000)
    
    if not items:
        raise HTTPException(status_code=404, detail="No valid items found")
    
    # Filter out chests - they cannot be sold
    sellable_items = []
    skipped_chests = 0
    
    for item in items:
        item_id = item.get("item_id", "")
        category = item.get("category", "")
        
        if "chest" in item_id.lower() or category == "chest":
            skipped_chests += 1
            continue
        
        purchase_price = item.get("purchase_price", 0)
        if purchase_price <= 0:
            continue  # Skip items without value
        
        sellable_items.append(item)
    
    if not sellable_items:
        if skipped_chests > 0:
            raise HTTPException(status_code=400, detail="Chests cannot be sold")
        raise HTTPException(status_code=400, detail="No sellable items found")
    
    # Calculate totals (always based on purchase_price — RAP-independent quicksell)
    total_value = 0
    total_sell_amount = 0
    total_fee = 0
    sold_items = []

    for item in sellable_items:
        base_price = item.get("purchase_price", 0) or 0
        if base_price <= 0:
            continue  # Skip items with no purchase price
        sell_amount = round(base_price * SELL_RETURN_PERCENT / 100, 2)
        fee_amount = round(base_price * SELL_FEE_PERCENT / 100, 2)

        total_value += base_price
        total_sell_amount += sell_amount
        total_fee += fee_amount
        
        sold_items.append({
            "inventory_id": item["inventory_id"],
            "item_id": item["item_id"],
            "item_name": item["item_name"],
            "value": base_price,
            "sell_amount": sell_amount
        })
    
    # Delete all items at once
    delete_ids = [item["inventory_id"] for item in sellable_items]
    await db.user_inventory.delete_many({
        "inventory_id": {"$in": delete_ids},
        "user_id": user_id
    })

    # Invalidate catalog cache so counts update immediately
    _catalog_cache.clear()
    _catalog_cache_time.clear()

    # Add total sell amount to user balance
    user_doc = await db.users.find_one({"user_id": user_id})
    new_balance = round(user_doc.get("balance", 0) + total_sell_amount, 2)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"balance": new_balance}}
    )
    
    # Record single batch activity
    now = datetime.now(timezone.utc)
    activity_doc = {
        "bet_id": f"batch_sale_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "game_type": "item_sale_batch",
        "bet_amount": 0,
        "win_amount": total_sell_amount,
        "net_outcome": total_sell_amount,
        "result": "sale",
        "timestamp": now.isoformat(),
        "details": {
            "items_sold": len(sold_items),
            "total_value": total_value,
            "fee_amount": total_fee,
            "fee_percent": SELL_FEE_PERCENT
        }
    }
    await db.bet_history.insert_one(activity_doc)
    
    # Record inventory value event
    await record_inventory_value_event(
        user_id=user_id,
        event_type="sell",
        delta_value=-total_value,
        related_item_id="batch_sale",
        related_item_name=f"{len(sold_items)} items",
        details={"items_count": len(sold_items), "sell_amount": total_sell_amount}
    )
    
    # Record account activity (batch item sale = profit)
    await record_account_activity(
        user_id=user_id,
        event_type="item_sale",
        amount=total_sell_amount,
        source=f"Batch-Verkauf: {len(sold_items)} Items",
        details={"items_count": len(sold_items), "total_value": total_value, "fee": total_fee}
    )
    
    return {
        "success": True,
        "items_sold": len(sold_items),
        "skipped_chests": skipped_chests,
        "total_value": round(total_value, 2),
        "total_sell_amount": round(total_sell_amount, 2),
        "total_fee": round(total_fee, 2),
        "fee_percent": SELL_FEE_PERCENT,
        "new_balance": new_balance
    }

# ============== MARKETPLACE ENDPOINTS ==============

