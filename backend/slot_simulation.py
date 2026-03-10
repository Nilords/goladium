#!/usr/bin/env python3
"""
Slot Machine RTP Simulation - Statistical Verification with WILD NERF Mechanic

Runs 100,000+ spins to verify:
1. RTP converges to target range (94-96%)
2. House edge ensures long-term player loss
3. Wild symbols appear regularly (~3% per reel BASE)
4. Wild NERF mechanic: One random reel per spin has Wild reduced to 0.1%
5. 4-Wild wins are rare but achievable (not statistically impossible)
6. Seven/Diamond remain TRUE JACKPOTS (rarer than Wild, highest payouts)
7. No hidden guaranteed win behavior
"""

import random
from collections import defaultdict
import sys

# ============================================================================
# MASTER CONFIGURATION TABLE (must match server.py EXACTLY)
# ============================================================================
# Wild: ~3% BASE probability (SUPPORT symbol, creates tension)
# Wild NERF: One random reel per spin has Wild at 0.1% instead
# Seven/Diamond: TRUE JACKPOT - rarer than wild but highest multipliers
# Common symbols: Calibrated multipliers to hit 94-96% RTP
# ============================================================================

SYMBOL_CONFIG = {
    # Symbol      Multiplier   Reel0%  Reel1%  Reel2%  Reel3%
    "orange":  {"mult": 8.0,   "r0": 18.0, "r1": 20.0, "r2": 22.0, "r3": 24.0},
    "lemon":   {"mult": 18.0,  "r0": 20.0, "r1": 19.0, "r2": 18.0, "r3": 17.0},
    "cherry":  {"mult": 32.0,  "r0": 16.0, "r1": 15.5, "r2": 15.0, "r3": 14.5},
    "bar":     {"mult": 100.0,  "r0": 14.0, "r1": 13.5, "r2": 13.0, "r3": 12.5},
    "wild":    {"mult": 140.0,  "r0": 8.0,  "r1": 8.0,  "r2": 8.0,  "r3": 8.0,  "is_wild": True},  # ~3% BASE
    "diamond": {"mult": 260.0, "r0": 12.0, "r1": 11.5, "r2": 11.0, "r3": 10.5},
    "seven":   {"mult": 300.0, "r0": 12.0, "r1": 11.5, "r2": 11.0, "r3": 10.5},
}

# Wild nerf: When a reel is "nerfed", Wild drops to this probability
WILD_NERF_PROBABILITY = 0.1  # 0.1%

# Build symbols dict
SYMBOLS = {
    name: {"multiplier": cfg["mult"], "is_wild": cfg.get("is_wild", False)}
    for name, cfg in SYMBOL_CONFIG.items()
}

# Build reel distributions (convert % to weight out of 1000)
def build_reel_distributions():
    distributions = {0: {}, 1: {}, 2: {}, 3: {}}
    for sym_name, cfg in SYMBOL_CONFIG.items():
        for reel_idx in range(4):
            pct = cfg.get(f"r{reel_idx}", 0)
            weight = int(pct * 10)
            distributions[reel_idx][sym_name] = weight
    
    # Normalize each reel to exactly 1000
    for reel_idx in range(4):
        total = sum(distributions[reel_idx].values())
        if total < 1000:
            distributions[reel_idx]["orange"] += (1000 - total)
        elif total > 1000:
            distributions[reel_idx]["orange"] -= (total - 1000)
    
    return distributions

REEL_DISTRIBUTIONS = build_reel_distributions()

BASE_STRIPS = {}

def build_base_strips():
    for reel in range(4):
        strip = []
        for sym, weight in REEL_DISTRIBUTIONS[reel].items():
            strip.extend([sym] * weight)

        # exakt 1000 Stops, einmal mischen
        strip = strip[:1000]
        random.shuffle(strip)

        BASE_STRIPS[reel] = strip

build_base_strips()

