"""Chat moderation system — profanity, spam, advertising detection."""
import uuid
import re
import logging
import aiohttp
from datetime import datetime, timezone, timedelta
from database import db
from config import *


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


async def send_discord_auto_mute_log(username: str, violation_type: str, duration_seconds: int, is_permanent: bool, message_content: str = None):
    webhook = os.getenv("DISCORD_LOG_WEBHOOK")
    if not webhook:
        return

    color = 0xff0000 if is_permanent else 0xffaa00
    duration_text = "PERMANENT" if is_permanent else f"{duration_seconds} seconds"

    fields = [
        {"name": "User", "value": username, "inline": False},
        {"name": "Reason", "value": violation_type, "inline": True},
        {"name": "Duration", "value": duration_text, "inline": True},
    ]
    
    # Add message content for profanity/advertising violations
    if message_content and violation_type in ["profanity", "advertising"]:
        # Truncate if too long and censor partially
        truncated = message_content[:500] + "..." if len(message_content) > 500 else message_content
        fields.append({"name": "Message", "value": f"```{truncated}```", "inline": False})
    
    fields.append({"name": "Time (UTC)", "value": datetime.now(timezone.utc).isoformat(), "inline": False})

    embed = {
        "title": "🤖 AUTO MUTE",
        "color": color,
        "fields": fields
    }

    async with aiohttp.ClientSession() as session:
        await session.post(webhook, json={"embeds": [embed]})


async def apply_chat_mute(user_id: str, username: str, duration_seconds: int, reason: str, violation_type: str, message_content: str = None):
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
        "message_content": message_content,
        "timestamp": now.isoformat()
    }
    await db.moderation_logs.insert_one(log_entry)
    
    await send_discord_auto_mute_log(username, violation_type, duration_seconds, is_permanent, message_content)

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
            await apply_chat_mute(user_id, username, -1, "Repeated advertising", "advertising", message)
            return ModerationResult(
                allowed=False,
                error_message="You have been permanently muted in chat due to unauthorized advertising. If you believe this was a mistake, please contact us on Discord.",
                muted=True
            )
        else:
            mute_until, _ = await apply_chat_mute(user_id, username, duration, "Advertising detected", "advertising", message)
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
            await apply_chat_mute(user_id, username, -1, "Repeated profanity", "profanity", message)
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
            await apply_chat_mute(user_id, username, duration, "Profanity detected", "profanity", message)
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


# XP_PER_G, LEVEL_XP_REQUIREMENTS, GAME_PASS_XP_PER_LEVEL, GAME_PASS_MAX_LEVEL -> config.py
