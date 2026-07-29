"""Resolvable paths for uploads and seller config (volume-friendly via env)."""
import os
import shutil

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DEFAULT_UPLOADS = os.path.join(_BACKEND_DIR, "uploads")
_DEFAULT_SELLER_CONFIG = os.path.join(_BACKEND_DIR, "seller_config.json")


def get_upload_dir() -> str:
    path = os.environ.get("UPLOAD_DIR", "").strip() or _DEFAULT_UPLOADS
    os.makedirs(path, exist_ok=True)
    return path


def get_seller_config_path() -> str:
    path = os.environ.get("SELLER_CONFIG_PATH", "").strip() or _DEFAULT_SELLER_CONFIG
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    # Seed volume path from image default on first boot
    if path != _DEFAULT_SELLER_CONFIG and not os.path.exists(path) and os.path.exists(_DEFAULT_SELLER_CONFIG):
        shutil.copy2(_DEFAULT_SELLER_CONFIG, path)
    return path
