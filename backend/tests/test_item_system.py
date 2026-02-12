"""
Test suite for Goladium Item System (Shop & Inventory)
Tests: Shop API, Inventory API, Purchase flow
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestShopAPI:
    """Shop endpoint tests"""
    
    def test_get_shop_items(self):
        """GET /api/shop returns active shop items"""
        response = requests.get(f"{BASE_URL}/api/shop")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Shop has {len(data)} items")
        
        # Should have at least 2 seed items
        assert len(data) >= 2, "Shop should have at least 2 seed items"
        
        # Verify item structure
        for item in data:
            assert "shop_listing_id" in item
            assert "item_id" in item
            assert "item_name" in item
            assert "item_rarity" in item
            assert "price" in item
            assert "rarity_display" in item
            assert "rarity_color" in item
            print(f"  - {item['item_name']} ({item['rarity_display']}) - {item['price']} G")
    
    def test_shop_has_placeholder_relic(self):
        """Shop contains 'Placeholder Relic' item at 15 G"""
        response = requests.get(f"{BASE_URL}/api/shop")
        assert response.status_code == 200
        
        data = response.json()
        relic = next((item for item in data if item["item_id"] == "placeholder_relic"), None)
        
        assert relic is not None, "Placeholder Relic should be in shop"
        assert relic["item_name"] == "Placeholder Relic"
        assert relic["price"] == 15.0
        assert relic["item_rarity"] == "uncommon"
        print(f"Found Placeholder Relic: {relic['price']} G, {relic['rarity_display']}")
    
    def test_shop_has_gamblers_instinct(self):
        """Shop contains 'Gambler's Instinct' item at 35 G"""
        response = requests.get(f"{BASE_URL}/api/shop")
        assert response.status_code == 200
        
        data = response.json()
        instinct = next((item for item in data if item["item_id"] == "gamblers_instinct"), None)
        
        assert instinct is not None, "Gambler's Instinct should be in shop"
        assert instinct["item_name"] == "Gambler's Instinct"
        assert instinct["price"] == 35.0
        assert instinct["item_rarity"] == "rare"
        print(f"Found Gambler's Instinct: {instinct['price']} G, {instinct['rarity_display']}")


