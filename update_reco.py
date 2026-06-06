import sys

def modify_reco_service():
    path = r'c:\Users\ashaz\OneDrive\Desktop\GST1\backend\services\reco_service.py'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # The string replacements to update the logic
    # 1. Update _ingest_2b_sync signature and logic
    old_sync_logic = '''def _ingest_2b_files_sync(
    file_paths: List[str],
    declared_gstin: str,
    declared_period: str,
) -> Dict[str, Any]:
    """Run 2B ingestion pipeline and return serialized canonical invoices + stats."""
    from core.reco_2b.ingestion_pipeline import IngestionPipeline
    from decimal import Decimal

    pipeline = IngestionPipeline(storage_root=RECO_STORAGE_DIR)
    result = pipeline.ingest(
        file_path=Path(file_path),
        declared_gstin=declared_gstin,
        declared_period=declared_period,
        store_raw=True,
    )

    if not result.success:
        errors = [str(e) for e in result.adapter_result.errors]
        raise RuntimeError(f"2B ingestion failed: {'; '.join(errors)}")

    canonical_invoices = [inv.to_dict() for inv in result.canonical_result.canonical_invoices]

    stats = {
        "invoice_count": result.invoice_count,
        "duplicate_count": result.canonical_result.stats.duplicate_count if hasattr(result.canonical_result, "stats") else 0,
        "amendment_count": result.canonical_result.stats.amendment_count if hasattr(result.canonical_result, "stats") else 0,
        "total_taxable_value": float(sum(
            Decimal(str(inv.get("taxable_value", 0)))
            for inv in canonical_invoices
        )),
        "total_gst": float(sum(
            Decimal(str(inv.get("total_gst_amount", 0)))
            for inv in canonical_invoices
        )),
    }

    return {
        "canonical_invoices": canonical_invoices,
        "stats": stats,
        "upload_metadata": result.upload_metadata.to_dict(),
    }'''

    new_sync_logic = '''def _ingest_2b_files_sync(
    file_paths: List[str],
    declared_gstin: str,
    declared_period: str,
) -> Dict[str, Any]:
    """Run 2B ingestion pipeline for multiple files and return aggregated canonical invoices + stats."""
    from core.reco_2b.ingestion_pipeline import IngestionPipeline
    from decimal import Decimal

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
            aggregated_stats["duplicate_count"] += result.canonical_result.stats.duplicate_count
            aggregated_stats["amendment_count"] += result.canonical_result.stats.amendment_count

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
    }'''

    # We need to replace the old_sync_logic (with any potential file_path signature, since we replaced it in the run_command earlier)
    # Actually, let's just use regex to replace everything between 'def _ingest_2b' and the next 'def _run_reconciliation_sync'
    import re
    content = re.sub(
        r'def _ingest_2b_.*?_run_reconciliation_sync', 
        new_sync_logic + '\\n\\n\\ndef _run_reconciliation_sync', 
        content, 
        flags=re.DOTALL
    )

    # 2. Update ingest_2b_file to ingest_2b_files
    content = re.sub(
        r'async def ingest_2b_file.*?return result',
        '''async def ingest_2b_files(
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
        parent = store.get_run(reco.parent_run_id)
        database.upsert_reco_run(
            reco_id=reco_id,
            parent_run_id=reco.parent_run_id,
            entity_id=parent.entity_id if parent else None,
            period=parent.period if parent else None,
            declared_gstin=declared_gstin,
            status="ready",
            canonical={
                "stats": reco.canonical_stats,
                "invoices": reco.canonical_invoices,
            },
            results=None,
            created_at=reco.created_at,
        )

    return result''',
        content,
        flags=re.DOTALL
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    modify_reco_service()
