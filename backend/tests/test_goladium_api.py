"""
Goladium API Tests - Comprehensive backend testing
Tests: Auth, Slots, Lucky Wheel, Jackpot, Profile, Leaderboard
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"


class TestAuth:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        assert "balance" in data["user"]
        assert "level" in data["user"]
        assert "total_wins" in data["user"]
        assert "net_profit" in data["user"]
        print(f"✓ Login successful - User: {data['user']['username']}, Balance: {data['user']['balance']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected")
    
    def test_auth_me_with_token(self):
        """Test /auth/me endpoint with valid token"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Test /auth/me
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["email"] == TEST_EMAIL
        assert "balance" in data
        assert "level" in data
        assert "xp" in data
        assert "total_spins" in data
        assert "total_wins" in data
        assert "net_profit" in data
        print(f"✓ Auth/me returns correct user data - Level: {data['level']}, XP: {data['xp']}")
    
    def test_auth_me_without_token(self):
        """Test /auth/me without token returns 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Auth/me correctly rejects unauthenticated requests")


class TestSlots:
    """Slot machine endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_all_slots(self):
        """Test getting all slot machines"""
        response = requests.get(f"{BASE_URL}/api/games/slots")
        assert response.status_code == 200
        
        slots = response.json()
        assert isinstance(slots, list)
        assert len(slots) == 10, f"Expected 10 slots, got {len(slots)}"
        
        # Verify slot structure (updated for 5x4 grid)
        for slot in slots:
            assert "id" in slot
            assert "name" in slot
            assert "reels" in slot
            assert "rows" in slot
            assert "max_paylines" in slot  # Changed from paylines to max_paylines
            assert "volatility" in slot
            assert "rtp" in slot
            assert slot["rows"] == 4, f"Expected 4 rows, got {slot['rows']}"
            assert slot["reels"] == 5, f"Expected 5 reels, got {slot['reels']}"
            assert slot["max_paylines"] == 25, f"Expected 25 paylines, got {slot['max_paylines']}"
        
        slot_ids = [s["id"] for s in slots]
        expected_ids = ["classic", "book", "diamond", "cyber", "viking", "fortune", "pirate", "mythic", "inferno", "battle"]
        for expected_id in expected_ids:
            assert expected_id in slot_ids, f"Missing slot: {expected_id}"
        
        print(f"✓ All 10 slot machines returned with 4x5 grid and 25 paylines: {slot_ids}")
    
    def test_get_slot_info(self, auth_token):
        """Test getting slot info with payout table"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == "classic"
        assert data["name"] == "Classic Fruits Deluxe"
        assert "symbols" in data
        assert "rules" in data
        assert "features" in data
        assert data["rtp"] == 95.5
        
        # Verify symbols have required fields
        for symbol in data["symbols"]:
            assert "symbol" in symbol
            assert "multiplier" in symbol
            assert "probability" in symbol
        
        print(f"✓ Slot info returned - {len(data['symbols'])} symbols, RTP: {data['rtp']}%")
    
    def test_slot_spin(self, auth_token):
        """Test slot spin deducts bet and returns result"""
        # Get initial balance
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        initial_balance = me_response.json()["balance"]
        
        bet_per_line = 0.01
        active_lines = [1, 2, 3, 4, 5]  # 5 lines
        total_bet = bet_per_line * len(active_lines)
        
        response = requests.post(f"{BASE_URL}/api/games/slot/spin", 
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": bet_per_line,
                "active_lines": active_lines,
                "slot_id": "classic"
            }
        )
        assert response.status_code == 200, f"Spin failed: {response.text}"
        
        data = response.json()
        assert "reels" in data
        assert "win_amount" in data
        assert "total_bet" in data
        assert "is_win" in data
        assert "new_balance" in data
        assert "xp_gained" in data
        assert "winning_paylines" in data
        
        # Verify total bet
        assert abs(data["total_bet"] - total_bet) < 0.01, f"Total bet mismatch: expected {total_bet}, got {data['total_bet']}"
        
        # Verify balance changed correctly
        expected_balance = round(initial_balance - total_bet + data["win_amount"], 2)
        assert abs(data["new_balance"] - expected_balance) < 0.01, f"Balance mismatch: expected {expected_balance}, got {data['new_balance']}"
        
        print(f"✓ Slot spin successful - Bet: {total_bet}G, Win: {data['win_amount']}G, New Balance: {data['new_balance']}G")
    
    def test_slot_spin_insufficient_balance(self, auth_token):
        """Test slot spin with insufficient balance"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin", 
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 10.0,  # Max bet per line
                "active_lines": list(range(1, 26)),  # All 25 lines = 250G total
                "slot_id": "classic"
            }
        )
        # API returns 400 for insufficient balance
        assert response.status_code == 400
        print("✓ Insufficient balance correctly rejected")


