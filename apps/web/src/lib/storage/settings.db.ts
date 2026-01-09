import { settings } from '@baab/shared';

import { openDB } from './db';

const DB_NAME = 'settings';
const DB_VERSION = 1;

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
    return {
      id: 1,
      ...settings.DEFAULT_SETTINGS,
    };
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

  async update(updates: Partial<Omit<settings.AppSettings, 'id'>>): Promise<settings.AppSettings> {
    const current = await this.getOrDefault();
    const updated: settings.AppSettings = {
      ...current,
      ...updates,
      id: 1,
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

export class SettingsStorageManager {
  #settingsStorage: SettingsRepository;

  constructor(settingsStorage: SettingsRepository) {
    this.#settingsStorage = settingsStorage;
  }

  static async createInstance() {
    return new SettingsStorageManager(await SettingsRepository.init());
  }

  get settingsStorage() {
    return this.#settingsStorage;
  }
}
