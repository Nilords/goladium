"""
Goladium Slot Machine Paylines Tests
Tests: 5x4 grid, 25 paylines, bet_per_line, active_lines, winning paylines display
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"


class TestSlotPaylines:
    """Slot machine payline tests for new 5x4 grid system"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_slot_info_5x4_grid(self):
        """Test slot info returns 5x4 grid configuration"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        data = response.json()
        assert data["rows"] == 4, f"Expected 4 rows, got {data['rows']}"
        assert data["reels"] == 5, f"Expected 5 reels, got {data['reels']}"
        assert data["max_paylines"] == 25, f"Expected 25 paylines, got {data['max_paylines']}"
        print(f"✓ Slot info: {data['rows']}x{data['reels']} grid with {data['max_paylines']} paylines")
    
    def test_slot_info_line_presets(self):
        """Test slot info returns line presets (5/10/20/25)"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        data = response.json()
        assert "line_presets" in data
        
        presets = data["line_presets"]
        assert "5" in presets or 5 in presets
        assert "10" in presets or 10 in presets
        assert "20" in presets or 20 in presets
        assert "25" in presets or 25 in presets
        print(f"✓ Line presets available: {list(presets.keys())}")
    
    def test_slot_info_paylines_definition(self):
        """Test slot info returns payline definitions"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        data = response.json()
        assert "paylines" in data
        
        paylines = data["paylines"]
        assert len(paylines) == 25, f"Expected 25 paylines, got {len(paylines)}"
        
        # Check payline 1 (top row)
        line_1 = paylines.get("1") or paylines.get(1)
        assert line_1 is not None
        assert len(line_1) == 5, "Each payline should have 5 positions"
        print(f"✓ 25 paylines defined with 5 positions each")
    
    def test_slot_info_rules(self):
        """Test slot info returns rules explaining win conditions"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        data = response.json()
        assert "rules" in data
        
        rules = data["rules"]
        assert "how_to_win" in rules
        assert "ALL 5" in rules["how_to_win"] or "all 5" in rules["how_to_win"].lower()
        print(f"✓ Rules explain full line match requirement")
    
    def test_spin_with_bet_per_line_and_active_lines(self, auth_token):
        """Test spin with new bet_per_line and active_lines parameters"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": [1, 2, 3, 4, 5],
                "slot_id": "classic"
            }
        )
        assert response.status_code == 200, f"Spin failed: {response.text}"
        
        data = response.json()
        assert "reels" in data
        assert "total_bet" in data
        assert "win_amount" in data
        assert "xp_gained" in data
        assert "winning_paylines" in data
        
        # Verify total bet calculation
        expected_bet = 0.01 * 5  # 5 lines at 0.01 each
        assert abs(data["total_bet"] - expected_bet) < 0.001, f"Expected bet {expected_bet}, got {data['total_bet']}"
        print(f"✓ Spin with 5 lines at 0.01/line = {data['total_bet']}G total bet")
    
    def test_spin_with_25_lines(self, auth_token):
        """Test spin with all 25 paylines active"""
        all_lines = list(range(1, 26))
        
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": all_lines,
                "slot_id": "classic"
            }
        )
        assert response.status_code == 200, f"Spin failed: {response.text}"
        
        data = response.json()
        expected_bet = 0.01 * 25  # 25 lines at 0.01 each
        assert abs(data["total_bet"] - expected_bet) < 0.001, f"Expected bet {expected_bet}, got {data['total_bet']}"
        print(f"✓ Spin with 25 lines at 0.01/line = {data['total_bet']}G total bet")
    
    def test_spin_returns_4x5_grid(self, auth_token):
        """Test spin returns 4x5 grid (4 rows, 5 columns)"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": [1],
                "slot_id": "classic"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        reels = data["reels"]
        
        assert len(reels) == 4, f"Expected 4 rows, got {len(reels)}"
        for row in reels:
            assert len(row) == 5, f"Expected 5 columns, got {len(row)}"
        print(f"✓ Spin returns 4x5 grid")
    
    def test_spin_returns_xp_gained(self, auth_token):
        """Test spin returns xp_gained field"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                "slot_id": "classic"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "xp_gained" in data
        assert isinstance(data["xp_gained"], int)
        assert data["xp_gained"] >= 0
        print(f"✓ Spin returns xp_gained: {data['xp_gained']}")
    
    def test_spin_winning_paylines_structure(self, auth_token):
        """Test winning paylines have correct structure when win occurs"""
        # Do multiple spins to try to get a win
        for _ in range(30):
            response = requests.post(f"{BASE_URL}/api/games/slot/spin",
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "bet_per_line": 0.01,
                    "active_lines": list(range(1, 26)),
                    "slot_id": "classic"
                }
            )
            assert response.status_code == 200
            
            data = response.json()
            if data["is_win"] and len(data["winning_paylines"]) > 0:
                wp = data["winning_paylines"][0]
                assert "line_number" in wp
                assert "line_path" in wp
                assert "symbol" in wp
                assert "multiplier" in wp
                assert "payout" in wp
                print(f"✓ Winning payline structure verified: Line {wp['line_number']}, Symbol: {wp['symbol']}, Payout: {wp['payout']}G")
                return
        
        print("✓ No wins in 30 spins (expected with ~6% win rate)")
    
    def test_spin_requires_at_least_one_line(self, auth_token):
        """Test spin fails with empty active_lines"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": [],
                "slot_id": "classic"
            }
        )
        assert response.status_code == 422, "Should reject empty active_lines"
        print("✓ Empty active_lines correctly rejected")
    
    def test_spin_rejects_invalid_line_numbers(self, auth_token):
        """Test spin fails with invalid line numbers"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": [1, 26, 30],  # 26 and 30 are invalid
                "slot_id": "classic"
            }
        )
        assert response.status_code == 400, "Should reject invalid line numbers"
        print("✓ Invalid line numbers correctly rejected")


class TestAllSlotsHave5x4Grid:
    """Test all slot machines have 5x4 grid and 25 paylines"""
    
    def test_all_slots_have_correct_config(self):
        """Test all slots return 5x4 grid with 25 paylines"""
        response = requests.get(f"{BASE_URL}/api/games/slots")
        assert response.status_code == 200
        
        slots = response.json()
        assert len(slots) == 10, f"Expected 10 slots, got {len(slots)}"
        
        for slot in slots:
            assert slot["rows"] == 4, f"Slot {slot['id']} has {slot['rows']} rows, expected 4"
            assert slot["reels"] == 5, f"Slot {slot['id']} has {slot['reels']} reels, expected 5"
            assert slot["max_paylines"] == 25, f"Slot {slot['id']} has {slot['max_paylines']} paylines, expected 25"
        
        print(f"✓ All 10 slots have 4x5 grid with 25 paylines")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
