"""
Configuration settings for the Crop Health AI Service.

Loads configuration from environment variables with safe defaults.
Uses standard os.getenv to avoid unnecessary dependencies.
"""

import os

PORT: int = int(os.getenv("PORT", "8000"))
HOST: str = os.getenv("HOST", "0.0.0.0")
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

SERVICE_NAME: str = "crop-health-ai"
MOCK_MODEL_NAME: str = os.getenv("MOCK_MODEL_NAME", os.getenv("MODEL_NAME", "mock-crop-health-model"))
MOCK_MODEL_VERSION: str = os.getenv("MOCK_MODEL_VERSION", os.getenv("MODEL_VERSION", "0.1.0"))
REAL_MODEL_NAME: str = os.getenv("REAL_MODEL_NAME", "mobilenetv3-small-crop-health-exp-d")
REAL_MODEL_VERSION: str = os.getenv("REAL_MODEL_VERSION", "crop-health-v1-exp-d")

MODEL_NAME: str = MOCK_MODEL_NAME
MODEL_VERSION: str = MOCK_MODEL_VERSION
MODEL_STATUS: str = "real" if os.getenv("AI_PREDICTOR", "mock").lower() == "real" else "mock"
AI_PREDICTOR: str = os.getenv("AI_PREDICTOR", "mock")
AI_MODEL_PATH: str = os.getenv("AI_MODEL_PATH", "training/experiments/exp_d_full_multidomain/best_model.pt")

# Allowed image MIME types and formats
ALLOWED_IMAGE_FORMATS: set[str] = {"JPEG", "PNG", "WEBP"}
MAX_IMAGE_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
