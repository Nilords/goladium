from pydantic import BaseModel
from typing import Optional, List


class TradeOfferItem(BaseModel):
    inventory_id: str
    item_id: str
    item_name: str
    item_rarity: str
    item_image: Optional[str] = None


class TradeOffer(BaseModel):
    user_id: str
    username: str
    items: List[TradeOfferItem] = []
    g_amount: float = 0.0


class TradeCreateRequest(BaseModel):
    recipient_username: str
    offered_items: List[str] = []
    offered_g: float = 0.0
    requested_items: List[str] = []
    requested_g: float = 0.0


class TradeCounterRequest(BaseModel):
    offered_items: List[str] = []
    offered_g: float = 0.0
    requested_items: List[str] = []
    requested_g: float = 0.0


class TradeResponse(BaseModel):
    trade_id: str
    status: str
    initiator: TradeOffer
    recipient: TradeOffer
    created_at: str
    completed_at: Optional[str] = None
    initiator_id: str
    recipient_id: str
    g_fee_amount: Optional[float] = None


class TradeAdCreateRequest(BaseModel):
    offering_inventory_ids: List[str]
    seeking_item_ids: List[str]
    note: Optional[str] = ""
    offering_g: float = 0.0
    seeking_g: float = 0.0


class TradeAdDeleteRequest(BaseModel):
    ad_id: str
