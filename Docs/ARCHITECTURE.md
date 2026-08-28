# System Architecture

## Overview

The system consists of four primary components:

1. React frontend
2. Node.js/Express backend
3. MongoDB database
4. Python/FastAPI AI service

## Architecture

Farmer
   ↓
React Frontend
   ↓
Node.js / Express API
   ↓
MongoDB

Node.js Backend
   ↓
Python FastAPI AI Service
   ↓
ML Model

Node.js Backend
   ↓
Weather Service

Node.js Backend
   ↓
Risk Engine
   ↓
Recommendation Engine

Farmer Reports
   ↓
Geospatial Engine
   ↓
Hotspot Map
   ↓
Extension Dashboard

AI Prediction
   ↓
Expert Validation
   ↓
Confirmed Diagnosis
   ↓
Feedback Dataset

## Frontend

Technology:
- React
- Vite
- Tailwind CSS
- React Router
- Axios

Responsibilities:
- User interface
- Authentication screens
- Crop management
- Image upload
- Results display
- Farmer dashboard
- Officer dashboard

## Backend

Technology:
- Node.js
- Express.js

Responsibilities:
- Authentication
- Business logic
- Database communication
- Image handling
- AI service communication
- Weather integration
- Risk calculation
- Recommendations
- Authorization

## AI Service

Technology:
- Python
- FastAPI
- PyTorch/TensorFlow

Responsibilities:
- Image preprocessing
- Disease/pest prediction
- Confidence calculation
- Severity estimation

## Database

Technology:
- MongoDB

Stores:
- Users
- Fields
- Crops
- Detection reports
- Expert reviews
- Alerts