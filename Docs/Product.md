# Crop Health Early Warning & Management System

## SIH Problem Statement

**SIH26131 — Early Detection and Management of Crop Diseases and Pest Infestations**

---

# 1. Product Vision

Build a farmer- and extension-worker-friendly crop-health platform that detects crop diseases and pest infestations early, combines image-based diagnosis with weather and field information, identifies emerging local hotspots, provides actionable management guidance, and enables expert validation and follow-up monitoring.

The system should not behave as a simple:

> "Upload image → Get disease name"

application.

Instead, it should function as a **crop-health early-warning and decision-support system**:

> **Detect → Assess → Warn → Recommend → Validate → Monitor → Learn**

---

# 2. Problem We Are Solving

Farmers frequently identify diseases and pest infestations only after visible damage has spread.

Several factors make early intervention difficult:

* Farmers may not have immediate access to agricultural experts.
* Extension workers may cover large geographical areas.
* Laboratory diagnosis can take time.
* Weather conditions can increase disease or pest risk.
* Crop stage affects susceptibility.
* Local disease/pest history is often not available to farmers.
* Incorrect diagnosis can result in inappropriate pesticide usage.
* Excessive pesticide use increases cultivation cost and residue concerns.
* Individual field reports are rarely converted into useful regional surveillance information.

The platform addresses these problems by combining:

```text
Crop Images
+
Crop Information
+
Field Location
+
Weather
+
Historical Reports
+
AI Detection
+
Expert Validation
+
Risk Analysis
```

into actionable information.

---

# 3. Target Users

## 3.1 Farmers

Primary users.

Farmers should be able to:

* Register and manage their profile.
* Register their fields.
* Record crops grown in each field.
* Upload crop images.
* Report symptoms.
* Receive disease/pest predictions.
* Understand prediction confidence.
* View severity.
* Receive risk alerts.
* Receive management recommendations.
* Track previous crop-health reports.
* Request expert validation when necessary.

---

## 3.2 Extension Workers / Agriculture Officers

Extension workers need a regional view rather than only individual-field information.

They should be able to:

* View farmer reports.
* View high-risk areas.
* View disease/pest hotspots.
* Filter reports by crop, disease, date and location.
* Prioritize areas requiring field visits.
* Review pending cases.
* Monitor outbreak trends.
* Contact or assist farmers.
* Track intervention status.

---

## 3.3 Agricultural Experts

Experts provide human validation when AI confidence is low or when a farmer requests assistance.

Experts should be able to:

* Review submitted images.
* View farmer-provided information.
* View AI prediction and confidence.
* Confirm the AI diagnosis.
* Correct incorrect predictions.
* Add observations.
* Provide recommendations.
* Mark a case as requiring laboratory diagnosis.

---

## 3.4 Agriculture Administrators

Administrators manage the overall platform.

They should be able to:

* Manage users and roles.
* Monitor system activity.
* View regional statistics.
* Monitor disease/pest trends.
* Manage supported crops and diseases.
* Monitor expert activity.
* View system performance.

---

# 4. Core Product Workflow

The primary farmer workflow is:

```text
Farmer
  ↓
Login / Register
  ↓
Select Field
  ↓
Select Crop
  ↓
Upload Image
  ↓
Enter Crop Stage / Symptoms
  ↓
AI Analysis
  ↓
Disease / Pest Prediction
  ↓
Confidence + Severity
  ↓
Weather & Environmental Risk Analysis
  ↓
Overall Risk Score
  ↓
Management Recommendation
  ↓
Save Detection Report
  ↓
Monitor Follow-up
```

If confidence is low:

```text
AI Prediction
     ↓
Low Confidence
     ↓
Expert Verification Recommended
     ↓
Expert Review
     ↓
Confirmed / Corrected Diagnosis
```

---

# 5. MVP Definition

The MVP must demonstrate the complete value chain without attempting to build every possible agricultural feature.

## MVP Module 1 — Authentication & Roles

Support:

* Farmer
* Extension Worker
* Expert
* Administrator

Required functionality:

* Registration
* Login
* Logout
* Role-based access
* Protected routes

---

# 6. MVP Module 2 — Farmer & Field Management

Farmers can create and manage fields.

A field should contain:

* Field name
* Location
* Approximate area
* Crop
* Crop variety where available
* Planting date
* Crop growth stage

Location should support geospatial representation.

---

# 7. MVP Module 3 — Image-Based Disease/Pest Detection

This is the central AI feature.

### Input

The farmer provides:

