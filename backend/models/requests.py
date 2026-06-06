"""
Pydantic Request Schemas
"""
from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class GardenAssignment(BaseModel):
    file_id: str
    sheet_name: str
    garden_name: str  # e.g. "BRB 042025"
    header_row: int = 0


class MappingEntry(BaseModel):
    excel_column: str
    business_field: str  # e.g. "gstin", "invoice_number", "invoice_date"


class MappingDetectRequest(BaseModel):
    file_id: str
    sheet_name: str


class MappingConfirmRequest(BaseModel):
    mappings: List[MappingEntry]


class FixAction(BaseModel):
    field: str                          # Business field key e.g. "gstin"
    old_value: Optional[str] = None
    new_value: str
    fix_type: str                       # e.g. "MANUAL_GSTIN_CORRECTION"
    scope: str = "SINGLE"               # "SINGLE" or "BULK"
    reference_rows: List[int] = []     # For SINGLE scope
    match_criteria: Dict[str, Any] = {}  # For BULK scope
    allow_cross_garden: bool = False
    confidence: str = "MANUAL"


class PipelineRunRequest(BaseModel):
    entity_id: Optional[str] = None
    period: Optional[str] = None
    file_ids: List[str]
    garden_assignments: List[GardenAssignment]
    col_map: Dict[str, str]             # {business_field: excel_column}
    business_context: str = "ASSAM_GARDENS"
    company_gstins: List[str] = []
    fix_actions: List[FixAction] = []   # Pre-loaded for reprocess


class SubmitFixesRequest(BaseModel):
    fixes: List[FixAction]


class ExportRequest(BaseModel):
    # Optional extra fixes to include before generating export
    extra_fixes: List[FixAction] = []


class ApproveExportRequest(BaseModel):
    pass  # No body needed — approval is just a flag toggle


class Reco2BUploadRequest(BaseModel):
    parent_run_id: str
    declared_gstin: str
    declared_period: str  # "MMYYYY" e.g. "042025"


class RecoRunRequest(BaseModel):
    reco_id: str
    parent_run_id: str


class FinalizeAuditRequest(BaseModel):
    entity_id: str
    period: str
    run_id: Optional[str] = None
    summary: Dict[str, Any]
    results: Dict[str, Any]
    fixes: List[FixAction] = []
