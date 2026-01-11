import { settings } from '@baab/shared';

import { openDB } from './db';

const DB_NAME = 'settings';
const DB_VERSION = 2; // Bumped for LocalPushCredentials store

export class SettingsRepository {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async init(): Promise<SettingsRepository> {
    return new SettingsRepository(
      await openDB({
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: Object.values(settings.SettingsIndexedDBStore),
      }),
    );
  }

  async get(): Promise<settings.AppSettings | null> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(settings.SettingsIndexedDBStore.settingsStorageName, 'readonly');
      const store = tx.objectStore(settings.SettingsIndexedDBStore.settingsStorageName);
      const request = store.get(1);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getOrDefault(): Promise<settings.AppSettings> {
    const existing = await this.get();
    if (existing) {
      return existing;
    }
    // if it's localhost / url is file://, disable push proxy by default
    // if it's not, enable push proxy by default

    if (typeof window !== 'undefined') {
      const isLocalhost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === 'file://' ||
        window.location.hostname === 'file';
      const defaultSettings: settings.AppSettings = {
        id: 1,
        usePushProxy: !isLocalhost,
        pushProxyHost: '',
        lastUpdatedAt: null,
      };
      return defaultSettings;
    } else {
      const defaultSettings: settings.AppSettings = {
        id: 1,
        usePushProxy: true,
        pushProxyHost: '',
        lastUpdatedAt: null,
      };
      return defaultSettings;
    }
  }

  async put(entry: settings.AppSettings): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(settings.SettingsIndexedDBStore.settingsStorageName, 'readwrite');
      const store = tx.objectStore(settings.SettingsIndexedDBStore.settingsStorageName);
      const request = store.put({ ...entry, id: 1 });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async update(updates: Partial<Omit<settings.AppSettings, 'id' | 'lastUpdatedAt'>>): Promise<settings.AppSettings> {
    const current = await this.getOrDefault();
    const updated: settings.AppSettings = {
      ...current,
      ...updates,
      id: 1,
      lastUpdatedAt: new Date().toISOString(),
    };
    await this.put(updated);
    return updated;
  }

  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(settings.SettingsIndexedDBStore.settingsStorageName, 'readwrite');
      const store = tx.objectStore(settings.SettingsIndexedDBStore.settingsStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Repository for managing LocalPushCredentials in IndexedDB
 */
export class LocalPushCredentialsRepository {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async init(): Promise<LocalPushCredentialsRepository> {
    return new LocalPushCredentialsRepository(
      await openDB({
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: Object.values(settings.SettingsIndexedDBStore),
      }),
    );
  }

  /**
   * Get the current push credentials
   */
  async get(): Promise<settings.LocalPushCredentials | null> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(settings.SettingsIndexedDBStore.localPushCredentialsStorageName, 'readonly');
      const store = tx.objectStore(settings.SettingsIndexedDBStore.localPushCredentialsStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result[0] || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save push credentials
   */
  async put(credentials: Omit<settings.LocalPushCredentials, 'id'>): Promise<settings.LocalPushCredentials> {
    const entry: settings.LocalPushCredentials = {
      ...credentials,
      id: crypto.randomUUID(),
    };
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(settings.SettingsIndexedDBStore.localPushCredentialsStorageName, 'readwrite');
      const store = tx.objectStore(settings.SettingsIndexedDBStore.localPushCredentialsStorageName);
      const request = store.put(entry);
      request.onsuccess = () => resolve(entry);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update existing credentials with partial data
   */
  async update(
    updates: Partial<Omit<settings.LocalPushCredentials, 'id' | 'createdAt'>>,
  ): Promise<settings.LocalPushCredentials | null> {
    const current = await this.get();
    if (!current) {
      return null;
    }
    const updated: settings.LocalPushCredentials = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.put(updated);
    return updated;
  }

  /**
   * Delete push credentials (revoke)
   */
  async delete(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(settings.SettingsIndexedDBStore.localPushCredentialsStorageName, 'readwrite');
      const store = tx.objectStore(settings.SettingsIndexedDBStore.localPushCredentialsStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all push credentials
   */
  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction(settings.SettingsIndexedDBStore.localPushCredentialsStorageName, 'readwrite');
      const store = tx.objectStore(settings.SettingsIndexedDBStore.localPushCredentialsStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export class SettingsStorageManager {
  #settingsStorage: SettingsRepository;
  #localPushCredentialsStorage: LocalPushCredentialsRepository;

  constructor(settingsStorage: SettingsRepository, localPushCredentialsStorage: LocalPushCredentialsRepository) {
    this.#settingsStorage = settingsStorage;
    this.#localPushCredentialsStorage = localPushCredentialsStorage;
  }

  static async createInstance() {
    const settingsStorage = await SettingsRepository.init();
    const localPushCredentialsStorage = await LocalPushCredentialsRepository.init();
    return new SettingsStorageManager(settingsStorage, localPushCredentialsStorage);
  }

  get settingsStorage() {
    return this.#settingsStorage;
  }

  get localPushCredentialsStorage() {
    return this.#localPushCredentialsStorage;
  }
}
