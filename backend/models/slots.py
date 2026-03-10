from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime


class SlotBetRequest(BaseModel):
    bet_per_line: float = Field(..., ge=0.01)
    active_lines: List[int] = Field(..., min_length=1)
    slot_id: str = "classic"


class PaylineWin(BaseModel):
    line_number: int
    line_path: List[List[int]]
    symbol: str
    match_count: int = 5
    multiplier: float
    payout: float


class SlotResult(BaseModel):
    reels: List[List[str]]
    total_bet: float
    win_amount: float
    is_win: bool
    new_balance: float
    xp_gained: int
    winning_paylines: List[PaylineWin] = []
    is_jackpot: bool = False


class WheelSpinResult(BaseModel):
    reward: float
    new_balance: float
    next_spin_available: datetime


class BetHistoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    bet_id: str
    timestamp: datetime
    game_type: str
    slot_id: Optional[str] = None
    bet_amount: float
    result: str
    win_amount: float
    net_outcome: float
