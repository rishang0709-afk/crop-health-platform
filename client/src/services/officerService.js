/**
 * officerService.js
 *
 * API methods for the Officer Surveillance Dashboard, calling /api/officer/* endpoints.
 */

import apiClient from './apiClient';

export const officerService = {
  /**
   * Fetch active regional hotspots.
   * @param {Object} filters - Supported filters: { crop, disease, from, to }
   */
  async getHotspots(filters = {}) {
    const params = new URLSearchParams();
    if (filters.crop) params.append('crop', filters.crop);
    if (filters.disease) params.append('disease', filters.disease);
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);

    return await apiClient.get('/officer/hotspots', { params });
  },

  /**
   * Fetch privacy-safe aggregated map reports.
   * @param {Object} filters - Supported filters: { crop, disease, risk }
   */
  async getMapReports(filters = {}) {
    const params = new URLSearchParams();
    if (filters.crop) params.append('crop', filters.crop);
    if (filters.disease) params.append('disease', filters.disease);
    if (filters.risk) params.append('risk', filters.risk);

    return await apiClient.get('/officer/map/reports', { params });
  }
};
