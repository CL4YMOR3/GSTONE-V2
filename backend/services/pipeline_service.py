"""
Pipeline Service

Wraps GSTONE's multi-garden processing logic (drawn from multi_garden_worker.py)
without Qt signals. Runs in ThreadPoolExecutor for async-safe operation.

🔒 Zero modifications to GSTONE source code.
"""
import asyncio
import uuid
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

from config import MAX_PIPELINE_WORKERS
import session_store as store
from models.requests import PipelineRunRequest, SubmitFixesRequest, FixAction
from models.responses import ErrorRow, RunSummary, GardenStats
from utils.serialization import sanitize_nan

_executor = ThreadPoolExecutor(max_workers=MAX_PIPELINE_WORKERS)


def _serialize_garden_files(garden_files: List[tuple]) -> List[Dict[str, Any]]:
    serialized = []
    for gf in garden_files:
        serialized.append({
            "file_path": gf[0],
            "sheet_name": gf[1],
            "garden_name": gf[2],
            "header_row": gf[3],
            "original_filename": gf[4] if len(gf) > 4 else Path(gf[0]).name
        })
    return serialized


def _build_fix_queue(fix_actions: List[Dict[str, Any]]):
    """Build a GSTONE FixQueue from stored FixAction dicts."""
    from core.correction.fix_queue import FixQueue, FixAction as GSTONEFixAction

    fq = FixQueue()
    for fa in fix_actions:
        gfa = GSTONEFixAction(
            field=fa["field"],
            old_value=fa.get("old_value"),
            new_value=fa["new_value"],
            fix_type=fa.get("fix_type", "MANUAL_CORRECTION"),
            scope=fa.get("scope", "SINGLE"),
            reference_rows=fa.get("reference_rows", []),
            match_criteria=fa.get("match_criteria", {}),
            allow_cross_garden=fa.get("allow_cross_garden", False),
            confidence=fa.get("confidence", "MANUAL"),
        )
        fq.add_fix(gfa)
    return fq


