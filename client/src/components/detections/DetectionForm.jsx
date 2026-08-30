/**
 * DetectionForm.jsx
 *
 * Form component for uploading a crop photo and initiating a detection report.
 */

import React, { useState } from 'react';
import ErrorAlert from '../common/ErrorAlert';

export default function DetectionForm({
  fields = [],
  initialFieldId = '',
  onSubmit,
  isSubmitting,
}) {
  const [selectedFieldId, setSelectedFieldId] = useState(initialFieldId || '');
  const [selectedCrop, setSelectedCrop] = useState('');
  const [growthStage, setGrowthStage] = useState('');
  const [symptomsInput, setSymptomsInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [formError, setFormError] = useState(null);

  // When a field is selected, auto-populate crop and growthStage from field data
  const handleFieldChange = (e) => {
    const fieldId = e.target.value;
    setSelectedFieldId(fieldId);

    const found = fields.find((f) => f.id === fieldId);
    if (found) {
      if (found.crop) setSelectedCrop(found.crop);
      if (found.growthStage) setGrowthStage(found.growthStage);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setFormError('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setFormError('Image size exceeds 10MB. Please choose a smaller photo.');
      return;
    }

    setFormError(null);
    setImageFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedFieldId) {
      setFormError('Please select the associated field.');
      return;
    }

    if (!imageFile) {
      setFormError('Please capture or upload a clear photo of the affected crop leaf.');
      return;
    }

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('fieldId', selectedFieldId);

    if (selectedCrop.trim()) {
      formData.append('crop', selectedCrop.trim());
    }

    if (growthStage.trim()) {
      formData.append('growthStage', growthStage.trim());
    }

    if (symptomsInput.trim()) {
      const symptomsList = symptomsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      symptomsList.forEach((symptom) => {
        formData.append('symptoms', symptom);
      });
    }

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError && <ErrorAlert error={formError} onDismiss={() => setFormError(null)} />}

      {/* Field Selection */}
      <div>
        <label htmlFor="fieldId" className="block text-sm font-semibold text-slate-700 mb-1">
          Select Field <span className="text-red-500">*</span>
        </label>
        <select
          id="fieldId"
          value={selectedFieldId}
          onChange={handleFieldChange}
          required
          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
        >
          <option value="">-- Choose one of your registered fields --</option>
          {fields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name} ({field.crop || 'No crop'}) {!field.isActive ? '• Inactive' : ''}
            </option>
          ))}
        </select>
        {fields.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            No fields registered yet. Please create a field first before analyzing.
          </p>
        )}
      </div>

      {/* Image Upload Area */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Crop Photo <span className="text-red-500">*</span>
        </label>
        <div className="mt-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 hover:border-green-500 rounded-2xl bg-slate-50 hover:bg-green-50/20 transition-all cursor-pointer relative overflow-hidden">
          {imagePreview ? (
            <div className="flex flex-col items-center gap-3">
              <img
                src={imagePreview}
                alt="Selected crop preview"
                className="max-h-64 max-w-full rounded-xl object-contain shadow-xs"
              />
              <span className="text-xs text-green-700 font-semibold bg-green-100 px-3 py-1 rounded-full">
                ✓ Photo selected ({imageFile?.name})
              </span>
              <p className="text-xs text-slate-500">Click or tap below to change photo</p>
            </div>
          ) : (
            <div className="text-center py-4">
              <span className="text-4xl block mb-2">📸</span>
              <p className="text-sm font-semibold text-slate-800">
                Click to upload or take a photo
              </p>
              <p className="text-xs text-slate-500 mt-1">
                JPEG, PNG or WebP (up to 10MB)
              </p>
            </div>
          )}

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jpg"
            capture="environment"
            onChange={handleImageChange}
            required
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>
      </div>

      {/* Crop & Stage Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="crop" className="block text-sm font-semibold text-slate-700 mb-1">
            Crop Type
          </label>
          <input
            type="text"
            id="crop"
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
            placeholder="e.g. Tomato"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white"
          />
        </div>

        <div>
          <label htmlFor="growthStage" className="block text-sm font-semibold text-slate-700 mb-1">
            Growth Stage
          </label>
          <input
            type="text"
            id="growthStage"
            value={growthStage}
            onChange={(e) => setGrowthStage(e.target.value)}
            placeholder="e.g. flowering, vegetative"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Symptoms */}
      <div>
        <label htmlFor="symptoms" className="block text-sm font-semibold text-slate-700 mb-1">
          Observed Symptoms <span className="text-xs text-slate-400 font-normal">(Optional, comma-separated)</span>
        </label>
        <input
          type="text"
          id="symptoms"
          value={symptomsInput}
          onChange={(e) => setSymptomsInput(e.target.value)}
          placeholder="e.g. yellow spots on leaves, brown concentric rings, curling edges"
          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting || fields.length === 0}
          className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSubmitting ? 'Uploading & Analyzing Crop...' : '🚀 Submit & Run AI Analysis'}
        </button>
      </div>
    </form>
  );
}
