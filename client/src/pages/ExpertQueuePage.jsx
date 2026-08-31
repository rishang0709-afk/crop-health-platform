/**
 * ExpertQueuePage.jsx
 *
 * Agricultural Extension Expert Review Queue dashboard.
 * Lists detections currently waiting in EXPERT_REVIEW_REQUIRED.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import expertService from '../services/expertService';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import EmptyState from '../components/common/EmptyState';

export default function ExpertQueuePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cropFilter, setCropFilter] = useState('');

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (cropFilter) params.crop = cropFilter;
      const res = await expertService.getQueue(params);
      if (res.success && res.data) {
        setDetections(res.data.detections || []);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [cropFilter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 antialiased">
      {/* Expert Header */}
      <header className="bg-emerald-800 border-b border-emerald-900 shadow-xs sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔬</span>
              <div>
                <h1 className="text-white font-bold text-base leading-tight">Crop Health Expert Portal</h1>
                <p className="text-xs text-emerald-200">Agricultural Extension Verification Queue</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-emerald-200">Logged in as</p>
                <p className="text-sm text-white font-semibold">{user?.name || 'Expert'}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Banner */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Pending Verification Queue</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Review AI diagnostic cases flagged for expert oversight before field intervention recommendations are finalized.
            </p>
          </div>

          {/* Crop Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="cropFilter" className="text-xs font-semibold text-slate-600">Filter Crop:</label>
            <select
              id="cropFilter"
              value={cropFilter}
              onChange={(e) => setCropFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 shadow-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
            >
              <option value="">All Crops</option>
              <option value="tomato">Tomato</option>
              <option value="potato">Potato</option>
            </select>
            <button
              type="button"
              onClick={fetchQueue}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              title="Refresh Queue"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {error && <ErrorAlert error={error} onDismiss={() => setError(null)} className="mb-6" />}

        {loading ? (
          <LoadingSpinner size="lg" message="Loading expert review queue..." />
        ) : detections.length === 0 ? (
          <EmptyState
            icon="✅"
            title="Queue is clear"
            description="There are currently no crop diagnostic cases waiting for expert verification."
            actionLabel="Refresh List"
            onAction={fetchQueue}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {detections.map((detection) => (
              <div
                key={detection.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-emerald-500/60 transition-all"
              >
                <div>
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100 mb-4 border border-slate-200/60">
                    <img
                      src={detection.image?.url}
                      alt={detection.crop}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = 'https://placehold.co/400x250?text=No+Image';
                      }}
                    />
                    <div className="absolute top-2 right-2">
                      <StatusBadge status={detection.status} />
                    </div>
                  </div>

                  <div className="mb-3">
                    <span className="inline-block px-2.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-md capitalize mb-1">
                      {detection.crop}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 leading-tight">
                      {detection.prediction?.name || 'Uncertain / Unknown Condition'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Model Confidence: <span className="font-semibold text-slate-700">{detection.prediction?.confidence ? `${(detection.prediction.confidence * 100).toFixed(1)}%` : 'N/A'}</span>
                    </p>
                  </div>

                  {detection.symptoms && detection.symptoms.length > 0 && (
                    <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl mb-4 border border-slate-100">
                      <span className="font-semibold text-slate-700">Symptoms: </span>
                      {Array.isArray(detection.symptoms) ? detection.symptoms.join(', ') : detection.symptoms}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    Submitted: {new Date(detection.createdAt).toLocaleDateString()}
                  </span>
                  <Link
                    to={`/expert/reviews/${detection.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
                  >
                    <span>Review Case</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
