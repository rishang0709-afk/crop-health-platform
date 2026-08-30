/**
 * NewDetectionPage.jsx
 *
 * Flow for capturing/uploading a crop photo, registering a detection,
 * and triggering immediate AI analysis with confidence-based routing.
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fieldService } from '../services/fieldService';
import { detectionService } from '../services/detectionService';
import DetectionForm from '../components/detections/DetectionForm';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';

export default function NewDetectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialFieldId = searchParams.get('fieldId') || '';

  const [fields, setFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStep, setSubmissionStep] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadFields() {
      setLoadingFields(true);
      setError(null);

      try {
        const res = await fieldService.getFields();
        setFields(res.data?.fields || []);
      } catch (err) {
        setError(err);
      } finally {
        setLoadingFields(false);
      }
    }

    loadFields();
  }, []);

  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    setError(null);
    setSubmissionStep('Uploading crop image...');

    let createdId = null;

    try {
      // Step 1: Create detection record with Cloudinary upload
      const createRes = await detectionService.createDetection(formData);
      createdId = createRes.data?.detection?.id;

      if (!createdId) {
        throw new Error('Detection record could not be created');
      }

      // Step 2: Trigger AI analysis
      setSubmissionStep('Running AI model inference & analysis...');
      await detectionService.analyzeDetection(createdId);

      // Step 3: Navigate to detection detail page to review results
      navigate(`/detections/${createdId}`);
    } catch (err) {
      // If detection was created but analysis failed, navigate to the detection
      // page so the farmer can view the record and retry analysis
      if (createdId) {
        navigate(`/detections/${createdId}`);
      } else {
        setError(err);
        setIsSubmitting(false);
      }
    }
  };

  if (loadingFields) {
    return <LoadingSpinner fullPage size="lg" message="Loading your fields..." />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to="/detections" className="text-xs font-semibold text-green-700 hover:text-green-800 flex items-center gap-1 mb-2">
          ← Back to Detections
        </Link>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          New Crop Health Analysis
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Upload a clear photo of an affected crop leaf or plant to identify potential diseases and pest infestations.
        </p>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}

      {isSubmitting ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-xs flex flex-col items-center justify-center text-center">
          <LoadingSpinner size="lg" message={submissionStep} />
          <p className="text-xs text-slate-400 mt-4 max-w-xs">
            Please keep this page open while the photo is uploaded and processed.
          </p>
        </div>
      ) : (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs">
          <DetectionForm
            fields={fields}
            initialFieldId={initialFieldId}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      )}
    </div>
  );
}
