"""Route module: user."""
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

@router.get("/user/history")
async def get_bet_history(
    request: Request, 
    limit: int = 100, 
    page: int = 1,
    game_type: Optional[str] = None
):
    """Get user's bet history - last 7 days, paginated"""
    user = await get_current_user(request)
    
    # Calculate date 7 days ago
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    
    query = {
        "user_id": user["user_id"],
        "timestamp": {"$gte": seven_days_ago}
    }
    if game_type:
        query["game_type"] = game_type
    
    # Calculate skip for pagination
    skip = (page - 1) * limit
    
    # Get total count for pagination info
    total_count = await db.bet_history.count_documents(query)
    
    # Secondary sort in Python to ensure bet comes before win for same timestamp
    # With reverse=True (descending time), we want bet to appear ABOVE win in the list
    # Since timestamps are: bet=T, win=T+1ms, descending sort puts win first naturally
    # We need to group by base timestamp and put bet before win within the group
    history = await db.bet_history.find(
        query,
        {"_id": 0}
    ).sort([
        ("timestamp", -1),
        ("transaction_type", -1)  # BET zuerst
    ]).skip(skip).limit(limit).to_list(limit)
    
    for item in history:

    # Timestamp konvertieren
        if isinstance(item.get("timestamp"), str):
            item["timestamp"] = datetime.fromisoformat(item["timestamp"])

    # Sicherstellen, dass bet_id existiert
        if "bet_id" not in item:
            item["bet_id"] = f"bet_{uuid.uuid4().hex[:12]}"

    # Einheitliche Amount-Logik (Single Source of Truth)

        transaction_type = item.get("transaction_type")

        bet_amount = float(item.get("bet_amount", 0))
        win_amount = float(item.get("win_amount", 0))

# Falls nur amount gespeichert ist
        if transaction_type == "bet":
            bet_amount = abs(float(item.get("amount", bet_amount)))
            win_amount = 0.0

        elif transaction_type == "win":
            win_amount = float(item.get("amount", win_amount))
            bet_amount = 0.0

        elif transaction_type in ("admin", "quest"):
            # Admin/quest: preserve the raw amount directly
            raw_amount = float(item.get("amount", item.get("net_outcome", 0)))
            item["bet_amount"] = 0.0
            item["win_amount"] = 0.0
            item["net_outcome"] = raw_amount
            item["amount"] = raw_amount
            continue

# WICHTIG: Werte setzen, die Frontend braucht
        item["bet_amount"] = bet_amount
        item["win_amount"] = win_amount
        item["net_outcome"] = win_amount - bet_amount
        item["amount"] = win_amount - bet_amount

    return {
        "items": history,
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": (total_count + limit - 1) // limit
    }

@router.get("/user/stats")
async def get_user_stats(request: Request):
    user = await get_current_user(request)
    
    # Get stats from aggregation (single source of truth)
    overall_stats = await get_user_stats_from_history(user["user_id"])
    
    # Get game-specific stats
    pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$group": {
            "_id": {"game_type": "$game_type", "slot_id": "$slot_id"},
            "total_bets": {"$sum": 1},
            "total_wagered": {"$sum": "$bet_amount"},
            "total_won": {"$sum": "$win_amount"},
            "wins": {"$sum": {"$cond": [{"$gt": ["$win_amount", "$bet_amount"]}, 1, 0]}},
            "losses": {"$sum": {"$cond": [{"$lte": ["$win_amount", "$bet_amount"]}, 1, 0]}}
        }}
    ]
    
    game_stats = await db.bet_history.aggregate(pipeline).to_list(100)
    
    stats_by_game = {}
    for stat in game_stats:
        game = stat["_id"]["game_type"]
        slot_id = stat["_id"].get("slot_id")
        key = f"{game}_{slot_id}" if slot_id else game
        
        stats_by_game[key] = {
            "game_type": game,
            "slot_id": slot_id,
            "slot_name": SLOT_CONFIGS.get(slot_id, {}).get("name") if slot_id else None,
            "total_bets": stat["total_bets"],
            "total_wagered": round(stat["total_wagered"], 2),
            "total_won": round(stat["total_won"], 2),
            "net_profit": round(stat["total_won"] - stat["total_wagered"], 2),
            "wins": stat["wins"],
            "losses": stat["losses"],
            "win_rate": round((stat["wins"] / stat["total_bets"]) * 100, 2) if stat["total_bets"] > 0 else 0
        }
    
    return {
        "overall": {
            "balance": user.get("balance", 0),
            "level": user.get("level", 1),
            "xp": max(0, user.get("xp", 0)),
            **overall_stats
        },
        "by_game": stats_by_game
    }

