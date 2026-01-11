/// <reference lib="webworker" />
import { decompress } from 'lz-string';
import { toBase64Url } from 'web-push-browser';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

import { chat, settings, share } from '@baab/shared';

import { ChatStorageManager } from './lib/storage/chat.db';
import { SettingsStorageManager } from './lib/storage/settings.db';
import { ShareStorageManager } from './lib/storage/share.db';
import { getRandomInt, sleep } from './lib/typescript';
import { encryptWebPush, type EncryptWebPushResult } from './lib/web-push-encryption';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

const DEFAULT_PROXY_URL = import.meta.env.VITE_PROXY_URL;

// Cache for settings to avoid repeated DB reads
let cachedSettings: settings.AppSettings | null = null;

async function broadcastToClients(data: chat.ChatMessagePayload | share.ShareMessagePayload) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({
      type: 'PUSH_RECEIVED',
      payload: data,
    });
  }
}

async function broadcastDebugInfoToClients(info: any) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({
      type: 'DEBUG_INFO',
      payload: info,
    });
  }
}

async function hasVisibleClient(): Promise<boolean> {
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const hasVisibleClient = windowClients.some((c) => c.visibilityState === 'visible');
  return hasVisibleClient;
}

function parsePushMessageData(
  pushMessageData: PushMessageData,
): chat.ChunkedChatMessagePayload | share.ChunkedShareMessagePayload | null {
  try {
    const jsonParsed = pushMessageData.json();
    if (typeof jsonParsed === 'object' && jsonParsed !== null) {
      if (chat.isChunkedChatMessagePayload(jsonParsed)) {
        return jsonParsed;
      } else if (share.isChunkedShareMessagePayload(jsonParsed)) {
        return jsonParsed;
      }
    }

    return null;
  } catch (e) {
    console.error('Failed to parse push message data as JSON', e);
    return null;
  }
}

export interface ChatIncomingMessage {
  /**
   * Base64 encoded content of the message
   */
  base64Content: string;

  /**
   * MIME type of the content
   */
  contentType: string;
}

/**
 * Get current settings from cache or load from IndexedDB
 */
async function getSettings(): Promise<settings.AppSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }

  const settingsStorage = await SettingsStorageManager.createInstance();
  cachedSettings = await settingsStorage.settingsStorage.getOrDefault();
  return cachedSettings;
}

/**
 * Send push message via proxy server
 */
async function sendPushMessageViaProxy(encrypted: EncryptWebPushResult, proxyUrl: string) {
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: encrypted.endpoint,
      body: toBase64Url(encrypted.body as any),
      headers: encrypted.headers,
    }),
  });

  if (!res.ok) {
    throw new Error(`Push proxy responded ${res.status}`);
  }

  return res;
}

/**
 * Send push message directly to the push endpoint
 */
async function sendPushMessageDirect(encrypted: EncryptWebPushResult) {
  // Convert Uint8Array to ArrayBuffer for fetch body
  const bodyBuffer = encrypted.body.buffer.slice(
    encrypted.body.byteOffset,
    encrypted.body.byteOffset + encrypted.body.byteLength,
  ) as ArrayBuffer;

  const res = await fetch(encrypted.endpoint, {
    method: 'POST',
    headers: {
      ...encrypted.headers,
      'Content-Type': 'application/octet-stream',
    },
    body: bodyBuffer,
  });

  if (!res.ok) {
    throw new Error(`Direct push responded ${res.status}`);
  }

  return res;
}

async function sendPushMessage(encrypted: EncryptWebPushResult) {
  const appSettings = await getSettings();

  if (appSettings.usePushProxy) {
    const proxyUrl = appSettings.pushProxyHost || DEFAULT_PROXY_URL;
    return sendPushMessageViaProxy(encrypted, proxyUrl);
  } else {
    return sendPushMessageDirect(encrypted);
  }
}

