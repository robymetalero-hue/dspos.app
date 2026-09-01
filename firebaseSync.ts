import { initializeApp, getApps, getApp } from 'firebase/app';

let quotaExceeded = false;
let quotaExceededTime = 0;
export function checkQuota(): boolean {
  if (quotaExceeded) {
    if (Date.now() - quotaExceededTime > 1000 * 60 * 60) {
      quotaExceeded = false;
      return false;
    }
    return true;
  }
  return false;
}

function handleSyncError(err: any, msg: string) {
  const errMsg = err?.message || String(err);
  const lower = errMsg.toLowerCase();
  if (lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('429')) {
    if (!quotaExceeded) {
      console.warn("[Sync] Firestore quota limit reached. Operating in standalone offline mode.");
      quotaExceeded = true;
      quotaExceededTime = Date.now();
    }
  } else if (!lower.includes('offline') && !lower.includes('network') && !lower.includes('unavailable') && !lower.includes('auth')) {
    console.warn(`${msg} ${errMsg}`);
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
      console.log("[Firebase] SDK initialized with Project ID:", firebaseConfig.projectId);
    }
  }
} catch (e: any) {
  console.warn("[Firebase] SDK initialization deferred:", e.message);
}

let firestoreInstance: any = null;
try {
  firestoreInstance = app
    ? (firebaseConfig.firestoreDatabaseId 
        ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
        : getFirestore(app))
    : null;
} catch (e: any) {
  console.warn("[Firestore] Instance deferred:", e.message);
}

export const firestore = firestoreInstance;

let authDisabledUntil = 0;
let authAuthenticated = false;
let authPromise: Promise<void> | null = null;

