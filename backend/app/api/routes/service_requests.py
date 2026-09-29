"""
Service Request API routes.
Handles CRUD, status transitions, and dashboard data.
"""

import os
import uuid
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc

from app.core.config import settings
from app.database.session import get_db
from app.models.user import User, RoleName
from app.models.service import (
    ServiceCategory, ServiceRequest, StatusHistory,
    ServiceNote, Notification, ServicePhoto, ServiceRating,
    RequestStatus, Priority, VALID_TRANSITIONS,
)
from app.models.technician import TechnicianProfile
from app.schemas.service import (
    ServiceRequestCreate, ServiceRequestUpdate, StatusUpdateRequest,
    ServiceRequestResponse, ServiceRequestDetailResponse,
    ServiceRequestListResponse, StatusHistoryResponse,
    ServiceNoteCreate, ServiceNoteResponse,
    NotificationResponse, CustomerDashboardStats,
    ServicePhotoResponse, ServiceRatingCreate, ServiceRatingResponse,
)
from app.schemas.technician import AssignTechnicianRequest
from app.schemas.location import TrackingInfoResponse
from app.core.location import haversine_distance, calculate_eta
from app.core.notifications import send_push_notification
from app.api.dependencies import get_current_user, require_roles

ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

router = APIRouter(prefix="/service-requests", tags=["Service Requests"])


def _generate_request_id(db: Session) -> str:
    """Generate the next sequential request ID (SR-1001, SR-1002, ...)."""
    count = db.query(func.count(ServiceRequest.id)).scalar() or 0
    return f"SR-{count + 1001}"


def _build_response(sr: ServiceRequest) -> ServiceRequestResponse:
    """Build a ServiceRequestResponse from a model instance."""
    tech_name = None
    tech_phone = None
    tech_id = None
    if sr.assigned_technician:
        tech_name = sr.assigned_technician.user.full_name
        tech_phone = sr.assigned_technician.user.phone
        tech_id = sr.assigned_technician.id

    return ServiceRequestResponse(
        id=sr.id,
        request_id=sr.request_id,
        customer_id=sr.customer_id,
        customer_name=sr.customer.full_name,
        category_id=sr.category_id,
        category_name=sr.category.name,
        category_icon=sr.category.icon,
        title=sr.title,
        description=sr.description,
        priority=sr.priority.value,
        status=sr.status.value,
        location_address=sr.location_address,
        location_lat=sr.location_lat,
        location_lng=sr.location_lng,
        assigned_technician_id=tech_id,
        assigned_technician_name=tech_name,
        assigned_technician_phone=tech_phone,
        created_at=sr.created_at.isoformat(),
        updated_at=sr.updated_at.isoformat(),
        completed_at=sr.completed_at.isoformat() if sr.completed_at else None,
        confirmed_at=sr.confirmed_at.isoformat() if sr.confirmed_at else None,
    )


def _build_detail_response(sr: ServiceRequest) -> ServiceRequestDetailResponse:
    """Build a detailed response including status history."""
    base = _build_response(sr)
    history = [
        StatusHistoryResponse(
            id=sh.id,
            from_status=sh.from_status.value if sh.from_status else None,
            to_status=sh.to_status.value,
            changed_by_name=sh.changed_by.full_name,
            note=sh.note,
            created_at=sh.created_at.isoformat(),
        )
        for sh in sr.status_history
    ]
    return ServiceRequestDetailResponse(
        **base.model_dump(),
        status_history=history,
        note_count=len(sr.notes) if sr.notes else 0,
        photo_count=len(sr.photos) if sr.photos else 0,
        rating=sr.rating.rating if sr.rating else None,
    )


def _create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
    reference_id: Optional[int] = None,
):
    """Create an in-app notification."""
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        reference_id=reference_id,
    )
    db.add(notification)

    # Dispatch push notification to user's registered devices
    send_push_notification(
        db=db,
        user_id=user_id,
        title=title,
        body=message,
        data={"notification_type": notification_type, "reference_id": reference_id},
    )


# ─── CRUD Endpoints ────────────────────────────────────────

