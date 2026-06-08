"""
Backend Configuration
"""
from pathlib import Path

# Absolute paths
BACKEND_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = BACKEND_DIR.parent.resolve()
GSTONE_DIR = PROJECT_ROOT / "GSTONE"

UPLOAD_DIR = BACKEND_DIR / "data" / "uploads"
EXPORT_DIR = BACKEND_DIR / "data" / "exports"
RECO_STORAGE_DIR = BACKEND_DIR / "data" / "2b_raws"
SQLITE_DB_PATH = BACKEND_DIR / "data" / "gst_one_forensic.db"

# CORS — explicit local dev origins.
# `"*"` cannot be combined with credentialed browser requests reliably.
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# ThreadPoolExecutor workers for sync pipeline
MAX_PIPELINE_WORKERS = 4

# Ensure dirs exist at import time
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
RECO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
SQLITE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