async function sendPushMessageWithRetry(encrypted: EncryptWebPushResult, maxAttempts = 3) {
  let attempt = 0;
  let lastErr: any;
  while (attempt < maxAttempts) {
    try {
      await sendPushMessage(encrypted);
      return;
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (attempt >= maxAttempts) break;
      const backoff = Math.min(500, 100 * attempt);
      await sleep(backoff);
    }
  }
  throw lastErr ?? new Error('Failed to send push message');
}

const MAX_REMOTE_FAILURES = 3;

/**
 * Result of chunk sending operation
 */
interface ChunkSendResult {
  success: boolean;
  remoteForgotten: boolean;
}

async function chunkAndSendChatMessage(
  payloadString: string,
  conversationId: string,
  localPushCredentials: settings.LocalPushCredentials,
  remotePushSendOption: chat.ChatRemotePushSendOptions,
): Promise<ChunkSendResult> {
  if (!remotePushSendOption.pushSubscription.endpoint) {
    throw new Error('No push subscription endpoint available in remote push send options');
  }
  const endpoint = remotePushSendOption.pushSubscription.endpoint;

  const messageId = getRandomInt(1, 0xffffffff);
  const total = Math.ceil(payloadString.length / 2048);
  const chunks: chat.ChunkedChatMessagePayload[] = [];
  for (let i = 0; i < total; i++) {
    const chunkData = payloadString.slice(i * 2048, (i + 1) * 2048);
    chunks.push({
      t: 'c',
      cid: conversationId,
      fr: localPushCredentials.id,
      id: getRandomInt(1, 0xffffffff),
      mid: messageId,
      i,
      all: total,
      d: chunkData,
    });
  }

  const { concurrency, jitterMs } = { concurrency: 3, jitterMs: 500 };
  const chatStorageManager = await ChatStorageManager.createInstance();

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    try {
      await Promise.all(
        batch.map(async (chunk) => {
          if (jitterMs > 0) {
            await sleep(Math.random() * jitterMs);
          }
          const encrypted: EncryptWebPushResult = await encryptWebPush({
            subscription: {
              endpoint,
              keys: {
                auth: remotePushSendOption.messageEncryption.auth,
                p256dh: remotePushSendOption.messageEncryption.p256dh,
              },
            },
            vapidKeyPair: remotePushSendOption.vapidKeys,
            payload: JSON.stringify(chunk),
            contact: remotePushSendOption.webPushContacts,
            urgency: 'high',
          });
          return sendPushMessageWithRetry(encrypted, 3);
        }),
      );
    } catch (err) {
      // Batch failed - increment failure count for this remote
      const failedAttempts = await chatStorageManager.remotePushSendStorage.incrementFailedAttempts(
        remotePushSendOption.id,
      );
      broadcastDebugInfoToClients(
        `Chat push failed for remote ${remotePushSendOption.id}, attempt ${failedAttempts}/${MAX_REMOTE_FAILURES}`,
      );

      if (failedAttempts >= MAX_REMOTE_FAILURES) {
        // Get conversation name before deleting for notification
        const conversation = await chatStorageManager.conversationsStorage.get(conversationId);
        const conversationName = conversation?.name;

        // Delete the remote
        await chatStorageManager.remotePushSendStorage.delete(remotePushSendOption.id);

        // Mark conversation as unavailable
        if (conversationId) {
          await chatStorageManager.conversationsStorage.updateStatus(
            conversationId,
            chat.ConversationStatus.UNAVAILABLE,
          );
        }

        // Broadcast to clients
        await broadcastRemoteForgotten(remotePushSendOption.id, 'chat', conversationId, conversationName);

        broadcastDebugInfoToClients(
          `Remote ${remotePushSendOption.id} forgotten after ${MAX_REMOTE_FAILURES} failures`,
        );

        return { success: false, remoteForgotten: true };
      }

      // Re-throw to let caller know sending failed
      throw err;
    }
  }

  // All chunks sent successfully - reset failure count
  await chatStorageManager.remotePushSendStorage.resetFailedAttempts(remotePushSendOption.id);

  return { success: true, remoteForgotten: false };
}

