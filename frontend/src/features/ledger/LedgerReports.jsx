import React, { useState, useEffect, useMemo } from 'react';
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
  Target,
  TrendingDown,
  LayoutGrid,
  Sparkles,
  FileSpreadsheet,
  Users,
  AlertTriangle,
  Building2,
  ChevronDown,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';

// Top level tabs
const TOP_TABS = [
  { id: 'raw', label: 'Raw Books', icon: Database, colorClasses: 'text-blue-700', bgClasses: 'bg-blue-50 border-blue-200' },
  { id: 'clean', label: 'Clean Books', icon: CheckCircle2, colorClasses: 'text-emerald-700', bgClasses: 'bg-emerald-50 border-emerald-200' },
  { id: 'two_b', label: '2B', icon: FileSpreadsheet, colorClasses: 'text-indigo-700', bgClasses: 'bg-indigo-50 border-indigo-200' },
  { id: 'reco', label: 'Reconciliation', icon: Target, colorClasses: 'text-brand-forest', bgClasses: 'bg-green-50 border-green-200' }
];

const SUB_TABS = {
  raw: [
    { id: 'all', label: 'All Raw Records' }
  ],
  clean: [
    { id: 'clean', label: 'Clean' },
    { id: 'warnings', label: 'Warnings' },
    { id: 'errors', label: 'Errors' }
  ],
  two_b: [
    { id: 'finalized', label: 'Finalized 2B' }
  ],
  reco: [
    { id: 'matched_strict', label: 'Matched', match_status: 'MATCHED_STRICT,MATCHED_RELAXED,MATCHED_CROSS_PERIOD' },
    { id: 'value_mismatch', label: 'Value Difference', match_status: 'VALUE_MISMATCH' },
    { id: 'possible_match', label: 'Possible Match', match_status: 'POSSIBLE_MATCH,PROBABLE_MATCH,AMBIGUOUS_MATCH' },
    { id: 'missing_in_books', label: 'Missing In Books', match_status: 'MISSING_IN_BOOKS' },
    { id: 'missing_in_2b', label: 'Missing In 2B', match_status: 'MISSING_IN_2B' }
  ]
};

const STATUS_META = {
  MATCHED_STRICT: { label: 'Matched Strict', tone: 'emerald', icon: CheckCircle2 },
  MATCHED_RELAXED: { label: 'Matched Relaxed', tone: 'emerald', icon: Target },
  MATCHED_CROSS_PERIOD: { label: 'Cross Period Match', tone: 'emerald', icon: Target },
  VALUE_MISMATCH: { label: 'Value Mismatch', tone: 'amber', icon: TrendingDown },
  POSSIBLE_MATCH: { label: 'Possible Match', tone: 'violet', icon: Sparkles },
  PROBABLE_MATCH: { label: 'Probable Match', tone: 'violet', icon: Sparkles },
  AMBIGUOUS_MATCH: { label: 'Duplicate / Ambiguous', tone: 'stone', icon: FileSpreadsheet },
  MISSING_IN_2B: { label: 'Not in 2B', tone: 'red', icon: AlertCircle },
  MISSING_IN_BOOKS: { label: 'Not in Books', tone: 'sky', icon: LayoutGrid },
};

const TONE_STYLES = {
  emerald: 'border-emerald-200 bg-emerald-50 text-brand-forest',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
  stone: 'border-stone-200 bg-stone-100 text-stone-700',
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB');
};

