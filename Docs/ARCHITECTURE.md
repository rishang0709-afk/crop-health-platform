# Crop Health Early Warning & Management System

## System Architecture

**Problem Statement:** SIH26131 — Early Detection and Management of Crop Diseases and Pest Infestations

**Document Status:** MVP Architecture — Source of Truth

---

# 1. Architecture Goals

The system architecture must support:

1. Image-based crop disease and pest detection.
2. Weather-based risk forecasting.
3. Farm-level risk assessment.
4. Geospatial hotspot detection.
5. Expert validation.
6. Actionable management recommendations.
7. Farmer follow-up monitoring.
8. Extension-worker surveillance.
9. Multilingual farmer-facing interfaces.
10. Secure role-based access.
11. Future expansion to sensors, pest traps and additional AI models.

The architecture should remain simple enough for an MVP while allowing future expansion.

---

# 2. High-Level Architecture

```text
                         USERS
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          Farmer        Expert       Officer
             │             │             │
             └─────────────┼─────────────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │  React Frontend  │
                 │     client/      │
                 └────────┬─────────┘
                          │ HTTPS
                          ▼
                 ┌──────────────────┐
                 │ Node + Express   │
                 │     server/      │
                 │                  │
                 │ API / Auth       │
                 │ Risk Engine      │
                 │ Alert Engine     │
                 │ Recommendation   │
                 │ Orchestration    │
                 └──────┬─┬─┬─┬────┘
                        │ │ │ │
              ┌─────────┘ │ │ └──────────┐
              │           │ │            │
              ▼           ▼ ▼            ▼
       ┌────────────┐ ┌─────────┐ ┌──────────────┐
       │ AI Service │ │ MongoDB │ │ Weather API  │
       │  FastAPI   │ │         │ │              │
       └────────────┘ └─────────┘ └──────────────┘
              │
              ▼
       ML Model / Inference
```

---

# 3. Core Components

The system consists of three application services:

```text
client/
server/
ai-service/
```

plus external services:

```text
MongoDB
Weather API
Image/Object Storage
```

---

# 4. Frontend Architecture — `client/`

## Technology

* React
* Vite
* Tailwind CSS
* React Router
* Axios

## Responsibilities

The frontend is responsible for:

* User interface.
* Navigation.
* Authentication screens.
* Farmer dashboard.
* Field management.
* Image upload interface.
* Detection results.
* Risk visualization.
* Alerts.
* Maps.
* Expert review interface.
* Extension-worker dashboard.
* Follow-up monitoring.
* Language selection.

The frontend must **not** contain sensitive business logic.

---

# 5. Frontend Structure

Recommended structure:

```text
client/
│
├── public/
│
├── src/
│   │
│   ├── components/
│   │
│   ├── pages/
│   │
│   ├── layouts/
│   │
│   ├── services/
│   │
│   ├── context/
│   │
│   ├── hooks/
│   │
│   ├── utils/
│   │
│   ├── assets/
│   │
│   ├── App.jsx
│   └── main.jsx
│
├── package.json
└── vite.config.js
```

The exact structure may evolve as implementation progresses.

---

# 6. Backend Architecture — `server/`

## Technology

* Node.js
* Express.js
* MongoDB
* JWT-based authentication

## Responsibilities

The backend is the primary application orchestrator.

It handles:

* Authentication.
* Authorization.
* User management.
* Field management.
* Detection reports.
* AI service communication.
* Weather API communication.
* Risk calculation.
* Alert generation.
* Recommendations.
* Expert reviews.
* Follow-up reports.
* Geospatial queries.
* Database operations.
* Input validation.
* Error handling.

The backend is the **single trusted gateway** between the frontend and internal services.

---

# 7. Backend Structure

Recommended structure:

```text
server/
│
├── src/
│   │
│   ├── controllers/
│   │
│   ├── routes/
│   │
│   ├── models/
│   │
│   ├── services/
│   │
│   ├── middleware/
│   │
│   ├── validators/
│   │
│   ├── utils/
│   │
│   ├── config/
│   │
│   └── app.js
│
├── server.js
├── package.json
└── .env
```

---

# 8. AI Service Architecture — `ai-service/`

## Technology

* Python
* FastAPI
* PyTorch or TensorFlow

## Responsibilities

The AI service is responsible only for ML-related operations.

It handles:

* Image preprocessing.
* Model inference.
* Disease classification.
* Pest classification where supported.
* Confidence calculation.
* Severity estimation where supported.
* Model metadata.

The AI service should not directly access MongoDB.

