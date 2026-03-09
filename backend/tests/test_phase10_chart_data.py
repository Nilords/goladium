"""
Phase 10: Enhanced Item Charts Testing
Tests the /api/items/{item_id}/chart-data endpoint and related features:
- Value history tracking via admin setvalue endpoint
- Chart data structure (sales[], value_history[], current_rap, current_value)
- Item details endpoint returns correct demand/value/rap fields
- Catalog endpoint returns items with rap/value
- Marketplace listing/buy/delist functionality
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_KEY = "goladium_admin_secret_key_2024"
TEST_ITEM_ID = "gamblers_instinct"

# Auth credentials
TEST_USERNAME = "Ghost1"
TEST_PASSWORD = "Test123!"


@pytest.fixture(scope="module")
def auth_token():
    """Login and get auth token for authenticated requests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Login failed: {response.status_code} - {response.text}")


@pytest.fixture
def auth_headers(auth_token):
    """Return authorization headers with auth token"""
    return {
        'Authorization': f'Bearer {auth_token}',
        'Content-Type': 'application/json'
    }


@pytest.fixture
def admin_headers():
    """Return admin headers for admin endpoints"""
    return {
        'X-Admin-Key': ADMIN_KEY,
        'Content-Type': 'application/json'
    }


class TestChartDataEndpoint:
    """Test /api/items/{item_id}/chart-data endpoint"""
    
    def test_chart_data_returns_correct_structure(self):
        """Test chart-data endpoint returns expected fields"""
        response = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/chart-data")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required top-level fields
        assert "item_id" in data, "Missing item_id field"
        assert "current_rap" in data, "Missing current_rap field"
        assert "current_value" in data, "Missing current_value field"
        assert "sales" in data, "Missing sales array"
        assert "value_history" in data, "Missing value_history array"
        
        assert data["item_id"] == TEST_ITEM_ID
        assert isinstance(data["sales"], list), "sales should be a list"
        assert isinstance(data["value_history"], list), "value_history should be a list"
        
        print(f"✓ chart-data endpoint returns correct structure")
        print(f"  - current_value: {data['current_value']}")
        print(f"  - current_rap: {data['current_rap']}")
        print(f"  - sales count: {len(data['sales'])}")
        print(f"  - value_history count: {len(data['value_history'])}")
    
    def test_value_history_has_entries(self):
        """Test that gamblers_instinct has value history entries from admin setvalue"""
        response = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/chart-data")
        assert response.status_code == 200
        
        data = response.json()
        value_history = data.get("value_history", [])
        
        # gamblers_instinct should have value history entries
        assert len(value_history) >= 1, f"Expected at least 1 value_history entry, got {len(value_history)}"
        
        # Verify structure of value history entries
        for entry in value_history:
            assert "timestamp" in entry, "value_history entry missing timestamp"
            assert "value" in entry, "value_history entry missing value"
            assert isinstance(entry["value"], (int, float)), "value should be numeric"
        
        print(f"✓ value_history has {len(value_history)} entries")
        for i, entry in enumerate(value_history[:3]):  # Show first 3
            print(f"  [{i}] value={entry['value']}, timestamp={entry['timestamp'][:19]}")
    
    def test_sales_array_structure(self):
        """Test sales array structure (may be empty if no sales)"""
        response = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/chart-data")
        assert response.status_code == 200
        
        data = response.json()
        sales = data.get("sales", [])
        
        # Sales may be empty, but if not, verify structure
        if sales:
            sale = sales[0]
            expected_fields = ["timestamp", "price", "rap", "buyer", "seller"]
            for field in expected_fields:
                assert field in sale, f"Sale entry missing {field} field"
            assert isinstance(sale["price"], (int, float)), "price should be numeric"
            print(f"✓ sales array has {len(sales)} entries with correct structure")
        else:
            print(f"✓ sales array is empty (no sales yet for {TEST_ITEM_ID})")
    
    def test_chart_data_not_found_item(self):
        """Test chart-data returns 404 for non-existent item"""
        response = requests.get(f"{BASE_URL}/api/items/nonexistent_item_xyz/chart-data")
        assert response.status_code == 404, f"Expected 404 for non-existent item, got {response.status_code}"
        print("✓ chart-data returns 404 for non-existent item")


