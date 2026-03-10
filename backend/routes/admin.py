"""Route module: admin."""
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

@router.post("/admin/galadium-pass")
async def admin_toggle_galadium_pass(data: AdminGaladiumPassRequest, request: Request):
    """Activate or deactivate Galadium Pass for a user (Discord bot endpoint)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Case-insensitive username search
    user = await db.users.find_one(
        {"username": {"$regex": f"^{data.username}$", "$options": "i"}},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{data.username}' not found")
    
    actual_username = user["username"]
    now = datetime.now(timezone.utc)
    
    # Update galadium pass status
    result = await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "galadium_pass_active": data.activate,
            "galadium_pass_updated_at": now.isoformat()
        }}
    )
    
    return {
        "success": True,
        "username": actual_username,
        "galadium_pass_active": data.activate,
        "action": "activated" if data.activate else "deactivated"
    }

@router.post("/admin/mute")
async def admin_mute_user(data: AdminMuteRequest, request: Request):
    """Mute a user for a specified duration (Discord bot endpoint)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Case-insensitive username search
    user = await db.users.find_one(
        {"username": {"$regex": f"^{data.username}$", "$options": "i"}},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{data.username}' not found")
    
    # Use the actual username from DB for consistency
    actual_username = user["username"]
    now = datetime.now(timezone.utc)
    
    if data.duration_seconds == 0:
        # Unmute - remove mute_until AND permanently_chat_muted flag
        was_muted = user.get("mute_until") is not None
        was_perma_muted = user.get("permanently_chat_muted", False)
        
        result = await db.users.update_one(
            {"username": actual_username},
            {
                "$unset": {"mute_until": ""},
                "$set": {"permanently_chat_muted": False}
            }
        )
        return {
            "success": True,
            "action": "unmuted",
            "username": actual_username,
            "was_muted": was_muted,
            "was_permanently_muted": was_perma_muted,
            "modified": result.modified_count > 0
        }
    elif data.duration_seconds == -1:
        # Permanent chat mute
        result = await db.users.update_one(
            {"username": actual_username},
            {
                "$set": {"permanently_chat_muted": True},
                "$unset": {"mute_until": ""}
            }
        )
        
        # Log moderation action
        log_entry = {
            "log_id": f"mod_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "username": actual_username,
            "action": "permanent_chat_mute",
            "violation_type": "admin_action",
            "reason": "Permanently muted by admin via Discord",
            "is_permanent": True,
            "timestamp": now.isoformat()
        }
        await db.moderation_logs.insert_one(log_entry)
        
        return {
            "success": True,
            "action": "permanently_muted",
            "username": actual_username,
            "is_permanent": True,
            "modified": result.modified_count > 0
        }
    else:
        # Temporary mute
        mute_until = now + timedelta(seconds=data.duration_seconds)
        result = await db.users.update_one(
            {"username": actual_username},
            {
                "$set": {"mute_until": mute_until.isoformat()},
                "$unset": {"permanently_chat_muted": ""}  # Clear perma flag if doing temp mute
            }
        )
        return {
            "success": True,
            "action": "muted",
            "username": actual_username,
            "mute_until": mute_until.isoformat(),
            "duration_seconds": data.duration_seconds,
            "modified": result.modified_count > 0
        }

@router.post("/admin/ban")
async def admin_ban_user(data: AdminBanRequest, request: Request):
    """Ban a user for a specified duration (Discord bot endpoint)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Case-insensitive username search
    user = await db.users.find_one(
        {"username": {"$regex": f"^{data.username}$", "$options": "i"}},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{data.username}' not found")
    
    # Use the actual username from DB for consistency
    actual_username = user["username"]
    now = datetime.now(timezone.utc)
    
    if data.duration_seconds <= 0:
        # Unban
        result = await db.users.update_one(
            {"username": actual_username},
            {"$unset": {"banned_until": ""}}
        )
        return {
            "success": True,
            "action": "unbanned",
            "username": actual_username,
            "modified": result.modified_count > 0
        }
    else:
        # Ban
        banned_until = now + timedelta(seconds=data.duration_seconds)
        result = await db.users.update_one(
            {"username": actual_username},
            {"$set": {"banned_until": banned_until.isoformat()}}
        )
        
        # Invalidate all user sessions
        await db.user_sessions.delete_many({"user_id": user["user_id"]})
        
        return {
            "success": True,
            "action": "banned",
            "username": actual_username,
            "banned_until": banned_until.isoformat(),
            "duration_seconds": data.duration_seconds,
            "sessions_invalidated": True,
            "modified": result.modified_count > 0
        }

@router.post("/admin/balance")
async def admin_modify_balance(data: AdminBalanceRequest, request: Request):
    """Set or add balance for a user (Discord bot endpoint)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Case-insensitive username search
    user = await db.users.find_one(
        {"username": {"$regex": f"^{data.username}$", "$options": "i"}},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{data.username}' not found")
    
    # Use the actual username from DB for consistency
    actual_username = user["username"]
    currency_field = "balance" if data.currency.lower() == "g" else "balance_a"
    current_balance = user.get(currency_field, 0)
    
    if data.action == "set":
        new_balance = data.amount
    elif data.action == "add":
        new_balance = current_balance + data.amount
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'set' or 'add'")
    
    # Prevent negative balance
    new_balance = max(0, new_balance)
    
    result = await db.users.update_one(
        {"username": actual_username},
        {"$set": {currency_field: round(new_balance, 2)}}
    )
    
    # Record account activity for admin balance changes (only for G currency)
    if data.currency.lower() == "g":
        change_amount = new_balance - current_balance
        if change_amount != 0:
            await record_account_activity(
                user_id=user["user_id"],
                event_type="admin",
                amount=change_amount,
                source=f"Admin: {data.action} {abs(data.amount)} G",
                details={"action": data.action, "admin_amount": data.amount, "previous": current_balance}
            )
            # Also write to bet_history so it appears in the History tab
            await db.bet_history.insert_one({
                "bet_id": f"admin_{uuid.uuid4().hex[:12]}",
                "user_id": user["user_id"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "game_type": "admin",
                "transaction_type": "admin",
                "amount": change_amount,
                "net_outcome": change_amount,
                "bet_amount": 0,
                "details": {
                    "action": data.action,
                    "admin_amount": data.amount,
                    "previous": current_balance,
                    "new_balance": new_balance
                }
            })
    
    return {
        "success": True,
        "username": actual_username,
        "currency": data.currency.upper(),
        "previous_balance": round(current_balance, 2),
        "new_balance": round(new_balance, 2),
        "action": data.action,
        "modified": result.modified_count > 0
    }

@router.post("/admin/eco-reset")
async def admin_eco_reset(data: AdminEcoResetRequest, request: Request):
    """Reset economy for ALL users: balance→10G, level→1, xp→0.
    Keeps: inventory, prestige items, game_pass_level/xp, bet_history, big_wins, account_activity_history.
    Records a balance-reset event in account_activity_history so the graph shows the drop.
    """
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    if data.confirm != "RESET_ECO":
        raise HTTPException(status_code=400, detail="confirm must be 'RESET_ECO'")

    # Fetch all users (only fields we need)
    users = await db.users.find({}, {"user_id": 1, "username": 1, "balance": 1}).to_list(10000)

    affected = 0
    now = datetime.now(timezone.utc)

    for user in users:
        user_id = user["user_id"]
        old_balance = user.get("balance", 0)
        change = round(10.0 - old_balance, 2)

        # Reset user document
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "balance": 10.0,
                "level": 1,
                "xp": 0,
                "total_wagered": 0.0,
            }}
        )

        # Record in account_activity_history so the graph shows the reset
        if change != 0:
            last_event = await db.account_activity_history.find_one(
                {"user_id": user_id},
                sort=[("event_number", -1)]
            )
            prev_cumulative = last_event["cumulative_profit"] if last_event else 0.0
            event_number = (last_event["event_number"] + 1) if last_event else 1
            new_cumulative = round(prev_cumulative + change, 2)

            await db.account_activity_history.insert_one({
                "event_id": f"act_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "event_number": event_number,
                "event_type": "admin",
                "amount": change,
                "cumulative_profit": new_cumulative,
                "source": "Economy Reset",
                "details": {"eco_reset": True, "old_balance": old_balance, "new_balance": 10.0},
                "timestamp": now.isoformat()
            })

        affected += 1

    logging.info(f"[ADMIN] Eco-Reset executed: {affected} users reset")

    return {
        "success": True,
        "users_affected": affected,
        "message": f"Economy reset complete. {affected} users set to balance=10G, level=1, xp=0."
    }


