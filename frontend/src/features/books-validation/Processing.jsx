import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, consumeSSEStream } from '../../services/api';
import { Spinner } from '../../components/Spinner';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Database,
  SearchCode,
  ArrowRight,
  Activity,
  AlertCircle
} from 'lucide-react';

export const Processing = () => {
  const {
    activeEntityId, selectedPeriod, setActiveStep, businessContext,
    uploadedBooksFiles, fixQueue, columnMappings, activeCompanyGSTINs,
    currentRunId, setCurrentRunId, setCurrentAuditResults, clearFixQueue
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [terminalLogs, setTerminalLogs] = useState([
    "Preparing your working files..."
  ]);
  const [pipelineSteps, setPipelineSteps] = useState([
    { title: 'Preparing', status: 'active', icon: Database, details: 'Waiting to start processing...' }
  ]);

  const pipelineTriggered = useRef(false);
  const logEndRef = useRef(null);
  const currentRunIdRef = useRef(currentRunId);

  useEffect(() => {
    currentRunIdRef.current = currentRunId;
  }, [currentRunId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  useEffect(() => {
    setActiveStep(3);

    const startPipeline = async () => {
      if (pipelineTriggered.current) return;
      pipelineTriggered.current = true;

      try {
        const hydrateCompletedRun = async (runId) => {
          if (!runId) {
            return false;
          }

          const [statusPayload, errorPayload, cleanPayload, warningPayload] = await Promise.all([
            api.getRunStatus(runId),
            api.getRunErrors(runId),
            api.getRunClean(runId),
            api.getRunWarnings(runId),
          ]);

          if (statusPayload.status !== 'complete') {
            return false;
          }

          setSummary(statusPayload.summary || null);
          setCurrentAuditResults({
            summary: statusPayload.summary || null,
            col_map: errorPayload.col_map || {},
            clean: cleanPayload.invoices || [],
            warnings: warningPayload.invoices || [],
            errors: [...(errorPayload.identity_errors || []), ...(errorPayload.aggregation_errors || [])],
          });
          setProgress(100);
          setError(null);
          return true;
        };

        setCurrentAuditResults({ summary: null, col_map: {}, clean: [], warnings: [], errors: [] });

        const fileObjs = uploadedBooksFiles.map(f => f.fileObj || f);
        const metadata = location.state?.metadata || uploadedBooksFiles.map(f => ({
          file_id: f.file_id,
          filename: f.name,
          garden: f.garden,
          sheet: f.selectedSheet,
          headerRow: f.headerRow || 1,
          mappings: columnMappings || []
        }));

        let requestPromise;
        if (location.state?.isReprocess && currentRunId) {
          // Reprocess even when fixQueue is empty — the user may be rerunning
          // with fixes that were submitted in a previous round (already on the backend).
          setTerminalLogs(prev => [...prev, `  🔧 REPROCESSING WITH ${fixQueue?.length || 0} NEW CHANGE(S)`]);
          requestPromise = api.triggerReprocess(currentRunId, fixQueue || []);
        } else if (fileObjs.length > 0) {
          requestPromise = api.triggerPipeline(fileObjs, metadata, activeEntityId, selectedPeriod, [], businessContext, activeCompanyGSTINs);
        } else {
          setError({ title: "Pipeline Failed", message: "No source files or reprocess payload available." });
          setIsComplete(true);
          setTerminalLogs(prev => [...prev, "❌ ERROR: No source files or reprocess payload available."]);
          return;
        }

        const res = await requestPromise;
        await consumeSSEStream(
          res,
          (data) => {
            if (typeof data.step === 'number' && typeof data.total === 'number' && data.total > 0) {
              setProgress(Math.round((data.step / data.total) * 100));
            }

            const time = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const logMsg = `[${time}] ${data.name || data.message || data.status}`;
            setTerminalLogs(prev => [...prev, logMsg]);

            if (data.run_id) {
              currentRunIdRef.current = data.run_id;
              setCurrentRunId(data.run_id);
              // Clear the local fix queue only after the backend has committed
              // the new RunSession — the new run_id is the confirmation signal.
              if (location.state?.isReprocess) {
                clearFixQueue();
              }
            }

            if (data.summary) {
              setSummary(data.summary);
              setCurrentAuditResults({
                ...useAppStore.getState().currentAuditResults,
                summary: data.summary
              });
            }

            if (data.results) {
              setCurrentAuditResults({
                ...data.results,
                summary: useAppStore.getState().currentAuditResults.summary || data.summary || summary
              });
            }

            setPipelineSteps(prev => {
              const newSteps = [...prev];
              if (newSteps.length > 0) {
                newSteps[newSteps.length - 1].status = 'completed';
              }
              const statusLower = data.status?.toLowerCase();

              if (statusLower === "error") {
                setIsComplete(true);
                setError({
                  title: "Pipeline Failed",
                  message: data.message || "An institutional anomaly occurred."
                });
              }
              newSteps.push({
                title: statusLower === "error" ? "Pipeline Failed" : (data.name || data.status),
                status: statusLower === "error" ? 'error' : 'active',
                icon: statusLower === "error" ? AlertTriangle : SearchCode,
                details: data.message || "Auditing datasets..."
              });
              return newSteps.slice(-4);
            });
          },
          async () => {
            console.error("Pipeline stream error");
            setTerminalLogs(prev => [...prev, "❌ CRITICAL ERROR: Stream connection lost. Recovering run state..."]);

            try {
              const recovered = await hydrateCompletedRun(currentRunIdRef.current);
              if (!recovered) {
                setError({ title: "Pipeline Failed", message: "Stream disconnected before the run completed." });
              }
            } catch (streamError) {
              console.error("Pipeline recovery failed", streamError);
              setError({ title: "Pipeline Failed", message: streamError.message || "Failed to recover pipeline state." });
            } finally {
              setIsComplete(true);
            }
          },
          async () => {
            try {
              await hydrateCompletedRun(currentRunIdRef.current);
            } catch (completionError) {
              console.error("Post-stream hydration failed", completionError);
              setTerminalLogs(prev => [...prev, `⚠️ RECOVERY WARNING: ${completionError.message}`]);
            }

            setProgress(100);
            setIsComplete(true);
            setPipelineSteps(prev => {
              const newSteps = [...prev];
              if (newSteps.length > 0) newSteps[newSteps.length - 1].status = 'completed';
              return newSteps;
            });
            setTerminalLogs(prev => [
              ...prev,
              "Done"
            ]);
          }
        );
      } catch (e) {
        console.error('Pipeline Error:', e);
        setTerminalLogs(prev => [...prev, `❌ ERROR: ${e.message}`]);
      }
    };

    startPipeline();
  }, [setActiveStep, uploadedBooksFiles, currentRunId, fixQueue, columnMappings, activeEntityId, selectedPeriod, businessContext, activeCompanyGSTINs, location.state, setCurrentRunId, setCurrentAuditResults, clearFixQueue]);

  const handleFinish = () => {
    setActiveStep(4);
    navigate('/books-validation/errors');
  };

  // Phases map to the real 8-step GSTONE pipeline:
  // Step 1: Column Detection, Step 2: GSTIN Extraction, Step 3: Identity Validation,
  // Step 4: Invoice Deduplication, Step 5: Value Aggregation,
  // Step 6: Correction Application, Step 7: Clean Segregation, Step 8: Workbook Export
  const phases = [
    { title: "Column Detection", desc: "Header & Schema Mapping", icon: ShieldCheck, steps: [1, 2] },
    { title: "Validation", desc: "Identity & Deduplication", icon: Activity, steps: [3, 4, 5] },
    { title: "Correction", desc: "Fix Application & Segregation", icon: Zap, steps: [6, 7] },
    { title: "Finalization", desc: "Audit Consolidation", icon: Database, steps: [8] }
  ];

  return (
    <div className="space-y-8 py-6">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2 text-brand-forest">
          <Database className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Processing</span>
        </div>
        <h2 className="text-4xl font-black text-stone-900 tracking-tight">
          {summary ? "Books Check Completed" : "Checking Purchase Register"}
        </h2>
        <p className="text-stone-500 font-medium">
          {location.state?.isReprocess
            ? 'Applying latest fixes and running GST checks.'
            : 'Review-ready checks running across GSTIN, invoice, duplicate, and tax fields.'}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[
          { label: "Clean Invoices", value: summary?.valid_invoices || 0, tone: 'bg-brand-emerald', valueTone: 'text-brand-emerald' },
          { label: "Audit Warnings", value: summary?.warning_invoice_count || 0, tone: 'bg-amber-500', valueTone: 'text-amber-600' },
          { label: "Identity Errors", value: summary?.identity_error_count || 0, tone: 'bg-red-500', valueTone: 'text-red-600' },
          { label: "Rows Checked", value: summary ? summary.original_rows : '---', tone: 'bg-stone-300', valueTone: 'text-stone-900' },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{item.label}</div>
              <div className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
            </div>
            <div className={`mt-3 text-4xl font-black tracking-tight ${item.valueTone}`}>
              {typeof item.value === 'number' ? <Counter value={item.value} /> : item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-stone-200 rounded-[32px] overflow-hidden shadow-sm">
        <div className="px-8 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/60">
          <div>
            <h2 className="text-lg font-black text-stone-900 tracking-tight">Processing</h2>
            <p className="text-[11px] font-medium text-stone-500">We are auditing your records and crunching the numbers. Please wait.</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-brand-emerald uppercase tracking-widest">{progress}% Completed</span>
            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isComplete ? 'bg-emerald-50 text-brand-forest' : 'bg-amber-50 text-amber-600'}`}>
              {isComplete ? 'Finished' : 'Running...'}
            </div>
          </div>
        </div>

        {error && (
          <div className="m-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            <div className="font-extrabold uppercase tracking-[0.14em] text-[11px] mb-1">Processing Error</div>
            {error.message || 'The books check could not be completed.'}
          </div>
        )}

        <div className="px-8 py-12 bg-white flex flex-col items-center justify-center">
          
          <div className="w-full max-w-3xl mb-8">
            <div className="flex items-center justify-between mb-3 px-1">
               <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                 {isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Activity className="w-3.5 h-3.5 text-blue-500 animate-pulse" />}
                 Pipeline Execution
               </span>
               <span className="text-sm font-black text-stone-700">{progress}%</span>
            </div>

            <div className="w-full bg-stone-100 rounded-full h-4 overflow-hidden relative shadow-inner p-0.5 border border-stone-200/50">
              <motion.div 
                className="absolute top-0.5 left-0.5 bottom-0.5 rounded-full bg-gradient-to-r from-blue-500 via-emerald-400 to-brand-emerald shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                initial={{ width: "0%" }}
                animate={{ width: `calc(${progress}% - 4px)` }}
                transition={{ ease: "easeInOut", duration: 0.5 }}
              >
                <motion.div 
                  className="absolute inset-0 opacity-20"
                  style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.4) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.4) 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }}
                  animate={{ backgroundPosition: ['0rem 0rem', '1rem 0rem'] }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                />
              </motion.div>
            </div>
          </div>
          
          <div className="h-10 w-full flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              {terminalLogs.length > 0 && (
                <motion.div
                  key={terminalLogs.length}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold shadow-sm flex items-center ${
                    terminalLogs[terminalLogs.length - 1].includes('ERROR') ? 'bg-red-50 text-red-600 border border-red-100' :
                    terminalLogs[terminalLogs.length - 1].includes('WARNING') ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    terminalLogs[terminalLogs.length - 1] === 'Done' ? 'bg-emerald-50 text-brand-emerald border border-emerald-100' :
                    'bg-blue-50 text-blue-600 border border-blue-100'
                  }`}
                >
                  {terminalLogs[terminalLogs.length - 1].replace(/^\[.*?\]\s*/, '')}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <footer className="flex flex-col gap-4 rounded-[28px] border border-stone-200 bg-white px-6 py-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="text-[11px] font-medium text-stone-500">
          {isComplete
            ? 'Next step: review issues, warnings, and clean invoices before approval.'
            : 'This may take a few minutes depending on file size and the number of invoices.'}
        </div>
        <div className="flex items-center gap-3">
          {!isComplete && (
            <button
              onClick={() => navigate('/books-validation/mapping')}
              className="px-6 py-3 rounded-2xl border border-stone-200 bg-white text-stone-700 text-xs font-black uppercase tracking-widest hover:border-brand-emerald hover:text-brand-forest transition-colors"
            >
              Back to Mapping
            </button>
          )}
          <button
            onClick={handleFinish}
            disabled={!isComplete}
            className="px-7 py-3 rounded-2xl bg-brand-forest text-white text-xs font-black uppercase tracking-widest hover:bg-brand-emerald transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Review Issues
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
};

const Counter = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = parseInt(value);
    if (isNaN(end)) return;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    let totalDuration = 1500;
    let increment = end / (totalDuration / 16);

    let timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setDisplayValue(end);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayValue.toLocaleString()}</span>;
};
