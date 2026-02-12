"""
Goladium 8-Payline System Tests
Tests: 8 straight paylines (4 horizontal + 4 vertical), win calculations, wild substitution
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "paylinetest@test.com"
TEST_PASSWORD = "test123"


class TestPaylineConfiguration:
    """Test 8-payline configuration in slot info"""
    
    def test_slot_info_returns_8_paylines(self):
        """Test slot info returns exactly 8 paylines"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        data = response.json()
        assert data["max_paylines"] == 8, f"Expected 8 paylines, got {data['max_paylines']}"
        
        paylines = data["paylines"]
        assert len(paylines) == 8, f"Expected 8 payline definitions, got {len(paylines)}"
        print(f"✓ Slot info returns 8 paylines")
    
    def test_horizontal_paylines_have_5_positions(self):
        """Test horizontal paylines (1-4) have 5 positions each"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        paylines = response.json()["paylines"]
        
        # Horizontal paylines 1-4 should have 5 positions
        for line_num in ["1", "2", "3", "4"]:
            line = paylines.get(line_num)
            assert line is not None, f"Payline {line_num} not found"
            assert len(line) == 5, f"Horizontal payline {line_num} should have 5 positions, got {len(line)}"
            
            # Verify all positions are in the same row
            row = line[0][0]
            for pos in line:
                assert pos[0] == row, f"Horizontal payline {line_num} should be on same row"
        
        print("✓ Horizontal paylines (1-4) have 5 positions each")
    
    def test_vertical_paylines_have_4_positions(self):
        """Test vertical paylines (5-8) have 4 positions each"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        paylines = response.json()["paylines"]
        
        # Vertical paylines 5-8 should have 4 positions
        for line_num in ["5", "6", "7", "8"]:
            line = paylines.get(line_num)
            assert line is not None, f"Payline {line_num} not found"
            assert len(line) == 4, f"Vertical payline {line_num} should have 4 positions, got {len(line)}"
            
            # Verify all positions are in the same column
            col = line[0][1]
            for pos in line:
                assert pos[1] == col, f"Vertical payline {line_num} should be on same column"
        
        print("✓ Vertical paylines (5-8) have 4 positions each")
    
    def test_line_presets_correct(self):
        """Test line presets are 4 (horizontal only) and 8 (all)"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        presets = response.json()["line_presets"]
        
        # Check preset 4 (horizontal only)
        preset_4 = presets.get("4") or presets.get(4)
        assert preset_4 is not None, "Preset 4 not found"
        assert preset_4 == [1, 2, 3, 4], f"Preset 4 should be [1,2,3,4], got {preset_4}"
        
        # Check preset 8 (all lines)
        preset_8 = presets.get("8") or presets.get(8)
        assert preset_8 is not None, "Preset 8 not found"
        assert preset_8 == [1, 2, 3, 4, 5, 6, 7, 8], f"Preset 8 should be [1-8], got {preset_8}"
        
        print("✓ Line presets correct: 4 (horizontal) and 8 (all)")


class TestSpinWithPaylines:
    """Test spin endpoint with 8-payline system"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    def test_spin_with_all_8_lines(self, auth_token):
        """Test spin with all 8 paylines active"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": [1, 2, 3, 4, 5, 6, 7, 8],
                "slot_id": "classic"
            }
        )
        assert response.status_code == 200, f"Spin failed: {response.text}"
        
        data = response.json()
        expected_bet = 0.01 * 8
        assert abs(data["total_bet"] - expected_bet) < 0.001, f"Expected bet {expected_bet}, got {data['total_bet']}"
        print(f"✓ Spin with 8 lines: total_bet = {data['total_bet']}G")
    
    def test_spin_with_horizontal_only(self, auth_token):
        """Test spin with only horizontal paylines (1-4)"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": [1, 2, 3, 4],
                "slot_id": "classic"
            }
        )
        assert response.status_code == 200, f"Spin failed: {response.text}"
        
        data = response.json()
        expected_bet = 0.01 * 4
        assert abs(data["total_bet"] - expected_bet) < 0.001
        print(f"✓ Spin with 4 horizontal lines: total_bet = {data['total_bet']}G")
    
    def test_spin_with_vertical_only(self, auth_token):
        """Test spin with only vertical paylines (5-8)"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": [5, 6, 7, 8],
                "slot_id": "classic"
            }
        )
        assert response.status_code == 200, f"Spin failed: {response.text}"
        
        data = response.json()
        expected_bet = 0.01 * 4
        assert abs(data["total_bet"] - expected_bet) < 0.001
        print(f"✓ Spin with 4 vertical lines: total_bet = {data['total_bet']}G")
    
    def test_spin_rejects_line_9_and_above(self, auth_token):
        """Test spin rejects payline numbers > 8"""
        response = requests.post(f"{BASE_URL}/api/games/slot/spin",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json"
            },
            json={
                "bet_per_line": 0.01,
                "active_lines": [1, 9],  # 9 is invalid
                "slot_id": "classic"
            }
        )
        assert response.status_code == 400, f"Should reject line 9, got status {response.status_code}"
        print("✓ Spin correctly rejects payline > 8")
    
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
        
        reels = response.json()["reels"]
        assert len(reels) == 4, f"Expected 4 rows, got {len(reels)}"
        for row in reels:
            assert len(row) == 5, f"Expected 5 columns, got {len(row)}"
        print("✓ Spin returns 4x5 grid")


class TestWinCalculations:
    """Test win calculations for horizontal and vertical paylines"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_winning_payline_structure(self, auth_token):
        """Test winning paylines have correct structure"""
        # Do multiple spins to get a win
        for _ in range(50):
            response = requests.post(f"{BASE_URL}/api/games/slot/spin",
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "bet_per_line": 0.01,
                    "active_lines": [1, 2, 3, 4, 5, 6, 7, 8],
                    "slot_id": "classic"
                }
            )
            assert response.status_code == 200
            
            data = response.json()
            if data["is_win"] and len(data["winning_paylines"]) > 0:
                wp = data["winning_paylines"][0]
                
                # Check required fields
                assert "line_number" in wp, "Missing line_number"
                assert "line_path" in wp, "Missing line_path"
                assert "symbol" in wp, "Missing symbol"
                assert "match_count" in wp, "Missing match_count"
                assert "multiplier" in wp, "Missing multiplier"
                assert "payout" in wp, "Missing payout"
                
                # Verify line_number is 1-8
                assert 1 <= wp["line_number"] <= 8, f"Invalid line_number: {wp['line_number']}"
                
                print(f"✓ Winning payline structure verified: Line {wp['line_number']}, Symbol: {wp['symbol']}, Match: {wp['match_count']}, Payout: {wp['payout']}G")
                return
        
        print("✓ No wins in 50 spins (expected with controlled RNG)")
    
    def test_horizontal_win_has_5_matches(self, auth_token):
        """Test horizontal payline wins have match_count=5"""
        for _ in range(100):
            response = requests.post(f"{BASE_URL}/api/games/slot/spin",
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "bet_per_line": 0.01,
                    "active_lines": [1, 2, 3, 4],  # Horizontal only
                    "slot_id": "classic"
                }
            )
            assert response.status_code == 200
            
            data = response.json()
            if data["is_win"]:
                for wp in data["winning_paylines"]:
                    if wp["line_number"] <= 4:  # Horizontal line
                        assert wp["match_count"] == 5, f"Horizontal line {wp['line_number']} should have 5 matches, got {wp['match_count']}"
                        assert len(wp["line_path"]) == 5, f"Horizontal line path should have 5 positions"
                        print(f"✓ Horizontal win verified: Line {wp['line_number']} has {wp['match_count']} matches")
                        return
        
        print("✓ No horizontal wins in 100 spins (expected)")
    
    def test_vertical_win_has_4_matches(self, auth_token):
        """Test vertical payline wins have match_count=4"""
        for _ in range(100):
            response = requests.post(f"{BASE_URL}/api/games/slot/spin",
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "bet_per_line": 0.01,
                    "active_lines": [5, 6, 7, 8],  # Vertical only
                    "slot_id": "classic"
                }
            )
            assert response.status_code == 200
            
            data = response.json()
            if data["is_win"]:
                for wp in data["winning_paylines"]:
                    if wp["line_number"] >= 5:  # Vertical line
                        assert wp["match_count"] == 4, f"Vertical line {wp['line_number']} should have 4 matches, got {wp['match_count']}"
                        assert len(wp["line_path"]) == 4, f"Vertical line path should have 4 positions"
                        print(f"✓ Vertical win verified: Line {wp['line_number']} has {wp['match_count']} matches")
                        return
        
        print("✓ No vertical wins in 100 spins (expected)")
    
    def test_payout_calculation(self, auth_token):
        """Test payout = bet_per_line × symbol_multiplier"""
        bet_per_line = 0.05
        
        for _ in range(100):
            response = requests.post(f"{BASE_URL}/api/games/slot/spin",
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "bet_per_line": bet_per_line,
                    "active_lines": [1, 2, 3, 4, 5, 6, 7, 8],
                    "slot_id": "classic"
                }
            )
            assert response.status_code == 200
            
            data = response.json()
            if data["is_win"]:
                for wp in data["winning_paylines"]:
                    expected_payout = round(bet_per_line * wp["multiplier"], 2)
                    assert abs(wp["payout"] - expected_payout) < 0.01, \
                        f"Payout mismatch: expected {expected_payout}, got {wp['payout']}"
                    print(f"✓ Payout verified: {bet_per_line} × {wp['multiplier']}x = {wp['payout']}G")
                    return
        
        print("✓ No wins to verify payout calculation")


