import React, { useState, useCallback } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';
import {
  Upload, FileSpreadsheet, Trash2, CheckCircle2, AlertCircle,
  FileUp, ChevronRight, Database, Eye, EyeOff, Layers,
  ChevronDown, TableProperties, AlertTriangle
} from 'lucide-react';

// ─── Inline Spreadsheet Preview ─────────────────────────────────────────────
const SpreadsheetPreview = ({ headers, rows, isLoading, error }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-10 bg-stone-50 rounded-lg text-stone-500 border border-stone-200">
        <Spinner size="sm" />
        <span className="text-sm font-semibold">Loading preview...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-3 py-10 bg-red-50 border border-red-100 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-red-500" />
        <div>
          <p className="text-sm font-bold text-red-700">Preview not available</p>
          <p className="text-xs text-red-400 mt-0.5">Check file integrity or server connection.</p>
        </div>
      </div>
    );
  }

  if (!headers || headers.length === 0) return null;

  return (
      <div className="overflow-x-auto overflow-y-auto max-h-[320px] rounded-[22px] border border-[rgba(191,211,195,0.75)] bg-white shadow-sm">
      <table className="text-left border-collapse" style={{ minWidth: 'max-content' }}>
        {/* Frozen Header */}
        <thead className="sticky top-0 z-10">
          <tr className="bg-[rgba(245,247,242,0.98)]">
            <th className="sticky left-0 min-w-[44px] border-r border-[rgba(191,211,195,0.72)] bg-[rgba(245,247,242,0.98)] px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-app-ink-muted)] shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
              #
            </th>
            {headers.map((h, i) => (
              <th key={i} className="whitespace-nowrap border-r border-[rgba(191,211,195,0.72)] px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-app-ink)] last:border-r-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.isArray(rows) && rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={`border-t border-[rgba(219,230,220,0.7)] transition-colors hover:bg-[rgba(16,185,129,0.035)] ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-[rgba(247,250,247,0.72)]'}`}
            >
              {/* Sticky row number index lookup */}
              <td className="sticky left-0 select-none border-r border-[rgba(219,230,220,0.7)] bg-inherit px-3 py-2 text-[10px] font-mono text-[var(--color-app-ink-muted)] shadow-[1px_0_0_0_rgba(0,0,0,0.02)]">
                {rowIdx + 1}
              </td>
              {headers.map((header, cellIdx) => {
                const cell = row[header];
                return (
                  <td
                    key={cellIdx}
                    className="max-w-[240px] truncate whitespace-nowrap border-r border-[rgba(219,230,220,0.7)] px-4 py-2.5 text-[12px] font-mono text-[var(--color-app-ink)] last:border-r-0"
                    title={String(cell ?? '')}
                  >
                    {cell !== undefined && cell !== null ? String(cell) : <span className="text-stone-300 font-bold">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Row count footer */}
      <div className="sticky bottom-0 flex items-center justify-between border-t border-[rgba(191,211,195,0.72)] bg-[rgba(245,247,242,0.94)] px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--color-app-ink-muted)]">
            {rows.length} rows previewed
          </span>
          <div className="w-1 h-1 rounded-full bg-stone-200" />
          <span className="text-[10px] font-semibold text-[var(--color-app-ink-soft)]">{headers.length} columns detected</span>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-brand-forest">Preview Ready</span>
      </div>
    </div>
  );
};

// ─── Sheet Selector ──────────────────────────────────────────────────────────
const SheetSelector = ({ sheets, sheetsLoading, selectedSheet, onSheetChange }) => {
  if (sheetsLoading) {
    return (
      <div className="flex items-center gap-1.5 text-stone-400">
        <Spinner size="sm" />
        <span className="text-[11px] font-semibold">Fetching sheets...</span>
      </div>
    );
  }

  // Fallback: backend not ready — manual text input
  if (!sheets || sheets.length === 0) {
    return (
      <input
        type="text"
        value={selectedSheet || ''}
        onChange={(e) => onSheetChange(e.target.value)}
        placeholder="Sheet1"
        className="w-28 rounded-xl border border-[rgba(191,211,195,0.75)] bg-white px-2.5 py-1.5 text-[11px] font-mono font-bold text-[var(--color-app-ink)] outline-none focus:border-brand-emerald focus:ring-2 focus:ring-brand-emerald/10"
        title="Enter sheet name manually (backend sheets API unavailable)"
      />
    );
  }

  return (
    <div className="relative">
      <select
        value={selectedSheet || sheets[0]}
        onChange={(e) => onSheetChange(e.target.value)}
        className="appearance-none rounded-xl border border-[rgba(191,211,195,0.75)] bg-white py-1.5 pl-3 pr-8 text-[11px] font-mono font-bold text-[var(--color-app-ink)] outline-none transition-colors cursor-pointer hover:bg-[rgba(247,250,247,0.96)] focus:border-brand-emerald focus:ring-2 focus:ring-brand-emerald/10"
      >
        {sheets.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400 pointer-events-none" />
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
export const UploadFiles = () => {
  const { businessContext, setActiveStep, uploadedBooksFiles, setUploadedBooksFiles } = useAppStore();
  const navigate = useNavigate();

  const [headerRow, setHeaderRow] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Preview state: { [fileIdx]: { isOpen, isLoading, error, headers, rows } }
  const [previewState, setPreviewState] = useState({});

  const processFiles = async (newFilesArray) => {
    if (!newFilesArray.length) return;
    setIsAnalyzing(true);
    setValidationError('');

    const allFiles = [...uploadedBooksFiles.map(f => f.fileObj), ...newFilesArray];

    try {
      const res = await api.validateBooksFiles(allFiles);

      if (!res.success) setValidationError(res.errors.join(' | '));

      // Build file objects with sheet loading
      const newUploadedFiles = await Promise.all(
        allFiles.map(async (fileObj) => {
          const fileValidation = res.files?.find(f => f.name === fileObj.name) || {};

          // Fetch sheets per file (graceful-degrade if endpoint missing)
          let sheets = [];
          try {
            const sheetRes = await api.getFileSheets(fileValidation.file_id);
            sheets = sheetRes.sheets || [];
          } catch {
            sheets = [];
          }

          return {
            fileObj,
            name: fileObj.name,
            file_id: fileValidation.file_id,
            headerRow: res.detected_header_row !== undefined ? res.detected_header_row + 1 : 1,
            garden: fileValidation.garden || fileObj.name.replace(/\.[^.]+$/, ''),
            rows: fileValidation.row_count !== undefined ? fileValidation.row_count : 'Pending',
            sizeKb: (fileObj.size / 1024).toFixed(1),
            status: fileValidation.success ? 'Valid' : 'Error',
            error: fileValidation.error,
            sheets,
            selectedSheet: sheets[0] || '',
          };
        })
      );

      setUploadedBooksFiles(newUploadedFiles);
      if (res.success) setHeaderRow(res.detected_header_row !== undefined ? res.detected_header_row + 1 : 1);

      // Auto-fetch row counts in background
      const hydrateRowCounts = (filesToHydrate) => {
        filesToHydrate.forEach((file) => {
          if (!file.file_id) return;
          api.getFilePreview(file.file_id, file.selectedSheet, file.headerRow, 1)
            .then(previewRes => {
              setUploadedBooksFiles(prev => prev.map(f =>
                f.file_id === file.file_id ? { ...f, rows: previewRes.total_rows } : f
              ));
            })
            .catch(err => {
              console.error(`Failed to hydrate rows for ${file.file_id}:`, err);
              setUploadedBooksFiles(prev => prev.map(f =>
                f.file_id === file.file_id ? { ...f, rows: 'N/A' } : f
              ));
            });
        });
      };

      if (newUploadedFiles && newUploadedFiles.length > 0) {
        hydrateRowCounts(newUploadedFiles);
      }

    } catch (err) {
      setValidationError('Failed to validate files with server.');
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = async (e) => {
    if (e.target.files?.length) {
      await processFiles(Array.from(e.target.files));
    }
  };

  // Drag-and-drop
  const handleDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => /\.(xlsx|xls)$/i.test(f.name));
    if (files.length) await processFiles(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedBooksFiles, headerRow]);

  const removeFile = (idx) => {
    setUploadedBooksFiles(uploadedBooksFiles.filter((_, i) => i !== idx));
    setPreviewState(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const updateSheet = (idx, sheet) => {
    setUploadedBooksFiles(uploadedBooksFiles.map((f, i) =>
      i === idx ? { ...f, selectedSheet: sheet, rows: 'Pending' } : f
    ));
    // Reset preview when sheet changes
    setPreviewState(prev => ({ ...prev, [idx]: { isOpen: false } }));

    // Re-fetch rows for the new sheet
    const file = uploadedBooksFiles[idx];
    if (file && file.file_id) {
      api.getFilePreview(file.file_id, sheet, file.headerRow, 1).then(res => {
        setUploadedBooksFiles(prev => prev.map((f, i) => i === idx ? { ...f, rows: res.total_rows } : f));
      }).catch(console.error);
    }
  };

  const updateGarden = (idx, garden) => {
    setUploadedBooksFiles(uploadedBooksFiles.map((f, i) =>
      i === idx ? { ...f, garden } : f
    ));
  };

  const togglePreview = async (idx) => {
    const current = previewState[idx] || {};

    // Collapse if already open
    if (current.isOpen) {
      setPreviewState(prev => ({ ...prev, [idx]: { ...current, isOpen: false } }));
      return;
    }

    // Already loaded — just re-open
    if (current.headers) {
      setPreviewState(prev => ({ ...prev, [idx]: { ...current, isOpen: true } }));
      return;
    }

    // Load preview
    const file = uploadedBooksFiles[idx];
    setPreviewState(prev => ({ ...prev, [idx]: { isOpen: true, isLoading: true } }));

    try {
      const res = await api.getFilePreview(file.file_id, file.selectedSheet, file.headerRow, 50);
      setPreviewState(prev => ({
        ...prev,
        [idx]: { isOpen: true, isLoading: false, headers: res.headers, rows: res.rows, error: null }
      }));
      setUploadedBooksFiles(prev => prev.map((f, i) => i === idx ? { ...f, rows: res.total_rows } : f));
    } catch {
      setPreviewState(prev => ({
        ...prev,
        [idx]: { isOpen: true, isLoading: false, error: true, headers: null, rows: null }
      }));
    }
  };

  const handleAnalyze = () => {
    setActiveStep(2);
    navigate('/books-validation/mapping');
  };

  const validFiles = uploadedBooksFiles.filter(f => f.status === 'Valid').length;
  const errorFiles = uploadedBooksFiles.filter(f => f.status === 'Error').length;
  const canProceed = uploadedBooksFiles.length > 0 && !isAnalyzing && validationError === '' && errorFiles === 0;

  return (
    <div className="space-y-8 py-6">
      <header className="app-panel-hero relative p-8 md:p-10">
        <div className="absolute -right-6 top-0 h-44 w-44 rounded-full bg-brand-emerald/10 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-4">
            <div className="app-eyebrow text-brand-forest">Books Validation · Step 1</div>
            <h2 className="app-page-title">Upload purchase registers</h2>
            <p className="app-page-subtitle max-w-2xl">
              Validate source workbooks, confirm sheet selection, and preview the tabular structure before schema mapping.
              Active context: <span className="font-bold text-brand-forest capitalize">{businessContext}</span>.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="app-kpi-card">
              <div className="app-eyebrow">Files</div>
              <div className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-[var(--color-app-ink-strong)]">{uploadedBooksFiles.length}</div>
            </div>
            <div className="app-kpi-card">
              <div className="app-eyebrow">Valid</div>
              <div className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-brand-forest">{validFiles}</div>
            </div>
            <div className="app-kpi-card">
              <div className="app-eyebrow">Blocked</div>
              <div className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-red-600">{errorFiles}</div>
            </div>
          </div>
        </div>
      </header>

      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`app-panel flex cursor-pointer flex-col items-center justify-center gap-5 border-2 border-dashed p-12 text-center transition-all group ${isDragging
          ? 'border-brand-emerald bg-brand-emerald/5 scale-[1.01]'
          : 'border-[rgba(191,211,195,0.72)] hover:border-brand-emerald hover:bg-[rgba(247,250,247,0.96)]'
          }`}
      >
        <input
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
        <motion.div
          animate={{ scale: isDragging ? 1.15 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all ${isDragging
            ? 'bg-brand-emerald text-white'
            : 'bg-stone-100 text-stone-400 group-hover:bg-brand-emerald group-hover:text-white'
            }`}
        >
          <FileUp className="w-8 h-8" />
        </motion.div>
        <div className="space-y-1">
          <div className="app-eyebrow">Source Intake</div>
          <h3 className="text-[1.45rem] font-extrabold tracking-[-0.03em] text-[var(--color-app-ink-strong)]">
            {isDragging ? 'Release to upload' : 'Upload Purchase Registers'}
          </h3>
          <p className="max-w-xl text-[15px] leading-7 font-medium text-[var(--color-app-ink-soft)]">
            Drag & drop or browse · Accepts .xlsx, .xls, .csv · Max 50MB per file
          </p>
        </div>
        <button type="button" className="app-button-ghost mt-2">
          Browse local storage
        </button>
      </label>

      {/* Validation Error */}
      <AnimatePresence>
        {validationError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-1.5 rounded-[22px] border border-red-200 bg-[var(--color-app-danger-soft)] p-4 text-sm font-bold text-red-600"
          >
            <div className="flex items-center gap-2"><AlertCircle className="w-5 h-5" /><span>Validation Failure</span></div>
            <span className="font-medium text-xs">{validationError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="app-panel flex flex-col gap-6 p-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-6">
          <div className="space-y-0.5">
            <div className="app-eyebrow">Active Selections</div>
            <div className="text-[1.35rem] font-extrabold tracking-[-0.03em] text-[var(--color-app-ink-strong)]">
              {uploadedBooksFiles.length > 0
                ? `${uploadedBooksFiles.length} file${uploadedBooksFiles.length > 1 ? 's' : ''}`
                : 'No files selected'}
            </div>
          </div>
          <div className="h-10 w-px bg-[rgba(231,226,216,0.95)]" />

          {uploadedBooksFiles.length > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-emerald" />
                <span className="text-[11px] font-semibold text-[var(--color-app-ink-soft)]">{validFiles} valid</span>
              </div>
              {errorFiles > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span className="text-[11px] font-bold text-red-500">{errorFiles} error{errorFiles > 1 ? 's' : ''}</span>
                </div>
              )}
              <div className="h-10 w-px bg-[rgba(231,226,216,0.95)]" />
            </>
          )}

          <div className="space-y-0.5">
            <label className="app-eyebrow">Header Row</label>
            <input
              type="number"
              min={1}
              value={headerRow}
              onChange={(e) => {
                const row = parseInt(e.target.value) || 1;
                setHeaderRow(row);
                setUploadedBooksFiles(uploadedBooksFiles.map(f => ({ ...f, headerRow: row, rows: 'Pending' })));
                setPreviewState({});

                // Re-fetch all row counts
                uploadedBooksFiles.forEach((file, idx) => {
                  if (!file.file_id) return;
                  api.getFilePreview(file.file_id, file.selectedSheet, row, 1).then(res => {
                    setUploadedBooksFiles(prev => prev.map((f, i) => i === idx ? { ...f, rows: res.total_rows } : f));
                  }).catch(console.error);
                });
              }}
              className="block w-20 rounded-xl border border-[rgba(231,226,216,0.95)] bg-white px-3 py-2 text-xs font-bold outline-none focus:border-brand-emerald focus:ring-2 focus:ring-brand-emerald/10"
            />
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={!canProceed}
          className="app-button-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {isAnalyzing ? (
            <><Spinner size="sm" className="border-white border-t-white/25" /> Validating...</>
          ) : (
            <>Analyze Mapping <ChevronRight className="w-4 h-4" /></>
          )}
        </button>
      </div>

      <div className="app-table-shell">
        <div className="app-table-header">
          <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-stone-500">
            <Database className="w-4 h-4 text-brand-emerald" />
            Queued Files
          </h4>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-app-ink-muted)]">
            {uploadedBooksFiles.length} File{uploadedBooksFiles.length !== 1 ? 's' : ''} Selected
          </span>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur">
              <tr className="border-b border-[rgba(231,226,216,0.8)]">
                <th className="w-[30%] px-6 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest">File Name</th>
                <th className="w-[15%] px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest">Garden</th>
                <th className="w-[15%] px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">Sheet</th>
                <th className="w-[10%] px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">Rows</th>
                <th className="w-[10%] px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">Size</th>
                <th className="w-[12%] px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">Status</th>
                <th className="w-[8%] px-6 py-3"></th>
              </tr>
              <tr className="absolute bottom-0 left-0 right-0 h-px bg-stone-100 shadow-sm" />
            </thead>
            <tbody className="divide-y divide-stone-50">
              <AnimatePresence initial={false}>
                {uploadedBooksFiles.map((file, idx) => {
                  const preview = previewState[idx] || {};
                  const isPreviewOpen = preview.isOpen;

                  return (
                    <React.Fragment key={`${file.name}-${idx}`}>
                      <motion.tr
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.18 }}
                        className="group transition-colors hover:bg-[rgba(16,185,129,0.035)]"
                      >
                        {/* File Name */}
                        <td className="px-6 py-4 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="shrink-0 rounded-xl bg-emerald-50 p-2.5 text-brand-emerald">
                              <FileSpreadsheet className="w-5 h-5" />
                            </div>
                            <span className="truncate text-sm font-semibold text-[var(--color-app-ink-strong)] group-hover:text-brand-forest" title={file.name}>
                              {file.name}
                            </span>
                          </div>
                        </td>

                        {/* Garden */}
                        <td className="px-4 py-4">
                          <input
                            type="text"
                            value={file.garden || ''}
                            onChange={(e) => updateGarden(idx, e.target.value)}
                            title="Garden name stamped on every row in the workbook"
                            className="w-full rounded-xl border border-[rgba(191,211,195,0.75)] bg-white px-2.5 py-2 text-xs font-mono font-bold text-[var(--color-app-ink)] outline-none transition-colors hover:bg-[rgba(247,250,247,0.96)] focus:border-brand-emerald focus:ring-2 focus:ring-brand-emerald/10"
                            placeholder="Garden name…"
                          />
                        </td>

                        {/* Sheet Selector */}
                        <td className="px-4 py-4">
                          <div className="flex justify-center">
                            <SheetSelector
                              file={file.fileObj}
                              sheets={file.sheets}
                              sheetsLoading={false}
                              selectedSheet={file.selectedSheet}
                              onSheetChange={(sheet) => updateSheet(idx, sheet)}
                            />
                          </div>
                        </td>

                        {/* Rows */}
                        <td className="px-4 py-4 text-center">
                          <div className="text-sm font-mono font-semibold text-[var(--color-app-ink-soft)]">
                            {typeof file.rows === 'number' ? file.rows.toLocaleString() : file.rows}
                          </div>
                        </td>

                        {/* Size */}
                        <td className="px-4 py-4 text-center">
                          <div className="text-xs font-mono font-semibold text-[var(--color-app-ink-muted)]">
                            {file.sizeKb} KB
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <div className="flex justify-center flex-col items-center">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${file.status === 'Error'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-emerald-50 text-brand-forest'
                              }`}>
                              {file.status === 'Error'
                                ? <AlertCircle className="w-3 h-3" />
                                : <CheckCircle2 className="w-3 h-3" />}
                              {file.status}
                            </div>
                            {file.error && (
                              <p className="text-[9px] font-bold text-red-500 mt-1 max-w-[150px] truncate" title={file.error}>
                                {file.error}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => togglePreview(idx)}
                              title={isPreviewOpen ? 'Hide preview' : 'Preview file data'}
                                className={`rounded-xl p-2 transition-colors ${isPreviewOpen
                                ? 'bg-brand-emerald/10 text-brand-forest'
                                : 'text-stone-300 hover:text-brand-emerald hover:bg-emerald-50'
                                }`}
                            >
                              {isPreviewOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => removeFile(idx)}
                              className="rounded-xl p-2 text-stone-300 transition-colors hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>

                      {/* Preview Row */}
                      <AnimatePresence>
                        {isPreviewOpen && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.22, ease: 'easeInOut' }}
                                className="overflow-hidden border-t border-[rgba(219,230,220,0.8)] bg-[rgba(247,250,247,0.88)]"
                              >
                                <div className="px-6 pb-6 pt-2">
                                  <div className="mb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <TableProperties className="w-4 h-4 text-stone-400" />
                                      <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--color-app-ink-soft)]">
                                        Spreadsheet Preview
                                      </span>
                                      {file.selectedSheet && (
                                        <span className="rounded-full border border-[rgba(191,211,195,0.72)] bg-white px-2.5 py-1 text-[10px] font-bold text-[var(--color-app-ink-soft)] font-mono">
                                          {file.selectedSheet}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-[var(--color-app-ink-muted)]">· up to 50 rows</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[var(--color-app-ink-muted)]">
                                      <Layers className="w-3.5 h-3.5" />
                                      <span className="text-[10px] font-semibold">Row header: {file.headerRow}</span>
                                    </div>
                                  </div>

                                  <SpreadsheetPreview
                                    headers={preview.headers}
                                    rows={preview.rows}
                                    isLoading={preview.isLoading}
                                    error={preview.error}
                                  />
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}

                {uploadedBooksFiles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-14 text-center space-y-3">
                      <Upload className="w-10 h-10 text-stone-200 mx-auto mb-2" />
                      <p className="text-sm font-bold text-stone-400 uppercase tracking-widest">No files uploaded yet</p>
                      <p className="text-xs text-stone-400">Drag files above or click "Browse local storage"</p>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
