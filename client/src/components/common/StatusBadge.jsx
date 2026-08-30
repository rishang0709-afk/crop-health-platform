/**
 * StatusBadge.jsx
 *
 * Status badge component supporting all canonical Detection statuses and Field active/inactive statuses.
 *
 * Supported Detection Statuses (DATABASE.md Section 10):
 *  - CREATED
 *  - AI_ANALYZING
 *  - AI_RESULT_AVAILABLE
 *  - ACTIONABLE
 *  - EXPERT_REVIEW_REQUIRED
 *  - EXPERT_REVIEW_IN_PROGRESS
 *  - CONFIRMED
 *  - CORRECTED
 *  - AI_FAILED
 *  - FOLLOW_UP_REQUIRED
 *  - CLOSED
 */

import React from 'react';

const STATUS_CONFIGS = {
  // Detection Statuses
  CREATED: {
    label: 'Pending Analysis',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    dot: 'bg-slate-400',
  },
  AI_ANALYZING: {
    label: 'Analyzing',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-300',
    dot: 'bg-indigo-500 animate-ping',
  },
  AI_RESULT_AVAILABLE: {
    label: 'AI Result Available',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-300',
    dot: 'bg-blue-500',
  },
  ACTIONABLE: {
    label: 'Actionable',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    dot: 'bg-emerald-500',
  },
  EXPERT_REVIEW_REQUIRED: {
    label: 'Expert Review Required',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
    dot: 'bg-amber-500',
  },
  EXPERT_REVIEW_IN_PROGRESS: {
    label: 'Expert Review In Progress',
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-300',
    dot: 'bg-orange-500',
  },
  CONFIRMED: {
    label: 'Confirmed',
    bg: 'bg-teal-50',
    text: 'text-teal-800',
    border: 'border-teal-300',
    dot: 'bg-teal-500',
  },
  CORRECTED: {
    label: 'Corrected',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-300',
    dot: 'bg-purple-500',
  },
  AI_FAILED: {
    label: 'Analysis Failed',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-300',
    dot: 'bg-rose-500',
  },
  FOLLOW_UP_REQUIRED: {
    label: 'Follow-up Required',
    bg: 'bg-cyan-50',
    text: 'text-cyan-800',
    border: 'border-cyan-300',
    dot: 'bg-cyan-500',
  },
  CLOSED: {
    label: 'Closed',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },

  // Field Statuses
  ACTIVE: {
    label: 'Active',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-300',
    dot: 'bg-green-500',
  },
  INACTIVE: {
    label: 'Inactive',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
    dot: 'bg-gray-400',
  },
};

export default function StatusBadge({ status, className = '' }) {
  if (!status) return null;

  const normalizedStatus = typeof status === 'boolean'
    ? (status ? 'ACTIVE' : 'INACTIVE')
    : String(status).toUpperCase().trim();

  const config = STATUS_CONFIGS[normalizedStatus] || {
    label: status,
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border} shadow-2xs ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
