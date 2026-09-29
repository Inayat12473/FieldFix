/**
 * FieldFix — Axios API client with JWT interceptor.
 * Handles token attachment, 401 auto-logout, and base URL configuration.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:8000/api/v1';
  }

  // Detect Expo dev server IP (works for physical phones over Wi-Fi)
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:8000/api/v1`;
    }
  }

  // Fallback to active machine IP on local network
  return 'http://192.168.1.119:8000/api/v1';
};

export const BASE_URL = getBaseUrl();

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 (expired/invalid token)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired — clear stored auth data
      await AsyncStorage.removeItem('access_token');
      await AsyncStorage.removeItem('user_data');
      // The auth context will detect this and redirect to login
    }
    return Promise.reject(error);
  }
);

/**
 * Update the base URL at runtime (e.g., from settings).
 */
export function setApiBaseUrl(url: string): void {
  api.defaults.baseURL = url;
}

export default api;
