import { safeDispatchEvent } from "../utils/events";
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, CartItem, Product, Client, ReceiptTemplate, Department, SaleTab, RgbThemeSettings } from '../types';
import { normalizePermissions } from '../utils/permissions';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, getDocFromServer, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { getOfflineSales, deleteOfflineSale, getOfflineActions, deleteOfflineAction, saveOfflineAction, hasOfflineActions, hasOfflineSales, cacheAppState, getCachedAppState } from '../utils/offlineStorage';

// Initialize Client-Side Firebase SDK
const app = initializeApp(firebaseConfig);
export const firestoreDb = (firebaseConfig as any).firestoreDatabaseId ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId) : getFirestore(app);

// Silence internal Firestore SDK connection logs (warnings/info)
try {
  setLogLevel('silent');
} catch (e) {}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null
    },
    operationType,
    path
  };
  
  const isPermissionError = errMessage.toLowerCase().includes('permission') || 
                            errMessage.toLowerCase().includes('insufficient') || 
                            errMessage.toLowerCase().includes('denied');

  if (isPermissionError) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  } else {
    // Standard connection or availability limitations are logged as console warnings to prevent blocking diagnostic error tracking
    console.warn(`[Sync Offline Mode] Standard local database operates standalone. Remote cloud sync is bypassed due to connectivity/offline status: ${errMessage}`);
  }
}

// Validate Connection to Firestore and warn if client is offline
async function testConnection() {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error: any) {
    // Safely catch any connectivity error without throwing or raising console errors
    console.log(`[Sync Connection Test] Note: Cloud backend connection is not active currently (${error?.message || error}). POS local SQLite is fully interactive.`);
  }
}
testConnection();

export type ViewType = 'inicio' | 'pos' | 'ventas_pendientes' | 'historial_ventas' | 'productos' | 'departamentos' | 'inventario' | 'auditoria' | 'devoluciones' | 'reportes' | 'analisis' | 'usuarios' | 'configuraciones' | 'cajas';

interface AppContextType {
    isInitializing: boolean;
    kioskMode: boolean;
    setKioskMode: (k: boolean) => void;
    user: User | null;
    setUser: (u: User | null) => void;
    darkMode: boolean;
    setDarkMode: (d: boolean) => void;
    cart: CartItem[];
    addToCart: (product: Product, quantity?: number) => void;
    updateCartItemQuantity: (productId: number, qty: number) => void;
    removeFromCart: (productId: number) => void;
    clearCart: (isCompletedSale?: boolean) => void;
    lastClearedCart: CartItem[] | null;
    lastClearedMeta: any;
    cartBackup: CartItem[] | null;
    cartBackupMeta: any;
    restoreLastClearedCart: () => boolean;
    restoreCartBackup: () => boolean;
    discardCartBackup: () => void;
    updateCartItemPrice: (productId: number, priceType: 'unit' | 'bulk' | 'custom', customPrice?: number) => void;
    products: Product[];
    clients: Client[];
    fetchProducts: (searchQuery?: string) => Promise<void>;
    fetchClients: () => Promise<void>;
    hasMoreProducts: boolean;
    totalProducts: number;
    loadMoreProducts: (searchQuery?: string) => Promise<void>;
    view: ViewType;
    setView: (v: ViewType) => void;
    exchangeRate: number;
    setExchangeRate: (r: number) => void;
    fetchExchangeRate: () => Promise<void>;
    roundBs: (num: number) => number;
    isOffline: boolean;
    receiptTemplate: ReceiptTemplate;
    updateReceiptTemplate: (tpl: ReceiptTemplate) => Promise<void>;
    fetchReceiptTemplate: () => Promise<void>;
    departments: Department[];
    fetchDepartments: () => Promise<void>;
    tabs: SaleTab[];
    setTabs: React.Dispatch<React.SetStateAction<SaleTab[]>>;
    activeTabId: number;
    setActiveTabId: React.Dispatch<React.SetStateAction<number>>;
    clientName: string;
    setClientName: React.Dispatch<React.SetStateAction<string>>;
    clientPhone: string;
    setClientPhone: React.Dispatch<React.SetStateAction<string>>;
    discount: number;
    setDiscount: React.Dispatch<React.SetStateAction<number>>;
    discountType: 'monto' | 'porcentaje';
    setDiscountType: React.Dispatch<React.SetStateAction<'monto' | 'porcentaje'>>;
    paymentMethod: 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Crédito';
    setPaymentMethod: React.Dispatch<React.SetStateAction<'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Crédito'>>;
    theme: string;
    setTheme: React.Dispatch<React.SetStateAction<string>>;
    rgbSettings: RgbThemeSettings;
    setRgbSettings: React.Dispatch<React.SetStateAction<RgbThemeSettings>>;
    isSyncing: boolean;
    triggerOnlineSync: () => Promise<void>;
    syncError: string | null;
    setSyncError: React.Dispatch<React.SetStateAction<string | null>>;
    
    // S.I.T.A. Autonomous QA Testing Systems
    isAutonomousTesting: boolean;
    setIsAutonomousTesting: (b: boolean) => void;
    autonomousStep: number;
    setAutonomousStep: (n: number) => void;
    autonomousLogs: string[];
    setAutonomousLogs: React.Dispatch<React.SetStateAction<string[]>>;
    apiPingResults: any;
    setApiPingResults: (results: any) => void;