// Broadcast push failure to clients (for reconnection logic)
// @ts-expect-error - Will be used for push failure detection in future
async function _broadcastPushFailedToClients(conversationId: string, peerId: string) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({
      type: 'PUSH_FAILED',
      conversationId,
      peerId,
    });
  }
}

/**
 * Broadcast that a remote has been forgotten (deleted after max failures)
 */
async function broadcastRemoteForgotten(
  remoteId: string,
  context: 'chat' | 'share',
  conversationId?: string,
  conversationName?: string,
) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({
      type: 'REMOTE_FORGOTTEN',
      remoteId,
      context,
      conversationId,
      conversationName,
    });
  }
}

const handleChatChunkedMessage = async (
  chunkedPayload: chat.ChunkedChatMessagePayload,
  chatStorageManager: ChatStorageManager,
) => {
  await chatStorageManager.receivedChunkedMessagesStorage.put(chunkedPayload);

  const allChunks = await chatStorageManager.receivedChunkedMessagesStorage.getAll();
  const relevantChunks = allChunks.filter(
    (chunk) => chunk.fr === chunkedPayload.fr && chunk.mid === chunkedPayload.mid,
  );

  broadcastDebugInfoToClients({ relevantChunksLength: relevantChunks.length, totalChunks: chunkedPayload.all });

  if (relevantChunks.length === chunkedPayload.all) {
    relevantChunks.sort((a, b) => a.i - b.i);
    const fullDataBase64 = relevantChunks.map((chunk) => chunk.d).join('');
    let parsedFullDataJson: chat.ChatMessagePayloadEnum = JSON.parse(fullDataBase64);

    // Decompress text messages if compressed (z flag is set)
    if (
      parsedFullDataJson.t === chat.ChatMessagePayloadType.MESSAGE &&
      parsedFullDataJson.z === true &&
      parsedFullDataJson.c === chat.ChatMessageContentType.TEXT_PLAIN
    ) {
      const compressedData = parsedFullDataJson.d;
      const decompressedText = decompress(compressedData);
      if (decompressedText) {
        // Convert decompressed text to base64 for consistent storage format
        parsedFullDataJson = {
          ...parsedFullDataJson,
          d: btoa(decompressedText),
          z: undefined, // Remove compression flag since it's now decompressed
        };
      } else {
        broadcastDebugInfoToClients('Failed to decompress message content');
        console.warn('Failed to decompress message content');
      }
    }

    // Get conversation ID from the chunk (not from parsedFullDataJson)
    const conversationId = chunkedPayload.cid;

    // Calculate size bytes for the full message
    const sizeBytes = chat.calculateMessageSizeBytes(parsedFullDataJson);

    const reconstructedChatMessagePayload: chat.ChatMessagePayload = {
      id: chunkedPayload.mid,
      conversationId,
      from: chunkedPayload.fr,
      timestamp: Date.now(),
      sizeBytes,
      fullMessage: parsedFullDataJson,
    };

    const chatMessagePayload = chat.isChatMessagePayload(reconstructedChatMessagePayload)
      ? reconstructedChatMessagePayload
      : null;
    if (!chatMessagePayload) {
      broadcastDebugInfoToClients(
        `Reconstructed chat message payload is invalid; payload: ${JSON.stringify(reconstructedChatMessagePayload)}`,
      );
      console.warn('Reconstructed chat message payload is invalid', reconstructedChatMessagePayload);
      return;
    }

    // Save message with quota check if it's a MESSAGE type
    if (chatMessagePayload.fullMessage.t === chat.ChatMessagePayloadType.MESSAGE && conversationId) {
      const result = await chatStorageManager.saveMessageWithQuotaCheck(chatMessagePayload);
      if (!result.success) {
        broadcastDebugInfoToClients(`Storage quota exceeded for conversation ${conversationId}`);
        console.warn('Storage quota exceeded, message not saved');
        // Still broadcast the message so user sees it but it won't persist
      }
    } else {
      await chatStorageManager.chatMessagesStorage.put(chatMessagePayload);
    }

    for (const chunk of relevantChunks) {
      await chatStorageManager.receivedChunkedMessagesStorage.delete(chunk._dbKey);
    }

    // Get local push credentials from settings storage
    const settingsStorageManager = await SettingsStorageManager.createInstance();
    const localPushCredentials = await settingsStorageManager.localPushCredentialsStorage.get();

    if (!localPushCredentials) {
      broadcastDebugInfoToClients('No local push credentials stored; cannot respond to chat message');
      console.warn('No local push credentials stored; cannot respond to chat message', chatMessagePayload);
      return;
    }

    switch (chatMessagePayload.fullMessage.t) {
      case chat.ChatMessagePayloadType.GUEST_TO_HOST_HANDSHAKE:
        const remotePushSendOption = chatMessagePayload.fullMessage.o;
        await chatStorageManager.remotePushSendStorage.put(remotePushSendOption);

        // Update or create conversation for the host
        if (remotePushSendOption.conversationId) {
          const existingConversation = await chatStorageManager.conversationsStorage.get(
            remotePushSendOption.conversationId,
          );
          if (existingConversation) {
            await chatStorageManager.conversationsStorage.updateStatus(
              remotePushSendOption.conversationId,
              chat.ConversationStatus.ACTIVE,
            );
            await chatStorageManager.conversationsStorage.resetFailedAttempts(remotePushSendOption.conversationId);
          }
        }

        const payload: chat.HandshakeAck = {
          t: chat.ChatMessagePayloadType.HANDSHAKE_ACK,
        };
        const payloadString = JSON.stringify(payload);

        await chunkAndSendChatMessage(
          payloadString,
          remotePushSendOption.conversationId,
          localPushCredentials,
          remotePushSendOption,
        );

        // Get conversation name for notification
        const conversation = remotePushSendOption.conversationId
          ? await chatStorageManager.conversationsStorage.get(remotePushSendOption.conversationId)
          : null;
        const joinNotifTitle = conversation ? `${conversation.name} joined` : 'New user has joined the chat';

        if ((await hasVisibleClient()) === false && remotePushSendOption.conversationId) {
          self.registration.showNotification(joinNotifTitle, {
            tag: `chat-join-${remotePushSendOption.id}`,
            data: { url: `/chat/${remotePushSendOption.conversationId}` },
          });
        }
        break;
      case chat.ChatMessagePayloadType.HANDSHAKE_ACK:
        // Update conversation status to ACTIVE for guest
        if (conversationId) {
          await chatStorageManager.conversationsStorage.updateStatus(conversationId, chat.ConversationStatus.ACTIVE);
          await chatStorageManager.conversationsStorage.resetFailedAttempts(conversationId);
        }

        if ((await hasVisibleClient()) === false && conversationId) {
          self.registration.showNotification('Join request accepted', {
            tag: `chat-ack-${chatMessagePayload.from}`,
            data: { url: `/chat/${conversationId}` },
          });
        }
        break;
      case chat.ChatMessagePayloadType.MESSAGE:
        // Update last activity and increment unread count
        if (conversationId) {
          const msgContent = chatMessagePayload.fullMessage;
          // Content is stored as base64, decode for preview
          const decodedText =
            msgContent.c === chat.ChatMessageContentType.TEXT_PLAIN
              ? (() => {
                  try {
                    return atob(msgContent.d);
                  } catch {
                    return msgContent.d;
                  }
                })()
              : '';
          const preview =
            msgContent.c === chat.ChatMessageContentType.TEXT_PLAIN
              ? decodedText.substring(0, 50)
              : msgContent.c.startsWith('image/')
                ? '📷 Image'
                : 'New message';
          await chatStorageManager.conversationsStorage.updateLastActivity(conversationId, Date.now(), preview);
          await chatStorageManager.conversationsStorage.incrementUnreadCount(conversationId);
        }

        // Get conversation for notification
        const msgConversation = conversationId
          ? await chatStorageManager.conversationsStorage.get(conversationId)
          : null;
        const msgNotifTitle = msgConversation ? msgConversation.name : 'New message';
        const msgContent = chatMessagePayload.fullMessage;
        // Content is stored as base64, decode for notification body
        const decodedNotifText =
          msgContent.c === chat.ChatMessageContentType.TEXT_PLAIN
            ? (() => {
                try {
                  return atob(msgContent.d);
                } catch {
                  return msgContent.d;
                }
              })()
            : '';
        const notifBody =
          msgContent.c === chat.ChatMessageContentType.TEXT_PLAIN
            ? decodedNotifText.substring(0, 100)
            : msgContent.c.startsWith('image/')
              ? '📷 Image'
              : 'New message';

        if ((await hasVisibleClient()) === false) {
          // Use unique tag per message for ungrouped notifications
          self.registration.showNotification(msgNotifTitle, {
            body: notifBody,
            tag: `chat-msg-${chatMessagePayload.id}`,
            data: {
              url: msgConversation
                ? msgConversation.role === chat.ConversationRole.HOST
                  ? `/chat/${msgConversation.id}`
                  : `/chat/${msgConversation.id}`
                : `/chat`,
            },
          });
        }
        break;
      case chat.ChatMessagePayloadType.CREDENTIALS_UPDATE:
        // Remote peer has updated their credentials - update our stored RemotePushSendOptions
        const updatedCredentials = chatMessagePayload.fullMessage;
        const existingRemote = await chatStorageManager.remotePushSendStorage.get(updatedCredentials.o.id);
        if (existingRemote) {
          await chatStorageManager.remotePushSendStorage.put({
            ...updatedCredentials.o,
            conversationId: existingRemote.conversationId,
            id: existingRemote.id,
          });
          broadcastDebugInfoToClients(`Updated remote credentials for ${updatedCredentials.o.id}`);
        } else {
          // New remote with same id, try to find by conversation
          if (conversationId) {
            const remoteByConv = await chatStorageManager.remotePushSendStorage.getByConversationId(conversationId);
            if (remoteByConv) {
              await chatStorageManager.remotePushSendStorage.delete(remoteByConv.id);
              await chatStorageManager.remotePushSendStorage.put({
                ...updatedCredentials.o,
                conversationId,
              });
              broadcastDebugInfoToClients(`Replaced remote credentials for conversation ${conversationId}`);
            }
          }
        }
        break;
    }

    await broadcastToClients(chatMessagePayload);
  }
};

