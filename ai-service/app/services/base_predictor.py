"""
Abstract base class for all prediction engines.

Defines the contract so that MockPredictor can be replaced by RealModelPredictor
later without altering routes or controllers.
"""

from abc import ABC, abstractmethod
from typing import Optional
from app.schemas.prediction import Prediction


class BasePredictor(ABC):
    """Abstract predictor interface."""

    @abstractmethod
    def predict(
        self,
        image_bytes: bytes,
        crop: Optional[str] = None,
        growth_stage: Optional[str] = None,
        symptoms: Optional[str] = None,
    ) -> Prediction:
        """
        Run inference on the provided crop image and context.

        Args:
            image_bytes: Validated raw image binary data.
            crop: Optional crop name (e.g. 'Tomato', 'Potato', 'Wheat').
            growth_stage: Optional growth stage (e.g. 'flowering', 'vegetative').
            symptoms: Optional farmer-reported symptoms.

        Returns:
            Prediction object conforming to Docs/AI.md.
        """
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name of the model used by this predictor."""
        pass

    @property
    @abstractmethod
    def model_version(self) -> str:
        """Version of the model used by this predictor."""
        pass
