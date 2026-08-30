/**
 * DetectionCard.jsx
 *
 * Card component summarizing a single detection report for the farmer's history and dashboard.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../common/StatusBadge';

export default function DetectionCard({ detection, fieldName }) {
  if (!detection) return null;

  const formattedDate = new Date(detection.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const confidencePct = detection.prediction?.confidence !== undefined && detection.prediction?.confidence !== null
    ? `${Math.round(detection.prediction.confidence * 100)}%`
    : null;

  const diagnosisName = detection.prediction?.name || 'Diagnosis Pending';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between">
      <div>
        {/* Card Header & Thumbnail */}
        <div className="relative h-44 bg-slate-100 overflow-hidden">
          {detection.image?.url ? (
            <img
              src={detection.image.url}
              alt={`Crop detection for ${detection.crop}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl text-slate-300">
              🌿
            </div>
          )}
          <div className="absolute top-3 right-3">
            <StatusBadge status={detection.status} />
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{formattedDate}</span>
            {fieldName && <span className="font-medium text-slate-700 truncate max-w-[150px]">📍 {fieldName}</span>}
          </div>

          <h3 className="text-base font-bold text-slate-900 leading-snug mb-1">
            {diagnosisName}
          </h3>

          <p className="text-xs font-semibold text-green-700 mb-3">
            Crop: {detection.crop} {detection.growthStage ? `• ${detection.growthStage}` : ''}
          </p>

          {/* AI Metrics (if available) */}
          {detection.prediction && (
            <div className="flex items-center gap-4 py-2 px-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 mb-3">
              {confidencePct && (
                <div>
                  <span className="text-slate-400 block text-[10px]">Confidence</span>
                  <span className="font-semibold text-slate-800">{confidencePct}</span>
                </div>
              )}
              {detection.severity?.level && (
                <div>
                  <span className="text-slate-400 block text-[10px]">Severity</span>
                  <span className="font-semibold text-slate-800 capitalize">{detection.severity.level}</span>
                </div>
              )}
              <div>
                <span className="text-slate-400 block text-[10px]">Type</span>
                <span className="font-semibold text-slate-800 capitalize">{detection.prediction.type || 'N/A'}</span>
              </div>
            </div>
          )}

          {/* Symptoms preview */}
          {detection.symptoms && detection.symptoms.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {detection.symptoms.slice(0, 2).map((symptom, i) => (
                <span key={i} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                  {symptom}
                </span>
              ))}
              {detection.symptoms.length > 2 && (
                <span className="text-[11px] text-slate-400 self-center">
                  +{detection.symptoms.length - 2} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Card Footer */}
      <div className="p-4 pt-0">
        <Link
          to={`/detections/${detection.id}`}
          className="block w-full text-center py-2 px-4 bg-green-50 hover:bg-green-100 text-green-800 text-xs font-bold rounded-xl transition-colors"
        >
          View Full Report →
        </Link>
      </div>
    </div>
  );
}