    // PWA Install Properties
    pwaPrompt: any;
    setPwaPrompt: (prompt: any) => void;
    installPWA: () => Promise<void>;
    isPwaInstalled: boolean;
    showNotification?: (message: string, type?: 'success' | 'error' | 'warn' | 'info') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [kioskMode, setKioskMode] = useState(() => localStorage.getItem('kioskMode') === 'true');
    const [isOffline, setIsOffline] = useState(() => !window.navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    // PWA states
    const [pwaPrompt, setPwaPrompt] = useState<any>(null);
    const [isPwaInstalled, setIsPwaInstalled] = useState<boolean>(() => {
        const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
        const localFlag = localStorage.getItem('pwa_installed') === 'true';
        return standalone || localFlag;
    });

    useEffect(() => {
        const handleBeforeInstall = (e: any) => {
            e.preventDefault();
            setPwaPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        const handleAppInstalled = () => {
            setIsPwaInstalled(true);
            localStorage.setItem('pwa_installed', 'true');
            setPwaPrompt(null);
        };
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const installPWA = async () => {
        if (pwaPrompt) {
            pwaPrompt.prompt();
            const { outcome } = await pwaPrompt.userChoice;
            if (outcome === 'accepted') {
                setPwaPrompt(null);
                setIsPwaInstalled(true);
                localStorage.setItem('pwa_installed', 'true');
            }
        } else {
            alert("¡GTR POS ya está optimizado como PWA instalable!\n\nPara instalar:\n1. En PC: haz clic en el icono de instalación (pantalla con flecha hacia abajo) a la derecha en la barra de direcciones de tu navegador.\n2. En iPhone (Safari): pulsa el botón 'Compartir' y selecciona 'Añadir a pantalla de inicio'.\n3. En Android (Chrome): pulsa los 3 puntos superiores y selecciona 'Instalar aplicación' o 'Añadir a pantalla de inicio'.");
        }
    };

    // S.I.T.A. Autonomous active variables
    const [isAutonomousTesting, setIsAutonomousTesting] = useState(false);
    const [autonomousStep, setAutonomousStep] = useState(0);
    const [autonomousLogs, setAutonomousLogs] = useState<string[]>([]);
    const [apiPingResults, setApiPingResults] = useState<any>(null);

    useEffect(() => {
        const handleOnline = () => {
            setIsOffline(false);
            console.log("[Sync] Device returned online. Fetching latest remote database state...");
            fetchProducts();
            fetchClients();
            fetchExchangeRate();
        };
        const handleOffline = () => {
            setIsOffline(true);
            console.warn("[Sync] Device is offline. Standard local database operates standalone.");
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const fetchWithRetry = async (url: string, options?: RequestInit, retries = 3, delay = 800): Promise<Response> => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('Offline mode - network is disconnected');
        }
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (error) {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                throw new Error('Offline mode - network is disconnected');
            }
            if (retries > 0) {
                console.warn(`[Sync Retry] Fetch to ${url} failed. Retrying in ${delay}ms... (${retries} retries left)`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, retries - 1, delay * 1.5);
            }
            throw error;
        }
    };

    // Initial load from local cache to prevent load delay, synchronized asynchronously with Firestore
    const [user, setUserState] = useState<User | null>(() => {
        const u = localStorage.getItem('user');
        if (u) {
            try { 
                const parsed = JSON.parse(u);
                if (parsed && parsed.username !== 'none' && parsed.role !== 'none') {
                    if (parsed.permissions) {
                        parsed.permissions = normalizePermissions(parsed.permissions);
                    }
                    return parsed; 
                }
            } catch { return null; }
        }
        return null; // Return null so the system requests Login first rather than skipping credentials
    });

    // Real-time synchronization is managed locally for each independent terminal session.
    // We do not subscribe to a single global active_session document to prevent cross-logout conflicts.

    const setUser = (u: User | null) => {
        const normalizedUser = u ? {
            ...u,
            permissions: normalizePermissions(u.permissions)
        } as User : null;
        
        setUserState(normalizedUser);
        try {
            if (normalizedUser) {
                localStorage.setItem('user', JSON.stringify(normalizedUser));
            } else {
                localStorage.removeItem('user');
                localStorage.removeItem('auth_token');
            }
        } catch (err) {
            console.error("Failed to save local user session state:", err);
        }
    };

    // Real-time synchronization of user permissions & role with the server database state
    useEffect(() => {
        if (!user) return;

        const syncUserSession = async () => {
            try {
                const authToken = localStorage.getItem('auth_token');
                const res = await fetch('/api/auth/me', {
                    headers: {
                        'x-user-id': String(user.id),
                        'x-user-role': user.role || '',
                        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                    }
                });
                if (res.ok) {
                    const freshUser = await res.json();
                    
                    const localPerms = JSON.stringify(normalizePermissions(user.permissions));
                    const remotePerms = JSON.stringify(normalizePermissions(freshUser.permissions));
                    
                    if (
                        user.role !== freshUser.role || 
                        user.username !== freshUser.username || 
                        user.email !== freshUser.email || 
                        localPerms !== remotePerms
                    ) {
                        console.log("[Sync] User role/permissions updated on server, synchronizing session...", freshUser);
                        setUser(freshUser);
                    }
                } else if (res.status === 401 && authToken) {
                    console.warn("[Sync] Auth token invalid or expired. Logging out.");
                    setUser(null);
                }
            } catch (err) {
                console.warn("[Sync] Background session sync failed:", err);
            }
        };

        // Run immediately on mount or user change
        syncUserSession();

        // Check for updates every 10 seconds for ultra-responsive updates
        const intervalId = setInterval(syncUserSession, 10000);
        return () => clearInterval(intervalId);
    }, [user?.id]);

    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('darkMode') === 'true';
    });

    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('theme') || 'emerald';
    });

    const [rgbSettings, setRgbSettings] = useState<RgbThemeSettings>(() => {
        try {
            const saved = localStorage.getItem('rgb_theme_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (!parsed.animationStyle) parsed.animationStyle = 'smooth';
                return parsed;
            }
        } catch (e) {
            console.error("Failed to parse rgb settings", e);
        }
        return {
            effectType: 'neon',
            speed: 20,
            glowIntensity: 'normal',
            angle: -45,
            customColors: ['#ff00ff', '#00f0ff', '#39ff14', '#0066ff', '#9900ff', '#ff7700'],
            animationStyle: 'smooth'
        };
    });

    const [view, setViewInternal] = useState<ViewType>(() => {
        try {
            const saved = localStorage.getItem('cached_current_view');
            return (saved as ViewType) || 'pos';
        } catch {
            return 'pos';
        }
    });

    const setView = (v: ViewType) => {
        setViewInternal(v);
        try {
            localStorage.setItem('cached_current_view', v);
        } catch (e) {
            console.error("Failed to cache current view:", e);
        }
    };

