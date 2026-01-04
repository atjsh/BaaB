import { share } from '@baab/shared';

import { openDB } from './db';

const DB_NAME = 'share';
const DB_VERSION = 1;

export class LocalPushSendRepository {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async init(): Promise<LocalPushSendRepository> {
    return new LocalPushSendRepository(
      await openDB({
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: Object.values(share.ShareIndexedDBStore),
      }),
    );
  }

  async put(id: string, entry: share.ShareLocalPushSendIndexedDBEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.localPushSendStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.localPushSendStorageName);
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: string): Promise<share.ShareLocalPushSendIndexedDBEntry | null> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.localPushSendStorageName, 'readonly');
      const store = tx.objectStore(share.ShareIndexedDBStore.localPushSendStorageName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.localPushSendStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.localPushSendStorageName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<share.ShareLocalPushSendIndexedDBEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.localPushSendStorageName, 'readonly');
      const store = tx.objectStore(share.ShareIndexedDBStore.localPushSendStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.localPushSendStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.localPushSendStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export class RemotePushSendRepository {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async init(): Promise<RemotePushSendRepository> {
    return new RemotePushSendRepository(
      await openDB({
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: Object.values(share.ShareIndexedDBStore),
      }),
    );
  }

  async put(id: string, entry: share.ShareRemotePushSendIndexedDBEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.remotePushSendStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.remotePushSendStorageName);
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: string): Promise<share.ShareRemotePushSendIndexedDBEntry | null> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.remotePushSendStorageName, 'readonly');
      const store = tx.objectStore(share.ShareIndexedDBStore.remotePushSendStorageName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.remotePushSendStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.remotePushSendStorageName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<share.ShareRemotePushSendIndexedDBEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.remotePushSendStorageName, 'readonly');
      const store = tx.objectStore(share.ShareIndexedDBStore.remotePushSendStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.remotePushSendStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.remotePushSendStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export class ReceivedChunkedMessageRepository {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async init(): Promise<ReceivedChunkedMessageRepository> {
    return new ReceivedChunkedMessageRepository(
      await openDB({
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: Object.values(share.ShareIndexedDBStore),
      }),
    );
  }

  async put(id: number, entry: share.ShareReceivedChunkedMessageIndexedDBEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: number): Promise<share.ShareReceivedChunkedMessageIndexedDBEntry | null> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName, 'readonly');
      const store = tx.objectStore(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<share.ShareReceivedChunkedMessageIndexedDBEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName, 'readonly');
      const store = tx.objectStore(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export class LatestAssetRepository {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async init(): Promise<LatestAssetRepository> {
    return new LatestAssetRepository(
      await openDB({
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: Object.values(share.ShareIndexedDBStore),
      }),
    );
  }

  async put(id: number, entry: share.ShareLatestAssetIndexedDBEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.latestAssetStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.latestAssetStorageName);
      const request = store.put({
        ...entry,
        id,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: number): Promise<share.ShareLatestAssetIndexedDBEntry | null> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.latestAssetStorageName, 'readonly');
      const store = tx.objectStore(share.ShareIndexedDBStore.latestAssetStorageName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.latestAssetStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.latestAssetStorageName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<share.ShareLatestAssetIndexedDBEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.latestAssetStorageName, 'readonly');
      const store = tx.objectStore(share.ShareIndexedDBStore.latestAssetStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(share.ShareIndexedDBStore.latestAssetStorageName, 'readwrite');
      const store = tx.objectStore(share.ShareIndexedDBStore.latestAssetStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export class ShareStorageManager {
  #localPushSendStorage: LocalPushSendRepository;
  #remotePushSendStorage: RemotePushSendRepository;
  #receivedChunkedMessagesStorage: ReceivedChunkedMessageRepository;
  #latestAssetStorage: LatestAssetRepository;

  constructor(
    localPushSendStorage: LocalPushSendRepository,
    remotePushSendStorage: RemotePushSendRepository,
    receivedChunkedMessagesStorage: ReceivedChunkedMessageRepository,
    latestAssetStorage: LatestAssetRepository,
  ) {
    this.#localPushSendStorage = localPushSendStorage;
    this.#remotePushSendStorage = remotePushSendStorage;
    this.#receivedChunkedMessagesStorage = receivedChunkedMessagesStorage;
    this.#latestAssetStorage = latestAssetStorage;
  }

  static async createInstance() {
    return new ShareStorageManager(
      await LocalPushSendRepository.init(),
      await RemotePushSendRepository.init(),
      await ReceivedChunkedMessageRepository.init(),
      await LatestAssetRepository.init(),
    );
  }

  get localPushSendStorage() {
    return this.#localPushSendStorage;
  }

  get remotePushSendStorage() {
    return this.#remotePushSendStorage;
  }

  get receivedChunkedMessagesStorage() {
    return this.#receivedChunkedMessagesStorage;
  }

  get latestAssetStorage() {
    return this.#latestAssetStorage;
  }
}
