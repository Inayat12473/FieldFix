"""
Push notification dispatch utilities.
Handles sending push notifications to Expo Push Service and active devices.
"""

import logging
from typing import Optional
import httpx
from sqlalchemy.orm import Session

from app.models.service import DeviceToken

logger = logging.getLogger("fieldfix.notifications")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_push_notification(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> int:
    """
    Find all active push tokens for user and send push notification.
    Returns count of targeted push devices.
    """
    tokens = (
        db.query(DeviceToken)
        .filter(DeviceToken.user_id == user_id, DeviceToken.is_active == True)
        .all()
    )

    if not tokens:
        logger.info(f"No active push tokens found for user_id={user_id}")
        return 0

    messages = []
    for dt in tokens:
        messages.append({
            "to": dt.token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        })

    sent_count = len(messages)
    try:
        valid_expo_tokens = [
            m for m in messages
            if m["to"].startswith("ExponentPushToken") or m["to"].startswith("ExpoPushToken")
        ]
        if valid_expo_tokens:
            with httpx.Client(timeout=3.0) as client:
                resp = client.post(
                    EXPO_PUSH_URL,
                    json=valid_expo_tokens,
                    headers={"Accept": "application/json", "Accept-Encoding": "gzip, deflate"},
                )
                logger.info(f"Expo push response status: {resp.status_code}")
    except Exception as exc:
        logger.warning(f"Push dispatch network attempt handled: {exc}")

    return sent_count
