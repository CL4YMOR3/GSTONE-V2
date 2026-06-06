# GST One - Session Learnings & Architectural Decisions

> **Context**: This log captures the evolved architectural standards and critical bug fixes derived from the forensic pipeline stabilization session.

## 🏛️ Evolved Architecture: Late-Commit Sandbox
- **Core Pattern**: **Memory-Sandbox Model**. Entire forensic audits run in-memory. Database I/O is deferred to the final certification step.
- **Benefits**: Eliminates `sqlite3.OperationalError: database is locked` during iterative audits and provides instantaneous UI feedback for manual corrections.
- **Certification Gateway**: Manual forensic decisions (fixes) are queued in the frontend sandbox (`currentAuditResults`) and atomicly committed via `POST /api/v1/pipeline/finalize`.

## ⚙️ Backend Stabilization (Lessons Learned)
- **Data Ingestion**: Use `await file.read()` followed by `io.BytesIO` for initial ingestion. **MANDATORY**: Perform `file.seek(0)` on memory buffers if multi-pass reading (e.g., sheet discovery followed by header extraction) is required.
- **SSE Streaming**: Prefer native FastAPI `StreamingResponse` with `yield` patterns over `sse-starlette`. Ensure `asyncio.sleep(0.01)` is used to prevent event bundling/congestion.
- **Heritage Isolation**: Maintain strict separation between `FastAPI` boilerplate and the institutional `GSTONE.core`. Never modify legacy logic; only provide API wrappers.
- **Environment**: Inject project root into `sys.path` in `main.py` to enable cross-module imports from the heritage root.

## 🎨 Frontend Patterns (Neu-Minimalist Sandbox)
- **State Management**: Zustand store (`useAppStore.js`) must hydrate `currentAuditResults` from the final SSE payload. 
- **Error Resolution**: Use a slide-out drawer pattern for invoice-level corrections. 
- **Bulk Patterns**: Group missing GSTINs by Vendor/Name pattern. Applying a fix at the pattern level should queue a `BULK` scope fix for the aggregator.

## 📊 Reporting & Persistence
- **Ledger Integrity**: The `ForensicLedger` and `ProcessError` tables should be purged for the specific `entity_id + period` before each final commitment to ensure an atomic fresh state.
- **Excel Bridge**: The workbook generator (`generate_books_workbook`) must materialize data directly from the **certified ledger** (post-finalize), not from transient pipeline buffers.

## 🛡️ Critical Fixes (Session History)
- **Mapping Collisions**: Synonyms for IGST/UTGST/Cess must be explicitly disambiguated in `column_synonyms.yaml` to prevent tax-field hijacking.
- **Serializers**: All numeric distributions MUST pass through a `sanitize_nan` utility before JSON transmission to prevent serialization failures.

---
**Status**: Ready for Fresh Start. Institutional components `backend` and `GSTONE` are slated for removal as per user request to begin Phase 2 from a clean slate.

---

# GST One - Project Configuration

> **Role**: Windows-native, offline-first GST reconciliation suite.

## 🛠️ Commands
- `python app/main.py` — Start the application (PySide6)
- `pytest tests/ -v` — Run full test suite
- `python .agent/scripts/checklist.py .` — Run code quality & security audit
- `pip install -r requirements.txt` — Setup environment

## 🏗️ Architecture
- **Tech Stack**: **React Vite (Frontend) + FastAPI (Backend) + SQLite (Persistence)**.
- **Frontend**: High-fidelity Neu-Minimalist UI with State-based routing and forensic dashboard modules.
- **Backend API**: FastAPI service hosting Entity management and bridging to core Python logic.
- **Core Processor**: `core.process_engine.ProcessEngine` executes a 10-step sequential pipeline.
- **Service Layers**: Follows **Controller → Service → Repository**.
- **Persistence**: SQLite (`gst_one.db`) for forensic ledger, trust data, and entity configuration.

## 🎨 Design Tokens (Neu-Minimalism)
- **Rounding**: 24px-32px (Containers), Radius-Pill (Status chips).
- **Shadows**: Multi-layered soft ambient shadows (Elevation 1-3).
- **Accents**: Emerald-700 (`#047857`) for success, Soft Gray-50 backgrounds.
- **Forensic Detail**: Laser-scan progress bars, parallel reconciliation tables with curved SVG bridges.

