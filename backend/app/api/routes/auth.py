"""
Authentication API routes — registration, login, and profile retrieval.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password, create_access_token
from app.database.session import get_db
from app.models.user import User, Role, RoleName
from app.models.technician import TechnicianProfile
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    UserProfileUpdate,
)
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _build_user_response(user: User) -> UserResponse:
    """Build a UserResponse from a User model instance."""
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role.name.value,
        is_active=user.is_active,
        avatar_url=user.avatar_url,
        created_at=user.created_at.isoformat(),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user account.
    Only customer and technician roles can self-register.
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Get the role
    role_name = RoleName(request.role)
    role = db.query(Role).filter(Role.name == role_name).first()
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {request.role}",
        )

    # Create user
    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        full_name=request.full_name,
        phone=request.phone,
        role_id=role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-create technician profile if user registered as technician
    if role.name == RoleName.TECHNICIAN:
        tech_profile = TechnicianProfile(
            user_id=user.id,
            employee_id=f"TEC-{user.id:04d}",
            is_available=True,
        )
        db.add(tech_profile)
        db.commit()

    # Generate JWT
    access_token = create_access_token(data={"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        user=_build_user_response(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user with email and password.
    Returns JWT access token on success.
    """
    user = db.query(User).filter(User.email == request.email).first()

    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    access_token = create_access_token(data={"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        user=_build_user_response(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    return _build_user_response(current_user)


@router.patch("/me", response_model=UserResponse)
def update_me(
    updates: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's profile."""
    if updates.full_name is not None:
        current_user.full_name = updates.full_name
    if updates.phone is not None:
        current_user.phone = updates.phone

    db.commit()
    db.refresh(current_user)

    return _build_user_response(current_user)
