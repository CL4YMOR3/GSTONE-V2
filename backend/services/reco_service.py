"""
Reco Service

Wraps GSTONE reco_2b/ingestion_pipeline.py + reco_2b/matcher.py.
Converts serialized clean invoices back to BooksInvoice format for matching.
"""
import asyncio
import hashlib
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, Any, List, Optional

from config import RECO_STORAGE_DIR, EXPORT_DIR, MAX_PIPELINE_WORKERS
import session_store as store

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


def _get_resolution_stat(stats: Any, preferred: str, fallback: str) -> int:
    value = getattr(stats, preferred, None)
    if value is None:
        value = getattr(stats, fallback, 0)
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


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


def _load_books_invoices_for_run(parent_run_id: str, run) -> List[Any]:
    if run and run.handoff_workbook_path:
        from core.reco_2b.exported_book_ingestor import ExportedBookIngestor
        ingested = ExportedBookIngestor.ingest_workbook(run.handoff_workbook_path)
        invoices = ingested.get("invoices", [])
        if invoices:
            return invoices

    approved_export = store.get_latest_export_for_run(parent_run_id, approved_only=True)
    if approved_export:
        from core.reco_2b.exported_book_ingestor import ExportedBookIngestor
        ingested = ExportedBookIngestor.ingest_workbook(approved_export.file_path)
        invoices = ingested.get("invoices", [])
        if invoices:
            return invoices

    clean_invoices = run.result.get("clean_invoices", []) if run and run.result else []
    col_map = run.result.get("col_map", run.col_map or {}) if run and run.result else (run.col_map if run else {})
    return _deserialize_books_invoices(clean_invoices, col_map)


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
            stats = result.canonical_result.stats
            aggregated_stats["duplicate_count"] += _get_resolution_stat(
                stats,
                "duplicate_count",
                "duplicates_found",
            )
            aggregated_stats["amendment_count"] += _get_resolution_stat(
                stats,
                "amendment_count",
                "amendments_resolved",
            )

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
    books_invoices: List[Any],
    canonical_invoices: List[Dict[str, Any]],
    parent_run_id: str,
    reco_id: str,
) -> Dict[str, Any]:
    """Run reconciliation matcher and return serialized results."""
    from core.reco_2b.matcher import ReconciliationMatcher

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
    books_by_id = {invoice.get_identity_key_string(): invoice for invoice in books_invoices}
    canonical_by_id = {invoice.get_identity_key_string(): invoice for invoice in canonical_objs}
    results = []
    for mr in match_output.match_results:
        books_invoice = books_by_id.get(mr.books_invoice_id)
        canonical_invoice = canonical_by_id.get(mr.matched_2b_invoice_id or "")
        results.append({
            "books_invoice_id": mr.books_invoice_id,
            "match_status": mr.match_status.value if hasattr(mr.match_status, "value") else str(mr.match_status),
            "match_method": mr.match_method.value if hasattr(mr.match_method, "value") else str(mr.match_method),
            "matched_2b_invoice_id": mr.matched_2b_invoice_id,
            "books_supplier_gstin": getattr(books_invoice, "supplier_gstin", None),
            "books_supplier_name": getattr(books_invoice, "supplier_name", None),
            "books_invoice_number": getattr(books_invoice, "invoice_number", None),
            "books_invoice_date": books_invoice.invoice_date.isoformat() if books_invoice and books_invoice.invoice_date else None,
            "books_taxable_value": float(books_invoice.taxable_value) if books_invoice else None,
            "books_total_gst": float(books_invoice.total_gst_amount) if books_invoice else None,
            "books_invoice_value": float(books_invoice.invoice_value) if books_invoice else None,
            "canonical_supplier_gstin": getattr(canonical_invoice, "supplier_gstin", None),
            "canonical_supplier_name": getattr(canonical_invoice, "supplier_legal_name", None),
            "canonical_invoice_number": getattr(canonical_invoice, "invoice_number", None),
            "canonical_invoice_date": canonical_invoice.invoice_date.isoformat() if canonical_invoice and canonical_invoice.invoice_date else None,
            "canonical_taxable_value": float(canonical_invoice.taxable_value) if canonical_invoice else None,
            "canonical_total_gst": float(canonical_invoice.total_gst_amount) if canonical_invoice else None,
            "canonical_invoice_value": float(canonical_invoice.invoice_value) if canonical_invoice else None,
            "candidate_count": getattr(mr, "candidate_count", 0),
            "value_deltas": [
                {"field": d.field_name, "books_value": float(d.books_value), "reco_value": float(d.canonical_2b_value), "delta": float(d.delta), "within_tolerance": d.within_tolerance}
                for d in (mr.value_deltas or [])
            ],
            "mismatch_reasons": getattr(mr, "mismatch_reasons", []),
        })

    return {
        "parent_run_id": match_output.parent_run_id,
        "child_run_id": match_output.child_run_id,
        "created_at": match_output.created_at,
        "canonical_2b_hash": match_output.canonical_2b_hash,
        "output_hash": match_output.output_hash,
        "match_results": results,
        "unmatched_2b": match_output.unmatched_2b_invoices,
        "total_books": match_output.total_books_invoices,
        "total_2b": match_output.total_2b_invoices,
    }


