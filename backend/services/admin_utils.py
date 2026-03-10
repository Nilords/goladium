"""Admin utilities — API key verification, inventory item builder."""
import uuid
import logging
from datetime import datetime, timezone, timedelta
from fastapi import Request
from database import db
from config import *


def verify_admin_key(request: Request) -> bool:
    """Verify admin API key from request header"""
    api_key = request.headers.get("X-Admin-Key")
    if not ADMIN_API_KEY or not api_key:
        return False
    return api_key == ADMIN_API_KEY


async def _build_inventory_item(user_id: str, listing: dict = None, *, name: str, rarity: str,
                                 description: str, image: str, value: float, untradeable_hours: int) -> dict:
    """Build a user_inventory document for an admin-gifted item."""
    now = datetime.now(timezone.utc)
    item_id = listing["item_id"] if listing else f"item_{uuid.uuid4().hex[:12]}"
    untradeable_until = None
    if untradeable_hours > 0:
        untradeable_until = (now + timedelta(hours=untradeable_hours)).isoformat()
    return {
        "inventory_id": f"inv_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "item_id": item_id,
        "item_name": name,
        "item_rarity": rarity.lower(),
        "item_image": image,
        "item_flavor_text": description,
        "purchase_price": 0.0,
        "base_value": value,
        "acquired_at": now.isoformat(),
        "acquired_from": "admin_gift",
        "untradeable_until": untradeable_until,
    }
