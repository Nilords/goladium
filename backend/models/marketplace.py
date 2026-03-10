from pydantic import BaseModel


class MarketplaceListRequest(BaseModel):
    inventory_id: str
    price: float


class MarketplaceBuyRequest(BaseModel):
    listing_id: str


class MarketplaceDelistRequest(BaseModel):
    listing_id: str
