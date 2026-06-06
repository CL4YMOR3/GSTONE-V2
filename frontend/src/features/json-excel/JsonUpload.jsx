import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import {
   FileJson,
   Settings2,
   CheckCircle2,
   ArrowRight,
   ShieldCheck,
   FileSpreadsheet,
   Zap,
   LayoutGrid,
   ChevronRight
} from 'lucide-react';

export const JsonUpload = () => {
   const { setActiveStep } = useAppStore();
   const navigate = useNavigate();

   React.useEffect(() => {
      setActiveStep(1);
   }, [setActiveStep]);

   const handleNext = () => {
      setActiveStep(2);
      navigate('/json-excel/preview');
   };

   return (
      <div className="space-y-10 py-6">
         <header className="flex items-end justify-between">
            <div className="space-y-2">
               <h2 className="text-4xl font-black text-stone-900 tracking-tight">JSON to Excel</h2>
               <p className="text-stone-500 font-medium italic">High-performance nested object flattening & export.</p>
            </div>
         </header>

         <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Main Drop Zone */}
            <div className="lg:col-span-3 space-y-6">
               <div className="bg-white border-2 border-dashed border-stone-200 rounded-brutalist p-16 flex flex-col items-center justify-center gap-6 group hover:border-brand-emerald hover:bg-stone-50 transition-all shadow-sm">
                  <div className="w-20 h-20 bg-stone-100 text-stone-400 rounded-3xl flex items-center justify-center group-hover:bg-brand-emerald group-hover:text-white transition-all shadow-lg">
                     <FileJson className="w-10 h-10" />
                  </div>
                  <div className="text-center space-y-2">
                     <h3 className="text-xl font-bold text-stone-900">Drop Portal Snapshots</h3>
                     <p className="text-sm text-stone-400 font-medium">Select multiple .json or .zip files for structure detection.</p>
                  </div>
                  <button className="bg-brand-emerald text-white px-10 py-4 rounded-pill font-black uppercase tracking-[0.2em] shadow-xl hover:bg-brand-forest transition-all">
                     Browse Local Storage
                  </button>
               </div>

               {/* Quick Actions Bento */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white border border-stone-200 rounded-brutalist p-8 text-stone-900 flex items-center justify-between relative overflow-hidden group shadow-sm ring-1 ring-stone-900/5">
                     <div className="space-y-2 relative z-10 text-left">
                        <div className="flex items-center gap-2 text-brand-emerald text-[10px] font-black uppercase tracking-widest">
                           <Zap className="w-4 h-4" />
                           Fast Ingest
                        </div>
                        <h4 className="text-lg font-black tracking-tight">Auto-Flatten Nested</h4>
                        <p className="text-stone-500 text-xs font-bold italic">Detect arrays and generate related sheets automatically.</p>
                     </div>
                     <div className="p-3 bg-stone-50 rounded-2xl group-hover:bg-brand-emerald group-hover:text-white transition-all text-stone-300">
                        <ChevronRight className="w-5 h-5" />
                     </div>
                     <div className="absolute top-0 right-0 w-32 h-32 bg-brand-emerald/5 rounded-full -mr-16 -mt-16" />
                  </div>

                  <div className="bg-white border border-stone-200 rounded-brutalist p-8 flex items-center justify-between group hover:border-brand-emerald transition-all shadow-sm">
                     <div className="space-y-2 text-left">
                        <div className="flex items-center gap-2 text-stone-400 text-[10px] font-black uppercase tracking-widest">
                           <LayoutGrid className="w-4 h-4" />
                           Standard
                        </div>
                        <h4 className="text-lg font-bold">GSTR-1 Official Format</h4>
                        <p className="text-xs text-stone-400 font-medium">Map JSON keys directly to GST portal import schema.</p>
                     </div>
                     <div className="p-3 bg-stone-50 rounded-2xl group-hover:bg-brand-emerald group-hover:text-white transition-all text-stone-300">
                        <CheckCircle2 className="w-5 h-5" />
                     </div>
                  </div>
               </div>
            </div>

            {/* Configuration Sidebar */}
            <div className="space-y-6">
               <div className="bg-white border border-stone-200 rounded-brutalist p-8 space-y-8 shadow-sm h-full">
                  <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                     <Settings2 className="w-4 h-4" />
                     Global Settings
                  </h4>

                  <div className="space-y-6">
                     <div className="space-y-3">
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-stone-900">Key Normalization</span>
                           <div className="w-10 h-5 bg-brand-emerald rounded-full relative p-1 cursor-pointer">
                              <div className="w-3 h-3 bg-white rounded-full absolute right-1" />
                           </div>
                        </div>
                        <p className="text-[10px] text-stone-400 font-medium leading-relaxed italic">Convert "PascalCase" or "snake_case" to "Readable Spaces" automatically.</p>
                     </div>

                     <div className="space-y-3">
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-stone-900">Date Formatting</span>
                           <select className="bg-stone-50 border-none text-[10px] font-bold text-stone-600 focus:ring-0 outline-none p-1 rounded">
                              <option>DD/MM/YYYY</option>
                              <option>YYYY-MM-DD</option>
                           </select>
                        </div>
                     </div>
                  </div>

                  <div className="pt-12 space-y-4">
                     <button
                        onClick={handleNext}
                        className="w-full bg-brand-emerald text-white py-4 rounded-pill font-black uppercase tracking-[0.2em] shadow-xl hover:bg-brand-forest hover:-translate-y-1 transition-all flex items-center justify-center gap-4"
                     >
                        Next Step
                        <ArrowRight className="w-5 h-5" />
                     </button>

                     <div className="flex items-center justify-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-stone-300" />
                        <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest">Local-only processing</span>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
};
