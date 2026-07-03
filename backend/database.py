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


def _parse_period_date(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value

    text = str(value).strip()
    if not text:
        return None

    normalized = text.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        pass

    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _derive_return_period_from_invoice_dates(rows: List[Dict[str, Any]], fallback: Optional[str] = None) -> Optional[str]:
    period_counts: Dict[str, int] = {}
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        invoice_dt = _parse_period_date(
            row.get("invoice_date") or row.get("source_document_date") or row.get("document_date")
        )
        if not invoice_dt:
            continue
        period_key = invoice_dt.strftime("%Y-%m")
        period_counts[period_key] = period_counts.get(period_key, 0) + 1

    if not period_counts:
        return fallback

    return sorted(period_counts.items(), key=lambda item: (item[1], item[0]), reverse=True)[0][0]


def _row_return_period(row: Dict[str, Any], fallback: Optional[str] = None) -> Optional[str]:
    if not isinstance(row, dict):
        return fallback
    invoice_dt = _parse_period_date(
        row.get("invoice_date") or row.get("source_document_date") or row.get("document_date")
    )
    if invoice_dt:
        return invoice_dt.strftime("%Y-%m")
    return fallback


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
                entity_id TEXT NOT NULL,
                invoice_key TEXT,
                row_hash TEXT NOT NULL,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE,
                UNIQUE(entity_id, row_hash)
            );

            CREATE TABLE IF NOT EXISTS books_run_warning_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                invoice_key TEXT,
                row_hash TEXT NOT NULL,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE,
                UNIQUE(entity_id, row_hash)
            );

            CREATE TABLE IF NOT EXISTS books_run_error_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                category TEXT,
                row_hash TEXT NOT NULL,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE,
                UNIQUE(entity_id, row_hash)
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
                canonical_invoices_json TEXT NOT NULL DEFAULT '[]',
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
                entity_id TEXT,
                return_period TEXT,
                row_hash TEXT,
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
                entity_id TEXT,
                return_period TEXT,
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
                source_reco_period TEXT,
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

            CREATE TABLE IF NOT EXISTS raw_books_uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                entity_id TEXT,
                return_period TEXT,
                garden_name TEXT,
                original_filename TEXT,
                row_index INTEGER,
                row_hash TEXT NOT NULL,
                row_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES books_runs(run_id) ON DELETE CASCADE,
                UNIQUE(entity_id, row_hash)
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
            _ensure_column(connection, "reco_runs", "canonical_invoices_json", "TEXT NOT NULL DEFAULT '[]'")
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
                """
                UPDATE reco_runs
                SET canonical_invoices_json = COALESCE(canonical_invoices_json, '[]')
                WHERE canonical_invoices_json IS NULL OR canonical_invoices_json = ''
                """
            )
            connection.execute(
                "UPDATE reco_runs SET updated_at = COALESCE(updated_at, created_at, ?)",
                (_utcnow(),),
            )

        if _table_exists(connection, "reco_canonical_facts"):
            _ensure_column(connection, "reco_canonical_facts", "entity_id", "TEXT")
            _ensure_column(connection, "reco_canonical_facts", "return_period", "TEXT")
            _ensure_column(connection, "reco_canonical_facts", "row_hash", "TEXT")
            connection.execute(
                """
                UPDATE reco_canonical_facts
                SET entity_id = COALESCE(
                    entity_id,
                    (SELECT rr.entity_id FROM reco_runs rr WHERE rr.reco_id = reco_canonical_facts.reco_id)
                )
                WHERE entity_id IS NULL OR entity_id = ''
                """
            )
            connection.execute(
                """
                UPDATE reco_canonical_facts
                SET return_period = COALESCE(
                    return_period,
                    CASE
                        WHEN invoice_date IS NOT NULL AND LENGTH(invoice_date) >= 7 THEN SUBSTR(invoice_date, 1, 7)
                        ELSE NULL
                    END,
                    visible_in_2b_period,
                    reco_period
                )
                WHERE return_period IS NULL OR return_period = ''
                """
            )
            connection.execute(
                """
                UPDATE reco_canonical_facts
                SET row_hash = COALESCE(row_hash, row_json)
                WHERE row_hash IS NULL OR row_hash = ''
                """
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
        # Schema Migrations
        migrations = [
            "ALTER TABLE reco_match_items ADD COLUMN entity_id TEXT",
            "ALTER TABLE reco_match_items ADD COLUMN return_period TEXT",
            "ALTER TABLE reco_match_items ADD COLUMN carried_forward_from_period TEXT",
            "ALTER TABLE reco_match_items ADD COLUMN carried_forward_to_period TEXT",
            "ALTER TABLE reco_match_items ADD COLUMN source_reco_period TEXT",
            "ALTER TABLE reco_match_items ADD COLUMN carry_forward_flag INTEGER NOT NULL DEFAULT 0"
        ]
        for m in migrations:
            try:
                connection.execute(m)
            except Exception:
                pass

        connection.execute("DROP INDEX IF EXISTS idx_books_invoice_identity")
        connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_books_invoice_identity ON books_invoice_facts(supplier_gstin, invoice_number, invoice_date)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_runs_entity_period ON reco_runs(entity_id, return_period)"
        )
        connection.execute("DROP INDEX IF EXISTS idx_reco_canonical_identity")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_canonical_identity ON reco_canonical_facts(supplier_gstin, invoice_number, invoice_date)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_canonical_visible_period ON reco_canonical_facts(visible_in_2b_period)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_canonical_entity_period ON reco_canonical_facts(entity_id, return_period)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_canonical_reco_hash ON reco_canonical_facts(reco_id, row_hash)"
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
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_match_entity_period ON reco_match_items(entity_id, return_period)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_reco_match_status_period ON reco_match_items(match_status, return_period)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_raw_books_entity_period ON raw_books_uploads(entity_id, return_period)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_raw_books_garden ON raw_books_uploads(return_period, garden_name)"
        )

        if _table_exists(connection, "reco_match_items"):
            _ensure_column(connection, "reco_match_items", "entity_id", "TEXT")
            _ensure_column(connection, "reco_match_items", "return_period", "TEXT")
            _ensure_column(connection, "reco_match_items", "source_reco_period", "TEXT")

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

        connection.commit()

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


