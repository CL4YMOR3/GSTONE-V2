import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';
import {
   FileCheck2,
   Download,
   ArrowRight,
   FileSpreadsheet,
   History,
   Lock,
   Globe,
   Settings,
   Mail,
   Zap
} from 'lucide-react';

export const Export = () => {
   const {
      currentRunId,
      currentExportId,
      currentExportApproved,
      setCurrentExportId,
      setCurrentExportApproved,
      setActiveStep,
      businessContext,
      currentAuditResults,
      resetPipeline
   } = useAppStore();
   const navigate = useNavigate();
   const [isGenerating, setIsGenerating] = React.useState(false);
   const [isApproving, setIsApproving] = React.useState(false);
   const [message, setMessage] = React.useState(null);
   const [exportMeta, setExportMeta] = React.useState(null);

   React.useEffect(() => {
      setActiveStep(7);
   }, [setActiveStep]);

   const auditRecordCount = (currentAuditResults.clean?.length || 0) + (currentAuditResults.warnings?.length || 0) + (currentAuditResults.errors?.length || 0);
   const hasExportableRun = Boolean(currentRunId && currentAuditResults?.summary);

   const handleFinish = () => {
      resetPipeline();
      navigate('/');
   };

   const ensureExport = async () => {
      if (currentExportId) {
         return currentExportId;
      }
      if (!currentRunId) {
         throw new Error('No completed run is available for export.');
      }

      setIsGenerating(true);
      try {
         const exportData = await api.createExport(currentRunId);
         setCurrentExportId(exportData.export_id);
         setCurrentExportApproved(false);
         setExportMeta(exportData);
         setMessage(`Workbook prepared: ${exportData.file_name}`);
         return exportData.export_id;
      } finally {
         setIsGenerating(false);
      }
   };

   const handleDownload = async () => {
      try {
         const exportId = await ensureExport();
         const downloadedName = await api.downloadExport(exportId, exportMeta?.file_name);
         setMessage(`Workbook downloaded: ${downloadedName}`);
      } catch (error) {
         setMessage(error.message || 'Failed to generate workbook.');
      }
   };

   const handleApprove = async () => {
      try {
         const exportId = await ensureExport();
         setIsApproving(true);
         await api.approveExport(exportId);
         setCurrentExportApproved(true);
         setMessage('Certified workbook approved and locked.');
      } catch (error) {
         setMessage(error.message || 'Failed to approve workbook.');
      } finally {
         setIsApproving(false);
      }
   };

   if (!hasExportableRun) {
      return (
         <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-stone-400">
            <FileSpreadsheet className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-black uppercase tracking-widest">No approved review is ready for export</p>
            <button
               onClick={() => navigate('/books-validation/certification')}
               className="mt-6 text-brand-emerald font-bold uppercase text-[10px] tracking-widest hover:underline"
            >
               Return to Certification
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
                     <FileCheck2 className="h-4 w-4" />
                     <span className="app-eyebrow text-brand-forest">Export Workbook · Step 7</span>
                  </div>
                  <h1 className="app-page-title">Finalize & Download</h1>
                  <p className="app-page-subtitle max-w-3xl">
                     Your purchase register review is complete for <span className="font-black italic text-brand-forest">{businessContext || "Assam Gardens (HQ)"}</span>. Download the certified workbook.
                  </p>
               </div>
               
               <div className="flex items-center gap-3 self-start xl:self-auto">
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Compliance</span>
                  {currentExportApproved ? (
                     <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1.5 text-brand-emerald">
                        <Lock className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Locked</span>
                     </div>
                  ) : (
                     <div className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-3 py-1.5 text-amber-500">
                        <Lock className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Pending</span>
                     </div>
                  )}
               </div>
            </div>
         </header>

         {/* KPI Grid */}
         <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
               { label: 'Completion', value: '100%', accent: 'bg-brand-emerald', valueTone: 'text-brand-emerald' },
               { label: 'Exported Records', value: auditRecordCount, accent: 'bg-stone-300', valueTone: 'text-stone-900' },
               { label: 'Sign-off Status', value: currentExportApproved ? 'Approved' : 'Pending', accent: currentExportApproved ? 'bg-brand-emerald' : 'bg-amber-500', valueTone: currentExportApproved ? 'text-brand-emerald' : 'text-amber-500' },
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

         {/* Content Area */}
         <div className="space-y-5">
            <div className="space-y-5">
               
               {/* Primary Download Card */}
               <div className="app-panel relative flex flex-col justify-between overflow-hidden p-8 group">
                  <div className="space-y-6 relative z-10">
                     <div className="flex items-center justify-between">
                        <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                           <FileSpreadsheet className="w-8 h-8 text-brand-emerald" />
                        </div>
                        <span className="text-[10px] font-black text-brand-emerald bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full uppercase tracking-widest">Ready to Download</span>
                     </div>
                     <div className="space-y-2">
                        <h4 className="text-2xl font-black text-stone-900 tracking-tight">Final GST Workbook</h4>
                        <p className="text-sm text-stone-400 font-medium leading-relaxed">Includes cleaned data, issue summary, and export-ready sheets.</p>
                     </div>
                     <div className="space-y-1 mt-6">
                        <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest">File Name</div>
                        <div className="text-xl font-black text-stone-900 italic break-words">{exportMeta?.file_name || 'Ready on demand'}</div>
                     </div>
                  </div>

                  <div className="pt-8 space-y-4 relative z-10">
                     <button
                        onClick={handleDownload}
                        disabled={isGenerating || isApproving}
                        className="app-button-primary w-full py-5"
                     >
                        {isGenerating ? <Spinner size="sm" className="border-white border-t-white/25" /> : <Download className="w-5 h-5 text-white" />}
                        {isGenerating ? 'Preparing Workbook' : 'Download Workbook'}
                     </button>
                     <button
                        onClick={handleApprove}
                        disabled={isApproving || isGenerating}
                        className="app-button-secondary w-full py-4 disabled:opacity-50"
                     >
                        {isApproving ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Approving...</span> : (currentExportApproved ? 'Export Approved' : currentExportId ? 'Approve & Lock Export' : 'Prepare and Approve')}
                     </button>
                     <p className="text-center text-[9px] font-bold text-stone-300 uppercase tracking-tighter">Workbook downloads from the saved review</p>
                     {message && <p className="text-center text-[10px] font-bold text-stone-500">{message}</p>}
                  </div>

                  {/* Abstract Line */}
                  <div className="absolute top-0 right-0 w-32 h-1 bg-brand-emerald/10 transform rotate-45 translate-x-12 -translate-y-4" />
               </div>

               {/* Right Side Options */}
               <div className="flex flex-col gap-5">
                  <div className="app-panel-subtle space-y-4 p-8">
                     <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-brand-emerald" />
                        File Details
                     </h4>
                     <div className="space-y-4">
                        <div className="flex justify-between items-center pb-3 border-b border-stone-100">
                           <span className="text-xs font-bold text-stone-400">File Size</span>
                           <span className="text-xl font-black italic text-stone-900">{exportMeta?.file_size_bytes ? `${(exportMeta.file_size_bytes / 1024).toFixed(1)} KB` : 'Generated on demand'}</span>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-stone-100">
                           <span className="text-xs font-bold text-stone-400">Security</span>
                           <span className="text-xl font-black text-brand-emerald">Ready for Download</span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-xs font-bold text-stone-400">Records</span>
                           <span className="text-xl font-black italic text-stone-900">{auditRecordCount}</span>
                        </div>
                     </div>
                  </div>


               </div>

            </div>

            {/* Footer */}
            <footer className="app-panel flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
               <div className="text-[11px] font-medium text-stone-500">
                  Books Validation is complete. You can now proceed to GSTR-2B Reconciliation.
               </div>
               <div className="flex flex-col sm:flex-row gap-3">
                  <button
                     onClick={handleFinish}
                     className="app-button-secondary border-2 px-8 py-3.5 text-stone-500 hover:border-stone-900 hover:text-stone-900"
                  >
                     Return to Dashboard
                  </button>
                  <button
                     onClick={() => {
                        navigate('/2b-reconciliation');
                     }}
                     disabled={!currentExportApproved}
                     title={!currentExportApproved ? 'Approve the exported workbook to unlock GSTR-2B reconciliation.' : undefined}
                     className={`px-8 py-3.5 group ${currentExportApproved ? 'app-button-primary' : 'app-button-primary opacity-50 cursor-not-allowed'}`}
                  >
                     Proceed to 2B Reconciliation
                     <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
               </div>
            </footer>
         </div>
      </div>
   );
};
