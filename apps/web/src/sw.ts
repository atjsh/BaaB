/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { deserializeVapidKeys, toBase64Url } from 'web-push-browser';
import { dbDelete, dbGet, dbGetAll, dbPut } from './lib/db';
import { encryptWebPush } from './lib/web-push-encryption';
import type { MessagePayload, RemoteConfig } from '@baab/shared';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'http://localhost:3000/push-proxy';
const MAX_CHUNK_SIZE = 2048;
const DEFAULT_CHUNK_CONCURRENCY = 2;
const DEFAULT_CHUNK_JITTER_MS = 80;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to get VAPID keys from storage
// async function getVapidKeys() {
//   return await dbGet('config', 'vapid-keys');
// }

async function saveClient(clientConfig: RemoteConfig) {
  // Use endpoint as key
  if (clientConfig.subscription.endpoint) {
    await dbPut('clients', clientConfig.subscription.endpoint, clientConfig);
  }
}

async function getLatestAsset() {
  return await dbGet('assets', 'latest-asset');
}

async function getLatestDirectoryMeta() {
  const [manifest, dirname, bytes, fileCount] = await Promise.all([
    dbGet('assets', 'latest-asset-manifest'),
    dbGet('assets', 'latest-asset-dirname'),
    dbGet('assets', 'latest-asset-bytes'),
    dbGet('assets', 'latest-asset-filecount'),
  ]);
  return {
    manifest,
    directoryName: dirname,
    totalBytes: typeof bytes === 'number' ? bytes : undefined,
    fileCount: typeof fileCount === 'number' ? fileCount : undefined,
  };
}

async function getChunkConfig() {
  const [rawConcurrency, rawJitter] = await Promise.all([
    dbGet('config', 'chunk-concurrency'),
    dbGet('config', 'chunk-jitter-ms'),
  ]);

  const concurrency =
    typeof rawConcurrency === 'number' && rawConcurrency > 0
      ? Math.min(5, Math.max(1, Math.round(rawConcurrency)))
      : DEFAULT_CHUNK_CONCURRENCY;

  const jitterMs =
    typeof rawJitter === 'number' && rawJitter >= 0
      ? Math.min(500, Math.max(0, Math.round(rawJitter)))
      : DEFAULT_CHUNK_JITTER_MS;

  // Persist defaults so subsequent reads are consistent even if UI has not set them explicitly.
  if (rawConcurrency === undefined || rawConcurrency === null) {
    await dbPut('config', 'chunk-concurrency', concurrency);
  }
  if (rawJitter === undefined || rawJitter === null) {
    await dbPut('config', 'chunk-jitter-ms', jitterMs);
  }

  return { concurrency, jitterMs };
}

async function sendPushMessage(clientConfig: RemoteConfig, payload: MessagePayload) {
  const clientKeys = clientConfig.vapidKeys;
  if (!clientKeys) {
    console.error('[SW] No client VAPID keys found');
    return;
  }

  const vapidKeyPair = await deserializeVapidKeys(clientKeys);

  const sub = clientConfig.subscription;
  if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    console.error('[SW] Invalid subscription data');
    return;
  }

  const encrypted = await encryptWebPush({
    subscription: {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    },
    vapidKeyPair,
    payload: JSON.stringify(payload),
    proxyUrl: PROXY_URL,
  });

  // Send to proxy
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
}

async function sendPushMessageWithRetry(clientConfig: RemoteConfig, payload: MessagePayload, maxAttempts = 3) {
  let attempt = 0;
  let lastErr: any;
  while (attempt < maxAttempts) {
    try {
      await sendPushMessage(clientConfig, payload);
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

async function sendAckToClient(
  clientConfig: RemoteConfig,
  asset: string,
  assetMode: 'text' | 'image' | 'directory',
  meta?: { manifest?: any; directoryName?: string; totalBytes?: number; fileCount?: number },
) {
  try {
    const payload: MessagePayload = {
      type: 'ACK',
      asset: asset,
      assetMode: assetMode,
      manifest: meta?.manifest,
      directoryName: meta?.directoryName,
      totalBytes: meta?.totalBytes,
      fileCount: meta?.fileCount,
    };

    const payloadStr = JSON.stringify(payload);

    if (payloadStr.length <= MAX_CHUNK_SIZE) {
      await sendPushMessageWithRetry(clientConfig, payload);
    } else {
      const id = crypto.randomUUID();
      const total = Math.ceil(payloadStr.length / MAX_CHUNK_SIZE);
      const { concurrency, jitterMs } = await getChunkConfig();
      console.log('[SW] ACK chunking with concurrency', concurrency, 'jitter', jitterMs, 'ms');
      const chunkPayloads: MessagePayload[] = Array.from({ length: total }).map((_, i) => ({
        type: 'CHUNK',
        id,
        index: i,
        total,
        data: payloadStr.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE),
      }));

      for (let i = 0; i < chunkPayloads.length; i += concurrency) {
        const batch = chunkPayloads.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (chunk) => {
            if (jitterMs > 0) {
              await sleep(Math.random() * jitterMs);
            }
            return sendPushMessageWithRetry(clientConfig, chunk);
          }),
        );
      }
    }

    console.log('[SW] ACK sent to new client via background');
  } catch (e) {
    console.error('[SW] Error sending ACK:', e);
  }
}

