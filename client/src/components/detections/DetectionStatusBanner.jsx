/**
 * DetectionStatusBanner.jsx
 *
 * Prominent contextual banner explaining the current lifecycle status of a Detection
 * to the farmer without hardcoding non-authoritative logic.
 */

import React from 'react';

const STATUS_DETAILS = {
  CREATED: {
    icon: '⏳',
    title: 'Detection Created — Awaiting Analysis',
    description: 'Your crop image has been uploaded. Click "Run AI Analysis" below to diagnose the crop condition.',
    style: 'bg-slate-50 border-slate-200 text-slate-800',
  },
  AI_ANALYZING: {
    icon: '🔄',
    title: 'AI Analysis in Progress',
    description: 'The machine learning service is evaluating the leaf pattern and symptoms. Please wait a moment...',
    style: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  },
  AI_RESULT_AVAILABLE: {
    icon: '📊',
    title: 'AI Result Available',
    description: 'Inference has concluded and prediction results have been recorded.',
    style: 'bg-blue-50 border-blue-200 text-blue-900',
  },
  ACTIONABLE: {
    icon: '✅',
    title: 'Diagnosis Available',
    description: 'AI analysis is complete and disease/pest information is ready for review.',
    style: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  },
  EXPERT_REVIEW_REQUIRED: {
    icon: '⚠️',
    title: 'Expert Verification Recommended',
    description: 'The AI model detected uncertainty for this image. Human expert review is recommended before taking major interventions.',
    style: 'bg-amber-50 border-amber-200 text-amber-900',
  },
  EXPERT_REVIEW_IN_PROGRESS: {
    icon: '🔍',
    title: 'Expert Review in Progress',
    description: 'An agricultural extension expert is currently reviewing your crop image and symptoms.',
    style: 'bg-orange-50 border-orange-200 text-orange-900',
  },
  CONFIRMED: {
    icon: '🏅',
    title: 'Expert Confirmed Diagnosis',
    description: 'The diagnosis has been validated and confirmed by an agricultural expert.',
    style: 'bg-teal-50 border-teal-200 text-teal-900',
  },
  CORRECTED: {
    icon: '🔄',
    title: 'Expert Corrected Diagnosis',
    description: 'An agricultural expert has reviewed this case and updated the diagnosis.',
    style: 'bg-purple-50 border-purple-200 text-purple-900',
  },
  AI_FAILED: {
    icon: '❌',
    title: 'Analysis Unsuccessful',
    description: 'The AI inference service encountered an issue analyzing this image. You may re-trigger analysis or upload a clearer photo.',
    style: 'bg-rose-50 border-rose-200 text-rose-900',
  },
  FOLLOW_UP_REQUIRED: {
    icon: '📅',
    title: 'Follow-Up Inspection Required',
    description: 'Follow-up monitoring has been scheduled to track crop recovery.',
    style: 'bg-cyan-50 border-cyan-200 text-cyan-900',
  },
  CLOSED: {
    icon: '📁',
    title: 'Report Closed',
    description: 'This crop health detection report is resolved and closed.',
    style: 'bg-slate-100 border-slate-200 text-slate-700',
  },
};

export default function DetectionStatusBanner({ status }) {
  if (!status) return null;

  const detail = STATUS_DETAILS[status] || {
    icon: '📌',
    title: `Status: ${status}`,
    description: 'Current status of the crop health report.',
    style: 'bg-slate-50 border-slate-200 text-slate-800',
  };

  return (
    <div className={`p-4 rounded-2xl border ${detail.style} flex items-start gap-3.5 shadow-2xs`}>
      <span className="text-2xl select-none leading-none mt-0.5">{detail.icon}</span>
      <div>
        <h4 className="text-sm font-bold">{detail.title}</h4>
        <p className="text-xs mt-1 leading-relaxed opacity-90">{detail.description}</p>
      </div>
    </div>
  );
}
