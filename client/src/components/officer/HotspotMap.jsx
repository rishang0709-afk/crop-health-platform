/**
 * HotspotMap.jsx
 *
 * Renders the Leaflet map with privacy-safe aggregated CircleMarkers.
 */

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import RiskBadge from './RiskBadge';
import EmptyState from '../common/EmptyState';

export default function HotspotMap({ reports = [] }) {
  // Validate and filter map points for robustness
  const validReports = useMemo(() => {
    return reports.filter((r) => {
      if (!r || !r.center) return false;
      const lat = Number(r.center.latitude);
      const lng = Number(r.center.longitude);
      return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    });
  }, [reports]);

  // Center on first valid report, or default to central India coordinates
  const defaultCenter = [22.0, 79.0];
  const center = validReports.length > 0
    ? [Number(validReports[0].center.latitude), Number(validReports[0].center.longitude)]
    : defaultCenter;

  const getMarkerColor = (level) => {
    switch (level?.toUpperCase()) {
      case 'CRITICAL': return '#dc2626'; // red-600
      case 'HIGH': return '#ea580c'; // orange-600
      case 'MEDIUM': return '#ca8a04'; // yellow-600
      default: return '#2563eb'; // blue-600
    }
  };

  if (validReports.length === 0) {
    return (
      <EmptyState
        icon="🗺️"
        title="No Map Points Available"
        description="There are currently no qualifying regional surveillance signals matching your criteria."
      />
    );
  }

  return (
    <div className="h-[60vh] md:h-[calc(100vh-180px)] min-h-[400px] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-xs relative z-0">
      <MapContainer
        center={center}
        zoom={5}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {validReports.map((report, idx) => {
          const lat = Number(report.center.latitude);
          const lng = Number(report.center.longitude);
          const count = Number(report.reportCount) || 1;
          const markerColor = getMarkerColor(report.riskLevel);

          return (
            <CircleMarker
              key={report.id || `marker-${idx}`}
              center={[lat, lng]}
              radius={Math.min(10 + count * 1.5, 32)}
              pathOptions={{ 
                color: markerColor,
                fillColor: markerColor,
                fillOpacity: 0.65,
                weight: 2
              }}
            >
              <Popup className="rounded-2xl">
                <div className="p-1 min-w-[210px] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <RiskBadge level={report.riskLevel} />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Regional Cell
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      {report.disease || 'Unknown Diagnosis'}
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Crop: <span className="font-semibold text-slate-800">{report.crop || 'Unknown'}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-2 text-slate-600">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Reports</p>
                      <p className="font-bold text-slate-900 text-sm">{count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Avg Risk</p>
                      <p className="font-bold text-slate-900 text-sm">
                        {report.averageRiskScore !== null && report.averageRiskScore !== undefined
                          ? `${report.averageRiskScore}/100`
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-100">
                    * Aggregated ~5x5 km surveillance signal. Not an exact farm location.
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