async function broadcastToClients(data: any) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  console.log('[SW] Broadcasting to', clients.length, 'clients');
  for (const client of clients) {
    client.postMessage({
      type: 'PUSH_RECEIVED',
      payload: data,
    });
  }
}

async function processMessage(data: MessagePayload) {
  let title = 'Baab Update';
  let body = typeof data === 'string' ? data : 'New data received';
  let shouldNotifyByType = true;

  if (typeof data !== 'string' && typeof data === 'object') {
    switch (data.type) {
      case 'ASSET':
        title = 'Baab - Asset received';
        if (data.assetMode === 'image') {
          body = 'Image ready to view in Baab.';
        } else if (data.assetMode === 'directory') {
          body = 'Folder ready to download in Baab.';
        } else {
          body = 'Message received in Baab.';
        }
        break;
      case 'ACK':
        title = 'Baab - Delivery confirmed';
        body = 'Receiver acknowledged the asset.';
        break;
      case 'HANDSHAKE':
        title = 'Baab - Client connected';
        body = 'A receiver connected to your session.';
        break;
      case 'CHUNK':
        title = 'Baab - Receiving data';
        body = `Chunk ${data.index !== undefined ? data.index + 1 : '?'} of ${data.total ?? '?'}`;
        shouldNotifyByType = false; // avoid notifying for every chunk
        break;
      default:
        title = 'Baab Update';
        body = 'New data received';
    }
  }

  const options: NotificationOptions = {
    body,
    icon: '/vite.svg',
    badge: '/vite.svg',
    data: data,
  };

  // Handle Handshake in Background
  const backgroundWork = async () => {
    if (data.type === 'HANDSHAKE' && data.senderConfig) {
      console.log('[SW] Handling Handshake in background');
      await saveClient(data.senderConfig);
      const asset = await getLatestAsset();
      const assetMode = await dbGet('assets', 'latest-asset-mode');
      console.log({ assetMode });

      if (asset) {
        const meta = assetMode === 'directory' ? await getLatestDirectoryMeta() : undefined;
        await sendAckToClient(data.senderConfig, asset, assetMode as any, meta);
      }
    }
  };

  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const hasVisibleClient = windowClients.some((c) => c.visibilityState === 'visible');
  const shouldNotify = !hasVisibleClient && shouldNotifyByType;

  await Promise.all([
    shouldNotify ? self.registration.showNotification(title, options) : Promise.resolve(),
    broadcastToClients(data),
    backgroundWork(),
  ]);
}

self.addEventListener('push', (event) => {
  console.log('[SW] Push Received');
  let data: any = {};
  if (event.data) {
    try {
      data = event.data.json();
      console.log('[SW] Parsed JSON:', data);
    } catch (e) {
      console.log('[SW] Push data not JSON', event.data.text());
      data = { body: event.data.text() };
    }
  }

  event.waitUntil(
    (async () => {
      if (data.type === 'CHUNK') {
        const chunkMeta = {
          type: 'CHUNK',
          id: data.id,
          index: data.index,
          total: data.total,
        } as MessagePayload;

        await broadcastToClients(chunkMeta);

        const handleChunk = async () => {
          await dbPut('chunks', `${data.id}_${data.index}`, data);
          const allChunks = await dbGetAll('chunks');
          const messageChunks = allChunks.filter((c) => c.id === data.id);

          if (messageChunks.length === data.total) {
            console.log('[SW] Reassembling chunks for', data.id);
            messageChunks.sort((a, b) => a.index - b.index);
            const fullPayloadStr = messageChunks.map((c) => c.data).join('');
            let fullData;
            try {
              fullData = JSON.parse(fullPayloadStr);
            } catch (e) {
              console.error('[SW] Failed to parse reassembled payload', e);
              self.registration.showNotification('Baab Error', { body: 'Failed to reassemble message' });
              return;
            }

            // Cleanup
            for (const c of messageChunks) {
              await dbDelete('chunks', `${c.id}_${c.index}`);
            }

            await processMessage(fullData);
          } else {
            console.log(`[SW] Received chunk ${data.index + 1}/${data.total} for ${data.id}`);
          }
        };

        if ((navigator as any).locks) {
          await (navigator as any).locks.request(`chunk-${data.id}`, handleChunk);
        } else {
          await handleChunk();
        }
      } else {
        await processMessage(data);
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length) {
        clients[0].focus();
      } else {
        self.clients.openWindow('/');
      }
    }),
  );
});

// Make sure to export something or treat as module
export {};
