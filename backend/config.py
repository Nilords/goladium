"""
config.py — Goladium Backend Configuration
All constants, feature flags, and data tables live here.
server.py imports from this module.
"""

import os
import secrets
import random
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ============== AUTH ==============

JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 168  # 7 days

# ============== EXTERNAL SERVICES ==============

DISCORD_WEBHOOK_URL = os.environ.get('DISCORD_WEBHOOK_URL', '')
TURNSTILE_SECRET_KEY = os.environ.get('TURNSTILE_SECRET_KEY', '')
ADMIN_API_KEY = os.environ.get('ADMIN_API_KEY', '')

# ============== FEATURE FLAGS ==============

ALPHA_REGISTRATION_OPEN = False

# ============== CHAT MODERATION ==============

PROFANITY_BLACKLIST = [
    # German
    "hurensohn", "wichser", "fotze", "schlampe", "arschloch", "missgeburt",
    "spast", "behindert", "schwuchtel", "kanake", "nigger", "neger",
    # English
    "fuck", "shit", "bitch", "cunt", "faggot", "retard", "nigga",
    "whore", "slut", "asshole", "dickhead", "motherfucker"
]

ADVERTISING_PATTERNS = [
    r'https?://',
    r'www\.',
    r'discord\.gg',
    r'discord\.com/invite',
    r't\.me/',
    r'bit\.ly',
    r'tinyurl',
    r'\.[a-z]{2,4}/',
    r'\.com\b',
    r'\.gg\b',
    r'\.io\b',
    r'\.net\b',
    r'\.org\b',
    r'\.xyz\b',
    r'\.bet\b',
    r'\.casino\b',
    r'ref[=\?]',
    r'referral',
    r'promo\s*code',
]

SPAM_TIME_WINDOW_SECONDS = 15
SPAM_SIMILARITY_THRESHOLD = 0.85

MUTE_2_MIN = 120
MUTE_5_MIN = 300
MUTE_10_MIN = 600

SPAM_ESCALATION = [
    MUTE_2_MIN,
    MUTE_2_MIN,
    MUTE_10_MIN,
    -1  # permanent
]

PROFANITY_ESCALATION = [
    0,          # warning only
    MUTE_2_MIN,
    MUTE_5_MIN,
    MUTE_10_MIN,
    -1          # permanent
]

ADVERTISING_ESCALATION = [
    MUTE_5_MIN,
    MUTE_10_MIN,
    -1          # permanent
]

# ============== XP & LEVELING ==============

XP_PER_G = 100  # 100 XP per 1 G wagered

LEVEL_XP_REQUIREMENTS = [
    0,      # Level 1
    500,    # Level 2
    800,    # Level 3
    1200,   # Level 4
    1700,   # Level 5
    2300,   # Level 6
    3000,   # Level 7
    3800,   # Level 8
    4700,   # Level 9
    5700,   # Level 10
    6800,   # Level 11
    8000,   # Level 12
    9300,   # Level 13
    10700,  # Level 14
    12200,  # Level 15
    13800,  # Level 16
    15500,  # Level 17
    17300,  # Level 18
    19200,  # Level 19
    21200,  # Level 20
]

# ============== GAME PASS ==============

GAME_PASS_XP_PER_LEVEL = 150
GAME_PASS_MAX_LEVEL = 50

# ============== QUEST DEFINITIONS ==============
# NOTE: Was temporarily disabled (HOTFIX). Re-enabled here.
# To disable: set QUEST_DEFINITIONS = [] in server.py after import.

