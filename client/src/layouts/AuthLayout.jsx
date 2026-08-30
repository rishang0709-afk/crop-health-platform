/**
 * AuthLayout.jsx
 *
 * Clean authentication layout for Login and Registration screens.
 */

import React from 'react';
import { Outlet, Link } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-slate-50 to-emerald-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-3xl font-extrabold text-green-700 tracking-tight">
          <span className="text-4xl">🌱</span>
          <span>Crop Health</span>
        </Link>
        <p className="mt-2 text-sm text-slate-600 font-medium">
          Early Detection & Crop Health Management Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-lg shadow-slate-200/50 rounded-2xl border border-slate-100">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
