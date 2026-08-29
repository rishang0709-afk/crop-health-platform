"""
FastAPI application entrypoint for the Crop Health AI Service.

Initializes the application, registers routers, and sets up custom
exception handlers to provide consistent error responses.
"""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import SERVICE_NAME
from app.routes.health import router as health_router
from app.routes.predict import router as predict_router
from app.schemas.prediction import ErrorDetail, ErrorResponse
from app.services.image_processor import ImageValidationError


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Crop Health Platform — AI Service",
        description="Standalone AI microservice for crop disease and pest identification.",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(health_router)
    app.include_router(predict_router)

    # Custom exception handler for image validation errors
    @app.exception_handler(ImageValidationError)
    async def image_validation_error_handler(
        request: Request, exc: ImageValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                success=False,
                error=ErrorDetail(code=exc.code, message=exc.message),
            ).model_dump(),
        )

    # Custom exception handler for request validation errors (e.g. missing file)
    @app.exception_handler(RequestValidationError)
    async def request_validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Extract a clean error message
        errors = exc.errors()
        first_error = errors[0] if errors else {}
        loc = " -> ".join(str(l) for l in first_error.get("loc", []))
        msg = first_error.get("msg", "Validation error")
        error_message = f"Field '{loc}': {msg}" if loc else msg

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ErrorResponse(
                success=False,
                error=ErrorDetail(code="VALIDATION_ERROR", message=error_message),
            ).model_dump(),
        )

    return app


app = create_app()
