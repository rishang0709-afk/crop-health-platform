/**
 * apiClient.js
 *
 * Axios instance configured with base URL, authentication interceptor,
 * and standard error parsing.
 */

import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach bearer token if present in localStorage
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('crop_health_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: extract error information consistently
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // If backend returns a structured error response
    if (error.response && error.response.data) {
      const { data } = error.response;
      const errorObj = {
        status: error.response.status,
        code: data.error?.code || 'UNKNOWN_ERROR',
        message: data.error?.message || 'An unexpected error occurred',
        details: data.error?.details || null,
      };

      // If token expired or invalid (401), clean up token from localStorage
      if (error.response.status === 401) {
        localStorage.removeItem('crop_health_token');
      }

      return Promise.reject(errorObj);
    }

    return Promise.reject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: error.message || 'Unable to connect to the server',
      details: null,
    });
  }
);

export default apiClient;