async function chunkAndSendShareMessage(
  payloadString: string,
  localPushCredentials: settings.LocalPushCredentials,
  remotePushSendOption: share.ShareRemotePushSendOptions,
): Promise<ChunkSendResult> {
  if (!remotePushSendOption.pushSubscription.endpoint) {
    throw new Error('No push subscription endpoint available in remote push send options');
  }
  const endpoint = remotePushSendOption.pushSubscription.endpoint;

  const messageId = getRandomInt(1, 0xffffffff);
  const total = Math.ceil(payloadString.length / 2048);
  const chunks: share.ChunkedShareMessagePayload[] = [];
  for (let i = 0; i < total; i++) {
    const chunkData = payloadString.slice(i * 2048, (i + 1) * 2048);
    chunks.push({
      t: 's',
      fr: localPushCredentials.id,
      id: getRandomInt(1, 0xffffffff),
      mid: messageId,
      i,
      all: total,
      d: chunkData,
    });
  }

  const { concurrency, jitterMs } = { concurrency: 3, jitterMs: 500 };
  const shareStorageManager = await ShareStorageManager.createInstance();

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);

    try {
      await Promise.all(
        batch.map(async (chunk) => {
          if (jitterMs > 0) {
            await sleep(Math.random() * jitterMs);
          }
          const encrypted: EncryptWebPushResult = await encryptWebPush({
            subscription: {
              endpoint,
              keys: {
                auth: remotePushSendOption.messageEncryption.auth,
                p256dh: remotePushSendOption.messageEncryption.p256dh,
              },
            },
            vapidKeyPair: remotePushSendOption.vapidKeys,
            payload: JSON.stringify(chunk),
            contact: remotePushSendOption.webPushContacts,
            urgency: 'high',
          });
          return sendPushMessageWithRetry(encrypted, 3);
        }),
      );
    } catch (err) {
      // Batch failed - increment failure count for this remote
      const failedAttempts = await shareStorageManager.remotePushSendStorage.incrementFailedAttempts(
        remotePushSendOption.id,
      );
      broadcastDebugInfoToClients(
        `Share push failed for remote ${remotePushSendOption.id}, attempt ${failedAttempts}/${MAX_REMOTE_FAILURES}`,
      );

      if (failedAttempts >= MAX_REMOTE_FAILURES) {
        // Delete the remote
        await shareStorageManager.remotePushSendStorage.delete(remotePushSendOption.id);

        // Broadcast to clients
        await broadcastRemoteForgotten(remotePushSendOption.id, 'share');

        broadcastDebugInfoToClients(
          `Share remote ${remotePushSendOption.id} forgotten after ${MAX_REMOTE_FAILURES} failures`,
        );

        return { success: false, remoteForgotten: true };
      }

      // Re-throw to let caller know sending failed
      throw err;
    }
  }

  // All chunks sent successfully - reset failure count
  await shareStorageManager.remotePushSendStorage.resetFailedAttempts(remotePushSendOption.id);

  return { success: true, remoteForgotten: false };
}

