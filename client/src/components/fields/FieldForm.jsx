/**
 * FieldForm.jsx
 *
 * Form component for creating and editing Field records.
 * Ensures GeoJSON location format: coordinates [longitude, latitude].
 */

import React, { useState } from 'react';
import ErrorAlert from '../common/ErrorAlert';

export default function FieldForm({ initialValues, onSubmit, isSubmitting, submitLabel = 'Save Field' }) {
  const [formData, setFormData] = useState(() => ({
    name: initialValues?.name || '',
    crop: initialValues?.crop || '',
    variety: initialValues?.variety || '',
    plantingDate: initialValues?.plantingDate ? initialValues.plantingDate.split('T')[0] : '',
    growthStage: initialValues?.growthStage || '',
    areaValue: initialValues?.area?.value !== undefined && initialValues?.area?.value !== null ? initialValues.area.value : '',
    areaUnit: initialValues?.area?.unit || 'acre',
    longitude: initialValues?.location?.coordinates?.[0] !== undefined ? initialValues.location.coordinates[0] : '',
    latitude: initialValues?.location?.coordinates?.[1] !== undefined ? initialValues.location.coordinates[1] : '',
    notes: initialValues?.notes || '',
  }));

  const [formError, setFormError] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleGetGps = () => {
    if (!navigator.geolocation) {
      setFormError('Geolocation is not supported by your browser.');
      return;
    }

    setGpsLoading(true);
    setFormError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({
          ...prev,
          longitude: Number(position.coords.longitude.toFixed(6)),
          latitude: Number(position.coords.latitude.toFixed(6)),
        }));
        setGpsLoading(false);
      },
      (error) => {
        setFormError(`GPS Error: ${error.message || 'Unable to retrieve location'}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);

    // Client-side required field validation
    if (!formData.name.trim()) {
      setFormError('Field name is required.');
      return;
    }

    if (!formData.crop.trim()) {
      setFormError('Crop name is required.');
      return;
    }

    const lng = parseFloat(formData.longitude);
    const lat = parseFloat(formData.latitude);

    if (isNaN(lng) || isNaN(lat)) {
      setFormError('Valid numeric Longitude and Latitude are required.');
      return;
    }

    if (lng < -180 || lng > 180) {
      setFormError('Longitude must be between -180 and 180.');
      return;
    }

    if (lat < -90 || lat > 90) {
      setFormError('Latitude must be between -90 and 90.');
      return;
    }

    const areaVal = formData.areaValue !== '' ? parseFloat(formData.areaValue) : null;
    if (areaVal !== null && (isNaN(areaVal) || areaVal < 0)) {
      setFormError('Field area must be a non-negative number.');
      return;
    }

    // Build payload matching Docs/DATABASE.md Section 6
    const payload = {
      name: formData.name.trim(),
      crop: formData.crop.trim(),
      variety: formData.variety.trim() || undefined,
      plantingDate: formData.plantingDate ? formData.plantingDate : undefined,
      growthStage: formData.growthStage.trim() || undefined,
      area: areaVal !== null ? { value: areaVal, unit: formData.areaUnit || 'acre' } : undefined,
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      notes: formData.notes.trim() || undefined,
    };

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError && <ErrorAlert error={formError} onDismiss={() => setFormError(null)} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Field Name */}
        <div className="sm:col-span-2">
          <label htmlFor="name" className="block text-sm font-semibold text-slate-700 mb-1">
            Field Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. North Plot, Ganga Basin Field"
            required
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          />
        </div>

        {/* Crop Name */}
        <div>
          <label htmlFor="crop" className="block text-sm font-semibold text-slate-700 mb-1">
            Crop Planted <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="crop"
            name="crop"
            value={formData.crop}
            onChange={handleChange}
            placeholder="e.g. Tomato, Wheat, Potato, Rice"
            required
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          />
        </div>

        {/* Variety */}
        <div>
          <label htmlFor="variety" className="block text-sm font-semibold text-slate-700 mb-1">
            Crop Variety <span className="text-xs text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            id="variety"
            name="variety"
            value={formData.variety}
            onChange={handleChange}
            placeholder="e.g. Pusa Ruby, Sharbati"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          />
        </div>

        {/* Planting Date */}
        <div>
          <label htmlFor="plantingDate" className="block text-sm font-semibold text-slate-700 mb-1">
            Planting Date <span className="text-xs text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            type="date"
            id="plantingDate"
            name="plantingDate"
            value={formData.plantingDate}
            onChange={handleChange}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          />
        </div>

        {/* Growth Stage */}
        <div>
          <label htmlFor="growthStage" className="block text-sm font-semibold text-slate-700 mb-1">
            Growth Stage <span className="text-xs text-slate-400 font-normal">(Optional)</span>
          </label>
          <select
            id="growthStage"
            name="growthStage"
            value={formData.growthStage}
            onChange={handleChange}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          >
            <option value="">Select current stage</option>
            <option value="seedling">Seedling</option>
            <option value="vegetative">Vegetative</option>
            <option value="flowering">Flowering</option>
            <option value="fruiting">Fruiting</option>
            <option value="harvest">Harvest</option>
          </select>
        </div>

        {/* Area Value & Unit */}
        <div>
          <label htmlFor="areaValue" className="block text-sm font-semibold text-slate-700 mb-1">
            Area Size <span className="text-xs text-slate-400 font-normal">(Optional)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              min="0"
              id="areaValue"
              name="areaValue"
              value={formData.areaValue}
              onChange={handleChange}
              placeholder="e.g. 2.5"
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
            />
            <select
              name="areaUnit"
              value={formData.areaUnit}
              onChange={handleChange}
              className="w-28 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
            >
              <option value="acre">Acres</option>
              <option value="hectare">Hectares</option>
              <option value="bigha">Bighas</option>
            </select>
          </div>
        </div>

        {/* Location GPS section */}
        <div className="sm:col-span-2 bg-green-50/60 p-4 rounded-xl border border-green-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-bold text-green-950 block">Field Coordinates (GeoJSON) <span className="text-red-500">*</span></span>
              <span className="text-xs text-green-800">Used for spatial alerts and disease hotspot tracking.</span>
            </div>
            <button
              type="button"
              onClick={handleGetGps}
              disabled={gpsLoading}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>📍</span>
              <span>{gpsLoading ? 'Locating...' : 'Use Current GPS'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="longitude" className="block text-xs font-semibold text-slate-700 mb-1">
                Longitude (coordinates[0]: -180 to 180) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                id="longitude"
                name="longitude"
                value={formData.longitude}
                onChange={handleChange}
                placeholder="e.g. 83.3732"
                required
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label htmlFor="latitude" className="block text-xs font-semibold text-slate-700 mb-1">
                Latitude (coordinates[1]: -90 to 90) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                id="latitude"
                name="latitude"
                value={formData.latitude}
                onChange={handleChange}
                placeholder="e.g. 26.7606"
                required
                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label htmlFor="notes" className="block text-sm font-semibold text-slate-700 mb-1">
            Notes / Soil / Irrigation Details <span className="text-xs text-slate-400 font-normal">(Optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows="3"
            value={formData.notes}
            onChange={handleChange}
            placeholder="e.g. Drip irrigated plot, clay-loam soil..."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
