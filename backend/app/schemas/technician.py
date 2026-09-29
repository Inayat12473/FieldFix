"""
Pydantic schemas for technician profiles, skills, and dashboard stats.
"""

from typing import Optional, List
from pydantic import BaseModel, Field


class TechnicianSkillResponse(BaseModel):
    """Schema for a technician's skill."""
    id: int
    category_id: int
    category_name: str
    proficiency_level: int

    model_config = {"from_attributes": True}


class TechnicianProfileResponse(BaseModel):
    """Schema for technician profile details."""
    id: int
    user_id: int
    employee_id: str
    full_name: str
    email: str
    phone: Optional[str] = None
    is_available: bool
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    last_location_update: Optional[str] = None
    skills: List[TechnicianSkillResponse] = []
    completed_jobs_count: int = 0
    average_rating: float = 5.0

    model_config = {"from_attributes": True}


class TechnicianStatusUpdate(BaseModel):
    """Schema for technician updating availability or location."""
    is_available: Optional[bool] = None
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None


class AssignTechnicianRequest(BaseModel):
    """Schema for assigning a technician to a service request."""
    technician_id: int = Field(..., description="TechnicianProfile ID to assign")


class TechnicianDashboardStats(BaseModel):
    """Schema for technician dashboard KPI metrics."""
    assigned_count: int = 0
    active_count: int = 0
    completed_today: int = 0
    total_completed: int = 0
    is_available: bool = True
    average_rating: float = 5.0
