"""
Persistent session facade.

Keeps the existing dataclass-based API for the app while persisting all session
state into SQLite-backed month-cycle tables.
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, List, Any

import database


@dataclass
class UploadSession:
    file_id: str
    original_filename: str
    file_path: str
    sheet_names: List[str]
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class RunSession:
    run_id: str
    status: str
    entity_id: Optional[str]
    period: Optional[str]
    business_context: str
    company_gstins: List[str]
    garden_assignments: List[Dict[str, Any]]
    garden_files: List[Dict[str, Any]]
    col_map: Dict[str, str]
    file_ids: List[str]
    fix_actions: List[Dict[str, Any]] = field(default_factory=list)
    result: Optional[Dict[str, Any]] = None
    handoff_workbook_path: Optional[str] = None
    handoff_workbook_name: Optional[str] = None
    handoff_source: Optional[str] = None
    error: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class RecoSession:
    reco_id: str
    parent_run_id: str
    status: str
    declared_gstin: str
    declared_period: str
    upload_ids: List[str] = field(default_factory=list)
    canonical_invoices: List[Dict[str, Any]] = field(default_factory=list)
    canonical_stats: Optional[Dict[str, Any]] = None
    match_results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    upload_metadata_list: List[Dict[str, Any]] = field(default_factory=list)


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
    run_id: Optional[str]
    file_path: str
    file_name: str
    approved: bool = False
    certification_id: Optional[str] = None
    reco_id: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


uploads: Dict[str, UploadSession] = {}
runs: Dict[str, RunSession] = {}
recos: Dict[str, RecoSession] = {}
certified_runs: Dict[str, CertifiedRun] = {}
exports: Dict[str, ExportRecord] = {}


def init_store() -> None:
    database.init_db()


def save_upload(upload: UploadSession) -> None:
    uploads[upload.file_id] = upload
    database.save_upload(upload)


def get_upload(file_id: str) -> Optional[UploadSession]:
    cached = uploads.get(file_id)
    if cached:
        return cached
    payload = database.get_upload(file_id)
    if not payload:
        return None
    upload = UploadSession(**payload)
    uploads[file_id] = upload
    return upload


def delete_upload(file_id: str) -> None:
    uploads.pop(file_id, None)
    database.delete_upload(file_id)


def save_run(run: RunSession) -> None:
    runs[run.run_id] = run
    database.save_run(run)


def get_run(run_id: str) -> Optional[RunSession]:
    cached = runs.get(run_id)
    if cached:
        return cached
    payload = database.get_run(run_id)
    if not payload:
        return None
    run = RunSession(**payload)
    runs[run_id] = run
    return run


def get_latest_run(entity_id: str, period: str) -> Optional[RunSession]:
    payload = database.get_latest_run(entity_id, period)
    if not payload:
        return None
    run = runs.get(payload["run_id"])
    if run:
        return run
    run = RunSession(**payload)
    runs[run.run_id] = run
    return run


def save_reco(reco: RecoSession, upload_records: Optional[List[Dict[str, Any]]] = None) -> None:
    recos[reco.reco_id] = reco
    database.save_reco(reco, upload_records=upload_records)


def get_reco(reco_id: str) -> Optional[RecoSession]:
    cached = recos.get(reco_id)
    if cached:
        return cached
    payload = database.get_reco(reco_id)
    if not payload:
        return None
    reco = RecoSession(**payload)
    recos[reco_id] = reco
    return reco


def save_certified(record: CertifiedRun) -> None:
    certified_runs[record.certification_id] = record
    database.save_certified_run(record)


def get_certified(certification_id: str) -> Optional[CertifiedRun]:
    cached = certified_runs.get(certification_id)
    if cached:
        return cached
    for record in certified_runs.values():
        if record.certification_id == certification_id:
            return record
    return None


def get_certified_by_run_id(run_id: str) -> Optional[CertifiedRun]:
    for record in certified_runs.values():
        if record.run_id == run_id:
            return record
    payload = database.get_certified_by_run_id(run_id)
    if not payload:
        return None
    record = CertifiedRun(**payload)
    certified_runs[record.certification_id] = record
    return record


def save_export(record: ExportRecord) -> None:
    exports[record.export_id] = record
    database.save_export_record(record)


def get_export(export_id: str) -> Optional[ExportRecord]:
    cached = exports.get(export_id)
    if cached:
        return cached
    payload = database.get_export(export_id)
    if not payload:
        return None
    record = ExportRecord(**payload)
    exports[export_id] = record
    return record


def mark_export_approved(export_id: str) -> None:
    record = get_export(export_id)
    if record:
        record.approved = True
        exports[export_id] = record
    database.mark_export_approved(export_id)


def get_latest_export_for_run(run_id: str, approved_only: bool = False) -> Optional[ExportRecord]:
    payload = database.get_latest_export_for_run(run_id, approved_only=approved_only)
    if not payload:
        return None
    record = exports.get(payload["export_id"])
    if record:
        return record
    record = ExportRecord(**payload)
    exports[record.export_id] = record
    return record


def get_dashboard_stats(entity_id: str, period: str) -> Dict[str, Any]:
    return database.get_dashboard_stats(entity_id, period)


def list_month_cycles(entity_id: Optional[str] = None) -> List[Dict[str, Any]]:
    return database.list_month_cycles(entity_id)


def get_month_cycle(entity_id: str, period: str) -> Optional[Dict[str, Any]]:
    return database.get_month_cycle(entity_id, period)


def get_month_cycle_history(entity_id: str, period: str) -> Dict[str, Any]:
    return database.get_month_cycle_history(entity_id, period)


def get_reco_exceptions(
    reco_id: str,
    status: Optional[str] = None,
    action_state: Optional[str] = None,
    age_bucket: Optional[str] = None,
) -> List[Dict[str, Any]]:
    return database.get_reco_exceptions(reco_id, status=status, action_state=action_state, age_bucket=age_bucket)


def get_supplier_followups(entity_id: str, period: Optional[str] = None) -> List[Dict[str, Any]]:
    return database.get_supplier_followups(entity_id, period)


def close_month_cycle(entity_id: str, period: str) -> Dict[str, Any]:
    return database.close_month_cycle(entity_id, period)
