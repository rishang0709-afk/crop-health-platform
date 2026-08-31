"""
POST /predict route implementation.

Validates uploaded crop images and returns structured predictions
using the configured predictor instance.
"""

from typing import Optional
from fastapi import APIRouter, File, Form, UploadFile, Depends
from app.config import MODEL_NAME, MODEL_VERSION, AI_PREDICTOR
from app.schemas.prediction import ModelMetadata, PredictionResponse
from app.services.base_predictor import BasePredictor
from app.services.image_processor import validate_and_process_image
from app.services.mock_predictor import MockPredictor
from app.services.real_predictor import RealModelPredictor

router = APIRouter(tags=["Inference"])

# Predictor instances
_mock_predictor = MockPredictor()
_real_predictor = None  # Lazy load if needed to prevent startup crash if PyTorch is missing

def get_predictor() -> BasePredictor:
    """Dependency provider for the prediction engine."""
    global _real_predictor
    if AI_PREDICTOR.lower() == "real":
        if _real_predictor is None:
            _real_predictor = RealModelPredictor()
        return _real_predictor
    return _mock_predictor


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
            name=predictor.model_name,
            version=predictor.model_version,
        ),
    )
