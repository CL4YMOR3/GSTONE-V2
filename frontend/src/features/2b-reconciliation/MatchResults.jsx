import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  X,
  Download,
} from 'lucide-react';

const TAB_CONFIG = [
  { id: 'ALL', label: 'All Results', statuses: null },
  { id: 'MATCHED', label: 'Matched', statuses: ['MATCHED_STRICT', 'MATCHED_RELAXED'] },
  { id: 'VALUE_MISMATCH', label: 'Value Mismatch', statuses: ['VALUE_MISMATCH'] },
  { id: 'POSSIBLE_MATCH', label: 'Possible Match', statuses: ['POSSIBLE_MATCH'] },
  { id: 'MISSING_IN_2B', label: 'Not in 2B', statuses: ['MISSING_IN_2B'] },
  { id: 'MISSING_IN_BOOKS', label: 'Not in Books', statuses: ['MISSING_IN_BOOKS'] },
  { id: 'AMBIGUOUS_MATCH', label: 'Duplicate / Ambiguous', statuses: ['AMBIGUOUS_MATCH'] },
];

const STATUS_META = {
  MATCHED_STRICT: { label: 'Matched Strict', tone: 'emerald', icon: CheckCircle2 },
  MATCHED_RELAXED: { label: 'Matched Relaxed', tone: 'emerald', icon: Target },
  VALUE_MISMATCH: { label: 'Value Mismatch', tone: 'amber', icon: TrendingDown },
  POSSIBLE_MATCH: { label: 'Possible Match', tone: 'violet', icon: Sparkles },
  MISSING_IN_2B: { label: 'Not in 2B', tone: 'red', icon: AlertCircle },
  MISSING_IN_BOOKS: { label: 'Not in Books', tone: 'sky', icon: LayoutGrid },
  AMBIGUOUS_MATCH: { label: 'Duplicate / Ambiguous', tone: 'stone', icon: FileSpreadsheet },
};

const TONE_STYLES = {
  emerald: 'border-emerald-200 bg-emerald-50 text-brand-forest',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
  stone: 'border-stone-200 bg-stone-100 text-stone-700',
};

