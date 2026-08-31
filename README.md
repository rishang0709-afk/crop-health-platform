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

### 2. Live Farmer Journey Walkthrough
1. Navigate to [http://localhost:5173/login](http://localhost:5173/login).
2. Sign in with Farmer credentials: `farmer.demo@crophealth.local` / (your configured `DEMO_FARMER_PASSWORD`).
3. Click **"📷 New Analysis"** in the top navigation bar.
4. Select the pre-seeded **"Demo Tomato Field"** (Crop: Tomato).
5. Choose a real leaf sample (e.g. `ai-service/data/raw/plantdoc/pd_26eb8199defc.jpg`).
6. Click **"Analyze Crop Health"** → The live MobileNetV3-Small model classifies the image in real time (`Tomato Early Blight`, `confidence: ~78%`).
7. Because confidence is calibrated for expert oversight, the case is routed to **`EXPERT_REVIEW_REQUIRED`** with amber status banners and safe handling.

### 3. Regional Hotspot Surveillance Walkthrough (Officer)
1. Sign in with Officer credentials: `officer.demo@crophealth.local` / (your configured `DEMO_OFFICER_PASSWORD`).
2. You are automatically routed to the **Officer Surveillance Dashboard** (`/officer/dashboard`).
3. Click **"Surveillance Map"** (`/officer/map`) to inspect the regional monitoring system.
4. **Note on Hotspot Thresholds**: On a fresh database, the map displays zero active outbreak circles. This reflects our strict epidemiological privacy policy: individual farm reports are never exposed as regional hotspots until at least 3 distinct qualifying reports across 2 independent farms confirm an emerging cluster in a 5 km grid cell.