import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import {
    Settings2,
    Check,
    GripVertical,
    FileSpreadsheet,
    ToggleRight,
    ToggleLeft
} from 'lucide-react';

export const ConfigureOutput = () => {
    const { setActiveStep } = useAppStore();
    const navigate = useNavigate();

    const [includeSummary, setIncludeSummary] = useState(true);
    const [formatCurrency, setFormatCurrency] = useState(true);
    const [highlightAmendments, setHighlightAmendments] = useState(false);

    useEffect(() => {
        setActiveStep(3);
    }, [setActiveStep]);

    const columns = [
        'GSTIN of Supplier',
        'Trade Name',
        'Invoice Number',
        'Invoice Date',
        'Invoice Value',
        'Taxable Value',
        'Integrated Tax',
        'Central Tax',
        'State/UT Tax',
        'Cess',
        'ITC Available'
    ];

    return (
        <div className="flex flex-col h-full bg-stone-50/30 overflow-y-auto">
            {/* Hero Zone */}
            <div className="bg-linear-to-b from-white to-stone-50/50 pt-16 pb-8 px-12 border-b border-stone-200">
                <div className="max-w-4xl mx-auto space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white border border-stone-200 rounded-xl flex items-center justify-center shadow-sm">
                            <Settings2 className="w-6 h-6 text-brand-emerald" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-stone-900 tracking-tight">Configure Output</h1>
                            <p className="text-stone-500 font-medium">Select columns and format options for the Excel export</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-12">
                <div className="max-w-4xl mx-auto space-y-8">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Column Selection Card */}
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-stone-900">Select Output Columns</h3>
                                <div className="flex items-center gap-3 text-xs font-semibold text-brand-emerald">
                                    <button className="hover:text-brand-forest transition-colors">Select All</button>
                                    <span className="text-stone-300">|</span>
                                    <button className="hover:text-brand-forest transition-colors">Reset</button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {columns.map((col, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-stone-100 bg-stone-50/50 group hover:border-stone-300 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <GripVertical className="w-4 h-4 text-stone-300 cursor-grab active:cursor-grabbing" />
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 rounded bg-brand-emerald flex items-center justify-center">
                                                    <Check className="w-3 h-3 text-white" />
                                                </div>
                                                <span className="text-sm font-medium text-stone-700">{col}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Format Options Card */}
                        <div className="space-y-6">
                            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
                                <h3 className="text-lg font-bold text-stone-900">Output Options</h3>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between cursor-pointer group" onClick={() => setIncludeSummary(!includeSummary)}>
                                        <div>
                                            <div className="text-sm font-bold text-stone-800">Include Summary Sheet</div>
                                            <div className="text-xs text-stone-500">Adds an overview tab with calculated KPIs</div>
                                        </div>
                                        {includeSummary ? <ToggleRight className="w-8 h-8 text-brand-emerald" /> : <ToggleLeft className="w-8 h-8 text-stone-300" />}
                                    </div>

                                    <div className="flex items-center justify-between cursor-pointer group" onClick={() => setFormatCurrency(!formatCurrency)}>
                                        <div>
                                            <div className="text-sm font-bold text-stone-800">Format Currency Values</div>
                                            <div className="text-xs text-stone-500">Applies INR accounting format to all numeric columns</div>
                                        </div>
                                        {formatCurrency ? <ToggleRight className="w-8 h-8 text-brand-emerald" /> : <ToggleLeft className="w-8 h-8 text-stone-300" />}
                                    </div>

                                    <div className="flex items-center justify-between cursor-pointer group" onClick={() => setHighlightAmendments(!highlightAmendments)}>
                                        <div>
                                            <div className="text-sm font-bold text-stone-800">Highlight Amendments</div>
                                            <div className="text-xs text-stone-500">Color-codes rows marked as amended (AM)</div>
                                        </div>
                                        {highlightAmendments ? <ToggleRight className="w-8 h-8 text-brand-emerald" /> : <ToggleLeft className="w-8 h-8 text-stone-300" />}
                                    </div>

                                    <div className="pt-4 space-y-2">
                                        <label className="text-xs font-bold text-stone-600 uppercase tracking-wider">Date Format</label>
                                        <select className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-emerald/20">
                                            <option>DD/MM/YYYY (GST Standard)</option>
                                            <option>MM/DD/YYYY</option>
                                            <option>YYYY-MM-DD (ISO)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Output Preview */}
                            <div className="bg-white border border-stone-200 rounded-2xl p-6 text-stone-900 shadow-sm relative overflow-hidden ring-1 ring-stone-900/5">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-emerald/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                                <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
                                    <FileSpreadsheet className="w-4 h-4 text-brand-emerald" />
                                    Target Output File
                                </h4>
                                <div className="text-sm font-mono text-stone-400 italic relative z-10">--- pending generation ---</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-4 pt-6">
                        <button
                            onClick={() => navigate('/json-excel/preview')}
                            className="px-6 py-3 rounded-lg font-bold text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-all text-sm"
                        >
                            Back
                        </button>
                        <button
                            onClick={() => {
                                setActiveStep(4);
                                navigate('/json-excel/export');
                            }}
                            className="px-6 py-3 rounded-lg bg-linear-to-r from-brand-forest to-brand-emerald text-white font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all text-sm shadow-brand-emerald/20"
                        >
                            Generate Excel →
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};