    // State for multi-comanda tabs
    const [tabs, setTabs] = useState<SaleTab[]>(() => {
        try {
            const cached = localStorage.getItem('cached_sales_tabs');
            return cached ? JSON.parse(cached) : [
                { id: 1, name: "Venta 1", cart: [], clientName: "", clientPhone: "", discount: 0, discountType: 'monto', paymentMethod: 'Efectivo' }
            ];
        } catch {
            return [
                { id: 1, name: "Venta 1", cart: [], clientName: "", clientPhone: "", discount: 0, discountType: 'monto', paymentMethod: 'Efectivo' }
            ];
        }
    });
    const [activeTabId, setActiveTabId] = useState<number>(() => {
        try {
            const cached = localStorage.getItem('cached_active_tab_id');
            return cached ? parseInt(cached) : 1;
        } catch {
            return 1;
        }
    });

    const getInitialTab = () => {
        // Find saved tab or default to first
        const found = tabs.find(t => t.id === activeTabId) || tabs[0];
        return found || { id: 1, name: "Venta 1", cart: [], clientName: "", clientPhone: "", discount: 0, discountType: 'monto', paymentMethod: 'Efectivo' };
    };

    const initialTab = getInitialTab();

    const [clientName, setClientName] = useState(() => initialTab.clientName || "");
    const [clientPhone, setClientPhone] = useState(() => initialTab.clientPhone || "");
    const [discount, setDiscount] = useState(() => initialTab.discount || 0);
    const [discountType, setDiscountType] = useState<'monto' | 'porcentaje'>(() => initialTab.discountType || 'monto');
    const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Crédito'>(() => initialTab.paymentMethod || 'Efectivo');
    const [cart, setCart] = useState<CartItem[]>(() => initialTab.cart || []);

