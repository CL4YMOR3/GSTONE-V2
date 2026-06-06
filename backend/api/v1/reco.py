"""
Reco Router — 4 endpoints:
  POST  /api/v1/reco/upload
  GET   /api/v1/reco/{reco_id}/canonical
  POST  /api/v1/reco/run
  GET   /api/v1/reco/{reco_id}/results
"""
import uuid
import aiofiles
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from typing import Optional

from config import UPLOAD_DIR
from models.requests import RecoRunRequest
from models.responses import (
    ApiResponse, RecoUploadResponse, CanonicalSummary,
    RecoRunResponse, RecoResultsResponse, MatchResultRow,
)
import session_store as store
from services import reco_service

router = APIRouter(prefix="/reco", tags=["Reconciliation"])

ALLOWED_2B_EXTENSIONS = {".json", ".xlsx", ".xls"}


@router.post("/upload", summary="Upload GSTR-2B file(s)")
async def upload_2b(
    files: list[UploadFile] = File(...),
    parent_run_id: str = Form(...),
    declared_gstin: str = Form(...),
    declared_period: str = Form(...),
):
    reco_id = f"RECO_{uuid.uuid4().hex[:8].upper()}"
    upload_ids = []
    dest_paths = []

    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_2B_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported 2B file type: '{ext}'")
        
        upload_id = f"2B_{uuid.uuid4().hex[:8].upper()}"
        upload_ids.append(upload_id)
        dest_path = UPLOAD_DIR / f"{upload_id}{ext}"
        dest_paths.append(str(dest_path))

        async with aiofiles.open(dest_path, "wb") as out:
            await out.write(await file.read())

    # Register reco session
    store.recos[reco_id] = store.RecoSession(
        reco_id=reco_id,
        parent_run_id=parent_run_id,
        status="ingesting",
        declared_gstin=declared_gstin,
        declared_period=declared_period,
        upload_ids=upload_ids,
    )

    # Run ingestion in background
    try:
        await reco_service.ingest_2b_files(reco_id, dest_paths, declared_gstin, declared_period)
    except Exception as exc:
        store.recos[reco_id].status = "failed"
        store.recos[reco_id].error = str(exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return ApiResponse.ok(RecoUploadResponse(
        reco_id=reco_id,
        upload_ids=upload_ids,
        status=store.recos[reco_id].status,
    ).model_dump())


@router.get("/{reco_id}/canonical", summary="Get canonical 2B dataset summary")
async def get_canonical_summary(reco_id: str):
    reco = store.get_reco(reco_id)
    if not reco:
        raise HTTPException(status_code=404, detail=f"reco_id '{reco_id}' not found")

    stats = reco.canonical_stats or {}
    return ApiResponse.ok(CanonicalSummary(
        reco_id=reco_id,
        invoice_count=stats.get("invoice_count", 0),
        total_taxable_value=stats.get("total_taxable_value", 0.0),
        total_gst=stats.get("total_gst", 0.0),
        duplicate_count=stats.get("duplicate_count", 0),
        amendment_count=stats.get("amendment_count", 0),
    ).model_dump())


@router.post("/run", summary="Run reconciliation against a books run")
async def run_reconciliation(request: RecoRunRequest):
    reco = store.get_reco(request.reco_id)
    if not reco:
        raise HTTPException(status_code=404, detail=f"reco_id '{request.reco_id}' not found")
    if reco.status != "ready":
        raise HTTPException(status_code=400, detail=f"Reco session is not ready (status: {reco.status})")

    try:
        await reco_service.run_reconciliation(request.reco_id, request.parent_run_id)
        return ApiResponse.ok(RecoRunResponse(
            reco_id=request.reco_id,
            status="running",
        ).model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{reco_id}/results", summary="Get paginated reconciliation match results")
async def get_reco_results(
    reco_id: str,
    status: Optional[str] = Query(None, description="Filter by match status e.g. MISSING_IN_2B"),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=1000),
):
    reco = store.get_reco(reco_id)
    if not reco:
        raise HTTPException(status_code=404, detail=f"reco_id '{reco_id}' not found")
    if reco.status not in ("complete", "failed"):
        return ApiResponse.ok({"reco_id": reco_id, "status": reco.status})

    match_results = (reco.match_results or {}).get("match_results", [])
    unmatched_2b = (reco.match_results or {}).get("unmatched_2b", [])
    total_books = (reco.match_results or {}).get("total_books", 0)
    total_2b = (reco.match_results or {}).get("total_2b", 0)

    # Optional status filter
    if status:
        match_results = [r for r in match_results if r.get("match_status") == status]

    total = len(match_results)
    start = (page - 1) * limit
    paged = match_results[start:start + limit]

    return ApiResponse.ok(RecoResultsResponse(
        reco_id=reco_id,
        total_books=total_books,
        total_2b=total_2b,
        total=total,
        page=page,
        limit=limit,
        results=[MatchResultRow(**r) for r in paged],
        unmatched_2b_count=len(unmatched_2b),
    ).model_dump())
