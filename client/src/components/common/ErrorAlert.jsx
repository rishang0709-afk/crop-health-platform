/**
 * ErrorAlert.jsx
 *
 * Consistent error alert banner displaying error code, message, and details.
 */

import React from 'react';

export default function ErrorAlert({ error, onDismiss, className = '' }) {
  if (!error) return null;

  const message = typeof error === 'string' ? error : error.message || 'An error occurred';
  const code = error.code ? `[${error.code}] ` : '';
  const details = Array.isArray(error.details) ? error.details : null;

  return (
    <div
      className={`rounded-xl border border-red-200 bg-red-50/90 p-4 text-red-800 shadow-xs transition-all ${className}`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="text-lg leading-none select-none">⚠️</span>
          <div>
            <h4 className="text-sm font-semibold text-red-900">
              {code ? `${code}Error` : 'Error'}
            </h4>
            <p className="mt-0.5 text-sm text-red-700 leading-relaxed">{message}</p>
            {details && details.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-red-600 space-y-1">
                {details.map((d, index) => (
                  <li key={index}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-red-400 hover:text-red-700 rounded-lg p-1 transition-colors"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
