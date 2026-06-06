import sys
import re

def fix_matcher():
    path = r'c:\Users\ashaz\OneDrive\Desktop\GST1\backend\services\reco_service.py'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_func = '''def _run_reconciliation_sync(
    clean_invoices: List[Dict[str, Any]],
    col_map: Dict[str, str],
    canonical_invoices: List[Dict[str, Any]],
    parent_run_id: str,
    reco_id: str,
) -> Dict[str, Any]:
    """Run reconciliation matcher and return serialized results."""
    from core.reco_2b.matcher import ReconciliationMatcher
    from core.reco_2b.exported_book_ingestor import ingest_exported_books_df
    import pandas as pd

    # Re-hydrate books DataFrame from session store records
    books_df = pd.DataFrame(clean_invoices)

    # Convert to BooksInvoice list using GSTONE's ingestor
    books_invoices = ingest_exported_books_df(books_df, col_map)

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
    }'''

    content = re.sub(r'def _run_reconciliation_sync\(.*?return \{.*?\}', new_func, content, flags=re.DOTALL)

    new_reco_and_store = '''def _reco_and_store(reco_id, clean_invoices, col_map, canonical_invoices, parent_run_id):
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
    except Exception as exc:'''

    content = re.sub(r'def _reco_and_store\(reco_id, clean_invoices, col_map, canonical_invoices\):.*?except Exception as exc:', new_reco_and_store, content, flags=re.DOTALL)
    
    # Update loop.run_in_executor call to pass parent_run_id
    content = content.replace(
        '_reco_and_store,\\n        reco_id, clean_invoices, col_map, canonical_invoices,',
        '_reco_and_store,\\n        reco_id, clean_invoices, col_map, canonical_invoices, parent_run_id,'
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    fix_matcher()
