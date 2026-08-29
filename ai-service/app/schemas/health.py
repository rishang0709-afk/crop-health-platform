"""Schema definitions for GET /health endpoint."""

from pydantic import BaseModel, ConfigDict


class ModelInfo(BaseModel):
    """Model status and version details returned in health check."""

    model_config = ConfigDict(extra="forbid")

    status: str
    name: str
    version: str


class HealthResponse(BaseModel):
    """Health check response schema."""

    model_config = ConfigDict(extra="forbid")

    status: str
    service: str
    model: ModelInfo