@router.post("", response_model=ServiceRequestResponse, status_code=status.HTTP_201_CREATED)
def create_service_request(
    request: ServiceRequestCreate,
    current_user: User = Depends(require_roles([RoleName.CUSTOMER])),
    db: Session = Depends(get_db),
):
    """
    Create a new service request. Only customers can create requests.
    """
    # Validate category exists
    category = db.query(ServiceCategory).filter(
        ServiceCategory.id == request.category_id,
        ServiceCategory.is_active == True,
    ).first()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid service category",
        )

    # Generate unique request ID
    request_id = _generate_request_id(db)

    # Create service request
    sr = ServiceRequest(
        request_id=request_id,
        customer_id=current_user.id,
        category_id=request.category_id,
        title=request.title,
        description=request.description,
        priority=Priority(request.priority),
        status=RequestStatus.NEW,
        location_address=request.location_address,
        location_lat=request.location_lat,
        location_lng=request.location_lng,
    )
    db.add(sr)
    db.flush()  # Get the ID

    # Create initial status history entry
    history = StatusHistory(
        service_request_id=sr.id,
        from_status=None,
        to_status=RequestStatus.NEW,
        changed_by_id=current_user.id,
        note="Service request created",
    )
    db.add(history)
    db.commit()
    db.refresh(sr)

    # Eager load relationships for response
    sr = (
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.customer),
            joinedload(ServiceRequest.category),
            joinedload(ServiceRequest.assigned_technician).joinedload(TechnicianProfile.user),
        )
        .filter(ServiceRequest.id == sr.id)
        .first()
    )

    return _build_response(sr)


@router.get("", response_model=ServiceRequestListResponse)
def list_service_requests(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    category_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List service requests. Filtered by role:
    - Customer: only their own requests
    - Technician: only their assigned requests
    - Admin: all requests
    """
    query = (
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.customer),
            joinedload(ServiceRequest.category),
            joinedload(ServiceRequest.assigned_technician).joinedload(TechnicianProfile.user),
        )
    )

    # Role-based filtering
    if current_user.role.name == RoleName.CUSTOMER:
        query = query.filter(ServiceRequest.customer_id == current_user.id)
    elif current_user.role.name == RoleName.TECHNICIAN:
        tech_profile = db.query(TechnicianProfile).filter(
            TechnicianProfile.user_id == current_user.id
        ).first()
        if tech_profile:
            query = query.filter(ServiceRequest.assigned_technician_id == tech_profile.id)
        else:
            query = query.filter(ServiceRequest.id == -1)  # No results

    # Optional filters
    if status_filter:
        try:
            status_enum = RequestStatus(status_filter)
            query = query.filter(ServiceRequest.status == status_enum)
        except ValueError:
            pass

    if priority_filter:
        try:
            priority_enum = Priority(priority_filter)
            query = query.filter(ServiceRequest.priority == priority_enum)
        except ValueError:
            pass

    if category_id:
        query = query.filter(ServiceRequest.category_id == category_id)

    # Count total before pagination
    total = query.count()

    # Apply pagination and ordering
    items = (
        query.order_by(desc(ServiceRequest.created_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return ServiceRequestListResponse(
        items=[_build_response(sr) for sr in items],
        total=total,
        page=page,
        per_page=per_page,
    )


# ─── Dashboard Stats ───────────────────────────────────────
# NOTE: This route MUST be defined before /{request_id} to prevent
# FastAPI from matching "dashboard" as a request_id parameter.

@router.get("/dashboard/stats", response_model=CustomerDashboardStats)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get dashboard statistics for the current user."""
    # Base query filtered by role
    if current_user.role.name == RoleName.CUSTOMER:
        base = db.query(ServiceRequest).filter(ServiceRequest.customer_id == current_user.id)
    elif current_user.role.name == RoleName.TECHNICIAN:
        tech = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == current_user.id).first()
        if tech:
            base = db.query(ServiceRequest).filter(ServiceRequest.assigned_technician_id == tech.id)
        else:
            return CustomerDashboardStats()
    else:  # Admin
        base = db.query(ServiceRequest)

    total = base.count()
    open_count = base.filter(ServiceRequest.status == RequestStatus.NEW).count()
    assigned = base.filter(ServiceRequest.status.in_([
        RequestStatus.ASSIGNED, RequestStatus.ACCEPTED
    ])).count()
    in_progress = base.filter(ServiceRequest.status.in_([
        RequestStatus.EN_ROUTE, RequestStatus.IN_PROGRESS
    ])).count()
    completed = base.filter(ServiceRequest.status.in_([
        RequestStatus.COMPLETED, RequestStatus.CUSTOMER_CONFIRMED, RequestStatus.CLOSED
    ])).count()

    unread = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).count()

    return CustomerDashboardStats(
        total_requests=total,
        open_requests=open_count,
        assigned_requests=assigned,
        in_progress_requests=in_progress,
        completed_requests=completed,
        unread_notifications=unread,
    )


