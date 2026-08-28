# AI System

## Purpose

The AI system identifies possible crop diseases and pest infestations
from crop images and provides a confidence score and severity estimate.

## Input

The AI service receives:

- Crop image
- Crop type
- Growth stage
- Optional symptoms

## Output

The AI service returns:

{
  "disease": "Early Blight",
  "confidence": 0.91,
  "severity": "moderate"
}

## AI Pipeline

Image
  ↓
Preprocessing
  ↓
ML Model
  ↓
Disease Classification
  ↓
Confidence
  ↓
Severity
  ↓
Result

## Confidence Handling

Low confidence:
→ Recommend expert review

Medium confidence:
→ Ask additional questions / recommend monitoring

High confidence:
→ Provide diagnosis and management guidance

## Important

The AI must not claim certainty when confidence is low.

The system should support expert validation.

Confirmed expert diagnoses should be stored as feedback data
for future model evaluation and improvement.