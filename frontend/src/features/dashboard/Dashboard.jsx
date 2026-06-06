import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';
import {
    BarChart3,
    TrendingUp,
    AlertCircle,
    CheckCircle2,
    ShieldCheck,
    Activity,
    ArrowUpRight,
    Database,
    History
} from 'lucide-react';

import { useAppStore } from '../../store/useAppStore';

export const Dashboard = () => {
    const { activeEntityId, selectedPeriod } = useAppStore();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (activeEntityId && selectedPeriod) {
            fetchStats();
        }
    }, [activeEntityId, selectedPeriod]);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const data = await api.getDashboardStats(activeEntityId, selectedPeriod);
            setStats(data);
        } catch (err) {
            console.error("Failed to fetch dashboard stats:", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-stone-400">
                <div className="mb-4"><Spinner size="xl" /></div>
                <p className="text-sm font-black uppercase tracking-widest text-stone-500">Aggregating Audit Intelligence...</p>
            </div>
        );
    }

    const kpis = [
        { label: 'Audit Runs', value: stats?.kpis?.total_runs || 0, icon: History, color: 'stone' },
        { label: 'Matched Rate', value: `${stats?.kpis?.match_rate || 0}%`, icon: CheckCircle2, color: 'emerald' },
        { label: 'ITC At Risk', value: `₹${(stats?.kpis?.at_risk_itc || 0).toLocaleString()}`, icon: AlertCircle, color: 'red' },
        { label: 'Total Invoices', value: stats?.kpis?.total_invoices || 0, icon: Database, color: 'brand' }
    ];

    return (
        <div className="space-y-10 p-2">
            <header className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-brand-forest">
                    <BarChart3 className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Operational Overview</span>
                </div>
                <h1 className="text-4xl font-black text-stone-900 tracking-tight">Intelligence Dashboard</h1>
            </header>

            {/* KPI Grid */}
            <div className="grid grid-cols-4 gap-6">
                {kpis.map((kpi, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-white border border-stone-200 p-8 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden"
                    >
                        <div className={`absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform ${kpi.color === 'emerald' ? 'text-emerald-500' :
                            kpi.color === 'red' ? 'text-red-500' : 'text-brand-forest'
                            }`}>
                            <kpi.icon className="w-16 h-16" />
                        </div>

                        <div className="relative z-10 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest leading-none">{kpi.label}</span>
                                <kpi.icon className={`w-4 h-4 ${kpi.color === 'emerald' ? 'text-emerald-500' :
                                    kpi.color === 'red' ? 'text-red-500' : 'text-brand-forest'
                                    }`} />
                            </div>
                            <div className="text-3xl font-black text-stone-900">{kpi.value}</div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400">
                                <TrendingUp className="w-3 h-3 text-emerald-500" />
                                Updated just now
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-3 gap-8">
                {/* Monthly Trend */}
                <div className="col-span-2 bg-white border border-stone-200 rounded-[32px] p-10 text-stone-900 relative overflow-hidden shadow-sm ring-1 ring-stone-900/5">
                    <div className="absolute inset-0 bg-linear-to-tr from-brand-emerald/5 to-transparent pointer-events-none" />
                    <div className="relative z-10 flex flex-col gap-10">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black tracking-tight">Reconciliation Velocity</h3>
                                <p className="text-xs text-stone-500 font-bold italic">Month-over-Month Match Progression</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-brand-emerald" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-stone-400">Cleaned</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-stone-200" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-stone-400">Matched</span>
                                </div>
                            </div>
                        </div>

                        {/* Custom Bar Chart */}
                        <div className="flex items-end justify-between gap-6 h-48 px-2">
                            {stats?.trends?.map((t, idx) => (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-4 group">
                                    <div className="w-full flex items-end justify-center gap-1 relative h-full">
                                        {/* Total Bar */}
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${(t.total / Math.max(...stats.trends.map(x => x.total))) * 100}%` }}
                                            className="w-4 bg-stone-100 rounded-t-lg group-hover:bg-stone-200 transition-colors"
                                        />
                                        {/* Matched Bar */}
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${(t.matched / Math.max(...stats.trends.map(x => x.total))) * 100}%` }}
                                            className="w-4 bg-brand-emerald rounded-t-lg group-hover:brightness-110 transition-all shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                                        />
                                        {/* Tooltip on hover */}
                                        <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-stone-900 text-white text-[10px] font-black px-2 py-1 rounded shadow-xl whitespace-nowrap z-20">
                                            {t.matched}/{t.total}
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-black text-stone-400 uppercase tracking-tighter group-hover:text-stone-900 transition-colors">{t.month}</span>
                                </div>
                            ))}
                            {(!stats?.trends || stats.trends.length === 0) && (
                                <div className="w-full flex items-center justify-center h-full border-2 border-dashed border-stone-100 rounded-3xl text-stone-300 font-black text-[10px] uppercase tracking-widest">No historical runs recorded</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Audit Confidence */}
                <div className="bg-white border border-stone-200 rounded-[32px] p-10 flex flex-col gap-8 shadow-sm">
                    <div>
                        <h3 className="text-xl font-black text-stone-900 tracking-tight">Audit Confidence</h3>
                        <p className="text-xs text-stone-500 font-medium">Discrepancy Severity Distribution</p>
                    </div>

                    <div className="flex-1 flex flex-col justify-center gap-6">
                        {[
                            { label: 'Strict Matches', count: stats?.distribution?.MATCHED_STRICT || 0, color: 'bg-brand-emerald' },
                            { label: 'Relaxed Matches', count: stats?.distribution?.MATCHED_RELAXED || 0, color: 'bg-amber-400' },
                            { label: 'Value Mismatch', count: stats?.distribution?.VALUE_MISMATCH || 0, color: 'bg-red-500' }
                        ].map((d, idx) => (
                            <div key={idx} className="space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-stone-400">
                                    <span className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${d.color}`} />
                                        {d.label}
                                    </span>
                                    <span className="text-stone-900">{d.count}</span>
                                </div>
                                <div className="h-2 bg-stone-50 rounded-full overflow-hidden border border-stone-100">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(d.count / (Object.values(stats?.distribution || {}).reduce((a, b) => a + b, 0) || 1)) * 100}%` }}
                                        className={`h-full ${d.color}`}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex gap-3 text-brand-forest">
                        <ShieldCheck className="w-5 h-5 shrink-0" />
                        <p className="text-[10px] font-bold leading-relaxed">System integrity is monitored in real-time. All recorded adjustments are linked to transition audits.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
