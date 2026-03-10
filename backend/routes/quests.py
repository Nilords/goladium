"""Route module: quests."""
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

@router.get("/quests")
async def get_quests(request: Request):
    """Get 3 quest slots with user's progress.
    Each slot shows either an active quest OR a cooldown timer.
    A-currency quests only appear after 2 completed quests (cooldown).
    Quests reset 15 minutes after being claimed (repeatable).
    """
    user = await get_current_user(request)
    quest_data = await get_user_quests(user["user_id"])
    progress = quest_data.get("progress", {})
    quest_slots = quest_data.get("quest_slots", [None, None, None])  # 3 fixed slots
    
    # Get A-currency tracking data
    today = datetime.now(timezone.utc).date().isoformat()
    now = datetime.now(timezone.utc)
    last_a_date = quest_data.get("last_a_reward_date")
    daily_a = quest_data.get("daily_a_rewards", 0)
    quests_since_a = quest_data.get("quests_since_a", 0)
    quests_since_a_date = quest_data.get("quests_since_a_date")
    
    # Reset daily counters if new day
    if last_a_date and last_a_date != today:
        daily_a = 0
    
    # Reset quests_since_a only when a new day starts (not just because it's unset)
    if quests_since_a_date and quests_since_a_date != today:
        quests_since_a = 0
    
    # Determine if A-currency quests can be shown
    can_show_a_quests = quests_since_a >= 5 and daily_a < 5
    
    # Determine language
    lang = request.headers.get("Accept-Language", "en")[:2]
    
    QUEST_COOLDOWN_MINUTES = 15
    slots_updated = False
    
    # Build list of available quest IDs (not assigned to any slot)
    assigned_quest_ids = set()
    for slot in quest_slots:
        if slot and slot.get("quest_id"):
            assigned_quest_ids.add(slot["quest_id"])
    
    # Get available quests (not A-quests if cooldown not met)
    available_quests = []
    for quest in QUEST_DEFINITIONS:
        has_a = quest["rewards"].get("a", 0) > 0
        if has_a and not can_show_a_quests:
            continue
        if quest["quest_id"] not in assigned_quest_ids:
            available_quests.append(quest)
    
    # Process each slot
    result_slots = []
    for i, slot in enumerate(quest_slots):
        if slot is None:
            slot = {}
        
        quest_id = slot.get("quest_id")
        claimed_at = slot.get("claimed_at")
        
        # Check if the quest in this slot is already claimed in progress (legacy compatibility)
        if quest_id and not claimed_at:
            quest_progress = progress.get(quest_id, {})
            if quest_progress.get("claimed"):
                # Legacy case: quest was claimed but slot doesn't have claimed_at
                # Set claimed_at to now and start cooldown immediately (give a grace period of 30 seconds)
                claimed_at = (now - timedelta(minutes=QUEST_COOLDOWN_MINUTES - 0.5)).isoformat()
                slot["claimed_at"] = claimed_at
                quest_slots[i] = slot
                slots_updated = True
        
        # Check if slot is on cooldown
        if claimed_at:
            claimed_time = datetime.fromisoformat(claimed_at)
            if claimed_time.tzinfo is None:
                claimed_time = claimed_time.replace(tzinfo=timezone.utc)
            
            minutes_since_claim = (now - claimed_time).total_seconds() / 60
            
            if minutes_since_claim < QUEST_COOLDOWN_MINUTES:
                # Slot is still on cooldown - show timer
                remaining_seconds = int((QUEST_COOLDOWN_MINUTES - minutes_since_claim) * 60)
                result_slots.append({
                    "slot_index": i,
                    "status": "cooldown",
                    "remaining_seconds": remaining_seconds,
                    "remaining_minutes": int(remaining_seconds / 60),
                    "quest": None
                })
                continue
            else:
                # Cooldown expired - reset slot and assign new quest
                # Also reset the progress for this quest
                old_quest_id = quest_id
                if old_quest_id and old_quest_id in progress:
                    progress[old_quest_id] = {"current": 0, "completed": False, "claimed": False, "claimed_at": None}
                quest_slots[i] = {}
                slot = {}
                quest_id = None
                slots_updated = True
        
        # Slot needs a quest assigned
        if not quest_id and available_quests:
            # Assign a new quest to this slot
            new_quest = available_quests.pop(0)
            quest_id = new_quest["quest_id"]
            quest_slots[i] = {"quest_id": quest_id, "claimed_at": None}
            assigned_quest_ids.add(quest_id)
            # Reset progress for the new quest
            progress[quest_id] = {"current": 0, "completed": False, "claimed": False, "claimed_at": None}
            slots_updated = True
        
        # Get quest data
        if quest_id:
            quest_def = next((q for q in QUEST_DEFINITIONS if q["quest_id"] == quest_id), None)
            if quest_def:
                user_progress = progress.get(quest_id, {"current": 0, "completed": False, "claimed": False})
                
                result_slots.append({
                    "slot_index": i,
                    "status": "active",
                    "remaining_seconds": 0,
                    "remaining_minutes": 0,
                    "quest": {
                        "quest_id": quest_def["quest_id"],
                        "name": quest_def.get(f"name_{lang}", quest_def.get("name_en")),
                        "description": quest_def.get(f"description_{lang}", quest_def.get("description_en")),
                        "type": quest_def["type"],
                        "target": quest_def["target"],
                        "current": user_progress["current"],
                        "completed": user_progress["completed"],
                        "claimed": user_progress["claimed"],
                        "rewards": quest_def["rewards"],
                        "game_pass_xp": quest_def["game_pass_xp"],
                        "difficulty": quest_def["difficulty"]
                    }
                })
            else:
                # Quest definition not found, reset slot
                quest_slots[i] = {}
                slots_updated = True
                result_slots.append({
                    "slot_index": i,
                    "status": "empty",
                    "remaining_seconds": 0,
                    "remaining_minutes": 0,
                    "quest": None
                })
        else:
            # No quest available for this slot
            result_slots.append({
                "slot_index": i,
                "status": "empty",
                "remaining_seconds": 0,
                "remaining_minutes": 0,
                "quest": None
            })
    
    # Save updated slots and progress if changed
    if slots_updated:
        await db.user_quests.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"quest_slots": quest_slots, "progress": progress}},
            upsert=True
        )
    
    # Build legacy quests array for backward compatibility
    quests = [slot["quest"] for slot in result_slots if slot["quest"]]
    
    return {
        "slots": result_slots,
        "quests": quests,  # Legacy support
        "quests_until_a_chance": max(0, 5 - quests_since_a) if not can_show_a_quests else 0,
        "daily_a_earned": daily_a,
        "daily_a_limit": 5
    }

