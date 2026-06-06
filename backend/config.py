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

# CORS
CORS_ORIGINS = ["*"]

# ThreadPoolExecutor workers for sync pipeline
MAX_PIPELINE_WORKERS = 4

# Ensure dirs exist at import time
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
RECO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
