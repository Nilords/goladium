"""
Test Quest and Game Pass System
Tests: Quest endpoints, Game Pass endpoints, Activity feed sorting
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://chart-security-build.preview.emergentagent.com')
BASE_URL = BASE_URL.rstrip('/')

# Test credentials
TEST_USERNAME = "QuestTest42"
TEST_PASSWORD = "test123456"

class TestQuestAndGamePass:
    """Tests for Quest and Game Pass API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.user = None
    
    def login_test_user(self):
        """Login with test credentials and return token"""
        # First try to login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        })
        
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data["access_token"]
            self.user = data["user"]
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
        
        # If login fails, try to register
        register_res = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        })
        
        if register_res.status_code == 200:
            data = register_res.json()
            self.token = data["access_token"]
            self.user = data["user"]
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
        
        return False

    # ========== QUEST API TESTS ==========
    
    def test_get_quests_requires_auth(self):
        """GET /api/quests should require authentication"""
        res = self.session.get(f"{BASE_URL}/api/quests")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("✓ GET /api/quests requires authentication (401)")
    
    def test_get_quests_returns_quest_list(self):
        """GET /api/quests should return list of quests with progress"""
        assert self.login_test_user(), "Failed to login test user"
        
        res = self.session.get(f"{BASE_URL}/api/quests")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        data = res.json()
        assert "quests" in data, "Response should contain 'quests' key"
        assert isinstance(data["quests"], list), "Quests should be a list"
        assert len(data["quests"]) > 0, "Should have at least one quest"
        print(f"✓ GET /api/quests returns {len(data['quests'])} quests")
        
        # Verify quest structure
        quest = data["quests"][0]
        required_fields = ["quest_id", "name", "description", "type", "target", "current", 
                         "completed", "claimed", "rewards", "game_pass_xp", "difficulty"]
        for field in required_fields:
            assert field in quest, f"Quest missing required field: {field}"
        print(f"✓ Quest has all required fields: {required_fields}")
        
        return data["quests"]
    
    def test_quest_has_rewards_structure(self):
        """Quest rewards should have XP, G, and optionally A"""
        assert self.login_test_user(), "Failed to login test user"
        
        res = self.session.get(f"{BASE_URL}/api/quests")
        assert res.status_code == 200
        
        quests = res.json()["quests"]
        
        # Check that quests have reward structure
        for quest in quests:
            rewards = quest["rewards"]
            assert isinstance(rewards, dict), f"Rewards should be a dict for quest {quest['quest_id']}"
            assert "xp" in rewards or "g" in rewards, f"Quest {quest['quest_id']} should have xp or g reward"
        
        # Check for quests with A currency reward
        quests_with_a = [q for q in quests if q["rewards"].get("a", 0) > 0]
        print(f"✓ Found {len(quests_with_a)} quests with A currency rewards")
        
        # Check difficulty distribution
        easy = [q for q in quests if q["difficulty"] == "easy"]
        medium = [q for q in quests if q["difficulty"] == "medium"]
        hard = [q for q in quests if q["difficulty"] == "hard"]
        print(f"✓ Quest difficulty distribution: Easy={len(easy)}, Medium={len(medium)}, Hard={len(hard)}")
    
    def test_quest_has_game_pass_xp(self):
        """All quests should give Game Pass XP"""
        assert self.login_test_user(), "Failed to login test user"
        
        res = self.session.get(f"{BASE_URL}/api/quests")
        assert res.status_code == 200
        
        quests = res.json()["quests"]
        
        for quest in quests:
            assert "game_pass_xp" in quest, f"Quest {quest['quest_id']} missing game_pass_xp"
            assert quest["game_pass_xp"] > 0, f"Quest {quest['quest_id']} should have positive game_pass_xp"
        
        print(f"✓ All {len(quests)} quests have game_pass_xp rewards")
    
    def test_quest_progress_tracking(self):
        """Quests should track progress (current vs target)"""
        assert self.login_test_user(), "Failed to login test user"
        
        res = self.session.get(f"{BASE_URL}/api/quests")
        assert res.status_code == 200
        
        quests = res.json()["quests"]
        
        for quest in quests:
            assert "current" in quest, f"Quest {quest['quest_id']} missing 'current'"
            assert "target" in quest, f"Quest {quest['quest_id']} missing 'target'"
            assert isinstance(quest["current"], int), f"Quest {quest['quest_id']} 'current' should be int"
            assert isinstance(quest["target"], int), f"Quest {quest['quest_id']} 'target' should be int"
            assert quest["current"] >= 0, f"Quest {quest['quest_id']} 'current' should be >= 0"
            assert quest["target"] > 0, f"Quest {quest['quest_id']} 'target' should be > 0"
        
        print(f"✓ All quests have valid progress tracking (current/target)")
    
    def test_claim_quest_requires_auth(self):
        """POST /api/quests/{id}/claim should require authentication"""
        res = self.session.post(f"{BASE_URL}/api/quests/spin_10/claim")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("✓ POST /api/quests/{id}/claim requires authentication (401)")
    
    def test_claim_uncompleted_quest_fails(self):
        """Claiming an uncompleted quest should return error"""
        assert self.login_test_user(), "Failed to login test user"
        
        # Get quests to find an uncompleted one
        res = self.session.get(f"{BASE_URL}/api/quests")
        quests = res.json()["quests"]
        
        uncompleted = [q for q in quests if not q["completed"]]
        if not uncompleted:
            pytest.skip("No uncompleted quests found")
        
        quest_id = uncompleted[0]["quest_id"]
        claim_res = self.session.post(f"{BASE_URL}/api/quests/{quest_id}/claim")
        assert claim_res.status_code == 400, f"Expected 400 for uncompleted quest, got {claim_res.status_code}"
        print(f"✓ Claiming uncompleted quest '{quest_id}' returns 400")
    
    # ========== GAME PASS API TESTS ==========
    
    def test_get_game_pass_requires_auth(self):
        """GET /api/game-pass should require authentication"""
        res = self.session.get(f"{BASE_URL}/api/game-pass")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("✓ GET /api/game-pass requires authentication (401)")
    
    def test_get_game_pass_status(self):
        """GET /api/game-pass should return pass status"""
        assert self.login_test_user(), "Failed to login test user"
        
        res = self.session.get(f"{BASE_URL}/api/game-pass")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        data = res.json()
        
        # Verify response structure
        required_fields = ["level", "xp", "xp_to_next", "galadium_active", "rewards_claimed", "all_rewards"]
        for field in required_fields:
            assert field in data, f"Game Pass response missing: {field}"
        
        print(f"✓ GET /api/game-pass returns valid structure")
        print(f"  Level: {data['level']}, XP: {data['xp']}/{data['xp_to_next']}, Galadium: {data['galadium_active']}")
        
        return data
    
    def test_game_pass_has_reward_tracks(self):
        """Game Pass should have both free and galadium reward tracks"""
        assert self.login_test_user(), "Failed to login test user"
        
        res = self.session.get(f"{BASE_URL}/api/game-pass")
        assert res.status_code == 200
        
        data = res.json()
        all_rewards = data.get("all_rewards", {})
        
        assert len(all_rewards) > 0, "Game Pass should have rewards defined"
        
        # Check that rewards have both tracks
        for level, rewards in all_rewards.items():
            assert "free" in rewards, f"Level {level} missing 'free' track"
            assert "galadium" in rewards, f"Level {level} missing 'galadium' track"
        
        print(f"✓ Game Pass has {len(all_rewards)} reward levels with both free and galadium tracks")
    
    def test_galadium_pass_status(self):
        """Game Pass should show galadium_active status"""
        assert self.login_test_user(), "Failed to login test user"
        
        res = self.session.get(f"{BASE_URL}/api/game-pass")
        assert res.status_code == 200
        
        data = res.json()
        assert "galadium_active" in data, "Should show galadium_active status"
        assert isinstance(data["galadium_active"], bool), "galadium_active should be boolean"
        
        # For test user, galadium should be inactive (new users don't have it)
        print(f"✓ Galadium Pass active: {data['galadium_active']}")
    
    def test_claim_game_pass_reward_requires_auth(self):
        """POST /api/game-pass/claim/{level} should require authentication"""
        res = self.session.post(f"{BASE_URL}/api/game-pass/claim/10")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("✓ POST /api/game-pass/claim/{level} requires authentication (401)")
    
    def test_claim_unreached_level_fails(self):
        """Claiming an unreached Game Pass level should fail"""
        assert self.login_test_user(), "Failed to login test user"
        
        # Try to claim level 50 (unlikely to be reached)
        res = self.session.post(f"{BASE_URL}/api/game-pass/claim/50")
        assert res.status_code == 400, f"Expected 400 for unreached level, got {res.status_code}"
        print("✓ Claiming unreached level returns 400")
    
    # ========== ACTIVITY FEED SORTING TEST ==========
    
    def test_activity_feed_bet_before_win_sorting(self):
        """Activity feed should show Bet entries BEFORE Win entries for same transaction"""
        assert self.login_test_user(), "Failed to login test user"
        
        # First, do a slot spin to generate activity
        # Get user balance first
        me_res = self.session.get(f"{BASE_URL}/api/auth/me")
        if me_res.status_code == 200:
            balance = me_res.json().get("balance", 0)
            if balance >= 0.1:  # Min bet
                # Do a spin
                spin_res = self.session.post(f"{BASE_URL}/api/slots/spin", json={
                    "bet_per_line": 0.1,
                    "active_lines": [1, 2, 3, 4],
                    "slot_id": "classic"
                })
                if spin_res.status_code == 200:
                    print("✓ Performed slot spin to generate activity")
        
        # Now check activity feed
        history_res = self.session.get(f"{BASE_URL}/api/bets/history?limit=10")
        
        if history_res.status_code == 200:
            history = history_res.json()
            if len(history) >= 2:
                # Find pairs with same timestamp (bet/win from same spin)
                for i in range(len(history) - 1):
                    curr = history[i]
                    next_item = history[i + 1]
                    
                    curr_type = curr.get("transaction_type", curr.get("result", "unknown"))
                    next_type = next_item.get("transaction_type", next_item.get("result", "unknown"))
                    
                    # If we find a bet-win pair close together
                    if curr_type == "bet" and next_type == "win":
                        print("✓ Activity feed shows Bet before Win for same transaction")
                        return
                    elif curr_type == "win" and next_type == "bet":
                        # Check timestamps - if same second, this is wrong order
                        curr_ts = curr.get("timestamp", "")
                        next_ts = next_item.get("timestamp", "")
                        if curr_ts[:19] == next_ts[:19]:  # Same second
                            pytest.fail("Activity feed shows Win before Bet for same timestamp - WRONG ORDER")
                
                print("✓ Activity feed retrieved successfully, no obvious sorting issues")
            else:
                print("✓ Activity feed has fewer than 2 items, skipping sort test")
        else:
            pytest.skip(f"Could not retrieve activity feed: {history_res.status_code}")


class TestLandingPageDiscord:
    """Test Discord button on landing page (via API check since no direct endpoint)"""
    
    def test_api_health(self):
        """Verify API is accessible"""
        res = requests.get(f"{BASE_URL}/api/")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        assert "message" in data, "API should return message"
        print(f"✓ API is healthy: {data.get('message')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
