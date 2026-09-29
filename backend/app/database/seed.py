"""
Database seed script — creates roles, demo users, service categories, and technician profiles.
Run with: python -m app.database.seed
"""

import sys
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.database.session import SessionLocal, engine, Base
from app.models.user import User, Role, RoleName
from app.models.technician import TechnicianProfile, TechnicianSkill
from app.models.service import (
    ServiceCategory, ServiceRequest, StatusHistory,
    ServicePhoto, ServiceNote, ServiceRating, Notification,
    RequestStatus, Priority
)
from app.core.security import hash_password

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def seed_roles(db: Session):
    """Create the three system roles if they don't exist."""
    roles_data = [
        {"name": RoleName.CUSTOMER, "description": "Customer who requests services"},
        {"name": RoleName.TECHNICIAN, "description": "Field technician who performs services"},
        {"name": RoleName.ADMIN, "description": "System administrator"},
    ]
    for role_data in roles_data:
        existing = db.query(Role).filter(Role.name == role_data["name"]).first()
        if not existing:
            db.add(Role(**role_data))
    db.commit()
    print("[OK] Roles seeded")


def seed_categories(db: Session):
    """Create service categories."""
    categories_data = [
        {"name": "Air Conditioning", "description": "AC installation, repair, and maintenance", "icon": "snowflake"},
        {"name": "Electrical", "description": "Electrical wiring, panels, and fixtures", "icon": "zap"},
        {"name": "Elevator", "description": "Elevator installation and maintenance", "icon": "arrow-up"},
        {"name": "Generator", "description": "Generator installation and servicing", "icon": "battery-charging"},
        {"name": "Plumbing", "description": "Water supply, drainage, and fixtures", "icon": "droplet"},
        {"name": "Networking", "description": "Network cabling, routers, and switches", "icon": "wifi"},
        {"name": "Fire Safety", "description": "Fire alarms, sprinklers, and safety systems", "icon": "flame"},
        {"name": "CCTV & Security", "description": "Surveillance cameras and access control", "icon": "camera"},
        {"name": "Appliance Repair", "description": "Refrigerators, washers, and other appliances", "icon": "settings"},
        {"name": "HVAC", "description": "Heating, ventilation, and air conditioning systems", "icon": "thermometer"},
    ]
    for cat_data in categories_data:
        existing = db.query(ServiceCategory).filter(ServiceCategory.name == cat_data["name"]).first()
        if not existing:
            db.add(ServiceCategory(**cat_data))
    db.commit()
    print("[OK] Service categories seeded")


def seed_users(db: Session):
    """Create demo users for all three roles."""
    admin_role = db.query(Role).filter(Role.name == RoleName.ADMIN).first()
    customer_role = db.query(Role).filter(Role.name == RoleName.CUSTOMER).first()
    tech_role = db.query(Role).filter(Role.name == RoleName.TECHNICIAN).first()

    users_data = [
        # Admin
        {
            "email": "admin@fieldfix.com",
            "password": "Admin@123",
            "full_name": "Inayat Sanadi",
            "phone": "+91-9800000001",
            "role_id": admin_role.id,
        },
        # Customers
        {
            "email": "customer@fieldfix.com",
            "password": "Customer@123",
            "full_name": "Amit Patel",
            "phone": "+91-9800000010",
            "role_id": customer_role.id,
        },
        {
            "email": "customer2@fieldfix.com",
            "password": "Customer@123",
            "full_name": "Neha Gupta",
            "phone": "+91-9800000011",
            "role_id": customer_role.id,
        },
        # Technicians
        {
            "email": "raj.kumar@fieldfix.com",
            "password": "Tech@123",
            "full_name": "Raj Kumar",
            "phone": "+91-9800000020",
            "role_id": tech_role.id,
        },
        {
            "email": "suresh.verma@fieldfix.com",
            "password": "Tech@123",
            "full_name": "Suresh Verma",
            "phone": "+91-9800000021",
            "role_id": tech_role.id,
        },
        {
            "email": "anil.singh@fieldfix.com",
            "password": "Tech@123",
            "full_name": "Anil Singh",
            "phone": "+91-9800000022",
            "role_id": tech_role.id,
        },
        {
            "email": "deepak.sharma@fieldfix.com",
            "password": "Tech@123",
            "full_name": "Deepak Sharma",
            "phone": "+91-9800000023",
            "role_id": tech_role.id,
        },
    ]

    created_users = {}
    for user_data in users_data:
        existing = db.query(User).filter(User.email == user_data["email"]).first()
        if not existing:
            password = user_data.pop("password")
            user = User(**user_data, password_hash=hash_password(password))
            db.add(user)
            db.flush()
            created_users[user.email] = user
        else:
            created_users[existing.email] = existing

    db.commit()
    print("[OK] Demo users seeded")
    return created_users


