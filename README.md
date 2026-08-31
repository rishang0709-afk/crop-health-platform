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