"""Route registry — assembles all sub-routers into api_router."""
from fastapi import APIRouter
from routes.auth import router as auth_router
from routes.slots import router as slots_router
from routes.wheel import router as wheel_router
from routes.jackpot import router as jackpot_router
from routes.user import router as user_router
from routes.items import router as items_router
from routes.inventory import router as inventory_router
from routes.marketplace import router as marketplace_router
from routes.trade_ads import router as trade_ads_router
from routes.prestige import router as prestige_router
from routes.chat import router as chat_router
from routes.trading import router as trading_router
from routes.quests import router as quests_router
from routes.admin import router as admin_router
from routes.players import router as players_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(slots_router)
api_router.include_router(wheel_router)
api_router.include_router(jackpot_router)
api_router.include_router(user_router)
api_router.include_router(items_router)
api_router.include_router(inventory_router)
api_router.include_router(marketplace_router)
api_router.include_router(trade_ads_router)
api_router.include_router(prestige_router)
api_router.include_router(chat_router)
api_router.include_router(trading_router)
api_router.include_router(quests_router)
api_router.include_router(admin_router)
api_router.include_router(players_router)
