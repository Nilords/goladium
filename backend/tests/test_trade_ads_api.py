"""
Test Suite for Phase 4: Trade Ads System
Tests all Trade Ads CRUD operations and validation rules.

Features tested:
- GET /api/trade-ads - Browse active trade ads with search filter
- GET /api/trade-ads/my - Get current user's active ads (requires auth)
- POST /api/trade-ads/create - Create trade ad with validation
- POST /api/trade-ads/delete - Delete own trade ad
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USERNAME = "Ghost1"
TEST_PASSWORD = "Test123!"
TEST_BYPASS_HEADER = "goladium_dev_2026"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "x-test-bypass": TEST_BYPASS_HEADER
    })
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token for Ghost1"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


@pytest.fixture(scope="module")
def user_data(authenticated_client):
    """Get current user data"""
    response = authenticated_client.get(f"{BASE_URL}/api/user/me")
    if response.status_code == 200:
        return response.json()
    pytest.skip("Could not get user data")


@pytest.fixture(scope="module")
def user_inventory(authenticated_client):
    """Get user's inventory"""
    response = authenticated_client.get(f"{BASE_URL}/api/inventory")
    if response.status_code == 200:
        return response.json().get("items", [])
    return []


@pytest.fixture(scope="module")
def item_catalog(api_client):
    """Get item catalog"""
    response = api_client.get(f"{BASE_URL}/api/items/catalog?limit=200")
    if response.status_code == 200:
        return response.json().get("items", [])
    return []


# ============== GET /api/trade-ads Tests ==============

