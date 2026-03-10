"""Route module: slots."""
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

@router.get("/games/slots")
async def get_available_slots():
    """Get all available slot machines"""
    slots = []
    for slot_id, config in SLOT_CONFIGS.items():
        slots.append({
            "id": slot_id,
            "name": config["name"],
            "reels": config["reels"],
            "rows": config["rows"],
            "max_paylines": config["max_paylines"],
            "volatility": config["volatility"],
            "rtp": config["rtp"],
            "features": config["features"]
        })
    return slots

@router.get("/games/slot/{slot_id}/info")
async def get_slot_info(slot_id: str):
    """Get slot machine info and payout table with per-reel probability data"""
    config = SLOT_CONFIGS.get(slot_id)
    if not config:
        raise HTTPException(status_code=404, detail="Slot not found")
    
    symbols = config["symbols"]
    reel_distributions = config.get("reel_distributions", {})
    
    symbols_info = []
    for symbol, data in symbols.items():
        # Calculate average probability across all reels using distributions
        if reel_distributions:
            avg_prob = get_average_symbol_probability(symbol, reel_distributions)
        else:
            # Fallback to uniform distribution
            avg_prob = round(100 / len(symbols), 2)
        
        symbols_info.append({
            "symbol": symbol,
            "multiplier": data["multiplier"],
            "probability": avg_prob,
            "is_wild": data.get("is_wild", False)
        })
    
    # Include per-reel breakdown for transparency
    reel_probabilities = {}
    if reel_distributions:
        for reel_idx, dist in reel_distributions.items():
            total_count = sum(dist.values())
            reel_probabilities[reel_idx] = {
                sym: round((count / total_count) * 100, 2) 
                for sym, count in dist.items()
            }
    
    return {
        "id": slot_id,
        "name": config["name"],
        "reels": config["reels"],
        "rows": config["rows"],
        "max_paylines": config["max_paylines"],
        "volatility": config["volatility"],
        "rtp": config["rtp"],
        "symbols": symbols_info,
        "reel_probabilities": reel_probabilities,  # Per-reel breakdown
        "features": config["features"],
        "min_bet_per_line": 0.01,
        "max_bet_per_line": None,  # No upper limit - constrained by user balance only
        "line_presets": LINE_PRESETS,
        "paylines": PAYLINES_4x4,
        "rules": {
            "how_to_win": "Match ALL 4 symbols on an active payline",
            "wilds": "Wild symbols substitute for any regular symbol",
            "bet_calculation": "Total Bet = Bet Per Line × Number of Active Lines"
        }
    }

