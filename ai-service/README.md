# Crop Health Platform — AI Service

Standalone FastAPI microservice for crop disease and pest identification.

## Architectural Boundaries

- **Standalone Service**: Responsible exclusively for crop image analysis and ML inference.
- **Decoupled from Backend**: Has no access to MongoDB, does not manage user JWTs, and does not compute regional risk scores or IPM recommendations.
- **Replaceable Predictor**: `MockPredictor` implements `BasePredictor`, allowing seamless swap to `RealModelPredictor` (PyTorch/TensorFlow) in future phases without modifying route handlers.

## Requirements

- Python 3.10+
- Dependencies listed in `requirements.txt`

## Installation

```bash
cd ai-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running the Service

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation will be available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Endpoints

### `GET /health`
Returns service status and current model metadata.

### `POST /predict`
Accepts `multipart/form-data`:
- `image` (required): Image file in JPEG, PNG, or WebP format.
- `crop` (optional): Crop name context (e.g., `"Tomato"`, `"Potato"`, `"Wheat"`).
- `growthStage` (optional): Growth stage (e.g., `"flowering"`, `"vegetative"`).
- `symptoms` (optional): Farmer-described symptoms.

## Testing

Run the automated test suite with pytest:

```bash
pytest
```
