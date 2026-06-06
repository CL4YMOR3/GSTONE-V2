import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import {
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  LayoutGrid,
  MoreVertical,
  MinusCircle,
  Target,
  TrendingUp,
  ChevronRight
} from 'lucide-react';

export const MatchResults = () => {
  const { currentRecoId, setActiveStep } = useAppStore();
  const navigate = useNavigate();
  const [matches, setMatches] = React.useState([]);
  const [stats, setStats] = React.useState({
    total: 0,
    strict: 0,
    probable: 0,
    missing: 0,
    itcMatched: 0,
    itcAtRisk: 0
  });

  React.useEffect(() => {
    setActiveStep(3);
    const fetchResults = async () => {
      try {
        if (!currentRecoId) {
          setMatches([]);
          return;
        }

        const data = await api.getRecoResults(currentRecoId);
        const rows = data.results || [];
        setMatches(rows);

        // Compute stats
        const s = { total: rows.length, strict: 0, probable: 0, missing: 0, itcMatched: 0, itcAtRisk: 0 };
        rows.forEach(m => {
          if (m.match_status === 'MATCHED_STRICT') s.strict++;
          else if (m.match_status === 'MATCHED_RELAXED') s.probable++;
          else s.missing++;
        });
        setStats(s);
      } catch (err) {
        console.error("Failed to fetch matches", err);
      }
    };
    if (currentRecoId) {
      fetchResults();
    }
  }, [currentRecoId, setActiveStep]);

  const handleFinish = () => {
    setActiveStep(1);
    navigate('/');
  };

  return (
    <div className="space-y-8 py-6">
      <header className="app-panel-hero p-8 md:p-10">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-forest">
              <ShieldCheck className="w-4 h-4" />
              <span className="app-eyebrow text-brand-forest">Reconciliation Results · Phase 3</span>
            </div>
            <h1 className="app-page-title">Match Results</h1>
            <p className="app-page-subtitle max-w-3xl">
              Comparison of purchase register entries against dynamic portal snapshots.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start xl:self-auto">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input type="text" placeholder="Search GSTIN or Invoice..." className="pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-full text-xs font-bold outline-none focus:ring-1 focus:ring-brand-emerald min-w-[240px]" />
            </div>
            <button className="p-2 bg-stone-50 border border-stone-200 rounded-full text-stone-500 hover:text-stone-900 transition-all">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Filter Stats Bar */}
      <div className="grid grid-cols-4 gap-4 p-1 bg-stone-50 rounded-2xl border border-stone-100">
        {[
          { label: 'All Results', count: stats.total, active: true },
          { label: 'Strict Match', count: stats.strict },
          { label: 'Probable Match', count: stats.probable },
          { label: 'Missing / Discrepancy', count: stats.missing }
        ].map((tab, idx) => (
          <button key={idx} className={`flex items-center justify-between p-3 px-6 rounded-xl transition-all ${tab.active ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-700'
            }`}>
            <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
            <span className="text-sm font-black">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Dual Ledger Scroll List */}
      <div className="app-panel overflow-hidden">
        <div className="grid grid-cols-12 bg-stone-50/50 border-b border-stone-100 px-8 py-4 text-[10px] font-black text-stone-400 uppercase tracking-widest">
          <div className="col-span-1">ID</div>
          <div className="col-span-4">Purchase Register (Books)</div>
          <div className="col-span-1 flex justify-center"><ArrowRightLeft className="w-3.5 h-3.5" /></div>
          <div className="col-span-4">GSTR-2B (Portal)</div>
          <div className="col-span-2 text-right">Match Status</div>
        </div>

        <div className="divide-y divide-stone-50 max-h-[600px] overflow-y-auto">
          {matches.map((match, index) => (
            <div key={`${match.books_invoice_id}-${index}`} className="grid grid-cols-12 items-center px-8 py-6 hover:bg-stone-50/50 transition-colors group">
              <div className="col-span-1 text-[10px] font-mono font-bold text-stone-300">#{String(index + 1).padStart(3, '0')}</div>

              {/* Books Side */}
              <div className="col-span-4 flex items-center gap-4">
                <div className="w-px h-10 bg-stone-100" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-stone-900">{match.books_invoice_id || '---'}</div>
                  <div className="text-[10px] font-black text-stone-400 uppercase tracking-wider">{match.match_method || 'Matcher Result'}</div>
                </div>
              </div>

              {/* Match Icon */}
              <div className="col-span-1 flex justify-center">
                {match.match_status === 'MATCHED_STRICT' ? (
                  <div className="p-1.5 bg-brand-emerald/10 text-brand-emerald rounded-full ring-4 ring-brand-emerald/5"><CheckCircle2 className="w-4 h-4" /></div>
                ) : match.match_status === 'MATCHED_RELAXED' ? (
                  <div className="p-1.5 bg-amber-50 text-amber-500 rounded-full"><Target className="w-4 h-4" /></div>
                ) : (
                  <div className="p-1.5 bg-red-50 text-red-400 rounded-full"><MinusCircle className="w-4 h-4" /></div>
                )}
              </div>

              {/* Portal Side */}
              <div className="col-span-4 flex items-center gap-4">
                <div className="w-px h-10 bg-stone-100" />
                {match.matched_2b_invoice_id ? (
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-stone-900">{match.matched_2b_invoice_id}</div>
                    <div className="text-[10px] font-black text-stone-400 uppercase tracking-wider">{match.value_deltas?.length || 0} value deltas</div>
                  </div>
                ) : (
                  <div className="text-xs font-bold text-red-300 italic">No corresponding entry found</div>
                )}
              </div>

              {/* Status Badge */}
              <div className="col-span-2 flex items-center justify-end gap-3">
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${match.match_status === 'MATCHED_STRICT' ? 'bg-emerald-50 text-brand-forest' :
                  match.match_status === 'MATCHED_RELAXED' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                  }`}>
                  {match.match_status}
                </div>
                <button className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-300 transition-colors opacity-0 group-hover:opacity-100">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <footer className="flex items-center justify-between pt-6 border-t border-stone-100">
        <div className="flex items-center gap-4">
          <div className="bg-stone-50 border border-stone-100 px-4 py-2 rounded-xl flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-brand-emerald" />
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-900">Engine Locked</span>
          </div>
          <p className="text-[10px] font-medium text-stone-400 max-w-xs leading-relaxed">
            All matches generated using the Standard Compliance profile. Manual matches are documented in the audit trail.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleFinish}
            className="app-button-primary bg-brand-emerald hover:bg-brand-forest"
          >
            Approve Reconciliation
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
};
