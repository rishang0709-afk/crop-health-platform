# Crop Health Early Warning & Management System

## SIH Problem Statement

SIH26131

Early Detection and Management of Crop Diseases and Pest Infestations

## About

An AI-powered crop-health platform designed to help farmers detect
crop diseases and pest infestations early, assess local risk and
receive actionable management recommendations.

## Core Features

- AI-based crop disease detection
- Crop health risk forecasting
- Weather integration
- GPS-based disease reporting
- Disease hotspot mapping
- Expert validation
- Multilingual farmer support
- Extension-worker dashboard

## Technology Stack

Frontend:
React + Vite + Tailwind CSS

Backend:
Node.js + Express

Database:
MongoDB

AI:
Python + FastAPI + ML

## Project Structure

client/       → React frontend
server/       → Node/Express backend
ai-service/   → AI/ML service
docs/         → Project documentation

## Development Status

MVP development in progress.

## Real AI Local Startup

### Model Specifications
- **Model Architecture**: MobileNetV3-Small (7 classes)
- **Model Name**: `mobilenetv3-small-crop-health-exp-d`
- **Model Version**: `crop-health-v1-exp-d`
- **Model Location**: `ai-service/models/crop-health-v1-exp-d.pt`
- **SHA256 Checksum**: `04fb91eee50933ee861c0e85f706165c13387827ba0a99826e812f1fe0aa377f`

*(The finalized model binary is committed directly in the repository; no manual download step is required).*

### Quickstart Commands (Windows CMD)

