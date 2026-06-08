import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Building2,
  FileText,
  Repeat,
  FileJson,
  Home,
  FileCheck2,
  BarChart3,
  Tags,
  Search,
  Calendar,
  Mail,
  History,
  Users,
  Settings,
  Lock,
  Settings2,
  BookOpenText
} from 'lucide-react';

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    activeModule,
    activeStep,
    businessContext,
    setActiveModule,
    entities,
    activeEntityId
  } = useAppStore();

  const handleModuleClick = (moduleId, isLocked) => {
    if (isLocked) return;
    setActiveModule(moduleId);
    navigate(`/${moduleId}`);
  };

  const modules = [
    { id: 'books-validation', name: 'Books Validation', icon: FileText, live: true },
    { id: '2b-reconciliation', name: '2B Reconciliation', icon: Repeat, live: true },
    { id: 'json-excel', name: 'JSON → Excel', icon: FileJson, live: true },
    { id: 'gstr1-validator', name: 'GSTR-1 Validator', icon: FileCheck2, live: false },
    { id: 'gstr3b-reconciler', name: 'GSTR-3B Reconciler', icon: BarChart3, live: false },
    { id: 'itc-tracker', name: 'ITC Tracker', icon: Tags, live: false },
    { id: 'e-invoice-validator', name: 'E-Invoice Validator', icon: FileText, live: false },
    { id: 'bulk-lookup', name: 'GSTIN Bulk Lookup', icon: Search, live: false },
    { id: 'annual-return', name: 'Annual Return Prep', icon: Calendar, live: false },
    { id: 'notice-manager', name: 'Notice Manager', icon: Mail, live: false },
  ];

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-[280px] flex-col overflow-hidden border-r border-[rgba(191,211,195,0.72)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(244,248,244,0.98)_100%)] shadow-[8px_0_32px_-24px_rgba(18,56,40,0.3)]">
      <div className="m-4 rounded-[26px] bg-linear-to-br from-brand-forest to-brand-emerald p-5 text-white shadow-[0_20px_34px_-22px_rgba(16,185,129,0.75)]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/18 text-sm font-extrabold ring-1 ring-white/20">G1</div>
          <div>
            <div className="text-[15px] font-extrabold tracking-[-0.03em]">GST ONE</div>
            <div className="text-[11px] font-medium text-emerald-50/85">All in one GST Solutions</div>
          </div>
        </div>
      </div>

      <div className="mx-4 mb-5">
        <div className="flex w-full items-center justify-between rounded-[22px] border border-[rgba(191,211,195,0.72)] bg-[rgba(247,250,247,0.95)] p-3.5 shadow-[0_12px_24px_-24px_rgba(18,56,40,0.4)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]" />
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--color-app-ink-muted)]">Business</div>
              <span className="block truncate text-[13px] font-semibold text-[var(--color-app-ink-strong)]">{businessContext}</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/settings/entities')}
            className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--color-app-ink-muted)] transition-colors hover:text-[var(--color-app-ink-strong)]"
          >
            Edit
          </button>
        </div>
      </div>

      <nav className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex min-h-full flex-col gap-1.5">
          <Link
            to="/"
            className={`flex w-full items-center justify-between rounded-[18px] px-3.5 py-3 transition-all duration-200 ${location.pathname === '/'
              ? 'bg-linear-to-r from-brand-forest to-brand-emerald text-white shadow-[0_16px_30px_-20px_rgba(16,185,129,0.8)]'
              : 'text-[var(--color-app-ink-soft)] hover:bg-[rgba(16,185,129,0.07)] hover:text-brand-forest'
              }`}
          >
            <div className="flex items-center gap-3">
              <Home className={`w-4 h-4 ${location.pathname === '/' ? 'text-white' : 'text-stone-400'}`} />
              <span className="text-[13px] font-semibold tracking-[-0.01em]">Home</span>
            </div>
            {location.pathname === '/' ? <ChevronDown className="w-4 h-4 animate-bounce-subtle" /> : <ChevronRight className="w-4 h-4 opacity-40" />}
          </Link>
          <Link
            to="/dashboard"
            className={`flex w-full items-center justify-between rounded-[18px] px-3.5 py-3 transition-all duration-200 ${location.pathname === '/dashboard'
              ? 'bg-linear-to-r from-brand-forest to-brand-emerald text-white shadow-[0_16px_30px_-20px_rgba(16,185,129,0.8)]'
              : 'text-[var(--color-app-ink-soft)] hover:bg-[rgba(16,185,129,0.07)] hover:text-brand-forest'
              }`}
          >
            <div className="flex items-center gap-3">
              <BarChart3 className={`w-4 h-4 ${location.pathname === '/dashboard' ? 'text-white' : 'text-stone-400'}`} />
              <span className="text-[13px] font-semibold tracking-[-0.01em]">Dashboard</span>
            </div>
          </Link>

          {modules.map((module) => {
          const isActiveModule = activeModule === module.id;
          const isCurrentRoute = location.pathname.startsWith(`/${module.id}`);
          const Icon = module.icon;
          const isLocked = !module.live;

          return (
              <div key={module.id} className="space-y-1">
                <button
                  onClick={() => handleModuleClick(module.id, isLocked)}
                  disabled={isLocked}
                  className={`group relative flex w-full items-center justify-between rounded-[18px] px-3.5 py-3 transition-all duration-200 ${isCurrentRoute
                    ? 'bg-linear-to-r from-brand-forest to-brand-emerald text-white shadow-[0_16px_30px_-20px_rgba(16,185,129,0.8)]'
                    : isActiveModule && location.pathname === '/'
                      ? 'border border-brand-emerald/20 bg-brand-emerald/10 text-brand-forest shadow-none'
                      : isLocked
                        ? 'cursor-default text-stone-300 opacity-60'
                        : 'border border-transparent text-[var(--color-app-ink-soft)] hover:bg-[rgba(16,185,129,0.07)] hover:text-brand-forest'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isCurrentRoute ? 'text-white' : isActiveModule && location.pathname === '/' ? 'text-brand-emerald' : isLocked ? 'text-stone-200' : 'text-stone-400 group-hover:text-brand-forest'}`} />
                    <span className={`text-[13px] tracking-[-0.01em] ${isCurrentRoute || (isActiveModule && location.pathname === '/') ? 'font-bold' : 'font-semibold'}`}>
                      {module.name}
                    </span>
                  </div>

                  {isLocked ? (
                    <div className="rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-stone-400">Soon</div>
                  ) : isCurrentRoute ? (
                    <ChevronDown className="w-4 h-4 transition-transform duration-300" />
                  ) : (
                    <ChevronRight className={`w-4 h-4 transition-all duration-300 ${isActiveModule && location.pathname === '/' ? 'text-brand-emerald/40' : 'opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5'}`} />
                  )}
                </button>

                {isCurrentRoute && (
                  <div className="relative ml-5 space-y-1 border-l-2 border-brand-emerald/10 py-2 pl-4">
                    {getStepsForModule(module.id).map((step, idx) => {
                      const stepNum = idx + 1;
                      const isCompleted = stepNum < activeStep;
                      const isActive = stepNum === activeStep;

                      const handleStepClick = () => {
                        const pathMaps = {
                          'books-validation': [
                            '/books-validation/upload',
                            '/books-validation/mapping',
                            '/books-validation/processing',
                            '/books-validation/errors',
                            '/books-validation/bulk-resolution',
                            '/books-validation/export'
                          ],
                          '2b-reconciliation': [
                            '/2b-reconciliation',
                            '/2b-reconciliation/summary',
                            '/2b-reconciliation/results'
                          ],
                          'json-excel': [
                            '/json-excel',
                            '/json-excel/preview',
                            '/json-excel/configure',
                            '/json-excel/export'
                          ]
                        };

                        const modulePaths = pathMaps[module.id];
                        if (modulePaths && modulePaths[idx]) {
                          navigate(modulePaths[idx]);
                        }
                      };

                      return (
                        <div
                          key={idx}
                          onClick={handleStepClick}
                          className="relative flex cursor-pointer items-center gap-3 rounded-xl py-1.5 pr-2 transition-colors hover:bg-white/40"
                        >
                          <div className={`z-10 -ml-[21px] h-2.5 w-2.5 rounded-full transition-all duration-500 ${isCompleted
                            ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                            : isActive
                              ? 'scale-125 bg-linear-to-br from-brand-forest to-brand-emerald ring-4 ring-brand-emerald/10'
                              : 'bg-stone-200'
                            }`} />

                          <span className={`flex-1 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200 ${isActive ? 'font-bold text-brand-forest' : isCompleted ? 'text-stone-400' : 'text-stone-500 hover:text-stone-900'
                            }`}>
                            {step}
                          </span>

                          {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                          {isActive && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-auto space-y-1 border-t border-[rgba(191,211,195,0.58)] pt-4">
            {[ 
              { icon: BookOpenText, label: 'Ledger & Reports', path: '/ledger' },
              { icon: History, label: 'Audit History', path: '/history' },
              { icon: Building2, label: 'Vendor Master', path: '/directory' },
              { icon: Settings, label: 'Settings', path: '/settings/entities' }
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => navigate(item.path)}
                className="group flex w-full items-center gap-3 rounded-[16px] p-3 text-[var(--color-app-ink-soft)] transition-colors hover:bg-[rgba(247,250,247,0.95)] hover:text-[var(--color-app-ink-strong)]"
              >
                <item.icon className="h-4 w-4 text-stone-400 group-hover:text-brand-forest" />
                <span className="text-[13px] font-medium tracking-[-0.01em]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="flex items-center justify-between border-t border-[rgba(191,211,195,0.58)] bg-[rgba(242,247,242,0.85)] px-5 py-4">
        <div>
          <div className="mb-0.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-app-ink-muted)]">GSTIN</div>
          <div className="text-[11px] font-mono font-bold text-[var(--color-app-ink)]">
            {entities?.find(e => e.id === activeEntityId)?.gstin || '---'}
          </div>
        </div>
        <Lock className="h-3 w-3 text-stone-300" />
      </div>
    </aside>
  );
};

// Helper to define steps
function getStepsForModule(moduleId) {
  switch (moduleId) {
    case 'books-validation':
      return [
        'Upload Files',
        'Column Mapping',
        'Processing',
        'Review Issues',
        'Bulk GSTIN Fixes',
        'Approval & Export'
      ];
    case '2b-reconciliation':
      return ['2B Upload', '2B Summary', 'Match Results'];
    case 'json-excel':
      return ['Upload JSON', 'Preview Structure', 'Configure Output', 'Export'];
    default:
      return [];
  }
}
