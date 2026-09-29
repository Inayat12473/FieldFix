"""
Shared test configuration — provides a single in-memory SQLite database
and test client for all test modules.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database.session import Base, get_db
from app.models.user import Role, RoleName, User
from app.models.service import ServiceCategory
from app.core.security import hash_password


SQLALCHEMY_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables and seed roles/categories before each test, drop after."""
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    # Seed roles
    for role_name in RoleName:
        existing = db.query(Role).filter(Role.name == role_name).first()
        if not existing:
            db.add(Role(name=role_name, description=f"{role_name.value} role"))
    db.flush()

    # Seed test category
    existing_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Air Conditioning").first()
    if not existing_cat:
        db.add(ServiceCategory(name="Air Conditioning", description="AC services", icon="snowflake"))
    db.flush()

    # Seed default admin user
    admin_role = db.query(Role).filter(Role.name == RoleName.ADMIN).first()
    existing_admin = db.query(User).filter(User.email == "admin@test.com").first()
    if not existing_admin and admin_role:
        db.add(User(
            email="admin@test.com",
            password_hash=hash_password("Admin@123"),
            full_name="System Admin",
            phone="+91-9800000001",
            role_id=admin_role.id,
        ))

    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)