def seed_technician_profiles(db: Session, users: dict):
    """Create technician profiles and assign skills."""
    ac_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Air Conditioning").first()
    elec_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Electrical").first()
    elev_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Elevator").first()
    gen_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Generator").first()
    plumb_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Plumbing").first()
    net_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Networking").first()
    hvac_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "HVAC").first()
    appliance_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Appliance Repair").first()

    technicians_data = [
        {
            "email": "raj.kumar@fieldfix.com",
            "employee_id": "TEC-001",
            "lat": 28.6139,  # Delhi area
            "lng": 77.2090,
            "skills": [
                (ac_cat, 5),
                (hvac_cat, 4),
                (appliance_cat, 3),
            ],
        },
        {
            "email": "suresh.verma@fieldfix.com",
            "employee_id": "TEC-002",
            "lat": 28.6200,
            "lng": 77.2150,
            "skills": [
                (elec_cat, 5),
                (gen_cat, 4),
            ],
        },
        {
            "email": "anil.singh@fieldfix.com",
            "employee_id": "TEC-003",
            "lat": 28.6100,
            "lng": 77.2300,
            "skills": [
                (elev_cat, 5),
                (elec_cat, 3),
            ],
        },
        {
            "email": "deepak.sharma@fieldfix.com",
            "employee_id": "TEC-004",
            "lat": 28.6300,
            "lng": 77.2000,
            "skills": [
                (plumb_cat, 5),
                (net_cat, 4),
                (appliance_cat, 3),
            ],
        },
    ]

    for tech_data in technicians_data:
        user = users.get(tech_data["email"])
        if user is None:
            continue

        existing = db.query(TechnicianProfile).filter(
            TechnicianProfile.user_id == user.id
        ).first()
        if existing:
            continue

        profile = TechnicianProfile(
            user_id=user.id,
            employee_id=tech_data["employee_id"],
            is_available=True,
            current_lat=tech_data["lat"],
            current_lng=tech_data["lng"],
        )
        db.add(profile)
        db.flush()

        for category, proficiency in tech_data["skills"]:
            if category:
                skill = TechnicianSkill(
                    technician_id=profile.id,
                    category_id=category.id,
                    proficiency_level=proficiency,
                )
                db.add(skill)

    db.commit()
    print("[OK] Technician profiles and skills seeded")


