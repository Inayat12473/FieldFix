/**
 * FieldFix — Notification API Service.
 */

import api from './api';
import { AppNotification } from '../types';

export const notificationService = {
  /**
   * List notifications for the authenticated user.
   */
  async list(unreadOnly: boolean = false): Promise<AppNotification[]> {
    const response = await api.get<AppNotification[]>('/notifications', {
      params: { unread_only: unreadOnly },
    });
    return response.data;
  },

  /**
   * Mark a single notification as read.
   */
  async markAsRead(id: number): Promise<AppNotification> {
    const response = await api.patch<AppNotification>(`/notifications/${id}/read`);
    return response.data;
  },

  /**
   * Mark all notifications as read for current user.
   */
  async markAllRead(): Promise<void> {
    await api.post('/notifications/read-all');
  },

  /**
   * Register a device push notification token.
   */
  async registerPushToken(token: string, deviceType: string = 'mobile'): Promise<{ status: string }> {
    const response = await api.post<{ status: string }>('/notifications/push-token', {
      token,
      device_type: deviceType,
    });
    return response.data;
  },

  /**
   * Unregister a device push notification token on sign out.
   */
  async unregisterPushToken(token: string): Promise<{ status: string }> {
    const response = await api.delete<{ status: string }>('/notifications/push-token', {
      data: { token },
    });
    return response.data;
  },
};
