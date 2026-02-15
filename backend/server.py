from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import random
import hashlib
import secrets
import httpx
from passlib.context import CryptContext
import jwt
import asyncio

# ================= HOTFIX =================
# Disable broken quest definitions temporarily
QUEST_DEFINITIONS = []
# =========================================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 168  # 7 days

# Discord Webhook (configurable placeholder)
DISCORD_WEBHOOK_URL = os.environ.get('DISCORD_WEBHOOK_URL', '')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Create the main app
app = FastAPI(
    title="Goladium API",
    description="Demo Casino Simulation Platform",
    version="0.1.0",
    root_path="/api"
)

# Create router with /api prefix
api_router = APIRouter()

# ============== CHAT MODERATION SYSTEM ==============

import re

# Profanity blacklist (German + English common offensive words)
PROFANITY_BLACKLIST = [
    # German
    "hurensohn", "wichser", "fotze", "schlampe", "arschloch", "missgeburt",
    "spast", "behindert", "schwuchtel", "kanake", "nigger", "neger",
    # English
    "fuck", "shit", "bitch", "cunt", "faggot", "retard", "nigga",
    "whore", "slut", "asshole", "dickhead", "motherfucker"
]

# URL/Advertising patterns
ADVERTISING_PATTERNS = [
    r'https?://',                    # http:// or https://
    r'www\.',                        # www.
    r'discord\.gg',                  # Discord invites
    r'discord\.com/invite',          # Discord invites alternative
    r't\.me/',                       # Telegram links
    r'bit\.ly',                      # URL shorteners
    r'tinyurl',
    r'\.[a-z]{2,4}/',               # Domain patterns like .com/ .gg/ .io/
    r'\.com\b',                      # .com
    r'\.gg\b',                       # .gg
    r'\.io\b',                       # .io
    r'\.net\b',                      # .net
    r'\.org\b',                      # .org
    r'\.xyz\b',                      # .xyz
    r'\.bet\b',                      # .bet
    r'\.casino\b',                   # .casino
    r'ref[=\?]',                     # Referral parameters
    r'referral',                     # Referral links
    r'promo\s*code',                 # Promo codes
]

# Spam detection settings
SPAM_TIME_WINDOW_SECONDS = 15  # Time window to check for repeated messages
SPAM_SIMILARITY_THRESHOLD = 0.85  # 85% similarity = considered same message

# Mute durations in seconds
MUTE_2_MIN = 120
MUTE_5_MIN = 300
MUTE_10_MIN = 600

# Escalation configurations
SPAM_ESCALATION = [
    MUTE_2_MIN,   # 1st offense: 2 min
    MUTE_2_MIN,   # 2nd offense: 2 min
    MUTE_10_MIN,  # 3rd offense: 10 min
    -1            # 4th offense: permanent
]

PROFANITY_ESCALATION = [
    0,            # 1st offense: warning only
    MUTE_2_MIN,   # 2nd offense: 2 min
    MUTE_5_MIN,   # 3rd offense: 5 min
    MUTE_10_MIN,  # 4th offense: 10 min
    -1            # 5th offense: permanent
]

ADVERTISING_ESCALATION = [
    MUTE_5_MIN,   # 1st offense: 5 min
    MUTE_10_MIN,  # 2nd offense: 10 min
    -1            # 3rd offense: permanent
]


def normalize_message(message: str) -> str:
    """Normalize message for comparison (lowercase, trimmed, collapsed whitespace)"""
    return ' '.join(message.lower().strip().split())


def calculate_similarity(msg1: str, msg2: str) -> float:
    """Calculate similarity between two messages (0.0 to 1.0)"""
    m1 = normalize_message(msg1)
    m2 = normalize_message(msg2)
    
    if m1 == m2:
        return 1.0
    
    if not m1 or not m2:
        return 0.0
    
    # Simple character-based similarity
    longer = m1 if len(m1) >= len(m2) else m2
    shorter = m2 if len(m1) >= len(m2) else m1
    
    if len(longer) == 0:
        return 1.0
    
    # Count matching characters in sequence
    matches = 0
    for i, char in enumerate(shorter):
        if i < len(longer) and char == longer[i]:
            matches += 1
    
    return matches / len(longer)


def contains_profanity(message: str) -> bool:
    """Check if message contains blacklisted words"""
    normalized = normalize_message(message)
    for word in PROFANITY_BLACKLIST:
        if word.lower() in normalized:
            return True
    return False


def contains_advertising(message: str) -> bool:
    """Check if message contains advertising/URLs"""
    normalized = message.lower()
    for pattern in ADVERTISING_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            return True
    return False


async def get_recent_messages(user_id: str, seconds: int = SPAM_TIME_WINDOW_SECONDS) -> list:
    """Get user's recent messages within time window"""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=seconds)
    cutoff_str = cutoff.isoformat()
    
    messages = await db.chat_messages.find(
        {"user_id": user_id, "timestamp": {"$gte": cutoff_str}},
        {"_id": 0, "message": 1, "timestamp": 1}
    ).sort("timestamp", -1).to_list(10)
    
    return messages


async def check_spam(user_id: str, new_message: str) -> bool:
    """Check if the new message is spam (repeated message)"""
    recent_messages = await get_recent_messages(user_id)
    
    for msg in recent_messages:
        similarity = calculate_similarity(new_message, msg.get("message", ""))
        if similarity >= SPAM_SIMILARITY_THRESHOLD:
            return True
    
    return False


async def get_moderation_counters(user_id: str) -> dict:
    """Get user's moderation offense counters"""
    user = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "spam_count": 1, "profanity_count": 1, "advertising_count": 1, 
         "permanently_chat_muted": 1, "mute_until": 1}
    )
    return {
        "spam_count": user.get("spam_count", 0) if user else 0,
        "profanity_count": user.get("profanity_count", 0) if user else 0,
        "advertising_count": user.get("advertising_count", 0) if user else 0,
        "permanently_chat_muted": user.get("permanently_chat_muted", False) if user else False,
        "mute_until": user.get("mute_until") if user else None
    }


async def apply_chat_mute(user_id: str, username: str, duration_seconds: int, reason: str, violation_type: str):
    """Apply a chat mute to a user and log it"""
    now = datetime.now(timezone.utc)
    
    if duration_seconds == -1:
        # Permanent mute
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"permanently_chat_muted": True, "mute_until": None}}
        )
        mute_until = None
        is_permanent = True
    else:
        # Temporary mute
        mute_until = now + timedelta(seconds=duration_seconds)
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"mute_until": mute_until.isoformat()}}
        )
        is_permanent = False
    
    # Log moderation action
    log_entry = {
        "log_id": f"mod_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "username": username,
        "action": "permanent_chat_mute" if is_permanent else "chat_mute",
        "violation_type": violation_type,
        "reason": reason,
        "duration_seconds": duration_seconds if duration_seconds != -1 else None,
        "mute_until": mute_until.isoformat() if mute_until else None,
        "is_permanent": is_permanent,
        "timestamp": now.isoformat()
    }
    await db.moderation_logs.insert_one(log_entry)
    
    return mute_until, is_permanent


async def increment_offense_counter(user_id: str, counter_field: str) -> int:
    """Increment an offense counter and return the new value"""
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$inc": {counter_field: 1}},
        return_document=True,
        projection={"_id": 0, counter_field: 1}
    )
    return result.get(counter_field, 1) if result else 1


class ModerationResult:
    """Result of message moderation check"""
    def __init__(self, allowed: bool, error_message: str = None, muted: bool = False):
        self.allowed = allowed
        self.error_message = error_message
        self.muted = muted