@router.post("/quests/{quest_id}/claim")
async def claim_quest_reward(quest_id: str, request: Request):
    """Claim rewards for a completed quest"""
    user = await get_current_user(request)
    quest_data = await get_user_quests(user["user_id"])
    progress = quest_data.get("progress", {})
    
    if quest_id not in progress:
        raise HTTPException(status_code=404, detail="Quest not found")
    
    if not progress[quest_id]["completed"]:
        raise HTTPException(status_code=400, detail="Quest not completed")
    
    if progress[quest_id]["claimed"]:
        raise HTTPException(status_code=400, detail="Quest already claimed")
    
    # Find quest definition
    quest = next((q for q in QUEST_DEFINITIONS if q["quest_id"] == quest_id), None)
    if not quest:
        raise HTTPException(status_code=404, detail="Quest definition not found")
    
    rewards = quest["rewards"]
    rewards_given = {"xp": rewards.get("xp", 0), "g": 0, "a": 0, "game_pass_xp": quest["game_pass_xp"]}
    
    # Always give XP
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"xp": rewards.get("xp", 0)}}
    )
    
    # Give G (always if present)
    if "g" in rewards:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$inc": {"balance": rewards["g"]}}
        )
        rewards_given["g"] = rewards["g"]
        
        # Track quest G reward in account activity
        await record_account_activity(
            user_id=user["user_id"],
            event_type="quest",
            amount=rewards["g"],
            source="Quest",
            details={"quest_id": quest_id, "xp": rewards.get("xp", 0)}
        )
        # Also write to bet_history so it appears in History tab and Dashboard
        await db.bet_history.insert_one({
            "bet_id": f"quest_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "game_type": "quest",
            "transaction_type": "quest",
            "amount": rewards["g"],
            "net_outcome": rewards["g"],
            "bet_amount": 0,
            "details": {
                "quest_id": quest_id,
                "quest_title": quest.get("name_en", quest.get("name_de", quest_id)),
                "xp": rewards.get("xp", 0)
            }
        })
    
    # Handle A currency (rare, with limits)
    if "a" in rewards and rewards["a"] > 0:
        today = datetime.now(timezone.utc).date().isoformat()
        last_a_date = quest_data.get("last_a_reward_date")
        daily_a = quest_data.get("daily_a_rewards", 0)
        quests_since_a = quest_data.get("quests_since_a", 0)
        
        # Reset daily counter if new day
        if last_a_date and last_a_date != today:
            daily_a = 0
            quests_since_a = 0
        
        # Check if A can be given (max 5/day, 2 quest cooldown)
        can_give_a = daily_a < 5 and quests_since_a >= 5
        
        if can_give_a:
            a_amount = min(rewards["a"], 5 - daily_a)  # Cap at remaining daily
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$inc": {"balance_a": a_amount}}
            )
            rewards_given["a"] = a_amount
            daily_a += a_amount
            quests_since_a = 0  # Reset cooldown
        else:
            quests_since_a += 1
        
        await db.user_quests.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "daily_a_rewards": daily_a,
                "last_a_reward_date": today,
                "quests_since_a": quests_since_a
            }}
        )
    else:
        # Increment quests_since_a counter even for quests without A
        today = datetime.now(timezone.utc).date().isoformat()
        await db.user_quests.update_one(
            {"user_id": user["user_id"]},
            {
                "$inc": {"quests_since_a": 1},
                "$set": {"quests_since_a_date": today}
            }
        )
    
    # Add Game Pass XP
    gp_result = await add_game_pass_xp(user["user_id"], quest["game_pass_xp"])
    
    # Mark quest as claimed with timestamp (for 15 min cooldown reset)
    now = datetime.now(timezone.utc).isoformat()
    progress[quest_id]["claimed"] = True
    progress[quest_id]["claimed_at"] = now
    
    # Also update the quest slot to start cooldown timer
    quest_slots = quest_data.get("quest_slots", [None, None, None])
    for i, slot in enumerate(quest_slots):
        if slot and slot.get("quest_id") == quest_id:
            quest_slots[i]["claimed_at"] = now
            break
    
    await db.user_quests.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            f"progress.{quest_id}.claimed": True,
            f"progress.{quest_id}.claimed_at": now,
            "quest_slots": quest_slots
        }}
    )
    
    return {
        "success": True,
        "rewards": rewards_given,
        "game_pass": gp_result
    }

