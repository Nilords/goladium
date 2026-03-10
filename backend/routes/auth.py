"""Route module: auth."""
from fastapi import APIRouter, HTTPException, Request, Response, BackgroundTasks
from fastapi.responses import JSONResponse, PlainTextResponse
from typing import List, Optional, Dict, Any, Tuple
from database import db
from config import *
from models import *
from services import *
from cache import _catalog_cache, _catalog_cache_time
from deps import limiter, pwd_context
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

@router.post("/auth/register", response_model=TokenResponse)
@limiter.limit("1/minute")
@limiter.limit("3/hour")
@limiter.limit("5/day")
async def register(request: Request, user_data: UserCreate):
    client_ip = request.client.host if request.client else None
    forwarded_for = request.headers.get("x-forwarded-for")

    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    existing_accounts = await db.users.count_documents({
        "register_ip": client_ip
    })

    if existing_accounts >= 2:
        raise HTTPException(
            status_code=403,
            detail="Maximum accounts reached for this IP"
        )
    # 🔒 ALPHA LOCK
    if not ALPHA_REGISTRATION_OPEN:
        raise HTTPException(status_code=403, detail="Registration temporarily disabled during Alpha testing.")

    # 🛡️ Cloudflare Turnstile verification
    logging.info(f"[Register] Received turnstile_token: {user_data.turnstile_token[:20] if user_data.turnstile_token else 'NONE'}...")
    
    if TURNSTILE_SECRET_KEY:
        verification = await verify_turnstile(user_data.turnstile_token, client_ip)
        if not verification["success"]:
            logging.error(f"[Register] Turnstile verification failed: {verification['error']}")
            raise HTTPException(status_code=400, detail=f"CAPTCHA verification failed: {verification['error']}")
    else:
        logging.warning("[Register] Turnstile verification SKIPPED - no secret key configured")

    
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
        "username": user_data.username,
        "password_hash": hashed_password,
        "register_ip": client_ip,
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
        username=user_data.username,
        balance=10.0,
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

@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(credentials: UserLogin, request: Request):
    # 🛡️ Cloudflare Turnstile verification
    logging.info(f"[Login] Received turnstile_token: {credentials.turnstile_token[:20] if credentials.turnstile_token else 'NONE'}...")
    
    if TURNSTILE_SECRET_KEY:
        client_ip = request.client.host if request.client else None
        # Get real IP from X-Forwarded-For header if behind proxy
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
        
        verification = await verify_turnstile(credentials.turnstile_token, client_ip)
        if not verification["success"]:
            logging.error(f"[Login] Turnstile verification failed: {verification['error']}")
            raise HTTPException(status_code=400, detail=f"CAPTCHA verification failed: {verification['error']}")
    else:
        logging.warning("[Login] Turnstile verification SKIPPED - no secret key configured")

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

@router.get("/auth/session")
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
        samesite="lax",
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

@router.get("/auth/me")
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
        "last_wheel_spin": last_wheel.isoformat() if last_wheel else None,
        "game_pass_level": user.get("game_pass_level", 1),
        "game_pass_xp": user.get("game_pass_xp", 0)
    }

@router.post("/auth/logout")
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

@router.post("/user/avatar")
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

@router.delete("/user/avatar")
async def delete_avatar(request: Request):
    """Remove user's profile picture"""
    user = await get_current_user(request)
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"avatar": None}}
    )
    
    return {"message": "Avatar removed successfully"}


# ============== SLOT GAME ENDPOINTS ==============

