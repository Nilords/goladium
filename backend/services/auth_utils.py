"""JWT creation/verification + get_current_user helper."""
import jwt
import hashlib
import logging
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException
from database import db
from config import *



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

