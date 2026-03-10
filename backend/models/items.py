from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class ItemRarity(BaseModel):
    name: str
    color: str


class ItemDefinition(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_id: str
    name: str
    flavor_text: str
    rarity: str
    base_value: float
    image_url: Optional[str] = None
    category: str = "collectible"
    created_at: datetime
    is_tradeable: bool = False
    is_sellable: bool = False


class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    inventory_id: str
    user_id: str
    item_id: str
    item_name: str
    item_rarity: str
    item_image: Optional[str] = None
    item_flavor_text: str
    acquired_at: datetime
    acquired_from: str


class ShopItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    shop_listing_id: str
    item_id: str
    item_name: str
    item_rarity: str
    item_image: Optional[str] = None
    item_flavor_text: str
    price: float
    available_from: datetime
    available_until: Optional[datetime] = None
    stock_limit: Optional[int] = None
    stock_sold: int = 0
    is_active: bool = True


class ShopPurchaseRequest(BaseModel):
    shop_listing_id: str


class UserInventoryResponse(BaseModel):
    items: List[InventoryItem]
    total_items: int


class OpenChestRequest(BaseModel):
    inventory_id: str


class OpenChestsBatchRequest(BaseModel):
    inventory_ids: list[str]


class SellItemRequest(BaseModel):
    inventory_id: str


class SellItemsBatchRequest(BaseModel):
    inventory_ids: list[str]