@router.get("/game-pass")
async def get_game_pass_status(request: Request):
    """Get user's Game Pass status - Now with chest per level system!"""
    user = await get_current_user(request)
    
    level = user.get("game_pass_level", 1)
    xp = user.get("game_pass_xp", 0)
    galadium_active = user.get("galadium_pass_active", False)
    
    # Get claimed chest levels
    gp_data = await db.user_game_pass.find_one({"user_id": user["user_id"]})
    claimed_normal = gp_data.get("claimed_normal_chests", []) if gp_data else []
    claimed_galadium = gp_data.get("claimed_galadium_chests", []) if gp_data else []
    
    # Build unclaimed levels list
    unclaimed_normal = [l for l in range(1, level + 1) if l not in claimed_normal]
    unclaimed_galadium = [l for l in range(1, level + 1) if l not in claimed_galadium] if galadium_active else []
    
    return {
        "level": level,
        "xp": xp,
        "xp_to_next": GAME_PASS_XP_PER_LEVEL,
        "max_level": GAME_PASS_MAX_LEVEL,
        "galadium_active": galadium_active,
        "chest_system": {
            "normal_chest": GAMEPASS_CHEST,
            "galadium_chest": GALADIUM_CHEST if galadium_active else None,
            "claimed_normal": claimed_normal,
            "claimed_galadium": claimed_galadium,
            "unclaimed_normal": unclaimed_normal,
            "unclaimed_galadium": unclaimed_galadium,
            "total_unclaimed": len(unclaimed_normal) + len(unclaimed_galadium)
        }
    }


