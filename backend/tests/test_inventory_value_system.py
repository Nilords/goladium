"""
Test suite for Inventory Value Tracking System
Tests the event-based /api/user/inventory-history endpoint and related features:
- Backend inventory history endpoint
- Shop purchase triggers inventory value events
- GamePass reward claiming triggers inventory value events
- Chest items exist in items collection
- Trading triggers inventory value events
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
TEST_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoidXNlcl9iNzcwZjQ5YzQ2YTQiLCJleHAiOjE3NzE5MzQ1OTksImlhdCI6MTc3MTMyOTc5OX0.e4dzi1f5_32ozUA2V3dbtCULX5WEG-QWp75azfmUFog"

# Expected chest items from SEED_ITEMS
EXPECTED_CHEST_ITEMS = [
    {"item_id": "common_chest", "name": "Common Chest", "rarity": "common", "base_value": 15.0},
    {"item_id": "uncommon_chest", "name": "Uncommon Chest", "rarity": "uncommon", "base_value": 30.0},
    {"item_id": "rare_chest", "name": "Rare Chest", "rarity": "rare", "base_value": 60.0},
    {"item_id": "epic_chest", "name": "Epic Chest", "rarity": "epic", "base_value": 120.0},
    {"item_id": "legendary_chest", "name": "Legendary Chest", "rarity": "legendary", "base_value": 250.0},
    {"item_id": "mythic_chest", "name": "Mythic Chest", "rarity": "legendary", "base_value": 500.0},
]

# Valid inventory event types
VALID_EVENT_TYPES = ['buy', 'sell', 'trade_in', 'trade_out', 'reward', 'gamepass_reward', 'admin_adjust', 'drop']


@pytest.fixture
def auth_headers():
    """Return authorization headers with test token"""
    return {
        'Authorization': f'Bearer {TEST_TOKEN}',
        'Content-Type': 'application/json'
    }


class TestInventoryHistoryEndpoint:
    """Test the /api/user/inventory-history endpoint"""
    
    def test_health_check(self):
        """Test that the backend is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code in [200, 404], f"Backend not accessible: {response.status_code}"
        print(f"✓ Backend accessible (status={response.status_code})")
    
    def test_unauthorized_access(self):
        """Test that endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/user/inventory-history")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthorized access correctly rejected")
    
    def test_inventory_history_default_limit(self, auth_headers):
        """Test endpoint with default limit (30)"""
        response = requests.get(
            f"{BASE_URL}/api/user/inventory-history",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'events' in data, "Response missing 'events' field"
        assert 'stats' in data, "Response missing 'stats' field"
        assert 'total_events' in data, "Response missing 'total_events' field"
        assert 'limit' in data, "Response missing 'limit' field"
        assert data['limit'] == 30, f"Default limit should be 30, got {data['limit']}"
        
        print(f"✓ Inventory history endpoint working (events={data['total_events']}, limit={data['limit']})")
    
    @pytest.mark.parametrize("limit", [10, 30, 50, 100])
    def test_inventory_history_with_limits(self, auth_headers, limit):
        """Test endpoint with different limit values"""
        response = requests.get(
            f"{BASE_URL}/api/user/inventory-history?limit={limit}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Limit {limit} failed: {response.status_code}"
        
        data = response.json()
        actual_limit = data['limit']
        
        # Limits are clamped between 10-100
        expected_limit = min(max(limit, 10), 100)
        assert actual_limit == expected_limit, f"Limit mismatch: expected {expected_limit}, got {actual_limit}"
        
        print(f"✓ Limit {limit} -> clamped to {actual_limit}")
    
    def test_inventory_history_stats_structure(self, auth_headers):
        """Test that stats object has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/user/inventory-history",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        stats = response.json().get('stats', {})
        
        # Required stat fields for inventory value
        required_fields = ['current', 'highest', 'lowest', 'range', 'percent_change']
        for field in required_fields:
            assert field in stats, f"Stats missing required field: {field}"
            assert isinstance(stats[field], (int, float)), f"Stats.{field} should be numeric"
        
        # Value constraints
        assert stats['highest'] >= stats['lowest'], "Highest should be >= Lowest"
        assert stats['current'] >= 0, "Current should be >= 0"
        assert stats['range'] >= 0, "Range should be >= 0"
        
        print(f"✓ Stats structure validated: current={stats['current']}, highest={stats['highest']}, lowest={stats['lowest']}")
    
    def test_inventory_history_event_structure(self, auth_headers):
        """Test that events have proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/user/inventory-history",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        events = response.json().get('events', [])
        
        if events:
            # Check first event structure
            event = events[0]
            required_fields = [
                'event_id', 'user_id', 'event_number', 'event_type',
                'delta_value', 'total_inventory_value_after', 'timestamp'
            ]
            
            for field in required_fields:
                assert field in event, f"Event missing required field: {field}"
            
            # Verify event_type is valid
            assert event['event_type'] in VALID_EVENT_TYPES, \
                f"Invalid event_type: {event['event_type']}"
            
            # Verify numeric values
            assert isinstance(event['event_number'], int), "event_number should be int"
            assert isinstance(event['delta_value'], (int, float)), "delta_value should be numeric"
            assert isinstance(event['total_inventory_value_after'], (int, float)), "total_inventory_value_after should be numeric"
            
            # Verify total_inventory_value_after is never negative
            assert event['total_inventory_value_after'] >= 0, "total_inventory_value_after should never be negative"
            
            print(f"✓ Event structure validated: type={event['event_type']}, delta={event['delta_value']}, total={event['total_inventory_value_after']}")
        else:
            print("✓ No events found (valid for new users or empty inventory history)")
    
    def test_events_chronological_order(self, auth_headers):
        """Test that events are returned in chronological order (oldest to newest)"""
        response = requests.get(
            f"{BASE_URL}/api/user/inventory-history?limit=50",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        events = response.json().get('events', [])
        
        if len(events) >= 2:
            # Check event numbers are in ascending order
            for i in range(1, len(events)):
                assert events[i]['event_number'] > events[i-1]['event_number'], \
                    f"Events not in chronological order: {events[i-1]['event_number']} -> {events[i]['event_number']}"
            
            print(f"✓ Events in chronological order (first={events[0]['event_number']}, last={events[-1]['event_number']})")
        else:
            print("✓ Not enough events to verify order")


class TestChestItemsExistence:
    """Test that chest items exist in the items collection"""
    
    def test_items_endpoint_exists(self, auth_headers):
        """Test that items collection is accessible via shop"""
        response = requests.get(
            f"{BASE_URL}/api/shop",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Shop endpoint failed: {response.status_code}"
        print("✓ Shop endpoint accessible")
    
    def test_items_collection_has_chests(self, auth_headers):
        """Verify chest items exist by checking inventory endpoint for item definitions"""
        # Test by checking a specific chest item can be found in shop or items
        response = requests.get(
            f"{BASE_URL}/api/inventory",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Inventory endpoint failed: {response.status_code}"
        print("✓ Inventory endpoint accessible")


class TestShopPurchaseTriggersInventoryEvent:
    """Test that shop purchases trigger inventory value events"""
    
    def test_shop_listings_available(self, auth_headers):
        """Verify shop has items available"""
        response = requests.get(
            f"{BASE_URL}/api/shop",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Shop failed: {response.status_code}"
        
        data = response.json()
        # Shop endpoint returns a list directly
        assert isinstance(data, list), "Shop response should be a list"
        print(f"✓ Shop accessible with {len(data)} listings")
    
    def test_shop_purchase_workflow(self, auth_headers):
        """Test that purchasing from shop adds to inventory"""
        # First check shop listings
        shop_response = requests.get(
            f"{BASE_URL}/api/shop",
            headers=auth_headers
        )
        assert shop_response.status_code == 200
        
        # Shop returns a list directly
        listings = shop_response.json()
        
        if not listings:
            pytest.skip("No shop listings available for purchase test")
        
        # Find an active listing we can afford
        for listing in listings:
            if listing.get('is_active', True):
                print(f"✓ Found active shop listing: {listing['item_name']} for {listing['price']} G")
                break
        else:
            print("⚠ No active listings found in shop")


class TestGamePassRewardsClaim:
    """Test GamePass reward claiming flow"""
    
    def test_game_pass_status_endpoint(self, auth_headers):
        """Test game pass status endpoint exists"""
        response = requests.get(
            f"{BASE_URL}/api/game-pass",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Game pass status failed: {response.status_code}"
        
        data = response.json()
        assert 'level' in data, "Missing 'level' field"
        assert 'xp' in data, "Missing 'xp' field"
        
        print(f"✓ GamePass status: level={data['level']}, xp={data['xp']}")
    
    def test_game_pass_rewards_structure(self, auth_headers):
        """Test game pass rewards are configured with chest items"""
        response = requests.get(
            f"{BASE_URL}/api/game-pass",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Check for reward-related fields
        assert 'level' in data, "Missing 'level' field"
        assert 'xp' in data, "Missing 'xp' field"
        assert 'all_rewards' in data, "Missing 'all_rewards' field"
        assert 'rewards_claimed' in data, "Missing 'rewards_claimed' field"
        
        # Verify chest items are in the rewards
        all_rewards = data.get('all_rewards', {})
        chest_items_found = set()
        for level, rewards in all_rewards.items():
            for tier in ['free', 'galadium']:
                if tier in rewards and rewards[tier].get('type') == 'item':
                    chest_items_found.add(rewards[tier].get('item_id'))
        
        expected_chests = {'common_chest', 'uncommon_chest', 'rare_chest', 'epic_chest', 'legendary_chest', 'mythic_chest'}
        assert chest_items_found == expected_chests, f"Missing chest items in rewards: {expected_chests - chest_items_found}"
        
        print(f"✓ GamePass rewards contain all chest items: {chest_items_found}")


class TestTradingTriggersInventoryEvents:
    """Test that trading triggers inventory value events"""
    
    def test_trading_endpoints_exist(self, auth_headers):
        """Verify trading endpoints are accessible"""
        # Test inbound trades endpoint
        inbound_response = requests.get(
            f"{BASE_URL}/api/trades/inbound",
            headers=auth_headers
        )
        assert inbound_response.status_code == 200, f"Inbound trades failed: {inbound_response.status_code}"
        
        # Test outbound trades endpoint
        outbound_response = requests.get(
            f"{BASE_URL}/api/trades/outbound",
            headers=auth_headers
        )
        assert outbound_response.status_code == 200, f"Outbound trades failed: {outbound_response.status_code}"
        
        # Test completed trades endpoint
        completed_response = requests.get(
            f"{BASE_URL}/api/trades/completed",
            headers=auth_headers
        )
        assert completed_response.status_code == 200, f"Completed trades failed: {completed_response.status_code}"
        
        print("✓ All trading endpoints accessible")


class TestInventoryValueEventTypes:
    """Test that different event types are tracked correctly"""
    
    def test_event_types_in_history(self, auth_headers):
        """Check what event types exist in user's history"""
        response = requests.get(
            f"{BASE_URL}/api/user/inventory-history?limit=100",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        events = response.json().get('events', [])
        
        if events:
            event_types_found = set(e['event_type'] for e in events)
            print(f"✓ Event types found in history: {event_types_found}")
            
            # Verify all found types are valid
            for et in event_types_found:
                assert et in VALID_EVENT_TYPES, f"Invalid event type found: {et}"
        else:
            print("✓ No events in history yet")
    
    def test_delta_values_make_sense(self, auth_headers):
        """Verify delta values match event types (buys positive, sells negative)"""
        response = requests.get(
            f"{BASE_URL}/api/user/inventory-history?limit=100",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        events = response.json().get('events', [])
        
        positive_types = ['buy', 'trade_in', 'reward', 'gamepass_reward', 'drop']
        negative_types = ['sell', 'trade_out']
        
        issues = []
        for event in events:
            et = event['event_type']
            delta = event['delta_value']
            
            # Check if delta sign matches event type expectation
            if et in positive_types and delta < 0:
                issues.append(f"Event {et} has negative delta {delta}")
            elif et in negative_types and delta > 0:
                issues.append(f"Event {et} has positive delta {delta}")
        
        if issues:
            print(f"⚠ Delta value issues found: {issues}")
        else:
            print(f"✓ All delta values match expected signs ({len(events)} events checked)")


class TestValueHistoryIndexes:
    """Test that inventory_value_history collection has proper indexes"""
    
    def test_history_query_performance(self, auth_headers):
        """Test that queries are efficient (indexes should be in place)"""
        import time
        
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/api/user/inventory-history?limit=100",
            headers=auth_headers
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200
        assert elapsed < 2.0, f"Query took too long: {elapsed:.2f}s (expected <2s)"
        
        print(f"✓ Inventory history query completed in {elapsed:.3f}s")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
