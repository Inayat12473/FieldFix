"""
FieldFix Backend — Main FastAPI Application.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.database.session import engine, Base
from app.api.routes import auth, categories, service_requests, notifications, technicians

# Import all models so SQLAlchemy knows about them
from app.models import (  # noqa: F401
    User, Role, TechnicianProfile, TechnicianSkill, ServiceCategory,
    ServiceRequest, StatusHistory, ServicePhoto, ServiceNote, ServiceRating, Notification,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — create tables on startup."""
    Base.metadata.create_all(bind=engine)

    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    yield


app = FastAPI(
    title="FieldFix API",
    description="Field Service & Maintenance Management System API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Mount Admin Web Dashboard
admin_dir = os.path.join(os.path.dirname(__file__), "static", "admin")
os.makedirs(admin_dir, exist_ok=True)
app.mount("/admin", StaticFiles(directory=admin_dir, html=True), name="admin")

# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(service_requests.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(technicians.router, prefix="/api/v1")


@app.get("/", tags=["Health"])
def root():
    """Health check endpoint."""
    return {
        "service": "FieldFix API",
        "version": "1.0.0",
        "status": "running",
        "admin_dashboard": "/admin",
    }


@app.get("/api/v1/health", tags=["Health"])
def health_check():
    """API health check."""
    return {"status": "healthy"}
