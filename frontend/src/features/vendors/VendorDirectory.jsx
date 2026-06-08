import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Building2,
  Download,
  Filter,
  MapPinned,
  Plus,
  Search,
  Upload,
  Users,
  X,
  FileSpreadsheet,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { Spinner } from '../../components/Spinner';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const SORT_OPTIONS = [
  { id: 'vendor_name', label: 'Vendor A-Z' },
  { id: 'invoice_count', label: 'Invoice Volume' },
  { id: 'last_seen', label: 'Last Seen' },
];

const emptyForm = {
  gstin: '',
  vendor_name: '',
  legal_name: '',
  trade_name: '',
  status: 'ACTIVE',
  aliases: '',
  notes: '',
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB');
};

const downloadCsv = (rows, fileName) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const text = row[header] === null || row[header] === undefined ? '' : String(row[header]);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

const KpiCard = ({ title, value, subtitle, icon: Icon, accent }) => (
  <div className="app-kpi-card p-6">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">{title}</span>
      <Icon className={`h-4 w-4 ${accent}`} />
    </div>
    <div className={`mt-3 text-4xl font-black tracking-tight ${accent}`}>{value}</div>
    <p className="mt-2 text-xs font-medium text-stone-500">{subtitle}</p>
  </div>
);

const SideSheet = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/20 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h2 className="text-lg font-black text-stone-900">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-stone-100">
            <X className="h-5 w-5 text-stone-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className={`w-full ${maxWidth} bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200`}>
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h2 className="text-lg font-black text-stone-900">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-stone-100">
            <X className="h-5 w-5 text-stone-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

const getInitials = (name) => {
  if (!name) return 'V';
  return name.substring(0, 2).toUpperCase();
};

const avatarColors = [
  'bg-emerald-100 text-emerald-800 border-emerald-200', 
  'bg-blue-100 text-blue-800 border-blue-200', 
  'bg-purple-100 text-purple-800 border-purple-200', 
  'bg-amber-100 text-amber-800 border-amber-200', 
  'bg-rose-100 text-rose-800 border-rose-200'
];

const getAvatarColor = (name) => {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
};

