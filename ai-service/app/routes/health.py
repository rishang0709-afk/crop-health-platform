"""
GET /health route implementation.

Returns service status and model metadata.
"""

from fastapi import APIRouter
from app.config import (
    SERVICE_NAME,
    AI_PREDICTOR,
    MODEL_STATUS,
    REAL_MODEL_NAME,
    REAL_MODEL_VERSION,
    MOCK_MODEL_NAME,
    MOCK_MODEL_VERSION,
)
from app.schemas.health import HealthResponse, ModelInfo

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="AI Service Health Check",
    description="Returns the operational status of the AI service and current model metadata.",
)
async def get_health() -> HealthResponse:
    """Return AI service status and model version information."""
    is_real = AI_PREDICTOR.lower() == "real"
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        model=ModelInfo(
            status=MODEL_STATUS,
            name=REAL_MODEL_NAME if is_real else MOCK_MODEL_NAME,
            version=REAL_MODEL_VERSION if is_real else MOCK_MODEL_VERSION,
        ),
    )
