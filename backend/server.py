from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import aiohttp
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
import httpx
from passlib.context import CryptContext
import jwt
import asyncio
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

from config import *
from models import *
from services import *
from routes import api_router

# ================= HOTFIX =================
# Quests temporarily disabled - override config value
QUEST_DEFINITIONS = []
# =========================================

# MongoDB connection
from database import db, client

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

logging.info(f"Turnstile Secret Key loaded: {'YES' if TURNSTILE_SECRET_KEY else 'NO'}")

# Create the main app
app = FastAPI(
    title="Goladium API",
    description="Demo Casino Simulation Platform",
    version="0.1.0",
    root_path="/api"
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    lambda request, exc: JSONResponse(
        status_code=429,
        content={"detail": "Too many requests"}
    ),
)

# Create router with /api prefix


# XP_PER_G, LEVEL_XP_REQUIREMENTS, GAME_PASS_XP_PER_LEVEL, GAME_PASS_MAX_LEVEL -> config.py

# LINE_PRESETS -> config.py

# CLASSIC_SYMBOL_CONFIG, build_reel_strip, build_config_from_table, CLASSIC_SYMBOLS,
# CLASSIC_REEL_DISTRIBUTIONS, CLASSIC_REEL_STRIPS, SLOT_CONFIGS -> config.py

# ============== JACKPOT CONFIGURATION ==============
# JACKPOT constants -> config.py

# ============== AUTH ENDPOINTS ==============

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
        allowed = origin in cors_origins
        
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
    
    # Create indexes for marketplace
    await db.marketplace_listings.create_index("listing_id", unique=True)
    await db.marketplace_listings.create_index([("status", 1), ("created_at", -1)])
    await db.marketplace_listings.create_index([("seller_id", 1), ("status", 1)])
    await db.marketplace_listings.create_index([("item_id", 1), ("status", 1)])
    await db.marketplace_listings.create_index("inventory_id")
    
    # Create indexes for item price history (RAP)
    await db.item_price_history.create_index("sale_id", unique=True)
    await db.item_price_history.create_index([("item_id", 1), ("timestamp", -1)])
    
    # Create indexes for trade ads
    await db.trade_ads.create_index("ad_id", unique=True)
    await db.trade_ads.create_index([("user_id", 1), ("status", 1)])
    await db.trade_ads.create_index([("status", 1), ("created_at", -1)])
    
    # Create indexes for item owner history
    await db.item_owner_history.create_index("record_id", unique=True)
    await db.item_owner_history.create_index([("item_id", 1), ("acquired_at", -1)])
    await db.item_owner_history.create_index([("inventory_id", 1), ("released_at", 1)])
    await db.item_owner_history.create_index("user_id")
    
    # Create index for item value history
    await db.item_value_history.create_index([("item_id", 1), ("timestamp", 1)])
    
    # Create indexes for moderation logs
    await db.moderation_logs.create_index("log_id", unique=True)
    await db.moderation_logs.create_index([("user_id", 1), ("timestamp", -1)])
    await db.moderation_logs.create_index("violation_type")
    
    # Create indexes for value snapshots
    await db.value_snapshots.create_index("snapshot_id", unique=True)
    await db.value_snapshots.create_index([("user_id", 1), ("timestamp", -1)])
    
    # Create indexes for inventory value history
    await db.inventory_value_history.create_index("event_id", unique=True)
    await db.inventory_value_history.create_index([("user_id", 1), ("event_number", -1)])
    
    # Create indexes for account activity history
    await db.account_activity_history.create_index("event_id", unique=True)
    await db.account_activity_history.create_index([("user_id", 1), ("event_number", -1)])
    await db.account_activity_history.create_index([("user_id", 1), ("timestamp", 1)])
    
    # Create indexes for OHLC candle collections (TradingView-style charts)
    for resolution in ["1h", "1d"]:
        collection = db[f"account_candles_{resolution}"]
        await collection.create_index([("user_id", 1), ("bucket", 1)], unique=True)
        await collection.create_index([("user_id", 1), ("timestamp", 1)])
    
    # Seed items if they don't exist
    for item_data in SEED_ITEMS:
        existing = await db.items.find_one({"item_id": item_data["item_id"]})
        if not existing:
            item_doc = {
                **item_data,
                "created_at": datetime.now(timezone.utc),
                "is_tradeable": item_data.get("is_tradeable", False),
                "is_sellable": item_data.get("is_sellable", False)
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
