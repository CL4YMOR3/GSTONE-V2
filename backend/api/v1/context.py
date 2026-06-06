"""
Context Router — GET /api/v1/contexts, GET /api/v1/contexts/{context_id}
"""
from fastapi import APIRouter, HTTPException
from models.responses import ApiResponse, ContextEntry

router = APIRouter(prefix="/contexts", tags=["Context"])


def _load_contexts() -> list:
    from core.config_loader import get_business_contexts, get_garden_registry

    # get_business_contexts() → {context_id: {display_name, allows_multiple_gardens, ...}}
    business_contexts = get_business_contexts()
    # get_garden_registry() → {garden_name: company_gstin}  (flat map)
    garden_map = get_garden_registry()

    contexts = []
    for ctx_id, ctx_data in business_contexts.items():
        # Garden codes are all garden names that exist in the flat registry
        garden_codes = list(garden_map.keys())
        # Company GSTINs are all unique GSTINs in the garden registry
        all_company_gstins = list(set(garden_map.values()))
        
        # INSTITUTIONAL FIX: Filter GSTINs by context state prefix (e.g. '18' for Assam)
        # matches if prefix provided, otherwise returns all.
        prefix = ctx_data.get("default_state_prefix")
        if prefix:
            company_gstins = [g for g in all_company_gstins if g.startswith(prefix)]
            if not company_gstins: # Fallback to all if no match
                company_gstins = all_company_gstins
        else:
            company_gstins = all_company_gstins

        contexts.append(ContextEntry(
            id=ctx_id,
            display_name=ctx_data.get("display_name", ctx_id),
            garden_codes=garden_codes,
            company_gstins=company_gstins,
        ))

    # If no business_contexts defined, surface the garden registry directly as one context
    if not contexts and garden_map:
        contexts.append(ContextEntry(
            id="DEFAULT",
            display_name="Default Context",
            garden_codes=list(garden_map.keys()),
            company_gstins=list(set(garden_map.values())),
        ))

    return contexts


@router.get("", summary="List all business contexts")
async def list_contexts():
    try:
        contexts = _load_contexts()
        return ApiResponse.ok({"contexts": [c.model_dump() for c in contexts]})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{context_id}", summary="Get a specific business context")
async def get_context(context_id: str):
    try:
        from core.config_loader import get_business_contexts, get_garden_registry

        business_contexts = get_business_contexts()
        garden_map = get_garden_registry()

        ctx = business_contexts.get(context_id)

        # Fallback: if context_id is "DEFAULT" and no explicit contexts, return all gardens
        if not ctx and context_id == "DEFAULT" and garden_map:
            return ApiResponse.ok({
                "id": "DEFAULT",
                "display_name": "Default Context",
                "garden_map": garden_map,
                "company_gstins": list(set(garden_map.values())),
            })

        if not ctx:
            raise HTTPException(status_code=404, detail=f"Context '{context_id}' not found")

        return ApiResponse.ok({
            "id": context_id,
            "display_name": ctx.get("display_name", context_id),
            "garden_map": garden_map,
            "company_gstins": list(set(garden_map.values())),
            "allows_multiple_gardens": ctx.get("allows_multiple_gardens", True),
            "requires_garden_resolution": ctx.get("requires_garden_resolution", True),
        })
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

