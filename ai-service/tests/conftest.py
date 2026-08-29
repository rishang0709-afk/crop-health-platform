"""
Test fixtures and synthetic image generators for pytest.
"""

import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app.main import app


@pytest.fixture
def client() -> TestClient:
    """FastAPI TestClient fixture."""
    return TestClient(app)


@pytest.fixture
def valid_png_bytes() -> bytes:
    """Generate a minimal valid 10x10 RGB PNG image."""
    img = Image.new("RGB", (10, 10), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def valid_jpeg_bytes() -> bytes:
    """Generate a minimal valid 10x10 RGB JPEG image."""
    img = Image.new("RGB", (10, 10), color=(255, 69, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def valid_webp_bytes() -> bytes:
    """Generate a minimal valid 10x10 RGB WebP image."""
    img = Image.new("RGB", (10, 10), color=(0, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="WEBP")
    return buf.getvalue()


@pytest.fixture
def unsupported_gif_bytes() -> bytes:
    """Generate a minimal valid GIF image (unsupported by AI service)."""
    img = Image.new("RGB", (10, 10), color=(255, 255, 0))
    buf = io.BytesIO()
    img.save(buf, format="GIF")
    return buf.getvalue()


@pytest.fixture
def corrupt_image_bytes() -> bytes:
    """Return non-image arbitrary bytes."""
    return b"This is not a valid image byte stream."


@pytest.fixture
def empty_image_bytes() -> bytes:
    """Return empty 0-byte payload."""
    return b""
