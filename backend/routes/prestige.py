"""Route module: prestige."""
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

@router.get("/prestige/shop")
async def get_prestige_shop():
    """Get all available prestige cosmetics for purchase (excludes free items)"""
    cosmetics = []
    
    for cosmetic_id, template in PRESTIGE_COSMETICS.items():
        # Only show items that cost something (exclude free basic patterns)
        if template.get("is_available", True) and template.get("prestige_cost", 0) > 0:
            cosmetics.append({
                **template,
                "tier_display": template.get("tier", "standard").capitalize()
            })
    
    # Sort by type, then by cost
    type_order = {"name_color": 0, "tag": 1, "jackpot_pattern": 2}
    cosmetics.sort(key=lambda x: (type_order.get(x["cosmetic_type"], 99), x["prestige_cost"]))
    
    return {
        "cosmetics": cosmetics,
        "conversion_rate": PRESTIGE_CONVERSION_RATE,
        "categories": {
            "tag": {"display_name": "Player Tags", "description": "Icons displayed next to your name"},
            "name_color": {"display_name": "Name Colors", "description": "Customize your name color in chat"},
            "jackpot_pattern": {"display_name": "Jackpot Patterns", "description": "Visible background effects during jackpot wins"}
        }
    }

@router.get("/prestige/owned")
async def get_owned_prestige_cosmetics(request: Request):
    """Get user's owned prestige cosmetics"""
    user = await get_current_user(request)
    
    # Get items user has purchased
    purchased = await db.user_prestige_items.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(500)
    
    purchased_ids = {item["cosmetic_id"] for item in purchased}
    
    # Add free items (prestige_cost = 0) - everyone owns these
    owned = []
    for cosmetic_id, template in PRESTIGE_COSMETICS.items():
        if template.get("prestige_cost", 0) == 0 and template.get("is_available", True):
            # Free item - add if not already in purchased list
            if cosmetic_id not in purchased_ids:
                owned.append({
                    "user_id": user["user_id"],
                    "cosmetic_id": cosmetic_id,
                    "cosmetic_type": template.get("cosmetic_type"),
                    "acquired_at": None,  # Free items have no acquisition date
                    "display_name": template.get("display_name", cosmetic_id),
                    "description": template.get("description", ""),
                    "asset_path": template.get("asset_path"),
                    "asset_value": template.get("asset_value"),
                    "tier": "free"
                })
    
    # Add purchased items with enriched data
    for item in purchased:
        template = PRESTIGE_COSMETICS.get(item["cosmetic_id"], {})
        item["display_name"] = template.get("display_name", item["cosmetic_id"])
        item["description"] = template.get("description", "")
        item["asset_path"] = template.get("asset_path")
        item["asset_value"] = template.get("asset_value")
        item["tier"] = template.get("tier", "standard")
        owned.append(item)
    
    # Get user's active cosmetics
    user_doc = await db.users.find_one({"user_id": user["user_id"]})
    active = {
        "tag": user_doc.get("active_tag"),
        "name_color": user_doc.get("active_name_color"),
        "jackpot_pattern": user_doc.get("active_jackpot_pattern")
    }
    
    return {
        "owned": owned,
        "active": active,
        "total_owned": len(owned)
    }

