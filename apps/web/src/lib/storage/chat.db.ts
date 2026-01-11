import { chat } from '@baab/shared';

import { openDB } from './db';

const DB_NAME = 'chat';
const DB_VERSION = 3; // Bumped - removed LocalPushSendRepository

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

  async put(entry: chat.ChatRemotePushSendIndexedDBEntry): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.remotePushSendStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.remotePushSendStorageName);
      const request = store.put(entry);
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

  async getByConversationId(conversationId: string): Promise<chat.ChatRemotePushSendIndexedDBEntry | null> {
    const all = await this.getAll();
    return all.find((entry) => entry.conversationId === conversationId) || null;
  }

  async getByEndpoint(endpoint: string): Promise<chat.ChatRemotePushSendIndexedDBEntry | null> {
    const all = await this.getAll();
    return all.find((entry) => entry.pushSubscription.endpoint === endpoint) || null;
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

  /**
   * Increment failed attempts for a remote. Returns the new count.
   */
  async incrementFailedAttempts(id: string): Promise<number> {
    const entry = await this.get(id);
    if (entry) {
      const newCount = (entry.failedAttempts ?? 0) + 1;
      await this.put({ ...entry, failedAttempts: newCount });
      return newCount;
    }
    return 0;
  }

  /**
   * Reset failed attempts for a remote.
   */
  async resetFailedAttempts(id: string): Promise<void> {
    const entry = await this.get(id);
    if (entry && entry.failedAttempts) {
      await this.put({ ...entry, failedAttempts: 0 });
    }
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

  async put(entry: chat.ChatReceivedChunkedMessageIndexedDBEntry): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName);
      const request = store.put(entry);
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

  async getAll(): Promise<(chat.ChatReceivedChunkedMessageIndexedDBEntry & { _dbKey: number })[]> {
    return new Promise<(chat.ChatReceivedChunkedMessageIndexedDBEntry & { _dbKey: number })[]>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.receivedChunkedMessagesStorageName);
      const results: (chat.ChatReceivedChunkedMessageIndexedDBEntry & { _dbKey: number })[] = [];
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push({ ...cursor.value, _dbKey: cursor.key as number });
          cursor.continue();
        } else {
          resolve(results);
        }
      };
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

  async put(entry: chat.ChatMessagesIndexedDBEntry): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.messagesStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.messagesStorageName);
      const request = store.put(entry);
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

  async getByConversationId(conversationId: string): Promise<chat.ChatMessagesIndexedDBEntry[]> {
    const all = await this.getAll();
    return all.filter((entry) => entry.conversationId === conversationId).sort((a, b) => a.timestamp - b.timestamp);
  }

  async getStorageSizeByConversationId(conversationId: string): Promise<number> {
    const messages = await this.getByConversationId(conversationId);
    return messages.reduce((sum, msg) => sum + msg.sizeBytes, 0);
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

  async deleteByConversationId(conversationId: string): Promise<void> {
    const messages = await this.getByConversationId(conversationId);
    for (const msg of messages) {
      await this.delete(msg.id);
    }
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

export class ConversationsRepository {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async init(): Promise<ConversationsRepository> {
    return new ConversationsRepository(
      await openDB({
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: Object.values(chat.ChatIndexedDBStore),
      }),
    );
  }

  async put(entry: chat.ChatConversationIndexedDBEntry): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.conversationsStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.conversationsStorageName);
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: string): Promise<chat.ChatConversationIndexedDBEntry | null> {
    return new Promise<chat.ChatConversationIndexedDBEntry | null>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.conversationsStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.conversationsStorageName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getByStatus(status: chat.ConversationStatus): Promise<chat.ChatConversationIndexedDBEntry[]> {
    const all = await this.getAll();
    return all.filter((entry) => entry.status === status);
  }

  async getByRole(role: chat.ConversationRole): Promise<chat.ChatConversationIndexedDBEntry[]> {
    const all = await this.getAll();
    return all.filter((entry) => entry.role === role);
  }

  async updateStatus(id: string, status: chat.ConversationStatus): Promise<void> {
    const entry = await this.get(id);
    if (entry) {
      entry.status = status;
      await this.put(entry);
    }
  }

  async updateStorageUsage(id: string, storageBytesUsed: number): Promise<void> {
    const entry = await this.get(id);
    if (entry) {
      entry.storageBytesUsed = storageBytesUsed;
      await this.put(entry);
    }
  }

  async incrementFailedAttempts(id: string): Promise<number> {
    const entry = await this.get(id);
    if (entry) {
      entry.failedAttempts += 1;
      if (entry.failedAttempts >= 3) {
        entry.status = chat.ConversationStatus.UNAVAILABLE;
      }
      await this.put(entry);
      return entry.failedAttempts;
    }
    return 0;
  }

  async resetFailedAttempts(id: string): Promise<void> {
    const entry = await this.get(id);
    if (entry) {
      entry.failedAttempts = 0;
      if (entry.status === chat.ConversationStatus.UNAVAILABLE) {
        entry.status = chat.ConversationStatus.ACTIVE;
      }
      await this.put(entry);
    }
  }

  async updateLastActivity(id: string, lastActivityAt: number, lastMessagePreview?: string): Promise<void> {
    const entry = await this.get(id);
    if (entry) {
      entry.lastActivityAt = lastActivityAt;
      if (lastMessagePreview !== undefined) {
        entry.lastMessagePreview = lastMessagePreview;
      }
      await this.put(entry);
    }
  }

  async incrementUnreadCount(id: string): Promise<void> {
    const entry = await this.get(id);
    if (entry) {
      entry.unreadCount += 1;
      await this.put(entry);
    }
  }

  async resetUnreadCount(id: string): Promise<void> {
    const entry = await this.get(id);
    if (entry) {
      entry.unreadCount = 0;
      await this.put(entry);
    }
  }

  async delete(id: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.conversationsStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.conversationsStorageName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<chat.ChatConversationIndexedDBEntry[]> {
    return new Promise<chat.ChatConversationIndexedDBEntry[]>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.conversationsStorageName, 'readonly');
      const store = tx.objectStore(chat.ChatIndexedDBStore.conversationsStorageName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this.#db.transaction(chat.ChatIndexedDBStore.conversationsStorageName, 'readwrite');
      const store = tx.objectStore(chat.ChatIndexedDBStore.conversationsStorageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export class ChatStorageManager {
  #remotePushSendStorage: RemotePushSendRepository;
  #receivedChunkedMessagesStorage: ReceivedChunkedMessagesRepository;
  #chatMessagesStorage: ChatMessagesRepository;
  #conversationsStorage: ConversationsRepository;

  constructor(
    remotePushSendStorage: RemotePushSendRepository,
    receivedChunkedMessagesStorage: ReceivedChunkedMessagesRepository,
    chatMessagesStorage: ChatMessagesRepository,
    conversationsStorage: ConversationsRepository,
  ) {
    this.#remotePushSendStorage = remotePushSendStorage;
    this.#receivedChunkedMessagesStorage = receivedChunkedMessagesStorage;
    this.#chatMessagesStorage = chatMessagesStorage;
    this.#conversationsStorage = conversationsStorage;
  }

  static async createInstance() {
    return new ChatStorageManager(
      await RemotePushSendRepository.init(),
      await ReceivedChunkedMessagesRepository.init(),
      await ChatMessagesRepository.init(),
      await ConversationsRepository.init(),
    );
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

  get conversationsStorage() {
    return this.#conversationsStorage;
  }

  /**
   * Save a message with storage quota enforcement.
   * Returns true if saved successfully, false if quota exceeded.
   */
  async saveMessageWithQuotaCheck(
    message: chat.ChatMessagesIndexedDBEntry,
  ): Promise<{ success: boolean; quotaExceeded: boolean }> {
    const conversation = await this.#conversationsStorage.get(message.conversationId);
    if (!conversation) {
      return { success: false, quotaExceeded: false };
    }

    const newStorageUsed = conversation.storageBytesUsed + message.sizeBytes;
    if (newStorageUsed > chat.MAX_CONVERSATION_STORAGE_BYTES) {
      return { success: false, quotaExceeded: true };
    }

    await this.#chatMessagesStorage.put(message);
    await this.#conversationsStorage.updateStorageUsage(message.conversationId, newStorageUsed);

    return { success: true, quotaExceeded: false };
  }

  /**
   * Delete a message and update storage usage.
   */
  async deleteMessageAndUpdateStorage(messageId: number, conversationId: string): Promise<void> {
    const message = await this.#chatMessagesStorage.get(messageId);
    if (message && message.conversationId === conversationId) {
      await this.#chatMessagesStorage.delete(messageId);

      const conversation = await this.#conversationsStorage.get(conversationId);
      if (conversation) {
        const newStorageUsed = Math.max(0, conversation.storageBytesUsed - message.sizeBytes);
        await this.#conversationsStorage.updateStorageUsage(conversationId, newStorageUsed);
      }
    }
  }

  /**
   * Delete all data for a conversation.
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const conversation = await this.#conversationsStorage.get(conversationId);
    if (!conversation) return;

    // Delete all messages
    await this.#chatMessagesStorage.deleteByConversationId(conversationId);

    // Delete remote push send options
    if (conversation.remotePushSendOptionsId) {
      await this.#remotePushSendStorage.delete(conversation.remotePushSendOptionsId);
    }

    // Delete conversation
    await this.#conversationsStorage.delete(conversationId);
  }

  /**
   * Recalculate storage usage for a conversation from actual messages.
   */
  async recalculateStorageUsage(conversationId: string): Promise<number> {
    const size = await this.#chatMessagesStorage.getStorageSizeByConversationId(conversationId);
    await this.#conversationsStorage.updateStorageUsage(conversationId, size);
    return size;
  }
}
