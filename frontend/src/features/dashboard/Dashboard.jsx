import React from 'react';
import {
  AlertCircle,
  BarChart3,
  Building2,
  CheckCircle2,
  Database,
  History,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';
import { useAppStore } from '../../store/useAppStore';

const monthLabel = (period) => {
  if (!period) return '—';
  const [year, month] = String(period).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return period;
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const formatCompactCurrency = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const KpiCard = ({ title, value, subtitle, icon: Icon, accent }) => {
  const len = String(value).length;
  const textSize = len > 14 ? 'text-lg xl:text-xl' : len > 10 ? 'text-xl xl:text-2xl' : 'text-2xl md:text-3xl';
  return (
    <div className="app-kpi-card p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">{title}</span>
        <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
      </div>
      <div className={`mt-3 ${textSize} font-black tracking-tight truncate ${accent}`} title={value}>{value}</div>
      <p className="mt-2 text-xs font-medium text-stone-500">{subtitle}</p>
    </div>
  );
};

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

export const Dashboard = () => {
  const { activeEntityId, selectedPeriod, businessContext } = useAppStore();
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState(null);
  const [vendorStats, setVendorStats] = React.useState(null);
  const [cycles, setCycles] = React.useState([]);
  const [trendRows, setTrendRows] = React.useState([]);

  React.useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      if (!activeEntityId || !selectedPeriod) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const [currentStats, monthCycles, vendors] = await Promise.all([
          api.getDashboardStats(activeEntityId, selectedPeriod),
          api.getMonthCycles(activeEntityId),
          api.getVendorStats(activeEntityId),
        ]);
        if (cancelled) return;

        const recentCycles = (monthCycles || []).slice(0, 6);
        const recentStats = await Promise.all(
          recentCycles.map(async (cycle) => {
            try {
              const cycleStats = await api.getDashboardStats(activeEntityId, cycle.period);
              return {
                period: cycle.period,
                total: cycleStats.kpis?.total_invoices || 0,
                matched: cycleStats.kpis?.matched_invoices || 0,
                pending_2b: cycleStats.kpis?.pending_2b || 0,
                books_pending: cycleStats.kpis?.books_pending || 0,
                match_rate: cycleStats.kpis?.match_rate || 0,
              };
            } catch {
              return null;
            }
          })
        );

        if (!cancelled) {
          setStats(currentStats);
          setCycles(monthCycles || []);
          setVendorStats(vendors);
          setTrendRows(recentStats.filter(Boolean).reverse());
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch dashboard stats:', error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [activeEntityId, selectedPeriod, businessContext]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-stone-400">
        <div className="mb-4"><Spinner size="xl" /></div>
        <p className="text-sm font-black uppercase tracking-widest text-stone-500">Aggregating Audit Intelligence...</p>
      </div>
    );
  }

  const kpis = [
    {
      title: 'Books Clean',
      value: stats?.kpis?.books_clean || 0,
      subtitle: 'Current-month validated books invoices',
      icon: Database,
      accent: 'text-brand-forest',
    },
    {
      title: 'Books Pending',
      value: stats?.kpis?.books_pending || 0,
      subtitle: 'Warnings and unresolved books-side exceptions',
      icon: AlertCircle,
      accent: 'text-amber-700',
    },
    {
      title: 'Matched Invoices',
      value: stats?.kpis?.matched_invoices || 0,
      subtitle: 'Strict plus relaxed reconciliation matches',
      icon: CheckCircle2,
      accent: 'text-emerald-600',
    },
    {
      title: 'Pending 2B',
      value: stats?.kpis?.pending_2b || 0,
      subtitle: 'Portal-side exception records still open',
      icon: ShieldCheck,
      accent: 'text-sky-700',
    },
    {
      title: 'Match Rate',
      value: `${stats?.kpis?.match_rate || 0}%`,
      subtitle: 'Share of reconciled invoices for the selected period',
      icon: TrendingUp,
      accent: 'text-brand-forest',
    },
    {
      title: 'Active Vendors',
      value: vendorStats?.active_vendors || 0,
      subtitle: 'Suppliers available in the trust registry',
      icon: Building2,
      accent: 'text-brand-forest',
    },
  ];

  const distributionRows = [
    { label: 'Strict Matches', count: stats?.distribution?.MATCHED_STRICT || 0, color: 'bg-brand-emerald' },
    { label: 'Relaxed Matches', count: stats?.distribution?.MATCHED_RELAXED || 0, color: 'bg-amber-400' },
    { label: 'Value Mismatch', count: stats?.distribution?.VALUE_MISMATCH || 0, color: 'bg-rose-500' },
    { label: 'Missing in 2B', count: stats?.distribution?.MISSING_IN_2B || 0, color: 'bg-sky-500' },
    { label: 'Missing in Books', count: stats?.distribution?.MISSING_IN_BOOKS || 0, color: 'bg-stone-400' },
  ];
  const distributionTotal = distributionRows.reduce((sum, item) => sum + item.count, 0) || 1;
  const trendMax = Math.max(...trendRows.map((item) => Math.max(item.total, item.matched, item.pending_2b)), 1);

  return (
    <div className="space-y-8 py-6">
      <header className="app-panel-hero p-8 md:p-10">
        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-forest">
              <BarChart3 className="h-4 w-4" />
              <span className="app-eyebrow text-brand-forest">Operational Overview</span>
            </div>
            <h1 className="app-page-title">Intelligence Dashboard</h1>
            <p className="app-page-subtitle max-w-3xl">
              Month-aware books, 2B, and vendor metrics for {businessContext || 'the active entity'}, with only the operational charts needed to monitor reconciliation health.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-stone-200 bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Active Period</div>
              <div className="mt-1 text-sm font-semibold text-stone-800">{monthLabel(selectedPeriod)}</div>
            </div>
            <div className="rounded-[24px] border border-stone-200 bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Tracked Month Cycles</div>
              <div className="mt-1 text-sm font-semibold text-stone-800">{cycles.length}</div>
            </div>
            <div className="rounded-[24px] border border-stone-200 bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">At-Risk GST</div>
              <div className="mt-1 text-sm font-semibold text-stone-800">{formatCompactCurrency(stats?.kpis?.at_risk_itc || 0)}</div>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_380px]">
        <SectionCard
          title="Month Cycle Trend"
          subtitle="Six-cycle view of books volume, matched invoices, and portal-side pending exceptions."
          action={<History className="h-4 w-4 text-brand-emerald" />}
        >
          {!trendRows.length ? (
            <div className="flex h-64 items-center justify-center rounded-[28px] border border-dashed border-stone-200 text-sm font-semibold text-stone-400">
              No historical month cycles available yet.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex h-64 items-end gap-5">
                {trendRows.map((row) => (
                  <div key={row.period} className="flex flex-1 flex-col items-center gap-3">
                    <div className="flex h-full w-full items-end justify-center gap-2 rounded-[24px] bg-stone-50 px-3 py-4">
                      <div className="w-4 rounded-t-full bg-stone-200" style={{ height: `${(row.total / trendMax) * 100}%` }} />
                      <div className="w-4 rounded-t-full bg-brand-emerald" style={{ height: `${(row.matched / trendMax) * 100}%` }} />
                      <div className="w-4 rounded-t-full bg-sky-500" style={{ height: `${(row.pending_2b / trendMax) * 100}%` }} />
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">{monthLabel(row.period)}</div>
                      <div className="mt-1 text-xs font-semibold text-stone-600">{row.match_rate}% match</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-stone-400">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-stone-200" />Books Total</span>
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand-emerald" />Matched</span>
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-500" />Pending 2B</span>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Exception Mix"
          subtitle="Current-period distribution of the main reconciliation statuses."
          action={<AlertCircle className="h-4 w-4 text-amber-600" />}
        >
          <div className="space-y-4">
            {distributionRows.map((row) => (
              <div key={row.label} className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-stone-400">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${row.color}`} />
                    {row.label}
                  </span>
                  <span className="text-stone-900">{row.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full border border-stone-100 bg-stone-50">
                  <div className={`h-full ${row.color}`} style={{ width: `${(row.count / distributionTotal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SectionCard
          title="Vendor Trust Mix"
          subtitle="Trust posture of the supplier registry used in validation and reconciliation."
          action={<Building2 className="h-4 w-4 text-brand-emerald" />}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              ['High Trust', vendorStats?.high_trust_vendors || 0, 'bg-emerald-500'],
              ['Medium Trust', vendorStats?.medium_trust_vendors || 0, 'bg-amber-400'],
              ['Low Trust', vendorStats?.low_trust_vendors || 0, 'bg-rose-500'],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-[24px] border border-stone-100 bg-stone-50 px-5 py-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">{label}</div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="text-3xl font-black text-stone-900">{value}</div>
                  <div className={`h-10 w-10 rounded-full ${color} opacity-90`} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Current Snapshot"
          subtitle="Operational roll-up for the selected month cycle."
          action={<ShieldCheck className="h-4 w-4 text-brand-emerald" />}
        >
          <div className="space-y-3">
            {[
              ['Total Audit Runs', stats?.kpis?.total_runs || 0],
              ['Current Books Invoices', stats?.kpis?.total_invoices || 0],
              ['Matched GST Value', formatCompactCurrency(stats?.kpis?.matched_gst || 0)],
              ['Open Exception Suppliers', stats?.kpis?.supplier_followups || 0],
              ['Vendor Contexts Covered', vendorStats?.contexts_covered || 0],
              ['Average Vendor Confidence', `${vendorStats?.average_confidence || 0}%`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                <div className="text-sm font-medium text-stone-500">{label}</div>
                <div className="text-sm font-black text-stone-900">{value}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
