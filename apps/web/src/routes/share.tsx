import { createFileRoute } from '@tanstack/react-router';
import encodeQR from 'qr';
import { useCallback, useEffect, useState } from 'react';
import { deserializeVapidKeys, fromBase64Url, generateVapidKeys, serializeVapidKeys } from 'web-push-browser';

import { dbClear, dbDelete, dbGet, dbGetAll, dbPut } from '../db';
import { arrayBufferToBase64Url, encryptWebPush } from '../web-push-encryption';

import { HowToUse } from './-hot-to-use';
import { SessionInfo } from './-session-info';

const PROXY_URL = import.meta.env.VITE_PROXY_URL;

type VapidKeys = { publicKey: string; privateKey: string };
type RemoteConfig = { subscription: PushSubscriptionJSON; vapidKeys: VapidKeys };
type MessagePayload = {
  type: 'HANDSHAKE' | 'ASSET' | 'ACK';
  senderConfig?: RemoteConfig;
  asset?: string;
};

export const Route = createFileRoute('/share')({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Set up your browser to share securely using BaaB',
      },
      {
        title: 'Share - BaaB',
      },
    ],
  }),
});

const QRCode = ({ value }: { value: string }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    const qr = encodeQR(value, 'svg');
    const blob = new Blob([qr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    setDataUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [value]);

  return <img src={dataUrl} alt="QR Code" className=" w-full h-full" />;
};

function RouteComponent() {
  const [vapidKeys, setVapidKeys] = useState<VapidKeys | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isServerStarted, setIsServerStarted] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [enlargeQr, setEnlargeQr] = useState(false);

  // Server State
  const [clients, setClients] = useState<RemoteConfig[]>([]);
  const [assetText, setAssetText] = useState(() => localStorage.getItem('baab_asset_draft') || '');

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  }, []);

  // Load current asset from cache on mount
  useEffect(() => {
    if (!assetText) {
      dbGet('assets', 'latest-asset').then((text) => {
        if (text) {
          setAssetText((prev) => prev || text);
        }
      });
    }
  }, []);

  // Save asset draft to localStorage
  useEffect(() => {
    localStorage.setItem('baab_asset_draft', assetText);
  }, [assetText]);

  // Load clients from cache when server is started
  useEffect(() => {
    if (isServerStarted) {
      dbGetAll('clients').then((loadedClients) => {
        const validClients = loadedClients.filter((c): c is RemoteConfig => c !== null);
        setClients((prev) => {
          // Merge with existing, avoiding duplicates
          const existingEndpoints = new Set(prev.map((c) => c.subscription.endpoint));
          const newClients = validClients.filter((c) => !existingEndpoints.has(c.subscription.endpoint));
          return [...prev, ...newClients];
        });
        if (validClients.length > 0) {
          addLog(`Restored ${validClients.length} clients from storage`);
        }
      });
    }
  }, [isServerStarted, addLog]);

  // Initialize
  useEffect(() => {
    const init = async () => {
      // Restore server state from storage
      const storedMode = localStorage.getItem('baab_mode');
      if (storedMode === 'server') {
        setIsServerStarted(true);
        addLog('Restored Server mode');
      }

      // Load existing keys
      const storedKeys = localStorage.getItem('baab_vapid_keys');
      if (storedKeys) {
        setVapidKeys(JSON.parse(storedKeys));
      }

      // Check subscription
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          setSubscription(sub);
          addLog('Found existing subscription');
        }
      }
    };

    init();
  }, [addLog]);

  const handleIncomingMessage = useCallback(
    (payload: any) => {
      console.log('[Share] handleIncomingMessage payload:', payload);
      let data: MessagePayload;
      try {
        data = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (payload.body && typeof payload.body === 'string') {
          try {
            data = JSON.parse(payload.body);
          } catch {
            addLog(`Received raw text: ${payload.body}`);
            return;
          }
        }
      } catch (e) {
        console.error('[Share] Error parsing message:', e);
        return;
      }

      if (data.type === 'HANDSHAKE' && data.senderConfig) {
        addLog('Received HANDSHAKE');
        if (isServerStarted) {
          setClients((prev) => {
            // Avoid duplicates
            const exists = prev.find((c) => c.subscription.endpoint === data.senderConfig!.subscription.endpoint);
            if (exists) {
              return prev;
            }
            // Save to DB
            if (data.senderConfig?.subscription.endpoint) {
              dbPut('clients', data.senderConfig.subscription.endpoint, data.senderConfig);
            }
            return [...prev, data.senderConfig!];
          });
          addLog('New client connected!');
        }
      }
    },
    [isServerStarted, addLog],
  );

  // Listen for SW messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      console.log('[Share] SW Message:', event.data);
      if (event.data && event.data.type === 'PUSH_RECEIVED') {
        const payload = event.data.payload;
        handleIncomingMessage(payload);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [handleIncomingMessage]);

  const ensureKeysAndSubscription = async () => {
    let keys = vapidKeys;
    if (!keys) {
      const k = await generateVapidKeys();
      keys = await serializeVapidKeys(k);
      setVapidKeys(keys);
      localStorage.setItem('baab_vapid_keys', JSON.stringify(keys));
      await dbPut('config', 'vapid-keys', keys);
      addLog('Generated new VAPID keys');
    } else {
      await dbPut('config', 'vapid-keys', keys);
    }

    let sub = subscription;
    if (!sub) {
      const registration = await navigator.serviceWorker.register(`/sw.js?proxyUrl=${encodeURIComponent(PROXY_URL)}`);
      await navigator.serviceWorker.ready;
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(keys!.publicKey),
      });
      setSubscription(sub);
      addLog('Subscribed to push notifications');
    }
    return { keys, sub };
  };

  const startServer = async () => {
    await ensureKeysAndSubscription();
    setIsServerStarted(true);
    localStorage.setItem('baab_mode', 'server');
    addLog('Server started');
  };

  const sendMessage = async (targetConfig: RemoteConfig, payload: MessagePayload) => {
    try {
      const sub = targetConfig.subscription;
      if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
        throw new Error('Invalid subscription data');
      }

      const vapidKeyPair = await deserializeVapidKeys(targetConfig.vapidKeys);
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
      });

      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: encrypted.endpoint,
          body: arrayBufferToBase64Url(encrypted.body),
          headers: encrypted.headers,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }
      return true;
    } catch (e: any) {
      addLog(`Error sending message: ${e.message}`);
      return false;
    }
  };

  const registerAsset = async () => {
    if (!assetText) return;

    setIsBroadcasting(true);
    addLog('Starting asset broadcast...');
    if (clients.length === 0) {
      addLog('No clients connected. Asset registered locally.');
      // Save to cache
      await dbPut('assets', 'latest-asset', assetText);
      setIsBroadcasting(false);
      return;
    }

    // Save to cache
    await dbPut('assets', 'latest-asset', assetText);
    addLog('Asset saved to cache');

    addLog(`Broadcasting asset to ${clients.length} clients...`);

    const failedEndpoints: string[] = [];

    for (const client of clients) {
      const success = await sendMessage(client, {
        type: 'ASSET',
        asset: assetText,
      });

      if (!success && client.subscription.endpoint) {
        failedEndpoints.push(client.subscription.endpoint);
      }
    }

    if (failedEndpoints.length > 0) {
      setClients((prev) =>
        prev.filter((c) => c.subscription.endpoint && !failedEndpoints.includes(c.subscription.endpoint)),
      );

      // Remove from cache
      for (const endpoint of failedEndpoints) {
        await dbDelete('clients', endpoint);
      }

      addLog(`Removed ${failedEndpoints.length} unreachable clients.`);
    }

    addLog('Broadcast complete');
    setIsBroadcasting(false);
  };

  const getShareLink = () => {
    if (!subscription || !vapidKeys) return '';
    const config: RemoteConfig = { subscription: subscription.toJSON(), vapidKeys };
    const str = btoa(JSON.stringify(config));
    // Point to the receive route
    return `${window.location.origin}/receive?connect=${encodeURIComponent(str)}`;
  };

  const handleReset = async () => {
    if (subscription) await subscription.unsubscribe();
    localStorage.removeItem('baab_vapid_keys');
    localStorage.removeItem('baab_mode');

    // Clear caches
    await dbClear('config');
    await dbClear('clients');
    await dbClear('assets');

    setVapidKeys(null);
    setSubscription(null);
    setIsServerStarted(false);
    setClients([]);
    setLogs([]);
  };

  if (isServerStarted) {
    return (
      <main className="p-2 flex flex-col gap-4 mb-20">
        <SessionInfo />
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Share</h2>
          <button onClick={handleReset} className="text-red-500 text-sm underline">
            Close Server
          </button>
        </div>

        <div className="flex flex-col gap-10 max-w-md">
          <div className="flex flex-col gap-1">
            <label htmlFor="serverUrl">
              <span className=" font-bold">Share this link</span>
              <p className=" text-sm block">To get started, Share this link with people you want to receive assets:</p>
            </label>
            <textarea
              id="serverUrl"
              name="serverUrl"
              readOnly
              value={getShareLink()}
              className="w-full border px-2 py-1 rounded text-xs resize-none"
              onClick={(e) => e.currentTarget.select()}
              rows={3}
            />
            <div className="mt-2">
              <span>Or scan this QR code (click to enlarge):</span>
              <div
                className={`mt-1 p-2 border ${enlargeQr ? 'w-full' : 'w-48'} rounded cursor-pointer`}
                onClick={() => setEnlargeQr(!enlargeQr)}
              >
                <QRCode value={getShareLink()} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="assetText">
              <span className=" font-bold">Asset to Share</span>
              <p className=" text-sm block">Enter the text or HTML content you want to share with connected clients.</p>
            </label>
            <textarea
              id="assetText"
              name="assetText"
              readOnly={isBroadcasting}
              value={assetText}
              onChange={(e) => setAssetText(e.target.value)}
              placeholder="Enter text or HTML to share..."
              rows={5}
              className="w-full border px-2 py-1 rounded text-sm read-only:opacity-50"
            />
            <button
              onClick={registerAsset}
              disabled={!assetText || isBroadcasting}
              className="bg-blue-500 text-white px-4 py-2 rounded block w-full disabled:opacity-50"
            >
              {clients.length === 0 ? `Register asset` : `Broadcast to ${clients.length} Clients`}
            </button>
          </div>
        </div>

        <div className="logs mt-4 p-2 bg-gray-100 rounded text-xs font-mono h-40 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Connected Clients ({clients.length})</h3>
          {clients.length === 0 ? (
            <p className="text-sm text-gray-500">No clients connected yet.</p>
          ) : (
            <ul className="list-disc list-inside text-sm">
              {clients.map((c, i) => (
                <li key={i} className="truncate">
                  Client {i + 1} ({c.subscription.endpoint?.slice(0, 20)}...)
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className=" p-2 flex flex-col gap-4 mb-20">
      <h2 className="text-xl font-bold">Share</h2>
      <HowToUse />

      <div className="flex flex-col gap-4 mt-4">
        <p>Start a server to begin sharing files with others.</p>
        <button
          onClick={startServer}
          className="bg-blue-500 text-white px-4 py-2 rounded block w-fit disabled:opacity-50"
        >
          Start Sharing
        </button>
      </div>

      <div className="logs mt-4 p-2 bg-gray-100 rounded text-xs font-mono h-40 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </main>
  );
}
