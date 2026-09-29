"""
Technician API routes.
Handles technician profiles, skills, status toggles, dashboard metrics, and active jobs.
"""

from typing import Optional, List
from datetime import datetime, timezone, date

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc

from app.database.session import get_db
from app.models.user import User, RoleName
from app.models.technician import TechnicianProfile, TechnicianSkill
from app.models.service import (
    ServiceRequest, StatusHistory, ServiceRating,
    RequestStatus,
)
from app.schemas.technician import (
    TechnicianProfileResponse,
    TechnicianSkillResponse,
    TechnicianStatusUpdate,
    TechnicianDashboardStats,
)
from app.schemas.service import ServiceRequestDetailResponse
from app.schemas.location import LocationPing
from app.api.dependencies import get_current_user, require_roles
from app.api.routes.service_requests import _build_detail_response

router = APIRouter(prefix="/technicians", tags=["Technicians"])


def _build_technician_response(tech: TechnicianProfile, db: Session) -> TechnicianProfileResponse:
    """Build a detailed TechnicianProfileResponse."""
    completed_count = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.assigned_technician_id == tech.id,
            ServiceRequest.status.in_([
                RequestStatus.COMPLETED,
                RequestStatus.CUSTOMER_CONFIRMED,
                RequestStatus.CLOSED,
            ]),
        )
        .count()
    )

    avg_rating = (
        db.query(func.avg(ServiceRating.rating))
        .filter(ServiceRating.technician_id == tech.id)
        .scalar()
    )

    skills_response = [
        TechnicianSkillResponse(
            id=s.id,
            category_id=s.category_id,
            category_name=s.category.name if s.category else "",
            proficiency_level=s.proficiency_level,
        )
        for s in tech.skills
    ]

    return TechnicianProfileResponse(
        id=tech.id,
        user_id=tech.user_id,
        employee_id=tech.employee_id,
        full_name=tech.user.full_name if tech.user else "",
        email=tech.user.email if tech.user else "",
        phone=tech.user.phone if tech.user else None,
        is_available=tech.is_available,
        current_lat=tech.current_lat,
        current_lng=tech.current_lng,
        last_location_update=tech.last_location_update.isoformat() if tech.last_location_update else None,
        skills=skills_response,
        completed_jobs_count=completed_count,
        average_rating=round(float(avg_rating), 1) if avg_rating is not None else 5.0,
    )


@router.get("", response_model=List[TechnicianProfileResponse])
def list_technicians(
    category_id: Optional[int] = Query(None, description="Filter by service category skill"),
    available_only: bool = Query(False, description="Filter only available technicians"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List technicians with optional filtering by skill category and availability.
    Accessible to authenticated users.
    """
    query = (
        db.query(TechnicianProfile)
        .options(
            joinedload(TechnicianProfile.user),
            joinedload(TechnicianProfile.skills).joinedload(TechnicianSkill.category),
        )
    )

    if available_only:
        query = query.filter(TechnicianProfile.is_available == True)

    if category_id:
        query = query.join(TechnicianSkill).filter(TechnicianSkill.category_id == category_id)

    technicians = query.all()
    return [_build_technician_response(tech, db) for tech in technicians]


@router.get("/me", response_model=TechnicianProfileResponse)
def get_my_technician_profile(
    current_user: User = Depends(require_roles([RoleName.TECHNICIAN])),
    db: Session = Depends(get_db),
):
    """Get the current technician's profile, skills, and stats."""
    tech = (
        db.query(TechnicianProfile)
        .options(
            joinedload(TechnicianProfile.user),
            joinedload(TechnicianProfile.skills).joinedload(TechnicianSkill.category),
        )
        .filter(TechnicianProfile.user_id == current_user.id)
        .first()
    )

    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Technician profile not found",
        )

    return _build_technician_response(tech, db)


@router.patch("/me/status", response_model=TechnicianProfileResponse)
def update_technician_status(
    updates: TechnicianStatusUpdate,
    current_user: User = Depends(require_roles([RoleName.TECHNICIAN])),
    db: Session = Depends(get_db),
):
    """Update technician availability status and GPS coordinates."""
    tech = (
        db.query(TechnicianProfile)
        .options(
            joinedload(TechnicianProfile.user),
            joinedload(TechnicianProfile.skills).joinedload(TechnicianSkill.category),
        )
        .filter(TechnicianProfile.user_id == current_user.id)
        .first()
    )

    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Technician profile not found",
        )

    if updates.is_available is not None:
        tech.is_available = updates.is_available

    if updates.current_lat is not None:
        tech.current_lat = updates.current_lat
        tech.last_location_update = datetime.now(timezone.utc)

    if updates.current_lng is not None:
        tech.current_lng = updates.current_lng
        tech.last_location_update = datetime.now(timezone.utc)

    db.commit()
    db.refresh(tech)

    return _build_technician_response(tech, db)


