/**
 * DetectionDetailPage.jsx
 *
 * Full inspection view for a single detection report. Displays crop photo,
 * field context, authoritative status banner, and structured AI diagnosis results.
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { detectionService } from '../services/detectionService';
import { fieldService } from '../services/fieldService';
import StatusBadge from '../components/common/StatusBadge';
import DetectionStatusBanner from '../components/detections/DetectionStatusBanner';
import AnalysisResultView from '../components/detections/AnalysisResultView';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import EmptyState from '../components/common/EmptyState';
import FollowUpTimeline from '../components/followUps/FollowUpTimeline';

export default function DetectionDetailPage() {
  const { id } = useParams();

  const [detection, setDetection] = useState(null);
  const [field, setField] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const res = await detectionService.getDetection(id);
        if (!isMounted) return;

        const det = res.data?.detection;
        setDetection(det);

        if (det?.fieldId) {
          try {
            const fieldRes = await fieldService.getField(det.fieldId);
            if (isMounted) {
              setField(fieldRes.data?.field || null);
            }
          } catch {
            // Non-blocking if field lookup fails
          }
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
  }, [id]);

  const handleRunAnalysis = async () => {
    if (!detection) return;

    setAnalyzing(true);
    setError(null);

    try {
      const res = await detectionService.analyzeDetection(detection.id);
      if (res.data?.detection) {
        setDetection(res.data.detection);
      } else {
        const refreshed = await detectionService.getDetection(id);
        setDetection(refreshed.data?.detection);
      }
    } catch (err) {
      setError(err);
      try {
        const refreshed = await detectionService.getDetection(id);
        setDetection(refreshed.data?.detection);
      } catch {
        // Suppress secondary reload error
      }
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullPage size="lg" message="Loading detection report..." />;
  }

  if (!detection) {
    return (
      <EmptyState
        icon="🔍"
        title="Detection report not found"
        description="The requested crop detection could not be found or you do not have permission to view it."
        actionLabel="Back to History"
        onAction={() => window.location.assign('/detections')}
      />
    );
  }

  const canAnalyze = ['CREATED', 'AI_FAILED'].includes(detection.status);
  const formattedDate = new Date(detection.createdAt).toLocaleString();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link to="/detections" className="text-xs font-semibold text-green-700 hover:text-green-800 flex items-center gap-1 mb-1">
            ← Back to Detection History
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Crop Health Report
            </h1>
            <StatusBadge status={detection.status} />
          </div>
          <p className="text-xs text-slate-400 mt-1">Report ID: {detection.id} • Submitted on {formattedDate}</p>
        </div>

        {canAnalyze && (
          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={analyzing}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            {analyzing ? (
              <>
                <LoadingSpinner size="sm" message="" />
                <span>Analyzing Crop...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>{detection.status === 'AI_FAILED' ? 'Retry AI Analysis' : 'Run AI Analysis'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* Authoritative Lifecycle Status Banner */}
      <DetectionStatusBanner status={detection.status} />

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Photo & Metadata */}
        <div className="lg:col-span-5 space-y-6">
          {/* Crop Image */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Analyzed Leaf / Plant Photo
            </h3>
            {detection.image?.url ? (
              <div className="rounded-2xl overflow-hidden bg-slate-100 border border-slate-100">
                <img
                  src={detection.image.url}
                  alt={`Crop sample for ${detection.crop}`}
                  className="w-full h-auto max-h-96 object-contain"
                />
              </div>
            ) : (
              <div className="h-48 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-sm">
                No image available
              </div>
            )}
          </div>

          {/* Crop & Field Context */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 text-xs text-slate-600">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Field & Crop Information
            </h3>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div>
                <span className="text-slate-400 block text-[11px]">Field</span>
                {field ? (
                  <Link to={`/fields/${field.id}`} className="font-bold text-green-700 hover:underline">
                    📍 {field.name}
                  </Link>
                ) : (
                  <span className="font-bold text-slate-800">Field #{detection.fieldId}</span>
                )}
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Crop Planted</span>
                <span className="font-bold text-slate-800">🌾 {detection.crop}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Growth Stage</span>
                <span className="font-medium text-slate-700 capitalize">{detection.growthStage || 'Not specified'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Location</span>
                <span className="font-mono text-slate-700 text-[11px]">
                  {detection.location?.coordinates
                    ? `[${detection.location.coordinates[0].toFixed(2)}, ${detection.location.coordinates[1].toFixed(2)}]`
                    : 'N/A'}
                </span>
              </div>
            </div>

            {/* Reported Symptoms */}
            <div>
              <span className="font-semibold text-slate-700 block mb-1.5">Reported Symptoms</span>
              {detection.symptoms && detection.symptoms.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detection.symptoms.map((symptom, i) => (
                    <span key={i} className="bg-green-50 text-green-800 border border-green-200 px-2.5 py-1 rounded-lg text-xs font-medium">
                      {symptom}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic">No symptoms entered by farmer.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: AI Analysis Result */}
        <div className="lg:col-span-7 space-y-6">
          <AnalysisResultView
            prediction={detection.prediction}
            severity={detection.severity}
            status={detection.status}
          />
        </div>
      </div>

      {/* Longitudinal Crop Health Timeline */}
      <FollowUpTimeline detection={detection} />
    </div>
  );
}
