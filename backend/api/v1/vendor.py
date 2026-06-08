"""
Vendor Router
"""
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from models.responses import ApiResponse, VendorResult, VendorSearchResponse
from services.vendor_service import get_vendor_stats, import_vendors, list_vendors, search_vendors, upsert_vendor

router = APIRouter(prefix="/vendors", tags=["Vendor"])


@router.get("", summary="List vendor master records")
async def vendor_list(
    context: Optional[str] = Query(None, description="Business context filter e.g. ASSAM_GARDENS"),
    q: Optional[str] = Query(None, description="Name, GSTIN, legal name, trade name, or alias fragment"),
    status: Optional[str] = Query(None, description="ACTIVE, CANCELLED, SUSPENDED, UNKNOWN"),
    trust_level: Optional[str] = Query(None, description="HIGH, MEDIUM, LOW"),
    sort_by: str = Query("vendor_name", pattern="^(vendor_name|invoice_count|last_seen|trust_level)$"),
    limit: int = Query(5000, ge=1, le=10000),
):
    try:
        return ApiResponse.ok(await list_vendors(q, context, limit, status, trust_level, sort_by))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/stats", summary="Get vendor directory KPI stats")
async def vendor_stats(
    context: Optional[str] = Query(None, description="Business context filter e.g. ASSAM_GARDENS"),
):
    try:
        return ApiResponse.ok(await get_vendor_stats(context))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("", summary="Add or update a single vendor")
async def vendor_upsert(payload: dict):
    try:
        return ApiResponse.ok(await upsert_vendor(payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/import", summary="Bulk import vendors from CSV or Excel")
async def vendor_import(
    file: UploadFile = File(...),
    context: Optional[str] = Form(None),
):
    try:
        file_bytes = await file.read()
        return ApiResponse.ok(await import_vendors(file.filename or "vendors.xlsx", file_bytes, context=context))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/search", summary="Search vendor master by name or GSTIN")
async def vendor_search(
    q: str = Query(..., min_length=1, description="Name, GSTIN, or alias fragment"),
    context: Optional[str] = Query(None, description="Business context filter e.g. ASSAM_GARDENS"),
    limit: int = Query(20, ge=1, le=100),
):
    vendors = await search_vendors(q, context, limit)
    return ApiResponse.ok(VendorSearchResponse(
        query=q,
        context=context,
        vendors=[VendorResult(**{
            "gstin": v["gstin"],
            "vendor_name": v["vendor_name"],
            "trust_level": v["trust_level"],
            "status": v["status"],
            "contexts": v["contexts"],
            "aliases": v["aliases"],
        }) for v in vendors],
    ).model_dump())