class TestItemDetailsEndpoint:
    """Test /api/items/{item_id}/details endpoint"""
    
    def test_item_details_returns_all_fields(self):
        """Test that item details returns expected fields including value, rap, demand"""
        response = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/details")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Required fields for item detail page
        required_fields = [
            "item_id", "name", "rarity", "value", "rap",
            "active_listings", "owner_count", "total_quantity"
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Demand object structure
        assert "demand" in data, "Missing demand object"
        demand = data["demand"]
        demand_fields = ["label", "is_manual", "seeking_ads", "recent_sales_7d", "active_listings"]
        for field in demand_fields:
            assert field in demand, f"Missing demand field: {field}"
        
        print(f"✓ item details returns all expected fields")
        print(f"  - name: {data['name']}")
        print(f"  - value: {data['value']}")
        print(f"  - rap: {data['rap']}")
        print(f"  - demand: {demand['label']} (is_manual={demand['is_manual']})")
    
    def test_item_details_shows_manual_demand(self):
        """Test that gamblers_instinct shows manual demand correctly"""
        response = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/details")
        assert response.status_code == 200
        
        data = response.json()
        demand = data.get("demand", {})
        
        # gamblers_instinct has manual demand set to "high"
        assert demand.get("is_manual") == True, "Expected is_manual=true for gamblers_instinct"
        assert demand.get("label") == "high", f"Expected demand label 'high', got '{demand.get('label')}'"
        
        print(f"✓ gamblers_instinct shows manual demand (is_manual=true, label='high')")
    
    def test_item_details_not_found(self):
        """Test details endpoint returns 404 for non-existent item"""
        response = requests.get(f"{BASE_URL}/api/items/nonexistent_item_xyz/details")
        assert response.status_code == 404
        print("✓ item details returns 404 for non-existent item")


class TestCatalogEndpoint:
    """Test /api/items/catalog endpoint"""
    
    def test_catalog_returns_items_with_value_rap(self):
        """Test catalog returns items with rap and value fields"""
        response = requests.get(f"{BASE_URL}/api/items/catalog")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "items" in data, "Missing items array"
        assert "total" in data, "Missing total count"
        
        items = data["items"]
        assert len(items) > 0, "Catalog should have at least 1 item"
        
        # Check each item has rap and value
        for item in items:
            assert "item_id" in item, "Item missing item_id"
            assert "rap" in item, f"Item {item.get('item_id')} missing rap field"
            assert "value" in item, f"Item {item.get('item_id')} missing value field"
        
        print(f"✓ catalog returns {len(items)} items with rap and value fields")
        for item in items[:3]:
            print(f"  - {item['item_id']}: value={item['value']}, rap={item['rap']}")
    
    def test_catalog_with_search_filter(self):
        """Test catalog search filter works"""
        response = requests.get(f"{BASE_URL}/api/items/catalog?search=gambler")
        assert response.status_code == 200
        
        data = response.json()
        items = data.get("items", [])
        
        # Should find gamblers_instinct
        found = any(item["item_id"] == TEST_ITEM_ID for item in items)
        assert found, f"Search for 'gambler' should find {TEST_ITEM_ID}"
        print(f"✓ catalog search filter finds {TEST_ITEM_ID}")


class TestAdminSetValueEndpoint:
    """Test /api/admin/setvalue endpoint - tracks value history"""
    
    def test_setvalue_updates_item_and_creates_history(self, admin_headers):
        """Test that admin setvalue updates item value and creates history entry"""
        # Get current chart data to count existing entries
        chart_before = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/chart-data").json()
        history_count_before = len(chart_before.get("value_history", []))
        current_value = chart_before.get("current_value", 0)
        
        # Set a new value (different from current)
        new_value = current_value + 100 if current_value < 5000 else current_value - 100
        
        response = requests.post(
            f"{BASE_URL}/api/admin/setvalue",
            headers=admin_headers,
            json={"item_id": TEST_ITEM_ID, "value": new_value}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("success") == True, "setvalue should return success=true"
        assert result.get("new_value") == new_value
        assert result.get("old_value") == current_value
        
        # Verify value_history has new entry
        chart_after = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/chart-data").json()
        history_count_after = len(chart_after.get("value_history", []))
        
        assert history_count_after > history_count_before, "Value history should have new entry"
        assert chart_after.get("current_value") == new_value
        
        print(f"✓ admin/setvalue updated value from {current_value} to {new_value}")
        print(f"  - value_history entries: {history_count_before} -> {history_count_after}")
    
    def test_setvalue_requires_admin_key(self):
        """Test that setvalue requires valid admin key"""
        response = requests.post(
            f"{BASE_URL}/api/admin/setvalue",
            json={"item_id": TEST_ITEM_ID, "value": 999}
        )
        assert response.status_code == 401, f"Expected 401 without admin key, got {response.status_code}"
        print("✓ admin/setvalue requires valid admin key")
    
    def test_setvalue_invalid_item(self, admin_headers):
        """Test setvalue returns 404 for non-existent item"""
        response = requests.post(
            f"{BASE_URL}/api/admin/setvalue",
            headers=admin_headers,
            json={"item_id": "nonexistent_item_xyz", "value": 100}
        )
        assert response.status_code == 404, f"Expected 404 for non-existent item, got {response.status_code}"
        print("✓ admin/setvalue returns 404 for non-existent item")


class TestMarketplaceEndpoints:
    """Test marketplace listing/buy/delist endpoints"""
    
    def test_marketplace_listings(self):
        """Test marketplace listings endpoint returns data"""
        response = requests.get(f"{BASE_URL}/api/marketplace/listings")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "listings" in data, "Missing listings array"
        
        print(f"✓ marketplace listings endpoint returns {len(data['listings'])} listings")
    
    def test_marketplace_listings_by_item(self):
        """Test marketplace listings can be filtered by item_id"""
        response = requests.get(f"{BASE_URL}/api/marketplace/listings?item_id={TEST_ITEM_ID}")
        assert response.status_code == 200
        
        data = response.json()
        listings = data.get("listings", [])
        
        # All listings should be for the requested item
        for listing in listings:
            assert listing.get("item_id") == TEST_ITEM_ID, "Listing should be for requested item"
        
        print(f"✓ marketplace listings filtered by item_id returns {len(listings)} listings for {TEST_ITEM_ID}")
    
    def test_marketplace_buy_requires_auth(self):
        """Test that buy endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/marketplace/buy",
            json={"listing_id": "fake_listing_id"}
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✓ marketplace buy requires authentication")
    
    def test_marketplace_delist_requires_auth(self):
        """Test that delist endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/marketplace/delist",
            json={"listing_id": "fake_listing_id"}
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✓ marketplace delist requires authentication")


class TestHealthAndBasics:
    """Basic health checks"""
    
    def test_backend_health(self):
        """Test backend is accessible"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code in [200, 404], f"Backend not accessible: {response.status_code}"
        print(f"✓ Backend accessible")
    
    def test_auth_login_works(self):
        """Test login endpoint works with test credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.status_code} - {response.text}"
        
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, "Login should return access_token"
        assert "user" in data, "Login should return user object"
        
        print(f"✓ Login works for {TEST_USERNAME}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
