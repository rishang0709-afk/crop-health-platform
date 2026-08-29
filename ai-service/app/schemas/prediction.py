"""
Schema definitions for POST /predict endpoint.

Conforms to Docs/AI.md Sections 5, 8, 29, 31.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class PredictionType(str, Enum):
    """Allowed prediction categories (Docs/AI.md Section 5)."""

    DISEASE = "disease"
    PEST = "pest"
    HEALTHY = "healthy"
    UNKNOWN = "unknown"


class SeverityLevel(str, Enum):
    """Allowed severity levels (Docs/AI.md Section 9)."""

    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class Severity(BaseModel):
    """Severity estimation schema."""

    model_config = ConfigDict(extra="forbid")

    level: SeverityLevel
    score: int = Field(ge=0, le=100, description="Severity score from 0 to 100")


class Prediction(BaseModel):
    """Structured AI prediction result."""

    model_config = ConfigDict(extra="forbid")

    type: PredictionType
    name: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score 0.0 to 1.0")
    severity: Optional[Severity] = None


class ModelMetadata(BaseModel):
    """Metadata identifying the model name and version."""

    model_config = ConfigDict(extra="forbid")

    name: str
    version: str


class PredictionResponse(BaseModel):
    """Canonical successful prediction response format."""

    model_config = ConfigDict(extra="forbid")

    success: bool = True
    prediction: Prediction
    model: ModelMetadata


class ErrorDetail(BaseModel):
    """Error code and human-readable message."""

    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class ErrorResponse(BaseModel):
    """Structured error response format."""

    model_config = ConfigDict(extra="forbid")

    success: bool = False
    error: ErrorDetail
