/**
 * HotspotListPage.jsx
 *
 * Renders the list of active regional hotspots with responsive desktop table and mobile cards.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { officerService } from '../../services/officerService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import EmptyState from '../../components/common/EmptyState';
import RiskBadge from '../../components/officer/RiskBadge';
import HotspotFilters from '../../components/officer/HotspotFilters';

export default function HotspotListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentFilters = useMemo(() => ({
    crop: searchParams.get('crop') || '',
    disease: searchParams.get('disease') || '',
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || ''
  }), [searchParams]);

  useEffect(() => {
    let isMounted = true;
    
    async function fetchHotspots() {
      setLoading(true);
      setError(null);
      try {
        const res = await officerService.getHotspots(currentFilters);
        if (isMounted) {
          if (res.success && Array.isArray(res.data?.hotspots)) {
            setHotspots(res.data.hotspots);
          } else {
            setError(res.error?.message || 'Failed to load hotspots.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.error?.message || err.message || 'An error occurred while fetching hotspots.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchHotspots();
    return () => { isMounted = false; };
  }, [currentFilters]);

  const handleFilterApply = (newFilters) => {
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    setSearchParams(params);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Regional Hotspots</h1>
        <p className="text-sm text-slate-500 mt-1">
          Active aggregated disease and pest outbreak signals across all monitored regions.
        </p>
      </div>

      <HotspotFilters 
        initialFilters={currentFilters} 
        onFilterApply={handleFilterApply} 
        showDates={true}
        showRisk={false}
      />

      {error && (
        <div className="mb-6">
          <ErrorAlert error={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {loading ? (
        <div className="py-16 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <LoadingSpinner size="md" message="Loading regional hotspots..." />
        </div>
      ) : hotspots.length === 0 ? (
        <EmptyState
          icon="🌍"
          title="No Hotspots Found"
          description="There are currently no active regional hotspots matching your filters."
          actionLabel="Clear Filters"
          onAction={() => setSearchParams({})}
        />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Crop</th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Diagnosis</th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Severity</th>
                    <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Risk</th>
                    <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Reports</th>
                    <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Validation Breakdown</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {hotspots.map((h, idx) => (
                    <tr key={h.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">{h.crop || 'Unknown'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">{h.disease || 'Unknown'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <RiskBadge level={h.riskLevel} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 text-right font-medium">
                        {h.averageRiskScore !== null && h.averageRiskScore !== undefined ? `${h.averageRiskScore}/100` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 text-right font-bold">{h.reportCount ?? 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 text-right">
                        {h.validationBreakdown ? (
                          <div className="flex items-center justify-end gap-2">
                            {(h.validationBreakdown.ACTIONABLE ?? 0) > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                Act: {h.validationBreakdown.ACTIONABLE}
                              </span>
                            )}
                            {(h.validationBreakdown.CONFIRMED ?? 0) > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                                Conf: {h.validationBreakdown.CONFIRMED}
                              </span>
                            )}
                            {(h.validationBreakdown.CORRECTED ?? 0) > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
                                Corr: {h.validationBreakdown.CORRECTED}
                              </span>
                            )}
                          </div>
                        ) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {hotspots.map((h, idx) => (
              <div key={h.id || idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{h.disease || 'Unknown'}</h3>
                    <p className="text-xs text-slate-500 font-medium">Crop: {h.crop || 'Unknown'}</p>
                  </div>
                  <RiskBadge level={h.riskLevel} />
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block">Report Count</span>
                    <span className="text-sm font-bold text-slate-800">{h.reportCount ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Average Risk</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {h.averageRiskScore !== null && h.averageRiskScore !== undefined ? `${h.averageRiskScore}/100` : 'N/A'}
                    </span>
                  </div>
                </div>

                {h.validationBreakdown && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 text-xs">
                    {(h.validationBreakdown.ACTIONABLE ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        Actionable: {h.validationBreakdown.ACTIONABLE}
                      </span>
                    )}
                    {(h.validationBreakdown.CONFIRMED ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                        Confirmed: {h.validationBreakdown.CONFIRMED}
                      </span>
                    )}
                    {(h.validationBreakdown.CORRECTED ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                        Corrected: {h.validationBreakdown.CORRECTED}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
