/// <reference lib="webworker" />
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

  try {
    const settingsStorage = await SettingsStorageManager.createInstance();
    cachedSettings = await settingsStorage.settingsStorage.getOrDefault();
    return cachedSettings;
  } catch (error) {
    console.warn('Failed to load settings, using defaults:', error);
    return {
      id: 1,
      ...settings.DEFAULT_SETTINGS,
    };
  }
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

async function chunkAndSendChatMessage(
  payloadString: string,
  localPushSendOption: chat.ChatLocalPushSendOptions,
  remotePushSendOption: chat.ChatRemotePushSendOptions,
): Promise<void> {
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
      cid: localPushSendOption.conversationId,
      fr: localPushSendOption.id,
      id: getRandomInt(1, 0xffffffff),
      mid: messageId,
      i,
      all: total,
      d: chunkData,
    });
  }

  const { concurrency, jitterMs } = { concurrency: 3, jitterMs: 500 };

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
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
          contact: self.location.origin,
          urgency: 'high',
        });
        return sendPushMessageWithRetry(encrypted, 3);
      }),
    );
  }
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
    const parsedFullDataJson: chat.ChatMessagePayloadEnum = JSON.parse(fullDataBase64);

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

    const localPushSendOptions = await chatStorageManager.localPushSendStorage.getAll();

    if (localPushSendOptions.length === 0) {
      broadcastDebugInfoToClients('No local push send options stored; cannot respond to chat message');
      console.warn('No local push send options stored; cannot respond to chat message', chatMessagePayload);
      return;
    }

    // Find matching local push send option for this conversation
    const localPushSendOption = conversationId
      ? localPushSendOptions.find((o) => o.conversationId === conversationId) || localPushSendOptions[0]
      : localPushSendOptions[0];

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
          {
            ...localPushSendOption,
            type: 'local',
          },
          remotePushSendOption,
        );

        // Get conversation name for notification
        const conversation = remotePushSendOption.conversationId
          ? await chatStorageManager.conversationsStorage.get(remotePushSendOption.conversationId)
          : null;
        const joinNotifTitle = conversation ? `${conversation.name} joined` : 'New user has joined the chat';

        if ((await hasVisibleClient()) === false) {
          self.registration.showNotification(joinNotifTitle, {
            tag: `chat-join-${remotePushSendOption.id}`,
            data: { url: `/chat/host?conversation=${remotePushSendOption.conversationId || ''}` },
          });
        }
        break;
      case chat.ChatMessagePayloadType.HANDSHAKE_ACK:
        // Update conversation status to ACTIVE for guest
        if (conversationId) {
          await chatStorageManager.conversationsStorage.updateStatus(conversationId, chat.ConversationStatus.ACTIVE);
          await chatStorageManager.conversationsStorage.resetFailedAttempts(conversationId);
        }

        if ((await hasVisibleClient()) === false) {
          self.registration.showNotification('Join request accepted', {
            tag: `chat-ack-${chatMessagePayload.from}`,
            data: { url: `/chat/join?conversation=${conversationId || ''}` },
          });
        }
        break;
      case chat.ChatMessagePayloadType.MESSAGE:
        // Update last activity and increment unread count
        if (conversationId) {
          const msgContent = chatMessagePayload.fullMessage as chat.ChatMessage;
          const preview =
            msgContent.c === 'text/plain; charset=utf-8'
              ? msgContent.d.substring(0, 50)
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
        const msgContent = chatMessagePayload.fullMessage as chat.ChatMessage;
        const notifBody =
          msgContent.c === 'text/plain; charset=utf-8'
            ? msgContent.d.substring(0, 100)
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
                  ? `/chat/host?conversation=${conversationId}`
                  : `/chat/join?conversation=${conversationId}`
                : `/chat`,
            },
          });
        }
        break;
    }

    await broadcastToClients(chatMessagePayload);
  }
};

async function chunkAndSendShareMessage(
  payloadString: string,
  localPushSendOption: share.ShareLocalPushSendOptions,
  remotePushSendOption: share.ShareRemotePushSendOptions,
): Promise<void> {
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
      fr: localPushSendOption.id,
      id: getRandomInt(1, 0xffffffff),
      mid: messageId,
      i,
      all: total,
      d: chunkData,
    });
  }

  const { concurrency, jitterMs } = { concurrency: 3, jitterMs: 500 };

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);

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
          contact: self.location.origin,
          urgency: 'high',
        });
        return sendPushMessageWithRetry(encrypted, 3);
      }),
    );
  }
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

    const localPushSendOptions = await shareStorageManager.localPushSendStorage.getAll();

    if (localPushSendOptions.length === 0) {
      broadcastDebugInfoToClients('No local push send options stored; cannot respond to share message');
      console.warn('No local push send options stored; cannot respond to share message', shareMessagePayload);
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
          { ...localPushSendOptions[0], type: 'local' },
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
            { ...localPushSendOptions[0], type: 'local' },
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
        await chunkAndSendChatMessage(msg.payloadString, msg.localPushSendOption, msg.remotePushSendOption);
      })(),
    );
  } else if (msg.type === 'SHARE_SEND') {
    event.waitUntil(
      (async () => {
        await chunkAndSendShareMessage(msg.payloadString, msg.localPushSendOption, msg.remotePushSendOption);
      })(),
    );
  } else if (msg.type === 'SETTINGS_UPDATED') {
    // Update cached settings when they change
    if (settings.isAppSettings(msg.payload)) {
      cachedSettings = msg.payload;
    }
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