@router.get("/dashboard", response_model=TechnicianDashboardStats)
def get_technician_dashboard_stats(
    current_user: User = Depends(require_roles([RoleName.TECHNICIAN])),
    db: Session = Depends(get_db),
):
    """Get KPI stats for technician dashboard."""
    tech = (
        db.query(TechnicianProfile)
        .filter(TechnicianProfile.user_id == current_user.id)
        .first()
    )

    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Technician profile not found",
        )

    # Assigned count
    assigned_count = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.assigned_technician_id == tech.id,
            ServiceRequest.status == RequestStatus.ASSIGNED,
        )
        .count()
    )

    # Active count (Accepted, En Route, In Progress)
    active_count = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.assigned_technician_id == tech.id,
            ServiceRequest.status.in_([
                RequestStatus.ACCEPTED,
                RequestStatus.EN_ROUTE,
                RequestStatus.IN_PROGRESS,
            ]),
        )
        .count()
    )

    # Completed total
    total_completed = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.assigned_technician_id == tech.id,
            ServiceRequest.status.in_([
                RequestStatus.COMPLETED,
                RequestStatus.CUSTOMER_CONFIRMED,
                RequestStatus.CLOSED,
            ]),
        )
        .count()
    )

    # Completed today
    today = date.today()
    completed_today = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.assigned_technician_id == tech.id,
            ServiceRequest.status.in_([
                RequestStatus.COMPLETED,
                RequestStatus.CUSTOMER_CONFIRMED,
                RequestStatus.CLOSED,
            ]),
            func.date(ServiceRequest.completed_at) == today,
        )
        .count()
    )

    # Rating
    avg_rating = (
        db.query(func.avg(ServiceRating.rating))
        .filter(ServiceRating.technician_id == tech.id)
        .scalar()
    )

    return TechnicianDashboardStats(
        assigned_count=assigned_count,
        active_count=active_count,
        completed_today=completed_today,
        total_completed=total_completed,
        is_available=tech.is_available,
        average_rating=round(float(avg_rating), 1) if avg_rating is not None else 5.0,
    )


@router.get("/active-job", response_model=Optional[ServiceRequestDetailResponse])
def get_technician_active_job(
    current_user: User = Depends(require_roles([RoleName.TECHNICIAN])),
    db: Session = Depends(get_db),
):
    """
    Get current active job for the technician.
    Priority: IN_PROGRESS > EN_ROUTE > ACCEPTED.
    """
    tech = (
        db.query(TechnicianProfile)
        .filter(TechnicianProfile.user_id == current_user.id)
        .first()
    )

    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Technician profile not found",
        )

    # Look for IN_PROGRESS or EN_ROUTE
    sr = (
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.customer),
            joinedload(ServiceRequest.category),
            joinedload(ServiceRequest.assigned_technician).joinedload(TechnicianProfile.user),
            joinedload(ServiceRequest.status_history).joinedload(StatusHistory.changed_by),
            joinedload(ServiceRequest.notes),
            joinedload(ServiceRequest.photos),
            joinedload(ServiceRequest.rating),
        )
        .filter(
            ServiceRequest.assigned_technician_id == tech.id,
            ServiceRequest.status.in_([RequestStatus.IN_PROGRESS, RequestStatus.EN_ROUTE]),
        )
        .first()
    )

    # If no in-progress/en-route, check for first accepted job
    if not sr:
        sr = (
            db.query(ServiceRequest)
            .options(
                joinedload(ServiceRequest.customer),
                joinedload(ServiceRequest.category),
                joinedload(ServiceRequest.assigned_technician).joinedload(TechnicianProfile.user),
                joinedload(ServiceRequest.status_history).joinedload(StatusHistory.changed_by),
                joinedload(ServiceRequest.notes),
                joinedload(ServiceRequest.photos),
                joinedload(ServiceRequest.rating),
            )
            .filter(
                ServiceRequest.assigned_technician_id == tech.id,
                ServiceRequest.status == RequestStatus.ACCEPTED,
            )
            .order_by(ServiceRequest.created_at.asc())
            .first()
        )

    if not sr:
        return None

    return _build_detail_response(sr)


@router.post("/me/location")
def update_technician_gps_location(
    ping: LocationPing,
    current_user: User = Depends(require_roles([RoleName.TECHNICIAN])),
    db: Session = Depends(get_db),
):
    """
    Lightweight GPS ping endpoint for technicians.
    Allows real-time location streaming.
    """
    tech = (
        db.query(TechnicianProfile)
        .filter(TechnicianProfile.user_id == current_user.id)
        .first()
    )

    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Technician profile not found",
        )

    tech.current_lat = ping.lat
    tech.current_lng = ping.lng
    tech.last_location_update = datetime.now(timezone.utc)

    db.commit()

    return {
        "status": "success",
        "lat": tech.current_lat,
        "lng": tech.current_lng,
        "last_location_update": tech.last_location_update.isoformat(),
    }

