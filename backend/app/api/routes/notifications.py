"""
Notification API routes.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database.session import get_db
from app.models.user import User
from app.models.service import Notification, DeviceToken
from app.schemas.service import NotificationResponse
from app.schemas.notification import PushTokenCreate, PushTokenDelete
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=List[NotificationResponse])
def list_notifications(
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List notifications for the current user."""
    query = db.query(Notification).filter(Notification.user_id == current_user.id)

    if unread_only:
        query = query.filter(Notification.is_read == False)

    notifications = query.order_by(desc(Notification.created_at)).limit(50).all()

    return [
        NotificationResponse(
            id=n.id,
            title=n.title,
            message=n.message,
            notification_type=n.notification_type,
            reference_id=n.reference_id,
            is_read=n.is_read,
            created_at=n.created_at.isoformat(),
        )
        for n in notifications
    ]


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a notification as read."""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    notification.is_read = True
    db.commit()
    db.refresh(notification)

    return NotificationResponse(
        id=notification.id,
        title=notification.title,
        message=notification.message,
        notification_type=notification.notification_type,
        reference_id=notification.reference_id,
        is_read=notification.is_read,
        created_at=notification.created_at.isoformat(),
    )


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all notifications as read for the current user."""
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()


@router.post("/push-token")
def register_push_token(
    body: PushTokenCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Register or update an Expo/FCM push notification token for the user.
    """
    existing = db.query(DeviceToken).filter(DeviceToken.token == body.token).first()
    if existing:
        existing.user_id = current_user.id
        existing.device_type = body.device_type
        existing.is_active = True
        db.commit()
        return {"status": "updated", "token": body.token}

    device_token = DeviceToken(
        user_id=current_user.id,
        token=body.token,
        device_type=body.device_type,
        is_active=True,
    )
    db.add(device_token)
    db.commit()

    return {"status": "registered", "token": body.token}


@router.delete("/push-token")
def unregister_push_token(
    body: PushTokenDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Unregister a push notification token on user sign-out.
    """
    token = db.query(DeviceToken).filter(
        DeviceToken.token == body.token,
        DeviceToken.user_id == current_user.id,
    ).first()

    if token:
        token.is_active = False
        db.commit()

    return {"status": "unregistered"}

