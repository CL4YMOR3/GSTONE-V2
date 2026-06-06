import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Spinner } from '../../components/Spinner';
import {
    ShieldCheck, FileText, CheckCircle2, ArrowRight,
    ArrowLeft, Zap, ClipboardCheck, AlertTriangle,
    History, Database, Lock
} from 'lucide-react';

export const CertificationPanel = () => {
    const {
        setActiveStep,
        currentAuditResults,
        fixQueue,
        activeEntityId,
        selectedPeriod,
        currentRunId
    } = useAppStore();
    const navigate = useNavigate();
    const [isCommiting, setIsCommiting] = useState(false);
    const [error, setError] = useState(null);
    const [isApproved, setIsApproved] = useState(false);

    // Heritage KPI Logic
    const stats = React.useMemo(() => {
        if (!currentAuditResults) return { clean: 0, warnings: 0, errors: 0, total: 0 };
        return {
            clean: currentAuditResults.clean?.length || 0,
            warnings: currentAuditResults.warnings?.length || 0,
            errors: currentAuditResults.errors?.length || 0,
            total: (currentAuditResults.clean?.length || 0) +
                (currentAuditResults.warnings?.length || 0) +
                (currentAuditResults.errors?.length || 0)
        };
    }, [currentAuditResults]);

    React.useEffect(() => {
        setActiveStep(6);
    }, [setActiveStep]);

    const hasAuditData = Boolean(
        currentRunId &&
        currentAuditResults?.summary &&
        ((currentAuditResults.clean?.length || 0) +
            (currentAuditResults.warnings?.length || 0) +
            (currentAuditResults.errors?.length || 0) > 0)
    );

    const handleCertify = async () => {
        try {
            setIsCommiting(true);
            setError(null);

            const payload = {
                entity_id: activeEntityId,
                period: selectedPeriod,
                run_id: currentRunId,
                summary: currentAuditResults.summary,
                results: {
                    clean: currentAuditResults.clean,
                    warnings: currentAuditResults.warnings,
                    errors: currentAuditResults.errors
                },
                fixes: fixQueue
            };

            await api.finalizeAudit(payload);

            // Navigate to export on success
            navigate('/books-validation/export');
        } catch (err) {
            console.error("Ledger Commitment Failure:", err);
            setError(err.message || "Failed to save this review.");
        } finally {
            setIsCommiting(false);
        }
    };

    if (!hasAuditData) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-stone-400">
                <AlertTriangle className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-black uppercase tracking-widest">No review data found</p>
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
            
            {/* Header */}
            <header className="app-panel-hero p-8 md:p-10">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-brand-forest">
                            <ShieldCheck className="h-4 w-4" />
                            <span className="app-eyebrow text-brand-forest">Final Review · Step 6</span>
                        </div>
                        <h1 className="app-page-title">Approve & Save Review</h1>
                        <p className="app-page-subtitle max-w-3xl">
                            Verify and approve the cleaned books before exporting the final workbook.
                        </p>
                    </div>
                </div>
            </header>

            {/* 1. Summary KPI Cards */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {[
                    { label: 'Validated Rows', value: stats.clean, accent: 'bg-brand-emerald', valueTone: 'text-brand-emerald' },
                    { label: 'Warnings', value: stats.warnings, accent: 'bg-amber-500', valueTone: 'text-amber-500' },
                    { label: 'Critical Gaps', value: stats.errors, accent: 'bg-red-500', valueTone: 'text-red-500' },
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

            <div className="space-y-5">
                {/* Progress Score & Fixes Context */}
                <div className="app-panel p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-brand-emerald" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-stone-900">{fixQueue.length} Fixes Added</p>
                            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Queued for permanent storage</p>
                        </div>
                    </div>

                    <div className="md:text-right flex flex-col md:items-end justify-center">
                        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Clean Score</p>
                        <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-brand-emerald"
                                    style={{ width: `${stats.total ? Math.round((stats.clean / stats.total) * 100) : 0}%` }}
                                />
                            </div>
                            <span className="text-sm font-black text-stone-900">{stats.total ? Math.round((stats.clean / stats.total) * 100) : 0}%</span>
                        </div>
                    </div>
                </div>

                {/* 2. Approval Card */}
                <div className="app-panel rounded-[32px] p-8 bg-white relative overflow-hidden group border-brand-emerald/20 shadow-sm hover:shadow-md transition-shadow">
                    <div className="absolute top-0 left-0 w-full h-full bg-brand-emerald/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                        <div className="space-y-4 flex-1">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                                    <ShieldCheck className="w-4 h-4 text-brand-emerald" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Approval Action</span>
                            </div>

                            <div>
                                <h3 className="text-2xl font-black tracking-tight text-stone-900 leading-tight">Approve & Save Review</h3>
                                <p className="text-xs font-medium text-stone-500 mt-2 leading-relaxed">
                                    Save the current review for this entity and GST period, then move to the export step.
                                </p>
                            </div>

                            <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs font-bold text-stone-700 cursor-pointer hover:border-brand-emerald transition-colors w-max">
                                <input
                                    type="checkbox"
                                    checked={isApproved}
                                    onChange={(event) => setIsApproved(event.target.checked)}
                                    disabled={isCommiting}
                                    className="rounded border-stone-300 text-brand-emerald focus:ring-brand-emerald"
                                />
                                I approve these GST review results for final export
                            </label>
                        </div>

                        <div className="flex flex-col gap-3 min-w-[240px]">
                            <button
                                onClick={handleCertify}
                                disabled={isCommiting || !isApproved}
                                className="app-button-primary h-14 w-full active:scale-95 disabled:opacity-50 justify-center"
                            >
                                {isCommiting ? (
                                    <Spinner size="sm" className="border-white border-t-white/25" />
                                ) : (
                                    <>
                                        Approve Review
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => navigate(-1)}
                                disabled={isCommiting}
                                className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-900 border border-stone-200 bg-white"
                            >
                                <ArrowLeft className="w-3 h-3" />
                                Back to Issue Review
                            </button>
                            
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-[10px] font-medium leading-relaxed mt-2"
                                >
                                    <p className="font-black uppercase mb-1">Error</p>
                                    {error}
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. Warning (Compliance Note) */}
                <div className="app-panel-subtle rounded-[24px] p-6 flex gap-4 border border-blue-100 bg-blue-50/60">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm border border-blue-100 shrink-0">
                        <Lock className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-1">GST Review Note</h4>
                        <p className="text-xs leading-relaxed text-blue-700/80 font-medium">
                            By approving this review, you confirm that the purchase register data and GST fixes are ready for final workbook generation for this GST period.
                        </p>
                    </div>
                </div>

                {/* 4. Review Details (Audit Log Context) */}
                <div className="app-panel space-y-4 p-8 bg-white">
                    <div className="flex items-center gap-2 mb-2">
                        <History className="w-4 h-4 text-stone-400" />
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Review Details</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Entity</div>
                            <div className="mt-2 text-sm font-black text-stone-900">{activeEntityId}</div>
                        </div>
                        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Period</div>
                            <div className="mt-2 text-sm font-black text-stone-900">{selectedPeriod}</div>
                        </div>
                        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Sign-off Status</div>
                            <div className={`mt-2 text-sm font-black ${isApproved ? 'text-brand-emerald' : 'text-amber-500'}`}>
                                {isApproved ? 'Ready to Save' : 'Pending Approval'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
