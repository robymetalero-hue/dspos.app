import { initializeApp, getApps, getApp } from 'firebase/app';

let quotaExceeded = false;
let quotaExceededTime = 0;
function checkQuota() {
  if (quotaExceeded) {
    if (Date.now() - quotaExceededTime > 1000 * 60 * 60) {
      quotaExceeded = false;
      return false;
    }
    return true;
  }
  return false;
}
function handleSyncError(err, msg) {
  if (err && err.message && err.message.toLowerCase().includes('quota')) {
    if (!quotaExceeded) {
      console.warn("[Firestore Quota Exceeded] Free tier read/write quota exceeded. Offline mode engaged.");
      quotaExceeded = true;
      quotaExceededTime = Date.now();
    }
  } else {
    console.warn(msg, err && err.message ? err.message : err);
  }
}

import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  writeBatch, 
  query, 
  limit,
  orderBy
} from 'firebase/firestore';
import { db } from './database.ts';
import fs from 'fs';
import path from 'path';

// Load Firebase app configuration searching multiple potential locations
let firebaseConfig: any = {};
const configLocations = [
  path.resolve(process.cwd(), 'firebase-applet-config.json'),
  path.resolve(process.cwd(), '..', 'firebase-applet-config.json')
];

for (const loc of configLocations) {
  try {
    if (fs.existsSync(loc)) {
      firebaseConfig = JSON.parse(fs.readFileSync(loc, 'utf8'));
      console.log(`[Firebase] Loaded configuration file from: ${loc}`);
      break;
    }
  } catch (e: any) {
    console.warn(`[Firebase] Could not read config at ${loc}:`, e.message);
  }
}

// Initialize Client-Side Firebase SDK on Node.js server side
let app: any = null;
try {
  if (firebaseConfig.projectId) {
    if (getApps().length) {
      app = getApp();
    } else {
      app = initializeApp({
        apiKey: firebaseConfig.apiKey,
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
        appId: firebaseConfig.appId
      });
      console.log("Firebase SDK successfully initialized on server side with Project ID:", firebaseConfig.projectId);
    }
  }
} catch (e: any) {
  console.warn("Could not initialize Firebase Web SDK safely on server:", e.message);
}

let firestoreInstance: any = null;
try {
  firestoreInstance = app
    ? (firebaseConfig.firestoreDatabaseId 
        ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
        : getFirestore(app))
    : null;
} catch (e: any) {
  console.warn("Could not initialize Firestore instance safely on server:", e.message);
}

export const firestore = firestoreInstance;

let authPromise: Promise<void> | null = null;
export async function ensureServerAuth() {
  if (!app) return;
  if (!authPromise) {
    authPromise = (async () => {
      const authTimeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
      const authTask = (async () => {
        const auth = getAuth(app);
        const email = "server_sync@dstore.app";
        const password = "ServerSync_SecretPassword!123";
        try {
          await signInWithEmailAndPassword(auth, email, password);
          console.log("[Sync] Server authenticated successfully.");
        } catch (e: any) {
          if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
            console.log("[Sync] Server auth user not found, creating...");
            try {
              await createUserWithEmailAndPassword(auth, email, password);
              console.log("[Sync] Server auth created and signed in.");
            } catch (err: any) {
              console.warn("[Sync] Server auth create warning:", err.message);
            }
          } else {
            console.warn("[Sync] Server sign in warning:", e.message);
          }
        }
      })();
      await Promise.race([authTask, authTimeout]);
    })();
  }
  return authPromise;
}

export const SYNC_TABLES = [
  'users',
  'products',
  'clients',
  'sales',
  'sale_items',
  'shifts',
  'settings',
  'exchange_rate_audit',
  'caja_cierres',
  'departments',
  'stock_arrivals',
  'pending_sales',
  'pending_sale_items',
  'accounts_receivable',
  'credit_payments',
  'pending_sale_payments',
  'cash_accounts',
  'cash_movements',
  'cash_settlements',
  'inventory_audit_logs',
  'system_audit_logs',
  'inventory_counts',
  'inventory_count_items'
];

let isPullingInProgress = false;
let lastPullTimestamp = 0;
const PULL_COOLDOWN_MS = 10000; // 10 seconds rate limit for background pulls

