#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime
import time

class GoladiumAPITester:
    def __init__(self, base_url="https://gamepass-chest.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name} - PASSED")
        else:
            print(f"❌ {test_name} - FAILED: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                self.log_result(name, True)
                try:
                    return response.json() if response.content else {}
                except:
                    return {}
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg += f" - {error_detail}"
                except:
                    error_msg += f" - {response.text[:200]}"
                
                self.log_result(name, False, error_msg)
                return {}

        except Exception as e:
            self.log_result(name, False, f"Exception: {str(e)}")
            return {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_translations(self):
        """Test translations endpoint"""
        en_result = self.run_test("Translations EN", "GET", "translations?lang=en", 200)
        de_result = self.run_test("Translations DE", "GET", "translations?lang=de", 200)
        return en_result and de_result

    def test_register(self):
        """Test user registration"""
        timestamp = int(time.time())
        test_data = {
            "email": f"test{timestamp}@goladium.com",
            "password": "test123456",
            "username": f"TestUser{timestamp}"
        }
        
        result = self.run_test("User Registration", "POST", "auth/register", 200, test_data)
        
        if result and 'access_token' in result:
            self.token = result['access_token']
            if 'user' in result:
                self.user_id = result['user']['user_id']
            return True
        return False

    def test_login_existing_user(self):
        """Test login with existing test user"""
        login_data = {
            "email": "test@goladium.com",
            "password": "test123"
        }
        
        result = self.run_test("User Login (Existing)", "POST", "auth/login", 200, login_data)
        
        if result and 'access_token' in result:
            self.token = result['access_token']
            if 'user' in result:
                self.user_id = result['user']['user_id']
            return True
        return False

    def test_auth_me(self):
        """Test getting current user info"""
        if not self.token:
            self.log_result("Auth Me", False, "No token available")
            return False
        
        result = self.run_test("Get Current User", "GET", "auth/me", 200)
        return bool(result and 'user_id' in result)

    def test_slot_info(self):
        """Test slot machine info endpoint"""
        result = self.run_test("Slot Machine Info", "GET", "games/slot/info", 200)
        return bool(result and 'symbols' in result)

    def test_slot_spin(self):
        """Test slot machine spin"""
        if not self.token:
            self.log_result("Slot Spin", False, "No token available")
            return False
        
        spin_data = {"bet_amount": 0.10}
        result = self.run_test("Slot Machine Spin", "POST", "games/slot/spin", 200, spin_data)
        return bool(result and 'reels' in result and 'new_balance' in result)

    def test_wheel_status(self):
        """Test lucky wheel status"""
        if not self.token:
            self.log_result("Wheel Status", False, "No token available")
            return False
        
        result = self.run_test("Lucky Wheel Status", "GET", "games/wheel/status", 200)
        return bool(result and 'can_spin' in result)

    def test_wheel_spin(self):
        """Test lucky wheel spin"""
        if not self.token:
            self.log_result("Wheel Spin", False, "No token available")
            return False
        
        result = self.run_test("Lucky Wheel Spin", "POST", "games/wheel/spin", 200)
        return bool(result and 'reward' in result and 'new_balance' in result)

    def test_user_history(self):
        """Test user bet history"""
        if not self.token:
            self.log_result("User History", False, "No token available")
            return False
        
        result = self.run_test("User Bet History", "GET", "user/history?limit=10", 200)
        return isinstance(result, list)

    def test_user_stats(self):
        """Test user statistics"""
        if not self.token:
            self.log_result("User Stats", False, "No token available")
            return False
        
        result = self.run_test("User Statistics", "GET", "user/stats", 200)
        return bool(result and 'overall' in result)

    def test_leaderboard(self):
        """Test leaderboard endpoint"""
        result = self.run_test("Leaderboard", "GET", "leaderboard?sort_by=level&limit=10", 200)
        return isinstance(result, list)

    def test_chat_messages(self):
        """Test getting chat messages"""
        result = self.run_test("Get Chat Messages", "GET", "chat/messages?limit=10", 200)
        return isinstance(result, list)

    def test_send_chat_message(self):
        """Test sending chat message"""
        if not self.token:
            self.log_result("Send Chat Message", False, "No token available")
            return False
        
        message_data = {"message": f"Test message from API test at {datetime.now().strftime('%H:%M:%S')}"}
        result = self.run_test("Send Chat Message", "POST", "chat/send", 200, message_data)
        return bool(result and 'message_id' in result)

    def test_cosmetics(self):
        """Test cosmetics endpoint"""
        result = self.run_test("Available Cosmetics", "GET", "cosmetics/available", 200)
        return bool(result and 'name_colors' in result)

    def run_all_tests(self):
        """Run all API tests"""
        print("🎰 Starting Goladium API Tests")
        print("=" * 50)
        
        # Basic endpoints (no auth required)
        self.test_root_endpoint()
        self.test_translations()
        self.test_slot_info()
        self.test_leaderboard()
        self.test_chat_messages()
        self.test_cosmetics()
        
        # Try login with existing user first
        login_success = self.test_login_existing_user()
        
        # If login fails, try registration
        if not login_success:
            print("\n📝 Login failed, trying registration...")
            self.test_register()
        
        # Auth-required endpoints
        if self.token:
            print(f"\n🔑 Token acquired, testing authenticated endpoints...")
            self.test_auth_me()
            self.test_slot_spin()
            self.test_wheel_status()
            
            # Test wheel spin (might fail due to cooldown)
            wheel_result = self.test_wheel_spin()
            if not wheel_result:
                print("   ℹ️  Wheel spin failed - likely due to cooldown (expected)")
            
            self.test_user_history()
            self.test_user_stats()
            self.test_send_chat_message()
        else:
            print("\n❌ No authentication token - skipping auth-required tests")
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            
            # Print failed tests
            print("\nFailed Tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
            
            return 1

def main():
    tester = GoladiumAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())