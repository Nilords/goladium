"""Chart and analytics service — value snapshots, candles, account activity."""
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from database import db
from config import *


# ============== ACCOUNT VALUE TRACKING ==============

async def record_value_snapshot(user_id: str, balance_g: float, balance_a: float, trigger: str = "auto"):
    """Record a snapshot of user's account value"""
    now = datetime.now(timezone.utc)
    total_value = balance_g + balance_a
    
    snapshot = {
        "snapshot_id": f"snap_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "balance_g": round(balance_g, 2),
        "balance_a": round(balance_a, 2),
        "total_value": round(total_value, 2),
        "trigger": trigger,
        "timestamp": now.isoformat()
    }
    
    await db.value_snapshots.insert_one(snapshot)
    return snapshot


async def record_account_activity(
    user_id: str,
    event_type: str,
    amount: float,
    source: str,
    details: dict = None
):
    """
    Record an account activity event for the profit/loss graph.
    Also updates OHLC candles for TradingView-style charts.
    
    This tracks NET CHANGES (profit/loss), not absolute balance.
    - Positive amount = profit/gain
    - Negative amount = loss/expense
    
    event_type: slot, jackpot, wheel, trade, admin, item_sale, item_purchase, chest
    source: descriptive source like "Slot: Golden Fruits", "Trade from User123", "Admin: Ghost"
    """
    now = datetime.now(timezone.utc)
    
    # Get previous cumulative profit
    last_event = await db.account_activity_history.find_one(
        {"user_id": user_id},
        sort=[("event_number", -1)]
    )
    
    if last_event:
        previous_cumulative = last_event["cumulative_profit"]
        event_number = last_event["event_number"] + 1
    else:
        previous_cumulative = 0.0
        event_number = 1
    
    # Calculate new cumulative (CAN GO NEGATIVE!)
    amount = round(amount, 2)
    new_cumulative = round(previous_cumulative + amount, 2)
    
    event_doc = {
        "event_id": f"act_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "event_number": event_number,
        "event_type": event_type,
        "amount": amount,
        "cumulative_profit": new_cumulative,
        "source": source,
        "details": details or {},
        "timestamp": now.isoformat()
    }
    
    await db.account_activity_history.insert_one(event_doc)
    
    # Update OHLC candles (1h and 1d resolutions)
    await update_account_candles(user_id, now, previous_cumulative, new_cumulative, amount, event_type)
    
    return event_doc


async def update_account_candles(
    user_id: str,
    timestamp: datetime,
    previous_value: float,
    current_value: float,
    delta: float,
    event_type: str
):
    """
    Update OHLC candles for multiple resolutions.
    Uses upsert to create or update candles atomically.
    """
    resolutions = [
        ("1h", 3600),   # 1 hour in seconds
        ("1d", 86400),  # 1 day in seconds
    ]
    
    for resolution, seconds in resolutions:
        # Calculate bucket start time
        bucket_ts = timestamp.replace(
            minute=0 if resolution == "1h" else 0,
            second=0,
            microsecond=0
        )
        if resolution == "1d":
            bucket_ts = bucket_ts.replace(hour=0)
        
        bucket_key = bucket_ts.isoformat()
        collection_name = f"account_candles_{resolution}"
        collection = db[collection_name]
        
        # Try to update existing candle
        result = await collection.update_one(
            {
                "user_id": user_id,
                "bucket": bucket_key
            },
            {
                "$min": {"low": current_value},
                "$max": {"high": current_value},
                "$set": {"close": current_value},
                "$inc": {
                    "volume": 1,
                    "net_change": delta,
                    f"breakdown.{event_type}": 1
                },
                "$setOnInsert": {
                    "user_id": user_id,
                    "bucket": bucket_key,
                    "resolution": resolution,
                    "open": previous_value,
                    "timestamp": bucket_ts.isoformat()
                }
            },
            upsert=True
        )


# ============== TRADINGVIEW-STYLE CHART API ==============

# CHART_RANGES -> config.py


async def get_raw_chart_data(user_id: str, start_time: datetime, end_time: datetime, max_points: int, current_profit: float, range_name: str = "TODAY"):
    """Get raw individual events for TODAY and ALL (when few events)."""

    events = await db.account_activity_history.find(
        {
            "user_id": user_id,
            "timestamp": {"$gte": start_time.isoformat(), "$lte": end_time.isoformat()}
        },
        {"_id": 0}
    ).sort("timestamp", 1).limit(max_points).to_list(max_points)

    if not events:
        return {
            "range": range_name,
            "resolution": "raw",
            "mode": "empty",
            "candles": [],
            "stats": get_empty_stats(current_profit)
        }

    candles = []
    for e in events:
        candles.append({
            "timestamp": e["timestamp"],
            "open": e["cumulative_profit"] - e["amount"],
            "high": e["cumulative_profit"] if e["amount"] >= 0 else e["cumulative_profit"] - e["amount"],
            "low": e["cumulative_profit"] if e["amount"] < 0 else e["cumulative_profit"] - e["amount"],
            "close": e["cumulative_profit"],
            "volume": 1,
            "net_change": e["amount"],
            "event_type": e["event_type"],
            "source": e["source"]
        })

    stats = calculate_chart_stats(candles, current_profit)

    return {
        "range": range_name,
        "resolution": "raw",
        "mode": "raw",
        "candles": candles,
        "stats": stats
    }


