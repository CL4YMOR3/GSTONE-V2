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
    RecoRunResponse, RecoResultsResponse, MatchResultRow, RecoBooksWorkbookResponse,
)
import session_store as store
from services import reco_service

router = APIRouter(prefix="/reco", tags=["Reconciliation"])

ALLOWED_2B_EXTENSIONS = {".json", ".xlsx"}
ALLOWED_BOOK_WORKBOOK_EXTENSIONS = {".xlsx"}


@router.post("/books-workbook", summary="Upload an approved clean-books workbook for 2B handoff")
async def upload_books_workbook(
    file: UploadFile = File(...),
    entity_id: str = Form(...),
    period: str = Form(...),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_BOOK_WORKBOOK_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported workbook type: '{ext}'")

    upload_id = f"BOOKS_{uuid.uuid4().hex[:8].upper()}"
    dest_path = UPLOAD_DIR / f"{upload_id}{ext}"
    async with aiofiles.open(dest_path, "wb") as out:
        await out.write(await file.read())

    try:
        from core.reco_2b.exported_book_ingestor import ExportedBookIngestor

        ingested = ExportedBookIngestor.ingest_workbook(str(dest_path))
        ingested_run_id = (ingested.get("parent_run_id") or "").strip()
        if not ingested_run_id or ingested_run_id.upper() in {"PENDING_APPROVAL", "UNKNOWN", "RESUMED_RUN"}:
            run_id = f"BOOKS_{uuid.uuid4().hex[:8].upper()}"
        else:
            run_id = ingested_run_id
        business_context = ingested.get("business_context") or "default"
        invoices = ingested.get("invoices", [])

        run = store.get_run(run_id)
        if not run:
            run = store.RunSession(
                run_id=run_id,
                status="approved",
                entity_id=entity_id,
                period=period,
                business_context=business_context,
                company_gstins=[],
                garden_assignments=[],
                garden_files=[],
                col_map={},
                file_ids=[],
                result=None,
                handoff_workbook_path=str(dest_path),
                handoff_workbook_name=file.filename,
                handoff_source="uploaded_workbook",
            )
            store.runs[run_id] = run
        else:
            run.status = "approved"
            run.entity_id = run.entity_id or entity_id
            run.period = run.period or period
            run.business_context = business_context or run.business_context
            run.handoff_workbook_path = str(dest_path)
            run.handoff_workbook_name = file.filename
            run.handoff_source = "uploaded_workbook"

        return ApiResponse.ok(RecoBooksWorkbookResponse(
            run_id=run_id,
            status=run.status,
            business_context=run.business_context,
            source_file=file.filename,
            invoice_count=len(invoices),
        ).model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


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
        detail = str(exc)
        status_code = 500
        lowered = detail.lower()
        if any(token in lowered for token in [
            "cannot find b2b data sheet",
            "missing required columns",
            "cannot detect header row",
            "cannot open excel file",
            "file is not a zip file",
            "unsupported format",
            "openpyxl is not installed",
            "2b ingestion failed",
            "no adapter available",
        ]):
            status_code = 400
        raise HTTPException(status_code=status_code, detail=detail)

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
    from core.reco_2b.models import Canonical2BInvoice

    canonical_by_identity = {}
    for raw_invoice in (reco.canonical_invoices or []):
        try:
            canonical_invoice = Canonical2BInvoice.from_dict(raw_invoice)
            canonical_by_identity[canonical_invoice.get_identity_key_string()] = raw_invoice
        except Exception:
            continue
    missing_in_books_rows = []
    for identity_key in unmatched_2b:
        canonical_invoice = canonical_by_identity.get(identity_key)
        if not canonical_invoice:
            continue
        missing_in_books_rows.append({
            "books_invoice_id": identity_key,
            "match_status": "MISSING_IN_BOOKS",
            "match_method": None,
            "matched_2b_invoice_id": identity_key,
            "books_supplier_gstin": None,
            "books_supplier_name": None,
            "books_invoice_number": None,
            "books_invoice_date": None,
            "books_taxable_value": None,
            "books_total_gst": None,
            "books_invoice_value": None,
            "canonical_supplier_gstin": canonical_invoice.get("supplier_gstin"),
            "canonical_supplier_name": canonical_invoice.get("supplier_legal_name"),
            "canonical_invoice_number": canonical_invoice.get("invoice_number"),
            "canonical_invoice_date": canonical_invoice.get("invoice_date"),
            "canonical_taxable_value": canonical_invoice.get("taxable_value"),
            "canonical_total_gst": canonical_invoice.get("total_gst_amount"),
            "canonical_invoice_value": canonical_invoice.get("invoice_value"),
            "candidate_count": 0,
            "value_deltas": [],
            "mismatch_reasons": [],
        })
    all_rows = [*match_results, *missing_in_books_rows]

    # Optional status filter
    if status:
        all_rows = [r for r in all_rows if r.get("match_status") == status]

    total = len(all_rows)
    start = (page - 1) * limit
    paged = all_rows[start:start + limit]

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


@router.get("/{reco_id}/export", summary="Export reconciliation results to Excel workbook")
async def export_reco_results(reco_id: str):
    reco = store.get_reco(reco_id)
    if not reco:
        raise HTTPException(status_code=404, detail=f"reco_id '{reco_id}' not found")
    if reco.status != "complete":
        raise HTTPException(status_code=400, detail=f"Cannot export results, reco status is: {reco.status}")

    try:
        from fastapi.responses import FileResponse
        temp_file_path = await reco_service.export_reco_results_workbook(reco_id)
        
        filename = f"Reco_Results_{reco_id}.xlsx"
        return FileResponse(
            path=temp_file_path,
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
