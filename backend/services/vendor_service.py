"""
Vendor Service

Wraps GSTONE vendor master loading and saving so the web app can expose a
directory, KPI stats, and controlled add/import flows.
"""
import asyncio
import io
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from config import MAX_PIPELINE_WORKERS

_executor = ThreadPoolExecutor(max_workers=MAX_PIPELINE_WORKERS)
_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$")


def _normalize_name(name: str) -> str:
    return " ".join((name or "").strip().upper().split())


def _normalize_gstin(gstin: str) -> str:
    return (gstin or "").strip().upper()


def _load_vendor_modules():
    from core.vendor_master.models import TrustLevel, UsageStats, VendorEntry, VendorSource, VendorStatus
    from core.vendor_master.vendor_master_loader import load_vendor_master, save_vendor_master

    return {
        "TrustLevel": TrustLevel,
        "UsageStats": UsageStats,
        "VendorEntry": VendorEntry,
        "VendorSource": VendorSource,
        "VendorStatus": VendorStatus,
        "load_vendor_master": load_vendor_master,
        "save_vendor_master": save_vendor_master,
    }


def _serialize_vendor(entry: Any) -> Dict[str, Any]:
    usage_stats = entry.usage_stats
    return {
        "gstin": entry.gstin,
        "vendor_name": entry.vendor_name,
        "normalized_name": entry.normalized_name,
        "legal_name": entry.legal_name,
        "trade_name": entry.trade_name,
        "state_code": entry.state_code,
        "state_name": entry.state_name,
        "contexts": entry.contexts or [],
        "trust_level": entry.trust_level.value if hasattr(entry.trust_level, "value") else str(entry.trust_level),
        "status": entry.status.value if hasattr(entry.status, "value") else str(entry.status),
        "confidence_score": entry.confidence_score or 0,
        "aliases": entry.aliases or [],
        "notes": entry.notes,
        "invoice_count": usage_stats.invoice_count if usage_stats else 0,
        "first_seen": usage_stats.first_seen.isoformat() if usage_stats and usage_stats.first_seen else None,
        "last_seen": usage_stats.last_seen.isoformat() if usage_stats and usage_stats.last_seen else None,
        "gardens_seen": usage_stats.gardens_seen if usage_stats else [],
        "source_count": len(entry.sources or []),
    }


def _list_vendors_sync(
    query: Optional[str],
    context: Optional[str],
    limit: int,
    status: Optional[str],
    trust_level: Optional[str],
    sort_by: str,
) -> Dict[str, Any]:
    modules = _load_vendor_modules()
    all_vendors = modules["load_vendor_master"]()
    q_lower = (query or "").strip().lower()
    status_upper = (status or "").strip().upper()
    trust_upper = (trust_level or "").strip().upper()

    rows = []
    for entry in all_vendors:
        serialized = _serialize_vendor(entry)
        context_ok = (not context) or (not entry.contexts) or (context in (entry.contexts or []))
        status_ok = (not status_upper) or serialized["status"] == status_upper
        trust_ok = (not trust_upper) or serialized["trust_level"] == trust_upper
        query_ok = (
            not q_lower
            or q_lower in serialized["gstin"].lower()
            or q_lower in (serialized["vendor_name"] or "").lower()
            or q_lower in (serialized["legal_name"] or "").lower()
            or q_lower in (serialized["trade_name"] or "").lower()
            or any(q_lower in alias.lower() for alias in (serialized["aliases"] or []))
        )

        if context_ok and status_ok and trust_ok and query_ok:
            rows.append(serialized)

    if sort_by == "vendor_name":
        rows.sort(key=lambda item: ((item["vendor_name"] or "").lower(), item["gstin"]))
    elif sort_by == "invoice_count":
        rows.sort(key=lambda item: (-int(item["invoice_count"] or 0), (item["vendor_name"] or "").lower()))
    elif sort_by == "last_seen":
        rows.sort(key=lambda item: (item["last_seen"] or "", item["vendor_name"] or ""), reverse=True)
    elif sort_by == "trust_level":
        order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        rows.sort(key=lambda item: (order.get(item["trust_level"], 9), (item["vendor_name"] or "").lower()))
    else:
        rows.sort(key=lambda item: ((item["vendor_name"] or "").lower(), item["gstin"]))

    return {"total": len(rows), "vendors": rows[:limit] if limit else rows}


def _search_vendors_sync(query: str, context: Optional[str], limit: int) -> List[Dict[str, Any]]:
    payload = _list_vendors_sync(query, context, limit, None, None, "vendor_name")
    return payload["vendors"]


