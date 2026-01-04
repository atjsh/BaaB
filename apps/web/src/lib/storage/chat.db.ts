import { chat } from '@baab/shared';

import { openDB } from './db';

const DB_NAME = 'chat';
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
        stores: Object.values(chat.ChatIndexedDBStore),
      }),
    );
  }

  async put(id: string, entry: chat.ChatLocalPushSendIndexedDBEntry): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.localPushSendStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.localPushSendStorageName);
      const request = store.put(entry, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: string): Promise<chat.ChatLocalPushSendIndexedDBEntry | null> {
    return new Promise<chat.ChatLocalPushSendIndexedDBEntry | null>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.localPushSendStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.localPushSendStorageName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.localPushSendStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.localPushSendStorageName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<chat.ChatLocalPushSendIndexedDBEntry[]> {
    return new Promise<chat.ChatLocalPushSendIndexedDBEntry[]>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.localPushSendStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.localPushSendStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.localPushSendStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.localPushSendStorageName);
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
        stores: Object.values(chat.ChatIndexedDBStore),
      }),
    );
  }

  async put(id: string, entry: chat.ChatRemotePushSendIndexedDBEntry): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.remotePushSendStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.remotePushSendStorageName);
      const request = store.put(entry, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: string): Promise<chat.ChatRemotePushSendIndexedDBEntry | null> {
    return new Promise<chat.ChatRemotePushSendIndexedDBEntry | null>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.remotePushSendStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.remotePushSendStorageName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.remotePushSendStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.remotePushSendStorageName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<chat.ChatRemotePushSendIndexedDBEntry[]> {
    return new Promise<chat.ChatRemotePushSendIndexedDBEntry[]>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.remotePushSendStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.remotePushSendStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.remotePushSendStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.remotePushSendStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export class ReceivedChunkedMessagesRepository {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async init(): Promise<ReceivedChunkedMessagesRepository> {
    return new ReceivedChunkedMessagesRepository(
      await openDB({
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: Object.values(chat.ChatIndexedDBStore),
      }),
    );
  }

  async generateId(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.openCursor(null, 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if (typeof cursor.key === 'number') {
            resolve(cursor.key + 1);
          } else {
            reject(new Error('Invalid key type'));
          }
        } else {
          resolve(1);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async put(id: number, entry: chat.ChatReceivedChunkedMessageIndexedDBEntry): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.put(entry, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: number): Promise<chat.ChatReceivedChunkedMessageIndexedDBEntry | null> {
    return new Promise<chat.ChatReceivedChunkedMessageIndexedDBEntry | null>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<chat.ChatReceivedChunkedMessageIndexedDBEntry[]> {
    return new Promise<chat.ChatReceivedChunkedMessageIndexedDBEntry[]>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export class ChatMessagesRepository {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async init(): Promise<ChatMessagesRepository> {
    return new ChatMessagesRepository(
      await openDB({
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: Object.values(chat.ChatIndexedDBStore),
      }),
    );
  }

  async put(id: number, entry: chat.ChatMessagesIndexedDBEntry): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.messagesStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.messagesStorageName);
      const request = store.put(entry, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: number): Promise<chat.ChatMessagesIndexedDBEntry | null> {
    return new Promise<chat.ChatMessagesIndexedDBEntry | null>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.messagesStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.messagesStorageName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.messagesStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.messagesStorageName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<chat.ChatMessagesIndexedDBEntry[]> {
    return new Promise<chat.ChatMessagesIndexedDBEntry[]>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.messagesStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.messagesStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.messagesStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.messagesStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export class ChatStorageManager {
  #localPushSendStorage: LocalPushSendRepository;
  #remotePushSendStorage: RemotePushSendRepository;
  #receivedChunkedMessagesStorage: ReceivedChunkedMessagesRepository;
  #chatMessagesStorage: ChatMessagesRepository;

  constructor(
    localPushSendStorage: LocalPushSendRepository,
    remotePushSendStorage: RemotePushSendRepository,
    receivedChunkedMessagesStorage: ReceivedChunkedMessagesRepository,
    chatMessagesStorage: ChatMessagesRepository,
  ) {
    this.#localPushSendStorage = localPushSendStorage;
    this.#remotePushSendStorage = remotePushSendStorage;
    this.#receivedChunkedMessagesStorage = receivedChunkedMessagesStorage;
    this.#chatMessagesStorage = chatMessagesStorage;
  }

  static async createInstance() {
    return new ChatStorageManager(
      await LocalPushSendRepository.init(),
      await RemotePushSendRepository.init(),
      await ReceivedChunkedMessagesRepository.init(),
      await ChatMessagesRepository.init(),
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

  get chatMessagesStorage() {
    return this.#chatMessagesStorage;
  }
}