def _compute_output_hash(records: List[Any], canonical_hash: str, unmatched_2b: List[str]) -> str:
    content = json.dumps(
        {
            "canonical_2b_hash": canonical_hash,
            "results": sorted([record.to_dict() for record in records], key=lambda row: row.get("source_books_ref", "")),
            "unmatched_2b": sorted(unmatched_2b),
        },
        sort_keys=True,
    )
    return hashlib.sha256(content.encode()).hexdigest()


def _build_reconciliation_records(
    reco,
    books_invoices: List[Any],
    canonical_objs: List[Any],
):
    from core.reco_2b.matching_models import MatchStatus, ValueDelta
    from core.reco_2b.reconciliation_record import ReconciliationRecord

    books_by_id = {invoice.get_identity_key_string(): invoice for invoice in books_invoices}
    canonical_by_id = {invoice.get_identity_key_string(): invoice for invoice in canonical_objs}

    records = []
    match_payload = reco.match_results or {}
    for row in match_payload.get("match_results", []):
        books_invoice = books_by_id.get(row.get("books_invoice_id"))
        canonical_invoice = canonical_by_id.get(row.get("matched_2b_invoice_id") or "")
        if not books_invoice:
            continue

        value_deltas = [
            ValueDelta(
                field_name=delta.get("field", ""),
                books_value=Decimal(str(delta.get("books_value", 0) or 0)),
                canonical_2b_value=Decimal(str(delta.get("reco_value", 0) or 0)),
                delta=Decimal(str(delta.get("delta", 0) or 0)),
                within_tolerance=bool(delta.get("within_tolerance", False)),
            )
            for delta in (row.get("value_deltas") or [])
        ]

        records.append(
            ReconciliationRecord(
                context=getattr(books_invoice, "context", "") or getattr(canonical_invoice, "filing_period", "") or "",
                parent_run_id=reco.parent_run_id,
                child_run_id=reco.reco_id,
                supplier_gstin=getattr(books_invoice, "supplier_gstin", "") or getattr(canonical_invoice, "supplier_gstin", ""),
                supplier_legal_name=getattr(books_invoice, "supplier_name", None) or getattr(canonical_invoice, "supplier_legal_name", None),
                invoice_number=getattr(books_invoice, "invoice_number", "") or getattr(canonical_invoice, "invoice_number", ""),
                invoice_date=getattr(books_invoice, "invoice_date", None) or getattr(canonical_invoice, "invoice_date", None),
                books_taxable_value=getattr(books_invoice, "taxable_value", None),
                books_igst=getattr(books_invoice, "igst_amount", None),
                books_cgst=getattr(books_invoice, "cgst_amount", None),
                books_sgst=getattr(books_invoice, "sgst_amount", None),
                books_total_gst=getattr(books_invoice, "total_gst_amount", None),
                books_invoice_value=getattr(books_invoice, "invoice_value", None),
                canonical_2b_taxable_value=getattr(canonical_invoice, "taxable_value", None),
                canonical_2b_igst=getattr(canonical_invoice, "igst_amount", None),
                canonical_2b_cgst=getattr(canonical_invoice, "cgst_amount", None),
                canonical_2b_sgst=getattr(canonical_invoice, "sgst_amount", None),
                canonical_2b_total_gst=getattr(canonical_invoice, "total_gst_amount", None),
                canonical_2b_invoice_value=getattr(canonical_invoice, "invoice_value", None),
                match_status=MatchStatus(row.get("match_status", "MATCHED_STRICT")),
                mismatch_reasons=row.get("mismatch_reasons") or [],
                value_deltas=value_deltas,
                source_books_ref=row.get("books_invoice_id") or "",
                source_2b_ref=row.get("matched_2b_invoice_id"),
            )
        )

    for identity_key in match_payload.get("unmatched_2b", []):
        canonical_invoice = canonical_by_id.get(identity_key)
        if not canonical_invoice:
            continue
        records.append(
            ReconciliationRecord(
                context=getattr(canonical_invoice, "filing_period", "") or "",
                parent_run_id=reco.parent_run_id,
                child_run_id=reco.reco_id,
                supplier_gstin=getattr(canonical_invoice, "supplier_gstin", ""),
                supplier_legal_name=getattr(canonical_invoice, "supplier_legal_name", None),
                invoice_number=getattr(canonical_invoice, "invoice_number", ""),
                invoice_date=getattr(canonical_invoice, "invoice_date", None),
                canonical_2b_taxable_value=getattr(canonical_invoice, "taxable_value", None),
                canonical_2b_igst=getattr(canonical_invoice, "igst_amount", None),
                canonical_2b_cgst=getattr(canonical_invoice, "cgst_amount", None),
                canonical_2b_sgst=getattr(canonical_invoice, "sgst_amount", None),
                canonical_2b_total_gst=getattr(canonical_invoice, "total_gst_amount", None),
                canonical_2b_invoice_value=getattr(canonical_invoice, "invoice_value", None),
                match_status=MatchStatus.MISSING_IN_BOOKS,
                source_books_ref=identity_key,
                source_2b_ref=identity_key,
            )
        )

    return records


