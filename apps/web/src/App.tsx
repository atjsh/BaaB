import { useState, useEffect, useCallback } from 'react';
import { dbPut, dbGet, dbGetAll, dbDelete, dbClear } from './db';
import './App.css';
import { deserializeVapidKeys, fromBase64Url, generateVapidKeys, serializeVapidKeys } from 'web-push-browser';
import { encryptWebPush, arrayBufferToBase64Url } from './web-push-encryption';

const PROXY_URL = import.meta.env.VITE_PROXY_URL;

type VapidKeys = { publicKey: string; privateKey: string };
type RemoteConfig = { subscription: PushSubscriptionJSON; vapidKeys: VapidKeys };
type MessagePayload = {
  type: 'HANDSHAKE' | 'ASSET' | 'ACK';
  senderConfig?: RemoteConfig;
  asset?: string;
};

function App() {
  const [mode, setMode] = useState<'setup' | 'server' | 'client'>('setup');
  const [vapidKeys, setVapidKeys] = useState<VapidKeys | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Server State
  const [clients, setClients] = useState<RemoteConfig[]>([]);
  const [assetText, setAssetText] = useState(() => localStorage.getItem('baab_asset_draft') || '');

  useEffect(() => {
    console.log('[App] Clients list updated:', clients);
  }, [clients]);

  // Client State
  const [serverConfig, setServerConfig] = useState<RemoteConfig | null>(null);
  const [receivedAssets, setReceivedAssets] = useState<string[]>([]);

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

  // Load clients from cache when in server mode
  useEffect(() => {
    if (mode === 'server') {
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
  }, [mode, addLog]);

  // Initialize
  useEffect(() => {
    const init = async () => {
      // Check for client connect link
      const params = new URLSearchParams(window.location.search);
      const connectData = params.get('connect');

      if (connectData) {
        try {
          const config = JSON.parse(atob(decodeURIComponent(connectData)));
          setServerConfig(config);
          setMode('client');
          addLog('Client mode: Found server configuration');
        } catch (e) {
          addLog('Error parsing connection data');
        }
      } else {
        // Restore mode from storage
        const storedMode = localStorage.getItem('baab_mode');
        if (storedMode === 'server') {
          setMode('server');
          addLog('Restored Server mode');
        }
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
      console.log('[App] handleIncomingMessage payload:', payload);
      // Payload might be JSON string or object depending on how it was sent/received
      let data: MessagePayload;
      try {
        data = typeof payload === 'string' ? JSON.parse(payload) : payload;
        // If payload.body is the JSON string (from SW)
        if (payload.body && typeof payload.body === 'string') {
          try {
            data = JSON.parse(payload.body);
          } catch {
            // body is just text
            addLog(`Received raw text: ${payload.body}`);
            return;
          }
        }
        console.log('[App] Processed data:', data);
      } catch (e) {
        console.error('[App] Error parsing message:', e);
        addLog('Received invalid message format');
        return;
      }

      if (data.type === 'HANDSHAKE' && data.senderConfig) {
        console.log('[App] Processing HANDSHAKE. Mode:', mode);
        addLog(`Received HANDSHAKE in ${mode} mode`);
        if (mode === 'server') {
          setClients((prev) => {
            console.log('[App] Adding client. Current clients:', prev.length);
            // Avoid duplicates
            const exists = prev.find((c) => c.subscription.endpoint === data.senderConfig!.subscription.endpoint);
            if (exists) {
              console.log('[App] Client already exists');
              return prev;
            }
            console.log('[App] Client added');

            // Note: SW now handles sending the asset to new clients in background.
            // We keep this here just in case the SW logic fails or for immediate feedback if window is open.
            // But to avoid double sending, we can remove it or keep it as redundant.
            // Let's keep it but log it.
            console.log('[App] SW should have handled asset sending, but checking cache just in case');

            return [...prev, data.senderConfig!];
          });
          addLog('New client connected!');
        } else {
          console.log('[App] Not in server mode, ignoring handshake');
        }
      } else if (data.type === 'ASSET' && data.asset) {
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
    [mode, addLog],
  );

  // Listen for SW messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      console.log('[App] SW Message:', event.data);
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

      // Also save to Cache for SW access
      await dbPut('config', 'vapid-keys', keys);

      addLog('Generated new VAPID keys');
    } else {
      // Ensure keys are in cache even if loaded from localStorage
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
    setMode('server');
    localStorage.setItem('baab_mode', 'server');
    addLog('Server started');
  };

  const connectToServer = async () => {
    if (!serverConfig) return;
    const { keys, sub } = await ensureKeysAndSubscription();

    // Send Handshake
    await sendMessage(serverConfig, {
      type: 'HANDSHAKE',
      senderConfig: { subscription: sub.toJSON(), vapidKeys: keys! },
    });
    addLog('Sent handshake to server');
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

  const broadcastAsset = async () => {
    if (!assetText) return;

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
    setAssetText('');
  };

  const getShareLink = () => {
    if (!subscription || !vapidKeys) return '';
    const config: RemoteConfig = { subscription: subscription.toJSON(), vapidKeys };
    const str = btoa(JSON.stringify(config));
    return `${window.location.origin}?connect=${encodeURIComponent(str)}`;
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
    setMode('setup');
    setClients([]);
    setServerConfig(null);
    setReceivedAssets([]);
    setLogs([]);
    window.history.pushState({}, '', '/'); // Clear URL params
  };

  return (
    <div className="app-container">
      <h1>Baab - Browser as a Backend</h1>

      <div className="status-bar">
        Status: <strong>{mode.toUpperCase()}</strong>
        <button onClick={handleReset} style={{ marginLeft: '10px', float: 'right' }}>
          Reset
        </button>
      </div>

      {mode === 'setup' && (
        <div className="section">
          <h2>Setup</h2>
          <button onClick={startServer}>Start as Server</button>
          {serverConfig && (
            <div style={{ marginTop: '10px' }}>
              <p>Detected Server Config from URL</p>
              <button onClick={connectToServer}>Connect to Server</button>
            </div>
          )}
        </div>
      )}

      {mode === 'server' && (
        <>
          <div className="section">
            <h2>Server Dashboard</h2>
            <p>Share this link with clients:</p>
            <textarea readOnly value={getShareLink()} rows={3} style={{ width: '100%' }} />
          </div>

          <div className="section">
            <h2>Connected Clients ({clients.length})</h2>
            <ul>
              {clients.map((c, i) => (
                <li key={i}>
                  Client {i + 1} ({c.subscription.endpoint?.slice(0, 20)}...)
                </li>
              ))}
            </ul>
          </div>

          <div className="section">
            <h2>Share Asset</h2>
            <textarea
              value={assetText}
              onChange={(e) => setAssetText(e.target.value)}
              placeholder="Enter text to share..."
              rows={3}
              style={{ width: '100%' }}
            />
            <button onClick={broadcastAsset} disabled={clients.length === 0}>
              Update Asset with
            </button>
          </div>
        </>
      )}

      {mode === 'client' && (
        <>
          <div className="section">
            <h2>Client Dashboard</h2>
            <p>Connected to Server</p>
            {!subscription && <button onClick={connectToServer}>Complete Connection</button>}
          </div>

          <div className="section">
            <h2>Received Assets</h2>
            {receivedAssets.length === 0 ? (
              <p>No assets received yet.</p>
            ) : (
              <div className="assets-list">
                {receivedAssets.map((asset, i) => (
                  <div key={i} className="asset-card" dangerouslySetInnerHTML={{ __html: asset }} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="logs">
        <h3>Logs</h3>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
