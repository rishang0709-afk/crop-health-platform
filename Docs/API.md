# Crop Health Early Warning & Management System

## API Specification

**Problem Statement:** SIH26131 — Early Detection and Management of Crop Diseases and Pest Infestations

**Document Status:** MVP API Specification — Source of Truth

---

# 1. API Goals

The API provides a secure communication layer between:

```text
React Frontend
       ↓
Node.js / Express Backend
       ↓
MongoDB
       ↓
AI Service / Weather Services
```

The API must support:

* Authentication
* Role-based authorization
* User management
* Field management
* Crop-health detection
* Risk assessment
* Recommendations
* Alerts
* Expert reviews
* Follow-up monitoring
* Geospatial reports
* Officer dashboards

---

# 2. Base URL

During local development:

```text
http://localhost:5000/api
```

Production URL will be defined during deployment.

All application API routes should begin with:

```text
/api
```

---

# 3. API Conventions

## HTTP Methods

```text
GET     → Retrieve data
POST    → Create data / trigger an operation
PUT     → Replace/update data
PATCH   → Partially update data
DELETE  → Delete data where permitted
```

---

# 4. Response Format

Successful responses should use a consistent structure.

Example:

```json
{
  "success": true,
  "data": {},
  "message": "Request successful"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data"
  }
}
```

The exact error format should remain consistent across the backend.

---

# 5. HTTP Status Codes

Use standard status codes.

```text
200 → Successful request
201 → Resource created
204 → Successful request with no response body
400 → Invalid request
401 → Authentication required / invalid authentication
403 → Authenticated but not authorized
404 → Resource not found
409 → Conflict
422 → Validation failure where appropriate
429 → Rate limit exceeded
500 → Internal server error
502 → External service failure
503 → Service temporarily unavailable
```

---

# 6. Authentication

Authentication uses JWT-based authentication.

## Register

```text
POST /api/auth/register
```

### Request

```json
{
  "name": "Ravi Kumar",
  "email": "ravi@example.com",
  "password": "securePassword",
  "role": "farmer",
  "language": "hi"
}
```

The backend must validate the requested role.

Users must not be allowed to create privileged accounts such as `admin` simply by supplying that role.

### Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "USER_ID",
      "name": "Ravi Kumar",
      "role": "farmer"
    }
  },
  "message": "Registration successful"
}
```

---

# 7. Login

```text
POST /api/auth/login
```

### Request

```json
{
  "email": "ravi@example.com",
  "password": "securePassword"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "token": "JWT_TOKEN",
    "user": {
      "id": "USER_ID",
      "name": "Ravi Kumar",
      "role": "farmer",
      "language": "hi"
    }
  },
  "message": "Login successful"
}
```

---

# 8. Current User

```text
GET /api/auth/me
```

Authentication required.

### Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "USER_ID",
      "name": "Ravi Kumar",
      "role": "farmer"
    }
  }
}
```

---

# 9. Logout

```text
POST /api/auth/logout
```

Authentication required.

For stateless JWT authentication, the implementation may clear the client-side authentication state. A server-side token revocation strategy can be introduced later if required.

---

# 10. User APIs

## Get Current User Profile

```text
GET /api/users/me
```

Authentication required.

## Update Current User Profile

```text
PATCH /api/users/me
```

Example:

```json
{
  "name": "Ravi Kumar",
  "language": "hi",
  "district": "Gorakhpur"
}
```

Users must not be able to modify their own privileged role.

---

# 11. Field APIs

Fields belong to authenticated users.

## Create Field

```text
POST /api/fields
```

Authentication required.

### Request

```json
{
  "name": "North Field",
  "crop": "Tomato",
  "variety": "Optional Variety",
  "plantingDate": "2026-07-15",
  "growthStage": "flowering",
  "area": {
    "value": 2.5,
    "unit": "acre"
  },
  "location": {
    "type": "Point",
    "coordinates": [83.37, 26.76]
  }
}
```

### Response

```json
{
  "success": true,
  "data": {
    "field": {
      "id": "FIELD_ID",
      "name": "North Field",
      "crop": "Tomato"
    }
  },
  "message": "Field created successfully"
}
```

---

# 12. Get User Fields

```text
GET /api/fields
```

Authentication required.

### Response

```json
{
  "success": true,
  "data": {
    "fields": []
  }
}
```

Only fields owned by the authenticated user should be returned.

---

# 13. Get Field

```text
GET /api/fields/:id
```

