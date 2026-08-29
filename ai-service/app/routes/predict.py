"""
POST /predict route implementation.

Validates uploaded crop images and returns structured predictions
using the configured predictor instance.
"""

from typing import Optional
from fastapi import APIRouter, File, Form, UploadFile, Depends
from app.config import MODEL_NAME, MODEL_VERSION
from app.schemas.prediction import ModelMetadata, PredictionResponse
from app.services.base_predictor import BasePredictor
from app.services.image_processor import validate_and_process_image
from app.services.mock_predictor import MockPredictor

router = APIRouter(tags=["Inference"])

# Default predictor instance (easily swappable via dependency injection)
_default_predictor = MockPredictor()


def get_predictor() -> BasePredictor:
    """Dependency provider for the prediction engine."""
    return _default_predictor


@router.post(
    "/predict",
    response_model=PredictionResponse,
    summary="Crop Disease and Pest Inference",
    description="Analyzes an uploaded crop image and returns structured prediction results.",
)
async def predict_crop_health(
    image: UploadFile = File(..., description="Crop leaf/plant image file (JPEG, PNG, WebP)"),
    crop: Optional[str] = Form(None, description="Optional crop name context (e.g. Tomato, Potato)"),
    growthStage: Optional[str] = Form(None, description="Optional growth stage (e.g. flowering)"),
    symptoms: Optional[str] = Form(None, description="Optional farmer-described symptoms"),
    predictor: BasePredictor = Depends(get_predictor),
) -> PredictionResponse:
    """
    Handle crop image analysis requests.

    1. Read and validate raw image bytes.
    2. Check format and integrity with Pillow.
    3. Pass image and context to the predictor.
    4. Return standardized PredictionResponse.
    """
    image_bytes = await image.read()

    # Validate image bytes (format, corruption, empty check)
    validate_and_process_image(image_bytes)

    # Perform inference
    prediction = predictor.predict(
        image_bytes=image_bytes,
        crop=crop,
        growth_stage=growthStage,
        symptoms=symptoms,
    )

    return PredictionResponse(
        success=True,
        prediction=prediction,
        model=ModelMetadata(
            name=MODEL_NAME,
            version=MODEL_VERSION,
        ),
    )
