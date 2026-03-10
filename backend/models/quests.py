from pydantic import BaseModel
from typing import List, Dict, Any


class QuestProgress(BaseModel):
    quest_id: str
    current: int = 0
    target: int
    completed: bool = False
    claimed: bool = False


class QuestResponse(BaseModel):
    quest_id: str
    name: str
    description: str
    type: str
    target: int
    current: int
    completed: bool
    claimed: bool
    rewards: Dict[str, Any]
    game_pass_xp: int
    difficulty: str


class GamePassStatus(BaseModel):
    level: int
    xp: int
    xp_to_next: int
    galadium_active: bool
    rewards_claimed: List[int] = []
    next_reward_level: int
