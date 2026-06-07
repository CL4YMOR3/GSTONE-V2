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
    store.certified_runs[certification_id] = record

    if run:
        run.status = "complete"

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
