/**
 * FieldCard.jsx
 *
 * Card component representing a Farmer's field with quick actions.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../common/StatusBadge';

export default function FieldCard({ field }) {
  if (!field) return null;

  const formattedDate = field.plantingDate
    ? new Date(field.plantingDate).toLocaleDateString()
    : 'Not specified';

  const areaDisplay = field.area?.value !== undefined && field.area?.value !== null
    ? `${field.area.value} ${field.area.unit || 'acres'}`
    : 'N/A';

  const coordinatesDisplay = field.location?.coordinates
    ? `[${field.location.coordinates[0].toFixed(2)}, ${field.location.coordinates[1].toFixed(2)}]`
    : 'N/A';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 line-clamp-1">{field.name}</h3>
            <p className="text-xs font-semibold text-green-700 mt-0.5">
              🌾 {field.crop} {field.variety ? `(${field.variety})` : ''}
            </p>
          </div>
          <StatusBadge status={field.isActive} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50/80 p-3 rounded-xl border border-slate-100 mb-4">
          <div>
            <span className="text-slate-400 block text-[11px]">Area:</span>
            <span className="font-medium text-slate-700">{areaDisplay}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Stage:</span>
            <span className="font-medium text-slate-700 capitalize">{field.growthStage || 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Planted:</span>
            <span className="font-medium text-slate-700">{formattedDate}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Coordinates:</span>
            <span className="font-mono font-medium text-slate-700 text-[11px]">{coordinatesDisplay}</span>
          </div>
        </div>

        {field.notes && (
          <p className="text-xs text-slate-500 line-clamp-2 italic mb-4">
            "{field.notes}"
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
        <Link
          to={`/fields/${field.id}`}
          className="flex-1 text-center py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
        >
          View Details
        </Link>
        <Link
          to={`/detections/new?fieldId=${field.id}`}
          className="py-2 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-1"
          title="Analyze crop from this field"
        >
          <span>📷</span>
          <span>Analyze</span>
        </Link>
      </div>
    </div>
  );
}
