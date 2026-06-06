import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import {
   FileUp,
   ArrowRightLeft,
   CheckCircle2,
   AlertCircle,
   Database,
   Search,
   ArrowRight,
   ShieldCheck,
   TrendingUp,
   LayoutGrid,
   ChevronRight
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
         } catch (error) {
            console.debug('Unable to recover the latest books run for reconciliation.', error);
         } finally {
            setIsHydratingRun(false);
         }
      };

      hydrateRun();
   }, [activeEntityId, currentRunId, selectedPeriod, setCurrentRunId]);

   const handlePortalFileChange = (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
         setUploaded2BFiles(files);
      }
   };

   const handleReconcile = () => {
      if (uploaded2BFiles.length === 0 || !selectedGSTIN || !currentRunId) return;
      setActiveStep(2);
      navigate('/2b-reconciliation/summary');
   };

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
                     Upload your GSTR-2B JSON or Excel file from the portal to reconcile against your cleaned books.
                  </p>
               </div>
            </div>
         </header>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
            {/* Connector Icon */}
            <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white border-2 border-brand-emerald rounded-full items-center justify-center text-brand-emerald shadow-xl">
               <ArrowRightLeft className="w-6 h-6" />
            </div>

            {/* Source 1: Books */}
            <div className="space-y-4">
               <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest pl-4">Source A: Purchase Register (Database)</label>
               <div className={`app-panel p-10 flex flex-col items-center justify-center gap-4 transition-all hover:bg-stone-50 relative overflow-hidden ${currentRunId ? 'border-brand-emerald ring-1 ring-brand-emerald/20' : 'border-dashed'}`}>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-md ${currentRunId ? 'bg-brand-emerald text-white' : 'bg-stone-100 text-stone-400'}`}>
                     <Database className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                     <h4 className={`text-sm font-bold ${currentRunId ? 'text-stone-900' : 'text-stone-400'}`}>
                        {currentRunId ? 'Active Records' : 'No Records Found'}
                     </h4>
                     <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                        {currentRunId ? 'Synced from Local DB' : 'Upload Required'}
                     </p>
                  </div>
                  <button
                     onClick={() => navigate('/books-validation/upload')}
                     className="text-[10px] font-black uppercase tracking-widest text-brand-forest hover:text-black transition-colors"
                  >
                     {currentRunId ? 'Change Books Data' : 'Upload Books'}
                  </button>

                  {currentRunId && <div className="absolute bottom-0 right-0 w-24 h-24 bg-brand-emerald/5 rounded-full -mr-12 -mb-12" />}
               </div>
            </div>

            {/* Source 2: Portal */}
            <div className="space-y-4">
               <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest pl-4">Source B: GSTR-2B Data (Portal)</label>
               <label className={`app-panel p-10 flex flex-col items-center justify-center gap-4 transition-all hover:bg-stone-50 relative overflow-hidden cursor-pointer ${uploaded2BFiles.length > 0 ? 'border-brand-emerald ring-1 ring-brand-emerald/20' : 'border-dashed'
                  }`}>
                  <input type="file" multiple className="hidden" onChange={handlePortalFileChange} accept=".json,.xls,.xlsx" />
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${uploaded2BFiles.length > 0 ? 'bg-stone-900 text-brand-emerald shadow-xl' : 'bg-stone-100 text-stone-400'
                     }`}>
                     <LayoutGrid className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                     <h4 className="text-sm font-bold text-stone-900">{uploaded2BFiles.length > 0 ? `${uploaded2BFiles.length} file(s) selected` : 'Drop Portal Data (.json, .xls)'}</h4>
                     <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{uploaded2BFiles.length > 0 ? 'Files Ready' : 'No Files Selected'}</p>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-brand-forest hover:text-black transition-colors">
                     {uploaded2BFiles.length > 0 ? 'Change Source' : 'Upload Files'}
                  </div>

                  <div className="absolute top-0 right-0 w-24 h-24 bg-stone-50 rounded-full -mr-12 -mt-12" />
               </label>
            </div>
         </div>

         {/* Selection Bento */}
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
            <div className="app-panel p-8 relative overflow-hidden">
               <div className="space-y-4 relative z-10">
                  <div className="flex items-center gap-2 text-brand-emerald text-[10px] font-black uppercase tracking-widest">
                     <ShieldCheck className="w-3.5 h-3.5" />
                     Execution Context
                  </div>

                  <div className="space-y-4">
                     <div className="space-y-1">
                        <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Target Entity</label>
                        <select
                           value={selectedGSTIN}
                           onChange={(e) => setSelectedGSTIN(e.target.value)}
                           className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs font-bold text-stone-900 focus:ring-1 focus:ring-brand-emerald outline-none"
                        >
                           {entities.map(e => (
                              <option key={e.id} value={e.gstin}>{e.name} ({e.gstin})</option>
                           ))}
                        </select>
                     </div>

                     <div className="space-y-1">
                        <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Return Period</label>
                        <input
                           type="month"
                           value={selectedPeriod}
                           onChange={(e) => setSelectedPeriod(e.target.value)}
                           className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs font-bold text-stone-900 focus:ring-1 focus:ring-brand-emerald outline-none"
                        />
                     </div>
                  </div>
               </div>
               <div className="absolute top-0 right-0 w-48 h-48 bg-brand-emerald/5 rounded-full -mr-24 -mt-24" />
            </div>

            <div className="lg:col-span-2 app-panel p-8 flex items-center justify-between">
               <div className="flex-1">
                  <div className="grid grid-cols-2 gap-8">
                     <div className="space-y-1">
                        <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Selected Period</div>
                        <div className="text-xl font-black text-stone-900">{selectedPeriod}</div>
                     </div>
                     <div className="space-y-1">
                        <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Source Readiness</div>
                        <div className={`text-xl font-black ${uploaded2BFiles.length > 0 ? 'text-brand-emerald' : 'text-amber-500'}`}>
                           {uploaded2BFiles.length > 0 ? 'COMPLETE' : 'FILE REQUIRED'}
                        </div>
                        {isHydratingRun && (
                           <div className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                              Recovering latest books run...
                           </div>
                        )}
                     </div>
                  </div>
               </div>

               <button
                  disabled={uploaded2BFiles.length === 0 || !currentRunId}
                  onClick={handleReconcile}
                  className={`app-button-primary ${uploaded2BFiles.length > 0 && currentRunId
                     ? 'bg-brand-emerald hover:bg-brand-forest'
                     : 'bg-stone-100 text-stone-400 cursor-not-allowed opacity-50'
                     }`}
               >
                  {(!currentRunId) ? 'Books Required' : 'Run Matcher'}
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
