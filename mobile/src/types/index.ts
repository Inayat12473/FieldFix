/**
 * FieldFix — Shared TypeScript type definitions.
 */

// ─── User & Auth ───────────────────────────────────────────

export type UserRole = 'customer' | 'technician' | 'admin';

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role?: 'customer' | 'technician';
}

// ─── Service Categories ────────────────────────────────────

export interface ServiceCategory {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
}

// ─── Service Request (Phase 2+) ────────────────────────────

export type RequestStatus =
  | 'NEW'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CUSTOMER_CONFIRMED'
  | 'CLOSED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface ServiceRequest {
  id: number;
  request_id: string; // e.g., SR-1001
  category_id: number;
  category_name: string;
  category_icon: string | null;
  customer_id: number;
  customer_name: string;
  title: string;
  description: string;
  priority: Priority;
  status: RequestStatus;
  location_address: string;
  location_lat: number | null;
  location_lng: number | null;
  assigned_technician_id: number | null;
  assigned_technician_name: string | null;
  assigned_technician_phone: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  confirmed_at: string | null;
}

// ─── Technician Types ──────────────────────────────────────

export interface TechnicianSkill {
  id: number;
  category_id: number;
  category_name: string;
  proficiency_level: number;
}

export interface TechnicianProfile {
  id: number;
  user_id: number;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_available: boolean;
  current_lat: number | null;
  current_lng: number | null;
  last_location_update: string | null;
  skills: TechnicianSkill[];
  completed_jobs_count: number;
  average_rating: number;
}

export interface TechnicianDashboardStats {
  assigned_count: number;
  active_count: number;
  completed_today: number;
  total_completed: number;
  is_available: boolean;
  average_rating: number;
}

// ─── Location & Tracking Types ──────────────────────────────

export interface TrackingInfo {
  service_request_id: string;
  status: string;
  is_en_route: boolean;
  technician_name: string | null;
  technician_phone: string | null;
  technician_lat: number | null;
  technician_lng: number | null;
  last_location_update: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_address: string;
  distance_km: number | null;
  estimated_duration_minutes: number | null;
}

// ─── Notification Types ─────────────────────────────────────

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  reference_id: number | null;
  is_read: boolean;
  created_at: string;
}

// ─── Photo & Rating Types (Phase 6) ─────────────────────────

export type PhotoType = 'before' | 'after' | 'issue';

export interface ServicePhoto {
  id: number;
  service_request_id: number;
  uploaded_by_id: number;
  uploaded_by_name: string;
  photo_type: PhotoType;
  file_name: string;
  file_url: string;
  file_size: number | null;
  caption: string | null;
  created_at: string;
}

export interface ServiceRating {
  id: number;
  service_request_id: number;
  rated_by_id: number;
  rated_by_name: string;
  technician_id: number | null;
  technician_name: string | null;
  rating: number; // 1-5
  comment: string | null;
  created_at: string;
}

export interface ServiceRatingCreate {
  rating: number;
  comment?: string;
}

export interface ServiceNote {
  id: number;
  service_request_id: number;
  author_id: number;
  author_name: string;
  content: string;
  created_at: string;
}

// ─── API Response ──────────────────────────────────────────

export interface ApiError {
  detail: string;
}