const handleShareChunkedMessage = async (
  chunkedPayload: share.ChunkedShareMessagePayload,
  shareStorageManager: ShareStorageManager,
) => {
  await shareStorageManager.receivedChunkedMessagesStorage.put(chunkedPayload);

  const allChunks = await shareStorageManager.receivedChunkedMessagesStorage.getAll();
  const relevantChunks = allChunks.filter(
    (chunk) => chunk.fr === chunkedPayload.fr && chunk.mid === chunkedPayload.mid,
  );

  broadcastDebugInfoToClients({
    relevantChunksLength: relevantChunks.length,
    totalChunks: chunkedPayload.all,
    relevantChunks,
    allChunks,
  });

  if (relevantChunks.length === chunkedPayload.all) {
    relevantChunks.sort((a, b) => a.i - b.i);
    const fullDataBase64 = relevantChunks.map((chunk) => chunk.d).join('');
    const parsedFullDataJson: share.ShareMessagePayloadEnum = JSON.parse(fullDataBase64);
    const reconstructedShareMessagePayload: share.ShareMessagePayload = {
      id: chunkedPayload.mid,
      fullMessage: parsedFullDataJson,
    };

    const shareMessagePayload = share.isShareMessagePayload(reconstructedShareMessagePayload)
      ? reconstructedShareMessagePayload
      : null;
    if (!shareMessagePayload) {
      broadcastDebugInfoToClients(
        `Reconstructed share message payload is invalid; payload: ${JSON.stringify(reconstructedShareMessagePayload)}`,
      );
      console.warn('Reconstructed share message payload is invalid', reconstructedShareMessagePayload);
      return;
    }

    for (const chunk of relevantChunks) {
      await shareStorageManager.receivedChunkedMessagesStorage.delete(chunk.i);
    }

    // Get local push credentials from settings storage
    const settingsStorageManager = await SettingsStorageManager.createInstance();
    const localPushCredentials = await settingsStorageManager.localPushCredentialsStorage.get();

    if (!localPushCredentials) {
      broadcastDebugInfoToClients('No local push credentials stored; cannot respond to share message');
      console.warn('No local push credentials stored; cannot respond to share message', shareMessagePayload);
      return;
    }

    switch (shareMessagePayload.fullMessage.t) {
      case share.ShareMessagePayloadType.GUEST_TO_HOST_HANDSHAKE:
        const remotePushSendOption = shareMessagePayload.fullMessage.o;
        await shareStorageManager.remotePushSendStorage.put(remotePushSendOption);

        await chunkAndSendShareMessage(
          JSON.stringify({
            t: share.ShareMessagePayloadType.HANDSHAKE_ACK,
          } satisfies share.HandshakeAck),
          localPushCredentials,
          remotePushSendOption,
        );
        if ((await hasVisibleClient()) === false) {
          self.registration.showNotification('New share request received', { data: { url: `/share` } });
        }

        const latestAsset = await shareStorageManager.latestAssetStorage.get(1);
        if (latestAsset) {
          await chunkAndSendShareMessage(
            JSON.stringify({
              t: share.ShareMessagePayloadType.ASSET_TRANSFER,
              c: latestAsset.contentType,
              d: latestAsset.contentBase64,
            } satisfies share.AssetTransfer),
            localPushCredentials,
            remotePushSendOption,
          );
        }
        break;
      case share.ShareMessagePayloadType.HANDSHAKE_ACK:
        if ((await hasVisibleClient()) === false) {
          self.registration.showNotification('Share request accepted', { data: { url: `/receive` } });
        }
        break;
      case share.ShareMessagePayloadType.ASSET_TRANSFER:
        if ((await hasVisibleClient()) === false) {
          self.registration.showNotification('New asset received', { data: { url: `/receive` } });
        }
        break;
      case share.ShareMessagePayloadType.CREDENTIALS_UPDATE:
        // Remote peer has updated their credentials - update our stored RemotePushSendOptions
        const shareUpdatedCredentials = shareMessagePayload.fullMessage;
        const existingShareRemote = await shareStorageManager.remotePushSendStorage.get(shareUpdatedCredentials.p);
        if (existingShareRemote) {
          await shareStorageManager.remotePushSendStorage.put({
            ...shareUpdatedCredentials.o,
            id: existingShareRemote.id,
          });
          broadcastDebugInfoToClients(`Updated share remote credentials for ${shareUpdatedCredentials.o.id}`);
        } else {
          await shareStorageManager.remotePushSendStorage.put(shareUpdatedCredentials.o);
          broadcastDebugInfoToClients(`Added new share remote credentials for ${shareUpdatedCredentials.o.id}`);
        }
        break;
    }

    await broadcastToClients(shareMessagePayload);
  }
};