#### Terminal 1: AI Inference Service (FastAPI)
```cmd
cd crop-health-platform\ai-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python scripts\verify_model.py
set AI_PREDICTOR=real
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

#### Terminal 2: Backend API (Node.js / Express)
```cmd
cd crop-health-platform\server
npm install
npm run dev
```

#### Terminal 3: Farmer Portal UI (React / Vite)
```cmd
cd crop-health-platform\client
npm install
npm run dev
```

### Verification URLs
- **FastAPI AI Health**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- **Backend API Health**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **Farmer Portal Web App**: [http://localhost:5173](http://localhost:5173)

---

## Local Service Demo & Internet Dependencies

Running the three application services locally (React on `:5173`, Node on `:5000`, FastAPI on `:8000`) removes cloud hosting cold-start risk and improves response speed. However, active internet access is still required for the following external cloud integrations:

- **MongoDB Atlas**: Persistent cloud database cluster.
- **Cloudinary**: Cloud image storage for uploaded crop photos.
- **Open-Meteo**: Live weather API for local ambient meteorological data.
- **OpenStreetMap / Carto**: Basemap tile server for the Officer surveillance map.

### External Failure Graceful Degradation:
- **Weather Service Failure (Open-Meteo)**: When Open-Meteo is unreachable or times out, the service returns `null`. The risk engine safely omits the weather component and renormalizes weights across AI evidence and crop growth stage (`NO_WEATHER_FACTOR_WEIGHTS`). Zero artificial or default temperature/humidity values are fabricated.
- **Cloudinary Storage Failure**: If Cloudinary credentials are missing or cloud upload fails, the backend returns a structured error and the frontend renders an error alert. No fake image URL or detection record is created in the database. No local storage fallback exists.

---

## AI Vision Model Specifications & Scope

- **Architecture**: Lightweight MobileNetV3-Small (7 classes: Tomato Healthy, Tomato Early Blight, Tomato Late Blight, Tomato Leaf Mold, Potato Healthy, Potato Early Blight, Potato Late Blight, plus Unknown / Out-of-Domain).
- **Edge Deployment Potential**: Designed with a lightweight MobileNetV3-Small architecture with future edge-deployment potential on mobile/IoT devices.
- **Model Score**: The output is an uncalibrated softmax classification score. It is useful for confidence routing and uncertainty gating, but is not a guaranteed scientific certainty.
- **Severity Estimation**: Apparent visual severity is not estimated by the current vision model (returns `null`), which appropriately gates uncertain cases for human agronomist review.

---

## SIH Demo Accounts & Walkthrough

### 1. Configure Demo Passwords & Seed Accounts
Before seeding, set your desired passwords for the demo accounts in `server/.env`:
```bash
DEMO_FARMER_PASSWORD=your_secure_farmer_password
DEMO_EXPERT_PASSWORD=your_secure_expert_password
DEMO_OFFICER_PASSWORD=your_secure_officer_password
DEMO_ADMIN_PASSWORD=your_secure_admin_password
```

Then run the idempotent seed script to provision users and sample fields:
```cmd
cd crop-health-platform\server
npm run seed:demo
```

| Role | Email | Password Source | Primary Demo Activity |
|---|---|---|---|
| **Farmer** | `farmer.demo@crophealth.local` | `DEMO_FARMER_PASSWORD` in `.env` | Upload leaf images, receive real AI predictions, view actionable advice. |
| **Expert** | `expert.demo@crophealth.local` | `DEMO_EXPERT_PASSWORD` in `.env` | Review cases in `EXPERT_REVIEW_REQUIRED`, confirm or correct diagnoses. |
| **Officer** | `officer.demo@crophealth.local` | `DEMO_OFFICER_PASSWORD` in `.env` | Regional disease surveillance, active outbreak clusters, and hotspot maps. |
| **Admin** | `admin.demo@crophealth.local` | `DEMO_ADMIN_PASSWORD` in `.env` | Administrative oversight (shares Officer surveillance UI in current MVP). |

---

### 2. Live Farmer Journey Walkthrough
1. Navigate to [http://localhost:5173/login](http://localhost:5173/login).
2. Click the quick-fill chip **"🌾 Farmer"** (populates `farmer.demo@crophealth.local`) and enter your configured `DEMO_FARMER_PASSWORD`.
3. Click **"📷 New Analysis"** in the top navigation bar.
4. Select the pre-seeded **"Demo Tomato Field"** (Crop: Tomato, Location: Pune).
5. Choose a clear crop leaf photo (e.g. any tomato or potato leaf image) from your device.
6. Click **"Analyze Crop Health"** $\rightarrow$ The live MobileNetV3-Small model classifies the image in real time.
7. Because severity is unestimated and the model flags human review, the case is routed safely to **`EXPERT_REVIEW_REQUIRED`**.
8. **Initial Lifecycle Objects**: Before expert review, the system generates an initial contextual Risk Assessment, non-chemical IPM cultural advice with expert referral notes, and an advisory Alert.

### 3. Agricultural Expert Validation Flow
1. Sign out and navigate back to [http://localhost:5173/login](http://localhost:5173/login).
2. Click the quick-fill chip **"🔬 Expert"** and enter your configured `DEMO_EXPERT_PASSWORD`.
3. You are automatically routed to the **Expert Verification Queue** (`/expert/queue`).
4. Click **"Review Case"** on the pending tomato detection.
5. Inspect the high-resolution leaf image, field context, and AI model output.
6. Click **"Claim Case for Review"** $\rightarrow$ add observations in the comment box $\rightarrow$ click **"Confirm AI Diagnosis"** (or submit a corrected diagnosis).

### 4. Farmer Real-Time Verification
1. Sign back in as the Farmer (`farmer.demo@crophealth.local`).
2. Open **"Detection History"** (`/detections`) and click on the reviewed detection.
3. Observe the updated **`CONFIRMED`** status badge with the agronomist's verification note and finalized IPM guidance integrated into the crop health timeline.

### 5. Regional Hotspot Surveillance Walkthrough (Officer)
1. Sign in with Officer credentials: `officer.demo@crophealth.local` / (your configured `DEMO_OFFICER_PASSWORD`).
2. You are automatically routed to the **Officer Surveillance Dashboard** (`/officer/dashboard`).
3. Click **"Surveillance Map"** (`/officer/map`) to inspect the regional monitoring system.
4. **Note on Hotspot Privacy Thresholds**: On a fresh database, the map displays zero active outbreak circles. This reflects our strict epidemiological privacy policy: individual farm reports are never exposed as regional hotspots until at least 3 distinct qualifying reports across 2 independent farms in a 5 km grid cell confirm an emerging cluster.

---

## SIH 5–7 Minute Presentation Guide

| Time | Persona | Action / Narrative | Core SIH Value Demonstrated |
|---|---|---|---|
| **0:00 - 1:00** | Introduction | Problem Statement (SIH26131) and Closed-Loop Vision | Detection $\rightarrow$ Risk $\rightarrow$ Early Warning $\rightarrow$ IPM Guidance $\rightarrow$ Expert Validation $\rightarrow$ Regional Surveillance |
| **1:00 - 2:30** | Farmer | Upload leaf image on "Demo Tomato Field" $\rightarrow$ Live inference | Real MobileNetV3-Small AI Model Score, Contextual Risk & non-chemical IPM guidance |
| **2:30 - 4:00** | Expert | Sign in as Expert $\rightarrow$ `/expert/queue` $\rightarrow$ Claim & Confirm case | Human-in-the-loop validation, race-condition safe review locking |
| **4:00 - 5:00** | Farmer | Refresh detection timeline | End-to-end multi-persona real-time update |
| **5:00 - 6:30** | Officer | Sign in as Officer $\rightarrow$ `/officer/map` | Privacy-safe regional outbreak surveillance ($\ge 3$ reports, $\ge 2$ farms threshold) |
| **6:30 - 7:00** | Conclusion | Summary | Future edge-deployment potential, robust multi-persona RBAC, scalable modular architecture |

---

## Deployment Strategy

- **In-Person SIH Judging (Recommended)**: Run locally via the 3-terminal quickstart on the presentation laptop for fast, reliable demo execution.
- **Cloud Hosting (For Remote Evaluation)**:
  - **Frontend**: Deploy `client/` to Vercel or Netlify (static edge CDN).
  - **Backend**: Deploy `server/` to Render or Railway with `MONGODB_URI`, `JWT_SECRET`, and `CLIENT_ORIGIN`.
  - **AI Service**: Deploy `ai-service/` to Render (Docker) or Hugging Face Spaces (FastAPI).