The AI service should not handle user authentication.

The AI service should not contain business-level recommendation logic.

---

# 9. AI Service Structure

Recommended structure:

```text
ai-service/
│
├── app/
│   │
│   ├── models/
│   ├── services/
│   ├── schemas/
│   ├── utils/
│   └── main.py
│
├── model/
├── tests/
├── requirements.txt
└── README.md
```

---

# 10. Service Communication

The services communicate as follows:

```text
React
  │
  │ HTTPS
  ▼
Node/Express
  │
  ├──────────────► MongoDB
  │
  ├──────────────► Weather API
  │
  └──────────────► FastAPI AI Service
```

The frontend must never directly communicate with the AI service or MongoDB.

---

# 11. Detection Workflow

The primary detection workflow is:

```text
Farmer
  │
  ▼
Upload Image
  │
  ▼
React Client
  │
  ▼
POST /api/detections
  │
  ▼
Node Backend
  │
  ├── Validate user
  ├── Validate image
  ├── Validate crop/field
  │
  ▼
AI Service
  │
  ├── Preprocess image
  ├── Run model
  ├── Calculate confidence
  └── Estimate severity
  │
  ▼
Backend
  │
  ├── Weather data
  ├── Historical/local reports
  ├── Crop stage
  └── Location
  │
  ▼
Risk Engine
  │
  ▼
Recommendation Engine
  │
  ▼
Save Detection
  │
  ▼
Return Result
  │
  ▼
React
  │
  ▼
Farmer
```

---

# 12. Risk Engine

The Risk Engine is a backend service.

It combines multiple signals:

```text
AI Result
+
AI Confidence
+
Severity
+
Weather
+
Crop Stage
+
Location
+
Recent Local Reports
+
Historical Risk
```

and produces:

```text
Risk Level
Risk Score
Risk Factors
```

Possible levels:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

The Risk Engine must provide explainable contributing factors.

Example:

```text
Risk: HIGH

Contributing factors:

Weather suitability     High
Crop susceptibility     High
Nearby reports          Medium
AI confidence           High
Historical activity     Medium
```

The exact mathematical scoring system is defined separately in `AI.md`.

---

# 13. Alert Engine

The Alert Engine is responsible for generating actionable notifications.

Possible triggers:

### High-risk detection

```text
High severity
+
High confidence
→ Alert
```

### Environmental warning

```text
Weather conditions
+
Susceptible crop
→ Early warning
```

### Emerging hotspot

```text
Multiple nearby reports
+
Increasing frequency
→ Hotspot alert
```

### Expert-confirmed outbreak

```text
Expert confirmation
+
Geographical cluster
→ Extension alert
```

Alerts should include:

```text
What happened
Where
Why it matters
Recommended action
```

---

# 14. Geospatial Architecture

Detection reports should store location using geospatial coordinates.

Recommended representation:

```text
location: {
    type: "Point",
    coordinates: [
        longitude,
        latitude
    ]
}
```

MongoDB geospatial indexes should be used for location-based queries.

Example queries:

```text
Reports near a field
Reports within a radius
Disease reports within a region
Potential outbreak clusters
```

---

# 15. Hotspot Detection

Hotspot detection should initially use a simple and explainable approach.

Example:

```text
Reports
   ↓
Filter by disease/pest
   ↓
Group by geographic proximity
   ↓
Count reports
   ↓
Check time window
   ↓
Calculate cluster severity
   ↓
Potential Hotspot
```

The MVP does not require advanced machine-learning-based spatial prediction.

The system should first establish reliable geospatial surveillance.

---

# 16. Expert Validation Architecture

Expert validation is part of the detection lifecycle.

```text
AI Prediction
      │
      ▼
Confidence Check
      │
 ┌────┴────┐
 │         │
High      Low
 │         │
 ▼         ▼
Result   Expert Review
           │
      ┌────┼────┐
      │    │    │
   Confirm Correct Refer
      │    │    │
      └────┼────┘
           ▼
    Final Case Status
```

Experts should be able to see:

* Original image.
* Crop.
* Field.
* Crop stage.
* Symptoms.
* AI prediction.
* AI confidence.
* Risk score.
* Weather context.
* Nearby reports.

---

# 17. Recommendation Engine

Recommendations are generated by the backend using structured agricultural guidance.

The engine may consider:

```text
Crop
+
Disease/Pest
+
Severity
+
Growth Stage
+
Risk
```

Recommendations should be categorized:

