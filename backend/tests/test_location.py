"""
Phase 4 tests — Location services, GPS ping, distance calculations, and live tracking.
Uses shared conftest.py for test setup.
"""

import pytest
from tests.conftest import client
from app.core.location import haversine_distance, calculate_eta


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login_admin() -> str:
    resp = client.post("/api/v1/auth/login", json={
        "email": "admin@test.com",
        "password": "Admin@123",
    })
    return resp.json()["access_token"]


def _register_customer() -> str:
    resp = client.post("/api/v1/auth/register", json={
        "email": "cust_loc@test.com",
        "password": "Cust@123",
        "full_name": "Location Customer",
        "role": "customer",
    })
    return resp.json()["access_token"]


def _register_technician() -> tuple[str, int]:
    resp = client.post("/api/v1/auth/register", json={
        "email": "tech_loc@test.com",
        "password": "Tech@123",
        "full_name": "Location Tech",
        "role": "technician",
    })
    token = resp.json()["access_token"]
    profile_resp = client.get("/api/v1/technicians/me", headers=_auth_header(token))
    tech_id = profile_resp.json()["id"]
    return token, tech_id


def _create_request(token: str, lat: float = 28.6139, lng: float = 77.2090):
    return client.post("/api/v1/service-requests", json={
        "category_id": 1,
        "title": "HVAC unit leaking water",
        "description": "The ceiling unit in conference room B is dripping onto the table.",
        "priority": "HIGH",
        "location_address": "Connaught Place, Central Delhi",
        "location_lat": lat,
        "location_lng": lng,
    }, headers=_auth_header(token))


class TestHaversineAndEtaCalculations:
    """Unit tests for distance and ETA calculations."""

    def test_haversine_same_point(self):
        dist = haversine_distance(28.6139, 77.2090, 28.6139, 77.2090)
        assert dist == 0.0

    def test_haversine_known_distance(self):
        # CP Delhi (28.6315, 77.2167) to India Gate (28.6129, 77.2295) is approx 2.3-2.5 km
        dist = haversine_distance(28.6315, 77.2167, 28.6129, 77.2295)
        assert 2.0 <= dist <= 2.8

    def test_eta_calculation(self):
        # 0 distance
        assert calculate_eta(0.0) == 0

        # 5 km at 30 km/h = 10 mins + 2 mins buffer = 12 mins
        eta = calculate_eta(5.0, speed_kmh=30.0)
        assert eta == 12

        # 1 km should give a positive ETA
        assert calculate_eta(1.0) >= 2


class TestTechnicianGpsPing:
    """Technician GPS ping endpoint tests."""

    def test_technician_can_ping_location(self):
        tech_token, _ = _register_technician()

        resp = client.post(
            "/api/v1/technicians/me/location",
            json={"lat": 28.6250, "lng": 77.2180},
            headers=_auth_header(tech_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["lat"] == 28.6250
        assert data["lng"] == 77.2180
        assert "last_location_update" in data

    def test_invalid_coordinates(self):
        tech_token, _ = _register_technician()

        # Out-of-bounds latitude
        resp = client.post(
            "/api/v1/technicians/me/location",
            json={"lat": 95.0, "lng": 77.2180},
            headers=_auth_header(tech_token),
        )
        assert resp.status_code == 422


class TestServiceRequestLiveTracking:
    """Live tracking and ETA retrieval tests."""

    def test_tracking_unassigned_request(self):
        cust_token = _register_customer()
        sr_resp = _create_request(cust_token)
        req_id = sr_resp.json()["request_id"]

        resp = client.get(
            f"/api/v1/service-requests/{req_id}/tracking",
            headers=_auth_header(cust_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["service_request_id"] == req_id
        assert data["status"] == "NEW"
        assert data["is_en_route"] is False
        assert data["technician_name"] is None
        assert data["distance_km"] is None
        assert data["estimated_duration_minutes"] is None

    def test_tracking_assigned_en_route_technician(self):
        admin_token = _login_admin()
        cust_token = _register_customer()
        tech_token, tech_id = _register_technician()

        # Destination at India Gate (28.6129, 77.2295)
        sr_resp = _create_request(cust_token, lat=28.6129, lng=77.2295)
        req_id = sr_resp.json()["request_id"]

        # Admin assigns tech
        client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(admin_token),
        )

        # Tech pings GPS at Connaught Place (28.6315, 77.2167)
        client.post(
            "/api/v1/technicians/me/location",
            json={"lat": 28.6315, "lng": 77.2167},
            headers=_auth_header(tech_token),
        )

        # Tech marks EN_ROUTE
        client.post(
            f"/api/v1/service-requests/{req_id}/status",
            json={"status": "ACCEPTED"},
            headers=_auth_header(tech_token),
        )
        client.post(
            f"/api/v1/service-requests/{req_id}/status",
            json={"status": "EN_ROUTE"},
            headers=_auth_header(tech_token),
        )

        # Customer checks tracking
        resp = client.get(
            f"/api/v1/service-requests/{req_id}/tracking",
            headers=_auth_header(cust_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "EN_ROUTE"
        assert data["is_en_route"] is True
        assert data["technician_name"] == "Location Tech"
        assert data["technician_lat"] == 28.6315
        assert data["technician_lng"] == 77.2167
        assert data["distance_km"] is not None
        assert 2.0 <= data["distance_km"] <= 2.8
        assert data["estimated_duration_minutes"] is not None
        assert data["estimated_duration_minutes"] > 0

    def test_tracking_unauthorized_user(self):
        cust1_token = _register_customer()
        # Register second customer
        resp2 = client.post("/api/v1/auth/register", json={
            "email": "cust_other@test.com",
            "password": "Cust@123",
            "full_name": "Other Customer",
            "role": "customer",
        })
        cust2_token = resp2.json()["access_token"]

        sr_resp = _create_request(cust1_token)
        req_id = sr_resp.json()["request_id"]

        # cust2 should not be able to track cust1's request
        resp = client.get(
            f"/api/v1/service-requests/{req_id}/tracking",
            headers=_auth_header(cust2_token),
        )
        assert resp.status_code == 403
