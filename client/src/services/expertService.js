/**
 * expertService.js
 *
 * API client methods for the Agricultural Expert Review workflow.
 * Interacts with /api/expert-reviews/* endpoints.
 */

import apiClient from './apiClient';

export const expertService = {
  /**
   * Fetch detections waiting in the expert review queue.
   */
  async getQueue(params = {}) {
    return await apiClient.get('/expert-reviews/queue', { params });
  },

  /**
   * Fetch review and detection details.
   */
  async getDetails(detectionId) {
    return await apiClient.get(`/expert-reviews/${detectionId}`);
  },

  /**
   * Claim a detection for expert review.
   */
  async claim(detectionId) {
    return await apiClient.post(`/expert-reviews/${detectionId}/claim`);
  },

  /**
   * Confirm the original AI diagnosis.
   */
  async confirm(detectionId, data = {}) {
    return await apiClient.post(`/expert-reviews/${detectionId}/confirm`, data);
  },

  /**
   * Correct the AI diagnosis with expert findings.
   */
  async correct(detectionId, data) {
    return await apiClient.post(`/expert-reviews/${detectionId}/correct`, data);
  },
};

export default expertService;