@router.post("/games/slot/spin", response_model=SlotResult)
async def spin_slot(bet_request: SlotBetRequest, request: Request):
    user = await get_current_user(request)
    
    slot_id = bet_request.slot_id
    bet_per_line = round(bet_request.bet_per_line, 2)
    active_lines = bet_request.active_lines
    
    # Validate slot exists
    if slot_id not in SLOT_CONFIGS:
        raise HTTPException(status_code=400, detail="Invalid slot machine")
    
    # Validate active lines
    max_lines = SLOT_CONFIGS[slot_id]["max_paylines"]
    if not active_lines or len(active_lines) == 0:
        raise HTTPException(status_code=400, detail="At least 1 payline must be active")
    
    for line in active_lines:
        if line < 1 or line > max_lines:
            raise HTTPException(status_code=400, detail=f"Invalid payline: {line}")
    
    # Calculate total bet
    total_bet = round(bet_per_line * len(active_lines), 2)
    
    if user["balance"] < total_bet:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Calculate result
    result = calculate_slot_result(bet_per_line, active_lines, slot_id)
    win_amount = result["win_amount"]
    
    # Update balance
    new_balance = round(user["balance"] - total_bet + win_amount, 2)
    
    # Calculate XP (based on wagered amount only - 100 XP per 1 G)
    xp_gained = calculate_xp(total_bet)
    new_xp = max(0, user.get("xp", 0) + xp_gained)
    new_level = calculate_level(new_xp)
    old_level = user.get("level", 1)
    
    # Update user
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {
                "balance": new_balance,
                "xp": new_xp,
                "level": new_level
            },
            "$inc": {
                "total_wagered": total_bet
            }
        }
    )
    
    # Record bet history - SEPARATE ENTRIES for bet and win
    timestamp_now = datetime.now(timezone.utc)
    timestamp_bet = timestamp_now.isoformat()
    # Win timestamp is 1 millisecond later to ensure correct ordering (bet before win)
    timestamp_win = (timestamp_now + timedelta(milliseconds=1)).isoformat()
    
    # Entry 1: The bet (always negative)
    bet_entry = {
        "bet_id": f"bet_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "timestamp": timestamp_bet,
        "game_type": "slot",
        "slot_id": slot_id,
        "transaction_type": "bet",
        "amount": -total_bet,  # Negative for bet
        "bet_amount": total_bet,
        "details": {
            "bet_per_line": bet_per_line,
            "active_lines": active_lines,
            "slot_name": SLOT_CONFIGS[slot_id]["name"]
        }
    }
    await db.bet_history.insert_one(bet_entry)
    
    # Entry 2: The win (only if there's a win > 0)
    if win_amount > 0:
        win_entry = {
            "bet_id": f"win_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "timestamp": timestamp_win,  # Slightly later than bet
            "game_type": "slot",
            "slot_id": slot_id,
            "transaction_type": "win",
            "amount": win_amount,  # Positive for win
            "win_amount": win_amount,
            "details": {
                "reels": result["reels"],
                "winning_paylines": result["winning_paylines"],
                "is_jackpot": result["is_jackpot"],
                "slot_name": SLOT_CONFIGS[slot_id]["name"],
                "multiplier": round(win_amount / total_bet, 2) if total_bet > 0 else 0
            }
        }
        await db.bet_history.insert_one(win_entry)
    
    # Record value snapshot after balance change
    await record_value_snapshot(user["user_id"], new_balance, user.get("balance_a", 0), "slot_spin")
    
    # Record event-based account activity (profit/loss)
    net_change = win_amount - total_bet
    slot_name = SLOT_CONFIGS[slot_id]["name"]
    await record_account_activity(
        user_id=user["user_id"],
        event_type="slot",
        amount=net_change,
        source=f"Slot: {slot_name}",
        details={"bet": total_bet, "win": win_amount, "slot_id": slot_id}
    )
    
    # Update quest progress
    await update_quest_progress(user["user_id"], "spins", 1, bet_amount=total_bet)
    await update_quest_progress(user["user_id"], "total_wagered", int(total_bet))
    if result["is_win"]:
        await update_quest_progress(user["user_id"], "wins", 1, bet_amount=total_bet)
    
    # Record big wins (>= 100 G or multiplier > 5x) to live feed
    _multiplier = round(win_amount / total_bet, 2) if total_bet > 0 else 0
    if win_amount >= 100 or _multiplier > 5:
        _winning_symbols = [
            {"symbol": p["symbol"], "count": p["match_count"]}
            for p in result.get("winning_paylines", [])
        ]
        await record_big_win(
            user=user,
            game_type="slot",
            bet_amount=total_bet,
            win_amount=win_amount,
            slot_id=slot_id,
            slot_name=SLOT_CONFIGS[slot_id]["name"],
            multiplier=_multiplier,
            winning_symbols=_winning_symbols
        )
    
    # Discord webhooks for big wins
    if result["is_jackpot"]:
        await send_discord_webhook("JACKPOT WIN!", {
            "Player": user["username"],
            "Slot": SLOT_CONFIGS[slot_id]["name"],
            "Bet": f"{total_bet} G",
            "Win": f"{win_amount} G"
        })
    elif result["is_win"] and win_amount >= total_bet * 10:
        await send_discord_webhook("Big Win!", {
            "Player": user["username"],
            "Slot": SLOT_CONFIGS[slot_id]["name"],
            "Bet": f"{total_bet} G",
            "Win": f"{win_amount} G"
        })
    
    if new_level > old_level:
        await send_discord_webhook("Level Up!", {
            "Player": user["username"],
            "New Level": new_level
        })
    
    # Convert winning_paylines to PaylineWin objects
    payline_wins = []
    for wp in result["winning_paylines"]:
        payline_wins.append(PaylineWin(
            line_number=wp["line_number"],
            line_path=wp["line_path"],
            symbol=wp["symbol"],
            match_count=wp["match_count"],  # Pass actual match count
            multiplier=wp["multiplier"],
            payout=wp["payout"]
        ))
    
    return SlotResult(
        reels=result["reels"],
        total_bet=total_bet,
        win_amount=win_amount,
        is_win=result["is_win"],
        new_balance=new_balance,
        xp_gained=xp_gained,
        winning_paylines=payline_wins,
        is_jackpot=result["is_jackpot"]
    )

