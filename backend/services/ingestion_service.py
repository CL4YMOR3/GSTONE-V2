"""
Ingestion Service

Wraps GSTONE core/ingestion/* and core/mapping/* for the API layer.
No modifications to GSTONE source code.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Tuple, List, Optional, Dict

from config import UPLOAD_DIR, MAX_PIPELINE_WORKERS

_executor = ThreadPoolExecutor(max_workers=MAX_PIPELINE_WORKERS)


def _read_excel_sync(file_path: str, sheet_name: Optional[str] = None, header_row: int = 0):
    """Synchronous wrapper around GSTONE file reader."""
    from core.ingestion.file_reader import read_excel_file
    return read_excel_file(file_path, sheet_name, header_row)


def _detect_header_sync(df, col_names: List[str]) -> Tuple[int, List[str]]:
    """Run header detection heuristics on a DataFrame."""
    from core.ingestion.header_detector import detect_header_row
    return detect_header_row(df, col_names)


def _run_synonym_matcher_sync(columns: List[str]) -> List[dict]:
    """Run synonym matcher on detected columns. Returns suggestion dicts."""
    from core.mapping.synonym_matcher import SynonymMatcher

    matcher = SynonymMatcher()
    suggestions = []
    for i, col in enumerate(columns):
        match = matcher.match_column(col, i)
        suggestions.append({
            "excel_column": col,
            "business_field": match.business_field if match else None,
            "confidence": round(match.confidence, 3) if match else 0.0,
            "match_reason": match.match_reason if match else "none",
            "needs_review": (match.confidence < 0.8) if match else True,
        })
    return suggestions


async def read_excel_sheets(file_path: str) -> List[str]:
    """Return sheet names from an Excel file."""
    import openpyxl, xlrd
    loop = asyncio.get_event_loop()

    def _get_sheets():
        p = Path(file_path)
        if p.suffix.lower() == ".xlsx":
            wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
            names = wb.sheetnames
            wb.close()
            return names
        elif p.suffix.lower() == ".xls":
            wb = xlrd.open_workbook(file_path)
            return wb.sheet_names()
        return []

    return await loop.run_in_executor(_executor, _get_sheets)


async def detect_columns(file_id: str, file_path: str, sheet_name: str) -> dict:
    """
    Run header detection + synonym matching on a sheet.
    Returns suggestions, unmapped columns, and detected column list.
    """
    loop = asyncio.get_event_loop()

    # Step 1: read the sheet (sync, in thread)
    read_result = await loop.run_in_executor(
        _executor, _read_excel_sync, file_path, sheet_name
    )

    if not read_result.success:
        raise RuntimeError(f"File read failed: {read_result.error_message}")

    df = read_result.dataframe
    detected_columns = list(df.columns)

    # Step 2: synonym matching (sync, in thread)
    suggestions = await loop.run_in_executor(
        _executor, _run_synonym_matcher_sync, detected_columns
    )

    # Separate mapped vs unmapped
    unmapped = [s["excel_column"] for s in suggestions if s["business_field"] is None]

    return {
        "detected_columns": detected_columns,
        "suggestions": suggestions,
        "unmapped": unmapped,
    }


async def load_dataframe(file_path: str, sheet_name: str, header_row: int = 0):
    """Load a DataFrame from an Excel file (used by pipeline service)."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(_executor, _read_excel_sync, file_path, sheet_name, header_row)
    if not result.success:
        raise RuntimeError(f"Could not read file: {result.error_message}")
    return result.dataframe
