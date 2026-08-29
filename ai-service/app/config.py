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
MODEL_NAME: str = os.getenv("MODEL_NAME", "mock-crop-health-model")
MODEL_VERSION: str = os.getenv("MODEL_VERSION", "0.1.0")
MODEL_STATUS: str = "mock"

# Allowed image MIME types and formats
ALLOWED_IMAGE_FORMATS: set[str] = {"JPEG", "PNG", "WEBP"}
MAX_IMAGE_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
