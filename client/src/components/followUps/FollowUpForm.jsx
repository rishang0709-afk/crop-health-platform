/**
 * FollowUpForm.jsx
 *
 * Mobile-friendly form for recording a longitudinal follow-up observation.
 * Uses unambiguous canonical status options and clear farmer-reported wording.
 */

import React, { useState } from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorAlert from '../common/ErrorAlert';

export default function FollowUpForm({ onSubmit, onCancel, loading, error }) {
  const [status, setStatus] = useState('');
  const [observation, setObservation] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        setValidationError('Please select a valid image format (JPEG, PNG, or WebP).');
        setImageFile(null);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setValidationError('Image file size must not exceed 10 MB.');
        setImageFile(null);
        return;
      }
      setValidationError(null);
      setImageFile(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError(null);

    if (!status) {
      setValidationError('Please select a farmer-reported outcome condition.');
      return;
    }

    const formData = new FormData();
    formData.append('status', status);
    if (observation && observation.trim()) {
      formData.append('observation', observation.trim());
    }
    if (imageFile) {
      formData.append('image', imageFile);
    }

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-base font-bold text-slate-800">Record Follow-Up Observation</h3>
        <p className="text-xs text-slate-500 mt-0.5">Log your observed crop condition over time.</p>
      </div>

      {(error || validationError) && (
        <ErrorAlert error={error || validationError} onDismiss={() => setValidationError(null)} />
      )}

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
          Farmer-Reported Condition <span className="text-red-500">*</span>
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded-xl border-slate-300 shadow-xs focus:ring-green-500 focus:border-green-500 text-sm p-2.5 border bg-white"
          disabled={loading}
          required
        >
          <option value="" disabled>Select observed condition...</option>
          <option value="IMPROVED">Improved (symptoms reducing / recovering)</option>
          <option value="NO_CHANGE">No Change / Stable (symptoms unchanged)</option>
          <option value="WORSENED">Worsened (symptoms spreading / intensifying)</option>
        </select>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            Observation Notes (Optional)
          </label>
          <span className="text-[11px] text-slate-400">{observation.length}/1000</span>
        </div>
        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows="3"
          maxLength={1000}
          placeholder="Describe visible crop appearance, weather changes, or actions taken..."
          className="w-full rounded-xl border-slate-300 shadow-xs focus:ring-green-500 focus:border-green-500 text-sm p-2.5 border"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
          Updated Crop Photo (Optional)
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
          disabled={loading}
        />
        <p className="text-[11px] text-slate-400 mt-1">Accepts JPEG, PNG, or WebP up to 10 MB.</p>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !status}
          className="px-5 py-2 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? <LoadingSpinner size="sm" message="" /> : 'Save Observation'}
        </button>
      </div>
    </form>
  );
}
