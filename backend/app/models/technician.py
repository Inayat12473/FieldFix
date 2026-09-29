"""
Technician-specific database models.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Float
)
from sqlalchemy.orm import relationship

from app.database.session import Base


class TechnicianProfile(Base):
    """
    Technician profile — extends User for technician-specific data.
    Stores availability, current location, and employee ID.
    """
    __tablename__ = "technician_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id"), unique=True, nullable=False
    )
    employee_id = Column(String(20), unique=True, nullable=False)
    is_available = Column(Boolean, default=True, nullable=False)
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    last_location_update = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="technician_profile")
    skills = relationship(
        "TechnicianSkill", back_populates="technician", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<TechnicianProfile(id={self.id}, employee_id={self.employee_id})>"


class TechnicianSkill(Base):
    """
    Maps technicians to service categories they are skilled in.
    proficiency_level: 1 (basic) to 5 (expert)
    """
    __tablename__ = "technician_skills"

    id = Column(Integer, primary_key=True, index=True)
    technician_id = Column(
        Integer, ForeignKey("technician_profiles.id"), nullable=False
    )
    category_id = Column(
        Integer, ForeignKey("service_categories.id"), nullable=False
    )
    proficiency_level = Column(Integer, default=3, nullable=False)

    # Relationships
    technician = relationship("TechnicianProfile", back_populates="skills")
    category = relationship("ServiceCategory")

    def __repr__(self):
        return (
            f"<TechnicianSkill(tech={self.technician_id}, "
            f"cat={self.category_id}, level={self.proficiency_level})>"
        )
