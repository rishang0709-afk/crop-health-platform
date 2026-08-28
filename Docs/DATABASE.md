# Crop Health Early Warning & Management System

## Database Design

**Problem Statement:** SIH26131 — Early Detection and Management of Crop Diseases and Pest Infestations

**Database:** MongoDB

**Document Status:** MVP Database Specification — Source of Truth

---

# 1. Database Goals

The database must support:

* Farmer accounts.
* Role-based access.
* Farm/field registration.
* Crop information.
* Disease and pest detection reports.
* AI predictions.
* Risk assessments.
* Weather snapshots used during assessment.
* Management recommendations.
* Alerts.
* Expert validation.
* Follow-up monitoring.
* Geospatial hotspot detection.
* Future model improvement using expert-confirmed field data.

The schema should remain simple enough for the MVP and extensible for future features.

---

# 2. Main Collections

The MVP uses the following primary collections:

```text
users
fields
detections
risk_assessments
alerts
expert_reviews
recommendations
follow_ups
```

Supporting entities such as crops and diseases may initially be represented as fields within application documents rather than separate collections.

---

# 3. Relationships

High-level relationships:

```text
User
 │
 ├──────────► Fields
 │               │
 │               └────────► Detections
 │                              │
 │                 ┌────────────┼────────────┐
 │                 │            │            │
 │                 ▼            ▼            ▼
 │          AI Result      Risk Assessment  Recommendation
 │
 ├──────────► Alerts
 │
 └──────────► Follow-ups

Detection
    │
    └────────► Expert Review
```

---

# 4. User Collection

Collection:

```text
users
```

Purpose:

Stores users of the platform.

## Document Structure

```json
{
  "_id": "ObjectId",
  "name": "Ravi Kumar",
  "email": "ravi@example.com",
  "passwordHash": "...",
  "role": "farmer",
  "language": "hi",
  "phone": "optional",
  "location": {
    "type": "Point",
    "coordinates": [longitude, latitude]
  },
  "district": "Gorakhpur",
  "state": "Uttar Pradesh",
  "isActive": true,
  "createdAt": "date",
  "updatedAt": "date"
}
```

## Fields

| Field          | Type          | Required | Description                 |
| -------------- | ------------- | -------: | --------------------------- |
| `_id`          | ObjectId      |      Yes | Unique user ID              |
| `name`         | String        |      Yes | User's name                 |
| `email`        | String        |     Yes* | Login email                 |
| `passwordHash` | String        |      Yes | Hashed password             |
| `role`         | String        |      Yes | farmer/expert/officer/admin |
| `language`     | String        |      Yes | Preferred language          |
| `phone`        | String        |       No | Optional phone number       |
| `location`     | GeoJSON Point |       No | User's approximate location |
| `district`     | String        |       No | District                    |
| `state`        | String        |       No | State                       |
| `isActive`     | Boolean       |      Yes | Account status              |
| `createdAt`    | Date          |      Yes | Creation timestamp          |
| `updatedAt`    | Date          |      Yes | Last update                 |

`email` may later become optional if phone-based authentication is introduced.

---

# 5. User Roles

Allowed roles:

```text
farmer
expert
officer
admin
```

Role permissions are enforced by the backend.

The frontend must not be the only security boundary.

---

# 6. Field Collection

Collection:

```text
fields
```

Purpose:

Stores individual agricultural fields belonging to farmers.

