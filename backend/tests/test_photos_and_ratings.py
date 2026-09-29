"""
Phase 6 tests — Photo upload/management and Customer rating & review system.
Uses shared conftest.py for test database and client fixtures.
"""

import io
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


def _register_user(email: str, name: str, role: str) -> str:
    resp = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password@123",
        "full_name": name,
        "role": role,
    })
    return resp.json()["access_token"]


def _create_and_assign_request(customer_token: str, admin_token: str, tech_id: int) -> str:
    """Helper: Creates a request and assigns it to technician."""
    create_resp = client.post(
        "/api/v1/service-requests",
        json={
            "category_id": 1,
            "title": "HVAC compressor fault",
            "description": "Loud noise and refrigerant leak detected",
            "priority": "HIGH",
            "location_address": "88 Industrial Blvd, Sector 4",
            "location_lat": 37.7749,
            "location_lng": -122.4194,
        },
        headers=_auth_header(customer_token),
    )
    req_id = create_resp.json()["request_id"]

    # Assign technician
    client.post(
        f"/api/v1/service-requests/{req_id}/assign",
        json={"technician_id": tech_id},
        headers=_auth_header(admin_token),
    )
    return req_id


class TestPhotoUploadAndManagement:
    """Test photo upload, validation, filtering, and deletion."""

    def test_customer_upload_issue_photo(self):
        cust_token = _register_user("cust_photo1@test.com", "Photo Cust 1", "customer")
        admin_token = _login_admin()

        # Create tech
        tech_token = _register_user("tech_photo1@test.com", "Photo Tech 1", "technician")
        tech_profile = client.get("/api/v1/technicians/me", headers=_auth_header(tech_token)).json()

        req_id = _create_and_assign_request(cust_token, admin_token, tech_profile["id"])

        # Upload valid image
        fake_image = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"0" * 200)
        resp = client.post(
            f"/api/v1/service-requests/{req_id}/photos",
            files={"photo": ("damage.jpg", fake_image, "image/jpeg")},
            data={"photo_type": "issue", "caption": "Leaking valve area"},
            headers=_auth_header(cust_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["photo_type"] == "issue"
        assert data["file_name"] == "damage.jpg"
        assert data["caption"] == "Leaking valve area"
        assert data["file_url"].startswith("/uploads/")
        assert data["file_size"] > 0
        assert data["uploaded_by_name"] == "Photo Cust 1"

    def test_upload_invalid_file_extension(self):
        cust_token = _register_user("cust_photo2@test.com", "Photo Cust 2", "customer")
        admin_token = _login_admin()
        tech_token = _register_user("tech_photo2@test.com", "Photo Tech 2", "technician")
        tech_profile = client.get("/api/v1/technicians/me", headers=_auth_header(tech_token)).json()

        req_id = _create_and_assign_request(cust_token, admin_token, tech_profile["id"])

        fake_script = io.BytesIO(b"echo dangerous script")
        resp = client.post(
            f"/api/v1/service-requests/{req_id}/photos",
            files={"photo": ("exploit.exe", fake_script, "application/octet-stream")},
            data={"photo_type": "issue"},
            headers=_auth_header(cust_token),
        )
        assert resp.status_code == 400
        assert "Unsupported file type" in resp.json()["detail"]

    def test_technician_upload_before_and_after_photos(self):
        cust_token = _register_user("cust_photo3@test.com", "Photo Cust 3", "customer")
        admin_token = _login_admin()
        tech_token = _register_user("tech_photo3@test.com", "Photo Tech 3", "technician")
        tech_profile = client.get("/api/v1/technicians/me", headers=_auth_header(tech_token)).json()

        req_id = _create_and_assign_request(cust_token, admin_token, tech_profile["id"])

        # Upload "before" photo
        before_img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"1" * 150)
        resp1 = client.post(
            f"/api/v1/service-requests/{req_id}/photos",
            files={"photo": ("before_work.png", before_img, "image/png")},
            data={"photo_type": "before", "caption": "Pre-repair equipment condition"},
            headers=_auth_header(tech_token),
        )
        assert resp1.status_code == 201
        assert resp1.json()["photo_type"] == "before"

        # Upload "after" photo (triggers customer notification)
        after_img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"2" * 150)
        resp2 = client.post(
            f"/api/v1/service-requests/{req_id}/photos",
            files={"photo": ("after_work.png", after_img, "image/png")},
            data={"photo_type": "after", "caption": "Replaced valve and sealed pipes"},
            headers=_auth_header(tech_token),
        )
        assert resp2.status_code == 201
        assert resp2.json()["photo_type"] == "after"

        # Check customer received notification about completion photo
        notif_resp = client.get("/api/v1/notifications", headers=_auth_header(cust_token))
        assert notif_resp.status_code == 200
        notifs = notif_resp.json()
        assert any(n["notification_type"] == "PHOTO_UPLOADED" for n in notifs)

    def test_filter_and_delete_photo(self):
        cust_token = _register_user("cust_photo4@test.com", "Photo Cust 4", "customer")
        admin_token = _login_admin()
        tech_token = _register_user("tech_photo4@test.com", "Photo Tech 4", "technician")
        tech_profile = client.get("/api/v1/technicians/me", headers=_auth_header(tech_token)).json()

        req_id = _create_and_assign_request(cust_token, admin_token, tech_profile["id"])

        # Upload before and after
        img = io.BytesIO(b"testimagecontent" * 10)
        resp_before = client.post(
            f"/api/v1/service-requests/{req_id}/photos",
            files={"photo": ("test_b.jpg", img, "image/jpeg")},
            data={"photo_type": "before"},
            headers=_auth_header(tech_token),
        )
        photo_id = resp_before.json()["id"]

        # List all photos
        list_all = client.get(f"/api/v1/service-requests/{req_id}/photos", headers=_auth_header(cust_token))
        assert list_all.status_code == 200
        assert len(list_all.json()) >= 1

        # List filtered by photo_type
        list_before = client.get(
            f"/api/v1/service-requests/{req_id}/photos?photo_type=before",
            headers=_auth_header(cust_token),
        )
        assert list_before.status_code == 200
        assert all(p["photo_type"] == "before" for p in list_before.json())

        # Customer tries to delete technician's photo -> forbidden
        del_forbidden = client.delete(
            f"/api/v1/service-requests/{req_id}/photos/{photo_id}",
            headers=_auth_header(cust_token),
        )
        assert del_forbidden.status_code == 403

        # Technician deletes their own photo -> success
        del_success = client.delete(
            f"/api/v1/service-requests/{req_id}/photos/{photo_id}",
            headers=_auth_header(tech_token),
        )
        assert del_success.status_code == 200
        assert del_success.json()["message"] == "Photo deleted successfully"