export async function ensureServerAuth() {
  if (!app || !firestore) return;
  if (authAuthenticated) return;
  if (Date.now() < authDisabledUntil) return;

  if (!authPromise) {
    authPromise = (async () => {
      const authTimeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
      const authTask = (async () => {
        try {
          const auth = getAuth(app);
          const email = "server_sync@dstore.app";
          const password = "ServerSync_SecretPassword!123";
          try {
            await signInWithEmailAndPassword(auth, email, password);
            authAuthenticated = true;
          } catch (e: any) {
            if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
              try {
                await createUserWithEmailAndPassword(auth, email, password);
                authAuthenticated = true;
              } catch (createErr: any) {
                authDisabledUntil = Date.now() + (10 * 60 * 1000);
              }
            } else {
              authDisabledUntil = Date.now() + (10 * 60 * 1000);
            }
          }
        } catch (err: any) {
          authDisabledUntil = Date.now() + (10 * 60 * 1000);
        }
      })();
      await Promise.race([authTask, authTimeout]);
    })().finally(() => {
      authPromise = null;
    });
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
 * Records a deletion in the local deleted_records tombstone table.
 */
export function recordDeletion(tableName: string, recordId: string | number) {
  try {
    const idStr = String(recordId);
    db.prepare("INSERT OR REPLACE INTO deleted_records (table_name, record_id, deleted_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%S-04:00', 'now', '-4 hours'))").run(tableName, idStr);
  } catch (e: any) {
    console.warn(`[DeletedRecords] Warning recording deletion for ${tableName} #${recordId}:`, e.message);
  }
}

/**
 * Checks if a record was marked as deleted.
 */
export function isRecordDeleted(tableName: string, recordId: string | number): boolean {
  try {
    const row = db.prepare('SELECT 1 FROM deleted_records WHERE table_name = ? AND record_id = ?').get(tableName, String(recordId));
    return !!row;
  } catch (e: any) {
    return false;
  }
}

/**
 * Deletes document(s) directly and immediately from Firestore.
 */
export async function deleteFromFirestore(tableName: string, idOrIds: any | any[]) {
  if (!firestore || checkQuota()) {
    return;
  }
  await ensureServerAuth();

  const ids = Array.isArray(idOrIds) ? idOrIds.map(String) : [String(idOrIds)];
  if (ids.length === 0) return;

  try {
    let batch = writeBatch(firestore);
    let count = 0;
    for (const id of ids) {
      const docRef = doc(firestore, tableName, String(id));
      batch.delete(docRef);
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(firestore);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
    console.log(`[Sync Delete] Successfully deleted ${ids.length} document(s) from Firestore collection "${tableName}".`);
  } catch (err: any) {
    handleSyncError(err, `[Sync Delete Error] Could not delete from Firestore "${tableName}":`);
  }
}

/**
 * Pushes a local SQLite table's content to Firestore.
 * Supports targeted synchronization for specific rows to optimize speed and network payload.
 */
export async function pushLocalToFirestore(tableName: string, idOrIds?: any | any[]) {
  if (!firestore || checkQuota()) {
    return;
  }
  await ensureServerAuth();

  try {
    const isSettings = tableName === 'settings';
    let rows: any[] = [];
    const idList = idOrIds ? (Array.isArray(idOrIds) ? idOrIds.map(String) : [String(idOrIds)]) : null;

    // Filter out locally deleted records
    let deletedIdsSet = new Set<string>();
    try {
      const deletedRows = db.prepare("SELECT record_id FROM deleted_records WHERE table_name = ?").all(tableName) as any[];
      deletedIdsSet = new Set(deletedRows.map(r => String(r.record_id)));
    } catch (e) {}

    if (idList && idList.length > 0) {
      // Sync only specific rows to make it super fast
      if (isSettings) {
        const placeholders = idList.map(() => '?').join(', ');
        rows = db.prepare(`SELECT * FROM settings WHERE key IN (${placeholders})`).all(...idList) as any[];
      } else {
        const validIds = idList.filter(id => !deletedIdsSet.has(String(id)));
        if (validIds.length === 0) {
          // If all targeted IDs are deleted, delete them from Firestore
          await deleteFromFirestore(tableName, idList);
          return;
        }
        const placeholders = validIds.map(() => '?').join(', ');
        rows = db.prepare(`SELECT * FROM ${tableName} WHERE id IN (${placeholders})`).all(...validIds) as any[];
      }
    } else {
      // Full table sync requested.
      if (APPEND_ONLY_TABLES.includes(tableName)) {
        // 1. Obtener ID máximo local en SQLite
        let localMaxId = 0;
        try {
          const maxRow = db.prepare(`SELECT MAX(id) as maxId FROM ${tableName}`).get() as any;
          localMaxId = Number(maxRow?.maxId || 0);
        } catch (sqliteErr: any) {}

        // 2. Si localMaxId es 0, no hay datos locales, no hace falta hacer nada
        if (localMaxId === 0) {
          return;
        }

        // 3. Consultar cache local en memoria. Si ya está sincronizado hasta el ID local máximo, omitir
        const cachedMax = lastSyncedMaxIdCache[tableName];
        if (cachedMax !== undefined && localMaxId <= cachedMax) {
          return;
        }

        // 4. Consultar ID máximo actual en Firestore
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
          handleSyncError(firestoreErr, `[Sync] Could not verify remote max ID for "${tableName}":`);
          firestoreMaxId = -1;
        }

        if (firestoreMaxId >= 0) {
          if (localMaxId <= firestoreMaxId) {
            lastSyncedMaxIdCache[tableName] = firestoreMaxId;
            return;
          }

          rows = db.prepare(`SELECT * FROM ${tableName} WHERE id > ?`).all(firestoreMaxId) as any[];

          if (rows.length === 0) {
            lastSyncedMaxIdCache[tableName] = firestoreMaxId;
            return;
          }

          let batch = writeBatch(firestore);
          let opCount = 0;

          for (const row of rows) {
            const docId = String(row.id);
            if (deletedIdsSet.has(docId)) continue;
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

          lastSyncedMaxIdCache[tableName] = localMaxId;
          return;
        }
      }

      rows = db.prepare(`SELECT * FROM ${tableName}`).all() as any[];
      if (deletedIdsSet.size > 0 && !isSettings) {
        rows = rows.filter(r => !deletedIdsSet.has(String(r.id)));
      }
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
  if (!firestore || checkQuota()) {
    return;
  }
  await ensureServerAuth();

  if (isPullingInProgress) {
    return;
  }

  if (!forceOverwrite && (Date.now() - lastPullTimestamp < PULL_COOLDOWN_MS)) {
    return;
  }

  isPullingInProgress = true;

  try {
    // Determine if Firestore has been initialized/populated already
    const metaRef = doc(firestore, 'sync_metadata', 'status');
    const metaDoc = await getDoc(metaRef);
    
    // Query local database sizes to see if we have actual user records locally to seed
    const localProductsCount = (db.prepare("SELECT COUNT(*) as count FROM products").get() as any)?.count || 0;
    const localSalesCount = (db.prepare("SELECT COUNT(*) as count FROM sales").get() as any)?.count || 0;
    const localClientsCount = (db.prepare("SELECT COUNT(*) as count FROM clients").get() as any)?.count || 0;
    const hasLocalUserData = localProductsCount > 0 || localSalesCount > 0 || localClientsCount > 0;

    // Check if Firestore actually contains any user data across main tables as a parallel safety check
    let hasAnyFirestoreDocuments = false;
    try {
      const safetySnaps = await Promise.all(
        ['products', 'sales', 'clients', 'users'].map(collName =>
          getDocs(query(collection(firestore, collName), limit(1))).catch(() => null)
        )
      );
      hasAnyFirestoreDocuments = safetySnaps.some(s => s && !s.empty);
    } catch (err: any) {
      handleSyncError(err, `[Sync] Safety check:`);
    }

    const isPopulated = hasAnyFirestoreDocuments || metaDoc.exists();

    if (!isPopulated) {
      if (hasLocalUserData) {
        console.log("[Sync] Initializing cloud database with local records...");
        await pushAllLocalToFirestore();
        await setDoc(metaRef, { initialized: true, initializedAt: new Date().toISOString() });
        return;
      } else {
        await setDoc(metaRef, { initialized: true, initializedAt: new Date().toISOString() });
      }
    } else if (!metaDoc.exists()) {
      await setDoc(metaRef, { initialized: true, initializedAt: new Date().toISOString() });
    }

    let updatedTableCount = 0;

    // Fetch all Firestore collections in parallel concurrently for ultra-fast load speed
    const collectionResults = await Promise.all(
      SYNC_TABLES.map(async (table) => {
        try {
          const snapshot = await getDocs(collection(firestore, table));
          return { table, snapshot, error: null };
        } catch (tableErr: any) {
          handleSyncError(tableErr, `[Sync Warning] Table "${table}":`);
          return { table, snapshot: null, error: tableErr };
        }
      })
    );

    // Pull each collection and upsert data into SQLite inside a single high-performance transaction
    const globalSyncTx = db.transaction(() => {
      for (const { table, snapshot, error } of collectionResults) {
        if (error || !snapshot) continue;

        try {
          if (snapshot.empty) {
            if (metaDoc.exists()) {
              try {
                db.prepare(`DELETE FROM ${table}`).run();
              } catch (e: any) {}
            }
            continue;
          }

          let allowedColumns: Set<string>;
          try {
            const info = db.pragma(`table_info(${table})`) as any[];
            allowedColumns = new Set(info.map(col => col.name));
          } catch (colErr: any) {
            allowedColumns = new Set();
          }

          // Fetch locally deleted record IDs for this table
          let deletedIdsSet = new Set<string>();
          try {
            const deletedRows = db.prepare("SELECT record_id FROM deleted_records WHERE table_name = ?").all(table) as any[];
            deletedIdsSet = new Set(deletedRows.map(r => String(r.record_id)));
          } catch (e) {}

          const remoteDocs = snapshot.docs;
          const remoteIds = new Set<string>();

          if (forceOverwrite && table !== 'system_audit_logs') {
            db.prepare(`DELETE FROM ${table}`).run();
          }

          for (const docSnap of remoteDocs) {
            const data = docSnap.data();
            const docId = String(table === 'settings' ? (data.key || docSnap.id) : (data.id !== undefined ? data.id : docSnap.id));
            remoteIds.add(docId);

            // CRITICAL: Never re-insert records that have been deleted!
            if (deletedIdsSet.has(docId)) {
              continue;
            }

            if (table === 'departments' && data && data.name && ['Storage', 'Micro SDs', 'USBs', 'Electronics', 'Micro SD'].includes(data.name)) {
              const prodCount = db.prepare("SELECT COUNT(*) as count FROM products WHERE category = ?").get(data.name) as any;
              if (!prodCount || prodCount.count === 0) {
                continue;
              }
            }

            if (table === 'products' && !forceOverwrite && data.id) {
              try {
                const localProd = db.prepare("SELECT stock, updated_at FROM products WHERE id = ?").get(data.id) as any;
                if (localProd && localProd.updated_at && data.updated_at) {
                  const localTime = new Date(localProd.updated_at).getTime();
                  const remoteTime = new Date(data.updated_at).getTime();
                  if (!isNaN(localTime) && !isNaN(remoteTime) && localTime > remoteTime) {
                    continue;
                  }
                }
              } catch (e: any) {}
            }

            let keys = Object.keys(data);
            if (keys.length === 0) continue;

            if (allowedColumns.size > 0) {
              keys = keys.filter(k => allowedColumns.has(k));
            }
            if (keys.length === 0) continue;

            const placeholders = keys.map(() => '?').join(', ');
            const values = keys.map(k => data[k]);

            const insertSql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
            db.prepare(insertSql).run(...values);
          }

          // Reconcile deletions
          if (['products', 'clients', 'departments'].includes(table) && remoteDocs.length > 0 && !forceOverwrite) {
            try {
              const localRows = db.prepare(`SELECT id, updated_at FROM ${table}`).all() as any[];
              for (const localRow of localRows) {
                const localIdStr = String(localRow.id);
                if (!remoteIds.has(localIdStr)) {
                  const updatedAtTime = localRow.updated_at ? new Date(localRow.updated_at).getTime() : 0;
                  const isRecentlyCreatedLocally = (Date.now() - updatedAtTime) < 60000;

                  if (!isRecentlyCreatedLocally || deletedIdsSet.has(localIdStr)) {
                    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(localRow.id);
                    recordDeletion(table, localIdStr);
                  }
                }
              }
            } catch (reconcileErr: any) {}
          }
          updatedTableCount++;
        } catch (tableErr: any) {
          handleSyncError(tableErr, `[Sync Warning] Table "${table}":`);
        }
      }
    });

    globalSyncTx();

    lastPullTimestamp = Date.now();
    
    for (const key of Object.keys(lastSyncedMaxIdCache)) {
      delete lastSyncedMaxIdCache[key];
    }
    
    if (forceOverwrite) {
      console.log(`[Sync] Master database pull completed successfully (${updatedTableCount} tables synced).`);
    }
  } catch (error: any) {
    // Standalone fallback
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

  // 1. Clear Google Cloud Firestore collections in parallel
  if (firestore) {
    try {
      await ensureServerAuth();
      const collectionsToClear = [...SYNC_TABLES, 'processed_operations', 'deleted_records'];
      
      await Promise.all(collectionsToClear.map(async (tableName) => {
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
      }));

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
    'exchange_rate_audit',
    'processed_operations',
    'deleted_records'
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
