import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import {
  FolderTree,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  Zap,
  LayoutGrid,
  FileSpreadsheet,
  Settings,
  MoreHorizontal
} from 'lucide-react';

export const SchemaPreview = () => {
  const { setActiveStep } = useAppStore();
  const navigate = useNavigate();

  const [expanded, setExpanded] = useState(['root', 'invoices']);

  React.useEffect(() => {
    setActiveStep(2);
  }, [setActiveStep]);

  const schema = null;

  const handleExport = () => {
    setActiveStep(3);
    navigate('/json-excel/configure');
  };

  const renderTree = (node, depth = 0) => {
    const isExpanded = expanded.includes(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center gap-3 py-2 px-4 rounded-xl cursor-pointer hover:bg-stone-50 transition-colors group ${depth === 0 ? 'bg-stone-50/50' : ''
            }`}
          onClick={() => {
            if (hasChildren) {
              setExpanded(prev => isExpanded ? prev.filter(id => id !== node.id) : [...prev, node.id]);
            }
          }}
        >
          <div style={{ marginLeft: `${depth * 20}px` }} className="flex items-center gap-2">
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
            ) : <div className="w-3.5" />}

            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-brand-emerald" />
              <span className={`text-sm font-bold ${hasChildren ? 'text-stone-900' : 'text-stone-600'}`}>
                {node.name}
              </span>
              <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest px-2 py-0.5 bg-stone-100 rounded-md">
                {node.type}
              </span>
            </div>
          </div>

          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <Settings className="w-3.5 h-3.5 text-stone-300 hover:text-stone-900" />
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1">
            {node.children.map(child => renderTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-10 py-6">
      <header className="flex items-end justify-between">
        <div className="space-y-2">
          <h2 className="text-4xl font-black text-stone-900 tracking-tight">Preview Structure</h2>
          <p className="text-stone-500 font-medium italic">Detection active. Define flattening rules to prepare multi-sheet workbook generation.</p>
        </div>

        <div className="flex items-center gap-3">
          <button className="bg-stone-50 text-stone-600 px-6 py-2.5 rounded-full font-bold text-xs border border-stone-200 hover:bg-white transition-all">
            Save Template
          </button>
          <button
            onClick={handleExport}
            className="bg-brand-emerald text-white px-8 py-2.5 rounded-full font-bold text-xs shadow-lg hover:bg-brand-forest transition-all flex items-center gap-2"
          >
            Run Generation
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Tree View Container */}
        <div className="lg:col-span-3 bg-white border border-stone-200 rounded-brutalist p-8 shadow-sm h-full min-h-[500px]">
          <div className="flex items-center justify-between mb-8 border-b border-stone-100 pb-4">
            <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-brand-emerald" />
              JSON Schema Explorer
            </div>
            <div className="flex items-center gap-4">
              <button className="text-[10px] font-bold text-brand-forest uppercase tracking-widest">Select All</button>
              <button className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Clear Selection</button>
            </div>
          </div>

          <div className="space-y-1">
            {schema ? renderTree(schema) : (
              <div className="text-sm font-bold text-stone-400 italic py-10 text-center">No schema detected.</div>
            )}
          </div>
        </div>

        {/* Live Mapping Preview */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-stone-200 rounded-brutalist p-8 text-stone-900 space-y-8 flex flex-col relative overflow-hidden shadow-sm h-full ring-1 ring-stone-900/5">
            <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2 relative z-10">
              <FileSpreadsheet className="w-4 h-4 text-brand-emerald" />
              Flattening Logic Preview
            </h4>

            <div className="space-y-4 relative z-10">
              {[
                { source: 'invoices.inum', target: 'Inv Number', logic: 'Direct' },
                { source: 'invoices.val', target: 'Taxable Val', logic: 'Currency' },
                { source: 'invoices.items[*]', target: 'Items Sheet', logic: 'Pivot' }
              ].map((map, idx) => (
                <div key={idx} className="bg-stone-50 border border-stone-100 p-4 rounded-2xl space-y-2 hover:border-brand-emerald/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-brand-emerald font-black">{map.source}</span>
                    <ArrowRight className="w-3 h-3 text-stone-300" />
                    <span className="text-[10px] font-black text-stone-900 uppercase tracking-widest">{map.target}</span>
                  </div>
                  <div className="text-[9px] font-black text-stone-400 uppercase tracking-widest">{map.logic} Mapping Applied</div>
                </div>
              ))}

              <div className="pt-4 border-t border-stone-100 flex items-center justify-center">
                <button className="text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-brand-emerald transition-colors">
                  View All 18 Mappings
                </button>
              </div>
            </div>

            <div className="mt-auto p-4 bg-brand-emerald/5 border border-brand-emerald/10 rounded-2xl relative z-10">
              <div className="flex items-center gap-2 text-[10px] font-black text-brand-emerald uppercase tracking-widest mb-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Validation Pass
              </div>
              <p className="text-[10px] text-stone-500 font-bold leading-relaxed italic">
                "All required fields for GSTR-1 are selected. Ready for multi-sheet workbook generation."
              </p>
            </div>

            {/* Abstract Decoration */}
            <div className="absolute bottom-0 right-0 w-48 h-48 border border-stone-100 rounded-full -mr-24 -mb-24 opacity-50" />
          </div>
        </div>
      </div>
    </div>
  );
};
