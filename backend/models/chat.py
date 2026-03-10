from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message_id: str
    user_id: str
    username: str
    message: str
    timestamp: datetime
    name_color: Optional[str] = None
    badge: Optional[str] = None
    active_tag: Optional[str] = None
    active_name_color: Optional[str] = None


class ChatMessageCreate(BaseModel):
    message: str = Field(..., max_length=500)


class LeaderboardEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    username: str
    level: int
    total_wins: int
    net_profit: float
    total_wagered: float = 0.0
    avatar: Optional[str] = None
    vip_status: Optional[str] = None
    frame: Optional[str] = None
