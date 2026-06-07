import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';
import {
   Target,
   AlertCircle,
   CheckCircle2,
   ArrowRight,
   ShieldCheck,
   TrendingDown,
   Activity,
   FileSpreadsheet
} from 'lucide-react';

export const ReconciliationSummary = () => {
   const { currentRunId, setCurrentRecoId, setActiveStep, uploaded2BFiles, selectedPeriod, selectedGSTIN } = useAppStore();
   const navigate = useNavigate();

   React.useEffect(() => {
      setActiveStep(2);
   }, [setActiveStep]);

   const [progress, setProgress] = useState(0);
   const [isProcessing, setIsProcessing] = useState(true);
   const [currentStatus, setCurrentStatus] = useState("Initializing Matcher...");
   const [summaryStats, setSummaryStats] = useState(null);
   const [canonicalSummary, setCanonicalSummary] = useState(null);
   const [fatalError, setFatalError] = useState(null);
   const pipelineTriggered = useRef(false);

   useEffect(() => {
      const startMatching = async () => {
         if (pipelineTriggered.current) return;
         pipelineTriggered.current = true;

         if (!uploaded2BFiles || uploaded2BFiles.length === 0 || !currentRunId) {
            setIsProcessing(false);
            setCurrentStatus("Books run and 2B files are both required before reconciliation.");
            setFatalError("Books handoff and at least one GSTR-2B file are required before the matcher can start.");
            return;
         }

         try {
            setFatalError(null);
            setProgress(15);
            setCurrentStatus("Uploading and canonicalizing 2B source...");
            const upload = await api.upload2BFiles(uploaded2BFiles, currentRunId, selectedGSTIN, selectedPeriod);
            setCurrentRecoId(upload.reco_id);

            setProgress(45);
            const canonical = await api.getRecoCanonical(upload.reco_id);
            setCanonicalSummary(canonical);
            setCurrentStatus("Canonical 2B snapshot ready. Starting matcher...");

            await api.runReconciliation(upload.reco_id, currentRunId);
            setProgress(70);

            let results = await api.getRecoResults(upload.reco_id);
            while (!results.results && results.status !== 'failed') {
               await new Promise((resolve) => setTimeout(resolve, 1000));
               results = await api.getRecoResults(upload.reco_id);
            }

            if (results.status === 'failed') {
               throw new Error('Reconciliation failed while processing 2B matches.');
            }

            const strictMatchCount = (results.results || []).filter((row) => row.match_status === 'MATCHED_STRICT').length;
            const relaxedMatchCount = (results.results || []).filter((row) => row.match_status === 'MATCHED_RELAXED').length;
            const matchedCount = strictMatchCount + relaxedMatchCount;

            setSummaryStats({
               total: results.total || 0,
               matchRate: results.total ? Math.round((matchedCount / results.total) * 100) : 0,
               perfectMatch: strictMatchCount,
               probableMatch: relaxedMatchCount,
               missing: (results.results || []).filter((row) => row.match_status !== 'MATCHED_STRICT' && row.match_status !== 'MATCHED_RELAXED').length
            });
            setProgress(100);
            setCurrentStatus("Reconciliation Complete");
            setIsProcessing(false);
         } catch (err) {
            console.error("Failed to start 2B pipeline", err);
            setIsProcessing(false);
            setCurrentStatus(err.message || "Failed to start reconciliation");
            setFatalError(err.message || "Failed to start reconciliation");
         }
      };

      startMatching();
   }, [uploaded2BFiles, selectedPeriod, selectedGSTIN, currentRunId, setCurrentRecoId]);

   const categories = [
      { label: 'Strict Matches', count: summaryStats?.perfectMatch || 0, color: 'emerald', percentage: summaryStats?.matchRate || 0 },
      { label: 'Relaxed Matches', count: summaryStats?.probableMatch || 0, color: 'amber', percentage: summaryStats?.total ? Math.round(((summaryStats?.probableMatch || 0) / summaryStats.total) * 100) : 0 },
      { label: 'Unmatched / Missing', count: summaryStats?.missing || 0, color: 'red', percentage: summaryStats?.total ? Math.round(((summaryStats?.missing || 0) / summaryStats.total) * 100) : 0 }
   ];

   const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

   const handleApply = () => {
      setActiveStep(3);
      navigate('/2b-reconciliation/results');
   };

   return (
      <div className="space-y-8 py-6">
         <header className="app-panel-hero p-8 md:p-10">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
               <div className="space-y-2">
                  <div className="flex items-center gap-2 text-brand-forest">
                     <ShieldCheck className="w-4 h-4" />
                     <span className="app-eyebrow text-brand-forest">Reconciliation Summary · Phase 3</span>
                  </div>
                  <h1 className="app-page-title">Analysis Ready</h1>
                  <p className="app-page-subtitle max-w-3xl">
                     Matching Engine <span className="font-mono text-sm text-brand-forest font-bold ml-1">v5.2-premium</span> results
                  </p>
               </div>
            </div>
         </header>

         {/* Categories List */}
         <div className="space-y-6">
               {fatalError && (
                  <div className="app-panel border border-red-200 bg-red-50/80 p-6">
                     <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
                        <div className="space-y-1">
                           <div className="text-sm font-black uppercase tracking-widest text-red-700">
                              Reconciliation failed
                           </div>
                           <p className="text-sm font-bold text-red-700">
                              {fatalError}
                           </p>
                           <p className="text-xs font-medium text-red-600">
                              Legacy GSTONE upload accepts portal files as `.json` or `.xlsx` only. If the file came from the portal in older `.xls` format, re-export it as `.xlsx` and upload again.
                           </p>
                        </div>
                     </div>
                  </div>
               )}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {categories.map((cat, idx) => (
                     <div key={idx} className="app-panel p-8 space-y-6 group hover:border-brand-emerald transition-all">
                        <div className="flex items-center justify-between">
                           <div className={`p-3 rounded-2xl ${cat.color === 'emerald' ? 'bg-brand-emerald/10 text-brand-emerald' :
                              cat.color === 'amber' ? 'bg-amber-50 text-amber-500' : 'bg-red-50 text-red-500'
                              }`}>
                              {cat.color === 'emerald' ? <CheckCircle2 className="w-6 h-6" /> :
                                 cat.color === 'amber' ? <Target className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                           </div>
                           <div className="text-right">
                              <div className="text-xs font-black text-stone-400 uppercase tracking-widest leading-none">{cat.percentage}% Yield</div>
                              <div className="text-2xl font-black text-stone-900">{cat.count}</div>
                           </div>
                        </div>

                        <div className="space-y-1">
                           <h4 className="text-lg font-bold text-stone-900 leading-tight">{cat.label}</h4>
                        </div>
                     </div>
                  ))}
               </div>
            </div>

         {/* Main Stats Bento */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Match Percentage Circle */}
            <div className="app-panel p-10 flex flex-col items-center justify-center text-center relative overflow-hidden h-full min-h-[340px]">
               {isProcessing ? (
                  <div className="space-y-6 flex flex-col items-center">
                     <div className="relative flex h-48 w-48 items-center justify-center rounded-full border-4 border-stone-100">
                        <Spinner size="xl" className="absolute h-24 w-24 border-[4px]" />
                        <span className="text-4xl font-black text-stone-900">{progress}%</span>
                     </div>
                     <div className="space-y-1">
                        <div className="flex items-center justify-center gap-2 text-brand-emerald font-black uppercase tracking-tighter text-[10px]">
                           <Spinner size="sm" />
                           Engine Active
                        </div>
                        <p className="text-xs font-bold text-stone-400 max-w-[240px]">{currentStatus}</p>
                     </div>
                  </div>
               ) : (
                  <>
                     <div className="relative w-56 h-56 mb-8 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90">
                           <circle cx="112" cy="112" r="100" fill="none" stroke="#f5f5f4" strokeWidth="16" />
                           <circle cx="112" cy="112" r="100" fill="none" stroke="#10b981" strokeWidth="16" strokeDasharray="628" strokeDashoffset={628 - (628 * (summaryStats?.matchRate || 0)) / 100} strokeLinecap="round" className="transition-all duration-1000" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-0">
                           <span className="text-5xl font-black text-stone-900">{summaryStats?.matchRate || 0}%</span>
                           <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Matched</span>
                        </div>
                     </div>

                     <div className="space-y-2 relative z-10">
                        <h4 className="text-xl font-bold text-stone-900">Overall Precision Score</h4>
                        <p className="text-xs text-stone-400 font-medium px-4">
                           Match results finalized for {selectedPeriod} period.
                        </p>
                     </div>
                  </>
               )}

               <div className="absolute bottom-0 right-0 w-32 h-32 bg-brand-emerald/5 rounded-full -mr-16 -mb-16" />
            </div>

            {/* GSTR-2B Canonical Snapshot */}
            {!isProcessing && canonicalSummary && (
               <div className="app-panel p-8 space-y-6 relative overflow-hidden h-full">
                  <div className="space-y-2 relative z-10">
                     <div className="flex items-center gap-2 text-brand-emerald text-[10px] font-black uppercase tracking-widest">
                        <FileSpreadsheet className="w-4 h-4" />
                        Source B
                     </div>
                     <h4 className="text-xl font-bold text-stone-900">GSTR-2B Snapshot</h4>
                     <p className="text-xs text-stone-500 font-medium leading-relaxed">
                        Parsed from portal files, standardized for the matching engine.
                     </p>
                  </div>
                  
                  <div className="relative z-10 space-y-4">
                     <div className="flex justify-between items-center pb-3 border-b border-stone-100">
                        <span className="text-xs font-bold text-stone-500">Total Invoices</span>
                        <span className="text-sm font-black text-stone-900">{canonicalSummary.invoice_count}</span>
                     </div>
                     <div className="flex justify-between items-center pb-3 border-b border-stone-100">
                        <span className="text-xs font-bold text-stone-500">Taxable Value</span>
                        <span className="text-sm font-mono font-bold text-stone-900">{formatCurrency(canonicalSummary.total_taxable_value)}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-stone-500">Total GST</span>
                        <span className="text-sm font-mono font-bold text-stone-900">{formatCurrency(canonicalSummary.total_gst)}</span>
                     </div>
                  </div>
                  
                  <div className="absolute top-0 right-0 w-32 h-32 border-4 border-stone-100 rounded-full -mr-16 -mt-16" />
               </div>
            )}
         </div>



            <footer className="flex flex-col gap-4 border-t border-stone-200 pt-6 lg:flex-row lg:items-center lg:justify-end mt-8">
               <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {!isProcessing && fatalError && (
                     <button
                        onClick={() => navigate('/2b-reconciliation')}
                        className="app-button-secondary bg-white"
                     >
                        Return to Upload
                     </button>
                  )}
                  <button
                     onClick={handleApply}
                     disabled={Boolean(fatalError) || isProcessing}
                     className="app-button-primary bg-brand-emerald hover:bg-brand-forest shadow-sm"
                  >
                     Review Results
                     <ArrowRight className="w-4 h-4" />
                  </button>
               </div>
            </footer>
      </div>
   );
};

