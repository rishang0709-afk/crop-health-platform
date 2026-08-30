/**
 * FieldDetailPage.jsx
 *
 * Detailed view of a single field, allowing in-place editing, active/inactive
 * status toggling, and inspection of all detection reports created for this field.
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fieldService } from '../services/fieldService';
import { detectionService } from '../services/detectionService';
import FieldForm from '../components/fields/FieldForm';
import DetectionCard from '../components/detections/DetectionCard';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import EmptyState from '../components/common/EmptyState';

export default function FieldDetailPage() {
  const { id } = useParams();

  const [field, setField] = useState(null);
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [fieldRes, detectionsRes] = await Promise.all([
          fieldService.getField(id),
          detectionService.getDetections({ fieldId: id }),
        ]);

        if (isMounted) {
          setField(fieldRes.data?.field || null);
          setDetections(detectionsRes.data?.detections || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleUpdate = async (payload) => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fieldService.updateField(id, payload);
      setField(res.data?.field);
      setIsEditing(false);
    } catch (err) {
      setError(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!field) return;

    setStatusUpdating(true);
    setError(null);

    try {
      const nextStatus = !field.isActive;
      const res = await fieldService.updateFieldStatus(id, nextStatus);
      setField(res.data?.field);
    } catch (err) {
      setError(err);
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullPage size="lg" message="Loading field details..." />;
  }

  if (!field) {
    return (
      <EmptyState
        icon="🔍"
        title="Field not found"
        description="The requested field could not be found or you do not have permission to view it."
        actionLabel="Back to Fields"
        onAction={() => window.location.assign('/fields')}
      />
    );
  }

  const coordinatesDisplay = field.location?.coordinates
    ? `Longitude: ${field.location.coordinates[0]}, Latitude: ${field.location.coordinates[1]}`
    : 'Not specified';

  const areaDisplay = field.area?.value !== undefined && field.area?.value !== null
    ? `${field.area.value} ${field.area.unit || 'acres'}`
    : 'Not specified';

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Breadcrumb Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link to="/fields" className="text-xs font-semibold text-green-700 hover:text-green-800 flex items-center gap-1 mb-1">
            ← Back to Fields
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{field.name}</h1>
            <StatusBadge status={field.isActive} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/detections/new?fieldId=${field.id}`}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>📷</span>
            <span>Analyze Crop</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsEditing((prev) => !prev)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
          >
            {isEditing ? 'Cancel Edit' : 'Edit Field'}
          </button>

          <button
            type="button"
            onClick={handleStatusToggle}
            disabled={statusUpdating}
            className={`px-3.5 py-2 border font-semibold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer disabled:opacity-50 ${
              field.isActive
                ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800'
                : 'border-green-300 bg-green-50 hover:bg-green-100 text-green-800'
            }`}
          >
            {statusUpdating
              ? 'Updating...'
              : field.isActive
              ? 'Deactivate Field'
              : 'Activate Field'}
          </button>
        </div>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* Edit Mode View or Summary Card */}
      {isEditing ? (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Edit Field Information</h2>
          <FieldForm
            initialValues={field}
            onSubmit={handleUpdate}
            isSubmitting={isSaving}
            submitLabel="Update Field"
          />
        </div>
      ) : (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 block mb-1">Crop Type</span>
              <span className="text-base font-bold text-slate-900">🌾 {field.crop}</span>
              {field.variety && <span className="text-xs text-slate-500 block mt-0.5">({field.variety})</span>}
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 block mb-1">Growth Stage</span>
              <span className="text-base font-bold text-slate-900 capitalize">{field.growthStage || 'Not specified'}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 block mb-1">Field Area</span>
              <span className="text-base font-bold text-slate-900">{areaDisplay}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 block mb-1">Planting Date</span>
              <span className="text-base font-bold text-slate-900">
                {field.plantingDate ? new Date(field.plantingDate).toLocaleDateString() : 'Not specified'}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-500 block mb-1">Geospatial Coordinates</span>
              <span className="font-mono text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md inline-block">
                {coordinatesDisplay}
              </span>
            </div>

            {field.notes && (
              <div>
                <span className="font-semibold text-slate-500 block mb-1">Field Notes</span>
                <p className="text-slate-700 italic">{field.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Field's Detections Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Crop Health Reports for this Field</h2>
            <p className="text-xs text-slate-500">Historical AI detections recorded for {field.name}</p>
          </div>

          <Link
            to={`/detections/new?fieldId=${field.id}`}
            className="text-xs font-bold text-green-700 hover:text-green-800"
          >
            + New Detection
          </Link>
        </div>

        {detections.length === 0 ? (
          <EmptyState
            icon="📸"
            title="No reports for this field yet"
            description="Upload a photo of a crop leaf from this field to get an automated disease/pest diagnosis."
            actionLabel="Analyze Crop"
            onAction={() => window.location.assign(`/detections/new?fieldId=${field.id}`)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {detections.map((detection) => (
              <DetectionCard
                key={detection.id}
                detection={detection}
                fieldName={field.name}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
