"""
Reco Service

Wraps GSTONE reco_2b/ingestion_pipeline.py + reco_2b/matcher.py.
Converts serialized clean invoices back to BooksInvoice format for matching.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, Any, List, Optional

from config import RECO_STORAGE_DIR, MAX_PIPELINE_WORKERS
import session_store as store
import database

_executor = ThreadPoolExecutor(max_workers=MAX_PIPELINE_WORKERS)


def _first_non_empty(row: Dict[str, Any], keys: List[str]) -> Any:
    for key in keys:
        if key in row:
            value = row.get(key)
            if value is not None and value != "":
                return value
    return None


def _to_decimal(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def _to_date(value: Any) -> Optional[date]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(str(value), fmt).date()
            except ValueError:
                continue
    return None


def _deserialize_books_invoices(
    clean_invoices: List[Dict[str, Any]],
    col_map: Dict[str, str],
) -> List[Any]:
    from core.reco_2b.matcher import BooksInvoice

    invoice_number_col = col_map.get("invoice_number")
    invoice_date_col = col_map.get("invoice_date")
    gstin_col = col_map.get("gstin")
    vendor_col = col_map.get("vendor_name")
    taxable_col = col_map.get("taxable_value")
    igst_col = col_map.get("igst_amount")
    cgst_col = col_map.get("cgst_amount")
    sgst_col = col_map.get("sgst_amount")
    invoice_value_col = col_map.get("total_invoice_value")

    books_invoices = []
    for row in clean_invoices:
        invoice_number = _first_non_empty(
            row,
            [invoice_number_col, "invoice_number", "Purchase Bill No"],
        )
        invoice_date = _to_date(
            _first_non_empty(
                row,
                [invoice_date_col, "invoice_date", "Purchase Bill Date"],
            )
        )
        supplier_gstin = _first_non_empty(
            row,
            [gstin_col, "gstin", "supplier_gstin", "TIN/GSTIN No."],
        )
        supplier_name = _first_non_empty(
            row,
            [vendor_col, "vendor_name", "supplier_name", "Account"],
        ) or ""
        taxable_value = _to_decimal(
            _first_non_empty(
                row,
                [taxable_col, "taxable_value", "Taxable Amount"],
            )
        )
        igst_amount = _to_decimal(
            _first_non_empty(
                row,
                [igst_col, "igst_amount", "IGST Amount"],
            )
        )
        cgst_amount = _to_decimal(
            _first_non_empty(
                row,
                [cgst_col, "cgst_amount", "CGST Amount"],
            )
        )
        sgst_amount = _to_decimal(
            _first_non_empty(
                row,
                [sgst_col, "sgst_amount", "SGST Amount"],
            )
        )
        invoice_value = _to_decimal(
            _first_non_empty(
                row,
                [invoice_value_col, "total_invoice_value", "invoice_value", "Bill Amount"],
            )
        )
        context = _first_non_empty(
            row,
            ["_garden_name", "garden_name", "garden", "Garden", "context"],
        ) or ""

        books_invoices.append(
            BooksInvoice(
                supplier_gstin=str(supplier_gstin or "").strip().upper(),
                invoice_number=str(invoice_number or "").strip(),
                invoice_date=invoice_date,
                taxable_value=taxable_value,
                igst_amount=igst_amount,
                cgst_amount=cgst_amount,
                sgst_amount=sgst_amount,
                total_gst_amount=igst_amount + cgst_amount + sgst_amount,
                invoice_value=invoice_value,
                supplier_name=str(supplier_name).strip(),
                context=str(context).strip(),
            )
        )

    return books_invoices


def _ingest_2b_files_sync(
    file_paths: List[str],
    declared_gstin: str,
    declared_period: str,
) -> Dict[str, Any]:
    """Run 2B ingestion pipeline for multiple files and return aggregated canonical invoices + stats."""
    from core.reco_2b.ingestion_pipeline import IngestionPipeline

    pipeline = IngestionPipeline(storage_root=RECO_STORAGE_DIR)
    
    all_canonical_invoices = []
    aggregated_stats = {
        "invoice_count": 0,
        "duplicate_count": 0,
        "amendment_count": 0,
        "total_taxable_value": 0.0,
        "total_gst": 0.0,
    }
    all_metadata = []
    seen_identity_keys = set()
    
    for file_path in file_paths:
        result = pipeline.ingest(
            file_path=Path(file_path),
            declared_gstin=declared_gstin,
            declared_period=declared_period,
            store_raw=True,
        )

        if not result.success:
            errors = [str(e) for e in result.adapter_result.errors]
            raise RuntimeError(f"2B ingestion failed for {file_path}: {'; '.join(errors)}")

        all_metadata.append(result.upload_metadata.to_dict())
        
        aggregated_stats["invoice_count"] += result.invoice_count
        if hasattr(result.canonical_result, "stats"):
            aggregated_stats["duplicate_count"] += result.canonical_result.stats.duplicate_count
            aggregated_stats["amendment_count"] += result.canonical_result.stats.amendment_count

        for inv_obj in result.canonical_result.canonical_invoices:
            inv_dict = inv_obj.to_dict()
            ident_key = inv_obj.get_identity_key_string()
            
            if ident_key not in seen_identity_keys:
                seen_identity_keys.add(ident_key)
                all_canonical_invoices.append(inv_dict)
                aggregated_stats["total_taxable_value"] += float(Decimal(str(inv_dict.get("taxable_value", 0))))
                aggregated_stats["total_gst"] += float(Decimal(str(inv_dict.get("total_gst_amount", 0))))
            else:
                aggregated_stats["duplicate_count"] += 1

    return {
        "canonical_invoices": all_canonical_invoices,
        "stats": aggregated_stats,
        "upload_metadata_list": all_metadata,
    }


def _run_reconciliation_sync(
    clean_invoices: List[Dict[str, Any]],
    col_map: Dict[str, str],
    canonical_invoices: List[Dict[str, Any]],
    parent_run_id: str,
    reco_id: str,
) -> Dict[str, Any]:
    """Run reconciliation matcher and return serialized results."""
    from core.reco_2b.matcher import ReconciliationMatcher

    books_invoices = _deserialize_books_invoices(clean_invoices, col_map)

    # Reconstruct canonical 2B invoices
    from core.reco_2b.models import Canonical2BInvoice
    canonical_objs = [Canonical2BInvoice.from_dict(inv) for inv in canonical_invoices]

    # Run matcher
    matcher = ReconciliationMatcher()
    match_output = matcher.reconcile(
        books_invoices=books_invoices, 
        canonical_2b_invoices=canonical_objs,
        parent_run_id=parent_run_id,
        child_run_id=reco_id
    )

    # Serialize
    results = []
    for mr in match_output.match_results:
        results.append({
            "books_invoice_id": mr.books_invoice_id,
            "match_status": mr.match_status.value if hasattr(mr.match_status, "value") else str(mr.match_status),
            "match_method": mr.match_method.value if hasattr(mr.match_method, "value") else str(mr.match_method),
            "matched_2b_invoice_id": mr.matched_2b_invoice_id,
            "value_deltas": [
                {"field": d.field_name, "books_value": float(d.books_value), "reco_value": float(d.canonical_2b_value), "delta": float(d.delta), "within_tolerance": d.within_tolerance}
                for d in (mr.value_deltas or [])
            ],
            "mismatch_reasons": getattr(mr, "mismatch_reasons", []),
        })

    return {
        "match_results": results,
        "unmatched_2b": match_output.unmatched_2b_invoices,
        "total_books": match_output.total_books_invoices,
        "total_2b": match_output.total_2b_invoices,
    }


# ─── Public async API ─────────────────────────────────────────────────────────

async def ingest_2b_files(
    reco_id: str,
    file_paths: List[str],
    declared_gstin: str,
    declared_period: str,
) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        _executor, _ingest_2b_files_sync, file_paths, declared_gstin, declared_period
    )

    # Update reco session
    reco = store.get_reco(reco_id)
    if reco:
        reco.canonical_invoices.extend(result["canonical_invoices"])
        
        if not reco.canonical_stats:
            reco.canonical_stats = result["stats"]
        else:
            reco.canonical_stats["invoice_count"] += result["stats"]["invoice_count"]
            reco.canonical_stats["duplicate_count"] += result["stats"]["duplicate_count"]
            reco.canonical_stats["amendment_count"] += result["stats"]["amendment_count"]
            reco.canonical_stats["total_taxable_value"] += result["stats"]["total_taxable_value"]
            reco.canonical_stats["total_gst"] += result["stats"]["total_gst"]
            
        if not hasattr(reco, "upload_metadata_list"):
            reco.upload_metadata_list = []
        reco.upload_metadata_list.extend(result["upload_metadata_list"])
        
        reco.status = "ready"
        parent = store.get_run(reco.parent_run_id)
        database.upsert_reco_run(
            reco_id=reco_id,
            parent_run_id=reco.parent_run_id,
            entity_id=parent.entity_id if parent else None,
            period=parent.period if parent else None,
            declared_gstin=declared_gstin,
            status="ready",
            canonical={
                "stats": reco.canonical_stats,
                "invoices": reco.canonical_invoices,
            },
            results=None,
            created_at=reco.created_at,
        )

    return result


async def run_reconciliation(reco_id: str, parent_run_id: str) -> None:
    """Fire-and-forget reconciliation in executor."""
    reco = store.get_reco(reco_id)
    run = store.get_run(parent_run_id)

    if not reco or not run:
        raise ValueError("Reco or run session not found")
    if run.status != "complete" or not run.result:
        raise ValueError(f"Parent run '{parent_run_id}' is not complete")

    reco.status = "running"
    clean_invoices = run.result.get("clean_invoices", [])
    col_map = run.result.get("col_map", run.col_map or {})
    canonical_invoices = reco.canonical_invoices

    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        _executor,
        _reco_and_store,
        reco_id, clean_invoices, col_map, canonical_invoices, parent_run_id,
    )


def _reco_and_store(reco_id, clean_invoices, col_map, canonical_invoices, parent_run_id):
    try:
        result = _run_reconciliation_sync(clean_invoices, col_map, canonical_invoices, parent_run_id, reco_id)
        reco = store.get_reco(reco_id)
        if reco:
            reco.match_results = result
            reco.status = "complete"
            parent = store.get_run(reco.parent_run_id)
            database.upsert_reco_run(
                reco_id=reco_id,
                parent_run_id=reco.parent_run_id,
                entity_id=parent.entity_id if parent else None,
                period=parent.period if parent else None,
                declared_gstin=reco.declared_gstin,
                status="complete",
                canonical={
                    "stats": reco.canonical_stats,
                    "invoices": reco.canonical_invoices,
                },
                results=result,
                created_at=reco.created_at,
            )
    except Exception as exc:
        import traceback
        reco = store.get_reco(reco_id)
        if reco:
            reco.status = "failed"
            reco.error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
            parent = store.get_run(reco.parent_run_id)
            database.upsert_reco_run(
                reco_id=reco_id,
                parent_run_id=reco.parent_run_id,
                entity_id=parent.entity_id if parent else None,
                period=parent.period if parent else None,
                declared_gstin=reco.declared_gstin,
                status="failed",
                canonical={
                    "stats": reco.canonical_stats,
                    "invoices": reco.canonical_invoices,
                },
                results={"error": reco.error},
                created_at=reco.created_at,
            )