// List of tables that are append-only to avoid full collection scans & rewrites on sync
export const APPEND_ONLY_TABLES = [
  'sales',
  'sale_items',
  'shifts',
  'exchange_rate_audit',
  'caja_cierres',
  'stock_arrivals',
  'pending_sales',
  'pending_sale_items',
  'accounts_receivable',
  'credit_payments',
  'pending_sale_payments',
  'cash_settlements',
  'inventory_audit_logs',
  'system_audit_logs',
  'inventory_counts',
  'inventory_count_items'
];

// In-memory cache of last successfully synchronized maximum IDs per table to prevent redundant Firestore operations
export const lastSyncedMaxIdCache: Record<string, number> = {};

/**
 * Pushes a local SQLite table's content to Firestore.
 * Supports targeted synchronization for specific rows to optimize speed and network payload.
 */
export async function pushLocalToFirestore(tableName: string, idOrIds?: any | any[]) {
  if (!firestore) {
    console.warn("Firestore not initialized, skipping push for table:", tableName);
    return;
  }
  await ensureServerAuth();

  try {
    const isSettings = tableName === 'settings';
    let rows: any[] = [];
    const idList = idOrIds ? (Array.isArray(idOrIds) ? idOrIds.map(String) : [String(idOrIds)]) : null;

    if (idList && idList.length > 0) {
      // Sync only specific rows to make it super fast
      if (isSettings) {
        const placeholders = idList.map(() => '?').join(', ');
        rows = db.prepare(`SELECT * FROM settings WHERE key IN (${placeholders})`).all(...idList) as any[];
      } else {
        const placeholders = idList.map(() => '?').join(', ');
        rows = db.prepare(`SELECT * FROM ${tableName} WHERE id IN (${placeholders})`).all(...idList) as any[];
      }
    } else {
      // Full table sync requested.
      // Optimización crítica para tablas append-only: evitar lecturas de Firestore enteras y escrituras redundantes.
      if (APPEND_ONLY_TABLES.includes(tableName)) {
        // 1. Obtener ID máximo local en SQLite
        let localMaxId = 0;
        try {
          const maxRow = db.prepare(`SELECT MAX(id) as maxId FROM ${tableName}`).get() as any;
          localMaxId = Number(maxRow?.maxId || 0);
        } catch (sqliteErr: any) {
          console.warn(`[Sync] Could not read local max ID for append-only table "${tableName}":`, sqliteErr.message);
        }

        // 2. Si localMaxId es 0, no hay datos locales, no hace falta hacer nada
        if (localMaxId === 0) {
          console.log(`[Sync] Table "${tableName}" is empty locally. Skipping sync.`);
          return;
        }

        // 3. Consultar cache local en memoria. Si ya está sincronizado hasta el ID local máximo, omitir completamente (ahorra 100% de operaciones de Firestore).
        const cachedMax = lastSyncedMaxIdCache[tableName];
        if (cachedMax !== undefined && localMaxId <= cachedMax) {
          console.log(`[Sync] Table "${tableName}" (append-only) is up-to-date in local cache (Max ID: ${localMaxId}). Skip Firestore check.`);
          return;
        }

        // 4. No está en cache o hay nuevos IDs. Consultar ID máximo actual en Firestore (cuesta solo 1 operación de lectura).
        let firestoreMaxId = 0;
        const colRef = collection(firestore, tableName);
        try {
          const q = query(colRef, orderBy('id', 'desc'), limit(1));
          const qSnapshot = await getDocs(q);
          if (!qSnapshot.empty) {
            const docData = qSnapshot.docs[0].data();
            if (docData && typeof docData.id === 'number') {
              firestoreMaxId = docData.id;
            }
          }
        } catch (firestoreErr: any) {
          handleSyncError(firestoreErr, `[Sync] Failed to fetch max ID from Firestore for "${tableName}". Defaulting to full synchronization:`);
          // Si falla (ej. índice ausente en Firestore), desactivamos la optimización para esta pasada y dejamos que haga el flujo normal.
          firestoreMaxId = -1;
        }

        if (firestoreMaxId >= 0) {
          // Si el ID máximo de Firestore es igual o mayor al local, estamos al día. Guardamos en cache y retornamos.
          if (localMaxId <= firestoreMaxId) {
            lastSyncedMaxIdCache[tableName] = firestoreMaxId;
            console.log(`[Sync] Table "${tableName}" is already fully synchronized up to Firestore Max ID: ${firestoreMaxId}.`);
            return;
          }

          // Solo sincronizar registros locales con id > firestoreMaxId
          rows = db.prepare(`SELECT * FROM ${tableName} WHERE id > ?`).all(firestoreMaxId) as any[];
          console.log(`[Sync] Table "${tableName}" (append-only) has ${rows.length} new records to upload (IDs > ${firestoreMaxId}).`);

          if (rows.length === 0) {
            lastSyncedMaxIdCache[tableName] = firestoreMaxId;
            return;
          }

          // Subir solo las filas nuevas usando lotes (batch)
          let batch = writeBatch(firestore);
          let opCount = 0;

          for (const row of rows) {
            const docId = String(row.id);
            const docRef = doc(firestore, tableName, docId);

            const cleanData: any = {};
            for (const [key, val] of Object.entries(row)) {
              if (val !== undefined) {
                cleanData[key] = val;
              }
            }

            batch.set(docRef, cleanData);
            opCount++;

            if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(firestore);
              opCount = 0;
            }
          }

          if (opCount > 0) {
            await batch.commit();
          }

          // Guardar en cache el ID máximo local sincronizado exitosamente
          lastSyncedMaxIdCache[tableName] = localMaxId;
          console.log(`[Sync] Incremental sync for table "${tableName}" (${rows.length} rows) completed successfully.`);
          return;
        }
      }

      // Default fallback (para tablas pequeñas modificables o en caso de error del optimizador)
      rows = db.prepare(`SELECT * FROM ${tableName}`).all() as any[];
    }

    const colRef = collection(firestore, tableName);

    // If this is a targeted update (idList was specified), we don't handle deletions of other rows.
    // We only upsert the specified rows. This runs in O(N) where N is the number of updated rows (usually 1 or a few).
    if (idList && idList.length > 0) {
      if (rows.length === 0) {
        console.log(`[Sync] Targeted sync requested for "${tableName}" but rows were empty locally.`);
        return;
      }
      let batch = writeBatch(firestore);
      let opCount = 0;

      for (const row of rows) {
        const docId = isSettings ? row.key : String(row.id);
        const docRef = doc(firestore, tableName, docId);

        const cleanData: any = {};
        for (const [key, val] of Object.entries(row)) {
          if (val !== undefined) {
            cleanData[key] = val;
          }
        }

        batch.set(docRef, cleanData);
        opCount++;

        if (opCount >= 400) {
          await batch.commit();
          batch = writeBatch(firestore);
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      console.log(`[Sync] Targeted sync for table "${tableName}" (${rows.length} rows: [${idList.join(', ')}]) completed successfully.`);
      return;
    }

    // Fetch existing documents from Firestore for this collection to handle deletions
    const snapshot = await getDocs(colRef);
    
    // Set of local IDs currently in SQLite
    const localIds = new Set(rows.map(row => {
      if (tableName === 'settings') {
        return row.key;
      }
      return String(row.id);
    }));

    // Start a Firestore batch
    let batch = writeBatch(firestore);
    let opCount = 0;

    // Delete keys from Firestore that no longer exist in local SQLite (soft synchronization)
    // Safeguard: Do not perform remote deletions if the local table is completely empty, 
    // to prevent accidental cloud data wipes due to local SQLite corruption or uninitialized startup states.
    if (rows.length > 0) {
      for (const docSnap of snapshot.docs) {
        if (!localIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(firestore);
            opCount = 0;
          }
        }
      }
    }

    // Upsert all local records to Firestore
    for (const row of rows) {
      const docId = tableName === 'settings' ? row.key : String(row.id);
      const docRef = doc(firestore, tableName, docId);
      
      // Create a clean object removing any undefined properties
      const cleanData: any = {};
      for (const [key, val] of Object.entries(row)) {
        if (val !== undefined) {
          cleanData[key] = val;
        }
      }

      batch.set(docRef, cleanData);
      opCount++;

      // Commit batches when approaching Firestore's 500 operation limit
      if (opCount >= 400) {
        await batch.commit();
        batch = writeBatch(firestore);
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    console.log(`[Sync] Successfully synchronized table "${tableName}" to Firestore (Local Row Count: ${rows.length})`);
  } catch (error: any) {
    handleSyncError(error, `[Sync Offline Mode] Unable to sync local table "${tableName}" to Firestore (will save locally):`);
  }
}

/**
 * Syncs all SQLite tables to Firestore.
 */
export async function pushAllLocalToFirestore() {
  console.log("[Sync] Triggered full push from SQLite to Google Cloud Firestore...");
  for (const table of SYNC_TABLES) {
    await pushLocalToFirestore(table);
  }
}

/**
 * Pulls master documents from Google Cloud Firestore and populates SQLite.
 * If Firestore is empty, we perform an initial bootstrap sync from local SQLite data.
 * This function handles deletions in Firestore correctly by clearing local records before sync ONLY if forceOverwrite is true.
 */
export async function pullFirestoreToLocal(forceOverwrite: boolean = false) {
  if (!firestore) {
    console.warn("[Sync] Firestore not initialized, skipping database pull.");
    return;
  }
  await ensureServerAuth();

  if (isPullingInProgress) {
    console.log("[Sync] Pull already in progress. Skipping concurrent execution.");
    return;
  }

  if (!forceOverwrite && (Date.now() - lastPullTimestamp < PULL_COOLDOWN_MS)) {
    // Cool down period, skip to prevent rate limits
    return;
  }

  isPullingInProgress = true;

  try {
    console.log("[Sync] Pulling master database records from Google Cloud Firestore...");

    // Determine if Firestore has been initialized/populated already
    const metaRef = doc(firestore, 'sync_metadata', 'status');
    const metaDoc = await getDoc(metaRef);
    
    // Query local database sizes to see if we have actual user records locally to seed
    const localProductsCount = (db.prepare("SELECT COUNT(*) as count FROM products").get() as any)?.count || 0;
    const localSalesCount = (db.prepare("SELECT COUNT(*) as count FROM sales").get() as any)?.count || 0;
    const localClientsCount = (db.prepare("SELECT COUNT(*) as count FROM clients").get() as any)?.count || 0;
    const hasLocalUserData = localProductsCount > 0 || localSalesCount > 0 || localClientsCount > 0;

    // Check if Firestore actually contains any user data across main tables as a safety check
    let hasAnyFirestoreDocuments = false;
    for (const collName of ['products', 'sales', 'clients', 'users']) {
      try {
        const snap = await getDocs(query(collection(firestore, collName), limit(1)));
        if (!snap.empty) {
          hasAnyFirestoreDocuments = true;
          break;
        }
      } catch (err: any) {
        console.warn(`[Sync] Safety check failed for Firestore collection "${collName}":`, err.message);
      }
    }

    const isPopulated = hasAnyFirestoreDocuments || metaDoc.exists();

    if (!isPopulated) {
      if (hasLocalUserData) {
        console.log("[Sync] Firestore is currently empty/uninitialized. Seeding initial cloud tables with local database records.");
        await pushAllLocalToFirestore();
        await setDoc(metaRef, { initialized: true, initializedAt: new Date().toISOString() });
        return;
      } else {
        console.log("[Sync] Firestore and local SQLite are both empty/uninitialized. Skipping initial seed.");
        await setDoc(metaRef, { initialized: true, initializedAt: new Date().toISOString() });
      }
    } else if (!metaDoc.exists()) {
      // Ensure metadata flag exists henceforth so deleting all products does not trigger re-seeding
      await setDoc(metaRef, { initialized: true, initializedAt: new Date().toISOString() });
    }

    // Pull each collection and upsert data into SQLite
    for (const table of SYNC_TABLES) {
      try {
        const snapshot = await getDocs(collection(firestore, table));
        
        if (snapshot.empty) {
          if (metaDoc.exists()) {
            try {
              db.prepare(`DELETE FROM ${table}`).run();
            } catch (e: any) {}
            console.log(`[Sync] Table "${table}" is empty in Cloud Firestore. Local SQLite table synced to zero records.`);
          } else {
            const localCount = (db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any)?.count || 0;
            if (localCount > 0) {
              console.log(`[Sync Safety] Descubierta tabla "${table}" vacía en Firestore pero con ${localCount} filas locales. Reparando y subiendo datos locales para prevenir pérdida.`);
              await pushLocalToFirestore(table);
            } else {
              console.log(`[Sync] Table "${table}" was empty in both Cloud Firestore and SQLite.`);
            }
          }
          continue;
        }

        // Sync remote records with SQLite table in an atomic transaction:
        // Clear the local table first to ensure consistency (deletions are synced correctly from cloud to local),
        // then insert the latest remote records with safety column checking.
        let allowedColumns: Set<string>;
        try {
          const info = db.pragma(`table_info(${table})`) as any[];
          allowedColumns = new Set(info.map(col => col.name));
        } catch (colErr: any) {
          console.warn(`[Sync] Could not fetch columns for table ${table}, using document keys directly:`, colErr.message);
          allowedColumns = new Set();
        }

        if (table === 'departments') {
          try {
            const cleanedRow = db.prepare("SELECT value FROM settings WHERE key = 'migration_clean_ghost_departments_fs'").get() as any;
            if (!cleanedRow) {
              const defaultsToDelete = ['Storage', 'Micro SDs', 'USBs', 'Electronics', 'Micro SD'];
              const deleteBatch = writeBatch(firestore);
              let delCount = 0;
              for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                if (data && data.name && defaultsToDelete.includes(data.name)) {
                  const prodCount = db.prepare("SELECT COUNT(*) as count FROM products WHERE category = ?").get(data.name) as any;
                  if (!prodCount || prodCount.count === 0) {
                    deleteBatch.delete(docSnap.ref);
                    delCount++;
                  }
                }
              }
              if (delCount > 0) {
                await deleteBatch.commit();
                console.log(`[Sync Migration] Deleted ${delCount} unused default departments from Firestore.`);
              }
              db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_clean_ghost_departments_fs', 'true')").run();
            }
          } catch (migErr: any) {
            console.warn("[Sync Migration Error] Failed to run ghost departments Firestore cleanup migration:", migErr.message);
          }
        }

        const syncTx = db.transaction(() => {
          if (forceOverwrite && table !== 'system_audit_logs') {
            db.prepare(`DELETE FROM ${table}`).run();
          }
          
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            
            // Skip default departments if they are ghost defaults being deleted
            if (table === 'departments' && data && data.name && ['Storage', 'Micro SDs', 'USBs', 'Electronics', 'Micro SD'].includes(data.name)) {
              const prodCount = db.prepare("SELECT COUNT(*) as count FROM products WHERE category = ?").get(data.name) as any;
              if (!prodCount || prodCount.count === 0) {
                continue; // Skip inserting this deleted department
              }
            }

            let keys = Object.keys(data);
            if (keys.length === 0) continue;

            // Filter keys to valid SQLite columns only
            if (allowedColumns.size > 0) {
              keys = keys.filter(k => allowedColumns.has(k));
            }
            if (keys.length === 0) continue;

            const placeholders = keys.map(() => '?').join(', ');
            const values = keys.map(k => data[k]);

            const insertSql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
            db.prepare(insertSql).run(...values);
          }
        });

        syncTx();
        console.log(`[Sync] Table "${table}" successfully replaced local copy with ${snapshot.size} cloud records.`);
      } catch (tableErr: any) {
        handleSyncError(tableErr, `[Sync Warning] Failed to pull table "${table}" from Cloud Firestore:`);
      }
    }

    lastPullTimestamp = Date.now();
    
    // Clear the max ID cache to ensure we correctly revalidate next writes against SQLite / Firestore
    for (const key of Object.keys(lastSyncedMaxIdCache)) {
      delete lastSyncedMaxIdCache[key];
    }
    
    console.log("[Sync] Database synchronizations completed. GTR POS is fully ready and permanently synced.");
  } catch (error: any) {
    console.log("[Sync Offline Mode] Standard local database operates standalone. Remote cloud sync is bypassed:", error.message);
  } finally {
    isPullingInProgress = false;
  }
}

