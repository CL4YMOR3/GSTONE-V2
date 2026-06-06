"""
SQLite-backed query endpoints for persisted v2 views.
"""
from fastapi import APIRouter, HTTPException, Query

import database
from models.responses import ApiResponse

router = APIRouter(prefix="/queries", tags=["Queries"])


@router.get("/dashboard/stats", summary="Get persisted dashboard metrics for an entity and period")
async def get_dashboard_stats(
    entity_id: str = Query(..., min_length=1),
    period: str = Query(..., min_length=1),
):
    try:
        return ApiResponse.ok(database.get_dashboard_stats(entity_id, period))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
