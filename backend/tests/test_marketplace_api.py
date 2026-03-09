"""
Marketplace API Tests for Goladium Casino Platform
Tests marketplace feature: listings, list, buy, delist, my-listings, history, item details
"""
import pytest
import requests
import os
import uuid

# Base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USERNAME = "Ghost1"
TEST_PASSWORD = "Test123!"
TEST_BYPASS_HEADER = {"x-test-bypass": "goladium_dev_2026"}

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        **TEST_BYPASS_HEADER
    })
    return session

@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token for Ghost1 user"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data
    return data["access_token"]

@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client

@pytest.fixture(scope="module")
def user_data(authenticated_client):
    """Get user data"""
    response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
    assert response.status_code == 200
    return response.json()


class TestMarketplaceListings:
    """Test GET /api/marketplace/listings endpoint"""
    
    def test_get_listings_no_auth_required(self, api_client):
        """Marketplace listings should be accessible without auth"""
        # Remove auth header temporarily
        auth = api_client.headers.pop("Authorization", None)
        response = api_client.get(f"{BASE_URL}/api/marketplace/listings")
        if auth:
            api_client.headers["Authorization"] = auth
        
        assert response.status_code == 200
        data = response.json()
        assert "listings" in data
        assert "total" in data
        assert isinstance(data["listings"], list)
        print(f"Found {data['total']} marketplace listings")
    
    def test_get_listings_with_sort_newest(self, api_client):
        """Test sorting by newest"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/listings?sort=newest")
        assert response.status_code == 200
        data = response.json()
        assert "listings" in data
    
    def test_get_listings_with_sort_price_asc(self, api_client):
        """Test sorting by price ascending"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/listings?sort=price_asc")
        assert response.status_code == 200
        data = response.json()
        if len(data["listings"]) >= 2:
            # Verify prices are ascending
            for i in range(len(data["listings"]) - 1):
                assert data["listings"][i]["price"] <= data["listings"][i+1]["price"]
    
    def test_get_listings_with_sort_price_desc(self, api_client):
        """Test sorting by price descending"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/listings?sort=price_desc")
        assert response.status_code == 200
        data = response.json()
        if len(data["listings"]) >= 2:
            # Verify prices are descending
            for i in range(len(data["listings"]) - 1):
                assert data["listings"][i]["price"] >= data["listings"][i+1]["price"]
    
    def test_get_listings_with_rarity_filter(self, api_client):
        """Test filtering by rarity"""
        for rarity in ["common", "uncommon", "rare", "epic", "legendary"]:
            response = api_client.get(f"{BASE_URL}/api/marketplace/listings?rarity={rarity}")
            assert response.status_code == 200
            data = response.json()
            # Verify all items match the rarity filter
            for listing in data["listings"]:
                assert listing["item_rarity"] == rarity
    
    def test_get_listings_with_search(self, api_client):
        """Test search functionality"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/listings?search=gambler")
        assert response.status_code == 200
        data = response.json()
        # Verify search results contain the search term (case insensitive)
        for listing in data["listings"]:
            assert "gambler" in listing["item_name"].lower()
    
    def test_get_listings_pagination(self, api_client):
        """Test pagination with limit and offset"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/listings?limit=5&offset=0")
        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 5
        assert data["offset"] == 0
        assert len(data["listings"]) <= 5


class TestMarketplaceMyListings:
    """Test GET /api/marketplace/my-listings endpoint"""
    
    def test_my_listings_requires_auth(self, api_client):
        """My listings should require authentication"""
        # Remove auth header temporarily
        auth = api_client.headers.pop("Authorization", None)
        response = api_client.get(f"{BASE_URL}/api/marketplace/my-listings")
        if auth:
            api_client.headers["Authorization"] = auth
        
        assert response.status_code == 401
    
    def test_get_my_listings(self, authenticated_client, user_data):
        """Get current user's listings"""
        response = authenticated_client.get(f"{BASE_URL}/api/marketplace/my-listings")
        assert response.status_code == 200
        data = response.json()
        assert "listings" in data
        assert isinstance(data["listings"], list)
        
        # Verify all listings belong to current user
        for listing in data["listings"]:
            assert listing["seller_id"] == user_data["user_id"]
        
        print(f"User {user_data['username']} has {len(data['listings'])} active listings")