QUEST_DEFINITIONS = [
    # Slot Spin quests
    {
        "quest_id": "spin_10",
        "name_en": "Spin Starter",
        "name_de": "Spin-Starter",
        "description_en": "Spin 10 times with minimum 5 G bet",
        "description_de": "Drehe 10 Mal mit mindestens 5 G Einsatz",
        "type": "spins",
        "target": 10,
        "min_bet": 5.0,
        "rewards": {"xp": 50, "g": 20},
        "game_pass_xp": 30,
        "difficulty": "easy"
    },
    {
        "quest_id": "spin_50",
        "name_en": "Slot Enthusiast",
        "name_de": "Slot-Enthusiast",
        "description_en": "Spin 50 times with minimum 5 G bet",
        "description_de": "Drehe 50 Mal mit mindestens 5 G Einsatz",
        "type": "spins",
        "target": 50,
        "min_bet": 5.0,
        "rewards": {"xp": 150, "g": 50},
        "game_pass_xp": 80,
        "difficulty": "medium"
    },
    {
        "quest_id": "spin_100_high",
        "name_en": "High Roller Spins",
        "name_de": "High-Roller Spins",
        "description_en": "Spin 100 times with minimum 5 G bet",
        "description_de": "Drehe 100 Mal mit mindestens 5 G Einsatz",
        "type": "spins",
        "target": 100,
        "min_bet": 5.0,
        "rewards": {"xp": 400, "g": 100, "a": 1},
        "game_pass_xp": 200,
        "difficulty": "hard"
    },
    # Slot Win quests
    {
        "quest_id": "win_5",
        "name_en": "Lucky Streak",
        "name_de": "Glückssträhne",
        "description_en": "Win 5 times on slots with minimum 5 G bet",
        "description_de": "Gewinne 5 Mal an Spielautomaten mit mindestens 5 G Einsatz",
        "type": "wins",
        "target": 5,
        "min_bet": 5.0,
        "rewards": {"xp": 75, "g": 25},
        "game_pass_xp": 50,
        "difficulty": "easy"
    },
    {
        "quest_id": "win_20",
        "name_en": "Winning Habit",
        "name_de": "Gewinner-Gewohnheit",
        "description_en": "Win 20 times on slots with minimum 5 G bet",
        "description_de": "Gewinne 20 Mal an Spielautomaten mit mindestens 5 G Einsatz",
        "type": "wins",
        "target": 20,
        "min_bet": 5.0,
        "rewards": {"xp": 200, "g": 60},
        "game_pass_xp": 100,
        "difficulty": "medium"
    },
    # Jackpot quests
    {
        "quest_id": "jackpot_win_1",
        "name_en": "Jackpot Winner",
        "name_de": "Jackpot-Gewinner",
        "description_en": "Win 1 jackpot with minimum 20 G pot",
        "description_de": "Gewinne 1 Jackpot mit mindestens 20 G Pot",
        "type": "jackpot_wins",
        "target": 1,
        "min_pot": 20,
        "rewards": {"xp": 100, "g": 30},
        "game_pass_xp": 60,
        "difficulty": "easy"
    },
    {
        "quest_id": "jackpot_win_3",
        "name_en": "Jackpot Regular",
        "name_de": "Jackpot-Stammgast",
        "description_en": "Win 3 jackpots with minimum 20 G pot",
        "description_de": "Gewinne 3 Jackpots mit mindestens 20 G Pot",
        "type": "jackpot_wins",
        "target": 3,
        "min_pot": 20,
        "rewards": {"xp": 250, "g": 75, "a": 1},
        "game_pass_xp": 120,
        "difficulty": "medium"
    },
    {
        "quest_id": "jackpot_win_5",
        "name_en": "Jackpot Champion",
        "name_de": "Jackpot-Champion",
        "description_en": "Win 5 jackpots with minimum 20 G pot",
        "description_de": "Gewinne 5 Jackpots mit mindestens 20 G Pot",
        "type": "jackpot_wins",
        "target": 5,
        "min_pot": 20,
        "rewards": {"xp": 500, "g": 150, "a": 2},
        "game_pass_xp": 250,
        "difficulty": "hard"
    },
    # Wagering quests
    {
        "quest_id": "wager_100",
        "name_en": "Small Spender",
        "name_de": "Kleiner Spieler",
        "description_en": "Wager a total of 100 G",
        "description_de": "Setze insgesamt 100 G",
        "type": "total_wagered",
        "target": 100,
        "rewards": {"xp": 100, "g": 25},
        "game_pass_xp": 60,
        "difficulty": "easy"
    },
    {
        "quest_id": "wager_500",
        "name_en": "Active Player",
        "name_de": "Aktiver Spieler",
        "description_en": "Wager a total of 500 G",
        "description_de": "Setze insgesamt 500 G",
        "type": "total_wagered",
        "target": 500,
        "rewards": {"xp": 300, "g": 80, "a": 1},
        "game_pass_xp": 150,
        "difficulty": "medium"
    },
    {
        "quest_id": "wager_2000",
        "name_en": "Dedicated Gambler",
        "name_de": "Engagierter Spieler",
        "description_en": "Wager a total of 2000 G",
        "description_de": "Setze insgesamt 2000 G",
        "type": "total_wagered",
        "target": 2000,
        "rewards": {"xp": 600, "g": 150, "a": 2},
        "game_pass_xp": 300,
        "difficulty": "hard"
    },
]

