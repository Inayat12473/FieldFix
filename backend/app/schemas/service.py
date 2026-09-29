"""
Pydantic schemas for service requests, status history, and related entities.
"""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


# ─── Service Category Schemas ──────────────────────────────

class ServiceCategoryResponse(BaseModel):
    """Schema for service category in API responses."""
    id: int
    name: str
    description: str | None = None
    icon: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


# ─── Service Request Schemas ───────────────────────────────

class ServiceRequestCreate(BaseModel):
    """Schema for creating a new service request."""
    category_id: int
    title: str = Field(..., min_length=5, max_length=255)
    description: str = Field(..., min_length=10, max_length=2000)
    priority: str = Field(default="MEDIUM", pattern="^(LOW|MEDIUM|HIGH|URGENT)$")
    location_address: str = Field(..., min_length=5, max_length=500)
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class ServiceRequestUpdate(BaseModel):
    """Schema for updating a service request (customer)."""
    title: Optional[str] = Field(None, min_length=5, max_length=255)
    description: Optional[str] = Field(None, min_length=10, max_length=2000)
    priority: Optional[str] = Field(None, pattern="^(LOW|MEDIUM|HIGH|URGENT)$")
    location_address: Optional[str] = Field(None, min_length=5, max_length=500)
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class StatusUpdateRequest(BaseModel):
    """Schema for updating service request status."""
    status: str
    note: Optional[str] = Field(None, max_length=500)


class StatusHistoryResponse(BaseModel):
    """Schema for status history entries."""
    id: int
    from_status: Optional[str] = None
    to_status: str
    changed_by_name: str
    note: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


class ServiceRequestResponse(BaseModel):
    """Schema for service request in API responses."""
    id: int
    request_id: str
    customer_id: int
    customer_name: str
    category_id: int
    category_name: str
    category_icon: Optional[str] = None
    title: str
    description: str
    priority: str
    status: str
    location_address: str
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    assigned_technician_id: Optional[int] = None
    assigned_technician_name: Optional[str] = None
    assigned_technician_phone: Optional[str] = None
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None
    confirmed_at: Optional[str] = None

    model_config = {"from_attributes": True}


class ServiceRequestDetailResponse(ServiceRequestResponse):
    """Detailed response including status history."""
    status_history: List[StatusHistoryResponse] = []
    note_count: int = 0
    photo_count: int = 0
    rating: Optional[int] = None


class ServiceRequestListResponse(BaseModel):
    """Paginated list of service requests."""
    items: List[ServiceRequestResponse]
    total: int
    page: int
    per_page: int


# ─── Service Note Schemas ──────────────────────────────────

class ServiceNoteCreate(BaseModel):
    """Schema for creating a service note."""
    content: str = Field(..., min_length=1, max_length=2000)


class ServiceNoteResponse(BaseModel):
    """Schema for service note in API responses."""
    id: int
    service_request_id: int
    author_id: int
    author_name: str
    content: str
    created_at: str

    model_config = {"from_attributes": True}


# ─── Notification Schemas ──────────────────────────────────

class NotificationResponse(BaseModel):
    """Schema for notification in API responses."""
    id: int
    title: str
    message: str
    notification_type: str
    reference_id: Optional[int] = None
    is_read: bool
    created_at: str

    model_config = {"from_attributes": True}


# ─── Photo Schemas ──────────────────────────────────────────

class ServicePhotoResponse(BaseModel):
    """Schema for photo in API responses."""
    id: int
    service_request_id: int
    uploaded_by_id: int
    uploaded_by_name: str
    photo_type: str
    file_name: str
    file_url: str
    file_size: Optional[int] = None
    caption: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


# ─── Rating Schemas ─────────────────────────────────────────

class ServiceRatingCreate(BaseModel):
    """Schema for submitting a customer rating & review."""
    rating: int = Field(..., ge=1, le=5, description="Star rating between 1 and 5")
    comment: Optional[str] = Field(None, max_length=2000, description="Optional written review")


class ServiceRatingResponse(BaseModel):
    """Schema for rating in API responses."""
    id: int
    service_request_id: int
    rated_by_id: int
    rated_by_name: str
    technician_id: Optional[int] = None
    technician_name: Optional[str] = None
    rating: int
    comment: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


# ─── Dashboard Stats ───────────────────────────────────────

class CustomerDashboardStats(BaseModel):
    """Stats for customer dashboard."""
    total_requests: int = 0
    open_requests: int = 0
    assigned_requests: int = 0
    in_progress_requests: int = 0
    completed_requests: int = 0
    unread_notifications: int = 0
