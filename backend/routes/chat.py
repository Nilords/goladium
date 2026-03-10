"""Route module: chat."""
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

@router.post("/chat/send", response_model=ChatMessage)
async def send_chat_message(message_data: ChatMessageCreate, request: Request):
    user = await get_current_user(request)
    user_id = user["user_id"]
    username = user["username"]
    
    # ========== AUTOMATED MODERATION SYSTEM ==========
    # Check for permanent chat mute first
    if user.get("permanently_chat_muted"):
        raise HTTPException(
            status_code=403,
            detail="You have been permanently muted in chat. If you believe this was a mistake, please contact us on Discord."
        )
    
    # Check existing mute (from manual mute or previous auto-mute)
    mute_until = user.get("mute_until")
    if mute_until is not None:
        if isinstance(mute_until, str):
            mute_until = datetime.fromisoformat(mute_until)
        if mute_until.tzinfo is None:
            mute_until = mute_until.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        if mute_until > now:
            remaining_seconds = max(0, int((mute_until - now).total_seconds()))
            raise HTTPException(
                status_code=403,
                detail=f"You are muted for {remaining_seconds} more seconds."
            )
    
    # Run automated moderation checks
    moderation_result = await moderate_message(user_id, username, message_data.message)
    
    if not moderation_result.allowed:
        raise HTTPException(
            status_code=403,
            detail=moderation_result.error_message
        )
    
    # ========== MESSAGE APPROVED - PROCEED ==========
    now = datetime.now(timezone.utc)
    
    # Get active prestige cosmetics for display
    active_tag_value = None
    active_name_color_value = None
    
    if user.get("active_tag"):
        tag_template = PRESTIGE_COSMETICS.get(user["active_tag"], {})
        active_tag_value = tag_template.get("asset_value")
    
    if user.get("active_name_color"):
        color_template = PRESTIGE_COSMETICS.get(user["active_name_color"], {})
        active_name_color_value = color_template.get("asset_value")
    
    message_doc = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "username": user["username"],
        "message": message_data.message,
        "timestamp": now.isoformat(),
        "name_color": user.get("name_color"),
        "badge": user.get("badge"),
        "active_tag": active_tag_value,
        "active_name_color": active_name_color_value
    }
    
    await db.chat_messages.insert_one(message_doc)
    
    return ChatMessage(
        message_id=message_doc["message_id"],
        user_id=user["user_id"],
        username=user["username"],
        message=message_data.message,
        timestamp=now,
        name_color=user.get("name_color"),
        badge=user.get("badge"),
        active_tag=active_tag_value,
        active_name_color=active_name_color_value
    )

@router.get("/chat/messages", response_model=List[ChatMessage])
async def get_chat_messages(limit: int = 50):
    messages = await db.chat_messages.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    for msg in messages:
        if isinstance(msg["timestamp"], str):
            msg["timestamp"] = datetime.fromisoformat(msg["timestamp"])
    
    return messages[::-1]

# ============== COSMETICS ENDPOINTS ==============

@router.get("/cosmetics/available")
async def get_available_cosmetics():
    return {
        "name_colors": [
            {"id": "gold", "name": "Gold", "color": "#FFD700", "vip_required": True},
            {"id": "cyan", "name": "Neon Cyan", "color": "#00F0FF", "vip_required": True},
            {"id": "purple", "name": "Royal Purple", "color": "#7000FF", "vip_required": True},
            {"id": "pink", "name": "Hot Pink", "color": "#FF0099", "vip_required": False}
        ],
        "badges": [
            {"id": "vip", "name": "VIP", "icon": "crown", "vip_required": True},
            {"id": "supporter", "name": "Supporter", "icon": "heart", "vip_required": True},
            {"id": "veteran", "name": "Veteran", "icon": "star", "level_required": 10},
            {"id": "whale", "name": "High Roller", "icon": "diamond", "wins_required": 100}
        ],
        "frames": [
            {"id": "gold", "name": "Golden Frame", "vip_required": True},
            {"id": "neon", "name": "Neon Glow", "vip_required": True},
            {"id": "diamond", "name": "Diamond Edge", "vip_required": True}
        ]
    }

