export function openDB(params: { dbName: string; dbVersion: number; stores: string[] }): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(params.dbName, params.dbVersion);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      params.stores.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      });
    };
  });
}
