import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import {
  Settings2,
  Calendar,
  Target,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

export const ContextSetup = () => {
  const { businessContext, setActiveStep } = useAppStore();
  const navigate = useNavigate();

  const handleProceed = () => {
    setActiveStep(4);
    navigate('/books-validation/upload');
  };

  return (
    <div className="max-w-4xl space-y-12 py-6">
      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-emerald/10 text-brand-forest rounded-2xl">
            <Settings2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-stone-900 tracking-tight">Context Setup</h2>
            <p className="text-stone-500 text-sm font-medium">Configuring audit parameters for <span className="text-brand-forest font-bold">{businessContext}</span></p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Form Section */}
        <div className="space-y-8">
          <div className="space-y-6">
            {/* FY and Month Selectors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Financial Year</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <select className="w-full bg-white border border-stone-200 py-2.5 pl-10 pr-4 rounded-brutalist text-sm font-bold appearance-none focus:ring-1 focus:ring-brand-emerald outline-none transition-all">
                    <option>FY 2025-26</option>
                    <option>FY 2024-25</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Audit Month</label>
                <select className="w-full bg-white border border-stone-200 py-2.5 px-4 rounded-brutalist text-sm font-bold appearance-none focus:ring-1 focus:ring-brand-emerald outline-none transition-all">
                  <option>December 2025</option>
                  <option>November 2025</option>
                </select>
              </div>
            </div>

            {/* Match Strictness Selection */}
            <div className="space-y-4">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Reconciliation Strategy</label>
              <div className="space-y-3">
                <div className="p-4 bg-white border-2 border-brand-emerald rounded-2xl flex items-start gap-4 relative">
                  <div className="p-2 bg-brand-emerald text-white rounded-lg"><ShieldCheck className="w-5 h-5" /></div>
                  <div className="flex-1 space-y-1">
                    <h4 className="text-sm font-black text-stone-900">Standard Match (Recommended)</h4>
                    <p className="text-xs text-stone-500 leading-normal font-medium">Full identity match + date tolerance of 5 days. Best for regular monthly reconciliation.</p>
                  </div>
                  <div className="absolute top-2 right-2 bg-brand-emerald/10 text-brand-forest px-2 py-0.5 rounded-full text-[8px] font-black uppercase">Active</div>
                </div>
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex items-start gap-4 opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
                  <div className="p-2 bg-stone-200 text-stone-500 rounded-lg"><Target className="w-5 h-5" /></div>
                  <div className="flex-1 space-y-1">
                    <h4 className="text-sm font-black text-stone-700">Strict Match</h4>
                    <p className="text-xs text-stone-400 leading-normal font-medium">Exact value, date, and reference string comparison. No tolerance permitted.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Information/Guide Section */}
        <div className="space-y-6 flex flex-col h-full">
          <div className="bg-white border border-stone-200 rounded-brutalist p-8 text-stone-900 space-y-4 flex-1 flex flex-col justify-center relative overflow-hidden shadow-sm ring-1 ring-stone-900/5">
            <div className="space-y-3 relative z-10">
              <div className="flex items-center gap-2 text-brand-emerald text-[10px] font-black uppercase tracking-widest">
                <AlertCircle className="w-3.5 h-3.5" />
                Audit Compliance
              </div>
              <h4 className="text-xl font-black tracking-tight text-stone-900">Matching parameters are locked after first run</h4>
              <p className="text-stone-500 text-xs leading-relaxed font-bold italic">
                Ensuring matching consistency is critical for generating audit-ready reports. If you need to change strictness later, a new audit context must be created.
              </p>
              <button className="text-[10px] font-black text-stone-400 hover:text-brand-emerald transition-colors flex items-center gap-1 group uppercase tracking-widest">
                Learn more about matching logic <HelpCircle className="w-3 h-3 group-hover:scale-110 transition-transform" />
              </button>
            </div>

            {/* Abstract decorative graphic */}
            <div className="absolute bottom-0 right-0 w-32 h-32 border-8 border-brand-emerald/5 rounded-full -mr-16 -mb-16" />
          </div>

          <button
            onClick={handleProceed}
            className="w-full bg-brand-emerald text-white py-4 rounded-pill font-black uppercase tracking-[0.2em] shadow-xl hover:bg-brand-forest hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-3"
          >
            Initialize Audit Context
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