def seed_demo_service_requests(db: Session, users: dict):
    """Seed realistic service requests across various workflow stages."""
    # Check if requests already exist
    if db.query(ServiceRequest).first():
        print("[INFO] Service requests already exist, skipping")
        return

    # Categories
    ac_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Air Conditioning").first()
    elev_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Elevator").first()
    gen_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Generator").first()
    elec_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Electrical").first()
    plumb_cat = db.query(ServiceCategory).filter(ServiceCategory.name == "Plumbing").first()

    # Users
    cust1 = users.get("customer@fieldfix.com")
    cust2 = users.get("customer2@fieldfix.com")
    raj_user = users.get("raj.kumar@fieldfix.com")
    suresh_user = users.get("suresh.verma@fieldfix.com")
    anil_user = users.get("anil.singh@fieldfix.com")
    deepak_user = users.get("deepak.sharma@fieldfix.com")

    # Tech profiles
    raj_tech = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == raj_user.id).first() if raj_user else None
    suresh_tech = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == suresh_user.id).first() if suresh_user else None
    anil_tech = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == anil_user.id).first() if anil_user else None
    deepak_tech = db.query(TechnicianProfile).filter(TechnicianProfile.user_id == deepak_user.id).first() if deepak_user else None

    now = datetime.now(timezone.utc)

    # 1. SR-1001: IN_PROGRESS (AC, Raj Kumar)
    sr1 = ServiceRequest(
        request_id="SR-1001",
        customer_id=cust1.id,
        category_id=ac_cat.id if ac_cat else 1,
        title="AC Chiller Compressor Overheating",
        description="Central AHU-2 unit tripping breaker due to high discharge temperature and low airflow.",
        priority=Priority.HIGH,
        status=RequestStatus.IN_PROGRESS,
        location_address="Plot 42, Connaught Place, Block B, New Delhi",
        location_lat=28.6315,
        location_lng=77.2167,
        assigned_technician_id=raj_tech.id if raj_tech else None,
        created_at=now - timedelta(hours=3),
        updated_at=now - timedelta(minutes=45),
    )
    db.add(sr1)
    db.flush()

    # History for SR-1001
    for from_s, to_s, mins_ago, note in [
        (None, RequestStatus.NEW, 180, "Service request created by customer"),
        (RequestStatus.NEW, RequestStatus.ASSIGNED, 160, "Assigned to Raj Kumar"),
        (RequestStatus.ASSIGNED, RequestStatus.ACCEPTED, 150, "Accepted by technician"),
        (RequestStatus.ACCEPTED, RequestStatus.EN_ROUTE, 120, "Technician en route to site"),
        (RequestStatus.EN_ROUTE, RequestStatus.IN_PROGRESS, 60, "Arrived on site, diagnostics commenced"),
    ]:
        db.add(StatusHistory(
            service_request_id=sr1.id,
            from_status=from_s,
            to_status=to_s,
            changed_by_id=raj_user.id if to_s != RequestStatus.NEW else cust1.id,
            note=note,
            created_at=now - timedelta(minutes=mins_ago),
        ))

    db.add(ServiceNote(
        service_request_id=sr1.id,
        author_id=raj_user.id,
        content="Refrigerant pressure at 78 PSI. Inspecting TXV valve and cleaning condenser coils.",
        created_at=now - timedelta(minutes=45),
    ))

    # 2. SR-1002: EN_ROUTE (Elevator, Anil Singh)
    sr2 = ServiceRequest(
        request_id="SR-1002",
        customer_id=cust2.id,
        category_id=elev_cat.id if elev_cat else 3,
        title="Passenger Elevator Leveling Sensor Stuck",
        description="Lift #2 stopping 2 inches below floor landing on 4th floor. Intermittent door obstruction warning.",
        priority=Priority.URGENT,
        status=RequestStatus.EN_ROUTE,
        location_address="Tower 3, Cyber Greens, DLF Phase 3, Gurugram",
        location_lat=28.4986,
        location_lng=77.0928,
        assigned_technician_id=anil_tech.id if anil_tech else None,
        created_at=now - timedelta(hours=1, minutes=30),
        updated_at=now - timedelta(minutes=20),
    )
    db.add(sr2)
    db.flush()

    for from_s, to_s, mins_ago, note in [
        (None, RequestStatus.NEW, 90, "Reported by facility manager"),
        (RequestStatus.NEW, RequestStatus.ASSIGNED, 75, "Assigned to Anil Singh"),
        (RequestStatus.ASSIGNED, RequestStatus.ACCEPTED, 60, "Job accepted"),
        (RequestStatus.ACCEPTED, RequestStatus.EN_ROUTE, 25, "In transit with laser alignment board"),
    ]:
        db.add(StatusHistory(
            service_request_id=sr2.id,
            from_status=from_s,
            to_status=to_s,
            changed_by_id=anil_user.id if to_s != RequestStatus.NEW else cust2.id,
            note=note,
            created_at=now - timedelta(minutes=mins_ago),
        ))

    # 3. SR-1003: NEW / UNASSIGNED (Generator)
    sr3 = ServiceRequest(
        request_id="SR-1003",
        customer_id=cust1.id,
        category_id=gen_cat.id if gen_cat else 4,
        title="Diesel Generator Auto-Mains Failure (AMF Panel Error)",
        description="250 KVA DG set failed weekly scheduled exercise test. AMF controller reports solenoid starter timeout.",
        priority=Priority.HIGH,
        status=RequestStatus.NEW,
        location_address="Building 12, Nehru Place Commercial Complex, New Delhi",
        location_lat=28.5492,
        location_lng=77.2529,
        assigned_technician_id=None,
        created_at=now - timedelta(minutes=35),
        updated_at=now - timedelta(minutes=35),
    )
    db.add(sr3)
    db.flush()
    db.add(StatusHistory(
        service_request_id=sr3.id,
        from_status=None,
        to_status=RequestStatus.NEW,
        changed_by_id=cust1.id,
        note="Emergency generator ticket logged by building engineer",
        created_at=now - timedelta(minutes=35),
    ))

    # 4. SR-1004: COMPLETED (Electrical, Suresh Verma) - ready for customer review!
    sr4 = ServiceRequest(
        request_id="SR-1004",
        customer_id=cust2.id,
        category_id=elec_cat.id if elec_cat else 2,
        title="Server Room UPS Battery Bank Overheating",
        description="120 KVA Modular UPS showing cell imbalance and thermal alarm on string B.",
        priority=Priority.MEDIUM,
        status=RequestStatus.COMPLETED,
        location_address="Tech Park Block C, Okhla Phase 1, New Delhi",
        location_lat=28.5284,
        location_lng=77.2793,
        assigned_technician_id=suresh_tech.id if suresh_tech else None,
        created_at=now - timedelta(hours=6),
        updated_at=now - timedelta(minutes=15),
        completed_at=now - timedelta(minutes=15),
    )
    db.add(sr4)
    db.flush()

    for from_s, to_s, mins_ago, note in [
        (None, RequestStatus.NEW, 360, "Created"),
        (RequestStatus.NEW, RequestStatus.ASSIGNED, 340, "Assigned"),
        (RequestStatus.ASSIGNED, RequestStatus.ACCEPTED, 320, "Accepted"),
        (RequestStatus.ACCEPTED, RequestStatus.EN_ROUTE, 260, "En route"),
        (RequestStatus.EN_ROUTE, RequestStatus.IN_PROGRESS, 200, "In progress"),
        (RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED, 15, "Replaced 4 dead lead-acid cells and re-calibrated float charge voltage."),
    ]:
        db.add(StatusHistory(
            service_request_id=sr4.id,
            from_status=from_s,
            to_status=to_s,
            changed_by_id=suresh_user.id if to_s != RequestStatus.NEW else cust2.id,
            note=note,
            created_at=now - timedelta(minutes=mins_ago),
        ))

    # 5. SR-1005: CUSTOMER_CONFIRMED with 5-star review (Plumbing, Deepak Sharma)
    sr5 = ServiceRequest(
        request_id="SR-1005",
        customer_id=cust1.id,
        category_id=plumb_cat.id if plumb_cat else 5,
        title="Main Water Supply Pressure Valve Seepage",
        description="4-inch ductile iron valve flange leaking in utility shaft basement 1.",
        priority=Priority.LOW,
        status=RequestStatus.CUSTOMER_CONFIRMED,
        location_address="88 Vasant Vihar, Sector 4, New Delhi",
        location_lat=28.5672,
        location_lng=77.1611,
        assigned_technician_id=deepak_tech.id if deepak_tech else None,
        created_at=now - timedelta(days=1),
        updated_at=now - timedelta(hours=2),
        completed_at=now - timedelta(hours=3),
        confirmed_at=now - timedelta(hours=2),
    )
    db.add(sr5)
    db.flush()

    # Rating for SR-1005
    db.add(ServiceRating(
        service_request_id=sr5.id,
        rated_by_id=cust1.id,
        technician_id=deepak_tech.id if deepak_tech else None,
        rating=5,
        comment="Deepak arrived quickly and replaced the flange gasket with zero interruption to building water. Professional service!",
        created_at=now - timedelta(hours=2),
    ))

    # Seed Notifications
    db.add(Notification(
        user_id=cust2.id,
        title="Technician En Route",
        message="Anil Singh is en route to Tower 3 for elevator request SR-1002. Estimated arrival in 15 mins.",
        notification_type="TECHNICIAN_EN_ROUTE",
        reference_id=sr2.id,
        is_read=False,
    ))
    db.add(Notification(
        user_id=deepak_user.id,
        title="New Review Received",
        message="Amit Patel gave you ⭐⭐⭐⭐⭐ (5/5) for request SR-1005.",
        notification_type="RATING_RECEIVED",
        reference_id=sr5.id,
        is_read=True,
    ))

    db.commit()
    print("[OK] Demo service requests, ratings, and notifications seeded")


def run_seed():
    """Execute all seed functions."""
    print("\n[INFO] Seeding FieldFix database...\n")

    # Create tables
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed_roles(db)
        seed_categories(db)
        users = seed_users(db)
        seed_technician_profiles(db, users)
        seed_demo_service_requests(db, users)
        print("\n[SUCCESS] Database seeding complete!")
        print("\nDemo Credentials:")
        print("  Admin:      admin@fieldfix.com / Admin@123")
        print("  Customer:   customer@fieldfix.com / Customer@123")
        print("  Technician: raj.kumar@fieldfix.com / Tech@123")
        print()
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