@router.post("/prestige/purchase")
async def purchase_prestige_cosmetic(purchase: PrestigePurchaseRequest, request: Request):
    """Purchase a prestige cosmetic with A currency"""
    user = await get_current_user(request)
    
    # Get template
    template = PRESTIGE_COSMETICS.get(purchase.cosmetic_id)
    if not template:
        raise HTTPException(status_code=404, detail="Cosmetic not found")
    
    if not template.get("is_available", True):
        raise HTTPException(status_code=400, detail="This cosmetic is not available for purchase")
    
    # Check level requirement
    user_doc = await db.users.find_one({"user_id": user["user_id"]})
    if user_doc.get("level", 1) < template.get("unlock_level", 0):
        raise HTTPException(
            status_code=400, 
            detail=f"You need to be level {template['unlock_level']} to purchase this cosmetic"
        )
    
    # Check if already owned
    existing = await db.user_prestige_items.find_one({
        "user_id": user["user_id"],
        "cosmetic_id": purchase.cosmetic_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="You already own this cosmetic")
    
    # Check A balance
    prestige_cost = template["prestige_cost"]
    current_balance_a = user_doc.get("balance_a", 0)
    
    if current_balance_a < prestige_cost:
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient prestige currency. Need {prestige_cost} A, have {current_balance_a} A"
        )
    
    # Deduct A currency
    new_balance_a = round(current_balance_a - prestige_cost, 2)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"balance_a": new_balance_a}}
    )
    
    # Add to owned cosmetics
    now = datetime.utcnow()
    ownership_doc = {
        "ownership_id": f"pres_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "cosmetic_id": purchase.cosmetic_id,
        "cosmetic_type": template["cosmetic_type"],
        "purchased_at": now.isoformat(),
        "purchase_price": prestige_cost
    }
    await db.user_prestige_items.insert_one(ownership_doc)
    
    return {
        "success": True,
        "message": f"Successfully purchased {template['display_name']}!",
        "cosmetic": {
            "cosmetic_id": purchase.cosmetic_id,
            "display_name": template["display_name"],
            "cosmetic_type": template["cosmetic_type"]
        },
        "new_balance_a": new_balance_a
    }

@router.post("/prestige/activate")
async def activate_prestige_cosmetic(activate: PrestigeActivateRequest, request: Request):
    """Activate/equip a prestige cosmetic"""
    user = await get_current_user(request)
    
    # Special case: deactivate (empty string or "none")
    if activate.cosmetic_id in ["", "none", None]:
        # Deactivate the cosmetic type
        field_map = {
            "tag": "active_tag",
            "name_color": "active_name_color",
            "jackpot_pattern": "active_jackpot_pattern"
        }
        field = field_map.get(activate.cosmetic_type)
        if not field:
            raise HTTPException(status_code=400, detail="Invalid cosmetic type")
        
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {field: None}}
        )
        return {"success": True, "message": f"{activate.cosmetic_type} deactivated"}
    
    # Check if user owns the cosmetic
    # First check if it's a free item (prestige_cost = 0)
    template = PRESTIGE_COSMETICS.get(activate.cosmetic_id)
    if not template:
        raise HTTPException(status_code=404, detail="Cosmetic template not found")
    
    is_free_item = template.get("prestige_cost", 0) == 0
    
    if not is_free_item:
        # For paid items, check database ownership
        owned = await db.user_prestige_items.find_one({
            "user_id": user["user_id"],
            "cosmetic_id": activate.cosmetic_id
        })
        
        if not owned:
            raise HTTPException(status_code=400, detail="You don't own this cosmetic")
    
    # Verify cosmetic type matches
    if template["cosmetic_type"] != activate.cosmetic_type:
        raise HTTPException(status_code=400, detail="Cosmetic type mismatch")
    
    # Update active cosmetic
    field_map = {
        "tag": "active_tag",
        "name_color": "active_name_color",
        "jackpot_pattern": "active_jackpot_pattern"
    }
    field = field_map.get(activate.cosmetic_type)
    if not field:
        raise HTTPException(status_code=400, detail="Invalid cosmetic type")
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {field: activate.cosmetic_id}}
    )
    
    return {
        "success": True,
        "message": f"Activated {template['display_name']}!",
        "active_cosmetic": {
            "cosmetic_id": activate.cosmetic_id,
            "display_name": template["display_name"],
            "cosmetic_type": template["cosmetic_type"],
            "asset_value": template.get("asset_value")
        }
    }

