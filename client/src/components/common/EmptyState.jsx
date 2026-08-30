/**
 * EmptyState.jsx
 *
 * Reusable empty state view with title, description, icon, and optional action button.
 */

import React from 'react';

export default function EmptyState({
  icon = '🌾',
  title = 'No records found',
  description = 'There is currently no data available in this section.',
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 ${className}`}
    >
      <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center text-3xl sm:text-4xl bg-white shadow-xs border border-slate-200/80 rounded-2xl mb-4">
        {icon}
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-semibold rounded-xl shadow-xs transition-all"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
