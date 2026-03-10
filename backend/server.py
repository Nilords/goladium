"""Goladium FastAPI application — app setup, CORS, startup/shutdown only."""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse
from slowapi.errors import RateLimitExceeded

from config import *
from models import *
from services import *
from database import db, client
from deps import limiter
from routes import api_router

# ================= HOTFIX =================
# Quests temporarily disabled - override config value
QUEST_DEFINITIONS = []
# =========================================

app = FastAPI(
    title="Goladium API",
    description="Demo Casino Simulation Platform",
    version="0.1.0",
    root_path="/api"
)

app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    lambda request, exc: JSONResponse(status_code=429, content={"detail": "Too many requests"}),
)

cors_origins_env = os.environ.get("CORS_ORIGINS", "")
if cors_origins_env and cors_origins_env != "*":
    cors_origins = cors_origins_env.split(",")
else:
    cors_origins = ["http://localhost:3000", "https://localhost:3000"]

class DynamicCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        origin = request.headers.get("origin", "")
        allowed = origin in cors_origins
        if request.method == "OPTIONS":
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app.include_router(api_router)


@app.on_event("startup")
async def initialize_item_system():
    """Initialize item system with seed items and shop listings on startup."""
    logger.info("Initializing item system...")
    await db.items.create_index("item_id", unique=True)
    await db.user_inventory.create_index([("user_id", 1), ("item_id", 1)])
    await db.shop_listings.create_index("shop_listing_id", unique=True)
    await db.shop_listings.create_index("item_id")
    await db.trades.create_index("trade_id", unique=True)
    await db.trades.create_index([("initiator_id", 1), ("status", 1)])
    await db.trades.create_index([("recipient_id", 1), ("status", 1)])
    await db.marketplace_listings.create_index("listing_id", unique=True)
    await db.marketplace_listings.create_index([("status", 1), ("created_at", -1)])
    await db.marketplace_listings.create_index([("seller_id", 1), ("status", 1)])
    await db.marketplace_listings.create_index([("item_id", 1), ("status", 1)])
    await db.marketplace_listings.create_index("inventory_id")
    await db.item_price_history.create_index("sale_id", unique=True)
    await db.item_price_history.create_index([("item_id", 1), ("timestamp", -1)])
    await db.trade_ads.create_index("ad_id", unique=True)
    await db.trade_ads.create_index([("user_id", 1), ("status", 1)])
    await db.trade_ads.create_index([("status", 1), ("created_at", -1)])
    await db.item_owner_history.create_index("record_id", unique=True)
    await db.item_owner_history.create_index([("item_id", 1), ("acquired_at", -1)])
    await db.item_owner_history.create_index([("inventory_id", 1), ("released_at", 1)])
    await db.item_owner_history.create_index("user_id")
    await db.item_value_history.create_index([("item_id", 1), ("timestamp", 1)])
    await db.moderation_logs.create_index("log_id", unique=True)
    await db.moderation_logs.create_index([("user_id", 1), ("timestamp", -1)])
    await db.moderation_logs.create_index("violation_type")
    await db.value_snapshots.create_index("snapshot_id", unique=True)
    await db.value_snapshots.create_index([("user_id", 1), ("timestamp", -1)])
    await db.inventory_value_history.create_index("event_id", unique=True)
    await db.inventory_value_history.create_index([("user_id", 1), ("event_number", -1)])
    await db.account_activity_history.create_index("event_id", unique=True)
    await db.account_activity_history.create_index([("user_id", 1), ("event_number", -1)])
    await db.account_activity_history.create_index([("user_id", 1), ("timestamp", 1)])
    for resolution in ["1h", "1d"]:
        col = db[f"account_candles_{resolution}"]
        await col.create_index([("user_id", 1), ("bucket", 1)], unique=True)
        await col.create_index([("user_id", 1), ("timestamp", 1)])

    for item_data in SEED_ITEMS:
        if not await db.items.find_one({"item_id": item_data["item_id"]}):
            await db.items.insert_one({
                **item_data,
                "created_at": datetime.now(timezone.utc),
                "is_tradeable": item_data.get("is_tradeable", False),
                "is_sellable": item_data.get("is_sellable", False)
            })
            logger.info(f"Created seed item: {item_data['name']}")

    if not await db.shop_listings.count_documents({"is_active": True}):
        now = datetime.now(timezone.utc)
        until = now + timedelta(days=30)
        for lst in [
            {"shop_listing_id": str(uuid.uuid4()), "item_id": "placeholder_relic",
             "item_name": "Placeholder Relic", "item_rarity": "uncommon", "item_image": None,
             "item_flavor_text": "Placeholder item. Somehow still valuable.",
             "price": 25.0, "available_from": now, "available_until": until,
             "stock_limit": None, "stock_sold": 0, "is_active": True},
            {"shop_listing_id": str(uuid.uuid4()), "item_id": "gamblers_instinct",
             "item_name": "Gambler's Instinct", "item_rarity": "rare", "item_image": None,
             "item_flavor_text": "Only real gamblers know when to keep going.",
             "price": 50.0, "available_from": now, "available_until": until,
             "stock_limit": None, "stock_sold": 0, "is_active": True},
        ]:
            await db.shop_listings.insert_one(lst)
            logger.info(f"Created shop listing: {lst['item_name']}")

    logger.info("Item system initialized successfully")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
