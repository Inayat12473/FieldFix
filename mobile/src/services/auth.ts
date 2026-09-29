/**
 * FieldFix — Authentication service.
 * Handles login, register, and profile API calls.
 */

import api from './api';
import { LoginRequest, RegisterRequest, TokenResponse, User } from '../types';

export const authService = {
  /**
   * Register a new user account.
   */
  async register(data: RegisterRequest): Promise<TokenResponse> {
    const response = await api.post<TokenResponse>('/auth/register', data);
    return response.data;
  },

  /**
   * Login with email and password.
   */
  async login(data: LoginRequest): Promise<TokenResponse> {
    const response = await api.post<TokenResponse>('/auth/login', data);
    return response.data;
  },

  /**
   * Get current user profile.
   */
  async getMe(): Promise<User> {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  /**
   * Update current user profile.
   */
  async updateProfile(data: { full_name?: string; phone?: string }): Promise<User> {
    const response = await api.patch<User>('/auth/me', data);
    return response.data;
  },
};