Authentication required.

Ownership/authorization must be checked.

---

# 14. Update Field

```text
PATCH /api/fields/:id
```

Authentication required.

---

# 15. Deactivate Field

```text
PATCH /api/fields/:id/status
```

Example:

```json
{
  "isActive": false
}
```

Hard deletion should generally be avoided for records that may be needed for historical analysis.

---

# 16. Detection API

Detection is one of the core workflows.

## Create Detection

```text
POST /api/detections
```

Authentication required.

Content type:

```text
multipart/form-data
```

### Input

Fields:

```text
image
fieldId
crop
growthStage
symptoms
```

The backend must validate:

* User authentication
* Field ownership
* Supported file type
* File size
* Crop value
* Required information

---

# 17. Detection Processing Flow

The API performs:

```text
Image received
      ↓
Validation
      ↓
Detection created
      ↓
AI service called
      ↓
AI prediction
      ↓
Weather information obtained
      ↓
Risk calculated
      ↓
Recommendation generated
      ↓
Detection saved/updated
      ↓
Response returned
```

The frontend should not communicate directly with the AI service.

---

# 18. Detection Response

Example:

```json
{
  "success": true,
  "data": {
    "detection": {
      "id": "DETECTION_ID",

      "crop": "Tomato",

      "prediction": {
        "type": "disease",
        "name": "Early Blight",
        "confidence": 0.91
      },

      "severity": {
        "level": "moderate",
        "score": 62
      },

      "risk": {
        "score": 86,
        "level": "HIGH",
        "factors": [
          "High humidity",
          "Recent rainfall",
          "Susceptible crop stage",
          "Nearby reports"
        ]
      },

      "recommendation": {
        "immediateActions": [],
        "monitoringActions": [],
        "expertReferral": false
      },

      "status": "AI_RESULT_AVAILABLE"
    }
  },
  "message": "Crop analysis completed"
}
```

---

# 19. Get Detection History

```text
GET /api/detections
```

Authentication required.

Optional query parameters:

```text
?fieldId=FIELD_ID
?status=CONFIRMED
?crop=Tomato
?from=2026-08-01
?to=2026-08-28
?page=1
?limit=20
```

---

# 20. Get Detection Details

```text
GET /api/detections/:id
```

Authentication and authorization required.

The user must only receive data they are authorized to access.

---

# 21. Request Expert Review

```text
POST /api/detections/:id/expert-review
```

Authentication required.

### Request

```json
{
  "reason": "AI confidence is low"
}
```

The backend should validate whether expert review is appropriate.

---

# 22. Risk API

Risk calculations are normally generated during detection processing.

For cases where recalculation is necessary:

```text
POST /api/detections/:id/risk/recalculate
```

Authorized roles only.

The backend should use the same central Risk Engine rather than duplicating risk logic across endpoints.

---

# 23. Alert APIs

## Get Alerts

```text
GET /api/alerts
```

Authentication required.

Optional:

```text
?unread=true
```

---

# 24. Mark Alert as Read

```text
PATCH /api/alerts/:id/read
```

Authentication required.

---

# 25. Expert APIs

These routes require the `expert` role unless otherwise specified.

## Get Pending Reviews

```text
GET /api/expert/reviews
```

Optional filters:

```text
?status=pending
?priority=high
?crop=Tomato
```

---

# 26. Get Review Case

```text
GET /api/expert/reviews/:id
```

Returns relevant information such as:

* Image
* Crop
* Symptoms
* Growth stage
* AI prediction
* AI confidence
* Risk assessment
* Weather snapshot
* Nearby report summary

---

# 27. Submit Expert Review

```text
POST /api/expert/reviews/:id/decision
```

Example:

```json
{
  "decision": "CORRECTED",
  "correctedDiagnosis": {
    "name": "Late Blight",
    "type": "disease"
  },
  "comment": "Symptoms are more consistent with late blight.",
  "requiresLabDiagnosis": false
}
```

Allowed decisions:

```text
CONFIRMED
CORRECTED
REJECTED
REFER_TO_LAB
NEEDS_MORE_INFORMATION
```

---

# 28. Follow-Up APIs

## Create Follow-Up

```text
POST /api/detections/:id/follow-ups
```

Content type:

```text
multipart/form-data
```

Possible fields:

```text
image
observation
status
```

---

# 29. Get Follow-Ups

```text
GET /api/detections/:id/follow-ups
```

---

# 30. Update Follow-Up Status