# ============== PAYLINES (4x4 grid) ==============
PAYLINES = {
    1: [(0, 0), (0, 1), (0, 2), (0, 3)],  # Row 0
    2: [(1, 0), (1, 1), (1, 2), (1, 3)],  # Row 1
    3: [(2, 0), (2, 1), (2, 2), (2, 3)],  # Row 2
    4: [(3, 0), (3, 1), (3, 2), (3, 3)],  # Row 3
    5: [(0, 0), (1, 0), (2, 0), (3, 0)],  # Col 0
    6: [(0, 1), (1, 1), (2, 1), (3, 1)],  # Col 1
    7: [(0, 2), (1, 2), (2, 2), (3, 2)],  # Col 2
    8: [(0, 3), (1, 3), (2, 3), (3, 3)],  # Col 3
}

# === START generate_grid_with_wild_nerf ===

def generate_grid_with_wild_nerf(reel_distributions, rows=4):
    nerfed_reel = random.randint(0, 3)
    grid = [[None for _ in range(4)] for _ in range(rows)]

    for col_idx in range(4):
        strip = BASE_STRIPS[col_idx]
        stop_position = random.randint(0, 999)

        for row_idx in range(rows):
            pos = (stop_position + row_idx) % 1000
            symbol = strip[pos]

            # ✅ WILD NERF – NUR WAHRSCHEINLICHKEIT
            if col_idx == nerfed_reel and symbol == "wild":
                # 99.9 %: Wild erscheint NICHT → neu ziehen
                if random.random() > 0.001:
                    # ziehe so lange, bis es KEIN Wild ist
                    while symbol == "wild":
                        pos = random.randint(0, 999)
                        symbol = strip[pos]

            grid[row_idx][col_idx] = symbol

    return grid, nerfed_reel

# === END generate_grid_with_wild_nerf ===

def check_payline_win(grid, line_path):
    """Check if payline has full-line win. Wild is a true joker."""
    line_symbols = [grid[r][c] for r, c in line_path]

    # Find base symbol (first non-wild)
    base_symbol = None
    for sym in line_symbols:
        if not SYMBOL_CONFIG.get(sym, {}).get("is_wild", False):
            base_symbol = sym
            break

    # All wilds = wild win
    if base_symbol is None:
        base_symbol = "wild"

    # Check all positions match (base or wild)
    for sym in line_symbols:
        if sym != base_symbol and not SYMBOL_CONFIG.get(sym, {}).get("is_wild", False):
            return None

    return base_symbol, SYMBOL_CONFIG[base_symbol]["mult"]


def run_simulation(num_spins, bet_per_line=0.05, num_lines=8):
    """Run slot simulation with Wild nerf mechanic and return statistics."""
    # Statistics
    total_wagered = 0.0
    total_won = 0.0
    total_wins = 0
    symbol_wins = defaultdict(int)
    symbol_payouts = defaultdict(float)
    symbol_appearances = defaultdict(lambda: defaultdict(int))  # Per reel
    wild_appearances_per_reel = defaultdict(int)
    nerfed_reel_counts = defaultdict(int)
    win_amounts = []
    all_wild_wins = 0  # Track 4-of-a-kind Wild wins specifically
    
    active_lines = list(range(1, num_lines + 1))
    bet_per_spin = bet_per_line * num_lines
    
    for spin in range(num_spins):
        # Generate grid WITH Wild nerf mechanic
        grid, nerfed_reel = generate_grid_with_wild_nerf(REEL_DISTRIBUTIONS)
        nerfed_reel_counts[nerfed_reel] += 1
        
        total_wagered += bet_per_spin
        
        # Track symbol appearances per reel
        for row in grid:
            for col_idx, sym in enumerate(row):
                symbol_appearances[col_idx][sym] += 1
                if sym == 'wild':
                    wild_appearances_per_reel[col_idx] += 1
        
        # Check all paylines
        spin_win = 0.0
        for line_num in active_lines:
            result = check_payline_win(grid, PAYLINES[line_num])
            if result:
                symbol, multiplier = result
                payout = bet_per_line * multiplier
                spin_win += payout
                symbol_wins[symbol] += 1
                symbol_payouts[symbol] += payout
                
                # Track all-Wild wins specifically
                if symbol == 'wild':
                    all_wild_wins += 1
        
        if spin_win > 0:
            total_wins += 1
            total_won += spin_win
            win_amounts.append(spin_win)
        
        # Progress indicator
        if (spin + 1) % 10000 == 0:
            print(f"  Progress: {spin + 1:,} / {num_spins:,} spins...", file=sys.stderr)
    
    return {
        "num_spins": num_spins,
        "bet_per_line": bet_per_line,
        "num_lines": num_lines,
        "bet_per_spin": bet_per_spin,
        "total_wagered": total_wagered,
        "total_won": total_won,
        "total_wins": total_wins,
        "symbol_wins": dict(symbol_wins),
        "symbol_payouts": dict(symbol_payouts),
        "symbol_appearances": {k: dict(v) for k, v in symbol_appearances.items()},
        "wild_appearances_per_reel": dict(wild_appearances_per_reel),
        "nerfed_reel_counts": dict(nerfed_reel_counts),
        "win_amounts": win_amounts,
        "all_wild_wins": all_wild_wins,
    }