## Document Structure

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "name": "North Field",
  "crop": "Tomato",
  "variety": "Optional Variety",
  "plantingDate": "date",
  "growthStage": "flowering",
  "area": {
    "value": 2.5,
    "unit": "acre"
  },
  "location": {
    "type": "Point",
    "coordinates": [longitude, latitude]
  },
  "notes": "Optional notes",
  "isActive": true,
  "createdAt": "date",
  "updatedAt": "date"
}
```

## Fields

| Field          | Type          | Required | Description                |
| -------------- | ------------- | -------: | -------------------------- |
| `_id`          | ObjectId      |      Yes | Field ID                   |
| `userId`       | ObjectId      |      Yes | Owner                      |
| `name`         | String        |      Yes | Field name                 |
| `crop`         | String        |      Yes | Crop currently planted     |
| `variety`      | String        |       No | Crop variety               |
| `plantingDate` | Date          |       No | Planting date              |
| `growthStage`  | String        |       No | Current crop stage         |
| `area.value`   | Number        |       No | Field area                 |
| `area.unit`    | String        |       No | acre/hectare/etc.          |
| `location`     | GeoJSON Point |      Yes | Field coordinates          |
| `notes`        | String        |       No | Optional field information |
| `isActive`     | Boolean       |      Yes | Whether field is active    |
| `createdAt`    | Date          |      Yes | Creation timestamp         |
| `updatedAt`    | Date          |      Yes | Last update                |

---

# 7. Crop Representation

For MVP, crop information is stored directly in the `fields` and `detections` documents.

Example:

```text
crop = "Tomato"
```

This avoids creating unnecessary complexity.

A separate `crops` collection may be introduced later if the platform needs:

* Thousands of crops.
* Crop-specific configuration.
* Crop-specific growth-stage rules.
* Crop metadata.
* Regional crop calendars.

---

# 8. Detection Collection

Collection:

```text
detections
```

Purpose:

Stores every crop-health analysis request and its resulting prediction.

This is one of the most important collections in the system.

## Document Structure

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "fieldId": "ObjectId",

  "image": {
    "url": "https://...",
    "storageKey": "optional",
    "uploadedAt": "date"
  },

  "crop": "Tomato",
  "growthStage": "flowering",

  "symptoms": [
    "brown spots on leaves",
    "yellowing"
  ],

  "prediction": {
    "type": "disease",
    "name": "Early Blight",
    "confidence": 0.91
  },

  "severity": {
    "level": "moderate",
    "score": 62
  },

  "status": "AI_RESULT_AVAILABLE",

  "location": {
    "type": "Point",
    "coordinates": [longitude, latitude]
  },

  "weatherSnapshot": {
    "temperature": 29,
    "humidity": 84,
    "rainfall": 12,
    "capturedAt": "date"
  },

  "createdAt": "date",
  "updatedAt": "date"
}
```

---

# 9. Detection Fields

| Field                   | Type          | Required | Description                  |
| ----------------------- | ------------- | -------: | ---------------------------- |
| `_id`                   | ObjectId      |      Yes | Detection ID                 |
| `userId`                | ObjectId      |      Yes | Farmer/user                  |
| `fieldId`               | ObjectId      |      Yes | Associated field             |
| `image.url`             | String        |      Yes | Image location               |
| `image.storageKey`      | String        |       No | Storage reference            |
| `image.uploadedAt`      | Date          |      Yes | Upload time                  |
| `crop`                  | String        |      Yes | Crop name                    |
| `growthStage`           | String        |       No | Crop growth stage            |
| `symptoms`              | Array         |       No | Reported symptoms            |
| `prediction.type`       | String        |      Yes | disease/pest/healthy/unknown |
| `prediction.name`       | String        |      Yes | Predicted condition          |
| `prediction.confidence` | Number        |      Yes | 0–1                          |
| `severity.level`        | String        |       No | low/moderate/high/critical   |
| `severity.score`        | Number        |       No | 0–100                        |
| `status`                | String        |      Yes | Detection lifecycle state    |
| `location`              | GeoJSON Point |      Yes | Detection location           |
| `weatherSnapshot`       | Object        |       No | Weather at analysis time     |
| `createdAt`             | Date          |      Yes | Creation time                |
| `updatedAt`             | Date          |      Yes | Last update                  |

---

# 10. Detection Status

Possible statuses:

```text
CREATED
AI_ANALYZING
AI_RESULT_AVAILABLE
EXPERT_REVIEW_REQUIRED
EXPERT_REVIEW_IN_PROGRESS
CONFIRMED
CORRECTED
AI_FAILED
FOLLOW_UP_REQUIRED
CLOSED
```

The backend controls status transitions.

Example:

```text
CREATED
   ↓
AI_ANALYZING
   ↓
AI_RESULT_AVAILABLE
   ↓
 ┌────────────────────┐
 │                    │
High confidence    Low confidence
 │                    │
 ▼                    ▼
CONFIRMED      EXPERT_REVIEW_REQUIRED
                     ↓
            CONFIRMED / CORRECTED
                     ↓
               FOLLOW_UP_REQUIRED
                     ↓
                  CLOSED
```

---

# 11. Risk Assessment Collection

Collection:

```text
risk_assessments
```

Purpose:

Stores the risk calculated from multiple signals.

## Document Structure

```json
{
  "_id": "ObjectId",
  "detectionId": "ObjectId",

  "score": 86,
  "level": "HIGH",

  "factors": {
    "aiEvidence": 0.91,
    "weatherRisk": 0.82,
    "cropStageRisk": 0.75,
    "nearbyReportsRisk": 0.70,
    "historicalRisk": 0.60
  },

  "explanation": [
    "High humidity",
    "Recent rainfall",
    "Susceptible crop stage",
    "Multiple nearby reports"
  ],

  "createdAt": "date",
  "updatedAt": "date"
}
```

---

# 12. Risk Levels

The initial system uses:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

The exact score thresholds are defined by the Risk Engine and documented in `AI.md`.

Do not hardcode risk thresholds independently in multiple parts of the application.

There should be one authoritative risk calculation service.

---

# 13. Alert Collection

Collection:

```text
alerts
```

Purpose:

Stores warnings and notifications for users.

## Document Structure

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",

  "type": "EARLY_WARNING",
  "severity": "HIGH",

  "title": "High Early Blight Risk",
  "message": "Weather and nearby reports indicate elevated risk.",

  "relatedDetectionId": "ObjectId",
  "relatedFieldId": "ObjectId",

  "location": {
    "type": "Point",
    "coordinates": [longitude, latitude]
  },

  "isRead": false,
  "createdAt": "date",
  "readAt": null
}
```

## Alert Types

```text
EARLY_WARNING
HIGH_RISK
HOTSPOT
EXPERT_REVIEW
FOLLOW_UP
SYSTEM
```

---

# 14. Expert Review Collection

Collection:

```text
expert_reviews
```

Purpose:

Stores expert validation of AI-generated results.

## Document Structure

```json
{
  "_id": "ObjectId",
  "detectionId": "ObjectId",
  "expertId": "ObjectId",

  "decision": "CORRECTED",

  "originalPrediction": {
    "name": "Early Blight",
    "confidence": 0.61
  },

  "correctedDiagnosis": {
    "name": "Late Blight",
    "type": "disease"
  },

  "comment": "Observed symptoms are more consistent with late blight.",

  "requiresLabDiagnosis": false,

  "createdAt": "date",
  "updatedAt": "date"
}
```

---

# 15. Expert Review Decisions

Allowed decisions:

```text
CONFIRMED
CORRECTED
REJECTED
REFER_TO_LAB
NEEDS_MORE_INFORMATION
```

Examples:

### Confirmed

```text
AI:
Early Blight

Expert:
CONFIRMED
```

### Corrected

```text
AI:
Early Blight