const normalizeRow = (row, index) => {
  const status = row._match_status || row.match_status || 'UNKNOWN';
  const meta = STATUS_META[status] || { label: status, tone: 'stone', icon: FileSpreadsheet };
  const booksLabel = row.books_invoice_number || row.books_invoice_id || row.invoice_number || '—';
  const portalLabel = row.canonical_invoice_number || row.matched_2b_invoice_id || '—';
  const delta = (row.books_total_gst ?? row.total_gst ?? 0) - (row.canonical_total_gst ?? 0);

  return {
    ...row,
    rowKey: `${status}-${row._id || row._invoice_key || index}`,
    displayIndex: index + 1,
    statusMeta: meta,
    booksLabel,
    portalLabel,
    delta,
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

const KpiCard = ({ title, value, subtitle, accent, hideDot }) => {
  const len = String(value).length;
  const textSize = len > 14 ? 'text-lg xl:text-xl' : len > 10 ? 'text-xl xl:text-2xl' : 'text-2xl md:text-3xl';
  return (
    <div className="app-kpi-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">{title}</div>
        {!hideDot && <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent.replace('text-', 'bg-')}`} />}
      </div>
      <div className={`mt-3 ${textSize} font-black tracking-tight truncate ${accent}`} title={value}>{value}</div>
      <p className="mt-2 max-w-xs text-xs font-medium leading-relaxed text-stone-500">{subtitle}</p>
    </div>
  );
};

const DebouncedSearchInput = ({ onSearch }) => {
  const [localTerm, setLocalTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setIsSearching(true);
    const timer = setTimeout(() => {
      onSearch(localTerm);
      setIsSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [localTerm, onSearch]);

  return (
    <label className="flex flex-1 items-center gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-2 shadow-sm transition-all focus-within:ring-2 focus-within:ring-brand-forest/20 focus-within:border-brand-forest">
      {isSearching ? <Spinner className="h-4 w-4 text-brand-forest" /> : <Search className="h-4 w-4 text-brand-forest" />}
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">Search</div>
        <input
          type="text"
          placeholder="Search ledger by GSTIN, Vendor Name, or Invoice No..."
          value={localTerm}
          onChange={(e) => setLocalTerm(e.target.value)}
          className="w-full bg-transparent text-sm font-semibold text-stone-800 placeholder:text-stone-400 outline-none"
        />
      </div>
    </label>
  );
};

export const LedgerReports = () => {
  const { activeEntityId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [kpis, setKpis] = useState(null);
  
  const [selectedRowKey, setSelectedRowKey] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const scrollContainerRef = React.useRef(null);
  
  const openDetails = (row) => {
    setSelectedRowKey(row.rowKey);
    setIsDetailsOpen(true);
  };
  
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [selectedRowKey, isDetailsOpen]);

  const [activeTopTab, setActiveTopTab] = useState('reco');
  const [activeSubTab, setActiveSubTab] = useState('matched_strict');
  
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  const [filterType, setFilterType] = useState('all');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedQuarter, setSelectedQuarter] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedGarden, setSelectedGarden] = useState('ALL');
  
  const [cycleOptions, setCycleOptions] = useState([]);
  const [gardenOptions, setGardenOptions] = useState([]);

  // Fetch cycles on mount
  useEffect(() => {
    if (!activeEntityId) return;
    api.getLedgerMetadata({ entity_id: activeEntityId }).then(meta => {
      const periods = (meta?.periods || []).map(p => ({ period: p })).reverse();
      setCycleOptions(periods);
      setGardenOptions(meta?.gardens || []);
      
      if (periods && periods.length > 0) {
        const latestPeriod = periods[0].period;
        const [yStr, mStr] = latestPeriod.split('-');
        let fy = parseInt(yStr, 10);
        if (parseInt(mStr, 10) >= 4) fy += 1;
        
        setSelectedPeriod(latestPeriod);
        setSelectedYear(fy.toString());
        setSelectedQuarter('1');
      }
    });
  }, [activeEntityId]);

  // Extract years from cycles (FY ends next year)
  const years = useMemo(() => {
    const ySet = new Set();
    cycleOptions.forEach(c => {
       const [yStr, mStr] = c.period.split('-');
       let y = parseInt(yStr, 10);
       let m = parseInt(mStr, 10);
       if (m >= 4) y += 1;
       ySet.add(y.toString());
    });
    return Array.from(ySet).sort().reverse();
  }, [cycleOptions]);

  const availablePeriods = useMemo(() => new Set(cycleOptions.map(c => c.period)), [cycleOptions]);

  const hasDataForQuarter = (fy, q) => {
    if (!fy) return false;
    const fyEnd = Number(fy);
    const fyStart = fyEnd - 1;
    const qMonths = q === 1 ? ['04','05','06'] :
                    q === 2 ? ['07','08','09'] :
                    q === 3 ? ['10','11','12'] :
                              ['01','02','03'];
    return qMonths.some(m => {
       const y = (q === 4) ? fyEnd : fyStart;
       return availablePeriods.has(`${y}-${m}`);
    });
  };

  const hasDataForMonth = (fy, mStr, isNextYear) => {
    if (!fy) return false;
    const fyEnd = Number(fy);
    const fyStart = fyEnd - 1;
    const y = isNextYear ? fyEnd : fyStart;
    return availablePeriods.has(`${y}-${mStr}`);
  };

  const MONTH_OPTIONS = [
    { val: '04', label: 'Apr', isNextYear: false },
    { val: '05', label: 'May', isNextYear: false },
    { val: '06', label: 'Jun', isNextYear: false },
    { val: '07', label: 'Jul', isNextYear: false },
    { val: '08', label: 'Aug', isNextYear: false },
    { val: '09', label: 'Sep', isNextYear: false },
    { val: '10', label: 'Oct', isNextYear: false },
    { val: '11', label: 'Nov', isNextYear: false },
    { val: '12', label: 'Dec', isNextYear: false },
    { val: '01', label: 'Jan', isNextYear: true },
    { val: '02', label: 'Feb', isNextYear: true },
    { val: '03', label: 'Mar', isNextYear: true },
  ];

  const fetchData = async () => {
    if (!activeEntityId) return;
    if (filterType === 'monthly' && !selectedPeriod) return;
    if ((filterType === 'quarterly' || filterType === 'yearly') && !selectedYear) return;
    if (filterType === 'quarterly' && !selectedQuarter) return;

    setLoading(true);
    try {
      const params = {
        filter_type: filterType,
        year: filterType !== 'all' && filterType !== 'monthly' ? String(Number(selectedYear) - 1) : undefined,
        quarter: filterType === 'quarterly' ? (selectedQuarter || undefined) : undefined,
        period: filterType === 'monthly' ? (selectedPeriod || undefined) : undefined,
        garden_name: selectedGarden !== 'ALL' ? selectedGarden : undefined
      };
      
      const kpiRes = await api.getLedgerKpis({ entity_id: activeEntityId, ...params });
      setKpis(kpiRes);

      let resData = [];
      if (activeTopTab === 'raw') {
        const raw = await api.getLedgerRawBooks({ entity_id: activeEntityId, ...params });
        resData = raw.items || [];
      } else if (activeTopTab === 'clean') {
        const books = await api.getLedgerBooks({ entity_id: activeEntityId, data_type: activeSubTab, ...params });
        resData = books.items || [];
      } else if (activeTopTab === 'two_b') {
        const twoB = await api.getLedger2B({ entity_id: activeEntityId, ...params });
        resData = twoB.items || [];
      } else if (activeTopTab === 'reco') {
        const sub = SUB_TABS.reco.find(t => t.id === activeSubTab);
        const reco = await api.getLedgerReco({ entity_id: activeEntityId, statuses: sub?.match_status, ...params });
        resData = reco.items || [];
      }
      
      setData(resData);
    } catch (error) {
      console.error('Fetch error:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeEntityId, filterType, selectedYear, selectedQuarter, selectedPeriod, selectedGarden, activeTopTab, activeSubTab]);

  const handleTopTabChange = (tabId) => {
    setActiveTopTab(tabId);
    setActiveSubTab(SUB_TABS[tabId][0].id);
  };

  const formatCurrency = (val) => val ? `₹${Number(val).toLocaleString('en-IN', {minimumFractionDigits: 2})}` : '—';
  
  const filteredData = useMemo(() => {
    if (!debouncedSearchTerm.trim()) return data;
    const lower = debouncedSearchTerm.toLowerCase();
    return data.filter(row => {
      if (activeTopTab === 'raw' || activeTopTab === 'two_b') {
        return Object.values(row).some(val => 
          val !== null && val !== undefined && String(val).toLowerCase().includes(lower)
        );
      }
      
      const gstin = (row.supplier_gstin || row.gstin || row.books_supplier_gstin || row.canonical_supplier_gstin || '').toLowerCase();
      const name = (row.supplier_name || row.vendor_name || row.books_supplier_name || row.canonical_supplier_name || '').toLowerCase();
      const invoice = (row.invoice_number || row['Invoice Number'] || row.books_invoice_number || row.canonical_invoice_number || row.books_invoice_id || row.matched_2b_invoice_id || '').toLowerCase();
      
      return gstin.includes(lower) || name.includes(lower) || invoice.includes(lower);
    });
  }, [data, debouncedSearchTerm, activeTopTab]);

  const selectedRow = useMemo(() => {
    if (!selectedRowKey || activeTopTab !== 'reco') return null;
    const row = filteredData.find((r, i) => {
      const norm = normalizeRow(r, i);
      return norm.rowKey === selectedRowKey;
    });
    return row ? normalizeRow(row, filteredData.indexOf(row)) : null;
  }, [filteredData, selectedRowKey, activeTopTab]);

  const SelectedStatusIcon = selectedRow?.statusMeta?.icon || FileSpreadsheet;

  const formatCompactCurrency = (value) => {
    if (!value) return '₹0.00';
    const num = Number(value);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const csvEscape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const handleDownload = () => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).filter(k => typeof data[0][k] !== 'object');
    const lines = [
      headers.join(','),
      ...data.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ledger_export_${activeTopTab}_${activeSubTab}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const renderKpis = () => {
    if (!kpis) return null;
    const dataObj = kpis?.data || kpis || {};

    if (activeTopTab === 'raw') {
      const invoices = dataObj.raw_books_count || 0;
      const taxable = dataObj.raw_taxable || 0;
      const gst = dataObj.raw_gst || 0;
      const avgInvoice = invoices > 0 ? (taxable + gst) / invoices : 0;

      return (
        <section className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <KpiCard title="Total Invoices" value={invoices.toLocaleString()} subtitle="Uploaded records" accent="text-stone-700" />
          <KpiCard title="Total Taxable" value={formatCompactCurrency(taxable)} subtitle="Taxable base" accent="text-stone-700" />
          <KpiCard title="Total GST" value={formatCompactCurrency(gst)} subtitle="Tax amount" accent="text-brand-forest" />
          <KpiCard title="Avg Invoice Value" value={formatCompactCurrency(avgInvoice)} subtitle="Per document average" accent="text-indigo-600" />
        </section>
      );
    }
    
    if (activeTopTab === 'clean') {
      const cleanCount = dataObj.clean_books_count || 0;
      const cleanGst = dataObj.clean_gst || 0;
      const rawCount = dataObj.raw_books_count || 1;
      const errorCount = dataObj.error_books_count || 0;
      const warningCount = dataObj.warning_books_count || 0;
      const errorRate = ((errorCount + warningCount) / rawCount) * 100;

      return (
        <section className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <KpiCard title="Clean Invoices" value={cleanCount.toLocaleString()} subtitle="Valid records" accent="text-brand-forest" />
          <KpiCard title="Clean GST Amount" value={formatCompactCurrency(cleanGst)} subtitle="Verified tax amount" accent="text-stone-700" />
          <KpiCard title="Error Rate" value={`${errorRate.toFixed(1)}%`} subtitle="Validation failures" accent={errorRate > 5 ? "text-amber-600" : "text-stone-500"} />
          <KpiCard title="Critical Errors" value={errorCount.toLocaleString()} subtitle="Action required" accent={errorCount > 0 ? "text-red-600" : "text-stone-500"} />
        </section>
      );
    }

    if (activeTopTab === 'two_b') {
      const twoBCount = dataObj.two_b_count || 0;
      const taxable = dataObj.two_b_taxable || 0;
      const gst = dataObj.two_b_gst || 0;
      const missingInBooks = dataObj.missing_in_books || 0;

      return (
        <section className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <KpiCard title="Total 2B Invoices" value={twoBCount.toLocaleString()} subtitle="Portal records" accent="text-stone-700" />
          <KpiCard title="Total Taxable" value={formatCompactCurrency(taxable)} subtitle="Portal taxable base" accent="text-stone-700" />
          <KpiCard title="Total GST" value={formatCompactCurrency(gst)} subtitle="Available ITC" accent="text-brand-forest" />
          <KpiCard title="Unmatched (Not in Books)" value={missingInBooks.toLocaleString()} subtitle="Missing in your records" accent="text-amber-600" />
        </section>
      );
    }

    if (activeTopTab === 'reco') {
      const matched = dataObj.total_matched || 0;
      const missingIn2b = dataObj.missing_in_2b || 0;
      const missingInBooks = dataObj.missing_in_books || 0;
      const valueMismatch = dataObj.value_mismatch || 0;
      const possibleMatch = dataObj.possible_match || 0;
      
      const totalEvaluated = matched + missingIn2b + missingInBooks + valueMismatch + possibleMatch;
      const matchRate = totalEvaluated > 0 ? (matched / totalEvaluated) * 100 : 0;
      
      const itcEligible = dataObj.total_matched_gst || 0;
      const trappedItc = dataObj.missing_in_2b_gst || 0;
      const unclaimedLiability = dataObj.missing_in_books_gst || 0;

      return (
        <section className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <KpiCard title="ITC Match Rate" value={`${matchRate.toFixed(1)}%`} subtitle="Total match efficiency" accent={matchRate > 90 ? "text-brand-forest" : "text-amber-600"} />
          <KpiCard title="ITC Eligible" value={formatCompactCurrency(itcEligible)} subtitle="Claimable this period" accent="text-brand-forest" />
          <KpiCard title="Trapped ITC" value={formatCompactCurrency(trappedItc)} subtitle="Missing in 2B" accent="text-red-600" />
          <KpiCard title="Unclaimed Liability" value={formatCompactCurrency(unclaimedLiability)} subtitle="Missing in Books" accent="text-amber-600" />
        </section>
      );
    }
    return null;
  };

  const spreadsheetSums = useMemo(() => {
    let taxable = 0, gst = 0, igst = 0, cgst = 0, sgst = 0;
    if (!filteredData || filteredData.length === 0) return { taxable, gst, igst, cgst, sgst };

    const firstRow = filteredData[0];
    const rawKeys = Object.keys(firstRow);
    const findKey = (possibleNames) => {
      const lowerNames = possibleNames.map(n => n.toLowerCase());
      return rawKeys.find(k => lowerNames.includes(k.toLowerCase()) || lowerNames.includes(k.toLowerCase().replace(/_/g, '')));
    };

    const taxKey = findKey(['books_taxable_value', 'taxable_value', 'Taxable Value', 'Taxable Amount']);
    const gstKey = findKey(['books_total_gst', 'total_gst', 'Total GST', '_total_tax', 'canonical_total_gst']);
    const igstKey = findKey(['books_igst_amount', 'igst_amount', 'igst', 'IGST', 'Igst Amount']);
    const cgstKey = findKey(['books_cgst_amount', 'cgst_amount', 'cgst', 'CGST', 'Cgst Amount']);
    const sgstKey = findKey(['books_sgst_amount', 'sgst_amount', 'sgst', 'SGST', 'Sgst Amount']);

    filteredData.forEach(item => {
      const val = (k) => {
         if (!k || item[k] === undefined || item[k] === null) return 0;
         const v = parseFloat(item[k]);
         return isNaN(v) ? 0 : v;
      };
      taxable += val(taxKey);
      gst += val(gstKey);
      igst += val(igstKey);
      cgst += val(cgstKey);
      sgst += val(sgstKey);
    });

    if (gst === 0 && (igst > 0 || cgst > 0 || sgst > 0)) {
      gst = igst + cgst + sgst;
    }

    return { taxable, gst, igst, cgst, sgst };
  }, [filteredData]);

  return (
    <div className="space-y-8 py-6">
      <header className="app-panel-hero p-8 md:p-10">
        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-forest">
              <Database className="h-4 w-4" />
              <span className="app-eyebrow text-brand-forest">Ledger</span>
            </div>
            <h1 className="app-page-title">Multi-Period Ledger</h1>
            <p className="app-page-subtitle max-w-3xl">
              Cross-period reconciliation and clean books tracker.
            </p>
          </div>
        </div>
      </header>

      {renderKpis()}

      <section className="app-panel p-3 px-5 relative z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <DebouncedSearchInput onSearch={setDebouncedSearchTerm} />

            <div className="flex items-center gap-3 shrink-0">
              <label className="flex items-center gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-brand-forest/20 focus-within:border-brand-forest transition-colors">
                <Filter className="h-4 w-4 text-brand-forest" />
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">View</div>
                    <div className="relative flex items-center">
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="appearance-none bg-transparent text-sm font-semibold text-stone-800 outline-none pr-6 cursor-pointer"
                      >
                        <option value="all">All Time</option>
                        <option value="yearly">Financial Year</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                      <ChevronDown className="absolute right-0 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                    </div>
                  </div>
                  
                  {filterType === 'monthly' && (
                    <>
                      <div className="h-6 w-px bg-stone-200 mx-1"></div>
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">FY</div>
                        <div className="relative flex items-center">
                          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="appearance-none bg-transparent text-sm font-semibold text-stone-800 outline-none pr-6 cursor-pointer">
                            {years.map(y => <option key={y} value={y}>FY {Number(y)-1}-{String(y).slice(-2)}</option>)}
                          </select>
                          <ChevronDown className="absolute right-0 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                        </div>
                      </div>
                      <div className="h-6 w-px bg-stone-200 mx-1"></div>
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">Month</div>
                        <div className="relative flex items-center">
                          <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="appearance-none bg-transparent text-sm font-semibold text-stone-800 outline-none pr-6 cursor-pointer">
                            <option value="">Select Month...</option>
                            {MONTH_OPTIONS.map(m => {
                              const hasData = hasDataForMonth(selectedYear, m.val, m.isNextYear);
                              const periodFormat = m.isNextYear ? `${selectedYear}-${m.val}` : `${Number(selectedYear)-1}-${m.val}`;
                              return (
                                <option key={m.val} value={periodFormat} disabled={!hasData}>
                                  {m.label} {hasData ? '' : '(No data)'}
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown className="absolute right-0 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                        </div>
                      </div>
                    </>
                  )}
                  
                  {filterType === 'quarterly' && (
                    <>
                      <div className="h-6 w-px bg-stone-200 mx-1"></div>
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">FY</div>
                        <div className="relative flex items-center">
                          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="appearance-none bg-transparent text-sm font-semibold text-stone-800 outline-none pr-6 cursor-pointer">
                            {years.map(y => <option key={y} value={y}>FY {Number(y)-1}-{String(y).slice(-2)}</option>)}
                          </select>
                          <ChevronDown className="absolute right-0 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                        </div>
                      </div>
                      <div className="h-6 w-px bg-stone-200 mx-1"></div>
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">Quarter</div>
                        <div className="relative flex items-center">
                          <select value={selectedQuarter} onChange={e => setSelectedQuarter(e.target.value)} className="appearance-none bg-transparent text-sm font-semibold text-stone-800 outline-none pr-6 cursor-pointer">
                            <option value="">Select Quarter...</option>
                            {[1,2,3,4].map(q => {
                               const hasData = hasDataForQuarter(selectedYear, q);
                               const qLabel = q === 1 ? 'Q1 (Apr-Jun)' : q === 2 ? 'Q2 (Jul-Sep)' : q === 3 ? 'Q3 (Oct-Dec)' : 'Q4 (Jan-Mar)';
                               return (
                                 <option key={q} value={q} disabled={!hasData}>
                                    {qLabel} {hasData ? '' : '(No data)'}
                                 </option>
                               );
                            })}
                          </select>
                          <ChevronDown className="absolute right-0 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                        </div>
                      </div>
                    </>
                  )}
                  
                  {filterType === 'yearly' && (
                    <>
                      <div className="h-6 w-px bg-stone-200 mx-1"></div>
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">FY</div>
                        <div className="relative flex items-center">
                          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="appearance-none bg-transparent text-sm font-semibold text-stone-800 outline-none pr-6 cursor-pointer">
                            {years.map(y => <option key={y} value={y}>FY {Number(y)-1}-{String(y).slice(-2)}</option>)}
                          </select>
                          <ChevronDown className="absolute right-0 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </label>

              {activeTopTab !== 'two_b' && (
              <label className="flex items-center gap-2 rounded-[24px] border border-stone-200 bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-brand-forest/20 focus-within:border-brand-forest transition-colors">
                <MapPinned className="h-4 w-4 text-brand-forest" />
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">Garden</div>
                  <div className="relative flex items-center">
                    <select value={selectedGarden} onChange={e => setSelectedGarden(e.target.value)} className="appearance-none bg-transparent text-sm font-semibold text-stone-800 outline-none pr-6 cursor-pointer">
                      <option value="ALL">All Gardens</option>
                      {gardenOptions.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <ChevronDown className="absolute right-0 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                  </div>
                </div>
              </label>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 relative shrink-0">
            <button onClick={handleDownload} className="app-button-primary disabled:opacity-50">
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="space-y-6">
        <div className="rounded-[26px] border border-stone-100 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            {TOP_TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTopTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTopTabChange(tab.id)}
                  className={`rounded-[18px] border px-4 py-3 text-left transition-all ${
                    active
                      ? `${tab.bgClasses} shadow-sm`
                      : 'border-transparent bg-transparent hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${active ? tab.colorClasses : 'text-stone-400'}`} />
                      <div className={`text-[10px] font-black uppercase tracking-widest ${active ? tab.colorClasses : 'text-stone-400'}`}>
                        {tab.label}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-[26px] border border-stone-100 bg-white p-2 shadow-sm">
          <div className={['reco', 'clean'].includes(activeTopTab) ? "flex flex-col md:flex-row gap-2 w-full" : "grid grid-cols-2 gap-2 lg:grid-cols-4 2xl:grid-cols-7"}>
            {SUB_TABS[activeTopTab].map(sub => {
              const isActive = activeSubTab === sub.id;
              const parentTab = TOP_TABS.find(t => t.id === activeTopTab);
              
              let count = null;
              const dataObj = kpis?.data || kpis || {};
              if (activeTopTab === 'reco') {
                if (sub.id === 'matched_strict') {
                  count = dataObj.total_matched || 0;
                } else {
                  count = dataObj[sub.id] || 0;
                }
              } else if (activeTopTab === 'clean') {
                if (sub.id === 'clean') {
                  count = dataObj.clean_books_count || 0;
                } else if (sub.id === 'warnings') {
                  count = dataObj.warning_books_count || 0;
                } else if (sub.id === 'errors') {
                  count = dataObj.error_books_count || 0;
                }
              }
              
              return (
                <button
                  key={sub.id}
                  onClick={() => setActiveSubTab(sub.id)}
                  className={`rounded-[18px] border px-3 py-2.5 text-left transition-all ${
                    ['reco', 'clean'].includes(activeTopTab) ? 'flex-1 min-w-[120px]' : ''
                  } ${
                    isActive 
                      ? `${parentTab.bgClasses} ${parentTab.colorClasses} shadow-sm`
                      : 'border-transparent bg-transparent text-stone-500 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                >
                <div className="text-[9px] font-black uppercase tracking-widest">
                  {sub.label}
                </div>
                {count !== null && (
                  <div className="mt-1.5 text-lg font-black leading-none">{count}</div>
                )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-stone-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-stone-100 bg-stone-50/70 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-2xl font-black tracking-tight text-stone-950">
                {SUB_TABS[activeTopTab].find(t => t.id === activeSubTab)?.label} Ledger
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 text-[11px] font-bold text-stone-500">
              {spreadsheetSums.taxable > 0 && (
                <div className="rounded-full border border-stone-200 bg-white px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
                  <span className="text-stone-400">Taxable:</span> <span className="text-stone-700">{formatCompactCurrency(spreadsheetSums.taxable)}</span>
                </div>
              )}
              {spreadsheetSums.gst > 0 && (
                <div className="rounded-full border border-stone-200 bg-white px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
                  <span className="text-stone-400">GST:</span> <span className="text-brand-forest">{formatCompactCurrency(spreadsheetSums.gst)}</span>
                </div>
              )}
              {spreadsheetSums.igst > 0 && (
                <div className="rounded-full border border-stone-200 bg-white px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
                  <span className="text-stone-400">IGST:</span> <span className="text-sky-700">{formatCompactCurrency(spreadsheetSums.igst)}</span>
                </div>
              )}
              {spreadsheetSums.cgst > 0 && (
                <div className="rounded-full border border-stone-200 bg-white px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
                  <span className="text-stone-400">CGST:</span> <span className="text-indigo-600">{formatCompactCurrency(spreadsheetSums.cgst)}</span>
                </div>
              )}
              {spreadsheetSums.sgst > 0 && (
                <div className="rounded-full border border-stone-200 bg-white px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
                  <span className="text-stone-400">SGST:</span> <span className="text-amber-600">{formatCompactCurrency(spreadsheetSums.sgst)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px] border border-stone-300 rounded-lg">
            <table className="min-w-full text-left border-collapse whitespace-nowrap text-xs">
              <thead className="bg-stone-200 border-b border-stone-300 sticky top-0 z-10 shadow-sm">
                <tr className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                  {activeTopTab === 'raw' && (
                    filteredData.length > 0 ? Object.keys(filteredData[0]).filter(k => !k.startsWith('_')).map(h => (
                      <th key={h} className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">{h}</th>
                    )) : <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">No Data</th>
                  )}

                  {activeTopTab === 'two_b' && (
                    filteredData.length > 0 ? Object.keys(filteredData[0]).filter(k => !k.startsWith('_')).map(h => (
                      <th key={h} className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">{h}</th>
                    )) : <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">No Data</th>
                  )}

                  {activeTopTab === 'clean' && (
                    <>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">Vendor</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">Garden</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">GSTIN</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">Invoice No.</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">Date</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">Taxable</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">IGST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">CGST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">SGST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">Total GST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">Invoice Value</th>
                      {(activeSubTab === 'warnings' || activeSubTab === 'errors') && (
                        <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">Reason</th>
                      )}
                    </>
                  )}

                  {activeTopTab === 'reco' && (
                    <>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">#</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">GSTIN</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">Vendor</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">Books Invoice</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">Books Date</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">Books Taxable</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">Books IGST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">Books CGST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">Books SGST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">Books GST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">2B Invoice</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">2B Date</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">2B Taxable</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">2B IGST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">2B CGST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">2B SGST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">2B GST</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold">Delta</th>
                      <th className="px-3 py-2 border-r border-stone-200 last:border-r-0 font-bold text-right">Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={15} className="px-6 py-16 text-center">
                      <div className="flex justify-center"><Spinner size="lg" /></div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-6 py-16 text-center text-sm font-semibold text-stone-500">
                      No rows are available in this bucket.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row, i) => {
                    if (activeTopTab === 'raw' || activeTopTab === 'two_b') {
                      const keys = Object.keys(filteredData[0]).filter(k => !k.startsWith('_'));
                      return (
                        <tr key={i} className="cursor-pointer transition-colors even:bg-stone-50 hover:bg-blue-50/50 border-b border-stone-200">
                          {keys.map(k => (
                            <td key={k} className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm text-stone-700">{String(row[k])}</td>
                          ))}
                        </tr>
                      );
                    }

                    if (activeTopTab === 'clean') {
                      const totalGst = (row.books_igst_amount || row.igst_amount || 0) + (row.books_cgst_amount || row.cgst_amount || 0) + (row.books_sgst_amount || row.sgst_amount || 0);
                      const rowReason = row._errors || row._reasons || row.errors || row.reasons || row.reason || '';

                      return (
                        <tr key={row._id || i} className="cursor-pointer transition-colors even:bg-stone-50 hover:bg-blue-50/50 border-b border-stone-200">
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top">
                            <div className="min-w-[220px] text-sm font-semibold text-stone-900">
                              {row.supplier_name || '—'}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-semibold text-stone-700">{row.garden_name || '—'}</td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-bold text-stone-900">{row.supplier_gstin || '—'}</td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono font-semibold text-stone-700">{row.invoice_number || '—'}</td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm text-stone-600">{formatDate(row.invoice_date)}</td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(row.books_taxable_value ?? row.taxable_value)}</td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(row.books_igst_amount ?? row.igst_amount)}</td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(row.books_cgst_amount ?? row.cgst_amount)}</td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(row.books_sgst_amount ?? row.sgst_amount)}</td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(row.books_total_gst ?? row.total_gst ?? totalGst)}</td>
                          <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(row.books_total_invoice_value ?? row.total_invoice_value)}</td>
                          {(activeSubTab === 'warnings' || activeSubTab === 'errors') && (
                            <td className={`px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-semibold max-w-xs truncate ${activeSubTab === 'errors' ? 'text-red-600' : 'text-amber-600'}`} title={String(rowReason)}>
                              {rowReason ? String(rowReason) : '—'}
                            </td>
                          )}
                        </tr>
                      );
                    }

                    // reco
                    const normalized = normalizeRow(row, i);
                    const StatusIcon = normalized.statusMeta.icon;
                    return (
                      <tr key={normalized.rowKey} onClick={() => openDetails(normalized)} className={`cursor-pointer transition-colors even:bg-stone-50 hover:bg-blue-50/50 border-b border-stone-200 ${selectedRowKey === normalized.rowKey ? 'bg-brand-emerald/5' : ''}`}>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-xs font-mono font-bold text-stone-400">{String(normalized.displayIndex).padStart(3, '0')}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-bold text-stone-900">{normalized.books_supplier_gstin || normalized.canonical_supplier_gstin || normalized.supplier_gstin || '—'}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top">
                          <div className="min-w-[220px] text-sm font-semibold text-stone-900">
                            {normalized.books_supplier_name || normalized.canonical_supplier_name || normalized.supplier_name || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono font-semibold text-stone-700">{normalized.booksLabel}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm text-stone-600">{formatDate(normalized.books_invoice_date || normalized.invoice_date)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(normalized.books_taxable_value || normalized.taxable_value)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(normalized.books_igst_amount || normalized.igst_amount)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(normalized.books_cgst_amount || normalized.cgst_amount)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(normalized.books_sgst_amount || normalized.sgst_amount)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono font-bold text-stone-900 text-right">{formatCurrency(normalized.books_total_gst || normalized.total_gst)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono font-semibold text-stone-700">{normalized.portalLabel}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm text-stone-600">{formatDate(normalized.canonical_invoice_date)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(normalized.canonical_taxable_value)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(normalized.canonical_igst_amount)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(normalized.canonical_cgst_amount)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono text-stone-700 text-right">{formatCurrency(normalized.canonical_sgst_amount)}</td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono font-bold text-brand-forest text-right">{formatCurrency(normalized.canonical_total_gst)}</td>
                        <td className={`px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-sm font-mono font-bold text-right ${normalized.delta > 0 ? 'text-amber-700' : normalized.delta < 0 ? 'text-red-600' : 'text-stone-500'}`}>
                          {formatCurrency(normalized.delta)}
                        </td>
                        <td className="px-3 py-1.5 border-r border-stone-200 last:border-r-0 align-top text-right">
                          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${TONE_STYLES[normalized.statusMeta.tone] || TONE_STYLES.stone}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {normalized.statusMeta.label}
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
      </div>

      {/* Detail Sheet */}
      {activeTopTab === 'reco' && (
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
                      <DetailField label="GSTIN" value={selectedRow.books_supplier_gstin || selectedRow.canonical_supplier_gstin || selectedRow.supplier_gstin} mono />
                      <DetailField label="Vendor" value={selectedRow.books_supplier_name || selectedRow.canonical_supplier_name || selectedRow.supplier_name} />
                      <DetailField label="Books Ref" value={selectedRow.books_invoice_id || selectedRow.books_invoice_number} mono />
                      <DetailField label="2B Ref" value={selectedRow.matched_2b_invoice_id || selectedRow.canonical_invoice_number} mono />
                    </DetailSection>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <DetailSection title="Books Values" boxClass="bg-stone-50 border-stone-200">
                        <DetailField label="Invoice" value={selectedRow.books_invoice_number} />
                        <DetailField label="Date" value={formatDate(selectedRow.books_invoice_date || selectedRow.invoice_date)} />
                        <DetailField label="Taxable" value={formatCurrency(selectedRow.books_taxable_value || selectedRow.taxable_value)} />
                        <DetailField label="Total GST" value={formatCurrency(selectedRow.books_total_gst || selectedRow.total_gst)} />
                        <DetailField label="Invoice Value" value={formatCurrency(selectedRow.books_invoice_value || selectedRow.total_invoice_value)} />
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
      )}
    </div>
  );
};