@router.get("/user/account-chart")
async def get_account_chart(request: Request, range: str = "M"):
    """
    TradingView-style account profit/loss chart.

    Ranges: TODAY, D, W, M, ALL
    - TODAY: current incomplete day (raw events)
    - D: completed full days only (up to 90)
    - W: completed full weeks only (up to 52)
    - M: completed full months only (up to 24)
    - ALL: everything, smart resolution
    """
    user = await get_current_user(request)
    user_id = user["user_id"]
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if range not in CHART_RANGES:
        range = "M"

    max_points = CHART_RANGES[range]["max_points"]

    # Get current cumulative profit for stats
    last_event = await db.account_activity_history.find_one(
        {"user_id": user_id},
        sort=[("event_number", -1)]
    )
    current_profit = last_event["cumulative_profit"] if last_event else 0

    if range == "TODAY":
        # Smart resolution within today: raw → 1h if too many events
        today_count = await db.account_activity_history.count_documents({
            "user_id": user_id,
            "timestamp": {"$gte": today_start.isoformat()}
        })
        if today_count <= 500:
            return await get_raw_chart_data(user_id, today_start, now, 500, current_profit, range)
        else:
            return await build_candles_from_raw(user_id, "1h", today_start, now, 24, current_profit, range)

    elif range == "D":
        # Completed full days only — today excluded
        end_time = today_start
        start_time = today_start - timedelta(days=90)
        return await build_candles_from_raw(user_id, "1d", start_time, end_time, 90, current_profit, range)

    elif range == "W":
        # Completed full weeks only — current week excluded
        week_start = today_start - timedelta(days=today_start.weekday())
        end_time = week_start
        start_time = week_start - timedelta(weeks=52)
        return await build_candles_from_raw(user_id, "1w", start_time, end_time, 52, current_profit, range)

    elif range == "M":
        # Completed full months only — current month excluded
        month_start = today_start.replace(day=1)
        end_time = month_start
        back_year = month_start.year
        back_month = month_start.month - 24
        while back_month <= 0:
            back_month += 12
            back_year -= 1
        start_time = month_start.replace(year=back_year, month=back_month)
        return await build_candles_from_raw(user_id, "1M", start_time, end_time, 24, current_profit, range)

    else:  # ALL — cascading smart resolution based on time span
        start_time = datetime(2000, 1, 1, tzinfo=timezone.utc)
        end_time = now
        raw_count = await db.account_activity_history.count_documents({"user_id": user_id})
        if raw_count <= 500:
            return await get_raw_chart_data(user_id, start_time, end_time, 500, current_profit, range)
        # Determine time span to pick resolution
        first_event = await db.account_activity_history.find_one(
            {"user_id": user_id}, sort=[("timestamp", 1)]
        )
        if first_event:
            first_ts = datetime.fromisoformat(first_event["timestamp"].replace("Z", "+00:00"))
            days_span = (now - first_ts).days
        else:
            days_span = 0
        if days_span <= 90:
            resolution, mp = "1d", 90
        elif days_span <= 730:
            resolution, mp = "1w", 104
        else:
            resolution, mp = "1M", 60
        return await build_candles_from_raw(user_id, resolution, start_time, end_time, mp, current_profit, range)


# Legacy endpoint for backwards compatibility
@router.get("/games/slot/info")
async def get_classic_slot_info():
    return await get_slot_info("classic")

# ============== LUCKY WHEEL ENDPOINTS ==============