## ⚖️ Rules & Constraints
- **Aggregation Key**: IMMUTABLE. `GSTIN + Invoice Number + Invoice Date`.
- **Mapping Safety**: **80% Confidence Gate**. Auto-map only >80%. Amount fields penalized if they match "Rate" keywords.
- **UI Aesthetic**: **Neu-Minimalism** (Technical Luxury / Serene Clinical).
- **The "Purple Ban"**: **ABSOLUTELY NO PURPLE/VIOLET**.
- **Modern Polish**: High-legibility Inter/Sohne typography. Deep 16px-24px rounding. Airy white surfaces with subtle Gray-100 boundaries.
- **Offline Integrity**: 0 external API calls. Offline air-gapped processing only.
- **Phase 3**: Reconciliation matching is **Read-Only**. Source data is treated as permanent archives.

## ⚙️ Logic Tiers
### 10-Step Processing Pipeline
1. **Normalize** → 2. **State Match** → 3. **Tax Validation** → 4. **Rules Engine** → 5. **Aggregation** → 6. **Vendor Master Sync** → 7. **Learning Loop** → 8. **Error Branching** → 9. **Correction Queue** → 10. **Final Export**.

### 4-Tier Matching Engine
- **Tier 1**: Exact (100% field match).
- **Tier 2**: Date Tolerant (Match on No/Value, Date within threshold).
- **Tier 3**: Relaxed (Typo-tolerant Invoice Number matching).
- **Tier 4**: Fuzzy (Similarity-based vendor and value alignment).

### Vendor Trust Loop
- **WATCHLIST**: Observed in data.
- **CONSISTENT**: Persistent across multiple branches/periods.
- **VERIFIED**: Explicitly validated by user via confirmed fix.

## 🎨 UI Aesthetic Tier 2
- **Progress Ribbon**: Vertical timeline for pipeline execution.
- **Match Bridge**: Parallel twin-table scrolling for 2B Matching with visual links.
- **Fix Card**: Glassmorphic right-panel for easy error correction.
- **Data Grid**: Native `<table>` with static headers (Fixed Layout Synchronization).

## 🏁 Implementation Milestones
- [x] **Theme Finalization**: Global "Neu-Minimalist" light theme applied to all modules.
- [x] **Real-time Analytics**: Added live row counting in Backend (Pandas-driven).
- [x] **Intelligent Mapping**: Filename regex (`^[A-Z]{3,5}`) to Garden Name resolution via YAML.
- [x] **Grid Alignment**: Refactored File Queue from CSS Grid to HTML `<table>` for pixel-perfect header sync.
- [/] **Dynamic Registry**: (Next) Migrating YAML configs to SQLite `system_registry`.
- [/] **Compliance Tracking**: (Next) Implementing `forensic_ledger` for month-wise data segregation.

## ⚠️ State Warnings
- **Branch Resolution**: Filenames must match `^[A-Z]{3,5}\s\d{6}$`.
- **ID Integrity**: GSTIN first 2 digits MUST align with State mapping.
- **Persistence**: `gst_one_forensic.db` is the single source of truth for forensic results.
- **JSON Safety**: All numeric distributions MUST pass through `sanitize_nan` to prevent serialization errors.

## 📌 Pending Parity Notes
- **Original export gate parity**: The legacy GSTONE export screen combined workbook export, immutability approval, run finalization, and the post-approval GSTR-2B CTA in one flow. The web app now splits this across `CertificationPanel` and `Export`, but still lacks full post-approval parity such as a direct `Proceed to GSTR-2B Reconciliation` CTA on the final export surface.
- **Certified-ledger export resilience**: Export generation should continue to work from certified SQLite state even after in-memory sandbox sessions are gone. The backend route now accepts certified/approved runs, but this needs regression coverage.
- **Export metadata UX**: The original desktop flow surfaced the exported filename immediately after generation. The web flow now stores and displays workbook metadata, but approval history and prior export records are still not exposed in the UI.
