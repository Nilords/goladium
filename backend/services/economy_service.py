"""Economy service — big wins, RAP/demand, owner changes, inventory value tracking."""
import uuid
from datetime import datetime, timezone, timedelta
from database import db
from config import *


async def record_big_win(user: dict, game_type: str, bet_amount: float, win_amount: float,
                         slot_id: str = None, slot_name: str = None, win_chance: float = None,
                         multiplier: float = 0, winning_symbols: list = None):
    """Record a big win (>= 100 G or multiplier > 5x) to the big_wins collection"""
    if win_amount < 100 and multiplier <= 5:
        return  # Only track wins >= 100 G or multiplier > 5x

    win_doc = {
        "win_id": f"win_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "username": user["username"],
        "game_type": game_type,
        "slot_id": slot_id,
        "slot_name": slot_name,
        "bet_amount": round(bet_amount, 2),
        "win_amount": round(win_amount, 2),
        "multiplier": round(multiplier, 2),
        "win_chance": win_chance,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "avatar": user.get("avatar"),
        "frame": user.get("frame"),
        "winning_symbols": winning_symbols or []
    }

    await db.big_wins.insert_one(win_doc)

# ============== ITEM SYSTEM ENDPOINTS ==============

async def calculate_rap(item_id: str):
    """Calculate Recent Average Price from last 10 sales (weighted: newer sales count more)"""
    sales = await db.item_price_history.find(
        {"item_id": item_id},
        {"_id": 0, "price": 1}
    ).sort("timestamp", -1).limit(10).to_list(10)
    
    if not sales:
        return 0.0
    
    # Weighted average: newest sale has weight=10, oldest has weight=1
    total_weight = 0
    weighted_sum = 0
    for i, sale in enumerate(sales):
        weight = len(sales) - i  # newest = highest weight
        weighted_sum += sale["price"] * weight
        total_weight += weight
    
    rap = round(weighted_sum / total_weight, 2) if total_weight > 0 else 0.0
    
    # Update RAP in items collection
    await db.items.update_one(
        {"item_id": item_id},
        {"$set": {"rap": rap}}
    )
    
    return rap


async def record_owner_change(inventory_id: str, item_id: str, from_user_id: str, to_user_id: str, source: str):
    """Record an item ownership change in history"""
    now = datetime.now(timezone.utc).isoformat()
    # Close the previous owner's record
    await db.item_owner_history.update_one(
        {"inventory_id": inventory_id, "user_id": from_user_id, "released_at": None},
        {"$set": {"released_at": now, "released_via": source}}
    )
    # Create new owner record
    await db.item_owner_history.insert_one({
        "record_id": f"oh_{uuid.uuid4().hex[:12]}",
        "inventory_id": inventory_id,
        "item_id": item_id,
        "user_id": to_user_id,
        "acquired_at": now,
        "acquired_via": source,
        "released_at": None,
        "released_via": None,
    })


async def calculate_demand(item_id: str):
    """Calculate demand for an item. Manual demand (from admin) has priority over auto-calculation."""
    # Check for manual demand first
    item = await db.items.find_one({"item_id": item_id}, {"_id": 0, "manual_demand": 1})
    manual = item.get("manual_demand") if item else None
    
    # Always compute auto stats for display
    seeking_count = await db.trade_ads.count_documents({
        "status": "active",
        "seeking_items.item_id": item_id
    })
    
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent_sales = await db.item_price_history.count_documents({
        "item_id": item_id,
        "timestamp": {"$gte": week_ago}
    })
    
    active_listings = await db.marketplace_listings.count_documents({
        "item_id": item_id,
        "status": "active"
    })
    
    # Auto score
    auto_score = max(0, (seeking_count * 3) + (recent_sales * 2) - active_listings)
    if auto_score >= 10:
        auto_label = "extreme"
    elif auto_score >= 6:
        auto_label = "high"
    elif auto_score >= 3:
        auto_label = "medium"
    elif auto_score >= 1:
        auto_label = "low"
    else:
        auto_label = "none"
    
    # Manual overrides auto
    label = manual if manual else auto_label
    is_manual = manual is not None
    
    return {
        "label": label,
        "is_manual": is_manual,
        "auto_label": auto_label,
        "auto_score": auto_score,
        "seeking_ads": seeking_count,
        "recent_sales_7d": recent_sales,
        "active_listings": active_listings,
    }



async def get_current_inventory_value(user_id: str) -> float:
    """Calculate total inventory value based on purchase prices"""
    items = await db.user_inventory.find(
        {"user_id": user_id},
        {"purchase_price": 1, "item_id": 1}
    ).to_list(1000)
    
    total = 0.0
    for item in items:
        # Use purchase_price if available, else try to get from item definition
        price = item.get("purchase_price", 0)
        if price <= 0:
            item_def = await db.items.find_one({"item_id": item.get("item_id")}, {"base_value": 1})
            price = item_def.get("base_value", 0) if item_def else 0
        total += price
    return round(total, 2)


async def record_inventory_value_event(
    user_id: str,
    event_type: str,  # buy, sell, trade_in, trade_out, reward, gamepass_reward, admin_adjust, drop
    delta_value: float,  # Positive for gain, negative for loss
    related_item_id: str = None,
    related_item_name: str = None,
    details: dict = None
):
    """
    Record an inventory value change event.
    Total value never goes below 0.
    """
    now = datetime.now(timezone.utc)
    
    # Get previous total value
    last_event = await db.inventory_value_history.find_one(
        {"user_id": user_id},
        sort=[("event_number", -1)]
    )
    
    previous_total = last_event["total_inventory_value_after"] if last_event else 0.0
    event_number = (last_event["event_number"] + 1) if last_event else 1
    
    # Calculate new total (never below 0)
    new_total = max(0, round(previous_total + delta_value, 2))
    
    event_doc = {
        "event_id": f"inv_evt_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "event_number": event_number,
        "event_type": event_type,
        "delta_value": round(delta_value, 2),
        "total_inventory_value_after": new_total,
        "related_item_id": related_item_id,
        "related_item_name": related_item_name,
        "details": details or {},
        "timestamp": now.isoformat()
    }
    
    await db.inventory_value_history.insert_one(event_doc)
    return event_doc