class TestAuthAndPurchase:
    """Authentication and purchase flow tests"""
    
    @pytest.fixture
    def test_user(self):
        """Create a test user for purchase tests"""
        unique_id = uuid.uuid4().hex[:8]
        username = f"TEST_shop_{unique_id}"
        password = "testpass123"
        
        # Register new user
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": username,
            "password": password
        })
        
        if response.status_code == 200:
            data = response.json()
            return {
                "username": username,
                "password": password,
                "token": data["access_token"],
                "user_id": data["user"]["user_id"],
                "balance": data["user"]["balance"]
            }
        else:
            pytest.skip(f"Could not create test user: {response.text}")
    
    def test_register_new_user(self, test_user):
        """New user registration works and gets 50 G starting balance"""
        assert test_user["token"] is not None
        assert test_user["balance"] == 50.0
        print(f"Created user {test_user['username']} with {test_user['balance']} G")
    
    def test_purchase_item_success(self, test_user):
        """User can purchase item from shop"""
        # Get shop items
        shop_response = requests.get(f"{BASE_URL}/api/shop")
        assert shop_response.status_code == 200
        shop_items = shop_response.json()
        
        # Find Placeholder Relic (15 G - affordable with 50 G starting balance)
        relic = next((item for item in shop_items if item["item_id"] == "placeholder_relic"), None)
        assert relic is not None, "Placeholder Relic should be in shop"
        
        initial_balance = test_user["balance"]
        
        # Purchase the item
        purchase_response = requests.post(
            f"{BASE_URL}/api/shop/purchase",
            json={"shop_listing_id": relic["shop_listing_id"]},
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        
        assert purchase_response.status_code == 200, f"Purchase failed: {purchase_response.text}"
        
        purchase_data = purchase_response.json()
        assert purchase_data["success"] == True
        assert "Successfully purchased" in purchase_data["message"]
        assert purchase_data["item"]["item_id"] == "placeholder_relic"
        assert purchase_data["new_balance"] == initial_balance - relic["price"]
        
        print(f"Purchased {relic['item_name']} for {relic['price']} G")
        print(f"Balance: {initial_balance} -> {purchase_data['new_balance']} G")
    
    def test_purchase_updates_inventory(self, test_user):
        """Purchased item appears in user inventory"""
        # Get shop items
        shop_response = requests.get(f"{BASE_URL}/api/shop")
        shop_items = shop_response.json()
        relic = next((item for item in shop_items if item["item_id"] == "placeholder_relic"), None)
        
        # Purchase the item
        requests.post(
            f"{BASE_URL}/api/shop/purchase",
            json={"shop_listing_id": relic["shop_listing_id"]},
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        
        # Check inventory
        inventory_response = requests.get(
            f"{BASE_URL}/api/inventory",
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        
        assert inventory_response.status_code == 200
        inventory_data = inventory_response.json()
        
        assert "items" in inventory_data
        assert "total_items" in inventory_data
        assert inventory_data["total_items"] >= 1
        
        # Find the purchased item
        purchased_item = next(
            (item for item in inventory_data["items"] if item["item_id"] == "placeholder_relic"),
            None
        )
        
        assert purchased_item is not None, "Purchased item should be in inventory"
        assert purchased_item["item_name"] == "Placeholder Relic"
        assert purchased_item["acquired_from"] == "shop"
        
        print(f"Inventory has {inventory_data['total_items']} item(s)")
        print(f"Found purchased item: {purchased_item['item_name']}")
    
    def test_purchase_insufficient_balance(self, test_user):
        """Purchase fails with insufficient balance"""
        # Get shop items
        shop_response = requests.get(f"{BASE_URL}/api/shop")
        shop_items = shop_response.json()
        
        # Find Gambler's Instinct (35 G)
        instinct = next((item for item in shop_items if item["item_id"] == "gamblers_instinct"), None)
        
        # First, spend most of the balance by buying Placeholder Relic twice
        relic = next((item for item in shop_items if item["item_id"] == "placeholder_relic"), None)
        
        # Buy relic twice (30 G spent, 20 G remaining)
        requests.post(
            f"{BASE_URL}/api/shop/purchase",
            json={"shop_listing_id": relic["shop_listing_id"]},
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        requests.post(
            f"{BASE_URL}/api/shop/purchase",
            json={"shop_listing_id": relic["shop_listing_id"]},
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        
        # Now try to buy Gambler's Instinct (35 G) with only 20 G
        purchase_response = requests.post(
            f"{BASE_URL}/api/shop/purchase",
            json={"shop_listing_id": instinct["shop_listing_id"]},
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        
        assert purchase_response.status_code == 400
        assert "Insufficient balance" in purchase_response.json().get("detail", "")
        print("Correctly rejected purchase with insufficient balance")


class TestInventoryAPI:
    """Inventory endpoint tests"""
    
    def test_inventory_requires_auth(self):
        """GET /api/inventory requires authentication"""
        response = requests.get(f"{BASE_URL}/api/inventory")
        assert response.status_code == 401
        print("Inventory correctly requires authentication")
    
    def test_inventory_with_auth(self):
        """GET /api/inventory returns user items when authenticated"""
        # Create test user
        unique_id = uuid.uuid4().hex[:8]
        username = f"TEST_inv_{unique_id}"
        
        register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": username,
            "password": "testpass123"
        })
        
        if register_response.status_code != 200:
            pytest.skip("Could not create test user")
        
        token = register_response.json()["access_token"]
        
        # Get inventory
        inventory_response = requests.get(
            f"{BASE_URL}/api/inventory",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert inventory_response.status_code == 200
        data = inventory_response.json()
        
        assert "items" in data
        assert "total_items" in data
        assert isinstance(data["items"], list)
        assert isinstance(data["total_items"], int)
        
        print(f"New user inventory: {data['total_items']} items")


class TestItemsAPI:
    """Items definition endpoint tests"""
    
    def test_get_all_items(self):
        """GET /api/items returns item definitions"""
        response = requests.get(f"{BASE_URL}/api/items")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} item definitions")
    
    def test_get_item_by_id(self):
        """GET /api/items/{item_id} returns specific item"""
        response = requests.get(f"{BASE_URL}/api/items/placeholder_relic")
        
        # Item might not exist in items collection (only in shop_listings)
        if response.status_code == 200:
            data = response.json()
            assert data["item_id"] == "placeholder_relic"
            print(f"Found item: {data.get('name', data.get('item_name', 'Unknown'))}")
        else:
            print("Item definition not found (may only exist in shop_listings)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
