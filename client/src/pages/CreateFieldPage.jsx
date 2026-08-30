/**
 * CreateFieldPage.jsx
 *
 * Page for registering a new agricultural field with GeoJSON location coordinates.
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fieldService } from '../services/fieldService';
import FieldForm from '../components/fields/FieldForm';
import ErrorAlert from '../components/common/ErrorAlert';

export default function CreateFieldPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (payload) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fieldService.createField(payload);
      if (res.success && res.data?.field?.id) {
        navigate(`/fields/${res.data.field.id}`);
      } else {
        navigate('/fields');
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to="/fields" className="text-xs font-semibold text-green-700 hover:text-green-800 flex items-center gap-1 mb-2">
          ← Back to Fields
        </Link>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Register New Field</h1>
        <p className="text-xs text-slate-500 mt-1">
          Add your farm plot details, crop variety, and geographical coordinates for accurate early warning alerts.
        </p>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs">
        <FieldForm
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitLabel="Create Field Record"
        />
      </div>
    </div>
  );
}