@router.get("/{request_id}", response_model=ServiceRequestDetailResponse)
def get_service_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get a single service request by its request_id (e.g., SR-1001).
    """
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
        .filter(ServiceRequest.request_id == request_id)
        .first()
    )

    if not sr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service request not found",
        )

    # Authorization check
    if current_user.role.name == RoleName.CUSTOMER and sr.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if current_user.role.name == RoleName.TECHNICIAN:
        tech_profile = db.query(TechnicianProfile).filter(
            TechnicianProfile.user_id == current_user.id
        ).first()
        if not tech_profile or sr.assigned_technician_id != tech_profile.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _build_detail_response(sr)


@router.patch("/{request_id}", response_model=ServiceRequestResponse)
def update_service_request(
    request_id: str,
    updates: ServiceRequestUpdate,
    current_user: User = Depends(require_roles([RoleName.CUSTOMER])),
    db: Session = Depends(get_db),
):
    """
    Update a service request. Only the customer who created it can update,
    and only while status is NEW.
    """
    sr = db.query(ServiceRequest).filter(ServiceRequest.request_id == request_id).first()
    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

    if sr.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if sr.status != RequestStatus.NEW:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only edit requests with NEW status",
        )

    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "priority" and value:
            setattr(sr, field, Priority(value))
        else:
            setattr(sr, field, value)

    db.commit()
    db.refresh(sr)

    # Re-query with joins
    sr = (
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.customer),
            joinedload(ServiceRequest.category),
            joinedload(ServiceRequest.assigned_technician).joinedload(TechnicianProfile.user),
        )
        .filter(ServiceRequest.id == sr.id)
        .first()
    )

    return _build_response(sr)


# ─── Status Transition ─────────────────────────────────────

@router.post("/{request_id}/status", response_model=ServiceRequestDetailResponse)
def update_status(
    request_id: str,
    body: StatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the status of a service request.
    Validates transition rules and authorization.
    """
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
        .filter(ServiceRequest.request_id == request_id)
        .first()
    )

    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

    # Validate status enum
    try:
        new_status = RequestStatus(body.status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status: {body.status}",
        )

    # Validate transition
    allowed = VALID_TRANSITIONS.get(sr.status, [])
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition from {sr.status.value} to {new_status.value}. "
                   f"Allowed: {[s.value for s in allowed]}",
        )

    # Authorization: who can make which transitions?
    role = current_user.role.name

    # Customer can only: CUSTOMER_CONFIRMED
    if role == RoleName.CUSTOMER:
        if new_status != RequestStatus.CUSTOMER_CONFIRMED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customers can only confirm completed requests")
        if sr.customer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Technician can: ACCEPTED, EN_ROUTE, IN_PROGRESS, COMPLETED, and reject (NEW)
    elif role == RoleName.TECHNICIAN:
        tech_statuses = {RequestStatus.ACCEPTED, RequestStatus.EN_ROUTE,
                         RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED, RequestStatus.NEW}
        if new_status not in tech_statuses:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this transition")
        tech_profile = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == current_user.id).first()
        if not tech_profile or sr.assigned_technician_id != tech_profile.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not assigned to this request")

    # Admin can: ASSIGNED, CLOSED
    elif role == RoleName.ADMIN:
        pass  # Admin can do any valid transition

    # Record the transition
    old_status = sr.status
    sr.status = new_status

    if new_status == RequestStatus.COMPLETED:
        sr.completed_at = datetime.now(timezone.utc)
    elif new_status == RequestStatus.CUSTOMER_CONFIRMED:
        sr.confirmed_at = datetime.now(timezone.utc)

    # If rejecting (back to NEW), unassign technician
    if new_status == RequestStatus.NEW and old_status == RequestStatus.ASSIGNED:
        sr.assigned_technician_id = None

    history = StatusHistory(
        service_request_id=sr.id,
        from_status=old_status,
        to_status=new_status,
        changed_by_id=current_user.id,
        note=body.note,
    )
    db.add(history)

    # Create notifications
    if new_status == RequestStatus.ACCEPTED:
        _create_notification(
            db, sr.customer_id,
            "Technician Accepted",
            f"Technician {sr.assigned_technician.user.full_name} has accepted your request {sr.request_id}.",
            "status_update", sr.id,
        )
    elif new_status == RequestStatus.EN_ROUTE:
        _create_notification(
            db, sr.customer_id,
            "Technician En Route",
            f"Technician is on the way for request {sr.request_id}.",
            "status_update", sr.id,
        )
    elif new_status == RequestStatus.IN_PROGRESS:
        _create_notification(
            db, sr.customer_id,
            "Service Started",
            f"Technician has started working on request {sr.request_id}.",
            "status_update", sr.id,
        )
    elif new_status == RequestStatus.COMPLETED:
        _create_notification(
            db, sr.customer_id,
            "Service Completed",
            f"Your service request {sr.request_id} has been completed. Please confirm.",
            "status_update", sr.id,
        )
    elif new_status == RequestStatus.CUSTOMER_CONFIRMED and sr.assigned_technician:
        _create_notification(
            db, sr.assigned_technician.user_id,
            "Customer Confirmed",
            f"Customer has confirmed completion of {sr.request_id}.",
            "status_update", sr.id,
        )

    db.commit()
    db.refresh(sr)

    return _build_detail_response(sr)