def _map_row_to_standard(raw_row: dict, col_map: dict) -> dict:
    def _float(v):
        try:
            return float(v) if v is not None and str(v).strip() != "" else None
        except ValueError:
            return None

    return {
        "invoice_key": raw_row.get("invoice_key"),
        "garden_name": raw_row.get("_garden_name") or raw_row.get("garden_name"),
        "gstin": raw_row.get(col_map.get("gstin", "")),
        "supplier_gstin": raw_row.get(col_map.get("gstin", "")),
        "vendor_name": raw_row.get(col_map.get("vendor_name", "")),
        "supplier_name": raw_row.get(col_map.get("vendor_name", "")),
        "invoice_number": raw_row.get(col_map.get("invoice_number", "")),
        "invoice_date": str(raw_row.get(col_map.get("invoice_date", ""), "") or "") if col_map.get("invoice_date") else None,
        "taxable_value": _float(raw_row.get(col_map.get("taxable_value", ""))),
        "igst_amount": _float(raw_row.get(col_map.get("igst_amount", ""))),
        "cgst_amount": _float(raw_row.get(col_map.get("cgst_amount", ""))),
        "sgst_amount": _float(raw_row.get(col_map.get("sgst_amount", ""))),
        "total_invoice_value": _float(raw_row.get(col_map.get("total_invoice_value", ""))),
        "books_taxable_value": _float(raw_row.get(col_map.get("taxable_value", ""))),
        "books_total_gst": sum(filter(None, [
            _float(raw_row.get(col_map.get("igst_amount", ""))),
            _float(raw_row.get(col_map.get("cgst_amount", ""))),
            _float(raw_row.get(col_map.get("sgst_amount", "")))
        ]))
    }

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
        INSERT OR IGNORE INTO books_invoice_facts (
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


def promote_run_to_facts(run_id: str) -> None:
    now = _utcnow()
    with get_connection() as connection:
        run = connection.execute("SELECT entity_id, return_period FROM books_runs WHERE run_id = ?", (run_id,)).fetchone()
        if not run:
            return
            
        entity_id = run["entity_id"]
        return_period = run["return_period"]
        
        # Partitioned replacement: Wipe existing definitive facts for this entity & period to guarantee no duplicates
        connection.execute(
            """
            DELETE FROM books_invoice_facts 
            WHERE run_id IN (
                SELECT run_id FROM books_runs 
                WHERE entity_id = ? AND return_period = ?
            )
            """, 
            (entity_id, return_period)
        )
        
        # Read the run col_map for standard key mapping
        run_data = connection.execute("SELECT col_map_json FROM books_runs WHERE run_id = ?", (run_id,)).fetchone()
        col_map = _load(run_data["col_map_json"], {}) if run_data else {}
        
        # Read the clean staging items and promote them to the definitive facts table
        clean_items = connection.execute("SELECT row_json FROM books_run_clean_items WHERE run_id = ?", (run_id,)).fetchall()
        
        for item in clean_items:
            raw_row = _load(item["row_json"], {})
            mapped_row = _map_row_to_standard(raw_row, col_map)
            # Add original row for context if needed
            mapped_row["row_json"] = item["row_json"]
            _insert_books_fact(connection, run_id, mapped_row, return_period, now)
            
        connection.commit()



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
    canonical_invoices = payload.get("canonical_invoices", []) or []
    return_period = _derive_return_period_from_invoice_dates(
        canonical_invoices,
        (payload.get("return_period") or parent_run["period"]) if parent_run else payload.get("return_period"),
    )
    business_context = parent_run["business_context"] if parent_run else None
    match_results = payload.get("match_results") or {}
    with get_connection() as connection:
        month_cycle_id = _get_or_create_month_cycle(connection, entity_id, return_period, business_context)
        _ensure_column(connection, "reco_runs", "month_cycle_id", "INTEGER")
        _ensure_column(connection, "reco_runs", "return_period", "TEXT")
        _ensure_column(connection, "reco_runs", "version_no", "INTEGER NOT NULL DEFAULT 1")
        _ensure_column(connection, "reco_runs", "declared_period", "TEXT")
        _ensure_column(connection, "reco_runs", "upload_ids_json", "TEXT NOT NULL DEFAULT '[]'")
        _ensure_column(connection, "reco_runs", "canonical_invoices_json", "TEXT NOT NULL DEFAULT '[]'")
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
                    declared_gstin, declared_period, status, upload_ids_json, canonical_invoices_json, canonical_stats_json,
                    match_results_json, error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    canonical_invoices_json = excluded.canonical_invoices_json,
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
                    _dump(canonical_invoices),
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
                    declared_gstin, declared_period, status, upload_ids_json, canonical_invoices_json, canonical_stats_json,
                    match_results_json, error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    canonical_invoices_json = excluded.canonical_invoices_json,
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
                    _dump(canonical_invoices),
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

        if payload.get("status") == "complete" and canonical_invoices:
            connection.execute("DELETE FROM reco_canonical_facts WHERE reco_id = ?", (payload["reco_id"],))
            seen_row_hashes = set()
            for row in canonical_invoices:
                row_hash = _dump(row)
                if row_hash in seen_row_hashes:
                    continue
                seen_row_hashes.add(row_hash)
                _insert_canonical_fact(connection, payload["reco_id"], entity_id, row, return_period, now)

        connection.execute("DELETE FROM reco_value_deltas WHERE reco_match_item_id IN (SELECT id FROM reco_match_items WHERE reco_id = ?)", (payload["reco_id"],))
        connection.execute("DELETE FROM reco_match_items WHERE reco_id = ?", (payload["reco_id"],))
        if match_results:
            for row in match_results.get("match_results", []):
                match_item_id = _insert_match_item(connection, payload["reco_id"], row, payload.get("declared_period"), now, entity_id)
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
            # Build canonical index to enrich MISSING_IN_BOOKS rows with full data
            canonical_index = {}
            for inv in canonical_invoices:
                try:
                    obj = inv if isinstance(inv, dict) else _to_dict(inv)
                    import re
                    gstin = (obj.get("supplier_gstin") or "").strip().upper()
                    inv_no = re.sub(r'[^A-Z0-9]', '', str(obj.get("invoice_number", "")).upper())
                    
                    inv_date = obj.get("invoice_date")
                    if hasattr(inv_date, "isoformat"):
                        date_str = inv_date.isoformat()
                    elif isinstance(inv_date, str):
                        date_str = inv_date
                    else:
                        date_str = str(inv_date) if inv_date else ""
                        
                    if date_str:
                        ident_key = f"{gstin}|{inv_no}|{date_str}"
                        canonical_index[ident_key] = obj
                except Exception:
                    pass

            for identity_key in match_results.get("unmatched_2b", []) or []:
                row_data = {
                    "matched_2b_invoice_id": identity_key, 
                    "match_status": "MISSING_IN_BOOKS"
                }
                
                # The identity key is exactly GSTIN|INV|DATE from the matcher
                canonical_invoice = canonical_index.get(identity_key)
                if canonical_invoice:
                    inv_date = canonical_invoice.get("invoice_date")
                    if hasattr(inv_date, "isoformat"):
                        inv_date = inv_date.isoformat()
                    elif not isinstance(inv_date, str):
                        inv_date = str(inv_date) if inv_date else None
                        
                    row_data.update({
                        "canonical_supplier_gstin": canonical_invoice.get("supplier_gstin"),
                        "canonical_supplier_name": canonical_invoice.get("supplier_legal_name") or canonical_invoice.get("supplier_name"),
                        "canonical_invoice_number": canonical_invoice.get("invoice_number"),
                        "canonical_invoice_date": inv_date,
                        "canonical_taxable_value": float(canonical_invoice.get("taxable_value")) if canonical_invoice.get("taxable_value") is not None else None,
                        "canonical_total_gst": float(canonical_invoice.get("total_gst_amount")) if canonical_invoice.get("total_gst_amount") is not None else None,
                        "canonical_invoice_value": float(canonical_invoice.get("invoice_value")) if canonical_invoice.get("invoice_value") is not None else None,
                        "garden_name": canonical_invoice.get("filing_period")
                    })

                connection.execute(
                    """
                    INSERT INTO reco_match_items (
                        reco_id, entity_id, return_period, books_invoice_id, matched_2b_invoice_id,
                        supplier_gstin, invoice_number, invoice_date, match_status, action_state,
                        carried_forward_from_period, carry_forward_flag, row_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["reco_id"],
                        entity_id,
                        return_period,
                        identity_key,
                        identity_key,
                        None,
                        None,
                        None,
                        "MISSING_IN_BOOKS",
                        "UNREVIEWED",
                        payload.get("declared_period"),
                        1,
                        _dump(row_data),
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
    entity_id: Optional[str],
    row: Dict[str, Any],
    reco_period: Optional[str],
    created_at: str,
) -> None:
    row_hash = _dump(row)
    row_return_period = reco_period  # Strictly clamped to the run's canonical period
    connection.execute(
        """
        INSERT INTO reco_canonical_facts (
            reco_id, entity_id, return_period, row_hash, identity_key, supplier_gstin, invoice_number, invoice_date,
            source_document_date, supplier_filed_period, visible_in_2b_period, reco_period,
            taxable_value, igst_amount, cgst_amount, sgst_amount, total_invoice_value,
            total_gst_amount, source_type, document_type, row_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reco_id,
            entity_id,
            row_return_period,
            row_hash,
            row.get("invoice_id") or row.get("identity_key") or row.get("source_2b_ref"),
            row.get("supplier_gstin"),
            row.get("invoice_number"),
            row.get("invoice_date"),
            row.get("invoice_date"),
            row.get("filing_period"),
            row.get("visible_in_2b_period") or row_return_period or reco_period,
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
    entity_id: Optional[str] = None,
) -> int:
    status = row.get("match_status")
    carry_forward = 1 if status not in {"MATCHED_STRICT", "MATCHED_RELAXED", "MATCHED_CROSS_PERIOD"} else 0
    cursor = connection.execute(
        """
        INSERT INTO reco_match_items (
            reco_id, entity_id, return_period, books_invoice_id, matched_2b_invoice_id,
            supplier_gstin, invoice_number, invoice_date, match_status, match_method,
            action_state, action_effective_period, carried_forward_from_period,
            source_reco_period, carry_forward_flag, row_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reco_id,
            entity_id,
            declared_period,
            row.get("books_invoice_id"),
            row.get("matched_2b_invoice_id"),
            row.get("books_supplier_gstin") or row.get("canonical_supplier_gstin"),
            row.get("books_invoice_number") or row.get("canonical_invoice_number"),
            row.get("books_invoice_date") or row.get("canonical_invoice_date"),
            status,
            row.get("match_method"),
            row.get("action_state") or "UNREVIEWED",
            row.get("action_effective_period") or declared_period,
            row.get("carried_forward_from_period") or (declared_period if carry_forward else None),
            row.get("source_reco_period"),
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
    canonical_invoices = [_load(item["row_json"], {}) for item in canonical_rows]
    if not canonical_invoices:
        canonical_invoices = _load(row["canonical_invoices_json"], [])
    return _row_to_reco(
        row,
        canonical_invoices,
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
                SELECT COALESCE(SUM(COALESCE(json_extract(row_json, '$.canonical_total_gst'), json_extract(row_json, '$.books_total_gst'), 0)), 0) AS matched_gst
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


# ─── Raw Books Persistence ─────────────────────────────────────────────────────

def save_raw_books_rows(
    run_id: str,
    entity_id: Optional[str],
    return_period: Optional[str],
    garden_name: str,
    original_filename: str,
    rows: List[Dict[str, Any]],
) -> None:
    now = _utcnow()
    import hashlib
    print(f"DEBUG: Saving {len(rows)} raw rows for garden '{garden_name}' (Entity: {entity_id}) to raw_books_uploads.")
    with get_connection() as connection:
        if entity_id and return_period and garden_name:
            # Prevent duplicate raw data by removing old uploads for this garden/period from previous runs
            connection.execute(
                "DELETE FROM raw_books_uploads WHERE entity_id = ? AND return_period = ? AND garden_name = ? AND run_id != ?",
                (entity_id, return_period, garden_name, run_id)
            )
            
        def _get_hash(row_dict):
            # Sort keys for deterministic JSON string hash
            json_str = json.dumps(row_dict, sort_keys=True)
            return hashlib.sha256(json_str.encode('utf-8')).hexdigest()
            
        connection.executemany(
            """
            INSERT OR IGNORE INTO raw_books_uploads (
                run_id, entity_id, return_period, garden_name, original_filename,
                row_index, row_hash, row_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    run_id, 
                    entity_id, 
                    row.get("_return_period", return_period), 
                    garden_name, 
                    original_filename, 
                    idx, 
                    _get_hash(row),
                    _dump({k: v for k, v in row.items() if k != "_return_period"}), 
                    now
                )
                for idx, row in enumerate(rows)
            ],
        )
        connection.commit()


def get_raw_books_rows(
    entity_id: str,
    filter_type: str = "monthly",
    year: Optional[str] = None,
    quarter: Optional[int] = None,
    period: Optional[str] = None,
    garden_name: Optional[str] = None,
    page: int = 1,
    limit: int = 500,
) -> Dict[str, Any]:
    pc, pp = _build_period_clause(filter_type, year, quarter, period, "return_period")
    # Raw books are an immutable audit trail — they are always visible for the period
    # they cover regardless of pipeline run status. Deduplication of re-uploads is
    # handled at write time (DELETE by entity+period+garden before re-insert),
    # not at query time. Do NOT filter by books_runs.status here.
    where = "entity_id = ?"
    params: List[Any] = [entity_id]
    if pc:
        where += f" AND {pc}"
        params.extend(pp)
    if garden_name:
        where += " AND garden_name = ?"
        params.append(garden_name)
    offset = (page - 1) * limit
    
    with get_connection() as connection:
        total = connection.execute(
            f"SELECT COUNT(*) as c FROM raw_books_uploads WHERE {where}", params
        ).fetchone()["c"]
        sql = f"SELECT row_json, garden_name, original_filename FROM raw_books_uploads WHERE {where} LIMIT {limit} OFFSET {offset}"
        rows = connection.execute(sql, params).fetchall()
        print(f"DEBUG: Fetched {len(rows)} raw rows from raw_books_uploads (Entity: {entity_id}, Garden: {garden_name}).")
        
    result = []
    for row in rows:
        data = _load(row["row_json"], {})
        data["_garden_name"] = row["garden_name"]
        data["_source_file"] = row["original_filename"]
        result.append(data)
    return {"total": total, "page": page, "limit": limit, "items": result}


# ─── Cross-Period Carry-Forward ────────────────────────────────────────────────

def get_unmatched_for_carry_forward(
    entity_id: str,
    exclude_period: Optional[str] = None,
) -> List[Dict[str, Any]]:
    sql = """
        SELECT rmi.id, rmi.reco_id, rmi.return_period, rmi.match_status,
               rmi.books_invoice_id, rmi.matched_2b_invoice_id,
               rmi.supplier_gstin, rmi.invoice_number, rmi.invoice_date, rmi.row_json
        FROM reco_match_items rmi
        WHERE rmi.entity_id = ?
          AND rmi.match_status IN ('MISSING_IN_2B', 'MISSING_IN_BOOKS')
          AND rmi.carry_forward_flag = 1
    """
    params: List[Any] = [entity_id]
    if exclude_period:
        sql += " AND rmi.return_period != ?"
        params.append(exclude_period)
    with get_connection() as connection:
        rows = connection.execute(sql, params).fetchall()
    return [dict(row) for row in rows]


def mark_carry_forward_resolved(item_id: int, resolved_in_period: str) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE reco_match_items
            SET match_status = 'MATCHED_CROSS_PERIOD', carry_forward_flag = 0,
                carried_forward_to_period = ?, action_state = 'ACCEPTED'
            WHERE id = ?
            """,
            (resolved_in_period, item_id),
        )
        connection.commit()


# ─── Ledger Data Queries ───────────────────────────────────────────────────────

FY_QUARTERS = {
    1: ["04", "05", "06"],
    2: ["07", "08", "09"],
    3: ["10", "11", "12"],
    4: ["01", "02", "03"],
}


def _build_period_clause(
    filter_type: str,
    year: Optional[str],
    quarter: Optional[int],
    period: Optional[str],
    col: str,
) -> tuple:
    if filter_type == "monthly" and period:
        return f"{col} = ?", [period]
    if filter_type == "quarterly" and year and quarter:
        months = FY_QUARTERS.get(int(quarter), [])
        fy_start = int(year)
        fy_end = fy_start + 1
        vals = [f"{fy_end if m in ('01','02','03') else fy_start}-{m}" for m in months]
        return f"{col} IN ({','.join('?'*len(vals))})", vals
    if filter_type in ("yearly", "financial_year") and year:
        fy_start = int(year)
        fy_end = fy_start + 1
        vals = [f"{fy_start}-{m:02d}" for m in range(4, 13)] + [f"{fy_end}-{m:02d}" for m in range(1, 4)]
        return f"{col} IN ({','.join('?'*len(vals))})", vals
    return "", []


def get_ledger_reco_data(
    entity_id: str,
    filter_type: str = "monthly",
    year: Optional[str] = None,
    quarter: Optional[int] = None,
    period: Optional[str] = None,
    statuses: Optional[List[str]] = None,
    garden_name: Optional[str] = None,
    page: int = 1,
    limit: int = 500,
) -> Dict[str, Any]:
    pc, pp = _build_period_clause(filter_type, year, quarter, period, "rr.return_period")
    where = "rr.entity_id = ?"
    params: List[Any] = [entity_id]
    if pc:
        where += f" AND {pc}"
        params.extend(pp)
    if statuses:
        where += f" AND rmi.match_status IN ({','.join('?'*len(statuses))})"
        params.extend(statuses)
    if garden_name:
        where += " AND (JSON_EXTRACT(rmi.row_json, '$.garden_name') = ? OR rmi.match_status = 'MISSING_IN_BOOKS')"
        params.append(garden_name)
    offset = (page - 1) * limit
    with get_connection() as connection:
        total = connection.execute(
            f"SELECT COUNT(*) as c FROM reco_match_items rmi JOIN reco_runs rr ON rr.reco_id = rmi.reco_id WHERE {where}", params
        ).fetchone()["c"]
        rows = connection.execute(
            f"""SELECT rmi.id, rmi.return_period, rmi.match_status, rmi.match_method,
                       rmi.carry_forward_flag, rmi.carried_forward_from_period, rmi.source_reco_period,
                       rmi.supplier_gstin, rmi.invoice_number, rmi.invoice_date, rmi.action_state, rmi.row_json
                FROM reco_match_items rmi JOIN reco_runs rr ON rr.reco_id = rmi.reco_id WHERE {where}
                ORDER BY rr.return_period DESC, rmi.id DESC LIMIT {limit} OFFSET {offset}""",
            params,
        ).fetchall()
    items = []
    for row in rows:
        d = _load(row["row_json"], {})
        d.update({
            "_id": row["id"],
            "_return_period": row["return_period"],
            "_match_status": row["match_status"],
            "_match_method": row["match_method"],
            "_carry_forward": bool(row["carry_forward_flag"]),
            "_carried_from_period": row["carried_forward_from_period"],
            "_source_reco_period": row["source_reco_period"],
            "_action_state": row["action_state"],
        })
        items.append(d)
    return {"total": total, "page": page, "limit": limit, "items": items}


def get_ledger_books_data(
    entity_id: str,
    data_type: str,
    filter_type: str = "monthly",
    year: Optional[str] = None,
    quarter: Optional[int] = None,
    period: Optional[str] = None,
    garden_name: Optional[str] = None,
    page: int = 1,
    limit: int = 500,
) -> Dict[str, Any]:
    TABLE_MAP = {"clean": "books_run_clean_items", "warnings": "books_run_warning_items", "errors": "books_run_error_items"}
    table = TABLE_MAP.get(data_type, "books_run_clean_items")
    pc, pp = _build_period_clause(filter_type, year, quarter, period, "br.return_period")
    where = "br.entity_id = ? AND br.status != 'superseded'"
    params: List[Any] = [entity_id]
    if pc:
        where += f" AND {pc}"
        params.extend(pp)
    if garden_name:
        where += " AND JSON_EXTRACT(t.row_json, '$._garden_name') = ?"
        params.append(garden_name)
    offset = (page - 1) * limit
    with get_connection() as connection:
        total = connection.execute(
            f"SELECT COUNT(*) as c FROM {table} t JOIN books_runs br ON br.run_id = t.run_id WHERE {where}", params
        ).fetchone()["c"]
        select_clause = "t.invoice_key" if table != "books_run_error_items" else "NULL as invoice_key"
        rows = connection.execute(
            f"SELECT {select_clause}, t.row_json, br.return_period, br.col_map_json FROM {table} t JOIN books_runs br ON br.run_id = t.run_id WHERE {where} ORDER BY br.return_period DESC, t.id DESC LIMIT {limit} OFFSET {offset}",
            params,
        ).fetchall()
    items = []
    for row in rows:
        raw_d = _load(row["row_json"], {})
        col_map = _load(row["col_map_json"], {})
        
        # For clean data, map to standard format. Warnings/errors can retain raw + some mapped fields.
        row_to_map = raw_d.get("original_row_data", raw_d) if isinstance(raw_d, dict) else raw_d
        d = _map_row_to_standard(row_to_map, col_map)
        if data_type != "clean":
            d["_reasons"] = raw_d.get("_reasons") or raw_d.get("warning_message") or raw_d.get("error_message") or ""
            d["_errors"] = raw_d.get("_errors") or raw_d.get("error_message") or ""
            
        if row["invoice_key"]:
            d["_invoice_key"] = row["invoice_key"]
        d["_return_period"] = row["return_period"]
        items.append(d)
    return {"total": total, "page": page, "limit": limit, "items": items}


def get_ledger_2b_data(
    entity_id: str,
    filter_type: str = "monthly",
    year: Optional[str] = None,
    quarter: Optional[int] = None,
    period: Optional[str] = None,
    page: int = 1,
    limit: int = 500,
) -> Dict[str, Any]:
    pc, pp = _build_period_clause(filter_type, year, quarter, period, "rcf.return_period")
    where = "rcf.entity_id = ? AND rr.status = 'complete'"
    params: List[Any] = [entity_id]
    if pc:
        where += f" AND {pc}"
        params.extend(pp)
    offset = (page - 1) * limit

    with get_connection() as connection:
        total = connection.execute(
            f"SELECT COUNT(*) as c FROM reco_canonical_facts rcf JOIN reco_runs rr ON rr.reco_id = rcf.reco_id WHERE {where}",
            params,
        ).fetchone()["c"]
        rows = connection.execute(
            f"""SELECT rcf.row_json, rcf.return_period
                FROM reco_canonical_facts rcf
                JOIN reco_runs rr ON rr.reco_id = rcf.reco_id
                WHERE {where}
                ORDER BY rcf.return_period DESC, rcf.id DESC LIMIT {limit} OFFSET {offset}""",
            params,
        ).fetchall()

    items = []
    for row in rows:
        data = _load(row["row_json"], {})
        data["_return_period"] = row["return_period"]
        items.append(data)
    return {"total": total, "page": page, "limit": limit, "items": items}


def find_existing_finalized_2b_period(entity_id: str, return_period: str, exclude_reco_id: Optional[str] = None) -> Optional[str]:
    if not entity_id or not return_period:
        return None
    sql = """
        SELECT rr.reco_id
        FROM reco_runs rr
        WHERE rr.entity_id = ? AND rr.return_period = ? AND rr.status = 'complete'
    """
    params: List[Any] = [entity_id, return_period]
    if exclude_reco_id:
        sql += " AND rr.reco_id != ?"
        params.append(exclude_reco_id)
    sql += " ORDER BY rr.updated_at DESC, rr.created_at DESC LIMIT 1"

    with get_connection() as connection:
        row = connection.execute(sql, params).fetchone()
    return row["reco_id"] if row else None


def supersede_previous_reco_runs(entity_id: str, return_period: str, exclude_reco_id: str) -> None:
    if not entity_id or not return_period:
        return
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE reco_runs
            SET status = 'superseded', updated_at = ?
            WHERE entity_id = ? AND return_period = ? AND status = 'complete' AND reco_id != ?
            """,
            (_utcnow(), entity_id, return_period, exclude_reco_id),
        )
        connection.commit()