@router.post("/game-pass/claim-chest/{level}")
async def claim_game_pass_chest(level: int, chest_type: str = "normal", request: Request = None):
    """
    Claim a GamePass chest at a specific level.
    
    chest_type: "normal" (everyone) or "galadium" (only if galadium_pass_active)
    """
    user = await get_current_user(request)
    user_id = user["user_id"]
    now = datetime.now(timezone.utc)
    
    current_level = user.get("game_pass_level", 1)
    galadium_active = user.get("galadium_pass_active", False)
    
    # Validate level
    if level < 1 or level > current_level:
        raise HTTPException(status_code=400, detail="Level not reached yet")
    
    # Validate chest type
    if chest_type not in ["normal", "galadium"]:
        raise HTTPException(status_code=400, detail="Invalid chest type")
    
    if chest_type == "galadium" and not galadium_active:
        raise HTTPException(status_code=403, detail="Galadium Pass required for bonus chests")
    
    # Get or create game pass data
    gp_data = await db.user_game_pass.find_one({"user_id": user_id})
    if not gp_data:
        gp_data = {
            "user_id": user_id, 
            "claimed_normal_chests": [],
            "claimed_galadium_chests": [],
            "claimed_rewards": []  # Legacy - keep for compatibility
        }
        await db.user_game_pass.insert_one(gp_data)
    
    # Check if already claimed
    claimed_field = "claimed_normal_chests" if chest_type == "normal" else "claimed_galadium_chests"
    if level in gp_data.get(claimed_field, []):
        raise HTTPException(status_code=400, detail=f"{chest_type.capitalize()} chest for level {level} already claimed")
    
    # Determine which chest to give
    chest_config = GAMEPASS_CHEST if chest_type == "normal" else GALADIUM_CHEST
    
    # Ensure chest item exists in DB
    existing_chest = await db.items.find_one({"item_id": chest_config["item_id"]})
    if not existing_chest:
        # Create the chest item
        await db.items.insert_one({
            **chest_config,
            "is_tradeable": True,
            "is_sellable": True,
            "created_at": now
        })
    
    # Add chest to inventory
    inventory_doc = {
        "inventory_id": f"inv_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "item_id": chest_config["item_id"],
        "item_name": chest_config["name"],
        "item_rarity": chest_config["rarity"],
        "item_flavor_text": chest_config["flavor_text"],
        "purchase_price": chest_config["base_value"],
        "acquired_at": now.isoformat(),
        "acquired_from": f"gamepass_{chest_type}",
        "source": f"game_pass_level_{level}_{chest_type}"
    }
    await db.user_inventory.insert_one(inventory_doc)
    
    # Record inventory value event
    await record_inventory_value_event(
        user_id=user_id,
        event_type="gamepass_reward",
        delta_value=chest_config["base_value"],
        related_item_id=chest_config["item_id"],
        related_item_name=chest_config["name"],
        details={"level": level, "chest_type": chest_type, "rarity": chest_config["rarity"]}
    )
    
    # Mark as claimed
    await db.user_game_pass.update_one(
        {"user_id": user_id},
        {"$push": {claimed_field: level}}
    )
    
    return {
        "success": True,
        "chest": {
            "inventory_id": inventory_doc["inventory_id"],
            "item_id": chest_config["item_id"],
            "name": chest_config["name"],
            "rarity": chest_config["rarity"],
            "flavor_text": chest_config["flavor_text"],
            "value": chest_config["base_value"]
        },
        "level": level,
        "chest_type": chest_type
    }


