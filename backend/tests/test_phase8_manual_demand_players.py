"""
Phase 8: Manual Demand & Player Directory Tests
- POST /api/admin/setdemand - Set manual demand with admin key
- GET /api/items/{item_id}/details - demand.is_manual field verification
- GET /api/players - Player directory with search and sort
- GET /api/players/{user_id}/profile - Public player profile
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_KEY = "goladium_admin_secret_key_2024"
TEST_ITEM_ID = "gamblers_instinct"  # Known to have manual_demand='high'

class TestAdminSetDemand:
    """Admin Set Demand endpoint tests"""
    
    def test_set_demand_without_admin_key(self):
        """Should reject request without admin key"""
        response = requests.post(f"{BASE_URL}/api/admin/setdemand", json={
            "item_id": TEST_ITEM_ID,
            "demand": "high"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: setdemand rejects request without admin key")
    
    def test_set_demand_with_invalid_admin_key(self):
        """Should reject request with invalid admin key"""
        response = requests.post(
            f"{BASE_URL}/api/admin/setdemand",
            json={"item_id": TEST_ITEM_ID, "demand": "high"},
            headers={"X-Admin-Key": "wrong_key"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: setdemand rejects invalid admin key")
    
    def test_set_demand_invalid_label(self):
        """Should reject invalid demand labels"""
        response = requests.post(
            f"{BASE_URL}/api/admin/setdemand",
            json={"item_id": TEST_ITEM_ID, "demand": "invalid_label"},
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASSED: setdemand rejects invalid demand label")
    
    def test_set_demand_nonexistent_item(self):
        """Should return 404 for nonexistent item"""
        response = requests.post(
            f"{BASE_URL}/api/admin/setdemand",
            json={"item_id": "nonexistent_item_xyz_123", "demand": "high"},
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: setdemand returns 404 for nonexistent item")
    
    def test_set_demand_success(self):
        """Should successfully set demand with valid admin key"""
        response = requests.post(
            f"{BASE_URL}/api/admin/setdemand",
            json={"item_id": TEST_ITEM_ID, "demand": "high"},
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("item_id") == TEST_ITEM_ID
        assert data.get("new_demand") == "high"
        print(f"PASSED: setdemand success - old_demand={data.get('old_demand')}, new_demand={data.get('new_demand')}")


class TestDemandIndicatorAPI:
    """Item detail demand indicator tests"""
    
    def test_manual_demand_is_manual_true(self):
        """Item with manual demand should have is_manual=True"""
        # First ensure item has manual demand set
        requests.post(
            f"{BASE_URL}/api/admin/setdemand",
            json={"item_id": TEST_ITEM_ID, "demand": "high"},
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        
        response = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/details")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        demand = data.get("demand")
        assert demand is not None, "demand object missing from response"
        assert demand.get("is_manual") == True, f"Expected is_manual=True, got {demand.get('is_manual')}"
        assert demand.get("label") == "high", f"Expected label='high', got {demand.get('label')}"
        print(f"PASSED: Manual demand item has is_manual=True, label={demand.get('label')}")
    
    def test_demand_auto_fields_present(self):
        """Demand response should contain auto-calculation fields"""
        response = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/details")
        assert response.status_code == 200
        data = response.json()
        demand = data.get("demand")
        
        assert "auto_label" in demand, "auto_label missing"
        assert "auto_score" in demand, "auto_score missing"
        assert "seeking_ads" in demand, "seeking_ads missing"
        assert "recent_sales_7d" in demand, "recent_sales_7d missing"
        assert "active_listings" in demand, "active_listings missing"
        print(f"PASSED: Demand object contains auto fields: auto_label={demand.get('auto_label')}, auto_score={demand.get('auto_score')}")
    
    def test_all_demand_labels_valid(self):
        """Test setting all valid demand labels"""
        valid_labels = ["none", "low", "medium", "high", "extreme"]
        for label in valid_labels:
            response = requests.post(
                f"{BASE_URL}/api/admin/setdemand",
                json={"item_id": TEST_ITEM_ID, "demand": label},
                headers={"X-Admin-Key": ADMIN_KEY}
            )
            assert response.status_code == 200, f"Failed to set demand to '{label}': {response.text}"
            
            # Verify it was set
            detail_res = requests.get(f"{BASE_URL}/api/items/{TEST_ITEM_ID}/details")
            data = detail_res.json()
            assert data["demand"]["label"] == label, f"Expected label={label}, got {data['demand']['label']}"
        
        # Reset to high for other tests
        requests.post(
            f"{BASE_URL}/api/admin/setdemand",
            json={"item_id": TEST_ITEM_ID, "demand": "high"},
            headers={"X-Admin-Key": ADMIN_KEY}
        )
        print("PASSED: All demand labels (none/low/medium/high/extreme) work correctly")


class TestPlayerDirectory:
    """Player directory endpoint tests"""
    
    def test_get_players_list(self):
        """Should return player list"""
        response = requests.get(f"{BASE_URL}/api/players")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "players" in data, "players array missing"
        assert "total" in data, "total count missing"
        assert isinstance(data["players"], list)
        assert data["total"] > 0, "Expected at least 1 player"
        print(f"PASSED: Player directory returns {data['total']} total players")
    
    def test_player_has_required_fields(self):
        """Each player should have required fields"""
        response = requests.get(f"{BASE_URL}/api/players?limit=5")
        data = response.json()
        
        required_fields = ["user_id", "username", "level", "item_count", "created_at"]
        for player in data["players"]:
            for field in required_fields:
                assert field in player, f"Missing field '{field}' in player: {player.get('username')}"
        print("PASSED: All players have required fields (user_id, username, level, item_count, created_at)")
    
    def test_search_players(self):
        """Should filter players by search term"""
        response = requests.get(f"{BASE_URL}/api/players?search=Ghost")
        assert response.status_code == 200
        data = response.json()
        
        # Should find Ghost1
        usernames = [p["username"] for p in data["players"]]
        assert "Ghost1" in usernames, f"Ghost1 not found in search results: {usernames}"
        print(f"PASSED: Search for 'Ghost' returns Ghost1 in results")
    
    def test_sort_by_level(self):
        """Sort by level should work (default)"""
        response = requests.get(f"{BASE_URL}/api/players?sort=level&limit=10")
        data = response.json()
        
        levels = [p["level"] for p in data["players"]]
        assert levels == sorted(levels, reverse=True), f"Players not sorted by level descending: {levels}"
        print(f"PASSED: Players sorted by level descending: {levels[:5]}")
    
    def test_sort_by_name(self):
        """Sort by name should work"""
        response = requests.get(f"{BASE_URL}/api/players?sort=name&limit=10")
        data = response.json()
        
        names = [p["username"] for p in data["players"]]
        assert names == sorted(names), f"Players not sorted by name ascending"
        print(f"PASSED: Players sorted by name ascending: {names[:5]}")
    
    def test_sort_by_newest(self):
        """Sort by newest should work"""
        response = requests.get(f"{BASE_URL}/api/players?sort=newest&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert len(data["players"]) > 0
        print("PASSED: Sort by newest works")


class TestPlayerProfile:
    """Player public profile endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def get_ghost1_user_id(self):
        """Get Ghost1's user_id from player directory"""
        response = requests.get(f"{BASE_URL}/api/players?search=Ghost1")
        data = response.json()
        for p in data["players"]:
            if p["username"] == "Ghost1":
                self.ghost1_id = p["user_id"]
                return
        pytest.skip("Ghost1 user not found")
    
    def test_get_player_profile_success(self):
        """Should return player profile with inventory"""
        response = requests.get(f"{BASE_URL}/api/players/{self.ghost1_id}/profile")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("username") == "Ghost1"
        assert "inventory" in data
        assert "inventory_count" in data
        assert "marketplace_listings" in data
        assert "trade_ads" in data
        print(f"PASSED: Player profile loaded - inventory_count={data['inventory_count']}")
    
    def test_profile_inventory_has_items(self):
        """Ghost1 should have items in inventory"""
        response = requests.get(f"{BASE_URL}/api/players/{self.ghost1_id}/profile")
        data = response.json()
        
        # Ghost1 has 6116 items per context
        assert data["inventory_count"] > 0, f"Expected Ghost1 to have items, got {data['inventory_count']}"
        
        # Check inventory items structure
        if data["inventory"]:
            item = data["inventory"][0]
            assert "inventory_id" in item
            assert "item_name" in item
            assert "item_rarity" in item
        print(f"PASSED: Ghost1 has {data['inventory_count']} items in inventory")
    
    def test_nonexistent_player_profile(self):
        """Should return 404 for nonexistent player"""
        response = requests.get(f"{BASE_URL}/api/players/nonexistent_user_xyz_123/profile")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Nonexistent player returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
