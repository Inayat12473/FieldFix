/**
 * FieldFix — Authentication store using Zustand.
 * Manages user state, JWT token persistence, and auth flow.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, LoginRequest, RegisterRequest } from '../types';
import { authService } from '../services/auth';
import { BASE_URL } from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  /**
   * Initialize auth state from AsyncStorage on app start.
   * Checks for stored token and validates it.
   */
  initialize: async () => {
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      const storedUser = await AsyncStorage.getItem('user_data');

      if (storedToken && storedUser) {
        try {
          // Validate token by calling /auth/me
          const user = await authService.getMe();
          set({ user, token: storedToken, isInitialized: true });
        } catch {
          // Token is invalid — clear storage
          await AsyncStorage.removeItem('access_token');
          await AsyncStorage.removeItem('user_data');
          set({ user: null, token: null, isInitialized: true });
        }
      } else {
        set({ isInitialized: true });
      }
    } catch {
      set({ isInitialized: true });
    }
  },

  /**
   * Login with email and password.
   * Persists token and user data to AsyncStorage.
   */
  login: async (data: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(data);

      await AsyncStorage.setItem('access_token', response.access_token);
      await AsyncStorage.setItem('user_data', JSON.stringify(response.user));

      set({
        user: response.user,
        token: response.access_token,
        isLoading: false,
      });
    } catch (err: any) {
      let message = 'Login failed. Please try again.';
      if (err?.response?.data?.detail) {
        message = typeof err.response.data.detail === 'string'
          ? err.response.data.detail
          : JSON.stringify(err.response.data.detail);
      } else if (err?.message === 'Network Error' || err?.code === 'ECONNABORTED' || !err?.response) {
        message = `Unable to connect to backend (${BASE_URL}). Ensure phone and PC are on the same Wi-Fi.`;
      }
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  /**
   * Register a new account.
   * Automatically logs in on success.
   */
  register: async (data: RegisterRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register(data);

      await AsyncStorage.setItem('access_token', response.access_token);
      await AsyncStorage.setItem('user_data', JSON.stringify(response.user));

      set({
        user: response.user,
        token: response.access_token,
        isLoading: false,
      });
    } catch (err: any) {
      let message = 'Registration failed. Please try again.';
      if (err?.response?.data?.detail) {
        message = typeof err.response.data.detail === 'string'
          ? err.response.data.detail
          : JSON.stringify(err.response.data.detail);
      } else if (err?.message === 'Network Error' || err?.code === 'ECONNABORTED' || !err?.response) {
        message = `Unable to connect to backend (${BASE_URL}). Ensure phone and PC are on the same Wi-Fi.`;
      }
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  /**
   * Logout — clear all auth state and storage.
   */
  logout: async () => {
    await AsyncStorage.removeItem('access_token');
    await AsyncStorage.removeItem('user_data');
    set({ user: null, token: null, error: null });
  },

  /**
   * Clear error message.
   */
  clearError: () => set({ error: null }),
}));
