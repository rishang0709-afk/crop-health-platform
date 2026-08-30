/**
 * SurveillanceMapPage.jsx
 *
 * Page hosting the regional surveillance hotspot map with filters.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { officerService } from '../../services/officerService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import HotspotFilters from '../../components/officer/HotspotFilters';
import HotspotMap from '../../components/officer/HotspotMap';

export default function SurveillanceMapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentFilters = useMemo(() => ({
    crop: searchParams.get('crop') || '',
    disease: searchParams.get('disease') || '',
    risk: searchParams.get('risk') || '',
  }), [searchParams]);

  useEffect(() => {
    let isMounted = true;
    
    async function fetchMapReports() {
      setLoading(true);
      setError(null);
      try {
        const res = await officerService.getMapReports(currentFilters);
        if (isMounted) {
          if (res.success && Array.isArray(res.data?.mapReports)) {
            setReports(res.data.mapReports);
          } else {
            setError(res.error?.message || 'Failed to load map data.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.error?.message || err.message || 'An error occurred while fetching map reports.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchMapReports();
    return () => { isMounted = false; };
  }, [currentFilters]);

  const handleFilterApply = (newFilters) => {
    const params = new URLSearchParams();
    if (newFilters.crop) params.set('crop', newFilters.crop);
    if (newFilters.disease) params.set('disease', newFilters.disease);
    if (newFilters.risk) params.set('risk', newFilters.risk);
    setSearchParams(params);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Surveillance Map</h1>
        <p className="text-sm text-slate-500 mt-1">
          Geographic visualization of privacy-safe regional outbreak signals.
        </p>
      </div>

      <HotspotFilters 
        initialFilters={currentFilters} 
        onFilterApply={handleFilterApply} 
        showDates={false}
        showRisk={true}
      />

      {error && (
        <div className="mb-6">
          <ErrorAlert error={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {loading ? (
        <div className="py-24 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center">
          <LoadingSpinner size="lg" message="Loading regional surveillance map..." />
        </div>
      ) : (
        <HotspotMap reports={reports} />
      )}
    </div>
  );
}
