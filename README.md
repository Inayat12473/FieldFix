# FieldFix — Field Service & Maintenance Management System

A production-style full-stack mobile application for companies that maintain ACs, elevators, generators, electrical equipment, and other assets.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Mobile     │────▶│  FastAPI     │────▶│  PostgreSQL  │
│  (Expo/RN)   │◀────│  Backend     │◀────│   Database   │
└─────────────┘     └─────────────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │ Admin Web   │
                    │ Dashboard   │
                    └─────────────┘
```

## Tech Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Mobile   | React Native, Expo, TypeScript, Zustand |
| Backend  | Python, FastAPI, SQLAlchemy, Pydantic   |
| Database | PostgreSQL                              |
| Auth     | JWT (python-jose), bcrypt               |
| Admin    | Web Dashboard (Phase 8)                 |

## Project Structure

```
FieldFix/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/          # Route handlers & dependencies
│   │   ├── core/         # Config, security utilities
│   │   ├── database/     # DB session, seed data
│   │   ├── models/       # SQLAlchemy models
│   │   └── schemas/      # Pydantic schemas
│   ├── alembic/          # Database migrations
│   ├── tests/            # pytest test suite
│   ├── uploads/          # File upload storage
│   ├── .env.example      # Environment template
│   └── requirements.txt  # Python dependencies
├── mobile/               # React Native (Expo) app
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── constants/    # Theme, design tokens
│   │   ├── screens/      # Screen components
│   │   ├── services/     # API client & service modules
│   │   ├── store/        # Zustand state management
│   │   └── types/        # TypeScript type definitions
│   ├── App.tsx           # Main entry point
│   └── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Expo Go app on your phone (for mobile testing)

### 1. Database Setup

```bash
# Create PostgreSQL database and user
psql -U postgres
CREATE USER fieldfix_user WITH PASSWORD 'fieldfix_pass';
CREATE DATABASE fieldfix_db OWNER fieldfix_user;
GRANT ALL PRIVILEGES ON DATABASE fieldfix_db TO fieldfix_user;
\q
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\activate

# Activate (macOS/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# Seed the database with demo data
python -m app.database.seed

# Run the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 3. Mobile Setup

```bash
cd mobile

# Install dependencies
npm install

# Start Expo dev server
npm start
```

Scan the QR code with Expo Go on your phone, or press:
- `a` for Android emulator
- `i` for iOS simulator
- `w` for web browser

> **Note:** For Expo Go on a physical device, update the API base URL in
> `src/services/api.ts` to use your computer's local network IP address
> instead of `localhost`.

## Demo Credentials

| Role       | Email                      | Password     |
|------------|----------------------------|--------------|
| Admin      | admin@fieldfix.com         | Admin@123    |
| Customer   | customer@fieldfix.com      | Customer@123 |
| Customer 2 | customer2@fieldfix.com     | Customer@123 |
| Technician | raj.kumar@fieldfix.com     | Tech@123     |
| Technician | suresh.verma@fieldfix.com  | Tech@123     |
| Technician | anil.singh@fieldfix.com    | Tech@123     |
| Technician | deepak.sharma@fieldfix.com | Tech@123     |

## Complete API Reference

| Domain | Method | Endpoint | Description | Auth |
|---|---|---|---|---|
| **Health** | GET | `/` | Root service health & dashboard link | Public |
| **Health** | GET | `/api/v1/health` | API health check | Public |
| **Admin** | GET | `/admin/` | Enterprise Dispatcher Web Dashboard | Public |
| **Auth** | POST | `/api/v1/auth/register` | Register new user (customer / technician) | Public |
| **Auth** | POST | `/api/v1/auth/login` | JWT Login with email & password | Public |
| **Auth** | GET | `/api/v1/auth/me` | Fetch authenticated user profile | Required |
| **Auth** | PATCH | `/api/v1/auth/me` | Update user profile & contact info | Required |
| **Categories** | GET | `/api/v1/categories` | List active service categories | Public |
| **Requests** | POST | `/api/v1/service-requests` | Create service request | Customer |
| **Requests** | GET | `/api/v1/service-requests` | List filtered service requests | Required |
| **Requests** | GET | `/api/v1/service-requests/{id}` | Detailed request view with audit timeline | Required |
| **Requests** | POST | `/api/v1/service-requests/{id}/status` | Transition status in workflow | Required |
| **Requests** | POST | `/api/v1/service-requests/{id}/assign` | Assign technician to request | Admin |
| **Requests** | POST | `/api/v1/service-requests/{id}/notes` | Log service observation note | Required |
| **Requests** | GET | `/api/v1/service-requests/{id}/notes` | List service notes | Required |
| **Photos** | POST | `/api/v1/service-requests/{id}/photos` | Upload before/after/issue photo | Required |
| **Photos** | GET | `/api/v1/service-requests/{id}/photos` | List attached service photos | Required |
| **Photos** | DELETE | `/api/v1/service-requests/{id}/photos/{photo_id}` | Delete service photo | Uploader/Admin |
| **Ratings** | POST | `/api/v1/service-requests/{id}/rating` | Submit 5-star review & confirm service | Customer |
| **Ratings** | GET | `/api/v1/service-requests/{id}/rating` | Fetch rating & feedback | Required |
| **Location** | GET | `/api/v1/service-requests/{id}/tracking` | Live GPS tracking & Haversine ETA | Required |
| **Location** | POST | `/api/v1/technicians/me/location` | Technician GPS coordinate ping | Technician |
| **Technicians** | GET | `/api/v1/technicians` | List technician fleet roster | Required |
| **Technicians** | GET | `/api/v1/technicians/me` | Fetch technician profile with skills | Technician |
| **Technicians** | PATCH | `/api/v1/technicians/me/status` | Toggle online availability status | Technician |
| **Notifications** | GET | `/api/v1/notifications` | User notification inbox | Required |
| **Notifications** | PATCH | `/api/v1/notifications/{id}/read` | Mark notification as read | Required |
| **Notifications** | POST | `/api/v1/notifications/push-token` | Register Expo push token | Required |

## Running Tests

```bash
cd backend
.\venv\Scripts\activate    # Windows
pytest tests/ -v
```

## Mobile Type Validation

```bash
cd mobile
npx tsc --noEmit
```

## Development Phases & Deliverables

1. ✅ **Phase 1** — Database schema, JWT auth, RBAC, seed data, mobile architecture, Zustand store
2. ✅ **Phase 2** — Customer request creation, category selection, customer dashboard, audit timeline
3. ✅ **Phase 3** — Technician dashboard, auto/manual assignment, acceptance workflow, decline modals
4. ✅ **Phase 4** — Location services, GPS pings, Haversine formula, live transit tracking radar, ETA
5. ✅ **Phase 5** — Push token registration, in-app notification center, live status event triggers
6. ✅ **Phase 6** — Multipart photo uploads (before & after), service notes, 5-star customer ratings
7. ✅ **Phase 7** — Offline synchronization queue engine, AsyncStorage persistence, dead-zone simulation
8. ✅ **Phase 8** — Enterprise Admin Dispatcher & Fleet Operations Web Dashboard (`/admin/`)
9. ✅ **Phase 9** — Production Polish, Alembic Baseline Migrations, Multi-Stage Seed Dataset & Full 16-Step E2E Lifecycle Testing (62/62 tests passing, 0 TypeScript errors)

---

## License

Private — Enterprise Portfolio Project