```text
PATCH /api/follow-ups/:id
```

Example:

```json
{
  "status": "IMPROVED"
}
```

---

# 31. Officer APIs

Officer routes require appropriate officer authorization.

## Regional Dashboard

```text
GET /api/officer/dashboard
```

Response may include:

```json
{
  "success": true,
  "data": {
    "reports": 248,
    "highRiskReports": 31,
    "activeHotspots": 6,
    "pendingReviews": 14
  }
}
```

---

# 32. Officer Reports

```text
GET /api/officer/reports
```

Supported filters:

```text
?crop=Tomato
?disease=Early%20Blight
?risk=HIGH
?from=2026-08-01
?to=2026-08-28
?district=Gorakhpur
```

The exact filtering capabilities may expand later.

---

# 33. Hotspot API

## Get Hotspots

```text
GET /api/officer/hotspots
```

Possible parameters:

```text
?crop=Tomato
?disease=Early%20Blight
?from=2026-08-20
?to=2026-08-28
```

Response example:

```json
{
  "success": true,
  "data": {
    "hotspots": [
      {
        "id": "HOTSPOT_1",
        "disease": "Early Blight",
        "crop": "Tomato",
        "reportCount": 18,
        "riskLevel": "HIGH",
        "center": {
          "latitude": 26.76,
          "longitude": 83.37
        }
      }
    ]
  }
}
```

Hotspots are initially computed from detection data rather than manually created.

---

# 34. Map Reports

```text
GET /api/officer/map/reports
```

Possible parameters:

```text
?crop=Tomato
?disease=Early%20Blight
?risk=HIGH
```

The endpoint should return only information authorized for the requesting officer.

---

# 35. Admin APIs

Admin routes require the `admin` role.

## Platform Dashboard

```text
GET /api/admin/dashboard
```

## Users

```text
GET /api/admin/users
PATCH /api/admin/users/:id/status
```

## System Reports

```text
GET /api/admin/reports
```

Admin functionality should be expanded only when needed.

---

# 36. Internal AI Service API

The Node backend communicates with the Python AI service.

This API is **internal**, not directly exposed to frontend users.

Base address during local development:

```text
http://localhost:8000
```

---

# 37. AI Health Check

```text
GET /health
```

Expected:

```json
{
  "status": "ok"
}
```

---

# 38. AI Prediction

```text
POST /predict
```

Content type:

```text
multipart/form-data
```

### Input

```text
image
crop
growthStage
symptoms
```

### Response

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

The model version should be recorded to support later evaluation.

---

# 39. AI Uncertainty

If the AI cannot confidently identify a condition:

```json
{
  "success": true,
  "prediction": {
    "type": "unknown",
    "name": null,
    "confidence": 0.42,
    "severity": null
  }
}
```

The backend must not fabricate a disease name.

The system should then recommend expert review or additional information.

---

# 40. Weather Service

Weather API access occurs through the Node backend.

The frontend must not directly contain the weather API key.

Conceptual internal service:

```text
GET /internal/weather
```

The actual external provider API should remain hidden from frontend users.

Inputs may include:

```text
latitude
longitude
```

Output should be normalized into a predictable internal format.

Example:

```json
{
  "temperature": 29,
  "humidity": 84,
  "rainfall": 12,
  "windSpeed": 10,
  "rainProbability": 75,
  "capturedAt": "2026-08-28T10:02:00Z"
}
```

---

# 41. Authentication Header

Protected APIs should use:

```text
Authorization: Bearer <JWT>
```

The backend must validate the token before processing protected requests.

---

# 42. Role Authorization

Example access matrix:

| API Area         |  Farmer |  Expert | Officer | Admin |
| ---------------- | ------: | ------: | ------: | ----: |
| Own profile      |       ✅ |       ✅ |       ✅ |     ✅ |
| Own fields       |       ✅ |       ❌ |       ❌ |    ✅* |
| Own detections   |       ✅ |       ❌ |       ❌ |    ✅* |
| Expert reviews   |       ❌ |       ✅ |       ❌ |     ✅ |
| Regional reports |       ❌ | Limited |       ✅ |     ✅ |
| Hotspots         | Limited | Limited |       ✅ |     ✅ |
| Admin users      |       ❌ |       ❌ |       ❌ |     ✅ |

`*` Admin access should be restricted to legitimate administrative needs.

---

# 43. Validation Rules

The backend should validate all incoming data.

Examples:

### Coordinates