def _export_reco_results_workbook_sync(reco_id: str) -> str:
    from core.reco_2b.matcher import ReconciliationMatcher
    from core.reco_2b.models import Canonical2BInvoice
    from core.reco_2b.reconciliation_record import ReconciliationReadiness, ReconciliationRunOutput
    from core.reco_2b.workbook_exporter import export_reconciliation_workbook

    reco = store.get_reco(reco_id)
    if not reco:
        raise ValueError(f"reco_id '{reco_id}' not found")
    if reco.status != "complete":
        raise ValueError(f"Cannot export results, reco status is: {reco.status}")

    run = store.get_run(reco.parent_run_id)
    books_invoices = _load_books_invoices_for_run(reco.parent_run_id, run)
    canonical_objs = [Canonical2BInvoice.from_dict(inv) for inv in (reco.canonical_invoices or [])]
    records = _build_reconciliation_records(reco, books_invoices, canonical_objs)

    matcher = ReconciliationMatcher()
    canonical_hash = (reco.match_results or {}).get("canonical_2b_hash") or matcher._compute_canonical_hash(canonical_objs)
    unmatched_2b = (reco.match_results or {}).get("unmatched_2b", [])
    output_hash = (reco.match_results or {}).get("output_hash") or _compute_output_hash(records, canonical_hash, unmatched_2b)

    readiness = ReconciliationReadiness(
        reconciliation_ready=True,
        covered_periods=[reco.declared_period] if reco.declared_period else [],
        covered_gstins=[reco.declared_gstin] if reco.declared_gstin else [],
        canonical_hash=canonical_hash,
        canonical_invoice_count=len(canonical_objs),
    )
    run_output = ReconciliationRunOutput(
        parent_run_id=reco.parent_run_id,
        child_run_id=reco.reco_id,
        created_at=(reco.match_results or {}).get("created_at") or reco.created_at,
        readiness=readiness,
        records=records,
        canonical_2b_hash=canonical_hash,
        output_hash=output_hash,
    )

    output_path = EXPORT_DIR / f"gst_reco_{reco_id}_{uuid.uuid4().hex[:8].upper()}.xlsx"
    export_reconciliation_workbook(run_output, output_path)
    return str(output_path)


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

    return result


async def run_reconciliation(reco_id: str, parent_run_id: str) -> None:
    """Fire-and-forget reconciliation in executor."""
    reco = store.get_reco(reco_id)
    run = store.get_run(parent_run_id)

    if not reco or not run:
        raise ValueError("Reco or run session not found")
    if run.status != "approved":
        raise ValueError(f"Parent run '{parent_run_id}' must be approved before GSTR-2B reconciliation")
    if not run.result and not run.handoff_workbook_path and not store.get_latest_export_for_run(parent_run_id, approved_only=True):
        raise ValueError(f"Parent run '{parent_run_id}' has no books result")

    reco.status = "running"
    books_invoices = _load_books_invoices_for_run(parent_run_id, run)
    canonical_invoices = reco.canonical_invoices

    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        _executor,
        _reco_and_store,
        reco_id, books_invoices, canonical_invoices, parent_run_id,
    )


def _reco_and_store(reco_id, books_invoices, canonical_invoices, parent_run_id):
    try:
        result = _run_reconciliation_sync(books_invoices, canonical_invoices, parent_run_id, reco_id)
        reco = store.get_reco(reco_id)
        if reco:
            reco.match_results = result
            reco.status = "complete"
    except Exception as exc:
        import traceback
        reco = store.get_reco(reco_id)
        if reco:
            reco.status = "failed"
            reco.error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"


async def export_reco_results_workbook(reco_id: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _export_reco_results_workbook_sync, reco_id)