Expert:
CORRECTED → Late Blight
```

### Laboratory referral

```text
Expert:
REFER_TO_LAB
```

---

# 16. Recommendation Collection

Collection:

```text
recommendations
```

Purpose:

Stores the management guidance associated with a detection.

## Document Structure

```json
{
  "_id": "ObjectId",
  "detectionId": "ObjectId",

  "immediateActions": [
    "Remove heavily affected plant material where appropriate"
  ],

  "monitoringActions": [
    "Inspect nearby plants within 48 hours"
  ],

  "culturalControls": [
    "Improve field ventilation"
  ],

  "biologicalControls": [],

  "chemicalGuidance": [
    "Use only approved crop-specific products according to label and local guidance."
  ],

  "expertReferral": {
    "recommended": true,
    "reason": "AI confidence is below the review threshold."
  },

  "source": "RULE_BASED",

  "createdAt": "date",
  "updatedAt": "date"
}
```

Recommendations should be generated from controlled agricultural guidance.

The system should not store unrestricted AI-generated chemical prescriptions as authoritative advice.

---

# 17. Follow-Up Collection

Collection:

```text
follow_ups
```

Purpose:

Tracks crop condition after the initial detection.

## Document Structure

```json
{
  "_id": "ObjectId",
  "detectionId": "ObjectId",
  "userId": "ObjectId",
  "fieldId": "ObjectId",

  "followUpDate": "date",

  "imageUrl": "https://optional...",

  "observation": "Symptoms appear reduced.",

  "status": "IMPROVED",

  "newDetectionId": "ObjectId",

  "createdAt": "date"
}
```

---

# 18. Follow-Up Status

Allowed values:

```text
IMPROVED
STABLE
WORSENED
NO_CHANGE
UNKNOWN
```

A follow-up may optionally create a new detection.

Example:

```text
Initial Detection
      ↓
Treatment / Action
      ↓
Follow-up image
      ↓
New Detection
```

The new detection should maintain a reference to the previous case through the follow-up record.

---

# 19. Geospatial Data

Fields and detections use GeoJSON:

```json
{
  "type": "Point",
  "coordinates": [
    83.3732,
    26.7606
  ]
}
```

Important:

```text
coordinates[0] = longitude
coordinates[1] = latitude
```

Do not reverse the order.

MongoDB geospatial indexes should be created for location-based queries.

---

# 20. Geospatial Queries

The system will eventually need to support queries such as:

```text
Reports near a field
Reports within a radius
Reports in a district/area
Recent reports near a detection
Potential disease clusters
```

Example conceptual query:

```text
Find detections within 5 km of Field A
```

These queries support the hotspot and early-warning system.

---

# 21. Hotspot Data

We do not initially need a separate `hotspots` collection.

A hotspot can be calculated from detection data.

Initial process:

```text
Detections
   ↓
Filter by crop/disease
   ↓
Filter by time window
   ↓
Geospatial clustering
   ↓
Count reports
   ↓
Calculate cluster severity
   ↓
Identify hotspot
```

A future version may introduce a dedicated hotspot collection if caching or large-scale analytics require it.

---

# 22. Weather Snapshot

When a detection is analyzed, the system should store a snapshot of the weather information used in the risk calculation.

Example:

```json
{
  "temperature": 29,
  "humidity": 84,
  "rainfall": 12,
  "windSpeed": 10,
  "forecast": {
    "next24hRainProbability": 75
  },
  "capturedAt": "date"
}
```

The snapshot is important because weather changes over time.

The system should not rely only on live weather data when reconstructing an old detection.

---

# 23. AI Result vs Risk Assessment

These are intentionally separate concepts.

### AI Result

Answers:

> What does the image appear to show?

Example:

```text
Early Blight
91% confidence
```

### Risk Assessment

Answers:

> How concerning is this situation given the wider context?

Example:

```text
HIGH RISK
because of humidity + crop stage + nearby reports.
```

These should never be treated as the same value.

---

# 24. Database Indexes

Recommended indexes:

## Users

```text
email: unique
```

## Fields

```text
userId
location: 2dsphere
```

## Detections

```text
userId
fieldId
createdAt
location: 2dsphere
prediction.name
status
```

## Risk Assessments

```text
detectionId
level
createdAt
```

## Alerts

```text
userId
isRead
createdAt
location: 2dsphere
```

## Expert Reviews

```text
detectionId
expertId
createdAt
```

Indexes should be added only when justified by actual query patterns.

---

# 25. Data Validation

Backend validation must verify:

### User

* Valid email where required.
* Valid role.
* Valid language.

### Field

* Valid crop.
* Valid growth stage.
* Valid coordinates.
* Valid area.

### Detection

* Valid image.
* Valid crop.
* Valid field ownership.
* Valid coordinates.
* Confidence between 0 and 1.
* Severity within allowed range.

### Expert Review

* Valid detection.
* Authorized expert.
* Valid decision.
* Required fields for corrections.

---

# 26. Ownership & Access Rules

A farmer should only access:

```text
their own fields
their own detections
their own alerts
their own follow-ups
```

Experts should only access:

```text
cases available for expert review
```

Officers should only access:

```text
authorized regional surveillance data
```

Admins have platform-level access according to their role.

These rules must be enforced by backend authorization.

---

# 27. Data Lifecycle

Example detection lifecycle:

```text
Image uploaded
      ↓
