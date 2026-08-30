/**
 * FarmerDashboardPage.jsx
 *
 * Overview dashboard for the farmer displaying simple record counts, quick actions,
 * active fields, and recent crop health detection reports.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { fieldService } from '../services/fieldService';
import { detectionService } from '../services/detectionService';
import FieldCard from '../components/fields/FieldCard';
import DetectionCard from '../components/detections/DetectionCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import EmptyState from '../components/common/EmptyState';

export default function FarmerDashboardPage() {
  const { user } = useAuth();
  const [fields, setFields] = useState([]);
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      setError(null);

      try {
        const [fieldsRes, detectionsRes] = await Promise.all([
          fieldService.getFields(),
          detectionService.getDetections(),
        ]);

        setFields(fieldsRes.data?.fields || []);
        setDetections(detectionsRes.data?.detections || []);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  if (loading) {
    return <LoadingSpinner fullPage size="lg" message="Loading your farm dashboard..." />;
  }

  // Purely presentational metric counts (Docs/AI_RULES.md & Adjustment #5)
  const totalFields = fields.length;
  const activeFields = fields.filter((f) => f.isActive).length;
  const totalDetections = detections.length;
  const actionableDetections = detections.filter((d) => d.status === 'ACTIONABLE').length;

  const recentDetections = detections.slice(0, 3);
  const activeFieldsList = fields.filter((f) => f.isActive).slice(0, 3);

  // Field map helper for quick lookup of field name on detection cards
  const fieldNameMap = fields.reduce((acc, f) => {
    acc[f.id] = f.name;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-green-700 via-green-800 to-emerald-900 rounded-3xl p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-green-300 block mb-1">
            Farmer Portal
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome back, {user?.name || 'Farmer'}
          </h1>
          <p className="text-xs sm:text-sm text-green-100 mt-2 max-w-xl leading-relaxed">
            Monitor the health of your registered plots, analyze plant disease symptoms, and track diagnosis history.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/detections/new"
            className="px-4 py-2.5 bg-white text-green-800 hover:bg-green-50 font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>📷</span>
            <span>New Crop Analysis</span>
          </Link>
          <Link
            to="/fields/new"
            className="px-4 py-2.5 bg-green-600/80 hover:bg-green-600 border border-green-400/40 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors flex items-center gap-1.5"
          >
            <span>➕</span>
            <span>Add Field</span>
          </Link>
        </div>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold text-slate-500">Total Fields</span>
            <span className="text-xl">🗺️</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{totalFields}</p>
          <p className="text-[11px] text-slate-400 mt-1">{activeFields} currently active</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold text-slate-500">Active Crops</span>
            <span className="text-xl">🌾</span>
          </div>
          <p className="text-2xl font-extrabold text-green-700">{activeFields}</p>
          <p className="text-[11px] text-slate-400 mt-1">Ready for inspection</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold text-slate-500">Total Reports</span>
            <span className="text-xl">📊</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{totalDetections}</p>
          <p className="text-[11px] text-slate-400 mt-1">Submitted analyses</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold text-slate-500">Actionable Reports</span>
            <span className="text-xl">✅</span>
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">{actionableDetections}</p>
          <p className="text-[11px] text-slate-400 mt-1">Diagnosis available</p>
        </div>
      </div>

      {/* Recent Detections Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Recent Crop Health Reports</h2>
            <p className="text-xs text-slate-500">Latest image analyses and diagnostic results</p>
          </div>
          {detections.length > 0 && (
            <Link to="/detections" className="text-xs font-bold text-green-700 hover:text-green-800">
              View all ({detections.length}) →
            </Link>
          )}
        </div>

        {detections.length === 0 ? (
          <EmptyState
            icon="📸"
            title="No crop health reports yet"
            description="Take a photo of an affected plant leaf or crop to identify diseases and pest infestations early."
            actionLabel="Analyze First Crop"
            onAction={() => window.location.assign('/detections/new')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recentDetections.map((detection) => (
              <DetectionCard
                key={detection.id}
                detection={detection}
                fieldName={fieldNameMap[detection.fieldId]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Active Fields Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">My Farm Fields</h2>
            <p className="text-xs text-slate-500">Registered plots under management</p>
          </div>
          {fields.length > 0 && (
            <Link to="/fields" className="text-xs font-bold text-green-700 hover:text-green-800">
              Manage fields ({fields.length}) →
            </Link>
          )}
        </div>

        {fields.length === 0 ? (
          <EmptyState
            icon="🌱"
            title="No fields registered"
            description="Add your first agricultural field to record planting details and organize detection reports."
            actionLabel="Add New Field"
            onAction={() => window.location.assign('/fields/new')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeFieldsList.map((field) => (
              <FieldCard key={field.id} field={field} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
