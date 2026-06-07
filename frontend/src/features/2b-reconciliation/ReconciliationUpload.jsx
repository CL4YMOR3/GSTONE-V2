import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import {
   ArrowRightLeft,
   CheckCircle2,
   AlertCircle,
   ArrowRight,
   ShieldCheck,
   TrendingUp,
   LayoutGrid,
   ChevronRight,
   FileSpreadsheet,
   Upload,
   Link2
} from 'lucide-react';

export const ReconciliationUpload = () => {
   const {
      setActiveStep,
      uploaded2BFiles, setUploaded2BFiles,
      selectedPeriod, setSelectedPeriod,
      selectedGSTIN, setSelectedGSTIN,
      entities,
      activeEntityId,
      currentRunId,
      setCurrentRunId,
   } = useAppStore();
   const navigate = useNavigate();
   const [isHydratingRun, setIsHydratingRun] = React.useState(false);
   const [isUploadingWorkbook, setIsUploadingWorkbook] = React.useState(false);
   const [handoff, setHandoff] = React.useState(null);
   const [handoffMessage, setHandoffMessage] = React.useState(null);

   React.useEffect(() => {
      setActiveStep(1);
   }, [setActiveStep]);

   React.useEffect(() => {
      const hydrateRun = async () => {
         if (currentRunId || !activeEntityId || !selectedPeriod) {
            return;
         }

         setIsHydratingRun(true);
         try {
            const sandboxRun = await api.getLatestSandboxRun(activeEntityId, selectedPeriod);
            if (sandboxRun?.run_id) {
               setCurrentRunId(sandboxRun.run_id);
            }
            setHandoff(sandboxRun?.handoff || null);
         } catch (error) {
            console.debug('Unable to recover the latest books run for reconciliation.', error);
            setHandoff(null);
         } finally {
            setIsHydratingRun(false);
         }
      };

      hydrateRun();
   }, [activeEntityId, currentRunId, selectedPeriod, setCurrentRunId]);

   React.useEffect(() => {
      const loadHandoff = async () => {
         if (!currentRunId) {
            return;
         }

         try {
            const runStatus = await api.getRunStatus(currentRunId);
            setHandoff(runStatus?.handoff || null);
         } catch (error) {
            console.debug('Unable to load handoff status.', error);
         }
      };

      loadHandoff();
   }, [currentRunId]);

   const handlePortalFileChange = (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
         setUploaded2BFiles(files);
      }
   };

   const handleWorkbookUpload = async (e) => {
      const file = e.target.files?.[0];
      if (!file || !activeEntityId || !selectedPeriod) return;

      try {
         setIsUploadingWorkbook(true);
         setHandoffMessage(null);
         const result = await api.uploadBooksWorkbook(file, activeEntityId, selectedPeriod);
         setCurrentRunId(result.run_id);
         setHandoff({
            run_status: result.status,
            has_export: true,
            has_approved_export: true,
            has_uploaded_workbook: true,
            export_id: null,
            export_file_name: result.source_file,
            source: 'uploaded_workbook',
            ready_for_reconciliation: true,
         });
         setHandoffMessage(`Clean books workbook loaded: ${result.source_file} (${result.invoice_count} invoices).`);
      } catch (error) {
         setHandoffMessage(error.message || 'Failed to upload clean books workbook.');
      } finally {
         setIsUploadingWorkbook(false);
         e.target.value = '';
      }
   };

   const handleReconcile = () => {
      if (uploaded2BFiles.length === 0 || !selectedGSTIN || !currentRunId || !handoff?.ready_for_reconciliation) return;
      setActiveStep(2);
      navigate('/2b-reconciliation/summary');
   };

   const handoffReady = Boolean(handoff?.ready_for_reconciliation);
   const handoffSourceLabel = handoff?.source === 'uploaded_workbook'
      ? 'Uploaded clean books workbook'
      : handoff?.source === 'approved_export'
         ? 'Approved Phase 2 export'
         : 'No handoff available';

   return (
      <div className="space-y-8 py-6">
         <header className="app-panel-hero p-8 md:p-10">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
               <div className="space-y-2">
                  <div className="flex items-center gap-2 text-brand-forest">
                     <ShieldCheck className="w-4 h-4" />
                     <span className="app-eyebrow text-brand-forest">2B Reconciliation · Phase 3</span>
                  </div>
                  <h1 className="app-page-title">Dual-Source Ingestion</h1>
                  <p className="app-page-subtitle max-w-3xl">
                     Upload GSTR-2B portal files and connect them to either the approved Phase 2 export or a clean books workbook upload.
                  </p>
               </div>
            </div>
         </header>

         <div className={`app-panel p-6 border ${handoffReady ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
            <div className="flex items-start justify-between gap-6">
               <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                     <Link2 className={`w-3.5 h-3.5 ${handoffReady ? 'text-brand-emerald' : 'text-amber-500'}`} />
                     Approved Workbook Handoff
                  </div>
                  <div className="text-lg font-black text-stone-900">
                     {handoffReady ? 'Ready for GSTR-2B reconciliation' : 'Waiting for books handoff'}
                  </div>
                  <p className="text-xs font-medium text-stone-600 max-w-3xl">
                     {handoffReady
                        ? `${handoffSourceLabel}${handoff?.export_file_name ? `: ${handoff.export_file_name}` : ''}.`
                        : 'Approve the Phase 2 export or upload a clean books workbook below to establish the legacy handoff into 2B.'}
                  </p>
                  {handoffMessage && (
                     <p className={`text-xs font-bold ${handoffReady ? 'text-brand-emerald' : 'text-amber-600'}`}>
                        {handoffMessage}
                     </p>
                  )}
               </div>
               <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[520px]">
                  <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                     <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">Target Entity</div>
                     <select
                        value={selectedGSTIN}
                        onChange={(e) => setSelectedGSTIN(e.target.value)}
                        className="mt-2 w-full bg-transparent text-xs font-bold text-stone-900 outline-none"
                     >
                        {entities.map((entity) => (
                           <option key={entity.id} value={entity.gstin}>{entity.name} ({entity.gstin})</option>
                        ))}
                     </select>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                     <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">Return Period</div>
                     <input
                        type="month"
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="mt-2 w-full bg-transparent text-xs font-bold text-stone-900 outline-none"
                     />
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                     <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">Handoff Status</div>
                     <div className={`mt-2 text-xs font-black ${handoffReady ? 'text-brand-emerald' : 'text-amber-600'}`}>
                        {handoffReady ? 'READY' : isHydratingRun ? 'CHECKING...' : 'REQUIRED'}
                     </div>
                  </div>
               </div>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
            {/* Connector Icon */}
            <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white border-2 border-brand-emerald rounded-full items-center justify-center text-brand-emerald shadow-xl">
               <ArrowRightLeft className="w-6 h-6" />
            </div>

            {/* Source 1: Books */}
            <div className="space-y-4">
               <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest pl-4">Source A: Clean Books Handoff</label>
               <div className={`app-panel p-10 flex flex-col items-center justify-center gap-4 transition-all hover:bg-stone-50 relative overflow-hidden ${handoffReady ? 'border-brand-emerald ring-1 ring-brand-emerald/20' : 'border-dashed'}`}>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-md ${handoffReady ? 'bg-brand-emerald text-white' : 'bg-stone-100 text-stone-400'}`}>
                     <FileSpreadsheet className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                     <h4 className={`text-sm font-bold ${handoffReady ? 'text-stone-900' : 'text-stone-400'}`}>
                        {handoffReady ? 'Books Handoff Ready' : 'No Books Handoff'}
                     </h4>
                     <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                        {handoffReady ? handoffSourceLabel : 'Approve export or upload workbook'}
                     </p>
                  </div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-brand-forest hover:text-black transition-colors cursor-pointer">
                     <input
                        type="file"
                        className="hidden"
                        onChange={handleWorkbookUpload}
                        accept=".xlsx"
                     />
                     {isUploadingWorkbook ? 'Uploading Workbook...' : 'Upload Clean Books Workbook'}
                  </label>
                  <button
                     onClick={() => navigate('/books-validation/export')}
                     className="text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-black transition-colors"
                  >
                     Review Export Gate
                  </button>

                  {handoffReady && <div className="absolute bottom-0 right-0 w-24 h-24 bg-brand-emerald/5 rounded-full -mr-12 -mb-12" />}
               </div>
            </div>

            {/* Source 2: Portal */}
            <div className="space-y-4">
               <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest pl-4">Source B: GSTR-2B Data (Portal)</label>
               <label className={`app-panel p-10 flex flex-col items-center justify-center gap-4 transition-all hover:bg-stone-50 relative overflow-hidden cursor-pointer ${uploaded2BFiles.length > 0 ? 'border-brand-emerald ring-1 ring-brand-emerald/20' : 'border-dashed'
                  }`}>
                  <input type="file" multiple className="hidden" onChange={handlePortalFileChange} accept=".json,.xlsx" />
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${uploaded2BFiles.length > 0 ? 'bg-stone-900 text-brand-emerald shadow-xl' : 'bg-stone-100 text-stone-400'
                     }`}>
                     <LayoutGrid className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                     <h4 className="text-sm font-bold text-stone-900">{uploaded2BFiles.length > 0 ? `${uploaded2BFiles.length} file(s) selected` : 'Drop Portal Data (.json, .xlsx)'}</h4>
                     <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{uploaded2BFiles.length > 0 ? 'Files Ready' : 'No Files Selected'}</p>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-brand-forest hover:text-black transition-colors">
                     {uploaded2BFiles.length > 0 ? 'Change Source' : 'Upload Files'}
                  </div>

                  <div className="absolute top-0 right-0 w-24 h-24 bg-stone-50 rounded-full -mr-12 -mt-12" />
               </label>
            </div>
         </div>

         <div className="pt-4">
            <div className="app-panel p-8 flex items-center justify-between">
               <div className="flex-1">
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                     <div className="space-y-1">
                        <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Books Run</div>
                        <div className="text-xl font-black text-stone-900">{currentRunId || 'Not Linked'}</div>
                     </div>
                     <div className="space-y-1">
                        <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Portal Source</div>
                        <div className={`text-xl font-black ${uploaded2BFiles.length > 0 ? 'text-brand-emerald' : 'text-amber-500'}`}>
                           {uploaded2BFiles.length > 0 ? 'COMPLETE' : 'FILE REQUIRED'}
                        </div>
                        {isHydratingRun && (
                           <div className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                              Recovering latest books run...
                           </div>
                        )}
                     </div>
                     <div className="space-y-1">
                        <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Legacy Handoff</div>
                        <div className={`text-xl font-black ${handoffReady ? 'text-brand-emerald' : 'text-amber-500'}`}>
                           {handoffReady ? 'LOCKED' : 'PENDING'}
                        </div>
                     </div>
                  </div>
               </div>

               <button
                  disabled={uploaded2BFiles.length === 0 || !currentRunId || !handoffReady}
                  onClick={handleReconcile}
                  className={`app-button-primary ${uploaded2BFiles.length > 0 && currentRunId && handoffReady
                     ? 'bg-brand-emerald hover:bg-brand-forest'
                     : 'bg-stone-100 text-stone-400 cursor-not-allowed opacity-50'
                     }`}
               >
                  {!currentRunId ? 'Books Required' : !handoffReady ? 'Handoff Required' : 'Run Matcher'}
                  <ArrowRight className="w-4 h-4" />
               </button>
            </div>
         </div>

         <footer className="flex items-center justify-between text-[10px] font-bold text-stone-400 uppercase tracking-widest border-t border-stone-100 pt-8">
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5 text-brand-emerald" /> Matcher V5.2 Premium</div>
               <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald" /> Schema Compliant</div>
            </div>
            <div className="flex items-center gap-2 hover:text-stone-900 cursor-pointer transition-colors">
               Configure matching rules <ChevronRight className="w-3.5 h-3.5" />
            </div>
         </footer>
      </div>
   );
};
