"""
Vendor Router — GET /api/v1/vendors/search
"""
from fastapi import APIRouter, Query
from typing import Optional

from models.responses import ApiResponse, VendorResult, VendorSearchResponse
from services.vendor_service import search_vendors

router = APIRouter(prefix="/vendors", tags=["Vendor"])


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
        vendors=[VendorResult(**v) for v in vendors],
    ).model_dump())
