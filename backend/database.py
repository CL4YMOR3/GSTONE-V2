"""
SQLite persistence for v2 late-commit audit state.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, Iterator, Optional

from config import SQLITE_DB_PATH
from utils.serialization import sanitize_nan


def _utcnow() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def _dump(payload: Any) -> str:
    return json.dumps(sanitize_nan({} if payload is None else payload), ensure_ascii=True)


def _load(payload: Optional[str], default: Any = None) -> Any:
    if not payload:
        return {} if default is None else default
    return json.loads(payload)


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(SQLITE_DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def init_db() -> None:
    SQLITE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS sandbox_runs (
                run_id TEXT PRIMARY KEY,
                entity_id TEXT,
                period TEXT,
                business_context TEXT,
                status TEXT NOT NULL,
                request_json TEXT,
                summary_json TEXT,
                results_json TEXT,
                fixes_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS certified_runs (
                certification_id TEXT PRIMARY KEY,
                run_id TEXT,
                entity_id TEXT NOT NULL,
                period TEXT NOT NULL,
                business_context TEXT,
                status TEXT NOT NULL,
                summary_json TEXT NOT NULL,
                results_json TEXT NOT NULL,
                fixes_json TEXT NOT NULL,
                certified_at TEXT NOT NULL,
                UNIQUE(entity_id, period)
            );

            CREATE TABLE IF NOT EXISTS reco_runs (
                reco_id TEXT PRIMARY KEY,
                parent_run_id TEXT NOT NULL,
                entity_id TEXT,
                period TEXT,
                declared_gstin TEXT,
                status TEXT NOT NULL,
                canonical_json TEXT,
                results_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS export_records (
                export_id TEXT PRIMARY KEY,
                run_id TEXT,
                certification_id TEXT,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                approved INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(sandbox_runs)").fetchall()}
        if "request_json" not in columns:
            connection.execute("ALTER TABLE sandbox_runs ADD COLUMN request_json TEXT")
        connection.commit()


def upsert_sandbox_run(
    *,
    run_id: str,
    entity_id: Optional[str],
    period: Optional[str],
    business_context: str,
    status: str,
    summary: Optional[Dict[str, Any]],
    results: Optional[Dict[str, Any]],
    fixes: Optional[list],
    request: Optional[Dict[str, Any]] = None,
    created_at: Optional[str] = None,
) -> None:
    timestamp = _utcnow()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO sandbox_runs (
                run_id, entity_id, period, business_context, status,
                request_json, summary_json, results_json, fixes_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                entity_id = excluded.entity_id,
                period = excluded.period,
                business_context = excluded.business_context,
                status = excluded.status,
                request_json = excluded.request_json,
                summary_json = excluded.summary_json,
                results_json = excluded.results_json,
                fixes_json = excluded.fixes_json,
                updated_at = excluded.updated_at
            """,
            (
                run_id,
                entity_id,
                period,
                business_context,
                status,
                _dump(request),
                _dump(summary),
                _dump(results),
                _dump(fixes or []),
                created_at or timestamp,
                timestamp,
            ),
        )
        connection.commit()


def finalize_run(
    *,
    entity_id: str,
    period: str,
    run_id: Optional[str],
    business_context: Optional[str],
    summary: Dict[str, Any],
    results: Dict[str, Any],
    fixes: list,
) -> Dict[str, Any]:
    certification_id = f"CERT_{uuid.uuid4().hex[:10].upper()}"
    timestamp = _utcnow()

    with get_connection() as connection:
        connection.execute(
            "DELETE FROM certified_runs WHERE entity_id = ? AND period = ?",
            (entity_id, period),
        )
        connection.execute(
            """
            INSERT INTO certified_runs (
                certification_id, run_id, entity_id, period, business_context,
                status, summary_json, results_json, fixes_json, certified_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                certification_id,
                run_id,
                entity_id,
                period,
                business_context,
                "certified",
                _dump(summary),
                _dump(results),
                _dump(fixes or []),
                timestamp,
            ),
        )
        connection.commit()

    return {
        "certification_id": certification_id,
        "run_id": run_id,
        "entity_id": entity_id,
        "period": period,
        "status": "certified",
        "certified_at": timestamp,
    }


def get_latest_certified(entity_id: str, period: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM certified_runs
            WHERE entity_id = ? AND period = ?
            ORDER BY certified_at DESC
            LIMIT 1
            """,
            (entity_id, period),
        ).fetchone()

    if not row:
        return None

    return {
        "certification_id": row["certification_id"],
        "run_id": row["run_id"],
        "entity_id": row["entity_id"],
        "period": row["period"],
        "business_context": row["business_context"],
        "status": row["status"],
        "summary": _load(row["summary_json"]),
        "results": _load(row["results_json"]),
        "fixes": _load(row["fixes_json"], []),
        "certified_at": row["certified_at"],
    }