def _vendor_stats_sync(context: Optional[str]) -> Dict[str, Any]:
    modules = _load_vendor_modules()
    all_vendors = modules["load_vendor_master"]()
    if context:
        all_vendors = [entry for entry in all_vendors if not entry.contexts or context in (entry.contexts or [])]

    trust_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    status_counts = {"ACTIVE": 0, "CANCELLED": 0, "SUSPENDED": 0, "UNKNOWN": 0}
    total_aliases = 0
    total_confidence = 0
    active_count = 0
    contexts = set()

    for entry in all_vendors:
        serialized = _serialize_vendor(entry)
        trust_counts[serialized["trust_level"]] = trust_counts.get(serialized["trust_level"], 0) + 1
        status_counts[serialized["status"]] = status_counts.get(serialized["status"], 0) + 1
        total_aliases += len(serialized["aliases"])
        total_confidence += int(serialized["confidence_score"] or 0)
        if serialized["status"] == "ACTIVE":
            active_count += 1
        contexts.update(serialized["contexts"] or [])

    total = len(all_vendors)
    return {
        "total_vendors": total,
        "active_vendors": active_count,
        "inactive_vendors": total - active_count,
        "high_trust_vendors": trust_counts.get("HIGH", 0),
        "medium_trust_vendors": trust_counts.get("MEDIUM", 0),
        "low_trust_vendors": trust_counts.get("LOW", 0),
        "total_aliases": total_aliases,
        "average_confidence": round(total_confidence / total, 1) if total else 0,
        "contexts_covered": len(contexts),
        "by_trust_level": trust_counts,
        "by_status": status_counts,
    }


def _upsert_vendor_sync(
    payload: Dict[str, Any],
    changed_by: str,
    change_reason: str,
) -> Dict[str, Any]:
    modules = _load_vendor_modules()
    VendorEntry = modules["VendorEntry"]
    VendorSource = modules["VendorSource"]
    VendorStatus = modules["VendorStatus"]
    TrustLevel = modules["TrustLevel"]
    UsageStats = modules["UsageStats"]
    load_vendor_master = modules["load_vendor_master"]
    save_vendor_master = modules["save_vendor_master"]

    gstin = _normalize_gstin(payload.get("gstin"))
    vendor_name = (payload.get("vendor_name") or "").strip()
    if not gstin or not _GSTIN_RE.match(gstin):
        raise ValueError("Vendor GSTIN must be a valid 15-character GSTIN")
    if not vendor_name:
        raise ValueError("Vendor name is required")

    vendors = load_vendor_master(force_reload=True)
    existing = next((vendor for vendor in vendors if vendor.gstin.upper() == gstin), None)
    alias_values = payload.get("aliases") or []
    aliases = sorted({_normalize_name(alias) for alias in alias_values if str(alias).strip()})
    contexts = sorted({ctx for ctx in (payload.get("contexts") or []) if str(ctx).strip()})
    notes = (payload.get("notes") or "").strip() or None
    source = VendorSource(
        type=payload.get("source_type") or "USER_ENTRY",
        reference=payload.get("reference") or "WEB_DIRECTORY",
        verified_by=changed_by,
        verified_on=date.today(),
    )

    if existing:
        existing.vendor_name = vendor_name
        existing.normalized_name = _normalize_name(payload.get("normalized_name") or vendor_name)
        existing.legal_name = (payload.get("legal_name") or "").strip() or existing.legal_name
        existing.trade_name = (payload.get("trade_name") or "").strip() or existing.trade_name
        existing.state_code = gstin[:2]
        existing.status = VendorStatus.from_string(payload.get("status") or existing.status.value)
        existing.trust_level = TrustLevel.from_string(payload.get("trust_level") or existing.trust_level.value)
        existing.confidence_score = int(payload.get("confidence_score") or existing.confidence_score or 0)
        existing.contexts = sorted(set((existing.contexts or []) + contexts))
        existing.aliases = sorted(set((existing.aliases or []) + aliases))
        existing.notes = notes or existing.notes
        if existing.usage_stats is None:
            existing.usage_stats = UsageStats()
        if payload.get("invoice_count") is not None:
            existing.usage_stats.invoice_count = int(payload.get("invoice_count") or 0)
        if payload.get("gardens_seen"):
            existing.usage_stats.gardens_seen = sorted(set((existing.usage_stats.gardens_seen or []) + list(payload.get("gardens_seen") or [])))
        existing.sources.append(source)
        action = "updated"
    else:
        vendor = VendorEntry(
            gstin=gstin,
            vendor_name=vendor_name,
            normalized_name=_normalize_name(payload.get("normalized_name") or vendor_name),
            aliases=aliases,
            legal_name=(payload.get("legal_name") or "").strip() or None,
            trade_name=(payload.get("trade_name") or "").strip() or None,
            state_code=gstin[:2],
            contexts=contexts,
            trust_level=TrustLevel.from_string(payload.get("trust_level") or "LOW"),
            status=VendorStatus.from_string(payload.get("status") or "ACTIVE"),
            confidence_score=int(payload.get("confidence_score") or 0),
            usage_stats=UsageStats(
                invoice_count=int(payload.get("invoice_count") or 0),
                gardens_seen=sorted({garden for garden in (payload.get("gardens_seen") or []) if str(garden).strip()}),
            ),
            sources=[source],
            notes=notes,
        )
        vendors.append(vendor)
        action = "created"

    vendors.sort(key=lambda item: (item.vendor_name or "").upper())
    if not save_vendor_master(vendors, changed_by=changed_by, change_reason=change_reason):
        raise RuntimeError("Failed to save vendor master")

    updated_vendor = next(vendor for vendor in modules["load_vendor_master"](force_reload=True) if vendor.gstin.upper() == gstin)
    return {"action": action, "vendor": _serialize_vendor(updated_vendor)}