    // Safety recall & recovery buffer states
    const [lastClearedCart, setLastClearedCart] = useState<CartItem[] | null>(() => {
        try {
            const saved = localStorage.getItem('gtr_pos_last_cleared_cart');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed.cart) && parsed.cart.length > 0) return parsed.cart;
            }
        } catch {}
        return null;
    });

    const [lastClearedMeta, setLastClearedMeta] = useState<any>(() => {
        try {
            const saved = localStorage.getItem('gtr_pos_last_cleared_cart');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    clientName: parsed.clientName,
                    clientPhone: parsed.clientPhone,
                    discount: parsed.discount,
                    discountType: parsed.discountType,
                    paymentMethod: parsed.paymentMethod,
                    timestamp: parsed.timestamp
                };
            }
        } catch {}
        return null;
    });

    const [cartBackup, setCartBackup] = useState<CartItem[] | null>(() => {
        try {
            const saved = localStorage.getItem('gtr_pos_active_cart_backup');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed.cart) && parsed.cart.length > 0) return parsed.cart;
            }
        } catch {}
        return null;
    });

    const [cartBackupMeta, setCartBackupMeta] = useState<any>(() => {
        try {
            const saved = localStorage.getItem('gtr_pos_active_cart_backup');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    clientName: parsed.clientName,
                    clientPhone: parsed.clientPhone,
                    discount: parsed.discount,
                    discountType: parsed.discountType,
                    paymentMethod: parsed.paymentMethod,
                    timestamp: parsed.timestamp
                };
            }
        } catch {}
        return null;
    });

    // Auto-save rolling backup whenever active cart has items
    useEffect(() => {
        if (cart.length > 0) {
            try {
                const payload = {
                    cart,
                    clientName,
                    clientPhone,
                    discount,
                    discountType,
                    paymentMethod,
                    activeTabId,
                    timestamp: new Date().toISOString()
                };
                localStorage.setItem('gtr_pos_active_cart_backup', JSON.stringify(payload));
            } catch (e) {
                console.error("Failed saving active cart safety backup:", e);
            }
        }
    }, [cart, clientName, clientPhone, discount, discountType, paymentMethod, activeTabId]);

    // Sync tabs list and active ID to localStorage and IndexedDB
    useEffect(() => {
        localStorage.setItem('cached_sales_tabs', JSON.stringify(tabs));
        cacheAppState('cached_sales_tabs', tabs);
    }, [tabs]);

    useEffect(() => {
        localStorage.setItem('cached_active_tab_id', String(activeTabId));
    }, [activeTabId]);

    // Sync active tab state to local variables when activeTabId changes
    useEffect(() => {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
            setCart(activeTab.cart || []);
            setClientName(activeTab.clientName || "");
            setClientPhone(activeTab.clientPhone || "");
            setDiscount(activeTab.discount || 0);
            setDiscountType(activeTab.discountType || 'monto');
            setPaymentMethod(activeTab.paymentMethod || 'Efectivo');
        }
    }, [activeTabId]);

    // Sync state variables back to the tabs list
    useEffect(() => {
        setTabs(prev => prev.map(t => {
            if (t.id === activeTabId) {
                return {
                    ...t,
                    cart,
                    clientName,
                    clientPhone,
                    discount,
                    discountType,
                    paymentMethod
                };
            }
            return t;
        }));
    }, [cart, clientName, clientPhone, discount, discountType, paymentMethod, activeTabId]);
    const [products, setProducts] = useState<Product[]>(() => {
        try {
            const cached = localStorage.getItem('cached_products');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [hasMoreProducts, setHasMoreProducts] = useState(false);
    const [totalProducts, setTotalProducts] = useState(0);
    const [productsOffset, setProductsOffset] = useState(0);
    const PRODUCTS_LIMIT = 50;
    const [clients, setClients] = useState<Client[]>(() => {
        try {
            const cached = localStorage.getItem('cached_clients');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [exchangeRate, setExchangeRateInternal] = useState<number>(() => {
        try {
            const cached = localStorage.getItem('cached_exchange_rate');
            if (cached) {
                const parsed = parseFloat(cached);
                return (isNaN(parsed) || parsed <= 0) ? 6.96 : parsed;
            }
            return 6.96;
        } catch {
            return 6.96;
        }
    });

    const setExchangeRate = (rate: any) => {
        try {
            const val = typeof rate === 'function' ? rate(exchangeRate) : rate;
            const parsed = parseFloat(val);
            const safe = (isNaN(parsed) || parsed <= 0) ? 6.96 : parsed;
            setExchangeRateInternal(safe);
            localStorage.setItem('cached_exchange_rate', String(safe));
        } catch {
            setExchangeRateInternal(6.96);
        }
    };

    const defaultReceiptTemplate: ReceiptTemplate = {
        logoText: "GTR POS TERMINAL",
        showLogo: true,
        headerText: "Cochabamba - Bolivia\nTelf: 444-XXXXX\nNIT: 382910023",
        footerText: "¡Gracias por su preferencia!\nConserve su recibo para cualquier reclamo.",
        showDate: true,
        showCashier: true,
        showClientInfo: true,
        showHeaderDivider: true,
        showFooterDivider: true,
        showItemSKU: false,
        showPaymentMethod: true,
        fontFamily: 'Helvetica',
        fontSizeHeader: 14,
        fontSizeBody: 8,
        ticketWidth: 80,
        logoImage: null
    };

    const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplate>(() => {
        try {
            const cached = localStorage.getItem('cached_receipt_template');
            return cached ? JSON.parse(cached) : defaultReceiptTemplate;
        } catch {
            return defaultReceiptTemplate;
        }
    });

    const [departments, setDepartments] = useState<Department[]>(() => {
        try {
            const cached = localStorage.getItem('cached_departments');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });

    const roundBs = (amount: number): number => {
        return Math.round(amount * 2) / 2;
    };

    const fetchExchangeRate = async () => {
        try {
            const res = await fetchWithRetry('/api/settings/exchange-rate');
            const data = await res.json();
            const rawRate = data ? data.exchange_rate : null;
            const rate = (rawRate !== undefined && rawRate !== null) ? parseFloat(rawRate) : 6.96;
            const safeRate = (isNaN(rate) || rate <= 0) ? 6.96 : rate;
            setExchangeRate(safeRate);
            setIsOffline(false);
        } catch (e) {
            console.warn("Failed to fetch exchange rate, using cached value:", e);
            const cached = localStorage.getItem('cached_exchange_rate');
            if (cached) {
                const parsed = parseFloat(cached);
                setExchangeRate(isNaN(parsed) || parsed <= 0 ? 6.96 : parsed);
            } else {
                setExchangeRate(6.96);
            }
            if (e instanceof Error && (e.message.includes('Failed to fetch') || e.message.includes('fetch'))) {
                setIsOffline(true);
            }
        }
    };

    useEffect(() => {
        localStorage.setItem('darkMode', String(darkMode));
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    useEffect(() => {
        localStorage.setItem('theme', theme);
        const classes = document.documentElement.classList;
        const themesToRemove: string[] = [];
        for (let i = 0; i < classes.length; i++) {
            const c = classes.item(i);
            if (c && c.startsWith('theme-')) {
                themesToRemove.push(c);
            }
        }
        themesToRemove.forEach(c => classes.remove(c));
        classes.add(`theme-${theme}`);
        
        if (theme === 'rgb') {
            classes.add('gamer-rgb-glow');
        } else {
            classes.remove('gamer-rgb-glow');
        }
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('rgb_theme_settings', JSON.stringify(rgbSettings));
        
        let colors: string[] = [];
        switch (rgbSettings.effectType) {
            case 'rainbow':
                colors = ['#ff0000', '#ffaa00', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'];
                break;
            case 'neon':
                colors = ['#ff00ff', '#00f0ff', '#39ff14', '#ff0077', '#7000ff', '#ff00ff'];
                break;
            case 'fireIce':
                colors = ['#ff2a00', '#ff9d00', '#00f0ff', '#0066ff', '#ff2a00'];
                break;
            case 'aurora':
                colors = ['#00ffcc', '#2efc3a', '#0d98ba', '#9900ff', '#39ff14', '#00ffcc'];
                break;
            case 'cyberpunk':
                colors = ['#ff0055', '#9900ff', '#00ffcc', '#ff9900', '#ff00ff'];
                break;
            case 'oceanic':
                colors = ['#002244', '#005588', '#0088cc', '#00ffcc', '#00ffaa', '#002244'];
                break;
            case 'sunset':
                colors = ['#ff3300', '#ff6600', '#ff9900', '#cc0066', '#660066', '#ff3300'];
                break;
            case 'pastel':
                colors = ['#ffb7b2', '#ffdac1', '#e2f0cb', '#b5ead7', '#c7ceea', '#ffb7b2'];
                break;
            case 'custom':
                colors = rgbSettings.customColors && rgbSettings.customColors.length > 0
                    ? [...rgbSettings.customColors, rgbSettings.customColors[0]]
                    : ['#ff00ff', '#00f0ff', '#ff00ff'];
                break;
            default:
                colors = ['#ff00ff', '#00f0ff', '#39ff14', '#0066ff', '#9900ff', '#ff7700', '#ff00ff'];
        }

        const angleStr = `${rgbSettings.angle}deg`;
        const gradient = `linear-gradient(${angleStr}, ${colors.join(', ')})`;
        
        let glowRadius = '15px';
        let glowColor = 'rgba(0, 255, 204, 0.35)';
        let glowHoverRadius = '25px';
        let glowHoverColor = 'rgba(0, 255, 204, 0.65)';

        switch (rgbSettings.glowIntensity) {
            case 'none':
                glowRadius = '0px';
                glowColor = 'rgba(0,0,0,0)';
                glowHoverRadius = '0px';
                glowHoverColor = 'rgba(0,0,0,0)';
                break;
            case 'subtle':
                glowRadius = '6px';
                glowColor = 'rgba(0, 255, 204, 0.15)';
                glowHoverRadius = '12px';
                glowHoverColor = 'rgba(0, 255, 204, 0.3)';
                break;
            case 'normal':
                glowRadius = '15px';
                glowColor = 'rgba(0, 255, 204, 0.35)';
                glowHoverRadius = '25px';
                glowHoverColor = 'rgba(0, 255, 204, 0.65)';
                break;
            case 'intense':
                glowRadius = '28px';
                glowColor = 'rgba(0, 255, 204, 0.75)';
                glowHoverRadius = '45px';
                glowHoverColor = 'rgba(0, 255, 204, 0.95)';
                break;
        }

        // Animation timing easing & direction
        let ease = 'ease-in-out';
        let direction = 'infinite';

        if (rgbSettings.animationStyle === 'linear') {
            ease = 'linear';
            direction = 'infinite';
        } else if (rgbSettings.animationStyle === 'smooth') {
            ease = 'cubic-bezier(0.4, 0, 0.2, 1)';
            direction = 'infinite';
        } else if (rgbSettings.animationStyle === 'cyclic') {
            ease = 'cubic-bezier(0.45, 0, 0.55, 1)';
            direction = 'infinite alternate';
        }

        const root = document.documentElement;
        root.style.setProperty('--rgb-gradient', gradient);
        root.style.setProperty('--rgb-speed', `${rgbSettings.speed}s`);
        root.style.setProperty('--rgb-glow-radius', glowRadius);
        root.style.setProperty('--rgb-glow-color', glowColor);
        root.style.setProperty('--rgb-glow-hover-radius', glowHoverRadius);
        root.style.setProperty('--rgb-glow-hover-color', glowHoverColor);
        root.style.setProperty('--rgb-ease', ease);
        root.style.setProperty('--rgb-direction', direction);
    }, [rgbSettings]);

    // Pre-hydrate state from IndexedDB instantly on component mount
    useEffect(() => {
        const prehydrateFromIndexedDB = async () => {
            try {
                const [cachedProds, cachedClis, cachedDeps, cachedRcpt, cachedExRate, cachedSalesTabs] = await Promise.all([
                    getCachedAppState<Product[]>('cached_products'),
                    getCachedAppState<Client[]>('cached_clients'),
                    getCachedAppState<Department[]>('cached_departments'),
                    getCachedAppState<ReceiptTemplate>('cached_receipt_template'),
                    getCachedAppState<number>('cached_exchange_rate'),
                    getCachedAppState<SaleTab[]>('cached_sales_tabs')
                ]);

                if (cachedProds && cachedProds.length > 0) {
                    setProducts(cachedProds);
                    setTotalProducts(cachedProds.length);
                }
                if (cachedClis && cachedClis.length > 0) setClients(cachedClis);
                if (cachedDeps && cachedDeps.length > 0) setDepartments(cachedDeps);
                if (cachedRcpt) setReceiptTemplate(cachedRcpt);
                if (cachedExRate) setExchangeRate(cachedExRate);
                if (cachedSalesTabs && cachedSalesTabs.length > 0) setTabs(cachedSalesTabs);
            } catch (err) {
                console.warn("[IndexedDB] Hydration error:", err);
            }
        };
        prehydrateFromIndexedDB();
    }, []);

    useEffect(() => {
        if (user && user.username && user.username !== 'none') {
            setIsInitializing(true);
            Promise.all([
                fetchProducts(),
                fetchClients(),
                fetchExchangeRate(),
                fetchReceiptTemplate(),
                fetchDepartments(),
                fetchKioskMode()
            ]).finally(() => {
                setTimeout(() => setIsInitializing(false), 800); // Elegant small delay for animation
            });
        } else {
            setIsInitializing(false);
        }
    }, [user?.id, user?.username]);

    const fetchKioskMode = async () => {
        try {
            const res = await fetchWithRetry('/api/settings/kiosk');
            if (res.ok) {
                const data = await res.json();
                setKioskMode(data.kiosk_mode);
                localStorage.setItem('kioskMode', String(data.kiosk_mode));
            }
        } catch (e) {
            console.warn("Failed to fetch kiosk mode:", e);
        }
    };

    const fetchReceiptTemplate = async () => {
        try {
            const res = await fetchWithRetry('/api/settings/receipt');
            const data = await res.json();
            setReceiptTemplate(data);
            localStorage.setItem('cached_receipt_template', JSON.stringify(data));
            cacheAppState('cached_receipt_template', data);
        } catch (e) {
            console.warn("Failed to fetch receipt template, using cached value:", e);
            const cachedIdx = await getCachedAppState<ReceiptTemplate>('cached_receipt_template');
            if (cachedIdx) {
                setReceiptTemplate(cachedIdx);
            } else {
                const cached = localStorage.getItem('cached_receipt_template');
                if (cached) {
                    try {
                        setReceiptTemplate(JSON.parse(cached));
                    } catch (parseErr) {
                        console.error("Failed to parse cached receipt template:", parseErr);
                    }
                }
            }
        }
    };

    const fetchDepartments = async () => {
        try {
            const res = await fetchWithRetry('/api/departments');
            const data = await res.json();
            setDepartments(data);
            localStorage.setItem('cached_departments', JSON.stringify(data));
            cacheAppState('cached_departments', data);
        } catch (e) {
            console.warn("Failed to fetch departments, using cached value:", e);
            const cachedIdx = await getCachedAppState<Department[]>('cached_departments');
            if (cachedIdx && cachedIdx.length > 0) {
                setDepartments(cachedIdx);
            } else {
                const cached = localStorage.getItem('cached_departments');
                if (cached) {
                    try {
                        setDepartments(JSON.parse(cached));
                    } catch (parseErr) {
                        console.error("Failed to parse cached departments:", parseErr);
                    }
                }
            }
        }
    };

    const updateReceiptTemplate = async (template: ReceiptTemplate) => {
        try {
            setReceiptTemplate(template);
            localStorage.setItem('cached_receipt_template', JSON.stringify(template));
            cacheAppState('cached_receipt_template', template);
            const res = await fetch('/api/settings/receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template })
            });
            if (!res.ok) {
                throw new Error("No se pudo guardar la plantilla.");
            }
        } catch (e: any) {
            console.error("Failed to save receipt template:", e);
            throw e;
        }
    };

    const fetchProducts = async (searchQuery?: string) => {
        try {
            setProductsOffset(0);
            const url = searchQuery ? `/api/products?lazy=true&limit=${PRODUCTS_LIMIT}&offset=0&search=${encodeURIComponent(searchQuery)}` : `/api/products?lazy=true&limit=${PRODUCTS_LIMIT}&offset=0`;
            const res = await fetchWithRetry(url);
            const data = await res.json();
            
            // Check if response has pagination wrapper
            if (data && Array.isArray(data.products)) {
                setProducts(data.products);
                setTotalProducts(data.total);
                setHasMoreProducts(data.has_more);
                localStorage.setItem('cached_products', JSON.stringify(data.products));
                cacheAppState('cached_products', data.products);
            } else {
                const arr = Array.isArray(data) ? data : [];
                setProducts(arr);
                setTotalProducts(arr.length);
                setHasMoreProducts(false);
                localStorage.setItem('cached_products', JSON.stringify(arr));
                cacheAppState('cached_products', arr);
            }
            setIsOffline(false);
        } catch (e) {
            console.warn("Failed to fetch products, using cached value:", e);
            const cachedIdx = await getCachedAppState<Product[]>('cached_products');
            if (cachedIdx && cachedIdx.length > 0) {
                setProducts(cachedIdx);
                setTotalProducts(cachedIdx.length);
                setHasMoreProducts(false);
            } else {
                const cached = localStorage.getItem('cached_products');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        setProducts(parsed);
                        setTotalProducts(parsed.length);
                        setHasMoreProducts(false);
                    } catch (parseErr) {
                        console.error("Failed to parse cached products:", parseErr);
                    }
                }
            }
            if (e instanceof Error && (e.message.includes('Failed to fetch') || e.message.includes('fetch'))) {
                setIsOffline(true);
            }
        }
    };

    const loadMoreProducts = async (searchQuery?: string) => {
        try {
            const nextOffset = productsOffset + PRODUCTS_LIMIT;
            const url = searchQuery ? `/api/products?lazy=true&limit=${PRODUCTS_LIMIT}&offset=${nextOffset}&search=${encodeURIComponent(searchQuery)}` : `/api/products?lazy=true&limit=${PRODUCTS_LIMIT}&offset=${nextOffset}`;
            const res = await fetchWithRetry(url);
            const data = await res.json();
            
            if (data && Array.isArray(data.products)) {
                setProducts(prev => {
                    const merged = [...prev, ...data.products];
                    // Save merged set in cache to prevent offline gaps
                    localStorage.setItem('cached_products', JSON.stringify(merged));
                    cacheAppState('cached_products', merged);
                    return merged;
                });
                setProductsOffset(nextOffset);
                setTotalProducts(data.total);
                setHasMoreProducts(data.has_more);
            }
            setIsOffline(false);
        } catch (e) {
            console.error("Failed to load more products:", e);
        }
    };

    const fetchClients = async () => {
        try {
            const res = await fetchWithRetry('/api/clients');
            const data = await res.json();
            setClients(data);
            localStorage.setItem('cached_clients', JSON.stringify(data));
            cacheAppState('cached_clients', data);
            setIsOffline(false);
        } catch (e) {
            console.warn("Failed to fetch clients, using cached value:", e);
            const cachedIdx = await getCachedAppState<Client[]>('cached_clients');
            if (cachedIdx && cachedIdx.length > 0) {
                setClients(cachedIdx);
            } else {
                const cached = localStorage.getItem('cached_clients');
                if (cached) {
                    try {
                        setClients(JSON.parse(cached));
                    } catch (parseErr) {
                        console.error("Failed to parse cached clients:", parseErr);
                    }
                }
            }
            if (e instanceof Error && (e.message.includes('Failed to fetch') || e.message.includes('fetch'))) {
                setIsOffline(true);
            }
        }
    };

    // STRICT ITEM CONSOLIDATION & QUANTITY ADDITION RULE (WITH STOCK LEVEL LITERALLY BOUNDED)
    const addToCart = (product: Product, quantity: number = 1) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                let newQuantity = existing.cartQuantity + quantity;
                if (newQuantity <= 0) {
                    return prev.filter(item => item.id !== product.id);
                }
                if (newQuantity > product.stock) {
                    newQuantity = product.stock;
                    setTimeout(() => {
                        safeDispatchEvent('stockLimitHit', { 
                            detail: { name: product.name, stock: product.stock } 
                        });
                    }, 0);
                }
                return prev.map(item => 
                    item.id === product.id 
                    ? { ...item, cartQuantity: newQuantity }
                    : item
                );
            }
            if (quantity <= 0) return prev;
            let finalQty = quantity;
            if (finalQty > product.stock) {
                finalQty = product.stock;
                setTimeout(() => {
                    safeDispatchEvent('stockLimitHit', { 
                        detail: { name: product.name, stock: product.stock } 
                    });
                }, 0);
            }
            if (finalQty <= 0) return prev;
            return [...prev, { ...product, cartQuantity: finalQty }];
        });
    };

    const updateCartItemQuantity = (productId: number, qty: number) => {
        setCart(prev => {
            return prev.map(item => {
                if (item.id === productId) {
                    let finalQty = isNaN(qty) ? 0 : Math.max(0, qty);
                    if (finalQty > item.stock) {
                        finalQty = item.stock;
                        setTimeout(() => {
                            safeDispatchEvent('stockLimitHit', { 
                                detail: { name: item.name, stock: item.stock } 
                            });
                        }, 0);
                    }
                    return { ...item, cartQuantity: finalQty };
                }
                return item;
            });
        });
    };

    const removeFromCart = (productId: number) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    };

    const clearCart = (isCompletedSale = false) => {
        if (!isCompletedSale && cart.length > 0) {
            const payload = {
                cart: [...cart],
                clientName,
                clientPhone,
                discount,
                discountType,
                paymentMethod,
                timestamp: new Date().toISOString()
            };
            setLastClearedCart([...cart]);
            setLastClearedMeta(payload);
            try {
                localStorage.setItem('gtr_pos_last_cleared_cart', JSON.stringify(payload));
            } catch (e) {
                console.error("Failed saving last cleared cart:", e);
            }
        } else if (isCompletedSale) {
            setLastClearedCart(null);
            setLastClearedMeta(null);
            setCartBackup(null);
            setCartBackupMeta(null);
            localStorage.removeItem('gtr_pos_last_cleared_cart');
            localStorage.removeItem('gtr_pos_active_cart_backup');
        }
        setCart([]);
    };

    const restoreLastClearedCart = (): boolean => {
        if (!lastClearedCart || lastClearedCart.length === 0) return false;
        setCart([...lastClearedCart]);
        if (lastClearedMeta) {
            if (lastClearedMeta.clientName) setClientName(lastClearedMeta.clientName);
            if (lastClearedMeta.clientPhone) setClientPhone(lastClearedMeta.clientPhone);
            if (lastClearedMeta.discount !== undefined) setDiscount(lastClearedMeta.discount);
            if (lastClearedMeta.discountType) setDiscountType(lastClearedMeta.discountType);
            if (lastClearedMeta.paymentMethod) setPaymentMethod(lastClearedMeta.paymentMethod);
        }
        setLastClearedCart(null);
        setLastClearedMeta(null);
        localStorage.removeItem('gtr_pos_last_cleared_cart');
        return true;
    };

    const restoreCartBackup = (): boolean => {
        if (!cartBackup || cartBackup.length === 0) return false;
        setCart([...cartBackup]);
        if (cartBackupMeta) {
            if (cartBackupMeta.clientName) setClientName(cartBackupMeta.clientName);
            if (cartBackupMeta.clientPhone) setClientPhone(cartBackupMeta.clientPhone);
            if (cartBackupMeta.discount !== undefined) setDiscount(cartBackupMeta.discount);
            if (cartBackupMeta.discountType) setDiscountType(cartBackupMeta.discountType);
            if (cartBackupMeta.paymentMethod) setPaymentMethod(cartBackupMeta.paymentMethod);
        }
        setCartBackup(null);
        setCartBackupMeta(null);
        localStorage.removeItem('gtr_pos_active_cart_backup');
        return true;
    };

    const discardCartBackup = () => {
        setLastClearedCart(null);
        setLastClearedMeta(null);
        setCartBackup(null);
        setCartBackupMeta(null);
        localStorage.removeItem('gtr_pos_last_cleared_cart');
        localStorage.removeItem('gtr_pos_active_cart_backup');
    };

    const updateCartItemPrice = (productId: number, priceType: 'unit' | 'bulk' | 'custom', customPrice?: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === productId) {
                return {
                    ...item,
                    price_type: priceType,
                    custom_price: customPrice !== undefined ? customPrice : item.custom_price
                };
            }
            return item;
        }));
    };

    const syncOfflineActions = async (tempIdMapping: { [key: string]: any } = {}) => {
        try {
            const offlineActions = await getOfflineActions();
            if (offlineActions.length === 0) return;

            console.log(`[Offline Sync] Found ${offlineActions.length} general offline actions to synchronize.`);
            let successCount = 0;

            // Sort actions by creation time to ensure they run in correct chronological order
            const sortedActions = [...offlineActions].sort((a, b) => 
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );

            for (const action of sortedActions) {
                try {
                    // Replace temp IDs inside payload if needed
                    let payloadStr = JSON.stringify(action.payload);
                    Object.keys(tempIdMapping).forEach(tempId => {
                        payloadStr = payloadStr.replaceAll(tempId, String(tempIdMapping[tempId]));
                    });
                    const processedPayload = JSON.parse(payloadStr);

                    // Execute fetch call
                    const res = await fetch(action.url, {
                        method: action.method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(processedPayload)
                    });

                    if (res.ok) {
                        const responseData = await res.json().catch(() => ({}));
                        
                        // If this was a client creation action, map the temp ID to the newly created DB ID
                        if (action.type === 'create_client' && action.metadata?.tempId && responseData.id) {
                            tempIdMapping[action.metadata.tempId] = responseData.id;
                            console.log(`[Offline Sync] Mapped temp ID ${action.metadata.tempId} to actual ID ${responseData.id}`);
                        }

                        await deleteOfflineAction(action.id);
                        successCount++;
                    } else {
                        const errText = await res.text();
                        console.error(`[Offline Sync] Server rejected action ${action.id}:`, errText);
                        // Delete if it's a structural client-side error (4xx) so we don't block the queue
                        if (res.status >= 400 && res.status < 500) {
                            await deleteOfflineAction(action.id);
                        }
                    }
                } catch (actionErr) {
                    console.error(`[Offline Sync] Network failed during sync of action ${action.id}:`, actionErr);
                    break; // Stop execution on connection loss
                }
            }

            if (successCount > 0) {
                safeDispatchEvent('triggerNotification', {
                    detail: {
                        message: `✓ Sincronización automática: Se procesaron ${successCount} acción(es) offline con éxito.`,
                        type: 'success'
                    }
                });
                await fetchProducts();
                await fetchClients();
                await fetchDepartments();
            }
        } catch (err) {
            console.error('[Offline Sync] Failed to process general offline actions queue:', err);
        }
    };

    const syncOfflineSales = async (tempIdMapping: { [key: string]: any } = {}) => {
        try {
            const offlineSales = await getOfflineSales();
            if (offlineSales.length === 0) return;

            console.log(`[Offline Sync] Found ${offlineSales.length} offline sales to synchronize.`);
            let successCount = 0;

            for (const sale of offlineSales) {
                try {
                    let clientId = sale.salePayload.client_id;

                    // If clientId is a temp ID, map it to the actual ID
                    if (clientId && typeof clientId === 'string' && tempIdMapping[clientId]) {
                        clientId = tempIdMapping[clientId];
                        sale.salePayload.client_id = clientId;
                    }

                    // 1. If we have a client name but no client_id, let's try to register/find the client first
                    if (sale.clientName && sale.clientName.trim() && !clientId) {
                        try {
                            const clientRes = await fetch('/api/clients', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: sale.clientName, phone: sale.clientPhone })
                            });
                            if (clientRes.ok) {
                                const clientData = await clientRes.json();
                                clientId = clientData.id;
                                sale.salePayload.client_id = clientId;
                            }
                        } catch (clientErr) {
                            console.error('[Offline Sync] Failed to register client offline:', clientErr);
                        }
                    }

                    // 2. Submit the sale payload to the backend
                    const saleRes = await fetch('/api/sales', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(sale.salePayload)
                    });

                    if (saleRes.ok) {
                        // Success! Delete from offline storage
                        await deleteOfflineSale(sale.id);
                        successCount++;
                    } else {
                        const errText = await saleRes.text();
                        console.error(`[Offline Sync] Server rejected offline sale ${sale.id}:`, errText);
                    }
                } catch (saleErr) {
                    console.error(`[Offline Sync] Network failed during sync of sale ${sale.id}:`, saleErr);
                    break; // Stop syncing remaining if we are still offline or connection breaks
                }
            }

            if (successCount > 0) {
                safeDispatchEvent('triggerNotification', {
                    detail: {
                        message: `✓ Sincronización automática: Se procesaron ${successCount} venta(s) registradas offline con éxito.`,
                        type: 'success'
                    }
                });
                // Refresh local lists
                await fetchProducts();
                await fetchClients();
            }
        } catch (err) {
            console.error('[Offline Sync] Failed to process offline sales queue:', err);
        }
    };

    const triggerOnlineSync = async () => {
        if (navigator.onLine === false) return;
        setIsSyncing(true);
        try {
            const tempIdMapping: { [key: string]: any } = {};
            // First synchronize general actions, then sales with shared mapping
            await syncOfflineActions(tempIdMapping);
            await syncOfflineSales(tempIdMapping);

            console.log("[PWA Sync] Syncing with Google Cloud Firestore in real-time...");
            const token = localStorage.getItem('auth_token');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const res = await fetch('/api/sync/trigger', { method: 'POST', headers });
            if (res.ok) {
                const data = await res.json();
                console.log("[PWA Sync] Sync completed successfully:", data.status);
                // Force load latest data after bidirectional sync
                await fetchProducts();
                await fetchClients();
                await fetchExchangeRate();
                await fetchDepartments();
                setSyncError(null);
            } else {
                const errData = await res.json().catch(() => ({}));
                const errMsg = errData.error || `HTTP ${res.status}`;
                console.warn("[PWA Sync] Sync completed with server-side error:", errMsg);
                setSyncError(errMsg);
            }
        } catch (error: any) {
            console.warn("[PWA Sync] Error triggering backend online synchronization:", error);
            setSyncError(error?.message || String(error));
        } finally {
            // Keep the spinner visible/smooth for a short period of satisfaction
            setTimeout(() => {
                setIsSyncing(false);
            }, 1200);
        }
    };

    
    // Global WebSocket connection for settings/alerts
    useEffect(() => {
        if (!user || user.username === 'none') return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/alerts`;
        
        let socket = null;
        let reconnectTimeout = null;

        const connect = () => {
            socket = new WebSocket(wsUrl);

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'kiosk_mode_changed') {
                        setKioskMode(data.kiosk_mode);
                        localStorage.setItem('kioskMode', String(data.kiosk_mode));
                        safeDispatchEvent('triggerNotification', {
                            detail: {
                                message: data.kiosk_mode
                                    ? "✓ Modo Quiosco ha sido activado por el administrador."
                                    : "✓ Modo Quiosco ha sido desactivado.",
                                type: 'info'
                            }
                        });
                    }
                } catch (err) { }
            };

            socket.onclose = () => {
                reconnectTimeout = setTimeout(connect, 10000);
            };

            socket.onerror = () => {};
        };

        connect();

        return () => {
            if (socket) socket.close();
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
        };
    }, [user?.id, user?.username]);


    // Auto trigger sync when the system transitions to online
    useEffect(() => {
        if (!isOffline && navigator.onLine) {
            triggerOnlineSync();
        }
    }, [isOffline]);

    const showNotification = (message: string, type: 'success' | 'error' | 'warn' | 'info' = 'success') => {
        safeDispatchEvent('triggerNotification', {
            detail: { message, type }
        });
    };

    return (
        <AppContext.Provider value={{
            isInitializing,
            user,
            setUser,
            darkMode,
            setDarkMode,
            kioskMode,
            setKioskMode: async (k) => { 
                setKioskMode(k); 
                localStorage.setItem('kioskMode', String(k)); 
                try {
                    await fetch('/api/settings/kiosk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ kiosk_mode: k })
                    });
                } catch (e) {
                    console.error("Error saving kiosk mode to server", e);
                }
            },
            cart,
            addToCart,
            updateCartItemQuantity,
            removeFromCart,
            clearCart,
            lastClearedCart,
            lastClearedMeta,
            cartBackup,
            cartBackupMeta,
            restoreLastClearedCart,
            restoreCartBackup,
            discardCartBackup,
            updateCartItemPrice,
            products,
            clients,
            fetchProducts,
            fetchClients,
            hasMoreProducts,
            totalProducts,
            loadMoreProducts,
            view,
            setView,
            exchangeRate,
            setExchangeRate,
            fetchExchangeRate,
            roundBs,
            isOffline,
            receiptTemplate,
            updateReceiptTemplate,
            fetchReceiptTemplate,
            departments,
            fetchDepartments,
            tabs,
            setTabs,
            activeTabId,
            setActiveTabId,
            clientName,
            setClientName,
            clientPhone,
            setClientPhone,
            discount,
            setDiscount,
            discountType,
            setDiscountType,
            paymentMethod,
            setPaymentMethod,
            theme,
            setTheme,
            rgbSettings,
            setRgbSettings,
            isSyncing,
            triggerOnlineSync,
            syncError,
            setSyncError,
            isAutonomousTesting,
            setIsAutonomousTesting,
            autonomousStep,
            setAutonomousStep,
            autonomousLogs,
            setAutonomousLogs,
            apiPingResults,
            setApiPingResults,
            pwaPrompt,
            setPwaPrompt,
            installPWA,
            isPwaInstalled,
            showNotification
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("AppContext must be used within an AppProvider.");
    return ctx;
};