def _audit_fix_actions(df, col_map: Dict[str, str], fix_actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Compute how many rows each queued fix will actually target."""
    from core.correction.rule_heuristics import is_row_match
    from core.normalization.account_normalizer import normalize_account_name

    audit_rows: List[Dict[str, Any]] = []
    vendor_col = col_map.get("vendor_name")

    for idx, fix in enumerate(fix_actions, start=1):
        field = fix.get("field")
        col_name = col_map.get(field)
        scope = fix.get("scope", "SINGLE")
        matched_rows: List[int] = []
        skip_reason = None

        if not col_name or col_name not in df.columns:
            skip_reason = f"mapped column missing for field '{field}'"
        elif scope == "BULK":
            criteria = fix.get("match_criteria", {}) or {}
            for row_idx, row in df.iterrows():
                normalized_acc = normalize_account_name(str(row.get(vendor_col, ""))) if vendor_col else ""
                if is_row_match(row, col_map, criteria, normalized_acc, allow_cross_garden=fix.get("allow_cross_garden", False)):
                    matched_rows.append(int(row_idx))
        else:
            requested_rows = fix.get("reference_rows", []) or []
            matched_rows = [int(row_idx) for row_idx in requested_rows if row_idx in df.index]
            if requested_rows and not matched_rows:
                skip_reason = "reference_rows did not exist in the source frame"

        audit_rows.append({
            "sequence": idx,
            "field": field,
            "scope": scope,
            "fix_type": fix.get("fix_type"),
            "new_value": fix.get("new_value"),
            "target_column": col_name,
            "requested_rows": len(fix.get("reference_rows", []) or []),
            "matched_rows": len(matched_rows),
            "sample_rows": matched_rows[:10],
            "skip_reason": skip_reason,
            "match_criteria": fix.get("match_criteria", {}) if scope == "BULK" else {},
        })

    return audit_rows


def _serialize_df(df) -> List[Dict[str, Any]]:
    """Convert Pandas DataFrame to JSON-safe list of dicts."""
    import pandas as pd
    import math

    if df is None or df.empty:
        return []

    records = df.copy()
    # Convert dates to strings
    for col in records.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
        records[col] = records[col].dt.strftime("%Y-%m-%d")

    def _safe(v):
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v

    return [sanitize_nan({k: _safe(v) for k, v in row.items()}) for row in records.to_dict(orient="records")]


def _serialize_identity_error(err) -> Dict[str, Any]:
    """Convert GSTONE IdentityError to JSON-safe dict."""
    import pandas as pd
    suggestion = None
    if hasattr(err, "suggestion_payload") and err.suggestion_payload:
        sp = err.suggestion_payload
        suggestion = {
            "field": sp.get("field", "gstin") if isinstance(sp, dict) else "gstin",
            "suggested_value": sp.get("suggested_value") or sp.get("gstin") if isinstance(sp, dict) else str(sp),
            "confidence": sp.get("confidence") or sp.get("confidence_level", "UNKNOWN") if isinstance(sp, dict) else "UNKNOWN",
            "reason": sp.get("reason") or sp.get("matched_via", "") if isinstance(sp, dict) else "",
            "source": sp.get("source", "system") if isinstance(sp, dict) else None,
            "validation": sp.get("validation") if isinstance(sp, dict) else None,
        }

    row_data = getattr(err, "original_row_data", {})
    if hasattr(row_data, "to_dict"):
        row_data = row_data.to_dict()
        
    safe_row_data = {}
    if isinstance(row_data, dict):
        for k, v in row_data.items():
            if pd.notna(v):
                safe_row_data[str(k)] = sanitize_nan(v)

    return {
        "original_row_index": getattr(err, "original_row_index", -1),
        "error_type": getattr(err, "error_type", ""),
        "error_message": getattr(err, "error_message", ""),
        "field": getattr(err, "field", None),
        "value": str(getattr(err, "value", "") or ""),
        "garden_name": getattr(err, "garden_name", None),
        "vendor_name": getattr(err, "vendor_name", None),
        "invoice_number": getattr(err, "invoice_number", None),
        "invoice_date": str(getattr(err, "invoice_date", "") or ""),
        "gstin": getattr(err, "gstin", None),
        "severity": getattr(err, "severity", "HARD"),
        "category": getattr(err, "category", None),
        "gst_status": getattr(err, "gst_status", None),
        "gate_failed": getattr(err, "gate_failed", None),
        "suggestion": suggestion,
        "vendor_suggestion": getattr(err, "vendor_suggestion", None),
        "affected_rows": getattr(err, "affected_rows", []),
        "original_row_data": safe_row_data,
    }


def _serialize_warning(w) -> Dict[str, Any]:
    """Convert GSTONE ValidationWarning to JSON-safe dict."""
    return {
        "invoice_key": getattr(w, "invoice_key", ""),
        "warning_type": getattr(w, "warning_type", ""),
        "warning_message": getattr(w, "warning_message", ""),
        "field": getattr(w, "field", ""),
        "value": str(getattr(w, "value", "") or ""),
        "row_index": getattr(w, "row_index", -1),
    }


def _run_pipeline_sync(
    garden_files: List[tuple],   # [(file_path, sheet_name, garden_name, header_row), ...]
    col_map: Dict[str, str],
    business_context: str,
    company_gstins: List[str],
    fix_actions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Pure-Python re-implementation of multi_garden_worker logic (no Qt).
    Mirrors the multi_garden_worker.run() steps exactly.
    """
    import pandas as pd
    from core.ingestion.file_reader import read_excel_file
    from core.validation.identity_validators import validate_identity
    from core.normalization.canonicalizer import canonicalize_identity_fields
    from core.normalization.date_normalizer import normalize_dates
    from core.normalization.number_normalizer import normalize_numbers
    from core.aggregation.invoice_aggregator import aggregate_invoices
    from core.correction.self_correction_engine import SelfCorrectionEngine, CorrectionConfig
    from core.validation.aggregation_validators import validate_post_aggregation
    from core.validation.value_consistency_validator import validate_value_consistency
    from core.validation.soft_validators import run_soft_validations
    from core.config_loader import get_value_consistency_config, get_garden_registry
    from core.validation.identity_validators import IdentityError

    GARDEN_COL = "_garden_name"

    # ── STEP 2: Ingest all files ──────────────────────────────────────────────
    all_dfs = []
    total_rows = 0
    source_files = []
    garden_names = [g[2] for g in garden_files]

    for gf in garden_files:
        file_path = gf[0]
        sheet_name = gf[1]
        garden_name = gf[2]
        header_row = gf[3]
        original_filename = gf[4] if len(gf) > 4 else Path(file_path).name
        # INSTITUTIONAL FIX: Normalize 1-indexed UI row to 0-indexed core
        h_index = max(0, header_row - 1)
        
        result = read_excel_file(file_path, sheet_name, header_row=h_index)
        if not result.success:
            raise RuntimeError(f"Garden '{garden_name}' failed to load: {result.error_message}")

        df = result.dataframe.copy()

        # Skip summary/total last rows (🔒 Audit rule from multi_garden_worker)
        if not df.empty:
            last_row = df.iloc[-1]
            identity_cols = ["gstin", "invoice_number", "invoice_date", "vendor_name"]
            mapped_id_cols = [col_map.get(c) for c in identity_cols if col_map.get(c) in df.columns]
            if mapped_id_cols:
                id_vals = last_row[mapped_id_cols].fillna("").astype(str).str.strip().str.lower()
                if all(v == "" or "total" in v for v in id_vals):
                    df = df.iloc[:-1]

        df[GARDEN_COL] = garden_name
        all_dfs.append(df)
        total_rows += len(df)
        source_files.append(original_filename)

    combined_df = pd.concat(all_dfs, ignore_index=True)
    print(f"DEBUG: Combined DF size: {len(combined_df)} rows")
    print(f"DEBUG: Combined DF columns: {combined_df.columns.tolist()}")

    # ── Apply fix queue ───────────────────────────────────────────────────────
    if fix_actions:
        # GSTONE bulk heuristics expect a legacy `garden` field. v2 keeps the
        # source-of-truth garden label in `_garden_name`, so mirror it here
        # before applying queued fixes.
        if GARDEN_COL in combined_df.columns and "garden" not in combined_df.columns:
            combined_df["garden"] = combined_df[GARDEN_COL]
        fix_audit = _audit_fix_actions(combined_df, col_map, fix_actions)
        print(f"DEBUG: Received {len(fix_actions)} queued fix(es)")
        for audit in fix_audit:
            print(
                "DEBUG: Fix #{sequence} [{scope}/{fix_type}] field={field} column={target_column} "
                "requested={requested_rows} matched={matched_rows} sample_rows={sample_rows} reason={skip_reason}".format(
                    **audit
                )
            )
        fq = _build_fix_queue(fix_actions)
        combined_df = fq.apply_to_df(combined_df, col_map)
        manual_fixes_applied = fq.get_audit_summary() if hasattr(fq, "get_audit_summary") else []
        for entry, audit in zip(manual_fixes_applied, fix_audit):
            entry["matched_rows"] = audit["matched_rows"]
            entry["sample_rows"] = audit["sample_rows"]
            entry["skip_reason"] = audit["skip_reason"]
    else:
        manual_fixes_applied = []

    # Vendor breakdown
    vendor_breakdown = {}
    vendor_col = col_map.get("vendor_name")
    if vendor_col and vendor_col in combined_df.columns:
        vendor_breakdown = combined_df[vendor_col].value_counts().to_dict()

    print("DEBUG: [Step 3] Identity Validation start...")
    valid_df, gst_missing_errors, other_errors = validate_identity(combined_df, col_map)
    identity_errors = gst_missing_errors + other_errors
    print(f"DEBUG: Identity Validation done. Valid: {len(valid_df)}, Errors: {len(identity_errors)}")

    if len(valid_df) == 0:
        print("DEBUG: valid_df is empty. Exiting pipeline early.")
        return _build_empty_result(total_rows, identity_errors, vendor_breakdown, garden_names)

    print("DEBUG: [Step 4] Canonicalization start...")
    valid_df = canonicalize_identity_fields(valid_df, col_map)
    print(f"DEBUG: Canonicalization done. Columns: {valid_df.columns.tolist()}")

    print("DEBUG: [Step 5] Normalization (Date/Number) start...")
    if "invoice_date" in col_map and col_map["invoice_date"] in valid_df.columns:
        valid_df = normalize_dates(valid_df, col_map["invoice_date"])
    
    # Core GST fields mandatory for arithmetic consistency
    core_numeric_fields = ["taxable_value", "igst_amount", "cgst_amount", "sgst_amount", "total_invoice_value"]
    for field in core_numeric_fields:
        if field in col_map and col_map[field] in valid_df.columns:
            print(f"DEBUG: [Step 5] Normalizing {field} (Column: {col_map[field]})")
            valid_df = normalize_numbers(valid_df, col_map[field])
    print("DEBUG: Normalization done.")

    print("DEBUG: [Step 6] Aggregation start...")
    aggregated_df, row_refs, conflicts = aggregate_invoices(valid_df, col_map)
    pre_agg_count = len(valid_df)
    post_agg_count = len(aggregated_df)
    print(f"DEBUG: Aggregation done. {pre_agg_count} -> {post_agg_count} invoices. Conflicts: {len(conflicts)}")

    # ── STEP 6.5: Self-Correction ─────────────────────────────────────────────
    correction_config = CorrectionConfig.from_config()
    engine = SelfCorrectionEngine(correction_config)
    if not aggregated_df.empty:
        engine.build_lookup_from_clean_invoices(aggregated_df, col_map)
    engine.suggest_corrections(gst_missing_errors, col_map)
    engine.suggest_typo_corrections(other_errors, col_map)
    corrected_df, correction_logs = engine.apply_corrections(combined_df, gst_missing_errors, col_map)

    if correction_logs:
        valid_df, gst_missing_errors, other_errors = validate_identity(corrected_df, col_map)
        valid_df = canonicalize_identity_fields(valid_df, col_map)
        aggregated_df, row_refs, conflicts = aggregate_invoices(valid_df, col_map)
        pre_agg_count = len(valid_df)
        post_agg_count = len(aggregated_df)

    # ── STEP 7: Post-Aggregation Validation ───────────────────────────────────
    print("DEBUG: [Step 7] Post-Aggregation Validation start...")
    valid_aggregated_df, aggregation_errors = validate_post_aggregation(aggregated_df, col_map, conflicts)
    
    # ── STEP 7.5: Value Consistency ───────────────────────────────────────────
    print("DEBUG: [Step 7.5] Value Consistency Audit start...")
    consistency_cfg = get_value_consistency_config()
    consistency_errors = validate_value_consistency(
        valid_aggregated_df, col_map, get_garden_registry(),
        company_gstins=company_gstins,
        context=business_context,
        tolerance=consistency_cfg.get("tolerance", 0.50)
    )
    
    if consistency_errors:
        print(f"DEBUG: Found {len(consistency_errors)} consistency failures.")
        inconsistent_keys = set(ce.invoice_key for ce in consistency_errors)
        # Group errors by invoice_key
        grouped_errors = {}
        for ce in consistency_errors:
            if ce.invoice_key not in grouped_errors:
                grouped_errors[ce.invoice_key] = []
            grouped_errors[ce.invoice_key].append(ce)
            
        for inv_key, ces in grouped_errors.items():
            # Combine error codes and messages
            combined_error_codes = " | ".join([ce.error_code for ce in ces])
            combined_error_messages = " | ".join([ce.error_message for ce in ces])
            
            # Combine bad fields and values
            all_bad_fields = []
            all_bad_values = {}
            for ce in ces:
                all_bad_fields.extend(ce.bad_fields)
                all_bad_values.update(ce.bad_values)
                
            # Remove duplicates from bad_fields while preserving order
            all_bad_fields = list(dict.fromkeys(all_bad_fields))
            
            first_ce = ces[0]
            
            # Trace failure details
            print(f"  - [{combined_error_codes}] Invoice: {inv_key} | Delta: {all_bad_values}")
            
            row_data = {}
            matching = valid_aggregated_df[valid_aggregated_df["invoice_key"] == inv_key]
            if not matching.empty:
                row_data = matching.iloc[0].to_dict()
            safe_row_data = {str(k): sanitize_nan(v) for k, v in row_data.items() if pd.notna(v)}
            
            aggregation_errors.append(ErrorRow(
                original_row_index=first_ce.affected_rows[0] if first_ce.affected_rows else -1,
                error_type=combined_error_codes,
                error_message=combined_error_messages,
                field=all_bad_fields[0] if all_bad_fields else "tax",
                value=str(all_bad_values.get(all_bad_fields[0], "")) if all_bad_fields else "",
                garden_name=row_data.get(GARDEN_COL, ""),
                vendor_name=row_data.get(col_map.get("vendor_name", ""), ""),
                invoice_number=row_data.get(col_map.get("invoice_number", ""), ""),
                invoice_date=str(row_data.get(col_map.get("invoice_date", ""), "")),
                gstin=row_data.get(col_map.get("gstin", ""), ""),
                severity="HARD",
                category="VALUE_INCONSISTENCY",
                affected_rows=first_ce.affected_rows,
                original_row_data=safe_row_data
            ))
        # Filter out inconsistent records from passing to soft validation
        valid_aggregated_df = valid_aggregated_df[~valid_aggregated_df["invoice_key"].isin(inconsistent_keys)].copy()
    
    print(f"DEBUG: Consistency Audit done. Valid remaining: {len(valid_aggregated_df)}, Total Errors: {len(aggregation_errors)}")

    # ── STEP 8: Soft Validation ───────────────────────────────────────────────
    print("DEBUG: [Step 8] Soft Validations start...")
    validated_df, warnings = run_soft_validations(valid_aggregated_df, col_map)
    
    if warnings:
        print(f"DEBUG: Generated {len(warnings)} soft warnings.")
        for w in warnings[:5]:
            print(f"  - [{w.warning_type}] Invoice: {w.invoice_key} | Msg: {w.warning_message}")
            
    # Bucketization
    warning_keys = set(w.invoice_key for w in warnings)
    clean_mask = ~validated_df["invoice_key"].isin(warning_keys)
    clean_invoices_df = validated_df[clean_mask].copy()
    warning_invoices_df = validated_df[~clean_mask].copy()
    
    print(f"DEBUG: Pipeline Results -> Clean: {len(clean_invoices_df)}, Warnings: {len(warning_invoices_df)}, Errors: {len(aggregation_errors)}")

    # ── STEP 9: Per-Garden Stats ──────────────────────────────────────────────
    garden_stats = {}
    for gn in garden_names:
        garden_mask = validated_df[GARDEN_COL] == gn
        total = int(garden_mask.sum())
        clean_c = int((clean_invoices_df[GARDEN_COL] == gn).sum()) if GARDEN_COL in clean_invoices_df.columns else 0
        warn_c = int((warning_invoices_df[GARDEN_COL] == gn).sum()) if GARDEN_COL in warning_invoices_df.columns else 0
        err_c = sum(
            1 for e in identity_errors
            if e.original_row_index < len(combined_df) and combined_df.iloc[e.original_row_index].get(GARDEN_COL) == gn
        )
        garden_stats[gn] = {"total_invoices": total, "valid": clean_c, "warnings": warn_c, "errors": err_c}

    # ── Serialize ─────────────────────────────────────────────────────────────
    summary = {
        "original_rows": total_rows,
        "identity_valid_rows": pre_agg_count,
        "identity_error_count": len(identity_errors),
        "aggregated_invoices": post_agg_count,
        "aggregation_error_count": len(aggregation_errors),
        "valid_invoices": len(clean_invoices_df),
        "warning_count": len(warnings),
        "warning_invoice_count": len(warning_invoices_df),
        "total_vendors": len(vendor_breakdown),
    }
    
    print(f"\n>>> DEBUG PIPELINE SUCCESS: {summary}\n")

    return {
        "clean_invoices": _serialize_df(clean_invoices_df),
        "warning_invoices": _serialize_df(warning_invoices_df),
        "identity_errors": [_serialize_identity_error(e) for e in identity_errors],
        "aggregation_errors": [_serialize_identity_error(e) for e in aggregation_errors],
        "warnings": [_serialize_warning(w) for w in warnings],
        "vendor_breakdown": {str(k): int(v) for k, v in vendor_breakdown.items()},
        "garden_names": garden_names,
        "garden_stats": garden_stats,
        "source_files": source_files,
        "manual_fixes": manual_fixes_applied,
        "col_map": col_map,
        "summary": summary,
    }


def _build_empty_result(total_rows, identity_errors, vendor_breakdown, garden_names) -> Dict[str, Any]:
    return {
        "clean_invoices": [],
        "warning_invoices": [],
        "identity_errors": [_serialize_identity_error(e) for e in identity_errors],
        "aggregation_errors": [],
        "warnings": [],
        "vendor_breakdown": {str(k): int(v) for k, v in vendor_breakdown.items()},
        "garden_names": garden_names,
        "garden_stats": {},
        "source_files": [],
        "manual_fixes": [],
        "col_map": {},
        "summary": {
            "original_rows": total_rows,
            "identity_valid_rows": 0,
            "identity_error_count": len(identity_errors),
            "aggregated_invoices": 0,
            "aggregation_error_count": 0,
            "valid_invoices": 0,
            "warning_count": 0,
            "warning_invoice_count": 0,
            "total_vendors": len(vendor_breakdown),
        },
    }


# ─── Public async API (SSE Streams) ─────────────────────────────────────────

async def _start_run_stream_with_sources(request: PipelineRunRequest, garden_files: List[tuple]):
    """Start a run using already-resolved source file tuples."""
    import json
    run_id = f"RUN_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6].upper()}"
    serialized_garden_files = _serialize_garden_files(garden_files)
    request_payload = {
        "file_ids": request.file_ids,
        "garden_assignments": [ga.model_dump() for ga in request.garden_assignments],
        "garden_files": serialized_garden_files,
        "col_map": request.col_map,
        "business_context": request.business_context,
        "company_gstins": request.company_gstins,
    }

    try:
        fix_actions_raw = [fa.model_dump() for fa in request.fix_actions]
        
        store.runs[run_id] = store.RunSession(
            run_id=run_id,
            status="running",
            entity_id=request.entity_id,
            period=request.period,
            business_context=request.business_context,
            company_gstins=request.company_gstins,
            garden_assignments=[ga.model_dump() for ga in request.garden_assignments],
            garden_files=serialized_garden_files,
            col_map=request.col_map,
            file_ids=request.file_ids,
            fix_actions=fix_actions_raw,
        )
    except Exception as e:
        yield f"data: {json.dumps({'status': 'Error', 'message': f'Initialization failed: {str(e)}'})}\n\n"
        return

    yield f"data: {json.dumps({'step': 10, 'total': 100, 'status': 'active', 'name': '[Step 1] Provisioning Secure Audit Sandbox...', 'run_id': run_id})}\n\n"
    await asyncio.sleep(0.5)

    loop = asyncio.get_event_loop()
    task = loop.run_in_executor(
        _executor,
        _run_pipeline_sync,
        garden_files, request.col_map,
        request.business_context, request.company_gstins, fix_actions_raw,
    )

    phases = [
        "[Step 2] Ingesting & Normalizing Sources...",
        "[Step 3] Canonicalizing Data Vectors...",
        "[Step 5] Extracting Forensic Anomalies...",
        "[Step 6] Compiling Vendor Trust Metrics...",
        "[Step 8] Triggering Self-Correction Engine...",
        "[Step 9] Validating Ledger Constraints..."
    ]

    for i, phase_msg in enumerate(phases):
        if task.done():
            break
        progress = 20 + (i * 12)
        yield f"data: {json.dumps({'step': progress, 'total': 100, 'status': 'active', 'name': phase_msg, 'run_id': run_id})}\n\n"
        await asyncio.sleep(0.5)

    while not task.done():
        yield f"data: {json.dumps({'step': 95, 'total': 100, 'status': 'active', 'name': '[Step 10] Finalizing Sub-Routines...', 'run_id': run_id})}\n\n"
        await asyncio.sleep(0.5)

    try:
        result = task.result()
        store.runs[run_id].result = result
        store.runs[run_id].status = "complete"
        
        # 🏛️ STAGE 1: Yield Lightweight Summary (Immediate KPI update)
        summary_payload = {
            'step': 100,
            'total': 100,
            'status': 'done',
            'name': '[Step 12] Audit Cycle Complete.',
            'run_id': run_id,
            'summary': result['summary']
        }
        print(f"DEBUG: Yielding Lightweight Summary for RUN {run_id}")
        yield f"data: {json.dumps(sanitize_nan(summary_payload))}\n\n"
        await asyncio.sleep(0.05)
        
        # 🚀 STAGE 2: Yield Full Results (Detailed Error Resolution)
        results_payload = {
            'status': 'done',
            'results': {
                'col_map': result['col_map'],
                'clean': result['clean_invoices'],
                'warnings': result['warnings'],
                'errors': result['identity_errors'] + result['aggregation_errors']
            }
        }
        print(f"DEBUG: Yielding Detailed Results (Approx: {len(str(results_payload))} chars)")
        clean_results = sanitize_nan(results_payload)
        yield f"data: {json.dumps(clean_results)}\n\n"
        print(f"DEBUG: Egress complete for RUN {run_id}")
        
    except Exception as exc:
        # If the core pipeline already completed and only SSE egress failed,
        # preserve the successful run for UI recovery/polling.
        if run_id in store.runs and store.runs[run_id].result is not None:
            store.runs[run_id].error = str(exc)
        else:
            store.runs[run_id].status = "failed"
            store.runs[run_id].error = str(exc)
        yield f"data: {json.dumps({'step': 100, 'total': 100, 'status': 'Error', 'message': f'Engine Fault: {str(exc)}', 'run_id': run_id})}\n\n"


async def start_run_stream(request: PipelineRunRequest):
    """
    Creates a RunSession, starts the pipeline in an executor, and yields Server-Sent Events
    (SSE) stream showing the simulated execution steps until completion.
    """
    garden_files = []
    for ga in request.garden_assignments:
        upload = store.get_upload(ga.file_id)
        if not upload:
            import json
            fid = ga.file_id
            yield f"data: {json.dumps({'status': 'Error', 'message': f'Upload file_id {fid!r} not found'})}\n\n"
            return
        garden_files.append((upload.file_path, ga.sheet_name, ga.garden_name, ga.header_row, upload.original_filename))

    async for event in _start_run_stream_with_sources(request, garden_files):
        yield event

async def reprocess_run_stream(original_run_id: str, new_fixes: List[FixAction]):
    """
    SSE stream for reprocessing. Accumulates old fixes, merges new ones, and spins up a new run.
    """
    import json
    original = store.get_run(original_run_id)
    if not original:
        yield f"data: {json.dumps({'status': 'Error', 'message': f'Run {original_run_id} not found'})}\n\n"
        return

    accumulated = original.fix_actions + [fa.model_dump() for fa in new_fixes]

    from models.requests import GardenAssignment, PipelineRunRequest as Req
    garden_assignments = [GardenAssignment(**ga) for ga in original.garden_assignments]

    req = Req(
        entity_id=original.entity_id,
        period=original.period,
        file_ids=original.file_ids,
        garden_assignments=garden_assignments,
        col_map=original.col_map,
        business_context=original.business_context,
        company_gstins=original.company_gstins,
        fix_actions=[FixAction(**fa) for fa in accumulated],
    )

    garden_files = [
        (
            gf["file_path"],
            gf["sheet_name"],
            gf["garden_name"],
            gf["header_row"],
            gf.get("original_filename", Path(gf["file_path"]).name)
        )
        for gf in original.garden_files
    ]

    if not garden_files:
        yield f"data: {json.dumps({'status': 'Error', 'message': 'Original source files are unavailable for reprocess'})}\n\n"
        return

    async for event in _start_run_stream_with_sources(req, garden_files):
        yield event
