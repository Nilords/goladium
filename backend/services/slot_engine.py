"""Slot machine calculation engine — pure functions, no DB access."""
import random
from typing import List, Optional
from config import *


def build_reel_strip(distribution: dict, strip_length: int = 1000) -> list:
    """
    Build a physical reel strip from a symbol distribution.
    Distribution values are weights (how many of each symbol on the strip).
    """
    strip = []
    for symbol, count in distribution.items():
        strip.extend([symbol] * count)
    
    # Pad or truncate to exact strip length
    while len(strip) < strip_length:
        strip.append("orange")  # Pad with most common symbol
    strip = strip[:strip_length]
    
    # Shuffle to distribute symbols randomly on the strip
    random.shuffle(strip)
    return strip

# CLASSIC_SYMBOL_CONFIG, CLASSIC_SYMBOLS, CLASSIC_REEL_DISTRIBUTIONS, SLOT_CONFIGS -> config.py

# ============== JACKPOT CONFIGURATION ==============
# JACKPOT constants -> config.py


def check_payline_win(grid: list, line_path: list, symbols: dict) -> dict:
    """
    Check if a payline has a FULL-LINE win.
    
    STRICT RULES - NO PARTIAL WINS:
    - ALL positions on the payline must match the SAME symbol
    - Wild symbols can substitute for any symbol
    - If ANY position has a non-matching, non-wild symbol, NO WIN
    - Horizontal lines: ALL 5 positions must match
    - Vertical lines: ALL 4 positions must match
    
    Returns win info or None if no valid full-line win.
    """
    line_length = len(line_path)
    if line_length < 4:  # Minimum 4 for vertical lines
        return None
    
    # Get symbols at ALL positions along this payline
    line_symbols = [grid[r][c] for (r, c) in line_path]
    
    # Find the base symbol (first non-wild from left/top)
    base_symbol = None
    for sym in line_symbols:
        if not symbols.get(sym, {}).get("is_wild", False):
            base_symbol = sym
            break
    
    # If all symbols are wild, pay as highest non-wild symbol (diamond)
    if base_symbol is None:
        highest = max(
            ((s, d["multiplier"]) for s, d in symbols.items() if not d.get("is_wild")),
            key=lambda x: x[1],
            default=("diamond", 0)
        )
        base_symbol = highest[0]
    
    # STRICT CHECK: EVERY position must match base symbol OR be wild
    # If ANY position fails this check, return None (no win)
    for idx, sym in enumerate(line_symbols):
        is_base_match = (sym == base_symbol)
        is_wild = symbols.get(sym, {}).get("is_wild", False)
        
        if not is_base_match and not is_wild:
            # Found a non-matching, non-wild symbol - NO WIN
            return None
    
    # Full line match! All positions valid.
    return {
        "symbol": base_symbol,
        "matched_positions": list(line_path),  # All positions (4 or 5)
        "line_length": line_length  # Track if horizontal (5) or vertical (4)
    }


def validate_all_paylines(grid: list, active_lines: List[int], symbols: dict) -> list:
    """
    Validate ALL active paylines for FULL-LINE wins only.
    Returns list of winning paylines with complete data.
    Supports 8 straight paylines: 4 horizontal (5 symbols) + 4 vertical (4 symbols)
    """
    winning_paylines = []
    
    for line_num in active_lines:
        if line_num not in PAYLINES_4x4:
            continue
        
        line_path = PAYLINES_4x4[line_num]
        win_info = check_payline_win(grid, line_path, symbols)
        
        if win_info:
            # Get symbol multiplier
            symbol_mult = symbols.get(win_info["symbol"], {}).get("multiplier", 1.0)
            line_length = win_info.get("line_length", len(line_path))
            
            winning_paylines.append({
                "line_number": line_num,
                "line_path": [[r, c] for (r, c) in win_info["matched_positions"]],
                "symbol": win_info["symbol"],
                "match_count": line_length,  # 4 for vertical, 5 for horizontal
                "multiplier": symbol_mult,
                "line_type": "horizontal" if line_length == 5 else "vertical"
            })
    
    return winning_paylines


