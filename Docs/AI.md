# Crop Health Early Warning & Management System

## AI & Intelligence Specification

**Problem Statement:** SIH26131 — Early Detection and Management of Crop Diseases and Pest Infestations

**Document Status:** MVP AI Specification — Source of Truth

---

# 1. Purpose

The AI subsystem is responsible for analyzing crop images and identifying possible diseases or pest infestations.

The AI subsystem should provide:

* Disease/pest prediction.
* Confidence score.
* Severity estimation where technically supported.
* Model/version information.
* Uncertainty handling.

The AI subsystem is **not** responsible for:

* User authentication.
* Database management.
* Authorization.
* Final agricultural policy decisions.
* Direct pesticide prescribing.
* Regional alert generation.
* Expert management.
* Application-level business logic.

Those responsibilities belong to the backend and other system components.

---

# 2. Intelligence Pipeline

The complete crop-health intelligence pipeline is:

```text
Crop Image
    ↓
Image Preprocessing
    ↓
AI Model
    ↓
Disease / Pest Prediction
    ↓
Confidence
    ↓
Severity
    ↓
Weather + Crop Stage + Location + Local Reports
    ↓
Risk Engine
    ↓
Management Recommendation
    ↓
Expert Validation When Required
    ↓
Follow-Up Monitoring
```

The AI model therefore provides **one important signal**, not the entire final decision.

---

# 3. AI Service Boundary

The AI service runs independently from the Node.js backend.

```text
Node.js Backend
       ↓
HTTP Request
       ↓
Python FastAPI
       ↓
ML Model
       ↓
Prediction
       ↓
FastAPI Response
       ↓
Node.js Backend
```

The frontend never calls the AI service directly.

---

# 4. AI Input

The initial AI API may receive:

```text
image
crop
growthStage
symptoms
```

### Required

* Crop image.
* Crop type.

### Optional

* Growth stage.
* Farmer-described symptoms.

The model may use only the image in the first version.

Additional contextual inputs can be introduced later if the trained model supports them.

---

# 5. AI Output

The AI service should return structured prediction information.

Example:

```json
{
  "success": true,
  "prediction": {
    "type": "disease",
    "name": "Early Blight",
    "confidence": 0.91,
    "severity": {
      "level": "moderate",
      "score": 62
    }
  },
  "model": {
    "name": "crop-health-model",
    "version": "1.0"
  }
}
```

Possible prediction types:

```text
disease
pest
healthy
unknown
```

---

# 6. Confidence

Confidence is represented as a number between:

```text
0.0 and 1.0
```

Example:

```text
0.91 = 91%
```

The system should distinguish between:

* Model confidence.
* Overall crop-health risk.

These are different concepts.

---

# 7. Confidence Handling

Initial conceptual thresholds:

```text
< 0.60
LOW CONFIDENCE

0.60 – 0.84
MEDIUM CONFIDENCE

>= 0.85
HIGH CONFIDENCE
```

These thresholds are configurable and must not be hardcoded in multiple parts of the application.

They should be defined centrally.

### Low confidence

The system should:

* Avoid presenting a definitive diagnosis.
* Recommend additional information or expert review.
* Allow the case to remain unresolved.

### Medium confidence

The system may:

* Present a possible diagnosis.
* Explain uncertainty.
* Ask additional questions.
* Recommend monitoring or expert validation.

### High confidence

The system may:

* Present the likely prediction.
* Provide appropriate management guidance.
* Continue to apply broader risk checks.

High confidence still does not mean guaranteed diagnosis.

---

# 8. Unknown / Uncertain Class

The AI service must support:

```json
{
  "prediction": {
    "type": "unknown",
    "name": null,
    "confidence": 0.42,
    "severity": null
  }
}
```

The system must not invent a disease name when the model cannot reliably classify the image.

---

# 9. Severity

Severity describes the apparent extent or seriousness of the condition.

Initial levels:

