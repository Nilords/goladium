"""XP, level and user stats service."""
from datetime import datetime, timezone
from database import db
from config import *


def calculate_xp(bet_amount: float) -> int:
    """
    Calculate XP based on wagered amount.
    1 XP per 0.01 G bet (100 XP per 1 G wagered)
    Only granted from active gameplay (Slots, Jackpot) - NOT Lucky Wheel
    """
    if bet_amount <= 0:
        return 0
    
    # 1 XP per 0.01 G = 100 XP per 1 G
    xp = int(bet_amount * XP_PER_G)
    return max(0, xp)

def calculate_level(total_xp: int) -> int:
    """
    Calculate level based on total XP using progressive requirements.
    Early levels: 500-1500 XP
    Later levels: 5000+ XP per level
    """
    if total_xp < 0:
        total_xp = 0
    
    level = 1
    cumulative_xp = 0
    
    # Check against predefined level requirements
    for i in range(1, len(LEVEL_XP_REQUIREMENTS)):
        cumulative_xp += LEVEL_XP_REQUIREMENTS[i]
        if total_xp >= cumulative_xp:
            level = i + 1
        else:
            break
    
    # For levels beyond the predefined list, continue with scaling formula
    if level >= len(LEVEL_XP_REQUIREMENTS):
        # Continue scaling: each level requires ~10% more XP than previous
        last_req = LEVEL_XP_REQUIREMENTS[-1]
        extra_levels = 0
        while cumulative_xp <= total_xp:
            extra_levels += 1
            last_req = int(last_req * 1.1)
            cumulative_xp += last_req
        level = len(LEVEL_XP_REQUIREMENTS) - 1 + extra_levels
    
    return level

def get_xp_for_next_level(current_level: int, current_xp: int) -> dict:
    """Get XP progress info for the current level"""
    if current_level < len(LEVEL_XP_REQUIREMENTS):
        # Calculate cumulative XP needed for current level
        cumulative_for_current = sum(LEVEL_XP_REQUIREMENTS[1:current_level])
        xp_needed_for_next = LEVEL_XP_REQUIREMENTS[current_level] if current_level < len(LEVEL_XP_REQUIREMENTS) else int(LEVEL_XP_REQUIREMENTS[-1] * 1.1)
        xp_into_level = current_xp - cumulative_for_current
    else:
        # Beyond predefined levels
        cumulative = sum(LEVEL_XP_REQUIREMENTS[1:])
        last_req = LEVEL_XP_REQUIREMENTS[-1]
        for i in range(len(LEVEL_XP_REQUIREMENTS), current_level):
            last_req = int(last_req * 1.1)
            cumulative += last_req
        xp_needed_for_next = int(last_req * 1.1)
        xp_into_level = current_xp - cumulative
    
    return {
        "current_xp": current_xp,
        "xp_into_level": max(0, xp_into_level),
        "xp_needed_for_next": xp_needed_for_next,
        "progress_percent": min(100, round((xp_into_level / xp_needed_for_next) * 100, 1)) if xp_needed_for_next > 0 else 100
    }

async def get_user_stats_from_history(user_id: str) -> dict:
    """Get accurate stats from bet_history aggregation.
    net_profit comes from account_activity_history (cumulative) to include all sources
    (slots, jackpot, wheel, quests, admin grants, items, trades, chests).
    """
    # Gambling stats (spins, wins, wagered) from bet_history
    pipeline = [
        {"$match": {"user_id": user_id, "game_type": {"$ne": "wheel"}}},  # Exclude free wheel spins
        {"$group": {
            "_id": None,
            "total_wagered": {"$sum": {"$cond": [{"$eq": ["$transaction_type", "bet"]}, "$bet_amount", 0]}},
            "total_won": {"$sum": {"$cond": [{"$eq": ["$transaction_type", "win"]}, "$win_amount", 0]}},
            "total_bets": {"$sum": {"$cond": [{"$eq": ["$transaction_type", "bet"]}, 1, 0]}},
            "wins": {"$sum": {"$cond": [{"$eq": ["$transaction_type", "win"]}, 1, 0]}},
            "losses": {"$sum": {"$cond": [
                {"$and": [
                    {"$eq": ["$transaction_type", "bet"]},
                    {"$not": {"$gt": ["$win_amount", 0]}}
                ]}, 1, 0
            ]}}
        }}
    ]

    result = await db.bet_history.aggregate(pipeline).to_list(1)

    # Net profit from account_activity_history (includes everything: slots, jackpot,
    # wheel, admin grants, quests, chest rewards, item sales/purchases, trades)
    last_activity = await db.account_activity_history.find_one(
        {"user_id": user_id},
        sort=[("event_number", -1)]
    )
    net_profit = round(last_activity["cumulative_profit"], 2) if last_activity else 0.0

    if result:
        stats = result[0]
        total_wagered = round(stats.get("total_wagered", 0), 2)
        total_won = round(stats.get("total_won", 0), 2)
        return {
            "total_wagered": total_wagered,
            "total_won": total_won,
            "net_profit": net_profit,
            "total_spins": stats.get("total_bets", 0),
            "total_wins": stats.get("wins", 0),
            "total_losses": stats.get("total_bets", 0) - stats.get("wins", 0)
        }

    return {
        "total_wagered": 0.0,
        "total_won": 0.0,
        "net_profit": net_profit,
        "total_spins": 0,
        "total_wins": 0,
        "total_losses": 0
    }

