/**
 * DetectionListPage.jsx
 *
 * Comprehensive detection history for the farmer, with filter controls by Field,
 * Status, and Crop name.
 */

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { detectionService } from '../services/detectionService';
import { fieldService } from '../services/fieldService';
import DetectionCard from '../components/detections/DetectionCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import EmptyState from '../components/common/EmptyState';

export default function DetectionListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [detections, setDetections] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const selectedFieldId = searchParams.get('fieldId') || '';
  const selectedStatus = searchParams.get('status') || '';
  const selectedCrop = searchParams.get('crop') || '';

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [detectionsRes, fieldsRes] = await Promise.all([
          detectionService.getDetections({
            fieldId: selectedFieldId || undefined,
            status: selectedStatus || undefined,
            crop: selectedCrop || undefined,
          }),
          fieldService.getFields(),
        ]);

        if (isMounted) {
          setDetections(detectionsRes.data?.detections || []);
          setFields(fieldsRes.data?.fields || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [selectedFieldId, selectedStatus, selectedCrop]);

  const handleFilterChange = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  };

  const handleResetFilters = () => {
    setSearchParams({});
  };

  const fieldNameMap = fields.reduce((acc, f) => {
    acc[f.id] = f.name;
    return acc;
  }, {});

  if (loading && detections.length === 0) {
    return <LoadingSpinner fullPage size="lg" message="Loading detection history..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Detection History</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review past crop image diagnoses, confidence scores, and expert verification statuses.
          </p>
        </div>

        <Link
          to="/detections/new"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors self-start sm:self-auto"
        >
          <span>📷</span>
          <span>Analyze New Crop</span>
        </Link>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* Field Filter */}
        <div>
          <label htmlFor="fieldFilter" className="block text-[11px] font-semibold text-slate-500 mb-1">
            Filter by Field
          </label>
          <select
            id="fieldFilter"
            value={selectedFieldId}
            onChange={(e) => handleFilterChange('fieldId', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white"
          >
            <option value="">All Fields</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter (supports all canonical statuses) */}
        <div>
          <label htmlFor="statusFilter" className="block text-[11px] font-semibold text-slate-500 mb-1">
            Filter by Status
          </label>
          <select
            id="statusFilter"
            value={selectedStatus}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white"
          >
            <option value="">All Statuses</option>
            <option value="ACTIONABLE">Actionable (Ready)</option>
            <option value="EXPERT_REVIEW_REQUIRED">Expert Review Required</option>
            <option value="EXPERT_REVIEW_IN_PROGRESS">Expert Review in Progress</option>
            <option value="CONFIRMED">Expert Confirmed</option>
            <option value="CORRECTED">Expert Corrected</option>
            <option value="AI_ANALYZING">AI Analyzing</option>
            <option value="AI_FAILED">Analysis Failed</option>
            <option value="CREATED">Pending Analysis</option>
            <option value="FOLLOW_UP_REQUIRED">Follow-up Required</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {/* Crop Filter */}
        <div>
          <label htmlFor="cropFilter" className="block text-[11px] font-semibold text-slate-500 mb-1">
            Filter by Crop
          </label>
          <input
            type="text"
            id="cropFilter"
            value={selectedCrop}
            onChange={(e) => handleFilterChange('crop', e.target.value)}
            placeholder="e.g. Tomato, Potato"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white"
          />
        </div>

        {/* Reset */}
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleResetFilters}
            className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Detections Grid */}
      {detections.length === 0 ? (
        <EmptyState
          icon="📊"
          title="No detections found"
          description="There are no detection reports matching your selected filter criteria."
          actionLabel="Analyze a Crop"
          onAction={() => window.location.assign('/detections/new')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {detections.map((detection) => (
            <DetectionCard
              key={detection.id}
              detection={detection}
              fieldName={fieldNameMap[detection.fieldId]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
