/**
 * LoadingSpinner.jsx
 *
 * Versatile loading spinner component supporting inline, button, and full-page variants.
 */

import React from 'react';

export default function LoadingSpinner({ size = 'md', message = 'Loading...', fullPage = false }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeClasses[size] || sizeClasses.md} border-green-200 border-t-green-600 rounded-full animate-spin`}
        role="status"
        aria-label="loading"
      />
      {message && <p className="text-sm font-medium text-slate-600 animate-pulse">{message}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        {spinner}
      </div>
    );
  }

  return spinner;
}