```text
LOW
MODERATE
HIGH
CRITICAL
```

If severity estimation is not sufficiently reliable for a specific model/class, the system should return:

```text
null
```

rather than fabricating a severity value.

The distinction between:

```text
Disease confidence
```

and:

```text
Disease severity
```

must be maintained.

---

# 10. Image Preprocessing

The AI service may perform preprocessing such as:

```text
Image
 ↓
Validation
 ↓
Resize
 ↓
Normalization
 ↓
Format conversion
 ↓
Model input
```

The preprocessing pipeline must match the preprocessing used during model training.

If a model is trained with a specific image size and normalization strategy, production inference must use the same assumptions.

---

# 11. Model Scope

The first model should support a **limited, clearly documented set of crops and diseases/pests**.

Do not claim that the system can accurately identify every agricultural disease.

The supported classes should be documented after evaluating:

* Dataset quality.
* Number of samples.
* Class balance.
* Visual distinguishability.
* Agricultural relevance.
* Validation performance.

The initial crop/class scope will be finalized before production model integration.

---

# 12. Dataset Strategy

The dataset should contain representative examples of supported conditions.

Dataset preparation should include:

```text
Collection
   ↓
Cleaning
   ↓
Duplicate checking
   ↓
Label verification
   ↓
Train / Validation / Test split
   ↓
Augmentation where appropriate
   ↓
Training
   ↓
Evaluation
```

Data leakage must be avoided.

For example, near-identical images from the same source should not unintentionally appear across both training and test sets.

---

# 13. Dataset Quality

The system should prioritize:

* Correct labels.
* Diverse lighting conditions.
* Different camera qualities.
* Different disease stages.
* Different varieties where possible.
* Field-like images rather than only laboratory-style images.
* Geographical diversity where available.

The model should not be considered production-ready only because it performs well on a convenient public dataset.

---

# 14. Model Evaluation

Do not evaluate the model using only overall accuracy.

Track appropriate metrics such as:

```text
Accuracy
Precision
Recall
F1-score
Confusion Matrix
Per-class performance
```

For imbalanced datasets, per-class performance is especially important.

Important questions include:

* Which diseases are often confused?
* Which classes have poor recall?
* What happens to low-quality images?
* How often is the model uncertain?

---

# 15. Model Versioning

Every prediction should be traceable to a model version.

Example:

```json
{
  "model": {
    "name": "crop-health-model",
    "version": "1.0"
  }
}
```

When the model changes:

```text
1.0
↓
1.1
↓
2.0
```

predictions should remain associated with the version that produced them.

This is important for debugging and model evaluation.

---

# 16. AI Failure Handling

## AI Service Unavailable

```text
Node Backend
    ↓
AI request fails
    ↓
Save detection
    ↓
Status = AI_FAILED
    ↓
Allow retry / expert review
```

The entire application should not crash because the AI service is temporarily unavailable.

---

## Invalid Image

The AI service should reject unsupported or corrupt images.

The backend should return an understandable message to the user.

---

## Unsupported Crop

If the requested crop is outside model scope:

```text
Unsupported Crop
      ↓
Do not make prediction
      ↓
Explain limitation
      ↓
Offer expert assistance where appropriate
```

---

# 17. Risk Engine

The Risk Engine is separate from the AI model.

It combines multiple signals.

Potential inputs:

```text
AI prediction
AI confidence
Severity
Weather
Crop stage
Location
Recent local reports
Historical disease activity
```

Conceptual flow:

```text
AI Evidence
      +
Weather Risk
      +
Crop Stage Risk
      +
Local Report Risk
      +
Historical Risk
      ↓
Risk Engine
      ↓
Risk Score
      ↓
Risk Level
```

Initial risk levels:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

The risk engine must also produce explainable contributing factors.

---

# 18. Example Risk Assessment

Example:

