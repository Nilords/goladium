"""Route module: jackpot."""
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

jackpot_state = {
    "state": "idle",
    "jackpot_id": None,
    "participants": [],
    "total_pot": 0.0,
    "started_at": None,
    "countdown_end": None,
    "winner": None,
    "winner_index": None
}
jackpot_lock = asyncio.Lock()

@router.get("/games/jackpot/status")
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
                
                # Record account activity for ALL jackpot participants
                for p in jackpot_state["participants"]:
                    is_winner = p["user_id"] == winner["user_id"]
                    if is_winner:
                        # Winner: net profit = pot - their bet
                        net_amount = jackpot_state["total_pot"] - p["bet_amount"]
                        await record_account_activity(
                            user_id=p["user_id"],
                            event_type="jackpot",
                            amount=net_amount,
                            source=f"Jackpot Win (Pot: {jackpot_state['total_pot']}G)",
                            details={"bet": p["bet_amount"], "pot": jackpot_state["total_pot"], "result": "win"}
                        )
                    else:
                        # Loser: lost their bet
                        await record_account_activity(
                            user_id=p["user_id"],
                            event_type="jackpot",
                            amount=-p["bet_amount"],
                            source=f"Jackpot Loss (Pot: {jackpot_state['total_pot']}G)",
                            details={"bet": p["bet_amount"], "pot": jackpot_state["total_pot"], "result": "loss"}
                        )
                
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
                if jackpot_state["total_pot"] >= 100:
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

@router.post("/games/jackpot/join")
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

@router.post("/games/jackpot/spin")
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
        
        # Record account activity for ALL jackpot participants
        for p in jackpot_state["participants"]:
            is_winner = p["user_id"] == winner["user_id"]
            if is_winner:
                # Winner: net profit = pot - their bet
                net_amount = jackpot_state["total_pot"] - p["bet_amount"]
                await record_account_activity(
                    user_id=p["user_id"],
                    event_type="jackpot",
                    amount=net_amount,
                    source=f"Jackpot Win (Pot: {jackpot_state['total_pot']}G)",
                    details={"bet": p["bet_amount"], "pot": jackpot_state["total_pot"], "result": "win"}
                )
            else:
                # Loser: lost their bet
                await record_account_activity(
                    user_id=p["user_id"],
                    event_type="jackpot",
                    amount=-p["bet_amount"],
                    source=f"Jackpot Loss (Pot: {jackpot_state['total_pot']}G)",
                    details={"bet": p["bet_amount"], "pot": jackpot_state["total_pot"], "result": "loss"}
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
        if jackpot_state["total_pot"] >= 100:
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