@router.post("/admin/reset-user")
async def admin_reset_user(data: AdminResetUserRequest, request: Request):
    """Wipe a user's stats/history/inventory back to new-user state. Account is kept."""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")

    user = await db.users.find_one(
        {"username": {"$regex": f"^{data.username}$", "$options": "i"}},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{data.username}' not found")

    user_id = user["user_id"]
    actual_username = user["username"]

    # 1. Reset user document fields — preserve identity/auth fields
    import random as _random
    default_patterns = ["default_lightblue", "default_pink", "default_red", "default_orange", "default_yellow"]
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "balance": 10.0,
            "balance_a": 0.0,
            "level": 1,
            "xp": 0,
            "total_wagered": 0.0,
            "vip_status": None,
            "name_color": None,
            "badge": None,
            "frame": None,
            "active_tag": None,
            "active_name_color": None,
            "active_jackpot_pattern": _random.choice(default_patterns),
            "last_wheel_spin": None,
            "galadium_pass_active": False,
            "game_pass_level": 1,
            "game_pass_xp": 0,
        }}
    )

    # 2. Wipe all per-user collections
    await db.bet_history.delete_many({"user_id": user_id})
    await db.account_activity_history.delete_many({"user_id": user_id})
    # big_wins intentionally NOT deleted — leaderboard entries persist through resets
    await db.user_inventory.delete_many({"user_id": user_id})
    await db.user_quests.delete_many({"user_id": user_id})
    await db.user_game_pass.delete_many({"user_id": user_id})
    await db.value_snapshots.delete_many({"user_id": user_id})
    await db.inventory_value_history.delete_many({"user_id": user_id})
    await db.user_prestige_items.delete_many({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.trades.delete_many({"$or": [{"initiator_id": user_id}, {"recipient_id": user_id}]})

    # 3. Wipe account candles (dynamic collections)
    for resolution in ["1h", "1d"]:
        await db[f"account_candles_{resolution}"].delete_many({"user_id": user_id})

    logging.info(f"[ADMIN] User '{actual_username}' ({user_id}) fully reset to new-user state")

    return {
        "success": True,
        "username": actual_username,
        "user_id": user_id,
        "message": "User wiped to new-user state. Account (login) preserved."
    }


@router.get("/admin/server-stats")
async def admin_server_stats(request: Request):
    """Economy-wide statistics for admin oversight."""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Aggregate all user economy data in one pass
    pipeline = [
        {"$group": {
            "_id": None,
            "total_users": {"$sum": 1},
            "total_g": {"$sum": "$balance"},
            "total_a": {"$sum": "$balance_a"},
            "avg_balance": {"$avg": "$balance"},
            "max_balance": {"$max": "$balance"},
            "total_wagered": {"$sum": "$total_wagered"},
            "active_users": {"$sum": {"$cond": [{"$gt": ["$balance", 10]}, 1, 0]}},
            "whales_100": {"$sum": {"$cond": [{"$gte": ["$balance", 100]}, 1, 0]}},
            "whales_1000": {"$sum": {"$cond": [{"$gte": ["$balance", 1000]}, 1, 0]}},
            "whales_10000": {"$sum": {"$cond": [{"$gte": ["$balance", 10000]}, 1, 0]}},
        }}
    ]
    eco_result = await db.users.aggregate(pipeline).to_list(1)
    eco = eco_result[0] if eco_result else {}
    total_g = round(eco.get("total_g", 0), 2)

    # Top 5 users by balance (for concentration calc)
    top_users = await db.users.find(
        {}, {"_id": 0, "username": 1, "balance": 1, "level": 1}
    ).sort("balance", -1).limit(5).to_list(5)
    top5_balance = sum(u.get("balance", 0) for u in top_users)

    # Activity stats
    bets_today = await db.bet_history.count_documents(
        {"timestamp": {"$gte": today_start.isoformat()}}
    )
    total_items = await db.user_inventory.count_documents({})

    return {
        "users": {
            "total": eco.get("total_users", 0),
            "active": eco.get("active_users", 0),
        },
        "economy": {
            "total_g": total_g,
            "total_a": round(eco.get("total_a", 0), 2),
            "avg_balance": round(eco.get("avg_balance", 0), 2),
            "max_balance": round(eco.get("max_balance", 0), 2),
            "total_wagered_all_time": round(eco.get("total_wagered", 0), 2),
            "whales": {
                "over_100": eco.get("whales_100", 0),
                "over_1000": eco.get("whales_1000", 0),
                "over_10000": eco.get("whales_10000", 0),
            },
            "top5_concentration": round((top5_balance / total_g * 100), 1) if total_g > 0 else 0,
        },
        "top_users": [
            {"username": u["username"], "balance": round(u.get("balance", 0), 2), "level": u.get("level", 1)}
            for u in top_users
        ],
        "activity": {
            "bets_today": bets_today,
            "total_items": total_items,
        }
    }


@router.post("/admin/reset-gamepass")
async def admin_reset_gamepass(data: AdminResetGamePassRequest, request: Request):
    """Reset GamePass level/XP and claimed chests for a single user."""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")

    user = await db.users.find_one(
        {"username": {"$regex": f"^{data.username}$", "$options": "i"}},
        {"_id": 0, "user_id": 1, "username": 1}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{data.username}' not found")

    user_id = user["user_id"]
    actual_username = user["username"]

    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"game_pass_level": 1, "game_pass_xp": 0}}
    )
    await db.user_game_pass.delete_many({"user_id": user_id})

    logging.info(f"[ADMIN] GamePass reset for user '{actual_username}' ({user_id})")

    return {
        "success": True,
        "username": actual_username,
        "message": "GamePass level/XP and claimed chests reset to default."
    }


