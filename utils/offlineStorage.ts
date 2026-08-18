// MI DIOS: MOTOR DE PERSISTENCIA LOCAL (Phoenix Persistence v1.0)
// Jefe, este archivo gestiona la cola de sincronización para cuando el internet falle en los patios.

const DB_NAME = 'nglobal_offline_db';
const DB_VERSION = 1;
const SYNC_STORE = 'sync_queue';
const IMAGE_STORE = 'quality_images';

export const initOfflineDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveToSyncQueue = async (tableName: string, payload: any, operation: 'INSERT' | 'UPDATE' = 'INSERT') => {
  const db = await initOfflineDB();
  const tx = db.transaction(SYNC_STORE, 'readwrite');
  const store = tx.objectStore(SYNC_STORE);
  await store.add({
    tableName,
    payload,
    operation,
    timestamp: new Date().toISOString()
  });
};

export const saveQualityImage = async (id: string, blob: string) => {
    const db = await initOfflineDB();
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    const store = tx.objectStore(IMAGE_STORE);
    await store.put({ id, blob, timestamp: new Date().toISOString() });
};

export const getPendingSync = async () => {
    const db = await initOfflineDB();
    const tx = db.transaction(SYNC_STORE, 'readonly');
    const store = tx.objectStore(SYNC_STORE);
    return new Promise<any[]>((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
    });
};