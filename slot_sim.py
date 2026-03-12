#!/usr/bin/env python3
"""
Fast slot simulator — numpy vectorized, probability-based (no strip bias).
Implements wild nerf: 1 random reel per spin gets 0.1% wild instead of 4%.

Usage:  python3 slot_sim.py [spins]          (default: 5_000_000)
        python3 slot_sim.py 10000000
"""
import numpy as np
import sys
import time

# ── MULTIPLIERS — edit these to test ─────────────────────────────────────────
MULTS = {
    "orange":   15,
    "lemon":    50,
    "cherry":  100,
    "bar":     250,
    "wild":      0,   # substitute only — pays as base symbol
    "seven":   650,
    "diamond": 1050,
}
# ─────────────────────────────────────────────────────────────────────────────

# Server reel distribution (must sum to 100% per reel)
SYMBOL_CONFIG = {
    #          r0    r1    r2    r3
    "orange":  [28.0, 30.0, 32.0, 34.0],
    "lemon":   [22.0, 21.0, 20.0, 19.0],
    "cherry":  [16.0, 15.0, 14.0, 13.0],
    "bar":     [12.0, 12.0, 12.0, 12.0],
    "wild":    [ 4.0,  4.0,  4.0,  4.0],
    "seven":   [10.0, 10.0, 10.0, 10.0],
    "diamond": [ 7.0,  7.0,  8.0,  8.0],
}

WILD_NERF = 0.1   # % when nerfed (vs 4% normal)

SYMS      = list(SYMBOL_CONFIG.keys())
SYM_IDX   = {s: i for i, s in enumerate(SYMS)}
WILD_I    = SYM_IDX["wild"]
DIAMOND_I = SYM_IDX["diamond"]
N_REELS   = 4
N_ROWS    = 4
LINES     = 8
BET_LINE  = 1.0

PAYLINES = [
    (np.array([0,0,0,0]), np.array([0,1,2,3])),
    (np.array([1,1,1,1]), np.array([0,1,2,3])),
    (np.array([2,2,2,2]), np.array([0,1,2,3])),
    (np.array([3,3,3,3]), np.array([0,1,2,3])),
    (np.array([0,1,2,3]), np.array([0,0,0,0])),
    (np.array([0,1,2,3]), np.array([1,1,1,1])),
    (np.array([0,1,2,3]), np.array([2,2,2,2])),
    (np.array([0,1,2,3]), np.array([3,3,3,3])),
]

def build_probs():
    normal_cum = []
    nerfed_cum = []
    for col in range(N_REELS):
        counts = np.array([SYMBOL_CONFIG[s][col] * 10 for s in SYMS], dtype=np.float64)
        counts_n = counts.copy()
        counts_n[WILD_I] = WILD_NERF * 10
        normal_cum.append(np.cumsum(counts / counts.sum()))
        nerfed_cum.append(np.cumsum(counts_n / counts_n.sum()))
    return normal_cum, nerfed_cum

def sample_col(n, cum):
    return np.searchsorted(cum, np.random.random(n)).astype(np.int8)

def simulate(n_spins, mults=None):
    if mults is None:
        mults = MULTS
    mult_arr = np.array([mults[s] for s in SYMS], dtype=np.float64)

    normal_cum, nerfed_cum = build_probs()

    BATCH     = min(n_spins, 2_000_000)
    sym_wins  = np.zeros(len(SYMS), dtype=np.int64)
    total_win = 0.0
    win_spins = 0
    remaining = n_spins
    t0 = time.perf_counter()

    while remaining > 0:
        b = min(remaining, BATCH)
        remaining -= b

        nerfed_reel = np.random.randint(0, N_REELS, b)

        grid = np.empty((b, N_ROWS, N_REELS), dtype=np.int8)
        for col in range(N_REELS):
            is_nerfed = nerfed_reel == col
            n_nf = int(is_nerfed.sum())
            n_nr = b - n_nf
            for row in range(N_ROWS):
                col_row = np.empty(b, dtype=np.int8)
                if n_nr > 0:
                    col_row[~is_nerfed] = sample_col(n_nr, normal_cum[col])
                if n_nf > 0:
                    col_row[is_nerfed]  = sample_col(n_nf, nerfed_cum[col])
                grid[:, row, col] = col_row

        spin_won = np.zeros(b, dtype=bool)

        for pl_rows, pl_cols in PAYLINES:
            line = grid[:, pl_rows, pl_cols]

            base = np.full(b, WILD_I, dtype=np.int8)
            for pos in range(N_REELS - 1, -1, -1):
                nw = line[:, pos] != WILD_I
                base[nw] = line[nw, pos]

            # all-wild line → pays as diamond
            base[base == WILD_I] = DIAMOND_I

            win = np.all((line == base[:, None]) | (line == WILD_I), axis=1)

            winning_bases = base[win].astype(np.intp)
            counts = np.bincount(winning_bases, minlength=len(SYMS))
            sym_wins  += counts
            total_win += float(np.dot(counts, mult_arr)) * BET_LINE
            spin_won  |= win

        win_spins += int(np.sum(spin_won))

    elapsed   = time.perf_counter() - t0
    total_bet = n_spins * LINES * BET_LINE
    rtp       = total_win / total_bet * 100

    print(f"\n{'='*60}")
    print(f"Spins:       {n_spins:>12,}   ({elapsed:.1f}s)")
    print(f"Win spins:   {win_spins:>12,}   ({win_spins/n_spins*100:.2f}%)")
    print(f"Total bet:   {total_bet:>12,.0f} G")
    print(f"Total won:   {total_win:>12,.0f} G")
    print(f"RTP:         {rtp:>11.2f}%")
    print(f"\nMults: orange={mults['orange']} lemon={mults['lemon']} cherry={mults['cherry']} bar={mults['bar']} seven={mults['seven']} diamond={mults['diamond']}")
    print(f"Wins per 1000 spins:")
    for i, sym in enumerate(SYMS):
        c = sym_wins[i]
        rtp_c = c / n_spins * 1000 * mult_arr[i] / (LINES * BET_LINE * 1000) * 100
        print(f"  {sym:8s}: {c/n_spins*1000:7.2f}/1000  |  {int(mult_arr[i]):>4}x  |  {rtp_c:.2f}% RTP")
    print('='*60)
    return rtp, sym_wins, n_spins


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5_000_000
    simulate(n)
