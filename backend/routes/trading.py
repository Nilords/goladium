"""Route module: trading."""
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

@router.get("/trades/user-inventory/{user_id}")
async def get_user_inventory_for_trade(user_id: str, request: Request):
    """Get a user's inventory for trade selection (shows tradeable items only)"""
    current_user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    
    # Verify target user exists
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get inventory items
    items = await db.user_inventory.find(
        {"user_id": user_id},
        {"_id": 0}
    ).to_list(500)
    
    # Enrich with item definitions and filter out untradeable items
    enriched_items = []
    for inv_item in items:
        # Check if item is currently untradeable (from shop purchase)
        untradeable_until = inv_item.get("untradeable_until")
        if untradeable_until:
            if isinstance(untradeable_until, str):
                try:
                    untradeable_until = datetime.fromisoformat(untradeable_until.replace("Z", "+00:00"))
                except:
                    untradeable_until = None
            if untradeable_until and now < untradeable_until:
                # Item is still untradeable, skip it
                continue
        
        item_def = await db.items.find_one({"item_id": inv_item["item_id"]}, {"_id": 0})
        if item_def:
            enriched_items.append({
                "inventory_id": inv_item["inventory_id"],
                "item_id": inv_item["item_id"],
                "item_name": item_def.get("name", inv_item.get("item_name", "Unknown Item")),
                "item_rarity": item_def.get("rarity", inv_item.get("item_rarity", "common")),
                "item_image": item_def.get("image_url", inv_item.get("item_image")),
                "item_flavor_text": item_def.get("flavor_text", inv_item.get("item_flavor_text", "")),
                "acquired_at": inv_item.get("acquired_at"),
                "purchase_price": inv_item.get("purchase_price", 0)
            })
    
    return {
        "user_id": user_id,
        "username": target_user["username"],
        "balance": target_user.get("balance", 0) if user_id == current_user["user_id"] else None,
        "items": enriched_items
    }

@router.post("/trades/create")
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
        
        # Check if item is listed on marketplace
        mp_listed = await db.marketplace_listings.find_one({"inventory_id": inv_id, "status": "active"})
        if mp_listed:
            raise HTTPException(status_code=400, detail=f"Item {inv_id} is currently listed on the marketplace. Delist it first.")
        
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

@router.get("/trades/inbound")
async def get_inbound_trades(request: Request):
    """Get pending trades where current user is the recipient"""
    user = await get_current_user(request)
    
    trades = await db.trades.find(
        {"recipient_id": user["user_id"], "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"trades": trades}

@router.get("/trades/outbound")
async def get_outbound_trades(request: Request):
    """Get pending trades where current user is the initiator"""
    user = await get_current_user(request)
    
    trades = await db.trades.find(
        {"initiator_id": user["user_id"], "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"trades": trades}

@router.get("/trades/completed")
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

@router.get("/trades/{trade_id}")
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

@router.post("/trades/{trade_id}/accept")
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
        await record_owner_change(
            item["inventory_id"], item["item_id"],
            initiator["user_id"], recipient["user_id"], "trade"
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
        await record_owner_change(
            item["inventory_id"], item["item_id"],
            recipient["user_id"], initiator["user_id"], "trade"
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
    
    # Record inventory value events for both users
    # Initiator: loses their items (trade_out), gains recipient's items (trade_in)
    for item in trade["initiator"]["items"]:
        item_value = item.get("purchase_price", 0) or item.get("base_value", 0)
        await record_inventory_value_event(
            user_id=initiator["user_id"],
            event_type="trade_out",
            delta_value=-item_value,
            related_item_id=item["item_id"],
            related_item_name=item["item_name"],
            details={"trade_id": trade_id, "to_user": recipient["username"]}
        )
    
    for item in trade["recipient"]["items"]:
        item_value = item.get("purchase_price", 0) or item.get("base_value", 0)
        await record_inventory_value_event(
            user_id=initiator["user_id"],
            event_type="trade_in",
            delta_value=item_value,
            related_item_id=item["item_id"],
            related_item_name=item["item_name"],
            details={"trade_id": trade_id, "from_user": recipient["username"]}
        )
    
    # Recipient: loses their items (trade_out), gains initiator's items (trade_in)
    for item in trade["recipient"]["items"]:
        item_value = item.get("purchase_price", 0) or item.get("base_value", 0)
        await record_inventory_value_event(
            user_id=recipient["user_id"],
            event_type="trade_out",
            delta_value=-item_value,
            related_item_id=item["item_id"],
            related_item_name=item["item_name"],
            details={"trade_id": trade_id, "to_user": initiator["username"]}
        )
    
    for item in trade["initiator"]["items"]:
        item_value = item.get("purchase_price", 0) or item.get("base_value", 0)
        await record_inventory_value_event(
            user_id=recipient["user_id"],
            event_type="trade_in",
            delta_value=item_value,
            related_item_id=item["item_id"],
            related_item_name=item["item_name"],
            details={"trade_id": trade_id, "from_user": initiator["username"]}
        )
    
    # Record account activity for G transfers
    # Initiator: paid initiator_g + fee, received recipient_g
    initiator_net = recipient_g - (initiator_g + initiator_fee) if (initiator_g > 0 or recipient_g > 0) else 0
    if initiator_net != 0:
        await record_account_activity(
            user_id=initiator["user_id"],
            event_type="trade",
            amount=initiator_net,
            source=f"Trade mit {recipient['username']}",
            details={"trade_id": trade_id, "sent": initiator_g, "received": recipient_g, "fee": initiator_fee}
        )
    
    # Recipient: paid recipient_g + fee, received initiator_g
    recipient_net = initiator_g - (recipient_g + recipient_fee) if (recipient_g > 0 or initiator_g > 0) else 0
    if recipient_net != 0:
        await record_account_activity(
            user_id=recipient["user_id"],
            event_type="trade",
            amount=recipient_net,
            source=f"Trade mit {initiator['username']}",
            details={"trade_id": trade_id, "sent": recipient_g, "received": initiator_g, "fee": recipient_fee}
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

@router.post("/trades/{trade_id}/reject")
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

@router.post("/trades/{trade_id}/cancel")
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

@router.post("/trades/{trade_id}/counter")
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

