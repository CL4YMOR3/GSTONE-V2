import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, 
  MapPin, 
  ArrowRight,
  TrendingUp,
  LayoutGrid,
  Hash,
  CheckCircle2
} from 'lucide-react';

export const ContextSelection = () => {
  const { entities, setActiveEntity, businessContext, setActiveStep } = useAppStore();
  const navigate = useNavigate();

  const handleSelect = (entity) => {
    setActiveEntity(entity.id);
    setActiveStep(3); // Moving to Context Setup
    navigate('/books-validation/setup');
  };

  return (
    <div className="relative min-h-[calc(100vh-128px)] py-8 px-6 overflow-hidden">
      {/* Page Hero Backdrop */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-linear-to-b from-stone-50 to-transparent -z-10" />

      <header className="mb-12 space-y-4 animate-in fade-in slide-in-from-left-4 duration-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-emerald/10 flex items-center justify-center text-brand-emerald shadow-inner">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-stone-900 tracking-tight">Select Business Context</h2>
            <p className="text-stone-500 font-medium">Choose the specific entity for this audit run.</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl">
        {entities.map((entity, idx) => {
          const isActive = businessContext === entity.name;
          
          return (
            <div 
              key={entity.id}
              className={`relative group bg-white border rounded-2xl p-8 transition-all duration-300 hover:shadow-xl active:scale-[0.99] cursor-pointer animate-in fade-in slide-in-from-bottom-6 ${
                isActive 
                  ? 'border-brand-emerald shadow-lg ring-4 ring-brand-emerald/5 shadow-brand-emerald/5' 
                  : 'border-stone-200 hover:border-brand-emerald/50'
              }`}
              style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'both' }}
              onClick={() => handleSelect(entity)}
            >
              {/* Left Active Indicator Bar */}
              <div className={`absolute top-0 left-0 bottom-0 w-1.5 rounded-l-2xl transition-all duration-500 ${
                isActive ? 'bg-brand-emerald' : 'bg-transparent group-hover:bg-stone-100'
              }`} />

              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-start justify-between mb-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-stone-400 uppercase">
                      <Hash className="w-3 h-3" />
                      {entity.id}
                    </div>
                    <h3 className="text-xl font-black text-stone-900 leading-tight">
                      {entity.name}
                    </h3>
                  </div>
                  {isActive && (
                    <div className="bg-brand-emerald rounded-full p-1 text-white shadow-md animate-in zoom-in duration-300">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <div className="space-y-4 mb-8">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Entity GSTIN</div>
                    <div className="flex items-center gap-2">
                       <span className="text-[14px] font-mono font-bold text-stone-700 bg-stone-50 px-2 py-1 rounded border border-stone-100 uppercase">{entity.gstin}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-stone-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold uppercase tracking-tight">{entity.location}</span>
                  </div>

                  <p className="text-stone-400 text-xs font-medium leading-relaxed italic">
                    "{entity.description}"
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 py-6 border-y border-stone-50 mt-auto">
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total Rows</div>
                    <div className="text-lg font-black text-stone-900 tabular-nums">{entity.records}</div>
                  </div>
                  <div className="space-y-0.5 text-right">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Pending Audit</div>
                    <div className="text-lg font-black text-brand-emerald tabular-nums">{entity.activeInvoices}</div>
                  </div>
                </div>

                <div className="pt-6">
                   <button className={`w-full flex items-center justify-between px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                     isActive 
                       ? 'bg-linear-to-r from-brand-forest to-brand-emerald text-white shadow-md hover:shadow-lg' 
                       : 'bg-stone-50 text-stone-600 hover:bg-brand-emerald hover:text-white group-hover:shadow-md'
                   }`}>
                     {isActive ? 'Continue Context' : 'Select Context'}
                     <ArrowRight className="w-4 h-4" />
                   </button>
                </div>
              </div>
              
              {/* Top Accent Gradient (Very subtle) */}
              <div className="absolute top-0 right-0 left-0 h-32 bg-linear-to-b from-brand-emerald/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-t-2xl" />
            </div>
          );
        })}

        {/* Create New Context Placeholder */}
        <button className="border-2 border-dashed border-stone-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 text-stone-300 hover:text-brand-emerald hover:border-brand-emerald hover:bg-brand-emerald/5 transition-all group animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 shadow-inner">
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform bg-white shadow-sm">
             <LayoutGrid className="w-6 h-6" />
          </div>
          <div className="text-center">
            <span className="block text-sm font-black uppercase tracking-widest">Register Entity</span>
            <span className="text-[10px] font-bold opacity-60 italic whitespace-nowrap">Add new GSTIN to scope</span>
          </div>
        </button>
      </div>
    </div>
  );
};
