"""
Pydantic schemas for location updates and live technician tracking.
"""

from typing import Optional
from pydantic import BaseModel, Field


class LocationPing(BaseModel):
    """Schema for a technician sending GPS coordinates."""
    lat: float = Field(..., ge=-90.0, le=90.0, description="Latitude")
    lng: float = Field(..., ge=-180.0, le=180.0, description="Longitude")


class TrackingInfoResponse(BaseModel):
    """Schema for live technician tracking info on a service request."""
    service_request_id: str
    status: str
    is_en_route: bool
    technician_name: Optional[str] = None
    technician_phone: Optional[str] = None
    technician_lat: Optional[float] = None
    technician_lng: Optional[float] = None
    last_location_update: Optional[str] = None
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    destination_address: str
    distance_km: Optional[float] = None
    estimated_duration_minutes: Optional[int] = None