def generate_random_grid_with_wild_nerf(symbols: dict, rows: int = 4, cols: int = 4, reel_distributions: dict = None) -> list:
    """
    Generate a random grid using TRUE REEL STRIPS with WILD NERF MECHANIC.
    
    Wild Nerf Mechanic:
    - Wild symbols have ~3% base probability per reel (visible, exciting)
    - BUT: Each spin, ONE RANDOM REEL has Wild probability reduced to ~0.1%
    - This prevents 4-Wild lines from being farmable while keeping them achievable
    - The nerfed reel is DYNAMIC (random each spin), so players can't detect a pattern
    
    This simulates real slot machines while adding strategic anti-farm protection.
    """
    import random
    
    # If no distributions provided, fall back to uniform
    if not reel_distributions:
        symbol_list = list(symbols.keys())
        return [[random.choice(symbol_list) for _ in range(cols)] for _ in range(rows)]
    
    # Step 1: Select ONE random reel to "nerf" Wild probability this spin
    nerfed_reel = random.randint(0, cols - 1)
    
    # Step 2: Generate each reel column with appropriate Wild probability
    reel_stops = []
    for col_idx in range(cols):
        # Get base distribution for this reel
        base_dist = reel_distributions.get(col_idx, reel_distributions.get(0, {})).copy()
        
        # Apply Wild nerf if this is the nerfed reel
        if col_idx == nerfed_reel and 'wild' in base_dist:
            # Reduce Wild weight from ~30 (3%) to ~1 (0.1%)
            original_wild_weight = base_dist.get('wild', 0)
            nerf_weight = int(WILD_NERF_PROBABILITY * 10)  # 0.1% = weight of 1
            weight_reduction = original_wild_weight - nerf_weight
            base_dist['wild'] = nerf_weight
            # Redistribute the removed Wild weight to orange (most common)
            base_dist['orange'] = base_dist.get('orange', 0) + weight_reduction
        
        # Build reel strip from (potentially modified) distribution
        strip = []
        for symbol, weight in base_dist.items():
            strip.extend([symbol] * weight)
        
        # Normalize to 1000 if needed
        while len(strip) < 1000:
            strip.append('orange')
        strip = strip[:1000]
        random.shuffle(strip)
        
        # Roll RNG to determine stop position on this reel
        stop_position = random.randint(0, len(strip) - 1)
        
        # Extract consecutive symbols starting from stop position
        visible_symbols = []
        for row_idx in range(rows):
            symbol_idx = (stop_position + row_idx) % len(strip)
            visible_symbols.append(strip[symbol_idx])
        
        reel_stops.append(visible_symbols)
    
    # Convert from column-major (reels) to row-major (grid) format
    grid = []
    for row_idx in range(rows):
        row = []
        for col_idx in range(cols):
            row.append(reel_stops[col_idx][row_idx])
        grid.append(row)
    
    return grid


def calculate_slot_result(bet_per_line: float, active_lines: List[int], slot_id: str = "classic") -> dict:
    """
    TRUE REEL SLOT MACHINE - Pure RNG from physical reel strips with WILD NERF.
    
    How it works:
    1. Each reel gets ONE random stop position
    2. ONE random reel has Wild probability reduced from 3% to 0.1% (anti-farm)
    3. Visible rows are consecutive symbols from that position
    4. Paylines are evaluated for full-line matches only
    5. No manipulation - pure probability determines wins
    """
    config = SLOT_CONFIGS.get(slot_id, SLOT_CONFIGS["classic"])
    symbols = config["symbols"]
    reels_count = config["reels"]  # 4
    rows_count = config["rows"]    # 4
    reel_distributions = config.get("reel_distributions", None)
    
    # Step 1: Generate grid using TRUE reel logic with Wild nerf mechanic
    if slot_id == "classic" and reel_distributions:
        # Use Wild nerf for classic slot (main game)
        grid = generate_random_grid_with_wild_nerf(symbols, rows_count, reels_count, reel_distributions)
    else:
        # Use standard generation for other slots
        reel_strips = config.get("reel_strips", None)
        grid = generate_random_grid(symbols, rows_count, reels_count, reel_strips)
    
    # Step 2: Evaluate all active paylines for FULL-LINE wins only
    winning_paylines = validate_all_paylines(grid, active_lines, symbols)
    
    # Step 3: Calculate total bet and winnings
    total_bet = round(bet_per_line * len(active_lines), 2)
    total_win = 0.0
    
    # Calculate payout for each winning payline
    for wp in winning_paylines:
        line_payout = round(bet_per_line * wp["multiplier"], 2)
        wp["payout"] = line_payout
        total_win += line_payout
    
    total_win = round(total_win, 2)
    
    # Jackpot threshold: total win must be >= 20x total bet
    is_jackpot = total_win >= (total_bet * 20)
    
    return {
        "reels": grid,
        "total_bet": total_bet,
        "win_amount": total_win,
        "is_win": total_win > 0,
        "winning_paylines": winning_paylines,
        "is_jackpot": is_jackpot
    }


def get_average_symbol_probability(symbol: str, reel_distributions: dict) -> float:
    """Calculate average appearance probability for a symbol across all reels."""
    total_prob = 0
    for reel_idx, dist in reel_distributions.items():
        reel_total = sum(dist.values())
        symbol_count = dist.get(symbol, 0)
        total_prob += (symbol_count / reel_total) * 100 if reel_total > 0 else 0
    return round(total_prob / len(reel_distributions), 2)

# ============== SLOT GAME ENDPOINTS ==============
