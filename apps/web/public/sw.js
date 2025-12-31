importScripts('sw-lib.js');

const PROXY_URL = 'http://localhost:3000/push-proxy';

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

async function sendAckToClient(clientConfig, asset) {
  try {
    const clientKeys = clientConfig.vapidKeys;
    if (!clientKeys) {
      console.error('[SW] No client VAPID keys found');
      return;
    }

    const vapidKeyPair = await deserializeVapidKeys(clientKeys);

    // Prepare payload
    const payload = JSON.stringify({
      type: 'ACK',
      asset: asset,
    });

    const encrypted = await encryptWebPush({
      subscription: clientConfig.subscription,
      vapidKeyPair,
      payload,
    });

    // Send to proxy
    await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'x-kind': 'ack',
        endpoint: encrypted.endpoint,
        body: toBase64Url(encrypted.body), // Use helper from sw-lib
        headers: encrypted.headers,
      }),
    });
    console.log('[SW] ACK sent to new client via background');
  } catch (e) {
    console.error('[SW] Error sending ACK:', e);
  }
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
      await sendAckToClient(data.senderConfig, asset);
    }
  };

  // Broadcast to window clients
  const broadcastPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    console.log('[SW] Broadcasting to', clients.length, 'clients');
    clients.forEach((client) => {
      client.postMessage({
        type: 'PUSH_RECEIVED',
        payload: data,
      });
    });
  });

  event.waitUntil(
    Promise.all([self.registration.showNotification(title, options), broadcastPromise, backgroundWork()]),
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