export const VendorDirectory = () => {
  const { activeEntityId, businessContext } = useAppStore();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [vendors, setVendors] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortBy, setSortBy] = React.useState('vendor_name');
  
  const [selectedVendor, setSelectedVendor] = React.useState(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const [form, setForm] = React.useState(emptyForm);
  const [singleModalOpen, setSingleModalOpen] = React.useState(false);
  const [singleError, setSingleError] = React.useState(null);
  
  const [bulkModalOpen, setBulkModalOpen] = React.useState(false);
  const [bulkFile, setBulkFile] = React.useState(null);
  const [previewData, setPreviewData] = React.useState([]);
  const [bulkFeedback, setBulkFeedback] = React.useState(null);
  
  const [uploadMenuOpen, setUploadMenuOpen] = React.useState(false);
  const fileInputRef = useRef(null);

  const loadDirectory = useCallback(async () => {
    try {
      setLoading(true);
      const [vendorData, vendorStats] = await Promise.all([
        api.getVendors({
          context: activeEntityId,
          query: searchTerm.trim() || undefined,
          sortBy,
        }),
        api.getVendorStats(activeEntityId),
      ]);
      setVendors(vendorData.vendors || []);
      setStats(vendorStats);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [activeEntityId, searchTerm, sortBy]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadDirectory();
    }, searchTerm.trim() ? 180 : 0);
    return () => window.clearTimeout(timeout);
  }, [loadDirectory, searchTerm]);

  const handleFieldChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSingleError(null);
  };

  const handleSingleSubmit = async (event) => {
    event.preventDefault();
    setSingleError(null);

    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(form.gstin.trim())) {
      setSingleError('Invalid GSTIN format.');
      return;
    }

    const exists = vendors.find(v => v.gstin === form.gstin.trim());
    if (exists) {
      setSingleError('Vendor with this GSTIN already exists.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        ...form,
        gstin: form.gstin.trim(),
        aliases: form.aliases.split(',').map((item) => item.trim()).filter(Boolean),
        contexts: activeEntityId ? [activeEntityId] : [],
      };
      await api.createVendor(payload);
      setForm(emptyForm);
      setSingleModalOpen(false);
      await loadDirectory();
    } catch (error) {
      setSingleError(error.message || 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  const processPreview = (data) => {
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    
    const processed = data.map(row => {
      const gstin = (row.gstin || row.GSTIN || '').trim();
      const name = row.vendor_name || row['vendor name'] || row['Vendor Name'] || '';
      
      const errors = [];
      if (!gstinRegex.test(gstin)) errors.push('Invalid GSTIN');
      if (vendors.some(v => v.gstin === gstin)) errors.push('Duplicate (Exists)');
      
      return { gstin, name, errors };
    }).filter(row => row.gstin || row.name);

    setPreviewData(processed);
    setBulkFeedback(null);
    setBulkModalOpen(true);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    
    if (file.name.toLowerCase().endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => processPreview(res.data)
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
        processPreview(data);
      };
      reader.readAsBinaryString(file);
    }
    
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBulkConfirm = async () => {
    if (!bulkFile) return;
    try {
      setImporting(true);
      const response = await api.importVendors(bulkFile, activeEntityId);
      setBulkFeedback({
        type: 'success',
        message: `Successfully uploaded. Created/Updated: ${response.created + response.updated}. Skipped/Errors: ${response.errors.length}.`
      });
      await loadDirectory();
      // Keep modal open to show success message, let user close it
    } catch (error) {
      setBulkFeedback({ type: 'error', message: error.message || 'Failed to import vendors' });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    downloadCsv(
      vendors.map((vendor) => ({
        gstin: vendor.gstin,
        vendor_name: vendor.vendor_name,
        legal_name: vendor.legal_name || '',
        trade_name: vendor.trade_name || '',
        status: vendor.status,
        contexts: (vendor.contexts || []).join(', '),
        aliases: (vendor.aliases || []).join(', '),
        invoice_count: vendor.invoice_count || 0,
        last_seen: vendor.last_seen || '',
      })),
      `${businessContext || 'vendors'}_master.csv`
    );
  };

  // KPIs
  const totalVendors = stats?.total_vendors || vendors.length || 0;
  const totalInvoices = vendors.reduce((sum, v) => sum + (v.invoice_count || 0), 0);
  const highVolumeVendors = vendors.filter(v => (v.invoice_count || 0) > 50).length;
  const unusedVendors = vendors.filter(v => (v.invoice_count || 0) === 0).length;

  const kpis = [
    {
      title: 'Total Vendors',
      value: totalVendors,
      subtitle: 'All vendor master records',
      icon: Users,
      accent: 'text-brand-forest',
    },
    {
      title: 'Invoice Volume',
      value: totalInvoices.toLocaleString(),
      subtitle: 'Total processed invoices',
      icon: FileSpreadsheet,
      accent: 'text-sky-700',
    },
    {
      title: 'High Volume',
      value: highVolumeVendors,
      subtitle: 'Partners > 50 invoices',
      icon: Building2,
      accent: 'text-emerald-600',
    },
    {
      title: 'Unused Vendors',
      value: unusedVendors,
      subtitle: 'Zero invoice activity',
      icon: AlertTriangle,
      accent: 'text-amber-600',
    },
  ];

  if (loading && vendors.length === 0) {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-stone-400">
        <div className="mb-4"><Spinner size="xl" /></div>
        <p className="text-sm font-black uppercase tracking-widest text-stone-500">Loading Vendor Master...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-6">
      <header className="app-panel-hero p-8 md:p-10">
        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-forest">
              <Users className="h-4 w-4" />
              <span className="app-eyebrow text-brand-forest">Vendor Master</span>
            </div>
            <h1 className="app-page-title">Vendor Master Registry</h1>
            <p className="app-page-subtitle max-w-3xl">
              Centralized repository for GSTIN-linked vendor identity, usage history, aliases, and statuses for the active business context.
            </p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)}
      </section>

      <section className="app-panel p-3 px-5 relative z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <label className="flex flex-1 items-center gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-2 shadow-sm">
              <Search className="h-4 w-4 text-brand-forest" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">Search</div>
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by 15-digit GSTIN, Vendor Name, Legal Entity, Trade Name, or assigned Alias..."
                  className="w-full bg-transparent text-sm font-semibold text-stone-800 outline-none placeholder:text-stone-400/70"
                />
              </div>
            </label>

            <label className="flex items-center gap-3 rounded-[24px] border border-stone-200 bg-white px-4 py-2 shadow-sm w-[180px] shrink-0">
              <Filter className="h-4 w-4 text-brand-forest" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black uppercase tracking-widest text-stone-400">Sort</div>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-stone-800 outline-none">
                  {SORT_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </div>
            </label>
          </div>
          
          <div className="flex items-center gap-3 relative">
            <button onClick={handleExport} disabled={!vendors.length} className="app-button-secondary disabled:opacity-50">
              <Download className="h-4 w-4" />
              Export
            </button>
            <div className="relative">
              <button 
                onClick={() => setUploadMenuOpen(!uploadMenuOpen)}
                className="app-button-primary flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Vendors
                <ChevronDown className="h-4 w-4" />
              </button>
              {uploadMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUploadMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-white shadow-xl ring-1 ring-stone-900/5 z-50 overflow-hidden">
                    <button 
                      onClick={() => { setUploadMenuOpen(false); setSingleModalOpen(true); }}
                      className="w-full text-left px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition"
                    >
                      Single Upload
                    </button>
                    <button 
                      onClick={() => { setUploadMenuOpen(false); fileInputRef.current?.click(); }}
                      className="w-full text-left px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition border-t border-stone-100"
                    >
                      Bulk Upload
                    </button>
                    <input 
                      type="file" 
                      accept=".csv,.xls,.xlsx" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="app-panel overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap table-fixed">
            <thead className="bg-stone-50/80">
              <tr>
                <th className="w-1/2 px-6 py-4 font-black uppercase tracking-widest text-[10px] text-stone-500">Vendor Identity</th>
                <th className="w-32 px-6 py-4 font-black uppercase tracking-widest text-[10px] text-stone-500">Aliases</th>
                <th className="w-40 px-6 py-4 font-black uppercase tracking-widest text-[10px] text-stone-500">Last Seen</th>
                <th className="w-40 px-6 py-4 font-black uppercase tracking-widest text-[10px] text-stone-500">Invoices</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 bg-white">
              {!vendors.length ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm font-semibold text-stone-400">
                    No vendors found for the current filters.
                  </td>
                </tr>
              ) : (
                vendors.map((vendor, idx) => (
                  <tr 
                    key={vendor.gstin}
                    onClick={() => { setSelectedVendor(vendor); setSheetOpen(true); }}
                    className={`cursor-pointer transition hover:bg-stone-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/30'}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-bold shadow-sm ${getAvatarColor(vendor.vendor_name)}`}>
                          {getInitials(vendor.vendor_name)}
                        </div>
                        <div className="min-w-0 overflow-hidden">
                          <div className="font-black text-stone-900 truncate text-base">{vendor.vendor_name}</div>
                          <div className="mt-1 font-mono text-xs text-stone-500 truncate">{vendor.gstin}</div>
                          {(vendor.trade_name || vendor.legal_name) && (
                            <div className="mt-0.5 text-[11px] font-medium text-stone-400 truncate">
                              {vendor.trade_name || vendor.legal_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-md bg-stone-100 px-2.5 py-1 text-sm font-bold text-stone-600 border border-stone-200">
                        {vendor.aliases?.length || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-500">
                      {formatDate(vendor.last_seen)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-md bg-sky-50 px-2.5 py-1 text-sm font-black text-sky-700 border border-sky-100">
                        {vendor.invoice_count || 0}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Side Sheet for Vendor Profile */}
      <SideSheet 
        isOpen={sheetOpen} 
        onClose={() => setSheetOpen(false)}
        title="Vendor Profile"
      >
        {selectedVendor && (
          <div className="space-y-4 text-sm">
            {[
              ['GSTIN', selectedVendor.gstin],
              ['Vendor Name', selectedVendor.vendor_name],
              ['Legal Name', selectedVendor.legal_name || '—'],
              ['Trade Name', selectedVendor.trade_name || '—'],
              ['Status', selectedVendor.status],
              ['Contexts', (selectedVendor.contexts || []).join(', ') || 'Global'],
              ['Aliases', (selectedVendor.aliases || []).join(', ') || '—'],
              ['Last Seen', formatDate(selectedVendor.last_seen)],
              ['Invoice Count', selectedVendor.invoice_count || 0],
              ['Gardens Seen', (selectedVendor.gardens_seen || []).join(', ') || '—'],
              ['Notes', selectedVendor.notes || '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-stone-100 bg-stone-50/50 px-5 py-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">{label}</div>
                <div className="mt-1.5 break-words text-sm font-semibold text-stone-800">{value}</div>
              </div>
            ))}
          </div>
        )}
      </SideSheet>

      {/* Single Upload Modal */}
      <Modal isOpen={singleModalOpen} onClose={() => setSingleModalOpen(false)} title="Add Single Vendor">
        <form className="space-y-4" onSubmit={handleSingleSubmit}>
          {singleError && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm font-semibold border border-red-100">
              {singleError}
            </div>
          )}
          <input className="app-input" placeholder="GSTIN (15 chars)" value={form.gstin} onChange={(event) => handleFieldChange('gstin', event.target.value.toUpperCase())} required />
          <input className="app-input" placeholder="Vendor Name" value={form.vendor_name} onChange={(event) => handleFieldChange('vendor_name', event.target.value)} required />
          <input className="app-input" placeholder="Legal Name" value={form.legal_name} onChange={(event) => handleFieldChange('legal_name', event.target.value)} />
          <input className="app-input" placeholder="Trade Name" value={form.trade_name} onChange={(event) => handleFieldChange('trade_name', event.target.value)} />
          <input className="app-input" placeholder="Aliases (comma separated)" value={form.aliases} onChange={(event) => handleFieldChange('aliases', event.target.value)} />
          <select className="app-input" value={form.status} onChange={(event) => handleFieldChange('status', event.target.value)}>
            {['ACTIVE', 'UNKNOWN', 'SUSPENDED', 'CANCELLED'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <textarea className="app-input min-h-[96px]" placeholder="Notes" value={form.notes} onChange={(event) => handleFieldChange('notes', event.target.value)} />
          <div className="pt-4 border-t border-stone-100 flex justify-end gap-3">
            <button type="button" onClick={() => setSingleModalOpen(false)} className="app-button-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="app-button-primary disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Vendor'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Upload Preview Modal */}
      <Modal isOpen={bulkModalOpen} onClose={() => setBulkModalOpen(false)} title="Bulk Upload Preview" maxWidth="max-w-3xl">
        <div className="space-y-4">
          {bulkFeedback && (
            <div className={`p-4 rounded-xl text-sm font-semibold border ${bulkFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
              {bulkFeedback.message}
            </div>
          )}
          
          <div className="text-sm font-medium text-stone-500">
            Previewing {previewData.length} records from selected file.
          </div>
          
          <div className="border border-stone-200 rounded-2xl overflow-hidden max-h-[50vh] overflow-y-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-stone-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-[10px] text-stone-500">GSTIN</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-[10px] text-stone-500">Vendor Name</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-[10px] text-stone-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {previewData.slice(0, 100).map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 font-mono text-xs">{row.gstin || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-stone-800">{row.name || '-'}</td>
                    <td className="px-4 py-3">
                      {row.errors.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {row.errors.map((e, i) => (
                            <span key={i} className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              {e}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Valid
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewData.length > 100 && (
              <div className="px-4 py-3 text-xs font-semibold text-center text-stone-500 bg-stone-50">
                ... and {previewData.length - 100} more rows
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-stone-100 flex justify-end gap-3">
            <button type="button" onClick={() => setBulkModalOpen(false)} className="app-button-secondary">Close</button>
            <button 
              type="button" 
              onClick={handleBulkConfirm} 
              disabled={importing || previewData.length === 0} 
              className="app-button-primary disabled:opacity-60 flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {importing ? 'Uploading...' : 'Confirm Upload'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
