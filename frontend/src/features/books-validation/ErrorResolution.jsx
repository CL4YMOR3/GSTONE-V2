import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  PencilLine,
  Layers3,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';
import {
  buildFixSuggestion,
  buildSingleReferenceRows,
  getErrorKey,
  getBulkMatchCriteria,
  getErrorGarden,
  getErrorTaxAmount,
  isRowMatch,
  readField,
} from './forensicUtils';

const FixModal = ({
  activeErrorCount,
  error,
  suggestion,
  candidateValue,
  setCandidateValue,
  bulkEligible,
  bulkPreviewCount,
  allowCrossGarden,
  setAllowCrossGarden,
  onClose,
  onSkip,
  onApplySingle,
  onApplyBulk,
}) => {
  if (!error) return null;

  const vendorName = readField(error, 'vendor_name', ['vendor_name']) || 'Unknown Vendor';
  const invoiceNumber = readField(error, 'invoice_number', ['invoice_number']) || 'Missing';
  const invoiceDate = readField(error, 'invoice_date', ['invoice_date']) || 'Missing';
  const sourceLabel = suggestion?.source === 'vendor_master' ? 'Vendor Master' : suggestion?.source === 'clean_invoices' ? 'Clean Invoices' : 'Manual Review';
  const failingField = error?.field || 'gstin';
  const documentValue = readField(error, failingField, [failingField]) ?? error?.value ?? '(Missing)';
  const issueLabel = error?.category === 'VALUE_INCONSISTENCY' ? 'Tax Inconsistency' : error?.gst_status ? `GST Failure` : 'Identity Failure';
  const validationLine = suggestion?.validation || (suggestion?.source === 'vendor_master' ? 'Verified against Master' : 'Validated next run');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 bg-gradient-to-r from-stone-50 to-white border-b border-stone-100">
          <div>
            <div className="text-[10px] font-black text-brand-emerald uppercase tracking-widest mb-1">Review Fix</div>
            <h3 className="text-2xl font-black text-stone-900 tracking-tight">{vendorName}</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 bg-stone-100 text-stone-600 rounded-full text-[10px] font-black uppercase tracking-widest">
              {activeErrorCount} left
            </span>
            <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body - Split Left/Right */}
        <div className="flex flex-col md:flex-row flex-1">
          {/* Left Side: Context & Issue */}
          <div className="flex-1 p-8 bg-white">
            {/* Top Row: Context */}
            <div className="flex gap-4 mb-6">
              <div className="flex-1 bg-stone-50 rounded-2xl p-4 border border-stone-100">
                <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Invoice</div>
                <div className="text-sm font-bold text-stone-900">{invoiceNumber}</div>
                <div className="text-xs text-stone-500 font-medium">{invoiceDate}</div>
              </div>
              <div className="flex-1 bg-stone-50 rounded-2xl p-4 border border-stone-100">
                <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Current Entry</div>
                <div className="text-sm font-bold font-mono text-stone-900 truncate">{String(documentValue || 'Empty')}</div>
                <div className="text-[11px] text-stone-500 mt-1">Field: <span className="font-bold text-stone-700">{failingField}</span></div>
              </div>
            </div>

            {/* Issue Card */}
            <div className="bg-red-50/50 border border-red-100 rounded-2xl p-5 mb-6">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-[11px] font-black uppercase tracking-widest">{issueLabel}</span>
              </div>
              <p className="text-sm text-red-800 font-medium mb-4">{error.error_message}</p>
              
              <div className="bg-white rounded-xl border border-red-100 p-4 shadow-sm">
                <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Suggested Fix</div>
                <div className="text-sm text-stone-700 font-medium">{suggestion?.reason || 'Manual review required.'}</div>
                <div className="mt-3 pt-3 border-t border-stone-50 flex items-center gap-2">
                   <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                   <span className="text-xs text-stone-500 font-medium">{validationLine}</span>
                </div>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">{suggestion?.confidence || 'MANUAL'}</span>
              <span className="px-2.5 py-1 bg-stone-100 text-stone-600 rounded-lg text-[10px] font-black uppercase tracking-widest">{sourceLabel}</span>
              {error.gst_status && <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest">{error.gst_status}</span>}
            </div>
          </div>

          {/* Right Side: Action Input */}
          <div className="w-full md:w-[300px] bg-stone-50/80 border-l border-stone-100 p-8 flex flex-col justify-center">
            <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3">Correction</div>
            
            <input
              value={candidateValue}
              onChange={(event) => setCandidateValue(event.target.value.toUpperCase())}
              placeholder={(error?.field || 'gstin') === 'gstin' || error?.gst_status ? '15-char GSTIN' : 'Corrected value'}
              maxLength={15}
              className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3.5 text-sm font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:border-transparent shadow-sm mb-6 placeholder-stone-300"
            />

            <div className="space-y-3 mt-4">
              <button
                onClick={onApplySingle}
                disabled={!candidateValue}
                className="w-full py-3.5 px-4 bg-white border border-stone-200 text-stone-700 rounded-xl text-[11px] font-black uppercase tracking-[0.15em] hover:border-brand-emerald hover:text-brand-forest transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <PencilLine className="w-4 h-4" />
                Apply Single
              </button>
              
              {bulkEligible && (
                <button
                  onClick={onApplyBulk}
                  disabled={!candidateValue}
                  className="w-full py-3.5 px-4 bg-brand-forest text-white rounded-xl text-[11px] font-black uppercase tracking-[0.15em] hover:bg-brand-emerald transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-forest/20"
                >
                  <Layers3 className="w-4 h-4" />
                  Apply Bulk ({bulkPreviewCount})
                </button>
              )}

              <button
                onClick={onSkip}
                className="w-full py-3 px-4 text-stone-400 hover:text-stone-900 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors mt-2"
              >
                Skip → Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ErrorResolution = () => {
  const navigate = useNavigate();
  const {
    activeEntityId,
    selectedPeriod,
    currentRunId,
    setCurrentRunId,
    currentAuditResults,
    setCurrentAuditResults,
    setActiveStep,
    addFix,
    fixQueue,
  } = useAppStore();

  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState(null);
  const [actionMessage, setActionMessage] = React.useState(null);
  const [modalError, setModalError] = React.useState(null);
  const [candidateValue, setCandidateValue] = React.useState('');
  const [allowCrossGarden, setAllowCrossGarden] = React.useState(false);
  const [queuedErrorKeys, setQueuedErrorKeys] = React.useState({});
  const hydratedRunIdRef = React.useRef(null);
  // Tracks the index (within enrichedErrors) of the currently open modal item
  // so that next-item navigation advances sequentially, not back to index 0.
  const modalIndexRef = React.useRef(-1);

  const summary = currentAuditResults?.summary;
  const colMap = currentAuditResults?.col_map || {};

  const enrichedErrors = React.useMemo(
    () => (currentAuditResults?.errors || []).map((error) => ({ ...error, col_map: colMap })),
    [currentAuditResults?.errors, colMap]
  );

  const activeErrors = React.useMemo(
    () => enrichedErrors.filter((item) => !queuedErrorKeys[getErrorKey(item)]),
    [enrichedErrors, queuedErrorKeys]
  );

  React.useEffect(() => {
    setActiveStep(4);
  }, [setActiveStep]);

  React.useEffect(() => {
    const loadErrors = async () => {
      if (
        currentRunId &&
        hydratedRunIdRef.current === currentRunId &&
        enrichedErrors.length > 0 &&
        Object.keys(colMap).length > 0
      ) {
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        let effectiveRunId = currentRunId;

        if (!effectiveRunId && activeEntityId && selectedPeriod) {
          const sandboxRun = await api.getLatestSandboxRun(activeEntityId, selectedPeriod);
          effectiveRunId = sandboxRun.run_id;
          if (effectiveRunId) {
            setCurrentRunId(effectiveRunId);
          }

          if (sandboxRun.results || sandboxRun.summary) {
            setCurrentAuditResults({
              summary: sandboxRun.summary || summary,
              col_map: sandboxRun.results?.col_map || currentAuditResults?.col_map || {},
              clean: sandboxRun.results?.clean || [],
              warnings: sandboxRun.results?.warnings || [],
              errors: sandboxRun.results?.errors || [],
            });
            hydratedRunIdRef.current = sandboxRun.run_id || effectiveRunId || null;
          }
        }

        if (!effectiveRunId) {
          return;
        }

        const [errorPayload, cleanPayload, warningPayload, statusPayload] = await Promise.all([
          api.getRunErrors(effectiveRunId),
          api.getRunClean(effectiveRunId),
          api.getRunWarnings(effectiveRunId),
          api.getRunStatus(effectiveRunId),
        ]);

        setCurrentAuditResults({
          summary: statusPayload.summary || summary,
          col_map: errorPayload.col_map || {},
          clean: cleanPayload.invoices || [],
          warnings: warningPayload.invoices || [],
          errors: [...(errorPayload.identity_errors || []), ...(errorPayload.aggregation_errors || [])],
        });
        hydratedRunIdRef.current = effectiveRunId;
      } catch (error) {
        setErrorMessage(error.message || 'Failed to load GST and invoice issues.');
      } finally {
        setLoading(false);
      }
    };

    loadErrors();
  }, [
    activeEntityId,
    selectedPeriod,
    currentRunId,
    enrichedErrors.length,
    colMap,
    currentAuditResults?.col_map,
    setCurrentAuditResults,
    setCurrentRunId,
    summary,
  ]);

  const hardErrors = activeErrors.filter((item) => item.severity !== 'SOFT');
  const softErrors = activeErrors.filter((item) => item.severity === 'SOFT');

  const modalSuggestion = modalError ? buildFixSuggestion(modalError) : null;
  const bulkEligible = React.useMemo(() => {
    if (!modalError || modalError.gst_status !== 'GST_MISSING') {
      return false;
    }
    const invoiceNumber = readField(modalError, 'invoice_number', ['invoice_number']);
    const invoiceDate = readField(modalError, 'invoice_date', ['invoice_date']);
    return Boolean(invoiceNumber && invoiceDate && getErrorTaxAmount(modalError) > 0);
  }, [modalError]);

  const bulkPreviewCount = React.useMemo(() => {
    if (!modalError || !bulkEligible) {
      return 0;
    }
    const criteria = getBulkMatchCriteria(modalError);
    return enrichedErrors.filter((item) => isRowMatch(item, criteria, allowCrossGarden)).length;
  }, [modalError, bulkEligible, enrichedErrors, allowCrossGarden]);

  const openFixModal = (error) => {
    // Record the position in enrichedErrors so sequential advance works correctly.
    modalIndexRef.current = enrichedErrors.findIndex(
      (e) => getErrorKey(e) === getErrorKey(error)
    );
    setModalError(error);
    setCandidateValue(buildFixSuggestion(error)?.value || '');
    setAllowCrossGarden(false);
  };

  const closeFixModal = () => {
    modalIndexRef.current = -1;
    setModalError(null);
    setCandidateValue('');
    setAllowCrossGarden(false);
  };

  const openNextError = React.useCallback((resolvedKeys) => {
    // Search forward from the item AFTER the currently open modal item.
    // Fall back to a full scan if the ref is stale or unset.
    const startIdx = modalIndexRef.current >= 0 ? modalIndexRef.current + 1 : 0;
    const resolvedSet = new Set(resolvedKeys);

    // First pass: look at items after the current index
    let nextError = null;
    for (let i = startIdx; i < enrichedErrors.length; i++) {
      const key = getErrorKey(enrichedErrors[i]);
      if (!resolvedSet.has(key) && !queuedErrorKeys[key]) {
        nextError = enrichedErrors[i];
        modalIndexRef.current = i;
        break;
      }
    }

    // Second pass: wrap around to the beginning if nothing found after current
    if (!nextError) {
      for (let i = 0; i < startIdx; i++) {
        const key = getErrorKey(enrichedErrors[i]);
        if (!resolvedSet.has(key) && !queuedErrorKeys[key]) {
          nextError = enrichedErrors[i];
          modalIndexRef.current = i;
          break;
        }
      }
    }

    if (!nextError) {
      closeFixModal();
      return;
    }

    setModalError(nextError);
    setCandidateValue(buildFixSuggestion(nextError)?.value || '');
    setAllowCrossGarden(false);
  }, [enrichedErrors, queuedErrorKeys]);

  // Skip the current modal item and advance to the next one without resolving it.
  const skipCurrentError = React.useCallback(() => {
    if (!modalError) return;
    openNextError([getErrorKey(modalError)]);
  }, [modalError, openNextError]);

  const applySingleFix = async () => {
    if (!modalError || !candidateValue) {
      return;
    }

    const normalizedValue = candidateValue.trim().toUpperCase();
    const isGstinFix = (modalError.field || 'gstin') === 'gstin' || Boolean(modalError.gst_status);
    if (isGstinFix) {
      const validation = await api.validateGSTIN(normalizedValue);
      if (validation.status !== 'GST_VALID') {
        setErrorMessage(validation.error_message || 'Enter a valid GSTIN before queuing this fix.');
        return;
      }
    }

    const referenceRows = buildSingleReferenceRows(modalError, enrichedErrors);

    addFix({
      field: modalError.field || 'gstin',
      old_value: modalError.value || null,
      new_value: normalizedValue,
      fix_type: modalError.gst_status === 'GST_MISSING' ? 'MANUAL_GSTIN_SINGLE' : 'MANUAL_CORRECTION',
      scope: 'SINGLE',
      reference_rows: referenceRows,
      match_criteria: {},
      allow_cross_garden: false,
      confidence: modalSuggestion?.confidence || 'USER_CONFIRMED_SINGLE',
    });

    const nextQueued = {};
    enrichedErrors.forEach((error) => {
      if (referenceRows.includes(error.original_row_index)) {
        nextQueued[getErrorKey(error)] = true;
      }
    });
    const resolvedKeys = [...new Set([getErrorKey(modalError), ...Object.keys(nextQueued)])];
    nextQueued[getErrorKey(modalError)] = true;
    setQueuedErrorKeys((current) => ({ ...current, ...nextQueued }));
    setActionMessage(`Single fix queued for ${resolvedKeys.length} row${resolvedKeys.length === 1 ? '' : 's'}. Reprocess when ready.`);
    setErrorMessage(null);
    openNextError(resolvedKeys);
  };

  const applyBulkFix = async () => {
    if (!modalError || !candidateValue || !bulkEligible) {
      return;
    }

    const normalizedValue = candidateValue.trim().toUpperCase();
    const validation = await api.validateGSTIN(normalizedValue);
    if (validation.status !== 'GST_VALID') {
      setErrorMessage(validation.error_message || 'Enter a valid GSTIN before queuing this bulk fix.');
      return;
    }

    const criteria = getBulkMatchCriteria(modalError);
    const matchedErrors = activeErrors.filter((item) => isRowMatch(item, criteria, allowCrossGarden));
    const referenceRows = [...new Set(matchedErrors.flatMap((item) => (
      Array.isArray(item?.affected_rows) && item.affected_rows.length
        ? item.affected_rows
        : (item?.original_row_index >= 0 ? [item.original_row_index] : [])
    )))];

    addFix({
      field: 'gstin',
      old_value: null,
      new_value: normalizedValue,
      fix_type: 'MANUAL_GSTIN_OVERRIDE',
      scope: 'SINGLE',
      reference_rows: referenceRows,
      match_criteria: criteria,
      allow_cross_garden: allowCrossGarden,
      confidence: 'USER_CONFIRMED_BULK',
    });

    setQueuedErrorKeys((current) => ({
      ...current,
      ...Object.fromEntries(matchedErrors.map((item) => [getErrorKey(item), true])),
    }));
    setActionMessage(`Bulk fix queued for ${matchedErrors.length} matching row${matchedErrors.length === 1 ? '' : 's'}.`);
    setErrorMessage(null);
    openNextError(matchedErrors.map((item) => getErrorKey(item)));
  };

  if (!currentRunId && enrichedErrors.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-220px)] text-stone-400">
        <AlertTriangle className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-sm font-black uppercase tracking-widest">No active review run found</p>
        <button
          onClick={() => navigate('/books-validation/upload')}
          className="mt-6 text-brand-emerald font-bold uppercase text-[10px] tracking-widest hover:underline"
        >
          Start New Audit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-6">
      <header className="app-panel-hero p-8 md:p-10">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-brand-forest">
            <ShieldCheck className="w-4 h-4" />
            <span className="app-eyebrow text-brand-forest">Issue Review · Step 4</span>
          </div>
          <h1 className="app-page-title">Fix GST and invoice issues</h1>
          <p className="app-page-subtitle max-w-3xl">
            Run <span className="font-mono text-brand-forest">{currentRunId}</span> is still editable. Review suggested fixes, correct values, and clear missing GSTIN cases before final approval.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[
          { label: 'Queued Fixes', value: fixQueue.length, tone: 'bg-brand-forest', valueTone: 'text-brand-forest' },
          { label: 'Critical Errors', value: hardErrors.length, tone: 'bg-red-500', valueTone: 'text-red-600' },
          { label: 'Soft Findings', value: softErrors.length, tone: 'bg-amber-500', valueTone: 'text-amber-600' },
          { label: 'Clean Invoices', value: summary?.valid_invoices || currentAuditResults.clean?.length || 0, tone: 'bg-brand-emerald', valueTone: 'text-brand-emerald' },
        ].map((item) => (
          <div key={item.label} className="app-kpi-card p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{item.label}</div>
                <div className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
              </div>
              <div className={`mt-3 text-4xl font-black tracking-tight ${item.valueTone}`}>{item.value}</div>
            </div>
          ))}
      </div>

      {actionMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-brand-forest">
          {actionMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="app-table-shell rounded-[32px]">
        <div className="app-table-header px-8 py-5">
          <div>
            <h2 className="text-lg font-black text-stone-900 tracking-tight">Issues Found</h2>
            <p className="text-[11px] font-medium text-stone-500">Add single or bulk fixes here, then reprocess to check the updated purchase register.</p>
          </div>
          <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
            {loading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : `${activeErrors.length} unresolved rows`}
          </div>
        </div>

        <div className="divide-y divide-stone-100">
          {!loading && activeErrors.length === 0 && (
            <div className="px-8 py-14 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg font-black text-stone-900">No pending issues</h3>
              <p className="text-sm text-stone-500 mt-2">You can continue to approval or open the bulk GSTIN screen if needed.</p>
            </div>
          )}

          {activeErrors.map((item, index) => {
            const suggestion = buildFixSuggestion(item);
            const manualOnly = !suggestion;
            return (
              <div key={`${item.invoice_number || 'row'}-${index}`} className="px-8 py-6">
                <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
                  <div className="space-y-3 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.severity === 'SOFT' ? 'bg-stone-100 text-stone-600' : 'bg-brand-forest text-white'}`}>
                        {item.gst_status || item.error_type || 'HARD'}
                      </span>
                      <span className="text-sm font-black text-stone-900">{item.error_message}</span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap text-[11px] text-stone-500 font-medium">
                      <span>Vendor: {readField(item, 'vendor_name', ['vendor_name']) || item.vendor_name || 'Unknown'}</span>
                      <span>Invoice: {readField(item, 'invoice_number', ['invoice_number']) || item.invoice_number || 'Missing'}</span>
                      <span>Garden: {getErrorGarden(item)}</span>
                      <span>Tax: Rs. {getErrorTaxAmount(item).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="app-panel-subtle px-5 py-4">
                    <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3">Review Action</div>
                    <div className="space-y-3">
                      <div className="text-sm font-bold text-stone-900">
                        {suggestion ? `${item.field || 'gstin'} -> ${suggestion.value}` : 'Manual correction required'}
                      </div>
                      <div className="text-[11px] text-stone-500 leading-relaxed">
                        {suggestion?.reason || 'No deterministic suggestion was produced. Use manual fix review to continue.'}
                      </div>
                      <button
                        onClick={() => openFixModal(item)}
                        className="w-full rounded-2xl bg-brand-emerald text-white px-4 py-3 text-xs font-black uppercase tracking-[0.2em] hover:bg-brand-forest transition-colors flex items-center justify-center gap-2"
                      >
                        {manualOnly ? <PencilLine className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                        {manualOnly ? 'Manual Review' : 'Review Suggestion'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <footer className="app-panel flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-[11px] font-medium text-stone-500">
          Fixes stay in the working draft until you reprocess and approve this GST period.
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/books-validation/processing', { state: { isReprocess: true } })}
            disabled={fixQueue.length === 0}
            className="app-button-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reprocess Run
          </button>
          <button
            onClick={() => navigate('/books-validation/bulk-resolution')}
            className="app-button-primary bg-brand-forest hover:bg-brand-emerald"
          >
            Bulk GSTIN Fixes
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </footer>

      <FixModal
        activeErrorCount={activeErrors.length}
        error={modalError}
        suggestion={modalSuggestion}
        candidateValue={candidateValue}
        setCandidateValue={setCandidateValue}
        bulkEligible={bulkEligible}
        bulkPreviewCount={bulkPreviewCount}
        allowCrossGarden={allowCrossGarden}
        setAllowCrossGarden={setAllowCrossGarden}
        onClose={closeFixModal}
        onSkip={skipCurrentError}
        onApplySingle={applySingleFix}
        onApplyBulk={applyBulkFix}
      />
    </div>
  );
};
