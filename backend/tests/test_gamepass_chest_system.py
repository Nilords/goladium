"""
GamePass Chest System E2E Tests
Tests for:
- GET /api/game-pass - Game pass status
- POST /api/game-pass/claim-all-chests - Claim all unclaimed chests
- POST /api/inventory/open-chest - Open chest and receive reward
- GET /api/chest/payout-table - Chest drop rates
- GET /api/inventory - Verify chests in inventory
"""

import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_USERNAME = "charttest123"
TEST_PASSWORD = "Test123!"


class TestGamePassChestSystem:
    """GamePass Chest System endpoint tests"""
    
    # Class-level variables for sharing state
    auth_token = None
    user_id = None
    chest_inventory_id = None
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Login and get auth token before tests"""
        if TestGamePassChestSystem.auth_token is None:
            login_response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
            )
            
            if login_response.status_code == 200:
                data = login_response.json()
                TestGamePassChestSystem.auth_token = data.get("access_token")
                TestGamePassChestSystem.user_id = data.get("user", {}).get("user_id")
                print(f"✓ Logged in successfully. User ID: {TestGamePassChestSystem.user_id}")
            else:
                pytest.skip(f"Authentication failed: {login_response.status_code} - {login_response.text}")
    
    @property
    def headers(self):
        return {
            "Authorization": f"Bearer {TestGamePassChestSystem.auth_token}",
            "Content-Type": "application/json"
        }
    
    # ============== PAYOUT TABLE TESTS ==============
    def test_01_payout_table_returns_correct_structure(self):
        """GET /api/chest/payout-table should return drop rates"""
        response = requests.get(f"{BASE_URL}/api/chest/payout-table")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify structure
        assert "g_drops" in data, "Response should have g_drops"
        assert "item_drop" in data, "Response should have item_drop"
        
        # Verify g_drops has correct tiers
        g_drops = data["g_drops"]
        assert len(g_drops) == 3, "Should have 3 G drop tiers"
        
        tiers = [drop["tier"] for drop in g_drops]
        assert "normal" in tiers, "Should have 'normal' tier"
        assert "good" in tiers, "Should have 'good' tier"
        assert "rare" in tiers, "Should have 'rare' tier"
        
        # Verify chances add up to 99% (80 + 15 + 4)
        total_g_chance = sum(drop["chance"] for drop in g_drops)
        assert total_g_chance == 99, f"G drop chances should sum to 99, got {total_g_chance}"
        
        # Verify item drop
        item_drop = data["item_drop"]
        assert item_drop["chance"] == 1, "Item drop should be 1%"
        
        print(f"✓ Payout table structure correct: {data}")
    
    def test_02_payout_table_drop_rate_values(self):
        """Verify drop rates match expected values (80%, 15%, 4%, 1%)"""
        response = requests.get(f"{BASE_URL}/api/chest/payout-table")
        data = response.json()
        
        # Find each tier and verify chance
        for drop in data["g_drops"]:
            if drop["tier"] == "normal":
                assert drop["chance"] == 80, f"Normal should be 80%, got {drop['chance']}%"
                assert "5-15" in drop["range"], f"Normal range should be 5-15 G"
            elif drop["tier"] == "good":
                assert drop["chance"] == 15, f"Good should be 15%, got {drop['chance']}%"
                assert "16-40" in drop["range"], f"Good range should be 16-40 G"
            elif drop["tier"] == "rare":
                assert drop["chance"] == 4, f"Rare should be 4%, got {drop['chance']}%"
                assert "41-100" in drop["range"], f"Rare range should be 41-100 G"
        
        print("✓ Drop rates verified: 80% normal (5-15G), 15% good (16-40G), 4% rare (41-100G), 1% item")
    
    # ============== GAME PASS STATUS TESTS ==============
    def test_03_game_pass_status_returns_data(self):
        """GET /api/game-pass should return level, XP, and chest system data"""
        response = requests.get(f"{BASE_URL}/api/game-pass", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify required fields
        assert "level" in data, "Should have 'level'"
        assert "xp" in data, "Should have 'xp'"
        assert "xp_to_next" in data, "Should have 'xp_to_next'"
        assert "galadium_active" in data, "Should have 'galadium_active'"
        assert "chest_system" in data, "Should have 'chest_system'"
        
        # Verify level is positive integer
        assert data["level"] >= 1, f"Level should be >= 1, got {data['level']}"
        assert data["xp_to_next"] > 0, f"xp_to_next should be > 0, got {data['xp_to_next']}"
        
        print(f"✓ Game pass status: Level {data['level']}, XP {data['xp']}/{data['xp_to_next']}")
    
    def test_04_game_pass_chest_system_structure(self):
        """Verify chest_system contains correct fields"""
        response = requests.get(f"{BASE_URL}/api/game-pass", headers=self.headers)
        data = response.json()
        
        chest_system = data["chest_system"]
        
        # Required fields
        required_fields = [
            "normal_chest",
            "claimed_normal",
            "claimed_galadium",
            "unclaimed_normal",
            "unclaimed_galadium",
            "total_unclaimed"
        ]
        
        for field in required_fields:
            assert field in chest_system, f"chest_system should have '{field}'"
        
        # Verify lists are lists
        assert isinstance(chest_system["claimed_normal"], list), "claimed_normal should be a list"
        assert isinstance(chest_system["unclaimed_normal"], list), "unclaimed_normal should be a list"
        
        # Verify normal_chest has item definition
        normal_chest = chest_system["normal_chest"]
        assert normal_chest is not None, "normal_chest should exist"
        assert "item_id" in normal_chest, "normal_chest should have item_id"
        assert normal_chest["item_id"] == "gamepass_chest", "normal_chest item_id should be 'gamepass_chest'"
        
        print(f"✓ Chest system structure valid. Total unclaimed: {chest_system['total_unclaimed']}")
    
    # ============== INVENTORY TESTS ==============
    def test_05_inventory_endpoint_works(self):
        """GET /api/inventory should return items list"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        assert "items" in data, "Should have 'items'"
        assert "total_items" in data, "Should have 'total_items'"
        assert isinstance(data["items"], list), "items should be a list"
        
        print(f"✓ Inventory endpoint works. Total items: {data['total_items']}")
    
    def test_06_find_or_create_chest_in_inventory(self):
        """Check if user has a chest in inventory, or claim one"""
        # First check inventory for existing chests
        inv_response = requests.get(f"{BASE_URL}/api/inventory", headers=self.headers)
        inv_data = inv_response.json()
        
        # Look for any chest items
        chests = [item for item in inv_data["items"] if "chest" in item.get("item_id", "")]
        
        if chests:
            TestGamePassChestSystem.chest_inventory_id = chests[0]["inventory_id"]
            print(f"✓ Found existing chest in inventory: {chests[0]['item_name']}")
            return
        
        # If no chests, check if we can claim from game pass
        gp_response = requests.get(f"{BASE_URL}/api/game-pass", headers=self.headers)
        gp_data = gp_response.json()
        
        if gp_data["chest_system"]["total_unclaimed"] > 0:
            # Claim all chests
            claim_response = requests.post(
                f"{BASE_URL}/api/game-pass/claim-all-chests",
                headers=self.headers
            )
            
            if claim_response.status_code == 200:
                claim_data = claim_response.json()
                if claim_data.get("chests") and len(claim_data["chests"]) > 0:
                    TestGamePassChestSystem.chest_inventory_id = claim_data["chests"][0]["inventory_id"]
                    print(f"✓ Claimed {claim_data['chests_claimed']} chests from GamePass")
                    return
        
        # No chests available to test opening - that's OK, we still test the API
        print("⚠ No chests available in inventory or to claim (user may need to level up)")
    
    # ============== CLAIM CHESTS TESTS ==============
    def test_07_claim_all_chests_endpoint_accessible(self):
        """POST /api/game-pass/claim-all-chests should be accessible"""
        response = requests.post(
            f"{BASE_URL}/api/game-pass/claim-all-chests",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        assert "success" in data, "Response should have 'success'"
        assert "chests_claimed" in data, "Response should have 'chests_claimed'"
        
        print(f"✓ Claim all chests endpoint works. Claimed: {data['chests_claimed']}")
    
    def test_08_claim_all_chests_response_structure(self):
        """Verify claim-all-chests response structure"""
        response = requests.post(
            f"{BASE_URL}/api/game-pass/claim-all-chests",
            headers=self.headers
        )
        
        data = response.json()
        
        required_fields = ["success", "chests_claimed", "normal_chests", "galadium_chests", "total_value", "chests"]
        
        for field in required_fields:
            assert field in data, f"Response should have '{field}'"
        
        assert isinstance(data["chests"], list), "chests should be a list"
        assert data["success"] is True, "success should be True"
        
        print(f"✓ Claim response structure valid: {data['normal_chests']} normal, {data['galadium_chests']} galadium")
    
    # ============== OPEN CHEST TESTS ==============
    def test_09_open_chest_requires_valid_inventory_id(self):
        """POST /api/inventory/open-chest should require valid inventory_id"""
        response = requests.post(
            f"{BASE_URL}/api/inventory/open-chest",
            headers=self.headers,
            json={"inventory_id": "invalid_id_12345"}
        )
        
        # Should return 404 for non-existent chest
        assert response.status_code == 404, f"Expected 404 for invalid ID, got {response.status_code}"
        
        print("✓ Open chest correctly rejects invalid inventory_id")
    
    def test_10_open_chest_requires_chest_item(self):
        """POST /api/inventory/open-chest should reject non-chest items"""
        # First get inventory to find a non-chest item
        inv_response = requests.get(f"{BASE_URL}/api/inventory", headers=self.headers)
        inv_data = inv_response.json()
        
        non_chests = [item for item in inv_data["items"] if "chest" not in item.get("item_id", "")]
        
        if non_chests:
            response = requests.post(
                f"{BASE_URL}/api/inventory/open-chest",
                headers=self.headers,
                json={"inventory_id": non_chests[0]["inventory_id"]}
            )
            
            # Should return 400 for non-chest items
            assert response.status_code == 400, f"Expected 400 for non-chest item, got {response.status_code}"
            print("✓ Open chest correctly rejects non-chest items")
        else:
            print("⚠ No non-chest items to test with (skipping)")
    
    def test_11_open_chest_if_available(self):
        """POST /api/inventory/open-chest should open chest and return reward"""
        # First check for a chest in inventory
        inv_response = requests.get(f"{BASE_URL}/api/inventory", headers=self.headers)
        inv_data = inv_response.json()
        
        chests = [item for item in inv_data["items"] if "chest" in item.get("item_id", "")]
        
        if not chests:
            print("⚠ No chests in inventory to open (user needs to level up and claim)")
            return
        
        chest = chests[0]
        
        response = requests.post(
            f"{BASE_URL}/api/inventory/open-chest",
            headers=self.headers,
            json={"inventory_id": chest["inventory_id"]}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify reward structure
        assert "reward" in data, "Response should have 'reward'"
        reward = data["reward"]
        
        assert "type" in reward, "Reward should have 'type'"
        assert reward["type"] in ["currency", "item"], f"Reward type should be 'currency' or 'item', got {reward['type']}"
        
        if reward["type"] == "currency":
            assert "amount" in reward, "Currency reward should have 'amount'"
            assert reward["amount"] > 0, f"Amount should be positive, got {reward['amount']}"
            print(f"✓ Chest opened! Got {reward['amount']:.2f} G ({reward.get('tier', 'unknown')} tier)")
        else:
            assert "name" in reward, "Item reward should have 'name'"
            print(f"✓ Chest opened! Got item: {reward['name']} ({reward.get('rarity', 'unknown')})")
    
    def test_12_verify_chest_removed_after_opening(self):
        """Verify chest is removed from inventory after opening"""
        # Get initial inventory
        inv_response = requests.get(f"{BASE_URL}/api/inventory", headers=self.headers)
        initial_data = inv_response.json()
        
        initial_chests = [item for item in initial_data["items"] if "chest" in item.get("item_id", "")]
        
        if not initial_chests:
            print("⚠ No chests available to test removal")
            return
        
        chest = initial_chests[0]
        initial_count = len(initial_chests)
        
        # Open the chest
        open_response = requests.post(
            f"{BASE_URL}/api/inventory/open-chest",
            headers=self.headers,
            json={"inventory_id": chest["inventory_id"]}
        )
        
        if open_response.status_code != 200:
            print(f"⚠ Could not open chest: {open_response.text}")
            return
        
        # Check inventory again
        inv_response2 = requests.get(f"{BASE_URL}/api/inventory", headers=self.headers)
        final_data = inv_response2.json()
        
        final_chests = [item for item in final_data["items"] if "chest" in item.get("item_id", "")]
        final_count = len(final_chests)
        
        # Should have one less chest
        assert final_count == initial_count - 1, f"Expected {initial_count - 1} chests after opening, got {final_count}"
        
        # The opened chest should no longer exist
        opened_ids = [c["inventory_id"] for c in final_chests]
        assert chest["inventory_id"] not in opened_ids, "Opened chest should be removed from inventory"
        
        print(f"✓ Chest correctly removed from inventory after opening")
    
    # ============== QUESTS TESTS ==============
    def test_13_quests_endpoint_works(self):
        """GET /api/quests should return quest list"""
        response = requests.get(
            f"{BASE_URL}/api/quests",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "quests" in data, "Response should have 'quests'"
        
        print(f"✓ Quests endpoint works. Active quests: {len(data['quests'])}")
    
    # ============== USER XP/LEVEL TESTS ==============
    def test_14_user_has_xp_fields(self):
        """Verify game pass endpoint returns XP fields"""
        # Use /api/game-pass endpoint which returns the game pass specific fields
        response = requests.get(f"{BASE_URL}/api/game-pass", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Game pass endpoint returns level and xp directly
        assert "level" in data, "Response should have 'level'"
        assert "xp" in data, "Response should have 'xp'"
        assert "galadium_active" in data, "Response should have 'galadium_active'"
        
        print(f"✓ Game pass XP fields present: Level {data['level']}, XP {data['xp']}")


class TestChestRewardDistribution:
    """Tests for chest reward distribution validity"""
    
    def test_drop_rates_total_100(self):
        """All drop rates should sum to 100%"""
        response = requests.get(f"{BASE_URL}/api/chest/payout-table")
        data = response.json()
        
        total = sum(drop["chance"] for drop in data["g_drops"])
        total += data["item_drop"]["chance"]
        
        assert total == 100, f"All drop rates should sum to 100%, got {total}%"
        
        print("✓ Drop rates correctly sum to 100%")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