Detection created
      ↓
AI analysis
      ↓
Risk assessment
      ↓
Recommendation
      ↓
Potential expert review
      ↓
Follow-up
      ↓
Closed
```

Old records should not be silently overwritten.

Important changes such as expert corrections should be recorded as separate review data.

---

# 28. Example Complete Detection Record

Conceptual example:

```json
{
  "_id": "detection123",

  "userId": "user123",
  "fieldId": "field123",

  "image": {
    "url": "https://storage.example/image.jpg",
    "uploadedAt": "2026-08-28T10:00:00Z"
  },

  "crop": "Tomato",
  "growthStage": "flowering",

  "symptoms": [
    "brown circular spots",
    "yellowing leaves"
  ],

  "prediction": {
    "type": "disease",
    "name": "Early Blight",
    "confidence": 0.91
  },

  "severity": {
    "level": "moderate",
    "score": 62
  },

  "status": "AI_RESULT_AVAILABLE",

  "location": {
    "type": "Point",
    "coordinates": [83.37, 26.76]
  },

  "weatherSnapshot": {
    "temperature": 29,
    "humidity": 84,
    "rainfall": 12,
    "capturedAt": "2026-08-28T10:02:00Z"
  },

  "createdAt": "2026-08-28T10:02:00Z",
  "updatedAt": "2026-08-28T10:02:00Z"
}
```

---

# 29. Privacy & Security

Do not store unnecessary sensitive information.

Important rules:

* Never store plaintext passwords.
* Store only password hashes.
* Never store API keys inside database documents.
* Avoid storing unnecessary precise personal location.
* Restrict access to farmer information.
* Store only information required by the product.
* Use secure storage for uploaded images.
* Do not expose private image URLs without authorization where required.

---

# 30. Database Principles

## Principle 1 — Simple MVP

Do not create collections unless there is a clear reason.

## Principle 2 — Traceability

Important actions should remain traceable.

## Principle 3 — Geospatial First

Location is important because the product includes hotspot detection.

## Principle 4 — Human Validation

Expert corrections must be stored separately from the original AI prediction.

## Principle 5 — Historical Context

Store snapshots of important factors such as weather instead of relying only on current external values.

## Principle 6 — Backend Authority

Database access and permission decisions belong to the backend.

---

# 31. Future Database Extensions

The following can be introduced later:

```text
crops
diseases
pests
weather_history
sensor_readings
pest_traps
hotspots
regions
labs
notifications
model_versions
model_feedback
```

These are intentionally outside the initial MVP database.

---

# 32. Source of Truth

This document defines the intended database structure.

Other project documents:

```text
Docs/Product.md
→ Product requirements

Docs/ARCHITECTURE.md
→ System architecture

Docs/API.md
→ API contracts

Docs/AI.md
→ AI and risk strategy

AI_RULES.md
→ Coding-agent rules
```

Implementation should follow these documents.

If implementation requires changing the schema, the change should be explicitly reviewed before modifying production code.
