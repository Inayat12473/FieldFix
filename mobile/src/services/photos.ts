/**
 * FieldFix — Photos & Ratings Service.
 * Handles photo uploads (multipart/form-data), photo galleries, and customer ratings/reviews.
 */

import api from './api';
import { ServicePhoto, ServiceRating, PhotoType } from '../types';

export interface UploadPhotoParams {
  requestId: string;
  fileUri: string;
  photoType: PhotoType;
  caption?: string;
  fileName?: string;
}

export const photoService = {
  /**
   * Upload a photo for a service request.
   * Works on mobile with native FormData file objects.
   */
  async uploadPhoto(params: UploadPhotoParams): Promise<ServicePhoto> {
    const { requestId, fileUri, photoType, caption, fileName } = params;

    const formData = new FormData();
    const cleanFileName = fileName || `photo_${Date.now()}.jpg`;

    // React Native FormData format
    formData.append('photo', {
      uri: fileUri,
      type: 'image/jpeg',
      name: cleanFileName,
    } as any);

    formData.append('photo_type', photoType);
    if (caption) {
      formData.append('caption', caption);
    }

    const response = await api.post<ServicePhoto>(
      `/service-requests/${requestId}/photos`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * List photos for a service request, optionally filtered by type.
   */
  async listPhotos(requestId: string, photoType?: PhotoType): Promise<ServicePhoto[]> {
    const response = await api.get<ServicePhoto[]>(
      `/service-requests/${requestId}/photos`,
      {
        params: photoType ? { photo_type: photoType } : undefined,
      }
    );
    return response.data;
  },

  /**
   * Delete a photo by ID.
   */
  async deletePhoto(requestId: string, photoId: number): Promise<{ message: string; id: number }> {
    const response = await api.delete<{ message: string; id: number }>(
      `/service-requests/${requestId}/photos/${photoId}`
    );
    return response.data;
  },

  /**
   * Submit customer rating and review for a completed service request.
   */
  async submitRating(requestId: string, rating: number, comment?: string): Promise<ServiceRating> {
    const response = await api.post<ServiceRating>(
      `/service-requests/${requestId}/rating`,
      {
        rating,
        comment: comment?.trim() || undefined,
      }
    );
    return response.data;
  },

  /**
   * Get rating for a service request.
   */
  async getRating(requestId: string): Promise<ServiceRating | null> {
    const response = await api.get<ServiceRating | null>(
      `/service-requests/${requestId}/rating`
    );
    return response.data;
  },
};
