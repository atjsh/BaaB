/// <reference lib="webworker" />
import { toBase64Url } from 'web-push-browser';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

import { chat, share } from '@baab/shared';

import { ChatStorageManager } from './lib/storage/chat.db';
import { ShareStorageManager } from './lib/storage/share.db';
import { getRandomInt, sleep } from './lib/typescript';
import { encryptWebPush, type EncryptWebPushResult } from './lib/web-push-encryption';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

const PROXY_URL = import.meta.env.VITE_PROXY_URL;

async function broadcastToClients(data: chat.ChatMessagePayloadEnum | share.ShareMessagePayloadEnum) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  console.log('[SW] Broadcasting to', clients.length, 'clients');
  for (const client of clients) {
    client.postMessage({
      type: 'PUSH_RECEIVED',
      payload: data,
    });
  }
}

async function broadcastDebugInfoToClients(info: any) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  console.log('[SW] Broadcasting debug info to', clients.length, 'clients');
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

async function sendPushMessage(encrypted: EncryptWebPushResult) {
  const res = await fetch(PROXY_URL, {
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

  console.log({ body: await res.json() });

  return res;
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

const handleChatChunkedMessage = async (
  chunkedPayload: chat.ChunkedChatMessagePayload,
  chatStorageManager: ChatStorageManager,
) => {
  await chatStorageManager.receivedChunkedMessagesStorage.put(
    await chatStorageManager.receivedChunkedMessagesStorage.generateId(),
    chunkedPayload,
  );

  const allChunks = await chatStorageManager.receivedChunkedMessagesStorage.getAll();
  const relevantChunks = allChunks.filter(
    (chunk) => chunk.fr === chunkedPayload.fr && chunk.mid === chunkedPayload.mid,
  );

  broadcastDebugInfoToClients({ relevantChunksLength: relevantChunks.length, totalChunks: chunkedPayload.all });

  if (relevantChunks.length === chunkedPayload.all) {
    relevantChunks.sort((a, b) => a.i - b.i);
    const fullDataBase64 = relevantChunks.map((chunk) => chunk.d).join('');
    const parsedFullDataJson: chat.ChatMessagePayloadEnum = JSON.parse(fullDataBase64);
    const reconstructedChatMessagePayload: chat.ChatMessagePayload = {
      id: chunkedPayload.mid,
      fullMessage: parsedFullDataJson,
      from: chunkedPayload.fr,
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

    await chatStorageManager.chatMessagesStorage.put(chatMessagePayload.id, chatMessagePayload);

    for (const chunk of relevantChunks) {
      await chatStorageManager.receivedChunkedMessagesStorage.delete(chunk.i);
    }

    const localPushSendOptions = await chatStorageManager.localPushSendStorage.getAll();

    if (localPushSendOptions.length === 0) {
      broadcastDebugInfoToClients('No local push send options stored; cannot respond to chat message');
      console.warn('No local push send options stored; cannot respond to chat message', chatMessagePayload);
      return;
    }

    switch (chatMessagePayload.fullMessage.t) {
      case chat.ChatMessagePayloadType.GUEST_TO_HOST_HANDSHAKE:
        const remotePushSendOption = chatMessagePayload.fullMessage.o;
        await chatStorageManager.remotePushSendStorage.put(remotePushSendOption.id, remotePushSendOption);

        const payload: chat.HandshakeAck = {
          t: chat.ChatMessagePayloadType.HANDSHAKE_ACK,
        };
        const payloadString = JSON.stringify(payload);

        await chunkAndSendChatMessage(
          payloadString,
          {
            ...localPushSendOptions[0],
            type: 'local',
          },
          remotePushSendOption,
        );

        if ((await hasVisibleClient()) === false) {
          self.registration.showNotification('New user has joined the chat', {
            data: { url: `/chat?peer=${remotePushSendOption.id}` },
          });
        }
        break;
      case chat.ChatMessagePayloadType.HANDSHAKE_ACK:
        if ((await hasVisibleClient()) === false) {
          self.registration.showNotification('Join request accepted', {
            data: { url: `/chat?peer=${chatMessagePayload.from}` },
          });
        }
        break;
      case chat.ChatMessagePayloadType.MESSAGE:
        if ((await hasVisibleClient()) === false) {
          self.registration.showNotification('New message', { data: { url: `/chat?peer=${chatMessagePayload.from}` } });
        }
        break;
    }

    await broadcastToClients(chatMessagePayload.fullMessage);
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

    await broadcastToClients(shareMessagePayload.fullMessage);
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
