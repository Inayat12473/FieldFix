/**
 * FieldFix — Location & Live Tracking API Service.
 */

import api from './api';
import { TrackingInfo } from '../types';

export const locationService = {
  /**
   * Get live technician tracking and ETA for a service request.
   */
  async getTracking(requestId: string): Promise<TrackingInfo> {
    const response = await api.get<TrackingInfo>(`/service-requests/${requestId}/tracking`);
    return response.data;
  },

  /**
   * Send technician GPS location ping to backend.
   */
  async pingLocation(lat: number, lng: number): Promise<{ status: string; lat: number; lng: number }> {
    const response = await api.post<{ status: string; lat: number; lng: number }>(
      '/technicians/me/location',
      { lat, lng }
    );
    return response.data;
  },

  /**
   * Simulate a realistic GPS waypoint moving technician towards destination.
   * Useful for live demonstrations and testing.
   */
  calculateNextWaypoint(
    currentLat: number,
    currentLng: number,
    destLat: number,
    destLng: number,
    progress: number = 0.2
  ): { lat: number; lng: number } {
    const newLat = currentLat + (destLat - currentLat) * progress;
    const newLng = currentLng + (destLng - currentLng) * progress;
    return {
      lat: Math.round(newLat * 10000) / 10000,
      lng: Math.round(newLng * 10000) / 10000,
    };
  },
};
