"""
Session-backed query endpoints for the current offline app state.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

import session_store as store
import database as db
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


# ─── Ledger Endpoints ──────────────────────────────────────────────────────────

@router.get("/ledger/metadata", summary="Get dynamic ledger metadata (gardens, periods)")
async def get_ledger_metadata(entity_id: str = Query(...)):
    try:
        return ApiResponse.ok(db.get_ledger_metadata(entity_id))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/ledger/reco", summary="Get ledger reconciliation rows with period filtering")
async def get_ledger_reco(
    entity_id: str = Query(...),
    filter_type: str = Query("monthly"),
    year: Optional[str] = Query(None),
    quarter: Optional[int] = Query(None),
    period: Optional[str] = Query(None),
    statuses: Optional[str] = Query(None, description="Comma-separated match statuses"),
    garden_name: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50000, ge=1, le=100000),
):
    try:
        status_list = [s.strip() for s in statuses.split(",")] if statuses else None
        data = db.get_ledger_reco_data(
            entity_id=entity_id,
            filter_type=filter_type,
            year=year,
            quarter=quarter,
            period=period,
            statuses=status_list,
            garden_name=garden_name,
            page=page,
            limit=limit,
        )
        return ApiResponse.ok(data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/ledger/books", summary="Get ledger books rows (clean/warnings/errors) with period filtering")
async def get_ledger_books(
    entity_id: str = Query(...),
    data_type: str = Query("clean", description="clean | warnings | errors"),
    filter_type: str = Query("monthly"),
    year: Optional[str] = Query(None),
    quarter: Optional[int] = Query(None),
    period: Optional[str] = Query(None),
    garden_name: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50000, ge=1, le=100000),
):
    try:
        data = db.get_ledger_books_data(
            entity_id=entity_id,
            data_type=data_type,
            filter_type=filter_type,
            year=year,
            quarter=quarter,
            period=period,
            garden_name=garden_name,
            page=page,
            limit=limit,
        )
        return ApiResponse.ok(data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/ledger/raw-books", summary="Get raw books rows for an entity/period")
async def get_ledger_raw_books(
    entity_id: str = Query(...),
    filter_type: str = Query("monthly"),
    year: Optional[str] = Query(None),
    quarter: Optional[int] = Query(None),
    period: Optional[str] = Query(None),
    garden_name: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50000, ge=1, le=100000),
):
    try:
        data = db.get_raw_books_rows(
            entity_id=entity_id,
            filter_type=filter_type,
            year=year,
            quarter=quarter,
            period=period,
            garden_name=garden_name,
            page=page,
            limit=limit,
        )
        return ApiResponse.ok(data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/ledger/2b", summary="Get finalized canonical 2B rows for an entity/period")
async def get_ledger_2b(
    entity_id: str = Query(...),
    filter_type: str = Query("monthly"),
    year: Optional[str] = Query(None),
    quarter: Optional[int] = Query(None),
    period: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50000, ge=1, le=100000),
):
    try:
        data = db.get_ledger_2b_data(
            entity_id=entity_id,
            filter_type=filter_type,
            year=year,
            quarter=quarter,
            period=period,
            page=page,
            limit=limit,
        )
        return ApiResponse.ok(data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/ledger/kpis", summary="Get dynamic KPI aggregates for the active ledger filter")
async def get_ledger_kpis(
    entity_id: str = Query(...),
    filter_type: str = Query("monthly"),
    year: Optional[str] = Query(None),
    quarter: Optional[int] = Query(None),
    period: Optional[str] = Query(None),
    garden_name: Optional[str] = Query(None),
):
    try:
        kpis = db.get_ledger_kpis(
            entity_id=entity_id,
            filter_type=filter_type,
            year=year,
            quarter=quarter,
            period=period,
            garden_name=garden_name,
        )
        return ApiResponse.ok(kpis)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