```text
AI confidence: 91%
Severity: Moderate

Weather:
High humidity
Recent rainfall

Crop stage:
Susceptible

Nearby reports:
7 cases

Historical activity:
Moderate

              ↓

Overall Risk:
HIGH
```

The user should be able to see why the system assigned this level.

---

# 19. Risk Is Not Diagnosis

This distinction is mandatory.

Example:

```text
Disease Prediction:
Early Blight — 91%

Overall Risk:
HIGH
```

The 91% is a model confidence value.

The HIGH risk may result from:

* The likely disease.
* Weather conditions.
* Crop stage.
* Local spread.
* Historical observations.

One must not be substituted for the other.

---

# 20. Weather Intelligence

Weather data is an external signal used by the Risk Engine.

Potential variables:

```text
Temperature
Humidity
Rainfall
Rain probability
Wind speed
Forecast information
```

The AI service itself does not need to directly call weather APIs.

The backend obtains and normalizes weather information.

---

# 21. Local Surveillance Intelligence

Individual detections can be combined into a regional signal.

Example:

```text
Farmer A → Early Blight
Farmer B → Early Blight
Farmer C → Early Blight
Farmer D → Early Blight

        ↓

Local cluster detected
        ↓
Regional risk increases
```

This information belongs to the backend risk/hotspot system rather than the image model.

---

# 22. Expert-in-the-Loop

The AI system must support human validation.

Trigger conditions may include:

```text
Low confidence
Unusual prediction
High-risk case
Farmer requests review
Potential outbreak
Model uncertainty
```

Workflow:

```text
AI Prediction
     ↓
Confidence / Risk Check
     ↓
Expert Review
     ↓
Confirmed / Corrected / Referred
```

---

# 23. Expert Feedback

Expert corrections should be stored separately from the original AI result.

Example:

```text
AI Prediction:
Early Blight

Expert:
Corrected → Late Blight
```

Do not overwrite the original AI prediction.

This preserves traceability.

---

# 24. Feedback Dataset

Expert-confirmed reports can become feedback data.

```text
AI Prediction
      ↓
Expert Validation
      ↓
Verified Field Record
      ↓
Evaluation Dataset
      ↓
Model Improvement
```

The MVP should focus on collecting quality feedback rather than automatically retraining production models.

---

# 25. Follow-Up Intelligence

A later image or observation may provide additional evidence.

Example:

```text
Initial:
Early Blight — Moderate

Follow-up:
Symptoms reduced

Second follow-up:
Healthy / Controlled
```

Follow-up images may later be used for model evaluation and temporal crop-health analysis.

---

# 26. Explainability

The system should explain predictions at an appropriate level.

Example:

```text
Likely Early Blight

Confidence: 91%

Observed visual indicators:
• Brown lesions
• Leaf yellowing
• Pattern consistent with learned examples
```

Explanations must not claim that the model specifically detected a feature unless that capability is genuinely implemented.

Do not fabricate visual explanations.

---

# 27. No Hallucinated Diagnosis

The AI system must never:

* Invent a disease.
* Invent confidence.
* Invent severity.
* Pretend unsupported crops are supported.
* Pretend expert validation occurred.
* Claim laboratory confirmation.
* Present generated text as verified agricultural fact.

When uncertain:

> **Say that the system is uncertain.**

---

# 28. Recommendation Boundary

The AI model should not independently generate unrestricted pesticide prescriptions.

Management recommendations should come through the backend recommendation system using controlled agricultural guidance.

The AI contributes:

```text
What may be happening?
```

The recommendation system determines:

```text
What actions should be suggested?
```

with appropriate safety boundaries.

---

# 29. Mock AI Phase

Before integrating the real ML model, the application will use a mock AI response.

Example:

```json
{
  "success": true,
  "prediction": {
    "type": "disease",
    "name": "Early Blight",
    "confidence": 0.91,
    "severity": {
      "level": "moderate",
      "score": 62
    }
  },
  "model": {
    "name": "mock-model",
    "version": "0.1"
  }
}
```