def _extract_column(row: Dict[str, Any], candidates: List[str]) -> Any:
    lowered = {str(key).strip().lower(): value for key, value in row.items()}
    for candidate in candidates:
        if candidate in lowered and lowered[candidate] not in (None, ""):
            return lowered[candidate]
    return None


def _parse_vendor_frame(frame: pd.DataFrame, context: Optional[str]) -> Tuple[List[Dict[str, Any]], List[str]]:
    records: List[Dict[str, Any]] = []
    errors: List[str] = []
    rows = frame.fillna("").to_dict(orient="records")
    for row_number, raw_row in enumerate(rows, start=2):
        gstin = _normalize_gstin(str(_extract_column(raw_row, ["gstin", "supplier gstin", "vendor gstin", "gst no", "gstin/u in"] ) or ""))
        vendor_name = str(_extract_column(raw_row, ["vendor_name", "vendor name", "supplier name", "name", "party name"]) or "").strip()
        if not gstin and not vendor_name:
            continue
        if not _GSTIN_RE.match(gstin):
            errors.append(f"Row {row_number}: invalid GSTIN '{gstin or 'blank'}'")
            continue
        if not vendor_name:
            errors.append(f"Row {row_number}: vendor name is required")
            continue
        aliases_value = _extract_column(raw_row, ["aliases", "alias", "alternate names"])
        aliases = [item.strip() for item in str(aliases_value or "").split(",") if item.strip()]
        gardens = [item.strip() for item in str(_extract_column(raw_row, ["gardens_seen", "gardens", "gardens seen"]) or "").split(",") if item.strip()]
        records.append(
            {
                "gstin": gstin,
                "vendor_name": vendor_name,
                "legal_name": str(_extract_column(raw_row, ["legal_name", "legal name"]) or "").strip() or None,
                "trade_name": str(_extract_column(raw_row, ["trade_name", "trade name"]) or "").strip() or None,
                "status": str(_extract_column(raw_row, ["status", "registration status"]) or "ACTIVE").strip().upper(),
                "trust_level": str(_extract_column(raw_row, ["trust_level", "trust level"]) or "LOW").strip().upper(),
                "confidence_score": int(float(_extract_column(raw_row, ["confidence_score", "confidence score"]) or 0)),
                "invoice_count": int(float(_extract_column(raw_row, ["invoice_count", "invoice count"]) or 0)),
                "aliases": aliases,
                "contexts": [context] if context else [],
                "gardens_seen": gardens,
                "source_type": "BULK_IMPORT",
                "reference": "VENDOR_DIRECTORY_IMPORT",
                "notes": str(_extract_column(raw_row, ["notes", "remark", "remarks"]) or "").strip() or None,
            }
        )
    return records, errors


def _import_vendors_sync(file_name: str, file_bytes: bytes, context: Optional[str], changed_by: str) -> Dict[str, Any]:
    extension = file_name.rsplit(".", 1)[-1].lower()
    if extension == "csv":
        frame = pd.read_csv(io.BytesIO(file_bytes))
    elif extension in {"xls", "xlsx"}:
        frame = pd.read_excel(io.BytesIO(file_bytes))
    else:
        raise ValueError("Only csv, xls, and xlsx files are supported")

    records, errors = _parse_vendor_frame(frame, context)
    created = 0
    updated = 0
    imported: List[Dict[str, Any]] = []

    for record in records:
        result = _upsert_vendor_sync(record, changed_by=changed_by, change_reason=f"Bulk vendor import from {file_name}")
        imported.append(result["vendor"])
        if result["action"] == "created":
            created += 1
        else:
            updated += 1

    return {
        "file_name": file_name,
        "total_rows": len(records),
        "created": created,
        "updated": updated,
        "errors": errors,
        "vendors": imported,
    }


async def search_vendors(query: str, context: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _search_vendors_sync, query, context, limit)


async def list_vendors(
    query: Optional[str] = None,
    context: Optional[str] = None,
    limit: int = 5000,
    status: Optional[str] = None,
    trust_level: Optional[str] = None,
    sort_by: str = "vendor_name",
) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _list_vendors_sync, query, context, limit, status, trust_level, sort_by)


async def get_vendor_stats(context: Optional[str] = None) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _vendor_stats_sync, context)


async def upsert_vendor(
    payload: Dict[str, Any],
    changed_by: str = "webapp",
    change_reason: str = "Vendor directory update",
) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _upsert_vendor_sync, payload, changed_by, change_reason)


async def import_vendors(
    file_name: str,
    file_bytes: bytes,
    context: Optional[str] = None,
    changed_by: str = "webapp",
) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _import_vendors_sync, file_name, file_bytes, context, changed_by)
