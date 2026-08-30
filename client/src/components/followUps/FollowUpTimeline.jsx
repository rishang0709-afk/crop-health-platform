/**
 * FollowUpTimeline.jsx
 *
 * Longitudinal timeline tracking crop condition over time.
 * Displays initial diagnosis node and subsequent farmer-reported observations
 * in chronological order (sorted by followUpDate ascending).
 */

import React, { useState, useEffect } from 'react';
import { followUpService } from '../../services/followUpService';
import FollowUpForm from './FollowUpForm';
import OutcomeBadge from './OutcomeBadge';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorAlert from '../common/ErrorAlert';

export default function FollowUpTimeline({ detection }) {
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const ELIGIBLE_STATUSES = [
    'ACTIONABLE',
    'CONFIRMED',
    'CORRECTED',
    'FOLLOW_UP_REQUIRED',
  ];

  const isEligible = ELIGIBLE_STATUSES.includes(detection?.status);

  useEffect(() => {
    let isMounted = true;

    async function fetchFollowUps() {
      if (!detection?.id || !isEligible) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const res = await followUpService.getFollowUps(detection.id);
        if (isMounted && res.data?.data?.followUps) {
          setFollowUps(res.data.data.followUps);
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

    fetchFollowUps();

    return () => {
      isMounted = false;
    };
  }, [detection?.id, isEligible]);

  const handleFormSubmit = async (formData) => {
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const res = await followUpService.createFollowUp(detection.id, formData);
      if (res.data?.data?.followUp) {
        const newFollowUp = res.data.data.followUp;
        // Append new record while preserving chronological order by followUpDate
        setFollowUps((prev) => {
          const updated = [...prev, newFollowUp];
          return updated.sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));
        });
        setIsFormOpen(false);
        setSuccessMessage('Observation successfully added to your crop health timeline.');
      }
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isEligible) {
    return null;
  }

  const initialDetectionDate = new Date(detection.createdAt).toLocaleString();
  const diagnosisName = detection.prediction?.name || 'Crop Health Observation';
  const cropName = detection.crop || 'Crop';

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
      {/* Header and Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
            Crop Health Timeline
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Longitudinal monitoring of farmer-reported observations and recovery progress.
          </p>
        </div>

        {!isFormOpen && (
          <button
            type="button"
            onClick={() => {
              setIsFormOpen(true);
              setSuccessMessage(null);
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>+</span>
            <span>Record Follow-Up</span>
          </button>
        )}
      </div>

      {successMessage && (
        <div className="bg-green-50 text-green-800 border border-green-200 px-4 py-3 rounded-2xl text-xs flex justify-between items-center">
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-green-600 hover:text-green-900 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {/* Expandable Form */}
      {isFormOpen && (
        <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
          <FollowUpForm
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setIsFormOpen(false);
              setSubmitError(null);
            }}
            loading={submitting}
            error={submitError}
          />
        </div>
      )}

      {loading ? (
        <div className="py-8">
          <LoadingSpinner size="md" message="Loading crop timeline..." />
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-200 ml-4 sm:ml-6 pl-6 sm:pl-8 space-y-8 py-2">
          {/* Node 1: Initial Detection Event */}
          <div className="relative">
            {/* Timeline Dot */}
            <div className="absolute -left-[31px] sm:-left-[39px] top-1 w-4 h-4 bg-slate-400 rounded-full ring-4 ring-white shadow-xs" />

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Initial Detection Report
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {initialDetectionDate}
                </span>
              </div>
              <p className="text-xs text-slate-700">
                Diagnosis recorded for <span className="font-semibold">{cropName}</span>: {' '}
                <span className="font-semibold text-slate-900">{diagnosisName}</span>
                {detection.prediction?.confidence
                  ? ` (${Math.round(detection.prediction.confidence * 100)}% confidence)`
                  : ''}
                .
              </p>
            </div>
          </div>

          {/* Follow-up Nodes */}
          {followUps.length > 0 ? (
            followUps.map((fu, idx) => (
              <div key={fu.id || idx} className="relative">
                {/* Timeline Dot */}
                <div className="absolute -left-[31px] sm:-left-[39px] top-1 w-4 h-4 bg-green-500 rounded-full ring-4 ring-white shadow-xs" />

                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        Follow-Up Observation
                      </span>
                      <OutcomeBadge status={fu.status} />
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {new Date(fu.followUpDate || fu.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    {fu.imageUrl && (
                      <div className="shrink-0 w-24 h-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                        <img
                          src={fu.imageUrl}
                          alt="Follow-up crop observation"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        Farmer Observation Notes
                      </span>
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {fu.observation || (
                          <span className="italic text-slate-400">No additional notes provided.</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-400 italic py-1">
              No follow-up observations recorded yet. Use &ldquo;Record Follow-Up&rdquo; to log your crop recovery progress.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