# ============== MISC ENDPOINTS ==============

@router.get("/translations")
async def get_translations(lang: str = "en"):
    translations = {
        "en": {
            "app_name": "Goladium",
            "currency_name": "Goladium",
            "login": "Login",
            "register": "Register",
            "logout": "Logout",
            "spin": "Spin",
            "bet": "Bet",
            "balance": "Balance",
            "history": "History",
            "profile": "Profile",
            "settings": "Settings",
            "leaderboard": "Leaderboard",
            "chat": "Chat",
            "lucky_wheel": "Lucky Wheel",
            "slot_machine": "Slot Machine",
            "slots": "Slots",
            "jackpot": "Jackpot",
            "win": "Win",
            "loss": "Loss",
            "level": "Level",
            "xp": "XP",
            "total_spins": "Total Spins",
            "total_wins": "Total Wins",
            "total_losses": "Total Losses",
            "net_profit": "Net Profit",
            "total_wagered": "Total Wagered",
            "insufficient_balance": "Insufficient balance",
            "cooldown_active": "Cooldown active",
            "next_spin_in": "Next spin in",
            "payout_table": "Payout Table",
            "rtp": "Return to Player",
            "symbol": "Symbol",
            "multiplier": "Multiplier",
            "probability": "Probability",
            "spin_free": "Spin Free",
            "join_jackpot": "Join Jackpot",
            "waiting_for_players": "Waiting for players...",
            "jackpot_starting": "Jackpot starting soon!"
        },
        "de": {
            "app_name": "Goladium",
            "currency_name": "Goladium",
            "login": "Anmelden",
            "register": "Registrieren",
            "logout": "Abmelden",
            "spin": "Drehen",
            "bet": "Einsatz",
            "balance": "Guthaben",
            "history": "Verlauf",
            "profile": "Profil",
            "settings": "Einstellungen",
            "leaderboard": "Bestenliste",
            "chat": "Chat",
            "lucky_wheel": "Glücksrad",
            "slot_machine": "Spielautomat",
            "slots": "Spielautomaten",
            "jackpot": "Jackpot",
            "win": "Gewinn",
            "loss": "Verlust",
            "level": "Level",
            "xp": "XP",
            "total_spins": "Gesamtdrehungen",
            "total_wins": "Gesamtgewinne",
            "total_losses": "Gesamtverluste",
            "net_profit": "Nettogewinn",
            "total_wagered": "Gesamt gewettet",
            "insufficient_balance": "Nicht genügend Guthaben",
            "cooldown_active": "Abklingzeit aktiv",
            "next_spin_in": "Nächster Spin in",
            "payout_table": "Auszahlungstabelle",
            "rtp": "Auszahlungsquote",
            "symbol": "Symbol",
            "multiplier": "Multiplikator",
            "probability": "Wahrscheinlichkeit",
            "spin_free": "Kostenlos drehen",
            "join_jackpot": "Jackpot beitreten",
            "waiting_for_players": "Warte auf Spieler...",
            "jackpot_starting": "Jackpot startet bald!"
        }
    }
    
    return translations.get(lang, translations["en"])

# ============== TRADING SYSTEM ENDPOINTS ==============

@router.get("/users/search/{username}")
async def search_user_by_username(username: str, request: Request):
    """Search for a user by exact username (for starting trades)"""
    current_user = await get_current_user(request)
    
    # Can't trade with yourself
    if username.lower() == current_user["username"].lower():
        raise HTTPException(status_code=400, detail="You cannot trade with yourself")
    
    user = await db.users.find_one(
        {"username": {"$regex": f"^{username}$", "$options": "i"}},
        {"_id": 0, "password_hash": 0}
    )
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "user_id": user["user_id"],
        "username": user["username"],
        "avatar": user.get("avatar"),
        "level": user.get("level", 1),
        "active_tag": user.get("active_tag"),
        "active_name_color": user.get("active_name_color")
    }