@router.post("/{request_id}/assign", response_model=ServiceRequestDetailResponse)
def assign_technician(
    request_id: str,
    body: AssignTechnicianRequest,
    current_user: User = Depends(require_roles([RoleName.ADMIN])),
    db: Session = Depends(get_db),
):
    """
    Assign a technician to a service request. Admin only.
    Request must be in NEW or ASSIGNED status.
    """
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
        .filter(ServiceRequest.request_id == request_id)
        .first()
    )

    if not sr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service request not found",
        )

    if sr.status not in [RequestStatus.NEW, RequestStatus.ASSIGNED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot assign technician when request status is {sr.status.value}. Must be NEW or ASSIGNED.",
        )

    tech = (
        db.query(TechnicianProfile)
        .options(joinedload(TechnicianProfile.user))
        .filter(TechnicianProfile.id == body.technician_id)
        .first()
    )

    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Technician profile not found",
        )

    old_status = sr.status
    sr.assigned_technician_id = tech.id
    sr.status = RequestStatus.ASSIGNED

    history = StatusHistory(
        service_request_id=sr.id,
        from_status=old_status,
        to_status=RequestStatus.ASSIGNED,
        changed_by_id=current_user.id,
        note=f"Assigned to {tech.user.full_name}",
    )
    db.add(history)

    # Notify technician
    _create_notification(
        db,
        tech.user_id,
        "New Job Assigned",
        f"You have been assigned to service request {sr.request_id}: {sr.title}",
        "assignment",
        sr.id,
    )

    # Notify customer
    _create_notification(
        db,
        sr.customer_id,
        "Technician Assigned",
        f"Technician {tech.user.full_name} has been assigned to your request {sr.request_id}.",
        "status_update",
        sr.id,
    )

    db.commit()
    db.refresh(sr)

    return _build_detail_response(sr)


