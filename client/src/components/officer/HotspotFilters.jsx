/**
 * HotspotFilters.jsx
 *
 * Filter component for Hotspot List and Map screens.
 */

import React, { useState } from 'react';

export default function HotspotFilters({ initialFilters, onFilterApply, showRisk = false, showDates = true }) {
  const [filters, setFilters] = useState({
    crop: initialFilters.crop || '',
    disease: initialFilters.disease || '',
    risk: initialFilters.risk || '',
    from: initialFilters.from || '',
    to: initialFilters.to || '',
  });
  const [dateError, setDateError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    if (name === 'from' || name === 'to') {
      setDateError('');
    }
  };

  const handleApply = (e) => {
    e.preventDefault();
    if (showDates && filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) {
      setDateError('"From" date must not be later than "To" date.');
      return;
    }
    setDateError('');
    onFilterApply(filters);
  };

  const handleClear = () => {
    const cleared = { crop: '', disease: '', risk: '', from: '', to: '' };
    setFilters(cleared);
    setDateError('');
    onFilterApply(cleared);
  };

  return (
    <form onSubmit={handleApply} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
      {dateError && (
        <div className="mb-3 text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
          ⚠️ {dateError}
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-slate-500 mb-1">Crop</label>
          <input
            type="text"
            name="crop"
            value={filters.crop}
            onChange={handleChange}
            placeholder="e.g. Tomato"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-slate-500 mb-1">Disease/Pest</label>
          <input
            type="text"
            name="disease"
            value={filters.disease}
            onChange={handleChange}
            placeholder="e.g. Early Blight"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {showRisk && (
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-slate-500 mb-1">Risk Level</label>
            <select
              name="risk"
              value={filters.risk}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Risks</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
        )}

        {showDates && (
          <>
            <div className="w-full md:w-36">
              <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
              <input
                type="date"
                name="from"
                value={filters.from}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="w-full md:w-36">
              <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
              <input
                type="date"
                name="to"
                value={filters.to}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <div className="flex gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handleClear}
            className="flex-1 md:flex-none px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Reset
          </button>
          <button
            type="submit"
            className="flex-1 md:flex-none px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </form>
  );
}
