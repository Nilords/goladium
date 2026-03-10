"""Inventory helpers — random shop items, chest reward generation."""
import random
import uuid
from datetime import datetime, timezone
from database import db
from config import *


async def get_random_shop_item():
    """Get a random item from the shop for 1% chest drop"""
    # Get all active shop listings
    now = datetime.now(timezone.utc)
    shop_items = await db.shop_listings.find({
        "available_until": {"$gt": now.isoformat()},
        "stock": {"$gt": 0}
    }).to_list(100)
    
    if not shop_items:
        # Fallback to items collection if no shop listings
        items = await db.items.find({
            "category": {"$ne": "chest"}  # Exclude chests
        }).to_list(100)
        if items:
            import random
            return random.choice(items)
        return None
    
    import random
    return random.choice(shop_items)


def generate_simple_chest_reward_sync() -> dict:
    """Generate G reward from a chest (sync version for non-item drops)"""
    import random
    
    roll = random.randint(1, 100)
    
    # 1% item drop - handled separately in async function
    if roll <= ITEM_DROP_CHANCE:
        return {"type": "item_roll"}  # Signal to fetch shop item
    
    # G drops (remaining 99%)
    cumulative = ITEM_DROP_CHANCE
    for tier, config in CHEST_G_DROPS.items():
        cumulative += config["chance"]
        if roll <= cumulative:
            g_amount = round(random.uniform(config["min"], config["max"]), 2)
            return {
                "type": "currency",
                "currency": "G",
                "amount": g_amount,
                "tier": tier,
                "tier_label": config["label"],
                "tier_color": config["color"]
            }
    
    # Fallback to normal
    g_amount = round(random.uniform(5, 15), 2)
    return {
        "type": "currency",
        "currency": "G", 
        "amount": g_amount,
        "tier": "normal",
        "tier_label": "Normal",
        "tier_color": "#9ca3af"
    }


