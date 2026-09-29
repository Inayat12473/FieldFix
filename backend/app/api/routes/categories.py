"""
Service category API routes.
"""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.service import ServiceCategory
from app.schemas.service import ServiceCategoryResponse
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/categories", tags=["Service Categories"])


@router.get("", response_model=List[ServiceCategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    """
    List all active service categories.
    Public endpoint — no auth required (needed for registration context).
    """
    categories = (
        db.query(ServiceCategory)
        .filter(ServiceCategory.is_active == True)
        .order_by(ServiceCategory.name)
        .all()
    )
    return categories
