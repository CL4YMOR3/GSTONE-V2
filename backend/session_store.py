"""
In-Memory Session Store

Holds run state, upload sessions, reco sessions, and exports in simple dicts.
Designed to be swapped for SQLite/Postgres later with zero API changes.
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
class ExportRecord:
    export_id: str
    run_id: str
    file_path: str
    file_name: str
    approved: bool = False
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


# ─── Global Store (dict-based, swappable) ────────────────────────────────────

uploads: Dict[str, UploadSession] = {}
runs: Dict[str, RunSession] = {}
recos: Dict[str, RecoSession] = {}
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


def get_export(export_id: str) -> Optional[ExportRecord]:
    return exports.get(export_id)