@router.get("/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(limit: int = 20):
    # Get all users sorted by level (highest first)
    users = await db.users.find(
        {},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).sort("level", -1).limit(limit).to_list(limit)
    
    # Get stats for each user from aggregation
    leaderboard = []
    for u in users:
        stats = await get_user_stats_from_history(u["user_id"])
        leaderboard.append({
            "user_id": u["user_id"],
            "username": u["username"],
            "level": u.get("level", 1),
            "total_wins": stats["total_wins"],
            "net_profit": stats["net_profit"],
            "total_wagered": stats["total_wagered"],
            "avatar": u.get("avatar"),
            "vip_status": u.get("vip_status"),
            "frame": u.get("frame")
        })
    
    return [LeaderboardEntry(**entry) for entry in leaderboard]

# ============== EXTENDED LEADERBOARDS ==============

@router.get("/leaderboards/balance")
async def get_balance_leaderboard(limit: int = 25):
    """Top players by highest balance"""
    users = await db.users.find(
        {},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).sort("balance", -1).limit(limit).to_list(limit)
    
    return [
        {
            "rank": idx + 1,
            "user_id": u["user_id"],
            "username": u["username"],
            "balance": round(u.get("balance", 0), 2),
            "level": u.get("level", 1),
            "avatar": u.get("avatar"),
            "frame": u.get("frame")
        }
        for idx, u in enumerate(users)
    ]

@router.get("/leaderboards/level")
async def get_level_leaderboard(limit: int = 25):
    """Top players by highest level (sorted by XP)"""
    users = await db.users.find(
        {},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).sort([("level", -1), ("xp", -1)]).limit(limit).to_list(limit)
    
    return [
        {
            "rank": idx + 1,
            "user_id": u["user_id"],
            "username": u["username"],
            "level": u.get("level", 1),
            "xp": u.get("xp", 0),
            "avatar": u.get("avatar"),
            "frame": u.get("frame")
        }
        for idx, u in enumerate(users)
    ]

@router.get("/leaderboards/biggest-wins")
async def get_biggest_wins_leaderboard(limit: int = 25):
    """Top 25 biggest single wins across all game modes (wins > 10 G)"""
    big_wins = await db.big_wins.find({}).sort("win_amount", -1).limit(limit).to_list(limit)
    
    return [
        {
            "rank": idx + 1,
            "win_id": w.get("win_id"),
            "user_id": w.get("user_id"),
            "username": w.get("username"),
            "game_type": w.get("game_type"),
            "slot_id": w.get("slot_id"),
            "slot_name": w.get("slot_name"),
            "bet_amount": round(w.get("bet_amount", 0), 2),
            "win_amount": round(w.get("win_amount", 0), 2),
            "win_chance": w.get("win_chance"),  # For jackpot
            "multiplier": round(w.get("win_amount", 0) / w.get("bet_amount", 1), 1) if w.get("bet_amount", 0) > 0 else 0,
            "timestamp": w.get("timestamp"),
            "avatar": w.get("avatar"),
            "frame": w.get("frame"),
            "winning_symbols": w.get("winning_symbols", [])
        }
        for idx, w in enumerate(big_wins)
    ]

@router.get("/leaderboards/biggest-multiplier")
async def get_biggest_multiplier_leaderboard(limit: int = 25):
    """Top 25 highest multiplier wins"""
    big_wins = await db.big_wins.find({}).sort("multiplier", -1).limit(limit).to_list(limit)

    return [
        {
            "rank": idx + 1,
            "win_id": w.get("win_id"),
            "user_id": w.get("user_id"),
            "username": w.get("username"),
            "game_type": w.get("game_type"),
            "slot_id": w.get("slot_id"),
            "slot_name": w.get("slot_name"),
            "bet_amount": round(w.get("bet_amount", 0), 2),
            "win_amount": round(w.get("win_amount", 0), 2),
            "win_chance": w.get("win_chance"),
            "multiplier": round(w.get("multiplier", 0), 2),
            "timestamp": w.get("timestamp"),
            "avatar": w.get("avatar"),
            "frame": w.get("frame"),
            "winning_symbols": w.get("winning_symbols", [])
        }
        for idx, w in enumerate(big_wins)
    ]

@router.get("/live-wins")
async def get_live_wins(limit: int = 20):
    """Get recent big wins (> 10 G) for live feed"""
    big_wins = await db.big_wins.find({}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return [
        {
            "win_id": w.get("win_id"),
            "user_id": w.get("user_id"),
            "username": w.get("username"),
            "game_type": w.get("game_type"),
            "slot_id": w.get("slot_id"),
            "slot_name": w.get("slot_name"),
            "bet_amount": round(w.get("bet_amount", 0), 2),
            "win_amount": round(w.get("win_amount", 0), 2),
            "win_chance": w.get("win_chance"),
            "multiplier": round(w.get("win_amount", 0) / w.get("bet_amount", 1), 1) if w.get("bet_amount", 0) > 0 else 0,
            "timestamp": w.get("timestamp"),
            "avatar": w.get("avatar"),
            "winning_symbols": w.get("winning_symbols", [])
        }
        for w in big_wins
    ]


