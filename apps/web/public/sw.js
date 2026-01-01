importScripts('sw-lib.js');

const params = new URLSearchParams(self.location.search);
const PROXY_URL = params.get('proxyUrl') || 'http://localhost:3000/push-proxy';
const MAX_CHUNK_SIZE = 2048;

// Helper to get VAPID keys from storage
async function getVapidKeys() {
  return await dbGet('config', 'vapid-keys');
}

async function saveClient(clientConfig) {
  // Use endpoint as key
  await dbPut('clients', clientConfig.subscription.endpoint, clientConfig);
}

async function getLatestAsset() {
  return await dbGet('assets', 'latest-asset');
}

async function sendPushMessage(clientConfig, payload) {
  const clientKeys = clientConfig.vapidKeys;
  if (!clientKeys) {
    console.error('[SW] No client VAPID keys found');
    return;
  }

  const vapidKeyPair = await deserializeVapidKeys(clientKeys);

  const encrypted = await encryptWebPush({
    subscription: clientConfig.subscription,
    vapidKeyPair,
    payload: JSON.stringify(payload),
    proxyUrl: PROXY_URL,
  });

  // Send to proxy
  await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: encrypted.endpoint,
      body: toBase64Url(encrypted.body), // Use helper from sw-lib
      headers: encrypted.headers,
    }),
  });
}

async function sendAckToClient(clientConfig, asset, assetMode) {
  try {
    const payload = {
      type: 'ACK',
      asset: asset,
      assetMode: assetMode,
    };

    const payloadStr = JSON.stringify(payload);

    if (payloadStr.length <= MAX_CHUNK_SIZE) {
      await sendPushMessage(clientConfig, payload);
    } else {
      const id = crypto.randomUUID();
      const total = Math.ceil(payloadStr.length / MAX_CHUNK_SIZE);
      for (let i = 0; i < total; i++) {
        const chunkData = payloadStr.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
        const chunkPayload = {
          type: 'CHUNK',
          id,
          index: i,
          total,
          data: chunkData,
        };
        await sendPushMessage(clientConfig, chunkPayload);
      }
    }

    console.log('[SW] ACK sent to new client via background');
  } catch (e) {
    console.error('[SW] Error sending ACK:', e);
  }
}

async function broadcastToClients(data) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  console.log('[SW] Broadcasting to', clients.length, 'clients');
  for (const client of clients) {
    client.postMessage({
      type: 'PUSH_RECEIVED',
      payload: data,
    });
  }
}

async function processMessage(data) {
  const title = data.title || 'Baab Notification';
  const options = {
    body: typeof data.body === 'string' ? data.body : 'New data received',
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

      await sendAckToClient(data.senderConfig, asset, assetMode);
    }
  };

  await Promise.all([self.registration.showNotification(title, options), broadcastToClients(data), backgroundWork()]);
}

self.addEventListener('push', (event) => {
  console.log('[SW] Push Received');
  let data = {};
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
        const handleChunk = async () => {
          await dbPut('chunks', `${data.id}_${data.index}`, data);
          const allChunks = await dbGetAll('chunks');
          const messageChunks = allChunks.filter((c) => c.id === data.id);

          // Broadcast chunk progress
          await broadcastToClients(data);

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

        if (navigator.locks) {
          await navigator.locks.request(`chunk-${data.id}`, handleChunk);
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
