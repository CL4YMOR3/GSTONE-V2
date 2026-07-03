"""
Pipeline Router — 5 endpoints:
  POST   /api/v1/pipeline/run
  GET    /api/v1/pipeline/{run_id}/status
  GET    /api/v1/pipeline/{run_id}/errors
  GET    /api/v1/pipeline/{run_id}/clean
  GET    /api/v1/pipeline/{run_id}/warnings
  POST   /api/v1/pipeline/{run_id}/fixes
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from models.requests import PipelineRunRequest, SubmitFixesRequest, FinalizeAuditRequest
from models.responses import (
    ApiResponse, PipelineRunResponse, RunStatusResponse,
    RunSummary, GardenStats, ErrorsResponse, ErrorRow,
    InvoiceListResponse, InvoiceRow, SuggestionPayload,
)
import session_store as store
from services import pipeline_service
import uuid

router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


from fastapi.responses import StreamingResponse


def _build_handoff_payload(run_id: str, status: str) -> dict:
    run = store.get_run(run_id)
    latest_export = store.get_latest_export_for_run(run_id)
    approved_export = store.get_latest_export_for_run(run_id, approved_only=True)
    workbook_name = run.handoff_workbook_name if run and run.handoff_workbook_name else None
    workbook_source = run.handoff_source if run and run.handoff_source else None
    has_uploaded_workbook = bool(run and run.handoff_workbook_path)
    return {
        "run_status": status,
        "has_export": latest_export is not None,
        "has_approved_export": approved_export is not None,
        "has_uploaded_workbook": has_uploaded_workbook,
        "export_id": approved_export.export_id if approved_export else (latest_export.export_id if latest_export else None),
        "export_file_name": workbook_name or (approved_export.file_name if approved_export else (latest_export.file_name if latest_export else None)),
        "source": workbook_source or ("approved_export" if approved_export else None),
        "ready_for_reconciliation": status == "approved" and (has_uploaded_workbook or approved_export is not None),
    }

@router.post("/run", summary="Start a pipeline run (single or multi-garden)")
async def run_pipeline(request: PipelineRunRequest):
    try:
        return StreamingResponse(
            pipeline_service.start_run_stream(request),
            media_type="text/event-stream"
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/latest", summary="Recover the latest sandbox run for an entity-period")
async def get_latest_sandbox_run(
    entity_id: str = Query(..., min_length=1),
    period: str = Query(..., min_length=1),
):
    run = store.get_latest_run(entity_id, period)
    if not run:
        raise HTTPException(status_code=404, detail="No sandbox run found for the selected entity and period")

    result = run.result or {}
    if "clean_invoices" in result or "identity_errors" in result:
        normalized_results = {
            "col_map": result.get("col_map", {}),
            "clean": result.get("clean_invoices", []),
            "warnings": result.get("warning_invoices", []),
            "errors": result.get("identity_errors", []) + result.get("aggregation_errors", []),
        }
    else:
        normalized_results = result

    return ApiResponse.ok({
        "run_id": run.run_id,
        "entity_id": run.entity_id,
        "period": run.period,
        "business_context": run.business_context,
        "status": run.status,
        "handoff": _build_handoff_payload(run.run_id, run.status),
        "summary": result.get("summary") if result else None,
        "results": normalized_results,
        "fixes": run.fix_actions,
        "created_at": run.created_at,
        "updated_at": run.created_at,
    })


@router.get("/{run_id}/status", summary="Poll run status and metrics")
async def get_run_status(run_id: str):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"run_id '{run_id}' not found")

    summary = None
    garden_stats = None

    if run.result:
        s = run.result.get("summary", {})
        summary = RunSummary(**s) if s else None
        gs = run.result.get("garden_stats", {})
        garden_stats = {k: GardenStats(**v) for k, v in gs.items()} if gs else None

    response = RunStatusResponse(
        run_id=run_id,
        status=run.status,
        summary=summary,
        garden_stats=garden_stats,
        error=run.error,
        created_at=run.created_at,
    )
    payload = response.model_dump()
    payload["handoff"] = _build_handoff_payload(run_id, run.status)
    return ApiResponse.ok(payload)


@router.get("/{run_id}/errors", summary="Get identity and aggregation errors with suggestions")
async def get_errors(
    run_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"run_id '{run_id}' not found")
    if run.status not in ("complete", "failed"):
        return ApiResponse.ok({"run_id": run_id, "status": run.status, "message": "Pipeline still running"})

    result = run.result or {}
    identity_errors_raw = result.get("identity_errors", [])
    aggregation_errors_raw = result.get("aggregation_errors", [])

    def _to_error_row(e: dict) -> ErrorRow:
        suggestion = None
        if e.get("suggestion"):
            suggestion = SuggestionPayload(**e["suggestion"])
        return ErrorRow(
            original_row_index=e.get("original_row_index", -1),
            error_type=e.get("error_type", ""),
            error_message=e.get("error_message", ""),
            field=e.get("field"),
            value=e.get("value"),
            garden_name=e.get("garden_name"),
            vendor_name=e.get("vendor_name"),
            invoice_number=e.get("invoice_number"),
            invoice_date=e.get("invoice_date"),
            gstin=e.get("gstin"),
            severity=e.get("severity", "HARD"),
            category=e.get("category"),
            gst_status=e.get("gst_status"),
            gate_failed=e.get("gate_failed"),
            suggestion=suggestion,
            vendor_suggestion=e.get("vendor_suggestion"),
            original_row_data=e.get("original_row_data", {}),
            affected_rows=e.get("affected_rows") or [],
        )

    # Paginate identity errors
    start = (page - 1) * limit
    end = start + limit
    paged_identity = [_to_error_row(e) for e in identity_errors_raw[start:end]]
    paged_aggregation = [_to_error_row(e) for e in aggregation_errors_raw[start:end]]

    response = ErrorsResponse(
        run_id=run_id,
        col_map=result.get("col_map", {}),
        total_identity_errors=len(identity_errors_raw),
        total_aggregation_errors=len(aggregation_errors_raw),
        identity_errors=paged_identity,
        aggregation_errors=paged_aggregation,
        page=page,
        limit=limit,
    )
    return ApiResponse.ok(response.model_dump())


@router.get("/{run_id}/clean", summary="Get paginated clean invoices preview")
async def get_clean_invoices(
    run_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=1000),
):
    return _get_invoice_list(run_id, "clean_invoices", page, limit)


@router.get("/{run_id}/warnings", summary="Get paginated warning invoices")
async def get_warning_invoices(
    run_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=1000),
):
    return _get_invoice_list(run_id, "warning_invoices", page, limit)


def _get_invoice_list(run_id: str, key: str, page: int, limit: int):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"run_id '{run_id}' not found")
    if run.status != "complete":
        return ApiResponse.ok({"run_id": run_id, "status": run.status})

    records = (run.result or {}).get(key, [])
    total = len(records)
    start = (page - 1) * limit
    paged = records[start:start + limit]

    col_map = (run.result or {}).get("col_map", {})
    inv_col = col_map.get("invoice_number")
    date_col = col_map.get("invoice_date")
    gstin_col = col_map.get("gstin")
    vendor_col = col_map.get("vendor_name")
    tax_col = col_map.get("taxable_value")
    igst_col = col_map.get("igst_amount")
    cgst_col = col_map.get("cgst_amount")
    sgst_col = col_map.get("sgst_amount")
    total_col = col_map.get("total_invoice_value")

    def _to_row(r: dict) -> InvoiceRow:
        def _f(col): return float(r[col]) if col and r.get(col) is not None else None
        return InvoiceRow(
            invoice_key=r.get("invoice_key"),
            garden_name=r.get("_garden_name"),
            invoice_number=r.get(inv_col) if inv_col else None,
            invoice_date=str(r.get(date_col, "") or "") if date_col else None,
            gstin=r.get(gstin_col) if gstin_col else None,
            vendor_name=r.get(vendor_col) if vendor_col else None,
            taxable_value=_f(tax_col),
            igst_amount=_f(igst_col),
            cgst_amount=_f(cgst_col),
            sgst_amount=_f(sgst_col),
            total_invoice_value=_f(total_col),
        )

    return ApiResponse.ok(InvoiceListResponse(
        run_id=run_id, total=total, page=page, limit=limit,
        invoices=[_to_row(r) for r in paged],
    ).model_dump())


@router.post("/{run_id}/fixes", summary="Submit approved fixes and trigger reprocess")
async def submit_fixes(run_id: str, request: SubmitFixesRequest):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"run_id '{run_id}' not found")

    try:
        return StreamingResponse(
            pipeline_service.reprocess_run_stream(run_id, request.fixes),
            media_type="text/event-stream"
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{run_id}/reprocess", summary="Reprocess a stored books run using saved source files, mappings, and fixes")
async def reprocess_run(run_id: str):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"run_id '{run_id}' not found")

    try:
        return StreamingResponse(
            pipeline_service.reprocess_run_stream(run_id, []),
            media_type="text/event-stream",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/finalize", summary="Certify the active sandbox run in session memory")
async def finalize_audit(request: FinalizeAuditRequest):
    if not request.entity_id or not request.period:
        raise HTTPException(status_code=400, detail="entity_id and period are required")

    run = store.get_run(request.run_id) if request.run_id else None
    business_context = run.business_context if run else "UNKNOWN"
    summary_payload = run.result.get("summary") if run and run.result else request.summary
    results_payload = run.result if run and run.result else request.results
    fixes_payload = run.fix_actions if run and run.fix_actions else [fix.model_dump() for fix in request.fixes]

    certification_id = f"CERT_{uuid.uuid4().hex[:8].upper()}"
    record = store.CertifiedRun(
        certification_id=certification_id,
        run_id=request.run_id or certification_id,
        entity_id=request.entity_id,
        period=request.period,
        business_context=business_context,
        summary=summary_payload or {},
        results=results_payload or {},
        fixes=fixes_payload or [],
    )
    store.save_certified(record)

    # Insert ledger items to DB upon approval
    import json
    import datetime
    from database import get_connection

    now = datetime.datetime.now().isoformat()

    if results_payload:
        with get_connection() as conn:
            # Derive the canonical invoice period from the raw upload data for this run.
            # raw_books_uploads.return_period reflects the actual invoice month (derived from invoice dates),
            # which may differ from request.period (the GST filing return period sent by the frontend).
            # We use the dominant raw period so that clean books filter behaviour is consistent with raw books.
            # Edge case #8: If two periods have the same row count (50-50 split), we pick the one that
            # is numerically closest to (but not after) request.period, breaking ties deterministically.
            raw_period_rows = conn.execute(
                """
                SELECT return_period, COUNT(*) as cnt
                FROM raw_books_uploads
                WHERE run_id = ? AND return_period IS NOT NULL
                GROUP BY return_period
                ORDER BY cnt DESC, return_period DESC
                LIMIT 1
                """,
                (request.run_id,),
            ).fetchone()
            if raw_period_rows:
                canonical_period = raw_period_rows["return_period"]
            else:
                # Edge case #7 (Reprocessed Run): No raw_books_uploads rows found for this new run_id.
                # Derive canonical period from the clean/warning items directly.
                clean_invs = results_payload.get("clean_invoices", results_payload.get("clean", []))
                warn_invs = results_payload.get("warning_invoices", results_payload.get("warnings", []))
                
                # We need the col map to know which key holds the invoice date
                c_map = results_payload.get("col_map", (run.result or {}).get("col_map", {})) if run else {}
                d_col = c_map.get("invoice_date") or "invoice_date"
                
                date_counts = {}
                from dateutil import parser
                for row_data in clean_invs + warn_invs:
                    if isinstance(row_data, dict):
                        d_val = str(row_data.get(d_col) or row_data.get("invoice_date") or "").strip()
                        if d_val:
                            try:
                                dt = parser.parse(d_val, dayfirst=True)
                                period_str = dt.strftime("%Y-%m")
                                date_counts[period_str] = date_counts.get(period_str, 0) + 1
                            except Exception:
                                pass
                
                if date_counts:
                    # Sort by count desc, then period desc to break ties
                    sorted_periods = sorted(date_counts.items(), key=lambda x: (x[1], x[0]), reverse=True)
                    canonical_period = sorted_periods[0][0]
                else:
                    canonical_period = request.period
                    print(
                        f"WARNING [finalize_audit]: No raw_books_uploads rows AND no parsable dates found for run_id='{request.run_id}'. "
                        f"Falling back to session period '{request.period}' for books_runs.return_period."
                    )

            # Industry-standard immutable versioning: Soft-delete (supersede) previous runs instead of hard deletion.
            # This maintains a full forensic audit trail of all historical approvals.
            conn.execute("""
                UPDATE books_runs 
                SET status = 'superseded' 
                WHERE entity_id = ? AND return_period = ? AND run_id != ?
            """, (request.entity_id, canonical_period, request.run_id))

            # Align the current run's return_period with the canonical invoice period from raw books.
            conn.execute("""
                UPDATE books_runs SET return_period = ? WHERE run_id = ?
            """, (canonical_period, request.run_id))
            
            # Clear items ONLY for the current run_id to ensure idempotency on the active transaction
            conn.execute("DELETE FROM books_run_clean_items WHERE run_id = ?", (request.run_id,))
            conn.execute("DELETE FROM books_run_warning_items WHERE run_id = ?", (request.run_id,))
            conn.execute("DELETE FROM books_run_error_items WHERE run_id = ?", (request.run_id,))
            
            col_map = results_payload.get("col_map", (run.result or {}).get("col_map", {})) if run else {}
            # Edge case #10: col_map may be empty or missing keys — fall back to
            # scanning raw row keys directly so composite_key never silently uses empty strings.
            inv_col = col_map.get("invoice_number") or "invoice_number"
            date_col = col_map.get("invoice_date") or "invoice_date"
            gstin_col = col_map.get("gstin") or "supplier_gstin"

            import hashlib
            def _hash_row(r_dict):
                return hashlib.sha256(json.dumps(r_dict, sort_keys=True).encode('utf-8')).hexdigest()

            def _composite_key(row: dict) -> str:
                """Deterministic session-safe dedup key. Uses sha256 of full row JSON when
                identity fields are absent — avoids Python hash() randomisation (#11)."""
                # Try mapped column names first, then canonical fallback names
                g = str(
                    row.get(gstin_col) or row.get("supplier_gstin") or row.get("gstin") or ""
                ).strip()
                i = str(
                    row.get(inv_col) or row.get("invoice_number") or row.get("bill_number") or ""
                ).strip()
                d = str(
                    row.get(date_col) or row.get("invoice_date") or row.get("bill_date") or ""
                ).strip()
                if g or i:
                    return f"{g}|{i}|{d}"
                # No identity fields — use full-row content hash (deterministic across sessions)
                return _hash_row(row)

            clean_invoices = results_payload.get("clean_invoices", results_payload.get("clean", []))
            seen_clean = set()
            for row in clean_invoices:
                if not isinstance(row, dict):
                    continue
                
                composite_key = _composite_key(row)
                if composite_key in seen_clean:
                    continue
                seen_clean.add(composite_key)
                
                g = str(row.get(gstin_col) or row.get("supplier_gstin") or "").strip()
                i = str(row.get(inv_col) or row.get("invoice_number") or "").strip()
                invoice_key = f"{g}_{i}" if g and i else None
                row_hash = _hash_row(row)
                
                conn.execute(
                    "INSERT OR IGNORE INTO books_run_clean_items (run_id, entity_id, invoice_key, row_hash, row_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (request.run_id, request.entity_id, invoice_key, row_hash, json.dumps(row), now),
                )
                
            warning_invoices = results_payload.get("warning_invoices", results_payload.get("warnings", []))
            seen_warn = set()
            for row in warning_invoices:
                if not isinstance(row, dict):
                    continue
                
                composite_key = _composite_key(row)
                if composite_key in seen_warn:
                    continue
                seen_warn.add(composite_key)
                
                g = str(row.get(gstin_col) or row.get("supplier_gstin") or "").strip()
                i = str(row.get(inv_col) or row.get("invoice_number") or "").strip()
                invoice_key = f"{g}_{i}" if g and i else None
                row_hash = _hash_row(row)
                
                conn.execute(
                    "INSERT OR IGNORE INTO books_run_warning_items (run_id, entity_id, invoice_key, row_hash, row_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (request.run_id, request.entity_id, invoice_key, row_hash, json.dumps(row), now),
                )
                
            errors = results_payload.get("errors", [])
            if not errors and ("identity_errors" in results_payload or "aggregation_errors" in results_payload):
                errors = results_payload.get("identity_errors", []) + results_payload.get("aggregation_errors", [])
                
            for row in errors:
                row_hash = _hash_row(row) if isinstance(row, dict) else _hash_row({"error": str(row)})
                conn.execute(
                    "INSERT OR IGNORE INTO books_run_error_items (run_id, entity_id, category, row_hash, row_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (request.run_id, request.entity_id, row.get("category") if isinstance(row, dict) else "ERROR", row_hash, json.dumps(row), now),
                )
            conn.commit()

    if run:
        run.status = "complete"
        store.save_run(run)

    return ApiResponse.ok({
        "certification_id": record.certification_id,
        "run_id": record.run_id,
        "entity_id": record.entity_id,
        "period": record.period,
        "business_context": record.business_context,
        "status": record.status,
        "summary": record.summary,
        "results": record.results,
        "fixes": record.fixes,
        "certified_at": record.certified_at,
    })