/**
 * Convenient helper to trigger a non-blocking asynchronous sync of one or more tables to Firestore after a local write.
 * Supports mapping table names to exact primary key values to execute a targeted push.
 */
export function syncAfterWrite(tableOrMap: string | string[] | Record<string, any | any[]>, idOrIds?: any | any[]) {
  if (typeof tableOrMap === 'object' && !Array.isArray(tableOrMap)) {
    // It's a Record mapping: { tableName: idOrIds }
    for (const [table, ids] of Object.entries(tableOrMap)) {
      pushLocalToFirestore(table, ids).catch(err => {
        console.warn(`[Sync Offline Mode] Targeted sync postponed for table "${table}":`, err.message);
      });
    }
  } else {
    const tables = Array.isArray(tableOrMap) ? tableOrMap : [tableOrMap];
    for (const table of tables) {
      // If single table and idOrIds is supplied, target it. Otherwise fallback to full table sync.
      const targetIds = (tables.length === 1 || tables[0] === table) ? idOrIds : undefined;
      pushLocalToFirestore(table, targetIds).catch(err => {
        console.warn(`[Sync Offline Mode] Sync postponed for table "${table}":`, err.message);
      });
    }
  }
}

/**
 * Completely purges all data from Google Cloud Firestore and local SQLite,
 * leaving a clean zeroed database with baseline seed admin users and default settings.
 */