class TestCustomerRatingAndReview:
    """Test customer rating submission, validation, and status transition."""

    def test_cannot_rate_uncompleted_request(self):
        cust_token = _register_user("cust_rate1@test.com", "Rating Cust 1", "customer")
        admin_token = _login_admin()
        tech_token = _register_user("tech_rate1@test.com", "Rating Tech 1", "technician")
        tech_profile = client.get("/api/v1/technicians/me", headers=_auth_header(tech_token)).json()

        req_id = _create_and_assign_request(cust_token, admin_token, tech_profile["id"])

        # Request is currently ASSIGNED, not COMPLETED
        resp = client.post(
            f"/api/v1/service-requests/{req_id}/rating",
            json={"rating": 5, "comment": "Great work!"},
            headers=_auth_header(cust_token),
        )
        assert resp.status_code == 400
        assert "must be completed first" in resp.json()["detail"].lower()

    def test_rate_completed_request_transitions_status(self):
        cust_token = _register_user("cust_rate2@test.com", "Rating Cust 2", "customer")
        admin_token = _login_admin()
        tech_token = _register_user("tech_rate2@test.com", "Rating Tech 2", "technician")
        tech_profile = client.get("/api/v1/technicians/me", headers=_auth_header(tech_token)).json()

        req_id = _create_and_assign_request(cust_token, admin_token, tech_profile["id"])

        # Progress request through workflow: ASSIGNED -> ACCEPTED -> EN_ROUTE -> IN_PROGRESS -> COMPLETED
        transitions = ["ACCEPTED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"]
        for s in transitions:
            tr_resp = client.post(
                f"/api/v1/service-requests/{req_id}/status",
                json={"status": s, "note": f"Moving to {s}"},
                headers=_auth_header(tech_token),
            )
            assert tr_resp.status_code == 200

        # Customer submits 5-star rating
        rating_resp = client.post(
            f"/api/v1/service-requests/{req_id}/rating",
            json={
                "rating": 5,
                "comment": "Outstanding service! Fixed the AC compressor quickly and left no mess.",
            },
            headers=_auth_header(cust_token),
        )
        assert rating_resp.status_code == 201
        data = rating_resp.json()
        assert data["rating"] == 5
        assert data["rated_by_name"] == "Rating Cust 2"
        assert data["technician_name"] == "Rating Tech 2"
        assert "Outstanding service" in data["comment"]

        # Check request status transitioned to CUSTOMER_CONFIRMED
        detail_resp = client.get(f"/api/v1/service-requests/{req_id}", headers=_auth_header(cust_token))
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["status"] == "CUSTOMER_CONFIRMED"
        assert detail["rating"] == 5
        assert detail["confirmed_at"] is not None

        # Check technician received notification
        notif_resp = client.get("/api/v1/notifications", headers=_auth_header(tech_token))
        assert notif_resp.status_code == 200
        notifs = notif_resp.json()
        assert any(n["notification_type"] == "RATING_RECEIVED" for n in notifs)

    def test_duplicate_rating_rejected(self):
        cust_token = _register_user("cust_rate3@test.com", "Rating Cust 3", "customer")
        admin_token = _login_admin()
        tech_token = _register_user("tech_rate3@test.com", "Rating Tech 3", "technician")
        tech_profile = client.get("/api/v1/technicians/me", headers=_auth_header(tech_token)).json()

        req_id = _create_and_assign_request(cust_token, admin_token, tech_profile["id"])

        for s in ["ACCEPTED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"]:
            client.post(
                f"/api/v1/service-requests/{req_id}/status",
                json={"status": s},
                headers=_auth_header(tech_token),
            )

        # First rating succeeds
        resp1 = client.post(
            f"/api/v1/service-requests/{req_id}/rating",
            json={"rating": 4, "comment": "Good job"},
            headers=_auth_header(cust_token),
        )
        assert resp1.status_code == 201

        # Second rating fails
        resp2 = client.post(
            f"/api/v1/service-requests/{req_id}/rating",
            json={"rating": 5, "comment": "Changing my mind to 5 stars"},
            headers=_auth_header(cust_token),
        )
        assert resp2.status_code == 400
        assert "already been rated" in resp2.json()["detail"].lower()

    def test_get_rating_endpoint(self):
        cust_token = _register_user("cust_rate4@test.com", "Rating Cust 4", "customer")
        admin_token = _login_admin()
        tech_token = _register_user("tech_rate4@test.com", "Rating Tech 4", "technician")
        tech_profile = client.get("/api/v1/technicians/me", headers=_auth_header(tech_token)).json()

        req_id = _create_and_assign_request(cust_token, admin_token, tech_profile["id"])

        # Check get rating before rating submitted -> returns None
        resp_none = client.get(f"/api/v1/service-requests/{req_id}/rating", headers=_auth_header(cust_token))
        assert resp_none.status_code == 200
        assert resp_none.json() is None

        # Progress and rate
        for s in ["ACCEPTED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"]:
            client.post(
                f"/api/v1/service-requests/{req_id}/status",
                json={"status": s},
                headers=_auth_header(tech_token),
            )

        client.post(
            f"/api/v1/service-requests/{req_id}/rating",
            json={"rating": 5, "comment": "Flawless repair"},
            headers=_auth_header(cust_token),
        )

        # Now get rating returns the details
        resp_rated = client.get(f"/api/v1/service-requests/{req_id}/rating", headers=_auth_header(cust_token))
        assert resp_rated.status_code == 200
        assert resp_rated.json()["rating"] == 5
        assert resp_rated.json()["comment"] == "Flawless repair"