* Crop
* Image
* Crop stage
* Optional symptoms
* Field location

### AI processing

```text
Image
 ↓
Preprocessing
 ↓
Disease/Pest Model
 ↓
Prediction
 ↓
Confidence
 ↓
Severity estimation
```

### Output

Example:

```text
Possible Disease:
Tomato Early Blight

Confidence:
91%

Severity:
Moderate
```

The system must clearly communicate uncertainty.

Example:

```text
AI Confidence: 52%

⚠️ Low confidence.
Expert verification is recommended.
```

The platform must never present an uncertain prediction as a guaranteed diagnosis.

---

# 8. MVP Module 4 — Risk Assessment

Disease detection and disease risk are different concepts.

The platform should combine multiple signals to calculate an overall risk score.

Potential inputs:

```text
AI Detection
+
Weather
+
Crop Stage
+
Location
+
Recent Local Reports
+
Historical Disease Activity
```

Example:

```text
Disease detected:
Early Blight

Weather suitability:
High

Nearby reports:
7 cases

Crop stage:
Highly susceptible

Overall Risk:
HIGH
```

Risk levels:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

The exact risk calculation should be documented separately in `AI.md` / architecture documentation.

---

# 9. MVP Module 5 — Weather-Based Early Warning

The system should use weather information to identify conditions that may increase crop-health risk.

Relevant factors may include:

* Temperature
* Humidity
* Rainfall
* Rain probability
* Wind conditions

The system should generate warnings when conditions indicate increased risk.

Example:

```text
⚠️ EARLY WARNING

High risk conditions detected for
Tomato Early Blight in your area.

Why?

• High humidity
• Recent rainfall
• Susceptible crop stage
• Nearby reported cases
```

The system should explain **why** an alert was generated instead of displaying only a risk number.

---

# 10. MVP Module 6 — Integrated Management Recommendations

The system should not simply tell farmers which disease was detected.

It should provide actionable management guidance.

Recommendations should prioritize:

1. Monitoring
2. Cultural practices
3. Mechanical / physical control
4. Biological control where applicable
5. Chemical control only when appropriate
6. Safe-use guidance
7. Expert/laboratory referral when necessary

Example:

```text
Recommended Actions

Immediate:
• Inspect nearby plants.
• Remove heavily affected leaves where appropriate.
• Improve field ventilation.

Monitoring:
• Recheck the field within 2–3 days.

Escalation:
• Request expert validation if symptoms worsen.

Chemical control:
• Follow locally approved agricultural guidance
  and label instructions.
```

The system should avoid blindly recommending pesticides.

---

# 11. MVP Module 7 — Geospatial Hotspot Mapping

Every detection report should be associated with a location where possible.

The system should visualize:

* Individual reports
* Disease clusters
* Pest clusters
* High-risk regions
* Recent outbreak activity

Example:

```text
Individual Reports
       ↓
Spatial Clustering
       ↓
Potential Hotspot
       ↓
Extension Worker Alert
```

The map should allow filtering by:

* Crop
* Disease/pest
* Date
* Risk level

---

# 12. MVP Module 8 — Expert Validation

AI predictions should be treated as assistive rather than absolute.

Cases requiring review may be generated when:

* AI confidence is below a threshold.
* The farmer explicitly requests expert assistance.
* The predicted disease conflicts with other signals.
* The case is considered high-risk.
* The case appears unusual or novel.

Expert workflow:

```text
Pending Case
    ↓
Expert Opens Case
    ↓
Views Image + Crop Information
    ↓
Views AI Prediction
    ↓
Confirm / Correct / Refer
    ↓
Add Recommendation
    ↓
Case Closed
```

Expert-confirmed results should be stored as high-value training/validation data for future model improvement.

---

# 13. MVP Module 9 — Farmer Dashboard

The farmer dashboard should provide:

### Overview

* Active fields
* Current crop-health status
* Recent detections
* Active alerts
* Pending expert reviews

### Field health

```text
Field A
Tomato
Risk: HIGH

Field B
Potato
Risk: LOW
```

### Recent detection

```text
Early Blight
Confidence: 91%
Severity: Moderate
Risk: High
```

---

# 14. MVP Module 10 — Extension Worker Dashboard

The extension dashboard should focus on **prioritization and surveillance**.

Display:

* Total reports
* High-risk reports
* Pending expert reviews
* Active hotspots
* Disease distribution
* Recent outbreaks
* Cases requiring field visits

Example:

