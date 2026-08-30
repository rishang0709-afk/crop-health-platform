/**
 * followUpService.js
 *
 * Axios API client methods for Follow-Up observations on Detections.
 *
 * Specification: Docs/API.md Sections 28 & 29
 */

import apiClient from './apiClient';

export const followUpService = {
  /**
   * Retrieves all follow-up observations for a detection.
   *
   * @param {string} detectionId
   * @returns {Promise<AxiosResponse<{ success: boolean, data: { followUps: Array } }>>}
   */
  async getFollowUps(detectionId) {
    return await apiClient.get(`/detections/${detectionId}/follow-ups`);
  },

  /**
   * Records a new follow-up observation with optional photo.
   *
   * @param {string} detectionId
   * @param {FormData} formData (contains status, optional observation, optional image)
   * @returns {Promise<AxiosResponse<{ success: boolean, data: { followUp: Object } }>>}
   */
  async createFollowUp(detectionId, formData) {
    return await apiClient.post(`/detections/${detectionId}/follow-ups`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};