async def moderate_message(user_id: str, username: str, message: str) -> ModerationResult:
    """
    Main moderation function - checks message for violations.
    Returns ModerationResult indicating if message is allowed.
    """
    
    # Check if user is permanently muted
    counters = await get_moderation_counters(user_id)
    if counters["permanently_chat_muted"]:
        return ModerationResult(
            allowed=False,
            error_message="You have been permanently muted in chat. If you believe this was a mistake, please contact us on Discord."
        )
    
    # Check existing mute
    mute_until = counters.get("mute_until")
    if mute_until:
        if isinstance(mute_until, str):
            mute_until = datetime.fromisoformat(mute_until)
        if mute_until.tzinfo is None:
            mute_until = mute_until.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        if mute_until > now:
            remaining = int((mute_until - now).total_seconds())
            return ModerationResult(
                allowed=False,
                error_message=f"You are muted for {remaining} more seconds."
            )
    
    # 1. CHECK FOR ADVERTISING (highest priority - strictest penalty)
    if contains_advertising(message):
        new_count = await increment_offense_counter(user_id, "advertising_count")
        offense_index = min(new_count - 1, len(ADVERTISING_ESCALATION) - 1)
        duration = ADVERTISING_ESCALATION[offense_index]
        
        if duration == -1:
            await apply_chat_mute(user_id, username, -1, "Repeated advertising", "advertising")
            return ModerationResult(
                allowed=False,
                error_message="You have been permanently muted in chat due to unauthorized advertising. If you believe this was a mistake, please contact us on Discord.",
                muted=True
            )
        else:
            mute_until, _ = await apply_chat_mute(user_id, username, duration, "Advertising detected", "advertising")
            minutes = duration // 60
            return ModerationResult(
                allowed=False,
                error_message=f"You have been muted for {minutes} minutes due to unauthorized advertising.",
                muted=True
            )
    
    # 2. CHECK FOR PROFANITY
    if contains_profanity(message):
        new_count = await increment_offense_counter(user_id, "profanity_count")
        offense_index = min(new_count - 1, len(PROFANITY_ESCALATION) - 1)
        duration = PROFANITY_ESCALATION[offense_index]
        
        if duration == -1:
            await apply_chat_mute(user_id, username, -1, "Repeated profanity", "profanity")
            return ModerationResult(
                allowed=False,
                error_message="You have been permanently muted in chat due to repeated offensive language. If you believe this was a mistake, please contact us on Discord.",
                muted=True
            )
        elif duration == 0:
            # Warning only (first offense)
            # Log the warning
            log_entry = {
                "log_id": f"mod_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "username": username,
                "action": "warning",
                "violation_type": "profanity",
                "reason": "First profanity offense - warning issued",
                "message_content": message[:100],  # Store first 100 chars
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            await db.moderation_logs.insert_one(log_entry)
            return ModerationResult(
                allowed=False,
                error_message="That was not very nice. Please keep the chat respectful."
            )
        else:
            await apply_chat_mute(user_id, username, duration, "Profanity detected", "profanity")
            minutes = duration // 60
            return ModerationResult(
                allowed=False,
                error_message=f"You have been muted for {minutes} minutes due to offensive language. Please keep the chat respectful.",
                muted=True
            )
    
    # 3. CHECK FOR SPAM
    is_spam = await check_spam(user_id, message)
    if is_spam:
        new_count = await increment_offense_counter(user_id, "spam_count")
        offense_index = min(new_count - 1, len(SPAM_ESCALATION) - 1)
        duration = SPAM_ESCALATION[offense_index]
        
        if duration == -1:
            await apply_chat_mute(user_id, username, -1, "Repeated spam", "spam")
            return ModerationResult(
                allowed=False,
                error_message="You have been permanently muted in chat due to repeated spam. If you believe this was a mistake, please contact us on Discord.",
                muted=True
            )
        else:
            await apply_chat_mute(user_id, username, duration, "Spam detected", "spam")
            minutes = duration // 60
            return ModerationResult(
                allowed=False,
                error_message=f"You have been muted for {minutes} minutes due to spam. Please stop spamming.",
                muted=True
            )
    
    # Message passed all checks
    return ModerationResult(allowed=True)


# ============== XP SYSTEM CONFIG ==============
# 1 XP per 0.01 G bet (100 XP per 1 G wagered)
XP_PER_G = 100

# Level XP requirements (progressive scaling)
# Level 1->2: 500 XP, Level 2->3: 800 XP, etc. scaling up
LEVEL_XP_REQUIREMENTS = [
    0,      # Level 1 (starting level)
    500,    # Level 2
    800,    # Level 3
    1200,   # Level 4
    1700,   # Level 5
    2300,   # Level 6
    3000,   # Level 7
    3800,   # Level 8
    4700,   # Level 9
    5700,   # Level 10
    6800,   # Level 11
    8000,   # Level 12
    9300,   # Level 13
    10700,  # Level 14
    12200,  # Level 15
    13800,  # Level 16
    15500,  # Level 17
    17300,  # Level 18
    19200,  # Level 19
    21200,  # Level 20
]

# ============== GAME PASS CONFIG ==============
# Game Pass is ~3-5x easier than normal levels (20-30% effort per level)
# If normal level = 500 XP, Game Pass level = 100-150 XP
GAME_PASS_XP_PER_LEVEL = 150  # XP needed per Game Pass level
GAME_PASS_MAX_LEVEL = 50  # Max level for the pass (resets monthly)

# ============== QUEST DEFINITIONS ==============
# Quests contribute to Game Pass progression
# A currency limits: max 5/day, 2-quest cooldown after A reward
# STRICT RULES:
# - All slot/spin quests require minimum 5 G bet per spin
# - All jackpot quests are WIN-BASED ONLY with minimum 20 G pot
# - No "join" or "participate" jackpot quests allowed
QUEST_DEFINITIONS = [
    # Slot Spin quests - ALL require minimum 5 G bet
    {
        "quest_id": "spin_10",
        "name_en": "Spin Starter",
        "name_de": "Spin-Starter",
        "description_en": "Spin 10 times with minimum 5 G bet",
        "description_de": "Drehe 10 Mal mit mindestens 5 G Einsatz",
        "type": "spins",
        "target": 10,
        "min_bet": 5.0,  # STRICT: 5 G minimum
        "rewards": {"xp": 50, "g": 20},
        "game_pass_xp": 30,
        "difficulty": "easy"
    },
    {
        "quest_id": "spin_50",
        "name_en": "Slot Enthusiast",
        "name_de": "Slot-Enthusiast",
        "description_en": "Spin 50 times with minimum 5 G bet",
        "description_de": "Drehe 50 Mal mit mindestens 5 G Einsatz",
        "type": "spins",
        "target": 50,
        "min_bet": 5.0,  # STRICT: 5 G minimum
        "rewards": {"xp": 150, "g": 50},
        "game_pass_xp": 80,
        "difficulty": "medium"
    },
    {
        "quest_id": "spin_100_high",
        "name_en": "High Roller Spins",
        "name_de": "High-Roller Spins",
        "description_en": "Spin 100 times with minimum 5 G bet",
        "description_de": "Drehe 100 Mal mit mindestens 5 G Einsatz",
        "type": "spins",
        "target": 100,
        "min_bet": 5.0,  # STRICT: 5 G minimum
        "rewards": {"xp": 400, "g": 100, "a": 1},
        "game_pass_xp": 200,
        "difficulty": "hard"
    },
    # Slot Win quests - ALL require minimum 5 G bet
    {
        "quest_id": "win_5",
        "name_en": "Lucky Streak",
        "name_de": "Glückssträhne",
        "description_en": "Win 5 times on slots with minimum 5 G bet",
        "description_de": "Gewinne 5 Mal an Spielautomaten mit mindestens 5 G Einsatz",
        "type": "wins",
        "target": 5,
        "min_bet": 5.0,  # STRICT: 5 G minimum
        "rewards": {"xp": 75, "g": 25},
        "game_pass_xp": 50,
        "difficulty": "easy"
    },
    {
        "quest_id": "win_20",
        "name_en": "Winning Habit",
        "name_de": "Gewinner-Gewohnheit",
        "description_en": "Win 20 times on slots with minimum 5 G bet",
        "description_de": "Gewinne 20 Mal an Spielautomaten mit mindestens 5 G Einsatz",
        "type": "wins",
        "target": 20,
        "min_bet": 5.0,  # STRICT: 5 G minimum
        "rewards": {"xp": 200, "g": 60},
        "game_pass_xp": 100,
        "difficulty": "medium"
    },
    # Jackpot quests - WIN-BASED ONLY with minimum 20 G pot
    # NO "join" or "participate" quests allowed
    {
        "quest_id": "jackpot_win_1",
        "name_en": "Jackpot Winner",
        "name_de": "Jackpot-Gewinner",
        "description_en": "Win 1 jackpot with minimum 20 G pot",
        "description_de": "Gewinne 1 Jackpot mit mindestens 20 G Pot",
        "type": "jackpot_wins",
        "target": 1,
        "min_pot": 20,  # STRICT: 20 G minimum pot
        "rewards": {"xp": 100, "g": 30},
        "game_pass_xp": 60,
        "difficulty": "easy"
    },
    {
        "quest_id": "jackpot_win_3",
        "name_en": "Jackpot Regular",
        "name_de": "Jackpot-Stammgast",
        "description_en": "Win 3 jackpots with minimum 20 G pot",
        "description_de": "Gewinne 3 Jackpots mit mindestens 20 G Pot",
        "type": "jackpot_wins",
        "target": 3,
        "min_pot": 20,  # STRICT: 20 G minimum pot
        "rewards": {"xp": 250, "g": 75, "a": 1},
        "game_pass_xp": 120,
        "difficulty": "medium"
    },
    {
        "quest_id": "jackpot_win_5",
        "name_en": "Jackpot Champion",
        "name_de": "Jackpot-Champion",
        "description_en": "Win 5 jackpots with minimum 20 G pot",
        "description_de": "Gewinne 5 Jackpots mit mindestens 20 G Pot",
        "type": "jackpot_wins",
        "target": 5,
        "min_pot": 20,  # STRICT: 20 G minimum pot
        "rewards": {"xp": 500, "g": 150, "a": 2},
        "game_pass_xp": 250,
        "difficulty": "hard"
    },
    # Wagering quests - total wagered amount
    {
        "quest_id": "wager_100",
        "name_en": "Small Spender",
        "name_de": "Kleiner Spieler",
        "description_en": "Wager a total of 100 G",
        "description_de": "Setze insgesamt 100 G",
        "type": "total_wagered",
        "target": 100,
        "rewards": {"xp": 100, "g": 25},
        "game_pass_xp": 60,
        "difficulty": "easy"
    },
    {
        "quest_id": "wager_500",
        "name_en": "Active Player",
        "name_de": "Aktiver Spieler",
        "description_en": "Wager a total of 500 G",
        "description_de": "Setze insgesamt 500 G",
        "type": "total_wagered",
        "target": 500,
        "rewards": {"xp": 300, "g": 80, "a": 1},
        "game_pass_xp": 150,
        "difficulty": "medium"
    },
    {
        "quest_id": "wager_2000",
        "name_en": "Dedicated Gambler",
        "name_de": "Engagierter Spieler",
        "description_en": "Wager a total of 2000 G",
        "description_de": "Setze insgesamt 2000 G",
        "type": "total_wagered",
        "target": 2000,
        "rewards": {"xp": 600, "g": 150, "a": 2},
        "game_pass_xp": 300,
        "difficulty": "hard"
    },
]

# Game Pass reward items (every 10 levels)
GAME_PASS_REWARDS = {
    # Level: {"free": {...}, "galadium": {...}}
    10: {
        "free": {"type": "item", "item_id": "common_chest", "name": "Common Chest"},
        "galadium": {"type": "item", "item_id": "rare_chest", "name": "Rare Chest"}
    },
    20: {
        "free": {"type": "item", "item_id": "uncommon_chest", "name": "Uncommon Chest"},
        "galadium": {"type": "item", "item_id": "epic_chest", "name": "Epic Chest"}
    },
    30: {
        "free": {"type": "item", "item_id": "rare_chest", "name": "Rare Chest"},
        "galadium": {"type": "item", "item_id": "legendary_chest", "name": "Legendary Chest"}
    },
    40: {
        "free": {"type": "item", "item_id": "epic_chest", "name": "Epic Chest"},
        "galadium": {"type": "item", "item_id": "legendary_chest", "name": "Legendary Chest"}
    },
    50: {
        "free": {"type": "item", "item_id": "legendary_chest", "name": "Legendary Chest"},
        "galadium": {"type": "item", "item_id": "mythic_chest", "name": "Mythic Chest"}
    },
}

# ============== MODELS ==============

class UserCreate(BaseModel):
    email: Optional[str] = None  # Optional - auto-generated from username if not provided
    password: str
    username: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    username: str
    balance: float
    balance_a: float = 0.0  # Prestige currency
    level: int
    xp: int
    xp_progress: Optional[dict] = None  # XP progress info for level-up tracking
    total_spins: int
    total_wins: int
    total_losses: int
    net_profit: float
    total_wagered: float = 0.0
    avatar: Optional[str] = None
    vip_status: Optional[str] = None
    name_color: Optional[str] = None
    badge: Optional[str] = None
    frame: Optional[str] = None
    # Active prestige cosmetics
    active_tag: Optional[str] = None
    active_name_color: Optional[str] = None
    active_jackpot_pattern: Optional[str] = None
    created_at: datetime
    last_wheel_spin: Optional[datetime] = None
    # Game Pass fields
    game_pass_level: int = 1
    game_pass_xp: int = 0
    galadium_pass_active: bool = False
    game_pass_reset_date: Optional[datetime] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Quest-related models
class QuestProgress(BaseModel):
    quest_id: str
    current: int = 0
    target: int
    completed: bool = False
    claimed: bool = False

class QuestResponse(BaseModel):
    quest_id: str
    name: str
    description: str
    type: str
    target: int
    current: int
    completed: bool
    claimed: bool
    rewards: Dict[str, Any]
    game_pass_xp: int
    difficulty: str

class GamePassStatus(BaseModel):
    level: int
    xp: int
    xp_to_next: int
    galadium_active: bool
    rewards_claimed: List[int] = []
    next_reward_level: int

class SlotBetRequest(BaseModel):
    bet_per_line: float = Field(..., ge=0.01)  # No upper limit - constrained by balance only
    active_lines: List[int] = Field(..., min_length=1)  # At least 1 line required
    slot_id: str = "classic"

class PaylineWin(BaseModel):
    line_number: int
    line_path: List[List[int]]  # [[row, col], ...] - all 5 positions
    symbol: str
    match_count: int = 5  # Always 5 for full-line wins (no partial payouts)
    multiplier: float
    payout: float

class SlotResult(BaseModel):
    reels: List[List[str]]  # 4 rows x 5 cols
    total_bet: float
    win_amount: float
    is_win: bool
    new_balance: float
    xp_gained: int
    winning_paylines: List[PaylineWin] = []
    is_jackpot: bool = False

class WheelSpinResult(BaseModel):
    reward: float
    new_balance: float
    next_spin_available: datetime

class BetHistoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    bet_id: str
    timestamp: datetime
    game_type: str
    slot_id: Optional[str] = None
    bet_amount: float
    result: str
    win_amount: float
    net_outcome: float

class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message_id: str
    user_id: str
    username: str
    message: str
    timestamp: datetime
    name_color: Optional[str] = None
    badge: Optional[str] = None
    active_tag: Optional[str] = None  # Prestige tag emoji/icon
    active_name_color: Optional[str] = None  # Prestige name color hex

class ChatMessageCreate(BaseModel):
    message: str = Field(..., max_length=500)

class LeaderboardEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    username: str
    level: int
    total_wins: int
    net_profit: float
    total_wagered: float = 0.0
    avatar: Optional[str] = None
    vip_status: Optional[str] = None
    frame: Optional[str] = None

# ============== ITEM SYSTEM MODELS ==============
# Items are collectible assets that persist across economy resets
# Items are NOT gambleable - they represent long-term value and identity

class ItemRarity(BaseModel):
    """Item rarity levels"""
    name: str  # common, uncommon, rare, epic, legendary
    color: str  # hex color for display

class ItemDefinition(BaseModel):
    """Master item definition - stored in items collection"""
    model_config = ConfigDict(extra="ignore")
    item_id: str
    name: str
    flavor_text: str
    rarity: str  # common, uncommon, rare, epic, legendary
    base_value: float  # G value when sellable (0 = not sellable yet)
    image_url: Optional[str] = None
    category: str = "collectible"  # collectible, cosmetic, etc.
    created_at: datetime
    is_tradeable: bool = False  # Can be traded between players
    is_sellable: bool = False  # Can be sold back to system

class InventoryItem(BaseModel):
    """Item in a user's inventory"""
    model_config = ConfigDict(extra="ignore")
    inventory_id: str
    user_id: str
    item_id: str
    item_name: str
    item_rarity: str
    item_image: Optional[str] = None
    item_flavor_text: str
    acquired_at: datetime
    acquired_from: str  # shop, trade, gamepass, reward

class ShopItem(BaseModel):
    """Item available in the rotating shop"""
    model_config = ConfigDict(extra="ignore")
    shop_listing_id: str
    item_id: str
    item_name: str
    item_rarity: str
    item_image: Optional[str] = None
    item_flavor_text: str
    price: float  # G cost
    available_from: datetime
    available_until: Optional[datetime] = None  # None = permanent
    stock_limit: Optional[int] = None  # None = unlimited
    stock_sold: int = 0
    is_active: bool = True

class ShopPurchaseRequest(BaseModel):
    """Request to purchase an item from the shop"""
    shop_listing_id: str

class UserInventoryResponse(BaseModel):
    """Response for user inventory"""
    items: List[InventoryItem]
    total_items: int

# Item rarity definitions with colors
ITEM_RARITIES = {
    "common": {"name": "Common", "color": "#9CA3AF"},      # gray
    "uncommon": {"name": "Uncommon", "color": "#22C55E"},  # green
    "rare": {"name": "Rare", "color": "#3B82F6"},          # blue
    "epic": {"name": "Epic", "color": "#A855F7"},          # purple
    "legendary": {"name": "Legendary", "color": "#F59E0B"} # gold
}

# ============== PRESTIGE SYSTEM MODELS ==============
# Prestige currency (A) is earned by converting G at 1000:1 ratio
# Prestige cosmetics are account-bound, non-tradeable, non-sellable

# Conversion rate: 1000 G = 1 A
PRESTIGE_CONVERSION_RATE = 1000

class CosmeticType(str):
    """Cosmetic category types"""
    TAG = "tag"              # Icon next to player name
    NAME_COLOR = "name_color" # Color of player name in chat
    JACKPOT_PATTERN = "jackpot_pattern"  # Visible during jackpot wins

class PrestigeCosmeticTemplate(BaseModel):
    """Template definition for a prestige cosmetic item"""
    model_config = ConfigDict(extra="ignore")
    cosmetic_id: str          # Unique identifier
    display_name: str         # Human-readable name
    cosmetic_type: str        # tag, name_color, jackpot_pattern
    description: str          # Flavor text
    asset_path: Optional[str] = None  # Path to visual asset (icon/pattern)
    asset_value: Optional[str] = None # Direct value (e.g., hex color)
    prestige_cost: int        # Cost in A currency
    tier: str = "standard"    # standard, premium, legendary
    unlock_level: int = 0     # Minimum level required (0 = no requirement)
    is_available: bool = True # Can be purchased

class UserPrestigeItem(BaseModel):
    """Record of owned prestige cosmetic"""
    model_config = ConfigDict(extra="ignore")
    ownership_id: str
    user_id: str
    cosmetic_id: str
    cosmetic_type: str
    purchased_at: datetime
    purchase_price: int  # A spent

class PrestigePurchaseRequest(BaseModel):
    """Request to purchase a prestige cosmetic"""
    cosmetic_id: str

class PrestigeActivateRequest(BaseModel):
    """Request to activate a prestige cosmetic"""
    cosmetic_id: str
    cosmetic_type: str  # tag, name_color, jackpot_pattern

class CurrencyConvertRequest(BaseModel):
    """Request to convert G to A"""
    g_amount: float = Field(..., ge=1000)  # Minimum 1000 G (= 1 A)

# ============== PRESTIGE COSMETIC TEMPLATES ==============
# All cosmetics defined as data - adding new items only requires new entries here

PRESTIGE_COSMETICS = {
    # ===== PLAYER TAGS (20-30 A) =====
    "tag_glove": {
        "cosmetic_id": "tag_glove",
        "display_name": "Glove",
        "cosmetic_type": "tag",
        "description": "A pristine white glove. Handle with care.",
        "asset_path": "/assets/tags/glove.png",
        "asset_value": "🧤",  # Fallback emoji
        "prestige_cost": 20,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "tag_mushroom": {
        "cosmetic_id": "tag_mushroom",
        "display_name": "Mushroom",
        "cosmetic_type": "tag",
        "description": "A lucky mushroom. May or may not be edible.",
        "asset_path": "/assets/tags/mushroom.png",
        "asset_value": "🍄",
        "prestige_cost": 20,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "tag_dog": {
        "cosmetic_id": "tag_dog",
        "display_name": "Dog",
        "cosmetic_type": "tag",
        "description": "Man's best friend. Always loyal.",
        "asset_path": "/assets/tags/dog.png",
        "asset_value": "🐕",
        "prestige_cost": 25,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "tag_cat": {
        "cosmetic_id": "tag_cat",
        "display_name": "Cat",
        "cosmetic_type": "tag",
        "description": "Nine lives, one lucky streak.",
        "asset_path": "/assets/tags/cat.png",
        "asset_value": "🐱",
        "prestige_cost": 25,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "tag_star": {
        "cosmetic_id": "tag_star",
        "display_name": "Star",
        "cosmetic_type": "tag",
        "description": "Shine bright among the players.",
        "asset_path": "/assets/tags/star.png",
        "asset_value": "⭐",
        "prestige_cost": 30,
        "tier": "premium",
        "unlock_level": 5,
        "is_available": True
    },
    
    # ===== NAME COLORS (10-20 A) =====
    "color_gold": {
        "cosmetic_id": "color_gold",
        "display_name": "Gold",
        "cosmetic_type": "name_color",
        "description": "The color of champions.",
        "asset_path": None,
        "asset_value": "#FFD700",
        "prestige_cost": 15,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "color_crimson": {
        "cosmetic_id": "color_crimson",
        "display_name": "Crimson",
        "cosmetic_type": "name_color",
        "description": "Bold and fearless.",
        "asset_path": None,
        "asset_value": "#DC143C",
        "prestige_cost": 10,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "color_azure": {
        "cosmetic_id": "color_azure",
        "display_name": "Azure",
        "cosmetic_type": "name_color",
        "description": "Cool as the ocean depths.",
        "asset_path": None,
        "asset_value": "#007FFF",
        "prestige_cost": 10,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "color_violet": {
        "cosmetic_id": "color_violet",
        "display_name": "Violet",
        "cosmetic_type": "name_color",
        "description": "Royal and mysterious.",
        "asset_path": None,
        "asset_value": "#8B00FF",
        "prestige_cost": 15,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "color_emerald": {
        "cosmetic_id": "color_emerald",
        "display_name": "Emerald",
        "cosmetic_type": "name_color",
        "description": "Fortune favors the green.",
        "asset_path": None,
        "asset_value": "#50C878",
        "prestige_cost": 20,
        "tier": "premium",
        "unlock_level": 3,
        "is_available": True
    },
    
    # ===== FREE DEFAULT JACKPOT PATTERNS (0 A - available to everyone) =====
    "default_lightblue": {
        "cosmetic_id": "default_lightblue",
        "display_name": "Sky Blue",
        "cosmetic_type": "jackpot_pattern",
        "description": "A calming sky blue.",
        "asset_path": None,
        "asset_value": "#38BDF8",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    "default_pink": {
        "cosmetic_id": "default_pink",
        "display_name": "Rose Pink",
        "cosmetic_type": "jackpot_pattern",
        "description": "Soft and elegant pink.",
        "asset_path": None,
        "asset_value": "#F472B6",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    "default_red": {
        "cosmetic_id": "default_red",
        "display_name": "Crimson Red",
        "cosmetic_type": "jackpot_pattern",
        "description": "Bold and powerful red.",
        "asset_path": None,
        "asset_value": "#EF4444",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    "default_orange": {
        "cosmetic_id": "default_orange",
        "display_name": "Sunset Orange",
        "cosmetic_type": "jackpot_pattern",
        "description": "Warm sunset glow.",
        "asset_path": None,
        "asset_value": "#F97316",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    "default_yellow": {
        "cosmetic_id": "default_yellow",
        "display_name": "Golden Yellow",
        "cosmetic_type": "jackpot_pattern",
        "description": "Bright and cheerful yellow.",
        "asset_path": None,
        "asset_value": "#FACC15",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    
    # ===== PREMIUM JACKPOT PATTERNS (50-120 A) =====
    "pattern_flames": {
        "cosmetic_id": "pattern_flames",
        "display_name": "Inferno",
        "cosmetic_type": "jackpot_pattern",
        "description": "Set the reels ablaze with your wins.",
        "asset_path": "/assets/patterns/flames.png",
        "asset_value": "linear-gradient(180deg, #FF4500 0%, #FF8C00 50%, #FFD700 100%)",
        "prestige_cost": 50,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "pattern_northern_lights": {
        "cosmetic_id": "pattern_northern_lights",
        "display_name": "Northern Lights",
        "cosmetic_type": "jackpot_pattern",
        "description": "Dance of the aurora borealis.",
        "asset_path": "/assets/patterns/northern_lights.png",
        "asset_value": "linear-gradient(135deg, #00FF87 0%, #60EFFF 50%, #B967FF 100%)",
        "prestige_cost": 80,
        "tier": "premium",
        "unlock_level": 5,
        "is_available": True
    },
    "pattern_void": {
        "cosmetic_id": "pattern_void",
        "display_name": "Void Walker",
        "cosmetic_type": "jackpot_pattern",
        "description": "From the depths of nothingness, fortune emerges.",
        "asset_path": "/assets/patterns/void.png",
        "asset_value": "linear-gradient(180deg, #0D0221 0%, #3D1A78 30%, #6B21A8 60%, #F472B6 100%)",
        "prestige_cost": 120,
        "tier": "legendary",
        "unlock_level": 10,
        "is_available": True
    }
}

# ============== JACKPOT MODELS ==============

class JackpotJoinRequest(BaseModel):
    bet_amount: float = Field(..., ge=0.01)  # No upper limit - constrained by balance only

class JackpotParticipant(BaseModel):
    user_id: str
    username: str
    bet_amount: float
    win_chance: float
    avatar: Optional[str] = None
    jackpot_pattern: Optional[str] = None

class JackpotStatus(BaseModel):
    state: str  # idle, waiting, active, spinning, complete
    total_pot: float
    participants: List[JackpotParticipant]
    countdown_seconds: Optional[int] = None
    winner: Optional[JackpotParticipant] = None
    winner_index: Optional[int] = None  # Server-authoritative winner position
    jackpot_id: Optional[str] = None
    max_participants: int = 50  # Hard cap for frontend display
    is_full: bool = False       # True when max reached

# ============== TRADING SYSTEM MODELS ==============

TRADE_G_FEE_PERCENT = 0.30  # 30% fee on G transfers (burned from economy)
TRADE_MAX_ITEMS_PER_SIDE = 10

class TradeOfferItem(BaseModel):
    """An item offered in a trade"""
    inventory_id: str
    item_id: str
    item_name: str
    item_rarity: str
    item_image: Optional[str] = None

class TradeOffer(BaseModel):
    """One side's offer in a trade"""
    user_id: str
    username: str
    items: List[TradeOfferItem] = []
    g_amount: float = 0.0  # G currency offered (before fee)

class TradeCreateRequest(BaseModel):
    """Request to create a new trade"""
    recipient_username: str
    offered_items: List[str] = []  # List of inventory_ids
    offered_g: float = 0.0
    requested_items: List[str] = []  # List of inventory_ids from recipient
    requested_g: float = 0.0

class TradeCounterRequest(BaseModel):
    """Request to counter a trade offer"""
    offered_items: List[str] = []  # List of inventory_ids
    offered_g: float = 0.0
    requested_items: List[str] = []  # List of inventory_ids from other party
    requested_g: float = 0.0

class TradeResponse(BaseModel):
    """Trade data response"""
    trade_id: str
    status: str  # pending, completed
    initiator: TradeOffer
    recipient: TradeOffer
    created_at: str
    completed_at: Optional[str] = None
    initiator_id: str
    recipient_id: str
    g_fee_amount: Optional[float] = None  # Calculated fee if G involved

# ============== PAYLINE DEFINITIONS (5x4 Grid) ==============
# Each payline is a list of (row, col) positions from left to right
# Row 0 = top, Row 3 = bottom; Col 0 = leftmost reel
# Standard 20-line casino layout

# ============== 8 STRAIGHT PAYLINES ONLY ==============
# 4 Horizontal (rows) + 4 Vertical (columns)
# No diagonals, zigzags, V-shapes, curves, or specials

PAYLINES_4x4 = {
    # Horizontal paylines (4 rows, each spanning 4 columns)
    1: [(0, 0), (0, 1), (0, 2), (0, 3)],   # Row 0 - Top horizontal
    2: [(1, 0), (1, 1), (1, 2), (1, 3)],   # Row 1 - Second horizontal
    3: [(2, 0), (2, 1), (2, 2), (2, 3)],   # Row 2 - Third horizontal
    4: [(3, 0), (3, 1), (3, 2), (3, 3)],   # Row 3 - Bottom horizontal
    # Vertical paylines (4 columns, each spanning 4 rows)
    5: [(0, 0), (1, 0), (2, 0), (3, 0)],   # Column 0 - Leftmost vertical
    6: [(0, 1), (1, 1), (2, 1), (3, 1)],   # Column 1 - Second vertical
    7: [(0, 2), (1, 2), (2, 2), (3, 2)],   # Column 2 - Third vertical
    8: [(0, 3), (1, 3), (2, 3), (3, 3)],   # Column 3 - Rightmost vertical
}

# Line presets for quick selection (max 8 lines now)
LINE_PRESETS = {
    4: [1, 2, 3, 4],           # Horizontal only
    8: list(range(1, 9)),      # All 8 lines
}

# ============================================================================
# REEL STRIP BUILDER
# ============================================================================
def build_reel_strip(distribution: dict, strip_length: int = 1000) -> list:
    """
    Build a physical reel strip from a symbol distribution.
    Distribution values are weights (how many of each symbol on the strip).
    """
    strip = []
    for symbol, count in distribution.items():
        strip.extend([symbol] * count)
    
    # Pad or truncate to exact strip length
    while len(strip) < strip_length:
        strip.append("orange")  # Pad with most common symbol
    strip = strip[:strip_length]
    
    # Shuffle to distribute symbols randomly on the strip
    random.shuffle(strip)
    return strip

# ============================================================================
# MASTER SLOT CONFIGURATION TABLE
# ============================================================================
# Single source of truth for ALL symbol settings
# 
# Design principles:
# - Wild: ~3% BASE probability (SUPPORT symbol, creates tension, not the jackpot path)
# - Wild NERF mechanic: Each spin, one random reel has Wild reduced to ~0.1%
#   This makes 4-Wild wins rare but achievable, not farmable
# - Jackpot symbols (Seven/Diamond): TRUE JACKPOTS - rarer than Wild but HIGHEST multipliers
# - Common symbols: High frequency, moderate payout (drives RTP to target 94-96%)
#
# RTP TUNING NOTES:
# - 4-of-a-kind probability for common symbols drives most of the RTP
# - Rare symbols (Wild/Seven/Diamond) contribute little to RTP but create excitement
# - Multipliers calibrated so common wins sustain RTP, rare wins feel like jackpots
# - Target RTP: 94-96% (house edge 4-6%)
#
# To rebalance: Modify multipliers in this table only
# ============================================================================

CLASSIC_SYMBOL_CONFIG = {
    # Symbol       Multiplier   Reel0%   Reel1%   Reel2%   Reel3%   Tier         Notes
    # ─────────────────────────────────────────────────────────────────────────────────────
    # Common symbols - high frequency, calibrated multipliers to hit 94-96% RTP
    "orange":   {"mult": 11.5, "r0": 35.0, "r1": 38.0, "r2": 41.0, "r3": 44.0, "tier": "common"},      # Most common
    "lemon":    {"mult": 24,   "r0": 28.0, "r1": 26.0, "r2": 24.0, "r3": 22.0, "tier": "common"},      # Common
    "cherry":   {"mult": 57,   "r0": 18.0, "r1": 16.0, "r2": 14.0, "r3": 12.0, "tier": "uncommon"},    # Less common
    "bar":      {"mult": 140,  "r0": 10.0, "r1": 9.0,  "r2": 8.0,  "r3": 7.0,  "tier": "rare"},        # Rare
    
    # Wild: SUPPORT symbol - appears often (~3%), creates excitement & substitutions
    # NOT the jackpot path - moderate multiplier (below Seven/Diamond)
    # One reel per spin gets "nerfed" to 0.1% to prevent farmable 4-Wild lines
    "wild":     {"mult": 200,  "r0": 3.0,  "r1": 3.0,  "r2": 3.0,  "r3": 3.0,  "tier": "special", "is_wild": True},
    
    # TRUE JACKPOT symbols: Rarer than Wild but carry HIGHEST multipliers
    # These are the emotional jackpot - rare but life-changing when they hit
    "seven":    {"mult": 500,  "r0": 1.2,  "r1": 0.9,  "r2": 0.6,  "r3": 0.4,  "tier": "jackpot"},     # High-value jackpot
    "diamond":  {"mult": 1000, "r0": 0.8,  "r1": 0.6,  "r2": 0.4,  "r3": 0.2,  "tier": "jackpot"},     # Ultimate jackpot
}
# Note: Percentages should sum to ~96-100% per reel (remainder goes to orange)

# Wild nerf probability (when a reel is "nerfed", Wild drops to this)
WILD_NERF_PROBABILITY = 0.1  # 0.1% instead of 3%

# Convert config table to symbols dict and reel distributions
def build_config_from_table(config_table):
    """Build symbols dict and reel distributions from master config table."""
    symbols = {}
    reel_distributions = {0: {}, 1: {}, 2: {}, 3: {}}
    
    for sym_name, cfg in config_table.items():
        # Build symbols dict
        symbols[sym_name] = {
            "multiplier": cfg["mult"],
            "tier": cfg["tier"],
        }
        if cfg.get("is_wild"):
            symbols[sym_name]["is_wild"] = True
        
        # Build reel distributions (convert % to weight out of 1000)
        for reel_idx in range(4):
            pct = cfg.get(f"r{reel_idx}", 0)
            weight = int(pct * 10)  # Convert % to weight (1000-based)
            reel_distributions[reel_idx][sym_name] = weight
    
    # Normalize each reel to exactly 1000
    for reel_idx in range(4):
        total = sum(reel_distributions[reel_idx].values())
        if total < 1000:
            # Add remainder to orange (most common)
            reel_distributions[reel_idx]["orange"] += (1000 - total)
        elif total > 1000:
            # Reduce orange if over
            reel_distributions[reel_idx]["orange"] -= (total - 1000)
    
    return symbols, reel_distributions

# Build configuration
CLASSIC_SYMBOLS, CLASSIC_REEL_DISTRIBUTIONS = build_config_from_table(CLASSIC_SYMBOL_CONFIG)

# Build the actual reel strips at startup (1000 positions for precise control)
CLASSIC_REEL_STRIPS = {
    reel_idx: build_reel_strip(dist, 1000)
    for reel_idx, dist in CLASSIC_REEL_DISTRIBUTIONS.items()
}

def get_symbol_probability_on_reel(symbol: str, reel_idx: int) -> float:
    """Calculate probability of a symbol appearing on a specific reel."""
    dist = CLASSIC_REEL_DISTRIBUTIONS.get(reel_idx, {})
    total = sum(dist.values())
    return (dist.get(symbol, 0) / total * 100) if total > 0 else 0

def get_average_symbol_probability(symbol: str, reel_distributions: dict) -> float:
    """Calculate average appearance probability for a symbol across all reels."""
    total_prob = 0
    for reel_idx, dist in reel_distributions.items():
        reel_total = sum(dist.values())
        symbol_count = dist.get(symbol, 0)
        total_prob += (symbol_count / reel_total) * 100 if reel_total > 0 else 0
    return round(total_prob / len(reel_distributions), 2)

# ============== SLOT MACHINE CONFIGS (All 4x4) ==============

SLOT_CONFIGS = {
    "classic": {
        "name": "Classic Fruits Deluxe",
        "reels": 4,
        "rows": 4,
        "max_paylines": 8,  # 4 horizontal + 4 vertical
        "volatility": "medium",
        "rtp": 95.5,
        "symbols": CLASSIC_SYMBOLS,
        "reel_strips": CLASSIC_REEL_STRIPS,
        "reel_distributions": CLASSIC_REEL_DISTRIBUTIONS,
        "features": {"wilds": True}
    },
    "book": {
        "name": "Book of Pharaohs",
        "reels": 5,
        "rows": 4,
        "max_paylines": 20,
        "volatility": "high",
        "rtp": 96.2,
        "symbols": {
            "ankh": {"multiplier": 2.0},
            "scarab": {"multiplier": 3.0},
            "eye": {"multiplier": 5.0},
            "anubis": {"multiplier": 10.0},
            "pharaoh": {"multiplier": 25.0},
            "book": {"multiplier": 100.0, "is_wild": True}
        },
        "features": {"wilds": True, "expanding_symbols": True}
    },
    "diamond": {
        "name": "Diamond Empire",
        "reels": 5,
        "rows": 4,
        "max_paylines": 20,
        "volatility": "medium-high",
        "rtp": 95.8,
        "symbols": {
            "ruby": {"multiplier": 2.0},
            "emerald": {"multiplier": 3.0, "weight": 20},
            "sapphire": {"multiplier": 5.0, "weight": 15},
            "amethyst": {"multiplier": 8.0, "weight": 12},
            "diamond": {"multiplier": 20.0, "weight": 8},
            "crown": {"multiplier": 50.0, "weight": 5},
            "wild_diamond": {"multiplier": 100.0, "weight": 3, "is_wild": True}
        },
        "features": {"wilds": True}
    },
    "cyber": {
        "name": "Cyber Reels",
        "reels": 5,
        "rows": 4,
        "max_paylines": 20,
        "volatility": "medium",
        "rtp": 95.5,
        "symbols": {
            "chip": {"multiplier": 2.0, "weight": 24},
            "circuit": {"multiplier": 3.0, "weight": 20},
            "robot": {"multiplier": 5.0, "weight": 16},
            "ai": {"multiplier": 10.0, "weight": 12},
            "cyber": {"multiplier": 25.0, "weight": 8},
            "matrix": {"multiplier": 50.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True, "sticky_wilds": True}
    },
    "viking": {
        "name": "Viking Storm",
        "reels": 5,
        "rows": 4,
        "max_paylines": 20,
        "volatility": "high",
        "rtp": 96.0,
        "symbols": {
            "axe": {"multiplier": 2.0, "weight": 22},
            "shield": {"multiplier": 3.0, "weight": 20},
            "helmet": {"multiplier": 5.0, "weight": 15},
            "ship": {"multiplier": 10.0, "weight": 12},
            "thor": {"multiplier": 25.0, "weight": 8},
            "odin": {"multiplier": 50.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True, "expanding_wilds": True}
    },
    "fortune": {
        "name": "Asian Fortune",
        "reels": 5,
        "rows": 4,
        "max_paylines": 20,
        "volatility": "medium",
        "rtp": 95.6,
        "symbols": {
            "fan": {"multiplier": 2.0, "weight": 24},
            "lantern": {"multiplier": 3.0, "weight": 20},
            "koi": {"multiplier": 5.0, "weight": 16},
            "dragon": {"multiplier": 10.0, "weight": 12},
            "lucky": {"multiplier": 25.0, "weight": 8},
            "wild": {"multiplier": 50.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True}
    },
    "pirate": {
        "name": "Pirate's Chest",
        "reels": 5,
        "rows": 4,
        "max_paylines": 20,
        "volatility": "medium-high",
        "rtp": 95.4,
        "symbols": {
            "compass": {"multiplier": 2.0, "weight": 22},
            "map": {"multiplier": 3.0, "weight": 20},
            "parrot": {"multiplier": 5.0, "weight": 15},
            "ship": {"multiplier": 10.0, "weight": 12},
            "captain": {"multiplier": 25.0, "weight": 8},
            "skull": {"multiplier": 100.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True}
    },
    "mythic": {
        "name": "Mythic Gods",
        "reels": 5,
        "rows": 4,
        "max_paylines": 20,
        "volatility": "high",
        "rtp": 96.1,
        "symbols": {
            "scroll": {"multiplier": 2.0, "weight": 22},
            "lyre": {"multiplier": 3.0, "weight": 18},
            "athena": {"multiplier": 5.0, "weight": 14},
            "poseidon": {"multiplier": 10.0, "weight": 12},
            "hades": {"multiplier": 20.0, "weight": 10},
            "zeus": {"multiplier": 50.0, "weight": 6, "is_wild": True}
        },
        "features": {"wilds": True, "stacked_symbols": True}
    },
    "inferno": {
        "name": "Inferno Reels",
        "reels": 5,
        "rows": 4,
        "max_paylines": 20,
        "volatility": "very-high",
        "rtp": 94.5,
        "symbols": {
            "ember": {"multiplier": 2.0, "weight": 25},
            "flame": {"multiplier": 3.0, "weight": 20},
            "phoenix": {"multiplier": 8.0, "weight": 15},
            "demon": {"multiplier": 15.0, "weight": 12},
            "devil": {"multiplier": 30.0, "weight": 8},
            "inferno": {"multiplier": 100.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True, "high_volatility": True}
    },
    "battle": {
        "name": "Slot Battle Arena",
        "reels": 5,
        "rows": 4,
        "max_paylines": 20,
        "volatility": "medium",
        "rtp": 95.0,
        "symbols": {
            "sword": {"multiplier": 2.0, "weight": 24},
            "shield": {"multiplier": 3.0, "weight": 20},
            "armor": {"multiplier": 5.0, "weight": 16},
            "knight": {"multiplier": 10.0, "weight": 12},
            "king": {"multiplier": 25.0, "weight": 8},
            "trophy": {"multiplier": 50.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True}
    }
}

# Jackpot state (in production, use Redis)
# ============== JACKPOT CONFIGURATION ==============
JACKPOT_MAX_PARTICIPANTS = 50  # Hard cap: 2-50 players per jackpot
JACKPOT_MIN_PARTICIPANTS = 2   # Minimum to start spinning
JACKPOT_WAIT_SECONDS = 600     # 10 minutes wait for second player
JACKPOT_COUNTDOWN_SECONDS = 30 # 30 seconds countdown after 2+ players

jackpot_state = {
    "state": "idle",
    "jackpot_id": None,
    "participants": [],
    "total_pot": 0.0,
    "started_at": None,
    "countdown_end": None,
    "winner": None,
    "winner_index": None  # Server-authoritative winner position
}
jackpot_lock = asyncio.Lock()

# ============== HELPER FUNCTIONS ==============

def create_jwt_token(user_id: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "user_id": user_id,
        "exp": expiration,
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("user_id")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def check_user_banned(user: dict) -> None:
    """Check if user is banned (time-based). Raises HTTPException if banned."""
    banned_until = user.get("banned_until")
    if banned_until is None:
        return
    
    if isinstance(banned_until, str):
        banned_until = datetime.fromisoformat(banned_until)
    
    if banned_until.tzinfo is None:
        banned_until = banned_until.replace(tzinfo=timezone.utc)
    
    now = datetime.now(timezone.utc)
    
    if banned_until > now:
        remaining = banned_until - now
        days = remaining.days
        hours = remaining.seconds // 3600
        minutes = (remaining.seconds % 3600) // 60
        
        if days > 0:
            time_str = f"{days}d {hours}h"
        elif hours > 0:
            time_str = f"{hours}h {minutes}m"
        else:
            time_str = f"{minutes}m"
        
        raise HTTPException(
            status_code=403,
            detail=f"Account banned for {time_str}. Appeal at Discord."
        )

async def get_current_user(request: Request) -> dict:
    """Get current user - checks JWT first (explicit auth), then OAuth session.
    
    Auth methods:
    - Authorization header with Bearer token: For username/password users (checked FIRST)
    - oauth_session cookie: For Google OAuth users (fallback)
    
    JWT takes priority because it's explicitly passed in the request header,
    while cookies persist across sessions and could cause auth confusion.
    """
    auth_header = request.headers.get("Authorization")
    oauth_session = request.cookies.get("oauth_session")  # Google OAuth only
    
    # Check JWT from Authorization header FIRST (username/password users)
    # JWT takes priority as it's explicitly included in the request
    if auth_header and auth_header.startswith("Bearer "):
        jwt_token = auth_header.split(" ")[1]
        user_id = verify_jwt_token(jwt_token)
        if user_id:
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            if user:
                # 🔒 BAN CHECK (time-based)
                check_user_banned(user)
                return user
    
    # Then check OAuth session (Google OAuth users)
    if oauth_session:
        session_doc = await db.user_sessions.find_one(
            {"session_token": oauth_session},
            {"_id": 0}
        )
        
        if session_doc:
            expires_at = session_doc.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            
            if expires_at >= datetime.now(timezone.utc):
                user = await db.users.find_one(
                    {"user_id": session_doc["user_id"]},
                    {"_id": 0}
                )
                if user:
                    # 🔒 BAN CHECK (time-based)
                    check_user_banned(user)
                    return user
    
    raise HTTPException(status_code=401, detail="Not authenticated")

def get_weighted_symbol(symbols: dict) -> str:
    """Get a random symbol based on weights"""
    total_weight = sum(s["weight"] for s in symbols.values())
    rand = random.randint(1, total_weight)
    cumulative = 0
    for symbol, data in symbols.items():
        cumulative += data["weight"]
        if rand <= cumulative:
            return symbol
    return list(symbols.keys())[0]

# ============== OUTCOME TABLE RNG SYSTEM ==============
# FULL-LINE-ONLY wins - ALL 5 positions on a payline must match
# No partial payouts (3/4 from left NOT allowed)

OUTCOME_TABLE = [
    # Losses - 50% of spins
    {"type": "loss", "weight": 50, "wins": 0},
    
    # Small wins (low-value symbols, FULL LINE) - 25% of spins  
    {"type": "win_cherry", "weight": 10, "wins": 1, "symbol": "cherry"},
    {"type": "win_lemon", "weight": 8, "wins": 1, "symbol": "lemon"},
    {"type": "win_orange", "weight": 7, "wins": 1, "symbol": "orange"},
    
    # Medium wins (mid-value symbols, FULL LINE) - 15% of spins
    {"type": "win_bar", "weight": 8, "wins": 1, "symbol": "bar"},
    {"type": "win_bar_multi", "weight": 4, "wins": 2, "symbol": "bar"},
    {"type": "win_lemon_multi", "weight": 3, "wins": 2, "symbol": "lemon"},
    
    # Big wins (high-value symbols, FULL LINE) - 7% of spins
    {"type": "win_seven", "weight": 4, "wins": 1, "symbol": "seven"},
    {"type": "win_seven_multi", "weight": 2, "wins": 2, "symbol": "seven"},
    {"type": "win_diamond", "weight": 1, "wins": 1, "symbol": "diamond"},
    
    # Jackpot wins (premium symbols, FULL LINE) - 3% of spins
    {"type": "win_wild", "weight": 1.5, "wins": 1, "symbol": "wild"},
    {"type": "win_diamond_multi", "weight": 0.8, "wins": 2, "symbol": "diamond"},
    {"type": "win_wild_multi", "weight": 0.5, "wins": 2, "symbol": "wild"},
    {"type": "win_mega", "weight": 0.2, "wins": 3, "symbol": "seven"},
]

def get_random_outcome():
    """Select outcome from weighted outcome table"""
    total_weight = sum(o["weight"] for o in OUTCOME_TABLE)
    rand = random.uniform(0, total_weight)
    cumulative = 0
    for outcome in OUTCOME_TABLE:
        cumulative += outcome["weight"]
        if rand <= cumulative:
            return outcome
    return OUTCOME_TABLE[0]  # Default to loss

def check_payline_win(grid: list, line_path: list, symbols: dict) -> dict:
    """
    Check if a payline has a FULL-LINE win.
    
    STRICT RULES - NO PARTIAL WINS:
    - ALL positions on the payline must match the SAME symbol
    - Wild symbols can substitute for any symbol
    - If ANY position has a non-matching, non-wild symbol, NO WIN
    - Horizontal lines: ALL 5 positions must match
    - Vertical lines: ALL 4 positions must match
    
    Returns win info or None if no valid full-line win.
    """
    line_length = len(line_path)
    if line_length < 4:  # Minimum 4 for vertical lines
        return None
    
    # Get symbols at ALL positions along this payline
    line_symbols = [grid[r][c] for (r, c) in line_path]
    
    # Find the base symbol (first non-wild from left/top)
    base_symbol = None
    for sym in line_symbols:
        if not symbols.get(sym, {}).get("is_wild", False):
            base_symbol = sym
            break
    
    # If all symbols are wild, it's a wild-line win
    if base_symbol is None:
        base_symbol = "wild"
    
    # STRICT CHECK: EVERY position must match base symbol OR be wild
    # If ANY position fails this check, return None (no win)
    for idx, sym in enumerate(line_symbols):
        is_base_match = (sym == base_symbol)
        is_wild = symbols.get(sym, {}).get("is_wild", False)
        
        if not is_base_match and not is_wild:
            # Found a non-matching, non-wild symbol - NO WIN
            return None
    
    # Full line match! All positions valid.
    return {
        "symbol": base_symbol,
        "matched_positions": list(line_path),  # All positions (4 or 5)
        "line_length": line_length  # Track if horizontal (5) or vertical (4)
    }


def validate_all_paylines(grid: list, active_lines: List[int], symbols: dict) -> list:
    """
    Validate ALL active paylines for FULL-LINE wins only.
    Returns list of winning paylines with complete data.
    Supports 8 straight paylines: 4 horizontal (5 symbols) + 4 vertical (4 symbols)
    """
    winning_paylines = []
    
    for line_num in active_lines:
        if line_num not in PAYLINES_4x4:
            continue
        
        line_path = PAYLINES_4x4[line_num]
        win_info = check_payline_win(grid, line_path, symbols)
        
        if win_info:
            # Get symbol multiplier
            symbol_mult = symbols.get(win_info["symbol"], {}).get("multiplier", 1.0)
            line_length = win_info.get("line_length", len(line_path))
            
            winning_paylines.append({
                "line_number": line_num,
                "line_path": [[r, c] for (r, c) in win_info["matched_positions"]],
                "symbol": win_info["symbol"],
                "match_count": line_length,  # 4 for vertical, 5 for horizontal
                "multiplier": symbol_mult,
                "line_type": "horizontal" if line_length == 5 else "vertical"
            })
    
    return winning_paylines


def generate_random_grid_with_wild_nerf(symbols: dict, rows: int = 4, cols: int = 4, reel_distributions: dict = None) -> list:
    """
    Generate a random grid using TRUE REEL STRIPS with WILD NERF MECHANIC.
    
    Wild Nerf Mechanic:
    - Wild symbols have ~3% base probability per reel (visible, exciting)
    - BUT: Each spin, ONE RANDOM REEL has Wild probability reduced to ~0.1%
    - This prevents 4-Wild lines from being farmable while keeping them achievable
    - The nerfed reel is DYNAMIC (random each spin), so players can't detect a pattern
    
    This simulates real slot machines while adding strategic anti-farm protection.
    """
    import random
    
    # If no distributions provided, fall back to uniform
    if not reel_distributions:
        symbol_list = list(symbols.keys())
        return [[random.choice(symbol_list) for _ in range(cols)] for _ in range(rows)]
    
    # Step 1: Select ONE random reel to "nerf" Wild probability this spin
    nerfed_reel = random.randint(0, cols - 1)
    
    # Step 2: Generate each reel column with appropriate Wild probability
    reel_stops = []
    for col_idx in range(cols):
        # Get base distribution for this reel
        base_dist = reel_distributions.get(col_idx, reel_distributions.get(0, {})).copy()
        
        # Apply Wild nerf if this is the nerfed reel
        if col_idx == nerfed_reel and 'wild' in base_dist:
            # Reduce Wild weight from ~30 (3%) to ~1 (0.1%)
            original_wild_weight = base_dist.get('wild', 0)
            nerf_weight = int(WILD_NERF_PROBABILITY * 10)  # 0.1% = weight of 1
            weight_reduction = original_wild_weight - nerf_weight
            base_dist['wild'] = nerf_weight
            # Redistribute the removed Wild weight to orange (most common)
            base_dist['orange'] = base_dist.get('orange', 0) + weight_reduction
        
        # Build reel strip from (potentially modified) distribution
        strip = []
        for symbol, weight in base_dist.items():
            strip.extend([symbol] * weight)
        
        # Normalize to 1000 if needed
        while len(strip) < 1000:
            strip.append('orange')
        strip = strip[:1000]
        random.shuffle(strip)
        
        # Roll RNG to determine stop position on this reel
        stop_position = random.randint(0, len(strip) - 1)
        
        # Extract consecutive symbols starting from stop position
        visible_symbols = []
        for row_idx in range(rows):
            symbol_idx = (stop_position + row_idx) % len(strip)
            visible_symbols.append(strip[symbol_idx])
        
        reel_stops.append(visible_symbols)
    
    # Convert from column-major (reels) to row-major (grid) format
    grid = []
    for row_idx in range(rows):
        row = []
        for col_idx in range(cols):
            row.append(reel_stops[col_idx][row_idx])
        grid.append(row)
    
    return grid


def generate_random_grid(symbols: dict, rows: int = 4, cols: int = 4, reel_strips: dict = None) -> list:
    """
    Legacy wrapper - now delegates to Wild nerf version for "classic" slot.
    Kept for backward compatibility with other slot machines.
    """
    import random
    
    # If no reel strips provided, fall back to uniform distribution
    if not reel_strips:
        symbol_list = list(symbols.keys())
        return [[random.choice(symbol_list) for _ in range(cols)] for _ in range(rows)]
    
    grid = []
    
    # For each reel (column), determine stop position and extract visible symbols
    reel_stops = []
    for col_idx in range(cols):
        # Get the physical reel strip for this column
        reel_strip = reel_strips.get(col_idx, reel_strips.get(0, []))
        
        if not reel_strip:
            # Fallback if no strip available
            symbol_list = list(symbols.keys())
            reel_stops.append([random.choice(symbol_list) for _ in range(rows)])
        else:
            # Roll RNG to determine stop position on this reel
            stop_position = random.randint(0, len(reel_strip) - 1)
            
            # Extract consecutive symbols starting from stop position
            visible_symbols = []
            for row_idx in range(rows):
                symbol_idx = (stop_position + row_idx) % len(reel_strip)
                visible_symbols.append(reel_strip[symbol_idx])
            
            reel_stops.append(visible_symbols)
    
    # Convert from column-major (reels) to row-major (grid) format
    for row_idx in range(rows):
        row = []
        for col_idx in range(cols):
            row.append(reel_stops[col_idx][row_idx])
        grid.append(row)
    
    return grid


def place_full_line_win(grid: list, line_num: int, symbol: str, symbols: dict) -> list:
    """Place a FULL LINE of matching symbols along a payline path."""
    if line_num not in PAYLINES_4x4:
        return grid
    
    line_path = PAYLINES_4x4[line_num]
    
    # Fill ALL positions with the winning symbol
    for (r, c) in line_path:
        grid[r][c] = symbol
    
    return grid


def break_accidental_wins(grid: list, active_lines: List[int], symbols: dict, exclude_lines: List[int] = None) -> list:
    """Break any accidental full-line wins on paylines that shouldn't win."""
    if exclude_lines is None:
        exclude_lines = []
    
    symbol_list = list(symbols.keys())
    
    for line_num in active_lines:
        if line_num in exclude_lines:
            continue
        if line_num not in PAYLINES_4x4:
            continue
        
        line_path = PAYLINES_4x4[line_num]
        win_info = check_payline_win(grid, line_path, symbols)
        
        if win_info:
            # Break this win by changing a random position on the line
            break_pos = random.randint(0, len(line_path) - 1)
            r, c = line_path[break_pos]
            base_sym = win_info["symbol"]
            # Pick a different non-wild symbol
            other_symbols = [s for s in symbol_list if s != base_sym and not symbols.get(s, {}).get("is_wild", False)]
            if other_symbols:
                grid[r][c] = random.choice(other_symbols)
    
    return grid


def map_outcome_to_reels(outcome: dict, symbols: dict, active_lines: List[int], rows: int = 4, cols: int = 4, reel_strips: dict = None) -> tuple:
    """
    Generate reels for FULL-LINE-ONLY wins using per-reel probability strips.
    
    Payout formula: bet_per_line × symbol_multiplier
    - Only pays when ALL 4 positions on a payline match
    - Wild symbols substitute but don't define base symbol
    - No partial payouts
    """
    # Start with random grid using per-reel weights
    grid = generate_random_grid(symbols, rows, cols, reel_strips)
    
    if outcome["type"] == "loss":
        # Break ALL accidental full-line wins
        grid = break_accidental_wins(grid, active_lines, symbols)
        # Double-check - should have no wins
        winning_paylines = validate_all_paylines(grid, active_lines, symbols)
        attempts = 0
        while winning_paylines and attempts < 10:
            grid = break_accidental_wins(grid, active_lines, symbols)
            winning_paylines = validate_all_paylines(grid, active_lines, symbols)
            attempts += 1
        return grid, []
    
    # Create winning outcome - FULL LINE wins
    win_symbol = outcome.get("symbol", "cherry")
    num_wins = outcome.get("wins", 1)
    
    # Select random paylines to be winners
    available_lines = [line for line in active_lines if line in PAYLINES_4x4]
    if not available_lines:
        return grid, []
    
    winning_line_nums = random.sample(available_lines, min(num_wins, len(available_lines)))
    
    # Place FULL LINE wins on selected paylines
    for line_num in winning_line_nums:
        grid = place_full_line_win(grid, line_num, win_symbol, symbols)
    
    # Break accidental wins on OTHER paylines
    grid = break_accidental_wins(grid, active_lines, symbols, exclude_lines=winning_line_nums)
    
    # VALIDATE: Check actual wins on grid
    winning_paylines = validate_all_paylines(grid, active_lines, symbols)
    
    return grid, winning_paylines

def calculate_slot_result(bet_per_line: float, active_lines: List[int], slot_id: str = "classic") -> dict:
    """
    TRUE REEL SLOT MACHINE - Pure RNG from physical reel strips with WILD NERF.
    
    How it works:
    1. Each reel gets ONE random stop position
    2. ONE random reel has Wild probability reduced from 3% to 0.1% (anti-farm)
    3. Visible rows are consecutive symbols from that position
    4. Paylines are evaluated for full-line matches only
    5. No manipulation - pure probability determines wins
    """
    config = SLOT_CONFIGS.get(slot_id, SLOT_CONFIGS["classic"])
    symbols = config["symbols"]
    reels_count = config["reels"]  # 4
    rows_count = config["rows"]    # 4
    reel_distributions = config.get("reel_distributions", None)
    
    # Step 1: Generate grid using TRUE reel logic with Wild nerf mechanic
    if slot_id == "classic" and reel_distributions:
        # Use Wild nerf for classic slot (main game)
        grid = generate_random_grid_with_wild_nerf(symbols, rows_count, reels_count, reel_distributions)
    else:
        # Use standard generation for other slots
        reel_strips = config.get("reel_strips", None)
        grid = generate_random_grid(symbols, rows_count, reels_count, reel_strips)
    
    # Step 2: Evaluate all active paylines for FULL-LINE wins only
    winning_paylines = validate_all_paylines(grid, active_lines, symbols)
    
    # Step 3: Calculate total bet and winnings
    total_bet = round(bet_per_line * len(active_lines), 2)
    total_win = 0.0
    
    # Calculate payout for each winning payline
    for wp in winning_paylines:
        line_payout = round(bet_per_line * wp["multiplier"], 2)
        wp["payout"] = line_payout
        total_win += line_payout
    
    total_win = round(total_win, 2)
    
    # Jackpot threshold: total win must be >= 20x total bet
    is_jackpot = total_win >= (total_bet * 20)
    
    return {
        "reels": grid,
        "total_bet": total_bet,
        "win_amount": total_win,
        "is_win": total_win > 0,
        "winning_paylines": winning_paylines,
        "is_jackpot": is_jackpot
    }

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
    """Get accurate stats from bet_history aggregation"""
    pipeline = [
        {"$match": {"user_id": user_id, "game_type": {"$ne": "wheel"}}},  # Exclude free wheel spins
        {"$group": {
            "_id": None,
            "total_wagered": {"$sum": "$bet_amount"},
            "total_won": {"$sum": "$win_amount"},
            "total_bets": {"$sum": 1},
            "wins": {"$sum": {"$cond": [{"$gt": ["$win_amount", "$bet_amount"]}, 1, 0]}},
            "losses": {"$sum": {"$cond": [{"$lte": ["$win_amount", "$bet_amount"]}, 1, 0]}}
        }}
    ]
    
    result = await db.bet_history.aggregate(pipeline).to_list(1)
    
    if result:
        stats = result[0]
        return {
            "total_wagered": round(stats.get("total_wagered", 0), 2),
            "total_won": round(stats.get("total_won", 0), 2),
            "net_profit": round(stats.get("total_won", 0) - stats.get("total_wagered", 0), 2),
            "total_spins": stats.get("total_bets", 0),
            "total_wins": stats.get("wins", 0),
            "total_losses": stats.get("losses", 0)
        }
    
    return {
        "total_wagered": 0.0,
        "total_won": 0.0,
        "net_profit": 0.0,
        "total_spins": 0,
        "total_wins": 0,
        "total_losses": 0
    }

async def send_discord_webhook(event_type: str, data: dict):
    """Send Discord webhook for big wins and level-ups"""
    if not DISCORD_WEBHOOK_URL:
        return
    
    try:
        embed = {
            "title": f"🎰 {event_type}",
            "color": 16766720 if "Win" in event_type else 5814783,
            "fields": [
                {"name": k, "value": str(v), "inline": True}
                for k, v in data.items()
            ],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        async with httpx.AsyncClient() as http_client:
            await http_client.post(
                DISCORD_WEBHOOK_URL,
                json={"embeds": [embed]}
            )
    except Exception as e:
        logging.error(f"Discord webhook error: {e}")

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Auto-generate email from username if not provided
    email = user_data.email if user_data.email else f"{user_data.username.lower()}@goladium.local"
    
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    existing_username = await db.users.find_one({"username": user_data.username}, {"_id": 0})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_password = pwd_context.hash(user_data.password)
    
    # Assign a random default jackpot pattern for new users
    import random
    default_patterns = ["default_lightblue", "default_pink", "default_red", "default_orange", "default_yellow"]
    assigned_pattern = random.choice(default_patterns)
    
    now = datetime.now(timezone.utc)
    user_doc = {
        "user_id": user_id,
        "email": email,
        "username": user_data.username,
        "password_hash": hashed_password,
        "balance": 10.0,
        "balance_a": 0.0,  # Prestige currency
        "level": 1,
        "xp": 0,
        "total_wagered": 0.0,
        "avatar": None,
        "vip_status": None,
        "name_color": None,
        "badge": None,
        "frame": None,
        "active_tag": None,
        "active_name_color": None,
        "active_jackpot_pattern": assigned_pattern,  # Default pattern assigned
        "created_at": now.isoformat(),
        "last_wheel_spin": None
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_jwt_token(user_id)
    
    # JWT auth uses Authorization header only - no cookies
    # This prevents mixing up JWT and session-based auth
    
    user_response = UserResponse(
        user_id=user_id,
        email=email,
        username=user_data.username,
        balance=50.0,
        balance_a=0.0,
        level=1,
        xp=0,
        total_spins=0,
        total_wins=0,
        total_losses=0,
        net_profit=0.0,
        total_wagered=0.0,
        avatar=None,
        vip_status=None,
        name_color=None,
        badge=None,
        frame=None,
        active_tag=None,
        active_name_color=None,
        active_jackpot_pattern=None,
        created_at=now,
        last_wheel_spin=None
    )
    
    return TokenResponse(access_token=token, user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"username": credentials.username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # 🔒 BAN CHECK (time-based)
    check_user_banned(user)
    
    if not pwd_context.verify(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    token = create_jwt_token(user["user_id"])
    
    # JWT auth uses Authorization header only - no cookies
    # This prevents mixing up JWT and session-based auth
    
    # Get accurate stats from history
    stats = await get_user_stats_from_history(user["user_id"])
    
    # Get XP progress info
    current_xp = max(0, user.get("xp", 0))
    current_level = user.get("level", 1)
    xp_progress = get_xp_for_next_level(current_level, current_xp)
    
    created_at = user.get("created_at")
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    
    last_wheel = user.get("last_wheel_spin")
    if isinstance(last_wheel, str):
        last_wheel = datetime.fromisoformat(last_wheel)
    
    user_response = UserResponse(
        user_id=user["user_id"],
        email=user["email"],
        username=user["username"],
        balance=user.get("balance", 50.0),
        balance_a=user.get("balance_a", 0.0),
        level=current_level,
        xp=current_xp,
        xp_progress=xp_progress,
        total_spins=stats["total_spins"],
        total_wins=stats["total_wins"],
        total_losses=stats["total_losses"],
        net_profit=stats["net_profit"],
        total_wagered=stats["total_wagered"],
        avatar=user.get("avatar"),
        vip_status=user.get("vip_status"),
        name_color=user.get("name_color"),
        badge=user.get("badge"),
        frame=user.get("frame"),
        active_tag=user.get("active_tag"),
        active_name_color=user.get("active_name_color"),
        active_jackpot_pattern=user.get("active_jackpot_pattern"),
        created_at=created_at,
        last_wheel_spin=last_wheel
    )
    
    return TokenResponse(access_token=token, user=user_response)

@api_router.get("/auth/session")
async def get_session_from_google(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session ID")
    
    async with httpx.AsyncClient() as http_client:
        auth_response = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        google_data = auth_response.json()
    
    email = google_data.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="No email from Google")
    
    name = google_data.get("name", "User")
    picture = google_data.get("picture")
    
    # Generate our own secure session token instead of using Google's
    # This ensures we have full control over the session
    session_token = secrets.token_urlsafe(32)
    
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    
    if existing_user:
        user_id = existing_user["user_id"]
        if picture:
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"avatar": picture}}
            )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        username = name.replace(" ", "_").lower()[:20] + "_" + uuid.uuid4().hex[:4]
        
        user_doc = {
            "user_id": user_id,
            "email": email,
            "username": username,
            "password_hash": None,
            "balance": 10.0,
            "level": 1,
            "xp": 0,
            "total_wagered": 0.0,
            "avatar": picture,
            "vip_status": None,
            "name_color": None,
            "badge": None,
            "frame": None,
            "balance_a": 0.0,
            "active_tag": None,
            "active_name_color": None,
            "active_jackpot_pattern": None,
            "created_at": now.isoformat(),
            "last_wheel_spin": None
        }
        
        await db.users.insert_one(user_doc)
    
    expires_at = now + timedelta(days=7)
    
    # Store session with the token as primary key for fast lookup
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "user_id": user_id,
                "session_token": session_token,
                "expires_at": expires_at.isoformat(),
                "created_at": now.isoformat()
            }
        },
        upsert=True
    )
    
    # Also clean up any old sessions for this user
    await db.user_sessions.delete_many({
        "user_id": user_id,
        "session_token": {"$ne": session_token}
    })
    
    # Use oauth_session cookie (separate from any JWT tokens)
    response.set_cookie(
        key="oauth_session",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 3600,
        path="/"
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    stats = await get_user_stats_from_history(user_id)
    
    created_at = user.get("created_at")
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    
    last_wheel = user.get("last_wheel_spin")
    if isinstance(last_wheel, str):
        last_wheel = datetime.fromisoformat(last_wheel)
    
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "username": user["username"],
        "balance": user.get("balance", 50.0),
        "balance_a": user.get("balance_a", 0.0),
        "level": user.get("level", 1),
        "xp": max(0, user.get("xp", 0)),
        "total_spins": stats["total_spins"],
        "total_wins": stats["total_wins"],
        "total_losses": stats["total_losses"],
        "net_profit": stats["net_profit"],
        "total_wagered": stats["total_wagered"],
        "avatar": user.get("avatar"),
        "vip_status": user.get("vip_status"),
        "name_color": user.get("name_color"),
        "badge": user.get("badge"),
        "frame": user.get("frame"),
        "active_tag": user.get("active_tag"),
        "active_name_color": user.get("active_name_color"),
        "active_jackpot_pattern": user.get("active_jackpot_pattern"),
        "created_at": created_at.isoformat() if created_at else None,
        "last_wheel_spin": last_wheel.isoformat() if last_wheel else None
    }

@api_router.get("/auth/me")
async def get_current_user_info(request: Request):
    user = await get_current_user(request)
    stats = await get_user_stats_from_history(user["user_id"])
    
    # Get XP progress info
    current_xp = max(0, user.get("xp", 0))
    current_level = user.get("level", 1)
    xp_progress = get_xp_for_next_level(current_level, current_xp)
    
    created_at = user.get("created_at")
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    
    last_wheel = user.get("last_wheel_spin")
    if isinstance(last_wheel, str):
        last_wheel = datetime.fromisoformat(last_wheel)
    
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "username": user["username"],
        "balance": user.get("balance", 50.0),
        "balance_a": user.get("balance_a", 0.0),
        "level": current_level,
        "xp": current_xp,
        "xp_progress": xp_progress,
        "total_spins": stats["total_spins"],
        "total_wins": stats["total_wins"],
        "total_losses": stats["total_losses"],
        "net_profit": stats["net_profit"],
        "total_wagered": stats["total_wagered"],
        "avatar": user.get("avatar"),
        "vip_status": user.get("vip_status"),
        "name_color": user.get("name_color"),
        "badge": user.get("badge"),
        "frame": user.get("frame"),
        "active_tag": user.get("active_tag"),
        "active_name_color": user.get("active_name_color"),
        "active_jackpot_pattern": user.get("active_jackpot_pattern"),
        "created_at": created_at.isoformat() if created_at else None,
        "last_wheel_spin": last_wheel.isoformat() if last_wheel else None
    }

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    # Check for OAuth session cookie
    oauth_session = request.cookies.get("oauth_session")
    
    if oauth_session:
        await db.user_sessions.delete_one({"session_token": oauth_session})
    
    # Delete the OAuth session cookie
    response.delete_cookie(
        key="oauth_session",
        path="/",
        secure=True,
        samesite="none"
    )
    
    return {"message": "Logged out successfully"}

# ============== USER AVATAR ENDPOINTS ==============

class AvatarUpdate(BaseModel):
    avatar: str  # Base64 encoded image

@api_router.post("/user/avatar")
async def update_avatar(avatar_data: AvatarUpdate, request: Request):
    """Update user's profile picture"""
    user = await get_current_user(request)
    
    # Validate base64 image (should start with data:image/)
    if not avatar_data.avatar.startswith('data:image/'):
        raise HTTPException(status_code=400, detail="Invalid image format")
    
    # Check size (rough estimate - base64 is ~33% larger than original)
    # Max 5MB original = ~6.7MB base64
    if len(avatar_data.avatar) > 7 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"avatar": avatar_data.avatar}}
    )
    
    return {"message": "Avatar updated successfully", "avatar": avatar_data.avatar}

@api_router.delete("/user/avatar")
async def delete_avatar(request: Request):
    """Remove user's profile picture"""
    user = await get_current_user(request)
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"avatar": None}}
    )
    
    return {"message": "Avatar removed successfully"}

# ============== SLOT GAME ENDPOINTS ==============

@api_router.get("/games/slots")
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

@api_router.get("/games/slot/{slot_id}/info")
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

@api_router.post("/games/slot/spin", response_model=SlotResult)
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
    
    # Update quest progress
    await update_quest_progress(user["user_id"], "spins", 1, bet_amount=total_bet)
    await update_quest_progress(user["user_id"], "total_wagered", int(total_bet))
    if result["is_win"]:
        await update_quest_progress(user["user_id"], "wins", 1, bet_amount=total_bet)
    
    # Record big wins (>= 10 G) to live feed
    if win_amount >= 10:
        await record_big_win(
            user=user,
            game_type="slot",
            bet_amount=total_bet,
            win_amount=win_amount,
            slot_id=slot_id,
            slot_name=SLOT_CONFIGS[slot_id]["name"]
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

# Legacy endpoint for backwards compatibility
@api_router.get("/games/slot/info")
async def get_classic_slot_info():
    return await get_slot_info("classic")

# ============== LUCKY WHEEL ENDPOINTS ==============

@api_router.post("/games/wheel/spin", response_model=WheelSpinResult)
async def spin_lucky_wheel(request: Request):
    user = await get_current_user(request)
    
    last_spin = user.get("last_wheel_spin")
    now = datetime.now(timezone.utc)
    
    if last_spin:
        if isinstance(last_spin, str):
            last_spin = datetime.fromisoformat(last_spin)
        if last_spin.tzinfo is None:
            last_spin = last_spin.replace(tzinfo=timezone.utc)
        
        time_diff = (now - last_spin).total_seconds()
        if time_diff < 300:
            next_available = last_spin + timedelta(minutes=5)
            raise HTTPException(
                status_code=400,
                detail=f"Wheel on cooldown. Next spin available at {next_available.isoformat()}"
            )
    
    # Lucky wheel probabilities: 75% = 1G, 24% = 5G, 1% = 15G
    rand = random.random() * 100
    
    if rand < 1:
        reward = 15.0
    elif rand < 25:
        reward = 5.0
    else:
        reward = 1.0
    
    new_balance = round(user["balance"] + reward, 2)
    next_spin = now + timedelta(minutes=5)
    
    # Update user (NO XP for free rewards)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {
                "balance": new_balance,
                "last_wheel_spin": now.isoformat()
            }
        }
    )
    
    # Record history (marked as free/wheel type)
    bet_doc = {
        "bet_id": f"bet_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "timestamp": now.isoformat(),
        "game_type": "wheel",
        "bet_amount": 0,
        "result": "win",
        "win_amount": reward,
        "net_outcome": reward,
        "details": {"reward_tier": "jackpot" if reward == 15 else "high" if reward == 5 else "standard"}
    }
    
    await db.bet_history.insert_one(bet_doc)
    
    return WheelSpinResult(
        reward=reward,
        new_balance=new_balance,
        next_spin_available=next_spin
    )

@api_router.get("/games/wheel/status")
async def get_wheel_status(request: Request):
    user = await get_current_user(request)
    
    last_spin = user.get("last_wheel_spin")
    now = datetime.now(timezone.utc)
    
    if not last_spin:
        return {
            "can_spin": True,
            "next_spin_available": None,
            "seconds_remaining": 0
        }
    
    if isinstance(last_spin, str):
        last_spin = datetime.fromisoformat(last_spin)
    if last_spin.tzinfo is None:
        last_spin = last_spin.replace(tzinfo=timezone.utc)
    
    time_diff = (now - last_spin).total_seconds()
    
    if time_diff >= 300:
        return {
            "can_spin": True,
            "next_spin_available": None,
            "seconds_remaining": 0
        }
    
    next_available = last_spin + timedelta(minutes=5)
    seconds_remaining = int(300 - time_diff)
    
    return {
        "can_spin": False,
        "next_spin_available": next_available.isoformat(),
        "seconds_remaining": seconds_remaining
    }

# ============== JACKPOT ENDPOINTS ==============

@api_router.get("/games/jackpot/status")
async def get_jackpot_status():
    """Get current jackpot status"""
    async with jackpot_lock:
        now = datetime.now(timezone.utc)
        
        # Check if waiting period expired without second player
        if jackpot_state["state"] == "waiting" and jackpot_state["countdown_end"]:
            countdown_end = datetime.fromisoformat(jackpot_state["countdown_end"])
            if countdown_end.tzinfo is None:
                countdown_end = countdown_end.replace(tzinfo=timezone.utc)
            
            if now >= countdown_end:
                # Refund all participants and reset
                for p in jackpot_state["participants"]:
                    await db.users.update_one(
                        {"user_id": p["user_id"]},
                        {"$inc": {"balance": p["bet_amount"]}}
                    )
                
                jackpot_state.update({
                    "state": "idle",
                    "jackpot_id": None,
                    "participants": [],
                    "total_pot": 0.0,
                    "started_at": None,
                    "countdown_end": None,
                    "winner": None,
                    "winner_index": None
                })
                
                return JackpotStatus(
                    state="idle",
                    total_pot=0.0,
                    participants=[],
                    countdown_seconds=None,
                    winner=None,
                    winner_index=None,
                    jackpot_id=None,
                    max_participants=JACKPOT_MAX_PARTICIPANTS,
                    is_full=False
                )
        
        # AUTO-SPIN: Check if active countdown expired with 2+ players
        if jackpot_state["state"] == "active" and jackpot_state["countdown_end"]:
            countdown_end = datetime.fromisoformat(jackpot_state["countdown_end"])
            if countdown_end.tzinfo is None:
                countdown_end = countdown_end.replace(tzinfo=timezone.utc)
            
            if now >= countdown_end and len(jackpot_state["participants"]) >= JACKPOT_MIN_PARTICIPANTS:
                # Auto-trigger the spin
                jackpot_state["state"] = "spinning"
                
                # Weighted random selection
                total = jackpot_state["total_pot"]
                rand = random.random() * total
                cumulative = 0
                winner = None
                winner_index = 0
                
                for idx, p in enumerate(jackpot_state["participants"]):
                    cumulative += p["bet_amount"]
                    if rand <= cumulative:
                        winner = p
                        winner_index = idx
                        break
                
                if not winner:
                    winner = jackpot_state["participants"][-1]
                    winner_index = len(jackpot_state["participants"]) - 1
                
                # Store winner_index for frontend animation
                jackpot_state["winner_index"] = winner_index
                
                # Award winner
                await db.users.update_one(
                    {"user_id": winner["user_id"]},
                    {"$inc": {"balance": jackpot_state["total_pot"]}}
                )
                
                # Update bet_history for ALL participants (update pending entries)
                win_timestamp = (now + timedelta(milliseconds=1)).isoformat()
                for p in jackpot_state["participants"]:
                    is_winner = p["user_id"] == winner["user_id"]
                    win_amount = jackpot_state["total_pot"] if is_winner else 0
                    
                    # Update the pending bet entry to final result
                    await db.bet_history.update_one(
                        {
                            "user_id": p["user_id"],
                            "game_type": "jackpot",
                            "details.jackpot_id": jackpot_state["jackpot_id"],
                            "result": "pending"
                        },
                        {
                            "$set": {
                                "result": "win" if is_winner else "loss",
                                "win_amount": win_amount,
                                "net_outcome": round(win_amount - p["bet_amount"], 2),
                                "details.status": "completed",
                                "details.total_pot": jackpot_state["total_pot"],
                                "details.participants": len(jackpot_state["participants"]),
                                "details.is_winner": is_winner
                            }
                        }
                    )
                    
                    # Create separate WIN entry for the winner
                    if is_winner:
                        await db.bet_history.insert_one({
                            "bet_id": f"win_{uuid.uuid4().hex[:12]}",
                            "user_id": p["user_id"],
                            "game_type": "jackpot",
                            "transaction_type": "win",
                            "amount": jackpot_state["total_pot"],
                            "win_amount": jackpot_state["total_pot"],
                            "timestamp": win_timestamp,
                            "details": {
                                "jackpot_id": jackpot_state["jackpot_id"],
                                "status": "won",
                                "total_pot": jackpot_state["total_pot"],
                                "participants": len(jackpot_state["participants"]),
                                "bet_amount": p["bet_amount"]
                            }
                        })
                
                # Update quest progress for jackpot WIN
                await update_quest_progress(
                    winner["user_id"], 
                    "jackpot_wins", 
                    1, 
                    pot_size=jackpot_state["total_pot"]
                )
                
                # Record jackpot history
                await db.jackpot_history.insert_one({
                    "jackpot_id": jackpot_state["jackpot_id"],
                    "winner_id": winner["user_id"],
                    "winner_username": winner["username"],
                    "total_pot": jackpot_state["total_pot"],
                    "participants": jackpot_state["participants"],
                    "timestamp": now.isoformat()
                })
                
                # Record big win for jackpot (if >= 10 G)
                win_chance = round(winner["bet_amount"] / total * 100, 2)
                if jackpot_state["total_pot"] >= 10:
                    winner_user = await db.users.find_one({"user_id": winner["user_id"]})
                    if winner_user:
                        await record_big_win(
                            user=winner_user,
                            game_type="jackpot",
                            bet_amount=winner["bet_amount"],
                            win_amount=jackpot_state["total_pot"],
                            win_chance=win_chance
                        )
                
                winner_data = JackpotParticipant(
                    user_id=winner["user_id"],
                    username=winner["username"],
                    bet_amount=winner["bet_amount"],
                    win_chance=win_chance,
                    avatar=winner.get("avatar")
                )
                
                jackpot_state["winner"] = winner_data
                jackpot_state["state"] = "complete"
                
                # Reset after 10 seconds
                async def reset_jackpot():
                    await asyncio.sleep(10)
                    async with jackpot_lock:
                        if jackpot_state["state"] == "complete":
                            jackpot_state.update({
                                "state": "idle",
                                "jackpot_id": None,
                                "participants": [],
                                "total_pot": 0.0,
                                "started_at": None,
                                "countdown_end": None,
                                "winner": None,
                                "winner_index": None
                            })
                
                asyncio.create_task(reset_jackpot())
        
        # Calculate countdown
        countdown_seconds = None
        if jackpot_state["countdown_end"]:
            countdown_end = datetime.fromisoformat(jackpot_state["countdown_end"])
            if countdown_end.tzinfo is None:
                countdown_end = countdown_end.replace(tzinfo=timezone.utc)
            countdown_seconds = max(0, int((countdown_end - now).total_seconds()))
        
        # Update win chances
        participants = []
        for p in jackpot_state["participants"]:
            win_chance = (p["bet_amount"] / jackpot_state["total_pot"] * 100) if jackpot_state["total_pot"] > 0 else 0
            participants.append(JackpotParticipant(
                user_id=p["user_id"],
                username=p["username"],
                bet_amount=p["bet_amount"],
                win_chance=round(win_chance, 2),
                avatar=p.get("avatar"),
                jackpot_pattern=p.get("jackpot_pattern")
            ))
        
        return JackpotStatus(
            state=jackpot_state["state"],
            total_pot=jackpot_state["total_pot"],
            participants=participants,
            countdown_seconds=countdown_seconds,
            winner=jackpot_state.get("winner"),
            winner_index=jackpot_state.get("winner_index"),
            jackpot_id=jackpot_state.get("jackpot_id"),
            max_participants=JACKPOT_MAX_PARTICIPANTS,
            is_full=len(jackpot_state["participants"]) >= JACKPOT_MAX_PARTICIPANTS
        )

@api_router.post("/games/jackpot/join")
async def join_jackpot(join_request: JackpotJoinRequest, request: Request):
    """Join the jackpot with a bet"""
    user = await get_current_user(request)
    bet_amount = round(join_request.bet_amount, 2)
    
    if user["balance"] < bet_amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    async with jackpot_lock:
        now = datetime.now(timezone.utc)
        
        # Check if user already in jackpot
        for p in jackpot_state["participants"]:
            if p["user_id"] == user["user_id"]:
                raise HTTPException(status_code=400, detail="Already in jackpot")
        
        # Check state
        if jackpot_state["state"] not in ["idle", "waiting", "active"]:
            raise HTTPException(status_code=400, detail="Jackpot not accepting entries")
        
        # Check participant cap (50 players max)
        if len(jackpot_state["participants"]) >= JACKPOT_MAX_PARTICIPANTS:
            raise HTTPException(
                status_code=400, 
                detail=f"Jackpot full ({JACKPOT_MAX_PARTICIPANTS} players max). Please wait for next round."
            )
        
        # Deduct balance
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$inc": {"balance": -bet_amount}}
        )
        
        # Generate jackpot_id if first player
        if jackpot_state["state"] == "idle":
            jackpot_state["jackpot_id"] = f"jp_{uuid.uuid4().hex[:12]}"
        
        # Add participant with their active pattern for visual customization
        jackpot_state["participants"].append({
            "user_id": user["user_id"],
            "username": user["username"],
            "bet_amount": bet_amount,
            "avatar": user.get("avatar"),
            "jackpot_pattern": user.get("active_jackpot_pattern")  # For tile styling
        })
        jackpot_state["total_pot"] = round(jackpot_state["total_pot"] + bet_amount, 2)
        
        # Calculate and update XP for jackpot bet (100 XP per 1 G wagered)
        xp_gained = calculate_xp(bet_amount)
        new_xp = max(0, user.get("xp", 0) + xp_gained)
        new_level = calculate_level(new_xp)
        
        # Update user XP and level
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"xp": new_xp, "level": new_level}}
        )
        
        # Record bet entry as separate transaction (bet placed)
        await db.bet_history.insert_one({
            "bet_id": f"bet_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "game_type": "jackpot",
            "slot_id": None,
            "transaction_type": "bet",
            "amount": -bet_amount,  # Negative for bet
            "bet_amount": bet_amount,
            "timestamp": now.isoformat(),
            "result": "pending",  # Will be updated when jackpot completes
            "details": {
                "jackpot_id": jackpot_state["jackpot_id"],
                "status": "entered"
            }
        })
        
        # State transitions
        if jackpot_state["state"] == "idle":
            # First player - start waiting period
            jackpot_state["state"] = "waiting"
            jackpot_state["started_at"] = now.isoformat()
            jackpot_state["countdown_end"] = (now + timedelta(seconds=JACKPOT_WAIT_SECONDS)).isoformat()
        
        elif jackpot_state["state"] == "waiting" and len(jackpot_state["participants"]) >= JACKPOT_MIN_PARTICIPANTS:
            # Minimum players reached - start countdown
            jackpot_state["state"] = "active"
            jackpot_state["countdown_end"] = (now + timedelta(seconds=JACKPOT_COUNTDOWN_SECONDS)).isoformat()
        
        return {"message": "Joined jackpot", "jackpot_id": jackpot_state["jackpot_id"]}

@api_router.post("/games/jackpot/spin")
async def spin_jackpot(request: Request):
    """Spin the jackpot wheel (admin or auto-trigger)"""
    async with jackpot_lock:
        if jackpot_state["state"] != "active":
            raise HTTPException(status_code=400, detail="Jackpot not ready to spin")
        
        if len(jackpot_state["participants"]) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 participants")
        
        now = datetime.now(timezone.utc)
        
        # Check if countdown finished
        if jackpot_state["countdown_end"]:
            countdown_end = datetime.fromisoformat(jackpot_state["countdown_end"])
            if countdown_end.tzinfo is None:
                countdown_end = countdown_end.replace(tzinfo=timezone.utc)
            
            if now < countdown_end:
                raise HTTPException(status_code=400, detail="Countdown not finished")
        
        jackpot_state["state"] = "spinning"
        
        # Weighted random selection
        total = jackpot_state["total_pot"]
        rand = random.random() * total
        cumulative = 0
        winner = None
        winner_index = 0
        
        for idx, p in enumerate(jackpot_state["participants"]):
            cumulative += p["bet_amount"]
            if rand <= cumulative:
                winner = p
                winner_index = idx
                break
        
        if not winner:
            winner = jackpot_state["participants"][-1]
            winner_index = len(jackpot_state["participants"]) - 1
        
        # Store winner_index for frontend animation
        jackpot_state["winner_index"] = winner_index
        
        # Award winner
        await db.users.update_one(
            {"user_id": winner["user_id"]},
            {"$inc": {"balance": jackpot_state["total_pot"]}}
        )
        
        # Record WIN entry for the winner as a separate transaction
        # Win timestamp is 1 millisecond later than bet to ensure correct ordering
        win_timestamp = (now + timedelta(milliseconds=1)).isoformat()
        for p in jackpot_state["participants"]:
            is_winner = p["user_id"] == winner["user_id"]
            win_amount = jackpot_state["total_pot"] if is_winner else 0
            
            # Update the pending bet entry to final result
            await db.bet_history.update_one(
                {
                    "user_id": p["user_id"],
                    "game_type": "jackpot",
                    "details.jackpot_id": jackpot_state["jackpot_id"],
                    "result": "pending"
                },
                {
                    "$set": {
                        "result": "win" if is_winner else "loss",
                        "win_amount": win_amount,
                        "net_outcome": round(win_amount - p["bet_amount"], 2),
                        "details.status": "completed",
                        "details.total_pot": jackpot_state["total_pot"],
                        "details.participants": len(jackpot_state["participants"]),
                        "details.is_winner": is_winner
                    }
                }
            )
            
            if is_winner:
                # Create separate win entry
                await db.bet_history.insert_one({
                    "bet_id": f"win_{uuid.uuid4().hex[:12]}",
                    "user_id": p["user_id"],
                    "game_type": "jackpot",
                    "transaction_type": "win",
                    "amount": jackpot_state["total_pot"],  # Positive for win
                    "win_amount": jackpot_state["total_pot"],
                    "timestamp": win_timestamp,  # Slightly later than bet
                    "details": {
                        "jackpot_id": jackpot_state["jackpot_id"],
                        "status": "won",
                        "total_pot": jackpot_state["total_pot"],
                        "participants": len(jackpot_state["participants"]),
                        "bet_amount": p["bet_amount"]
                    }
                })
        
        # Record jackpot history
        await db.jackpot_history.insert_one({
            "jackpot_id": jackpot_state["jackpot_id"],
            "winner_id": winner["user_id"],
            "winner_username": winner["username"],
            "total_pot": jackpot_state["total_pot"],
            "participants": jackpot_state["participants"],
            "timestamp": now.isoformat()
        })
        
        # Record big win for jackpot (if >= 10 G)
        win_chance = round(winner["bet_amount"] / total * 100, 2)
        if jackpot_state["total_pot"] >= 10:
            winner_user = await db.users.find_one({"user_id": winner["user_id"]})
            if winner_user:
                await record_big_win(
                    user=winner_user,
                    game_type="jackpot",
                    bet_amount=winner["bet_amount"],
                    win_amount=jackpot_state["total_pot"],
                    win_chance=win_chance
                )
        
        # Update quest progress for jackpot WIN (only wins count, with pot size validation)
        await update_quest_progress(
            winner["user_id"], 
            "jackpot_wins", 
            1, 
            pot_size=jackpot_state["total_pot"]
        )
        
        # Discord webhook
        await send_discord_webhook("Jackpot Winner!", {
            "Winner": winner["username"],
            "Prize": f"{jackpot_state['total_pot']} G",
            "Players": len(jackpot_state["participants"])
        })
        
        winner_data = JackpotParticipant(
            user_id=winner["user_id"],
            username=winner["username"],
            bet_amount=winner["bet_amount"],
            win_chance=round(winner["bet_amount"] / total * 100, 2),
            avatar=winner.get("avatar")
        )
        
        jackpot_state["winner"] = winner_data
        jackpot_state["state"] = "complete"
        
        # Reset after 10 seconds
        async def reset_jackpot():
            await asyncio.sleep(10)
            async with jackpot_lock:
                jackpot_state.update({
                    "state": "idle",
                    "jackpot_id": None,
                    "participants": [],
                    "total_pot": 0.0,
                    "started_at": None,
                    "countdown_end": None,
                    "winner": None,
                    "winner_index": None
                })
        
        asyncio.create_task(reset_jackpot())
        
        return {"winner": winner_data, "total_pot": total}

# ============== USER ENDPOINTS ==============

@api_router.get("/user/history")
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

@api_router.get("/user/stats")
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

@api_router.get("/leaderboard", response_model=List[LeaderboardEntry])
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

@api_router.get("/leaderboards/balance")
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

@api_router.get("/leaderboards/level")
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

@api_router.get("/leaderboards/biggest-wins")
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
            "frame": w.get("frame")
        }
        for idx, w in enumerate(big_wins)
    ]

@api_router.get("/live-wins")
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
            "avatar": w.get("avatar")
        }
        for w in big_wins
    ]

async def record_big_win(user: dict, game_type: str, bet_amount: float, win_amount: float, 
                         slot_id: str = None, slot_name: str = None, win_chance: float = None):
    """Record a big win (> 10 G) to the big_wins collection"""
    if win_amount < 10:
        return  # Only track wins >= 10 G
    
    win_doc = {
        "win_id": f"win_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "username": user["username"],
        "game_type": game_type,
        "slot_id": slot_id,
        "slot_name": slot_name,
        "bet_amount": round(bet_amount, 2),
        "win_amount": round(win_amount, 2),
        "win_chance": win_chance,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "avatar": user.get("avatar"),
        "frame": user.get("frame")
    }
    
    await db.big_wins.insert_one(win_doc)

# ============== ITEM SYSTEM ENDPOINTS ==============

@api_router.get("/items")
async def get_all_items():
    """Get all item definitions (for reference/admin)"""
    items = await db.items.find({}, {"_id": 0}).to_list(100)
    return items

@api_router.get("/items/{item_id}")
async def get_item(item_id: str):
    """Get a specific item definition"""
    item = await db.items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@api_router.get("/shop")
async def get_shop_items():
    """Get all active shop items"""
    now = datetime.now(timezone.utc)
    # Also create naive version for comparison with naive datetimes in DB
    now_naive = datetime.utcnow()
    
    # Find active listings that are within their availability window
    # Use datetime comparison since dates are stored as datetime objects
    listings = await db.shop_listings.find({
        "is_active": True,
        "available_from": {"$lte": now_naive},
        "$or": [
            {"available_until": None},
            {"available_until": {"$gte": now_naive}}
        ]
    }, {"_id": 0}).to_list(100)
    
    # Enrich with rarity info
    for listing in listings:
        rarity_info = ITEM_RARITIES.get(listing.get("item_rarity", "common"), ITEM_RARITIES["common"])
        listing["rarity_display"] = rarity_info["name"]
        listing["rarity_color"] = rarity_info["color"]
        
        # Convert datetime to ISO string for JSON serialization
        if listing.get("available_from"):
            listing["available_from"] = listing["available_from"].isoformat() if isinstance(listing["available_from"], datetime) else listing["available_from"]
        if listing.get("available_until"):
            until = listing["available_until"]
            if isinstance(until, datetime):
                remaining = until - now_naive
                listing["days_remaining"] = max(0, remaining.days)
                listing["hours_remaining"] = max(0, int(remaining.seconds / 3600))
                listing["available_until"] = until.isoformat()
            else:
                listing["days_remaining"] = None
                listing["hours_remaining"] = None
        else:
            listing["days_remaining"] = None
            listing["hours_remaining"] = None
    
    return listings

@api_router.get("/shop/history")
async def get_shop_history():
    """Get expired/out of print shop items"""
    now = datetime.now(timezone.utc)
    
    # Find listings that have expired (out of print)
    expired = await db.shop_listings.find({
        "is_active": False
    }, {"_id": 0}).sort("available_until", -1).to_list(50)
    
    for listing in expired:
        rarity_info = ITEM_RARITIES.get(listing.get("item_rarity", "common"), ITEM_RARITIES["common"])
        listing["rarity_display"] = rarity_info["name"]
        listing["rarity_color"] = rarity_info["color"]
    
    return expired

@api_router.post("/shop/purchase")
async def purchase_shop_item(purchase: ShopPurchaseRequest, request: Request):
    """Purchase an item from the shop"""
    user = await get_current_user(request)
    now_naive = datetime.utcnow()
    
    # Find the shop listing
    listing = await db.shop_listings.find_one({
        "shop_listing_id": purchase.shop_listing_id,
        "is_active": True
    })
    
    if not listing:
        raise HTTPException(status_code=404, detail="Shop listing not found or no longer available")
    
    # Check availability window
    if listing.get("available_until"):
        until = listing["available_until"]
        if isinstance(until, str):
            until = datetime.fromisoformat(until.replace('Z', '+00:00')).replace(tzinfo=None)
        if now_naive > until:
            raise HTTPException(status_code=400, detail="This item is no longer available in the shop")
    
    # Check stock limit
    if listing.get("stock_limit") is not None:
        if listing.get("stock_sold", 0) >= listing["stock_limit"]:
            raise HTTPException(status_code=400, detail="This item is sold out")
    
    # Check user balance
    price = listing["price"]
    user_doc = await db.users.find_one({"user_id": user["user_id"]})
    if not user_doc or user_doc.get("balance", 0) < price:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Check if user already owns this item (optional - can own multiple)
    # For now, allow multiple purchases (collectibles can stack)
    
    # Deduct balance
    new_balance = round(user_doc["balance"] - price, 2)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"balance": new_balance}}
    )
    
    # Add item to inventory - store purchase_price for sell calculation
    inventory_item = {
        "inventory_id": f"inv_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "item_id": listing["item_id"],
        "item_name": listing["item_name"],
        "item_rarity": listing["item_rarity"],
        "item_image": listing.get("item_image"),
        "item_flavor_text": listing.get("item_flavor_text", ""),
        "purchase_price": price,  # Store actual purchase price for sell calculation
        "acquired_at": now_naive.isoformat(),
        "acquired_from": "shop"
    }
    await db.user_inventory.insert_one(inventory_item)
    
    # Update stock sold
    await db.shop_listings.update_one(
        {"shop_listing_id": purchase.shop_listing_id},
        {"$inc": {"stock_sold": 1}}
    )
    
    # Track purchase in activity/bet_history
    activity_doc = {
        "bet_id": f"item_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "game_type": "item_purchase",
        "bet_amount": price,
        "win_amount": 0,
        "net_outcome": -price,  # Negative because spending G
        "result": "purchase",
        "timestamp": now_naive.isoformat(),
        "details": {
            "item_id": listing["item_id"],
            "item_name": listing["item_name"],
            "item_rarity": listing["item_rarity"],
            "action": "buy"
        }
    }
    await db.bet_history.insert_one(activity_doc)
    
    return {
        "success": True,
        "message": f"Successfully purchased {listing['item_name']}!",
        "item": {
            "inventory_id": inventory_item["inventory_id"],
            "item_id": listing["item_id"],
            "item_name": listing["item_name"],
            "item_rarity": listing["item_rarity"]
        },
        "new_balance": new_balance
    }

