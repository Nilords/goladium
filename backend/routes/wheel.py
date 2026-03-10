"""Route module: wheel."""
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

@router.post("/games/wheel/spin", response_model=WheelSpinResult)
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
    
    # Record account activity (wheel is always profit since it's free)
    await record_account_activity(
        user_id=user["user_id"],
        event_type="wheel",
        amount=reward,
        source="Lucky Wheel",
        details={"reward_tier": "jackpot" if reward == 15 else "high" if reward == 5 else "standard"}
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

@router.get("/games/wheel/status")
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

