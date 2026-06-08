"""
Upload Router — POST /api/v1/upload, GET /api/v1/upload/{id}/sheets, DELETE /api/v1/upload/{id}
"""
import uuid
import aiofiles
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List

from config import UPLOAD_DIR
from models.responses import ApiResponse, UploadFileResult, UploadResponse, SheetsResponse
import session_store as store
from services.ingestion_service import read_excel_sheets

router = APIRouter(prefix="/upload", tags=["Upload"])

ALLOWED_EXTENSIONS = {".xlsx", ".xls"}


@router.post("", summary="Upload one or more Excel files")
async def upload_files(files: List[UploadFile] = File(...)):
    results = []

    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File '{file.filename}' has unsupported extension '{ext}'. Allowed: {ALLOWED_EXTENSIONS}"
            )

        file_id = f"FILE_{uuid.uuid4().hex[:10].upper()}"
        dest_path = UPLOAD_DIR / f"{file_id}{ext}"

        # Save to disk asynchronously
        async with aiofiles.open(dest_path, "wb") as out:
            content = await file.read()
            await out.write(content)

        # Read sheet names
        sheets = await read_excel_sheets(str(dest_path))

        # Resolve Garden Info
        from core.ingestion.garden_resolver import resolve_garden_from_filename, load_garden_codes
        try:
            garden_codes_dict = load_garden_codes()
            garden_res = resolve_garden_from_filename(file.filename, garden_codes_dict)
            g_code = garden_res.garden_code
            g_name = garden_res.garden_name
            g_err = garden_res.error
        except Exception as e:
            g_code, g_name, g_err = None, None, f"Resolution error: {str(e)}"

        # 🔒 Garden name must NEVER be empty — workbook relies on it for the Garden column.
        # If the resolver didn't match a known garden code, fall back to the filename stem
        # so users can at least see which source file a row came from.
        if not g_name:
            g_name = Path(file.filename).stem

        # Register in session store
        store.save_upload(store.UploadSession(
            file_id=file_id,
            original_filename=file.filename,
            file_path=str(dest_path),
            sheet_names=sheets,
        ))

        # Quick row count for the first sheet (default)
        row_count = 0
        if sheets:
            try:
                from services.ingestion_service import load_dataframe
                df = await load_dataframe(str(dest_path), sheets[0])
                row_count = len(df.dropna(how='all'))
            except Exception:
                row_count = 0

        results.append(UploadFileResult(
            file_id=file_id,
            original_filename=file.filename,
            size_bytes=len(content),
            garden_code=g_code,
            garden_name=g_name,
            resolution_error=g_err,
            row_count=row_count
        ))

    return ApiResponse.ok(UploadResponse(files=results).model_dump())


@router.get("/{file_id}/sheets", summary="List sheet names in uploaded file")
async def get_sheets(file_id: str):
    upload = store.get_upload(file_id)
    if not upload:
        raise HTTPException(status_code=404, detail=f"file_id '{file_id}' not found")

    return ApiResponse.ok(SheetsResponse(
        file_id=file_id,
        sheets=upload.sheet_names
    ).model_dump())


@router.get("/{file_id}/preview", summary="Get data preview and row count for a sheet")
async def get_file_preview(file_id: str, sheet_name: str, header_row: int = 0, limit: int = 50):
    upload = store.get_upload(file_id)
    if not upload:
        raise HTTPException(status_code=404, detail=f"file_id '{file_id}' not found")
        
    try:
        from services.ingestion_service import load_dataframe
        # INSTITUTIONAL FIX: Normalize 1-indexed UI row to 0-indexed core
        h_index = max(0, header_row - 1)
        df = await load_dataframe(upload.file_path, sheet_name, header_row=h_index)
        
        # Redundant logic removed: load_dataframe with header_row already handles columns.
        df = df.dropna(how='all')
        total_rows = len(df)
        preview_df = df.head(limit)
        
        import numpy as np
        preview_df = preview_df.replace({np.nan: None})
        
        headers = [str(c) for c in preview_df.columns]
        rows = preview_df.to_dict(orient="records")
        
        return ApiResponse.ok({
            "headers": headers,
            "rows": rows,
            "total_rows": total_rows
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{file_id}", summary="Delete a temp upload")
async def delete_upload(file_id: str):
    upload = store.get_upload(file_id)
    if not upload:
        raise HTTPException(status_code=404, detail=f"file_id '{file_id}' not found")

    try:
        Path(upload.file_path).unlink(missing_ok=True)
    except Exception:
        pass

    store.delete_upload(file_id)
    return ApiResponse.ok({"deleted": file_id})