@api_router.get("/inventory")
async def get_user_inventory(request: Request):
    """Get current user's inventory"""
    user = await get_current_user(request)
    
    items = await db.user_inventory.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("acquired_at", -1).to_list(500)
    
    # Sell fee percentage (30% fee = 70% return)
    SELL_FEE_PERCENT = 30
    SELL_RETURN_PERCENT = 100 - SELL_FEE_PERCENT
    
    # Enrich with rarity info and sell values
    for item in items:
        rarity_info = ITEM_RARITIES.get(item.get("item_rarity", "common"), ITEM_RARITIES["common"])
        item["rarity_display"] = rarity_info["name"]
        item["rarity_color"] = rarity_info["color"]
        
        # Get item's current state (tradeable/sellable)
        item_def = await db.items.find_one({"item_id": item["item_id"]}, {"_id": 0})
        if item_def:
            item["is_tradeable"] = item_def.get("is_tradeable", False)
            item["is_sellable"] = item_def.get("is_sellable", False)
        else:
            item["is_tradeable"] = False
            item["is_sellable"] = False
        
        # Get purchase price - if not set, migrate from current shop price and SAVE it permanently
        purchase_price = item.get("purchase_price", 0)
        
        if purchase_price <= 0:
            # Try to get current shop price and save it permanently to this item
            shop_listing = await db.shop_listings.find_one(
                {"item_id": item["item_id"], "is_active": True},
                {"_id": 0, "price": 1}
            )
            if shop_listing:
                purchase_price = shop_listing.get("price", 0)
                # Permanently save the purchase_price to this inventory item
                await db.user_inventory.update_one(
                    {"inventory_id": item["inventory_id"]},
                    {"$set": {"purchase_price": purchase_price}}
                )
        
        item["purchase_price"] = purchase_price
        item["sell_value"] = round(purchase_price * SELL_RETURN_PERCENT / 100, 2)
        item["sell_fee_percent"] = SELL_FEE_PERCENT
    
    return {
        "items": items,
        "total_items": len(items)
    }

