"""
Image validation and decoding utility using Pillow.

Verifies image integrity, rejects empty/corrupted files, and checks format.
"""

import io
from PIL import Image, UnidentifiedImageError
from app.config import ALLOWED_IMAGE_FORMATS, MAX_IMAGE_SIZE_BYTES


class ImageValidationError(Exception):
    """Raised when an uploaded image fails validation."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def validate_and_process_image(image_bytes: bytes) -> tuple[Image.Image, str]:
    """
    Validate that bytes represent a valid, uncorrupted, supported image.

    Args:
        image_bytes: Raw binary image payload.

    Returns:
        tuple[Image.Image, str]: Opened Pillow image object and format name.

    Raises:
        ImageValidationError: If image is empty, oversized, corrupted, or unsupported format.
    """
    if not image_bytes or len(image_bytes) == 0:
        raise ImageValidationError(
            code="EMPTY_IMAGE",
            message="Uploaded image file is empty (0 bytes).",
            status_code=400,
        )

    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ImageValidationError(
            code="IMAGE_TOO_LARGE",
            message=f"Image size exceeds maximum allowed limit of {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)} MB.",
            status_code=400,
        )

    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.verify()  # Verifies file integrity without decoding entire pixel data
    except (UnidentifiedImageError, OSError, Exception) as exc:
        raise ImageValidationError(
            code="INVALID_IMAGE",
            message="File is not a valid image format or is corrupted.",
            status_code=400,
        ) from exc

    # Re-open after verify() because verify closes the file in Pillow
    image = Image.open(io.BytesIO(image_bytes))
    image_format = (image.format or "").upper()

    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise ImageValidationError(
            code="UNSUPPORTED_FORMAT",
            message=f"Image format '{image_format}' is not supported. Allowed formats: {', '.join(sorted(ALLOWED_IMAGE_FORMATS))}.",
            status_code=400,
        )

    return image, image_format