```text
longitude: -180 to 180
latitude: -90 to 90
```

### AI confidence

```text
0 <= confidence <= 1
```

### Severity score

```text
0 <= score <= 100
```

### Pagination

```text
limit should have a safe maximum
page must be positive
```

---

# 44. Pagination

List endpoints should eventually support:

```text
?page=1&limit=20
```

Example response:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 128,
      "totalPages": 7
    }
  }
}
```

Pagination should be implemented for potentially large datasets.

---

# 45. Filtering and Sorting

List APIs may support controlled filtering.

Example:

```text
GET /api/detections?crop=Tomato&status=CONFIRMED
```

Sorting should use whitelisted fields.

Example:

```text
?sort=-createdAt
```

The backend must not directly pass arbitrary user-supplied sort expressions into database queries without validation.

---

# 46. Rate Limiting

Potentially expensive endpoints should have rate limiting.

Examples:

```text
POST /api/auth/login
POST /api/detections
POST /api/expert/reviews/:id/decision
```

The exact limits can be defined during implementation/deployment.

---

# 47. File Upload Rules

The detection endpoint should validate:

### Allowed image types

```text
JPEG
PNG
WEBP
```

### File size

Define a reasonable maximum in implementation.

### Validation

Reject:

* Missing files
* Unsupported types
* Corrupt files
* Excessively large files

Uploaded filenames should not be trusted as safe storage identifiers.

---

# 48. Error Handling

Example:

### Unauthorized

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

### Forbidden

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not authorized to perform this action"
  }
}
```

### Not Found

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

### AI unavailable

```json
{
  "success": false,
  "error": {
    "code": "AI_SERVICE_UNAVAILABLE",
    "message": "Crop analysis is temporarily unavailable. Your report has been saved for retry."
  }
}
```

---

# 49. Idempotency & Duplicate Requests

Expensive operations such as detection submission should consider duplicate requests.

For example, accidental double-clicking should not unnecessarily create multiple identical analyses.

A future version may introduce an idempotency key.

The frontend should also disable the submit action while an analysis is being processed.

---

# 50. API Versioning

The initial MVP may use:

```text
/api
```

rather than adding a version immediately.

If breaking API changes are introduced later, versioning can be added:

```text
/api/v1
```

The API structure should be kept clean enough to support this transition.

---

# 51. API Security Rules

Never:

* Expose MongoDB credentials.
* Expose JWT secrets.
* Expose weather API keys.
* Allow frontend direct database access.
* Allow frontend direct access to internal AI endpoints.
* Trust client-supplied user IDs for ownership checks.
* Trust client-supplied roles.
* Return password hashes.

All authorization decisions must happen on the backend.

---

# 52. API and Database Relationship

The API should map to the database design in `Docs/DATABASE.md`.

```text
User APIs
    ↓
users

Field APIs
    ↓
fields

Detection APIs
    ↓
detections
risk_assessments
recommendations

Expert APIs
    ↓
expert_reviews

Follow-Up APIs
    ↓
follow_ups

Alert APIs
    ↓
alerts
```

The API must not create undocumented database structures without updating the database specification.

---

# 53. Detection State Handling

The API should respect the detection lifecycle.

Example:

```text
CREATED
   ↓
AI_ANALYZING
   ↓
AI_RESULT_AVAILABLE
   ↓
EXPERT_REVIEW_REQUIRED
   ↓
CONFIRMED / CORRECTED
   ↓
FOLLOW_UP_REQUIRED
   ↓
CLOSED
```

Invalid state transitions should be rejected.

---

# 54. API Development Principle

Each endpoint should have:

```text
Clear purpose
Clear input
Clear output
Clear authorization
Clear validation
Clear error behavior
```

Do not create endpoints merely because they seem convenient.

---

# 55. Development Rule

When an API is implemented:

1. Implement the route.
2. Implement validation.
3. Implement authorization.
4. Test the endpoint independently.
5. Test failure cases.
6. Document any contract changes.
7. Only then connect the frontend.

This prevents frontend and backend from becoming dependent on untested APIs.

---

# 56. Source of Truth

This document defines the intended API contracts.

Related documents:

```text
Docs/Product.md
→ Product requirements

Docs/ARCHITECTURE.md
→ System architecture

Docs/DATABASE.md
→ Database structure

Docs/AI.md
→ AI and risk strategy

AI_RULES.md
→ Coding-agent rules
```

If implementation requires changing an API contract, the change should be explicitly reviewed and reflected in this document.
