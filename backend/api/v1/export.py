"""
Export Router — 3 endpoints:
  POST  /api/v1/pipeline/{run_id}/export
  GET   /api/v1/export/{export_id}/download
  POST  /api/v1/export/{export_id}/approve
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from models.requests import ExportRequest
from models.responses import ApiResponse, ExportResponse, ApproveResponse
import session_store as store
import database
from services.export_service import generate_export

router = APIRouter(tags=["Export"])


@router.post("/pipeline/{run_id}/export", summary="Generate 5-sheet validation workbook")
async def create_export(run_id: str, request: ExportRequest = None):
    run = store.get_run(run_id)
    certification = database.get_certified_by_run_id(run_id)
    if not run and not certification:
        raise HTTPException(status_code=404, detail=f"run_id '{run_id}' not found")
    if run and run.status not in ("complete", "approved"):
        raise HTTPException(status_code=400, detail=f"Run is not exportable (status: {run.status})")

    try:
        record, file_size = await generate_export(run_id)
        return ApiResponse.ok(ExportResponse(
            export_id=record.export_id,
            run_id=run_id,
            file_name=record.file_name,
            file_size_bytes=file_size,
        ).model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/export/{export_id}/download", summary="Download the generated Excel workbook")
async def download_export(export_id: str):
    record = store.get_export(export_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"export_id '{export_id}' not found")

    from pathlib import Path
    if not Path(record.file_path).exists():
        raise HTTPException(status_code=410, detail="Export file no longer exists on disk")

    return FileResponse(
        path=record.file_path,
        filename=record.file_name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/export/{export_id}/approve", summary="Mark export as approved (immutability lock)")
async def approve_export(export_id: str):
    record = store.get_export(export_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"export_id '{export_id}' not found")

    record.approved = True
    database.mark_export_approved(export_id)

    # Also mark run as approved
    run = store.get_run(record.run_id)
    if run:
        run.status = "approved"

    return ApiResponse.ok(ApproveResponse(
        export_id=export_id,
        run_id=record.run_id,
        approved=True,
    ).model_dump())