@router.get("/{request_id}/tracking", response_model=TrackingInfoResponse)
def get_service_request_tracking(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get live technician tracking and arrival ETA for a service request.
    Accessible to the requesting customer, assigned technician, or admin.
    """
    sr = (
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.customer),
            joinedload(ServiceRequest.assigned_technician).joinedload(TechnicianProfile.user),
        )
        .filter(ServiceRequest.request_id == request_id)
        .first()
    )

    if not sr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service request not found",
        )

    # Authorization
    if current_user.role.name == RoleName.CUSTOMER and sr.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if current_user.role.name == RoleName.TECHNICIAN:
        tech_profile = db.query(TechnicianProfile).filter(
            TechnicianProfile.user_id == current_user.id
        ).first()
        if not tech_profile or sr.assigned_technician_id != tech_profile.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    tech_name = None
    tech_phone = None
    tech_lat = None
    tech_lng = None
    last_update = None
    distance_km = None
    eta_minutes = None

    if sr.assigned_technician:
        tech = sr.assigned_technician
        tech_name = tech.user.full_name if tech.user else None
        tech_phone = tech.user.phone if tech.user else None
        tech_lat = tech.current_lat
        tech_lng = tech.current_lng
        if tech.last_location_update:
            last_update = tech.last_location_update.isoformat()

        # Calculate distance and ETA if both coordinates exist
        if (
            tech_lat is not None
            and tech_lng is not None
            and sr.location_lat is not None
            and sr.location_lng is not None
        ):
            distance_km = haversine_distance(tech_lat, tech_lng, sr.location_lat, sr.location_lng)
            eta_minutes = calculate_eta(distance_km)

    is_en_route = sr.status in [RequestStatus.EN_ROUTE, RequestStatus.ACCEPTED]

    return TrackingInfoResponse(
        service_request_id=sr.request_id,
        status=sr.status.value,
        is_en_route=is_en_route,
        technician_name=tech_name,
        technician_phone=tech_phone,
        technician_lat=tech_lat,
        technician_lng=tech_lng,
        last_location_update=last_update,
        destination_lat=sr.location_lat,
        destination_lng=sr.location_lng,
        destination_address=sr.location_address,
        distance_km=distance_km,
        estimated_duration_minutes=eta_minutes,
    )


# ─── Notes ──────────────────────────────────────────────────

@router.post("/{request_id}/notes", response_model=ServiceNoteResponse, status_code=status.HTTP_201_CREATED)
def add_note(
    request_id: str,
    body: ServiceNoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a note to a service request."""
    sr = db.query(ServiceRequest).filter(ServiceRequest.request_id == request_id).first()
    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

    # Authorization
    if current_user.role.name == RoleName.CUSTOMER and sr.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role.name == RoleName.TECHNICIAN:
        tech = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == current_user.id).first()
        if not tech or sr.assigned_technician_id != tech.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    note = ServiceNote(
        service_request_id=sr.id,
        author_id=current_user.id,
        content=body.content,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return ServiceNoteResponse(
        id=note.id,
        service_request_id=note.service_request_id,
        author_id=note.author_id,
        author_name=current_user.full_name,
        content=note.content,
        created_at=note.created_at.isoformat(),
    )


@router.get("/{request_id}/notes", response_model=list[ServiceNoteResponse])
def list_notes(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all notes for a service request."""
    sr = db.query(ServiceRequest).filter(ServiceRequest.request_id == request_id).first()
    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

    notes = (
        db.query(ServiceNote)
        .options(joinedload(ServiceNote.author))
        .filter(ServiceNote.service_request_id == sr.id)
        .order_by(ServiceNote.created_at)
        .all()
    )

    return [
        ServiceNoteResponse(
            id=n.id,
            service_request_id=n.service_request_id,
            author_id=n.author_id,
            author_name=n.author.full_name,
            content=n.content,
            created_at=n.created_at.isoformat(),
        )
        for n in notes
    ]


# ─── Photos ─────────────────────────────────────────────────

@router.post("/{request_id}/photos", response_model=ServicePhotoResponse, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    request_id: str,
    photo: UploadFile = File(...),
    photo_type: str = Form("issue"),
    caption: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a photo for a service request (before, after, issue).
    Authorized for the owning customer, assigned technician, or admin.
    """
    sr = db.query(ServiceRequest).filter(ServiceRequest.request_id == request_id).first()
    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

    # Authorization
    if current_user.role.name == RoleName.CUSTOMER and sr.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role.name == RoleName.TECHNICIAN:
        tech = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == current_user.id).first()
        if not tech or sr.assigned_technician_id != tech.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Validate file extension
    original_filename = photo.filename or "upload.jpg"
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed types: {', '.join(sorted(ALLOWED_PHOTO_EXTENSIONS))}",
        )

    # Read contents and check size
    contents = await photo.read()
    file_size = len(contents)
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if file_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_MB}MB",
        )

    # Save to disk
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    with open(dest_path, "wb") as f:
        f.write(contents)

    # Normalize photo type
    valid_types = {"before", "after", "issue"}
    normalized_type = photo_type.lower() if photo_type.lower() in valid_types else "issue"

    # Save DB record
    service_photo = ServicePhoto(
        service_request_id=sr.id,
        uploaded_by_id=current_user.id,
        photo_type=normalized_type,
        file_path=dest_path,
        file_name=original_filename,
        file_size=file_size,
        caption=caption,
    )
    db.add(service_photo)

    # Add notification if technician uploaded an "after" photo
    if current_user.role.name == RoleName.TECHNICIAN and normalized_type == "after":
        _create_notification(
            db=db,
            user_id=sr.customer_id,
            title="Work Photo Uploaded",
            message=f"Technician uploaded a completion photo for {sr.request_id}.",
            notification_type="PHOTO_UPLOADED",
            reference_id=sr.id,
        )

    db.commit()
    db.refresh(service_photo)

    return ServicePhotoResponse(
        id=service_photo.id,
        service_request_id=service_photo.service_request_id,
        uploaded_by_id=service_photo.uploaded_by_id,
        uploaded_by_name=current_user.full_name,
        photo_type=service_photo.photo_type,
        file_name=service_photo.file_name,
        file_url=f"/uploads/{unique_filename}",
        file_size=service_photo.file_size,
        caption=service_photo.caption,
        created_at=service_photo.created_at.isoformat(),
    )