# ─── Dynamic KPI Aggregation ──────────────────────────────────────────────────

def get_ledger_metadata(entity_id: str) -> Dict[str, Any]:
    with get_connection() as connection:
        gardens = connection.execute(
            "SELECT DISTINCT garden_name as g FROM raw_books_uploads WHERE entity_id = ? AND garden_name IS NOT NULL",
            [entity_id]
        ).fetchall()
        periods = connection.execute(
            """
            SELECT DISTINCT return_period as p FROM raw_books_uploads WHERE entity_id = ? AND return_period IS NOT NULL
            UNION
            SELECT DISTINCT return_period as p FROM books_runs WHERE entity_id = ? AND return_period IS NOT NULL
            UNION
            SELECT DISTINCT return_period as p FROM reco_canonical_facts WHERE entity_id = ? AND return_period IS NOT NULL
            """,
            [entity_id, entity_id, entity_id]
        ).fetchall()
        
    return {
        "gardens": sorted([row["g"] for row in gardens if row["g"]]),
        "periods": sorted([row["p"] for row in periods if row["p"]], reverse=True)
    }

def _extract_numeric_sum(json_col: str, keys: List[str]) -> str:
    coalesce_parts = []
    for k in keys:
        coalesce_parts.append(f"JSON_EXTRACT({json_col}, '$.\"{k}\"')")
        coalesce_parts.append(f"JSON_EXTRACT({json_col}, '$.{k}')")
    coalesce_expr = f"COALESCE({', '.join(coalesce_parts)}, '0')"
    return f"SUM(CAST(REPLACE(REPLACE(IFNULL({coalesce_expr}, '0'), ',', ''), '₹', '') AS REAL))"

