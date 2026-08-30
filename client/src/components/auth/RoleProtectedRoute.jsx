/**
 * RoleProtectedRoute.jsx
 *
 * Route guard ensuring the user is authenticated and authorized based on a list of allowed roles.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import LoadingSpinner from '../common/LoadingSpinner';

export default function RoleProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner fullPage size="lg" message="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
          <span className="text-4xl mb-3 block">🚫</span>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Unauthorized Access</h2>
          <p className="text-sm text-slate-600 mb-6">
            This section is restricted. Your current role is{' '}
            <span className="font-semibold text-slate-800">{user.role}</span>.
          </p>
          <a
            href={user.role === 'farmer' ? "/dashboard" : "/login"}
            className="inline-block px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl"
          >
            {user.role === 'farmer' ? "Return to Farmer Dashboard" : "Switch Account"}
          </a>
        </div>
      </div>
    );
  }

  return children;
}
