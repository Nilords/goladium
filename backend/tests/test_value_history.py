"""
Test suite for Account Value Chart timeframe filters
Tests the /api/user/value-history endpoint with stock-market style timeframes
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
TEST_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoidXNlcl9iNzcwZjQ5YzQ2YTQiLCJleHAiOjE3NzE5MzQ1OTksImlhdCI6MTc3MTMyOTc5OX0.e4dzi1f5_32ozUA2V3dbtCULX5WEG-QWp75azfmUFog"

# All supported timeframes for the stock-market style chart
VALID_TIMEFRAMES = ['1m', '15m', '1h', '3d', '1w', '1mo']

# Expected bucket minutes for each timeframe
EXPECTED_BUCKET_MINUTES = {
    '1m': 1,      # 1-minute buckets for 1 hour
    '15m': 15,    # 15-minute buckets for 6 hours
    '1h': 60,     # 1-hour buckets for 24 hours
    '3d': 180,    # 3-hour buckets for 3 days
    '1w': 360,    # 6-hour buckets for 1 week
    '1mo': 1440,  # 24-hour (daily) buckets for 1 month
}


@pytest.fixture
def auth_headers():
    """Return authorization headers with test token"""
    return {
        'Authorization': f'Bearer {TEST_TOKEN}',
        'Content-Type': 'application/json'
    }


class TestValueHistoryEndpoint:
    """Test the /api/user/value-history endpoint"""
    
    def test_health_check(self):
        """Test that the backend is accessible"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Backend not accessible: {response.status_code}"
        print("✓ Backend health check passed")
    
    def test_unauthorized_access(self):
        """Test that endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/user/value-history")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthorized access correctly rejected")
    
    def test_default_timeframe(self, auth_headers):
        """Test endpoint with no timeframe parameter (should default to 1h)"""
        response = requests.get(
            f"{BASE_URL}/api/user/value-history",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'timeframe' in data, "Response missing 'timeframe' field"
        assert data['timeframe'] == '1h', f"Default timeframe should be '1h', got {data['timeframe']}"
        assert 'data_points' in data, "Response missing 'data_points' field"
        assert 'stats' in data, "Response missing 'stats' field"
        print(f"✓ Default timeframe test passed (timeframe={data['timeframe']})")
    
    @pytest.mark.parametrize("timeframe", VALID_TIMEFRAMES)
    def test_all_timeframes(self, auth_headers, timeframe):
        """Test each of the 6 stock-market style timeframes"""
        response = requests.get(
            f"{BASE_URL}/api/user/value-history?timeframe={timeframe}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Timeframe {timeframe} failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert data['timeframe'] == timeframe, f"Timeframe mismatch: expected {timeframe}, got {data['timeframe']}"
        assert 'bucket_minutes' in data, f"Missing bucket_minutes for {timeframe}"
        assert data['bucket_minutes'] == EXPECTED_BUCKET_MINUTES[timeframe], \
            f"Bucket minutes mismatch for {timeframe}: expected {EXPECTED_BUCKET_MINUTES[timeframe]}, got {data['bucket_minutes']}"
        assert 'display_format' in data, f"Missing display_format for {timeframe}"
        assert 'data_points' in data, f"Missing data_points for {timeframe}"
        assert isinstance(data['data_points'], list), f"data_points should be a list for {timeframe}"
        
        print(f"✓ Timeframe {timeframe} passed (bucket_minutes={data['bucket_minutes']})")
    
    def test_invalid_timeframe_fallback(self, auth_headers):
        """Test that invalid timeframe falls back to 1h"""
        response = requests.get(
            f"{BASE_URL}/api/user/value-history?timeframe=invalid",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['timeframe'] == '1h', f"Invalid timeframe should fallback to 1h, got {data['timeframe']}"
        print("✓ Invalid timeframe correctly falls back to 1h")
    
    def test_stats_structure(self, auth_headers):
        """Test that stats object has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/user/value-history?timeframe=1h",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        stats = response.json().get('stats', {})
        
        # Required stat fields
        required_fields = ['current', 'all_time_high', 'all_time_low', 'range', 'percent_change']
        for field in required_fields:
            assert field in stats, f"Stats missing required field: {field}"
            assert isinstance(stats[field], (int, float)), f"Stats.{field} should be numeric, got {type(stats[field])}"
        
        print(f"✓ Stats structure validated: {list(stats.keys())}")
    
    def test_data_points_ohlc_structure(self, auth_headers):
        """Test that data points have OHLC structure (Open, High, Low, Close)"""
        response = requests.get(
            f"{BASE_URL}/api/user/value-history?timeframe=1h",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data_points = response.json().get('data_points', [])
        
        if data_points:
            # Check first data point has OHLC fields
            point = data_points[0]
            ohlc_fields = ['open', 'close', 'high', 'low', 'total_value', 'timestamp']
            for field in ohlc_fields:
                assert field in point, f"Data point missing OHLC field: {field}"
            
            # Verify numeric types for OHLC values
            for field in ['open', 'close', 'high', 'low', 'total_value']:
                assert isinstance(point[field], (int, float)), f"OHLC field {field} should be numeric"
            
            # Verify OHLC logic: high >= open, high >= close, low <= open, low <= close
            assert point['high'] >= point['low'], "High should be >= Low"
            assert point['high'] >= point['open'], "High should be >= Open"
            assert point['high'] >= point['close'], "High should be >= Close"
            assert point['low'] <= point['open'], "Low should be <= Open"
            assert point['low'] <= point['close'], "Low should be <= Close"
            
            print(f"✓ OHLC structure validated with {len(data_points)} data points")
        else:
            print("✓ No data points (valid for new user)")


class TestUserStatsEndpoint:
    """Test the /api/user/stats endpoint used alongside value-history"""
    
    def test_stats_endpoint(self, auth_headers):
        """Test that /api/user/stats endpoint works"""
        response = requests.get(
            f"{BASE_URL}/api/user/stats",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Stats endpoint failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert 'overall' in data, "Stats response missing 'overall' field"
        print(f"✓ User stats endpoint working: {list(data.keys())}")


class TestTimeframeDataDifferences:
    """Test that different timeframes return appropriately different data"""
    
    def test_bucket_minutes_scale_correctly(self, auth_headers):
        """Verify bucket sizes increase with timeframe duration"""
        bucket_sizes = {}
        
        for timeframe in VALID_TIMEFRAMES:
            response = requests.get(
                f"{BASE_URL}/api/user/value-history?timeframe={timeframe}",
                headers=auth_headers
            )
            assert response.status_code == 200
            bucket_sizes[timeframe] = response.json().get('bucket_minutes', 0)
        
        # Verify scaling: 1m < 15m < 1h < 3d < 1w < 1mo
        assert bucket_sizes['1m'] < bucket_sizes['15m'], "1m should have smaller buckets than 15m"
        assert bucket_sizes['15m'] < bucket_sizes['1h'], "15m should have smaller buckets than 1h"
        assert bucket_sizes['1h'] < bucket_sizes['3d'], "1h should have smaller buckets than 3d"
        assert bucket_sizes['3d'] < bucket_sizes['1w'], "3d should have smaller buckets than 1w"
        assert bucket_sizes['1w'] < bucket_sizes['1mo'], "1w should have smaller buckets than 1mo"
        
        print(f"✓ Bucket size scaling correct: {bucket_sizes}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
