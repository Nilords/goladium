"""Route module: trade_ads."""
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

@router.get("/trade-ads")
async def get_trade_ads(
    search: str = None,
    limit: int = 50,
    offset: int = 0
):
    """Get active trade advertisements"""
    query = {"status": "active"}
    if search:
        query["$or"] = [
            {"offering_names": {"$regex": search, "$options": "i"}},
            {"seeking_names": {"$regex": search, "$options": "i"}},
            {"username": {"$regex": search, "$options": "i"}},
            {"note": {"$regex": search, "$options": "i"}},
        ]
    
    total = await db.trade_ads.count_documents(query)
    ads = await db.trade_ads.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    
    return {"ads": ads, "total": total}


@router.get("/trade-ads/my")
async def get_my_trade_ads(request: Request):
    """Get current user's trade ads"""
    user = await get_current_user(request)
    ads = await db.trade_ads.find(
        {"user_id": user["user_id"], "status": "active"}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"ads": ads}


@router.post("/trade-ads/create")
async def create_trade_ad(data: TradeAdCreateRequest, request: Request):
    """Create a new trade advertisement"""
    user = await get_current_user(request)
    
    if not data.offering_inventory_ids:
        raise HTTPException(status_code=400, detail="Must offer at least one item")
    if not data.seeking_item_ids:
        raise HTTPException(status_code=400, detail="Must seek at least one item")
    if len(data.offering_inventory_ids) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 offered items")
    if len(data.seeking_item_ids) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 sought items")
    
    # Limit active ads per user
    active_count = await db.trade_ads.count_documents({"user_id": user["user_id"], "status": "active"})
    if active_count >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 active trade ads")
    
    # Cooldown: 5 minutes between ads
    last_ad = await db.trade_ads.find_one(
        {"user_id": user["user_id"]},
        sort=[("created_at", -1)]
    )
    if last_ad and last_ad.get("created_at"):
        last_time = datetime.fromisoformat(last_ad["created_at"].replace("Z", "+00:00")) if isinstance(last_ad["created_at"], str) else last_ad["created_at"]
        cooldown_end = last_time + timedelta(minutes=5)
        if datetime.now(timezone.utc) < cooldown_end:
            remaining = int((cooldown_end - datetime.now(timezone.utc)).total_seconds())
            raise HTTPException(status_code=429, detail=f"Cooldown: wait {remaining} seconds before creating another ad")
    
    # Validate offered items belong to user
    offering_items = []
    for inv_id in data.offering_inventory_ids:
        item = await db.user_inventory.find_one({
            "inventory_id": inv_id,
            "user_id": user["user_id"]
        })
        if not item:
            raise HTTPException(status_code=400, detail=f"Item {inv_id} not found in your inventory")
        
        item_def = await db.items.find_one({"item_id": item["item_id"]}, {"_id": 0})
        offering_items.append({
            "inventory_id": inv_id,
            "item_id": item["item_id"],
            "item_name": item.get("item_name", item_def.get("name", "Unknown") if item_def else "Unknown"),
            "item_rarity": item.get("item_rarity", item_def.get("rarity", "common") if item_def else "common"),
            "item_image": item.get("item_image", item_def.get("image_url") if item_def else None),
            "item_value": item_def.get("value", 0) if item_def else 0,
            "item_rap": item_def.get("rap", 0) if item_def else 0,
        })

    # Validate seeking items exist
    seeking_items = []
    for item_id in data.seeking_item_ids:
        item_def = await db.items.find_one({"item_id": item_id}, {"_id": 0})
        if not item_def:
            raise HTTPException(status_code=400, detail=f"Item type '{item_id}' does not exist")
        seeking_items.append({
            "item_id": item_id,
            "item_name": item_def.get("name", "Unknown"),
            "item_rarity": item_def.get("rarity", "common"),
            "item_image": item_def.get("image_url"),
            "item_value": item_def.get("value", 0),
            "item_rap": item_def.get("rap", 0),
        })
    
    ad_id = f"ta_{uuid.uuid4().hex[:12]}"
    ad = {
        "ad_id": ad_id,
        "user_id": user["user_id"],
        "username": user["username"],
        "offering_items": offering_items,
        "seeking_items": seeking_items,
        "offering_names": ", ".join(i["item_name"] for i in offering_items),
        "seeking_names": ", ".join(i["item_name"] for i in seeking_items),
        "note": (data.note or "")[:200],
        "offering_g": max(0.0, data.offering_g),
        "seeking_g": max(0.0, data.seeking_g),
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.trade_ads.insert_one(ad)
    ad.pop("_id", None)
    
    return {"success": True, "ad": ad}


@router.post("/trade-ads/delete")
async def delete_trade_ad(data: TradeAdDeleteRequest, request: Request):
    """Delete own trade ad"""
    user = await get_current_user(request)
    
    ad = await db.trade_ads.find_one({
        "ad_id": data.ad_id,
        "user_id": user["user_id"],
        "status": "active"
    })
    if not ad:
        raise HTTPException(status_code=404, detail="Trade ad not found")
    
    await db.trade_ads.update_one(
        {"ad_id": data.ad_id},
        {"$set": {"status": "deleted", "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True}


# ============== PRESTIGE SYSTEM ENDPOINTS ==============