class TestGetTradeAds:
    """Test GET /api/trade-ads endpoint - Browse active trade ads"""
    
    def test_get_trade_ads_success(self, api_client):
        """Test fetching trade ads returns valid response"""
        response = api_client.get(f"{BASE_URL}/api/trade-ads")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "ads" in data
        assert "total" in data
        assert isinstance(data["ads"], list)
        assert isinstance(data["total"], int)
        print(f"✓ GET /api/trade-ads returned {data['total']} ads")
    
    def test_get_trade_ads_with_limit(self, api_client):
        """Test trade ads with limit parameter"""
        response = api_client.get(f"{BASE_URL}/api/trade-ads?limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["ads"]) <= 5
        print(f"✓ GET /api/trade-ads?limit=5 returned {len(data['ads'])} ads")
    
    def test_get_trade_ads_with_search(self, api_client):
        """Test trade ads search filter"""
        response = api_client.get(f"{BASE_URL}/api/trade-ads?search=relic")
        assert response.status_code == 200
        
        data = response.json()
        # Search should filter by offering/seeking names, username, or note
        print(f"✓ GET /api/trade-ads?search=relic returned {len(data['ads'])} ads")
    
    def test_get_trade_ads_structure(self, api_client):
        """Test trade ad structure contains required fields"""
        response = api_client.get(f"{BASE_URL}/api/trade-ads")
        assert response.status_code == 200
        
        data = response.json()
        if data["ads"]:
            ad = data["ads"][0]
            # Verify required fields
            required_fields = ["ad_id", "user_id", "username", "offering_items", 
                              "seeking_items", "status", "created_at"]
            for field in required_fields:
                assert field in ad, f"Missing field: {field}"
            
            # Verify offering_items structure
            assert isinstance(ad["offering_items"], list)
            if ad["offering_items"]:
                offer = ad["offering_items"][0]
                assert "item_id" in offer
                assert "item_name" in offer
                assert "item_rarity" in offer
            
            # Verify seeking_items structure
            assert isinstance(ad["seeking_items"], list)
            if ad["seeking_items"]:
                seek = ad["seeking_items"][0]
                assert "item_id" in seek
                assert "item_name" in seek
                assert "item_rarity" in seek
            
            print(f"✓ Trade ad structure validated: {ad['ad_id']}")
        else:
            print("✓ No trade ads found - structure test skipped")


# ============== GET /api/trade-ads/my Tests ==============

class TestGetMyTradeAds:
    """Test GET /api/trade-ads/my endpoint - Get user's own ads"""
    
    def test_get_my_ads_requires_auth(self, api_client):
        """Test that /trade-ads/my requires authentication"""
        # Remove auth header temporarily
        original_auth = api_client.headers.pop("Authorization", None)
        
        response = api_client.get(f"{BASE_URL}/api/trade-ads/my")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        # Restore auth header
        if original_auth:
            api_client.headers["Authorization"] = original_auth
        
        print("✓ GET /api/trade-ads/my correctly requires authentication")
    
    def test_get_my_ads_success(self, authenticated_client):
        """Test fetching user's own trade ads"""
        response = authenticated_client.get(f"{BASE_URL}/api/trade-ads/my")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "ads" in data
        assert isinstance(data["ads"], list)
        print(f"✓ GET /api/trade-ads/my returned {len(data['ads'])} ads for current user")


# ============== POST /api/trade-ads/create Tests ==============

class TestCreateTradeAd:
    """Test POST /api/trade-ads/create endpoint - Create new trade ad"""
    
    def test_create_ad_requires_auth(self, api_client):
        """Test that creating ad requires authentication"""
        original_auth = api_client.headers.pop("Authorization", None)
        
        response = api_client.post(f"{BASE_URL}/api/trade-ads/create", json={
            "offering_inventory_ids": ["test"],
            "seeking_item_ids": ["test"]
        })
        assert response.status_code == 401
        
        if original_auth:
            api_client.headers["Authorization"] = original_auth
        
        print("✓ POST /api/trade-ads/create correctly requires authentication")
    
    def test_create_ad_requires_offering(self, authenticated_client):
        """Test validation: must offer at least 1 item"""
        response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/create", json={
            "offering_inventory_ids": [],
            "seeking_item_ids": ["placeholder_relic"]
        })
        assert response.status_code == 400
        assert "offer" in response.json().get("detail", "").lower()
        print("✓ Create ad validation: must offer at least 1 item")
    
    def test_create_ad_requires_seeking(self, authenticated_client, user_inventory):
        """Test validation: must seek at least 1 item"""
        if not user_inventory:
            pytest.skip("No items in inventory to test with")
        
        inv_id = user_inventory[0]["inventory_id"]
        response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/create", json={
            "offering_inventory_ids": [inv_id],
            "seeking_item_ids": []
        })
        assert response.status_code == 400
        assert "seek" in response.json().get("detail", "").lower()
        print("✓ Create ad validation: must seek at least 1 item")
    
    def test_create_ad_max_8_offering(self, authenticated_client, user_inventory):
        """Test validation: max 8 offered items"""
        if not user_inventory:
            pytest.skip("No items in inventory to test with")
        
        # Create 9 fake inventory IDs (even if they don't exist, validation should catch the count)
        fake_ids = [f"fake_{i}" for i in range(9)]
        response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/create", json={
            "offering_inventory_ids": fake_ids,
            "seeking_item_ids": ["placeholder_relic"]
        })
        assert response.status_code == 400
        assert "8" in response.json().get("detail", "") or "maximum" in response.json().get("detail", "").lower()
        print("✓ Create ad validation: max 8 offered items")
    
    def test_create_ad_max_8_seeking(self, authenticated_client, user_inventory):
        """Test validation: max 8 sought items"""
        if not user_inventory:
            pytest.skip("No items in inventory to test with")
        
        inv_id = user_inventory[0]["inventory_id"]
        fake_seek_ids = [f"fake_{i}" for i in range(9)]
        response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/create", json={
            "offering_inventory_ids": [inv_id],
            "seeking_item_ids": fake_seek_ids
        })
        assert response.status_code == 400
        assert "8" in response.json().get("detail", "") or "maximum" in response.json().get("detail", "").lower()
        print("✓ Create ad validation: max 8 sought items")
    
    def test_create_ad_validates_inventory_ownership(self, authenticated_client):
        """Test validation: offering items must belong to user"""
        fake_inv_id = f"inv_{uuid.uuid4().hex[:12]}"
        response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/create", json={
            "offering_inventory_ids": [fake_inv_id],
            "seeking_item_ids": ["placeholder_relic"]
        })
        assert response.status_code == 400
        assert "not found" in response.json().get("detail", "").lower() or "inventory" in response.json().get("detail", "").lower()
        print("✓ Create ad validation: validates inventory ownership")
    
    def test_create_ad_validates_seeking_items_exist(self, authenticated_client, user_inventory):
        """Test validation: seeking items must exist in catalog"""
        if not user_inventory:
            pytest.skip("No items in inventory to test with")
        
        inv_id = user_inventory[0]["inventory_id"]
        response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/create", json={
            "offering_inventory_ids": [inv_id],
            "seeking_item_ids": [f"nonexistent_item_{uuid.uuid4().hex[:8]}"]
        })
        assert response.status_code == 400
        assert "not exist" in response.json().get("detail", "").lower() or "does not" in response.json().get("detail", "").lower()
        print("✓ Create ad validation: seeking items must exist")


# ============== POST /api/trade-ads/delete Tests ==============

