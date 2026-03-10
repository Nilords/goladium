from pydantic import BaseModel
from typing import Optional


class AdminMuteRequest(BaseModel):
    username: str
    duration_seconds: int


class AdminBanRequest(BaseModel):
    username: str
    duration_seconds: int


class AdminBalanceRequest(BaseModel):
    username: str
    currency: str
    amount: float
    action: str


class AdminGaladiumPassRequest(BaseModel):
    username: str
    activate: bool


class AdminShopAddRequest(BaseModel):
    item_name: str
    item_rarity: str
    item_description: str
    item_image: Optional[str] = None
    price: float
    base_value: float
    available_hours: int
    untradeable_hours: int
    stock_limit: Optional[int] = None


class AdminShopEditRequest(BaseModel):
    shop_listing_id: str
    item_name: Optional[str] = None
    item_description: Optional[str] = None
    item_image: Optional[str] = None
    price: Optional[float] = None
    base_value: Optional[float] = None
    available_hours: Optional[int] = None
    untradeable_hours: Optional[int] = None
    stock_limit: Optional[int] = None
    is_active: Optional[bool] = None


class AdminShopRemoveRequest(BaseModel):
    shop_listing_id: str


class AdminEcoResetRequest(BaseModel):
    confirm: str


class AdminResetUserRequest(BaseModel):
    username: str


class AdminResetGamePassRequest(BaseModel):
    username: str


class AdminResetGamePassAllRequest(BaseModel):
    confirm: str


class AdminGiveChestsRequest(BaseModel):
    username: str
    amount: int
    chest_type: str = "gamepass"


class AdminGiveItemRequest(BaseModel):
    username: str
    shop_listing_id: Optional[str] = None
    item_name: Optional[str] = None
    item_rarity: str = "common"
    item_description: str = ""
    item_image: Optional[str] = None
    base_value: float = 0.0
    untradeable_hours: int = 0


class AdminGiveItemAllRequest(BaseModel):
    confirm: str
    shop_listing_id: Optional[str] = None
    item_name: Optional[str] = None
    item_rarity: str = "common"
    item_description: str = ""
    item_image: Optional[str] = None
    base_value: float = 0.0
    untradeable_hours: int = 0


class AdminSetValueRequest(BaseModel):
    item_id: str
    value: int


class AdminSetDemandRequest(BaseModel):
    item_id: str
    demand: str