```text
REGIONAL HEALTH OVERVIEW

Reports: 248
High Risk: 31
Active Hotspots: 6
Pending Reviews: 14
```

The key purpose is:

> Help officers decide **where to go first**.

---

# 15. MVP Module 11 — Alerts

The platform should generate alerts based on:

* High AI confidence + high severity
* High environmental risk
* Multiple nearby reports
* Emerging hotspot
* Expert-confirmed outbreak
* Important follow-up events

Alerts should contain:

* What happened
* Where
* Why it matters
* What action is recommended

---

# 16. MVP Module 12 — Follow-Up Monitoring

A detection should not end after the first prediction.

The farmer should be able to:

```text
Initial Detection
      ↓
Treatment / Action
      ↓
Follow-up Image
      ↓
Compare Condition
      ↓
Improved / Stable / Worsened
```

This creates a basic crop-health timeline.

Example:

```text
Day 1
Early Blight — Moderate

Day 4
Early Blight — Mild

Day 8
Healthy / Controlled
```

This feature also creates valuable longitudinal data.

---

# 17. Standout Features

These features should differentiate the platform from a simple disease-classification application.

## 17.1 Explainable Risk Score

Instead of:

```text
Risk = 87
```

show:

```text
Risk: HIGH

Contributing factors:

Weather          ████████░░
Crop Stage       █████████░
Nearby Reports   ███████░░░
AI Detection     █████████░
Historical Risk  ██████░░░░
```

The farmer/officer can understand **why** the system is concerned.

---

## 17.2 Community Outbreak Detection

Individual reports become useful collective intelligence.

Example:

```text
Farmer A → Disease Report
Farmer B → Disease Report
Farmer C → Disease Report
Farmer D → Disease Report

        ↓

Potential Local Outbreak
```

The system can notify extension workers when a cluster exceeds a defined threshold.

---

## 17.3 AI + Weather Fusion

The system should combine visual diagnosis with environmental conditions.

Example:

```text
Image → Possible Early Blight
Weather → Highly favorable
Nearby reports → Increasing
Crop stage → Susceptible

             ↓

       HIGH RISK
```

This makes the system a **prediction and surveillance platform**, not merely an image classifier.

---

## 17.4 Confidence-Aware AI

The system must know when it does not know.

```text
High confidence
→ Show prediction + recommendation

Medium confidence
→ Show prediction + caution

Low confidence
→ Recommend expert verification
```

---

## 17.5 Expert-in-the-Loop Learning

Expert-confirmed cases can later become:

```text
Field Data
   ↓
Expert Confirmation
   ↓
Verified Dataset
   ↓
Model Evaluation
   ↓
Future Model Improvement
```

The MVP does not need automatic retraining.

The system should initially focus on collecting high-quality verified data.

---

## 17.6 Smart Extension Prioritization

Instead of showing officers hundreds of reports equally, rank cases by priority.

Potential priority factors:

```text
Risk
+
Severity
+
Number of nearby reports
+
Crop importance
+
Spread trend
+
Time since detection
```

Example:

```text
Priority 1 🔴
High risk + rapidly increasing reports

Priority 2 🟠
Moderate risk + nearby cluster

Priority 3 🟡
Individual low-risk case
```

This directly addresses limited extension-worker capacity.

---

# 18. Multilingual Support

The platform should be designed for multilingual agricultural users.

MVP target:

* English
* Hindi

Architecture should allow additional languages later.

All important farmer-facing information should be translatable:

* Disease names
* Alerts
* Recommendations
* Risk explanations
* Navigation
* Expert messages

Avoid translating technical information in a way that changes its meaning.

---

# 19. Accessibility & Farmer-Friendly Design

The farmer interface should prioritize simplicity.

Principles:

* Large buttons
* Minimal text
* Clear icons
* Simple language
* Visual risk indicators
* Voice-friendly future architecture
* Mobile-first design
* Low-bandwidth consideration

The farmer should not need technical knowledge to use the system.

---

# 20. Low-Connectivity Consideration

Rural connectivity may be unreliable.

The architecture should eventually support:

* Image upload retry
* Offline report drafts
* Cached important information
* Lightweight pages
* Compressed images
* Sync when connectivity returns

For MVP, full offline functionality is optional.

The architecture should not prevent adding it later.

---

# 21. Detection Report Lifecycle

Every detection should have a lifecycle.

