import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { dbPut, dbGet, dbDelete } from '../db';
import { deserializeVapidKeys, fromBase64Url, generateVapidKeys, serializeVapidKeys } from 'web-push-browser';
import { encryptWebPush, arrayBufferToBase64Url } from '../web-push-encryption';
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

export const Route = createFileRoute('/receive')({
  component: Receive,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Receive assets via peer-to-peer connection',
      },
      {
        title: 'Receive - BaaB',
      },
    ],
  }),
});

function checkIfSupportedBrowser(): boolean {
  const isServiceWorkerSupported = 'serviceWorker' in navigator;
  const isPushManagerSupported = 'PushManager' in window;
  const isNotificationsSupported = 'Notification' in window;
  const isLocalStorageSupported = 'localStorage' in window;

  return isServiceWorkerSupported && isPushManagerSupported && isNotificationsSupported && isLocalStorageSupported;
}

function Receive() {
  const [vapidKeys, setVapidKeys] = useState<VapidKeys | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [serverConfig, setServerConfig] = useState<RemoteConfig | null>(null);
  const [receivedAssets, setReceivedAssets] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  }, []);

  const handleConnectData = useCallback(
    (connectData: string) => {
      try {
        const config = JSON.parse(atob(decodeURIComponent(connectData)));
        setServerConfig(config);
        dbPut('config', 'server-config', config);
        addLog('Server configuration loaded');
        setConnectionStatus('connecting');
      } catch (e) {
        addLog('Error parsing connection data');
        console.error(e);
      }
    },
    [addLog],
  );

  // Load existing keys and subscription on mount
  useEffect(() => {
    const init = async () => {
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

      // Check for connect param in URL
      const params = new URLSearchParams(window.location.search);
      const connectData = params.get('connect');
      if (connectData) {
        handleConnectData(connectData);
      } else {
        const storedConfig = await dbGet('config', 'server-config');
        if (storedConfig) {
          setServerConfig(storedConfig);
          addLog('Restored server configuration from storage');
          setConnectionStatus('connecting');
        }
      }
    };
    init();
  }, [addLog, handleConnectData]);

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

  const connectToServer = async () => {
    if (!serverConfig) return;
    try {
      const { keys, sub } = await ensureKeysAndSubscription();

      // Send Handshake
      await sendMessage(serverConfig, {
        type: 'HANDSHAKE',
        senderConfig: { subscription: sub.toJSON(), vapidKeys: keys! },
      });
      addLog('Sent handshake to server');
      setConnectionStatus('connected');
    } catch (e) {
      addLog('Failed to connect');
      setConnectionStatus('idle');
      console.error(e);
    }
  };

  // Trigger connection when status is connecting
  useEffect(() => {
    if (connectionStatus === 'connecting' && serverConfig) {
      connectToServer();
    }
  }, [connectionStatus, serverConfig]);

  const handleIncomingMessage = useCallback(
    (payload: any) => {
      console.log('[Receive] handleIncomingMessage payload:', payload);
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
        console.error('[Receive] Error parsing message:', e);
        return;
      }

      if (data.type === 'ASSET' && data.asset) {
        addLog('Received ASSET');
        setReceivedAssets((prev) => [data.asset!, ...prev]);
      } else if (data.type === 'ACK') {
        addLog('Received ACK');
        if (data.asset) {
          addLog('Received ASSET with ACK');
          setReceivedAssets((prev) => [data.asset!, ...prev]);
        }
      }
    },
    [addLog],
  );

  // Listen for SW messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      console.log('[Receive] SW Message:', event.data);
      if (event.data && event.data.type === 'PUSH_RECEIVED') {
        const payload = event.data.payload;
        handleIncomingMessage(payload);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [handleIncomingMessage]);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const urlStr = formData.get('serverUrl') as string;

    try {
      const url = new URL(urlStr);
      const connectData = url.searchParams.get('connect');
      if (connectData) {
        handleConnectData(connectData);
      } else {
        addLog('Invalid URL: missing connect parameter');
      }
    } catch (e) {
      addLog('Invalid URL format');
    }
  };

  const handleReset = async () => {
    if (subscription) await subscription.unsubscribe();
    localStorage.removeItem('baab_vapid_keys');
    localStorage.removeItem('baab_mode');

    setVapidKeys(null);
    setSubscription(null);
    setLogs([]);

    setVapidKeys(null);
    setSubscription(null);
    setServerConfig(null);
    setReceivedAssets([]);
    setConnectionStatus('idle');
    localStorage.removeItem('baab_vapid_keys');
    await dbDelete('config', 'server-config');
    addLog('Reset connection and cleared data');
  };

  if (connectionStatus === 'connected') {
    return (
      <main className="p-2 flex flex-col gap-4 mb-20">
        <SessionInfo />
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Receive</h2>
          <button onClick={handleReset} className="text-red-500 text-sm underline">
            Stop Receiving
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Received Assets</h3>
          {receivedAssets.length === 0 ? (
            <p>No assets received yet. Waiting for server...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {receivedAssets.map((asset, i) => (
                <div
                  key={i}
                  className="border p-4 rounded bg-white shadow-sm"
                  dangerouslySetInnerHTML={{ __html: asset }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="logs mt-4 p-2 bg-gray-100 rounded text-xs font-mono h-40 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className=" p-2 flex flex-col gap-4 mb-20">
      <h2 className="text-xl font-bold">Receive</h2>
      <HowToUse />

      <form className=" flex flex-col gap-10 max-w-md " onSubmit={handleFormSubmit}>
        <div className=" flex flex-col gap-1 ">
          <label htmlFor="serverUrl">
            <span className=" font-bold">Enter Server URL</span>
            <p className=" text-sm block">
              To get started, paste the server URL. <br />
              If you don't have one, ask the sharer for one. <br />
              Sharer could send you the URL via chat, email, etc.
            </p>
          </label>

          <textarea
            id="serverUrl"
            name="serverUrl"
            required
            placeholder="https://baab.atj.sh/receive/?connect=eyJ..."
            className="w-full border px-2 py-1 rounded text-xs resize-none"
            rows={20}
          />
          <p className=" text-sm block">Only paste URL from trusted sources.</p>
        </div>

        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded block w-fit disabled:opacity-50"
          disabled={connectionStatus === 'connecting'}
        >
          {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      </form>

      <div className="logs mt-4 p-2 bg-gray-100 rounded text-xs font-mono h-40 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </main>
  );
}