class TestBalanceUpdates:
    """Test balance updates after wins/losses"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_balance_deducted_on_spin(self, auth_token):
        """Test balance is correctly deducted after spin"""
        # Get initial balance
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        initial_balance = me_response.json()["balance"]
        
        bet_per_line = 0.01
        active_lines = [1, 2, 3, 4, 5, 6, 7, 8]
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
        assert response.status_code == 200
        
        data = response.json()
        expected_balance = round(initial_balance - total_bet + data["win_amount"], 2)
        assert abs(data["new_balance"] - expected_balance) < 0.01, \
            f"Balance mismatch: expected {expected_balance}, got {data['new_balance']}"
        
        print(f"✓ Balance update correct: {initial_balance} - {total_bet} + {data['win_amount']} = {data['new_balance']}")


class TestSymbolMultipliers:
    """Test symbol multipliers are correct"""
    
    def test_symbol_multipliers_in_slot_info(self):
        """Test symbol multipliers match expected values"""
        response = requests.get(f"{BASE_URL}/api/games/slot/classic/info")
        assert response.status_code == 200
        
        symbols = response.json()["symbols"]
        symbol_map = {s["symbol"]: s["multiplier"] for s in symbols}
        
        # Expected multipliers
        expected = {
            "cherry": 5,
            "lemon": 5,
            "orange": 5,
            "bar": 25,
            "seven": 75,
            "diamond": 75,
            "wild": 250
        }
        
        for symbol, expected_mult in expected.items():
            assert symbol in symbol_map, f"Symbol {symbol} not found"
            assert symbol_map[symbol] == expected_mult, \
                f"Symbol {symbol} multiplier should be {expected_mult}, got {symbol_map[symbol]}"
        
        print("✓ All symbol multipliers correct: low=5x, mid=25x, high=75x, wild=250x")


class TestUserLogin:
    """Test user login flow"""
    
    def test_login_with_test_credentials(self):
        """Test login with paylinetest@test.com / test123"""
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
        
        print(f"✓ Login successful: {data['user']['username']}, Balance: {data['user']['balance']}G")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
