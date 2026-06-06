import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import {
   FileCheck2,
   Download,
   CheckCircle2,
   ArrowRight,
   ShieldCheck,
   FileSpreadsheet,
   Share2,
   ExternalLink,
   Zap
} from 'lucide-react';

export const JsonExport = () => {
   const { setActiveStep } = useAppStore();
   const navigate = useNavigate();

   React.useEffect(() => {
      setActiveStep(4);
   }, [setActiveStep]);

   const handleFinish = () => {
      setActiveStep(1);
      navigate('/');
   };

   return (
      <div className="space-y-10 py-6 max-w-5xl mx-auto">
         <header className="text-center space-y-4">
            <div className="inline-flex p-4 bg-brand-emerald/10 text-brand-forest rounded-3xl shadow-lg border border-brand-emerald/20 animate-in zoom-in-50 duration-500">
               <Zap className="w-12 h-12" />
            </div>
            <div className="space-y-2">
               <h2 className="text-5xl font-black text-stone-900 tracking-tight">Export Ready</h2>
               <p className="text-stone-500 font-medium text-lg">Your flat JSON schema has been successfully mapped to <span className="text-brand-forest font-bold">GSTR-1 Master</span>.</p>
            </div>
         </header>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            {/* Main Export Action Card */}
            <div className="bg-white border-2 border-brand-emerald rounded-brutalist p-10 flex flex-col items-center justify-center text-center space-y-6 relative shadow-xl">
               <div className="p-5 bg-brand-emerald text-white rounded-full shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                  <FileSpreadsheet className="w-10 h-10" />
               </div>

               <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-stone-900 tracking-tight">Download GSTR-1 Excel</h3>
                  <p className="text-sm text-stone-400 font-medium italic">Flat workbook generated from dynamic JSON source.</p>
               </div>

               <button className="w-full bg-brand-emerald text-white py-4 rounded-pill font-black uppercase tracking-[0.2em] shadow-xl hover:bg-brand-forest hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-3">
                  <Download className="w-5 h-5" />
                  Download .XLSX
               </button>

               <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-stone-400">
                  <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-brand-emerald" /> Auto-Healed: ---</div>
                  <div className="w-1 h-1 bg-stone-200 rounded-full" />
                  <div className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-brand-emerald" /> Validated: Yes</div>
               </div>
            </div>

            {/* Transformation Insights */}
            <div className="space-y-6">
               <div className="bg-white border border-stone-200 rounded-brutalist p-8 text-stone-900 space-y-6 shadow-sm relative overflow-hidden h-full ring-1 ring-stone-900/5">
                  <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                     <Zap className="w-4 h-4 text-brand-emerald" />
                     Transformation Report
                  </h4>

                  <div className="space-y-4">
                     {[
                        { label: 'Hierarchy Flattened', value: '---', color: 'brand-emerald' },
                        { label: 'Columns Generated', value: '0 Items', color: 'amber-500' },
                        { label: 'Mapping Confidence', value: '0.0%', color: 'stone-900' }
                     ].map((item, idx) => (
                        <div key={idx} className="flex justify-between items-end border-b border-stone-100 pb-3">
                           <span className="text-xs font-bold text-stone-400">{item.label}</span>
                           <span className={`text-xl font-black text-${item.color}`}>{item.value}</span>
                        </div>
                     ))}
                  </div>

                  <div className="pt-4 space-y-3">
                     <button className="w-full flex items-center justify-between p-3 bg-stone-50 border border-stone-200 hover:bg-stone-100 rounded-xl transition-all group">
                        <span className="text-xs font-bold text-stone-600">View Transformation Logic</span>
                        <ExternalLink className="w-4 h-4 text-stone-400 group-hover:text-brand-emerald" />
                     </button>
                     <button className="w-full flex items-center justify-between p-3 bg-stone-50 border border-stone-200 hover:bg-stone-100 rounded-xl transition-all group">
                        <span className="text-xs font-bold text-stone-600">Copy JSON Mapping Profile</span>
                        <Share2 className="w-4 h-4 text-stone-400 group-hover:text-brand-emerald" />
                     </button>
                  </div>
               </div>
            </div>
         </div>

         <div className="flex flex-col items-center gap-6 pt-12">
            <button
               onClick={handleFinish}
               className="text-stone-400 hover:text-stone-900 font-bold text-sm transition-colors flex items-center gap-2 group"
            >
               New Conversion Project <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="flex items-center gap-3 text-stone-300">
               <ShieldCheck className="w-5 h-5" />
               <div className="text-[10px] font-black uppercase tracking-widest">Premium Converter Active since Dec 2025</div>
            </div>
         </div>
      </div>
   );
};
