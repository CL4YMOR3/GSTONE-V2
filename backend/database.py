from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import asdict, is_dataclass
from datetime import datetime
from typing import Any, Dict, Iterator, List, Optional

from config import SQLITE_DB_PATH
from utils.serialization import sanitize_nan


def _utcnow() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def _dump(payload: Any) -> str:
    if is_dataclass(payload):
        payload = asdict(payload)
    return json.dumps(sanitize_nan(payload), ensure_ascii=True)


def _load(payload: Optional[str], default: Any = None) -> Any:
    if payload in (None, ""):
        return default
    return json.loads(payload)


def _table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    row = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _column_names(connection: sqlite3.Connection, table_name: str) -> set[str]:
    if not _table_exists(connection, table_name):
        return set()
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row["name"] for row in rows}


def _ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
    if column_name not in _column_names(connection, table_name):
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def _upgrade_uploads_table(connection: sqlite3.Connection) -> None:
    if not _table_exists(connection, "uploads"):
        return
    _ensure_column(connection, "uploads", "original_filename", "TEXT")
    _ensure_column(connection, "uploads", "file_path", "TEXT")
    _ensure_column(connection, "uploads", "sheet_names_json", "TEXT")
    _ensure_column(connection, "uploads", "created_at", "TEXT")
    upload_columns = _column_names(connection, "uploads")
    if "sheet_names" in upload_columns:
        connection.execute(
            "UPDATE uploads SET sheet_names_json = COALESCE(sheet_names_json, sheet_names) WHERE sheet_names_json IS NULL OR sheet_names_json = ''"
        )
    connection.execute(
        "UPDATE uploads SET created_at = COALESCE(created_at, ?)",
        (_utcnow(),),
    )


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    SQLITE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(SQLITE_DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        yield connection
    finally:
        connection.close()


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS uploads (
                file_id TEXT PRIMARY KEY,
                original_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                sheet_names_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS month_cycles (
                month_cycle_id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id TEXT NOT NULL,
                return_period TEXT NOT NULL,
                business_context TEXT,
                books_filing_context TEXT,
                supplier_visibility_window TEXT,
                static_2b_snapshot_date TEXT,
                ims_review_state TEXT DEFAULT 'UNREVIEWED',
                gstr3b_filing_status TEXT DEFAULT 'OPEN',
                is_finalized INTEGER NOT NULL DEFAULT 0,
                finalized_at TEXT,
                current_books_run_id TEXT,
                current_reco_run_id TEXT,
                current_certification_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(entity_id, return_period)
            );

            CREATE TABLE IF NOT EXISTS books_runs (
                run_id TEXT PRIMARY KEY,
                month_cycle_id INTEGER,
                entity_id TEXT,
                return_period TEXT,
                version_no INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL,
                business_context TEXT,
                company_gstins_json TEXT NOT NULL,
                garden_assignments_json TEXT NOT NULL,
                garden_files_json TEXT NOT NULL,
                col_map_json TEXT NOT NULL,
                file_ids_json TEXT NOT NULL,
                fix_actions_json TEXT NOT NULL,
                result_json TEXT,
                error TEXT,
                handoff_workbook_path TEXT,
                handoff_workbook_name TEXT,
                handoff_source TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(month_cycle_id) REFERENCES month_cycles(month_cycle_id)
            );

            CREATE TABLE IF NOT EXISTS books_source_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                file_id TEXT,
                original_filename TEXT,
                file_path TEXT,
                sheet_names_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS books_invoice_facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                invoice_key TEXT,
                supplier_gstin TEXT,
                invoice_number TEXT,
                invoice_date TEXT,
                source_document_date TEXT,
                supplier_filed_period TEXT,
                visible_in_2b_period TEXT,
                reco_period TEXT,
                taxable_value REAL,
                igst_amount REAL,
                cgst_amount REAL,
                sgst_amount REAL,
                total_invoice_value REAL,
                source_type TEXT DEFAULT 'BOOKS',
                document_type TEXT,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS books_run_clean_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                invoice_key TEXT,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS books_run_warning_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                invoice_key TEXT,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS books_run_error_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                category TEXT,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS fix_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                sequence_no INTEGER NOT NULL,
                field TEXT,
                fix_type TEXT,
                scope TEXT,
                reference_rows_json TEXT,
                match_criteria_json TEXT,
                action_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS certified_runs (
                certification_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                return_period TEXT NOT NULL,
                business_context TEXT,
                status TEXT NOT NULL,
                summary_json TEXT NOT NULL,
                results_json TEXT NOT NULL,
                fixes_json TEXT NOT NULL,
                certified_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reco_runs (
                reco_id TEXT PRIMARY KEY,
                month_cycle_id INTEGER,
                parent_run_id TEXT NOT NULL,
                entity_id TEXT,
                return_period TEXT,
                version_no INTEGER NOT NULL DEFAULT 1,
                declared_gstin TEXT,
                declared_period TEXT,
                status TEXT NOT NULL,
                upload_ids_json TEXT NOT NULL,
                canonical_stats_json TEXT,
                match_results_json TEXT,
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(month_cycle_id) REFERENCES month_cycles(month_cycle_id)
            );

            CREATE TABLE IF NOT EXISTS reco_uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reco_id TEXT NOT NULL,
                upload_id TEXT NOT NULL,
                original_filename TEXT,
                file_path TEXT,
                declared_gstin TEXT,
                declared_period TEXT,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(reco_id) REFERENCES reco_runs(reco_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reco_canonical_facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reco_id TEXT NOT NULL,
                identity_key TEXT,
                supplier_gstin TEXT,
                invoice_number TEXT,
                invoice_date TEXT,
                source_document_date TEXT,
                supplier_filed_period TEXT,
                visible_in_2b_period TEXT,
                reco_period TEXT,
                taxable_value REAL,
                igst_amount REAL,
                cgst_amount REAL,
                sgst_amount REAL,
                total_invoice_value REAL,
                total_gst_amount REAL,
                source_type TEXT DEFAULT '2B',
                document_type TEXT,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(reco_id) REFERENCES reco_runs(reco_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reco_match_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reco_id TEXT NOT NULL,
                books_invoice_id TEXT,
                matched_2b_invoice_id TEXT,
                supplier_gstin TEXT,
                invoice_number TEXT,
                invoice_date TEXT,
                match_status TEXT NOT NULL,
                match_method TEXT,
                action_state TEXT NOT NULL DEFAULT 'UNREVIEWED',
                action_effective_period TEXT,
                action_frozen_at_3b_filing INTEGER NOT NULL DEFAULT 0,
                carried_forward_from_period TEXT,
                carried_forward_to_period TEXT,
                carry_forward_flag INTEGER NOT NULL DEFAULT 0,
                review_notes TEXT,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(reco_id) REFERENCES reco_runs(reco_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reco_value_deltas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reco_match_item_id INTEGER NOT NULL,
                field_name TEXT NOT NULL,
                books_value REAL,
                reco_value REAL,
                delta REAL,
                within_tolerance INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(reco_match_item_id) REFERENCES reco_match_items(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS reco_review_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reco_match_item_id INTEGER NOT NULL,
                action_state TEXT NOT NULL,
                action_effective_period TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(reco_match_item_id) REFERENCES reco_match_items(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS export_records (
                export_id TEXT PRIMARY KEY,
                run_id TEXT,
                reco_id TEXT,
                certification_id TEXT,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                approved INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id TEXT,
                return_period TEXT,
                event_type TEXT NOT NULL,
                ref_type TEXT,
                ref_id TEXT,
                payload_json TEXT,
                created_at TEXT NOT NULL
            );
            """
        )

        if _table_exists(connection, "month_cycles"):
            _ensure_column(connection, "month_cycles", "return_period", "TEXT")
            _ensure_column(connection, "month_cycles", "books_filing_context", "TEXT")
            _ensure_column(connection, "month_cycles", "supplier_visibility_window", "TEXT")
            _ensure_column(connection, "month_cycles", "static_2b_snapshot_date", "TEXT")
            _ensure_column(connection, "month_cycles", "ims_review_state", "TEXT DEFAULT 'UNREVIEWED'")
            _ensure_column(connection, "month_cycles", "gstr3b_filing_status", "TEXT DEFAULT 'OPEN'")
            _ensure_column(connection, "month_cycles", "is_finalized", "INTEGER NOT NULL DEFAULT 0")
            _ensure_column(connection, "month_cycles", "finalized_at", "TEXT")
            _ensure_column(connection, "month_cycles", "current_books_run_id", "TEXT")
            _ensure_column(connection, "month_cycles", "current_reco_run_id", "TEXT")
            _ensure_column(connection, "month_cycles", "current_certification_id", "TEXT")
            _ensure_column(connection, "month_cycles", "created_at", "TEXT")
            _ensure_column(connection, "month_cycles", "updated_at", "TEXT")
            month_cycle_columns = _column_names(connection, "month_cycles")
            if "period" in month_cycle_columns:
                connection.execute(
                    "UPDATE month_cycles SET return_period = COALESCE(return_period, period) WHERE return_period IS NULL OR return_period = ''"
                )

        _upgrade_uploads_table(connection)

        if _table_exists(connection, "books_runs"):
            _ensure_column(connection, "books_runs", "return_period", "TEXT")
            _ensure_column(connection, "books_runs", "version_no", "INTEGER NOT NULL DEFAULT 1")
            _ensure_column(connection, "books_runs", "company_gstins_json", "TEXT NOT NULL DEFAULT '[]'")
            _ensure_column(connection, "books_runs", "garden_assignments_json", "TEXT NOT NULL DEFAULT '[]'")
            _ensure_column(connection, "books_runs", "garden_files_json", "TEXT NOT NULL DEFAULT '[]'")
            _ensure_column(connection, "books_runs", "col_map_json", "TEXT NOT NULL DEFAULT '{}'")
            _ensure_column(connection, "books_runs", "file_ids_json", "TEXT NOT NULL DEFAULT '[]'")
            _ensure_column(connection, "books_runs", "fix_actions_json", "TEXT NOT NULL DEFAULT '[]'")
            _ensure_column(connection, "books_runs", "result_json", "TEXT")
            _ensure_column(connection, "books_runs", "handoff_workbook_path", "TEXT")
            _ensure_column(connection, "books_runs", "handoff_workbook_name", "TEXT")
            _ensure_column(connection, "books_runs", "handoff_source", "TEXT")
            _ensure_column(connection, "books_runs", "updated_at", "TEXT")
            books_run_columns = _column_names(connection, "books_runs")
            if "period" in books_run_columns:
                connection.execute(
                    "UPDATE books_runs SET return_period = COALESCE(return_period, period) WHERE return_period IS NULL OR return_period = ''"
                )
            connection.execute(
                "UPDATE books_runs SET updated_at = COALESCE(updated_at, created_at, ?)",
                (_utcnow(),),
            )

        if _table_exists(connection, "certified_runs"):
            _ensure_column(connection, "certified_runs", "return_period", "TEXT")
            certified_columns = _column_names(connection, "certified_runs")
            if "period" in certified_columns:
                connection.execute(
                    "UPDATE certified_runs SET return_period = COALESCE(return_period, period) WHERE return_period IS NULL OR return_period = ''"
                )

        if _table_exists(connection, "reco_runs"):
            _ensure_column(connection, "reco_runs", "month_cycle_id", "INTEGER")
            _ensure_column(connection, "reco_runs", "return_period", "TEXT")
            _ensure_column(connection, "reco_runs", "version_no", "INTEGER NOT NULL DEFAULT 1")
            _ensure_column(connection, "reco_runs", "declared_period", "TEXT")
            _ensure_column(connection, "reco_runs", "upload_ids_json", "TEXT NOT NULL DEFAULT '[]'")
            _ensure_column(connection, "reco_runs", "canonical_stats_json", "TEXT")
            _ensure_column(connection, "reco_runs", "match_results_json", "TEXT")
            _ensure_column(connection, "reco_runs", "error", "TEXT")
            _ensure_column(connection, "reco_runs", "updated_at", "TEXT")
            reco_run_columns = _column_names(connection, "reco_runs")
            if "period" in reco_run_columns:
                connection.execute(
                    "UPDATE reco_runs SET return_period = COALESCE(return_period, period) WHERE return_period IS NULL OR return_period = ''"
                )
            connection.execute(
                "UPDATE reco_runs SET updated_at = COALESCE(updated_at, created_at, ?)",
                (_utcnow(),),
            )

        if _table_exists(connection, "export_records"):
            _ensure_column(connection, "export_records", "reco_id", "TEXT")
            _ensure_column(connection, "export_records", "updated_at", "TEXT")
            connection.execute(
                "UPDATE export_records SET updated_at = COALESCE(updated_at, created_at, ?)",
                (_utcnow(),),
            )

        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_runs_entity_period ON books_runs(entity_id, return_period)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_invoice_identity ON books_invoice_facts(supplier_gstin, invoice_number, invoice_date)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_runs_entity_period ON reco_runs(entity_id, return_period)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_canonical_identity ON reco_canonical_facts(supplier_gstin, invoice_number, invoice_date)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_canonical_visible_period ON reco_canonical_facts(visible_in_2b_period)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_match_status ON reco_match_items(match_status)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_match_action_state ON reco_match_items(action_state)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_match_carry_forward ON reco_match_items(carry_forward_flag)"
        )
        connection.commit()


def _get_or_create_month_cycle(
    connection: sqlite3.Connection,
    entity_id: Optional[str],
    return_period: Optional[str],
    business_context: Optional[str],
) -> Optional[int]:
    if not entity_id or not return_period:
        return None
    row = connection.execute(
        "SELECT month_cycle_id FROM month_cycles WHERE entity_id = ? AND return_period = ?",
        (entity_id, return_period),
    ).fetchone()
    if row:
        connection.execute(
            """
            UPDATE month_cycles
            SET business_context = COALESCE(?, business_context), updated_at = ?
            WHERE month_cycle_id = ?
            """,
            (business_context, _utcnow(), row["month_cycle_id"]),
        )
        return int(row["month_cycle_id"])

    now = _utcnow()
    cursor = connection.execute(
        """
        INSERT INTO month_cycles (
            entity_id, return_period, business_context, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (entity_id, return_period, business_context, now, now),
    )
    return int(cursor.lastrowid)


def _next_version(
    connection: sqlite3.Connection,
    table_name: str,
    entity_id: Optional[str],
    return_period: Optional[str],
    id_column: str,
    current_id: str,
) -> int:
    if not entity_id or not return_period:
        return 1
    row = connection.execute(
        f"""
        SELECT version_no FROM {table_name}
        WHERE entity_id = ? AND return_period = ?
        ORDER BY version_no DESC LIMIT 1
        """,
        (entity_id, return_period),
    ).fetchone()
    if not row:
        return 1
    existing = connection.execute(
        f"SELECT version_no FROM {table_name} WHERE {id_column} = ?",
        (current_id,),
    ).fetchone()
    if existing:
        return int(existing["version_no"])
    return int(row["version_no"]) + 1


def save_upload(upload: Any) -> None:
    with get_connection() as connection:
        try:
            connection.execute(
                """
                INSERT INTO uploads (file_id, original_filename, file_path, sheet_names_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(file_id) DO UPDATE SET
                    original_filename = excluded.original_filename,
                    file_path = excluded.file_path,
                    sheet_names_json = excluded.sheet_names_json
                """,
                (
                    upload.file_id,
                    upload.original_filename,
                    upload.file_path,
                    _dump(upload.sheet_names),
                    getattr(upload, "created_at", None) or _utcnow(),
                ),
            )
        except sqlite3.OperationalError as exc:
            if "sheet_names_json" not in str(exc):
                raise
            _upgrade_uploads_table(connection)
            connection.execute(
                """
                INSERT INTO uploads (file_id, original_filename, file_path, sheet_names_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(file_id) DO UPDATE SET
                    original_filename = excluded.original_filename,
                    file_path = excluded.file_path,
                    sheet_names_json = excluded.sheet_names_json
                """,
                (
                    upload.file_id,
                    upload.original_filename,
                    upload.file_path,
                    _dump(upload.sheet_names),
                    getattr(upload, "created_at", None) or _utcnow(),
                ),
            )
        connection.commit()


def delete_upload(file_id: str) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM uploads WHERE file_id = ?", (file_id,))
        connection.commit()


def get_upload(file_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM uploads WHERE file_id = ?", (file_id,)).fetchone()
    if not row:
        return None
    return {
        "file_id": row["file_id"],
        "original_filename": row["original_filename"],
        "file_path": row["file_path"],
        "sheet_names": _load(row["sheet_names_json"], []),
        "created_at": row["created_at"],
    }


def save_run(run: Any) -> None:
    payload = asdict(run) if is_dataclass(run) else dict(run)
    result = payload.get("result") or {}
    with get_connection() as connection:
        month_cycle_id = _get_or_create_month_cycle(
            connection,
            payload.get("entity_id"),
            payload.get("period"),
            payload.get("business_context"),
        )
        version_no = _next_version(
            connection,
            "books_runs",
            payload.get("entity_id"),
            payload.get("period"),
            "run_id",
            payload["run_id"],
        )
        now = _utcnow()
        connection.execute(
            """
            INSERT INTO books_runs (
                run_id, month_cycle_id, entity_id, return_period, version_no, status,
                business_context, company_gstins_json, garden_assignments_json, garden_files_json,
                col_map_json, file_ids_json, fix_actions_json, result_json, error,
                handoff_workbook_path, handoff_workbook_name, handoff_source, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                month_cycle_id = excluded.month_cycle_id,
                entity_id = excluded.entity_id,
                return_period = excluded.return_period,
                version_no = excluded.version_no,
                status = excluded.status,
                business_context = excluded.business_context,
                company_gstins_json = excluded.company_gstins_json,
                garden_assignments_json = excluded.garden_assignments_json,
                garden_files_json = excluded.garden_files_json,
                col_map_json = excluded.col_map_json,
                file_ids_json = excluded.file_ids_json,
                fix_actions_json = excluded.fix_actions_json,
                result_json = excluded.result_json,
                error = excluded.error,
                handoff_workbook_path = excluded.handoff_workbook_path,
                handoff_workbook_name = excluded.handoff_workbook_name,
                handoff_source = excluded.handoff_source,
                updated_at = excluded.updated_at
            """,
            (
                payload["run_id"],
                month_cycle_id,
                payload.get("entity_id"),
                payload.get("period"),
                version_no,
                payload.get("status"),
                payload.get("business_context"),
                _dump(payload.get("company_gstins", [])),
                _dump(payload.get("garden_assignments", [])),
                _dump(payload.get("garden_files", [])),
                _dump(payload.get("col_map", {})),
                _dump(payload.get("file_ids", [])),
                _dump(payload.get("fix_actions", [])),
                _dump(result) if result is not None else None,
                payload.get("error"),
                payload.get("handoff_workbook_path"),
                payload.get("handoff_workbook_name"),
                payload.get("handoff_source"),
                payload.get("created_at") or now,
                now,
            ),
        )

        connection.execute("DELETE FROM books_source_files WHERE run_id = ?", (payload["run_id"],))
        for file_id in payload.get("file_ids", []):
            upload = get_upload(file_id) or {}
            connection.execute(
                """
                INSERT INTO books_source_files (
                    run_id, file_id, original_filename, file_path, sheet_names_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["run_id"],
                    file_id,
                    upload.get("original_filename"),
                    upload.get("file_path"),
                    _dump(upload.get("sheet_names", [])),
                    now,
                ),
            )

        connection.execute("DELETE FROM fix_actions WHERE run_id = ?", (payload["run_id"],))
        for idx, action in enumerate(payload.get("fix_actions", []), start=1):
            connection.execute(
                """
                INSERT INTO fix_actions (
                    run_id, sequence_no, field, fix_type, scope,
                    reference_rows_json, match_criteria_json, action_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["run_id"],
                    idx,
                    action.get("field"),
                    action.get("fix_type"),
                    action.get("scope"),
                    _dump(action.get("reference_rows", [])),
                    _dump(action.get("match_criteria", {})),
                    _dump(action),
                    now,
                ),
            )

        connection.execute("DELETE FROM books_invoice_facts WHERE run_id = ?", (payload["run_id"],))
        connection.execute("DELETE FROM books_run_clean_items WHERE run_id = ?", (payload["run_id"],))
        connection.execute("DELETE FROM books_run_warning_items WHERE run_id = ?", (payload["run_id"],))
        connection.execute("DELETE FROM books_run_error_items WHERE run_id = ?", (payload["run_id"],))

        for row in result.get("clean_invoices", []):
            _insert_books_item(connection, payload["run_id"], row, "books_run_clean_items", now)
            _insert_books_fact(connection, payload["run_id"], row, payload.get("period"), now)

        for row in result.get("warning_invoices", []):
            _insert_books_item(connection, payload["run_id"], row, "books_run_warning_items", now)

        for row in result.get("identity_errors", []):
            connection.execute(
                "INSERT INTO books_run_error_items (run_id, category, row_json, created_at) VALUES (?, ?, ?, ?)",
                (payload["run_id"], row.get("category") or "IDENTITY", _dump(row), now),
            )

        for row in result.get("aggregation_errors", []):
            connection.execute(
                "INSERT INTO books_run_error_items (run_id, category, row_json, created_at) VALUES (?, ?, ?, ?)",
                (payload["run_id"], row.get("category") or "AGGREGATION", _dump(row), now),
            )

        if month_cycle_id:
            connection.execute(
                """
                UPDATE month_cycles
                SET current_books_run_id = ?, books_filing_context = ?, updated_at = ?
                WHERE month_cycle_id = ?
                """,
                (payload["run_id"], payload.get("business_context"), now, month_cycle_id),
            )
            _insert_audit_event(
                connection,
                payload.get("entity_id"),
                payload.get("period"),
                "BOOKS_RUN_SAVED",
                "books_run",
                payload["run_id"],
                {"status": payload.get("status"), "version_no": version_no},
            )

        connection.commit()


def _insert_books_item(
    connection: sqlite3.Connection,
    run_id: str,
    row: Dict[str, Any],
    table_name: str,
    created_at: str,
) -> None:
    connection.execute(
        f"INSERT INTO {table_name} (run_id, invoice_key, row_json, created_at) VALUES (?, ?, ?, ?)",
        (run_id, row.get("invoice_key"), _dump(row), created_at),
    )


def _insert_books_fact(
    connection: sqlite3.Connection,
    run_id: str,
    row: Dict[str, Any],
    reco_period: Optional[str],
    created_at: str,
) -> None:
    connection.execute(
        """
        INSERT INTO books_invoice_facts (
            run_id, invoice_key, supplier_gstin, invoice_number, invoice_date,
            source_document_date, supplier_filed_period, visible_in_2b_period, reco_period,
            taxable_value, igst_amount, cgst_amount, sgst_amount, total_invoice_value,
            source_type, document_type, row_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            row.get("invoice_key"),
            row.get("gstin") or row.get("supplier_gstin"),
            row.get("invoice_number"),
            row.get("invoice_date"),
            row.get("invoice_date"),
            row.get("supplier_filed_period"),
            row.get("visible_in_2b_period"),
            reco_period,
            row.get("taxable_value"),
            row.get("igst_amount"),
            row.get("cgst_amount"),
            row.get("sgst_amount"),
            row.get("total_invoice_value") or row.get("invoice_value"),
            "BOOKS",
            row.get("document_type"),
            _dump(row),
            created_at,
        ),
    )


def save_certified_run(record: Any) -> None:
    payload = asdict(record) if is_dataclass(record) else dict(record)
    with get_connection() as connection:
        columns = _column_names(connection, "certified_runs")
        period_value = payload["period"]
        if "period" in columns:
            connection.execute(
                """
                DELETE FROM certified_runs
                WHERE entity_id = ? AND period = ? AND certification_id <> ?
                """,
                (payload["entity_id"], period_value, payload["certification_id"]),
            )
        else:
            connection.execute(
                """
                DELETE FROM certified_runs
                WHERE entity_id = ? AND return_period = ? AND certification_id <> ?
                """,
                (payload["entity_id"], period_value, payload["certification_id"]),
            )
        if "period" in columns:
            connection.execute(
                """
                INSERT INTO certified_runs (
                    certification_id, run_id, entity_id, period, return_period, business_context,
                    status, summary_json, results_json, fixes_json, certified_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(certification_id) DO UPDATE SET
                    run_id = excluded.run_id,
                    entity_id = excluded.entity_id,
                    period = excluded.period,
                    return_period = excluded.return_period,
                    business_context = excluded.business_context,
                    status = excluded.status,
                    summary_json = excluded.summary_json,
                    results_json = excluded.results_json,
                    fixes_json = excluded.fixes_json,
                    certified_at = excluded.certified_at
                """,
                (
                    payload["certification_id"],
                    payload["run_id"],
                    payload["entity_id"],
                    period_value,
                    period_value,
                    payload.get("business_context"),
                    payload.get("status", "certified"),
                    _dump(payload.get("summary", {})),
                    _dump(payload.get("results", {})),
                    _dump(payload.get("fixes", [])),
                    payload.get("certified_at") or _utcnow(),
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO certified_runs (
                    certification_id, run_id, entity_id, return_period, business_context,
                    status, summary_json, results_json, fixes_json, certified_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(certification_id) DO UPDATE SET
                    run_id = excluded.run_id,
                    entity_id = excluded.entity_id,
                    return_period = excluded.return_period,
                    business_context = excluded.business_context,
                    status = excluded.status,
                    summary_json = excluded.summary_json,
                    results_json = excluded.results_json,
                    fixes_json = excluded.fixes_json,
                    certified_at = excluded.certified_at
                """,
                (
                    payload["certification_id"],
                    payload["run_id"],
                    payload["entity_id"],
                    period_value,
                    payload.get("business_context"),
                    payload.get("status", "certified"),
                    _dump(payload.get("summary", {})),
                    _dump(payload.get("results", {})),
                    _dump(payload.get("fixes", [])),
                    payload.get("certified_at") or _utcnow(),
                ),
            )
        month_cycle_id = _get_or_create_month_cycle(
            connection,
            payload.get("entity_id"),
            payload.get("period"),
            payload.get("business_context"),
        )
        if month_cycle_id:
            connection.execute(
                """
                UPDATE month_cycles
                SET current_certification_id = ?, updated_at = ?
                WHERE month_cycle_id = ?
                """,
                (payload["certification_id"], _utcnow(), month_cycle_id),
            )
        _insert_audit_event(
            connection,
            payload.get("entity_id"),
            payload.get("period"),
            "BOOKS_CERTIFIED",
            "certified_run",
            payload["certification_id"],
            {"run_id": payload["run_id"]},
        )
        connection.commit()


def save_reco(reco: Any, upload_records: Optional[List[Dict[str, Any]]] = None) -> None:
    payload = asdict(reco) if is_dataclass(reco) else dict(reco)
    parent_run = get_run(payload["parent_run_id"])
    entity_id = parent_run["entity_id"] if parent_run else None
    return_period = parent_run["period"] if parent_run else None
    business_context = parent_run["business_context"] if parent_run else None
    canonical_invoices = payload.get("canonical_invoices", []) or []
    match_results = payload.get("match_results") or {}
    with get_connection() as connection:
        month_cycle_id = _get_or_create_month_cycle(connection, entity_id, return_period, business_context)
        _ensure_column(connection, "reco_runs", "month_cycle_id", "INTEGER")
        _ensure_column(connection, "reco_runs", "return_period", "TEXT")
        _ensure_column(connection, "reco_runs", "version_no", "INTEGER NOT NULL DEFAULT 1")
        _ensure_column(connection, "reco_runs", "declared_period", "TEXT")
        _ensure_column(connection, "reco_runs", "upload_ids_json", "TEXT NOT NULL DEFAULT '[]'")
        _ensure_column(connection, "reco_runs", "canonical_stats_json", "TEXT")
        _ensure_column(connection, "reco_runs", "match_results_json", "TEXT")
        _ensure_column(connection, "reco_runs", "error", "TEXT")
        _ensure_column(connection, "reco_runs", "updated_at", "TEXT")
        version_no = _next_version(
            connection,
            "reco_runs",
            entity_id,
            return_period,
            "reco_id",
            payload["reco_id"],
        )
        now = _utcnow()
        reco_columns = _column_names(connection, "reco_runs")
        if "period" in reco_columns:
            connection.execute(
                """
                INSERT INTO reco_runs (
                    reco_id, month_cycle_id, parent_run_id, entity_id, period, return_period, version_no,
                    declared_gstin, declared_period, status, upload_ids_json, canonical_stats_json,
                    match_results_json, error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(reco_id) DO UPDATE SET
                    month_cycle_id = excluded.month_cycle_id,
                    parent_run_id = excluded.parent_run_id,
                    entity_id = excluded.entity_id,
                    period = excluded.period,
                    return_period = excluded.return_period,
                    version_no = excluded.version_no,
                    declared_gstin = excluded.declared_gstin,
                    declared_period = excluded.declared_period,
                    status = excluded.status,
                    upload_ids_json = excluded.upload_ids_json,
                    canonical_stats_json = excluded.canonical_stats_json,
                    match_results_json = excluded.match_results_json,
                    error = excluded.error,
                    updated_at = excluded.updated_at
                """,
                (
                    payload["reco_id"],
                    month_cycle_id,
                    payload["parent_run_id"],
                    entity_id,
                    return_period,
                    return_period,
                    version_no,
                    payload.get("declared_gstin"),
                    payload.get("declared_period"),
                    payload.get("status"),
                    _dump(payload.get("upload_ids", [])),
                    _dump(payload.get("canonical_stats")),
                    _dump(match_results),
                    payload.get("error"),
                    payload.get("created_at") or now,
                    now,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO reco_runs (
                    reco_id, month_cycle_id, parent_run_id, entity_id, return_period, version_no,
                    declared_gstin, declared_period, status, upload_ids_json, canonical_stats_json,
                    match_results_json, error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(reco_id) DO UPDATE SET
                    month_cycle_id = excluded.month_cycle_id,
                    parent_run_id = excluded.parent_run_id,
                    entity_id = excluded.entity_id,
                    return_period = excluded.return_period,
                    version_no = excluded.version_no,
                    declared_gstin = excluded.declared_gstin,
                    declared_period = excluded.declared_period,
                    status = excluded.status,
                    upload_ids_json = excluded.upload_ids_json,
                    canonical_stats_json = excluded.canonical_stats_json,
                    match_results_json = excluded.match_results_json,
                    error = excluded.error,
                    updated_at = excluded.updated_at
                """,
                (
                    payload["reco_id"],
                    month_cycle_id,
                    payload["parent_run_id"],
                    entity_id,
                    return_period,
                    version_no,
                    payload.get("declared_gstin"),
                    payload.get("declared_period"),
                    payload.get("status"),
                    _dump(payload.get("upload_ids", [])),
                    _dump(payload.get("canonical_stats")),
                    _dump(match_results),
                    payload.get("error"),
                    payload.get("created_at") or now,
                    now,
                ),
            )

        if upload_records is not None:
            connection.execute("DELETE FROM reco_uploads WHERE reco_id = ?", (payload["reco_id"],))
            for item in upload_records:
                connection.execute(
                    """
                    INSERT INTO reco_uploads (
                        reco_id, upload_id, original_filename, file_path,
                        declared_gstin, declared_period, metadata_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["reco_id"],
                        item.get("upload_id"),
                        item.get("original_filename"),
                        item.get("file_path"),
                        payload.get("declared_gstin"),
                        payload.get("declared_period"),
                        _dump(item.get("metadata")),
                        now,
                    ),
                )

        connection.execute("DELETE FROM reco_canonical_facts WHERE reco_id = ?", (payload["reco_id"],))
        for row in canonical_invoices:
            _insert_canonical_fact(connection, payload["reco_id"], row, payload.get("declared_period"), now)

        connection.execute("DELETE FROM reco_value_deltas WHERE reco_match_item_id IN (SELECT id FROM reco_match_items WHERE reco_id = ?)", (payload["reco_id"],))
        connection.execute("DELETE FROM reco_match_items WHERE reco_id = ?", (payload["reco_id"],))
        if match_results:
            for row in match_results.get("match_results", []):
                match_item_id = _insert_match_item(connection, payload["reco_id"], row, payload.get("declared_period"), now)
                for delta in row.get("value_deltas", []) or []:
                    connection.execute(
                        """
                        INSERT INTO reco_value_deltas (
                            reco_match_item_id, field_name, books_value, reco_value, delta, within_tolerance
                        ) VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            match_item_id,
                            delta.get("field"),
                            delta.get("books_value"),
                            delta.get("reco_value"),
                            delta.get("delta"),
                            1 if delta.get("within_tolerance") else 0,
                        ),
                    )
            for identity_key in match_results.get("unmatched_2b", []) or []:
                connection.execute(
                    """
                    INSERT INTO reco_match_items (
                        reco_id, books_invoice_id, matched_2b_invoice_id, supplier_gstin,
                        invoice_number, invoice_date, match_status, action_state,
                        carried_forward_from_period, carry_forward_flag, row_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["reco_id"],
                        identity_key,
                        identity_key,
                        None,
                        None,
                        None,
                        "MISSING_IN_BOOKS",
                        "UNREVIEWED",
                        payload.get("declared_period"),
                        1,
                        _dump({"matched_2b_invoice_id": identity_key, "match_status": "MISSING_IN_BOOKS"}),
                        now,
                    ),
                )

        if month_cycle_id:
            connection.execute(
                """
                UPDATE month_cycles
                SET current_reco_run_id = ?, static_2b_snapshot_date = COALESCE(static_2b_snapshot_date, ?), updated_at = ?
                WHERE month_cycle_id = ?
                """,
                (payload["reco_id"], payload.get("created_at") or now, now, month_cycle_id),
            )
            _insert_audit_event(
                connection,
                entity_id,
                return_period,
                "RECO_RUN_SAVED",
                "reco_run",
                payload["reco_id"],
                {"status": payload.get("status"), "version_no": version_no},
            )

        connection.commit()


def _insert_canonical_fact(
    connection: sqlite3.Connection,
    reco_id: str,
    row: Dict[str, Any],
    reco_period: Optional[str],
    created_at: str,
) -> None:
    connection.execute(
        """
        INSERT INTO reco_canonical_facts (
            reco_id, identity_key, supplier_gstin, invoice_number, invoice_date,
            source_document_date, supplier_filed_period, visible_in_2b_period, reco_period,
            taxable_value, igst_amount, cgst_amount, sgst_amount, total_invoice_value,
            total_gst_amount, source_type, document_type, row_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reco_id,
            row.get("invoice_id") or row.get("identity_key") or row.get("source_2b_ref"),
            row.get("supplier_gstin"),
            row.get("invoice_number"),
            row.get("invoice_date"),
            row.get("invoice_date"),
            row.get("filing_period"),
            row.get("visible_in_2b_period") or reco_period,
            reco_period,
            row.get("taxable_value"),
            row.get("igst_amount"),
            row.get("cgst_amount"),
            row.get("sgst_amount"),
            row.get("invoice_value"),
            row.get("total_gst_amount"),
            "2B",
            row.get("document_type"),
            _dump(row),
            created_at,
        ),
    )


def _insert_match_item(
    connection: sqlite3.Connection,
    reco_id: str,
    row: Dict[str, Any],
    declared_period: Optional[str],
    created_at: str,
) -> int:
    status = row.get("match_status")
    carry_forward = 1 if status not in {"MATCHED_STRICT", "MATCHED_RELAXED"} else 0
    cursor = connection.execute(
        """
        INSERT INTO reco_match_items (
            reco_id, books_invoice_id, matched_2b_invoice_id, supplier_gstin, invoice_number,
            invoice_date, match_status, match_method, action_state, action_effective_period,
            carried_forward_from_period, carry_forward_flag, row_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reco_id,
            row.get("books_invoice_id"),
            row.get("matched_2b_invoice_id"),
            row.get("books_supplier_gstin") or row.get("canonical_supplier_gstin"),
            row.get("books_invoice_number") or row.get("canonical_invoice_number"),
            row.get("books_invoice_date") or row.get("canonical_invoice_date"),
            status,
            row.get("match_method"),
            row.get("action_state") or "UNREVIEWED",
            row.get("action_effective_period") or declared_period,
            declared_period if carry_forward else None,
            carry_forward,
            _dump(row),
            created_at,
        ),
    )
    return int(cursor.lastrowid)


def save_export_record(record: Any) -> None:
    payload = asdict(record) if is_dataclass(record) else dict(record)
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO export_records (
                export_id, run_id, reco_id, certification_id, file_name, file_path,
                approved, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(export_id) DO UPDATE SET
                run_id = excluded.run_id,
                reco_id = excluded.reco_id,
                certification_id = excluded.certification_id,
                file_name = excluded.file_name,
                file_path = excluded.file_path,
                approved = excluded.approved,
                updated_at = excluded.updated_at
            """,
            (
                payload["export_id"],
                payload.get("run_id"),
                payload.get("reco_id"),
                payload.get("certification_id"),
                payload["file_name"],
                payload["file_path"],
                1 if payload.get("approved") else 0,
                payload.get("created_at") or _utcnow(),
                _utcnow(),
            ),
        )
        _insert_audit_event(
            connection,
            None,
            None,
            "EXPORT_CREATED",
            "export",
            payload["export_id"],
            {"run_id": payload.get("run_id"), "reco_id": payload.get("reco_id")},
        )
        connection.commit()


def mark_export_approved(export_id: str) -> None:
    with get_connection() as connection:
        connection.execute(
            "UPDATE export_records SET approved = 1, updated_at = ? WHERE export_id = ?",
            (_utcnow(), export_id),
        )
        connection.commit()


def _insert_audit_event(
    connection: sqlite3.Connection,
    entity_id: Optional[str],
    return_period: Optional[str],
    event_type: str,
    ref_type: Optional[str],
    ref_id: Optional[str],
    payload: Any,
) -> None:
    connection.execute(
        """
        INSERT INTO audit_events (
            entity_id, return_period, event_type, ref_type, ref_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (entity_id, return_period, event_type, ref_type, ref_id, _dump(payload), _utcnow()),
    )


def _row_to_run(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "run_id": row["run_id"],
        "status": row["status"],
        "entity_id": row["entity_id"],
        "period": row["return_period"],
        "business_context": row["business_context"],
        "company_gstins": _load(row["company_gstins_json"], []),
        "garden_assignments": _load(row["garden_assignments_json"], []),
        "garden_files": _load(row["garden_files_json"], []),
        "col_map": _load(row["col_map_json"], {}),
        "file_ids": _load(row["file_ids_json"], []),
        "fix_actions": _load(row["fix_actions_json"], []),
        "result": _load(row["result_json"], None),
        "handoff_workbook_path": row["handoff_workbook_path"],
        "handoff_workbook_name": row["handoff_workbook_name"],
        "handoff_source": row["handoff_source"],
        "error": row["error"],
        "created_at": row["created_at"],
    }


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM books_runs WHERE run_id = ?", (run_id,)).fetchone()
    return _row_to_run(row) if row else None


def get_latest_run(entity_id: str, period: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM books_runs
            WHERE entity_id = ? AND return_period = ?
            ORDER BY version_no DESC, updated_at DESC
            LIMIT 1
            """,
            (entity_id, period),
        ).fetchone()
    return _row_to_run(row) if row else None


def _row_to_reco(row: sqlite3.Row, canonical_invoices: List[Dict[str, Any]], upload_metadata: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "reco_id": row["reco_id"],
        "parent_run_id": row["parent_run_id"],
        "status": row["status"],
        "declared_gstin": row["declared_gstin"],
        "declared_period": row["declared_period"],
        "upload_ids": _load(row["upload_ids_json"], []),
        "canonical_invoices": canonical_invoices,
        "canonical_stats": _load(row["canonical_stats_json"], None),
        "match_results": _load(row["match_results_json"], None),
        "error": row["error"],
        "created_at": row["created_at"],
        "upload_metadata_list": upload_metadata,
    }


def get_reco(reco_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM reco_runs WHERE reco_id = ?", (reco_id,)).fetchone()
        if not row:
            return None
        canonical_rows = connection.execute(
            "SELECT row_json FROM reco_canonical_facts WHERE reco_id = ? ORDER BY id",
            (reco_id,),
        ).fetchall()
        upload_rows = connection.execute(
            "SELECT * FROM reco_uploads WHERE reco_id = ? ORDER BY id",
            (reco_id,),
        ).fetchall()
    return _row_to_reco(
        row,
        [_load(item["row_json"], {}) for item in canonical_rows],
        [
            {
                "upload_id": item["upload_id"],
                "original_filename": item["original_filename"],
                "file_path": item["file_path"],
                "metadata": _load(item["metadata_json"], {}),
            }
            for item in upload_rows
        ],
    )


def get_certified_by_run_id(run_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM certified_runs
            WHERE run_id = ?
            ORDER BY certified_at DESC
            LIMIT 1
            """,
            (run_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "certification_id": row["certification_id"],
        "run_id": row["run_id"],
        "entity_id": row["entity_id"],
        "period": row["return_period"],
        "business_context": row["business_context"],
        "status": row["status"],
        "summary": _load(row["summary_json"], {}),
        "results": _load(row["results_json"], {}),
        "fixes": _load(row["fixes_json"], []),
        "certified_at": row["certified_at"],
    }


def get_export(export_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM export_records WHERE export_id = ?", (export_id,)).fetchone()
    if not row:
        return None
    return {
        "export_id": row["export_id"],
        "run_id": row["run_id"],
        "reco_id": row["reco_id"],
        "certification_id": row["certification_id"],
        "file_path": row["file_path"],
        "file_name": row["file_name"],
        "approved": bool(row["approved"]),
        "created_at": row["created_at"],
    }


def get_latest_export_for_run(run_id: str, approved_only: bool = False) -> Optional[Dict[str, Any]]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM export_records
            WHERE run_id = ? AND (? = 0 OR approved = 1)
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (run_id, 1 if approved_only else 0),
        ).fetchone()
    if not row:
        return None
    return get_export(row["export_id"])


def list_month_cycles(entity_id: Optional[str] = None) -> List[Dict[str, Any]]:
    sql = """
        SELECT mc.*, br.status AS books_status, rr.status AS reco_status, cr.certified_at
        FROM month_cycles mc
        LEFT JOIN books_runs br ON br.run_id = mc.current_books_run_id
        LEFT JOIN reco_runs rr ON rr.reco_id = mc.current_reco_run_id
        LEFT JOIN certified_runs cr ON cr.certification_id = mc.current_certification_id
    """
    params: List[Any] = []
    if entity_id:
        sql += " WHERE mc.entity_id = ?"
        params.append(entity_id)
    sql += " ORDER BY mc.return_period DESC, mc.entity_id ASC"
    with get_connection() as connection:
        rows = connection.execute(sql, params).fetchall()
    return [
        {
            "entity_id": row["entity_id"],
            "period": row["return_period"],
            "business_context": row["business_context"],
            "books_status": row["books_status"],
            "reco_status": row["reco_status"],
            "ims_review_state": row["ims_review_state"],
            "gstr3b_filing_status": row["gstr3b_filing_status"],
            "is_finalized": bool(row["is_finalized"]),
            "current_books_run_id": row["current_books_run_id"],
            "current_reco_run_id": row["current_reco_run_id"],
            "current_certification_id": row["current_certification_id"],
            "finalized_at": row["finalized_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def get_month_cycle(entity_id: str, period: str) -> Optional[Dict[str, Any]]:
    cycles = list_month_cycles(entity_id)
    for cycle in cycles:
        if cycle["period"] == period:
            cycle["distribution"] = get_reco_distribution(entity_id, period)
            cycle["followups"] = get_supplier_followups(entity_id, period)
            return cycle
    return None


def get_month_cycle_history(entity_id: str, period: str) -> Dict[str, Any]:
    with get_connection() as connection:
        books_rows = connection.execute(
            """
            SELECT run_id, version_no, status, created_at, updated_at
            FROM books_runs WHERE entity_id = ? AND return_period = ?
            ORDER BY version_no DESC
            """,
            (entity_id, period),
        ).fetchall()
        reco_rows = connection.execute(
            """
            SELECT reco_id, parent_run_id, version_no, status, created_at, updated_at
            FROM reco_runs WHERE entity_id = ? AND return_period = ?
            ORDER BY version_no DESC
            """,
            (entity_id, period),
        ).fetchall()
        audit_rows = connection.execute(
            """
            SELECT event_type, ref_type, ref_id, payload_json, created_at
            FROM audit_events WHERE entity_id = ? AND return_period = ?
            ORDER BY created_at DESC, id DESC
            """,
            (entity_id, period),
        ).fetchall()
    return {
        "entity_id": entity_id,
        "period": period,
        "books_runs": [dict(row) for row in books_rows],
        "reco_runs": [dict(row) for row in reco_rows],
        "audit_events": [
            {
                "event_type": row["event_type"],
                "ref_type": row["ref_type"],
                "ref_id": row["ref_id"],
                "payload": _load(row["payload_json"], {}),
                "created_at": row["created_at"],
            }
            for row in audit_rows
        ],
    }


def get_reco_distribution(entity_id: str, period: str) -> Dict[str, int]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT current_reco_run_id FROM month_cycles WHERE entity_id = ? AND return_period = ?
            """,
            (entity_id, period),
        ).fetchone()
        if not row or not row["current_reco_run_id"]:
            return {}
        items = connection.execute(
            """
            SELECT match_status, COUNT(*) AS count
            FROM reco_match_items
            WHERE reco_id = ?
            GROUP BY match_status
            """,
            (row["current_reco_run_id"],),
        ).fetchall()
    return {item["match_status"]: int(item["count"]) for item in items}


def get_dashboard_stats(entity_id: str, period: str) -> Dict[str, Any]:
    cycle = get_month_cycle(entity_id, period)
    distribution = get_reco_distribution(entity_id, period)
    total_matches = sum(distribution.values())
    matched = distribution.get("MATCHED_STRICT", 0) + distribution.get("MATCHED_RELAXED", 0)
    run = get_latest_run(entity_id, period)
    summary = ((run or {}).get("result") or {}).get("summary", {})
    reco_id = (cycle or {}).get("current_reco_run_id")
    pending_2b = total_matches - matched
    supplier_followups = len(get_supplier_followups(entity_id, period))
    matched_gst = 0.0
    with get_connection() as connection:
        run_count = connection.execute(
            "SELECT COUNT(*) AS total FROM books_runs WHERE entity_id = ?",
            (entity_id,),
        ).fetchone()
        if reco_id:
            matched_gst_row = connection.execute(
                """
                SELECT COALESCE(SUM(COALESCE(canonical_total_gst, books_total_gst, 0)), 0) AS matched_gst
                FROM reco_match_items
                WHERE reco_id = ? AND match_status IN ('MATCHED_STRICT', 'MATCHED_RELAXED')
                """,
                (reco_id,),
            ).fetchone()
            matched_gst = float(matched_gst_row["matched_gst"] or 0) if matched_gst_row else 0.0
    return {
        "kpis": {
            "total_runs": int(run_count["total"]) if run_count else 0,
            "match_rate": round((matched / total_matches) * 100) if total_matches else 0,
            "at_risk_itc": 0,
            "total_invoices": summary.get("valid_invoices", 0),
            "books_clean": summary.get("valid_invoices", 0),
            "books_pending": summary.get("warning_count", 0) + summary.get("aggregation_error_count", 0) + summary.get("identity_error_count", 0),
            "matched_invoices": matched,
            "pending_2b": pending_2b,
            "supplier_followups": supplier_followups,
            "matched_gst": matched_gst,
        },
        "distribution": distribution,
        "trends": [],
        "latest_certified": cycle,
    }


def get_reco_exceptions(
    reco_id: str,
    status: Optional[str] = None,
    action_state: Optional[str] = None,
    age_bucket: Optional[str] = None,
) -> List[Dict[str, Any]]:
    sql = """
        SELECT rmi.*, rr.declared_period
        FROM reco_match_items rmi
        JOIN reco_runs rr ON rr.reco_id = rmi.reco_id
        WHERE rmi.reco_id = ?
    """
    params: List[Any] = [reco_id]
    if status:
        sql += " AND rmi.match_status = ?"
        params.append(status)
    if action_state:
        sql += " AND rmi.action_state = ?"
        params.append(action_state)
    sql += " ORDER BY rmi.id"
    with get_connection() as connection:
        rows = connection.execute(sql, params).fetchall()
    items = []
    for row in rows:
        payload = _load(row["row_json"], {})
        if age_bucket:
            created = datetime.fromisoformat(row["created_at"])
            age_days = (datetime.utcnow() - created).days
            if age_bucket == "0_30" and age_days > 30:
                continue
            if age_bucket == "31_90" and not (31 <= age_days <= 90):
                continue
            if age_bucket == "90_plus" and age_days < 91:
                continue
        items.append(
            {
                **payload,
                "action_state": row["action_state"],
                "action_effective_period": row["action_effective_period"],
                "action_frozen_at_3b_filing": bool(row["action_frozen_at_3b_filing"]),
                "carried_forward_from_period": row["carried_forward_from_period"],
                "carried_forward_to_period": row["carried_forward_to_period"],
                "carry_forward_flag": bool(row["carry_forward_flag"]),
                "review_notes": row["review_notes"],
                "created_at": row["created_at"],
            }
        )
    return items


def get_supplier_followups(entity_id: str, period: Optional[str] = None) -> List[Dict[str, Any]]:
    sql = """
        SELECT rmi.supplier_gstin, COUNT(*) AS invoice_count, MAX(rmi.created_at) AS last_seen
        FROM reco_match_items rmi
        JOIN reco_runs rr ON rr.reco_id = rmi.reco_id
        WHERE rr.entity_id = ?
          AND rmi.match_status IN ('MISSING_IN_2B', 'MISSING_IN_BOOKS', 'VALUE_MISMATCH', 'AMBIGUOUS_MATCH', 'POSSIBLE_MATCH')
    """
    params: List[Any] = [entity_id]
    if period:
        sql += " AND rr.return_period = ?"
        params.append(period)
    sql += " GROUP BY rmi.supplier_gstin ORDER BY invoice_count DESC, supplier_gstin"
    with get_connection() as connection:
        rows = connection.execute(sql, params).fetchall()
    return [
        {
            "supplier_gstin": row["supplier_gstin"],
            "open_exception_count": int(row["invoice_count"]),
            "last_seen": row["last_seen"],
        }
        for row in rows
        if row["supplier_gstin"]
    ]


def close_month_cycle(entity_id: str, period: str) -> Dict[str, Any]:
    now = _utcnow()
    with get_connection() as connection:
        cycle = connection.execute(
            "SELECT month_cycle_id, current_reco_run_id FROM month_cycles WHERE entity_id = ? AND return_period = ?",
            (entity_id, period),
        ).fetchone()
        if not cycle:
            raise ValueError("Month cycle not found")
        connection.execute(
            """
            UPDATE month_cycles
            SET is_finalized = 1, finalized_at = ?, gstr3b_filing_status = 'FILED', updated_at = ?
            WHERE month_cycle_id = ?
            """,
            (now, now, cycle["month_cycle_id"]),
        )
        if cycle["current_reco_run_id"]:
            connection.execute(
                """
                UPDATE reco_match_items
                SET action_frozen_at_3b_filing = 1,
                    carried_forward_to_period = CASE
                        WHEN action_state = 'PENDING' OR match_status NOT IN ('MATCHED_STRICT', 'MATCHED_RELAXED')
                        THEN ?
                        ELSE carried_forward_to_period
                    END
                WHERE reco_id = ?
                """,
                (period, cycle["current_reco_run_id"]),
            )
        _insert_audit_event(connection, entity_id, period, "MONTH_CLOSED", "month_cycle", str(cycle["month_cycle_id"]), {})
        connection.commit()
    return {"entity_id": entity_id, "period": period, "closed_at": now, "gstr3b_filing_status": "FILED"}
