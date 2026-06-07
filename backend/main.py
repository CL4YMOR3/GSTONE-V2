"""
GST ONE — FastAPI Backend
=========================

🔒 ZERO modifications to GSTONE/ source code.
Path injection at startup bridges the legacy core to this API.

Run:
    uvicorn main:app --reload --port 8000
"""
import sys
from pathlib import Path
from contextlib import asynccontextmanager

# ── 🔒 Path injection — must be BEFORE any GSTONE imports ────────────────────
_GSTONE_DIR = Path(__file__).parent.parent / "GSTONE"
if str(_GSTONE_DIR) not in sys.path:
    sys.path.insert(0, str(_GSTONE_DIR))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import UPLOAD_DIR, EXPORT_DIR, RECO_STORAGE_DIR, CORS_ORIGINS
from api.v1 import context, upload, mapping, pipeline, export, vendor, reco, queries


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure all data dirs exist on startup
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    RECO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[*] GSTONE path: {_GSTONE_DIR}")
    print(f"[*] Upload dir:  {UPLOAD_DIR}")
    print(f"[*] Export dir:  {EXPORT_DIR}")
    yield
    # Cleanup: nothing to do — temp files are cleaned up per-request


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="GST ONE API",
    description="FastAPI wrapper for the GSTONE GST reconciliation core. Zero changes to legacy code.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers ───────────────────────────────────────────────────────────────────

PREFIX = "/api/v1"

app.include_router(context.router, prefix=PREFIX)
app.include_router(upload.router, prefix=PREFIX)
app.include_router(mapping.router, prefix=PREFIX)
app.include_router(pipeline.router, prefix=PREFIX)
app.include_router(export.router, prefix=PREFIX)
app.include_router(vendor.router, prefix=PREFIX)
app.include_router(reco.router, prefix=PREFIX)
app.include_router(queries.router, prefix=PREFIX)


# ── Health Check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "gstone_path": str(_GSTONE_DIR), "gstone_exists": _GSTONE_DIR.exists()}


@app.get("/", tags=["Health"])
async def root():
    return {
        "app": "GST ONE API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": 18,
    }
