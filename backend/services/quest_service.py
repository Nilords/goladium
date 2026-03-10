"""Quest and GamePass service — progress tracking, XP rewards."""
import logging
from datetime import datetime, timezone, timedelta
from database import db
from config import *


async def get_user_quests(user_id: str):
    """Get or initialize user's quest progress"""
    quest_data = await db.user_quests.find_one({"user_id": user_id})
    
    if not quest_data:
        # Initialize quest progress for all quests
        quest_progress = {}
        for quest in QUEST_DEFINITIONS:
            quest_progress[quest["quest_id"]] = {
                "current": 0,
                "completed": False,
                "claimed": False
            }
        
        quest_data = {
            "user_id": user_id,
            "progress": quest_progress,
            "daily_a_rewards": 0,
            "last_a_reward_date": None,
            "quests_since_a": 0,  # Track quests completed since last A reward
            "last_reset": datetime.now(timezone.utc).isoformat()
        }
        await db.user_quests.insert_one(quest_data)
    
    return quest_data

async def update_quest_progress(user_id: str, quest_type: str, amount: int = 1, **conditions):
    """
    Update progress for quests matching the type and conditions.
    
    STRICT VALIDATION RULES:
    - Slot spins/wins: Only count if bet_amount >= 5 G
    - Jackpot wins: Only count if pot_size >= 20 G
    - No "join" or "participate" jackpot tracking allowed
    """
    # STRICT: Reject jackpot_joins type entirely - only wins allowed
    if quest_type == "jackpot_joins":
        return {}  # Silently ignore - this type is not supported
    
    quest_data = await get_user_quests(user_id)
    progress = quest_data.get("progress", {})
    updated = False
    
    for quest in QUEST_DEFINITIONS:
        if quest["type"] != quest_type:
            continue
        
        quest_id = quest["quest_id"]
        if quest_id not in progress:
            progress[quest_id] = {"current": 0, "completed": False, "claimed": False}
        
        if progress[quest_id]["completed"]:
            continue
        
        # STRICT condition validation
        meets_conditions = True
        
        if quest_type in ["spins", "wins"]:
            # STRICT: All slot quests require minimum 5 G bet
            # Allow small floating point tolerance (4.99 rounds to 5)
            min_bet = quest.get("min_bet", 5.0)  # Default to 5 G if not specified
            if min_bet < 5.0:
                min_bet = 5.0  # Enforce minimum 5 G
            actual_bet = conditions.get("bet_amount", 0)
            # Use small tolerance for floating point comparison
            if actual_bet < (min_bet - 0.05):
                meets_conditions = False
                
        elif quest_type == "jackpot_wins":
            # STRICT: All jackpot wins require minimum 20 G pot
            min_pot = quest.get("min_pot", 20)  # Default to 20 G if not specified
            if min_pot < 20:
                min_pot = 20  # Enforce minimum 20 G pot
            actual_pot = conditions.get("pot_size", 0)
            if actual_pot < min_pot:
                meets_conditions = False
        
        if meets_conditions:
            progress[quest_id]["current"] += amount
            if progress[quest_id]["current"] >= quest["target"]:
                progress[quest_id]["current"] = quest["target"]
                progress[quest_id]["completed"] = True
            updated = True
    
    if updated:
        await db.user_quests.update_one(
            {"user_id": user_id},
            {"$set": {"progress": progress}}
        )
    
    return progress

async def add_game_pass_xp(user_id: str, xp_amount: int):
    """Add XP to user's Game Pass and handle level ups"""
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        return None
    
    current_level = user.get("game_pass_level", 1)
    current_xp = user.get("game_pass_xp", 0) + xp_amount
    
    # Calculate new level
    new_level = current_level
    while current_xp >= GAME_PASS_XP_PER_LEVEL and new_level < GAME_PASS_MAX_LEVEL:
        current_xp -= GAME_PASS_XP_PER_LEVEL
        new_level += 1
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"game_pass_level": new_level, "game_pass_xp": current_xp}}
    )
    
    return {"level": new_level, "xp": current_xp}