# ============== GAME PASS CHESTS ==============

GAMEPASS_CHEST = {
    "item_id": "gamepass_chest",
    "name": "GamePass Chest",
    "flavor_text": "A reward for your dedication. What treasures await inside?",
    "rarity": "uncommon",
    "base_value": 10.0,
    "category": "chest"
}

GALADIUM_CHEST = {
    "item_id": "galadium_chest",
    "name": "Galadium Chest",
    "flavor_text": "A premium reward for Galadium Pass holders. Golden treasures await!",
    "rarity": "rare",
    "base_value": 15.0,
    "category": "chest"
}

# ============== ITEM SYSTEM ==============

ITEM_RARITIES = {
    "common":    {"name": "Common",    "color": "#9CA3AF"},
    "uncommon":  {"name": "Uncommon",  "color": "#22C55E"},
    "rare":      {"name": "Rare",      "color": "#3B82F6"},
    "epic":      {"name": "Epic",      "color": "#A855F7"},
    "legendary": {"name": "Legendary", "color": "#F59E0B"},
}

# ============== PRESTIGE SYSTEM ==============

PRESTIGE_CONVERSION_RATE = 1000  # 1000 G = 1 A

PRESTIGE_COSMETICS = {
    # ===== PLAYER TAGS (20-30 A) =====
    "tag_glove": {
        "cosmetic_id": "tag_glove",
        "display_name": "Glove",
        "cosmetic_type": "tag",
        "description": "A pristine white glove. Handle with care.",
        "asset_path": "/assets/tags/glove.png",
        "asset_value": "🧤",
        "prestige_cost": 20,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "tag_mushroom": {
        "cosmetic_id": "tag_mushroom",
        "display_name": "Mushroom",
        "cosmetic_type": "tag",
        "description": "A lucky mushroom. May or may not be edible.",
        "asset_path": "/assets/tags/mushroom.png",
        "asset_value": "🍄",
        "prestige_cost": 20,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "tag_dog": {
        "cosmetic_id": "tag_dog",
        "display_name": "Dog",
        "cosmetic_type": "tag",
        "description": "Man's best friend. Always loyal.",
        "asset_path": "/assets/tags/dog.png",
        "asset_value": "🐕",
        "prestige_cost": 25,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "tag_cat": {
        "cosmetic_id": "tag_cat",
        "display_name": "Cat",
        "cosmetic_type": "tag",
        "description": "Nine lives, one lucky streak.",
        "asset_path": "/assets/tags/cat.png",
        "asset_value": "🐱",
        "prestige_cost": 25,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "tag_star": {
        "cosmetic_id": "tag_star",
        "display_name": "Star",
        "cosmetic_type": "tag",
        "description": "Shine bright among the players.",
        "asset_path": "/assets/tags/star.png",
        "asset_value": "⭐",
        "prestige_cost": 30,
        "tier": "premium",
        "unlock_level": 5,
        "is_available": True
    },
    # ===== NAME COLORS (10-20 A) =====
    "color_gold": {
        "cosmetic_id": "color_gold",
        "display_name": "Gold",
        "cosmetic_type": "name_color",
        "description": "The color of champions.",
        "asset_path": None,
        "asset_value": "#FFD700",
        "prestige_cost": 15,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "color_crimson": {
        "cosmetic_id": "color_crimson",
        "display_name": "Crimson",
        "cosmetic_type": "name_color",
        "description": "Bold and fearless.",
        "asset_path": None,
        "asset_value": "#DC143C",
        "prestige_cost": 10,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "color_azure": {
        "cosmetic_id": "color_azure",
        "display_name": "Azure",
        "cosmetic_type": "name_color",
        "description": "Cool as the ocean depths.",
        "asset_path": None,
        "asset_value": "#007FFF",
        "prestige_cost": 10,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "color_violet": {
        "cosmetic_id": "color_violet",
        "display_name": "Violet",
        "cosmetic_type": "name_color",
        "description": "Royal and mysterious.",
        "asset_path": None,
        "asset_value": "#8B00FF",
        "prestige_cost": 15,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "color_emerald": {
        "cosmetic_id": "color_emerald",
        "display_name": "Emerald",
        "cosmetic_type": "name_color",
        "description": "Fortune favors the green.",
        "asset_path": None,
        "asset_value": "#50C878",
        "prestige_cost": 20,
        "tier": "premium",
        "unlock_level": 3,
        "is_available": True
    },
    # ===== FREE JACKPOT PATTERNS (0 A) =====
    "default_lightblue": {
        "cosmetic_id": "default_lightblue",
        "display_name": "Sky Blue",
        "cosmetic_type": "jackpot_pattern",
        "description": "A calming sky blue.",
        "asset_path": None,
        "asset_value": "#38BDF8",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    "default_pink": {
        "cosmetic_id": "default_pink",
        "display_name": "Rose Pink",
        "cosmetic_type": "jackpot_pattern",
        "description": "Soft and elegant pink.",
        "asset_path": None,
        "asset_value": "#F472B6",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    "default_red": {
        "cosmetic_id": "default_red",
        "display_name": "Crimson Red",
        "cosmetic_type": "jackpot_pattern",
        "description": "Bold and powerful red.",
        "asset_path": None,
        "asset_value": "#EF4444",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    "default_orange": {
        "cosmetic_id": "default_orange",
        "display_name": "Sunset Orange",
        "cosmetic_type": "jackpot_pattern",
        "description": "Warm sunset glow.",
        "asset_path": None,
        "asset_value": "#F97316",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    "default_yellow": {
        "cosmetic_id": "default_yellow",
        "display_name": "Golden Yellow",
        "cosmetic_type": "jackpot_pattern",
        "description": "Bright and cheerful yellow.",
        "asset_path": None,
        "asset_value": "#FACC15",
        "prestige_cost": 0,
        "tier": "free",
        "unlock_level": 0,
        "is_available": True
    },
    # ===== PREMIUM JACKPOT PATTERNS (50-120 A) =====
    "pattern_flames": {
        "cosmetic_id": "pattern_flames",
        "display_name": "Inferno",
        "cosmetic_type": "jackpot_pattern",
        "description": "Set the reels ablaze with your wins.",
        "asset_path": "/assets/patterns/flames.png",
        "asset_value": "linear-gradient(180deg, #FF4500 0%, #FF8C00 50%, #FFD700 100%)",
        "prestige_cost": 50,
        "tier": "standard",
        "unlock_level": 0,
        "is_available": True
    },
    "pattern_northern_lights": {
        "cosmetic_id": "pattern_northern_lights",
        "display_name": "Northern Lights",
        "cosmetic_type": "jackpot_pattern",
        "description": "Dance of the aurora borealis.",
        "asset_path": "/assets/patterns/northern_lights.png",
        "asset_value": "linear-gradient(135deg, #00FF87 0%, #60EFFF 50%, #B967FF 100%)",
        "prestige_cost": 80,
        "tier": "premium",
        "unlock_level": 5,
        "is_available": True
    },
    "pattern_void": {
        "cosmetic_id": "pattern_void",
        "display_name": "Void Walker",
        "cosmetic_type": "jackpot_pattern",
        "description": "From the depths of nothingness, fortune emerges.",
        "asset_path": "/assets/patterns/void.png",
        "asset_value": "linear-gradient(180deg, #0D0221 0%, #3D1A78 30%, #6B21A8 60%, #F472B6 100%)",
        "prestige_cost": 120,
        "tier": "legendary",
        "unlock_level": 10,
        "is_available": True
    },
}

# ============== TRADING ==============

TRADE_G_FEE_PERCENT = 0.30  # 30% fee on G transfers (burned from economy)
TRADE_MAX_ITEMS_PER_SIDE = 10

# ============== MARKETPLACE ==============

MARKETPLACE_FEE_PERCENT = 5  # 5% fee on marketplace sales (currency sink)

# ============== CATALOG CACHE ==============

CATALOG_CACHE_TTL = 30  # seconds

# ============== SLOT ENGINE ==============

LINE_PRESETS = {
    4: [1, 2, 3, 4],
    8: list(range(1, 9)),
}

CLASSIC_SYMBOL_CONFIG = {
    # Calibrated 2026-03-01: avg RTP=95.30%
    "orange":   {"mult": 30.55,  "r0": 25.0, "r1": 27.0, "r2": 29.0, "r3": 31.0, "tier": "common"},
    "lemon":    {"mult": 63.42,  "r0": 22.0, "r1": 21.0, "r2": 20.0, "r3": 19.0, "tier": "common"},
    "cherry":   {"mult": 140.98, "r0": 16.0, "r1": 15.0, "r2": 14.0, "r3": 13.0, "tier": "uncommon"},
    "bar":      {"mult": 281.94, "r0":  9.0, "r1":  8.0, "r2":  7.0, "r3":  6.0, "tier": "rare"},
    "wild":     {"mult": 180.0,  "r0":  4.0, "r1":  4.0, "r2":  4.0, "r3":  4.0, "tier": "special", "is_wild": True},
    "seven":    {"mult": 187.96, "r0": 12.0, "r1": 13.0, "r2": 13.0, "r3": 14.0, "tier": "jackpot"},
    "diamond":  {"mult": 281.94, "r0": 12.0, "r1": 12.0, "r2": 13.0, "r3": 13.0, "tier": "jackpot"},
}

WILD_NERF_PROBABILITY = 0.1  # 0.1% when a reel is nerfed


def build_reel_strip(distribution: dict, strip_length: int = 1000) -> list:
    """Build a physical reel strip from a symbol distribution."""
    strip = []
    for symbol, count in distribution.items():
        strip.extend([symbol] * count)
    while len(strip) < strip_length:
        strip.append("orange")
    strip = strip[:strip_length]
    random.shuffle(strip)
    return strip


def build_config_from_table(config_table):
    """Build symbols dict and reel distributions from master config table."""
    symbols = {}
    reel_distributions = {0: {}, 1: {}, 2: {}, 3: {}}
    for sym_name, cfg in config_table.items():
        symbols[sym_name] = {"multiplier": cfg["mult"], "tier": cfg["tier"]}
        if cfg.get("is_wild"):
            symbols[sym_name]["is_wild"] = True
        for reel_idx in range(4):
            pct = cfg.get(f"r{reel_idx}", 0)
            reel_distributions[reel_idx][sym_name] = int(pct * 10)
    for reel_idx in range(4):
        total = sum(reel_distributions[reel_idx].values())
        if total < 1000:
            reel_distributions[reel_idx]["orange"] += (1000 - total)
        elif total > 1000:
            reel_distributions[reel_idx]["orange"] -= (total - 1000)
    return symbols, reel_distributions


CLASSIC_SYMBOLS, CLASSIC_REEL_DISTRIBUTIONS = build_config_from_table(CLASSIC_SYMBOL_CONFIG)

CLASSIC_REEL_STRIPS = {
    reel_idx: build_reel_strip(dist, 1000)
    for reel_idx, dist in CLASSIC_REEL_DISTRIBUTIONS.items()
}

SLOT_CONFIGS = {
    "classic": {
        "name": "Classic Fruits Deluxe",
        "reels": 4, "rows": 4, "max_paylines": 8,
        "volatility": "medium", "rtp": 95.5,
        "symbols": CLASSIC_SYMBOLS,
        "reel_strips": CLASSIC_REEL_STRIPS,
        "reel_distributions": CLASSIC_REEL_DISTRIBUTIONS,
        "features": {"wilds": True}
    },
    "book": {
        "name": "Book of Pharaohs",
        "reels": 5, "rows": 4, "max_paylines": 20,
        "volatility": "high", "rtp": 96.2,
        "symbols": {
            "ankh": {"multiplier": 2.0}, "scarab": {"multiplier": 3.0},
            "eye": {"multiplier": 5.0}, "anubis": {"multiplier": 10.0},
            "pharaoh": {"multiplier": 25.0}, "book": {"multiplier": 100.0, "is_wild": True}
        },
        "features": {"wilds": True, "expanding_symbols": True}
    },
    "diamond": {
        "name": "Diamond Empire",
        "reels": 5, "rows": 4, "max_paylines": 20,
        "volatility": "medium-high", "rtp": 95.8,
        "symbols": {
            "ruby": {"multiplier": 2.0}, "emerald": {"multiplier": 3.0, "weight": 20},
            "sapphire": {"multiplier": 5.0, "weight": 15}, "amethyst": {"multiplier": 8.0, "weight": 12},
            "diamond": {"multiplier": 20.0, "weight": 8}, "crown": {"multiplier": 50.0, "weight": 5},
            "wild_diamond": {"multiplier": 100.0, "weight": 3, "is_wild": True}
        },
        "features": {"wilds": True}
    },
    "cyber": {
        "name": "Cyber Reels",
        "reels": 5, "rows": 4, "max_paylines": 20,
        "volatility": "medium", "rtp": 95.5,
        "symbols": {
            "chip": {"multiplier": 2.0, "weight": 24}, "circuit": {"multiplier": 3.0, "weight": 20},
            "robot": {"multiplier": 5.0, "weight": 16}, "ai": {"multiplier": 10.0, "weight": 12},
            "cyber": {"multiplier": 25.0, "weight": 8}, "matrix": {"multiplier": 50.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True, "sticky_wilds": True}
    },
    "viking": {
        "name": "Viking Storm",
        "reels": 5, "rows": 4, "max_paylines": 20,
        "volatility": "high", "rtp": 96.0,
        "symbols": {
            "axe": {"multiplier": 2.0, "weight": 22}, "shield": {"multiplier": 3.0, "weight": 20},
            "helmet": {"multiplier": 5.0, "weight": 15}, "ship": {"multiplier": 10.0, "weight": 12},
            "thor": {"multiplier": 25.0, "weight": 8}, "odin": {"multiplier": 50.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True, "expanding_wilds": True}
    },
    "fortune": {
        "name": "Asian Fortune",
        "reels": 5, "rows": 4, "max_paylines": 20,
        "volatility": "medium", "rtp": 95.6,
        "symbols": {
            "fan": {"multiplier": 2.0, "weight": 24}, "lantern": {"multiplier": 3.0, "weight": 20},
            "koi": {"multiplier": 5.0, "weight": 16}, "dragon": {"multiplier": 10.0, "weight": 12},
            "lucky": {"multiplier": 25.0, "weight": 8}, "wild": {"multiplier": 50.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True}
    },
    "pirate": {
        "name": "Pirate's Chest",
        "reels": 5, "rows": 4, "max_paylines": 20,
        "volatility": "medium-high", "rtp": 95.4,
        "symbols": {
            "compass": {"multiplier": 2.0, "weight": 22}, "map": {"multiplier": 3.0, "weight": 20},
            "parrot": {"multiplier": 5.0, "weight": 15}, "ship": {"multiplier": 10.0, "weight": 12},
            "captain": {"multiplier": 25.0, "weight": 8}, "skull": {"multiplier": 100.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True}
    },
    "mythic": {
        "name": "Mythic Gods",
        "reels": 5, "rows": 4, "max_paylines": 20,
        "volatility": "high", "rtp": 96.1,
        "symbols": {
            "scroll": {"multiplier": 2.0, "weight": 22}, "lyre": {"multiplier": 3.0, "weight": 18},
            "athena": {"multiplier": 5.0, "weight": 14}, "poseidon": {"multiplier": 10.0, "weight": 12},
            "hades": {"multiplier": 20.0, "weight": 10}, "zeus": {"multiplier": 50.0, "weight": 6, "is_wild": True}
        },
        "features": {"wilds": True, "stacked_symbols": True}
    },
    "inferno": {
        "name": "Inferno Reels",
        "reels": 5, "rows": 4, "max_paylines": 20,
        "volatility": "very-high", "rtp": 94.5,
        "symbols": {
            "ember": {"multiplier": 2.0, "weight": 25}, "flame": {"multiplier": 3.0, "weight": 20},
            "phoenix": {"multiplier": 8.0, "weight": 15}, "demon": {"multiplier": 15.0, "weight": 12},
            "devil": {"multiplier": 30.0, "weight": 8}, "inferno": {"multiplier": 100.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True, "high_volatility": True}
    },
    "battle": {
        "name": "Slot Battle Arena",
        "reels": 5, "rows": 4, "max_paylines": 20,
        "volatility": "medium", "rtp": 95.0,
        "symbols": {
            "sword": {"multiplier": 2.0, "weight": 24}, "shield": {"multiplier": 3.0, "weight": 20},
            "armor": {"multiplier": 5.0, "weight": 16}, "knight": {"multiplier": 10.0, "weight": 12},
            "king": {"multiplier": 25.0, "weight": 8}, "trophy": {"multiplier": 50.0, "weight": 5, "is_wild": True}
        },
        "features": {"wilds": True}
    },
}

# ============== JACKPOT ==============

JACKPOT_MAX_PARTICIPANTS = 50
JACKPOT_MIN_PARTICIPANTS = 2
JACKPOT_WAIT_SECONDS = 600      # 10 minutes
JACKPOT_COUNTDOWN_SECONDS = 30  # 30 seconds countdown

# ============== OUTCOME TABLE ==============

OUTCOME_TABLE = [
    {"type": "loss",             "weight": 50,  "wins": 0},
    {"type": "win_cherry",       "weight": 10,  "wins": 1, "symbol": "cherry"},
    {"type": "win_lemon",        "weight": 8,   "wins": 1, "symbol": "lemon"},
    {"type": "win_orange",       "weight": 7,   "wins": 1, "symbol": "orange"},
    {"type": "win_bar",          "weight": 8,   "wins": 1, "symbol": "bar"},
    {"type": "win_bar_multi",    "weight": 4,   "wins": 2, "symbol": "bar"},
    {"type": "win_lemon_multi",  "weight": 3,   "wins": 2, "symbol": "lemon"},
    {"type": "win_seven",        "weight": 4,   "wins": 1, "symbol": "seven"},
    {"type": "win_seven_multi",  "weight": 2,   "wins": 2, "symbol": "seven"},
    {"type": "win_diamond",      "weight": 1,   "wins": 1, "symbol": "diamond"},
    {"type": "win_wild",         "weight": 1.5, "wins": 1, "symbol": "wild"},
    {"type": "win_diamond_multi","weight": 0.8, "wins": 2, "symbol": "diamond"},
    {"type": "win_wild_multi",   "weight": 0.5, "wins": 2, "symbol": "wild"},
    {"type": "win_mega",         "weight": 0.2, "wins": 3, "symbol": "seven"},
]

# ============== CHEST DROPS ==============

CHEST_G_DROPS = {
    "normal": {"min": 5,  "max": 15,  "chance": 80, "label": "Normal", "color": "#9ca3af"},
    "good":   {"min": 16, "max": 40,  "chance": 15, "label": "Gut",    "color": "#22c55e"},
    "rare":   {"min": 41, "max": 100, "chance": 4,  "label": "Selten", "color": "#a855f7"},
}
ITEM_DROP_CHANCE = 1  # 1% chance for item from shop

# ============== CHART ==============

CHART_RANGES = {
    "TODAY": {"resolution": "raw", "max_points": 500},
    "D":     {"resolution": "1d",  "max_points": 90},
    "W":     {"resolution": "1w",  "max_points": 52},
    "M":     {"resolution": "1M",  "max_points": 24},
    "ALL":   {"resolution": "1d",  "max_points": 1000},
}

# ============== PAYLINE DEFINITIONS (5x4 Grid) ==============
PAYLINES_4x4 = {
    # Horizontal paylines (4 rows, each spanning 4 columns)
    1: [(0, 0), (0, 1), (0, 2), (0, 3)],   # Row 0 - Top horizontal
    2: [(1, 0), (1, 1), (1, 2), (1, 3)],   # Row 1 - Second horizontal
    3: [(2, 0), (2, 1), (2, 2), (2, 3)],   # Row 2 - Third horizontal
    4: [(3, 0), (3, 1), (3, 2), (3, 3)],   # Row 3 - Bottom horizontal
    # Vertical paylines (4 columns, each spanning 4 rows)
    5: [(0, 0), (1, 0), (2, 0), (3, 0)],   # Column 0 - Leftmost vertical
    6: [(0, 1), (1, 1), (2, 1), (3, 1)],   # Column 1 - Second vertical
    7: [(0, 2), (1, 2), (2, 2), (3, 2)],   # Column 2 - Third vertical
    8: [(0, 3), (1, 3), (2, 3), (3, 3)],   # Column 3 - Rightmost vertical
}
