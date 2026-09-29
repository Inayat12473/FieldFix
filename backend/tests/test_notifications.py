"""
Phase 5 tests — Notification management, push token registration, and event triggers.
Uses shared conftest.py for test setup.
"""

import pytest
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
        "email": "cust_notif@test.com",
        "password": "Cust@123",
        "full_name": "Notif Customer",
        "role": "customer",
    })
    return resp.json()["access_token"]


def _register_technician() -> tuple[str, int]:
    resp = client.post("/api/v1/auth/register", json={
        "email": "tech_notif@test.com",
        "password": "Tech@123",
        "full_name": "Notif Tech",
        "role": "technician",
    })
    token = resp.json()["access_token"]
    profile_resp = client.get("/api/v1/technicians/me", headers=_auth_header(token))
    tech_id = profile_resp.json()["id"]
    return token, tech_id


class TestPushTokenRegistration:
    """Push token lifecycle tests."""

    def test_register_push_token(self):
        token = _register_customer()

        resp = client.post(
            "/api/v1/notifications/push-token",
            json={"token": "ExponentPushToken[xxxxxxxxxxxx]", "device_type": "android"},
            headers=_auth_header(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "registered"
        assert data["token"] == "ExponentPushToken[xxxxxxxxxxxx]"

    def test_update_existing_push_token(self):
        token = _register_customer()

        # Register token
        client.post(
            "/api/v1/notifications/push-token",
            json={"token": "ExponentPushToken[duplicate-token-test]", "device_type": "android"},
            headers=_auth_header(token),
        )

        # Register same token again with different device type
        resp = client.post(
            "/api/v1/notifications/push-token",
            json={"token": "ExponentPushToken[duplicate-token-test]", "device_type": "ios"},
            headers=_auth_header(token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "updated"

    def test_unregister_push_token(self):
        token = _register_customer()

        client.post(
            "/api/v1/notifications/push-token",
            json={"token": "ExponentPushToken[unregister-token-test]", "device_type": "ios"},
            headers=_auth_header(token),
        )

        resp = client.request(
            "DELETE",
            "/api/v1/notifications/push-token",
            json={"token": "ExponentPushToken[unregister-token-test]"},
            headers=_auth_header(token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "unregistered"


class TestNotificationInbox:
    """In-app notification listing and read status tests."""

    def test_notification_created_on_assignment_and_status_changes(self):
        admin_token = _login_admin()
        cust_token = _register_customer()
        tech_token, tech_id = _register_technician()

        # Customer registers push token
        client.post(
            "/api/v1/notifications/push-token",
            json={"token": "ExponentPushToken[cust-device-token]", "device_type": "android"},
            headers=_auth_header(cust_token),
        )

        # Technician registers push token
        client.post(
            "/api/v1/notifications/push-token",
            json={"token": "ExponentPushToken[tech-device-token]", "device_type": "android"},
            headers=_auth_header(tech_token),
        )

        # Create service request
        sr_resp = client.post("/api/v1/service-requests", json={
            "category_id": 1,
            "title": "AC Compressor Replacement",
            "description": "Commercial inverter compressor damaged after power surge.",
            "priority": "URGENT",
            "location_address": "Tech Park Tower 3",
        }, headers=_auth_header(cust_token))
        req_id = sr_resp.json()["request_id"]

        # Admin assigns technician -> both tech and customer get notifications
        client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(admin_token),
        )

        # Verify technician received notification
        tech_notifs_resp = client.get("/api/v1/notifications", headers=_auth_header(tech_token))
        assert tech_notifs_resp.status_code == 200
        tech_notifs = tech_notifs_resp.json()
        assert len(tech_notifs) >= 1
        assert "New Job Assigned" in tech_notifs[0]["title"]
        assert tech_notifs[0]["is_read"] is False

        # Verify customer received notification
        cust_notifs_resp = client.get("/api/v1/notifications", headers=_auth_header(cust_token))
        assert cust_notifs_resp.status_code == 200
        cust_notifs = cust_notifs_resp.json()
        assert len(cust_notifs) >= 1
        assert "Technician Assigned" in cust_notifs[0]["title"]

    def test_mark_as_read(self):
        admin_token = _login_admin()
        cust_token = _register_customer()
        _, tech_id = _register_technician()

        # Trigger a notification
        sr_resp = client.post("/api/v1/service-requests", json={
            "category_id": 1,
            "title": "Elevator sensor issue",
            "description": "Door sensor sticking on 4th floor.",
            "priority": "HIGH",
            "location_address": "Building C",
        }, headers=_auth_header(cust_token))
        req_id = sr_resp.json()["request_id"]
        client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(admin_token),
        )

        # Fetch notifications
        notifs = client.get("/api/v1/notifications", headers=_auth_header(cust_token)).json()
        notif_id = notifs[0]["id"]
        assert notifs[0]["is_read"] is False

        # Mark as read
        patch_resp = client.patch(
            f"/api/v1/notifications/{notif_id}/read",
            headers=_auth_header(cust_token),
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["is_read"] is True

        # Check unread only filter
        unread_resp = client.get(
            "/api/v1/notifications?unread_only=true",
            headers=_auth_header(cust_token),
        )
        assert unread_resp.status_code == 200
        unread_ids = [n["id"] for n in unread_resp.json()]
        assert notif_id not in unread_ids

    def test_mark_all_read(self):
        admin_token = _login_admin()
        cust_token = _register_customer()
        _, tech_id = _register_technician()

        # Trigger notifications
        sr_resp = client.post("/api/v1/service-requests", json={
            "category_id": 1,
            "title": "Chiller maintenance",
            "description": "Routine quarterly maintenance check.",
            "priority": "MEDIUM",
            "location_address": "Basement plant room",
        }, headers=_auth_header(cust_token))
        req_id = sr_resp.json()["request_id"]
        client.post(
            f"/api/v1/service-requests/{req_id}/assign",
            json={"technician_id": tech_id},
            headers=_auth_header(admin_token),
        )

        # Call mark-all-read
        read_all_resp = client.post("/api/v1/notifications/read-all", headers=_auth_header(cust_token))
        assert read_all_resp.status_code == 204

        # Verify no unread notifications remain
        unread_resp = client.get("/api/v1/notifications?unread_only=true", headers=_auth_header(cust_token))
        assert unread_resp.status_code == 200
        assert len(unread_resp.json()) == 0