def get_ledger_kpis(
    entity_id: str, filter_type: str, year: Optional[str], quarter: Optional[int], period: Optional[str], garden_name: Optional[str] = None
) -> Dict[str, Any]:
    pc, pp = _build_period_clause(filter_type, year, quarter, period, "rr.return_period")
    reco_where = "rr.entity_id = ?"
    two_b_where = "rr.entity_id = ?"
    books_where = "br.entity_id = ?"
    rp: List[Any] = [entity_id]
    tp: List[Any] = [entity_id]
    bp: List[Any] = [entity_id]
    if pc:
        reco_where += f" AND {pc}"
        rp.extend(pp)
        two_b_where += f" AND {pc}"
        tp.extend(pp)
        books_pc = pc.replace("rr.return_period", "br.return_period")
        books_where += f" AND {books_pc}"
        bp.extend(pp)
    if garden_name:
        reco_where += " AND (JSON_EXTRACT(rmi.row_json, '$.garden_name') = ? OR rmi.match_status = 'MISSING_IN_BOOKS')"
        rp.append(garden_name)
        books_where += " AND JSON_EXTRACT(t.row_json, '$._garden_name') = ?"
        bp.append(garden_name)

    with get_connection() as connection:
        reco_rows = connection.execute(
            f"""SELECT rmi.match_status, COUNT(*) as cnt,
                       {_extract_numeric_sum('rmi.row_json', ['books_taxable_value', 'taxable_value', 'Taxable Value'])} as taxable_sum,
                       {_extract_numeric_sum('rmi.row_json', ['books_total_gst', 'total_gst', 'Total GST'])} as books_gst_sum,
                       {_extract_numeric_sum('rmi.row_json', ['canonical_total_gst'])} as portal_gst_sum
                FROM reco_match_items rmi JOIN reco_runs rr ON rr.reco_id = rmi.reco_id
                WHERE {reco_where} GROUP BY rmi.match_status""",
            rp,
        ).fetchall()
        clean_cnt = connection.execute(f"SELECT COUNT(*) as c FROM books_run_clean_items t JOIN books_runs br ON br.run_id=t.run_id WHERE {books_where}", bp).fetchone()["c"]
        warn_cnt = connection.execute(f"SELECT COUNT(*) as c FROM books_run_warning_items t JOIN books_runs br ON br.run_id=t.run_id WHERE {books_where}", bp).fetchone()["c"]
        err_cnt = connection.execute(f"SELECT COUNT(*) as c FROM books_run_error_items t JOIN books_runs br ON br.run_id=t.run_id WHERE {books_where}", bp).fetchone()["c"]
        
        raw_pc, raw_pp = _build_period_clause(filter_type, year, quarter, period, "return_period")
        raw_params = [entity_id]
        raw_where = ""
        if raw_pc:
            raw_where = " AND " + raw_pc
            raw_params.extend(raw_pp)
        if garden_name:
            raw_where += " AND garden_name = ?"
            raw_params.append(garden_name)
            
        raw_cnt = connection.execute(f"SELECT COUNT(*) as c FROM raw_books_uploads WHERE entity_id = ?{raw_where}", raw_params).fetchone()["c"]

        raw_metrics = connection.execute(f"""
            SELECT 
                {_extract_numeric_sum('row_json', ['taxable_value', 'Taxable Value', 'Taxable Amount'])} as raw_taxable,
                {_extract_numeric_sum('row_json', ['total_gst', 'Total GST', '_total_tax'])} as raw_gst_single,
                {_extract_numeric_sum('row_json', ['igst_amount', 'igst', 'IGST', 'Igst Amount'])} as raw_igst,
                {_extract_numeric_sum('row_json', ['cgst_amount', 'cgst', 'CGST', 'Cgst Amount'])} as raw_cgst,
                {_extract_numeric_sum('row_json', ['sgst_amount', 'sgst', 'SGST', 'Sgst Amount'])} as raw_sgst
            FROM raw_books_uploads WHERE entity_id = ?{raw_where}
        """, raw_params).fetchone()
        
        # If no single total gst field exists, fallback to adding IGST + CGST + SGST manually.
        raw_gst_calculated = (raw_metrics["raw_igst"] or 0) + (raw_metrics["raw_cgst"] or 0) + (raw_metrics["raw_sgst"] or 0)
        final_raw_gst = raw_metrics["raw_gst_single"] if raw_metrics and raw_metrics["raw_gst_single"] else raw_gst_calculated

        clean_metrics = connection.execute(f"""
            SELECT 
                {_extract_numeric_sum('t.row_json', ['books_taxable_value', 'taxable_value', 'Taxable Value', 'Taxable Amount'])} as clean_taxable,
                {_extract_numeric_sum('t.row_json', ['books_total_gst', 'total_gst', 'Total GST', '_total_tax'])} as clean_gst_single,
                {_extract_numeric_sum('t.row_json', ['books_igst_amount', 'igst_amount', 'igst', 'IGST', 'Igst Amount'])} as clean_igst,
                {_extract_numeric_sum('t.row_json', ['books_cgst_amount', 'cgst_amount', 'cgst', 'CGST', 'Cgst Amount'])} as clean_cgst,
                {_extract_numeric_sum('t.row_json', ['books_sgst_amount', 'sgst_amount', 'sgst', 'SGST', 'Sgst Amount'])} as clean_sgst
            FROM books_run_clean_items t JOIN books_runs br ON br.run_id=t.run_id WHERE {books_where}
        """, bp).fetchone()

        clean_gst_calculated = (clean_metrics["clean_igst"] or 0) + (clean_metrics["clean_cgst"] or 0) + (clean_metrics["clean_sgst"] or 0)
        final_clean_gst = clean_metrics["clean_gst_single"] if clean_metrics and clean_metrics["clean_gst_single"] else clean_gst_calculated

        reco_2b_metrics = connection.execute(f"""
            SELECT
                COUNT(*) as two_b_count,
                {_extract_numeric_sum('rcf.row_json', ['taxable_value'])} as two_b_taxable,
                {_extract_numeric_sum('rcf.row_json', ['total_gst_amount'])} as two_b_gst_single,
                {_extract_numeric_sum('rcf.row_json', ['igst_amount'])} as two_b_igst,
                {_extract_numeric_sum('rcf.row_json', ['cgst_amount'])} as two_b_cgst,
                {_extract_numeric_sum('rcf.row_json', ['sgst_amount'])} as two_b_sgst
            FROM reco_canonical_facts rcf
            JOIN reco_runs rr ON rr.reco_id = rcf.reco_id
            WHERE {two_b_where} AND rr.status = 'complete'
        """, tp).fetchone()

    kpi: Dict[str, Any] = {
        "two_b_count": reco_2b_metrics["two_b_count"] or 0,
        "raw_books_count": raw_cnt, "clean_books_count": clean_cnt,
        "warning_books_count": warn_cnt, "error_books_count": err_cnt,
        "matched_strict": 0, "matched_relaxed": 0, "matched_cross_period": 0,
        "value_mismatch": 0, "possible_match": 0, "missing_in_2b": 0, "missing_in_books": 0,
        "total_matched_taxable": 0.0, "total_matched_gst": 0.0, "itc_eligible": 0.0,
        "raw_taxable": raw_metrics["raw_taxable"] or 0,
        "raw_gst": final_raw_gst,
        "raw_igst": raw_metrics["raw_igst"] or 0,
        "raw_cgst": raw_metrics["raw_cgst"] or 0,
        "raw_sgst": raw_metrics["raw_sgst"] or 0,
        "clean_taxable": clean_metrics["clean_taxable"] or 0,
        "clean_gst": final_clean_gst,
        "clean_igst": clean_metrics["clean_igst"] or 0,
        "clean_cgst": clean_metrics["clean_cgst"] or 0,
        "clean_sgst": clean_metrics["clean_sgst"] or 0,
        "two_b_taxable": reco_2b_metrics["two_b_taxable"] or 0,
        "two_b_gst": reco_2b_metrics["two_b_gst_single"] or ((reco_2b_metrics["two_b_igst"] or 0) + (reco_2b_metrics["two_b_cgst"] or 0) + (reco_2b_metrics["two_b_sgst"] or 0)),
        "two_b_igst": reco_2b_metrics["two_b_igst"] or 0,
        "two_b_cgst": reco_2b_metrics["two_b_cgst"] or 0,
        "two_b_sgst": reco_2b_metrics["two_b_sgst"] or 0,
        "reco_books_gst": 0.0,
        "reco_portal_gst": 0.0,
        "reco_matched_itc": 0.0,
        "missing_in_2b_gst": 0.0,
        "missing_in_books_gst": 0.0,
        "value_mismatch_diff": 0.0,
    }
    STATUS_MAP = {
        "MATCHED_STRICT": "matched_strict", "MATCHED_RELAXED": "matched_relaxed",
        "MATCHED_CROSS_PERIOD": "matched_cross_period", "VALUE_MISMATCH": "value_mismatch",
        "POSSIBLE_MATCH": "possible_match", "MISSING_IN_2B": "missing_in_2b", "MISSING_IN_BOOKS": "missing_in_books",
    }
    for row in reco_rows:
        k = STATUS_MAP.get(row["match_status"])
        if k:
            kpi[k] = int(row["cnt"])
        if row["match_status"] in ("MATCHED_STRICT", "MATCHED_RELAXED", "MATCHED_CROSS_PERIOD"):
            kpi["total_matched_taxable"] += float(row["taxable_sum"] or 0)
            kpi["total_matched_gst"] += float(row["books_gst_sum"] or 0)
            kpi["reco_matched_itc"] += float(row["portal_gst_sum"] or row["books_gst_sum"] or 0)
        elif row["match_status"] == "MISSING_IN_2B":
            kpi["missing_in_2b_gst"] += float(row["books_gst_sum"] or 0)
        elif row["match_status"] == "MISSING_IN_BOOKS":
            kpi["missing_in_books_gst"] += float(row["portal_gst_sum"] or 0)
        elif row["match_status"] == "VALUE_MISMATCH":
            kpi["value_mismatch_diff"] += float(row["books_gst_sum"] or 0) - float(row["portal_gst_sum"] or 0)
        
        kpi["reco_books_gst"] += float(row["books_gst_sum"] or 0)
        kpi["reco_portal_gst"] += float(row["portal_gst_sum"] or 0)

    kpi["reco_net_discrepancy"] = kpi["reco_books_gst"] - kpi["reco_portal_gst"]
    kpi["itc_eligible"] = kpi["total_matched_gst"]
    kpi["total_matched"] = kpi["matched_strict"] + kpi["matched_relaxed"] + kpi["matched_cross_period"]
    return kpi
