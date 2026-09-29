/**
 * FieldFix — Service Request API service.
 */

import api from './api';
import {
  ServiceRequest,
  ServiceCategory,
} from '../types';

export interface CreateServiceRequestData {
  category_id: number;
  title: string;
  description: string;
  priority: string;
  location_address: string;
  location_lat?: number | null;
  location_lng?: number | null;
}

export interface DashboardStats {
  total_requests: number;
  open_requests: number;
  assigned_requests: number;
  in_progress_requests: number;
  completed_requests: number;
  unread_notifications: number;
}

export interface ServiceRequestListResponse {
  items: ServiceRequest[];
  total: number;
  page: number;
  per_page: number;
}

export interface StatusHistoryItem {
  id: number;
  from_status: string | null;
  to_status: string;
  changed_by_name: string;
  note: string | null;
  created_at: string;
}

export interface ServiceRequestDetail extends ServiceRequest {
  status_history: StatusHistoryItem[];
  note_count: number;
  photo_count: number;
  rating: number | null;
}

export interface ServiceNote {
  id: number;
  service_request_id: number;
  author_id: number;
  author_name: string;
  content: string;
  created_at: string;
}

export const serviceRequestService = {
  /**
   * Create a new service request.
   */
  async create(data: CreateServiceRequestData): Promise<ServiceRequest> {
    const response = await api.post<ServiceRequest>('/service-requests', data);
    return response.data;
  },

  /**
   * List service requests with optional filters.
   */
  async list(params?: {
    page?: number;
    per_page?: number;
    status?: string;
    priority?: string;
    category_id?: number;
  }): Promise<ServiceRequestListResponse> {
    const response = await api.get<ServiceRequestListResponse>('/service-requests', { params });
    return response.data;
  },

  /**
   * Get a single service request by request_id.
   */
  async get(requestId: string): Promise<ServiceRequestDetail> {
    const response = await api.get<ServiceRequestDetail>(`/service-requests/${requestId}`);
    return response.data;
  },

  /**
   * Update service request status.
   */
  async updateStatus(requestId: string, status: string, note?: string): Promise<ServiceRequestDetail> {
    const response = await api.post<ServiceRequestDetail>(
      `/service-requests/${requestId}/status`,
      { status, note }
    );
    return response.data;
  },

  /**
   * Get dashboard statistics.
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await api.get<DashboardStats>('/service-requests/dashboard/stats');
    return response.data;
  },

  /**
   * Add a note to a service request.
   */
  async addNote(requestId: string, content: string): Promise<ServiceNote> {
    const response = await api.post<ServiceNote>(
      `/service-requests/${requestId}/notes`,
      { content }
    );
    return response.data;
  },

  /**
   * List notes for a service request.
   */
  async listNotes(requestId: string): Promise<ServiceNote[]> {
    const response = await api.get<ServiceNote[]>(`/service-requests/${requestId}/notes`);
    return response.data;
  },

  /**
   * List service categories.
   */
  async getCategories(): Promise<ServiceCategory[]> {
    const response = await api.get<ServiceCategory[]>('/categories');
    return response.data;
  },
};
