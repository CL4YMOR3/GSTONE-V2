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
   Activity
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
   const pipelineTriggered = useRef(false);

   useEffect(() => {
      const startMatching = async () => {
         if (pipelineTriggered.current) return;
         pipelineTriggered.current = true;

         if (!uploaded2BFiles || uploaded2BFiles.length === 0 || !currentRunId) {
            setIsProcessing(false);
            setCurrentStatus("Books run and 2B files are both required before reconciliation.");
            return;
         }

         try {
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

            setSummaryStats({
               matchRate: results.total ? Math.round(((results.results || []).filter((row) => row.match_status === 'MATCHED_STRICT').length / results.total) * 100) : 0,
               perfectMatch: (results.results || []).filter((row) => row.match_status === 'MATCHED_STRICT').length,
               probableMatch: (results.results || []).filter((row) => row.match_status === 'MATCHED_RELAXED').length,
               missing: (results.results || []).filter((row) => row.match_status !== 'MATCHED_STRICT' && row.match_status !== 'MATCHED_RELAXED').length
            });
            setProgress(100);
            setCurrentStatus("Reconciliation Complete");
            setIsProcessing(false);
         } catch (err) {
            console.error("Failed to start 2B pipeline", err);
            setIsProcessing(false);
            setCurrentStatus(err.message || "Failed to start reconciliation");
         }
      };

      startMatching();
   }, [uploaded2BFiles, selectedPeriod, selectedGSTIN, currentRunId, setCurrentRecoId]);

   const categories = [
      { label: 'Perfect Match', count: summaryStats?.perfectMatch || 0, value: '₹---', color: 'emerald', percentage: summaryStats?.matchRate || 0 },
      { label: 'Probable Match', count: summaryStats?.probableMatch || 0, value: '₹---', color: 'amber', percentage: 0 },
      { label: 'Missing in Portal', count: summaryStats?.missing || 0, value: '₹---', color: 'red', percentage: 0 }
   ];

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

               <div className="flex items-center gap-3 self-start xl:self-auto">
                  <button
                     onClick={handleApply}
                     className="app-button-primary bg-brand-emerald hover:bg-brand-forest"
                  >
                     Review Results
                     <ArrowRight className="w-4 h-4" />
                  </button>
               </div>
            </div>
         </header>

         {/* Main Stats Bento */}
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Match Percentage Circle */}
            <div className="app-panel p-10 flex flex-col items-center justify-center text-center relative overflow-hidden h-full min-h-[400px]">
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
                           {canonicalSummary && ` ${canonicalSummary.invoice_count} canonical portal invoices staged.`}
                        </p>
                     </div>
                  </>
               )}

               <div className="absolute bottom-0 right-0 w-32 h-32 bg-brand-emerald/5 rounded-full -mr-16 -mb-16" />
            </div>

            {/* Categories List */}
            <div className="lg:col-span-2 space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {categories.map((cat, idx) => (
                     <div key={idx} className="app-panel p-8 space-y-6 group hover:border-brand-emerald transition-all cursor-pointer">
                        <div className="flex items-center justify-between">
                           <div className={`p-3 rounded-2xl ${cat.color === 'emerald' ? 'bg-brand-emerald/10 text-brand-emerald' :
                              cat.color === 'amber' ? 'bg-amber-50 text-amber-500' : 'bg-red-50 text-red-500'
                              }`}>
                              {cat.color === 'emerald' ? <CheckCircle2 className="w-6 h-6" /> :
                                 cat.color === 'amber' ? <Target className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                           </div>
                           <div className="text-right">
                              <div className="text-xs font-black text-stone-400 uppercase tracking-widest leading-none">{cat.percentage}% Ratio</div>
                              <div className="text-2xl font-black text-stone-900">{cat.count}</div>
                           </div>
                        </div>

                        <div className="space-y-1">
                           <h4 className="text-lg font-bold text-stone-900 leading-tight">{cat.label}</h4>
                           <p className="text-sm font-black text-stone-400 font-mono tracking-tight">Value Impact: <span className="text-stone-700 ml-1">{cat.value}</span></p>
                        </div>

                        <button className="w-full py-2 bg-stone-50 border border-stone-100 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 group-hover:bg-brand-emerald group-hover:text-white group-hover:border-brand-emerald transition-all">
                           Review Items
                        </button>
                     </div>
                  ))}

                  {/* Action/Insight Card */}
                  <div className="app-panel p-8 space-y-6 flex flex-col justify-center relative overflow-hidden ring-1 ring-stone-900/5">
                     <div className="space-y-2 relative z-10">
                        <div className="flex items-center gap-2 text-brand-emerald text-[10px] font-black uppercase tracking-widest">
                           <ShieldCheck className="w-4 h-4" />
                           Risk Profile
                        </div>
                        <h4 className="text-xl font-black italic tracking-tight">Analysis Ready</h4>
                        <p className="text-stone-500 text-xs leading-relaxed font-bold italic">Reconciliation process completed. Review categorical matches to finalise the audit trail.</p>
                     </div>
                     <div className="relative z-10 p-3 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-between">
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Matcher Efficiency</span>
                        <TrendingDown className="w-4 h-4 text-brand-emerald" />
                     </div>

                     <div className="absolute top-0 right-0 w-32 h-32 border-4 border-brand-emerald/5 rounded-full -mr-16 -mt-16" />
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
};
