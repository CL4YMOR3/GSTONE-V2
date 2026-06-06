"""
Mapping Router — POST /api/v1/mapping/detect, POST /api/v1/mapping/confirm
"""
from fastapi import APIRouter, HTTPException
from models.requests import MappingDetectRequest, MappingConfirmRequest
from models.responses import ApiResponse, MappingDetectResponse, MappingConfirmResponse, MappingSuggestion
import session_store as store
from services.ingestion_service import detect_columns

router = APIRouter(prefix="/mapping", tags=["Mapping"])

# Fields required for pipeline to run
CRITICAL_FIELDS = {"gstin", "invoice_number", "invoice_date"}


@router.post("/detect", summary="Auto-detect headers and get synonym suggestions")
async def detect_mapping(request: MappingDetectRequest):
    upload = store.get_upload(request.file_id)
    if not upload:
        raise HTTPException(status_code=404, detail=f"file_id '{request.file_id}' not found")

    try:
        result = await detect_columns(request.file_id, upload.file_path, request.sheet_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    suggestions = [MappingSuggestion(**s) for s in result["suggestions"]]
    response = MappingDetectResponse(
        detected_columns=result["detected_columns"],
        suggestions=suggestions,
        unmapped=result["unmapped"],
    )
    return ApiResponse.ok(response.model_dump())


@router.post("/confirm", summary="Confirm column mappings")
async def confirm_mapping(request: MappingConfirmRequest):
    col_map = {m.business_field: m.excel_column for m in request.mappings}

    # Check for missing critical fields
    missing_critical = [f for f in CRITICAL_FIELDS if f not in col_map]

    response = MappingConfirmResponse(
        col_map=col_map,
        mapped_fields=list(col_map.keys()),
        missing_critical=missing_critical,
    )
    return ApiResponse.ok(response.model_dump())
