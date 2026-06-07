import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import {
  FileCheck,
  ArrowRightLeft,
  FileJson,
  ArrowRight,
  ShieldCheck,
  Zap,
  ChevronRight,
  Sparkles
} from 'lucide-react';

export const HomeDashboard = () => {
  const navigate = useNavigate();
  const setActiveModule = useAppStore((state) => state.setActiveModule);
  const setActiveStep = useAppStore((state) => state.setActiveStep);

  useEffect(() => {
    setActiveModule(null);
    setActiveStep(1);
  }, [setActiveModule, setActiveStep]);

  const handleFeatureClick = (id) => {
    setActiveModule(id);
    navigate(`/${id}`);
  };

  const features = [
    {
      id: 'books-validation',
      title: 'Books Validation',
      description: 'Audit your purchase registers, validate GSTINs, and produce an audit-ready workbook.',
      icon: FileCheck,
      stats: 'Audit Ready',
      color: 'emerald',
      gradient: 'from-emerald-500 to-emerald-600'
    },
    {
      id: '2b-reconciliation',
      title: '2B Reconciliation',
      description: 'Match your books against GSTR-2B data with identity-first reconciliation logic.',
      icon: ArrowRightLeft,
      stats: 'Legacy-aligned',
      color: 'blue',
      gradient: 'from-blue-500 to-blue-600'
    },
    {
      id: 'json-excel',
      title: 'JSON → Excel',
      description: 'Convert raw GST portal JSON files into clean, professional formatted workbooks.',
      icon: FileJson,
      stats: 'GSTR-1, 2B, 3B ready',
      color: 'stone',
      gradient: 'from-stone-500 to-stone-600'
    }
  ];

  return (
    <div className="relative min-h-[calc(100vh-128px)] flex flex-col items-center justify-center py-12 px-6 overflow-hidden">
      {/* Premium Hero Backdrop */}
      <div className="absolute inset-0 bg-linear-to-b from-brand-emerald/5 via-stone-50/50 to-white -z-10" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.05)_0%,transparent_70%)] -z-10" />

      <div className="w-full max-w-5xl space-y-16">
        <header className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-stone-200 shadow-sm text-brand-forest text-[11px] font-black uppercase tracking-widest mx-auto">
            <Sparkles className="w-3.5 h-3.5 text-brand-emerald animate-pulse" />
            Institutional Precision v3.0
          </div>

          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-black text-stone-900 tracking-tight leading-[1.05]">
              Premium Efficiency. <br />
              <span className="bg-linear-to-r from-brand-forest to-brand-emerald bg-clip-text text-transparent italic">Absolute Accuracy.</span>
            </h1>
            <p className="text-lg text-stone-500 font-medium max-w-2xl mx-auto leading-relaxed">
              Select a core module to begin your compliance run. All processing
              is performed locally within your secure context.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10 p-2">
          {features.map((feature, idx) => (
            <button
              key={feature.id}
              onClick={() => handleFeatureClick(feature.id)}
              className="group flex flex-col text-left bg-white border border-stone-200 rounded-2xl p-8 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 hover:border-brand-emerald active:scale-[0.98] animate-in fade-in slide-in-from-bottom-8"
              style={{ animationDelay: `${idx * 150}ms`, animationFillMode: 'both' }}
            >
              {/* Card Accent Line */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-linear-to-r ${feature.gradient} rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity`} />

              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-8 transition-all duration-300 ${feature.id === 'books-validation' ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white' :
                feature.id === '2b-reconciliation' ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-500 group-hover:text-white' :
                  'bg-stone-100 text-stone-600 group-hover:bg-stone-600 group-hover:text-white'
                } shadow-inner`}>
                <feature.icon className="w-7 h-7" />
              </div>

              <div className="space-y-3 mb-10 flex-1">
                <h3 className="text-2xl font-black text-stone-900 flex items-center gap-2">
                  {feature.title}
                </h3>
                <p className="text-stone-500 text-[14px] font-medium leading-relaxed">
                  {feature.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-stone-100 mt-auto">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-black tracking-widest text-stone-300">Run Status</span>
                  <span className="text-[11px] font-bold text-stone-600 lowercase">{feature.stats}</span>
                </div>
                <div className="w-10 h-10 rounded-full border border-stone-100 flex items-center justify-center text-stone-400 group-hover:bg-brand-emerald group-hover:text-white group-hover:border-brand-emerald transition-all duration-300">
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="pt-8 flex justify-center">
          <div className="bg-white/50 backdrop-blur-sm border border-stone-200 rounded-full px-6 py-3 flex items-center gap-6 shadow-sm animate-in fade-in duration-1000 delay-500">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand-emerald" />
              <span className="text-xs font-bold text-stone-600 whitespace-nowrap">Local Context Processing Active</span>
            </div>
            <div className="w-px h-4 bg-stone-200" />
            <div className="flex items-center gap-4 text-xs font-bold text-stone-400">
              <span className="hover:text-brand-forest cursor-pointer transition-colors">Documentation</span>
              <span className="hover:text-brand-forest cursor-pointer transition-colors">Release Notes</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
