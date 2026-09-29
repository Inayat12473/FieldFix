"""
User and Role database models.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
)
from sqlalchemy.orm import relationship

from app.database.session import Base


class RoleName(str, enum.Enum):
    """Enumeration of valid user roles."""
    CUSTOMER = "customer"
    TECHNICIAN = "technician"
    ADMIN = "admin"


class Role(Base):
    """Role model — defines user roles (customer, technician, admin)."""
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Enum(RoleName), unique=True, nullable=False)
    description = Column(String(255), nullable=True)

    # Relationships
    users = relationship("User", back_populates="role")

    def __repr__(self):
        return f"<Role(id={self.id}, name={self.name})>"


class User(Base):
    """
    User model — stores all user accounts.
    Role determines whether user is a customer, technician, or admin.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    avatar_url = Column(String(500), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    role = relationship("Role", back_populates="users")
    technician_profile = relationship(
        "TechnicianProfile", back_populates="user", uselist=False
    )

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role_id})>"
