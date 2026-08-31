/**
 * ExpertReviewDetailPage.jsx
 *
 * Detailed review and decision interface for Agricultural Experts.
 * Allows claiming a case and submitting confirmation or corrected diagnoses.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import expertService from '../services/expertService';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';

export default function ExpertReviewDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [detection, setDetection] = useState(null);
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Form State
  const [mode, setMode] = useState('confirm'); // 'confirm' or 'correct'
  const [comment, setComment] = useState('');
  const [requiresLabDiagnosis, setRequiresLabDiagnosis] = useState(false);

  // Correction Form Fields
  const [correctedType, setCorrectedType] = useState('disease');
  const [correctedName, setCorrectedName] = useState('');
  const [severityLevel, setSeverityLevel] = useState('moderate');

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await expertService.getDetails(id);
      if (res.success && res.data) {
        setDetection(res.data.detection);
        setReview(res.data.review);
        if (res.data.detection?.prediction?.name) {
          setCorrectedName(res.data.detection.prediction.name);
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleClaim = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await expertService.claim(id);
      if (res.success) {
        setSuccessMessage('Case claimed successfully. You may now submit your expert decision.');
        await fetchDetails();
      }
    } catch (err) {
      setError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      const res = await expertService.confirm(id, {
        comment: comment.trim() || undefined,
        requiresLabDiagnosis,
      });
      if (res.success) {
        setSuccessMessage('AI Diagnosis confirmed successfully! Redirecting to queue...');
        setTimeout(() => navigate('/expert/queue'), 1800);
      }
    } catch (err) {
      setError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCorrect = async (e) => {
    e.preventDefault();
    if (!correctedName.trim()) {
      setError({ message: 'Corrected condition name is required.' });
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const res = await expertService.correct(id, {
        correctedDiagnosis: {
          type: correctedType,
          name: correctedName.trim(),
          severity: {
            level: severityLevel,
          },
        },
        comment: comment.trim() || undefined,
        requiresLabDiagnosis,
      });
      if (res.success) {
        setSuccessMessage('Expert diagnosis correction submitted successfully! Redirecting to queue...');
        setTimeout(() => navigate('/expert/queue'), 1800);
      }
    } catch (err) {
      setError(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <LoadingSpinner size="lg" message="Loading case details..." />
      </div>
    );
  }

  if (!detection) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Detection Not Found</h2>
        <p className="text-sm text-slate-500 mb-6">The requested diagnostic case could not be located.</p>
        <Link to="/expert/queue" className="px-4 py-2 bg-emerald-700 text-white rounded-xl font-semibold text-sm">
          Return to Queue
        </Link>
      </div>
    );
  }

  const isClaimed = detection.status === 'EXPERT_REVIEW_IN_PROGRESS';
  const isCompleted = detection.status === 'CONFIRMED' || detection.status === 'CORRECTED';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased pb-12">
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            to="/expert/queue"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-all"
          >
            <span>←</span>
            <span>Back to Queue</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">Case ID: {detection.id}</span>
            <StatusBadge status={detection.status} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8">
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-sm font-semibold flex items-center gap-2.5">
            <span>✅</span>
            <span>{successMessage}</span>
          </div>
        )}

        {error && <ErrorAlert error={error} onDismiss={() => setError(null)} className="mb-6" />}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Crop Image & Metadata */}
          <div className="lg:col-span-5 space-y-6">
            {/* Image Container */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="aspect-square bg-slate-100 relative">
                <img
                  src={detection.image?.url}
                  alt={detection.crop}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = 'https://placehold.co/500x500?text=No+Image';
                  }}
                />
              </div>
              <div className="p-4 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
                <span>Submitted: {new Date(detection.createdAt).toLocaleString()}</span>
                <span className="capitalize font-semibold text-slate-700">{detection.crop}</span>
              </div>
            </div>

            {/* Field & Symptom Details */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-xs">Field Context</h3>
              <div className="text-xs space-y-2 text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="font-semibold text-slate-500">Crop:</span>
                  <span className="font-bold text-slate-800 capitalize">{detection.crop}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="font-semibold text-slate-500">Growth Stage:</span>
                  <span className="capitalize text-slate-800">{detection.growthStage || 'Not specified'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="font-semibold text-slate-500">Location Coordinates:</span>
                  <span className="font-mono text-slate-700">
                    {detection.location?.coordinates ? `${detection.location.coordinates[1].toFixed(4)}, ${detection.location.coordinates[0].toFixed(4)}` : 'N/A'}
                  </span>
                </div>
                {detection.symptoms && detection.symptoms.length > 0 && (
                  <div className="pt-2">
                    <span className="font-semibold text-slate-500 block mb-1">Reported Symptoms:</span>
                    <p className="bg-slate-50 p-2.5 rounded-xl text-slate-700 border border-slate-100">
                      {Array.isArray(detection.symptoms) ? detection.symptoms.join(', ') : detection.symptoms}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: AI Analysis & Expert Decision Action Form */}
          <div className="lg:col-span-7 space-y-6">
            {/* AI Prediction Summary */}
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">AI Diagnostic Result</span>
                <span className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg font-semibold capitalize">
                  {detection.prediction?.type || 'Unknown'}
                </span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {detection.prediction?.name || 'Uncertain Condition'}
              </h2>
              <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
                <div>
                  Model Confidence:{' '}
                  <span className="font-bold text-slate-900">
                    {detection.prediction?.confidence ? `${(detection.prediction.confidence * 100).toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div>
                  Severity:{' '}
                  <span className="font-semibold text-slate-700">
                    {detection.severity || 'None (Requires Expert Assessment)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Expert Action Section */}
            {!isClaimed && !isCompleted && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs text-center space-y-4">
                <div className="text-3xl">📋</div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Claim This Case for Expert Review</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Claiming locks the case so other extension officers know you are currently conducting this diagnostic assessment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={actionLoading}
                  className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {actionLoading ? 'Claiming Case...' : 'Claim Case for Review'}
                </button>
              </div>
            )}

            {isClaimed && !isCompleted && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Submit Expert Diagnosis</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Choose whether to confirm the model's output or correct the diagnosis with specialist findings.
                  </p>
                </div>

                {/* Mode Selector Tabs */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setMode('confirm')}
                    className={`py-2 px-4 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      mode === 'confirm'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ✓ Confirm Original Diagnosis
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('correct')}
                    className={`py-2 px-4 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      mode === 'correct'
                        ? 'bg-white text-amber-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ✎ Correct Diagnosis
                  </button>
                </div>

                {/* Confirm Form */}
                {mode === 'confirm' && (
                  <form onSubmit={handleConfirm} className="space-y-4">
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                      You are confirming that this crop leaf presents{' '}
                      <span className="font-bold">{detection.prediction?.name || 'the AI diagnosis'}</span>.
                    </div>

                    <div>
                      <label htmlFor="confirmComment" className="block text-xs font-semibold text-slate-700 mb-1">
                        Expert Notes / Observations (Optional)
                      </label>
                      <textarea
                        id="confirmComment"
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Add specific observations or advice for the farmer..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="labDiagConfirm"
                        checked={requiresLabDiagnosis}
                        onChange={(e) => setRequiresLabDiagnosis(e.target.checked)}
                        className="rounded-sm border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <label htmlFor="labDiagConfirm" className="text-xs text-slate-700 font-medium">
                        Requires Laboratory Diagnosis confirmation
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      {actionLoading ? 'Submitting...' : 'Confirm AI Diagnosis'}
                    </button>
                  </form>
                )}

                {/* Correct Form */}
                {mode === 'correct' && (
                  <form onSubmit={handleCorrect} className="space-y-4">
                    <div>
                      <label htmlFor="correctedType" className="block text-xs font-semibold text-slate-700 mb-1">
                        Condition Category
                      </label>
                      <select
                        id="correctedType"
                        value={correctedType}
                        onChange={(e) => setCorrectedType(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-semibold"
                      >
                        <option value="disease">Disease</option>
                        <option value="pest">Pest Infestation</option>
                        <option value="healthy">Healthy (No disease)</option>
                        <option value="unknown">Unknown / Non-crop</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="correctedName" className="block text-xs font-semibold text-slate-700 mb-1">
                        Corrected Condition Name
                      </label>
                      <input
                        type="text"
                        id="correctedName"
                        value={correctedName}
                        onChange={(e) => setCorrectedName(e.target.value)}
                        required
                        placeholder="e.g. Tomato Late Blight, Tomato Leaf Mold"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-semibold"
                      />
                    </div>

                    <div>
                      <label htmlFor="severityLevel" className="block text-xs font-semibold text-slate-700 mb-1">
                        Assessed Severity Level
                      </label>
                      <select
                        id="severityLevel"
                        value={severityLevel}
                        onChange={(e) => setSeverityLevel(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      >
                        <option value="low">Low</option>
                        <option value="moderate">Moderate</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="correctComment" className="block text-xs font-semibold text-slate-700 mb-1">
                        Correction Notes & Guidance (Optional)
                      </label>
                      <textarea
                        id="correctComment"
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Explain the correction rationale for the farmer..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="labDiagCorrect"
                        checked={requiresLabDiagnosis}
                        onChange={(e) => setRequiresLabDiagnosis(e.target.checked)}
                        className="rounded-sm border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <label htmlFor="labDiagCorrect" className="text-xs text-slate-700 font-medium">
                        Requires Laboratory Diagnosis confirmation
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="w-full py-3 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      {actionLoading ? 'Submitting Correction...' : 'Submit Expert Correction'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {isCompleted && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">✅</span>
                  <h3 className="text-base font-bold text-slate-900">Review Completed</h3>
                </div>
                <p className="text-xs text-slate-600">
                  This case has been officially finalized with decision{' '}
                  <span className="font-bold uppercase text-emerald-800">{review?.decision || detection.status}</span>.
                </p>
                {review?.comment && (
                  <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-700">
                    <span className="font-semibold block mb-0.5">Expert Comments:</span>
                    {review.comment}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