self.addEventListener('push', (event) => {
  broadcastDebugInfoToClients({ type: 'DEBUG', timestamp: Date.now(), eventData: event.data?.json() });
  const chunkedMessage = event.data ? parsePushMessageData(event.data) : null;

  if (!chunkedMessage) {
    console.warn('Received push event with invalid or missing data');
    return;
  }

  event.waitUntil(
    (async () => {
      const chatStorageManager = await ChatStorageManager.createInstance();
      const shareStorageManager = await ShareStorageManager.createInstance();

      if ((navigator as any).locks) {
        const lockId = `chunk-${chunkedMessage.id}`;
        await (navigator as any).locks.request(lockId, async () => {
          if (chat.isChunkedChatMessagePayload(chunkedMessage)) {
            await handleChatChunkedMessage(chunkedMessage, chatStorageManager);
          } else if (share.isChunkedShareMessagePayload(chunkedMessage)) {
            await handleShareChunkedMessage(chunkedMessage, shareStorageManager);
          }
        });
      } else {
        if (chat.isChunkedChatMessagePayload(chunkedMessage)) {
          await handleChatChunkedMessage(chunkedMessage, chatStorageManager);
        } else if (share.isChunkedShareMessagePayload(chunkedMessage)) {
          await handleShareChunkedMessage(chunkedMessage, shareStorageManager);
        }
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'CHAT_SEND') {
    event.waitUntil(
      (async () => {
        await chunkAndSendChatMessage(
          msg.payloadString,
          msg.conversationId,
          msg.localPushCredentials,
          msg.remotePushSendOption,
        );
      })(),
    );
  } else if (msg.type === 'SHARE_SEND') {
    event.waitUntil(
      (async () => {
        await chunkAndSendShareMessage(msg.payloadString, msg.localPushCredentials, msg.remotePushSendOption);
      })(),
    );
  } else if (msg.type === 'SETTINGS_UPDATED') {
    // Update cached settings when they change
    if (settings.isAppSettings(msg.payload)) {
      cachedSettings = msg.payload;
    }
  } else if (msg.type === 'PROPAGATE_CREDENTIALS') {
    // Propagate new credentials to all connected remotes
    event.waitUntil(
      (async () => {
        const localPushCredentials = msg.localPushCredentials;
        const previousLocalPushCredentialId = msg.previousLocalPushCredentialId;
        if (!localPushCredentials || !previousLocalPushCredentialId) {
          broadcastDebugInfoToClients(
            `PROPAGATE_CREDENTIALS: No credentials provided for propagation; ${localPushCredentials}, ${previousLocalPushCredentialId}`,
          );
          return;
        }

        const chatStorageManager = await ChatStorageManager.createInstance();
        const shareStorageManager = await ShareStorageManager.createInstance();

        // Get all connected remotes
        const chatRemotes = await chatStorageManager.remotePushSendStorage.getAll();
        const shareRemotes = await shareStorageManager.remotePushSendStorage.getAll();

        const results = { chat: { success: 0, failed: 0 }, share: { success: 0, failed: 0 } };

        // Propagate to chat remotes
        for (const remote of chatRemotes) {
          try {
            const credentialsUpdate: chat.CredentialsUpdate = {
              t: chat.ChatMessagePayloadType.CREDENTIALS_UPDATE,
              o: chat.toChatRemotePushSendOptions(localPushCredentials, remote.conversationId),
            };
            await chunkAndSendChatMessage(
              JSON.stringify(credentialsUpdate),
              remote.conversationId,
              localPushCredentials,
              { ...remote, type: 'remote' },
            );
            results.chat.success++;
          } catch (err) {
            console.error(`Failed to propagate credentials to chat remote ${remote.id}:`, err);
            results.chat.failed++;
          }
        }

        // Propagate to share remotes
        for (const remote of shareRemotes) {
          try {
            const credentialsUpdate: share.CredentialsUpdate = {
              t: share.ShareMessagePayloadType.CREDENTIALS_UPDATE,
              o: share.toShareRemotePushSendOptions(localPushCredentials),
              p: previousLocalPushCredentialId,
            };
            await chunkAndSendShareMessage(JSON.stringify(credentialsUpdate), localPushCredentials, {
              ...remote,
              type: 'remote',
            });
            results.share.success++;
          } catch (err) {
            console.error(`Failed to propagate credentials to share remote ${remote.id}:`, err);
            results.share.failed++;
          }
        }

        // Notify clients of propagation results
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({
            type: 'CREDENTIALS_PROPAGATED',
            results,
          });
        }

        broadcastDebugInfoToClients(
          `Credentials propagated: Chat ${results.chat.success}/${chatRemotes.length}, Share ${results.share.success}/${shareRemotes.length}`,
        );
      })(),
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length) {
        for (const client of clients) {
          if (client.url.includes(event.notification.data.url || '/')) {
            return client.focus();
          }
        }
      } else {
        self.clients.openWindow(event.notification.data.url || '/');
      }
    }),
  );
});

export {};