async def get_candle_chart_data(user_id: str, resolution: str, start_time: datetime, max_points: int, current_profit: float, range_name: str):
    """Get OHLC candle data for longer-range charts"""
    
    collection = db[f"account_candles_{resolution}"]
    
    candles = await collection.find(
        {
            "user_id": user_id,
            "timestamp": {"$gte": start_time.isoformat()}
        },
        {"_id": 0}
    ).sort("timestamp", 1).limit(max_points).to_list(max_points)
    
    if not candles:
        # Try to build from raw events if no candles exist yet
        return await build_candles_from_raw(user_id, resolution, start_time, max_points, current_profit, range_name)
    
    # Format candles for frontend
    formatted = []
    for c in candles:
        formatted.append({
            "timestamp": c["timestamp"],
            "open": c.get("open", 0),
            "high": c.get("high", 0),
            "low": c.get("low", 0),
            "close": c.get("close", 0),
            "volume": c.get("volume", 0),
            "net_change": c.get("net_change", 0),
            "breakdown": c.get("breakdown", {})
        })
    
    stats = calculate_chart_stats(formatted, current_profit)
    
    return {
        "range": range_name,
        "resolution": resolution,
        "mode": "candles",
        "candles": formatted,
        "stats": stats
    }


async def build_candles_from_raw(user_id: str, resolution: str, start_time: datetime, end_time: datetime, max_points: int, current_profit: float, range_name: str):
    """Build aggregated candles from raw events. Supports 1h, 1d, 1w, 1M resolutions."""

    match_filter = {
        "user_id": user_id,
        "timestamp": {"$gte": start_time.isoformat(), "$lt": end_time.isoformat()}
    }

    # Build group _id based on resolution
    if resolution == "1h":
        group_id = {"$dateToString": {"format": "%Y-%m-%dT%H:00:00", "date": "$ts_date"}}
    elif resolution == "1d":
        group_id = {"$dateToString": {"format": "%Y-%m-%dT00:00:00", "date": "$ts_date"}}
    elif resolution == "1w":
        group_id = {
            "year": {"$isoWeekYear": "$ts_date"},
            "week": {"$isoWeek": "$ts_date"}
        }
    elif resolution == "1M":
        group_id = {"$dateToString": {"format": "%Y-%m-01T00:00:00", "date": "$ts_date"}}
    else:
        group_id = {"$dateToString": {"format": "%Y-%m-%dT00:00:00", "date": "$ts_date"}}

    pipeline = [
        {"$match": match_filter},
        {"$addFields": {
            "ts_date": {"$dateFromString": {"dateString": "$timestamp"}}
        }},
        {"$group": {
            "_id": group_id,
            "open": {"$first": "$cumulative_profit"},
            "close": {"$last": "$cumulative_profit"},
            "high": {"$max": "$cumulative_profit"},
            "low": {"$min": "$cumulative_profit"},
            "volume": {"$sum": 1},
            "net_change": {"$sum": "$amount"},
            "events": {"$push": "$event_type"}
        }},
        {"$sort": {"_id": 1}},
        {"$limit": max_points}
    ]

    results = await db.account_activity_history.aggregate(pipeline).to_list(max_points)

    if not results:
        return {
            "range": range_name,
            "resolution": resolution,
            "mode": "empty",
            "candles": [],
            "stats": get_empty_stats(current_profit)
        }

    candles = []
    for r in results:
        breakdown = {}
        for et in r.get("events", []):
            breakdown[et] = breakdown.get(et, 0) + 1

        # For weekly grouping reconstruct Monday date from ISO year+week
        if resolution == "1w":
            iso_year = r["_id"]["year"]
            iso_week = r["_id"]["week"]
            week_monday = datetime.fromisocalendar(iso_year, iso_week, 1)
            timestamp = week_monday.strftime("%Y-%m-%dT00:00:00")
        else:
            timestamp = r["_id"]

        prev_close = candles[-1]["close"] if candles else r["open"] - r["net_change"]

        candles.append({
            "timestamp": timestamp,
            "open": prev_close,
            "high": r["high"],
            "low": r["low"],
            "close": r["close"],
            "volume": r["volume"],
            "net_change": r["net_change"],
            "breakdown": breakdown
        })

    stats = calculate_chart_stats(candles, current_profit)

    return {
        "range": range_name,
        "resolution": resolution,
        "mode": "aggregated",
        "candles": candles,
        "stats": stats
    }


def calculate_chart_stats(candles: list, current_profit: float) -> dict:
    """Calculate statistics from candle data"""
    if not candles:
        return get_empty_stats(current_profit)
    
    all_highs = [c["high"] for c in candles]
    all_lows = [c["low"] for c in candles]
    all_changes = [c["net_change"] for c in candles]
    
    highest = max(all_highs) if all_highs else 0
    lowest = min(all_lows) if all_lows else 0
    total_won = sum(c for c in all_changes if c > 0)
    total_lost = abs(sum(c for c in all_changes if c < 0))
    
    # Calculate percent change from first to last
    first_open = candles[0]["open"] if candles else 0
    last_close = candles[-1]["close"] if candles else 0
    
    if first_open != 0:
        percent_change = round(((last_close - first_open) / abs(first_open)) * 100, 2)
    else:
        percent_change = 0 if last_close == 0 else 100
    
    return {
        "current_profit": round(current_profit, 2),
        "period_high": round(highest, 2),
        "period_low": round(lowest, 2),
        "period_change": round(last_close - first_open, 2),
        "percent_change": percent_change,
        "total_won": round(total_won, 2),
        "total_lost": round(total_lost, 2),
        "total_volume": sum(c.get("volume", 0) for c in candles)
    }


def get_empty_stats(current_profit: float) -> dict:
    """Return empty stats structure"""
    return {
        "current_profit": round(current_profit, 2),
        "period_high": round(current_profit, 2),
        "period_low": round(current_profit, 2),
        "period_change": 0,
        "percent_change": 0,
        "total_won": 0,
        "total_lost": 0,
        "total_volume": 0
    }