@api_router.get("/inventory/{user_id}")
async def get_user_inventory_public(user_id: str):
    """Get a user's inventory (public view - for profiles)"""
    # Verify user exists
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    items = await db.user_inventory.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("acquired_at", -1).to_list(500)
    
    # Enrich with rarity info
    for item in items:
        rarity_info = ITEM_RARITIES.get(item.get("item_rarity", "common"), ITEM_RARITIES["common"])
        item["rarity_display"] = rarity_info["name"]
        item["rarity_color"] = rarity_info["color"]
    
    return {
        "user_id": user_id,
        "username": user.get("username"),
        "items": items,
        "total_items": len(items)
    }

@api_router.get("/inventory/item/{inventory_id}")
async def get_inventory_item_detail(inventory_id: str, request: Request):
    """Get details of a specific inventory item"""
    user = await get_current_user(request)
    
    item = await db.user_inventory.find_one({
        "inventory_id": inventory_id,
        "user_id": user["user_id"]
    }, {"_id": 0})
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in your inventory")
    
    # Sell fee percentage (30% fee = 70% return)
    SELL_FEE_PERCENT = 30
    SELL_RETURN_PERCENT = 100 - SELL_FEE_PERCENT
    
    # Get full item definition
    item_def = await db.items.find_one({"item_id": item["item_id"]}, {"_id": 0})
    if item_def:
        item["is_tradeable"] = item_def.get("is_tradeable", False)
        item["is_sellable"] = item_def.get("is_sellable", False)
        item["category"] = item_def.get("category", "collectible")
    
    # Calculate sell value based on purchase price
    purchase_price = item.get("purchase_price", 0)
    item["purchase_price"] = purchase_price
    item["sell_value"] = round(purchase_price * SELL_RETURN_PERCENT / 100, 2)
    item["sell_fee_percent"] = SELL_FEE_PERCENT
    
    rarity_info = ITEM_RARITIES.get(item.get("item_rarity", "common"), ITEM_RARITIES["common"])
    item["rarity_display"] = rarity_info["name"]
    item["rarity_color"] = rarity_info["color"]
    
    return item