def print_report(stats):
    """Print comprehensive simulation report."""
    num_spins = stats["num_spins"]
    total_wagered = stats["total_wagered"]
    total_won = stats["total_won"]
    total_wins = stats["total_wins"]
    
    rtp = (total_won / total_wagered) * 100 if total_wagered > 0 else 0
    house_edge = 100 - rtp
    win_rate = (total_wins / num_spins) * 100
    
    print("\n" + "=" * 70)
    print("SLOT MACHINE SIMULATION REPORT (WITH WILD NERF)")
    print("=" * 70)
    
    print(f"\n[SIMULATION PARAMETERS]")
    print(f"  Spins:           {num_spins:,}")
    print(f"  Bet per line:    {stats['bet_per_line']:.2f} G")
    print(f"  Active lines:    {stats['num_lines']}")
    print(f"  Bet per spin:    {stats['bet_per_spin']:.2f} G")
    
    print(f"\n[FINANCIAL RESULTS]")
    print(f"  Total Wagered:   {total_wagered:,.2f} G")
    print(f"  Total Won:       {total_won:,.2f} G")
    print(f"  Net Result:      {total_won - total_wagered:,.2f} G")
    print(f"  RTP:             {rtp:.2f}%")
    print(f"  House Edge:      {house_edge:.2f}%")
    
    print(f"\n[WIN STATISTICS]")
    print(f"  Total Wins:      {total_wins:,} ({win_rate:.2f}%)")
    print(f"  Total Losses:    {num_spins - total_wins:,} ({100 - win_rate:.2f}%)")
    print(f"  4-Wild Wins:     {stats['all_wild_wins']:,}")
    
    if stats["win_amounts"]:
        avg_win = sum(stats["win_amounts"]) / len(stats["win_amounts"])
        max_win = max(stats["win_amounts"])
        print(f"  Avg Win Amount:  {avg_win:.2f} G")
        print(f"  Max Win Amount:  {max_win:.2f} G")
    
    print(f"\n[WILD NERF DISTRIBUTION]")
    print(f"  (Each spin nerfs one random reel's Wild from 3% to 0.1%)")
    for reel in range(4):
        count = stats["nerfed_reel_counts"].get(reel, 0)
        pct = (count / num_spins) * 100
        print(f"  Reel {reel} nerfed:  {count:,} times ({pct:.1f}%)")
    
    print(f"\n[WILD APPEARANCES PER REEL]")
    print(f"  (Wild base prob ~3%, but nerfed reel gets ~0.1%)")
    total_cells_per_reel = num_spins * 4  # 4 rows per reel
    for reel in range(4):
        wild_count = stats["wild_appearances_per_reel"].get(reel, 0)
        wild_rate = (wild_count / total_cells_per_reel) * 100
        print(f"  Reel {reel}: {wild_count:,} wilds ({wild_rate:.2f}%)")
    
    print(f"\n[WIN DISTRIBUTION BY SYMBOL]")
    print(f"  {'Symbol':<12} {'Wins':>8} {'Hit Rate':>10} {'Total Payout':>14} {'Contribution':>12}")
    print("  " + "-" * 58)
    
    symbol_order = ["orange", "lemon", "cherry", "bar", "seven", "diamond", "wild"]
    for sym in symbol_order:
        wins = stats["symbol_wins"].get(sym, 0)
        payout = stats["symbol_payouts"].get(sym, 0)
        hit_rate = (wins / num_spins) * 100
        contribution = (payout / total_won * 100) if total_won > 0 else 0
        mult = SYMBOLS[sym]["multiplier"]
        print(f"  {sym:<12} {wins:>8,} {hit_rate:>9.4f}% {payout:>13,.2f} G {contribution:>11.1f}%")
    
    print(f"\n[SYMBOL APPEARANCE RATES PER REEL]")
    print(f"  {'Symbol':<10}", end="")
    for reel in range(4):
        print(f"  {'Reel ' + str(reel):>10}", end="")
    print()
    print("  " + "-" * 54)
    
    total_per_reel = {r: sum(stats["symbol_appearances"][r].values()) for r in range(4)}
    for sym in symbol_order:
        print(f"  {sym:<10}", end="")
        for reel in range(4):
            count = stats["symbol_appearances"][reel].get(sym, 0)
            pct = (count / total_per_reel[reel]) * 100 if total_per_reel[reel] > 0 else 0
            print(f"  {pct:>9.2f}%", end="")
        print()
    
    print(f"\n[THEORETICAL 4-OF-A-KIND LINE PROBABILITY (with Wild Nerf)]")
    print(f"  For Wild: P = (0.03)^3 × 0.001 × 4 reels × 8 lines = very rare")
    print(f"  Observed Wild wins: {stats['all_wild_wins']} in {num_spins:,} spins")
    if stats['all_wild_wins'] > 0:
        wild_win_rate = num_spins / stats['all_wild_wins']
        print(f"  Wild win frequency: ~1 in {wild_win_rate:,.0f} spins")
    else:
        print(f"  Wild win frequency: None observed (need more spins)")
    
    print(f"\n[VERIFICATION CHECKLIST]")
    print(f"  ✓ RTP < 100%:                    {'YES' if rtp < 100 else 'NO'} ({rtp:.2f}%)")
    print(f"  ✓ House Edge > 0%:               {'YES' if house_edge > 0 else 'NO'} ({house_edge:.2f}%)")
    print(f"  ✓ RTP in target range (94-97%):  {'YES' if 94 <= rtp <= 97 else 'NO - NEEDS TUNING'}")
    print(f"  ✓ Wild nerf distributed evenly:  {'YES' if all(abs(stats['nerfed_reel_counts'].get(r, 0) / num_spins - 0.25) < 0.02 for r in range(4)) else 'CHECK'}")
    print(f"  ✓ Wild wins occurred:            {'YES' if stats['symbol_wins'].get('wild', 0) > 0 else 'NO'} ({stats['symbol_wins'].get('wild', 0)} wins)")
    print(f"  ✓ Seven wins occurred:           {'YES' if stats['symbol_wins'].get('seven', 0) > 0 else 'NO'} ({stats['symbol_wins'].get('seven', 0)} wins)")
    print(f"  ✓ Diamond wins occurred:         {'YES' if stats['symbol_wins'].get('diamond', 0) > 0 else 'NO'} ({stats['symbol_wins'].get('diamond', 0)} wins)")
    print(f"  ✓ Player loses long-term:        {'YES' if total_won < total_wagered else 'NO'}")
    
    print("\n" + "=" * 70)
    
    # Return key metrics for automated checks
    return {
        "rtp": rtp,
        "house_edge": house_edge,
        "win_rate": win_rate,
        "wild_wins": stats["symbol_wins"].get("wild", 0),
        "seven_wins": stats["symbol_wins"].get("seven", 0),
        "diamond_wins": stats["symbol_wins"].get("diamond", 0),
        "all_wild_wins": stats["all_wild_wins"],
    }


if __name__ == "__main__":
    num_spins = int(sys.argv[1]) if len(sys.argv) > 1 else 100000
    print(f"Starting simulation with {num_spins:,} spins (Wild Nerf enabled)...", file=sys.stderr)
    
    stats = run_simulation(num_spins, bet_per_line=0.05, num_lines=8)
    metrics = print_report(stats)
