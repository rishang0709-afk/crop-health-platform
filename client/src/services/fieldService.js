/**
 * fieldService.js
 *
 * Field CRUD API methods calling /api/fields endpoints.
 */

import apiClient from './apiClient';

export const fieldService = {
  async getFields() {
    return await apiClient.get('/fields');
  },

  async getField(id) {
    return await apiClient.get(`/fields/${id}`);
  },

  async createField(fieldData) {
    return await apiClient.post('/fields', fieldData);
  },

  async updateField(id, fieldData) {
    return await apiClient.patch(`/fields/${id}`, fieldData);
  },

  async updateFieldStatus(id, isActive) {
    return await apiClient.patch(`/fields/${id}/status`, { isActive });
  },
};
