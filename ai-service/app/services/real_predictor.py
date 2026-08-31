"""
PyTorch-based Real Model Predictor.

Uses a MobileNetV3-Small model to infer crop health predictions from images.
Returns `severity: None` since classification models do not natively output severity.
"""

import io
import os
import logging
from typing import Optional

from app.schemas.prediction import Prediction, PredictionType
from app.services.base_predictor import BasePredictor
from app.config import AI_MODEL_PATH, REAL_MODEL_NAME, REAL_MODEL_VERSION

logger = logging.getLogger(__name__)

try:
    import torch
    import torchvision.transforms as transforms
    from torchvision.models import mobilenet_v3_small
    from PIL import Image
    TORCH_AVAILABLE = True
except ImportError:
    logger.warning("PyTorch not installed. RealModelPredictor will fail if instantiated.")
    TORCH_AVAILABLE = False


class RealModelPredictor(BasePredictor):
    """PyTorch inference implementation."""

    # Exp D 7-Class Mapping
    CLASS_MAPPING = {
        0: {"type": PredictionType.UNKNOWN, "name": None, "crop": None},
        1: {"type": PredictionType.DISEASE, "name": "Potato Early Blight", "crop": "potato"},
        2: {"type": PredictionType.HEALTHY, "name": "Potato Healthy", "crop": "potato"},
        3: {"type": PredictionType.DISEASE, "name": "Potato Late Blight", "crop": "potato"},
        4: {"type": PredictionType.DISEASE, "name": "Tomato Early Blight", "crop": "tomato"},
        5: {"type": PredictionType.HEALTHY, "name": "Tomato Healthy", "crop": "tomato"},
        6: {"type": PredictionType.DISEASE, "name": "Tomato Late Blight", "crop": "tomato"},
    }

    @property
    def model_name(self) -> str:
        return REAL_MODEL_NAME

    @property
    def model_version(self) -> str:
        return REAL_MODEL_VERSION

    def __init__(self, model_path: str = AI_MODEL_PATH):
        """Initialize and load the model into memory."""
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch is required for RealModelPredictor.")

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Standard ImageNet preprocessing expected by the checkpoint
        self.transform = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        self.model = self._load_model(model_path)

    def _load_model(self, model_path: str) -> 'torch.nn.Module':
        """Load the PyTorch model weights."""
        if not os.path.exists(model_path):
            raise RuntimeError(f"Model checkpoint not found at {model_path}. Cannot start RealPredictor.")

        model = mobilenet_v3_small(weights=None)
        in_features = model.classifier[3].in_features
        model.classifier[3] = torch.nn.Linear(in_features, len(self.CLASS_MAPPING))
        
        try:
            ckpt = torch.load(model_path, map_location=self.device)
            state_dict = ckpt.get("state_dict", ckpt)
            model.load_state_dict(state_dict)
            logger.info(f"Successfully loaded real model weights from {model_path}")
        except Exception as e:
            raise RuntimeError(f"Failed to load model weights from {model_path}. File may be corrupt or architecture mismatch. Error: {e}")

        model.to(self.device)
        model.eval()  # Set to evaluation mode
        return model

    def predict(
        self,
        image_bytes: bytes,
        crop: Optional[str] = None,
        growth_stage: Optional[str] = None,
        symptoms: Optional[str] = None,
    ) -> Prediction:
        """Run inference on the provided image."""
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch is required for RealModelPredictor.")

        try:
            # Preprocess
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            tensor = self.transform(image).unsqueeze(0).to(self.device)

            # Inference
            with torch.no_grad():
                outputs = self.model(tensor)
                probabilities = torch.nn.functional.softmax(outputs[0], dim=0)
                
                max_prob, predicted_idx = torch.max(probabilities, dim=0)
                confidence = max_prob.item()
                idx = predicted_idx.item()

            class_info = self.CLASS_MAPPING.get(idx, {"type": PredictionType.UNKNOWN, "name": None, "crop": None})
            pred_type = class_info["type"]
            pred_name = class_info["name"]
            pred_crop = class_info["crop"]
            
            # Background
            if idx == 0:
                return Prediction(
                    type=PredictionType.UNKNOWN,
                    name=None,
                    confidence=confidence,
                    severity=None
                )

            # Crop mismatch
            if crop and pred_crop and crop.strip().lower() != pred_crop.lower():
                return Prediction(
                    type=PredictionType.UNKNOWN,
                    name=None, # Map safely into unknown/review
                    confidence=confidence,
                    severity=None
                )
            
            return Prediction(
                type=pred_type,
                name=pred_name,
                confidence=confidence,
                severity=None
            )

        except Exception as e:
            logger.error(f"Inference failed: {e}")
            raise e # Fail clearly on inference errors instead of silent fallback

