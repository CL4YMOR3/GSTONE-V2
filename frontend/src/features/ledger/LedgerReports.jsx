import React from 'react';
import {
  AlertCircle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Database,
  Download,
  Filter,
  MapPinned,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';

const TAB_DEFS = [
  { id: 'books_pending', label: 'Books Pending', icon: AlertCircle, colorClasses: 'border-amber-200 bg-amber-50 text-amber-900', activeIcon: 'text-amber-600' },
  { id: 'books_clean', label: 'Books Clean', icon: CheckCircle2, colorClasses: 'border-emerald-200 bg-emerald-50 text-brand-forest', activeIcon: 'text-brand-forest' },
  { id: 'matched', label: 'Matched', icon: ShieldCheck, colorClasses: 'border-emerald-200 bg-emerald-50 text-brand-forest', activeIcon: 'text-brand-forest' },
  { id: 'missing_in_books', label: 'Missing In Books', icon: Database, colorClasses: 'border-sky-200 bg-sky-50 text-sky-900', activeIcon: 'text-sky-600' },
  { id: 'reco_pending', label: 'Missing In 2B', icon: AlertCircle, colorClasses: 'border-rose-200 bg-rose-50 text-rose-900', activeIcon: 'text-rose-600' },
];

const SORT_OPTIONS = [
  { id: 'default', label: 'Default' },
  { id: 'vendor_asc', label: 'Vendor A-Z' },
  { id: 'gst_desc', label: 'GST High-Low' },
  { id: 'invoice_asc', label: 'Invoice A-Z' },
];

const monthLabel = (period) => {
  if (!period) return '—';
  const [year, month] = String(period).split('-');
  if (!year || !month) return period;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return period;
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const getFinancialYearLabel = (period) => {
  if (!period) return 'Unknown FY';
  const [yearStr, monthStr] = String(period).split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return 'Unknown FY';
  if (month >= 4) {
    return `FY ${year}-${String(year + 1).slice(-2)}`;
  }
  return `FY ${year - 1}-${String(year).slice(-2)}`;
};

const STATUS_BADGES = {
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  error: 'border-red-200 bg-red-50 text-red-700',
  matched: 'border-emerald-200 bg-emerald-50 text-brand-forest',
  pending: 'border-sky-200 bg-sky-50 text-sky-700',
  canonical: 'border-stone-200 bg-stone-100 text-stone-700',
};

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatCompactCurrency = (value) => {
  if (!value) return '₹0';
  const num = Number(value);
  const abs = Math.abs(num);
  if (abs >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `₹${(num / 1000).toFixed(1)}k`;
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const normalizeDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB');
};

const csvEscape = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const downloadCsv = (rows, fileName) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

const KpiCard = ({ title, value, subtitle, icon: Icon, accent }) => (
  <div className="app-kpi-card p-6">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">{title}</span>
      <Icon className={`h-4 w-4 ${accent}`} />
    </div>
    <div className={`mt-3 text-4xl font-black tracking-tight ${accent}`}>{value}</div>
    <p className="mt-2 text-xs font-medium text-stone-500">{subtitle}</p>
  </div>
);

const SectionCard = ({ title, subtitle, children, action }) => (
  <section className="app-panel p-6">
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-lg font-black tracking-tight text-stone-900">{title}</h3>
        <p className="mt-1 text-sm font-medium text-stone-500">{subtitle}</p>
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const LedgerReports = () => {
  const { activeEntityId, selectedPeriod, currentRecoId } = useAppStore();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState('books_pending');
  const [selectedRowKey, setSelectedRowKey] = React.useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState('default');
  const [cycleOptions, setCycleOptions] = React.useState([]);
  const [selectedCyclePeriod, setSelectedCyclePeriod] = React.useState(selectedPeriod || '');
  const [selectedFinancialYear, setSelectedFinancialYear] = React.useState(getFinancialYearLabel(selectedPeriod));
  const [selectedGarden, setSelectedGarden] = React.useState('ALL');
  const [snapshot, setSnapshot] = React.useState({
    cycle: null,
    latestRun: null,
    cleanRows: [],
    warningRows: [],
    errorRows: [],
    recoResults: [],
    recoExceptions: [],
    supplierFollowups: [],
  });

  React.useEffect(() => {
    if (selectedPeriod) {
      setSelectedCyclePeriod(selectedPeriod);
      setSelectedFinancialYear(getFinancialYearLabel(selectedPeriod));
    }
  }, [selectedPeriod]);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!activeEntityId || !selectedCyclePeriod) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);

        const cycles = await api.getMonthCycles(activeEntityId).catch(() => []);
        const normalizedCycles = cycles || [];
        if (!cancelled) {
          setCycleOptions(normalizedCycles);
          const cyclePeriods = new Set(normalizedCycles.map((item) => item.period));
          if (!cyclePeriods.has(selectedCyclePeriod) && normalizedCycles[0]?.period) {
            setSelectedCyclePeriod(normalizedCycles[0].period);
            setSelectedFinancialYear(getFinancialYearLabel(normalizedCycles[0].period));
            setLoading(false);
            return;
          }
        }

        const cycle = await api.getMonthCycle(activeEntityId, selectedCyclePeriod).catch(() => null);
        const latestRun = await api.getLatestSandboxRun(activeEntityId, selectedCyclePeriod).catch(() => null);
        const supplierFollowups = await api.getSupplierFollowups(activeEntityId, selectedCyclePeriod).catch(() => []);

        let cleanRows = [];
        let warningRows = [];
        let errorRows = [];
        if (latestRun?.run_id) {
          const [cleanData, warningData, errorData] = await Promise.all([
            api.getRunClean(latestRun.run_id, 1, 1000).catch(() => ({ invoices: [] })),
            api.getRunWarnings(latestRun.run_id, 1, 1000).catch(() => ({ invoices: [] })),
            api.getRunErrors(latestRun.run_id, 1, 500).catch(() => ({ identity_errors: [], aggregation_errors: [] })),
          ]);
          cleanRows = cleanData.invoices || [];
          warningRows = warningData.invoices || [];
          errorRows = [...(errorData.identity_errors || []), ...(errorData.aggregation_errors || [])];
        }

        const recoId = cycle?.current_reco_run_id || currentRecoId;
        let recoResults = [];
        let recoExceptions = [];
        if (recoId) {
          const [resultsData, exceptionsData] = await Promise.all([
            api.getRecoResults(recoId, { page: 1, limit: 1000 }).catch(() => ({ results: [] })),
            api.getRecoExceptions(recoId).catch(() => []),
          ]);
          recoResults = resultsData.results || [];
          recoExceptions = exceptionsData || [];
        }

        if (!cancelled) {
          setSnapshot({
            cycle,
            latestRun,
            cleanRows,
            warningRows,
            errorRows,
            recoResults,
            recoExceptions,
            supplierFollowups,
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Failed to load ledger datasets');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeEntityId, selectedCyclePeriod, currentRecoId]);

  const datasetMap = React.useMemo(() => {
    const matchedRows = snapshot.recoResults.filter((row) => ['MATCHED_STRICT', 'MATCHED_RELAXED'].includes(row.match_status));
    const missingInBooksRows = snapshot.recoResults.filter((row) => row.match_status === 'MISSING_IN_BOOKS');
    const missingIn2BRows = snapshot.recoResults.filter((row) => row.match_status === 'MISSING_IN_2B');
    const pendingBooksRows = [
      ...snapshot.warningRows.map((row) => ({ type: 'warning', ...row })),
      ...snapshot.errorRows.map((row) => ({ type: 'error', ...row })),
    ];

    return {
      books_pending: pendingBooksRows,
      books_clean: snapshot.cleanRows,
      matched: matchedRows,
      missing_in_books: missingInBooksRows,
      reco_pending: missingIn2BRows,
    };
  }, [snapshot]);

  const financialYearOptions = React.useMemo(() => {
    const years = Array.from(new Set(cycleOptions.map((item) => getFinancialYearLabel(item.period))));
    return years.sort((left, right) => right.localeCompare(left));
  }, [cycleOptions]);

  const monthOptions = React.useMemo(() => {
    const filtered = cycleOptions.filter((item) => getFinancialYearLabel(item.period) === selectedFinancialYear);
    return filtered.sort((left, right) => right.period.localeCompare(left.period));
  }, [cycleOptions, selectedFinancialYear]);

  const currentRows = React.useMemo(() => datasetMap[activeTab] || [], [datasetMap, activeTab]);

  const gardenOptions = React.useMemo(() => {
    const gardens = new Set();
    Object.values(datasetMap).forEach((rows) => {
      rows.forEach((row) => {
        const garden = row.garden_name || row.garden || row._garden_name;
        if (garden) gardens.add(garden);
      });
    });
    return ['ALL', ...Array.from(gardens).sort((left, right) => left.localeCompare(right))];
  }, [datasetMap]);

  const filteredRows = React.useMemo(() => {
    const gardenFiltered = selectedGarden === 'ALL'
      ? currentRows
      : currentRows.filter((row) => (row.garden_name || row.garden || row._garden_name) === selectedGarden);
    const lowered = search.trim().toLowerCase();
    const searched = lowered
      ? gardenFiltered.filter((row) =>
          Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(lowered))
        )
      : gardenFiltered;

    const sorted = [...searched];
    if (sortBy === 'vendor_asc') {
      sorted.sort((a, b) => String(a.vendor_name || a.books_supplier_name || a.canonical_supplier_name || '').localeCompare(String(b.vendor_name || b.books_supplier_name || b.canonical_supplier_name || '')));
    } else if (sortBy === 'gst_desc') {
      sorted.sort((a, b) => Number(b.books_total_gst || b.canonical_total_gst || b.total_invoice_value || b.taxable_value || 0) - Number(a.books_total_gst || a.canonical_total_gst || a.total_invoice_value || a.taxable_value || 0));
    } else if (sortBy === 'invoice_asc') {
      sorted.sort((a, b) => String(a.invoice_number || a.books_invoice_number || a.canonical_invoice_number || '').localeCompare(String(b.invoice_number || b.books_invoice_number || b.canonical_invoice_number || '')));
    }
    return sorted;
  }, [currentRows, search, sortBy, selectedGarden]);

  const selectedRow = React.useMemo(() => {
    const keyFor = (row, index) => `${activeTab}-${row.invoice_number || row.books_invoice_number || row.canonical_invoice_number || row.books_invoice_id || row.matched_2b_invoice_id || index}`;
    return filteredRows.find((row, index) => keyFor(row, index) === selectedRowKey)
      || currentRows.find((row, index) => keyFor(row, index) === selectedRowKey)
      || filteredRows[0]
      || null;
  }, [activeTab, currentRows, filteredRows, selectedRowKey]);

  const kpis = React.useMemo(() => {
    const matchedGst = snapshot.recoResults
      .filter((row) => ['MATCHED_STRICT', 'MATCHED_RELAXED'].includes(row.match_status))
      .reduce((sum, row) => sum + Number(row.canonical_total_gst || row.books_total_gst || 0), 0);
      
    const atRiskGst = snapshot.recoResults
      .filter((row) => ['PROBABLE_MATCH', 'VALUE_MISMATCH', 'MISSING_IN_2B', 'AMBIGUOUS_MATCH'].includes(row.match_status))
      .reduce((sum, row) => sum + Number(row.books_total_gst || row.canonical_total_gst || 0), 0);
      
    const missingIn2BCount = snapshot.recoResults.filter((row) => row.match_status === 'MISSING_IN_2B').length;

    const unclaimedGst = snapshot.recoResults
      .filter((row) => row.match_status === 'MISSING_IN_BOOKS')
      .reduce((sum, row) => sum + Number(row.canonical_total_gst || 0), 0);

    return [
      {
        title: 'Matched ITC',
        value: formatCompactCurrency(matchedGst),
        subtitle: 'Strict and relaxed matches consolidated from books against canonical 2B.',
        icon: ShieldCheck,
        accent: 'text-brand-forest',
      },
      {
        title: 'ITC at Risk',
        value: formatCompactCurrency(atRiskGst),
        subtitle: 'Value mismatches, missing in 2B, possible matches, and ambiguous items.',
        icon: AlertCircle,
        accent: 'text-amber-700',
      },
      {
        title: 'Missing in 2B',
        value: String(missingIn2BCount),
        subtitle: 'Books invoices with no canonical portal counterpart for the selected period.',
        icon: Search,
        accent: 'text-sky-700',
      },
      {
        title: 'Unclaimed ITC',
        value: formatCompactCurrency(unclaimedGst),
        subtitle: 'Portal-only invoices surfaced as not present in books.',
        icon: TrendingUp,
        accent: 'text-red-600',
      },
    ];
  }, [snapshot]);

  React.useEffect(() => {
    if (!financialYearOptions.length) return;
    if (!financialYearOptions.includes(selectedFinancialYear)) {
      setSelectedFinancialYear(financialYearOptions[0]);
    }
  }, [financialYearOptions, selectedFinancialYear]);

  React.useEffect(() => {
    if (!monthOptions.length) return;
    const exists = monthOptions.some((item) => item.period === selectedCyclePeriod);
    if (!exists) {
      setSelectedCyclePeriod(monthOptions[0].period);
    }
  }, [monthOptions, selectedCyclePeriod]);

  React.useEffect(() => {
    if (!gardenOptions.includes(selectedGarden)) {
      setSelectedGarden('ALL');
    }
  }, [gardenOptions, selectedGarden]);

  React.useEffect(() => {
    if (!selectedRow && filteredRows[0]) {
      const row = filteredRows[0];
      setSelectedRowKey(`${activeTab}-${row.invoice_number || row.books_invoice_number || row.canonical_invoice_number || row.books_invoice_id || row.matched_2b_invoice_id || 0}`);
    }
  }, [activeTab, filteredRows, selectedRow]);

  const scrollContainerRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [selectedRowKey, isDetailsOpen]);

  const handleExportCurrent = () => {
    const exportRows = filteredRows.map((row) => {
      const base = {
        invoice_number: row.invoice_number || row.books_invoice_number || row.canonical_invoice_number || '',
        invoice_date: row.invoice_date || row.books_invoice_date || row.canonical_invoice_date || '',
        vendor_name: row.vendor_name || row.books_supplier_name || row.canonical_supplier_name || '',
        gstin: row.gstin || row.books_supplier_gstin || row.canonical_supplier_gstin || '',
        taxable_value: row.taxable_value || row.books_taxable_value || row.canonical_taxable_value || '',
        total_gst: row.books_total_gst || row.canonical_total_gst || '',
        total_invoice_value: row.total_invoice_value || row.books_invoice_value || row.canonical_invoice_value || '',
      };

      if (activeTab === 'books_pending') {
        return {
          ...base,
          type: row.type || row.category || '',
          error_type: row.error_type || row.warning_type || '',
          message: row.error_message || row.warning_message || '',
        };
      }
      if (activeTab === 'matched' || activeTab === 'reco_pending') {
        return {
          ...base,
          match_status: row.match_status || '',
          match_method: row.match_method || '',
          canonical_invoice_number: row.canonical_invoice_number || '',
          canonical_total_gst: row.canonical_total_gst || '',
        };
      }
      return base;
    });
    downloadCsv(exportRows, `${activeEntityId || 'entity'}_${selectedCyclePeriod || 'period'}_${activeTab}.csv`);
  };

  const openDetails = (row, index) => {
    setSelectedRowKey(`${activeTab}-${row.invoice_number || row.books_invoice_number || row.canonical_invoice_number || row.books_invoice_id || row.matched_2b_invoice_id || index}`);
    setIsDetailsOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-stone-400">
        <div className="mb-4"><Spinner size="lg" /></div>
        <p className="text-xs font-black uppercase tracking-widest text-stone-500">Loading Ledger Intelligence...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-panel p-8 text-red-700">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <div>
            <div className="text-sm font-black uppercase tracking-widest">Ledger Unavailable</div>
            <p className="mt-1 text-sm font-medium">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-6">
      <header className="app-panel-hero p-8 md:p-10">
        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-forest">
              <BarChart3 className="h-4 w-4" />
              <span className="app-eyebrow text-brand-forest">Ledger & Reports</span>
            </div>
            <h1 className="app-page-title">Unified Reconciliation Ledger</h1>
            <p className="app-page-subtitle max-w-3xl">
              View your books and 2B records in one place, filter by year, month, and garden, and quickly see what matched and what is still missing.
            </p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </section>

      <section className="app-panel p-5">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <label className="flex items-center gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-3 shadow-sm">
              <CalendarRange className="h-4 w-4 text-brand-forest" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Financial Year</div>
                <select
                  value={selectedFinancialYear}
                  onChange={(event) => setSelectedFinancialYear(event.target.value)}
                  className="mt-1 w-full bg-transparent text-sm font-semibold text-stone-800 outline-none"
                >
                  {financialYearOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="flex items-center gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-3 shadow-sm">
              <BarChart3 className="h-4 w-4 text-brand-forest" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Month</div>
                <select
                  value={selectedCyclePeriod}
                  onChange={(event) => setSelectedCyclePeriod(event.target.value)}
                  className="mt-1 w-full bg-transparent text-sm font-semibold text-stone-800 outline-none"
                >
                  {monthOptions.map((item) => (
                    <option key={item.period} value={item.period}>{monthLabel(item.period)}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="flex items-center gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-3 shadow-sm">
              <MapPinned className="h-4 w-4 text-brand-forest" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Garden</div>
                <select
                  value={selectedGarden}
                  onChange={(event) => setSelectedGarden(event.target.value)}
                  className="mt-1 w-full bg-transparent text-sm font-semibold text-stone-800 outline-none"
                >
                  {gardenOptions.map((item) => (
                    <option key={item} value={item}>{item === 'ALL' ? 'All Gardens' : item}</option>
                  ))}
                </select>
              </div>
            </label>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm">
              <Search className="h-4 w-4 text-stone-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoice, GSTIN, vendor..."
                className="w-full bg-transparent text-sm font-medium text-stone-700 outline-none placeholder:text-stone-400 sm:w-72"
              />
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm">
              <Filter className="h-4 w-4 text-stone-400" />
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="bg-transparent text-sm font-medium text-stone-700 outline-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            </div>
            <div className="text-[11px] font-semibold text-stone-500">
              {filteredRows.length} visible row{filteredRows.length === 1 ? '' : 's'} in the current ledger view
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[26px] border border-stone-100 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {TAB_DEFS.map((tab) => {
              const count = datasetMap[tab.id]?.length || 0;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-[18px] border px-3 py-2.5 text-left transition-all ${
                    active
                      ? `${tab.colorClasses} shadow-sm`
                      : 'border-transparent bg-transparent text-stone-500 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <tab.icon className={`h-4 w-4 ${active ? tab.activeIcon : 'text-stone-400'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{tab.label}</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-bold tracking-tight">{count}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-stone-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-stone-100 bg-stone-50/70 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-2xl font-black tracking-tight text-stone-950">
                {TAB_DEFS.find((tab) => tab.id === activeTab)?.label} Ledger
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-stone-500">
              <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
                {filteredRows.length} visible row{filteredRows.length === 1 ? '' : 's'}
              </div>
              <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
                Click any invoice for detail view
              </div>
              <button
                onClick={handleExportCurrent}
                disabled={!filteredRows.length}
                className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-stone-100 bg-stone-50/80">
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
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-6 py-16 text-center text-sm font-semibold text-stone-500">
                      No rows available for this view.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => {
                    const badgeType =
                      activeTab === 'books_pending'
                        ? row.type || 'error'
                        : activeTab === 'matched'
                          ? 'matched'
                          : activeTab === 'missing_in_books'
                            ? 'pending'
                          : activeTab === 'reco_pending'
                            ? 'pending'
                            : 'canonical';
                    const invoiceLabel = row.invoice_number || row.books_invoice_number || row.canonical_invoice_number || row.books_invoice_id || row.matched_2b_invoice_id || '—';
                    const vendorLabel = row.vendor_name || row.books_supplier_name || row.canonical_supplier_name || row.error_type || row.warning_type || '—';
                    const gstinLabel = row.gstin || row.books_supplier_gstin || row.canonical_supplier_gstin || '—';
                    const booksTaxable = row.books_taxable_value || row.taxable_value || 0;
                    const booksGst = row.books_total_gst || 0;
                    const portalTaxable = row.canonical_taxable_value || 0;
                    const portalGst = row.canonical_total_gst || 0;
                    const delta = Number(booksGst) - Number(portalGst);
                    
                    return (
                      <tr
                        key={`${activeTab}-${invoiceLabel}-${index}`}
                        onClick={() => openDetails(row, index)}
                        className={`cursor-pointer transition-all even:bg-stone-50/50 hover:bg-stone-100/50 ${selectedRowKey === `${activeTab}-${invoiceLabel}-${index}` ? 'bg-brand-emerald/5' : ''}`}
                      >
                        <td className="px-6 py-4 align-top text-xs font-black text-stone-400">
                          {String(index + 1).padStart(3, '0')}
                        </td>
                        <td className="px-6 py-4 align-top text-sm font-bold text-stone-900">
                          {gstinLabel}
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="min-w-[220px] text-sm font-semibold text-stone-900">
                            {vendorLabel}
                          </div>
                        </td>
                        <td className="px-6 py-4 align-top text-sm font-mono font-semibold text-stone-700">{row.books_invoice_number || row.invoice_number || '—'}</td>
                        <td className="px-6 py-4 align-top text-sm text-stone-600">{normalizeDate(row.books_invoice_date || row.invoice_date)}</td>
                        <td className="px-6 py-4 align-top text-sm font-mono text-stone-700">{formatCurrency(booksTaxable)}</td>
                        <td className="px-6 py-4 align-top text-sm font-mono text-stone-700">{formatCurrency(booksGst)}</td>
                        <td className="px-6 py-4 align-top text-sm font-mono font-semibold text-stone-700">{row.canonical_invoice_number || row.matched_2b_invoice_id || '—'}</td>
                        <td className="px-6 py-4 align-top text-sm text-stone-600">{normalizeDate(row.canonical_invoice_date)}</td>
                        <td className="px-6 py-4 align-top text-sm font-mono text-stone-700">{formatCurrency(portalTaxable)}</td>
                        <td className="px-6 py-4 align-top text-sm font-mono text-stone-700">{formatCurrency(portalGst)}</td>
                        <td className={`px-6 py-4 align-top text-sm font-mono font-bold ${delta > 0 ? 'text-amber-700' : delta < 0 ? 'text-red-600' : 'text-stone-500'}`}>
                          {formatCurrency(delta)}
                        </td>
                        <td className="px-6 py-4 align-top text-right">
                          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${STATUS_BADGES[badgeType] || STATUS_BADGES.canonical}`}>
                            {badgeType === 'warning' ? 'Warning' : badgeType === 'error' ? 'Error' : badgeType === 'matched' ? 'Matched' : badgeType === 'pending' ? 'Pending' : '2B'}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

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
                    <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Ledger Detail</div>
                    <div className="text-2xl font-black tracking-tight text-stone-950">
                      {selectedRow ? (selectedRow.invoice_number || selectedRow.books_invoice_number || selectedRow.canonical_invoice_number || selectedRow.books_invoice_id || selectedRow.matched_2b_invoice_id || 'Selected Record') : 'Select a row'}
                    </div>
                    <p className="text-sm font-medium text-stone-500">
                      See the books values, 2B values, status, and reference details for the selected row.
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
                  Select a row to see the books values, 2B values, and status details.
                </div>
              ) : (
                <div ref={scrollContainerRef} className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                  <div className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${STATUS_BADGES[
                    activeTab === 'books_pending'
                      ? selectedRow.type || 'error'
                      : activeTab === 'matched'
                        ? 'matched'
                        : 'pending'
                  ] || STATUS_BADGES.canonical}`}>
                    {selectedRow.match_status || selectedRow.error_type || selectedRow.warning_type || activeTab.replaceAll('_', ' ')}
                  </div>

                  <section className="rounded-3xl border border-stone-100 bg-stone-50/50 p-5 shadow-sm">
                    <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-stone-500">Identity</div>
                    <div className="space-y-2">
                      {[
                        ['GSTIN', selectedRow.gstin || selectedRow.books_supplier_gstin || selectedRow.canonical_supplier_gstin || '—'],
                        ['Vendor', selectedRow.vendor_name || selectedRow.books_supplier_name || selectedRow.canonical_supplier_name || '—'],
                        ['Garden', selectedRow.garden_name || selectedRow.garden || selectedRow._garden_name || '—'],
                        ['Books Ref', selectedRow.books_invoice_id || selectedRow.invoice_key || '—'],
                        ['2B Ref', selectedRow.matched_2b_invoice_id || '—'],
                      ].map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[112px_1fr] gap-3 rounded-2xl border border-black/5 bg-white/50 px-4 py-3">
                          <div className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</div>
                          <div className="break-all text-sm font-semibold text-stone-900">{value}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <section className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
                      <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-stone-500">Books Values</div>
                      <div className="space-y-2">
                        {[
                          ['Invoice', selectedRow.invoice_number || selectedRow.books_invoice_number || '—'],
                          ['Date', normalizeDate(selectedRow.invoice_date || selectedRow.books_invoice_date)],
                          ['Taxable', formatCurrency(selectedRow.taxable_value || selectedRow.books_taxable_value)],
                          ['Total GST', formatCurrency(selectedRow.books_total_gst)],
                          ['Invoice Value', formatCurrency(selectedRow.total_invoice_value || selectedRow.books_invoice_value)],
                        ].map(([label, value]) => (
                          <div key={label} className="grid grid-cols-[112px_1fr] gap-3 rounded-2xl border border-black/5 bg-white/50 px-4 py-3">
                            <div className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</div>
                            <div className="text-sm font-semibold text-stone-900">{value}</div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-5">
                      <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-stone-500">2B Values</div>
                      <div className="space-y-2">
                        {[
                          ['Invoice', selectedRow.canonical_invoice_number || selectedRow.matched_2b_invoice_id || '—'],
                          ['Date', normalizeDate(selectedRow.canonical_invoice_date)],
                          ['Taxable', formatCurrency(selectedRow.canonical_taxable_value)],
                          ['Total GST', formatCurrency(selectedRow.canonical_total_gst)],
                          ['Invoice Value', formatCurrency(selectedRow.canonical_invoice_value)],
                        ].map(([label, value]) => (
                          <div key={label} className="grid grid-cols-[112px_1fr] gap-3 rounded-2xl border border-black/5 bg-white/60 px-4 py-3">
                            <div className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</div>
                            <div className="text-sm font-semibold text-stone-900">{value}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <section className="rounded-3xl border border-indigo-100 bg-indigo-50/30 p-5">
                    <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-stone-500">Difference & Status</div>
                    <div className="space-y-2">
                      {[
                        ['Status', selectedRow.match_status || selectedRow.error_type || selectedRow.warning_type || '—'],
                        ['Match Method', selectedRow.match_method || '—'],
                        ['Candidates', selectedRow.candidate_count?.toString() || '—'],
                        ['GST Delta', formatCurrency((selectedRow.books_total_gst ?? 0) - (selectedRow.canonical_total_gst ?? 0))],
                        ['Message', selectedRow.error_message || selectedRow.warning_message || selectedRow.document_type || '—'],
                      ].map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[112px_1fr] gap-3 rounded-2xl border border-black/5 bg-white/60 px-4 py-3">
                          <div className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</div>
                          <div className="text-sm font-semibold text-stone-900">{value}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {selectedRow.mismatch_reasons?.length > 0 && (
                    <section className="space-y-3">
                      <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Mismatch Reasons</div>
                      {selectedRow.mismatch_reasons.map((reason) => (
                        <div key={reason} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 shadow-sm">
                          {reason}
                        </div>
                      ))}
                    </section>
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
