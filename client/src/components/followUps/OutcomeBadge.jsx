/**
 * OutcomeBadge.jsx
 *
 * Dedicated visual badge for longitudinal follow-up outcomes.
 * Safely renders all 5 documented canonical backend values:
 *   - IMPROVED
 *   - STABLE
 *   - NO_CHANGE
 *   - WORSENED
 *   - UNKNOWN
 */

import React from 'react';

export default function OutcomeBadge({ status }) {
  let bgColor = 'bg-slate-100';
  let textColor = 'text-slate-700';
  let borderColor = 'border-slate-200';
  let label = status || 'Unknown';

  switch (status) {
    case 'IMPROVED':
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      borderColor = 'border-green-300';
      label = 'Improved';
      break;
    case 'NO_CHANGE':
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-800';
      borderColor = 'border-blue-300';
      label = 'No Change';
      break;
    case 'STABLE':
      bgColor = 'bg-slate-100';
      textColor = 'text-slate-800';
      borderColor = 'border-slate-300';
      label = 'Stable';
      break;
    case 'WORSENED':
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      borderColor = 'border-red-300';
      label = 'Worsened';
      break;
    case 'UNKNOWN':
      bgColor = 'bg-slate-100';
      textColor = 'text-slate-600';
      borderColor = 'border-slate-200';
      label = 'Unknown';
      break;
    default:
      break;
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${bgColor} ${textColor} ${borderColor}`}
    >
      {label}
    </span>
  );
}
