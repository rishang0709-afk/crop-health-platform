"""
Tests for POST /predict endpoint.

Validates image formats, schemas, confidence, mock determinism,
unsupported types, corruption handling, and context parameters.
"""

from fastapi.testclient import TestClient
from app.schemas.prediction import PredictionType, SeverityLevel


def test_predict_valid_png_success(client: TestClient, valid_png_bytes: bytes):
    """1. Valid PNG upload returns 200 and conforms to Docs/AI.md schema."""
    response = client.post(
        "/predict",
        files={"image": ("leaf.png", valid_png_bytes, "image/png")},
        data={"crop": "Tomato", "growthStage": "flowering"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert "prediction" in data
    assert "model" in data

    prediction = data["prediction"]
    assert prediction["type"] == "disease"
    assert prediction["name"] == "Early Blight"
    assert 0.0 <= prediction["confidence"] <= 1.0
    assert prediction["confidence"] == 0.91

    assert prediction["severity"] is not None
    assert prediction["severity"]["level"] == "moderate"
    assert prediction["severity"]["score"] == 62

    assert data["model"]["name"] == "mock-crop-health-model"
    assert data["model"]["version"] == "0.1.0"


def test_predict_valid_jpeg_success(client: TestClient, valid_jpeg_bytes: bytes):
    """2. Valid JPEG upload returns 200 and matches potato diagnosis."""
    response = client.post(
        "/predict",
        files={"image": ("leaf.jpg", valid_jpeg_bytes, "image/jpeg")},
        data={"crop": "Potato"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["prediction"]["type"] == "disease"
    assert data["prediction"]["name"] == "Late Blight"
    assert data["prediction"]["confidence"] == 0.88
    assert data["prediction"]["severity"]["level"] == "high"
    assert data["prediction"]["severity"]["score"] == 78


def test_predict_valid_webp_success(client: TestClient, valid_webp_bytes: bytes):
    """3. Valid WebP upload returns 200 and matches wheat diagnosis."""
    response = client.post(
        "/predict",
        files={"image": ("leaf.webp", valid_webp_bytes, "image/webp")},
        data={"crop": "Wheat"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["prediction"]["type"] == "disease"
    assert data["prediction"]["name"] == "Leaf Rust"
    assert data["prediction"]["confidence"] == 0.85
    assert data["prediction"]["severity"]["level"] == "low"
    assert data["prediction"]["severity"]["score"] == 30


def test_predict_healthy_crop_success(client: TestClient, valid_png_bytes: bytes):
    """4. Healthy crop context returns healthy type without severity."""
    response = client.post(
        "/predict",
        files={"image": ("leaf.png", valid_png_bytes, "image/png")},
        data={"crop": "healthy tomato"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["prediction"]["type"] == "healthy"
    assert data["prediction"]["name"] == "Healthy"
    assert data["prediction"]["confidence"] == 0.95
    assert data["prediction"]["severity"] is None


def test_predict_unknown_crop_returns_deterministic_unknown(
    client: TestClient, valid_png_bytes: bytes
):
    """5. Unsupported crop returns deterministic unknown type."""
    response = client.post(
        "/predict",
        files={"image": ("leaf.png", valid_png_bytes, "image/png")},
        data={"crop": "DragonFruit"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["prediction"]["type"] == "unknown"
    assert data["prediction"]["name"] is None
    assert data["prediction"]["confidence"] == 0.42
    assert data["prediction"]["severity"] is None


def test_predict_missing_crop_returns_deterministic_unknown(
    client: TestClient, valid_png_bytes: bytes
):
    """6. Missing/omitted crop returns deterministic unknown type."""
    response = client.post(
        "/predict",
        files={"image": ("leaf.png", valid_png_bytes, "image/png")},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["prediction"]["type"] == "unknown"
    assert data["prediction"]["name"] is None
    assert data["prediction"]["confidence"] == 0.42
    assert data["prediction"]["severity"] is None


def test_predict_confidence_in_valid_range(
    client: TestClient, valid_png_bytes: bytes
):
    """7. Prediction confidence is strictly bounded in [0.0, 1.0]."""
    for crop in ["Tomato", "Potato", "Wheat", "healthy", "unknown", None]:
        data = {"crop": crop} if crop else {}
        response = client.post(
            "/predict",
            files={"image": ("leaf.png", valid_png_bytes, "image/png")},
            data=data,
        )
        assert response.status_code == 200
        conf = response.json()["prediction"]["confidence"]
        assert 0.0 <= conf <= 1.0


def test_predict_type_in_allowed_enum(
    client: TestClient, valid_png_bytes: bytes
):
    """8. Prediction type belongs to allowed enum values."""
    allowed_types = {e.value for e in PredictionType}
    for crop in ["Tomato", "Potato", "Wheat", "healthy", "unknown"]:
        response = client.post(
            "/predict",
            files={"image": ("leaf.png", valid_png_bytes, "image/png")},
            data={"crop": crop},
        )
        assert response.status_code == 200
        pred_type = response.json()["prediction"]["type"]
        assert pred_type in allowed_types


def test_predict_is_deterministic(client: TestClient, valid_png_bytes: bytes):
    """9. Repeated calls with the exact same inputs yield identical results."""
    res1 = client.post(
        "/predict",
        files={"image": ("leaf.png", valid_png_bytes, "image/png")},
        data={"crop": "Tomato", "growthStage": "flowering"},
    )
    res2 = client.post(
        "/predict",
        files={"image": ("leaf.png", valid_png_bytes, "image/png")},
        data={"crop": "Tomato", "growthStage": "flowering"},
    )
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json() == res2.json()


def test_predict_missing_image_rejected(client: TestClient):
    """10. Request with missing image parameter is rejected with 400."""
    response = client.post(
        "/predict",
        data={"crop": "Tomato"},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert "error" in data


def test_predict_empty_image_rejected(
    client: TestClient, empty_image_bytes: bytes
):
    """11. Empty 0-byte file is rejected with 400 (EMPTY_IMAGE)."""
    response = client.post(
        "/predict",
        files={"image": ("empty.png", empty_image_bytes, "image/png")},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "EMPTY_IMAGE"


def test_predict_corrupted_image_rejected(
    client: TestClient, corrupt_image_bytes: bytes
):
    """12. Corrupted/non-image bytes are rejected with 400 (INVALID_IMAGE)."""
    response = client.post(
        "/predict",
        files={"image": ("fake.png", corrupt_image_bytes, "image/png")},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "INVALID_IMAGE"


def test_predict_unsupported_image_format_rejected(
    client: TestClient, unsupported_gif_bytes: bytes
):
    """13. Unsupported image format (GIF) is rejected with 400 (UNSUPPORTED_FORMAT)."""
    response = client.post(
        "/predict",
        files={"image": ("animated.gif", unsupported_gif_bytes, "image/gif")},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "UNSUPPORTED_FORMAT"


def test_predict_optional_context_accepted(
    client: TestClient, valid_png_bytes: bytes
):
    """14. Optional growthStage and symptoms fields are accepted without errors."""
    response = client.post(
        "/predict",
        files={"image": ("leaf.png", valid_png_bytes, "image/png")},
        data={
            "crop": "Tomato",
            "growthStage": "flowering",
            "symptoms": "yellow spots on bottom leaves",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["prediction"]["name"] == "Early Blight"
