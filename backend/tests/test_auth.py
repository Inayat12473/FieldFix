"""
Phase 1 tests — Authentication and user management.
Uses shared conftest.py for test setup.
"""

from tests.conftest import client


class TestHealthCheck:
    """Health check endpoint tests."""

    def test_root(self):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "FieldFix API"
        assert data["status"] == "running"

    def test_health(self):
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_admin_dashboard_served(self):
        response = client.get("/admin/")
        assert response.status_code == 200
        assert "FieldFix" in response.text
        assert "Dispatcher Console" in response.text


class TestRegistration:
    """User registration tests."""

    def test_register_customer(self):
        response = client.post("/api/v1/auth/register", json={
            "email": "test@example.com",
            "password": "Test@123",
            "full_name": "Test User",
            "phone": "+91-9800000000",
            "role": "customer",
        })
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == "test@example.com"
        assert data["user"]["role"] == "customer"

    def test_register_duplicate_email(self):
        client.post("/api/v1/auth/register", json={
            "email": "dup@example.com",
            "password": "Test@123",
            "full_name": "Test User",
        })
        response = client.post("/api/v1/auth/register", json={
            "email": "dup@example.com",
            "password": "Test@123",
            "full_name": "Test User 2",
        })
        assert response.status_code == 409

    def test_register_invalid_email(self):
        response = client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "password": "Test@123",
            "full_name": "Test User",
        })
        assert response.status_code == 422

    def test_register_short_password(self):
        response = client.post("/api/v1/auth/register", json={
            "email": "short@example.com",
            "password": "123",
            "full_name": "Test User",
        })
        assert response.status_code == 422

    def test_register_missing_name(self):
        response = client.post("/api/v1/auth/register", json={
            "email": "noname@example.com",
            "password": "Test@123",
        })
        assert response.status_code == 422


class TestLogin:
    """Login tests."""

    def _create_user(self):
        client.post("/api/v1/auth/register", json={
            "email": "login@example.com",
            "password": "Login@123",
            "full_name": "Login User",
        })

    def test_login_success(self):
        self._create_user()
        response = client.post("/api/v1/auth/login", json={
            "email": "login@example.com",
            "password": "Login@123",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self):
        self._create_user()
        response = client.post("/api/v1/auth/login", json={
            "email": "login@example.com",
            "password": "WrongPass",
        })
        assert response.status_code == 401

    def test_login_nonexistent_user(self):
        response = client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "Test@123",
        })
        assert response.status_code == 401


class TestAuthMe:
    """Protected /auth/me endpoint tests."""

    def _get_token(self) -> str:
        client.post("/api/v1/auth/register", json={
            "email": "me@example.com",
            "password": "Me@12345",
            "full_name": "Me User",
        })
        resp = client.post("/api/v1/auth/login", json={
            "email": "me@example.com",
            "password": "Me@12345",
        })
        return resp.json()["access_token"]

    def test_get_me(self):
        token = self._get_token()
        response = client.get("/api/v1/auth/me", headers={
            "Authorization": f"Bearer {token}",
        })
        assert response.status_code == 200
        assert response.json()["email"] == "me@example.com"

    def test_get_me_no_token(self):
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401

    def test_get_me_invalid_token(self):
        response = client.get("/api/v1/auth/me", headers={
            "Authorization": "Bearer invalid-token-abc",
        })
        assert response.status_code == 401

    def test_update_profile(self):
        token = self._get_token()
        response = client.patch("/api/v1/auth/me",
            json={"full_name": "Updated Name", "phone": "+91-1234567890"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert response.json()["full_name"] == "Updated Name"
