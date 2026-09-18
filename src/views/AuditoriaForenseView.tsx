import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppContext } from '../context/AppContext';
import { canAccessForensicAudit } from '../utils/permissions';
import { 
  ShieldCheck, ShieldAlert, Sparkles, Search, RefreshCw, Filter, 
  Calendar, CheckCircle2, AlertTriangle, XCircle, ArrowDownLeft, 
  ArrowUpRight, User, Clock, FileText, Printer, ChevronRight, 
  HelpCircle, Send, Database, BarChart3, AlertOctagon, Info, Lock,
  Check, Layers, History, TrendingUp, TrendingDown, DollarSign, CalendarDays
} from 'lucide-react';

interface PeriodProductItem {
  id: number;
  name: string;
  sku: string;
  category: string;
  currentStock: number;
  openingStock: number;
  periodPurchases: number;
  purchaseCount: number;
  periodSales: number;
  salesCount: number;
  periodAdjustmentsInc: number;
  periodAdjustmentsDec: number;
  expectedClosingStock: number;
  closingRecordedStock: number;
  discrepancy: number;
  isBalanced: boolean;
  hasMovementInPeriod: boolean;
}

interface PeriodTransactionItem {
  id: string | number;
  timestamp: string;
  productId: number;
  productName: string;
  sku: string;
  operationType: 'creacion' | 'compra' | 'venta' | 'ajuste_inc' | 'ajuste_dec' | 'conteo' | 'devolucion';
  reference: string;
  operator: string;
  operatorRole?: string;
  quantityChanged: number;
  runningCalculatedStock: number;
  recordedSnapshot?: number | null;
  hasDiscrepancy: boolean;
  discrepancyDelta?: number;
  notes?: string;
  priceOrCost?: number;
}

interface PeriodAuditData {
  filter: {
    periodType: string;
    label: string;
    startStr: string;
    endStr: string;
    productId?: number;
    onlyDiscrepancies: boolean;
  };
  metrics: {
    totalProductsAudited: number;
    balancedProductsCount: number;
    discrepantProductsCount: number;
    totalUnitsDrift: number;
    totalTransactionsReviewed: number;
    totalPurchasesUnits: number;
    purchasesCount: number;
    totalSalesUnits: number;
    salesCount: number;
    totalSalesAmount: number;
    totalAdjustmentsCount: number;
    anomaliesCount: number;
  };
  products: PeriodProductItem[];
  recordLedger: PeriodTransactionItem[];
  anomalies: Array<{
    timestamp: string;
    productId: number;
    productName: string;
    sku: string;
    type: string;
    description: string;
    operator: string;
    expectedStock: number;
    recordedStock: number;
    gap: number;
    recommendation: string;
  }>;
  executionTimestamp: string;
}

interface ProductTimelineItem {
  id: string | number;
  timestamp: string;
  eventType: string;
  operationLabel: string;
  referenceId?: string | number;
  userName: string;
  userRole?: string;
  quantityChanged: number;
  runningCalculatedStock: number;
  recordedStockAfter?: number | null;
  discrepancyDelta?: number;
  isAnomaly: boolean;
  notes?: string;
  priceOrCost?: number;
}

interface ProductAuditData {
  productId: number;
  name: string;
  sku: string;
  category: string;
  currentRecordedStock: number;
  calculatedLedgerStock: number;
  stockDifference: number;
  isBalanced: boolean;
  initialStock: number;
  initialStockDate?: string;
  initialStockAuthor?: string;
  totalPurchased: number;
  purchaseCount: number;
  totalSold: number;
  salesCount: number;
  totalAdjustmentsInc: number;
  totalAdjustmentsDec: number;
  totalReturns: number;
  anomaliesDetected: number;
  timeline: ProductTimelineItem[];
  identifiedGaps: Array<{
    timestamp: string;
    description: string;
    userName: string;
    expectedStock: number;
    recordedStock: number;
    gap: number;
    reason: string;
  }>;
}

