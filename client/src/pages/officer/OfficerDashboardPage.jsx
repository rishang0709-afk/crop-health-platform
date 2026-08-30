/**
 * OfficerDashboardPage.jsx
 *
 * Dashboard landing page calculating metrics from the /api/officer/hotspots endpoint.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { officerService } from '../../services/officerService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import EmptyState from '../../components/common/EmptyState';
import RiskBadge from '../../components/officer/RiskBadge';

export default function OfficerDashboardPage() {
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchDashboardData() {
      try {
        const res = await officerService.getHotspots({});
        if (isMounted) {
          if (res.success && Array.isArray(res.data?.hotspots)) {
            setHotspots(res.data.hotspots);
          } else {
            setError(res.error?.message || 'Failed to load dashboard data.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.error?.message || err.message || 'An error occurred while loading dashboard.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchDashboardData();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return <LoadingSpinner fullPage size="lg" message="Loading surveillance dashboard..." />;
  }

  // Client-side calculations
  const totalHotspots = hotspots.length;
  const criticalHotspots = hotspots.filter(h => h && h.riskLevel === 'CRITICAL').length;
  
  const uniqueCrops = new Set(hotspots.map(h => h?.crop).filter(Boolean));
  const uniqueDiagnoses = new Set(hotspots.map(h => h?.disease).filter(Boolean));

  // Sort by highest report count for "Top Hotspots" preview
  const topHotspots = [...hotspots]
    .filter(Boolean)
    .sort((a, b) => (b.reportCount || 0) - (a.reportCount || 0))
    .slice(0, 3);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Surveillance Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Regional overview of active crop health outbreaks and surveillance intelligence.
        </p>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorAlert error={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">🌍</span>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Hotspots</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalHotspots}</p>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">🚨</span>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Critical Outbreaks</h3>
          </div>
          <p className="text-3xl font-bold text-red-600">{criticalHotspots}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">🌾</span>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Crops Affected</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">{uniqueCrops.size}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">🦠</span>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Threats Identified</h3>
          </div>
          <p className="text-3xl font-bold text-slate-900">{uniqueDiagnoses.size}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-5">Surveillance Navigation</h2>
          <div className="space-y-3.5">
            <Link 
              to="/officer/map"
              className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-blue-50/70 hover:border-blue-200 transition-all group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 bg-blue-100/80 rounded-xl flex items-center justify-center text-xl shadow-2xs">
                  🗺️
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-700">Surveillance Map</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Explore geographic distribution of privacy-safe signals</p>
                </div>
              </div>
              <span className="text-slate-400 group-hover:text-blue-600 font-bold transition-transform group-hover:translate-x-0.5">→</span>
            </Link>

            <Link 
              to="/officer/hotspots"
              className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300 transition-all group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 bg-slate-200/80 rounded-xl flex items-center justify-center text-xl shadow-2xs">
                  📋
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Hotspot Directory</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Filter tabular outbreak data and validate breakdown</p>
                </div>
              </div>
              <span className="text-slate-400 group-hover:text-slate-700 font-bold transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
        </div>

        {/* Highest Volume Hotspots */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Highest Volume Hotspots</h2>
              <Link to="/officer/hotspots" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                View All Hotspots →
              </Link>
            </div>

            {topHotspots.length === 0 ? (
              <EmptyState
                icon="🌾"
                title="No Active Outbreaks"
                description="No regional hotspots currently qualify under surveillance thresholds."
                className="py-6 border-none bg-slate-50/60"
              />
            ) : (
              <div className="space-y-3">
                {topHotspots.map((h, i) => (
                  <div key={h.id || i} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">{h.disease || 'Unknown'}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Crop: <span className="font-medium text-slate-700">{h.crop || 'Unknown'}</span></p>
                    </div>
                    <div className="text-right space-y-1">
                      <RiskBadge level={h.riskLevel} />
                      <p className="text-xs text-slate-500 font-semibold">{h.reportCount || 0} reports</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
