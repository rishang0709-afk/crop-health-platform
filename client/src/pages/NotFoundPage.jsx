/**
 * NotFoundPage.jsx
 *
 * Fallback 404 page for nonexistent routes.
 */

import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6">
      <span className="text-6xl mb-4 select-none">🌾</span>
      <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Page Not Found</h1>
      <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
        The page you are looking for does not exist, was moved, or requires different permissions.
      </p>
      <Link
        to="/dashboard"
        className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-xl shadow-xs transition-colors"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
