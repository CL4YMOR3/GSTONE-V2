import { useAppStore } from '../store/useAppStore';
import { useLocation, Link } from 'react-router-dom';
import { 
  Search, 
  Bell, 
  UserCircle,
  Building2
} from 'lucide-react';

export const Header = () => {
  const { activeModule, entities, activeEntityId, setActiveEntity } = useAppStore();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const activeEntity = entities.find((entity) => entity.id === activeEntityId);

  // Simple breadcrumb logic
  const getBreadcrumb = () => {
    const modules = {
      'books-validation': 'Books Validation',
      '2b-reconciliation': '2B Reconciliation',
      'json-excel': 'JSON to Excel'
    };
    return modules[activeModule] || 'Dashboard';
  };

  return (
    <header className="sticky top-0 z-40 h-18 w-full border-b border-[rgba(191,211,195,0.72)] bg-white/78 px-6 backdrop-blur-xl md:px-8">
      <div className="flex h-full items-center justify-between gap-6">
      <div className="flex items-center gap-6">
        <nav className="flex items-center gap-2 text-sm">
          <Link 
            to="/" 
            className={`${isHome ? "text-[var(--color-app-ink-strong)] font-semibold" : "text-[var(--color-app-ink-muted)] hover:text-[var(--color-app-ink)]"} transition-colors`}
          >
            Home
          </Link>
          {!isHome && (
            <>
              <span className="text-stone-300">/</span>
              {location.pathname.startsWith('/settings') ? (
                <>
                  <span className="text-stone-400">Settings</span>
                  <span className="text-stone-300">/</span>
                  <span className="text-stone-900 font-medium">Entities</span>
                </>
              ) : (
                <Link 
                  to={`/${activeModule}`}
                  className="font-semibold text-[var(--color-app-ink-strong)] transition-colors hover:text-brand-forest"
                >
                  {getBreadcrumb()}
                </Link>
              )}
            </>
          )}
        </nav>
      </div>

      <div className="mx-4 flex flex-1 items-center gap-4">
        <div className="hidden min-w-[280px] items-center gap-3 rounded-[20px] border border-[rgba(191,211,195,0.75)] bg-[rgba(247,250,247,0.95)] px-4 py-3 xl:flex">
          <Building2 className="w-4 h-4 text-brand-forest" />
          <select
            value={activeEntityId || ''}
            onChange={(event) => setActiveEntity(event.target.value)}
            className="w-full bg-transparent text-[13px] font-semibold text-[var(--color-app-ink-strong)] outline-none"
          >
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </div>
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input 
            type="text" 
            placeholder="Search records, GSTINs, or help..."
            className="w-full rounded-[20px] border border-[rgba(191,211,195,0.75)] bg-white/90 py-3.5 pl-10 pr-4 text-[13px] text-[var(--color-app-ink-strong)] transition-all outline-none placeholder:text-[var(--color-app-ink-muted)] focus:border-brand-emerald focus:ring-4 focus:ring-brand-emerald/10"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative rounded-[18px] border border-transparent p-2.5 text-[var(--color-app-ink-muted)] transition-colors hover:border-[rgba(191,211,195,0.72)] hover:bg-[rgba(247,250,247,0.95)]">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>
        <div className="mx-1 h-8 w-px bg-[rgba(191,211,195,0.72)]" />
        <button className="flex items-center gap-3 rounded-[20px] border border-transparent p-1.5 pr-3 transition-all hover:border-[rgba(191,211,195,0.72)] hover:bg-[rgba(247,250,247,0.95)]">
          <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-[rgba(239,245,240,0.92)]">
            <UserCircle className="w-10 h-10 text-stone-300" />
          </div>
          <div className="hidden lg:block text-left leading-tight">
            <div className="text-[13px] font-semibold text-[var(--color-app-ink-strong)]">Admin User</div>
            <div className="text-[10px] uppercase font-bold tracking-[0.12em] text-[var(--color-app-ink-muted)]">{activeEntity?.name || 'No Active Entity'}</div>
          </div>
        </button>
      </div>
      </div>
    </header>
  );
};
