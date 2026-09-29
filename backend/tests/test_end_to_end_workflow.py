"""
Complete End-to-End Enterprise Field Service Lifecycle Test.
Simulates the entire real-world workflow requested:
Customer reports issue → Request created → Admin assigns technician → Technician notified →
Technician travels (live GPS tracking + ETA) → En route to site → In-progress with notes/photos →
Job completed → Customer confirms & rates the service (5 stars) → Full audit verification.
"""

import io
import pytest
from tests.conftest import client


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestCompleteFieldServiceLifecycle:
    """Simulates the entire 16-step enterprise maintenance lifecycle."""

    def test_complete_field_service_journey(self):
        # ── Step 1: Customer Registration & Login ──
        cust_reg = client.post("/api/v1/auth/register", json={
            "email": "cust_lifecycle@fieldfix.com",
            "password": "Customer@123",
            "full_name": "Dr. Aris Thorne",
            "phone": "+91-9811002233",
            "role": "customer",
        })
        assert cust_reg.status_code == 201
        customer_token = cust_reg.json()["access_token"]
        customer_id = cust_reg.json()["user"]["id"]

        # ── Step 2: Technician Registration & Onboarding ──
        tech_reg = client.post("/api/v1/auth/register", json={
            "email": "tech_lifecycle@fieldfix.com",
            "password": "Tech@123",
            "full_name": "Marcus Vance",
            "phone": "+91-9822003344",
            "role": "technician",
        })
        assert tech_reg.status_code == 201
        tech_token = tech_reg.json()["access_token"]
        tech_profile = client.get("/api/v1/technicians/me", headers=_auth(tech_token)).json()
        tech_profile_id = tech_profile["id"]
        tech_user_id = tech_profile["user_id"]

        # ── Step 3: Admin Login ──
        admin_login = client.post("/api/v1/auth/login", json={
            "email": "admin@test.com",
            "password": "Admin@123",
        })
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["access_token"]

        # ── Step 4: Customer Creates Service Request ──
        create_resp = client.post(
            "/api/v1/service-requests",
            json={
                "category_id": 1,
                "title": "Industrial Chiller Compressor Overheating",
                "description": "AHU-4 compressor head temperature exceeding 95C. High pressure cutout tripped.",
                "priority": "HIGH",
                "location_address": "Tech Park Building 5, Sector 62, Noida",
                "location_lat": 28.6280,
                "location_lng": 77.3649,
            },
            headers=_auth(customer_token),
        )
        assert create_resp.status_code == 201
        sr_data = create_resp.json()
        request_id = sr_data["request_id"]
        assert sr_data["status"] == "NEW"
        assert sr_data["customer_name"] == "Dr. Aris Thorne"

        # ── Step 5: Admin Dispatches / Assigns Technician ──
        assign_resp = client.post(
            f"/api/v1/service-requests/{request_id}/assign",
            json={"technician_id": tech_profile_id},
            headers=_auth(admin_token),
        )
        assert assign_resp.status_code == 200
        assert assign_resp.json()["status"] == "ASSIGNED"
        assert assign_resp.json()["assigned_technician_name"] == "Marcus Vance"

        # ── Step 6: Technician Receives Notification ──
        tech_notifs = client.get("/api/v1/notifications", headers=_auth(tech_token)).json()
        assert any(n["notification_type"] == "assignment" for n in tech_notifs)

        # ── Step 7: Technician Accepts Job ──
        accept_resp = client.post(
            f"/api/v1/service-requests/{request_id}/status",
            json={"status": "ACCEPTED", "note": "Acknowledged. Preparing diagnostic gauges and spare valves."},
            headers=_auth(tech_token),
        )
        assert accept_resp.status_code == 200
        assert accept_resp.json()["status"] == "ACCEPTED"

        # ── Step 8: Technician Starts Travel (EN_ROUTE) & Pings GPS Location ──
        ping_resp = client.post(
            "/api/v1/technicians/me/location",
            json={"lat": 28.6139, "lng": 77.2090},
            headers=_auth(tech_token),
        )
        assert ping_resp.status_code == 200

        en_route_resp = client.post(
            f"/api/v1/service-requests/{request_id}/status",
            json={"status": "EN_ROUTE", "note": "Departed base station via express highway."},
            headers=_auth(tech_token),
        )
        assert en_route_resp.status_code == 200
        assert en_route_resp.json()["status"] == "EN_ROUTE"

        # ── Step 9: Customer Inspects Live GPS Tracking & ETA ──
        tracking_resp = client.get(
            f"/api/v1/service-requests/{request_id}/tracking",
            headers=_auth(customer_token),
        )
        assert tracking_resp.status_code == 200
        track_info = tracking_resp.json()
        assert track_info["is_en_route"] is True
        assert track_info["technician_name"] == "Marcus Vance"
        assert track_info["distance_km"] is not None
        assert track_info["estimated_duration_minutes"] is not None

        # ── Step 10: Technician Arrives On-Site & Starts Work (IN_PROGRESS) ──
        in_prog_resp = client.post(
            f"/api/v1/service-requests/{request_id}/status",
            json={"status": "IN_PROGRESS", "note": "Arrived on-site. Commencing system diagnostics."},
            headers=_auth(tech_token),
        )
        assert in_prog_resp.status_code == 200
        assert in_prog_resp.json()["status"] == "IN_PROGRESS"

        # ── Step 11: Technician Logs Field Note & Uploads Before Photo ──
        note_resp = client.post(
            f"/api/v1/service-requests/{request_id}/notes",
            json={"content": "Measured suction pressure 52 PSI, discharge 310 PSI. Thermal expansion valve sticking."},
            headers=_auth(tech_token),
        )
        assert note_resp.status_code == 201

        fake_before_img = io.BytesIO(b"\xff\xd8\xff\xe0" + b"before_photo_content" * 10)
        photo_before_resp = client.post(
            f"/api/v1/service-requests/{request_id}/photos",
            files={"photo": ("compressor_clogged.jpg", fake_before_img, "image/jpeg")},
            data={"photo_type": "before", "caption": "Initial state of clogged coil and expansion valve"},
            headers=_auth(tech_token),
        )
        assert photo_before_resp.status_code == 201
        assert photo_before_resp.json()["photo_type"] == "before"

        # ── Step 12: Technician Finishes Work, Uploads After Photo & Completes Job ──
        fake_after_img = io.BytesIO(b"\xff\xd8\xff\xe0" + b"after_photo_content" * 10)
        photo_after_resp = client.post(
            f"/api/v1/service-requests/{request_id}/photos",
            files={"photo": ("compressor_repaired.jpg", fake_after_img, "image/jpeg")},
            data={"photo_type": "after", "caption": "Replaced valve, cleared condenser coils, normalized 68 PSI"},
            headers=_auth(tech_token),
        )
        assert photo_after_resp.status_code == 201
        assert photo_after_resp.json()["photo_type"] == "after"

        complete_resp = client.post(
            f"/api/v1/service-requests/{request_id}/status",
            json={"status": "COMPLETED", "note": "Replaced thermal expansion valve and re-charged R410A refrigerant."},
            headers=_auth(tech_token),
        )
        assert complete_resp.status_code == 200
        assert complete_resp.json()["status"] == "COMPLETED"

        # ── Step 13: Customer Submits 5-Star Rating & Review ──
        rating_resp = client.post(
            f"/api/v1/service-requests/{request_id}/rating",
            json={
                "rating": 5,
                "comment": "Exceptional service by Marcus! Diagnosed the problem instantly and left the equipment room spotless.",
            },
            headers=_auth(customer_token),
        )
        assert rating_resp.status_code == 201
        rating_data = rating_resp.json()
        assert rating_data["rating"] == 5
        assert rating_data["technician_name"] == "Marcus Vance"
        assert "Exceptional service" in rating_data["comment"]

        # ── Step 14: Verify Automatic Status Transition to CUSTOMER_CONFIRMED ──
        final_detail = client.get(
            f"/api/v1/service-requests/{request_id}",
            headers=_auth(customer_token),
        ).json()
        assert final_detail["status"] == "CUSTOMER_CONFIRMED"
        assert final_detail["rating"] == 5
        assert final_detail["completed_at"] is not None
        assert final_detail["confirmed_at"] is not None
        assert len(final_detail["status_history"]) >= 6

        # ── Step 15: Technician Receives Review Notification ──
        tech_notifs_after = client.get("/api/v1/notifications", headers=_auth(tech_token)).json()
        assert any(n["notification_type"] == "RATING_RECEIVED" for n in tech_notifs_after)

        # ── Step 16: Admin Dispatcher Audit Verification ──
        admin_inspect = client.get(
            f"/api/v1/service-requests/{request_id}",
            headers=_auth(admin_token),
        ).json()
        assert admin_inspect["status"] == "CUSTOMER_CONFIRMED"
        assert admin_inspect["assigned_technician_name"] == "Marcus Vance"
        assert admin_inspect["rating"] == 5

        photos_list = client.get(
            f"/api/v1/service-requests/{request_id}/photos",
            headers=_auth(admin_token),
        ).json()
        assert len(photos_list) == 2
        types = {p["photo_type"] for p in photos_list}
        assert types == {"before", "after"}

        rating_inspect = client.get(
            f"/api/v1/service-requests/{request_id}/rating",
            headers=_auth(admin_token),
        ).json()
        assert rating_inspect["rating"] == 5
        assert rating_inspect["rated_by_name"] == "Dr. Aris Thorne"