This allows frontend, backend, risk and recommendation development to proceed before the real model is ready.

---

# 30. Real AI Integration

Once the real model is ready:

```text
Mock AI
   ↓
Replace implementation
   ↓
Real FastAPI inference
   ↓
Same API contract
```

The rest of the application should continue using the same expected prediction structure wherever possible.

This minimizes integration changes.

---

# 31. AI API Contract

Internal endpoint:

```text
POST /predict
```

Input:

```text
multipart/form-data
```

Example fields:

```text
image
crop
growthStage
symptoms
```

Output:

```json
{
  "success": true,
  "prediction": {
    "type": "disease",
    "name": "Early Blight",
    "confidence": 0.91,
    "severity": {
      "level": "moderate",
      "score": 62
    }
  },
  "model": {
    "name": "crop-health-model",
    "version": "1.0"
  }
}
```

The API contract is also defined in `Docs/API.md`.

---

# 32. AI Health Endpoint

Internal endpoint:

```text
GET /health
```

Expected:

```json
{
  "status": "ok"
}
```

This allows the backend and deployment system to determine whether the AI service is available.

---

# 33. Performance Considerations

The system should track:

* Image upload time.
* AI inference time.
* Total detection processing time.
* AI failure rate.

The MVP should optimize for acceptable end-to-end response time rather than premature infrastructure complexity.

---

# 34. Model Monitoring — Future

A future production system may monitor:

```text
Prediction distribution
Confidence distribution
Error rate
Expert correction rate
Per-class performance
Data drift
Model drift
```

This is outside the initial MVP.

---

# 35. Future AI Improvements

Potential future improvements:

* More crops.
* More disease classes.
* Pest identification.
* Multi-disease detection.
* Object detection for visible pests.
* Image segmentation for affected-area estimation.
* Multimodal models.
* Disease progression prediction.
* Regional outbreak forecasting.
* Sensor/weather fusion models.
* Satellite-assisted crop monitoring.

These should be added only after validating the MVP.

---

# 36. AI Development Principles

### Principle 1 — Uncertainty

AI must be able to say:

> "I don't know."

### Principle 2 — Traceability

Every prediction should be associated with a model version.

### Principle 3 — Separation

AI inference, application logic and recommendations remain separate.

### Principle 4 — Human Oversight

Important uncertain cases can be escalated to experts.

### Principle 5 — Evidence

AI outputs should be evaluated against verified data.

### Principle 6 — Controlled Recommendations

AI should not be treated as an unrestricted authority for chemical treatment.

### Principle 7 — No Fabrication

Never invent predictions, confidence values, expert validation or supporting evidence.

---

# 37. MVP AI Deliverables

The MVP must contain:

```text
✅ Python/FastAPI AI service
✅ /health endpoint
✅ /predict endpoint
✅ Mock AI implementation
✅ Defined prediction contract
✅ Confidence handling
✅ Unknown/uncertain handling
✅ Model version field
✅ Real model integration
✅ Basic model evaluation
```

Where the real model is not yet ready, the mock implementation may temporarily be used for application integration.

---

# 38. Definition of Done

The AI subsystem is considered integrated when:

```text
Image
  ↓
Backend
  ↓
AI Service
  ↓
Prediction
  ↓
Confidence
  ↓
Severity
  ↓
Backend Risk Engine
  ↓
Recommendation
```

works end-to-end and failure cases are handled gracefully.

---

# 39. Source of Truth

This document defines AI behavior and boundaries.

Related documents:

```text
Docs/Product.md
→ Product requirements

Docs/ARCHITECTURE.md
→ Service architecture

Docs/DATABASE.md
→ Data storage

Docs/API.md
→ API contracts

AI_RULES.md
→ Coding-agent behavior
```

Any major change to AI behavior, prediction schema, confidence handling or service boundaries must be reflected in this document.
