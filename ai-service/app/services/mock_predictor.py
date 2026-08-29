"""
Deterministic Mock Predictor.

Provides predictable responses for validation and development
without invoking deep learning frameworks.

Deterministic rules:
  - 'healthy' -> healthy: Healthy (confidence: 0.95, severity: None)
  - 'tomato' -> disease: Early Blight (confidence: 0.91, severity: moderate/62)
  - 'potato' -> disease: Late Blight (confidence: 0.88, severity: high/78)
  - 'wheat'  -> disease: Leaf Rust (confidence: 0.85, severity: low/30)
  - Missing, empty, or unsupported crop -> unknown (name: None, confidence: 0.42, severity: None)
"""

from typing import Optional
from app.schemas.prediction import Prediction, PredictionType, Severity, SeverityLevel
from app.services.base_predictor import BasePredictor


class MockPredictor(BasePredictor):
    """Deterministic mock inference implementation."""

    def predict(
        self,
        image_bytes: bytes,
        crop: Optional[str] = None,
        growth_stage: Optional[str] = None,
        symptoms: Optional[str] = None,
    ) -> Prediction:
        """Return deterministic prediction based on crop context."""
        if not crop or not isinstance(crop, str) or not crop.strip():
            return Prediction(
                type=PredictionType.UNKNOWN,
                name=None,
                confidence=0.42,
                severity=None,
            )

        normalized = crop.strip().lower()

        if "healthy" in normalized:
            return Prediction(
                type=PredictionType.HEALTHY,
                name="Healthy",
                confidence=0.95,
                severity=None,
            )
        elif "tomato" in normalized:
            return Prediction(
                type=PredictionType.DISEASE,
                name="Early Blight",
                confidence=0.91,
                severity=Severity(level=SeverityLevel.MODERATE, score=62),
            )
        elif "potato" in normalized:
            return Prediction(
                type=PredictionType.DISEASE,
                name="Late Blight",
                confidence=0.88,
                severity=Severity(level=SeverityLevel.HIGH, score=78),
            )
        elif "wheat" in normalized:
            return Prediction(
                type=PredictionType.DISEASE,
                name="Leaf Rust",
                confidence=0.85,
                severity=Severity(level=SeverityLevel.LOW, score=30),
            )
        else:
            return Prediction(
                type=PredictionType.UNKNOWN,
                name=None,
                confidence=0.42,
                severity=None,
            )
