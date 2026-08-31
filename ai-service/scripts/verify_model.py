#!/usr/bin/env python3
"""
verify_model.py

Standalone checksum verification script for the locked SIH MVP crop model.
Verifies SHA256 hash of the finalized runtime model without external dependencies.
"""

import sys
import os
import hashlib
from pathlib import Path

# Locked reference checksum
EXPECTED_SHA256 = "04fb91eee50933ee861c0e85f706165c13387827ba0a99826e812f1fe0aa377f"
MODEL_NAME = "mobilenetv3-small-crop-health-exp-d"
MODEL_VERSION = "crop-health-v1-exp-d"

def get_default_model_path() -> Path:
    """Resolve default model path relative to this script."""
    script_dir = Path(__file__).resolve().parent
    ai_service_dir = script_dir.parent
    return ai_service_dir / "models" / "crop-health-v1-exp-d.pt"

def verify_checkpoint(path: Path) -> bool:
    """Calculate and verify SHA256 checksum."""
    print("=" * 60)
    print("CROP HEALTH AI MODEL CHECKSUM VERIFICATION")
    print("=" * 60)
    print(f"Model Identifier : {MODEL_NAME}")
    print(f"Model Version    : {MODEL_VERSION}")
    print(f"Target Path      : {path}")

    if not path.exists():
        print(f"\n[FAIL] Checkpoint not found at: {path}")
        print("Please ensure the model file is present in ai-service/models/.")
        return False

    size_bytes = path.stat().st_size
    size_mb = size_bytes / (1024 * 1024)
    print(f"File Size        : {size_bytes:,} bytes ({size_mb:.2f} MB)")

    sha256 = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
    except Exception as e:
        print(f"\n[FAIL] Error reading model file: {e}")
        return False

    computed_hash = sha256.hexdigest().lower()
    print(f"Computed SHA256  : {computed_hash}")
    print(f"Expected SHA256  : {EXPECTED_SHA256}")

    if computed_hash == EXPECTED_SHA256:
        print("-" * 60)
        print("[PASS] Checksum MATCHES locked reference. Model is verified and ready.")
        print("-" * 60)
        return True
    else:
        print("-" * 60)
        print("[FAIL] Checksum MISMATCH! Model weights may be corrupt or altered.")
        print("-" * 60)
        return False

def main():
    if len(sys.argv) > 1:
        target_path = Path(sys.argv[1]).resolve()
    else:
        target_path = get_default_model_path()

    success = verify_checkpoint(target_path)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
