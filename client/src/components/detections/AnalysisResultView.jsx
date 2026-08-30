/**
 * AnalysisResultView.jsx
 *
 * Visualizer for AI analysis results (prediction name, type, confidence %, severity).
 * Strictly displays backend server state without calculating risk or confidence routing.
 */

import React from 'react';

export default function AnalysisResultView({ prediction, severity, status }) {
  if (!prediction && !severity) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-slate-500 text-sm">
        No diagnostic results available yet. Run AI analysis to obtain predictions.
      </div>
    );
  }

  const confidenceValue = prediction?.confidence !== undefined && prediction?.confidence !== null
    ? `${Math.round(prediction.confidence * 100)}% (${prediction.confidence})`
    : 'Not available';

  const confidencePercent = prediction?.confidence !== undefined && prediction?.confidence !== null
    ? Math.min(Math.max(prediction.confidence * 100, 0), 100)
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
      <div>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
          Identified Condition / Diagnosis
        </span>
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-2xl font-extrabold text-slate-900">
            {prediction?.name || 'Unknown Condition'}
          </h2>
          {prediction?.type && (
            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-green-100 text-green-800 uppercase tracking-wide">
              {prediction.type}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
        {/* Confidence Display */}
        <div className="bg-slate-50/90 p-4 rounded-xl border border-slate-200/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">Model Confidence</span>
            <span className="text-sm font-bold text-slate-900 font-mono">{confidenceValue}</span>
          </div>
          {prediction?.confidence !== undefined && prediction?.confidence !== null && (
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-2">
            Confidence represents the statistical likelihood score calculated by the model.
          </p>
        </div>

        {/* Severity Display */}
        <div className="bg-slate-50/90 p-4 rounded-xl border border-slate-200/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">Apparent Severity</span>
            <span className="text-sm font-bold text-slate-900 capitalize">
              {severity?.level || 'Not estimated'}
            </span>
          </div>
          {severity?.score !== undefined && severity?.score !== null && (
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(Math.max(severity.score, 0), 100)}%` }}
              />
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-2">
            {severity?.score !== undefined && severity?.score !== null
              ? `Severity index: ${severity.score}/100 based on observed leaf coverage.`
              : 'Severity assessment is not supported or was null for this class.'}
          </p>
        </div>
      </div>

      {status === 'CORRECTED' && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-xs">
          <span className="font-bold block mb-0.5">ℹ️ Expert Review Correction Notice</span>
          This report was reviewed by an agricultural expert. (Note: Details of any corrected diagnosis reflect official expert verification).
        </div>
      )}
    </div>
  );
}