class TestDeleteTradeAd:
    """Test POST /api/trade-ads/delete endpoint - Delete own trade ad"""
    
    def test_delete_ad_requires_auth(self, api_client):
        """Test that deleting ad requires authentication"""
        original_auth = api_client.headers.pop("Authorization", None)
        
        response = api_client.post(f"{BASE_URL}/api/trade-ads/delete", json={
            "ad_id": "test"
        })
        assert response.status_code == 401
        
        if original_auth:
            api_client.headers["Authorization"] = original_auth
        
        print("✓ POST /api/trade-ads/delete correctly requires authentication")
    
    def test_delete_nonexistent_ad(self, authenticated_client):
        """Test deleting non-existent ad returns 404"""
        response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/delete", json={
            "ad_id": f"ta_{uuid.uuid4().hex[:12]}"
        })
        assert response.status_code == 404
        print("✓ Delete nonexistent ad returns 404")
    
    def test_delete_own_ad_success(self, authenticated_client, user_inventory, item_catalog):
        """Test successful deletion of own trade ad"""
        if not user_inventory:
            pytest.skip("No items in inventory to create test ad")
        if not item_catalog:
            pytest.skip("No items in catalog to seek")
        
        # First create a test ad
        inv_id = user_inventory[0]["inventory_id"]
        seek_item_id = item_catalog[0]["item_id"]
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/create", json={
            "offering_inventory_ids": [inv_id],
            "seeking_item_ids": [seek_item_id],
            "note": "TEST_auto_delete_ad"
        })
        
        if create_response.status_code != 200:
            # If we can't create (e.g., max ads), try to delete an existing one
            my_ads_response = authenticated_client.get(f"{BASE_URL}/api/trade-ads/my")
            if my_ads_response.status_code == 200:
                my_ads = my_ads_response.json().get("ads", [])
                if my_ads:
                    # Delete the first existing ad
                    ad_id = my_ads[0]["ad_id"]
                    delete_response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/delete", json={
                        "ad_id": ad_id
                    })
                    assert delete_response.status_code == 200
                    assert delete_response.json().get("success") == True
                    print(f"✓ Successfully deleted existing trade ad: {ad_id}")
                    return
            pytest.skip(f"Could not create test ad: {create_response.text}")
        
        ad_id = create_response.json()["ad"]["ad_id"]
        
        # Now delete it
        delete_response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/delete", json={
            "ad_id": ad_id
        })
        assert delete_response.status_code == 200
        assert delete_response.json().get("success") == True
        
        # Verify it's no longer in my ads
        my_ads_response = authenticated_client.get(f"{BASE_URL}/api/trade-ads/my")
        my_ads = my_ads_response.json().get("ads", [])
        deleted_ad = next((a for a in my_ads if a["ad_id"] == ad_id), None)
        assert deleted_ad is None, "Deleted ad should not appear in my ads"
        
        print(f"✓ Successfully created and deleted trade ad: {ad_id}")


# ============== Integration Tests ==============

class TestTradeAdsIntegration:
    """Integration tests for trade ads flow"""
    
    def test_full_create_verify_delete_flow(self, authenticated_client, user_inventory, item_catalog):
        """Test complete flow: create ad → verify in list → delete"""
        if not user_inventory:
            pytest.skip("No items in inventory")
        if not item_catalog:
            pytest.skip("No items in catalog")
        
        inv_id = user_inventory[0]["inventory_id"]
        seek_item_id = item_catalog[0]["item_id"]
        test_note = f"TEST_flow_{uuid.uuid4().hex[:6]}"
        
        # Step 1: Create
        create_response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/create", json={
            "offering_inventory_ids": [inv_id],
            "seeking_item_ids": [seek_item_id],
            "note": test_note
        })
        
        if create_response.status_code != 200:
            print(f"⚠ Could not create ad (possibly max limit): {create_response.json().get('detail')}")
            pytest.skip("Could not create test ad - possibly at max limit")
        
        ad_id = create_response.json()["ad"]["ad_id"]
        print(f"Step 1: Created ad {ad_id}")
        
        # Step 2: Verify in public list
        list_response = authenticated_client.get(f"{BASE_URL}/api/trade-ads")
        assert list_response.status_code == 200
        ads = list_response.json()["ads"]
        found_ad = next((a for a in ads if a["ad_id"] == ad_id), None)
        assert found_ad is not None, "Created ad should appear in public list"
        assert found_ad["note"] == test_note
        print(f"Step 2: Verified ad in public list")
        
        # Step 3: Verify in my ads
        my_response = authenticated_client.get(f"{BASE_URL}/api/trade-ads/my")
        assert my_response.status_code == 200
        my_ads = my_response.json()["ads"]
        found_my = next((a for a in my_ads if a["ad_id"] == ad_id), None)
        assert found_my is not None, "Created ad should appear in my ads"
        print(f"Step 3: Verified ad in my ads list")
        
        # Step 4: Delete
        delete_response = authenticated_client.post(f"{BASE_URL}/api/trade-ads/delete", json={
            "ad_id": ad_id
        })
        assert delete_response.status_code == 200
        print(f"Step 4: Deleted ad {ad_id}")
        
        # Step 5: Verify not in lists
        list_response2 = authenticated_client.get(f"{BASE_URL}/api/trade-ads")
        ads2 = list_response2.json()["ads"]
        found_after = next((a for a in ads2 if a["ad_id"] == ad_id), None)
        assert found_after is None, "Deleted ad should not appear in public list"
        
        my_response2 = authenticated_client.get(f"{BASE_URL}/api/trade-ads/my")
        my_ads2 = my_response2.json()["ads"]
        found_my_after = next((a for a in my_ads2 if a["ad_id"] == ad_id), None)
        assert found_my_after is None, "Deleted ad should not appear in my ads"
        
        print(f"✓ Full create→verify→delete flow completed successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