def get_latest_sandbox(entity_id: str, period: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM sandbox_runs
            WHERE entity_id = ? AND period = ?
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
            """,
            (entity_id, period),
        ).fetchone()

    if not row:
        return None

    result_payload = _load(row["results_json"])
    if "clean_invoices" in result_payload or "identity_errors" in result_payload:
        normalized_results = {
            "col_map": result_payload.get("col_map", {}),
            "clean": result_payload.get("clean_invoices", []),
            "warnings": result_payload.get("warning_invoices", []),
            "errors": result_payload.get("identity_errors", []) + result_payload.get("aggregation_errors", []),
        }
    else:
        normalized_results = result_payload

    return {
        "run_id": row["run_id"],
        "entity_id": row["entity_id"],
        "period": row["period"],
        "business_context": row["business_context"],
        "status": row["status"],
        "summary": _load(row["summary_json"]),
        "results": normalized_results,
        "fixes": _load(row["fixes_json"], []),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_sandbox_run(run_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM sandbox_runs WHERE run_id = ? LIMIT 1",
            (run_id,),
        ).fetchone()

    if not row:
        return None

    return {
        "run_id": row["run_id"],
        "entity_id": row["entity_id"],
        "period": row["period"],
        "business_context": row["business_context"],
        "status": row["status"],
        "request": _load(row["request_json"]),
        "summary": _load(row["summary_json"]),
        "result": _load(row["results_json"]),
        "fixes": _load(row["fixes_json"], []),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_certified_by_run_id(run_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM certified_runs WHERE run_id = ? ORDER BY certified_at DESC LIMIT 1",
            (run_id,),
        ).fetchone()

    if not row:
        return None

    return {
        "certification_id": row["certification_id"],
        "run_id": row["run_id"],
        "entity_id": row["entity_id"],
        "period": row["period"],
        "business_context": row["business_context"],
        "status": row["status"],
        "summary": _load(row["summary_json"]),
        "results": _load(row["results_json"]),
        "fixes": _load(row["fixes_json"], []),
        "certified_at": row["certified_at"],
    }


def upsert_reco_run(
    *,
    reco_id: str,
    parent_run_id: str,
    entity_id: Optional[str],
    period: Optional[str],
    declared_gstin: Optional[str],
    status: str,
    canonical: Optional[Dict[str, Any]],
    results: Optional[Dict[str, Any]],
    created_at: Optional[str] = None,
) -> None:
    timestamp = _utcnow()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO reco_runs (
                reco_id, parent_run_id, entity_id, period, declared_gstin, status,
                canonical_json, results_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(reco_id) DO UPDATE SET
                parent_run_id = excluded.parent_run_id,
                entity_id = excluded.entity_id,
                period = excluded.period,
                declared_gstin = excluded.declared_gstin,
                status = excluded.status,
                canonical_json = excluded.canonical_json,
                results_json = excluded.results_json,
                updated_at = excluded.updated_at
            """,
            (
                reco_id,
                parent_run_id,
                entity_id,
                period,
                declared_gstin,
                status,
                _dump(canonical),
                _dump(results),
                created_at or timestamp,
                timestamp,
            ),
        )
        connection.commit()


def create_export_record(
    *,
    export_id: str,
    run_id: Optional[str],
    certification_id: Optional[str],
    file_name: str,
    file_path: str,
    approved: bool = False,
) -> None:
    timestamp = _utcnow()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO export_records (
                export_id, run_id, certification_id, file_name, file_path, approved, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                export_id,
                run_id,
                certification_id,
                file_name,
                file_path,
                int(approved),
                timestamp,
                timestamp,
            ),
        )
        connection.commit()


def mark_export_approved(export_id: str) -> None:
    with get_connection() as connection:
        connection.execute(
            "UPDATE export_records SET approved = 1, updated_at = ? WHERE export_id = ?",
            (_utcnow(), export_id),
        )
        connection.commit()


def get_dashboard_stats(entity_id: str, period: str) -> Dict[str, Any]:
    certified = get_latest_certified(entity_id, period)

    with get_connection() as connection:
        run_count_row = connection.execute(
            "SELECT COUNT(*) AS total FROM certified_runs WHERE entity_id = ?",
            (entity_id,),
        ).fetchone()
        reco_rows = connection.execute(
            "SELECT results_json FROM reco_runs WHERE entity_id = ? AND period = ? AND status = 'complete'",
            (entity_id, period),
        ).fetchall()

    total_runs = run_count_row["total"] if run_count_row else 0
    summary = certified["summary"] if certified else {}
    results = certified["results"] if certified else {}

    distribution = {
        "MATCHED_STRICT": 0,
        "MATCHED_RELAXED": 0,
        "VALUE_MISMATCH": 0,
        "MISSING": 0,
    }

    total_matches = 0
    for row in reco_rows:
        payload = _load(row["results_json"])
        for result in payload.get("results", payload.get("match_results", [])):
            status = result.get("match_status")
            total_matches += 1
            if status == "MATCHED_STRICT":
                distribution["MATCHED_STRICT"] += 1
            elif status == "MATCHED_RELAXED":
                distribution["MATCHED_RELAXED"] += 1
            elif status == "VALUE_MISMATCH":
                distribution["VALUE_MISMATCH"] += 1
            else:
                distribution["MISSING"] += 1

    match_rate = round((distribution["MATCHED_STRICT"] / total_matches) * 100) if total_matches else 0

    return {
        "kpis": {
            "total_runs": total_runs,
            "match_rate": match_rate,
            "at_risk_itc": 0,
            "total_invoices": summary.get("valid_invoices", 0) + summary.get("warning_invoice_count", 0) + summary.get("identity_error_count", 0) + summary.get("aggregation_error_count", 0),
        },
        "distribution": distribution,
        "trends": [
            {
                "month": period,
                "total": summary.get("original_rows", 0),
                "matched": summary.get("valid_invoices", 0),
            }
        ] if certified else [],
        "certified_run": {
            "entity_id": entity_id,
            "period": period,
            "status": certified["status"],
            "certified_at": certified["certified_at"],
            "fix_count": len(certified["fixes"]),
            "warning_count": len(results.get("warnings", [])),
        } if certified else None,
    }
