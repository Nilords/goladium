from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime


class CosmeticType(str):
    TAG = "tag"
    NAME_COLOR = "name_color"
    JACKPOT_PATTERN = "jackpot_pattern"


class PrestigeCosmeticTemplate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cosmetic_id: str
    display_name: str
    cosmetic_type: str
    description: str
    asset_path: Optional[str] = None
    asset_value: Optional[str] = None
    prestige_cost: int
    tier: str = "standard"
    unlock_level: int = 0
    is_available: bool = True


class UserPrestigeItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ownership_id: str
    user_id: str
    cosmetic_id: str
    cosmetic_type: str
    purchased_at: datetime
    purchase_price: int


class PrestigePurchaseRequest(BaseModel):
    cosmetic_id: str


class PrestigeActivateRequest(BaseModel):
    cosmetic_id: str
    cosmetic_type: str


class CurrencyConvertRequest(BaseModel):
    g_amount: float = Field(..., ge=1000)
