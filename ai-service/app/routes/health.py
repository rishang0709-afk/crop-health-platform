"""
GET /health route implementation.

Returns service status and model metadata.
"""

from fastapi import APIRouter
from app.config import SERVICE_NAME, MODEL_NAME, MODEL_VERSION, MODEL_STATUS
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
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        model=ModelInfo(
            status=MODEL_STATUS,
            name=MODEL_NAME,
            version=MODEL_VERSION,
        ),
    )