class TestMarketplaceHistory:
    """Test GET /api/marketplace/history endpoint"""
    
    def test_get_history_no_auth_required(self, api_client):
        """Marketplace history should be accessible without auth"""
        # Remove auth header temporarily
        auth = api_client.headers.pop("Authorization", None)
        response = api_client.get(f"{BASE_URL}/api/marketplace/history")
        if auth:
            api_client.headers["Authorization"] = auth
        
        assert response.status_code == 200
        data = response.json()
        assert "history" in data
        assert isinstance(data["history"], list)
    
    def test_get_history_with_item_filter(self, api_client):
        """Test filtering history by item_id"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/history?item_id=gamblers_instinct")
        assert response.status_code == 200
        data = response.json()
        for sale in data["history"]:
            assert sale["item_id"] == "gamblers_instinct"


class TestMarketplaceList:
    """Test POST /api/marketplace/list endpoint"""
    
    def test_list_requires_auth(self, api_client):
        """Listing should require authentication"""
        # Remove auth header temporarily
        auth = api_client.headers.pop("Authorization", None)
        response = api_client.post(f"{BASE_URL}/api/marketplace/list", json={
            "inventory_id": "test",
            "price": 100
        })
        if auth:
            api_client.headers["Authorization"] = auth
        
        assert response.status_code == 401
    
    def test_list_invalid_inventory_id(self, authenticated_client):
        """Listing with invalid inventory_id should fail"""
        response = authenticated_client.post(f"{BASE_URL}/api/marketplace/list", json={
            "inventory_id": "nonexistent_inventory_id",
            "price": 100
        })
        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower()
    
    def test_list_price_must_be_positive(self, authenticated_client):
        """Price must be > 0"""
        response = authenticated_client.post(f"{BASE_URL}/api/marketplace/list", json={
            "inventory_id": "some_id",
            "price": 0
        })
        assert response.status_code == 400
        data = response.json()
        assert "price" in data["detail"].lower() or "greater than 0" in data["detail"].lower()
    
    def test_list_price_must_not_be_negative(self, authenticated_client):
        """Negative price should fail"""
        response = authenticated_client.post(f"{BASE_URL}/api/marketplace/list", json={
            "inventory_id": "some_id",
            "price": -50
        })
        assert response.status_code == 400


class TestMarketplaceBuy:
    """Test POST /api/marketplace/buy endpoint"""
    
    def test_buy_requires_auth(self, api_client):
        """Buying should require authentication"""
        # Remove auth header temporarily
        auth = api_client.headers.pop("Authorization", None)
        response = api_client.post(f"{BASE_URL}/api/marketplace/buy", json={
            "listing_id": "test"
        })
        if auth:
            api_client.headers["Authorization"] = auth
        
        assert response.status_code == 401
    
    def test_buy_nonexistent_listing(self, authenticated_client):
        """Buying nonexistent listing should fail"""
        response = authenticated_client.post(f"{BASE_URL}/api/marketplace/buy", json={
            "listing_id": "nonexistent_listing_id"
        })
        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower()
    
    def test_cannot_buy_own_listing(self, authenticated_client, user_data):
        """User should not be able to buy their own listing"""
        # First get user's listings
        listings_response = authenticated_client.get(f"{BASE_URL}/api/marketplace/my-listings")
        if listings_response.status_code == 200:
            listings = listings_response.json().get("listings", [])
            if listings:
                # Try to buy own listing
                response = authenticated_client.post(f"{BASE_URL}/api/marketplace/buy", json={
                    "listing_id": listings[0]["listing_id"]
                })
                assert response.status_code == 400
                data = response.json()
                assert "own" in data["detail"].lower() or "cannot buy" in data["detail"].lower()
            else:
                pytest.skip("User has no active listings to test self-buy prevention")
        else:
            pytest.skip("Could not get user listings")


class TestMarketplaceDelist:
    """Test POST /api/marketplace/delist endpoint"""
    
    def test_delist_requires_auth(self, api_client):
        """Delisting should require authentication"""
        # Remove auth header temporarily
        auth = api_client.headers.pop("Authorization", None)
        response = api_client.post(f"{BASE_URL}/api/marketplace/delist", json={
            "listing_id": "test"
        })
        if auth:
            api_client.headers["Authorization"] = auth
        
        assert response.status_code == 401
    
    def test_delist_nonexistent_listing(self, authenticated_client):
        """Delisting nonexistent listing should fail"""
        response = authenticated_client.post(f"{BASE_URL}/api/marketplace/delist", json={
            "listing_id": "nonexistent_listing_id"
        })
        assert response.status_code == 404


class TestItemDetails:
    """Test GET /api/items/{item_id}/details endpoint"""
    
    def test_get_item_details_no_auth_required(self, api_client):
        """Item details should be accessible without auth"""
        # Remove auth header temporarily
        auth = api_client.headers.pop("Authorization", None)
        response = api_client.get(f"{BASE_URL}/api/items/gamblers_instinct/details")
        if auth:
            api_client.headers["Authorization"] = auth
        
        # Could be 200 or 404 depending on if item exists
        assert response.status_code in [200, 404]
        
        if response.status_code == 200:
            data = response.json()
            # Verify expected fields
            assert "item_id" in data or "name" in data
            assert "rap" in data
    
    def test_get_item_details_nonexistent(self, api_client):
        """Nonexistent item should return 404"""
        response = api_client.get(f"{BASE_URL}/api/items/nonexistent_item_xyz/details")
        assert response.status_code == 404


class TestMarketplaceIntegration:
    """Integration tests for marketplace workflow"""
    
    def test_inventory_items_available(self, authenticated_client):
        """Verify user has inventory items (prerequisite for listing)"""
        response = authenticated_client.get(f"{BASE_URL}/api/inventory")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        print(f"User has {len(data['items'])} inventory items")
        
        # Check for non-chest items that could be listed
        sellable_items = [item for item in data["items"] 
                         if not item.get("item_id", "").endswith("_chest") 
                         and item.get("category") != "chest"]
        print(f"User has {len(sellable_items)} items that could be listed")
        return sellable_items
    
    def test_marketplace_listing_contains_required_fields(self, api_client):
        """Verify listings contain all required display fields"""
        response = api_client.get(f"{BASE_URL}/api/marketplace/listings")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = ["listing_id", "item_name", "item_rarity", "seller_id", 
                          "seller_username", "price", "status"]
        
        for listing in data["listings"]:
            for field in required_fields:
                assert field in listing, f"Missing field: {field}"
            
            # Verify status is active
            assert listing["status"] == "active"
            
            # Verify price is positive
            assert listing["price"] > 0


class TestMarketplaceBlockingBehavior:
    """Test that listed items are blocked from other actions"""
    
    def test_listed_item_blocks_inventory_sell(self, authenticated_client):
        """Items listed on marketplace should not be sellable via /api/inventory/sell"""
        # First get user's marketplace listings
        my_listings = authenticated_client.get(f"{BASE_URL}/api/marketplace/my-listings")
        if my_listings.status_code == 200 and my_listings.json().get("listings"):
            listing = my_listings.json()["listings"][0]
            inventory_id = listing.get("inventory_id")
            
            if inventory_id:
                # Try to sell via inventory sell endpoint
                sell_response = authenticated_client.post(f"{BASE_URL}/api/inventory/sell", json={
                    "inventory_id": inventory_id
                })
                # Should fail with 400 - item is listed
                assert sell_response.status_code == 400
                assert "marketplace" in sell_response.json()["detail"].lower()
            else:
                pytest.skip("Listing doesn't have inventory_id")
        else:
            pytest.skip("User has no active marketplace listings")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
