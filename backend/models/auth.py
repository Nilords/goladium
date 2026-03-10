from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class UserCreate(BaseModel):
    email: Optional[str] = None
    password: str
    username: str
    turnstile_token: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str
    turnstile_token: Optional[str] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    username: str
    balance: float
    balance_a: float = 0.0
    level: int
    xp: int
    xp_progress: Optional[dict] = None
    total_spins: int
    total_wins: int
    total_losses: int
    net_profit: float
    total_wagered: float = 0.0
    avatar: Optional[str] = None
    vip_status: Optional[str] = None
    name_color: Optional[str] = None
    badge: Optional[str] = None
    frame: Optional[str] = None
    active_tag: Optional[str] = None
    active_name_color: Optional[str] = None
    active_jackpot_pattern: Optional[str] = None
    created_at: datetime
    last_wheel_spin: Optional[datetime] = None
    game_pass_level: int = 1
    game_pass_xp: int = 0
    galadium_pass_active: bool = False
    game_pass_reset_date: Optional[datetime] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class AvatarUpdate(BaseModel):
    avatar: str
