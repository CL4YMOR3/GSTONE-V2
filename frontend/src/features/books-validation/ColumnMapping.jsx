import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import {
  Columns,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  ChevronDown,
  Info,
  Settings
} from 'lucide-react';

export const ColumnMapping = () => {
  const { uploadedBooksFiles, setActiveStep, setColumnMappings } = useAppStore();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeFile = uploadedBooksFiles[activeIndex];
  const navigate = useNavigate();

  const [headers, setHeaders] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [preview, setPreview] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setActiveStep(2);
    if (activeFile) {
      api.extractHeaders(activeFile.file_id, activeFile.selectedSheet, activeFile.headerRow).then(res => {
        setHeaders(res.headers || []);
        setMappings(res.mappings || []);
        setPreview(res.preview || []);
      }).catch(err => {
        console.error("Failed to extract headers", err);
      }).finally(() => {
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, [setActiveStep, activeFile]);

  const targetFields = [
    { id: 'invoice_date', label: 'Invoice Date', type: 'Date', mandatory: true },
    { id: 'invoice_number', label: 'Invoice Number', type: 'String', mandatory: true },
    { id: 'vendor_name', label: 'Supplier Name', type: 'String' },
    { id: 'gstin', label: 'Tax ID (GSTIN)', type: 'String', mandatory: true },
    { id: 'taxable_value', label: 'Taxable Value', type: 'Currency' },
    { id: 'igst_amount', label: 'IGST', type: 'Currency' },
    { id: 'cgst_amount', label: 'CGST', type: 'Currency' },
    { id: 'sgst_amount', label: 'SGST', type: 'Currency' },
    { id: 'total_invoice_value', label: 'Total Value', type: 'Currency' },
  ];

  // Functional Stats Calculation (Replaced with PyQt logic)
  // PyQt logic: stats are calculated based on Excel Headers (columns)
  const autoMappedCount = mappings.filter(m => m.confidence >= 80 && m.confidence < 100).length;
  const needsConfirmCount = mappings.filter(m => m.confidence > 0 && m.confidence < 80).length;
  const unmappedCount = headers.length - mappings.length; // Count of columns not assigned to any field

  const missingMandatory = targetFields
    .filter(f => f.mandatory)
    .filter(f => {
      // PyQt logic: field is missing if not mapped OR if confidence < 80 (requires confirm)
      const mapped = mappings.find(m => m.business_field === f.id);
      return !mapped || (mapped.confidence < 80 && mapped.confidence !== 100);
    });

  const handleMappingChange = (fieldId, column) => {
    setMappings(prev => {
      const existing = prev.filter(m => m.business_field !== fieldId);
      if (column) {
        existing.push({ business_field: fieldId, excel_column: column, confidence: 100 });
      }

      // Update the global store as well so it persists across file switches if they share schema
      const updatedFiles = [...uploadedBooksFiles];
      updatedFiles[activeIndex] = { ...activeFile, mappings: existing };
      // Note: We don't setUploadedBooksFiles directly here to avoid re-triggering useEffect unless needed
      // but we should ensure setColumnMappings is called on handleProceed
      return existing;
    });
  };

  const handleProceed = () => {
    setActiveStep(3);
    // Map current mappings to all files for now as they usually share schema
    // or we could enforce separate mapping for each. 
    // User said "align schema for all uploaded files", so we apply current mapping to all.
    const finalMetadata = uploadedBooksFiles.map(f => ({
      file_id: f.file_id,
      filename: f.name,
      garden: f.garden,
      sheet: f.selectedSheet, // activeFile.selectedSheet
      headerRow: f.headerRow,
      mappings: mappings // Applying calibrated mapping to all files
    }));
    setColumnMappings(mappings);
    navigate('/books-validation/processing', { state: { metadata: finalMetadata } });
  };

  return (
    <div className="space-y-10 py-6">
      <header className="app-panel-hero p-8 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-3">
            <div className="app-eyebrow text-brand-forest">Books Validation · Step 2</div>
            <h2 className="app-page-title">Align source columns to the audit schema</h2>
            <p className="app-page-subtitle max-w-2xl">
              Confirm fuzzy matches, resolve mandatory gaps, and apply one calibrated mapping set across the uploaded books.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="app-kpi-card">
              <div className="app-eyebrow">Auto</div>
              <div className="mt-3 text-3xl font-black tracking-tight text-brand-forest">{autoMappedCount}</div>
            </div>
            <div className="app-kpi-card">
              <div className="app-eyebrow">Confirm</div>
              <div className="mt-3 text-3xl font-black tracking-tight text-amber-600">{needsConfirmCount}</div>
            </div>
            <div className="app-kpi-card">
              <div className="app-eyebrow">Unmapped</div>
              <div className="mt-3 text-3xl font-black tracking-tight text-stone-900">{unmappedCount}</div>
            </div>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex flex-col justify-center items-center">
          <div className="mb-4"><Spinner size="lg" /></div>
          <p className="text-xs font-black uppercase tracking-widest text-stone-500">Extracting Headers & Applying Fuzzy Match...</p>
        </div>
      ) : (
        <>
          {/* Top Section: Mapping Configuration */}
          <div className="space-y-6">
            <div className="flex flex-col items-start justify-between gap-6 lg:flex-row">
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 lg:flex-1">
                <div className="app-kpi-card flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-brand-emerald">{autoMappedCount}</span>
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest mt-1">Auto-mapped</span>
                </div>
                <div className="app-kpi-card flex flex-col items-center justify-center border-amber-200 bg-amber-50/40">
                  <span className="text-2xl font-black text-amber-500">{needsConfirmCount}</span>
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest text-center leading-tight mt-1">Needs Confirm</span>
                </div>
                <div className="app-kpi-card flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-stone-500">{unmappedCount}</span>
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest mt-1">Unmapped</span>
                </div>
              </div>

              {missingMandatory.length > 0 && (
                <div className="w-full shrink-0 rounded-[24px] border border-red-200 bg-red-50 p-5 shadow-sm lg:w-[420px]">
                  <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-black text-red-700 uppercase tracking-tight">Mandatory Fields Missing</p>
                    <p className="text-[11px] text-red-600/80 font-medium">
                      Please map these required fields:
                      <span className="block mt-1 font-bold text-red-700">{missingMandatory.map(f => f.label).join(', ')}</span>
                    </p>
                  </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <h3 className="text-sm font-black text-stone-900 tracking-tight">Field Mappings</h3>
              <span className="rounded-full border border-[rgba(231,226,216,0.95)] bg-white px-3 py-1.5 text-[10px] font-bold text-stone-500 shadow-sm">
                {targetFields.filter(f => mappings.some(m => m.business_field === f.id)).length} / {targetFields.length} Fields Configured
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {targetFields.map((field) => {
                const mappedTo = mappings.find(m => m.business_field === field.id);
                const isMapped = !!mappedTo;
                const isAuto = mappedTo && mappedTo.confidence >= 80 && mappedTo.confidence < 100;
                const isConfirm = mappedTo && mappedTo.confidence > 0 && mappedTo.confidence < 80;

                return (
                  <div
                    key={field.id}
                    className={`group relative rounded-[24px] border bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${isMapped ? (isConfirm ? 'border-amber-200 hover:border-amber-400' : 'border-brand-emerald/20 hover:border-brand-emerald/50') : 'border-[rgba(231,226,216,0.95)]'
                      }`}
                  >
                    <div className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-lg transition-colors ${isMapped ? (isConfirm ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-brand-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]') : 'bg-stone-100 group-hover:bg-amber-400'
                      }`} />

                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1 pl-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-stone-900">{field.label}</span>
                          {field.mandatory && <span className="text-[10px] text-red-500 font-bold">*</span>}
                        </div>
                        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-tight">Key: {field.id}</div>
                      </div>
                      <span className="text-[9px] font-mono font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded uppercase">{field.type}</span>
                    </div>

                    <div className="relative">
                      <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all ${isConfirm ? 'bg-amber-50/50 border-amber-200' : (isAuto ? 'bg-emerald-50/50 border-brand-emerald/20' : 'bg-stone-50 border-[rgba(231,226,216,0.95)]')
                        }`}>
                        <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${(isAuto || isConfirm) ? (isConfirm ? 'text-amber-500' : 'text-brand-emerald') : 'text-stone-400'}`} />
                        <select
                          className={`flex-1 bg-transparent text-xs min-w-0 font-bold outline-none cursor-pointer ${isConfirm ? 'text-amber-700' : (isAuto ? 'text-brand-forest' : (isMapped ? 'text-stone-900' : 'text-stone-500 italic'))}`}
                          value={mappedTo?.excel_column || ""}
                          onChange={(e) => handleMappingChange(field.id, e.target.value)}
                        >
                          <option value="">Select Target...</option>
                          {headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                      {(isAuto || isConfirm) && (
                        <div className={`absolute -top-2 right-4 px-2 py-0.5 rounded-full text-white text-[8px] font-black uppercase tracking-widest shadow-lg ${isConfirm ? 'bg-amber-500' : 'bg-brand-emerald'}`}>
                          {isConfirm ? 'Confirm' : 'Fuzzy'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>


        </>
      )}

      <div className="app-panel mt-8 flex flex-col items-center justify-between gap-6 p-6 sm:flex-row relative z-20">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="flex flex-col">
            <span className="app-eyebrow">Selected Mapping</span>
            <span className="text-xs font-bold text-stone-900 italic">V3.0 Standard Compliance Schema</span>
          </div>
        </div>
        <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
          <button className="app-button-ghost">Discard & Revoke</button>
          <button
            onClick={handleProceed}
            disabled={mappings.length < 4 || missingMandatory.length > 0}
            title={missingMandatory.length > 0 ? "Please map all mandatory fields before proceeding" : ""}
            className="app-button-primary px-8 py-4 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 group"
          >
            Finalize Mapping
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:scale-110">
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
