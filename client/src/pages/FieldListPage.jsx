/**
 * FieldListPage.jsx
 *
 * Displays all agricultural fields owned by the authenticated farmer,
 * with filters for active/inactive status and search by name or crop.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fieldService } from '../services/fieldService';
import FieldCard from '../components/fields/FieldCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import EmptyState from '../components/common/EmptyState';

export default function FieldListPage() {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'inactive'
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function loadFields() {
      setLoading(true);
      setError(null);

      try {
        const res = await fieldService.getFields();
        setFields(res.data?.fields || []);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    loadFields();
  }, []);

  const filteredFields = fields.filter((field) => {
    // Status filter
    if (filterStatus === 'active' && !field.isActive) return false;
    if (filterStatus === 'inactive' && field.isActive) return false;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = field.name?.toLowerCase().includes(term);
      const matchCrop = field.crop?.toLowerCase().includes(term);
      const matchVariety = field.variety?.toLowerCase().includes(term);
      return matchName || matchCrop || matchVariety;
    }

    return true;
  });

  if (loading) {
    return <LoadingSpinner fullPage size="lg" message="Loading your fields..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Fields</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your registered farmland plots, crops, and geospatial locations.
          </p>
        </div>

        <Link
          to="/fields/new"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors self-start sm:self-auto"
        >
          <span>➕</span>
          <span>Register New Field</span>
        </Link>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="w-full sm:w-72">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by field name, crop, variety..."
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1 self-start sm:self-auto bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterStatus === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({fields.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterStatus === 'active'
                ? 'bg-white text-green-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active ({fields.filter((f) => f.isActive).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('inactive')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterStatus === 'inactive'
                ? 'bg-white text-slate-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Inactive ({fields.filter((f) => !f.isActive).length})
          </button>
        </div>
      </div>

      {/* Grid of Fields */}
      {filteredFields.length === 0 ? (
        <EmptyState
          icon="🌾"
          title={fields.length === 0 ? 'No fields registered yet' : 'No matching fields found'}
          description={
            fields.length === 0
              ? 'Start by registering your agricultural field with location and crop information.'
              : 'Try changing your search term or filter criteria.'
          }
          actionLabel={fields.length === 0 ? 'Add Your First Field' : undefined}
          onAction={fields.length === 0 ? () => window.location.assign('/fields/new') : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredFields.map((field) => (
            <FieldCard key={field.id} field={field} />
          ))}
        </div>
      )}
    </div>
  );
}
