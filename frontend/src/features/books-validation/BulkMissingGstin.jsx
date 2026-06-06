import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Spinner } from '../../components/Spinner';
import { ArrowLeft, CheckCircle2, Eye, Info, ShieldCheck, X, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import {
  getBulkMatchCriteria,
  getErrorTaxAmount,
  getInvoiceStyle,
  isRowMatch,
  readField,
} from './forensicUtils';

const PreviewModal = ({ isOpen, onClose, onConfirm, gstin, matches, allowCrossGarden }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/70 px-8 py-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">Bulk Fix Preview</div>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-stone-900">{gstin}</h3>
            <p className="mt-1 text-sm text-stone-500">
              {matches.length} affected invoices{allowCrossGarden ? ' across matching gardens' : ''}.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-stone-400 transition-colors hover:bg-white hover:text-stone-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(88vh-170px)] overflow-y-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-white border-b border-stone-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Vendor</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Invoice</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Date</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Garden</th>
                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-stone-400">Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {matches.map((match, index) => (
                <tr key={`${match.original_row_index}-${index}`} className="hover:bg-stone-50/60">
                  <td className="px-6 py-4 text-sm font-bold text-stone-900">{readField(match, 'vendor_name', ['vendor_name']) || 'Unknown Vendor'}</td>
                  <td className="px-6 py-4 font-mono text-sm text-stone-700">{readField(match, 'invoice_number', ['invoice_number']) || 'Missing'}</td>
                  <td className="px-6 py-4 text-sm text-stone-600">{readField(match, 'invoice_date', ['invoice_date']) || 'Missing'}</td>
                  <td className="px-6 py-4 text-sm text-stone-600">{match.garden_name || readField(match, '_garden_name', ['_garden_name']) || 'Unknown'}</td>
                  <td className="px-6 py-4 text-right text-sm font-black text-stone-900">Rs. {getErrorTaxAmount(match).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-stone-100 bg-stone-50/70 px-8 py-5">
          <div className="text-xs font-medium text-stone-500">
            Confirm this GSTIN applies to all invoices in the selected rule group before reprocessing.
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest text-stone-500 transition-colors hover:text-stone-900">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex items-center gap-2 rounded-2xl bg-brand-forest px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-brand-emerald"
            >
              Confirm Bulk Fix
              <CheckCircle2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const BulkMissingGstin = () => {
  const {
    activeEntityId,
    selectedPeriod,
    setActiveStep,
    addFix,
    fixQueue,
    currentRunId,
    setCurrentRunId,
    currentAuditResults,
    setCurrentAuditResults,
  } = useAppStore();

  const navigate = useNavigate();
  const [drafts, setDrafts] = useState({});
  const [previewState, setPreviewState] = useState(null);
  const [loadingRecovery, setLoadingRecovery] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [approvedGroups, setApprovedGroups] = useState({});
  const hydratedRunIdRef = React.useRef(null);

  useEffect(() => {
    setActiveStep(5);
  }, [setActiveStep]);

  useEffect(() => {
    const recoverSandbox = async () => {
      if (!activeEntityId || !selectedPeriod) {
        return;
      }

      if (
        currentRunId &&
        hydratedRunIdRef.current === currentRunId &&
        (currentAuditResults?.errors || []).length > 0 &&
        Object.keys(currentAuditResults?.col_map || {}).length > 0
      ) {
        return;
      }

      setLoadingRecovery(true);
      setErrorMessage(null);
      try {
        let effectiveRunId = currentRunId;

        if (!effectiveRunId) {
          const sandboxRun = await api.getLatestSandboxRun(activeEntityId, selectedPeriod);
          effectiveRunId = sandboxRun.run_id;
          if (effectiveRunId) {
            setCurrentRunId(effectiveRunId);
          }

          if (sandboxRun.results || sandboxRun.summary) {
            setCurrentAuditResults({
              summary: sandboxRun.summary || null,
              col_map: sandboxRun.results?.col_map || {},
              clean: sandboxRun.results?.clean || [],
              warnings: sandboxRun.results?.warnings || [],
              errors: sandboxRun.results?.errors || [],
            });
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
          summary: statusPayload.summary || currentAuditResults?.summary || null,
          col_map: errorPayload.col_map || {},
          clean: cleanPayload.invoices || [],
          warnings: warningPayload.invoices || [],
          errors: [...(errorPayload.identity_errors || []), ...(errorPayload.aggregation_errors || [])],
        });
        hydratedRunIdRef.current = effectiveRunId;
      } catch (error) {
        setErrorMessage(error.message || 'Failed to recover the current review run.');
      } finally {
        setLoadingRecovery(false);
      }
    };

    recoverSandbox();
  }, [
    activeEntityId,
    selectedPeriod,
    currentRunId,
    currentAuditResults?.errors,
    currentAuditResults?.col_map,
    currentAuditResults?.summary,
    setCurrentRunId,
    setCurrentAuditResults,
  ]);

  const errors = useMemo(
    () => (currentAuditResults?.errors || []).map((error) => ({ ...error, col_map: currentAuditResults?.col_map || {} })),
    [currentAuditResults]
  );

  const gstMissingErrors = useMemo(
    () => errors.filter((error) => error.gst_status === 'GST_MISSING'),
    [errors]
  );

  const groups = useMemo(() => {
    const grouped = {};

    for (const error of gstMissingErrors) {
      const invoiceNumber = readField(error, 'invoice_number', ['invoice_number']);
      const invoiceDate = readField(error, 'invoice_date', ['invoice_date']);
      const taxAmount = getErrorTaxAmount(error);
      if (!invoiceNumber || !invoiceDate || taxAmount <= 0) {
        continue;
      }

      const criteria = getBulkMatchCriteria(error);
      if (criteria.tax_structure === 'EXEMPT') {
        continue;
      }

      const key = `${criteria.garden}|${criteria.normalized_account}|${criteria.invoice_style}|${criteria.tax_structure}`;
      if (!grouped[key]) {
        grouped[key] = {
          key,
          vendorName: readField(error, 'vendor_name', ['vendor_name']) || 'Unknown Vendor',
          criteria,
          matches: [],
        };
      }
      grouped[key].matches.push(error);
    }

    return Object.values(grouped).sort((left, right) => right.matches.length - left.matches.length);
  }, [gstMissingErrors]);

  const totalResolvable = groups.reduce((sum, group) => sum + group.matches.length, 0);
  const queuedBulkFixes = useMemo(
    () => fixQueue.filter((fix) => fix.fix_type === 'MANUAL_GSTIN_OVERRIDE').length,
    [fixQueue]
  );

  const handleDraftChange = (groupKey, value) => {
    setDrafts((current) => ({
      ...current,
      [groupKey]: {
        ...current[groupKey],
        gstin: value.toUpperCase(),
      },
    }));
  };

  const handleScopeToggle = (groupKey, checked) => {
    setDrafts((current) => ({
      ...current,
      [groupKey]: {
        ...current[groupKey],
        allowCrossGarden: checked,
      },
    }));
  };

  const handlePreview = async (group) => {
    const draft = drafts[group.key] || {};
    const gstin = (draft.gstin || '').trim().toUpperCase();
    if (!gstin) {
      return;
    }

    const validation = await api.validateGSTIN(gstin);
    if (validation.status !== 'GST_VALID') {
      setErrorMessage(validation.error_message || 'Enter a valid GSTIN before previewing this bulk fix.');
      return;
    }

    const matches = gstMissingErrors.filter((error) => isRowMatch(error, group.criteria, Boolean(draft.allowCrossGarden)));
    setPreviewState({
      group,
      gstin,
      allowCrossGarden: Boolean(draft.allowCrossGarden),
      matches,
    });
    setErrorMessage(null);
  };

  const handleConfirm = async () => {
    if (!previewState) {
      return;
    }

    const validation = await api.validateGSTIN(previewState.gstin);
    if (validation.status !== 'GST_VALID') {
      setErrorMessage(validation.error_message || 'Enter a valid GSTIN before queuing this bulk fix.');
      return;
    }

    const referenceRows = [...new Set(previewState.matches.flatMap((item) => (
      Array.isArray(item?.affected_rows) && item.affected_rows.length
        ? item.affected_rows
        : (item?.original_row_index >= 0 ? [item.original_row_index] : [])
    )))];

    addFix({
      field: 'gstin',
      old_value: null,
      new_value: previewState.gstin,
      fix_type: 'MANUAL_GSTIN_OVERRIDE',
      scope: 'SINGLE',
      reference_rows: referenceRows,
      match_criteria: previewState.group.criteria,
      allow_cross_garden: previewState.allowCrossGarden,
      confidence: 'USER_CONFIRMED_BULK',
    });

    setApprovedGroups((current) => ({ ...current, [previewState.group.key]: true }));
    setActionMessage(`Bulk fix queued for ${previewState.matches.length} matching row${previewState.matches.length === 1 ? '' : 's'}.`);
    setPreviewState(null);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-8 py-6">
      <header className="app-panel-hero p-8 md:p-10">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-forest">
            <ShieldCheck className="h-4 w-4" />
            <span className="app-eyebrow text-brand-forest">Bulk GSTIN Fixes · Step 5</span>
          </div>
          <h1 className="app-page-title">Fix missing GSTINs in bulk</h1>
          <p className="app-page-subtitle max-w-3xl">
            Use GSTONE-style rule groups to queue repeatable GSTIN corrections before the next reprocess.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start xl:self-auto">
          <button
            onClick={() => navigate('/books-validation/errors')}
            className="app-button-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Review
          </button>
        </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[
          { label: 'Rule Groups', value: groups.length, accent: 'bg-brand-forest', valueTone: 'text-brand-forest' },
          { label: 'Resolvable Errors', value: totalResolvable, accent: 'bg-brand-emerald', valueTone: 'text-brand-emerald' },
          { label: 'Queued Bulk Fixes', value: queuedBulkFixes, accent: 'bg-brand-forest/70', valueTone: 'text-brand-forest' },
        ].map((item) => (
          <div key={item.label} className="app-kpi-card p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">{item.label}</div>
              <div className={`h-2.5 w-2.5 rounded-full ${item.accent}`} />
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

      <div className="space-y-5">
        {loadingRecovery && groups.length === 0 && (
          <div className="app-panel p-16 text-center">
            <div className="mb-4 flex justify-center">
              <Spinner size="lg" />
            </div>
            <h3 className="text-xl font-black text-stone-900">Loading current review data</h3>
            <p className="mt-2 text-sm text-stone-500">Loading the latest entity-period run.</p>
          </div>
        )}

        {!loadingRecovery && groups.length === 0 && (
          <div className="app-panel p-16 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-brand-emerald" />
            <h3 className="text-xl font-black text-stone-900">No repetitive GST-missing patterns detected</h3>
            <p className="mt-2 text-sm text-stone-500">Continue to certification or use the single-row review workspace if needed.</p>
          </div>
        )}

        {groups.map((group) => {
          const draft = drafts[group.key] || {};
          const previewCount = errors.filter((error) => isRowMatch(error, group.criteria, Boolean(draft.allowCrossGarden))).length;
          const isQueued = Boolean(approvedGroups[group.key]);

          return (
            <div key={group.key} className="app-panel p-8">
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_340px]">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight text-stone-900">{group.vendorName}</h3>
                      <p className="mt-2 text-sm text-stone-500">
                        {group.matches.length} invoices in this group. Invoice style <span className="font-mono text-stone-700">{group.criteria.invoice_style || getInvoiceStyle('')}</span>.
                      </p>
                    </div>
                    <div className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest ${isQueued ? 'bg-emerald-50 text-brand-forest' : 'bg-stone-100 text-stone-600'}`}>
                      {isQueued ? 'Queued' : `${group.matches.length} Base Rows`}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Garden</div>
                      <div className="mt-2 text-sm font-black text-stone-900">{group.criteria.garden}</div>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Tax Profile</div>
                      <div className="mt-2 text-sm font-black text-stone-900">{group.criteria.tax_structure}</div>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Preview Scope</div>
                      <div className="mt-2 text-sm font-black text-stone-900">{previewCount} Rows</div>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Largest Tax</div>
                      <div className="mt-2 text-sm font-black text-stone-900">Rs. {Math.max(...group.matches.map(getErrorTaxAmount)).toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div className="app-panel-subtle space-y-4 rounded-[28px] p-6">
                  <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Master GSTIN Override</div>
                  <input
                    type="text"
                    value={draft.gstin || ''}
                    onChange={(event) => handleDraftChange(group.key, event.target.value)}
                    maxLength={15}
                    placeholder="Enter 15-character GSTIN"
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 font-mono text-base font-bold text-stone-900 outline-none focus:border-brand-emerald focus:ring-2 focus:ring-brand-emerald/10"
                  />

                  <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.allowCrossGarden)}
                      onChange={(event) => handleScopeToggle(group.key, event.target.checked)}
                      className="rounded border-stone-300"
                    />
                    <span className="text-xs font-bold text-stone-600">Propagate to matching rows across gardens</span>
                  </label>

                  <button
                    onClick={() => handlePreview(group)}
                    disabled={!draft.gstin || isQueued}
                    className="app-button-primary flex w-full disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Eye className="h-4 w-4" />
                    {isQueued ? 'Queued for Reprocess' : `Preview & Approve (${previewCount})`}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="app-panel flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-[11px] font-medium text-stone-500">
          Add bulk GSTIN fixes here, then reprocess once the updated data looks correct.
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/books-validation/certification')}
            className="app-button-ghost"
          >
            Skip Bulk Stage
          </button>

          <button
            onClick={() => navigate('/books-validation/processing', { state: { isReprocess: true } })}
            disabled={fixQueue.length === 0}
            className="app-button-primary bg-brand-forest px-8 py-3.5 hover:bg-brand-emerald disabled:opacity-30"
          >
            Reprocess Payload
            <Zap className="h-4 w-4 text-brand-emerald" />
          </button>
        </div>
      </footer>

      <AnimatePresence>
        <PreviewModal
          isOpen={Boolean(previewState)}
          onClose={() => setPreviewState(null)}
          onConfirm={handleConfirm}
          gstin={previewState?.gstin}
          matches={previewState?.matches || []}
          allowCrossGarden={previewState?.allowCrossGarden}
        />
      </AnimatePresence>
    </div>
  );
};
