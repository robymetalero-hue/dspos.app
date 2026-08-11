import React, { useState } from 'react';
import { Calendar, Filter, X, ChevronDown, Check } from 'lucide-react';

export interface DateRange {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    preset: string;    // 'today' | '7days' | '30days' | 'thisMonth' | 'custom'
    compare?: boolean; // compare with the previous period
}

interface DateRangePickerProps {
    value: DateRange;
    onChange: (range: DateRange) => void;
    className?: string;
}

export default function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [tempStart, setTempStart] = useState(value.startDate);
    const [tempEnd, setTempEnd] = useState(value.endDate);

    const presets = [
        { id: 'all', name: 'Todo Historial' },
        { id: 'today', name: 'Hoy' },
        { id: '7days', name: 'Últimos 7 Días' },
        { id: '30days', name: 'Últimos 30 Días' },
        { id: 'thisMonth', name: 'Este Mes' },
        { id: 'thisYear', name: 'Este Año' },
        { id: 'custom', name: 'Personalizado' },
    ];

    const getPresetDates = (presetId: string): { start: string; end: string } => {
        const today = new Date();
        const formatDate = (d: Date) => {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };
        const todayStr = formatDate(today);

        if (presetId === 'all') {
            return { start: '', end: '' };
        } else if (presetId === 'today') {
            return { start: todayStr, end: todayStr };
        } else if (presetId === '7days') {
            const prior = new Date();
            prior.setDate(today.getDate() - 6);
            return { start: formatDate(prior), end: todayStr };
        } else if (presetId === '30days') {
            const prior = new Date();
            prior.setDate(today.getDate() - 29);
            return { start: formatDate(prior), end: todayStr };
        } else if (presetId === 'thisMonth') {
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            return { start: `${yyyy}-${mm}-01`, end: todayStr };
        } else if (presetId === 'thisYear') {
            const yyyy = today.getFullYear();
            return { start: `${yyyy}-01-01`, end: todayStr };
        }
        return { start: value.startDate, end: value.endDate };
    };

    const handlePresetClick = (presetId: string) => {
        if (presetId === 'custom') {
            onChange({
                ...value,
                preset: 'custom'
            });
            return;
        }

        const dates = getPresetDates(presetId);
        setTempStart(dates.start);
        setTempEnd(dates.end);
        onChange({
            startDate: dates.start,
            endDate: dates.end,
            preset: presetId
        });
        setIsOpen(false);
    };

    const handleApplyCustom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!tempStart || !tempEnd) return;
        
        let start = tempStart;
        let end = tempEnd;
        if (new Date(start) > new Date(end)) {
            // Swap if start is later than end
            const t = start;
            start = end;
            end = t;
            setTempStart(start);
            setTempEnd(end);
        }

        onChange({
            startDate: start,
            endDate: end,
            preset: 'custom'
        });
        setIsOpen(false);
    };

    const getActiveLabel = () => {
        const found = presets.find(p => p.id === value.preset);
        if (!found) return 'Rango de fechas';
        if (value.preset === 'custom') {
            return `${value.startDate} Al ${value.endDate}`;
        }
        return found.name;
    };

    return (
        <div className={`relative inline-block text-left select-none ${className}`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#0c111e] border border-slate-205 dark:border-slate-850 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#111927] transition shadow-xs cursor-pointer"
            >
                <Calendar size={14} className="text-[#6366f1]" />
                <span>{getActiveLabel()}</span>
                <ChevronDown size={12} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div 
                        className="fixed inset-0 z-40 bg-transparent" 
                        onClick={() => setIsOpen(false)} 
                    />
                    <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-3xl bg-white dark:bg-[#0c111e] border border-slate-200/80 dark:border-slate-850 shadow-xl p-4.5 z-55 animate-in fade-in slide-in-from-top-3 duration-200">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-850/60">
                            <span className="text-[10px] font-black uppercase text-slate-404 tracking-wider flex items-center gap-1.5">
                                <Filter size={11} className="text-[#6366f1]" /> Filtrar período
                            </span>
                            <button 
                                onClick={() => setIsOpen(false)} 
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                            >
                                <X size={13} />
                            </button>
                        </div>

                        {/* Presets Grid */}
                        <div className="grid grid-cols-2 gap-1.5 mt-3">
                            {presets.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => handlePresetClick(preset.id)}
                                    className={`px-3 py-2 text-[10.5px] font-bold rounded-xl text-left transition flex items-center justify-between cursor-pointer ${
                                        value.preset === preset.id
                                            ? 'bg-slate-100 dark:bg-slate-900 text-[#6366f1]'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50/80 dark:hover:bg-slate-900/40'
                                    }`}
                                >
                                    <span>{preset.name}</span>
                                    {value.preset === preset.id && <Check size={11} className="text-[#6366f1] shrink-0" />}
                                </button>
                            ))}
                        </div>

                        {/* Custom Date Form */}
                        {value.preset === 'custom' && (
                            <form onSubmit={handleApplyCustom} className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-850/60 flex flex-col gap-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Desde</label>
                                        <input
                                            type="date"
                                            value={tempStart}
                                            onChange={(e) => setTempStart(e.target.value)}
                                            className="w-full px-2.5 py-1.5 text-[11px] font-mono font-bold bg-slate-50 dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-705 dark:text-slate-300 focus:outline-none focus:border-[#6366f1]"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Hasta</label>
                                        <input
                                            type="date"
                                            value={tempEnd}
                                            onChange={(e) => setTempEnd(e.target.value)}
                                            className="w-full px-2.5 py-1.5 text-[11px] font-mono font-bold bg-slate-50 dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-705 dark:text-slate-300 focus:outline-none focus:border-[#6366f1]"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    className="w-full py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold text-[10.5px] uppercase tracking-wider rounded-xl transition shadow-xs cursor-pointer"
                                >
                                    Aplicar Rango
                                </button>
                            </form>
                        )}

                        {/* Compare Toggle */}
                        {value.preset !== 'all' && (
                            <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-850/60 flex items-center justify-between">
                                <span className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400">Comparar período anterior</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={!!value.compare} 
                                        onChange={(e) => {
                                            onChange({
                                                ...value,
                                                compare: e.target.checked
                                            });
                                        }}
                                        className="sr-only peer" 
                                    />
                                    <div className="relative w-8 h-4.5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-3.5 after:content-[''] after:absolute after:top-[2.5px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#6366f1]"></div>
                                </label>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
