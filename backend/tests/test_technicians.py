"""
Phase 3 tests — Technician profiles, availability, assignment, status workflow, and dashboard.
Uses shared conftest.py for test setup.
"""

from tests.conftest import client


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
        "email": "cust@test.com",
        "password": "Cust@123",
        "full_name": "Test Customer",
        "role": "customer",
    })
    return resp.json()["access_token"]


def _register_technician(email: str = "tech@test.com", name: str = "Test Technician") -> tuple[str, int]:
    resp = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Tech@123",
        "full_name": name,
        "role": "technician",
    })
    token = resp.json()["access_token"]
    # Get profile to obtain technician profile id
    profile_resp = client.get("/api/v1/technicians/me", headers=_auth_header(token))
    tech_id = profile_resp.json()["id"]
    return token, tech_id


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


class TestTechnicianProfile:
    """Technician profile and availability tests."""

    def test_get_technician_profile(self):
        token, tech_id = _register_technician()
        resp = client.get("/api/v1/technicians/me", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == tech_id
        assert data["full_name"] == "Test Technician"
        assert data["is_available"] is True
        assert data["employee_id"].startswith("TEC-")

    def test_update_technician_status(self):
        token, _ = _register_technician()
        # Toggle availability to false and update GPS
        resp = client.patch(
            "/api/v1/technicians/me/status",
            json={"is_available": False, "current_lat": 28.5355, "current_lng": 77.3910},
            headers=_auth_header(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_available"] is False
        assert data["current_lat"] == 28.5355
        assert data["current_lng"] == 77.3910
        assert data["last_location_update"] is not None

    def test_list_technicians(self):
        admin_token = _login_admin()
        _, tech1_id = _register_technician("tech1@test.com", "Tech One")
        _, tech2_id = _register_technician("tech2@test.com", "Tech Two")

        resp = client.get("/api/v1/technicians", headers=_auth_header(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 2
        ids = [t["id"] for t in data]
        assert tech1_id in ids
        assert tech2_id in ids


class TestTechnicianAssignment:
    """Job assignment tests."""

    def test_admin_can_assign_technician(self):
        admin_token = _login_admin()
        cust_token = _register_customer()
        _, tech_id = _register_technician()

        sr_resp = _create_request(cust_token)
        req_id = sr_resp.json()["request_id"]

        assign_resp = client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(admin_token),
        )
        assert assign_resp.status_code == 200
        data = assign_resp.json()
        assert data["status"] == "ASSIGNED"
        assert data["assigned_technician_id"] == tech_id
        assert data["assigned_technician_name"] == "Test Technician"

    def test_customer_cannot_assign_technician(self):
        cust_token = _register_customer()
        _, tech_id = _register_technician()

        sr_resp = _create_request(cust_token)
        req_id = sr_resp.json()["request_id"]

        assign_resp = client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(cust_token),
        )
        assert assign_resp.status_code == 403


class TestTechnicianStatusWorkflow:
    """Full technician workflow from ACCEPTED to COMPLETED."""

    def test_technician_accept_and_progress_job(self):
        admin_token = _login_admin()
        cust_token = _register_customer()
        tech_token, tech_id = _register_technician()

        sr_resp = _create_request(cust_token)
        req_id = sr_resp.json()["request_id"]

        # Admin assigns
        client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(admin_token),
        )

        # 1. Tech accepts
        resp = client.post(
            f"/api/v1/service-requests/{req_id}/status",
            json={"status": "ACCEPTED", "note": "Accepted by tech"},
            headers=_auth_header(tech_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ACCEPTED"

        # 2. Tech departs (EN_ROUTE)
        resp = client.post(
            f"/api/v1/service-requests/{req_id}/status",
            json={"status": "EN_ROUTE", "note": "On the way, ETA 15 mins"},
            headers=_auth_header(tech_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "EN_ROUTE"

        # 3. Tech arrives (IN_PROGRESS)
        resp = client.post(
            f"/api/v1/service-requests/{req_id}/status",
            json={"status": "IN_PROGRESS", "note": "Arrived, inspecting compressor"},
            headers=_auth_header(tech_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "IN_PROGRESS"

        # 4. Tech finishes (COMPLETED)
        resp = client.post(
            f"/api/v1/service-requests/{req_id}/status",
            json={"status": "COMPLETED", "note": "Replaced filter and recharged gas"},
            headers=_auth_header(tech_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "COMPLETED"
        assert resp.json()["completed_at"] is not None

        # 5. Customer confirms (CUSTOMER_CONFIRMED)
        resp = client.post(
            f"/api/v1/service-requests/{req_id}/status",
            json={"status": "CUSTOMER_CONFIRMED", "note": "Cooling is working great now!"},
            headers=_auth_header(cust_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "CUSTOMER_CONFIRMED"
        assert resp.json()["confirmed_at"] is not None

    def test_technician_can_reject_job(self):
        admin_token = _login_admin()
        cust_token = _register_customer()
        tech_token, tech_id = _register_technician()

        sr_resp = _create_request(cust_token)
        req_id = sr_resp.json()["request_id"]

        # Admin assigns
        client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(admin_token),
        )

        # Tech rejects (transitions back to NEW)
        resp = client.post(
            f"/api/v1/service-requests/{req_id}/status",
            json={"status": "NEW", "note": "Outside my service radius today"},
            headers=_auth_header(tech_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "NEW"
        assert data["assigned_technician_id"] is None


class TestTechnicianDashboardAndActiveJob:
    """Dashboard KPIs and active job retrieval tests."""

    def test_active_job_detection(self):
        admin_token = _login_admin()
        cust_token = _register_customer()
        tech_token, tech_id = _register_technician()

        # Before assignment, active job is None
        resp = client.get("/api/v1/technicians/active-job", headers=_auth_header(tech_token))
        assert resp.status_code == 200
        assert resp.json() is None

        # Create and assign request
        sr_resp = _create_request(cust_token)
        req_id = sr_resp.json()["request_id"]
        client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(admin_token),
        )

        # Accept job
        client.post(
            f"/api/v1/service-requests/{req_id}/status",
            json={"status": "ACCEPTED"},
            headers=_auth_header(tech_token),
        )

        # Active job should now be this accepted job
        resp = client.get("/api/v1/technicians/active-job", headers=_auth_header(tech_token))
        assert resp.status_code == 200
        assert resp.json()["request_id"] == req_id
        assert resp.json()["status"] == "ACCEPTED"

    def test_technician_dashboard_stats(self):
        admin_token = _login_admin()
        cust_token = _register_customer()
        tech_token, tech_id = _register_technician()

        # Check stats initially
        resp = client.get("/api/v1/technicians/dashboard", headers=_auth_header(tech_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["assigned_count"] == 0
        assert data["active_count"] == 0
        assert data["total_completed"] == 0

        # Create and assign request
        sr_resp = _create_request(cust_token)
        req_id = sr_resp.json()["request_id"]
        client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(admin_token),
        )

        # Should show 1 assigned
        resp = client.get("/api/v1/technicians/dashboard", headers=_auth_header(tech_token))
        assert resp.json()["assigned_count"] == 1
        assert resp.json()["active_count"] == 0

        # Transition to EN_ROUTE
        client.post(f"/api/v1/service-requests/{req_id}/status", json={"status": "ACCEPTED"}, headers=_auth_header(tech_token))
        client.post(f"/api/v1/service-requests/{req_id}/status", json={"status": "EN_ROUTE"}, headers=_auth_header(tech_token))

        # Should show 0 assigned, 1 active
        resp = client.get("/api/v1/technicians/dashboard", headers=_auth_header(tech_token))
        assert resp.json()["assigned_count"] == 0
        assert resp.json()["active_count"] == 1