```text
Immediate Actions
Monitoring
Cultural Practices
Biological Control
Chemical Control
Expert/Lab Referral
```

Chemical recommendations must not be generated as unrestricted prescriptions.

The system should prioritize safe, integrated pest and disease management.

---

# 18. Follow-Up Architecture

Each detection may create a follow-up task.

```text
Initial Detection
      ↓
Recommended Action
      ↓
Follow-up Date
      ↓
New Image / Observation
      ↓
Compare Status
      ↓
Improved / Stable / Worsened
```

Follow-up data should remain associated with the original detection.

---

# 19. Authentication & Authorization

The backend uses role-based authorization.

Roles:

```text
FARMER
EXPERT
OFFICER
ADMIN
```

Example:

```text
Farmer
→ Own fields and reports

Expert
→ Assigned/pending cases

Officer
→ Regional surveillance

Admin
→ Platform management
```

The frontend may hide UI elements based on role, but the backend must enforce authorization.

Never rely on frontend-only authorization.

---

# 20. Authentication Flow

```text
User
 ↓
Login
 ↓
POST /api/auth/login
 ↓
Backend validates credentials
 ↓
JWT issued
 ↓
Client stores authentication state
 ↓
Protected API requests
 ↓
Backend validates JWT
 ↓
Authorization middleware
 ↓
Controller
```

Sensitive credentials and secrets must never be stored in frontend source code.

---

# 21. Image Handling

Images are submitted through the backend.

Initial workflow:

```text
Client
 ↓
Backend
 ↓
Validate image
 ↓
Store image
 ↓
Send image to AI service
```

The system should validate:

* File type
* File size
* Upload errors
* Malicious/unexpected files

The MVP should avoid unnecessarily large image files.

Object storage can be introduced for production-scale deployment.

---

# 22. Weather Integration

The backend communicates with an external weather API.

```text
Field Location
      ↓
Backend
      ↓
Weather API
      ↓
Current / Forecast Data
      ↓
Risk Engine
```

Weather API credentials must remain server-side.

The frontend must never contain weather API secrets.

---

# 23. Database Architecture

MongoDB stores application data.

Primary collections/entities:

```text
users
fields
detections
ai_results
risk_assessments
alerts
expert_reviews
recommendations
follow_ups
```

The detailed schema is defined in:

`Docs/DATABASE.md`

---

# 24. API Architecture

The frontend communicates with the backend through REST APIs.

Example:

```text
/api/auth/*
/api/users/*
/api/fields/*
/api/detections/*
/api/alerts/*
/api/expert/*
/api/officer/*
/api/follow-ups/*
```

The complete API contract is defined in:

`Docs/API.md`

---

# 25. Error Handling

Every service must fail gracefully.

Example:

```text
AI Service unavailable
        ↓
Backend catches error
        ↓
Detection marked as AI_FAILED
        ↓
User receives understandable message
        ↓
Retry / Expert Review option
```

The system must not crash because one external service is temporarily unavailable.

---

# 26. AI Failure Scenarios

### Low confidence

```text
AI confidence < threshold
        ↓
Expert verification recommended
```

### AI unavailable

```text
AI service unavailable
        ↓
Save report
        ↓
Mark analysis pending
        ↓
Retry later
```

### Invalid image

```text
Invalid image
        ↓
Reject request
        ↓
Explain problem
        ↓
Ask farmer to upload another image
```

### Unknown condition

If the model cannot confidently classify the condition:

```text
Unknown / Uncertain
        ↓
Do not fabricate diagnosis
        ↓
Recommend expert validation
```

---

# 27. Security Architecture

Minimum security requirements:

* Password hashing.
* JWT authentication.
* Role-based authorization.
* Input validation.
* File-upload validation.
* Rate limiting where appropriate.
* CORS configuration.
* Environment variables for secrets.
* No API keys in frontend code.
* Secure error responses.
* MongoDB credentials stored securely.

Sensitive information must never be committed to Git.

---

# 28. Environment Configuration

Environment-specific configuration should use environment variables.

Examples:

```text
MONGODB_URI
JWT_SECRET
AI_SERVICE_URL
WEATHER_API_KEY
PORT
```

Secrets must never be hardcoded.

A safe template may be committed:

```text
.env.example
```

Actual `.env` files must remain ignored by Git.

---

# 29. Development Environment

Recommended local services:

```text
Frontend:
localhost:5173

Backend:
localhost:5000

AI Service:
localhost:8000

MongoDB:
localhost:27017
```

Ports may change if conflicts occur.

The final port configuration should be documented.

---

