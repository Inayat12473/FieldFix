"""
Service Request and related database models.
Handles the full lifecycle of a maintenance service request.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey,
    Float, Text, Enum
)
from sqlalchemy.orm import relationship

from app.database.session import Base


class ServiceCategory(Base):
    """
    Service category model — defines types of service (AC, Elevator, etc.)
    Used for matching technicians to service requests.
    """
    __tablename__ = "service_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)  # Icon name for mobile display
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    def __repr__(self):
        return f"<ServiceCategory(id={self.id}, name={self.name})>"

class RequestStatus(str, enum.Enum):
    """Valid service request statuses in workflow order."""
    NEW = "NEW"
    ASSIGNED = "ASSIGNED"
    ACCEPTED = "ACCEPTED"
    EN_ROUTE = "EN_ROUTE"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CUSTOMER_CONFIRMED = "CUSTOMER_CONFIRMED"
    CLOSED = "CLOSED"


class Priority(str, enum.Enum):
    """Service request priority levels."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


# Valid status transitions — enforced by the API
VALID_TRANSITIONS = {
    RequestStatus.NEW: [RequestStatus.ASSIGNED],
    RequestStatus.ASSIGNED: [RequestStatus.ACCEPTED, RequestStatus.NEW],  # Technician can reject → back to NEW
    RequestStatus.ACCEPTED: [RequestStatus.EN_ROUTE],
    RequestStatus.EN_ROUTE: [RequestStatus.IN_PROGRESS],
    RequestStatus.IN_PROGRESS: [RequestStatus.COMPLETED],
    RequestStatus.COMPLETED: [RequestStatus.CUSTOMER_CONFIRMED],
    RequestStatus.CUSTOMER_CONFIRMED: [RequestStatus.CLOSED],
    RequestStatus.CLOSED: [],
}


class ServiceRequest(Base):
    """
    Service Request — the core entity of the application.
    Tracks a maintenance request from creation through completion.
    """
    __tablename__ = "service_requests"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(20), unique=True, nullable=False, index=True)  # SR-1001
    customer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("service_categories.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(Enum(Priority), nullable=False, default=Priority.MEDIUM)
    status = Column(Enum(RequestStatus), nullable=False, default=RequestStatus.NEW)

    # Location
    location_address = Column(String(500), nullable=False)
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)

    # Assignment
    assigned_technician_id = Column(Integer, ForeignKey("technician_profiles.id"), nullable=True)

    # Timestamps
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
    completed_at = Column(DateTime(timezone=True), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    customer = relationship("User", foreign_keys=[customer_id])
    category = relationship("ServiceCategory")
    assigned_technician = relationship("TechnicianProfile", foreign_keys=[assigned_technician_id])
    status_history = relationship(
        "StatusHistory", back_populates="service_request",
        order_by="StatusHistory.created_at", cascade="all, delete-orphan"
    )
    photos = relationship(
        "ServicePhoto", back_populates="service_request",
        order_by="ServicePhoto.created_at", cascade="all, delete-orphan"
    )
    notes = relationship(
        "ServiceNote", back_populates="service_request",
        order_by="ServiceNote.created_at", cascade="all, delete-orphan"
    )
    rating = relationship(
        "ServiceRating", back_populates="service_request", uselist=False
    )

    def __repr__(self):
        return f"<ServiceRequest(id={self.id}, request_id={self.request_id}, status={self.status})>"


class StatusHistory(Base):
    """
    Tracks every status change of a service request.
    Creates an audit trail of the request lifecycle.
    """
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    service_request_id = Column(Integer, ForeignKey("service_requests.id"), nullable=False)
    from_status = Column(Enum(RequestStatus), nullable=True)  # null for initial creation
    to_status = Column(Enum(RequestStatus), nullable=False)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    service_request = relationship("ServiceRequest", back_populates="status_history")
    changed_by = relationship("User")

    def __repr__(self):
        return f"<StatusHistory(request={self.service_request_id}, {self.from_status}→{self.to_status})>"


class ServicePhoto(Base):
    """
    Photos attached to service requests.
    Supports before-service and after-service photos.
    """
    __tablename__ = "service_photos"

    id = Column(Integer, primary_key=True, index=True)
    service_request_id = Column(Integer, ForeignKey("service_requests.id"), nullable=False)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    photo_type = Column(String(20), nullable=False)  # "before", "after", "issue"
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=True)  # bytes
    caption = Column(String(500), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    service_request = relationship("ServiceRequest", back_populates="photos")
    uploaded_by = relationship("User")

    def __repr__(self):
        return f"<ServicePhoto(id={self.id}, type={self.photo_type})>"


class ServiceNote(Base):
    """
    Notes added to service requests by technicians or customers.
    """
    __tablename__ = "service_notes"

    id = Column(Integer, primary_key=True, index=True)
    service_request_id = Column(Integer, ForeignKey("service_requests.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    service_request = relationship("ServiceRequest", back_populates="notes")
    author = relationship("User")

    def __repr__(self):
        return f"<ServiceNote(id={self.id}, request={self.service_request_id})>"


class ServiceRating(Base):
    """
    Customer rating and feedback after service completion.
    """
    __tablename__ = "service_ratings"

    id = Column(Integer, primary_key=True, index=True)
    service_request_id = Column(Integer, ForeignKey("service_requests.id"), unique=True, nullable=False)
    rated_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    technician_id = Column(Integer, ForeignKey("technician_profiles.id"), nullable=True)
    rating = Column(Integer, nullable=False)  # 1-5
    comment = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    service_request = relationship("ServiceRequest", back_populates="rating")
    rated_by = relationship("User")
    technician = relationship("TechnicianProfile")

    def __repr__(self):
        return f"<ServiceRating(request={self.service_request_id}, rating={self.rating})>"


class Notification(Base):
    """
    In-app notifications for users.
    """
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), nullable=False)  # "assignment", "status_update", "rating"
    reference_id = Column(Integer, nullable=True)  # service_request_id
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    user = relationship("User")

    def __repr__(self):
        return f"<Notification(id={self.id}, user={self.user_id}, read={self.is_read})>"


class DeviceToken(Base):
    """
    Device push tokens for Expo/FCM push notifications.
    """
    __tablename__ = "device_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String(255), unique=True, nullable=False, index=True)
    device_type = Column(String(50), default="mobile", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user = relationship("User")

    def __repr__(self):
        return f"<DeviceToken(user={self.user_id}, token={self.token[:15]}...)>"