```text
CREATED
   ↓
AI_ANALYZING
   ↓
AI_RESULT_AVAILABLE
   ↓
   ├── HIGH CONFIDENCE → ACTIONABLE
   │
   └── LOW CONFIDENCE → EXPERT_REVIEW
                            ↓
                     CONFIRMED / CORRECTED
                            ↓
                         ACTIONABLE
                            ↓
                         FOLLOW_UP
                            ↓
                          CLOSED
```

This lifecycle should be reflected in the database and API design.

---

# 22. Core Data Entities

The MVP will primarily require:

```text
User
Field
Crop
Detection
AIResult
RiskAssessment
Alert
ExpertReview
Recommendation
FollowUpReport
```

The exact schema is defined separately in:

`Docs/DATABASE.md`

---

# 23. High-Level System Architecture

```text
                    ┌─────────────────┐
                    │     Farmer      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ React Frontend  │
                    │     client/     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Node/Express    │
                    │     server/     │
                    └─────┬───┬───┬───┘
                          │   │   │
              ┌───────────┘   │   └───────────┐
              ▼               ▼               ▼
       ┌────────────┐  ┌────────────┐  ┌────────────┐
       │ AI Service │  │  Weather   │  │  MongoDB   │
       │  FastAPI   │  │   API      │  │            │
       └────────────┘  └────────────┘  └────────────┘
              │
              ▼
       Disease/Pest
        Prediction
```

---

# 24. What the MVP Will NOT Attempt

To keep the project achievable, the MVP will not attempt to:

* Diagnose every crop disease.
* Support every crop.
* Automatically prescribe pesticides without safeguards.
* Replace agricultural experts.
* Automatically retrain the production model.
* Predict exact yield.
* Provide laboratory-level diagnosis.
* Build custom IoT hardware.
* Guarantee disease prediction accuracy.
* Provide nationwide real-time surveillance.

The system should demonstrate a **focused, reliable prototype** rather than a huge collection of unfinished features.

---

# 25. Recommended MVP Crop Scope

For the prototype, support a limited number of crops and diseases/pests rather than trying to cover agriculture as a whole.

Initial crop selection should prioritize:

* Availability of public image datasets.
* Common agricultural importance.
* Clear visual symptoms.
* Ability to demonstrate disease/pest detection effectively.

The final crop/disease list should be documented in `Docs/AI.md` after dataset evaluation.

---

# 26. Success Criteria

The MVP is considered successful when a complete end-to-end workflow works:

```text
Farmer Login
     ↓
Create Field
     ↓
Select Crop
     ↓
Upload Image
     ↓
AI Prediction
     ↓
Confidence + Severity
     ↓
Weather/Risk Assessment
     ↓
Management Recommendation
     ↓
Save Report
     ↓
Display on Map
     ↓
Expert Review when required
     ↓
Officer Dashboard
```

A successful demonstration should show that information from an individual farmer can become useful **farm-level advice and area-level surveillance**.

---

# 27. Primary Value Proposition

### For Farmers

> "Know what may be affecting your crop, understand the risk, and know what to do next."

### For Experts

> "Review uncertain or important cases remotely and provide validated guidance."

### For Extension Workers

> "See where crop-health problems are emerging and prioritize intervention."

### For Agriculture Authorities

> "Turn field-level reports into actionable crop-health intelligence."

---

# 28. Product Differentiator

The central differentiator is:

> **A closed-loop crop-health intelligence system combining AI image detection, environmental risk forecasting, geospatial outbreak detection, expert validation, actionable management guidance, and follow-up monitoring.**

The platform therefore evolves from:

```text
Detection
```

to:

```text
Early Warning
+
Decision Support
+
Surveillance
+
Human Validation
+
Continuous Learning
```

---

# 29. Future Scope

Features that may be added after the MVP:

* IoT soil/environment sensors
* Smart pest traps
* Voice-based farmer assistant
* WhatsApp/SMS alerts
* Satellite imagery
* Advanced weather forecasting
* Automatic outbreak prediction
* Crop yield impact estimation
* Laboratory integration
* Government agriculture-system integration
* Automatic model retraining pipeline
* Regional language expansion
* Offline-first mobile application
* Drone imagery
* Advanced pest population estimation

These are **future features**, not MVP requirements.

---

# 30. Product Development Principle

Every feature should answer at least one of these questions:

1. Does it help detect crop-health problems earlier?
2. Does it improve diagnosis reliability?
3. Does it help the farmer decide what to do?
4. Does it help experts validate cases?
5. Does it help extension workers prioritize intervention?
6. Does it improve area-level surveillance?
7. Does it create useful verified data for future improvement?

If a feature does not significantly contribute to these objectives, it should not be prioritized during MVP development.
