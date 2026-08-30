/**
 * detectionService.js
 *
 * Detection API methods calling /api/detections endpoints.
 */

import apiClient from './apiClient';

export const detectionService = {
  async getDetections(params = {}) {
    const query = new URLSearchParams();
    if (params.fieldId) query.append('fieldId', params.fieldId);
    if (params.status) query.append('status', params.status);
    if (params.crop) query.append('crop', params.crop);
    if (params.from) query.append('from', params.from);
    if (params.to) query.append('to', params.to);

    const queryString = query.toString();
    const endpoint = queryString ? `/detections?${queryString}` : '/detections';
    return await apiClient.get(endpoint);
  },

  async getDetection(id) {
    return await apiClient.get(`/detections/${id}`);
  },

  async createDetection(formData) {
    // formData must be instance of FormData with image file, fieldId, and optional crop, growthStage, symptoms
    return await apiClient.post('/detections', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  async analyzeDetection(id) {
    return await apiClient.post(`/detections/${id}/analyze`);
  },
};