@router.post("/admin/reset-gamepass-all")
async def admin_reset_gamepass_all(data: AdminResetGamePassAllRequest, request: Request):
    """Reset GamePass level/XP and claimed chests for ALL users."""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    if data.confirm != "RESET_GAMEPASS_ALL":
        raise HTTPException(status_code=400, detail="confirm must be 'RESET_GAMEPASS_ALL'")

    users = await db.users.find({}, {"user_id": 1}).to_list(10000)
    affected = len(users)

    await db.users.update_many(
        {},
        {"$set": {"game_pass_level": 1, "game_pass_xp": 0}}
    )
    await db.user_game_pass.delete_many({})

    logging.info(f"[ADMIN] GamePass reset executed globally: {affected} users affected")

    return {
        "success": True,
        "users_affected": affected,
        "message": f"GamePass reset complete. {affected} users set to level=1, xp=0, claimed chests cleared."
    }



@router.post("/admin/give-item")
async def admin_give_item(data: AdminGiveItemRequest, request: Request):
    """Give a custom or existing shop item directly to one user."""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")

    user = await db.users.find_one(
        {"username": {"$regex": f"^{data.username}$", "$options": "i"}},
        {"_id": 0, "user_id": 1, "username": 1}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{data.username}' not found")

    listing = None
    if data.shop_listing_id:
        listing = await db.shop_listings.find_one({"shop_listing_id": data.shop_listing_id})
        if not listing:
            raise HTTPException(status_code=404, detail=f"Shop listing '{data.shop_listing_id}' not found")
        name, rarity = listing["item_name"], listing["item_rarity"]
        description = listing.get("item_flavor_text", "")
        image = listing.get("item_image")
        value = listing.get("base_value", 0.0)
        untradeable_hours = 0
    else:
        if not data.item_name:
            raise HTTPException(status_code=400, detail="Provide either shop_listing_id or item_name")
        name, rarity, description = data.item_name, data.item_rarity, data.item_description
        image, value, untradeable_hours = data.item_image, data.base_value, data.untradeable_hours

    inv_item = await _build_inventory_item(
        user["user_id"], listing,
        name=name, rarity=rarity, description=description,
        image=image, value=value, untradeable_hours=untradeable_hours
    )
    await db.user_inventory.insert_one(inv_item)

    # Ensure item definition exists in items collection (for catalog visibility)
    await db.items.update_one(
        {"item_id": inv_item["item_id"]},
        {"$setOnInsert": {
            "item_id": inv_item["item_id"],
            "name": name,
            "flavor_text": description or "",
            "rarity": rarity.lower(),
            "base_value": value,
            "image_url": image,
            "category": "collectible",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_tradeable": False,
            "is_sellable": False,
        }},
        upsert=True
    )
    _catalog_cache.clear()
    _catalog_cache_time.clear()

    logging.info(f"[ADMIN] Gave item '{name}' to '{user['username']}'")
    return {
        "success": True,
        "username": user["username"],
        "item_name": name,
        "item_rarity": rarity,
        "inventory_id": inv_item["inventory_id"],
    }


@router.post("/admin/give-item-all")
async def admin_give_item_all(data: AdminGiveItemAllRequest, request: Request):
    """Give a custom or existing shop item to ALL users."""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    if data.confirm != "GIVE_ITEM_ALL":
        raise HTTPException(status_code=400, detail="confirm must be 'GIVE_ITEM_ALL'")

    listing = None
    if data.shop_listing_id:
        listing = await db.shop_listings.find_one({"shop_listing_id": data.shop_listing_id})
        if not listing:
            raise HTTPException(status_code=404, detail=f"Shop listing '{data.shop_listing_id}' not found")
        name, rarity = listing["item_name"], listing["item_rarity"]
        description = listing.get("item_flavor_text", "")
        image = listing.get("item_image")
        value = listing.get("base_value", 0.0)
        untradeable_hours = 0
    else:
        if not data.item_name:
            raise HTTPException(status_code=400, detail="Provide either shop_listing_id or item_name")
        name, rarity, description = data.item_name, data.item_rarity, data.item_description
        image, value, untradeable_hours = data.item_image, data.base_value, data.untradeable_hours

    users = await db.users.find({}, {"user_id": 1}).to_list(10000)

    inv_items = []
    for u in users:
        inv_items.append(await _build_inventory_item(
            u["user_id"], listing,
            name=name, rarity=rarity, description=description,
            image=image, value=value, untradeable_hours=untradeable_hours
        ))

    if inv_items:
        await db.user_inventory.insert_many(inv_items)

    # Ensure item definition exists in items collection (for catalog visibility)
    if inv_items:
        await db.items.update_one(
            {"item_id": inv_items[0]["item_id"]},
            {"$setOnInsert": {
                "item_id": inv_items[0]["item_id"],
                "name": name,
                "flavor_text": description or "",
                "rarity": rarity.lower(),
                "base_value": value,
                "image_url": image,
                "category": "collectible",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_tradeable": False,
                "is_sellable": False,
            }},
            upsert=True
        )
    _catalog_cache.clear()
    _catalog_cache_time.clear()

    logging.info(f"[ADMIN] Gave item '{name}' to all {len(users)} users")
    return {
        "success": True,
        "item_name": name,
        "item_rarity": rarity,
        "users_affected": len(users),
    }


@router.post("/admin/give-chests")
async def admin_give_chests(data: AdminGiveChestsRequest, request: Request):
    """Give chests to a user (Discord bot endpoint)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Validate amount
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if data.amount > 100000:
        raise HTTPException(status_code=400, detail="Maximum 100,000 chests per request")
    
    # Case-insensitive username search
    user = await db.users.find_one(
        {"username": {"$regex": f"^{data.username}$", "$options": "i"}},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{data.username}' not found")
    
    # Determine chest type
    chest_type = data.chest_type.lower()
    if chest_type in ["gamepass", "normal", "standard"]:
        item_id = "gamepass_chest"
        item_name = "GamePass Chest"
        item_rarity = "uncommon"
        rarity_color = "#22c55e"
    elif chest_type in ["galadium", "premium", "bonus"]:
        item_id = "galadium_chest"
        item_name = "Galadium Chest"
        item_rarity = "rare"
        rarity_color = "#a855f7"
    else:
        raise HTTPException(status_code=400, detail="Invalid chest type. Use 'gamepass' or 'galadium'")
    
    # Create chests
    now = datetime.now(timezone.utc)
    chests = []
    for _ in range(data.amount):
        chests.append({
            "inventory_id": f"inv_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "item_id": item_id,
            "item_name": item_name,
            "item_rarity": item_rarity,
            "rarity_display": item_rarity.capitalize(),
            "rarity_color": rarity_color,
            "item_image": None,
            "item_flavor_text": f"A chest earned from the {item_name.split()[0]}. Open it to reveal your reward!",
            "purchase_price": 0,
            "sell_value": 0,
            "is_tradeable": False,
            "is_sellable": False,
            "acquired_from": "admin_grant",
            "acquired_at": now,
            "category": "chest"
        })
    
    # Insert all chests into user_inventory (correct collection)
    result = await db.user_inventory.insert_many(chests)
    
    # Count total chests now
    total_chests = await db.user_inventory.count_documents({
        "user_id": user["user_id"],
        "item_id": item_id
    })
    
    return {
        "success": True,
        "username": user["username"],
        "chest_type": item_name,
        "amount_given": len(result.inserted_ids),
        "total_chests": total_chests
    }

@router.get("/admin/userinfo/{username}")
async def admin_get_userinfo(username: str, request: Request):
    """Get detailed user information (Discord bot endpoint)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Case-insensitive username search
    user = await db.users.find_one(
        {"username": {"$regex": f"^{username}$", "$options": "i"}},
        {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    
    # Get user stats
    stats = await get_user_stats_from_history(user["user_id"])
    
    # Check ban/mute status
    now = datetime.now(timezone.utc)
    
    mute_until = user.get("mute_until")
    is_muted = False
    mute_remaining = 0
    if mute_until:
        if isinstance(mute_until, str):
            mute_until = datetime.fromisoformat(mute_until)
        if mute_until.tzinfo is None:
            mute_until = mute_until.replace(tzinfo=timezone.utc)
        if mute_until > now:
            is_muted = True
            mute_remaining = int((mute_until - now).total_seconds())
    
    banned_until = user.get("banned_until")
    is_banned = False
    ban_remaining = 0
    if banned_until:
        if isinstance(banned_until, str):
            banned_until = datetime.fromisoformat(banned_until)
        if banned_until.tzinfo is None:
            banned_until = banned_until.replace(tzinfo=timezone.utc)
        if banned_until > now:
            is_banned = True
            ban_remaining = int((banned_until - now).total_seconds())
    
    return {
        "user_id": user["user_id"],
        "username": user["username"],
        "email": user.get("email", "N/A"),
        "balance_g": round(user.get("balance", 0), 2),
        "balance_a": round(user.get("balance_a", 0), 2),
        "level": user.get("level", 1),
        "xp": user.get("xp", 0),
        "total_wagered": round(stats.get("total_wagered", 0), 2),
        "total_wins": stats.get("total_wins", 0),
        "total_losses": stats.get("total_losses", 0),
        "net_profit": round(stats.get("net_profit", 0), 2),
        "is_muted": is_muted,
        "mute_remaining_seconds": mute_remaining,
        "is_banned": is_banned,
        "ban_remaining_seconds": ban_remaining,
        "created_at": user.get("created_at")
    }

@router.get("/admin/moderation-logs/{username}")
async def admin_get_moderation_logs(username: str, request: Request, limit: int = 50):
    """Get moderation logs for a user (Discord bot endpoint)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Case-insensitive username search
    user = await db.users.find_one(
        {"username": {"$regex": f"^{username}$", "$options": "i"}},
        {"_id": 0, "user_id": 1, "username": 1}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    
    logs = await db.moderation_logs.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {
        "username": user["username"],
        "total_logs": len(logs),
        "logs": logs
    }

@router.post("/admin/reset-moderation/{username}")
async def admin_reset_moderation_counters(username: str, request: Request):
    """Reset moderation counters for a user (Discord bot endpoint)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Case-insensitive username search
    user = await db.users.find_one(
        {"username": {"$regex": f"^{username}$", "$options": "i"}},
        {"_id": 0, "user_id": 1, "username": 1}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    
    # Reset all moderation counters and remove permanent mute
    result = await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {
                "spam_count": 0,
                "profanity_count": 0,
                "advertising_count": 0,
                "permanently_chat_muted": False
            },
            "$unset": {"mute_until": ""}
        }
    )
    
    # Log the reset action
    log_entry = {
        "log_id": f"mod_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "username": user["username"],
        "action": "admin_reset",
        "violation_type": "admin_action",
        "reason": "Moderation counters reset by admin",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.moderation_logs.insert_one(log_entry)
    
    return {
        "success": True,
        "username": user["username"],
        "action": "moderation_reset",
        "message": "All moderation counters reset and mutes cleared"
    }

@router.get("/admin/moderation-stats/{username}")
async def admin_get_moderation_stats(username: str, request: Request):
    """Get moderation statistics for a user (Discord bot endpoint)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Case-insensitive username search
    user = await db.users.find_one(
        {"username": {"$regex": f"^{username}$", "$options": "i"}},
        {"_id": 0, "user_id": 1, "username": 1, "spam_count": 1, "profanity_count": 1, 
         "advertising_count": 1, "permanently_chat_muted": 1, "mute_until": 1}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    
    # Check mute status
    now = datetime.now(timezone.utc)
    mute_until = user.get("mute_until")
    is_muted = False
    mute_remaining = 0
    
    if mute_until:
        if isinstance(mute_until, str):
            mute_until = datetime.fromisoformat(mute_until)
        if mute_until.tzinfo is None:
            mute_until = mute_until.replace(tzinfo=timezone.utc)
        if mute_until > now:
            is_muted = True
            mute_remaining = int((mute_until - now).total_seconds())
    
    return {
        "username": user["username"],
        "spam_count": user.get("spam_count", 0),
        "profanity_count": user.get("profanity_count", 0),
        "advertising_count": user.get("advertising_count", 0),
        "permanently_chat_muted": user.get("permanently_chat_muted", False),
        "is_currently_muted": is_muted,
        "mute_remaining_seconds": mute_remaining
    }


# ============== SHOP ADMIN ENDPOINTS ==============

@router.get("/admin/shop/list")
async def admin_list_shop_items(request: Request):
    """List all shop items (active and inactive)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    listings = await db.shop_listings.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    now_naive = datetime.utcnow()
    for listing in listings:
        # Calculate time remaining
        if listing.get("available_until"):
            until = listing["available_until"]
            if isinstance(until, str):
                try:
                    until = datetime.fromisoformat(until.replace("Z", "+00:00"))
                    if until.tzinfo:
                        until = until.replace(tzinfo=None)
                except:
                    until = None
            elif isinstance(until, datetime) and until.tzinfo:
                until = until.replace(tzinfo=None)
            
            if until:
                remaining = until - now_naive
                listing["hours_remaining"] = max(0, int(remaining.total_seconds() / 3600))
                listing["is_expired"] = remaining.total_seconds() <= 0
            else:
                listing["hours_remaining"] = None
                listing["is_expired"] = False
        else:
            listing["hours_remaining"] = None
            listing["is_expired"] = False
        
        # Convert datetime objects to ISO strings for JSON serialization
        for key in ["available_from", "available_until", "untradeable_until", "created_at"]:
            if key in listing and isinstance(listing[key], datetime):
                listing[key] = listing[key].isoformat()
    
    return {"items": listings, "total": len(listings)}


@router.post("/admin/shop/add")
async def admin_add_shop_item(data: AdminShopAddRequest, request: Request):
    """Add a new item to the shop"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Validate rarity
    valid_rarities = ["common", "uncommon", "rare", "epic", "legendary"]
    if data.item_rarity.lower() not in valid_rarities:
        raise HTTPException(status_code=400, detail=f"Invalid rarity. Must be one of: {', '.join(valid_rarities)}")
    
    now = datetime.now(timezone.utc)
    shop_listing_id = f"shop_{uuid.uuid4().hex[:12]}"
    item_id = f"item_{uuid.uuid4().hex[:12]}"
    
    # Calculate availability window
    available_until = now + timedelta(hours=data.available_hours)
    untradeable_until = now + timedelta(hours=data.untradeable_hours)
    
    # Create the item definition
    item_def = {
        "item_id": item_id,
        "item_name": data.item_name,
        "item_rarity": data.item_rarity.lower(),
        "item_flavor_text": data.item_description,
        "item_image": data.item_image,
        "base_value": data.base_value,
        "is_tradeable": True,  # Will be checked against untradeable_until
        "is_shop_item": True,
        "created_at": now.isoformat()
    }
    await db.items.insert_one(item_def)
    
    # Create the shop listing
    shop_listing = {
        "shop_listing_id": shop_listing_id,
        "item_id": item_id,
        "item_name": data.item_name,
        "item_rarity": data.item_rarity.lower(),
        "item_flavor_text": data.item_description,
        "item_image": data.item_image,
        "base_value": data.base_value,
        "price": data.price,
        "available_from": now.isoformat(),
        "available_until": available_until.isoformat(),
        "untradeable_until": untradeable_until.isoformat(),
        "stock_limit": data.stock_limit,
        "stock_sold": 0,
        "is_active": True,
        "created_at": now.isoformat()
    }
    await db.shop_listings.insert_one(shop_listing)
    
    return {
        "success": True,
        "shop_listing_id": shop_listing_id,
        "item_id": item_id,
        "item_name": data.item_name,
        "item_rarity": data.item_rarity.lower(),
        "price": data.price,
        "available_until": available_until.isoformat(),
        "untradeable_until": untradeable_until.isoformat(),
        "hours_available": data.available_hours,
        "hours_untradeable": data.untradeable_hours
    }


@router.post("/admin/shop/edit")
async def admin_edit_shop_item(data: AdminShopEditRequest, request: Request):
    """Edit an existing shop item"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Find the listing
    listing = await db.shop_listings.find_one({"shop_listing_id": data.shop_listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail=f"Shop listing '{data.shop_listing_id}' not found")
    
    now = datetime.now(timezone.utc)
    updates = {}
    item_updates = {}
    
    # Build update dict with only provided fields
    if data.item_name is not None:
        updates["item_name"] = data.item_name
        item_updates["item_name"] = data.item_name
    
    if data.item_description is not None:
        updates["item_flavor_text"] = data.item_description
        item_updates["item_flavor_text"] = data.item_description
    
    if data.item_image is not None:
        updates["item_image"] = data.item_image
        item_updates["item_image"] = data.item_image
    
    if data.price is not None:
        updates["price"] = data.price
    
    if data.base_value is not None:
        updates["base_value"] = data.base_value
        item_updates["base_value"] = data.base_value
    
    if data.available_hours is not None:
        # Extend/set availability from now
        updates["available_until"] = (now + timedelta(hours=data.available_hours)).isoformat()
    
    if data.untradeable_hours is not None:
        updates["untradeable_until"] = (now + timedelta(hours=data.untradeable_hours)).isoformat()
    
    if data.stock_limit is not None:
        updates["stock_limit"] = data.stock_limit if data.stock_limit > 0 else None
    
    if data.is_active is not None:
        updates["is_active"] = data.is_active
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    updates["updated_at"] = now.isoformat()
    
    # Update shop listing
    await db.shop_listings.update_one(
        {"shop_listing_id": data.shop_listing_id},
        {"$set": updates}
    )
    
    # Also update the item definition if relevant fields changed
    if item_updates:
        await db.items.update_one(
            {"item_id": listing["item_id"]},
            {"$set": item_updates}
        )
    
    return {
        "success": True,
        "shop_listing_id": data.shop_listing_id,
        "updated_fields": list(updates.keys())
    }


@router.delete("/admin/shop/remove")
async def admin_remove_shop_item(data: AdminShopRemoveRequest, request: Request):
    """Remove an item from the shop (deactivates it, doesn't delete)"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    # Find the listing
    listing = await db.shop_listings.find_one({"shop_listing_id": data.shop_listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail=f"Shop listing '{data.shop_listing_id}' not found")
    
    now = datetime.now(timezone.utc)
    
    # Deactivate the listing (set available_until to now)
    await db.shop_listings.update_one(
        {"shop_listing_id": data.shop_listing_id},
        {"$set": {
            "is_active": False,
            "available_until": now.isoformat(),
            "removed_at": now.isoformat()
        }}
    )
    
    return {
        "success": True,
        "shop_listing_id": data.shop_listing_id,
        "item_name": listing.get("item_name"),
        "action": "removed"
    }


@router.post("/admin/setvalue")
async def admin_set_item_value(data: AdminSetValueRequest, request: Request):
    """Admin: Set manual value for an item"""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    item = await db.items.find_one({"item_id": data.item_id})
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{data.item_id}' not found")
    
    old_value = item.get("value", 0)
    await db.items.update_one(
        {"item_id": data.item_id},
        {"$set": {"value": data.value}}
    )
    
    # Track value history for charts
    await db.item_value_history.insert_one({
        "item_id": data.item_id,
        "value": data.value,
        "old_value": old_value,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "success": True,
        "item_id": data.item_id,
        "item_name": item.get("name", "Unknown"),
        "old_value": old_value,
        "new_value": data.value
    }


@router.post("/admin/setdemand")
async def admin_set_item_demand(data: AdminSetDemandRequest, request: Request):
    """Admin: Set manual demand label for an item. Manual demand overrides auto-calculation."""
    if not verify_admin_key(request):
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    valid_labels = ["none", "low", "medium", "high", "extreme"]
    if data.demand not in valid_labels:
        raise HTTPException(status_code=400, detail=f"Invalid demand label. Must be one of: {', '.join(valid_labels)}")
    
    item = await db.items.find_one({"item_id": data.item_id})
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{data.item_id}' not found")
    
    old_demand = item.get("manual_demand")
    await db.items.update_one(
        {"item_id": data.item_id},
        {"$set": {"manual_demand": data.demand}}
    )
    
    return {
        "success": True,
        "item_id": data.item_id,
        "item_name": item.get("name", "Unknown"),
        "old_demand": old_demand,
        "new_demand": data.demand
    }


# ============== PLAYER DIRECTORY ==============

