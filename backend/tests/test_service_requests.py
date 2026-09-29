"""
Phase 2 tests — Service Request creation, listing, status transitions.
Uses shared conftest.py for test setup.
"""

from tests.conftest import client


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register_customer() -> str:
    resp = client.post("/api/v1/auth/register", json={
        "email": "cust@test.com",
        "password": "Cust@123",
        "full_name": "Test Customer",
        "role": "customer",
    })
    return resp.json()["access_token"]


def _register_technician() -> str:
    resp = client.post("/api/v1/auth/register", json={
        "email": "tech@test.com",
        "password": "Tech@123",
        "full_name": "Test Technician",
        "role": "technician",
    })
    return resp.json()["access_token"]


def _create_request(token: str):
    return client.post("/api/v1/service-requests", json={
        "category_id": 1,
        "title": "AC not cooling in Room 204",
        "description": "The air conditioner in Meeting Room 204 is not cooling properly.",
        "priority": "HIGH",
        "location_address": "Office Building, Floor 2, Room 204",
        "location_lat": 28.6139,
        "location_lng": 77.2090,
    }, headers=_auth_header(token))


class TestServiceRequestCreation:
    """Service request creation tests."""

    def test_create_request(self):
        token = _register_customer()
        resp = _create_request(token)
        assert resp.status_code == 201
        data = resp.json()
        assert data["request_id"].startswith("SR-")
        assert data["title"] == "AC not cooling in Room 204"
        assert data["priority"] == "HIGH"
        assert data["status"] == "NEW"
        assert data["category_name"] == "Air Conditioning"
        assert data["customer_name"] == "Test Customer"

    def test_create_request_unauthorized(self):
        """Technicians cannot create service requests."""
        token = _register_technician()
        resp = _create_request(token)
        assert resp.status_code == 403

    def test_create_request_invalid_category(self):
        token = _register_customer()
        resp = client.post("/api/v1/service-requests", json={
            "category_id": 999,
            "title": "Test request with bad category",
            "description": "This should fail because category doesn't exist.",
            "priority": "LOW",
            "location_address": "Some location here",
        }, headers=_auth_header(token))
        assert resp.status_code == 400

    def test_create_request_validation_errors(self):
        token = _register_customer()
        resp = client.post("/api/v1/service-requests", json={
            "category_id": 1,
            "title": "Hi",
            "description": "Short",
            "priority": "INVALID",
            "location_address": "OK",
        }, headers=_auth_header(token))
        assert resp.status_code == 422


class TestServiceRequestListing:
    """Service request listing tests."""

    def test_list_requests_customer(self):
        token = _register_customer()
        _create_request(token)
        _create_request(token)

        resp = client.get("/api/v1/service-requests", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    def test_list_requests_empty(self):
        token = _register_customer()
        resp = client.get("/api/v1/service-requests", headers=_auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_list_requests_pagination(self):
        token = _register_customer()
        for _ in range(5):
            _create_request(token)

        resp = client.get("/api/v1/service-requests?page=1&per_page=2",
                          headers=_auth_header(token))
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1


class TestServiceRequestDetail:
    """Service request detail/get tests."""

    def test_get_request(self):
        token = _register_customer()
        create_resp = _create_request(token)
        request_id = create_resp.json()["request_id"]

        resp = client.get(f"/api/v1/service-requests/{request_id}",
                          headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["request_id"] == request_id
        assert len(data["status_history"]) == 1
        assert data["status_history"][0]["to_status"] == "NEW"

    def test_get_request_not_found(self):
        token = _register_customer()
        resp = client.get("/api/v1/service-requests/SR-99999",
                          headers=_auth_header(token))
        assert resp.status_code == 404


class TestStatusTransitions:
    """Status transition tests."""

    def test_invalid_transition(self):
        """Cannot go from NEW directly to COMPLETED."""
        token = _register_customer()
        create_resp = _create_request(token)
        request_id = create_resp.json()["request_id"]

        resp = client.post(f"/api/v1/service-requests/{request_id}/status",
                           json={"status": "COMPLETED"},
                           headers=_auth_header(token))
        assert resp.status_code in [400, 403]

    def test_customer_cannot_accept(self):
        """Customers cannot change status to ACCEPTED."""
        token = _register_customer()
        create_resp = _create_request(token)
        request_id = create_resp.json()["request_id"]

        resp = client.post(f"/api/v1/service-requests/{request_id}/status",
                           json={"status": "ACCEPTED"},
                           headers=_auth_header(token))
        assert resp.status_code in [400, 403]  # Invalid transition or unauthorized


class TestDashboardStats:
    """Dashboard statistics tests."""

    def test_customer_stats(self):
        token = _register_customer()
        _create_request(token)
        _create_request(token)

        resp = client.get("/api/v1/service-requests/dashboard/stats",
                          headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_requests"] == 2
        assert data["open_requests"] == 2
        assert data["in_progress_requests"] == 0

    def test_stats_empty(self):
        token = _register_customer()
        resp = client.get("/api/v1/service-requests/dashboard/stats",
                          headers=_auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["total_requests"] == 0


class TestServiceNotes:
    """Service note tests."""

    def test_add_note(self):
        token = _register_customer()
        create_resp = _create_request(token)
        request_id = create_resp.json()["request_id"]

        resp = client.post(f"/api/v1/service-requests/{request_id}/notes",
                           json={"content": "Please check the compressor unit."},
                           headers=_auth_header(token))
        assert resp.status_code == 201
        assert resp.json()["content"] == "Please check the compressor unit."

    def test_list_notes(self):
        token = _register_customer()
        create_resp = _create_request(token)
        request_id = create_resp.json()["request_id"]

        client.post(f"/api/v1/service-requests/{request_id}/notes",
                    json={"content": "Note 1"}, headers=_auth_header(token))
        client.post(f"/api/v1/service-requests/{request_id}/notes",
                    json={"content": "Note 2"}, headers=_auth_header(token))

        resp = client.get(f"/api/v1/service-requests/{request_id}/notes",
                          headers=_auth_header(token))
        assert resp.status_code == 200
        assert len(resp.json()) == 2