@router.post("/game-pass/claim-all-chests")
async def claim_all_unclaimed_chests(request: Request):
    """Claim all unclaimed GamePass chests at once"""
    user = await get_current_user(request)
    user_id = user["user_id"]
    now = datetime.now(timezone.utc)
    
    current_level = user.get("game_pass_level", 1)
    galadium_active = user.get("galadium_pass_active", False)
    
    # Get game pass data
    gp_data = await db.user_game_pass.find_one({"user_id": user_id})
    if not gp_data:
        gp_data = {
            "user_id": user_id,
            "claimed_normal_chests": [],
            "claimed_galadium_chests": []
        }
        await db.user_game_pass.insert_one(gp_data)
    
    claimed_normal = gp_data.get("claimed_normal_chests", [])
    claimed_galadium = gp_data.get("claimed_galadium_chests", [])
    
    # Find unclaimed levels
    unclaimed_normal = [l for l in range(1, current_level + 1) if l not in claimed_normal]
    unclaimed_galadium = [l for l in range(1, current_level + 1) if l not in claimed_galadium] if galadium_active else []
    
    chests_given = []
    total_value = 0
    
    # Ensure chest items exist
    for chest_config in [GAMEPASS_CHEST, GALADIUM_CHEST]:
        existing = await db.items.find_one({"item_id": chest_config["item_id"]})
        if not existing:
            await db.items.insert_one({
                **chest_config,
                "is_tradeable": True,
                "is_sellable": True,
                "created_at": now
            })
    
    # Give normal chests
    for level in unclaimed_normal:
        inventory_doc = {
            "inventory_id": f"inv_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "item_id": GAMEPASS_CHEST["item_id"],
            "item_name": GAMEPASS_CHEST["name"],
            "item_rarity": GAMEPASS_CHEST["rarity"],
            "item_flavor_text": GAMEPASS_CHEST["flavor_text"],
            "purchase_price": GAMEPASS_CHEST["base_value"],
            "acquired_at": now.isoformat(),
            "acquired_from": "gamepass_normal",
            "source": f"game_pass_level_{level}_normal"
        }
        await db.user_inventory.insert_one(inventory_doc)
        
        chests_given.append({
            "inventory_id": inventory_doc["inventory_id"],
            "type": "normal",
            "level": level,
            "name": GAMEPASS_CHEST["name"]
        })
        total_value += GAMEPASS_CHEST["base_value"]
    
    # Give galadium chests
    for level in unclaimed_galadium:
        inventory_doc = {
            "inventory_id": f"inv_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "item_id": GALADIUM_CHEST["item_id"],
            "item_name": GALADIUM_CHEST["name"],
            "item_rarity": GALADIUM_CHEST["rarity"],
            "item_flavor_text": GALADIUM_CHEST["flavor_text"],
            "purchase_price": GALADIUM_CHEST["base_value"],
            "acquired_at": now.isoformat(),
            "acquired_from": "gamepass_galadium",
            "source": f"game_pass_level_{level}_galadium"
        }
        await db.user_inventory.insert_one(inventory_doc)
        
        chests_given.append({
            "inventory_id": inventory_doc["inventory_id"],
            "type": "galadium",
            "level": level,
            "name": GALADIUM_CHEST["name"]
        })
        total_value += GALADIUM_CHEST["base_value"]
    
    # Record single inventory value event for all chests
    if chests_given:
        await record_inventory_value_event(
            user_id=user_id,
            event_type="gamepass_reward",
            delta_value=total_value,
            related_item_id="bulk_chest_claim",
            related_item_name=f"{len(chests_given)} Chests",
            details={
                "normal_count": len(unclaimed_normal),
                "galadium_count": len(unclaimed_galadium),
                "levels": unclaimed_normal + unclaimed_galadium
            }
        )
        
        # Update claimed lists
        await db.user_game_pass.update_one(
            {"user_id": user_id},
            {
                "$push": {
                    "claimed_normal_chests": {"$each": unclaimed_normal},
                    "claimed_galadium_chests": {"$each": unclaimed_galadium}
                }
            }
        )
    
    return {
        "success": True,
        "chests_claimed": len(chests_given),
        "normal_chests": len(unclaimed_normal),
        "galadium_chests": len(unclaimed_galadium),
        "total_value": total_value,
        "chests": chests_given
    }


# Legacy endpoint - keep for backwards compatibility but redirect to new system
@router.post("/game-pass/claim/{level}")
async def claim_game_pass_reward(level: int, request: Request):
    """Legacy endpoint - now claims normal chest for that level"""
    return await claim_game_pass_chest(level, "normal", request)

# ============== INVENTORY VALUE TRACKING SYSTEM ==============
# Event-based tracking of inventory value changes (not time-aggregated like account value)


@router.get("/user/inventory-history")
async def get_inventory_history(request: Request, limit: int = 30):
    """
    Get user's inventory value history (event-based, not time-aggregated).
    Returns the last N events in chronological order.
    
    Query params:
    - limit: Number of events to return (default 30, max 100)
    """
    user = await get_current_user(request)
    user_id = user["user_id"]
    
    # Clamp limit
    limit = min(max(limit, 10), 100)
    
    # Get events sorted by event_number descending, then reverse for chronological order
    events = await db.inventory_value_history.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("event_number", -1).limit(limit).to_list(limit)
    
    # Reverse to get chronological order (oldest to newest)
    events = list(reversed(events))
    
    # Calculate stats from loaded events
    if events:
        values = [e["total_inventory_value_after"] for e in events]
        highest = max(values)
        lowest = min(values)  # Already >= 0 due to our constraint
        current = events[-1]["total_inventory_value_after"] if events else 0
        range_val = highest - lowest
        
        # Calculate change from first to last event
        start_value = events[0]["total_inventory_value_after"] if events else 0
        if start_value > 0:
            percent_change = round(((current - start_value) / start_value) * 100, 2)
        else:
            percent_change = 0 if current == 0 else 100  # From 0 to something = 100%
    else:
        # No events - get current inventory value
        current = await get_current_inventory_value(user_id)
        highest = current
        lowest = current
        range_val = 0
        percent_change = 0
    
    return {
        "events": events,
        "total_events": len(events),
        "limit": limit,
        "stats": {
            "current": current,
            "highest": highest,
            "lowest": lowest,
            "range": range_val,
            "percent_change": percent_change
        }
    }