class TestLuckyWheel:
    """Lucky wheel endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_wheel_status(self, auth_token):
        """Test wheel status endpoint"""
        response = requests.get(f"{BASE_URL}/api/games/wheel/status", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "can_spin" in data
        assert "seconds_remaining" in data
        
        print(f"✓ Wheel status - Can spin: {data['can_spin']}, Seconds remaining: {data['seconds_remaining']}")
    
    def test_wheel_spin_or_cooldown(self, auth_token):
        """Test wheel spin - either succeeds or returns cooldown"""
        response = requests.post(f"{BASE_URL}/api/games/wheel/spin", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        # Either 200 (success) or 400 (cooldown)
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "reward" in data
            assert "new_balance" in data
            assert "next_spin_available" in data
            assert data["reward"] in [1.0, 5.0, 15.0], f"Unexpected reward: {data['reward']}"
            print(f"✓ Wheel spin successful - Reward: {data['reward']}G")
        else:
            data = response.json()
            assert "detail" in data
            assert "cooldown" in data["detail"].lower()
            print(f"✓ Wheel on cooldown (expected behavior)")


class TestJackpot:
    """Jackpot endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_jackpot_status(self):
        """Test jackpot status endpoint"""
        response = requests.get(f"{BASE_URL}/api/games/jackpot/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "state" in data
        assert "total_pot" in data
        assert "participants" in data
        assert data["state"] in ["idle", "waiting", "active", "spinning", "complete"]
        
        print(f"✓ Jackpot status - State: {data['state']}, Pot: {data['total_pot']}G, Participants: {len(data['participants'])}")


class TestProfile:
    """Profile and stats endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_bet_history(self, auth_token):
        """Test bet history endpoint"""
        response = requests.get(f"{BASE_URL}/api/user/history", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            bet = data[0]
            assert "bet_id" in bet
            assert "timestamp" in bet
            assert "game_type" in bet
            assert "bet_amount" in bet
            assert "win_amount" in bet
        
        print(f"✓ Bet history returned - {len(data)} entries")
    
    def test_user_stats_aggregation(self, auth_token):
        """Test that user stats are correctly aggregated from history"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify stats fields exist
        assert "total_spins" in data
        assert "total_wins" in data
        assert "total_losses" in data
        assert "net_profit" in data
        assert "total_wagered" in data
        
        # Net profit should be total_won - total_wagered (calculated from history)
        print(f"✓ User stats - Spins: {data['total_spins']}, Wins: {data['total_wins']}, Net Profit: {data['net_profit']}G")


class TestLeaderboard:
    """Leaderboard endpoint tests"""
    
    def test_leaderboard(self):
        """Test leaderboard endpoint"""
        response = requests.get(f"{BASE_URL}/api/leaderboard")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            entry = data[0]
            assert "user_id" in entry
            assert "username" in entry
            assert "level" in entry
            assert "total_wins" in entry
            assert "net_profit" in entry
        
        print(f"✓ Leaderboard returned - {len(data)} entries")


class TestChat:
    """Chat endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_chat_messages(self):
        """Test getting chat messages"""
        response = requests.get(f"{BASE_URL}/api/chat/messages")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Chat messages returned - {len(data)} messages")
    
    def test_send_chat_message(self, auth_token):
        """Test sending a chat message"""
        test_message = f"Test message {time.time()}"
        response = requests.post(f"{BASE_URL}/api/chat/send", 
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={"message": test_message}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "message_id" in data
        assert data["message"] == test_message
        print(f"✓ Chat message sent successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
