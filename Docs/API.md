# API Specification

Base URL:

/api

---

## Authentication

### Register

POST /api/auth/register

Request:

{
  "name": "Farmer Name",
  "email": "farmer@example.com",
  "password": "password"
}

Response:

{
  "message": "Registration successful"
}

---

### Login

POST /api/auth/login

Response:

{
  "token": "...",
  "user": {
    "id": "...",
    "name": "...",
    "role": "farmer"
  }
}

---

## Fields

POST /api/fields

Create a field.

GET /api/fields

Get current user's fields.

GET /api/fields/:id

Get a specific field.

---

## Detection

POST /api/detections

Submit crop image for analysis.

GET /api/detections

Get user's detection history.

GET /api/detections/:id

Get detection details.

---

## Expert Review

POST /api/expert-reviews

Submit expert review.

GET /api/expert-reviews

Get pending reviews.

---

## Admin

GET /api/admin/dashboard

GET /api/admin/reports

GET /api/admin/hotspots