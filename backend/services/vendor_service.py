"""
Vendor Service

Wraps GSTONE VendorMasterManager for vendor search and suggestion.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Dict, Any

from config import MAX_PIPELINE_WORKERS

_executor = ThreadPoolExecutor(max_workers=MAX_PIPELINE_WORKERS)


def _search_vendors_sync(query: str, context: Optional[str], limit: int) -> List[Dict[str, Any]]:
    from core.vendor_master.vendor_master_loader import load_vendor_master

    # load_vendor_master() returns a List of VendorEntry objects
    all_vendors = load_vendor_master()  # List[VendorEntry]
    q_lower = query.lower()
    results = []

    for entry in all_vendors:
        gstin = entry.gstin
        name_match = q_lower in (entry.vendor_name or "").lower()
        gstin_match = q_lower in gstin.lower()
        alias_match = any(q_lower in a.lower() for a in (entry.aliases or []))

        # Context filter — skip if vendor has explicit contexts and ours isn't in them
        context_ok = (not context) or (not entry.contexts) or (context in (entry.contexts or []))

        if (name_match or gstin_match or alias_match) and context_ok:
            results.append({
                "gstin": gstin,
                "vendor_name": entry.vendor_name,
                "trust_level": entry.trust_level.value if hasattr(entry.trust_level, "value") else str(entry.trust_level),
                "status": entry.status.value if hasattr(entry.status, "value") else str(entry.status),
                "contexts": entry.contexts or [],
                "aliases": entry.aliases or [],
            })

        if len(results) >= limit:
            break

    return results


async def search_vendors(query: str, context: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _search_vendors_sync, query, context, limit)