export default function AuditoriaForenseView() {
  const { user, showNotification } = useAppContext();
  const hasAccess = canAccessForensicAudit(user);

  // Active View Tab: 'period_catalog' (Item por Ítem) | 'ledger_records' (Registro por Registro) | 'product_detail' (Ficha)
  const [activeTab, setActiveTab] = useState<'period_catalog' | 'ledger_records' | 'product_detail'>('period_catalog');

  // Period Filter Configuration
  const [periodType, setPeriodType] = useState<'today' | 'week' | 'month' | 'year' | 'all' | 'custom'>('month');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState<boolean>(false);
  const [catalogSearch, setCatalogSearch] = useState<string>('');

  // Available periods from server
  const [availableMonths, setAvailableMonths] = useState<Array<{ value: string; label: string }>>([
    { value: '2026-09', label: 'Septiembre 2026' },
    { value: '2026-08', label: 'Agosto 2026' },
    { value: '2026-07', label: 'Julio 2026' }
  ]);
  const [availableYears, setAvailableYears] = useState<number[]>([2026]);

  // Data States
  const [periodData, setPeriodData] = useState<PeriodAuditData | null>(null);
  const [productAudit, setProductAudit] = useState<ProductAuditData | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string; sku: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Search in selector
  const [productQuery, setProductQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // AI Diagnostic States
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiCustomQuestion, setAiCustomQuestion] = useState<string>('');

  // Reconciliation Confirmation Modal State
  const [reconcileTarget, setReconcileTarget] = useState<PeriodProductItem | null>(null);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);

  // Load available periods on mount
  useEffect(() => {
    if (hasAccess) {
      loadPeriodsInfo();
      loadPeriodAudit();
      searchProducts('');
    }
  }, [hasAccess]);

  const loadPeriodsInfo = async () => {
    try {
      const res = await fetch('/api/forensic-audit/periods', {
        headers: {
          'x-user-role': user?.role || '',
          'x-user-username': user?.username || '',
          'x-user-permissions': JSON.stringify(user?.permissions || {})
        }
      });
      if (res.ok) {
        const d = await res.json();
        if (d.availableMonths && d.availableMonths.length > 0) {
          setAvailableMonths(d.availableMonths);
          setSelectedMonth(d.availableMonths[0].value);
        }
        if (d.availableYears && d.availableYears.length > 0) {
          setAvailableYears(d.availableYears);
          setSelectedYear(d.availableYears[0]);
        }
        if (d.currentBoliviaDate) {
          setSelectedDate(d.currentBoliviaDate);
          setStartDate(d.currentBoliviaDate);
          setEndDate(d.currentBoliviaDate);
        }
      }
    } catch (e) {
      console.warn('Error loading periods info:', e);
    }
  };

  const loadPeriodAudit = async (overrideParams?: Partial<{
    periodType: string;
    date: string;
    month: string;
    year: number;
    startDate: string;
    endDate: string;
    onlyDiscrepancies: boolean;
    search: string;
  }>) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      const pType = overrideParams?.periodType || periodType;
      params.append('periodType', pType);

      if (pType === 'today') {
        const d = overrideParams?.date || selectedDate;
        if (d) params.append('date', d);
      } else if (pType === 'month') {
        const m = overrideParams?.month || selectedMonth;
        if (m) params.append('month', m);
      } else if (pType === 'year') {
        const y = overrideParams?.year || selectedYear;
        if (y) params.append('year', String(y));
      } else if (pType === 'custom') {
        const s = overrideParams?.startDate || startDate;
        const e = overrideParams?.endDate || endDate;
        if (s) params.append('startDate', s);
        if (e) params.append('endDate', e);
      }

      const onlyDisc = overrideParams?.onlyDiscrepancies !== undefined ? overrideParams.onlyDiscrepancies : onlyDiscrepancies;
      if (onlyDisc) {
        params.append('onlyDiscrepancies', 'true');
      }

      const q = overrideParams?.search !== undefined ? overrideParams.search : catalogSearch;
      if (q && q.trim()) {
        params.append('search', q.trim());
      }

      const res = await fetch(`/api/forensic-audit/period-audit?${params.toString()}`, {
        headers: {
          'x-user-role': user?.role || '',
          'x-user-username': user?.username || '',
          'x-user-permissions': JSON.stringify(user?.permissions || {})
        }
      });

      if (!res.ok) {
        throw new Error('Error al ejecutar auditoría automática por período');
      }

      const data = await res.json();
      if (data.success) {
        setPeriodData(data);
      }
    } catch (err: any) {
      showNotification(err.message || 'Error al conectar con el motor forense', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const searchProducts = async (q: string) => {
    try {
      setIsSearching(true);
      const res = await fetch(`/api/forensic-audit/search?q=${encodeURIComponent(q)}`, {
        headers: {
          'x-user-role': user?.role || '',
          'x-user-username': user?.username || '',
          'x-user-permissions': JSON.stringify(user?.permissions || {})
        }
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const loadProductAudit = async (productId: number) => {
    try {
      setIsLoading(true);
      setProductAudit(null);
      const res = await fetch(`/api/forensic-audit/product/${productId}`, {
        headers: {
          'x-user-role': user?.role || '',
          'x-user-username': user?.username || '',
          'x-user-permissions': JSON.stringify(user?.permissions || {})
        }
      });
      if (!res.ok) {
        throw new Error('No se pudo obtener el historial del producto');
      }
      const data = await res.json();
      if (data.success) {
        setProductAudit(data);
        setActiveTab('product_detail');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const executeAIAudit = async (customQ?: string) => {
    try {
      setIsGeneratingAI(true);
      const payload: any = {
        scope: activeTab === 'product_detail' && selectedProduct ? 'single_product' : 'period',
        periodType,
        date: periodType === 'today' ? selectedDate : undefined,
        month: periodType === 'month' ? selectedMonth : undefined,
        year: periodType === 'year' ? selectedYear : undefined,
        startDate: periodType === 'custom' ? startDate : undefined,
        endDate: periodType === 'custom' ? endDate : undefined,
        productId: activeTab === 'product_detail' && selectedProduct ? selectedProduct.id : undefined,
        onlyDiscrepancies,
        customQuestion: customQ || aiCustomQuestion || undefined
      };

      const res = await fetch('/api/forensic-audit/ai-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-username': user?.username || '',
          'x-user-permissions': JSON.stringify(user?.permissions || {})
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Falla al procesar auditoría inteligente');
      }

      const data = await res.json();
      if (data.success) {
        setAiReport(data.report);
        showNotification('Dictamen forense generado con éxito', 'success');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleReconcileProduct = async (product: PeriodProductItem) => {
    try {
      setIsReconciling(true);
      const res = await fetch('/api/forensic-audit/reconcile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-username': user?.username || '',
          'x-user-permissions': JSON.stringify(user?.permissions || {})
        },
        body: JSON.stringify({
          productId: product.id,
          notes: `Conciliación administrativa certificada en auditoría (${product.name}, de ${product.currentStock} a ${product.expectedClosingStock} uds)`
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo conciliar el producto');
      }

      showNotification(data.message || 'Producto conciliado con éxito', 'success');
      setReconcileTarget(null);
      // Reload current audit view
      loadPeriodAudit();
      if (selectedProduct && selectedProduct.id === product.id) {
        loadProductAudit(product.id);
      }
    } catch (e: any) {
      showNotification(e.message, 'error');
    } finally {
      setIsReconciling(false);
    }
  };

  // Filtered products list
  const filteredProducts = useMemo(() => {
    if (!periodData) return [];
    return periodData.products.filter(p => {
      if (onlyDiscrepancies && p.isBalanced) return false;
      if (!catalogSearch) return true;
      const s = catalogSearch.toLowerCase();
      return p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.category.toLowerCase().includes(s);
    });
  }, [periodData, onlyDiscrepancies, catalogSearch]);

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 text-center bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 m-6">
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mb-4 ring-8 ring-rose-50 dark:ring-rose-900/20">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Acceso Exclusivo de Administración</h2>
        <p className="text-slate-600 dark:text-slate-400 max-w-md text-sm mb-6 leading-relaxed">
          El módulo de <strong>Auditoría Forense con Inteligencia Artificial</strong> contiene revisiones profundas de transacciones, libros mayores y diagnóstico causal de desvíos. Solo los usuarios con rol de Administrador o autorización explícita pueden visualizar y utilizar esta herramienta.
        </p>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs font-medium">
          Privilegio requerido: <code className="text-indigo-600 dark:text-indigo-400 font-mono">access_forensic_audit</code>
        </span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-indigo-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" /> Auditoría Forense Activa
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Lock className="w-3 h-3" /> Solo Administrador
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-500/30 text-indigo-200">
                Modo Solo Lectura Inmutable
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
              <span>Auditoría Inteligente & Conciliación Forense</span>
              <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl leading-relaxed">
              Inspección matemática exhaustiva de la base de datos completa ítem por ítem y registro por registro. Revise por <strong>día, semana, mes, año o histórico completo</strong> para cotejar compras, ventas y ajustes e identificar cualquier desfase con precisión pericial.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center flex-wrap">
            <button
              onClick={() => {
                if (activeTab === 'product_detail' && selectedProduct) {
                  loadProductAudit(selectedProduct.id);
                } else {
                  loadPeriodAudit();
                }
              }}
              disabled={isLoading}
              className="px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-white rounded-xl text-sm font-medium border border-slate-700 flex items-center gap-2 transition shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
              <span>Actualizar Registros</span>
            </button>
            <button
              onClick={() => executeAIAudit()}
              disabled={isGeneratingAI}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isGeneratingAI ? 'animate-spin' : ''}`} />
              <span>{isGeneratingAI ? 'Auditando...' : 'Generar Dictamen IA'}</span>
            </button>
          </div>
        </div>

        {/* Mode Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab('period_catalog')}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'period_catalog'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Auditoría por Período & Catálogo (141 SKUs)</span>
          </button>
          <button
            onClick={() => setActiveTab('ledger_records')}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'ledger_records'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Cotejo Registro por Registro ({periodData?.recordLedger.length || 0} operaciones)</span>
          </button>
          <button
            onClick={() => setActiveTab('product_detail')}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'product_detail'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Inspección Quirúrgica de Producto {selectedProduct ? `(${selectedProduct.sku})` : ''}</span>
          </button>
        </div>
      </div>

      {/* Temporal Control Bar (Selector por Día, Semana, Mes, Año, Histórico) */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-2 flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5 text-indigo-500" /> Período:
          </span>

          <button
            onClick={() => {
              setPeriodType('today');
              loadPeriodAudit({ periodType: 'today' });
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              periodType === 'today'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Día (Hoy)
          </button>

          <button
            onClick={() => {
              setPeriodType('week');
              loadPeriodAudit({ periodType: 'week' });
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              periodType === 'week'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Esta Semana (7 Días)
          </button>

          <button
            onClick={() => {
              setPeriodType('month');
              loadPeriodAudit({ periodType: 'month' });
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              periodType === 'month'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Mes
          </button>

          <button
            onClick={() => {
              setPeriodType('year');
              loadPeriodAudit({ periodType: 'year' });
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              periodType === 'year'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Año
          </button>

          <button
            onClick={() => {
              setPeriodType('all');
              loadPeriodAudit({ periodType: 'all' });
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              periodType === 'all'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Histórico Completo
          </button>

          <button
            onClick={() => {
              setPeriodType('custom');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              periodType === 'custom'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Personalizado
          </button>
        </div>

        {/* Dynamic Period Dropdowns/Inputs */}
        <div className="flex items-center gap-2 flex-wrap">
          {periodType === 'today' && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500">Fecha:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  loadPeriodAudit({ periodType: 'today', date: e.target.value });
                }}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200"
              />
            </div>
          )}

          {periodType === 'month' && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500">Mes:</span>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  loadPeriodAudit({ periodType: 'month', month: e.target.value });
                }}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                {availableMonths.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {periodType === 'year' && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500">Año:</span>
              <select
                value={selectedYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setSelectedYear(y);
                  loadPeriodAudit({ periodType: 'year', year: y });
                }}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {periodType === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
              />
              <span className="text-slate-400">al</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
              />
              <button
                onClick={() => loadPeriodAudit({ periodType: 'custom', startDate, endDate })}
                className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-500"
              >
                Filtrar
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1 hidden sm:block" />

          {/* Active Period Badge */}
          <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold border border-indigo-200 dark:border-indigo-800/60">
            {periodData?.filter.label || 'Cargando...'}
          </span>
        </div>
      </div>

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Auditados</span>
            <Database className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">
            {periodData?.metrics.totalProductsAudited || 0}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Productos revisados</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Cuadrados</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {periodData?.metrics.balancedProductsCount || 0}
          </div>
          <p className="text-[10px] text-emerald-600/80">Coincidencia perfecta</p>
        </div>

        <div className={`p-4 rounded-xl border shadow-sm ${
          (periodData?.metrics.discrepantProductsCount || 0) > 0 
            ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50' 
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80'
        }`}>
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Desfases</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className={`text-xl font-bold ${(periodData?.metrics.discrepantProductsCount || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
            {periodData?.metrics.discrepantProductsCount || 0}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {periodData?.metrics.totalUnitsDrift ? `${periodData.metrics.totalUnitsDrift} uds desvío` : 'Sin desvío'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Registros</span>
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">
            {periodData?.metrics.totalTransactionsReviewed || 0}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Cotejados uno a uno</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Compras (+)</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            +{periodData?.metrics.totalPurchasesUnits || 0}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">{periodData?.metrics.purchasesCount || 0} lotes ingresados</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Ventas (-)</span>
            <DollarSign className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
            -{periodData?.metrics.totalSalesUnits || 0}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            Bs. {(periodData?.metrics.totalSalesAmount || 0).toLocaleString('es-BO', { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* AI Diagnostic Report Banner (if generated) */}
      <AnimatePresence>
        {aiReport && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 shadow-lg overflow-hidden"
          >
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 px-6 py-4 flex items-center justify-between text-white border-b border-indigo-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/30 flex items-center justify-center text-indigo-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Dictamen Oficial del Auditor Forense con IA</h3>
                  <p className="text-xs text-indigo-200">Basado en evidencias fácticas inmutables de base de datos SQLite y bitácora de seguridad</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(aiReport);
                    showNotification('Informe copiado al portapapeles', 'info');
                  }}
                  className="px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900 text-indigo-200 rounded-lg text-xs font-medium border border-indigo-700/50 transition flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900 text-indigo-200 rounded-lg text-xs font-medium border border-indigo-700/50 transition flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
                <button
                  onClick={() => setAiReport(null)}
                  className="p-1.5 hover:bg-indigo-800/60 text-slate-300 hover:text-white rounded-lg transition"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-4 max-h-[600px] overflow-y-auto text-slate-800 dark:text-slate-200 leading-relaxed font-sans prose dark:prose-invert max-w-none text-sm">
              <div className="whitespace-pre-wrap font-sans">
                {aiReport}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Forensic Question Interactive Bar */}
      <div className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-slate-900/50 dark:to-indigo-950/30 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
        <div className="flex items-center gap-2 mb-2 text-indigo-900 dark:text-indigo-300 font-semibold text-sm">
          <HelpCircle className="w-4 h-4 text-indigo-500" />
          <span>Consultar al Auditor Forense IA sobre cualquier registro, movimiento o usuario del período:</span>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={aiCustomQuestion}
              onChange={(e) => setAiCustomQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && aiCustomQuestion.trim()) {
                  executeAIAudit(aiCustomQuestion);
                }
              }}
              placeholder="Ej: ¿Por qué se generó el desfase en este período? o ¿Qué usuario registró las salidas?"
              className="w-full pl-4 pr-10 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm rounded-xl border border-indigo-200 dark:border-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>
          <button
            onClick={() => executeAIAudit(aiCustomQuestion)}
            disabled={isGeneratingAI || !aiCustomQuestion.trim()}
            className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition shadow-sm whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            <span>Consultar Evidencia</span>
          </button>
        </div>

        {/* Quick Question Chips */}
        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Sugerencias rápidas:</span>
          <button
            onClick={() => {
              const q = `Cotejar todas las ventas del período ${periodData?.filter.label} y certificar si coinciden exactamente con el libro mayor.`;
              setAiCustomQuestion(q);
              executeAIAudit(q);
            }}
            className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition"
          >
            Cotejar ventas del período
          </button>
          <button
            onClick={() => {
              const q = '¿Existe algún desfase o anomalía en las ventas y compras registradas hoy?';
              setAiCustomQuestion(q);
              executeAIAudit(q);
            }}
            className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition"
          >
            Revisar transacciones de hoy
          </button>
          <button
            onClick={() => {
              const q = '¿Por qué ocurrió el desfase de 110 unidades en el SKU 14 y cómo certifica la IA que el saldo real es 360 unidades?';
              setAiCustomQuestion(q);
              executeAIAudit(q);
            }}
            className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition"
          >
            Auditoría histórica SKU 14
          </button>
        </div>
      </div>

      {/* Main Tab 1: Item-by-Item Period Catalog */}
      {activeTab === 'period_catalog' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm overflow-hidden">
            {/* Table Filters Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Buscar ítem o SKU (ej. Flash bolsa, 14)..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyDiscrepancies}
                    onChange={(e) => {
                      setOnlyDiscrepancies(e.target.checked);
                      loadPeriodAudit({ onlyDiscrepancies: e.target.checked });
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Mostrar solo con desfase</span>
                </label>

                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Mostrando <strong>{filteredProducts.length}</strong> de {periodData?.metrics.totalProductsAudited || 141} ítems
                </span>
              </div>
            </div>

            {/* Products Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Producto / SKU</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3 text-right">Apertura Período</th>
                    <th className="p-3 text-right text-emerald-600">Compras (+)</th>
                    <th className="p-3 text-right text-amber-600">Ventas (-)</th>
                    <th className="p-3 text-right">Ajustes (+/-)</th>
                    <th className="p-3 text-right font-bold text-indigo-600 dark:text-indigo-400">Cierre Calculado</th>
                    <th className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">Stock en Ficha</th>
                    <th className="p-3 text-center">Estado / Desfase</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin mx-auto mb-2" />
                        <span>Calculando balances matemáticos ítem por ítem...</span>
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500">
                        No se encontraron productos que coincidan con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => (
                      <tr 
                        key={p.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition ${
                          !p.isBalanced ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{p.name}</div>
                          <div className="font-mono text-[10px] text-slate-500">SKU: {p.sku}</div>
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">{p.category}</td>
                        <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">{p.openingStock}</td>
                        <td className="p-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {p.periodPurchases > 0 ? `+${p.periodPurchases}` : '0'}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                          {p.periodSales > 0 ? `-${p.periodSales}` : '0'}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                          {p.periodAdjustmentsInc - p.periodAdjustmentsDec > 0 
                            ? `+${p.periodAdjustmentsInc - p.periodAdjustmentsDec}` 
                            : (p.periodAdjustmentsInc - p.periodAdjustmentsDec < 0 ? `${p.periodAdjustmentsInc - p.periodAdjustmentsDec}` : '0')}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                          {p.expectedClosingStock}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">
                          {p.closingRecordedStock}
                        </td>
                        <td className="p-3 text-center">
                          {p.isBalanced ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" /> Cuadrado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                              <AlertTriangle className="w-3 h-3" /> Desfase {p.discrepancy > 0 ? `+${p.discrepancy}` : p.discrepancy}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedProduct({ id: p.id, name: p.name, sku: p.sku });
                                loadProductAudit(p.id);
                              }}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-medium transition"
                            >
                              Inspeccionar
                            </button>
                            {!p.isBalanced && (
                              <button
                                onClick={() => setReconcileTarget(p)}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Conciliar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab 2: Record-by-Record Immutable Transaction Ledger */}
      {activeTab === 'ledger_records' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-500" />
                  <span>Cotejo de Transacciones Registro por Registro ({periodData?.recordLedger.length || 0} operaciones)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Cada compra, venta y ajuste se compara contra el saldo continuo calculado y el snapshot del sistema
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">Fecha y Hora (BO)</th>
                    <th className="p-3">Tipo Operación</th>
                    <th className="p-3">Producto & SKU</th>
                    <th className="p-3">Comprobante / Ref</th>
                    <th className="p-3">Operador</th>
                    <th className="p-3 text-right">Variación ($\pm$)</th>
                    <th className="p-3 text-right text-indigo-600 dark:text-indigo-400 font-bold">Saldo Calculado</th>
                    <th className="p-3 text-right text-slate-500">Snapshot Guardado</th>
                    <th className="p-3 text-center">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {periodData?.recordLedger.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500">
                        No se registraron operaciones en este período.
                      </td>
                    </tr>
                  ) : (
                    periodData?.recordLedger.map((rec, i) => (
                      <tr
                        key={rec.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition ${
                          rec.hasDiscrepancy ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                        }`}
                      >
                        <td className="p-3 text-center text-slate-400 font-mono">{i + 1}</td>
                        <td className="p-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {rec.timestamp.substring(0, 19).replace('T', ' ')}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            rec.operationType === 'compra'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : rec.operationType === 'venta'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          }`}>
                            {rec.operationType}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{rec.productName}</div>
                          <div className="font-mono text-[10px] text-slate-500">SKU: {rec.sku}</div>
                        </td>
                        <td className="p-3 font-mono text-slate-700 dark:text-slate-300">{rec.reference}</td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">@{rec.operator}</span>
                          {rec.operatorRole && <span className="text-[10px] text-slate-400 block">({rec.operatorRole})</span>}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          <span className={rec.quantityChanged > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                            {rec.quantityChanged > 0 ? `+${rec.quantityChanged}` : rec.quantityChanged}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {rec.runningCalculatedStock}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-500">
                          {rec.recordedSnapshot !== null && rec.recordedSnapshot !== undefined ? rec.recordedSnapshot : '—'}
                        </td>
                        <td className="p-3 text-center">
                          {rec.hasDiscrepancy ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="w-3 h-3" /> Salto ({rec.discrepancyDelta})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" /> OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab 3: Surgical Product Audit Deep-Dive */}
      {activeTab === 'product_detail' && (
        <div className="space-y-6">
          {/* Product Search & Selector */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
              Seleccionar Producto para Inspección Quirúrgica:
            </label>
            <div className="flex flex-col md:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    searchProducts(e.target.value);
                  }}
                  placeholder="Escriba el nombre o SKU (ej. Flash bolsa 8gb, 14)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {selectedProduct && (
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-medium text-indigo-900 dark:text-indigo-200 self-stretch md:self-auto">
                  <span>Seleccionado: <strong>{selectedProduct.name}</strong> (SKU: {selectedProduct.sku})</span>
                </div>
              )}
            </div>

            {/* Search Suggestions Grid */}
            {searchResults.length > 0 && !selectedProduct && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p);
                      setProductQuery(p.name);
                      loadProductAudit(p.id);
                    }}
                    className="p-2.5 text-left bg-slate-50 hover:bg-indigo-50 dark:bg-slate-900 dark:hover:bg-indigo-950/50 rounded-xl border border-slate-200 dark:border-slate-700/60 transition text-xs flex items-center justify-between group"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate max-w-[200px]">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-slate-500">SKU: {p.sku} | Cat: {p.category}</div>
                    </div>
                    <span className="font-bold font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {p.stock} uds
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Forensic Details */}
          {isLoading ? (
            <div className="p-16 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Reconstruyendo libro mayor inmutable y trazando eventos históricos...</p>
            </div>
          ) : productAudit ? (
            <div className="space-y-6">
              {/* Product Dossier Card */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-700/80">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                        {productAudit.category}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                        SKU: {productAudit.sku}
                      </span>
                      {productAudit.isBalanced ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 100% Cuadrado
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Descuadre: {productAudit.stockDifference} uds
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                      {productAudit.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Creado el {productAudit.initialStockDate ? productAudit.initialStockDate.substring(0, 19).replace('T', ' ') : 'inicio'} por @{productAudit.initialStockAuthor || 'sistema'}
                    </p>
                  </div>

                  {/* Stock Comparison Pill */}
                  <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-center">
                      <span className="text-[11px] uppercase font-semibold text-slate-500 block">Stock en Ficha</span>
                      <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{productAudit.currentRecordedStock}</span>
                    </div>
                    <div className="text-slate-400 font-mono text-lg">=</div>
                    <div className="text-center">
                      <span className="text-[11px] uppercase font-semibold text-indigo-600 dark:text-indigo-400 block">Libro Mayor</span>
                      <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{productAudit.calculatedLedgerStock}</span>
                    </div>
                  </div>
                </div>

                {/* Mathematical Equation Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-5">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] text-slate-500 block font-medium">Stock Inicial</span>
                    <span className="text-lg font-bold text-slate-800 dark:text-slate-200">+{productAudit.initialStock}</span>
                    <span className="text-[10px] text-slate-400 block">Al dar de alta</span>
                  </div>

                  <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/40">
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-medium">Ingresos (Compras)</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">+{productAudit.totalPurchased}</span>
                    <span className="text-[10px] text-emerald-600/70 block">{productAudit.purchaseCount} lotes recibidos</span>
                  </div>

                  <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/40">
                    <span className="text-[11px] text-amber-700 dark:text-amber-400 block font-medium">Salidas (Ventas)</span>
                    <span className="text-lg font-bold text-amber-600 dark:text-amber-400">-{productAudit.totalSold}</span>
                    <span className="text-[10px] text-amber-600/70 block">{productAudit.salesCount} tickets cobrados</span>
                  </div>

                  <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-900/40">
                    <span className="text-[11px] text-blue-700 dark:text-blue-400 block font-medium">Ajustes Positivos</span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">+{productAudit.totalAdjustmentsInc}</span>
                    <span className="text-[10px] text-blue-600/70 block">Devoluciones y ajustes</span>
                  </div>

                  <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-900/40">
                    <span className="text-[11px] text-rose-700 dark:text-rose-400 block font-medium">Ajustes Negativos</span>
                    <span className="text-lg font-bold text-rose-600 dark:text-rose-400">-{productAudit.totalAdjustmentsDec}</span>
                    <span className="text-[10px] text-rose-600/70 block">Bajas o mermas</span>
                  </div>
                </div>
              </div>

              {/* Identified Historical Gaps (if any) */}
              {productAudit.identifiedGaps.length > 0 && (
                <div className="bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-900/50 p-6">
                  <div className="flex items-center gap-2 mb-3 text-amber-900 dark:text-amber-300 font-bold text-sm">
                    <AlertOctagon className="w-4 h-4 text-amber-600" />
                    <span>Registro de Desfases Temporales en Instantáneas Históricas ({productAudit.identifiedGaps.length} eventos):</span>
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-400/90 mb-4 leading-relaxed">
                    El sistema detectó los siguientes momentos históricos donde la instantánea temporal de stock difería del libro mayor. Estos desfases ya han sido neutralizados por la reconciliación y el escudo Stock Guard:
                  </p>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {productAudit.identifiedGaps.map((gap, i) => (
                      <div key={i} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200/80 dark:border-amber-900/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {gap.description}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Fecha: <span className="font-mono">{gap.timestamp.substring(0, 19).replace('T', ' ')}</span> | Operador: <strong className="text-indigo-600">@{gap.userName}</strong> | Motivo: {gap.reason}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-center">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Esperado: {gap.expectedStock}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold">
                            Brecha: {gap.gap > 0 ? `+${gap.gap}` : gap.gap}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chronological Immutable Ledger Table */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-500" />
                      <span>Cronología Inmutable de Transacciones ({productAudit.timeline.length} movimientos)</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Registro secuencial paso a paso con cálculo de saldo continuo
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3">Fecha y Hora (BO)</th>
                        <th className="p-3">Operación</th>
                        <th className="p-3">Usuario Responsable</th>
                        <th className="p-3 text-right">Variación ($\pm$)</th>
                        <th className="p-3 text-right">Saldo Libro Mayor</th>
                        <th className="p-3 text-right">Saldo Snapshot</th>
                        <th className="p-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {productAudit.timeline.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition ${
                            item.isAnomaly ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                          }`}
                        >
                          <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {item.timestamp.substring(0, 19).replace('T', ' ')}
                          </td>
                          <td className="p-3">
                            <span className="font-medium text-slate-800 dark:text-slate-200 block">
                              {item.operationLabel}
                            </span>
                            {item.notes && (
                              <span className="text-[10px] text-slate-500 block truncate max-w-xs">{item.notes}</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                              <User className="w-3 h-3 text-slate-400" />
                              @{item.userName}
                            </span>
                            {item.userRole && (
                              <span className="text-[10px] text-slate-400 block">({item.userRole})</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono font-bold">
                            <span className={item.quantityChanged > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {item.quantityChanged > 0 ? `+${item.quantityChanged}` : item.quantityChanged}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {item.runningCalculatedStock}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-500">
                            {item.recordedStockAfter !== undefined && item.recordedStockAfter !== null ? item.recordedStockAfter : '—'}
                          </td>
                          <td className="p-3 text-center">
                            {item.isAnomaly ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="w-3 h-3" /> Desfase ({item.discrepancyDelta})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" /> OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
              <Search className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Seleccione un producto en el buscador superior o haga clic en "Inspeccionar" en la tabla para auditar su libro mayor completo.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Reconciliation Modal Confirmation */}
      <AnimatePresence>
        {reconcileTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Conciliación Certificada</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Ajuste inmutable con sellado en bitácora</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {reconcileTarget.name} (SKU: {reconcileTarget.sku})
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Stock Actual en Ficha:</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">{reconcileTarget.currentStock} uds</span>
                </div>
                <div className="flex justify-between text-indigo-600 dark:text-indigo-400">
                  <span>Stock Real según Libro Mayor:</span>
                  <span className="font-bold font-mono">{reconcileTarget.expectedClosingStock} uds</span>
                </div>
                <div className="flex justify-between text-rose-600 dark:text-rose-400 font-bold border-t border-slate-200 dark:border-slate-700 pt-1">
                  <span>Ajuste a Aplicar:</span>
                  <span className="font-mono">
                    {reconcileTarget.expectedClosingStock - reconcileTarget.currentStock > 0 ? '+' : ''}
                    {reconcileTarget.expectedClosingStock - reconcileTarget.currentStock} uds
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Esta acción registrará un asiento de auditoría formal a nombre del Administrador <strong>@{user?.username}</strong>, dejando constancia criptográfica y actualizando el catálogo a su saldo contable exacto.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setReconcileTarget(null)}
                  disabled={isReconciling}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleReconcileProduct(reconcileTarget)}
                  disabled={isReconciling}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isReconciling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Conciliando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirmar y Cuadrar</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