# 30. Deployment Architecture — Future

A production deployment may eventually look like:

```text
                    Internet
                       │
                       ▼
                ┌──────────────┐
                │ Web Frontend │
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │ Backend API  │
                └───┬────┬─────┘
                    │    │
           ┌────────┘    └────────┐
           ▼                      ▼
     ┌────────────┐        ┌────────────┐
     │ AI Service │        │  MongoDB   │
     └────────────┘        └────────────┘
           │
           ▼
      ML Model
```

Cloud infrastructure is not required for the initial MVP.

---

# 31. Architectural Boundaries

These boundaries are mandatory.

## Frontend

Can:

* Display data.
* Collect user input.
* Call backend APIs.

Cannot:

* Access MongoDB directly.
* Access private API keys.
* Make authoritative risk decisions.
* Make authoritative authorization decisions.

---

## Backend

Can:

* Authenticate users.
* Access database.
* Call AI service.
* Call weather service.
* Calculate risk.
* Generate alerts.
* Generate recommendations.
* Manage workflows.

Cannot:

* Perform heavy ML inference directly unless explicitly required.

---

## AI Service

Can:

* Process images.
* Run ML inference.
* Return prediction information.

Cannot:

* Modify application database directly.
* Manage users.
* Make authorization decisions.
* Generate final pesticide-management policy.
* Decide whether a farmer is authorized to access a resource.

---

# 32. Design Principle — Single Responsibility

Each component should have one clear responsibility.

```text
React
→ Presentation

Express
→ Application orchestration

MongoDB
→ Persistent data

FastAPI
→ Machine learning inference

Weather API
→ Weather information
```

Business logic should remain in the backend.

ML logic should remain in the AI service.

---

# 33. Design Principle — Explainability

Important AI-driven decisions should provide supporting factors.

The system should prefer:

```text
"High risk because humidity is high,
recent reports increased, and the crop
is in a susceptible stage."
```

over:

```text
"Risk = 89"
```

---

# 34. Design Principle — Human in the Loop

The system is decision support, not a replacement for agricultural experts.

Whenever uncertainty is significant:

```text
AI
 ↓
Uncertainty
 ↓
Human Expert
 ↓
Validated Result
```

This principle should influence the AI, database, API and UI design.

---

# 35. Design Principle — Build for Extension

The architecture should support moving from:

```text
One Farmer
```

to:

```text
Many Farmers
      ↓
Many Fields
      ↓
Regional Reports
      ↓
Disease/Pest Clusters
      ↓
Extension Intervention
```

This is a core reason for using geospatial data and centralized detection reports.

---

# 36. MVP vs Future Architecture

## MVP

Implement:

* React frontend.
* Node/Express backend.
* MongoDB.
* FastAPI AI service.
* Basic image detection.
* Weather integration.
* Risk engine.
* Alerts.
* Basic geospatial mapping.
* Expert validation.
* Farmer dashboard.
* Officer dashboard.
* Follow-up monitoring.
* English + Hindi interface.

## Future

Potential additions:

* IoT sensors.
* Smart pest traps.
* Satellite imagery.
* Drone imagery.
* Voice assistant.
* SMS/WhatsApp alerts.
* Offline-first application.
* Advanced forecasting models.
* Automated ML retraining.
* Laboratory integration.

---

# 37. Development Rule

The system must be built incrementally.

Recommended order:

```text
1. Frontend foundation
        ↓
2. Backend foundation
        ↓
3. Database foundation
        ↓
4. Authentication
        ↓
5. Field management
        ↓
6. Detection workflow
        ↓
7. AI service
        ↓
8. Risk engine
        ↓
9. Weather integration
        ↓
10. Recommendations
        ↓
11. Expert validation
        ↓
12. Geospatial hotspots
        ↓
13. Alerts
        ↓
14. Follow-up monitoring
        ↓
15. Officer dashboard
        ↓
16. Multilingual/accessibility
        ↓
17. Testing & deployment
```

Each major stage must be independently tested before moving to the next.

---

# 38. Source of Truth

The following documents collectively define the system:

```text
Docs/Product.md
→ What the product should do.

Docs/ARCHITECTURE.md
→ How the system is structured.

Docs/DATABASE.md
→ What data is stored and how.

Docs/API.md
→ How services communicate.

Docs/AI.md
→ How AI and risk intelligence work.

AI_RULES.md
→ Rules that AI coding agents must follow.
```

If implementation conflicts with these documents, the coding agent must stop and request clarification rather than silently changing the architecture.
