import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const routeLabels = {
    'dashboard': 'Dashboard',
    'books-validation': 'Books Clean-up',
    '2b-reconciliation': 'Mirror Deck',
    'json-excel': 'JSON Parser',
    'settings': 'Settings',
    'history': 'History',
    'directory': 'Vendor Directory',

    // Sub-pages
    'upload': 'Upload',
    'mapping': 'Column Mapping',
    'processing': 'Processing',
    'errors': 'Error Resolution',
    'bulk-resolution': 'Bulk Fix',
    'export': 'Final Export',
    'summary': 'Summary',
    'results': 'Match Results',
    'preview': 'Preview',
    'configure': 'Configure',
    'entities': 'The Vault'
};

export const Breadcrumbs = () => {
    const location = useLocation();
    const { activeEntityId, entities } = useAppStore();
    const pathnames = location.pathname.split('/').filter((x) => x);

    const activeEntity = entities.find(e => e.id === activeEntityId);

    if (location.pathname === '/') return null;

    return (
        <nav className="mb-5 flex items-center gap-2 px-1" aria-label="Breadcrumb">
            <Link
                to="/"
                className="flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-400 transition-colors hover:border-[rgba(231,226,216,0.95)] hover:bg-white hover:text-brand-emerald"
            >
                <Home className="w-3 h-3" />
                Home
            </Link>

            {pathnames.length > 0 && <ChevronRight className="w-3 h-3 text-stone-300" />}

            {pathnames.map((value, index) => {
                const last = index === pathnames.length - 1;
                const to = `/${pathnames.slice(0, index + 1).join('/')}`;
                const label = routeLabels[value] || value.charAt(0).toUpperCase() + value.slice(1);

                return (
                    <React.Fragment key={to}>
                        {last ? (
                            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-forest">
                                {label}
                            </span>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Link
                                    to={to}
                                    className="rounded-full border border-transparent px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-400 transition-colors hover:border-[rgba(231,226,216,0.95)] hover:bg-white hover:text-brand-emerald"
                                >
                                    {label}
                                </Link>
                                <ChevronRight className="w-3 h-3 text-stone-300" />
                            </div>
                        )}
                    </React.Fragment>
                );
            })}

            {activeEntity && (
                <div className="ml-auto flex items-center gap-2 rounded-full border border-[rgba(231,226,216,0.95)] bg-white/90 px-3 py-1.5 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-emerald animate-pulse"></div>
                    <span className="text-[10px] font-black text-stone-600 uppercase tracking-tighter">
                        {activeEntity.name}
                    </span>
                </div>
            )}
        </nav>
    );
};