@router.get("/{request_id}/photos", response_model=list[ServicePhotoResponse])
def list_photos(
    request_id: str,
    photo_type: Optional[str] = Query(None, description="Filter by photo type: before, after, issue"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all photos for a service request."""
    sr = db.query(ServiceRequest).filter(ServiceRequest.request_id == request_id).first()
    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

    # Authorization
    if current_user.role.name == RoleName.CUSTOMER and sr.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role.name == RoleName.TECHNICIAN:
        tech = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == current_user.id).first()
        if not tech or sr.assigned_technician_id != tech.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    query = (
        db.query(ServicePhoto)
        .options(joinedload(ServicePhoto.uploaded_by))
        .filter(ServicePhoto.service_request_id == sr.id)
    )
    if photo_type:
        query = query.filter(ServicePhoto.photo_type == photo_type.lower())

    photos = query.order_by(ServicePhoto.created_at.desc()).all()

    return [
        ServicePhotoResponse(
            id=p.id,
            service_request_id=p.service_request_id,
            uploaded_by_id=p.uploaded_by_id,
            uploaded_by_name=p.uploaded_by.full_name if p.uploaded_by else "User",
            photo_type=p.photo_type,
            file_name=p.file_name,
            file_url=f"/uploads/{os.path.basename(p.file_path)}",
            file_size=p.file_size,
            caption=p.caption,
            created_at=p.created_at.isoformat(),
        )
        for p in photos
    ]


@router.delete("/{request_id}/photos/{photo_id}", status_code=status.HTTP_200_OK)
def delete_photo(
    request_id: str,
    photo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a photo attached to a service request."""
    sr = db.query(ServiceRequest).filter(ServiceRequest.request_id == request_id).first()
    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

    photo = db.query(ServicePhoto).filter(
        ServicePhoto.id == photo_id,
        ServicePhoto.service_request_id == sr.id,
    ).first()
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    # Only uploader or admin can delete
    if current_user.role.name != RoleName.ADMIN and photo.uploaded_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this photo")

    # Remove physical file if exists
    if os.path.exists(photo.file_path):
        try:
            os.remove(photo.file_path)
        except OSError:
            pass

    db.delete(photo)
    db.commit()
    return {"message": "Photo deleted successfully", "id": photo_id}


# ─── Ratings ────────────────────────────────────────────────

@router.post("/{request_id}/rating", response_model=ServiceRatingResponse, status_code=status.HTTP_201_CREATED)
def submit_rating(
    request_id: str,
    body: ServiceRatingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit customer rating and feedback for a completed service request.
    Transitions request status to CUSTOMER_CONFIRMED.
    """
    sr = (
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.assigned_technician).joinedload(TechnicianProfile.user),
        )
        .filter(ServiceRequest.request_id == request_id)
        .first()
    )
    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

    # Only customer owner can rate
    if current_user.role.name != RoleName.ADMIN and sr.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the customer who created this request can submit a rating")

    # Status validation: must be COMPLETED, CUSTOMER_CONFIRMED, or CLOSED
    allowed_statuses = [RequestStatus.COMPLETED, RequestStatus.CUSTOMER_CONFIRMED, RequestStatus.CLOSED]
    if sr.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot rate request in '{sr.status.value}' status. The service must be completed first.",
        )

    # Check for duplicate rating
    existing_rating = db.query(ServiceRating).filter(ServiceRating.service_request_id == sr.id).first()
    if existing_rating:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This service request has already been rated")

    # Create rating record
    rating = ServiceRating(
        service_request_id=sr.id,
        rated_by_id=current_user.id,
        technician_id=sr.assigned_technician_id,
        rating=body.rating,
        comment=body.comment,
    )
    db.add(rating)

    # If status is COMPLETED, transition to CUSTOMER_CONFIRMED
    now = datetime.now(timezone.utc)
    if sr.status == RequestStatus.COMPLETED:
        old_status = sr.status
        sr.status = RequestStatus.CUSTOMER_CONFIRMED
        sr.confirmed_at = now
        sr.updated_at = now
        history = StatusHistory(
            service_request_id=sr.id,
            from_status=old_status,
            to_status=RequestStatus.CUSTOMER_CONFIRMED,
            changed_by_id=current_user.id,
            note=f"Customer confirmed service and gave a {body.rating}-star review",
        )
        db.add(history)

    # Notify technician if assigned
    if sr.assigned_technician and sr.assigned_technician.user_id:
        stars_display = "⭐" * body.rating
        _create_notification(
            db=db,
            user_id=sr.assigned_technician.user_id,
            title="New Review Received",
            message=f"{current_user.full_name} gave you {stars_display} ({body.rating}/5) for request {sr.request_id}.",
            notification_type="RATING_RECEIVED",
            reference_id=sr.id,
        )

    db.commit()
    db.refresh(rating)

    tech_name = sr.assigned_technician.user.full_name if (sr.assigned_technician and sr.assigned_technician.user) else None

    return ServiceRatingResponse(
        id=rating.id,
        service_request_id=rating.service_request_id,
        rated_by_id=rating.rated_by_id,
        rated_by_name=current_user.full_name,
        technician_id=rating.technician_id,
        technician_name=tech_name,
        rating=rating.rating,
        comment=rating.comment,
        created_at=rating.created_at.isoformat(),
    )


@router.get("/{request_id}/rating", response_model=Optional[ServiceRatingResponse])
def get_rating(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get rating details for a service request."""
    sr = db.query(ServiceRequest).filter(ServiceRequest.request_id == request_id).first()
    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found")

    # Authorization
    if current_user.role.name == RoleName.CUSTOMER and sr.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role.name == RoleName.TECHNICIAN:
        tech = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == current_user.id).first()
        if not tech or sr.assigned_technician_id != tech.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    rating = (
        db.query(ServiceRating)
        .options(
            joinedload(ServiceRating.rated_by),
            joinedload(ServiceRating.technician).joinedload(TechnicianProfile.user),
        )
        .filter(ServiceRating.service_request_id == sr.id)
        .first()
    )
    if not rating:
        return None

    tech_name = rating.technician.user.full_name if (rating.technician and rating.technician.user) else None

    return ServiceRatingResponse(
        id=rating.id,
        service_request_id=rating.service_request_id,
        rated_by_id=rating.rated_by_id,
        rated_by_name=rating.rated_by.full_name if rating.rated_by else "Customer",
        technician_id=rating.technician_id,
        technician_name=tech_name,
        rating=rating.rating,
        comment=rating.comment,
        created_at=rating.created_at.isoformat(),
    )