class SellItemRequest(BaseModel):
    """Request to sell an inventory item"""
    inventory_id: str

@api_router.post("/inventory/sell")
async def sell_inventory_item(sell_request: SellItemRequest, request: Request):
    """Sell an item from inventory for 70% of purchase price (30% fee)"""
    user = await get_current_user(request)
    
    # Sell fee percentage (30% fee = 70% return)
    SELL_FEE_PERCENT = 30
    SELL_RETURN_PERCENT = 100 - SELL_FEE_PERCENT
    
    # Find the inventory item
    item = await db.user_inventory.find_one({
        "inventory_id": sell_request.inventory_id,
        "user_id": user["user_id"]
    })
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in your inventory")
    
    # Get sell price from saved purchase_price
    purchase_price = item.get("purchase_price", 0)
    
    # If no purchase price saved, this is a legacy item - cannot sell without price
    if purchase_price <= 0:
        raise HTTPException(status_code=400, detail="This item has no recorded value. Please view your inventory first to sync item values.")
    
    sell_amount = round(purchase_price * SELL_RETURN_PERCENT / 100, 2)
    fee_amount = round(purchase_price * SELL_FEE_PERCENT / 100, 2)
    
    # Remove item from inventory
    await db.user_inventory.delete_one({
        "inventory_id": sell_request.inventory_id,
        "user_id": user["user_id"]
    })
    
    # Add sell amount to user balance
    user_doc = await db.users.find_one({"user_id": user["user_id"]})
    new_balance = round(user_doc.get("balance", 0) + sell_amount, 2)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"balance": new_balance}}
    )
    
    # Track sale in activity/bet_history
    now_naive = datetime.utcnow()
    activity_doc = {
        "bet_id": f"item_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "game_type": "item_sale",
        "bet_amount": 0,
        "win_amount": sell_amount,
        "net_outcome": sell_amount,  # Positive because receiving G
        "result": "sale",
        "timestamp": now_naive.isoformat(),
        "details": {
            "item_id": item["item_id"],
            "item_name": item["item_name"],
            "item_rarity": item.get("item_rarity", "common"),
            "original_value": purchase_price,
            "fee_amount": fee_amount,
            "fee_percent": SELL_FEE_PERCENT,
            "action": "sell"
        }
    }
    await db.bet_history.insert_one(activity_doc)
    
    return {
        "success": True,
        "message": f"Sold {item['item_name']} for {sell_amount} G",
        "item_name": item["item_name"],
        "value": purchase_price,
        "sell_amount": sell_amount,
        "fee_amount": fee_amount,
        "fee_percent": SELL_FEE_PERCENT,
        "new_balance": new_balance
    }

