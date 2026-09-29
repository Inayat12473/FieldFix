/**
 * FieldFix — Technician API service.
 */

import api from './api';
import { TechnicianProfile, TechnicianDashboardStats } from '../types';
import { ServiceRequestDetail } from './serviceRequests';

export interface TechnicianStatusUpdateData {
  is_available?: boolean;
  current_lat?: number;
  current_lng?: number;
}

export const technicianService = {
  /**
   * Get the current technician's profile with skills and stats.
   */
  async getProfile(): Promise<TechnicianProfile> {
    const response = await api.get<TechnicianProfile>('/technicians/me');
    return response.data;
  },

  /**
   * Update technician availability status and GPS coordinates.
   */
  async updateStatus(data: TechnicianStatusUpdateData): Promise<TechnicianProfile> {
    const response = await api.patch<TechnicianProfile>('/technicians/me/status', data);
    return response.data;
  },

  /**
   * Get technician dashboard KPI metrics.
   */
  async getStats(): Promise<TechnicianDashboardStats> {
    const response = await api.get<TechnicianDashboardStats>('/technicians/dashboard');
    return response.data;
  },

  /**
   * Get the currently active job (IN_PROGRESS, EN_ROUTE, or first ACCEPTED).
   */
  async getActiveJob(): Promise<ServiceRequestDetail | null> {
    const response = await api.get<ServiceRequestDetail | null>('/technicians/active-job');
    return response.data;
  },

  /**
   * List technicians with optional filters (category skill or availability).
   */
  async list(params?: { category_id?: number; available_only?: boolean }): Promise<TechnicianProfile[]> {
    const response = await api.get<TechnicianProfile[]>('/technicians', { params });
    return response.data;
  },

  /**
   * Assign a technician to a service request (Admin).
   */
  async assign(requestId: string, technicianId: number): Promise<ServiceRequestDetail> {
    const response = await api.post<ServiceRequestDetail>(
      `/service-requests/${requestId}/assign`,
      { technician_id: technicianId }
    );
    return response.data;
  },
};
