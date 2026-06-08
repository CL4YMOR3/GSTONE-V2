"""
Session-backed query endpoints for the current offline app state.
"""
from fastapi import APIRouter, HTTPException, Query

import session_store as store
from models.responses import ApiResponse

router = APIRouter(prefix="/queries", tags=["Queries"])


@router.get("/dashboard/stats", summary="Get persisted dashboard metrics for an entity and period")
async def get_dashboard_stats(
    entity_id: str = Query(..., min_length=1),
    period: str = Query(..., min_length=1),
):
    try:
        return ApiResponse.ok(store.get_dashboard_stats(entity_id, period))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/month-cycles", summary="List stored GST month cycles")
async def list_month_cycles(entity_id: str | None = Query(None)):
    try:
        return ApiResponse.ok(store.list_month_cycles(entity_id))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/month-cycles/{entity_id}/{period}", summary="Get a single month cycle with current state")
async def get_month_cycle(entity_id: str, period: str):
    cycle = store.get_month_cycle(entity_id, period)
    if not cycle:
        raise HTTPException(status_code=404, detail="Month cycle not found")
    return ApiResponse.ok(cycle)


@router.get("/month-cycles/{entity_id}/{period}/history", summary="Get version and audit history for a month cycle")
async def get_month_cycle_history(entity_id: str, period: str):
    try:
        return ApiResponse.ok(store.get_month_cycle_history(entity_id, period))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/suppliers/followups", summary="Get supplier follow-up list for unresolved exceptions")
async def get_supplier_followups(
    entity_id: str = Query(..., min_length=1),
    period: str | None = Query(None),
):
    try:
        return ApiResponse.ok(store.get_supplier_followups(entity_id, period))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/month-cycles/{entity_id}/{period}/close", summary="Close a GST month cycle and freeze current review state")
async def close_month_cycle(entity_id: str, period: str):
    try:
        return ApiResponse.ok(store.close_month_cycle(entity_id, period))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
