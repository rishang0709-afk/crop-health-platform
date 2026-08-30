/**
 * RiskBadge.jsx
 *
 * Reusable visual indicator for HOTSPOT risk levels.
 */

import React from 'react';

export default function RiskBadge({ level }) {
  if (!level) return null;
  const uppercaseLevel = level.toUpperCase();

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200'; // fallback
  let icon = '';

  if (uppercaseLevel === 'LOW') {
    colorClasses = 'bg-green-100 text-green-800 border-green-200';
    icon = '✓';
  } else if (uppercaseLevel === 'MEDIUM') {
    colorClasses = 'bg-yellow-100 text-yellow-800 border-yellow-200';
    icon = '⚠️';
  } else if (uppercaseLevel === 'HIGH') {
    colorClasses = 'bg-orange-100 text-orange-800 border-orange-200';
    icon = '🔥';
  } else if (uppercaseLevel === 'CRITICAL') {
    colorClasses = 'bg-red-100 text-red-800 border-red-300 font-bold';
    icon = '🚨';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border ${colorClasses}`}
    >
      {icon && <span>{icon}</span>}
      <span>{uppercaseLevel}</span>
    </span>
  );
}
