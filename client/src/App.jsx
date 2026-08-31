/**
 * App.jsx
 *
 * Root component configuring AuthProvider, React Router routes,
 * and layout wrappers.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';

// Layouts
import AuthLayout from './layouts/AuthLayout';
import FarmerLayout from './layouts/FarmerLayout';

// Auth Guard
import ProtectedRoute from './components/auth/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import FarmerDashboardPage from './pages/FarmerDashboardPage';
import FieldListPage from './pages/FieldListPage';
import CreateFieldPage from './pages/CreateFieldPage';
import FieldDetailPage from './pages/FieldDetailPage';
import DetectionListPage from './pages/DetectionListPage';
import NewDetectionPage from './pages/NewDetectionPage';
import DetectionDetailPage from './pages/DetectionDetailPage';
import NotFoundPage from './pages/NotFoundPage';

// Officer Layout & Guard
import OfficerLayout from './layouts/OfficerLayout';
import RoleProtectedRoute from './components/auth/RoleProtectedRoute';

// Officer Pages
import OfficerDashboardPage from './pages/officer/OfficerDashboardPage';
import HotspotListPage from './pages/officer/HotspotListPage';
import SurveillanceMapPage from './pages/officer/SurveillanceMapPage';

// Expert Pages
import ExpertQueuePage from './pages/ExpertQueuePage';
import ExpertReviewDetailPage from './pages/ExpertReviewDetailPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Auth Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Protected Farmer Routes */}
          <Route
            element={
              <ProtectedRoute>
                <FarmerLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<FarmerDashboardPage />} />
            <Route path="/fields" element={<FieldListPage />} />
            <Route path="/fields/new" element={<CreateFieldPage />} />
            <Route path="/fields/:id" element={<FieldDetailPage />} />
            <Route path="/detections" element={<DetectionListPage />} />
            <Route path="/detections/new" element={<NewDetectionPage />} />
            <Route path="/detections/:id" element={<DetectionDetailPage />} />
          </Route>

          {/* Protected Expert Routes */}
          <Route
            path="/expert"
            element={
              <RoleProtectedRoute allowedRoles={['expert']}>
                <Navigate to="/expert/queue" replace />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/expert/queue"
            element={
              <RoleProtectedRoute allowedRoles={['expert']}>
                <ExpertQueuePage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/expert/reviews/:id"
            element={
              <RoleProtectedRoute allowedRoles={['expert']}>
                <ExpertReviewDetailPage />
              </RoleProtectedRoute>
            }
          />

          {/* Protected Officer Routes */}
          <Route
            path="/officer"
            element={
              <RoleProtectedRoute allowedRoles={['officer', 'admin']}>
                <OfficerLayout />
              </RoleProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/officer/dashboard" replace />} />
            <Route path="dashboard" element={<OfficerDashboardPage />} />
            <Route path="hotspots" element={<HotspotListPage />} />
            <Route path="map" element={<SurveillanceMapPage />} />
          </Route>

          {/* 404 Catch-All */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>

  );
}
