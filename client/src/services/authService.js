/**
 * authService.js
 *
 * Authentication API methods calling /api/auth endpoints.
 */

import apiClient from './apiClient';

export const authService = {
  async register(userData) {
    // userData: { name, email, password, role: 'farmer', language }
    return await apiClient.post('/auth/register', userData);
  },

  async login(credentials) {
    // credentials: { email, password }
    return await apiClient.post('/auth/login', credentials);
  },

  async getMe() {
    return await apiClient.get('/auth/me');
  },

  async logout() {
    try {
      return await apiClient.post('/auth/logout');
    } finally {
      localStorage.removeItem('crop_health_token');
    }
  },
};
