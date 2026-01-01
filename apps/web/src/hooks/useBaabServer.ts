import { useCallback, useEffect, useState } from 'react';
import { compress, decompress } from 'lz-string';
import { deserializeVapidKeys } from 'web-push-browser';
import { dbDelete, dbGet, dbGetAll, dbPut } from '../lib/db';
import { arrayBufferToBase64Url, encryptWebPush } from '../lib/web-push-encryption';
import type { DirectoryAsset } from '../types/assets';
import type { MessagePayload, RemoteConfig, VapidKeys } from '@baab/shared';

const PROXY_URL = import.meta.env.VITE_PROXY_URL;
// Prefer explicit VAPID subject; fall back to host if production, or a safe mailto on localhost.
const VAPID_SUBJECT =
  import.meta.env.VITE_VAPID_SUBJECT ||
  (window.location.hostname === 'localhost' ? 'mailto:baab@example.com' : `https://${window.location.host}`);
const DEFAULT_CHUNK_CONCURRENCY = 2;
const DEFAULT_CHUNK_JITTER_MS = 80;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bytesToHuman = (bytes: number) => {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
};
const bpsToHuman = (bps: number) => {
  if (!bps || bps < 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const idx = Math.min(Math.floor(Math.log(bps) / Math.log(1024)), units.length - 1);
  const value = bps / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
};
const dataUrlBytes = (dataUrl: string) => {
  try {
    const base64 = dataUrl.split(',')[1] || '';
    return Math.floor((base64.length * 3) / 4);
  } catch {
    return 0;
  }
};

interface UseBaabServerProps {
  vapidKeys: VapidKeys | null;
  setVapidKeys: (keys: VapidKeys | null) => void;
  subscription: PushSubscription | null;
  setSubscription: (sub: PushSubscription | null) => void;
  addLog: (msg: string) => void;
  ensureKeysAndSubscription: () => Promise<{ keys: VapidKeys | null; sub: PushSubscription | null }>;
  resetBaab: () => Promise<void>;
}

export function useBaabServer({
  vapidKeys,
  setVapidKeys,
  setSubscription,
  addLog,
  ensureKeysAndSubscription,
  resetBaab,
}: UseBaabServerProps) {
  const [isServerStarted, setIsServerStarted] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Server State
  const [clients, setClients] = useState<RemoteConfig[]>([]);
  const [assetMode, setAssetMode] = useState<'text' | 'image' | 'directory'>('text');
  const [assetText, setAssetText] = useState('');
  const [compressedAssetText, setCompressedAssetText] = useState('');
  const [imageAsset, setImageAsset] = useState<string>('');
  const [directoryAsset, setDirectoryAsset] = useState<DirectoryAsset | null>(null);
  const [chunkConcurrency, setChunkConcurrency] = useState<number>(DEFAULT_CHUNK_CONCURRENCY);
  const [chunkJitterMs, setChunkJitterMs] = useState<number>(DEFAULT_CHUNK_JITTER_MS);
  const [lastBroadcastBytes, setLastBroadcastBytes] = useState<number | null>(null);
  const [lastBroadcastMs, setLastBroadcastMs] = useState<number | null>(null);

  const updateChunkConcurrency = useCallback(
    async (value: number) => {
      const normalized = Math.min(5, Math.max(1, Math.round(value)));
      setChunkConcurrency(normalized);
      await dbPut('config', 'chunk-concurrency', normalized);
      addLog(`Chunk concurrency set to ${normalized}`);
    },
    [addLog],
  );

  const updateChunkJitterMs = useCallback(
    async (value: number) => {
      const normalized = Math.min(500, Math.max(0, Math.round(value)));
      setChunkJitterMs(normalized);
      await dbPut('config', 'chunk-jitter-ms', normalized);
      addLog(`Chunk jitter set to ${normalized} ms`);
    },
    [addLog],
  );

  // Load current asset from cache on mount
  useEffect(() => {
    if (!assetText) {
      dbGet('assets', 'latest-asset-mode').then((mode) => {
        if (mode === 'image') {
          setAssetMode('image');
          dbGet('assets', 'latest-asset').then((data) => {
            if (data) {
              setImageAsset(data);
            }
          });
        } else if (mode === 'directory') {
          setAssetMode('directory');
          Promise.all([
            dbGet('assets', 'latest-asset'),
            dbGet('assets', 'latest-asset-manifest'),
            dbGet('assets', 'latest-asset-dirname'),
            dbGet('assets', 'latest-asset-bytes'),
            dbGet('assets', 'latest-asset-filecount'),
          ]).then(([zipDataUrl, manifest, dirname, bytes, fileCount]) => {
            if (zipDataUrl && manifest) {
              setDirectoryAsset({
                zipDataUrl,
                manifest,
                directoryName: dirname || 'shared-folder',
                totalBytes: typeof bytes === 'number' ? bytes : 0,
                fileCount: typeof fileCount === 'number' ? fileCount : (manifest as any[]).length,
              });
            }
          });
        } else {
          setAssetMode('text');
          dbGet('assets', 'latest-asset').then((text) => {
            if (text) {
              setAssetText((prev) => prev || decompress(text));
            } else {
              setAssetText('This is a secret message!');
            }
          });
        }
      });
    }
  }, []);

  useEffect(() => {
    setCompressedAssetText(compress(assetText));
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
      // Restore server state from IndexedDB
      const storedMode = await dbGet('config', 'mode');
      if (storedMode === 'server') {
        setIsServerStarted(true);
        addLog('Restored Server mode');
      }

      // Load existing keys
      const storedKeys = await dbGet('config', 'vapid-keys');
      if (storedKeys) {
        setVapidKeys(storedKeys);
      }

      // Load delivery tuning
      const storedConcurrency = await dbGet('config', 'chunk-concurrency');
      if (typeof storedConcurrency === 'number' && storedConcurrency > 0) {
        setChunkConcurrency(storedConcurrency);
      } else {
        await dbPut('config', 'chunk-concurrency', DEFAULT_CHUNK_CONCURRENCY);
      }

      const storedJitter = await dbGet('config', 'chunk-jitter-ms');
      if (typeof storedJitter === 'number' && storedJitter >= 0) {
        setChunkJitterMs(storedJitter);
      } else {
        await dbPut('config', 'chunk-jitter-ms', DEFAULT_CHUNK_JITTER_MS);
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
  }, [addLog, setVapidKeys, setSubscription]);

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
      } else if (data.type === 'CHUNK') {
        addLog(`Received CHUNK ${data.index! + 1}/${data.total}`);
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

  const startServer = async () => {
    await ensureKeysAndSubscription();
    setIsServerStarted(true);
    await dbPut('config', 'mode', 'server');
    addLog('Server started');
  };

  const sendMessage = async (targetConfig: RemoteConfig, payload: MessagePayload) => {
    try {
      if (!vapidKeys) throw new Error('No VAPID keys');
      const vapidKeyPair = await deserializeVapidKeys(vapidKeys);

      const send = async (p: MessagePayload) => {
        const sub = targetConfig.subscription;
        if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
          throw new Error('Invalid subscription data');
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
          payload: JSON.stringify(p),
          contact: VAPID_SUBJECT,
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
      };

      const payloadStr = JSON.stringify(payload);
      const MAX_CHUNK_SIZE = 2048;
      const concurrency = Math.max(1, chunkConcurrency || DEFAULT_CHUNK_CONCURRENCY);
      const jitterMs = Math.max(0, chunkJitterMs || 0);

      if (payloadStr.length <= MAX_CHUNK_SIZE) {
        return await send(payload);
      } else {
        const id = crypto.randomUUID();
        const total = Math.ceil(payloadStr.length / MAX_CHUNK_SIZE);
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
              return send(chunk);
            }),
          );
        }
        return true;
      }
    } catch (e: any) {
      addLog(`Error sending message: ${e.message}`);
      return false;
    }
  };

  const registerAsset = async () => {
    if (assetMode === 'image' && !imageAsset) {
      addLog('No image asset to broadcast');
      return;
    }
    if (assetMode === 'text' && !assetText) {
      addLog('No text asset to broadcast');
      return;
    }
    if (assetMode === 'directory' && !directoryAsset) {
      addLog('No folder selected to broadcast');
      return;
    }

    const assetPayload =
      assetMode === 'text' ? compressedAssetText : assetMode === 'image' ? imageAsset : directoryAsset!.zipDataUrl;
    const manifestPayload = assetMode === 'directory' ? directoryAsset!.manifest : undefined;
    const directoryName = assetMode === 'directory' ? directoryAsset!.directoryName : undefined;
    const totalBytes = assetMode === 'directory' ? directoryAsset!.totalBytes : undefined;
    const fileCount = assetMode === 'directory' ? directoryAsset!.fileCount : undefined;

    setIsBroadcasting(true);
    addLog('Starting asset broadcast...');
    if (clients.length === 0) {
      addLog('No clients connected. Asset registered locally.');
      // Save to cache
      await dbPut('assets', 'latest-asset', assetPayload);

      if (assetMode === 'directory' && manifestPayload) {
        await dbPut('assets', 'latest-asset-manifest', manifestPayload);
        if (directoryName) await dbPut('assets', 'latest-asset-dirname', directoryName);
        if (typeof totalBytes === 'number') await dbPut('assets', 'latest-asset-bytes', totalBytes);
        if (typeof fileCount === 'number') await dbPut('assets', 'latest-asset-filecount', fileCount);
      }

      await dbPut('assets', 'latest-asset-mode', assetMode);
      setIsBroadcasting(false);
      return;
    }

    // Save to cache
    await dbPut('assets', 'latest-asset', assetPayload);
    await dbPut('assets', 'latest-asset-mode', assetMode);

    if (assetMode === 'directory' && manifestPayload) {
      await dbPut('assets', 'latest-asset-manifest', manifestPayload);
      if (directoryName) await dbPut('assets', 'latest-asset-dirname', directoryName);
      if (typeof totalBytes === 'number') await dbPut('assets', 'latest-asset-bytes', totalBytes);
      if (typeof fileCount === 'number') await dbPut('assets', 'latest-asset-filecount', fileCount);
    }

    addLog('Asset saved to cache');

    addLog(`Broadcasting asset to ${clients.length} clients...`);

    const broadcastStart = performance.now();
    const payloadBytes = (() => {
      if (assetMode === 'directory') {
        // Prefer accurate total bytes if provided
        if (typeof totalBytes === 'number' && totalBytes > 0) return totalBytes;
        return dataUrlBytes(assetPayload);
      }
      if (assetMode === 'image') {
        return dataUrlBytes(assetPayload);
      }
      return new TextEncoder().encode(assetPayload).length;
    })();

    const failedEndpoints: string[] = [];

    for (const client of clients) {
      const success = await sendMessage(client, {
        type: 'ASSET',
        asset: assetPayload,
        assetMode: assetMode,
        manifest: manifestPayload,
        directoryName,
        totalBytes,
        fileCount,
      });

      if (!success && client.subscription.endpoint) {
        failedEndpoints.push(client.subscription.endpoint);
      }
    }

    const broadcastEnd = performance.now();
    const durationMs = Math.max(1, broadcastEnd - broadcastStart);
    const totalBytesSent = payloadBytes * Math.max(1, clients.length);
    const bps = (totalBytesSent / durationMs) * 1000;
    setLastBroadcastBytes(totalBytesSent);
    setLastBroadcastMs(durationMs);
    addLog(`Broadcast speed ~${bpsToHuman(bps)} over ${bytesToHuman(totalBytesSent)} (${durationMs.toFixed(0)} ms).`);

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

  const resetServer = async () => {
    await resetBaab();
    setIsServerStarted(false);
    setClients([]);
  };

  return {
    isServerStarted,
    isBroadcasting,
    clients,
    assetMode,
    setAssetMode,
    assetText,
    setAssetText,
    compressedAssetText,
    imageAsset,
    setImageAsset,
    directoryAsset,
    setDirectoryAsset,
    chunkConcurrency,
    chunkJitterMs,
    lastBroadcastBytes,
    lastBroadcastMs,
    updateChunkConcurrency,
    updateChunkJitterMs,
    startServer,
    registerAsset,
    resetServer,
  };
}
