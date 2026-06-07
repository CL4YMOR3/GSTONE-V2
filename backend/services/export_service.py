"""
Export Service

Wraps GSTONE workbook_generator to produce the 5-sheet Excel workbook.
Serializes the stored result dict back to DataFrames before calling generator.
"""
import asyncio
import uuid
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, Any

import pandas as pd

from config import EXPORT_DIR, MAX_PIPELINE_WORKERS
import session_store as store

_executor = ThreadPoolExecutor(max_workers=MAX_PIPELINE_WORKERS)


def _restore_certified_result_shape(certification_results: Dict[str, Any]) -> Dict[str, Any]:
    """
    Best-effort compatibility shim for older certified records that stored the
    reduced UI payload instead of the raw GSTONE pipeline result.
    """
    if "clean_invoices" in certification_results or "identity_errors" in certification_results:
        return certification_results

    clean_rows = []
    for row in certification_results.get("clean", []):
        row_copy = dict(row)
        if "garden_name" in row_copy and "_garden_name" not in row_copy:
            row_copy["_garden_name"] = row_copy.pop("garden_name")
        clean_rows.append(row_copy)

    warning_objects = certification_results.get("warnings", [])
    warning_rows = []
    for w in warning_objects:
        orig = w.get("original_row_data")
        if isinstance(orig, dict):
            row_copy = dict(orig)
            if "garden_name" in row_copy and "_garden_name" not in row_copy:
                row_copy["_garden_name"] = row_copy.pop("garden_name")
            warning_rows.append(row_copy)

    error_rows = certification_results.get("errors", [])

    garden_names_set = set()
    
    def _extract_garden(row_dict):
        if not isinstance(row_dict, dict):
            return None
        g = row_dict.get("_garden_name") or row_dict.get("garden_name")
        if not g:
            orig = row_dict.get("original_row_data")
            if isinstance(orig, dict):
                g = orig.get("_garden_name") or orig.get("garden_name")
        return g

    for row in clean_rows:
        g = _extract_garden(row)
        if g: garden_names_set.add(g)

    for w in warning_objects:
        g = _extract_garden(w)
        if g: garden_names_set.add(g)

    for e in error_rows:
        g = _extract_garden(e)
        if g: garden_names_set.add(g)

    garden_names = sorted(list(garden_names_set))

    identity_errors = [row for row in error_rows if row.get("category") != "VALUE_INCONSISTENCY"]
    aggregation_errors = [row for row in error_rows if row.get("category") == "VALUE_INCONSISTENCY"]

    return {
        "summary": certification_results.get("summary", {}),
        "clean_invoices": clean_rows,
        "warning_invoices": warning_rows,
        "warnings": warning_objects,
        "identity_errors": identity_errors,
        "aggregation_errors": aggregation_errors,
        "manual_fixes": certification_results.get("fixes", []),
        "col_map": {
            "invoice_number": "invoice_number",
            "invoice_date": "invoice_date",
            "gstin": "gstin",
            "vendor_name": "vendor_name",
            "taxable_value": "taxable_value",
            "igst_amount": "igst_amount",
            "cgst_amount": "cgst_amount",
            "sgst_amount": "sgst_amount",
            "total_invoice_value": "total_invoice_value",
        },
        "garden_stats": {},
        "vendor_breakdown": {},
        "source_files": certification_results.get("source_files", []),
        "garden_names": garden_names,
    }


def _generate_workbook_sync(result: Dict[str, Any], run_id: str, output_path: str) -> int:
    """
    Re-hydrate DataFrames from serialized result and call the GSTONE workbook generator.
    Returns file size in bytes.
    """
    from core.export.workbook_generator import generate_validation_workbook

    class MockWarning:
        def __init__(self, d):
            self.invoice_key = d.get("invoice_key", "")
            self.warning_type = d.get("warning_type", "")
            self.warning_message = d.get("warning_message", "")
            self.field = d.get("field", "")
            self.value = d.get("value", "")
            self.row_index = d.get("row_index", -1)

    class MockError:
        def __init__(self, d):
            self.category = d.get("category", "")
            self.original_row_data = d.get("original_row_data", {})
            self.affected_rows = d.get("affected_rows", [])
            self.original_row_index = d.get("original_row_index", -1)
            self.error_type = d.get("error_type", "")
            self.error_message = d.get("error_message", "")
            self.value = d.get("value", "")
            self.field = d.get("field", "")
            self.suggestion_payload = d.get("suggestion", {})

    # Re-hydrate DataFrames
    clean_df = pd.DataFrame(result.get("clean_invoices", []))
    warning_df = pd.DataFrame(result.get("warning_invoices", []))
    col_map = result.get("col_map", {})
    summary = result.get("summary", {})
    garden_stats = result.get("garden_stats", {})
    vendor_breakdown = result.get("vendor_breakdown", {})
    manual_fixes = result.get("manual_fixes", [])

    # Build the results dict in GSTONE's expected format
    gstone_results = {
        "clean_invoices": clean_df,
        "warning_invoices": warning_df,
        "identity_errors": [MockError(e) for e in result.get("identity_errors", [])],
        "aggregation_errors": [MockError(e) for e in result.get("aggregation_errors", [])],
        "warnings": [MockWarning(w) for w in result.get("warnings", [])],
        "column_map": col_map,
        "summary": summary,
        "garden_stats": garden_stats,
        "vendor_breakdown": vendor_breakdown,
        "manual_fixes": manual_fixes,
        "source_files": result.get("source_files", []),
        "garden_names": result.get("garden_names", []),
    }

    generate_validation_workbook(gstone_results, output_path)
    return os.path.getsize(output_path)


async def generate_export(run_id: str) -> store.ExportRecord:
    """Generate a workbook for a completed run and register it in the export store."""
    run = store.get_run(run_id)
    result_payload = None
    certification = None

    if run:
        if run.status != "complete" and run.status != "approved":
            raise ValueError(f"Run '{run_id}' is not complete (status: {run.status})")
        result_payload = run.result
    else:
        certification = store.get_certified_by_run_id(run_id)
        if not certification:
            raise ValueError(f"Run '{run_id}' not found")
        result_payload = _restore_certified_result_shape(certification.results)
        result_payload["summary"] = certification.summary
        result_payload["manual_fixes"] = certification.fixes

    export_id = f"EXP_{uuid.uuid4().hex[:8].upper()}"
    file_name = f"gst_validation_{run_id}_{export_id}.xlsx"
    file_path = str(EXPORT_DIR / file_name)

    loop = asyncio.get_event_loop()
    file_size = await loop.run_in_executor(
        _executor, _generate_workbook_sync, result_payload, run_id, file_path
    )

    record = store.ExportRecord(
        export_id=export_id,
        run_id=run_id,
        file_path=file_path,
        file_name=file_name,
        certification_id=certification.certification_id if certification else None,
    )
    store.exports[export_id] = record
    return record, file_size
