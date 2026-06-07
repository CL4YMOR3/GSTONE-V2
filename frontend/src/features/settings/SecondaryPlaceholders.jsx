import React, { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Database, FileClock, Search, Users } from 'lucide-react';

export const SecondaryPlaceholder = ({ title, icon: Icon, description }) => {
    const { setActiveStep, setActiveModule } = useAppStore();

    useEffect(() => {
        setActiveModule(null);
        setActiveStep(1);
    }, [setActiveModule, setActiveStep]);

    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[600px] bg-stone-50/50">
            <div className="text-center space-y-6 max-w-sm">
                <div className="w-24 h-24 bg-white border border-stone-200 shadow-sm rounded-full flex items-center justify-center mx-auto mb-4 relative">
                    <div className="absolute inset-0 bg-brand-emerald/5 rounded-full pointer-events-none" />
                    <Icon className="w-10 h-10 text-stone-400" />
                    <div className="absolute -bottom-2 -right-2 bg-brand-emerald text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md shadow-md border border-emerald-400">
                        WIP
                    </div>
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-black text-stone-900 tracking-tight">{title}</h2>
                    <p className="text-stone-500 font-medium leading-relaxed">
                        {description}
                    </p>
                </div>

                <div className="p-4 bg-stone-100 border border-stone-200 rounded-xl flex items-start gap-3 text-left">
                    <Database className="w-5 h-5 text-brand-emerald mt-0.5 shrink-0" />
                    <div>
                        <div className="text-sm font-bold text-stone-800">Session-Only Mode</div>
                        <div className="text-xs text-stone-500 mt-1">This placeholder is not backed by a persistent history layer in the current legacy-aligned build.</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const AuditHistoryPlaceholder = () => (
    <SecondaryPlaceholder
        title="Audit History"
        icon={FileClock}
        description="Review past reconciliation runs, download archived reports, and track system changes across all users and contexts."
    />
);

