/**
 * FarmerLayout.jsx
 *
 * Top-level application layout for authenticated farmer views.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/common/Navbar';

export default function FarmerLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 antialiased">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 Crop Health Platform — Early Warning & Management System</p>
        </div>
      </footer>
    </div>
  );
}
