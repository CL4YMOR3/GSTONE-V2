import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';
import {
    Users,
    Search,
    Filter,
    Shield,
    ShieldAlert,
    ShieldCheck,
    MoreVertical,
    ExternalLink,
    History,
    Building2
} from 'lucide-react';

export const VendorDirectory = () => {
    const { businessContext } = useAppStore();
    const [vendors, setVendors] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (searchTerm.trim().length >= 2) {
            loadVendors();
        } else {
            setVendors([]);
        }
    }, [searchTerm, businessContext]);

    const loadVendors = async () => {
        try {
            setLoading(true);
            const data = await api.searchVendors(searchTerm.trim(), businessContext);
            setVendors(data.vendors || []);
        } catch (err) {
            console.error("Failed to load vendors:", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredVendors = vendors.filter(v =>
        (v.vendor_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.gstin.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getTrustIcon = (level) => {
        switch (level) {
            case 'HIGH': return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
            case 'MEDIUM': return <Shield className="w-4 h-4 text-amber-500" />;
            default: return <ShieldAlert className="w-4 h-4 text-rose-500" />;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96 text-stone-400">
                <div className="mr-3"><Spinner size="lg" /></div>
                <span className="text-sm font-black uppercase tracking-widest">Searching Vendor Registry...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-2 text-brand-forest mb-1">
                        <Users className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-wider">Vendor Trust Registry</span>
                    </div>
                    <h1 className="text-3xl font-black text-stone-900 tracking-tight">Partner Directory</h1>
                </div>

                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                        <input
                            type="text"
                            placeholder="Search GSTIN or Name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-emerald/20 transition-all w-80 shadow-sm"
                        />
                    </div>
                    <button className="p-2.5 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors shadow-sm text-stone-600">
                        <Filter className="w-4 h-4" />
                    </button>
                </div>
            </header>

            <div className="bg-white border border-stone-200 rounded-[32px] overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-stone-100 bg-stone-50/50">
                            <th className="px-6 py-4 text-[10px] font-black text-stone-400 uppercase tracking-widest">Vendor Identity</th>
                            <th className="px-6 py-4 text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">Trust Level</th>
                            <th className="px-6 py-4 text-[10px] font-black text-stone-400 uppercase tracking-widest">State</th>
                            <th className="px-6 py-4 text-[10px] font-black text-stone-400 uppercase tracking-widest">Last Seen</th>
                            <th className="px-6 py-4 text-[10px] font-black text-stone-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                        {filteredVendors.map((vendor) => (
                            <tr key={vendor.gstin} className="hover:bg-brand-emerald/5 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center text-stone-400 group-hover:bg-white group-hover:text-brand-emerald transition-colors">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-stone-900 leading-none mb-1">{vendor.vendor_name}</div>
                                            <div className="text-[11px] font-mono font-medium text-stone-400">{vendor.gstin}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col items-center gap-1">
                                        {getTrustIcon(vendor.trust_level)}
                                        <span className={`text-[9px] font-black tracking-tight ${vendor.trust_level === 'HIGH' ? 'text-emerald-600' :
                                            vendor.trust_level === 'MEDIUM' ? 'text-amber-600' : 'text-rose-600'
                                            }`}>
                                            {vendor.trust_level}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 bg-stone-100 rounded-md text-[10px] font-bold text-stone-600 uppercase">
                                        {vendor.status || 'ACTIVE'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                                        <History className="w-3 h-3 opacity-40" />
                                        {vendor.contexts?.length ? vendor.contexts.join(', ') : 'Cross-context'}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end items-center gap-1">
                                        <button className="p-2 text-stone-400 hover:text-brand-forest hover:bg-white rounded-lg transition-all">
                                            <ExternalLink className="w-4 h-4" />
                                        </button>
                                        <button className="p-2 text-stone-400 hover:text-stone-900 hover:bg-white rounded-lg transition-all">
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredVendors.length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center text-stone-400">
                        <Search className="w-12 h-12 mb-4 opacity-10" />
                        <p className="text-sm font-bold">{searchTerm.trim().length < 2 ? 'Type at least 2 characters to search vendors' : 'No vendors found matching your search'}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