const KPI_ACCENTS = [
  'text-brand-forest',
  'text-amber-700',
  'text-red-600',
  'text-sky-700',
];

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return `Rs.${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatCompactCurrency = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  const absNum = Math.abs(num);
  if (absNum >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (absNum >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (absNum >= 1000) return `₹${(num / 1000).toFixed(1)}k`;
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

const normalizeRow = (row, index) => {
  const status = row.match_status || 'UNKNOWN';
  const meta = STATUS_META[status] || { label: status, tone: 'stone', icon: FileSpreadsheet };
  const booksLabel = row.books_invoice_number || row.books_invoice_id || '—';
  const portalLabel = row.canonical_invoice_number || row.matched_2b_invoice_id || '—';
  const delta = (row.books_total_gst ?? 0) - (row.canonical_total_gst ?? 0);

  return {
    ...row,
    rowKey: `${status}-${row.books_invoice_id || row.matched_2b_invoice_id || index}`,
    displayIndex: index + 1,
    statusMeta: meta,
    booksLabel,
    portalLabel,
    delta,
  };
};

const filterRowsByTab = (rows, tabId) => {
  const tab = TAB_CONFIG.find((entry) => entry.id === tabId);
  if (!tab || !tab.statuses) return rows;
  return rows.filter((row) => tab.statuses.includes(row.match_status));
};

const computeStats = (rows) => {
  const counts = rows.reduce((acc, row) => {
    acc[row.match_status] = (acc[row.match_status] || 0) + 1;
    return acc;
  }, {});

  const matchedRows = rows.filter((row) => ['MATCHED_STRICT', 'MATCHED_RELAXED'].includes(row.match_status));
  const atRiskRows = rows.filter((row) => ['VALUE_MISMATCH', 'MISSING_IN_2B', 'POSSIBLE_MATCH', 'AMBIGUOUS_MATCH'].includes(row.match_status));
  const missingBooksRows = rows.filter((row) => row.match_status === 'MISSING_IN_BOOKS');

  return {
    total: rows.length,
    matchedItc: matchedRows.reduce((sum, row) => sum + Number(row.canonical_total_gst || row.books_total_gst || 0), 0),
    atRiskItc: atRiskRows.reduce((sum, row) => sum + Number(row.books_total_gst || row.canonical_total_gst || 0), 0),
    missingIn2B: counts.MISSING_IN_2B || 0,
    unclaimedItc: missingBooksRows.reduce((sum, row) => sum + Number(row.canonical_total_gst || 0), 0),
  };
};

const DetailSection = ({ title, children, boxClass = '' }) => (
  <section className={`space-y-3 ${boxClass ? `rounded-3xl border p-5 ${boxClass}` : ''}`}>
    <div className={`text-[10px] font-black uppercase tracking-widest ${boxClass ? 'text-stone-500' : 'text-stone-400'}`}>{title}</div>
    <div className="space-y-2">{children}</div>
  </section>
);

const DetailField = ({ label, value, mono = false }) => (
  <div className="grid grid-cols-[112px_1fr] gap-3 rounded-2xl border border-black/5 bg-white/50 px-4 py-3">
    <div className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</div>
    <div className={`${mono ? 'font-mono text-xs' : 'text-sm'} break-all font-semibold text-stone-900`}>{value || '—'}</div>
  </div>
);

const KpiCard = ({ title, value, subtitle, accent, hideDot }) => (
  <div className="app-kpi-card p-6">
    <div className="flex items-center justify-between gap-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">{title}</div>
      {!hideDot && <div className={`h-2.5 w-2.5 rounded-full ${accent.replace('text-', 'bg-')}`} />}
    </div>
    <div className={`mt-3 text-4xl font-black tracking-tight truncate ${accent}`} title={value}>{value}</div>
    <p className="mt-2 max-w-xs text-xs font-medium leading-relaxed text-stone-500">{subtitle}</p>
  </div>
);

export const MatchResults = () => {
  const { currentRecoId, setActiveStep } = useAppStore();
  const navigate = useNavigate();
  const [rows, setRows] = React.useState([]);
  const [activeTab, setActiveTab] = React.useState('ALL');
  const [selectedRowKey, setSelectedRowKey] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [exportMessage, setExportMessage] = React.useState(null);

  React.useEffect(() => {
    setActiveStep(3);
  }, [setActiveStep]);

  React.useEffect(() => {
    const fetchResults = async () => {
      if (!currentRecoId) {
        setRows([]);
        setError('No reconciliation run is active.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const data = await api.getRecoResults(currentRecoId);
        const normalized = (data.results || []).map((row, index) => normalizeRow(row, index));
        setRows(normalized);
        setSelectedRowKey(normalized[0]?.rowKey || null);
      } catch (err) {
        console.error('Failed to fetch matches', err);
        setError(err.message || 'Failed to fetch reconciliation results');
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [currentRecoId]);

  const stats = computeStats(rows);
  const visibleRows = filterRowsByTab(rows, activeTab);
  const selectedRow = visibleRows.find((row) => row.rowKey === selectedRowKey)
    || rows.find((row) => row.rowKey === selectedRowKey)
    || visibleRows[0]
    || null;
  const SelectedStatusIcon = selectedRow?.statusMeta?.icon || FileSpreadsheet;

  React.useEffect(() => {
    if (!selectedRow && visibleRows[0]) {
      setSelectedRowKey(visibleRows[0].rowKey);
    }
  }, [selectedRow, visibleRows]);

  const scrollContainerRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [selectedRowKey, isDetailsOpen]);

  const openDetails = (row) => {
    setSelectedRowKey(row.rowKey);
    setIsDetailsOpen(true);
  };

  const handleFinish = () => {
    setActiveStep(1);
    navigate('/');
  };

  const handleExport = async () => {
    if (!currentRecoId || rows.length === 0) return;
    try {
      setIsExporting(true);
      const fileName = await api.downloadRecoResultsExport(currentRecoId, `Reco_Results_${currentRecoId}.xlsx`);
      setExportMessage(`Workbook downloaded: ${fileName}`);
    } catch (exportError) {
      setExportMessage(exportError.message || 'Failed to export reconciliation workbook.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 py-6">
      <header className="app-panel-hero p-8 md:p-10">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-forest">
              <ShieldCheck className="h-4 w-4" />
              <span className="app-eyebrow text-brand-forest">Reconciliation Results · Phase 3</span>
            </div>
            <h1 className="app-page-title">Match Results</h1>
            <p className="app-page-subtitle max-w-3xl">
              Full-canvas invoice review with legacy reconciliation buckets and a focused central detail view for audit inspection.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting || isLoading || rows.length === 0}
            className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 hover:text-stone-900"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting Workbook...' : 'Export Workbook'}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <KpiCard
          title="Matched ITC"
          value={formatCompactCurrency(stats.matchedItc)}
          subtitle="Strict and relaxed matches consolidated from books against canonical 2B."
          accent={KPI_ACCENTS[0]}
          hideDot={true}
        />
        <KpiCard
          title="ITC at Risk"
          value={formatCompactCurrency(stats.atRiskItc)}
          subtitle="Value mismatches, missing in 2B, possible matches, and ambiguous items."
          accent={KPI_ACCENTS[1]}
        />
        <KpiCard
          title="Missing in 2B"
          value={String(stats.missingIn2B)}
          subtitle="Books invoices with no canonical portal counterpart for the selected period."
          accent={KPI_ACCENTS[2]}
        />
        <KpiCard
          title="Unclaimed ITC"
          value={formatCompactCurrency(stats.unclaimedItc)}
          subtitle="Portal-only invoices surfaced as not present in books."
          accent={KPI_ACCENTS[3]}
        />
      </section>

      <section className="space-y-6">
        <div className="rounded-[26px] border border-stone-100 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 2xl:grid-cols-7">
            {TAB_CONFIG.map((tab) => {
              const count = filterRowsByTab(rows, tab.id).length;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-[18px] border px-3 py-2.5 text-left transition-all ${
                    active
                      ? 'border-stone-200 bg-stone-50 text-stone-950 shadow-sm'
                      : 'border-transparent bg-transparent text-stone-500 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                  <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                    {tab.label}
                  </div>
                  <div className="mt-1.5 text-lg font-black leading-none">{count}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-stone-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-stone-100 bg-stone-50/70 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-2xl font-black tracking-tight text-stone-950">
                {TAB_CONFIG.find((tab) => tab.id === activeTab)?.label} Ledger
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-stone-500">
              <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
                {visibleRows.length} visible rows
              </div>
              <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
                Click any invoice for detail view
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-stone-50/80 border-b border-stone-100">
                <tr className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                  <th className="px-6 py-4">#</th>
                  <th className="px-6 py-4">GSTIN</th>
                  <th className="px-6 py-4">Vendor</th>
                  <th className="px-6 py-4">Books Invoice</th>
                  <th className="px-6 py-4">Books Date</th>
                  <th className="px-6 py-4">Books Taxable</th>
                  <th className="px-6 py-4">Books GST</th>
                  <th className="px-6 py-4">2B Invoice</th>
                  <th className="px-6 py-4">2B Date</th>
                  <th className="px-6 py-4">2B Taxable</th>
                  <th className="px-6 py-4">2B GST</th>
                  <th className="px-6 py-4">Delta</th>
                  <th className="px-6 py-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {isLoading && (
                  <tr>
                    <td colSpan={13} className="px-6 py-16 text-center text-sm font-semibold text-stone-500">
                      Loading reconciliation rows...
                    </td>
                  </tr>
                )}
                {!isLoading && error && (
                  <tr>
                    <td colSpan={13} className="px-6 py-16 text-center text-sm font-semibold text-red-600">
                      {error}
                    </td>
                  </tr>
                )}
                {!isLoading && !error && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-6 py-16 text-center text-sm font-semibold text-stone-500">
                      No rows are available in this reconciliation bucket.
                    </td>
                  </tr>
                )}
                {!isLoading && !error && visibleRows.map((row) => {
                  const StatusIcon = row.statusMeta.icon;
                  return (
                    <tr
                      key={row.rowKey}
                      onClick={() => openDetails(row)}
                      className={`cursor-pointer transition-all even:bg-stone-50/50 hover:bg-stone-100/50 ${
                        selectedRowKey === row.rowKey ? 'bg-brand-emerald/5' : ''
                      }`}
                    >
                      <td className="px-6 py-4 align-top text-xs font-mono font-bold text-stone-400">
                        {String(row.displayIndex).padStart(3, '0')}
                      </td>
                      <td className="px-6 py-4 align-top text-sm font-bold text-stone-900">
                        {row.books_supplier_gstin || row.canonical_supplier_gstin || '—'}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="min-w-[220px] text-sm font-semibold text-stone-900">
                          {row.books_supplier_name || row.canonical_supplier_name || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top text-sm font-mono font-semibold text-stone-700">{row.booksLabel}</td>
                      <td className="px-6 py-4 align-top text-sm text-stone-600">{formatDate(row.books_invoice_date)}</td>
                      <td className="px-6 py-4 align-top text-sm font-mono text-stone-700">{formatCurrency(row.books_taxable_value)}</td>
                      <td className="px-6 py-4 align-top text-sm font-mono text-stone-700">{formatCurrency(row.books_total_gst)}</td>
                      <td className="px-6 py-4 align-top text-sm font-mono font-semibold text-stone-700">{row.portalLabel}</td>
                      <td className="px-6 py-4 align-top text-sm text-stone-600">{formatDate(row.canonical_invoice_date)}</td>
                      <td className="px-6 py-4 align-top text-sm font-mono text-stone-700">{formatCurrency(row.canonical_taxable_value)}</td>
                      <td className="px-6 py-4 align-top text-sm font-mono text-stone-700">{formatCurrency(row.canonical_total_gst)}</td>
                      <td className={`px-6 py-4 align-top text-sm font-mono font-bold ${row.delta > 0 ? 'text-amber-700' : row.delta < 0 ? 'text-red-600' : 'text-stone-500'}`}>
                        {formatCurrency(row.delta)}
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${TONE_STYLES[row.statusMeta.tone] || TONE_STYLES.stone}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {row.statusMeta.label}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer className="flex flex-col gap-4 border-t border-stone-100 pt-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <p className="max-w-xl text-xs font-medium leading-relaxed text-stone-500">
              The ledger stays full width for review density, while line-level details open as a centered modal for audit inspection.
            </p>
            {exportMessage && (
              <p className="text-xs font-bold text-stone-600">
                {exportMessage}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleFinish}
          className="app-button-primary bg-brand-emerald hover:bg-brand-forest"
        >
          Return to Dashboard
        </button>
      </footer>

      <div
        className={`fixed inset-0 z-50 transition ${isDetailsOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!isDetailsOpen}
      >
        <div
          onClick={() => setIsDetailsOpen(false)}
          className={`absolute inset-0 bg-stone-900/10 backdrop-blur-sm transition-opacity ${isDetailsOpen ? 'opacity-100' : 'opacity-0'}`}
        />

        <div className="absolute inset-y-0 right-0 flex w-full max-w-4xl">
          <aside
            className={`flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-out ${isDetailsOpen ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <div className="flex h-full flex-col">
              <div className="border-b border-stone-100 bg-stone-50/70 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Invoice Detail</div>
                    <div className="text-2xl font-black tracking-tight text-stone-950">
                      {selectedRow ? (selectedRow.booksLabel !== '—' ? selectedRow.booksLabel : selectedRow.portalLabel) : 'Select a row'}
                    </div>
                    <p className="text-sm font-medium text-stone-500">
                      Books values, portal values, deltas, and match reasoning in one centered review panel.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsDetailsOpen(false)}
                    className="rounded-full border border-stone-200 bg-white p-2 text-stone-500 transition hover:text-stone-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {!selectedRow ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm font-semibold text-stone-500">
                  Select a spreadsheet row to inspect books values, portal values, deltas, and reasons.
                </div>
              ) : (
                <div ref={scrollContainerRef} className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${TONE_STYLES[selectedRow.statusMeta.tone] || TONE_STYLES.stone}`}>
                    <SelectedStatusIcon className="h-3.5 w-3.5" />
                    {selectedRow.statusMeta.label}
                  </div>

                  <DetailSection title="Identity" boxClass="bg-stone-50/50 border-stone-100 shadow-sm">
                    <DetailField label="GSTIN" value={selectedRow.books_supplier_gstin || selectedRow.canonical_supplier_gstin} mono />
                    <DetailField label="Vendor" value={selectedRow.books_supplier_name || selectedRow.canonical_supplier_name} />
                    <DetailField label="Books Ref" value={selectedRow.books_invoice_id} mono />
                    <DetailField label="2B Ref" value={selectedRow.matched_2b_invoice_id} mono />
                  </DetailSection>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <DetailSection title="Books Values" boxClass="bg-stone-50 border-stone-200">
                      <DetailField label="Invoice" value={selectedRow.books_invoice_number} />
                      <DetailField label="Date" value={formatDate(selectedRow.books_invoice_date)} />
                      <DetailField label="Taxable" value={formatCurrency(selectedRow.books_taxable_value)} />
                      <DetailField label="Total GST" value={formatCurrency(selectedRow.books_total_gst)} />
                      <DetailField label="Invoice Value" value={formatCurrency(selectedRow.books_invoice_value)} />
                    </DetailSection>

                    <DetailSection title="GSTR-2B Values" boxClass="bg-emerald-50/50 border-emerald-100">
                      <DetailField label="Invoice" value={selectedRow.canonical_invoice_number} />
                      <DetailField label="Date" value={formatDate(selectedRow.canonical_invoice_date)} />
                      <DetailField label="Taxable" value={formatCurrency(selectedRow.canonical_taxable_value)} />
                      <DetailField label="Total GST" value={formatCurrency(selectedRow.canonical_total_gst)} />
                      <DetailField label="Invoice Value" value={formatCurrency(selectedRow.canonical_invoice_value)} />
                    </DetailSection>
                  </div>

                  <DetailSection title="Variance" boxClass="bg-indigo-50/30 border-indigo-100">
                    <DetailField label="GST Delta" value={formatCurrency(selectedRow.delta)} />
                    <DetailField label="Match Method" value={selectedRow.match_method} />
                    <DetailField label="Candidates" value={selectedRow.candidate_count?.toString()} />
                  </DetailSection>

                  {selectedRow.mismatch_reasons?.length > 0 && (
                    <DetailSection title="Mismatch Reasons">
                      {selectedRow.mismatch_reasons.map((reason) => (
                        <div key={reason} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 shadow-sm">
                          {reason}
                        </div>
                      ))}
                    </DetailSection>
                  )}

                  {selectedRow.value_deltas?.length > 0 && (
                    <DetailSection title="Value Deltas">
                      {selectedRow.value_deltas.map((delta) => (
                        <div key={`${selectedRow.rowKey}-${delta.field}`} className="rounded-3xl border border-stone-200 bg-white px-4 py-4 shadow-sm">
                          <div className="text-[10px] font-black uppercase tracking-widest text-stone-500">{delta.field}</div>
                          <div className="mt-2 text-sm font-semibold text-stone-800">
                            Books {formatCurrency(delta.books_value)} vs 2B {formatCurrency(delta.reco_value)}
                          </div>
                          <div className={`mt-1 text-sm font-black ${delta.delta === 0 ? 'text-brand-forest' : 'text-amber-600'}`}>
                            Delta {formatCurrency(delta.delta)}
                          </div>
                        </div>
                      ))}
                    </DetailSection>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
