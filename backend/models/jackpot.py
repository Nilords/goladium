from pydantic import BaseModel, Field
from typing import Optional, List


class JackpotJoinRequest(BaseModel):
    bet_amount: float = Field(..., ge=0.01)


class JackpotParticipant(BaseModel):
    user_id: str
    username: str
    bet_amount: float
    win_chance: float
    avatar: Optional[str] = None
    jackpot_pattern: Optional[str] = None


class JackpotStatus(BaseModel):
    state: str
    total_pot: float
    participants: List[JackpotParticipant]
    countdown_seconds: Optional[int] = None
    winner: Optional[JackpotParticipant] = None
    winner_index: Optional[int] = None
    jackpot_id: Optional[str] = None
    max_participants: int = 50
    is_full: bool = False