@router.post("/currency/convert")
async def convert_g_to_a(convert: CurrencyConvertRequest, request: Request):
    """Convert G to A currency at 500:1 rate"""
    user = await get_current_user(request)
    
    g_amount = convert.g_amount
    
    # Validate amount
    if g_amount < PRESTIGE_CONVERSION_RATE:
        raise HTTPException(
            status_code=400, 
            detail=f"Minimum conversion is {PRESTIGE_CONVERSION_RATE} G (= 1 A)"
        )
    
    # Calculate A amount (floor to whole numbers)
    a_amount = int(g_amount // PRESTIGE_CONVERSION_RATE)
    actual_g_cost = a_amount * PRESTIGE_CONVERSION_RATE
    
    # Check G balance
    user_doc = await db.users.find_one({"user_id": user["user_id"]})
    if user_doc.get("balance", 0) < actual_g_cost:
        raise HTTPException(status_code=400, detail="Insufficient G balance")
    
    # Perform conversion
    new_balance_g = round(user_doc["balance"] - actual_g_cost, 2)
    new_balance_a = round(user_doc.get("balance_a", 0) + a_amount, 2)
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "balance": new_balance_g,
            "balance_a": new_balance_a
        }}
    )
    
    return {
        "success": True,
        "message": f"Converted {actual_g_cost} G to {a_amount} A!",
        "g_spent": actual_g_cost,
        "a_received": a_amount,
        "new_balance_g": new_balance_g,
        "new_balance_a": new_balance_a,
        "conversion_rate": PRESTIGE_CONVERSION_RATE
    }

@router.get("/prestige/cosmetic/{cosmetic_id}")
async def get_cosmetic_details(cosmetic_id: str):
    """Get details of a specific cosmetic"""
    template = PRESTIGE_COSMETICS.get(cosmetic_id)
    if not template:
        raise HTTPException(status_code=404, detail="Cosmetic not found")
    
    return template

@router.get("/user/{user_id}/cosmetics")
async def get_user_active_cosmetics(user_id: str):
    """Get a user's active cosmetics (public endpoint for rendering)"""
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    active = {}
    
    # Get active tag
    if user.get("active_tag"):
        template = PRESTIGE_COSMETICS.get(user["active_tag"], {})
        active["tag"] = {
            "cosmetic_id": user["active_tag"],
            "display_name": template.get("display_name"),
            "asset_path": template.get("asset_path"),
            "asset_value": template.get("asset_value")
        }
    
    # Get active name color
    if user.get("active_name_color"):
        template = PRESTIGE_COSMETICS.get(user["active_name_color"], {})
        active["name_color"] = {
            "cosmetic_id": user["active_name_color"],
            "display_name": template.get("display_name"),
            "asset_value": template.get("asset_value")
        }
    
    # Get active jackpot pattern
    if user.get("active_jackpot_pattern"):
        template = PRESTIGE_COSMETICS.get(user["active_jackpot_pattern"], {})
        active["jackpot_pattern"] = {
            "cosmetic_id": user["active_jackpot_pattern"],
            "display_name": template.get("display_name"),
            "asset_path": template.get("asset_path"),
            "asset_value": template.get("asset_value")
        }
    
    return {
        "user_id": user_id,
        "username": user.get("username"),
        "active_cosmetics": active
    }

# Legacy endpoint - keep for backwards compatibility
@router.get("/user/account-activity")
async def get_account_activity(request: Request, limit: int = 100, aggregate: bool = True):
    """
    Legacy endpoint - returns raw account activity events.
    Use /user/account-chart for TradingView-style charts.
    """
    user = await get_current_user(request)
    user_id = user["user_id"]
    
    limit = min(max(limit, 10), 500)
    
    total_events = await db.account_activity_history.count_documents({"user_id": user_id})
    
    if total_events == 0:
        return {
            "mode": "empty",
            "events": [],
            "stats": {
                "current_profit": 0,
                "highest_profit": 0,
                "lowest_profit": 0,
                "total_won": 0,
                "total_lost": 0,
                "net_profit": 0,
                "total_events": 0
            }
        }
    
    events = await db.account_activity_history.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("event_number", -1).limit(limit).to_list(limit)
    
    events = list(reversed(events))
    
    cumulative_values = [e["cumulative_profit"] for e in events]
    amounts = [e["amount"] for e in events]
    
    current_profit = events[-1]["cumulative_profit"] if events else 0
    
    stats = {
        "current_profit": round(current_profit, 2),
        "highest_profit": round(max(cumulative_values), 2) if cumulative_values else 0,
        "lowest_profit": round(min(cumulative_values), 2) if cumulative_values else 0,
        "total_won": round(sum(a for a in amounts if a > 0), 2),
        "total_lost": round(abs(sum(a for a in amounts if a < 0)), 2),
        "net_profit": round(current_profit, 2),
        "total_events": total_events
    }
    
    return {
        "mode": "individual",
        "events": events,
        "stats": stats
    }


