import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { safeDispatchEvent } from '../utils/events';
import { hasPermission } from '../utils/permissions';
import { 
  ClipboardCheck, Clock, CheckCircle, AlertTriangle, Play, X, Trash2, 
  Save, Eye, RefreshCw, Sparkles, Filter, Search, Check, Ban, ChevronDown, ChevronUp, AlertOctagon, Undo, ChevronRight, ShieldCheck, ShieldAlert, UserCheck
} from 'lucide-react';

interface PhysicalCountManagerProps {
  onClose: () => void;
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
  expected_quantity_snapshot?: number;
  movements_during_count?: number;
  adjusted_expected_quantity?: number;
  counted_stock: number;
  physical_quantity?: number;
  difference?: number;
  had_movements_during_count?: number;
  is_checked: number;
  status: string;
  notes?: string | null;
  recount_requested?: number;
}

export default function PhysicalCountManager({ onClose }: PhysicalCountManagerProps) {
  const { user, products, fetchProducts, showNotification } = useAppContext();
  const isAdmin = user?.role === 'admin' || user?.role === 'propietario' || user?.role === 'administrador';
  const canPreviewQuantities = hasPermission(user, 'preview_quantities_in_count');

  const [activeTab, setActiveTab] = useState<'activo' | 'historico'>('activo');
  const [activeSession, setActiveSession] = useState<InventoryCount | null>(null);
  const [sessionItems, setSessionItems] = useState<CountItem[]>([]);
  const [historicalCounts, setHistoricalCounts] = useState<InventoryCount[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // New session form states
  const [auditorName, setAuditorName] = useState<string>(user?.username || 'Auditor Almacén');
  const [storeName, setStoreName] = useState<string>('Almacén Principal');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [categories, setCategories] = useState<string[]>([]);
  const [isBlindMode, setIsBlindMode] = useState<boolean>(!isAdmin && !canPreviewQuantities);
  const [sessionNotes, setSessionNotes] = useState<string>('');

  // Segregation of Duties state
  const [overrideSegregation, setOverrideSegregation] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [segregationWarning, setSegregationWarning] = useState<string | null>(null);

  // Filtering active count items
  const [itemSearch, setItemSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'todos' | 'pendientes' | 'revisados' | 'diferencias' | 'recuento'>('todos');
  const [hideRevisados, setHideRevisados] = useState(false);

  // Expanded product movements
  const [expandedMovements, setExpandedMovements] = useState<Record<number, boolean>>({});
  const [movementsByProduct, setMovementsByProduct] = useState<Record<number, any[]>>({});
  const [loadingMovements, setLoadingMovements] = useState<Record<number, boolean>>({});

  // Recount selection
  const [selectedForRecount, setSelectedForRecount] = useState<number[]>([]);
  const [recountReason, setRecountReason] = useState<string>('');
  const [isRequestingRecount, setIsRequestingRecount] = useState<boolean>(false);

  // Selected historic count view
  const [selectedHistoricCount, setSelectedHistoricCount] = useState<InventoryCount | null>(null);
  const [historicItems, setHistoricItems] = useState<CountItem[]>([]);

  // Extra notes for admin approval
  const [adminNotes, setAdminNotes] = useState('');

  // Fetch initial data
  useEffect(() => {
    fetchProducts();
    fetchActiveSession();
    fetchHistory();
  }, [activeTab]);

  useEffect(() => {
    if (products && products.length > 0) {
      const uniqueCats = Array.from(new Set(products.map(p => p.category || 'Sin Categoría')));
      setCategories(uniqueCats);
    }
  }, [products]);

  // Check segregation warning locally
  useEffect(() => {
    if (user?.username && auditorName) {
      const isOperatorSelfAuditing = auditorName.toLowerCase().trim().includes(user.username.toLowerCase().trim()) || auditorName.toLowerCase().includes('cajero');
      if (isOperatorSelfAuditing && !overrideSegregation) {
        setSegregationWarning("Advertencia de Segregación de Funciones: El auditor asignado coincide con el operador principal. Se recomienda que un auditor independiente realice el conteo o autorizar una excepción formal.");
      } else {
        setSegregationWarning(null);
      }
    }
  }, [auditorName, user, overrideSegregation]);

  const fetchActiveSession = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts?user_role=${user?.role || ''}`, {
        headers: {
          'x-user-role': user?.role || ''
        }
      });
      if (res.ok) {
        const counts: InventoryCount[] = await res.json();
        const active = counts.find(c => c.status === 'en_progreso' || c.status === 'completado' || c.status === 'pausado' || c.status === 'finalizado');
        if (active) {
          setActiveSession(active);
          fetchSessionItems(active.id);
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
          const prodObj = products?.find(p => p.id === it.product_id);
          return {
            ...it,
            system_stock: isSanitized ? undefined : (it.expected_quantity_snapshot ?? it.expected_quantity),
            counted_stock: it.physical_quantity ?? 0,
            product_category: prodObj?.category || 'Sin Categoría',
            is_checked: it.status !== 'pendiente' ? 1 : 0
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
          notes: sessionNotes || 'Control Físico a Ciegas de Almacén',
          category_filter: selectedCategory === 'Todos' ? null : selectedCategory,
          mode: isBlindMode ? 'BLIND' : 'STANDARD',
          override_segregation: overrideSegregation ? 1 : 0,
          override_reason: overrideSegregation ? overrideReason : null
        })
      });

      const responseData = await res.json();

      if (res.ok) {
        showNotification?.("✓ Nueva sesión de auditoría física a ciegas iniciada con éxito.", "success");
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

    const newStock = updatedFields.counted_stock !== undefined ? updatedFields.counted_stock : item.counted_stock;
    const nextChecked = updatedFields.is_checked !== undefined ? updatedFields.is_checked : item.is_checked;
    
    let nextStatus = updatedFields.status !== undefined ? updatedFields.status : (nextChecked === 0 ? 'pendiente' : 'contado');

    // Local optimistic update
    setSessionItems(prev => prev.map(it => it.id === itemId ? { 
      ...it, 
      counted_stock: newStock,
      is_checked: nextStatus !== 'pendiente' ? 1 : 0,
      status: nextStatus,
      notes: updatedFields.notes !== undefined ? updatedFields.notes : it.notes
    } : it));

    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          physical_quantity: newStock,
          status: nextStatus,
          notes: updatedFields.notes !== undefined ? updatedFields.notes : item.notes
        })
      });
      if (!res.ok) {
        console.error("Failed to update count item on server database");
      }
    } catch (err) {
      console.error("Network error while updating count item:", err);
    }
  };

  const handleToggleCheck = async (item: CountItem) => {
    if (item.counted_stock === null || item.counted_stock === undefined || isNaN(item.counted_stock)) {
      showNotification?.("Ingresa la cantidad física encontrada antes de guardar.", "error");
      return;
    }

    const isChecked = item.is_checked === 1;
    const nextChecked = isChecked ? 0 : 1;
    
    await handleUpdateItem(item.id, { is_checked: nextChecked });

    if (nextChecked === 1) {
      setTimeout(() => {
        const currentIndex = sessionItems.findIndex(it => it.id === item.id);
        const nextUnchecked = sessionItems.slice(currentIndex + 1).find(it => it.is_checked === 0);
        if (nextUnchecked) {
          const el = document.getElementById(`product-card-${nextUnchecked.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 350);
    }
  };

  const handleRequestRecount = async () => {
    if (!activeSession || selectedForRecount.length === 0) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/recount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_ids: selectedForRecount,
          reason: recountReason || 'Administración solicita verificación física de stock'
        })
      });

      if (res.ok) {
        showNotification?.(`✓ Recuento solicitado para ${selectedForRecount.length} productos.`, "success");
        setSelectedForRecount([]);
        setRecountReason('');
        setIsRequestingRecount(false);
        await fetchSessionItems(activeSession.id);
      } else {
        const err = await res.json();
        showNotification?.(`Error al solicitar recuento: ${err.error}`, "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProductMovements = async (productId: number) => {
    setLoadingMovements(prev => ({ ...prev, [productId]: true }));
    try {
      const res = await fetch(`/api/products/${productId}/stock-history`);
      if (res.ok) {
        const data = await res.json();
        setMovementsByProduct(prev => ({ ...prev, [productId]: data }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMovements(prev => ({ ...prev, [productId]: false }));
    }
  };

  const toggleMovements = (item: CountItem) => {
    const isExpanded = !!expandedMovements[item.product_id];
    setExpandedMovements(prev => ({ ...prev, [item.product_id]: !isExpanded }));
    if (!isExpanded) {
      fetchProductMovements(item.product_id);
    }
  };

  const handleCompleteSession = async () => {
    if (!activeSession) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completado' })
      });

      if (res.ok) {
        showNotification?.("✓ Auditoría a ciegas finalizada. El reporte ha sido enviado a Administración para reconciliación.", "success");
        await fetchActiveSession();
        await fetchHistory();
      } else {
        showNotification?.("No se pudo completar la sesión de auditoría.", "error");
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
        showNotification?.("✓ Ajustes físicos de inventario aprobados y aplicados correctamente en el almacén.", "success");
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
    if (!confirm("¿Está seguro que desea cancelar esta sesión de auditoría? Se perderán permanentemente los registros no aprobados.")) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelado' })
      });
      if (res.ok) {
        showNotification?.("Sesión de auditoría cancelada.", "success");
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

  // Helper metrics
  const getDiscrepancySummary = (itemsList: CountItem[]) => {
    const totalItems = itemsList.length;
    const checkedItems = itemsList.filter(it => it.is_checked === 1).length;
    const pendingItems = totalItems - checkedItems;
    
    // Only calculate diffs if system_stock is present (Admin reconciliation mode)
    const itemsWithSysStock = itemsList.filter(it => it.system_stock !== undefined);
    const hasAdminVisibility = itemsWithSysStock.length > 0;

    const productsWithDiff = hasAdminVisibility 
      ? itemsList.filter(it => it.is_checked === 1 && it.counted_stock !== (it.adjusted_expected_quantity ?? it.system_stock)).length
      : 0;

    const totalSystemStock = hasAdminVisibility
      ? itemsList.reduce((sum, it) => sum + (it.adjusted_expected_quantity ?? it.system_stock ?? 0), 0)
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

  // Filter items in active session
  const filteredItems = sessionItems.filter(it => {
    const cleanQuery = itemSearch.toLowerCase().replace(/^#/, '').trim();
    const searchTerms = cleanQuery.split(/\s+/).filter(Boolean);
    const searchableText = `${it.product_id || ''} ${(it.product_name || '').toLowerCase()} ${(it.product_sku || '').toLowerCase()} ${(it.category || '').toLowerCase()}`;
    const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => searchableText.includes(term));
    
    let matchesFilter = true;
    if (activeFilter === 'pendientes') {
      matchesFilter = it.is_checked === 0;
    } else if (activeFilter === 'revisados') {
      matchesFilter = it.is_checked === 1;
    } else if (activeFilter === 'diferencias' && activeSummary.hasAdminVisibility) {
      matchesFilter = it.is_checked === 1 && it.counted_stock !== (it.adjusted_expected_quantity ?? it.system_stock);
    } else if (activeFilter === 'recuento') {
      matchesFilter = it.recount_requested === 1;
    }

    const matchesHideRevisados = !hideRevisados || it.is_checked === 0;

    return matchesSearch && matchesFilter && matchesHideRevisados;
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 z-45 animate-in fade-in duration-200">
      <div 
        id="physical-count-screen"
        className="bg-slate-50 dark:bg-[#0c111e] w-full h-[100dvh] md:h-auto md:max-h-[92vh] md:max-w-5xl md:rounded-3xl border-0 md:border border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl overflow-hidden"
      >
        
        {/* ENCABEZADO */}
        <div className="p-4 md:p-5 border-b border-slate-200 dark:border-slate-800/80 flex justify-between items-center bg-white dark:bg-[#0f1626] shrink-0 select-none">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm md:text-base text-slate-850 dark:text-white uppercase tracking-tight leading-none">
                  Control Físico & Auditoría a Ciegas
                </h3>
                <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border border-indigo-500/20">
                  A Ciegas (Sin Sesgo)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 leading-none">
                El stock registrado se oculta al auditor durante el conteo para garantizar máxima integridad.
              </p>
            </div>
          </div>
          <button 
            id="btn-close-physical-count"
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-650 dark:hover:text-white p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-850 transition cursor-pointer shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* PESTAÑAS (Activo / Histórico) */}
        <div className="px-4 md:px-5 flex gap-1 border-b border-slate-200 dark:border-slate-800/40 bg-white/60 dark:bg-black/10 py-1.5 shrink-0 select-none">
          <button
            onClick={() => { setActiveTab('activo'); setSelectedHistoricCount(null); }}
            className={`px-4 py-2 text-[10.5px] uppercase tracking-wider font-black rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'activo' 
                ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' 
                : 'text-slate-450 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Play size={13} />
            Sesión de Conteo Activa
          </button>
          <button
            onClick={() => { setActiveTab('historico'); setSelectedHistoricCount(null); }}
            className={`px-4 py-2 text-[10.5px] uppercase tracking-wider font-black rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'historico' 
                ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' 
                : 'text-slate-450 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Clock size={13} />
            Historial de Auditorías
          </button>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col p-4 md:p-5 gap-4">
          
          {activeTab === 'activo' && (
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              
              {/* FORMULARIO DE INICIO (SI NO HAY SESIÓN ACTIVA) */}
              {!activeSession && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 bg-white dark:bg-[#101726]/40 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl gap-5">
                  <div className="p-4 bg-indigo-500/10 text-indigo-500 rounded-full">
                    <ShieldCheck size={48} />
                  </div>
                  <div className="max-w-lg text-center">
                    <h4 className="font-extrabold text-base md:text-lg text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      Iniciar Control Físico de Inventario a Ciegas
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-medium leading-relaxed">
                      Auditoría sin sesgo de confirmación. El personal cuenta las unidades reales en anaquel sin visualizar la cantidad que el sistema espera.
                    </p>
                  </div>

                  <div className="bg-white dark:bg-[#11192e] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full flex flex-col gap-4 shadow-sm">
                    
                    {/* Almacén o Sucursal */}
                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ubicación / Almacén:</label>
                      <select
                        value={storeName}
                        onChange={e => setStoreName(e.target.value)}
                        className="text-xs font-bold p-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#151f32] text-slate-850 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Almacén Principal">Almacén Principal</option>
                        <option value="Sucursal Centro">Sucursal Centro</option>
                        <option value="Depósito Secundario">Depósito Secundario</option>
                      </select>
                    </div>

                    {/* Nombre del Auditor */}
                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Auditor Responsable (Obligatorio):</label>
                      <input
                        type="text"
                        value={auditorName}
                        onChange={e => setAuditorName(e.target.value)}
                        placeholder="Ej. Juan Pérez (Auditor Externo)"
                        className="text-xs font-bold p-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#151f32] text-slate-850 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Alcance de Categorías */}
                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Alcance del conteo:</label>
                      <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="text-xs font-bold p-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#151f32] text-slate-850 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Todos">Todos los productos (Auditoría Integral)</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>

                    {/* Modo a Ciegas Checkbox */}
                    {!isAdmin && (
                      <label className={`flex items-center gap-2.5 p-3 rounded-xl ${canPreviewQuantities ? 'bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 cursor-pointer' : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 opacity-70 cursor-not-allowed'}`}>
                        <input
                          type="checkbox"
                          checked={isBlindMode}
                          onChange={e => {
                            if (canPreviewQuantities) {
                              setIsBlindMode(e.target.checked);
                            }
                          }}
                          disabled={!canPreviewQuantities}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <div className="text-left">
                          <span className={`text-xs font-extrabold uppercase tracking-tight block ${canPreviewQuantities ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}>
                            Activar Control Físico a Ciegas
                          </span>
                          <span className="text-[9.5px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                            {!canPreviewQuantities 
                              ? 'Modo ciego obligatorio. Solicita permisos para previsualizar cantidades.' 
                              : 'Oculta el stock del sistema al auditor para prevenir conteos sesgados.'}
                          </span>
                        </div>
                      </label>
                    )}

                    {/* Advertencia de Segregación de Funciones */}
                    {segregationWarning && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col gap-2 text-left">
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-extrabold">
                          <ShieldAlert size={16} className="shrink-0" />
                          <span>Conflicto de Segregación de Funciones</span>
                        </div>
                        <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                          {segregationWarning}
                        </p>
                        
                        {isAdmin && (
                          <div className="mt-1 flex flex-col gap-2 pt-2 border-t border-amber-500/20">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={overrideSegregation}
                                onChange={e => setOverrideSegregation(e.target.checked)}
                                className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                              />
                              <span className="text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
                                Autorizar auto-auditoría con permiso de Administrador
                              </span>
                            </label>
                            {overrideSegregation && (
                              <textarea
                                placeholder="Escribe el motivo o justificación de esta excepción de auditoría..."
                                value={overrideReason}
                                onChange={e => setOverrideReason(e.target.value)}
                                className="text-[11px] p-2 bg-white dark:bg-[#151f32] border border-amber-500/30 rounded-lg w-full text-slate-800 dark:text-white"
                                rows={2}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleStartSession}
                      disabled={isLoading}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase rounded-xl tracking-wider shadow-lg transition active:scale-98 cursor-pointer select-none mt-1"
                    >
                      {isLoading ? 'Iniciando Auditoría...' : 'Iniciar Auditoría a Ciegas'}
                    </button>
                  </div>
                </div>
              )}

              {/* SESIÓN ENVIADA POR AUDITOR (RECONCILIACIÓN ADMINISTRATIVA) */}
              {activeSession && activeSession.status === 'completado' && (
                <div className="flex-1 flex flex-col gap-5 max-w-4xl mx-auto w-full select-none">
                  
                  {!isAdmin ? (
                    /* TRABAJADOR: MENSAJE DE ESPERA */
                    <div className="bg-white dark:bg-[#11192e] p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col items-center text-center gap-5 w-full">
                      <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-full">
                        <CheckCircle size={44} />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-base md:text-lg text-slate-850 dark:text-white uppercase tracking-tight">
                          Conteo a Ciegas Enviado a Reconciliación
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium max-w-sm mx-auto leading-relaxed">
                          La auditoría finalizó correctamente. Los resultados físicos se encuentran bajo revisión del Administrador o Propietario.
                        </p>
                      </div>

                      <div className="w-full flex gap-3 mt-2">
                        <button
                          onClick={onClose}
                          className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 dark:text-white text-slate-700 font-extrabold text-xs uppercase rounded-xl transition cursor-pointer"
                        >
                          Cerrar Pantalla
                        </button>
                      </div>
                    </div>
                  ) : (
                    
                    /* ADMINISTRADOR: PANEL DE RECONCILIACIÓN Y MATRIZ DE COMPARACIÓN CON MOVIMIENTOS */
                    <div className="bg-white dark:bg-[#11192e] p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col gap-5 w-full">
                      
                      <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
                            <ShieldAlert size={24} />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-sm md:text-base text-slate-850 dark:text-white uppercase tracking-tight">
                              Reconciliación y Aprobación de Auditoría Físico
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                              Auditor: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{activeSession.auditor_name || activeSession.username}</span> | Ubicación: <span className="text-slate-700 dark:text-slate-200 font-bold">{activeSession.store_name || 'Almacén Principal'}</span>
                            </p>
                          </div>
                        </div>

                        {activeSession.override_segregation === 1 && (
                          <div className="px-3 py-1 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-xl text-[9px] uppercase font-black tracking-wider">
                            ⚠️ Auto-Auditoría Excepcional
                          </div>
                        )}
                      </div>

                      {/* Métricas Generales */}
                      <div className="grid grid-cols-4 gap-2 bg-slate-50 dark:bg-black/35 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-center">
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Total Productos</span>
                          <div className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200 mt-1">{activeSummary.totalItems}</div>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Coincidencias</span>
                          <div className="font-mono font-bold text-xs text-emerald-500 mt-1">
                            {sessionItems.filter(it => it.counted_stock === (it.adjusted_expected_quantity ?? it.system_stock)).length}
                          </div>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Con Discrepancia</span>
                          <div className="font-mono font-bold text-xs text-rose-500 mt-1">{activeSummary.productsWithDiff}</div>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Diferencia Neta</span>
                          <div className={`font-mono font-bold text-xs mt-1 ${activeSummary.totalDiscrepancyUnits >= 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                            {activeSummary.totalDiscrepancyUnits > 0 ? `+${activeSummary.totalDiscrepancyUnits}` : activeSummary.totalDiscrepancyUnits} pz
                          </div>
                        </div>
                      </div>

                      {/* Tabla de Reconciliación Detallada */}
                      <div className="flex flex-col gap-2">
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 pl-1">
                          Comparativa: Stock Inicial Snapshot vs Movimientos vs Conteo Físico Real:
                        </span>

                        <div className="max-h-[300px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-black/10">
                          {sessionItems.map(it => {
                            const snapshot = it.expected_quantity_snapshot ?? it.system_stock ?? 0;
                            const movements = it.movements_during_count ?? 0;
                            const adjustedExp = it.adjusted_expected_quantity ?? (snapshot + movements);
                            const physical = it.counted_stock ?? 0;
                            const diff = physical - adjustedExp;

                            return (
                              <div key={it.id} className="p-3.5 flex items-center justify-between text-xs gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-extrabold text-slate-800 dark:text-slate-200 uppercase truncate">
                                    {it.product_name}
                                  </div>
                                  <div className="flex items-center gap-2 text-[9.5px] text-slate-450 dark:text-slate-400 font-mono mt-0.5">
                                    <span>SKU: {it.product_sku || 'N/A'}</span>
                                    {movements !== 0 && (
                                      <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded font-bold">
                                        ⚡ Movs durante auditoría: {movements > 0 ? `+${movements}` : movements}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Comparison Breakdown */}
                                <div className="flex items-center gap-4 text-right shrink-0">
                                  <div className="text-[10px] font-mono text-slate-500">
                                    <div>Snapshot: <span className="font-bold text-slate-700 dark:text-slate-300">{snapshot}</span></div>
                                    <div>Ajustado: <span className="font-bold text-slate-700 dark:text-slate-300">{adjustedExp}</span></div>
                                  </div>
                                  
                                  <div className="text-[11px] font-mono font-bold text-slate-850 dark:text-white px-2.5 py-1 bg-slate-100 dark:bg-slate-850 rounded-lg">
                                    Físico: {physical}
                                  </div>

                                  <div className={`text-xs font-mono font-black w-20 text-right ${
                                    diff === 0 ? 'text-emerald-500' : diff > 0 ? 'text-indigo-500' : 'text-rose-500'
                                  }`}>
                                    {diff === 0 ? '✓ 0' : diff > 0 ? `+${diff}` : `${diff}`} pz
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Observaciones de la Conciliación */}
                      <div className="flex flex-col gap-1.5 text-left">
                        <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">Observaciones Finales de la Conciliación:</label>
                        <input
                          type="text"
                          placeholder="Notas de aprobación y ajustes de inventario..."
                          value={adminNotes}
                          onChange={e => setAdminNotes(e.target.value)}
                          className="text-xs p-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#151f32] text-slate-800 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500 w-full"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <button
                          onClick={handleCancelSession}
                          className="py-3.5 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 text-rose-600 font-extrabold text-xs uppercase rounded-xl transition cursor-pointer"
                        >
                          Rechazar Conteo
                        </button>
                        <button
                          onClick={handleApproveCount}
                          disabled={isLoading}
                          className="py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase rounded-xl transition shadow-lg shadow-emerald-650/10 cursor-pointer"
                        >
                          {isLoading ? 'Guardando...' : 'Aprobar & Reconciliar Stock'}
                        </button>
                      </div>

                    </div>
                  )}

                </div>
              )}

              {/* SESIÓN EN PROGRESO (AUDITORIA ACTIVA EN CAMPO) */}
              {activeSession && activeSession.status !== 'completado' && (
                <div className="flex-1 flex flex-col gap-4 min-h-0">
                  
                  {/* BARRA DE INFORMACIÓN DE AUDITORÍA Y PROGRESO */}
                  <div className="bg-white dark:bg-[#101726]/70 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shrink-0 shadow-sm select-none">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                            Auditoría Físico Activa #{activeSession.id}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase rounded text-slate-600 dark:text-slate-300">
                            {activeSession.store_name || 'Almacén Principal'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{activeSummary.checkedItems}</span>
                          <span className="text-xs font-bold text-slate-450 dark:text-slate-400">de {activeSummary.totalItems} productos verificados</span>
                        </div>
                      </div>

                      {/* Stat Grid (Sin mostrar discrepancias durante el conteo a ciegas) */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 dark:bg-black/20 px-3.5 py-2 rounded-xl border border-slate-150/60 dark:border-slate-850">
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400 block leading-none">Auditor</span>
                          <span className="font-bold text-xs text-slate-750 dark:text-slate-200 block mt-1 truncate">
                            {activeSession.auditor_name || activeSession.username}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400 block leading-none">Pendientes</span>
                          <span className="font-mono font-bold text-xs text-amber-500 block mt-1">{activeSummary.pendingItems} pz</span>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <span className="text-[8px] font-black uppercase text-slate-400 block leading-none">Avance</span>
                          <span className="font-mono font-black text-xs text-emerald-500 block mt-1">{activeSummary.completedPercent}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Barra de progreso visual */}
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-3">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${activeSummary.completedPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* FILTROS Y BUSCADOR */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 select-none bg-white dark:bg-[#101726]/40 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                    <div className="relative w-full md:max-w-xs">
                      <input
                        type="text"
                        placeholder="Buscar por artículo, SKU, #ID o categoría..."
                        onChange={e => setItemSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 w-full bg-white dark:bg-[#151f32] border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 dark:text-white text-xs font-semibold h-10"
                        autoComplete="off"
                        spellCheck="false"
                      />
                      <Search className="absolute left-3 top-3 text-slate-400" size={14} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setActiveFilter('todos')}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider border cursor-pointer transition ${
                          activeFilter === 'todos'
                            ? 'bg-indigo-650 text-white border-indigo-650'
                            : 'bg-white dark:bg-[#151f32] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-850 hover:bg-slate-50'
                        }`}
                      >
                        Todos ({sessionItems.length})
                      </button>
                      <button
                        onClick={() => setActiveFilter('pendientes')}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider border cursor-pointer transition ${
                          activeFilter === 'pendientes'
                            ? 'bg-indigo-650 text-white border-indigo-650'
                            : 'bg-white dark:bg-[#151f32] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-850 hover:bg-slate-50'
                        }`}
                      >
                        Pendientes ({activeSummary.pendingItems})
                      </button>
                      <button
                        onClick={() => setActiveFilter('revisados')}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider border cursor-pointer transition ${
                          activeFilter === 'revisados'
                            ? 'bg-indigo-650 text-white border-indigo-650'
                            : 'bg-white dark:bg-[#151f32] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-850 hover:bg-slate-50'
                        }`}
                      >
                        Verificados ({activeSummary.checkedItems})
                      </button>
                    </div>

                    <label className="flex items-center gap-2 text-[10.5px] font-black uppercase text-slate-500 dark:text-slate-400 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={hideRevisados}
                        onChange={e => setHideRevisados(e.target.checked)}
                        className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <span>Ocultar ya contados</span>
                    </label>
                  </div>

                  {/* LISTADO DE PRODUCTOS PARA EL AUDITOR */}
                  <div className="flex-1 overflow-y-auto min-h-[30vh] flex flex-col gap-3 pr-1 scrollbar-thin">
                    {filteredItems.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 dark:text-slate-500 font-bold text-xs uppercase tracking-wide bg-white dark:bg-[#101726]/20 border border-slate-200 dark:border-slate-800 rounded-2xl select-none">
                        Ningún producto coincide con el filtro actual.
                      </div>
                    ) : (
                      filteredItems.map((it, idx) => {
                        const isChecked = it.is_checked === 1;

                        return (
                          <div 
                            key={it.id}
                            id={`product-card-${it.id}`}
                            className={`bg-white dark:bg-[#11192e] rounded-2xl border p-4 md:p-5 flex flex-col gap-3.5 transition-all duration-250 select-none ${
                              isChecked 
                                ? 'border-emerald-500/40 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.01]' 
                                : 'border-slate-200 dark:border-slate-850 hover:border-slate-300 shadow-sm'
                            }`}
                          >
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-450 dark:text-slate-400 uppercase tracking-widest font-black">
                                Producto {idx + 1} de {filteredItems.length}
                              </span>
                              <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border leading-none ${
                                isChecked 
                                  ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                                  : 'bg-slate-100 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800'
                              }`}>
                                {isChecked ? 'Verificado ✓' : 'Pendiente'}
                              </span>
                            </div>

                            {/* Informes del producto */}
                            <div className="flex flex-col">
                              <h4 className="font-extrabold text-sm md:text-base text-slate-850 dark:text-white uppercase leading-tight tracking-tight break-words">
                                {it.product_name}
                              </h4>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1 font-semibold text-[10.5px]">
                                <p className="text-slate-400 font-mono">
                                  SKU: <span className="text-slate-700 dark:text-slate-200 font-bold">{it.product_sku || 'Sin SKU'}</span>
                                </p>
                                <span className="bg-slate-100 dark:bg-[#192239] px-2 py-0.5 rounded-md text-slate-500 dark:text-slate-400 uppercase text-[9px] font-black">
                                  {it.product_category}
                                </span>
                              </div>

                              {it.recount_requested === 1 && (
                                <div className="mt-2.5 p-2 bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-bold rounded-xl flex items-center gap-2">
                                  <AlertOctagon size={16} />
                                  <span>⚠️ Recuento solicitado por Administración. Por favor vuelve a contar este artículo en anaquel.</span>
                                </div>
                              )}
                            </div>

                            {/* Control de entrada de Existencia Física (Sin mostrar stock esperado) */}
                            <div className="flex items-center justify-between gap-4 bg-slate-50 dark:bg-black/20 p-3.5 rounded-xl border border-slate-150/60 dark:border-slate-850">
                              <label className="text-[11px] font-black uppercase text-slate-700 dark:text-slate-300">
                                Cantidad física en anaquel:
                              </label>
                              
                              <div className="flex items-center gap-1.5 max-w-[200px] flex-1">
                                <button
                                  type="button"
                                  disabled={activeSession.status === 'completado'}
                                  onClick={() => handleUpdateItem(it.id, { counted_stock: Math.max(0, it.counted_stock - 1) })}
                                  className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#1a233a] border border-slate-200 dark:border-slate-800 text-slate-655 dark:text-slate-300 flex items-center justify-center font-extrabold text-lg hover:bg-slate-200 active:scale-95 transition shrink-0 select-none cursor-pointer disabled:opacity-50"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  disabled={activeSession.status === 'completado'}
                                  value={it.counted_stock === null || it.counted_stock === undefined ? '' : it.counted_stock}
                                  onFocus={e => e.target.select()}
                                  onChange={e => {
                                    const parsed = parseInt(e.target.value);
                                    if (!isNaN(parsed) && parsed >= 0) {
                                      handleUpdateItem(it.id, { counted_stock: parsed });
                                    } else if (e.target.value === '') {
                                      handleUpdateItem(it.id, { counted_stock: 0 });
                                    }
                                  }}
                                  className="w-full text-center font-mono font-black py-2 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 text-slate-850 dark:text-white bg-white dark:bg-[#11192e] text-base h-12 select-text"
                                />
                                <button
                                  type="button"
                                  disabled={activeSession.status === 'completado'}
                                  onClick={() => handleUpdateItem(it.id, { counted_stock: it.counted_stock + 1 })}
                                  className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#1a233a] border border-slate-200 dark:border-slate-800 text-slate-655 dark:text-slate-300 flex items-center justify-center font-extrabold text-lg hover:bg-slate-200 active:scale-95 transition shrink-0 select-none cursor-pointer disabled:opacity-50"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Observación / Nota del Auditor */}
                            <div className="flex flex-col gap-1 select-none">
                              <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 pl-0.5">Notas / Observaciones del auditor:</label>
                              <input
                                type="text"
                                placeholder="Ej. empaque roto, producto vencido, en exhibición..."
                                value={it.notes || ''}
                                disabled={activeSession.status === 'completado'}
                                onChange={e => handleUpdateItem(it.id, { notes: e.target.value })}
                                className="text-xs p-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11192e] rounded-xl text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500 w-full"
                              />
                            </div>

                            {/* Botón de Confirmación Tactil */}
                            <button
                              type="button"
                              disabled={activeSession.status === 'completado'}
                              onClick={() => handleToggleCheck(it)}
                              className={`w-full h-12 rounded-xl text-xs uppercase font-black tracking-widest transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 ${
                                isChecked 
                                  ? 'bg-slate-100 dark:bg-slate-850 text-slate-500 hover:bg-slate-200' 
                                  : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-500/10'
                              }`}
                            >
                              {isChecked ? (
                                <>
                                  <Check size={16} />
                                  <span>Contado y Guardado ✓ (Clic para editar)</span>
                                </>
                              ) : (
                                <span>Marcar como contado</span>
                              )}
                            </button>

                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* BARRAS DE ACCIONES FINALES */}
                  <div className="border-t border-slate-200 dark:border-slate-850 pt-4 shrink-0 flex flex-col gap-3 select-none bg-slate-50 dark:bg-[#0c111e]">
                    {activeSummary.pendingItems > 0 ? (
                      <div className="flex items-center gap-2 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl text-[11px] font-black uppercase">
                        <AlertTriangle size={15} />
                        <span>Faltan {activeSummary.pendingItems} productos por contar para poder concluir la auditoría.</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl text-[11px] font-black uppercase">
                        <CheckCircle size={15} />
                        <span>¡Todos los productos han sido auditados! Puedes concluir y enviar a reconciliación.</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleCancelSession}
                        className="py-3 px-4 bg-transparent border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-550 font-black text-xs uppercase rounded-xl transition cursor-pointer flex-1"
                      >
                        Cancelar Auditoría
                      </button>
                      <button
                        onClick={onClose}
                        className="py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-855 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-200 font-black text-xs uppercase rounded-xl transition cursor-pointer flex-1"
                      >
                        Pausar
                      </button>
                      <button
                        onClick={handleCompleteSession}
                        disabled={activeSummary.pendingItems > 0 || isLoading}
                        className={`py-3 px-6 font-black text-xs uppercase rounded-xl transition shadow-lg flex-1 cursor-pointer flex items-center justify-center gap-2 ${
                          activeSummary.pendingItems > 0 
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none' 
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-650/10'
                        }`}
                      >
                        <Check size={14} />
                        <span>Concluir Auditoría a Ciegas</span>
                      </button>
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* TAB DE HISTORIAL */}
          {activeTab === 'historico' && (
            <div className="flex-1 flex flex-col gap-4 min-h-0 select-none">
              <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
                <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl min-h-[30vh]">
                  
                  <div className="block lg:hidden flex flex-col gap-2.5 p-1">
                    {historicalCounts.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 font-bold text-xs uppercase tracking-wider">
                        No se registran auditorías históricas finalizadas.
                      </div>
                    ) : (
                      historicalCounts.map(h => {
                        const isApp = h.status === 'aprobado' || h.status === 'cerrado';
                        const isSelected = selectedHistoricCount?.id === h.id;
                        return (
                          <div
                            key={h.id}
                            className={`p-3.5 bg-white dark:bg-[#11192e] rounded-xl border flex flex-col gap-2 transition ${
                              isSelected 
                                ? 'border-indigo-500 bg-indigo-500/[0.01]' 
                                : 'border-slate-200 dark:border-slate-850 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-mono text-slate-400 font-black">#AUDIT-{h.id}</span>
                              <span className={`py-0.5 px-2 border rounded-full text-[8px] uppercase font-black ${
                                isApp 
                                  ? 'bg-emerald-500/5 text-emerald-600 border-emerald-500/10' 
                                  : 'bg-indigo-500/5 text-indigo-650 border-indigo-550/10'
                              }`}>
                                {h.status === 'cerrado' ? 'Conciliado' : h.status}
                              </span>
                            </div>
                            <div className="text-xs">
                              <p className="text-slate-800 dark:text-slate-200 font-bold">Auditor: {h.auditor_name || h.username}</p>
                              <p className="text-slate-400 text-[10px] font-medium mt-0.5">Ubicación: {h.store_name || 'Almacén Principal'}</p>
                              <p className="text-slate-400 text-[10px] font-medium mt-0.5">Cierre: {new Date(h.created_at).toLocaleString()}</p>
                            </div>
                            <button
                              onClick={() => handleViewHistoricCount(h)}
                              className="w-full mt-2 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 dark:border-slate-700 text-indigo-655 dark:text-indigo-400 text-[10px] font-black uppercase rounded-lg transition"
                            >
                              Ver detalles y diferencias
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="hidden lg:block">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 text-[9px] font-black text-slate-450 uppercase tracking-widest pl-4">
                          <th className="p-3 pl-5">ID Auditoría</th>
                          <th className="p-3">Auditor Responsable</th>
                          <th className="p-3">Ubicación / Almacén</th>
                          <th className="p-3 text-center">Modo</th>
                          <th className="p-3 text-center">Estado</th>
                          <th className="p-3 text-center">Fecha de Cierre</th>
                          <th className="p-3 text-center pr-5">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 dark:divide-slate-850 text-[11px] font-bold">
                        {historicalCounts.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-12 text-center text-slate-400 font-semibold uppercase tracking-wide">
                              No se registran auditorías o controles físicos históricos en este negocio.
                            </td>
                          </tr>
                        ) : (
                          historicalCounts.map(h => {
                            const isApp = h.status === 'aprobado' || h.status === 'cerrado';
                            const isSelected = selectedHistoricCount?.id === h.id;
                            return (
                              <tr 
                                key={h.id} 
                                className={`hover:bg-slate-100/30 dark:hover:bg-[#0d1221]/30 transition ${
                                  isSelected ? 'bg-indigo-500/5' : ''
                                }`}
                              >
                                <td className="p-3 pl-5 font-mono text-slate-450">#AUDIT-{h.id}</td>
                                <td className="p-3 uppercase text-slate-700 dark:text-slate-200">{h.auditor_name || h.username}</td>
                                <td className="p-3 uppercase text-slate-500">{h.store_name || 'Almacén Principal'}</td>
                                <td className="p-3 text-center">
                                  <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 py-0.5 px-2 text-[8.5px] font-black uppercase rounded-lg border border-indigo-500/20">
                                    {h.mode || 'BLIND'}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`py-0.5 px-2 border rounded-full text-[8.5px] uppercase font-black ${
                                    isApp 
                                      ? 'bg-emerald-500/5 text-emerald-600 border-emerald-500/10' 
                                      : 'bg-indigo-500/5 text-indigo-650 border-indigo-550/10'
                                  }`}>
                                    {h.status === 'cerrado' ? 'Conciliado' : h.status}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-mono text-slate-500 text-[10px]">{new Date(h.created_at).toLocaleString()}</td>
                                <td className="p-3 text-center pr-5">
                                  <button
                                    onClick={() => handleViewHistoricCount(h)}
                                    className="py-1 px-3 bg-slate-50 border border-slate-200 dark:bg-[#11192e] dark:border-slate-800 hover:bg-slate-100 text-indigo-655 dark:text-indigo-400 text-[10px] font-black uppercase rounded-lg transition"
                                  >
                                    Ver Detalle
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>

                {selectedHistoricCount && (
                  <div className="w-full md:w-96 shrink-0 flex flex-col gap-3 min-h-[300px]">
                    <div className="bg-white dark:bg-[#11192e] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-4 h-full">
                      <div className="flex justify-between items-center border-b border-slate-150 dark:border-slate-850 pb-2.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <span>Discrepancias Auditoría #{selectedHistoricCount.id}</span>
                        </span>
                        <button 
                          onClick={() => setSelectedHistoricCount(null)}
                          className="text-slate-400 hover:text-slate-650 dark:hover:text-white p-1 rounded-lg"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[40vh] flex flex-col gap-2.5 pr-1 scrollbar-thin">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider pl-1 block">Diferencias de producto individuales:</span>
                        
                        {historicItems.map(it => {
                          const exp = it.adjusted_expected_quantity ?? it.system_stock ?? 0;
                          const physical = it.counted_stock ?? 0;
                          const diff = physical - exp;

                          if (diff === 0) return null;

                          return (
                            <div key={it.id} className="p-3 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/40 dark:bg-[#070c14]/30 flex justify-between items-center">
                              <div className="max-w-[70%]">
                                <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase truncate leading-none">{it.product_name}</div>
                                <div className="text-[9px] text-slate-450 dark:text-slate-400 font-mono mt-1.5 font-bold">
                                  Esperado: {exp} | Físico: {physical}
                                </div>
                              </div>
                              <span className={`font-mono text-xs font-black shrink-0 ${diff > 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                                {diff > 0 ? `+${diff}` : diff} pz
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* PIE DE PÁGINA */}
        <div className="p-4 md:p-5 bg-white dark:bg-[#0f1626] border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0 select-none pb-8 md:pb-5">
          <span className="text-[10px] text-slate-400 font-bold hidden sm:inline uppercase">
            {activeTab === 'activo' ? 'Sesión de Auditoría en Curso' : 'Historial de Auditorías'}
          </span>
          <button 
            type="button"
            onClick={onClose} 
            className="px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-white font-extrabold text-xs uppercase rounded-xl cursor-pointer transition select-none flex items-center justify-center min-h-[44px]"
          >
            Cerrar Panel
          </button>
        </div>

      </div>
    </div>
  );
}
