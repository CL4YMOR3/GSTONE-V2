"""
Pydantic Response Schemas
All endpoints return the standard envelope: {success, data, error}
"""
from pydantic import BaseModel
from typing import Any, Dict, List, Optional


# ─── Envelope ────────────────────────────────────────────────────────────────

class ApiResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[Dict[str, str]] = None

    @classmethod
    def ok(cls, data: Any) -> "ApiResponse":
        return cls(success=True, data=data)

    @classmethod
    def fail(cls, code: str, message: str) -> "ApiResponse":
        return cls(success=False, error={"code": code, "message": message})


# ─── Context ─────────────────────────────────────────────────────────────────

class ContextEntry(BaseModel):
    id: str
    display_name: str
    garden_codes: List[str]
    company_gstins: List[str]


# ─── Upload ──────────────────────────────────────────────────────────────────

class UploadFileResult(BaseModel):
    file_id: str
    original_filename: str
    size_bytes: int
    garden_code: Optional[str] = None
    garden_name: Optional[str] = None
    resolution_error: Optional[str] = None


class UploadResponse(BaseModel):
    files: List[UploadFileResult]


class SheetsResponse(BaseModel):
    file_id: str
    sheets: List[str]


# ─── Mapping ─────────────────────────────────────────────────────────────────

class MappingSuggestion(BaseModel):
    excel_column: str
    business_field: Optional[str]
    confidence: float           # 0.0 - 1.0
    match_reason: str           # "synonym", "exact", "fuzzy", "manual"
    needs_review: bool          # True if confidence < 0.8


class MappingDetectResponse(BaseModel):
    detected_columns: List[str]
    suggestions: List[MappingSuggestion]
    unmapped: List[str]         # Columns with no suggestion >= threshold


class MappingConfirmResponse(BaseModel):
    col_map: Dict[str, str]     # {business_field: excel_column}
    mapped_fields: List[str]
    missing_critical: List[str] # Critical fields not mapped (gstin, invoice_number, invoice_date)


# ─── Pipeline ────────────────────────────────────────────────────────────────

class PipelineRunResponse(BaseModel):
    run_id: str
    status: str


class GardenStats(BaseModel):
    total_invoices: int
    valid: int
    warnings: int
    errors: int


class RunSummary(BaseModel):
    original_rows: int
    identity_valid_rows: int
    identity_error_count: int
    aggregated_invoices: int
    aggregation_error_count: int
    valid_invoices: int
    warning_count: int
    warning_invoice_count: int
    total_vendors: int


class RunStatusResponse(BaseModel):
    run_id: str
    status: str
    summary: Optional[RunSummary] = None
    garden_stats: Optional[Dict[str, GardenStats]] = None
    error: Optional[str] = None
    created_at: str


class SuggestionPayload(BaseModel):
    field: str
    suggested_value: Optional[str]
    confidence: str
    reason: str
    source: Optional[str] = None  # "vendor_master" | "clean_invoices"
    validation: Optional[str] = None


class ErrorRow(BaseModel):
    original_row_index: int
    error_type: str
    error_message: str
    field: Optional[str]
    value: Optional[str]
    garden_name: Optional[str]
    vendor_name: Optional[str]
    invoice_number: Optional[str]
    invoice_date: Optional[str]
    gstin: Optional[str]
    severity: Optional[str]      # "HARD" | "SOFT"
    category: Optional[str]      # "VALUE_INCONSISTENCY" etc.
    gst_status: Optional[str] = None
    gate_failed: Optional[int] = None
    suggestion: Optional[SuggestionPayload] = None
    vendor_suggestion: Optional[Dict[str, Any]] = None
    original_row_data: Dict[str, Any] = {}
    affected_rows: List[int] = []


class ErrorsResponse(BaseModel):
    run_id: str
    col_map: Dict[str, str] = {}
    total_identity_errors: int
    total_aggregation_errors: int
    identity_errors: List[ErrorRow]
    aggregation_errors: List[ErrorRow]
    page: int
    limit: int


class InvoiceRow(BaseModel):
    invoice_key: Optional[str]
    garden_name: Optional[str]
    invoice_number: Optional[str]
    invoice_date: Optional[str]
    gstin: Optional[str]
    vendor_name: Optional[str]
    taxable_value: Optional[float]
    igst_amount: Optional[float]
    cgst_amount: Optional[float]
    sgst_amount: Optional[float]
    total_invoice_value: Optional[float]


class InvoiceListResponse(BaseModel):
    run_id: str
    total: int
    page: int
    limit: int
    invoices: List[InvoiceRow]


# ─── Export ──────────────────────────────────────────────────────────────────

class ExportResponse(BaseModel):
    export_id: str
    run_id: str
    file_name: str
    file_size_bytes: int


class ApproveResponse(BaseModel):
    export_id: str
    run_id: str
    approved: bool


# ─── Vendor ──────────────────────────────────────────────────────────────────

class VendorResult(BaseModel):
    gstin: str
    vendor_name: str
    trust_level: str
    status: str
    contexts: List[str]
    aliases: List[str] = []


class VendorSearchResponse(BaseModel):
    query: str
    context: Optional[str]
    vendors: List[VendorResult]


# ─── Reco ────────────────────────────────────────────────────────────────────

class RecoUploadResponse(BaseModel):
    reco_id: str
    upload_ids: List[str]
    status: str


class RecoBooksWorkbookResponse(BaseModel):
    run_id: str
    status: str
    business_context: str
    source_file: str
    invoice_count: int


class CanonicalSummary(BaseModel):
    reco_id: str
    invoice_count: int
    total_taxable_value: float
    total_gst: float
    duplicate_count: int
    amendment_count: int


class RecoRunResponse(BaseModel):
    reco_id: str
    status: str


class MatchResultRow(BaseModel):
    books_invoice_id: Optional[str] = None
    match_status: str           # MATCHED_STRICT | VALUE_MISMATCH | MISSING_IN_2B | ...
    match_method: Optional[str] = None
    matched_2b_invoice_id: Optional[str] = None
    books_supplier_gstin: Optional[str] = None
    books_supplier_name: Optional[str] = None
    books_invoice_number: Optional[str] = None
    books_invoice_date: Optional[str] = None
    books_taxable_value: Optional[float] = None
    books_total_gst: Optional[float] = None
    books_invoice_value: Optional[float] = None
    canonical_supplier_gstin: Optional[str] = None
    canonical_supplier_name: Optional[str] = None
    canonical_invoice_number: Optional[str] = None
    canonical_invoice_date: Optional[str] = None
    canonical_taxable_value: Optional[float] = None
    canonical_total_gst: Optional[float] = None
    canonical_invoice_value: Optional[float] = None
    candidate_count: int = 0
    value_deltas: List[Dict[str, Any]] = []
    mismatch_reasons: List[str] = []


class RecoResultsResponse(BaseModel):
    reco_id: str
    total_books: int
    total_2b: int
    total: int
    page: int
    limit: int
    results: List[MatchResultRow]
    unmatched_2b_count: int
