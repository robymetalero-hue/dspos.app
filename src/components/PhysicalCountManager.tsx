import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { safeDispatchEvent } from '../utils/events';
import { hasPermission } from '../utils/permissions';
import { 
  ClipboardCheck, Clock, CheckCircle, AlertTriangle, Play, X, Trash2, 
  Save, Eye, RefreshCw, Sparkles, Filter, Search, Check, Ban, ChevronDown, ChevronUp, AlertOctagon, Undo, ChevronRight, ShieldCheck, ShieldAlert, UserCheck, CheckSquare, Square, FileText
} from 'lucide-react';

interface PhysicalCountManagerProps {
  onClose?: () => void;
  externalViewMode?: 'blind' | 'quantities';
  embeddedMode?: boolean;
}

interface InventoryCount {
  id: number;
  user_id: number;
  username: string;
  auditor_name?: string;
  store_name?: string;
  mode?: 'BLIND' | 'STANDARD';
  override_segregation?: number;
  override_reason?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  status: 'en_progreso' | 'completado' | 'aprobado' | 'cerrado' | 'pausado' | 'finalizado' | 'cancelado';
  category_filter: string | null;
  approved_at: string | null;
  approved_by_username: string | null;
  is_blind_sanitized?: boolean;
}

interface CountItem {
  id: number;
  inventory_count_id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  product_category: string;
  system_stock?: number;
  expected_quantity?: number;
  live_stock?: number;
  counted_stock: number;
  physical_quantity?: number;
  difference?: number;
  is_checked: number;
  status: string;
  notes?: string | null;
  recount_requested?: number;
}