@router.get("/user/value-history")
async def get_value_history(request: Request, timeframe: str = "1h"):
    """
    Get user's account value history for chart with stock-market style aggregation.
    
    Timeframes:
    - 1m: Last 1 hour, aggregated by minute
    - 15m: Last 6 hours, aggregated by 15 minutes  
    - 1h: Last 24 hours, aggregated by hour
    - 3d: Last 3 days, aggregated by 3 hours
    - 1w: Last 7 days, aggregated by 6 hours
    - 1mo: Last 30 days, aggregated by day
    """
    user = await get_current_user(request)
    user_id = user["user_id"]
    now = datetime.now(timezone.utc)
    
    # Timeframe configuration: (time_range, bucket_minutes, display_format)
    TIMEFRAME_CONFIG = {
        "1m": (timedelta(hours=1), 1, "minute"),         # 1 hour range, 1-min buckets
        "15m": (timedelta(hours=6), 15, "15min"),        # 6 hours range, 15-min buckets
        "1h": (timedelta(hours=24), 60, "hour"),         # 24 hours range, 1-hour buckets
        "3d": (timedelta(days=3), 180, "3hour"),         # 3 days range, 3-hour buckets
        "1w": (timedelta(days=7), 360, "6hour"),         # 7 days range, 6-hour buckets
        "1mo": (timedelta(days=30), 1440, "day"),        # 30 days range, daily buckets
    }
    
    # Default to 1h if invalid timeframe
    if timeframe not in TIMEFRAME_CONFIG:
        timeframe = "1h"
    
    time_range, bucket_minutes, display_format = TIMEFRAME_CONFIG[timeframe]
    start_time = now - time_range
    
    current_g = user.get("balance", 0)
    current_a = user.get("balance_a", 0)
    current_value = current_g + current_a
    
    # First, check if user has any snapshots at all
    total_count = await db.value_snapshots.count_documents({"user_id": user_id})
    
    if total_count == 0:
        # No history - create initial snapshot
        initial = await record_value_snapshot(user_id, current_g, current_a, "initial")
        return {
            "timeframe": timeframe,
            "bucket_minutes": bucket_minutes,
            "display_format": display_format,
            "data_points": [{
                "timestamp": initial["timestamp"],
                "open": initial["total_value"],
                "close": initial["total_value"],
                "high": initial["total_value"],
                "low": initial["total_value"],
                "total_value": initial["total_value"],
                "count": 1
            }],
            "stats": {
                "highest": current_value,
                "lowest": current_value,
                "current": current_value,
                "range": 0,
                "percent_change": 0,
                "all_time_high": current_value,
                "all_time_low": current_value,
                "total_snapshots": 1
            }
        }
    
    # MongoDB aggregation pipeline for OHLC-style data
    # Convert ISO string timestamps to Date objects for aggregation
    pipeline = [
        # Match user and time range
        {"$match": {
            "user_id": user_id,
            "timestamp": {"$gte": start_time.isoformat()}
        }},
        # Convert timestamp string to date
        {"$addFields": {
            "timestamp_date": {"$dateFromString": {"dateString": "$timestamp"}}
        }},
        # Sort by timestamp ascending
        {"$sort": {"timestamp_date": 1}},
        # Group into time buckets
        {"$group": {
            "_id": {
                "$dateTrunc": {
                    "date": "$timestamp_date",
                    "unit": "minute",
                    "binSize": bucket_minutes
                }
            },
            "open": {"$first": "$total_value"},
            "close": {"$last": "$total_value"},
            "high": {"$max": "$total_value"},
            "low": {"$min": "$total_value"},
            "count": {"$sum": 1},
            "first_timestamp": {"$first": "$timestamp"}
        }},
        # Sort buckets by time
        {"$sort": {"_id": 1}},
        # Project final format
        {"$project": {
            "_id": 0,
            "bucket_time": "$_id",
            "timestamp": "$first_timestamp",
            "open": {"$round": ["$open", 2]},
            "close": {"$round": ["$close", 2]},
            "high": {"$round": ["$high", 2]},
            "low": {"$round": ["$low", 2]},
            "total_value": {"$round": ["$close", 2]},  # Use close as main value for chart
            "count": 1
        }}
    ]
    
    try:
        aggregated_data = await db.value_snapshots.aggregate(pipeline).to_list(1000)
    except Exception as e:
        # Fallback: If aggregation fails, use simple query
        logging.error(f"Aggregation failed: {e}")
        snapshots = await db.value_snapshots.find(
            {"user_id": user_id, "timestamp": {"$gte": start_time.isoformat()}},
            {"_id": 0, "total_value": 1, "timestamp": 1}
        ).sort("timestamp", 1).to_list(1000)
        
        aggregated_data = [{
            "timestamp": s["timestamp"],
            "open": s["total_value"],
            "close": s["total_value"],
            "high": s["total_value"],
            "low": s["total_value"],
            "total_value": s["total_value"],
            "count": 1
        } for s in snapshots]
    
    # If no data in timeframe, get the most recent snapshot before the timeframe
    if not aggregated_data:
        last_snapshot = await db.value_snapshots.find_one(
            {"user_id": user_id, "timestamp": {"$lt": start_time.isoformat()}},
            {"_id": 0, "total_value": 1, "timestamp": 1},
            sort=[("timestamp", -1)]
        )
        
        if last_snapshot:
            aggregated_data = [{
                "timestamp": last_snapshot["timestamp"],
                "open": last_snapshot["total_value"],
                "close": last_snapshot["total_value"],
                "high": last_snapshot["total_value"],
                "low": last_snapshot["total_value"],
                "total_value": last_snapshot["total_value"],
                "count": 1
            }]
        else:
            # Fallback to current value
            aggregated_data = [{
                "timestamp": now.isoformat(),
                "open": current_value,
                "close": current_value,
                "high": current_value,
                "low": current_value,
                "total_value": current_value,
                "count": 1
            }]
    
    # Calculate stats from aggregated data
    all_highs = [dp["high"] for dp in aggregated_data]
    all_lows = [dp["low"] for dp in aggregated_data]
    
    highest_in_range = max(all_highs) if all_highs else current_value
    lowest_in_range = min(all_lows) if all_lows else current_value
    
    # Get ATH/ATL from ALL data
    ath_atl_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": None,
            "ath": {"$max": "$total_value"},
            "atl": {"$min": "$total_value"}
        }}
    ]
    
    ath_atl_result = await db.value_snapshots.aggregate(ath_atl_pipeline).to_list(1)
    
    if ath_atl_result:
        all_time_high = max(ath_atl_result[0].get("ath", current_value), current_value)
        all_time_low = min(ath_atl_result[0].get("atl", current_value), current_value)
    else:
        all_time_high = current_value
        all_time_low = current_value
    
    # Calculate percent change
    start_value = aggregated_data[0]["open"] if aggregated_data else current_value
    percent_change = ((current_value - start_value) / abs(start_value) * 100) if start_value != 0 else 0
    
    return {
        "timeframe": timeframe,
        "bucket_minutes": bucket_minutes,
        "display_format": display_format,
        "data_points": aggregated_data,
        "stats": {
            "highest": round(highest_in_range, 2),
            "lowest": round(lowest_in_range, 2),
            "current": round(current_value, 2),
            "range": round(highest_in_range - lowest_in_range, 2),
            "percent_change": round(percent_change, 2),
            "all_time_high": round(all_time_high, 2),
            "all_time_low": round(all_time_low, 2),
            "total_snapshots": total_count
        }
    }

# ============== CHAT ENDPOINTS ==============

