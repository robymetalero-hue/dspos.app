import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppContext } from '../context/AppContext';
import { 
    History, Search, Filter, RefreshCw, Calendar, ArrowDownLeft, 
    ArrowUpRight, ShoppingBag, ClipboardList, User, ShieldCheck, Download,
    AlertTriangle, CheckCircle, XCircle, Eye, ChevronLeft, ChevronRight, 
    Coins, Settings, Database, Server, Info, ArrowRight, ShieldAlert, FileSpreadsheet
} from 'lucide-react';

export default function AuditoriaView() {
    const { showNotification, user } = useAppContext();
    const [logs, setLogs] = useState<any[]>([]);
    const [uniqueUsers, setUniqueUsers] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'general' | 'precios'>('general');
    
    // Pagination state
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    // Filters state
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('todos');
    const [severityFilter, setSeverityFilter] = useState<string>('todos');
    const [statusFilter, setStatusFilter] = useState<string>('todos');
    const [userFilter, setUserFilter] = useState<string>('todos');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [productSearch, setProductSearch] = useState<string>('');

    // Modal/Detail view state
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [viewRawJSON, setViewRawJSON] = useState(false);

    // Price History specific states
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const [priceHistory, setPriceHistory] = useState<any[]>([]);
    const [loadingPriceHistory, setLoadingPriceHistory] = useState(false);
    const [allProductsList, setAllProductsList] = useState<any[]>([]);

    // Fetch master logs
    const fetchLogs = async () => {
        setLoading(true);
        try {
            // Build query params
            const params = new URLSearchParams();
            params.append('page', String(page));
            params.append('limit', String(limit));
            if (searchTerm) params.append('search', searchTerm);
            if (activeTab === 'precios') {
                params.append('category', 'precios');
            } else if (categoryFilter && categoryFilter !== 'todos') {
                params.append('category', categoryFilter);
            }
            if (severityFilter && severityFilter !== 'todos') params.append('severity', severityFilter);
            if (statusFilter && statusFilter !== 'todos') params.append('status', statusFilter);
            if (userFilter && userFilter !== 'todos') params.append('user', userFilter);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (productSearch) params.append('product', productSearch);

            const res = await fetch(`/api/system-audit?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs || []);
                setUniqueUsers(data.users || []);
                setTotalPages(data.pagination?.pages || 1);
                setTotalRecords(data.pagination?.total || 0);
            } else {
                showNotification('Error al cargar la auditoría avanzada', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Error de conexión con el servicio de auditoría', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Fetch product list for Price History search
    const fetchProducts = async () => {
        try {
            const res = await fetch('/api/products');
            if (res.ok) {
                const data = await res.json();
                setAllProductsList(data || []);
            }
        } catch (err) {
            console.error("Error fetching products list:", err);
        }
    };

    // Fetch Price History for a specific product
    const fetchProductPriceHistory = async (prodId: string) => {
        if (!prodId) return;
        setLoadingPriceHistory(true);
        try {
            const res = await fetch(`/api/products/${prodId}/price-history`);
            if (res.ok) {
                const data = await res.json();
                setPriceHistory(data || []);
            } else {
                showNotification('Error al recuperar historial de precios', 'error');
            }
        } catch (e) {
            console.error(e);
            showNotification('Fallo de conexión', 'error');
        } finally {
            setLoadingPriceHistory(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [page, limit, categoryFilter, severityFilter, statusFilter, userFilter, startDate, endDate, productSearch, activeTab]);

    useEffect(() => {
        const handleInventoryOperation = () => {
            fetchLogs();
            fetchProducts();
        };
        window.addEventListener('inventory_operation', handleInventoryOperation);
        return () => {
            window.removeEventListener('inventory_operation', handleInventoryOperation);
        };
    }, [page, limit, categoryFilter, severityFilter, statusFilter, userFilter, startDate, endDate, productSearch, activeTab]);

    useEffect(() => {
        fetchProducts();
    }, []);

    const triggerSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchLogs();
    };

    const resetFilters = () => {
        setSearchTerm('');
        setCategoryFilter('todos');
        setSeverityFilter('todos');
        setStatusFilter('todos');
        setUserFilter('todos');
        setStartDate('');
        setEndDate('');
        setProductSearch('');
        setPage(1);
    };

    // Stats calculations from the current visible dataset or general indicators
    const statsSummary = React.useMemo(() => {
        let authLogsCount = 0;
        let priceLogsCount = 0;
        let criticalLogsCount = 0;
        let failedLogsCount = 0;

        logs.forEach(log => {
            if (log.category === 'autenticacion') authLogsCount++;
            if (log.category === 'precios') priceLogsCount++;
            if (log.severity === 'critical') criticalLogsCount++;
            if (log.status === 'failed') failedLogsCount++;
        });

        return { authLogsCount, priceLogsCount, criticalLogsCount, failedLogsCount };
    }, [logs]);

    const getCategoryBadge = (category: string) => {
        switch (category) {
            case 'autenticacion':
                return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:bg-purple-500/5 dark:text-purple-400 rounded-lg">Seguridad</span>;
            case 'usuarios':
                return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:bg-blue-500/5 dark:text-blue-400 rounded-lg">Usuarios</span>;
            case 'productos':
                return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/5 dark:text-indigo-400 rounded-lg">Productos</span>;
            case 'precios':
                return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:bg-amber-500/5 dark:text-amber-400 rounded-lg">Precios/Costos</span>;
            case 'inventario':
                return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/5 dark:text-emerald-400 rounded-lg">Inventario</span>;
            case 'ventas':
                return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-pink-500/10 text-pink-600 dark:bg-pink-500/5 dark:text-pink-400 rounded-lg">Ventas</span>;
            case 'configuracion':
                return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/5 dark:text-cyan-400 rounded-lg">Configuración</span>;
            default:
                return <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 rounded-lg">Sistema</span>;
        }
    };

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'info':
                return <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase bg-sky-500/10 text-sky-600 rounded-md">Baja</span>;
            case 'warning':
                return <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase bg-amber-500/10 text-amber-600 rounded-md">Media</span>;
            case 'critical':
                return <span className="px-2 py-0.5 text-[9px] font-black uppercase bg-red-500/15 text-red-600 dark:bg-red-500/10 dark:text-red-400 rounded-md animate-pulse">Crítica</span>;
            default:
                return <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase bg-slate-100 text-slate-500 rounded-md">Info</span>;
        }
    };

    const getStatusIcon = (status: string) => {
        if (status === 'success') {
            return <CheckCircle className="text-emerald-500 shrink-0" size={15} title="Éxito" />;
        }
        return <XCircle className="text-rose-500 shrink-0" size={15} title="Fallo" />;
    };

    const exportToCSV = () => {
        try {
            const headers = ['UUID', 'Fecha/Hora', 'Categoría', 'Tipo de Evento', 'Acción', 'Criticidad', 'Resultado', 'Responsable', 'Rol', 'Entidad Afectada', 'ID Entidad', 'Motivo', 'Detalle Técnico'];
            const rows = logs.map(log => [
                log.id,
                new Date(log.created_at).toLocaleString(),
                log.category,
                log.event_type,
                log.action,
                log.severity,
                log.status,
                log.user_name || 'Sistema',
                log.user_role || 'system',
                log.entity_name || '',
                log.entity_id || '',
                log.reason || '',
                log.metadata || ''
            ]);
            
            const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
                + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `auditoria_sistema_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showNotification('Auditoría avanzada exportada con éxito', 'success');
        } catch (e) {
            showNotification('Error al exportar los datos a CSV', 'error');
        }
    };

    const exportToJSON = () => {
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `reporte_seguridad_auditoria_${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            document.body.removeChild(downloadAnchor);
            showNotification('Reporte JSON de seguridad exportado correctamente', 'success');
        } catch (e) {
            showNotification('Error al exportar reporte JSON', 'error');
        }
    };

    // Helper to render parsed before/after comparisons dynamically inside modal
    const renderComparisonFields = (log: any) => {
        let before: any = null;
        let after: any = null;
        let changed: any = null;

        try {
            before = typeof log.before_data === 'string' ? JSON.parse(log.before_data) : log.before_data;
            after = typeof log.after_data === 'string' ? JSON.parse(log.after_data) : log.after_data;
            changed = typeof log.changed_fields === 'string' ? JSON.parse(log.changed_fields) : log.changed_fields;
        } catch (e) {
            console.error("JSON parsing error on details view", e);
        }

        const qBefore = log.quantity_before !== undefined && log.quantity_before !== null ? log.quantity_before : (log.quantityBefore !== undefined ? log.quantityBefore : null);
        const qChanged = log.quantity_changed !== undefined && log.quantity_changed !== null ? log.quantity_changed : (log.quantityChanged !== undefined ? log.quantityChanged : null);
        const qAfter = log.quantity_after !== undefined && log.quantity_after !== null ? log.quantity_after : (log.quantityAfter !== undefined ? log.quantityAfter : null);
        const pBefore = log.price_before !== undefined && log.price_before !== null ? log.price_before : (log.priceBefore !== undefined ? log.priceBefore : null);
        const pAfter = log.price_after !== undefined && log.price_after !== null ? log.price_after : (log.priceAfter !== undefined ? log.priceAfter : null);

        const hasStockData = qBefore !== null || qChanged !== null || qAfter !== null;
        const hasPriceData = pBefore !== null || pAfter !== null;

        // Custom UI for stock/inventory traceability
        let stockVisualCard = null;
        if (hasStockData) {
            const isPositive = qChanged !== null && qChanged >= 0;
            stockVisualCard = (
                <div className="flex flex-col gap-3 bg-slate-55 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-2xl p-4.5">
                    <div className="flex items-center justify-between border-b border-slate-200/40 dark:border-slate-800/40 pb-2.5">
                        <span className="text-[10.5px] font-extrabold uppercase tracking-widest text-indigo-500 flex items-center gap-1.5">
                            <Database size={13} className="text-indigo-500" />
                            Trazabilidad de Inventario (Existencias)
                        </span>
                        {log.entity_name && (
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 max-w-[200px] truncate" title={log.entity_name}>
                                {log.entity_name}
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-1.5">
                        {/* 1. Stock Previo */}
                        <div className="bg-white dark:bg-[#0c111e] border border-slate-250/60 dark:border-slate-850/50 rounded-xl p-3 flex flex-col justify-between shadow-xs">
                            <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
                                <span className="text-[9px] font-bold uppercase tracking-wider">Unidades Antes</span>
                                <ClipboardList size={14} className="opacity-80" />
                            </div>
                            <div className="mt-2.5 flex items-baseline gap-1">
                                <span className="text-xl font-black text-slate-700 dark:text-slate-200">
                                    {qBefore !== null ? qBefore : '—'}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400">Uds</span>
                            </div>
                            <span className="text-[8px] text-slate-400 mt-1 block">Existencias previas en almacén</span>
                        </div>

                        {/* 2. Cantidad que Ingresó / Cambio */}
                        <div className={`border rounded-xl p-3 flex flex-col justify-between shadow-xs ${
                            isPositive 
                                ? 'bg-emerald-500/5 border-emerald-500/20 dark:bg-emerald-500/5 dark:border-emerald-500/20' 
                                : 'bg-rose-500/5 border-rose-500/20 dark:bg-rose-500/5 dark:border-rose-500/20'
                        }`}>
                            <div className="flex items-center justify-between">
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {isPositive ? 'Cantidad Ingresada' : 'Cantidad Egresada'}
                                </span>
                                {isPositive ? (
                                    <ArrowUpRight size={14} className="text-emerald-500" />
                                ) : (
                                    <ArrowDownLeft size={14} className="text-rose-500" />
                                )}
                            </div>
                            <div className="mt-2.5 flex items-baseline gap-1">
                                <span className={`text-xl font-black ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {qChanged !== null ? `${isPositive ? '+' : ''}${qChanged}` : '—'}
                                </span>
                                <span className={`text-[9px] font-bold ${isPositive ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>Uds</span>
                            </div>
                            <span className="text-[8px] text-slate-400 mt-1 block">
                                {isPositive ? 'Unidades añadidas al stock físico' : 'Unidades reducidas del stock físico'}
                            </span>
                        </div>

                        {/* 3. Stock Posterior / Final */}
                        <div className="bg-white dark:bg-[#0c111e] border border-slate-250/60 dark:border-slate-850/50 rounded-xl p-3 flex flex-col justify-between shadow-xs">
                            <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
                                <span className="text-[9px] font-bold uppercase tracking-wider">Unidades Después</span>
                                <CheckCircle size={14} className="text-indigo-500/80" />
                            </div>
                            <div className="mt-2.5 flex items-baseline gap-1">
                                <span className="text-xl font-black text-slate-850 dark:text-slate-100">
                                    {qAfter !== null ? qAfter : '—'}
                                </span>
                                <span className="text-[9px] font-bold text-slate-450 dark:text-slate-400">Uds</span>
                            </div>
                            <span className="text-[8px] text-slate-400 mt-1 block font-semibold text-indigo-500 dark:text-indigo-400">Balance final auditado</span>
                        </div>
                    </div>
                </div>
            );
        }

        // Custom UI for price/cost changes
        let priceVisualCard = null;
        if (hasPriceData) {
            priceVisualCard = (
                <div className="flex flex-col gap-3 bg-slate-55 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-2xl p-4.5">
                    <div className="flex items-center justify-between border-b border-slate-200/40 dark:border-slate-800/40 pb-2.5">
                        <span className="text-[10.5px] font-extrabold uppercase tracking-widest text-emerald-500 flex items-center gap-1.5">
                            <Coins size={13} className="text-emerald-500" />
                            Historial / Ajuste de Costos y Precios
                        </span>
                    </div>

                    <div className="flex items-center justify-center gap-8 py-3 bg-white dark:bg-[#0c111e] border border-slate-250/60 dark:border-slate-850/50 rounded-xl shadow-xs font-semibold">
                        {pBefore !== null && (
                            <div className="flex flex-col items-center">
                                <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider">Valor Anterior</span>
                                <span className="text-sm font-bold text-slate-500 line-through mt-1">
                                    ${Number(pBefore).toFixed(2)} USD
                                </span>
                            </div>
                        )}

                        {pBefore !== null && pAfter !== null && (
                            <ArrowRight size={16} className="text-slate-350 dark:text-slate-500 animate-pulse" />
                        )}

                        {pAfter !== null && (
                            <div className="flex flex-col items-center">
                                <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-wider">Valor Nuevo (Actual)</span>
                                <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
                                    ${Number(pAfter).toFixed(2)} USD
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // Return combined visual cards and structured table if there are changed fields
        if (hasStockData || hasPriceData || (changed && Object.keys(changed).length > 0)) {
            return (
                <div className="flex flex-col gap-4">
                    {stockVisualCard}
                    {priceVisualCard}

                    {changed && Object.keys(changed).length > 0 && (
                        <div className="flex flex-col gap-2.5">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Campos Adicionales Modificados</span>
                            <div className="grid grid-cols-1 gap-2 border border-slate-200/85 dark:border-slate-850/60 rounded-xl overflow-hidden text-xs bg-white dark:bg-[#0c111e]">
                                <div className="grid grid-cols-3 bg-slate-50 dark:bg-[#070c14] px-4 py-2 font-mono text-[9px] font-black uppercase text-slate-400 border-b border-slate-200/60 dark:border-slate-850/40">
                                    <span>Propiedad</span>
                                    <span>Valor Anterior</span>
                                    <span>Valor Nuevo</span>
                                </div>
                                {Object.entries(changed).map(([key, value]: [string, any]) => {
                                    let beforeVal = value?.before;
                                    let afterVal = value?.after;
                                    if (typeof beforeVal === 'object') beforeVal = JSON.stringify(beforeVal);
                                    if (typeof afterVal === 'object') afterVal = JSON.stringify(afterVal);
                                    return (
                                        <div key={key} className="grid grid-cols-3 px-4 py-2 border-b border-slate-100 dark:border-slate-850 last:border-0 font-semibold items-center">
                                            <span className="font-mono text-indigo-500 dark:text-indigo-400 truncate pr-1">{key}</span>
                                            <span className="text-red-500 line-through truncate pr-2">{String(beforeVal !== undefined ? beforeVal : '—')}</span>
                                            <span className="text-emerald-500 truncate">{String(afterVal !== undefined ? afterVal : '—')}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {!changed && (before || after) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-50 dark:bg-[#070c14] p-4 rounded-xl border border-slate-200/60 dark:border-slate-850/40">
                                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-2 font-mono">Estado Anterior (Antes)</span>
                                {before ? (
                                    <pre className="text-[10.5px] font-mono text-slate-600 dark:text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                        {JSON.stringify(before, null, 2)}
                                    </pre>
                                ) : (
                                    <span className="text-[11px] text-slate-400 italic">No se registraron datos previos</span>
                                )}
                            </div>
                            <div className="bg-slate-50 dark:bg-[#070c14] p-4 rounded-xl border border-slate-200/60 dark:border-slate-850/40">
                                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-2 font-mono">Estado Posterior (Después)</span>
                                {after ? (
                                    <pre className="text-[10.5px] font-mono text-slate-600 dark:text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                        {JSON.stringify(after, null, 2)}
                                    </pre>
                                ) : (
                                    <span className="text-[11px] text-slate-400 italic">No se registraron cambios posteriores</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="bg-slate-50 dark:bg-[#070c14] p-4 rounded-xl text-center italic text-slate-400 text-xs">
                No hay diferencias de estado disponibles para este evento.
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col gap-6 p-6 overflow-y-auto bg-slate-50 dark:bg-[#070c14] text-slate-800 dark:text-slate-100">
            {/* Header section */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-xl font-black uppercase tracking-wider flex items-center gap-2.5">
                        <History className="text-indigo-600 dark:text-indigo-400" size={24} />
                        Registro de Actividad y Auditoría
                    </h1>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-bold flex items-center gap-1">
                        <ShieldCheck className="text-emerald-500 shrink-0" size={13} />
                        Captura detallada de quién realizó cada cambio importante en el inventario, caja y acciones del sistema.
                    </p>
                </div>

                {/* Tab selector */}
                <div className="flex items-center gap-2 w-full lg:w-auto">
                    <div className="bg-white dark:bg-[#0c111e] p-1 rounded-xl border border-slate-200/60 dark:border-slate-850/40 flex w-full lg:w-auto">
                        <button
                            onClick={() => { setActiveTab('general'); resetFilters(); }}
                            className={`flex-1 lg:flex-none px-4 py-2 text-xs font-black rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'general' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                        >
                            <ClipboardList size={14} />
                            Bitácora General
                        </button>
                        <button
                            onClick={() => { setActiveTab('precios'); resetFilters(); }}
                            className={`flex-1 lg:flex-none px-4 py-2 text-xs font-black rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'precios' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                        >
                            <Coins size={14} />
                            Historial de Precios
                        </button>
                    </div>

                    <button 
                        onClick={fetchLogs}
                        className="p-2.5 bg-white dark:bg-[#0c111e] border border-slate-200/60 dark:border-slate-850/40 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-105"
                        title="Actualizar Bitácora"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                    
                    <button
                        onClick={exportToCSV}
                        className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-black rounded-xl shadow-md border border-emerald-500/15 flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105 uppercase tracking-wide"
                        title="Exportar bitácora a formato CSV (Excel)"
                    >
                        <FileSpreadsheet size={13} />
                        CSV
                    </button>

                    <button
                        onClick={exportToJSON}
                        className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-black rounded-xl shadow-md border border-slate-700/30 flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105 uppercase tracking-wide"
                        title="Exportar reporte estructurado en formato JSON"
                    >
                        <Download size={13} />
                        JSON
                    </button>
                </div>
            </div>

            {/* Quick Presets Bar for Security & Audit */}
            <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-[#0c111e] p-2.5 rounded-2xl border border-slate-200/60 dark:border-slate-850/40 shadow-xs text-xs font-bold">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 px-2 flex items-center gap-1">
                    <Filter size={11} className="text-indigo-500" /> Presets Rápidos:
                </span>

                <button
                    onClick={() => {
                        resetFilters();
                        setSeverityFilter('critical');
                    }}
                    className={`px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 text-[11px] font-black ${
                        severityFilter === 'critical' 
                            ? 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400 shadow-xs' 
                            : 'bg-slate-50 dark:bg-black/30 border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-red-400'
                    }`}
                >
                    <ShieldAlert size={12} className="text-red-500" /> Eventos Críticos ({statsSummary.criticalLogsCount})
                </button>

                <button
                    onClick={() => {
                        resetFilters();
                        setCategoryFilter('autenticacion');
                    }}
                    className={`px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 text-[11px] font-black ${
                        categoryFilter === 'autenticacion' 
                            ? 'bg-purple-500/15 border-purple-500/40 text-purple-600 dark:text-purple-400 shadow-xs' 
                            : 'bg-slate-50 dark:bg-black/30 border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-purple-400'
                    }`}
                >
                    <User size={12} className="text-purple-500" /> Seguridad & Accesos ({statsSummary.authLogsCount})
                </button>

                <button
                    onClick={() => {
                        resetFilters();
                        setStatusFilter('failed');
                    }}
                    className={`px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 text-[11px] font-black ${
                        statusFilter === 'failed' 
                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 shadow-xs' 
                            : 'bg-slate-50 dark:bg-black/30 border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-rose-400'
                    }`}
                >
                    <XCircle size={12} className="text-rose-500" /> Intentos Denegados / Fallos ({statsSummary.failedLogsCount})
                </button>

                {(severityFilter !== 'todos' || categoryFilter !== 'todos' || statusFilter !== 'todos' || userFilter !== 'todos' || searchTerm !== '') && (
                    <button
                        onClick={resetFilters}
                        className="ml-auto px-3 py-1.5 bg-slate-150 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider"
                    >
                        <RefreshCw size={11} /> Limpiar Filtros
                    </button>
                )}
            </div>

            {/* General Tab */}
            {activeTab === 'general' && (
                <>
                    {/* Key Stats Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-[#0c111e] rounded-2xl border border-slate-200/60 dark:border-slate-850/40 p-4.5 flex items-center gap-4 shadow-sm">
                            <div className="p-3 bg-red-500/10 text-red-600 dark:bg-red-500/5 dark:text-red-400 rounded-xl">
                                <ShieldAlert size={20} className="animate-pulse" />
                            </div>
                            <div>
                                <span className="text-[9px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider block">Operaciones Críticas</span>
                                <h3 className="text-xl font-black font-mono mt-0.5 text-red-600 dark:text-red-400">{statsSummary.criticalLogsCount} <span className="text-[10px] text-slate-400 font-bold">eventos</span></h3>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#0c111e] rounded-2xl border border-slate-200/60 dark:border-slate-850/40 p-4.5 flex items-center gap-4 shadow-sm">
                            <div className="p-3 bg-purple-500/10 text-purple-600 dark:bg-purple-500/5 dark:text-purple-400 rounded-xl">
                                <User size={20} />
                            </div>
                            <div>
                                <span className="text-[9px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider block">Accesos de Seguridad</span>
                                <h3 className="text-xl font-black font-mono mt-0.5 text-purple-600 dark:text-purple-400">{statsSummary.authLogsCount} <span className="text-[10px] text-slate-400 font-bold">ingresos</span></h3>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#0c111e] rounded-2xl border border-slate-200/60 dark:border-slate-850/40 p-4.5 flex items-center gap-4 shadow-sm">
                            <div className="p-3 bg-amber-500/10 text-amber-600 dark:bg-amber-500/5 dark:text-amber-400 rounded-xl">
                                <Coins size={20} />
                            </div>
                            <div>
                                <span className="text-[9px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider block">Ajustes de Precios</span>
                                <h3 className="text-xl font-black font-mono mt-0.5 text-amber-600 dark:text-amber-400">{statsSummary.priceLogsCount} <span className="text-[10px] text-slate-400 font-bold">cambios</span></h3>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#0c111e] rounded-2xl border border-slate-200/60 dark:border-slate-850/40 p-4.5 flex items-center gap-4 shadow-sm">
                            <div className="p-3 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-xl">
                                <Database size={20} />
                            </div>
                            <div>
                                <span className="text-[9px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider block">Registros Totales</span>
                                <h3 className="text-xl font-black font-mono mt-0.5">{totalRecords} <span className="text-[10px] text-slate-400 font-bold">filas</span></h3>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Filter Panel */}
                    <form onSubmit={triggerSearch} className="bg-white dark:bg-[#0c111e] rounded-2xl border border-slate-200/60 dark:border-slate-850/40 p-4 flex flex-col gap-4 shadow-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                            {/* General Search Input */}
                            <div className="relative col-span-1 sm:col-span-2">
                                <Search className="absolute left-3 top-3.5 text-slate-400" size={13} />
                                <input
                                    type="text"
                                    placeholder="Buscar por motivo, ticket, acción o tipo de evento..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-8.5 pr-3 py-2.5 bg-slate-50 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-450 dark:placeholder:text-slate-600"
                                />
                            </div>

                            {/* Category Filter */}
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-xl px-3">
                                <Filter className="text-slate-400 shrink-0" size={13} />
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                                    className="w-full bg-transparent border-none text-xs font-semibold py-2.5 focus:outline-none cursor-pointer text-slate-700 dark:text-slate-350"
                                >
                                    <option value="todos">Todas las categorías</option>
                                    <option value="autenticacion">Seguridad y Accesos</option>
                                    <option value="usuarios">Gestión de Usuarios</option>
                                    <option value="productos">Gestión de Productos</option>
                                    <option value="precios">Historial de Precios/Costos</option>
                                    <option value="inventario">Ajustes e Inventario</option>
                                    <option value="ventas">Ventas y Facturación</option>
                                    <option value="caja">Cajas y Arqueos</option>
                                    <option value="configuracion">Configuración del Sistema</option>
                                    <option value="error">Errores y Alertas</option>
                                </select>
                            </div>

                            {/* Severity Filter */}
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-xl px-3">
                                <AlertTriangle className="text-slate-400 shrink-0" size={13} />
                                <select
                                    value={severityFilter}
                                    onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
                                    className="w-full bg-transparent border-none text-xs font-semibold py-2.5 focus:outline-none cursor-pointer text-slate-700 dark:text-slate-350"
                                >
                                    <option value="todos">Todas las criticidades</option>
                                    <option value="info">Baja (Informativo)</option>
                                    <option value="warning">Media (Precaución)</option>
                                    <option value="critical">Crítica (Sensibles)</option>
                                </select>
                            </div>

                            {/* User Filter */}
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-xl px-3">
                                <User className="text-slate-400 shrink-0" size={13} />
                                <select
                                    value={userFilter}
                                    onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}
                                    className="w-full bg-transparent border-none text-xs font-semibold py-2.5 focus:outline-none cursor-pointer uppercase text-slate-700 dark:text-slate-350"
                                >
                                    <option value="todos">Todos los usuarios</option>
                                    {uniqueUsers.map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Filter */}
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-xl px-3">
                                <CheckCircle className="text-slate-400 shrink-0" size={13} />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                                    className="w-full bg-transparent border-none text-xs font-semibold py-2.5 focus:outline-none cursor-pointer text-slate-700 dark:text-slate-350"
                                >
                                    <option value="todos">Todos los resultados</option>
                                    <option value="success">Operación Éxito</option>
                                    <option value="failed">Operación Rechazo</option>
                                </select>
                            </div>
                        </div>

                        {/* Date Pickers & Search Row */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-t border-slate-100 dark:border-slate-850 pt-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full sm:w-auto">
                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-xl px-3 text-xs">
                                    <span className="text-slate-400 font-extrabold uppercase shrink-0 text-[10px]">Desde</span>
                                    <input 
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                                        className="bg-transparent border-none py-2 focus:outline-none w-full text-slate-700 dark:text-slate-350"
                                    />
                                </div>
                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-xl px-3 text-xs">
                                    <span className="text-slate-400 font-extrabold uppercase shrink-0 text-[10px]">Hasta</span>
                                    <input 
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                                        className="bg-transparent border-none py-2 focus:outline-none w-full text-slate-700 dark:text-slate-350"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2 w-full sm:w-auto justify-end">
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="px-4 py-2.5 bg-slate-100 dark:bg-[#12192d] text-slate-600 dark:text-slate-350 hover:bg-slate-200 dark:hover:bg-[#1b253f] text-xs font-black uppercase rounded-xl transition-all cursor-pointer"
                                >
                                    Limpiar
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-black uppercase rounded-xl shadow-md cursor-pointer transition-all hover:scale-[1.02]"
                                >
                                    Aplicar Filtros
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Table View */}
                    <div className="bg-white dark:bg-[#0c111e] rounded-3xl border border-slate-200/60 dark:border-slate-850/40 overflow-hidden shadow-sm flex-1 flex flex-col min-h-[400px]">
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr className="bg-slate-50/75 dark:bg-[#070c14]/50 border-b border-slate-100 dark:border-slate-850">
                                        <th className="px-5 py-3.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">Timestamp</th>
                                        <th className="px-5 py-3.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">Categoría</th>
                                        <th className="px-5 py-3.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">Acción</th>
                                        <th className="px-5 py-3.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">Responsable</th>
                                        <th className="px-5 py-3.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">Entidad Afectada</th>
                                        <th className="px-5 py-3.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">Criticidad</th>
                                        <th className="px-5 py-3.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 font-mono text-center">Estado</th>
                                        <th className="px-5 py-3.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 font-mono text-center">Detalle</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/50 dark:divide-slate-850/60 text-xs font-semibold">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={8} className="text-center py-20">
                                                <div className="flex flex-col items-center gap-2">
                                                    <RefreshCw size={24} className="text-indigo-500 animate-spin" />
                                                    <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-widest mt-1">Cargando bitácora inmutable...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : logs.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="text-center py-20 text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider">
                                                No se encontraron registros de auditoría avanzados.
                                            </td>
                                        </tr>
                                    ) : (
                                        logs.map((log) => {
                                            return (
                                                <tr 
                                                    key={log.id} 
                                                    className="hover:bg-slate-50/50 dark:hover:bg-[#070c14]/15 transition duration-150"
                                                >
                                                    <td className="px-5 py-3.5 text-[11px] whitespace-nowrap font-mono text-slate-500">
                                                        {new Date(log.created_at).toLocaleString()}
                                                    </td>

                                                    <td className="px-5 py-3.5 whitespace-nowrap">
                                                        {getCategoryBadge(log.category)}
                                                    </td>

                                                    <td className="px-5 py-3.5">
                                                        <div className="flex flex-col">
                                                            <span className="text-slate-800 dark:text-slate-200 font-black uppercase text-[10px] leading-tight">{log.action || 'Operación'}</span>
                                                            <span className="font-mono text-[9px] text-slate-400 mt-0.5">{log.event_type}</span>
                                                        </div>
                                                    </td>

                                                    <td className="px-5 py-3.5 whitespace-nowrap">
                                                        <div className="flex items-center gap-1.5 uppercase text-[10px] font-black text-slate-600 dark:text-slate-350">
                                                            <div className="w-5 h-5 bg-slate-100 dark:bg-[#12192d] rounded-full flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-800">
                                                                <User size={10} />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span>{log.user_name || 'Sistema'}</span>
                                                                <span className="text-[8px] text-slate-400 font-normal lowercase">{log.user_role || 'cajero'}</span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-5 py-3.5">
                                                        <div className="flex flex-col max-w-[180px] truncate">
                                                            <span className="text-slate-800 dark:text-slate-200 font-extrabold uppercase leading-tight truncate">{log.entity_name || 'N/A'}</span>
                                                            <span className="font-mono text-[8.5px] text-slate-400 mt-0.5">{log.entity_type ? `${log.entity_type} ID: ${log.entity_id || '?'}` : 'sin entidad'}</span>
                                                        </div>
                                                    </td>

                                                    <td className="px-5 py-3.5 whitespace-nowrap">
                                                        {getSeverityBadge(log.severity)}
                                                    </td>

                                                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                                                        <div className="flex justify-center">
                                                            {getStatusIcon(log.status)}
                                                        </div>
                                                    </td>

                                                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                                                        <button
                                                            onClick={() => { setSelectedLog(log); setShowDetailModal(true); }}
                                                            className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#12192d] dark:hover:bg-[#1b253f] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-all inline-flex items-center gap-1"
                                                        >
                                                            <Eye size={12} />
                                                            <span className="text-[9px] font-black uppercase">Ver</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* High-Performance Pagination Footer */}
                        {!loading && logs.length > 0 && (
                            <div className="bg-slate-50/50 dark:bg-[#070c14]/30 px-6 py-4.5 border-t border-slate-100 dark:border-slate-850 flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider font-mono shrink-0">
                                <div className="flex items-center gap-1">
                                    <span>Mostrando {(page-1)*limit + 1} - {Math.min(page*limit, totalRecords)} de {totalRecords} registros</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5 bg-white dark:bg-[#0c111e] border border-slate-200/60 dark:border-slate-850/40 rounded-xl px-2">
                                        <span className="text-[9px] text-slate-400">Filas:</span>
                                        <select
                                            value={limit}
                                            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                                            className="bg-transparent border-none py-1.5 focus:outline-none font-bold text-xs"
                                        >
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <button
                                            disabled={page === 1}
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            className="p-1.5 rounded-lg border border-slate-200/60 dark:border-slate-850/40 bg-white dark:bg-[#0c111e] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-500 dark:text-slate-400"
                                        >
                                            <ChevronLeft size={14} />
                                        </button>
                                        <span className="text-xs px-2 py-1 font-bold">Pág. {page} de {totalPages}</span>
                                        <button
                                            disabled={page === totalPages}
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            className="p-1.5 rounded-lg border border-slate-200/60 dark:border-slate-850/40 bg-white dark:bg-[#0c111e] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-500 dark:text-slate-400"
                                        >
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Price Change History Tab */}
            {activeTab === 'precios' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start">
                    {/* Left Panel: Selector & Stats */}
                    <div className="lg:col-span-1 flex flex-col gap-4">
                        <div className="bg-white dark:bg-[#0c111e] rounded-2xl border border-slate-200/60 dark:border-slate-850/40 p-5 shadow-sm">
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-3.5 block">Selección de Producto</span>
                            <div className="flex flex-col gap-3">
                                <label className="text-[10.5px] font-extrabold text-slate-450 uppercase">Producto para auditar precios</label>
                                <select
                                    value={selectedProductId}
                                    onChange={(e) => {
                                        setSelectedProductId(e.target.value);
                                        fetchProductPriceHistory(e.target.value);
                                    }}
                                    className="w-full bg-slate-50 dark:bg-[#070c14] border border-slate-200/80 dark:border-slate-850/60 rounded-xl text-xs font-semibold py-3 px-3 focus:outline-none focus:border-indigo-500 cursor-pointer"
                                >
                                    <option value="">Seleccione un producto...</option>
                                    {allProductsList.map((p: any) => (
                                        <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedProductId && (
                                <div className="border-t border-slate-100 dark:border-slate-850 mt-5 pt-4 flex flex-col gap-2">
                                    <span className="text-[9px] font-extrabold uppercase text-slate-400 font-mono">Estatus Actual en Inventario</span>
                                    {allProductsList.filter(p => String(p.id) === String(selectedProductId)).map((p: any) => (
                                        <div key={p.id} className="flex flex-col gap-1.5 mt-1">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-slate-400 font-semibold">Precio Unidad:</span>
                                                <span className="font-bold text-slate-800 dark:text-slate-100">${Number(p.price_unit).toFixed(2)} USD</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-slate-400 font-semibold">Precio Mayorista:</span>
                                                <span className="font-bold text-slate-800 dark:text-slate-100">${Number(p.price_bulk).toFixed(2)} USD</span>
                                            </div>
                                            {user?.role === 'admin' && (
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-400 font-semibold">Costo Compra:</span>
                                                    <span className="font-bold text-red-500 dark:text-red-400">${Number(p.price_cost || 0).toFixed(2)} USD</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-xs">
                                                <span className="text-slate-400 font-semibold">Stock Físico:</span>
                                                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{p.stock} pz</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-white dark:bg-[#0c111e] rounded-2xl border border-slate-200/60 dark:border-slate-850/40 p-4 shadow-sm text-xs">
                            <h4 className="font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                                <Info size={14} className="text-indigo-500" />
                                Acerca de Precios
                            </h4>
                            <p className="text-slate-400 leading-relaxed font-semibold">
                                Todo cambio de precio unitario, precio mayorista o costo unitario del producto queda registrado en el historial de precios por motivos de trazabilidad fiscal y auditoría de márgenes comerciales.
                            </p>
                        </div>
                    </div>

                    {/* Right Panel: Detailed Timeline */}
                    <div className="lg:col-span-2 bg-white dark:bg-[#0c111e] rounded-3xl border border-slate-200/60 dark:border-slate-850/40 p-6 shadow-sm min-h-[400px] flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-5 block">Cronología del Historial de Precios</span>

                        {loadingPriceHistory ? (
                            <div className="flex-1 flex flex-col justify-center items-center py-20 gap-2">
                                <RefreshCw className="text-indigo-500 animate-spin" size={24} />
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Buscando variaciones históricas...</span>
                            </div>
                        ) : !selectedProductId ? (
                            <div className="flex-1 flex flex-col justify-center items-center py-20 text-center text-slate-400 font-black uppercase text-xs tracking-wider border-2 border-dashed border-slate-100 dark:border-slate-850 rounded-2xl">
                                Seleccione un producto a la izquierda para cargar su historial de precios y variaciones.
                            </div>
                        ) : priceHistory.length === 0 ? (
                            <div className="flex-1 flex flex-col justify-center items-center py-20 text-center text-slate-400 font-black uppercase text-xs tracking-wider border-2 border-dashed border-slate-100 dark:border-slate-850 rounded-2xl">
                                No se encontraron registros de cambio de precio/costo específicos para este producto.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-6 relative pl-5 border-l border-slate-200/80 dark:border-slate-850/60 ml-2 py-2 flex-1">
                                {(user?.role === 'admin' ? priceHistory : priceHistory.filter(log => log.event_type !== 'cambio_costo')).length === 0 ? (
                                    <div className="flex-1 flex flex-col justify-center items-center py-10 text-center text-slate-400 font-black uppercase text-xs tracking-wider">
                                        No hay registros de cambios de precio visibles.
                                    </div>
                                ) : (
                                    (user?.role === 'admin' ? priceHistory : priceHistory.filter(log => log.event_type !== 'cambio_costo')).map((historyLog) => {
                                        const isCostChange = historyLog.event_type === 'cambio_costo';
                                        const beforeData = typeof historyLog.before_data === 'string' ? JSON.parse(historyLog.before_data || '{}') : (historyLog.before_data || {});
                                        const afterData = typeof historyLog.after_data === 'string' ? JSON.parse(historyLog.after_data || '{}') : (historyLog.after_data || {});
                                    
                                    const prevPrice = isCostChange ? (beforeData.price_cost || historyLog.price_before) : (beforeData.price_unit || historyLog.price_before);
                                    const newPrice = isCostChange ? (afterData.price_cost || historyLog.price_after) : (afterData.price_unit || historyLog.price_after);

                                    return (
                                        <div key={historyLog.id} className="relative group">
                                            {/* Bullet circle on line */}
                                            <div className={`absolute -left-[26px] top-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#0c111e] transition-all group-hover:scale-125 ${isCostChange ? 'bg-red-500' : 'bg-indigo-500'}`} />

                                            <div className="bg-slate-50 dark:bg-[#070c14] rounded-2xl p-4 border border-slate-200/60 dark:border-slate-850/40 hover:border-indigo-500/45 dark:hover:border-indigo-400/40 transition duration-150">
                                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2.5 mb-2 border-b border-slate-100 dark:border-slate-850 pb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-[10px] text-slate-450 dark:text-slate-500">{new Date(historyLog.created_at).toLocaleString()}</span>
                                                        <span className={`px-2 py-0.5 text-[8.5px] font-black uppercase rounded-md ${isCostChange ? 'bg-red-500/10 text-red-600 dark:bg-red-500/5' : 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/5 dark:text-indigo-400'}`}>
                                                            {isCostChange ? 'Costo Compra' : 'Precio Venta'}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 font-extrabold uppercase flex items-center gap-1">
                                                        <User size={11} />
                                                        {historyLog.user_name || 'admin'} ({historyLog.user_role || 'admin'})
                                                    </span>
                                                </div>

                                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                                                    <div className="flex items-center gap-3 font-mono">
                                                        <div className="flex flex-col">
                                                            <span className="text-[8.5px] text-slate-400 font-extrabold uppercase font-sans">Anterior</span>
                                                            <span className="text-sm font-bold text-slate-500 line-through">${Number(prevPrice || 0).toFixed(2)} USD</span>
                                                        </div>
                                                        <ArrowRight className="text-slate-400 self-end mb-1" size={14} />
                                                        <div className="flex flex-col">
                                                            <span className="text-[8.5px] text-slate-450 dark:text-indigo-450 font-extrabold uppercase font-sans">Nuevo</span>
                                                            <span className={`text-base font-black ${isCostChange ? 'text-red-500' : 'text-emerald-500'}`}>${Number(newPrice || 0).toFixed(2)} USD</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col">
                                                        <span className="text-[8.5px] text-slate-400 font-extrabold uppercase">Motivo reportado</span>
                                                        <span className="text-slate-600 dark:text-slate-300 font-semibold mt-0.5 max-w-sm italic">"{historyLog.reason || 'Modificación general de datos en panel.'}"</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Audit Details Modal (Drawer style) */}
            <AnimatePresence>
                {showDetailModal && selectedLog && (
                    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
                        {/* Backdrop closer click */}
                        <div className="absolute inset-0" onClick={() => setShowDetailModal(false)} />

                        {/* Drawer body container */}
                        <motion.div 
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                            className="relative w-full max-w-2xl h-full bg-white dark:bg-[#0c111e] border-l border-slate-200 dark:border-slate-850 shadow-2xl flex flex-col p-6 overflow-y-auto"
                        >
                            {/* Modal Header */}
                            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-850 pb-4 mb-5">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <History className="text-indigo-600 dark:text-indigo-400" size={18} />
                                        <h2 className="text-base font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                                            Detalles de Auditoría Avanzada
                                        </h2>
                                    </div>
                                    <span className="font-mono text-[9px] text-slate-450 dark:text-slate-500 mt-1 uppercase">ID del Registro: {selectedLog.id}</span>
                                </div>
                                <button 
                                    onClick={() => setShowDetailModal(false)}
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-[#12192d] dark:hover:bg-[#1b253f] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-all"
                                >
                                    <XCircle size={16} />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="flex flex-col gap-6 flex-1">
                                {/* Action Banner */}
                                <div className="bg-slate-50 dark:bg-[#070c14] rounded-2xl p-4 border border-slate-200/60 dark:border-slate-850/40 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[8.5px] text-slate-400 font-extrabold uppercase block font-mono">Evento / Acción</span>
                                        <span className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase">{selectedLog.action || 'Operación'}</span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {getCategoryBadge(selectedLog.category)}
                                            {getSeverityBadge(selectedLog.severity)}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <span className="text-[8.5px] text-slate-400 font-extrabold uppercase block font-mono">Fecha y Hora (Local)</span>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">{new Date(selectedLog.created_at).toLocaleString()}</span>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase mt-1">
                                            <span>Resultado:</span>
                                            {selectedLog.status === 'success' ? (
                                                <span className="text-emerald-500 font-black uppercase flex items-center gap-0.5"><CheckCircle size={11} /> Autorizado</span>
                                            ) : (
                                                <span className="text-rose-500 font-black uppercase flex items-center gap-0.5"><XCircle size={11} /> Rechazado</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Motivo / Justificación */}
                                <div className="flex flex-col gap-1.5 bg-indigo-500/5 dark:bg-indigo-400/5 border border-indigo-500/10 dark:border-indigo-400/10 rounded-2xl p-4">
                                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-500 flex items-center gap-1">
                                        <Info size={11} />
                                        Motivo obligatorio registrado
                                    </span>
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 italic">
                                        "{selectedLog.reason || 'Operación estándar del sistema sin motivo ingresado.'}"
                                    </p>
                                </div>

                                {/* Responsibility Card */}
                                <div className="flex flex-col gap-2.5">
                                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Responsable de la Operación</span>
                                    <div className="bg-white dark:bg-[#0c111e] border border-slate-200/80 dark:border-slate-850/60 rounded-2xl p-4.5 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[8px] text-slate-400 font-extrabold uppercase">Usuario</span>
                                            <span className="text-slate-800 dark:text-slate-200 font-bold uppercase">{selectedLog.user_name || 'Sistema'}</span>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[8px] text-slate-400 font-extrabold uppercase">Rol</span>
                                            <span className="text-slate-850 dark:text-slate-400 font-extrabold uppercase">{selectedLog.user_role || 'system'}</span>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[8px] text-slate-400 font-extrabold uppercase">Dirección IP</span>
                                            <span className="font-mono text-slate-800 dark:text-slate-200 truncate" title={selectedLog.ip_address}>{selectedLog.ip_address || '127.0.0.1'}</span>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[8px] text-slate-400 font-extrabold uppercase">ID Sistema</span>
                                            <span className="font-mono text-slate-800 dark:text-slate-200">{selectedLog.user_id ? `ID: ${selectedLog.user_id}` : 'system'}</span>
                                        </div>
                                    </div>
                                    {selectedLog.user_agent && (
                                        <div className="bg-slate-50 dark:bg-[#070c14] border border-slate-200/60 dark:border-slate-850/40 rounded-xl px-4 py-2 font-mono text-[9px] text-slate-400 flex items-center gap-1.5 truncate">
                                            <Server size={11} className="shrink-0" />
                                            <span className="truncate" title={selectedLog.user_agent}>Navegador/Agente: {selectedLog.user_agent}</span>
                                        </div>
                                    )}
                                    {(selectedLog.correlation_id || selectedLog.transaction_id) && (
                                        <div className="bg-slate-50 dark:bg-[#070c14] border border-slate-200/60 dark:border-slate-850/40 rounded-xl px-4 py-2.5 font-mono text-[9px] text-slate-400 flex flex-col gap-1">
                                            {selectedLog.correlation_id && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-extrabold text-indigo-500 uppercase tracking-wider text-[8px] w-24 shrink-0">ID Correlación:</span>
                                                    <span className="select-all text-slate-600 dark:text-slate-350">{selectedLog.correlation_id}</span>
                                                </div>
                                            )}
                                            {selectedLog.transaction_id && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-extrabold text-indigo-500 uppercase tracking-wider text-[8px] w-24 shrink-0">ID Transacción:</span>
                                                    <span className="select-all text-slate-600 dark:text-slate-350">{selectedLog.transaction_id}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* State Changes Comparison */}
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Trazabilidad de Estados (Antes vs Después)</span>
                                        <button
                                            type="button"
                                            onClick={() => setViewRawJSON(!viewRawJSON)}
                                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-[#12192d] dark:hover:bg-[#1b253f] text-[9px] font-black uppercase rounded-lg cursor-pointer transition"
                                        >
                                            {viewRawJSON ? "Ver Estructurado" : "Ver JSON Crudo"}
                                        </button>
                                    </div>

                                    {viewRawJSON ? (
                                        <div className="bg-slate-900 text-slate-200 font-mono text-[10px] p-4 rounded-xl overflow-x-auto max-h-80 leading-relaxed">
                                            <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
                                        </div>
                                    ) : (
                                        renderComparisonFields(selectedLog)
                                    )}
                                </div>

                                {/* Security Compliance Shield */}
                                <div className="border-t border-slate-150 dark:border-slate-850 pt-5 mt-auto flex items-center justify-between text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">
                                    <div className="flex items-center gap-1">
                                        <ShieldCheck className="text-emerald-500" size={14} />
                                        <span>Inmutable y Conforme</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Settings size={14} />
                                        <span>GTR POS SECURE v3.2</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