# ============== PRESTIGE SYSTEM ENDPOINTS ==============

@api_router.get("/prestige/shop")
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

@api_router.get("/prestige/owned")
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

@api_router.post("/prestige/purchase")
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

@api_router.post("/prestige/activate")
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

@api_router.post("/currency/convert")
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

@api_router.get("/prestige/cosmetic/{cosmetic_id}")
async def get_cosmetic_details(cosmetic_id: str):
    """Get details of a specific cosmetic"""
    template = PRESTIGE_COSMETICS.get(cosmetic_id)
    if not template:
        raise HTTPException(status_code=404, detail="Cosmetic not found")
    
    return template

@api_router.get("/user/{user_id}/cosmetics")
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

# ============== CHAT ENDPOINTS ==============

@api_router.post("/chat/send", response_model=ChatMessage)
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

@api_router.get("/chat/messages", response_model=List[ChatMessage])
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

@api_router.get("/cosmetics/available")
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

@api_router.get("/")
async def root():
    return {
        "message": "Welcome to Goladium API",
        "version": "2.0.0",
        "disclaimer": "This is a demo simulation. No real money, no real items, no real-world value."
    }

@api_router.get("/translations")
async def get_translations(lang: str = "en"):
    translations = {
        "en": {
            "app_name": "Goladium",
            "disclaimer": "This is a demo simulation. No real money, no real items, no real-world value.",
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
            "disclaimer": "Dies ist eine Demo-Simulation. Kein echtes Geld, keine echten Gegenstände, kein realer Wert.",
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

@api_router.get("/users/search/{username}")
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

@api_router.get("/trades/user-inventory/{user_id}")
async def get_user_inventory_for_trade(user_id: str, request: Request):
    """Get a user's inventory for trade selection (shows tradeable items)"""
    current_user = await get_current_user(request)
    
    # Verify target user exists
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get inventory items
    items = await db.user_inventory.find(
        {"user_id": user_id},
        {"_id": 0}
    ).to_list(500)
    
    # Enrich with item definitions
    enriched_items = []
    for inv_item in items:
        item_def = await db.items.find_one({"item_id": inv_item["item_id"]}, {"_id": 0})
        if item_def:
            enriched_items.append({
                "inventory_id": inv_item["inventory_id"],
                "item_id": inv_item["item_id"],
                "item_name": item_def.get("name", "Unknown Item"),
                "item_rarity": item_def.get("rarity", "common"),
                "item_image": item_def.get("image_url"),
                "item_flavor_text": item_def.get("flavor_text", ""),
                "acquired_at": inv_item.get("acquired_at"),
                "purchase_price": inv_item.get("purchase_price", 0)
            })
    
    return {
        "user_id": user_id,
        "username": target_user["username"],
        "balance": target_user.get("balance", 0) if user_id == current_user["user_id"] else None,
        "items": enriched_items
    }

@api_router.post("/trades/create")
async def create_trade(trade_request: TradeCreateRequest, request: Request):
    """Create a new trade offer"""
    initiator = await get_current_user(request)
    
    # Validate recipient
    recipient = await db.users.find_one(
        {"username": {"$regex": f"^{trade_request.recipient_username}$", "$options": "i"}},
        {"_id": 0}
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient user not found")
    
    if recipient["user_id"] == initiator["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot trade with yourself")
    
    # Validate item counts
    if len(trade_request.offered_items) > TRADE_MAX_ITEMS_PER_SIDE:
        raise HTTPException(status_code=400, detail=f"Cannot offer more than {TRADE_MAX_ITEMS_PER_SIDE} items")
    if len(trade_request.requested_items) > TRADE_MAX_ITEMS_PER_SIDE:
        raise HTTPException(status_code=400, detail=f"Cannot request more than {TRADE_MAX_ITEMS_PER_SIDE} items")
    
    # Validate G amounts
    if trade_request.offered_g < 0 or trade_request.requested_g < 0:
        raise HTTPException(status_code=400, detail="G amounts cannot be negative")
    
    # Calculate G fee if initiator offers G
    g_fee = 0.0
    if trade_request.offered_g > 0:
        g_fee = round(trade_request.offered_g * TRADE_G_FEE_PERCENT, 2)
        total_g_needed = trade_request.offered_g + g_fee
        if initiator["balance"] < total_g_needed:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient balance. You need {total_g_needed:.2f} G ({trade_request.offered_g:.2f} G + {g_fee:.2f} G fee)"
            )
    
    # Validate initiator owns offered items
    initiator_items = []
    for inv_id in trade_request.offered_items:
        item = await db.user_inventory.find_one({
            "inventory_id": inv_id,
            "user_id": initiator["user_id"]
        }, {"_id": 0})
        if not item:
            raise HTTPException(status_code=400, detail=f"Item {inv_id} not found in your inventory")
        
        item_def = await db.items.find_one({"item_id": item["item_id"]}, {"_id": 0})
        initiator_items.append({
            "inventory_id": inv_id,
            "item_id": item["item_id"],
            "item_name": item_def.get("name", "Unknown") if item_def else "Unknown",
            "item_rarity": item_def.get("rarity", "common") if item_def else "common",
            "item_image": item_def.get("image_url") if item_def else None
        })
    
    # Validate recipient owns requested items
    recipient_items = []
    for inv_id in trade_request.requested_items:
        item = await db.user_inventory.find_one({
            "inventory_id": inv_id,
            "user_id": recipient["user_id"]
        }, {"_id": 0})
        if not item:
            raise HTTPException(status_code=400, detail=f"Item {inv_id} not found in recipient's inventory")
        
        item_def = await db.items.find_one({"item_id": item["item_id"]}, {"_id": 0})
        recipient_items.append({
            "inventory_id": inv_id,
            "item_id": item["item_id"],
            "item_name": item_def.get("name", "Unknown") if item_def else "Unknown",
            "item_rarity": item_def.get("rarity", "common") if item_def else "common",
            "item_image": item_def.get("image_url") if item_def else None
        })
    
    # Create trade document
    trade_id = f"trade_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    trade_doc = {
        "trade_id": trade_id,
        "status": "pending",
        "initiator_id": initiator["user_id"],
        "recipient_id": recipient["user_id"],
        "initiator": {
            "user_id": initiator["user_id"],
            "username": initiator["username"],
            "items": initiator_items,
            "g_amount": trade_request.offered_g
        },
        "recipient": {
            "user_id": recipient["user_id"],
            "username": recipient["username"],
            "items": recipient_items,
            "g_amount": trade_request.requested_g
        },
        "g_fee_amount": g_fee if trade_request.offered_g > 0 else None,
        "created_at": now.isoformat(),
        "completed_at": None
    }
    
    await db.trades.insert_one(trade_doc)
    
    return {
        "message": "Trade created successfully",
        "trade_id": trade_id,
        "trade": {
            **trade_doc,
            "_id": None
        }
    }

@api_router.get("/trades/inbound")
async def get_inbound_trades(request: Request):
    """Get pending trades where current user is the recipient"""
    user = await get_current_user(request)
    
    trades = await db.trades.find(
        {"recipient_id": user["user_id"], "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"trades": trades}

@api_router.get("/trades/outbound")
async def get_outbound_trades(request: Request):
    """Get pending trades where current user is the initiator"""
    user = await get_current_user(request)
    
    trades = await db.trades.find(
        {"initiator_id": user["user_id"], "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"trades": trades}

@api_router.get("/trades/completed")
async def get_completed_trades(request: Request):
    """Get completed trades involving current user (history)"""
    user = await get_current_user(request)
    
    trades = await db.trades.find(
        {
            "status": "completed",
            "$or": [
                {"initiator_id": user["user_id"]},
                {"recipient_id": user["user_id"]}
            ]
        },
        {"_id": 0}
    ).sort("completed_at", -1).to_list(100)
    
    return {"trades": trades}

@api_router.get("/trades/{trade_id}")
async def get_trade_detail(trade_id: str, request: Request):
    """Get details of a specific trade"""
    user = await get_current_user(request)
    
    trade = await db.trades.find_one({"trade_id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Must be participant in trade
    if trade["initiator_id"] != user["user_id"] and trade["recipient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="You are not part of this trade")
    
    return {"trade": trade}

@api_router.post("/trades/{trade_id}/accept")
async def accept_trade(trade_id: str, request: Request):
    """Accept a pending trade (recipient only)"""
    user = await get_current_user(request)
    
    # Find trade
    trade = await db.trades.find_one({"trade_id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found or already processed")
    
    # Only recipient can accept
    if trade["recipient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the recipient can accept this trade")
    
    # Must be pending
    if trade["status"] != "pending":
        raise HTTPException(status_code=400, detail="Trade is no longer pending")
    
    # === FULL RE-VALIDATION ===
    
    # Get both users fresh from DB
    initiator = await db.users.find_one({"user_id": trade["initiator_id"]}, {"_id": 0})
    recipient = await db.users.find_one({"user_id": trade["recipient_id"]}, {"_id": 0})
    
    if not initiator or not recipient:
        await db.trades.delete_one({"trade_id": trade_id})
        raise HTTPException(status_code=400, detail="One or both users no longer exist. Trade has been deleted.")
    
    # Validate initiator still owns all offered items
    for item in trade["initiator"]["items"]:
        inv_item = await db.user_inventory.find_one({
            "inventory_id": item["inventory_id"],
            "user_id": initiator["user_id"]
        })
        if not inv_item:
            await db.trades.delete_one({"trade_id": trade_id})
            raise HTTPException(
                status_code=400, 
                detail=f"Trade failed: {initiator['username']}'s item '{item['item_name']}' is no longer in their inventory. Trade has been deleted."
            )
    
    # Validate recipient still owns all requested items
    for item in trade["recipient"]["items"]:
        inv_item = await db.user_inventory.find_one({
            "inventory_id": item["inventory_id"],
            "user_id": recipient["user_id"]
        })
        if not inv_item:
            await db.trades.delete_one({"trade_id": trade_id})
            raise HTTPException(
                status_code=400, 
                detail=f"Trade failed: Your item '{item['item_name']}' is no longer in your inventory. Trade has been deleted."
            )
    
    # Validate G balances with fees
    initiator_g = trade["initiator"]["g_amount"]
    recipient_g = trade["recipient"]["g_amount"]
    initiator_fee = round(initiator_g * TRADE_G_FEE_PERCENT, 2) if initiator_g > 0 else 0
    recipient_fee = round(recipient_g * TRADE_G_FEE_PERCENT, 2) if recipient_g > 0 else 0
    
    if initiator_g > 0:
        total_needed = initiator_g + initiator_fee
        if initiator["balance"] < total_needed:
            await db.trades.delete_one({"trade_id": trade_id})
            raise HTTPException(
                status_code=400, 
                detail=f"Trade failed: {initiator['username']} has insufficient balance ({initiator['balance']:.2f} G, needs {total_needed:.2f} G). Trade has been deleted."
            )
    
    if recipient_g > 0:
        total_needed = recipient_g + recipient_fee
        if recipient["balance"] < total_needed:
            await db.trades.delete_one({"trade_id": trade_id})
            raise HTTPException(
                status_code=400, 
                detail=f"Trade failed: You have insufficient balance ({recipient['balance']:.2f} G, needs {total_needed:.2f} G). Trade has been deleted."
            )
    
    # === ATOMIC EXECUTION ===
    now = datetime.now(timezone.utc)
    
    # Transfer items from initiator to recipient
    for item in trade["initiator"]["items"]:
        await db.user_inventory.update_one(
            {"inventory_id": item["inventory_id"]},
            {
                "$set": {
                    "user_id": recipient["user_id"],
                    "acquired_from": "trade",
                    "acquired_at": now
                }
            }
        )
    
    # Transfer items from recipient to initiator
    for item in trade["recipient"]["items"]:
        await db.user_inventory.update_one(
            {"inventory_id": item["inventory_id"]},
            {
                "$set": {
                    "user_id": initiator["user_id"],
                    "acquired_from": "trade",
                    "acquired_at": now
                }
            }
        )
    
    # Transfer G currency (with fees burned)
    if initiator_g > 0:
        # Initiator pays: g_amount + fee (fee is burned)
        await db.users.update_one(
            {"user_id": initiator["user_id"]},
            {"$inc": {"balance": -(initiator_g + initiator_fee)}}
        )
        # Recipient receives only the g_amount (70%)
        await db.users.update_one(
            {"user_id": recipient["user_id"]},
            {"$inc": {"balance": initiator_g}}
        )
    
    if recipient_g > 0:
        # Recipient pays: g_amount + fee (fee is burned)
        await db.users.update_one(
            {"user_id": recipient["user_id"]},
            {"$inc": {"balance": -(recipient_g + recipient_fee)}}
        )
        # Initiator receives only the g_amount (70%)
        await db.users.update_one(
            {"user_id": initiator["user_id"]},
            {"$inc": {"balance": recipient_g}}
        )
    
    # Mark trade as completed
    await db.trades.update_one(
        {"trade_id": trade_id},
        {
            "$set": {
                "status": "completed",
                "completed_at": now.isoformat(),
                "executed_initiator_fee": initiator_fee,
                "executed_recipient_fee": recipient_fee
            }
        }
    )
    
    # Calculate total fee burned
    total_fee_burned = initiator_fee + recipient_fee
    
    return {
        "message": "Trade completed successfully!",
        "trade_id": trade_id,
        "items_received": len(trade["initiator"]["items"]),
        "items_sent": len(trade["recipient"]["items"]),
        "g_received": initiator_g,
        "g_sent": recipient_g,
        "fee_paid": recipient_fee,
        "total_fee_burned": total_fee_burned
    }

@api_router.post("/trades/{trade_id}/reject")
async def reject_trade(trade_id: str, request: Request):
    """Reject a pending trade (recipient only) - deletes trade completely"""
    user = await get_current_user(request)
    
    trade = await db.trades.find_one({"trade_id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade["recipient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the recipient can reject this trade")
    
    if trade["status"] != "pending":
        raise HTTPException(status_code=400, detail="Trade is no longer pending")
    
    # Hard delete - trade never existed
    await db.trades.delete_one({"trade_id": trade_id})
    
    return {"message": "Trade rejected and deleted", "trade_id": trade_id}

@api_router.post("/trades/{trade_id}/cancel")
async def cancel_trade(trade_id: str, request: Request):
    """Cancel a pending trade (initiator only) - deletes trade completely"""
    user = await get_current_user(request)
    
    trade = await db.trades.find_one({"trade_id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade["initiator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the initiator can cancel this trade")
    
    if trade["status"] != "pending":
        raise HTTPException(status_code=400, detail="Trade is no longer pending")
    
    # Hard delete
    await db.trades.delete_one({"trade_id": trade_id})
    
    return {"message": "Trade cancelled and deleted", "trade_id": trade_id}

@api_router.post("/trades/{trade_id}/counter")
async def counter_trade(trade_id: str, counter_request: TradeCounterRequest, request: Request):
    """Counter a trade offer (recipient only) - creates new trade with swapped roles, deletes original"""
    user = await get_current_user(request)
    
    # Get original trade
    original = await db.trades.find_one({"trade_id": trade_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if original["recipient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the recipient can counter this trade")
    
    if original["status"] != "pending":
        raise HTTPException(status_code=400, detail="Trade is no longer pending")
    
    # Get the original initiator (they become the new recipient)
    other_user = await db.users.find_one({"user_id": original["initiator_id"]}, {"_id": 0})
    if not other_user:
        await db.trades.delete_one({"trade_id": trade_id})
        raise HTTPException(status_code=400, detail="Other user no longer exists")
    
    # Validate item counts
    if len(counter_request.offered_items) > TRADE_MAX_ITEMS_PER_SIDE:
        raise HTTPException(status_code=400, detail=f"Cannot offer more than {TRADE_MAX_ITEMS_PER_SIDE} items")
    if len(counter_request.requested_items) > TRADE_MAX_ITEMS_PER_SIDE:
        raise HTTPException(status_code=400, detail=f"Cannot request more than {TRADE_MAX_ITEMS_PER_SIDE} items")
    
    # Calculate G fee
    g_fee = 0.0
    if counter_request.offered_g > 0:
        g_fee = round(counter_request.offered_g * TRADE_G_FEE_PERCENT, 2)
        total_g_needed = counter_request.offered_g + g_fee
        if user["balance"] < total_g_needed:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient balance for counter offer. Need {total_g_needed:.2f} G"
            )
    
    # Validate current user owns offered items
    my_items = []
    for inv_id in counter_request.offered_items:
        item = await db.user_inventory.find_one({
            "inventory_id": inv_id,
            "user_id": user["user_id"]
        }, {"_id": 0})
        if not item:
            raise HTTPException(status_code=400, detail=f"Item {inv_id} not found in your inventory")
        
        item_def = await db.items.find_one({"item_id": item["item_id"]}, {"_id": 0})
        my_items.append({
            "inventory_id": inv_id,
            "item_id": item["item_id"],
            "item_name": item_def.get("name", "Unknown") if item_def else "Unknown",
            "item_rarity": item_def.get("rarity", "common") if item_def else "common",
            "item_image": item_def.get("image_url") if item_def else None
        })
    
    # Validate other user owns requested items
    their_items = []
    for inv_id in counter_request.requested_items:
        item = await db.user_inventory.find_one({
            "inventory_id": inv_id,
            "user_id": other_user["user_id"]
        }, {"_id": 0})
        if not item:
            raise HTTPException(status_code=400, detail=f"Item {inv_id} not found in other user's inventory")
        
        item_def = await db.items.find_one({"item_id": item["item_id"]}, {"_id": 0})
        their_items.append({
            "inventory_id": inv_id,
            "item_id": item["item_id"],
            "item_name": item_def.get("name", "Unknown") if item_def else "Unknown",
            "item_rarity": item_def.get("rarity", "common") if item_def else "common",
            "item_image": item_def.get("image_url") if item_def else None
        })
    
    # Delete original trade
    await db.trades.delete_one({"trade_id": trade_id})
    
    # Create new trade with swapped roles
    new_trade_id = f"trade_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    new_trade = {
        "trade_id": new_trade_id,
        "status": "pending",
        "initiator_id": user["user_id"],  # Current user becomes initiator
        "recipient_id": other_user["user_id"],  # Original initiator becomes recipient
        "initiator": {
            "user_id": user["user_id"],
            "username": user["username"],
            "items": my_items,
            "g_amount": counter_request.offered_g
        },
        "recipient": {
            "user_id": other_user["user_id"],
            "username": other_user["username"],
            "items": their_items,
            "g_amount": counter_request.requested_g
        },
        "g_fee_amount": g_fee if counter_request.offered_g > 0 else None,
        "created_at": now.isoformat(),
        "completed_at": None,
        "is_counter": True,
        "original_trade_id": trade_id
    }
    
    await db.trades.insert_one(new_trade)
    
    return {
        "message": "Counter offer sent! Original trade deleted.",
        "new_trade_id": new_trade_id,
        "trade": {**new_trade, "_id": None}
    }

# CORS middleware - specific origins required when using credentials
# Get origins from env or use defaults for preview environment
cors_origins_env = os.environ.get('CORS_ORIGINS', '')
if cors_origins_env and cors_origins_env != '*':
    cors_origins = cors_origins_env.split(',')
else:
    # Default origins for preview environment
    cors_origins = [
        "http://localhost:3000",
        "https://localhost:3000",
    ]

# For credentials mode, we need to handle origins dynamically
# since we can't use wildcards with credentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse

class DynamicCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        origin = request.headers.get("origin", "")
        
        # Allow any emergentagent.com subdomain or localhost
        # This covers all preview patterns like:
        # - *.preview.emergentagent.com
        # - *.preview.static.emergentagent.com
        # - *.emergentagent.com
        allowed = (
            origin in cors_origins or
            "emergentagent.com" in origin or
            "localhost" in origin
        )
        
        if request.method == "OPTIONS":
            # Handle preflight
            response = StarletteResponse(status_code=200)
            if allowed and origin:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
                response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Session-ID, X-Requested-With"
                response.headers["Access-Control-Max-Age"] = "86400"
            return response
        
        response = await call_next(request)
        
        if allowed and origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        return response

app.add_middleware(DynamicCORSMiddleware)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== QUEST & GAME PASS SYSTEM ==============

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

@api_router.get("/quests")
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

@api_router.post("/quests/{quest_id}/claim")
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

@api_router.get("/game-pass")
async def get_game_pass_status(request: Request):
    """Get user's Game Pass status"""
    user = await get_current_user(request)
    
    level = user.get("game_pass_level", 1)
    xp = user.get("game_pass_xp", 0)
    galadium_active = user.get("galadium_pass_active", False)
    
    # Get claimed rewards
    gp_data = await db.user_game_pass.find_one({"user_id": user["user_id"]})
    claimed_rewards = gp_data.get("claimed_rewards", []) if gp_data else []
    
    # Find next reward level
    next_reward = None
    for reward_level in sorted(GAME_PASS_REWARDS.keys()):
        if reward_level > level or (reward_level == level and reward_level not in claimed_rewards):
            next_reward = reward_level
            break
    
    return {
        "level": level,
        "xp": xp,
        "xp_to_next": GAME_PASS_XP_PER_LEVEL,
        "max_level": GAME_PASS_MAX_LEVEL,
        "galadium_active": galadium_active,
        "rewards_claimed": claimed_rewards,
        "next_reward_level": next_reward,
        "all_rewards": GAME_PASS_REWARDS
    }

@api_router.post("/game-pass/claim/{level}")
async def claim_game_pass_reward(level: int, request: Request):
    """Claim a Game Pass reward at a specific level"""
    user = await get_current_user(request)
    
    current_level = user.get("game_pass_level", 1)
    galadium_active = user.get("galadium_pass_active", False)
    
    if level > current_level:
        raise HTTPException(status_code=400, detail="Level not reached yet")
    
    if level not in GAME_PASS_REWARDS:
        raise HTTPException(status_code=404, detail="No reward at this level")
    
    # Check if already claimed
    gp_data = await db.user_game_pass.find_one({"user_id": user["user_id"]})
    if not gp_data:
        gp_data = {"user_id": user["user_id"], "claimed_rewards": []}
        await db.user_game_pass.insert_one(gp_data)
    
    if level in gp_data.get("claimed_rewards", []):
        raise HTTPException(status_code=400, detail="Reward already claimed")
    
    # Get reward (free or galadium based on user status)
    reward_tier = "galadium" if galadium_active else "free"
    reward = GAME_PASS_REWARDS[level][reward_tier]
    
    # Grant the reward (item)
    if reward["type"] == "item":
        # Add item to inventory
        inventory_doc = {
            "inventory_id": f"inv_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"],
            "item_id": reward["item_id"],
            "acquired_at": datetime.now(timezone.utc).isoformat(),
            "source": f"game_pass_level_{level}"
        }
        await db.user_inventory.insert_one(inventory_doc)
    
    # Mark as claimed
    await db.user_game_pass.update_one(
        {"user_id": user["user_id"]},
        {"$push": {"claimed_rewards": level}}
    )
    
    return {
        "success": True,
        "reward": reward,
        "tier": reward_tier
    }

# ============== ITEM SYSTEM INITIALIZATION ==============
# Seed items are created on startup if they don't exist

SEED_ITEMS = [
    {
        "item_id": "placeholder_relic",
        "name": "Placeholder Relic",
        "flavor_text": "Placeholder item. Somehow still valuable.",
        "rarity": "uncommon",
        "base_value": 25.0,
        "image_url": None,  # Placeholder - artwork added later
        "category": "collectible"
    },
    {
        "item_id": "gamblers_instinct",
        "name": "Gambler's Instinct",
        "flavor_text": "Only real gamblers know when to keep going.",
        "rarity": "rare",
        "base_value": 50.0,
        "image_url": None,  # Placeholder - artwork added later
        "category": "collectible"
    }
]

# ============== ADMIN API ENDPOINTS ==============
# These endpoints are called by the Discord bot for moderation
# Authentication via ADMIN_API_KEY header

ADMIN_API_KEY = os.environ.get('ADMIN_API_KEY', '')

def verify_admin_key(request: Request) -> bool:
    """Verify admin API key from request header"""
    api_key = request.headers.get("X-Admin-Key")
    if not ADMIN_API_KEY or not api_key:
        return False
    return api_key == ADMIN_API_KEY

class AdminMuteRequest(BaseModel):
    username: str
    duration_seconds: int  # 0 = unmute

class AdminBanRequest(BaseModel):
    username: str
    duration_seconds: int  # 0 = unban

class AdminBalanceRequest(BaseModel):
    username: str
    currency: str  # "g" or "a"
    amount: float
    action: str  # "set" or "add"

@api_router.post("/admin/mute")
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
    
    if data.duration_seconds <= 0:
        # Unmute - completely remove mute_until field
        was_muted = user.get("mute_until") is not None
        result = await db.users.update_one(
            {"username": actual_username},
            {"$unset": {"mute_until": ""}}
        )
        return {
            "success": True,
            "action": "unmuted",
            "username": actual_username,
            "was_muted": was_muted,
            "modified": result.modified_count > 0
        }
    else:
        # Mute
        mute_until = now + timedelta(seconds=data.duration_seconds)
        result = await db.users.update_one(
            {"username": actual_username},
            {"$set": {"mute_until": mute_until.isoformat()}}
        )
        return {
            "success": True,
            "action": "muted",
            "username": actual_username,
            "mute_until": mute_until.isoformat(),
            "duration_seconds": data.duration_seconds,
            "modified": result.modified_count > 0
        }

@api_router.post("/admin/ban")
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

@api_router.post("/admin/balance")
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
    
    return {
        "success": True,
        "username": actual_username,
        "currency": data.currency.upper(),
        "previous_balance": round(current_balance, 2),
        "new_balance": round(new_balance, 2),
        "action": data.action,
        "modified": result.modified_count > 0
    }

@api_router.get("/admin/userinfo/{username}")
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

# Include router AFTER all endpoints are defined
app.include_router(api_router)

@app.on_event("startup")
async def initialize_item_system():
    """Initialize item system with seed items and shop listings on startup"""
    logger.info("Initializing item system...")
    
    # Create indexes for item collections
    await db.items.create_index("item_id", unique=True)
    await db.user_inventory.create_index([("user_id", 1), ("item_id", 1)])
    await db.shop_listings.create_index("shop_listing_id", unique=True)
    await db.shop_listings.create_index("item_id")
    
    # Create indexes for trades
    await db.trades.create_index("trade_id", unique=True)
    await db.trades.create_index([("initiator_id", 1), ("status", 1)])
    await db.trades.create_index([("recipient_id", 1), ("status", 1)])
    
    # Seed items if they don't exist
    for item_data in SEED_ITEMS:
        existing = await db.items.find_one({"item_id": item_data["item_id"]})
        if not existing:
            item_doc = {
                **item_data,
                "created_at": datetime.now(timezone.utc),
                "is_tradeable": False,  # Not tradeable while in shop
                "is_sellable": False    # Not sellable while in shop
            }
            await db.items.insert_one(item_doc)
            logger.info(f"Created seed item: {item_data['name']}")
    
    # Create initial shop listings for seed items if none exist
    existing_listings = await db.shop_listings.count_documents({"is_active": True})
    if existing_listings == 0:
        now = datetime.now(timezone.utc)
        # Shop items available for 30 days initially
        available_until = now + timedelta(days=30)
        
        shop_listings = [
            {
                "shop_listing_id": str(uuid.uuid4()),
                "item_id": "placeholder_relic",
                "item_name": "Placeholder Relic",
                "item_rarity": "uncommon",
                "item_image": None,
                "item_flavor_text": "Placeholder item. Somehow still valuable.",
                "price": 25.0,  # Same as base_value
                "available_from": now,
                "available_until": available_until,
                "stock_limit": None,  # Unlimited during shop period
                "stock_sold": 0,
                "is_active": True
            },
            {
                "shop_listing_id": str(uuid.uuid4()),
                "item_id": "gamblers_instinct",
                "item_name": "Gambler's Instinct",
                "item_rarity": "rare",
                "item_image": None,
                "item_flavor_text": "Only real gamblers know when to keep going.",
                "price": 50.0,  # Same as base_value
                "available_from": now,
                "available_until": available_until,
                "stock_limit": None,
                "stock_sold": 0,
                "is_active": True
            }
        ]
        
        for listing in shop_listings:
            await db.shop_listings.insert_one(listing)
            logger.info(f"Created shop listing: {listing['item_name']}")
    
    logger.info("Item system initialized successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