export async function clearAllFirestoreAndLocalData(): Promise<void> {
  console.log("[Sync Reset] Starting complete database purge (Local SQLite & Cloud Firestore)...");

  // 1. Clear Google Cloud Firestore collections
  if (firestore) {
    try {
      await ensureServerAuth();
      for (const tableName of SYNC_TABLES) {
        try {
          const colRef = collection(firestore, tableName);
          const snapshot = await getDocs(colRef);
          if (!snapshot.empty) {
            let batch = writeBatch(firestore);
            let opCount = 0;
            for (const docSnap of snapshot.docs) {
              batch.delete(docSnap.ref);
              opCount++;
              if (opCount >= 400) {
                await batch.commit();
                batch = writeBatch(firestore);
                opCount = 0;
              }
            }
            if (opCount > 0) {
              await batch.commit();
            }
            console.log(`[Sync Reset] Cleared ${snapshot.size} records from Firestore collection "${tableName}".`);
          }
        } catch (colErr: any) {
          console.warn(`[Sync Reset Warning] Error clearing Firestore collection "${tableName}":`, colErr.message);
        }
      }

      // Mark sync_metadata status as initialized so empty collections are treated as intentionally zeroed
      const metaRef = doc(firestore, 'sync_metadata', 'status');
      await setDoc(metaRef, { initialized: true, resetAt: new Date().toISOString() });
    } catch (fsErr: any) {
      console.warn("[Sync Reset Warning] Failed to authenticate or access Firestore during reset:", fsErr.message);
    }
  }

  // 2. Clear local SQLite database tables
  const tablesToClear = [
    'products',
    'clients',
    'sales',
    'sale_items',
    'shifts',
    'caja_cierres',
    'departments',
    'stock_arrivals',
    'pending_sales',
    'pending_sale_items',
    'accounts_receivable',
    'credit_payments',
    'pending_sale_payments',
    'cash_accounts',
    'cash_movements',
    'cash_settlements',
    'inventory_audit_logs',
    'system_audit_logs',
    'inventory_counts',
    'inventory_count_items',
    'exchange_rate_audit'
  ];

  try {
    db.exec(`DROP TRIGGER IF EXISTS prevent_system_audit_logs_delete;`);
    db.exec(`DROP TRIGGER IF EXISTS prevent_system_audit_logs_update;`);
  } catch (e) {}

  for (const table of tablesToClear) {
    try {
      db.prepare(`DELETE FROM ${table}`).run();
    } catch (e: any) {
      console.warn(`[Local Reset Warning] Error deleting local table "${table}":`, e.message);
    }
  }

  // Reset auto-increment sequence counters so ticket and product IDs start fresh at #1
  try {
    db.prepare(`DELETE FROM sqlite_sequence WHERE name NOT IN ('users')`).run();
  } catch (e: any) {}

  // Re-enable immutable triggers for system_audit_logs
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS prevent_system_audit_logs_update
      BEFORE UPDATE ON system_audit_logs
      BEGIN
        SELECT RAISE(FAIL, 'system_audit_logs are immutable and cannot be updated');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_system_audit_logs_delete
      BEFORE DELETE ON system_audit_logs
      BEGIN
        SELECT RAISE(FAIL, 'system_audit_logs are immutable and cannot be deleted');
      END;
    `);
  } catch (e) {}

  // Re-seed default settings and seed users in SQLite
  try {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('exchange_rate', '6.96');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('seeded_products', 'true');
  } catch (e) {}

  // Reset in-memory cache
  for (const key of Object.keys(lastSyncedMaxIdCache)) {
    delete lastSyncedMaxIdCache[key];
  }

  // 3. Re-push seed users and settings to Firestore
  try {
    await pushLocalToFirestore('users');
    await pushLocalToFirestore('settings');
  } catch (e) {}

  console.log("[Sync Reset] Complete database reset finished successfully. Database is now at clean zero state.");
}
