"""
In-Memory Session Store

Holds run state, certified snapshots, upload sessions, reco sessions, and exports
in simple dicts. This mirrors the legacy GSTONE offline model where the active
process owns the truth and the exported workbook is the cross-phase artifact.
"""
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any
from datetime import datetime


# ─── Data Classes ────────────────────────────────────────────────────────────

@dataclass
class UploadSession:
    file_id: str
    original_filename: str
    file_path: str          # Absolute path to temp file on disk
    sheet_names: List[str]
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class RunSession:
    run_id: str
    status: str             # "pending" | "running" | "complete" | "failed"
    entity_id: Optional[str]
    period: Optional[str]
    business_context: str
    company_gstins: List[str]
    garden_assignments: List[Dict[str, Any]]
    garden_files: List[Dict[str, Any]]
    col_map: Dict[str, str]
    file_ids: List[str]
    # Accumulated approved fixes across reprocess loops (FixAction dicts)
    fix_actions: List[Dict[str, Any]] = field(default_factory=list)
    # Serialized pipeline output (DataFrames stored as list-of-dicts records)
    result: Optional[Dict[str, Any]] = None
    handoff_workbook_path: Optional[str] = None
    handoff_workbook_name: Optional[str] = None
    handoff_source: Optional[str] = None  # "uploaded_workbook" | "approved_export"
    error: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class RecoSession:
    reco_id: str
    parent_run_id: str
    status: str             # "pending" | "ingesting" | "ready" | "running" | "complete" | "failed"
    declared_gstin: str
    declared_period: str
    upload_ids: List[str] = field(default_factory=list)
    # Canonical invoices stored as list-of-dicts for JSON-safe serialization
    canonical_invoices: List[Dict[str, Any]] = field(default_factory=list)
    canonical_stats: Optional[Dict[str, Any]] = None
    match_results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class CertifiedRun:
    certification_id: str
    run_id: str
    entity_id: str
    period: str
    business_context: str
    status: str = "certified"
    summary: Dict[str, Any] = field(default_factory=dict)
    results: Dict[str, Any] = field(default_factory=dict)
    fixes: List[Dict[str, Any]] = field(default_factory=list)
    certified_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ExportRecord:
    export_id: str
    run_id: str
    file_path: str
    file_name: str
    approved: bool = False
    certification_id: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


# ─── Global Store (dict-based, swappable) ────────────────────────────────────

uploads: Dict[str, UploadSession] = {}
runs: Dict[str, RunSession] = {}
recos: Dict[str, RecoSession] = {}
certified_runs: Dict[str, CertifiedRun] = {}
exports: Dict[str, ExportRecord] = {}


# ─── Helper Functions ─────────────────────────────────────────────────────────

def get_upload(file_id: str) -> Optional[UploadSession]:
    return uploads.get(file_id)


def get_run(run_id: str) -> Optional[RunSession]:
    return runs.get(run_id)


def get_latest_run(entity_id: str, period: str) -> Optional[RunSession]:
    candidates = [
        run for run in runs.values()
        if run.entity_id == entity_id and run.period == period
    ]
    if not candidates:
        return None

    return max(candidates, key=lambda run: (run.created_at, run.run_id))


def get_reco(reco_id: str) -> Optional[RecoSession]:
    return recos.get(reco_id)


def get_certified(certification_id: str) -> Optional[CertifiedRun]:
    return certified_runs.get(certification_id)


def get_certified_by_run_id(run_id: str) -> Optional[CertifiedRun]:
    candidates = [record for record in certified_runs.values() if record.run_id == run_id]
    if not candidates:
        return None
    return max(candidates, key=lambda record: (record.certified_at, record.certification_id))


def get_export(export_id: str) -> Optional[ExportRecord]:
    return exports.get(export_id)


def get_latest_export_for_run(run_id: str, approved_only: bool = False) -> Optional[ExportRecord]:
    candidates = [
        record for record in exports.values()
        if record.run_id == run_id and (record.approved or not approved_only)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda record: (record.created_at, record.export_id))


def get_dashboard_stats(entity_id: str, period: str) -> Dict[str, Any]:
    certified = [
        record for record in certified_runs.values()
        if record.entity_id == entity_id
    ]
    period_certified = [record for record in certified if record.period == period]
    period_recos = [
        reco for reco in recos.values()
        if reco.status == "complete" and _matches_entity_period(reco.parent_run_id, entity_id, period)
    ]

    distribution = {
        "MATCHED_STRICT": 0,
        "MATCHED_RELAXED": 0,
        "VALUE_MISMATCH": 0,
        "MISSING_IN_2B": 0,
        "MISSING_IN_BOOKS": 0,
        "AMBIGUOUS_MATCH": 0,
        "POSSIBLE_MATCH": 0,
    }
    total_matches = 0
    matched_count = 0

    for reco in period_recos:
        payload = reco.match_results or {}
        rows = payload.get("results", payload.get("match_results", []))
        for row in rows:
            status = row.get("match_status")
            if status:
                distribution[status] = distribution.get(status, 0) + 1
            total_matches += 1
            if status in ("MATCHED_STRICT", "MATCHED_RELAXED"):
                matched_count += 1

    latest_certified = None
    if period_certified:
        latest_certified = max(period_certified, key=lambda record: (record.certified_at, record.certification_id))

    summary = latest_certified.summary if latest_certified else {}
    results = latest_certified.results if latest_certified else {}
    total_invoices = (
        summary.get("valid_invoices")
        or len(results.get("clean_invoices", []))
        or len(results.get("clean", []))
        or 0
    )

    return {
        "kpis": {
            "total_runs": len(certified),
            "match_rate": round((matched_count / total_matches) * 100) if total_matches else 0,
            "at_risk_itc": 0,
            "total_invoices": total_invoices,
        },
        "distribution": distribution,
        "trends": [],
        "latest_certified": {
            "run_id": latest_certified.run_id,
            "period": latest_certified.period,
            "certified_at": latest_certified.certified_at,
            "fix_count": len(latest_certified.fixes),
            "warning_count": len(results.get("warnings", [])),
        } if latest_certified else None,
    }


def _matches_entity_period(run_id: str, entity_id: str, period: str) -> bool:
    run = runs.get(run_id)
    if run:
        return run.entity_id == entity_id and run.period == period

    certified = get_certified_by_run_id(run_id)
    if certified:
        return certified.entity_id == entity_id and certified.period == period

    return False
