"""
Pydantic schemas for push notification tokens and notifications.
"""

from typing import Optional
from pydantic import BaseModel, Field


class PushTokenCreate(BaseModel):
    """Schema for registering a device push token."""
    token: str = Field(..., min_length=10, max_length=255, description="Push notification token (Expo, FCM, APNS)")
    device_type: str = Field(default="mobile", max_length=50, description="Device platform (android, ios, web, mobile)")


class PushTokenDelete(BaseModel):
    """Schema for unregistering a push token."""
    token: str = Field(..., min_length=10, max_length=255)