export default function PhysicalCountManager({ onClose, externalViewMode, embeddedMode = false }: PhysicalCountManagerProps) {
  const { user, products, fetchProducts, showNotification } = useAppContext();
  const isAdmin = user?.role === 'admin' || user?.role === 'propietario' || user?.role === 'administrador' || user?.role === 'dueño' || user?.role === 'jefe';
  const canPreviewQuantities = isAdmin || hasPermission(user, 'preview_quantities_in_count');

  // Bloqueo de scroll de fondo si no está embebido
  useEffect(() => {
    if (!embeddedMode) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [embeddedMode]);

  const [activeTab, setActiveTab] = useState<'activo' | 'historico'>('activo');
  const [activeSession, setActiveSession] = useState<InventoryCount | null>(null);
  const [sessionItems, setSessionItems] = useState<CountItem[]>([]);
  const [historicalCounts, setHistoricalCounts] = useState<InventoryCount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados para inicio de nueva sesión
  const [auditorName, setAuditorName] = useState<string>(user?.username || 'Auditor Almacén');
  const [storeName, setStoreName] = useState<string>('Almacén Principal');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [categories, setCategories] = useState<string[]>([]);
  const [isBlindMode, setIsBlindMode] = useState<boolean>(!isAdmin && !canPreviewQuantities);
  const [sessionNotes, setSessionNotes] = useState<string>('');

  // Advertencia de segregación de funciones
  const [overrideSegregation, setOverrideSegregation] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [segregationWarning, setSegregationWarning] = useState<string | null>(null);

  // Filtros del listado de conteo activo
  const [itemSearch, setItemSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'todos' | 'pendientes' | 'revisados' | 'diferencias'>('todos');
  const [hideRevisados, setHideRevisados] = useState(false);

  // Modal / Detalle de sesión histórica
  const [selectedHistoricCount, setSelectedHistoricCount] = useState<InventoryCount | null>(null);
  const [historicItems, setHistoricItems] = useState<CountItem[]>([]);

  // Notas del administrador para aprobación
  const [adminNotes, setAdminNotes] = useState('');

  // Carga inicial
  useEffect(() => {
    fetchProducts();
    fetchActiveSession();
    fetchHistory();
  }, [activeTab]);

  useEffect(() => {
    if (products && products.length > 0) {
      const uniqueCats = Array.from(new Set(products.map(p => p.category || 'Sin Categoría'))).filter(Boolean);
      setCategories(uniqueCats);
    }
  }, [products]);

  // Validar segregación de funciones para trabajadores
  useEffect(() => {
    if (!isAdmin && user?.username && auditorName) {
      const isOperatorSelfAuditing = auditorName.toLowerCase().trim().includes(user.username.toLowerCase().trim()) || auditorName.toLowerCase().includes('cajero');
      if (isOperatorSelfAuditing && !overrideSegregation) {
        setSegregationWarning("Advertencia de Segregación: Se requiere confirmación para auto-auditoría de trabajador.");
      } else {
        setSegregationWarning(null);
      }
    } else {
      setSegregationWarning(null);
    }
  }, [auditorName, user, overrideSegregation, isAdmin]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchProducts();
    await fetchActiveSession();
    await fetchHistory();
    setIsRefreshing(false);
    showNotification?.("✓ Datos y existencias sincronizados con el Punto de Venta.", "info");
  };

  const fetchActiveSession = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts?user_role=${user?.role || ''}`, {
        headers: { 'x-user-role': user?.role || '' }
      });
      if (res.ok) {
        const counts: InventoryCount[] = await res.json();
        const active = counts.find(c => c.status === 'en_progreso' || c.status === 'completado' || c.status === 'pausado' || c.status === 'finalizado');
        if (active) {
          setActiveSession(active);
          await fetchSessionItems(active.id);
        } else {
          setActiveSession(null);
          setSessionItems([]);
        }
      }
    } catch (err) {
      console.error("Error fetching active session:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/inventory-counts?user_role=${user?.role || ''}`, {
        headers: { 'x-user-role': user?.role || '' }
      });
      if (res.ok) {
        const counts: InventoryCount[] = await res.json();
        const historic = counts.filter(c => c.status === 'aprobado' || c.status === 'cerrado' || c.status === 'cancelado');
        setHistoricalCounts(historic);
      }
    } catch (err) {
      console.error("Error fetching history:", err);
    }
  };

  const fetchSessionItems = async (countId: number, isHistoric = false) => {
    try {
      const res = await fetch(`/api/inventory-counts/${countId}?user_role=${user?.role || ''}`, {
        headers: { 'x-user-role': user?.role || '' }
      });
      if (res.ok) {
        const data = await res.json();
        const isSanitized = data.is_blind_sanitized === true;

        const mapItems = (items: any[]) => items.map(it => {
          // El stock en tiempo real del POS siempre tiene máxima prioridad
          const prodObj = products?.find(p => p.id === it.product_id);
          const liveStock = prodObj?.stock !== undefined ? prodObj.stock : (it.live_stock ?? it.expected_quantity ?? 0);
          const physicalQty = it.physical_quantity ?? 0;
          const isChecked = it.status !== 'pendiente' ? 1 : 0;
          const diff = physicalQty - liveStock;

          return {
            ...it,
            product_name: prodObj?.name || it.product_name,
            product_sku: prodObj?.sku || it.product_sku || 'N/A',
            product_category: prodObj?.category || it.product_category || 'General',
            system_stock: isSanitized ? undefined : liveStock,
            live_stock: liveStock,
            counted_stock: physicalQty,
            difference: isSanitized ? 0 : diff,
            is_checked: isChecked,
            status: it.status || 'pendiente'
          };
        });

        if (isHistoric) {
          setHistoricItems(mapItems(data.items || []));
        } else {
          setSessionItems(mapItems(data.items || []));
        }
      }
    } catch (err) {
      console.error("Error fetching items:", err);
    }
  };

  const handleStartSession = async () => {
    if (!auditorName.trim()) {
      showNotification?.("Ingresa el nombre del auditor responsable.", "error");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/inventory-counts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user?.id || 1),
          'x-user-role': user?.role || ''
        },
        body: JSON.stringify({
          user_id: user?.id || 1,
          username: user?.username || 'admin',
          auditor_name: auditorName.trim(),
          store_name: storeName.trim(),
          notes: sessionNotes || `Control Físico de Almacén${isBlindMode ? ' a Ciegas' : ''}`,
          category_filter: selectedCategory === 'Todos' ? null : selectedCategory,
          mode: isBlindMode ? 'BLIND' : 'STANDARD',
          override_segregation: overrideSegregation ? 1 : 0,
          override_reason: overrideSegregation ? overrideReason : null
        })
      });

      const responseData = await res.json();

      if (res.ok) {
        showNotification?.(`✓ Nueva sesión de auditoría física${isBlindMode ? ' a ciegas' : ''} iniciada con éxito.`, "success");
        await fetchProducts();
        await fetchActiveSession();
      } else if (responseData.segregation_warning) {
        setSegregationWarning(responseData.error);
        showNotification?.(responseData.error, "warning");
      } else {
        showNotification?.(`Error al iniciar sesión: ${responseData.error}`, "error");
      }
    } catch (err) {
      console.error(err);
      showNotification?.("Fallo de red al crear sesión.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateItem = async (itemId: number, updatedFields: { counted_stock?: number; is_checked?: number; status?: string; notes?: string }) => {
    if (!activeSession) return;
    const item = sessionItems.find(it => it.id === itemId);
    if (!item) return;

    const newStock = updatedFields.counted_stock !== undefined ? Math.max(0, updatedFields.counted_stock) : item.counted_stock;
    const nextChecked = updatedFields.is_checked !== undefined ? updatedFields.is_checked : item.is_checked;
    const nextStatus = updatedFields.status !== undefined ? updatedFields.status : (nextChecked === 0 ? 'pendiente' : 'contado');

    const sysStock = item.system_stock ?? item.live_stock ?? 0;
    const diff = newStock - sysStock;

    // Actualización optimista inmediata
    setSessionItems(prev => prev.map(it => it.id === itemId ? { 
      ...it, 
      counted_stock: newStock,
      is_checked: nextStatus !== 'pendiente' ? 1 : 0,
      status: nextStatus,
      difference: diff,
      notes: updatedFields.notes !== undefined ? updatedFields.notes : it.notes
    } : it));

    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/items/${itemId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': user?.role || ''
        },
        body: JSON.stringify({ 
          physical_quantity: newStock,
          status: nextStatus,
          notes: updatedFields.notes !== undefined ? updatedFields.notes : item.notes
        })
      });
      if (!res.ok) {
        console.error("Failed to update count item on server");
      }
    } catch (err) {
      console.error("Network error while updating count item:", err);
    }
  };

  const handleToggleCheck = async (item: CountItem) => {
    const isChecked = item.is_checked === 1;
    const nextChecked = isChecked ? 0 : 1;
    await handleUpdateItem(item.id, { is_checked: nextChecked });

    if (nextChecked === 1) {
      setTimeout(() => {
        const currentIndex = filteredItems.findIndex(it => it.id === item.id);
        const nextUnchecked = filteredItems.slice(currentIndex + 1).find(it => it.is_checked === 0);
        if (nextUnchecked) {
          const el = document.getElementById(`product-card-${nextUnchecked.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 200);
    }
  };

  const handleSetStockToSystem = (item: CountItem) => {
    const sys = item.system_stock ?? item.live_stock ?? 0;
    handleUpdateItem(item.id, { counted_stock: sys, is_checked: 1 });
  };

  const handleMatchAllPending = async () => {
    if (!confirm("¿Deseas marcar todos los productos pendientes con su cantidad exacta del sistema?")) return;
    const pending = sessionItems.filter(it => it.is_checked === 0);
    for (const item of pending) {
      const sys = item.system_stock ?? item.live_stock ?? 0;
      await handleUpdateItem(item.id, { counted_stock: sys, is_checked: 1 });
    }
    showNotification?.("✓ Todos los productos pendientes han sido verificados.", "success");
  };

  const handleCompleteSession = async () => {
    if (!activeSession) return;
    setIsLoading(true);
    try {
      const targetStatus = isAdmin ? 'cerrado' : 'completado';
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': user?.role || ''
        },
        body: JSON.stringify({ 
          status: targetStatus,
          auto_apply: isAdmin
        })
      });

      if (res.ok) {
        showNotification?.(
          isAdmin 
            ? "✓ Control físico completado y ajustado directamente en el inventario de productos."
            : "✓ Conteo físico finalizado. Reporte enviado a Administración.", 
          "success"
        );
        await fetchProducts();
        await fetchActiveSession();
        await fetchHistory();

        safeDispatchEvent('inventory_operation', {
          detail: {
            type: 'physical_count',
            id: activeSession.id,
            user: user?.username || 'admin',
            timestamp: new Date().toISOString()
          }
        });
      } else {
        showNotification?.("No se pudo completar la sesión de control físico.", "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveCount = async () => {
    if (!activeSession) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user?.id || 1),
          'x-user-role': user?.role || ''
        },
        body: JSON.stringify({
          admin_id: user?.id,
          admin_username: user?.username,
          notes: adminNotes || 'Conciliación aprobada sin discrepancias mayores.'
        })
      });

      if (res.ok) {
        showNotification?.("✓ Ajustes físicos de inventario aprobados y aplicados correctamente.", "success");
        setAdminNotes('');
        await fetchActiveSession();
        await fetchProducts();
        await fetchHistory();
        
        safeDispatchEvent('inventory_operation', {
          detail: {
            type: 'physical_count',
            id: activeSession.id,
            user: user?.username || 'admin',
            timestamp: new Date().toISOString()
          }
        });
      } else {
        const err = await res.json();
        showNotification?.(`Error al aprobar: ${err.error}`, "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSession = async () => {
    if (!activeSession) return;
    if (!confirm("¿Está seguro que desea cancelar esta sesión de control físico? Los cambios no guardados se descartarán.")) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelado' })
      });
      if (res.ok) {
        showNotification?.("Sesión de auditoría cancelada.", "info");
        setActiveSession(null);
        setSessionItems([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewHistoricCount = (count: InventoryCount) => {
    setSelectedHistoricCount(count);
    fetchSessionItems(count.id, true);
  };

  // Resumen y métricas
  const getDiscrepancySummary = (itemsList: CountItem[]) => {
    const totalItems = itemsList.length;
    const checkedItems = itemsList.filter(it => it.is_checked === 1).length;
    const pendingItems = totalItems - checkedItems;
    
    const itemsWithSysStock = itemsList.filter(it => it.system_stock !== undefined);
    const hasAdminVisibility = itemsWithSysStock.length > 0;

    const productsWithDiff = hasAdminVisibility 
      ? itemsList.filter(it => it.is_checked === 1 && it.counted_stock !== (it.system_stock ?? it.live_stock ?? 0)).length
      : 0;

    const totalSystemStock = hasAdminVisibility
      ? itemsList.reduce((sum, it) => sum + (it.system_stock ?? it.live_stock ?? 0), 0)
      : 0;

    const totalCountedStock = itemsList.reduce((sum, it) => sum + (it.is_checked === 1 ? it.counted_stock : 0), 0);
    const totalDiscrepancyUnits = hasAdminVisibility ? totalCountedStock - totalSystemStock : 0;
    const completedPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

    return {
      totalItems,
      checkedItems,
      pendingItems,
      productsWithDiff,
      totalSystemStock,
      totalCountedStock,
      totalDiscrepancyUnits,
      completedPercent,
      hasAdminVisibility
    };
  };

  const activeSummary = getDiscrepancySummary(sessionItems);
  const historicSummary = getDiscrepancySummary(historicItems);

  // Filtrado de productos en sesión activa
  const filteredItems = sessionItems.filter(it => {
    const cleanQuery = itemSearch.toLowerCase().replace(/^#/, '').trim();
    const searchTerms = cleanQuery.split(/\s+/).filter(Boolean);
    const searchableText = `${it.product_id || ''} ${(it.product_name || '').toLowerCase()} ${(it.product_sku || '').toLowerCase()} ${(it.product_category || '').toLowerCase()}`;
    const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => searchableText.includes(term));
    
    let matchesFilter = true;
    if (activeFilter === 'pendientes') {
      matchesFilter = it.is_checked === 0;
    } else if (activeFilter === 'revisados') {
      matchesFilter = it.is_checked === 1;
    } else if (activeFilter === 'diferencias' && activeSummary.hasAdminVisibility) {
      matchesFilter = it.is_checked === 1 && it.counted_stock !== (it.system_stock ?? it.live_stock ?? 0);
    }

    const matchesHideRevisados = !hideRevisados || it.is_checked === 0;

    return matchesSearch && matchesFilter && matchesHideRevisados;
  });

  return (
    <div 
      id="physical-count-screen"
      className={embeddedMode 
        ? "w-full h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-[#090e1a] select-none" 
        : "fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-md flex flex-col md:items-center md:justify-center overflow-hidden p-0 md:p-4 select-none"
      }
    >
      
      {/* CONTENEDOR PRINCIPAL */}
      <div className={embeddedMode 
        ? "w-full h-full flex flex-col overflow-hidden" 
        : "w-full h-full md:max-w-5xl md:h-[94vh] flex flex-col bg-white dark:bg-[#0d1424] md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      }>
        
        {/* CABECERA PRINCIPAL */}
        <header className="px-4 py-3.5 md:px-6 md:py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <ClipboardCheck size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm md:text-base font-black text-slate-800 dark:text-white tracking-tight uppercase truncate">
                  Control Físico de Inventario
                </h2>
                {activeSession ? (
                  activeSession.mode === 'BLIND' ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      {isAdmin ? 'Auditoría a Ciegas (Admin)' : 'Auditoría a Ciegas'}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Stock Visible (POS)
                    </span>
                  )
                ) : null}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                {activeSession 
                  ? `Sesión #${activeSession.id} en ${activeSession.store_name || 'Almacén Principal'} | Auditor: ${activeSession.auditor_name || activeSession.username}`
                  : 'Auditoría y conciliación física con existencias en tiempo real'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              title="Sincronizar existencias del POS"
              className="p-2 rounded-xl text-slate-450 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <RefreshCw size={17} className={isRefreshing ? "animate-spin text-indigo-500" : ""} />
            </button>
            {onClose && (
              <button 
                id="btn-close-physical-count"
                type="button"
                onClick={onClose} 
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </header>

        {/* BARRA DE PESTAÑAS */}
        <nav className="px-4 md:px-6 py-2 bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setActiveTab('activo'); setSelectedHistoricCount(null); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'activo'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800/60'
              }`}
            >
              <Play size={12} />
              <span>Sesión Activa</span>
              {activeSession && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('historico'); setSelectedHistoricCount(null); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'historico'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800/60'
              }`}
            >
              <Clock size={12} />
              <span>Historial ({historicalCounts.length})</span>
            </button>
          </div>

          {activeSession && activeTab === 'activo' && activeSession.status !== 'completado' && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="font-mono text-emerald-500">{activeSummary.completedPercent}%</span>
              <span>completado</span>
            </div>
          )}
        </nav>

        {/* ÁREA DE CONTENIDO */}
        <div className="flex-1 overflow-y-auto p-3.5 md:p-6 flex flex-col gap-4">
          
          {activeTab === 'activo' && (
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              
              {/* 1. FORMULARIO PARA INICIAR SESIÓN CUANDO NO HAY SESIÓN ACTIVA */}
              {!activeSession && (
                <div className="max-w-xl mx-auto w-full my-auto flex flex-col items-center text-center p-6 md:p-8 bg-white dark:bg-[#11192e] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl gap-5">
                  <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <ShieldCheck size={36} />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-850 dark:text-white uppercase tracking-tight">
                      Comenzar Control Físico de Inventario
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium leading-relaxed">
                      Verifica las existencias reales en anaqueles y estantes sincronizadas al instante con el Punto de Venta.
                    </p>
                  </div>

                  <div className="w-full flex flex-col gap-3.5 text-left">
                    {/* Almacén */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Ubicación / Almacén</label>
                      <select
                        value={storeName}
                        onChange={e => setStoreName(e.target.value)}
                        className="w-full mt-1 p-3 text-xs font-bold bg-slate-50 dark:bg-[#151f32] text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Almacén Principal">Almacén Principal</option>
                        <option value="Sucursal Centro">Sucursal Centro</option>
                        <option value="Depósito Secundario">Depósito Secundario</option>
                      </select>
                    </div>

                    {/* Auditor */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Auditor Responsable</label>
                      <input
                        type="text"
                        value={auditorName}
                        onChange={e => setAuditorName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        className="w-full mt-1 p-3 text-xs font-bold bg-slate-50 dark:bg-[#151f32] text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Alcance de Categorías */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Alcance de Auditoría</label>
                      <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="w-full mt-1 p-3 text-xs font-bold bg-slate-50 dark:bg-[#151f32] text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Todos">Todos los productos ({products?.length || 0} artículos)</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>

                    {/* Selector de Modo */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Modo de Control</label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setIsBlindMode(false)}
                          className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                            !isBlindMode
                              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                              : 'bg-slate-50 dark:bg-[#151f32] border-slate-200 dark:border-slate-800 text-slate-500'
                          }`}
                        >
                          <span className="text-xs font-black uppercase flex items-center gap-1.5">
                            <Eye size={14} className="text-emerald-500" />
                            Stock Visible
                          </span>
                          <span className="text-[9.5px] font-medium opacity-80 leading-tight">Muestra el stock real del POS para comparar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsBlindMode(true)}
                          className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                            isBlindMode
                              ? 'bg-indigo-500/10 border-indigo-500 text-indigo-800 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                              : 'bg-slate-50 dark:bg-[#151f32] border-slate-200 dark:border-slate-800 text-slate-500'
                          }`}
                        >
                          <span className="text-xs font-black uppercase flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-indigo-500" />
                            A Ciegas
                          </span>
                          <span className="text-[9.5px] font-medium opacity-80 leading-tight">Oculta las existencias para evitar sesgos</span>
                        </button>
                      </div>
                    </div>

                    {/* Advertencia de Segregación */}
                    {segregationWarning && !isAdmin && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2 text-amber-700 dark:text-amber-300 text-xs">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
                        <div>
                          <span className="font-bold block">Verificación de Responsabilidad</span>
                          <p className="text-[10px] mt-0.5">{segregationWarning}</p>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleStartSession}
                      disabled={isLoading}
                      className={`w-full mt-2 py-3.5 px-4 text-white font-black text-xs uppercase rounded-xl tracking-wider shadow-lg transition active:scale-98 cursor-pointer flex items-center justify-center gap-2 ${
                        isBlindMode ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
                      }`}
                    >
                      <Play size={14} />
                      <span>{isLoading ? 'Iniciando...' : 'Iniciar Sesión de Control Físico'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 2. RECONCILIACIÓN FINAL (ADMIN REVIEW) */}
              {activeSession && activeSession.status === 'completado' && (
                <div className="max-w-4xl mx-auto w-full flex flex-col gap-4">
                  {!isAdmin ? (
                    <div className="bg-white dark:bg-[#11192e] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl text-center flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                        <CheckCircle size={36} />
                      </div>
                      <h3 className="text-lg font-black text-slate-850 dark:text-white uppercase">
                        Conteo Finalizado y Enviado
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                        Tu conteo físico ha sido registrado exitosamente y está listo para la revisión y aprobación por el Administrador.
                      </p>
                      {onClose && (
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs uppercase rounded-xl"
                        >
                          Cerrar Pantalla
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-[#11192e] p-5 md:p-7 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div>
                          <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight">
                            Reconciliación y Aprobación de Inventario
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                            Auditor: <strong className="text-indigo-600 dark:text-indigo-400">{activeSession.auditor_name || activeSession.username}</strong>
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-black uppercase rounded-xl border border-amber-500/20">
                          Pendiente de Aprobación
                        </span>
                      </div>

                      {/* Métricas de Reconciliación */}
                      <div className="grid grid-cols-4 gap-2 bg-slate-50 dark:bg-black/30 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400 block">Total Artículos</span>
                          <span className="text-sm font-mono font-bold text-slate-800 dark:text-white">{activeSummary.totalItems}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400 block">Coincidentes</span>
                          <span className="text-sm font-mono font-bold text-emerald-500">
                            {sessionItems.filter(it => it.counted_stock === (it.system_stock ?? it.live_stock ?? 0)).length}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400 block">Con Diferencia</span>
                          <span className="text-sm font-mono font-bold text-rose-500">{activeSummary.productsWithDiff}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400 block">Diferencia Neta</span>
                          <span className={`text-sm font-mono font-bold ${activeSummary.totalDiscrepancyUnits >= 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                            {activeSummary.totalDiscrepancyUnits > 0 ? `+${activeSummary.totalDiscrepancyUnits}` : activeSummary.totalDiscrepancyUnits} pz
                          </span>
                        </div>
                      </div>

                      {/* Lista de discrepancias */}
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                          Detalle Comparativo de Existencias:
                        </span>
                        <div className="max-h-[320px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                          {sessionItems.map(it => {
                            const sys = it.system_stock ?? it.live_stock ?? 0;
                            const physical = it.counted_stock ?? 0;
                            const diff = physical - sys;

                            return (
                              <div key={it.id} className="p-3 flex items-center justify-between text-xs gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="font-black text-slate-800 dark:text-white uppercase truncate">{it.product_name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">SKU: {it.product_sku}</div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 text-right font-mono">
                                  <span className="text-[11px] text-slate-500">POS: <strong>{sys}</strong></span>
                                  <span className="text-[11px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold text-slate-800 dark:text-white">
                                    Físico: {physical}
                                  </span>
                                  <span className={`text-xs font-black w-16 text-right ${diff === 0 ? 'text-emerald-500' : diff > 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                                    {diff === 0 ? '0 u' : diff > 0 ? `+${diff} u` : `${diff} u`}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Observaciones y Aprobación */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400">Observaciones del Ajuste</label>
                        <input
                          type="text"
                          value={adminNotes}
                          onChange={e => setAdminNotes(e.target.value)}
                          placeholder="Notas de conciliación..."
                          className="p-3 text-xs bg-slate-50 dark:bg-[#151f32] text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <button
                          type="button"
                          onClick={handleCancelSession}
                          className="py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 font-bold text-xs uppercase rounded-xl transition cursor-pointer"
                        >
                          Rechazar Conteo
                        </button>
                        <button
                          type="button"
                          onClick={handleApproveCount}
                          disabled={isLoading}
                          className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase rounded-xl transition shadow-lg shadow-emerald-500/20 cursor-pointer"
                        >
                          {isLoading ? 'Aplicando...' : 'Aprobar y Conciliar Stock'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. SESIÓN EN CURSO (AUDITORÍA ACTIVA) */}
              {activeSession && activeSession.status !== 'completado' && (
                <div className="flex-1 flex flex-col gap-3 min-h-0">
                  
                  {/* BARRA DE PROGRESO COMPACTA */}
                  <div className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-xs shrink-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800 dark:text-white uppercase">
                          Avance del Conteo:
                        </span>
                        <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">
                          {activeSummary.checkedItems} de {activeSummary.totalItems} ({activeSummary.completedPercent}%)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          Pendientes: {activeSummary.pendingItems}
                        </span>
                        {activeSummary.hasAdminVisibility && activeSummary.productsWithDiff > 0 && (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            Diferencias: {activeSummary.productsWithDiff}
                          </span>
                        )}
                        {isAdmin && activeSummary.pendingItems > 0 && (
                          <button
                            type="button"
                            onClick={handleMatchAllPending}
                            className="hidden sm:inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                          >
                            ✓ Igualar Pendientes con POS
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Barra de progreso */}
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2.5">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                        style={{ width: `${activeSummary.completedPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* BUSCADOR Y FILTROS */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 bg-white dark:bg-[#101726] p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={itemSearch}
                        onChange={e => setItemSearch(e.target.value)}
                        placeholder="Buscar por artículo, SKU, #ID..."
                        className="w-full pl-9 pr-8 py-2 text-xs font-bold bg-slate-50 dark:bg-[#151f32] text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                        autoComplete="off"
                        spellCheck="false"
                      />
                      <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                      {itemSearch && (
                        <button
                          type="button"
                          onClick={() => setItemSearch('')}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveFilter('todos')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                          activeFilter === 'todos'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        Todos ({sessionItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveFilter('pendientes')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                          activeFilter === 'pendientes'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        Pendientes ({activeSummary.pendingItems})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveFilter('revisados')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                          activeFilter === 'revisados'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        Verificados ({activeSummary.checkedItems})
                      </button>
                      {activeSummary.hasAdminVisibility && (
                        <button
                          type="button"
                          onClick={() => setActiveFilter('diferencias')}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                            activeFilter === 'diferencias'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          Diferencias ({activeSummary.productsWithDiff})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* LISTADO DE PRODUCTOS OPTIMIZADO PARA PANTALLA Y MÓVIL */}
                  <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-2.5 pr-0.5">
                    {filteredItems.length === 0 ? (
                      <div className="p-10 text-center text-slate-400 dark:text-slate-500 font-bold text-xs uppercase tracking-wide bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl">
                        No hay productos que coincidan con la búsqueda o filtro.
                      </div>
                    ) : (
                      filteredItems.map((it, idx) => {
                        const isChecked = it.is_checked === 1;
                        const sysStock = it.system_stock ?? it.live_stock ?? 0;
                        const physical = it.counted_stock ?? 0;
                        const diff = physical - sysStock;
                        const showStock = it.system_stock !== undefined;

                        return (
                          <div
                            key={it.id}
                            id={`product-card-${it.id}`}
                            className={`p-3.5 md:p-4 rounded-2xl border transition-all flex flex-col gap-2.5 ${
                              isChecked
                                ? 'bg-white dark:bg-[#11192e] border-emerald-500/40 shadow-xs'
                                : 'bg-white dark:bg-[#11192e] border-slate-200 dark:border-slate-800 shadow-xs hover:border-indigo-500/40'
                            }`}
                          >
                            {/* Fila 1: Tags y Estado */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                                  #{it.product_id}
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                  SKU: {it.product_sku}
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400">
                                  {it.product_category}
                                </span>
                              </div>

                              <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                                isChecked
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                              }`}>
                                {isChecked ? 'Verificado ✓' : 'Pendiente'}
                              </span>
                            </div>

                            {/* Fila 2: Nombre del Producto */}
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm md:text-base font-black text-slate-850 dark:text-white uppercase leading-snug break-words flex-1">
                                {it.product_name}
                              </h4>
                            </div>

                            {/* Fila 3: Comparativa de Stock del Sistema (Visible en modo estándar o para Admin) */}
                            {showStock && (
                              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200/80 dark:border-slate-800/80 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black uppercase text-slate-400">Stock POS / Sistema:</span>
                                  <span className="font-mono font-black text-slate-800 dark:text-white px-2 py-0.5 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                                    {sysStock} u
                                  </span>
                                </div>

                                {isChecked && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-black uppercase text-slate-400">Diferencia:</span>
                                    {diff === 0 ? (
                                      <span className="px-2 py-0.5 rounded-md font-mono font-black text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                        0 u (Conforme)
                                      </span>
                                    ) : diff > 0 ? (
                                      <span className="px-2 py-0.5 rounded-md font-mono font-black text-[11px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                        +{diff} u (Sobrante)
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-md font-mono font-black text-[11px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                        {diff} u (Faltante)
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Fila 4: Control de Entrada Física (Stepper Touch-Friendly) */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                              
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 shrink-0">
                                  Físico en anaquel:
                                </span>
                                <div className="flex items-center gap-1.5 flex-1 max-w-[200px]">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItem(it.id, { counted_stock: Math.max(0, physical - 1) })}
                                    className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-black text-lg text-slate-700 dark:text-slate-200 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={it.counted_stock === null || it.counted_stock === undefined ? '' : it.counted_stock}
                                    onFocus={e => e.target.select()}
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      handleUpdateItem(it.id, { counted_stock: isNaN(val) ? 0 : Math.max(0, val) });
                                    }}
                                    className="w-full h-10 text-center font-mono font-black text-base bg-slate-50 dark:bg-[#151f32] text-slate-850 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItem(it.id, { counted_stock: physical + 1 })}
                                    className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-black text-lg text-slate-700 dark:text-slate-200 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* Accesos rápidos de cantidad */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {showStock && (
                                  <button
                                    type="button"
                                    onClick={() => handleSetStockToSystem(it)}
                                    className="px-2.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase border border-indigo-200 dark:border-indigo-900 transition cursor-pointer"
                                  >
                                    = POS ({sysStock})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItem(it.id, { counted_stock: 0 })}
                                  className="px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-[10px] font-mono font-bold transition cursor-pointer"
                                >
                                  0 u
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItem(it.id, { counted_stock: physical + 5 })}
                                  className="px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-[10px] font-mono font-bold transition cursor-pointer"
                                >
                                  +5
                                </button>
                              </div>
                            </div>

                            {/* Botón de Confirmar / Guardar Conteo */}
                            <button
                              type="button"
                              onClick={() => handleToggleCheck(it)}
                              className={`w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-98 cursor-pointer flex items-center justify-center gap-2 ${
                                isChecked
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/10'
                              }`}
                            >
                              <Check size={14} />
                              <span>
                                {isChecked 
                                  ? `✓ Guardado (${physical} u) - Clic para modificar` 
                                  : `Marcar como Contado (${physical} u)`}
                              </span>
                            </button>

                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* BARRA INFERIOR DE ACCIONES */}
                  <div className="p-3 bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleCancelSession}
                        className="py-2.5 px-4 bg-transparent hover:bg-rose-500/10 text-rose-600 border border-rose-200 dark:border-rose-900/50 text-xs font-bold uppercase rounded-xl transition cursor-pointer flex-1 sm:flex-none"
                      >
                        Cancelar
                      </button>
                      {onClose && (
                        <button
                          type="button"
                          onClick={onClose}
                          className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase rounded-xl transition cursor-pointer flex-1 sm:flex-none"
                        >
                          Pausar
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleCompleteSession}
                      disabled={activeSummary.pendingItems > 0 || isLoading}
                      className={`w-full sm:w-auto py-3 px-6 text-xs font-black uppercase rounded-xl transition flex items-center justify-center gap-2 ${
                        activeSummary.pendingItems > 0
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 cursor-pointer'
                      }`}
                    >
                      <CheckCircle size={15} />
                      <span>
                        {activeSummary.pendingItems > 0
                          ? `Faltan ${activeSummary.pendingItems} artículos por contar`
                          : (isAdmin ? 'Finalizar y Conciliar Inventario' : 'Concluir y Enviar a Revisión')}
                      </span>
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* HISTORIAL DE AUDITORÍAS */}
          {activeTab === 'historico' && (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              {historicalCounts.length === 0 ? (
                <div className="p-12 text-center text-slate-400 dark:text-slate-500 font-bold text-xs uppercase tracking-wide bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-3xl">
                  No hay sesiones de auditoría física registradas en el historial.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto">
                  {historicalCounts.map(count => (
                    <div 
                      key={count.id}
                      className="p-4 bg-white dark:bg-[#11192e] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">
                            Auditoría #{count.id}
                          </span>
                          <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase rounded-md border ${
                            count.status === 'cerrado' || count.status === 'aprobado'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          }`}>
                            {count.status === 'cerrado' || count.status === 'aprobado' ? 'Conciliado' : count.status}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase mt-1">
                          {count.store_name || 'Almacén Principal'}
                        </h4>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                          Auditor: {count.auditor_name || count.username} | Fecha: {new Date(count.created_at || count.started_at || '').toLocaleDateString()}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleViewHistoricCount(count)}
                        className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <FileText size={13} />
                        <span>Ver Detalle de la Sesión</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* MODAL DETALLE HISTÓRICO */}
      {selectedHistoricCount && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-5 md:p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-white uppercase">
                  Detalle de Auditoría #{selectedHistoricCount.id}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedHistoricCount.store_name || 'Almacén Principal'} - {selectedHistoricCount.auditor_name || selectedHistoricCount.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoricCount(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl">
              {historicItems.map(it => (
                <div key={it.id} className="p-3 flex items-center justify-between text-xs gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-slate-800 dark:text-white uppercase truncate">{it.product_name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">SKU: {it.product_sku}</div>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-[11px] text-slate-500">POS: {it.system_stock ?? it.live_stock ?? 0}</span>
                    <span className="text-[11px] font-bold text-slate-800 dark:text-white">Físico: {it.counted_stock}</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSelectedHistoricCount(null)}
              className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs uppercase rounded-xl"
            >
              Cerrar Detalle
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
