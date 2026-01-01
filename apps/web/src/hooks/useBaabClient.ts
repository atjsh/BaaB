import { useCallback, useEffect, useRef, useState } from 'react';
import { decompress } from 'lz-string';
import { deserializeVapidKeys } from 'web-push-browser';
import { dbGet, dbPut } from '../lib/db';
import { arrayBufferToBase64Url, encryptWebPush } from '../lib/web-push-encryption';
import type { DirectoryManifestEntry, MessagePayload, RemoteConfig, VapidKeys } from '@baab/shared';

const PROXY_URL = import.meta.env.VITE_PROXY_URL;
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

interface UseBaabClientProps {
  vapidKeys: VapidKeys | null;
  setVapidKeys: (keys: VapidKeys | null) => void;
  subscription: PushSubscription | null;
  setSubscription: (sub: PushSubscription | null) => void;
  addLog: (msg: string) => void;
  ensureKeysAndSubscription: (opts?: {
    vapidKeysOverride?: VapidKeys;
  }) => Promise<{ keys: VapidKeys | null; sub: PushSubscription | null }>;
  resetBaab: () => Promise<void>;
}

export function useBaabClient({
  setVapidKeys,
  setSubscription,
  addLog,
  ensureKeysAndSubscription,
  resetBaab,
}: UseBaabClientProps) {
  const initializedRef = useRef(false);
  const seenPayloadsRef = useRef<Set<string>>(new Set());
  const [serverConfig, setServerConfig] = useState<RemoteConfig | null>(null);
  const [receivedAssets, setReceivedAssets] = useState<
    (
      | { type: 'text'; content: string }
      | { type: 'image'; content: string }
      | {
          type: 'directory';
          content: string;
          manifest?: DirectoryManifestEntry[];
          directoryName?: string;
          totalBytes?: number;
          fileCount?: number;
        }
    )[]
  >([]);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [chunkConcurrency, setChunkConcurrency] = useState<number>(DEFAULT_CHUNK_CONCURRENCY);
  const [chunkJitterMs, setChunkJitterMs] = useState<number>(DEFAULT_CHUNK_JITTER_MS);
  const [lastReceiveBytes, setLastReceiveBytes] = useState<number | null>(null);
  const [lastReceiveMs, setLastReceiveMs] = useState<number | null>(null);

  // Chunk reassembly state
  const chunksRef = useRef<Map<string, { total: number; parts: Map<number, string> }>>(new Map());
  const chunkStartRef = useRef<number | null>(null);

  const handleConnectData = useCallback(
    (connectData: string) => {
      if (connectionStatus !== 'idle') return;
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
    [addLog, connectionStatus],
  );

  // Load existing keys and subscription on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init = async () => {
      // Load existing keys
      const storedKeys = localStorage.getItem('baab_vapid_keys');
      if (storedKeys) {
        setVapidKeys(JSON.parse(storedKeys));
      }

      const storedConcurrency = await dbGet('config', 'chunk-concurrency');
      if (typeof storedConcurrency === 'number' && storedConcurrency > 0) {
        setChunkConcurrency(storedConcurrency);
      }

      const storedJitter = await dbGet('config', 'chunk-jitter-ms');
      if (typeof storedJitter === 'number' && storedJitter >= 0) {
        setChunkJitterMs(storedJitter);
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

      const storedConfig = await dbGet('config', 'server-config');
      if (storedConfig) {
        setServerConfig(storedConfig);
        addLog('Restored server configuration from storage');
        setConnectionStatus('connecting');
      }
    };
    init();
  }, [addLog, setVapidKeys, setSubscription]);

  const sendMessage = async (targetConfig: RemoteConfig, payload: MessagePayload) => {
    try {
      const vapidKeyPair = await deserializeVapidKeys(targetConfig.vapidKeys);

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
          proxyUrl: PROXY_URL,
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

      // For client -> server, we usually just send small handshake messages,
      // but we keep the chunking logic just in case.
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

  const connectToServer = async () => {
    if (!serverConfig) return;
    try {
      // Subscribe using server's VAPID public key to avoid VAPID mismatch
      const { keys, sub } = await ensureKeysAndSubscription({ vapidKeysOverride: serverConfig.vapidKeys });

      // Send Handshake
      await sendMessage(serverConfig, {
        type: 'HANDSHAKE',
        senderConfig: { subscription: sub!.toJSON(), vapidKeys: keys! },
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

  const processMessage = useCallback(
    (data: MessagePayload) => {
      const dedupeKey = JSON.stringify(data);
      if (seenPayloadsRef.current.has(dedupeKey)) {
        return;
      }
      seenPayloadsRef.current.add(dedupeKey);

      const { asset } = data;

      if (data.type === 'ASSET' && asset !== undefined) {
        addLog('Received ASSET');
        const mode = data.assetMode || 'text';
        const sizeBytes = (() => {
          if (mode === 'directory') {
            if (typeof data.totalBytes === 'number' && data.totalBytes > 0) return data.totalBytes;
            return dataUrlBytes(asset);
          }
          if (mode === 'image') {
            return dataUrlBytes(asset);
          }
          return new TextEncoder().encode(asset).length;
        })();
        const start = chunkStartRef.current ?? performance.now();
        const end = performance.now();
        const durationMs = Math.max(1, end - start);
        setLastReceiveBytes(sizeBytes);
        setLastReceiveMs(durationMs);
        chunkStartRef.current = null;

        const content = mode === 'text' ? decompress(asset) : asset;
        if (mode === 'directory') {
          setReceivedAssets((prev) => [
            {
              type: 'directory',
              content,
              manifest: data.manifest,
              directoryName: data.directoryName,
              totalBytes: data.totalBytes,
              fileCount: data.fileCount,
            },
            ...prev,
          ]);
        } else {
          setReceivedAssets((prev) => [{ type: mode as 'text' | 'image', content }, ...prev]);
        }
      } else if (data.type === 'ACK') {
        addLog('Received ACK');
        if (asset) {
          addLog('Received ASSET with ACK');
          const mode = data.assetMode || 'text';
          const sizeBytes = (() => {
            if (mode === 'directory') {
              if (typeof data.totalBytes === 'number' && data.totalBytes > 0) return data.totalBytes;
              return dataUrlBytes(asset);
            }
            if (mode === 'image') {
              return dataUrlBytes(asset);
            }
            return new TextEncoder().encode(asset).length;
          })();
          const start = chunkStartRef.current ?? performance.now();
          const end = performance.now();
          const durationMs = Math.max(1, end - start);
          setLastReceiveBytes(sizeBytes);
          setLastReceiveMs(durationMs);
          chunkStartRef.current = null;

          const content = mode === 'text' ? decompress(asset) : asset;
          if (mode === 'directory') {
            setReceivedAssets((prev) => [
              {
                type: 'directory',
                content,
                manifest: data.manifest,
                directoryName: data.directoryName,
                totalBytes: data.totalBytes,
                fileCount: data.fileCount,
              },
              ...prev,
            ]);
          } else {
            setReceivedAssets((prev) => [{ type: mode as 'text' | 'image', content }, ...prev]);
          }
        }
      }
    },
    [addLog],
  );

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

      if (data.type === 'CHUNK') {
        const idx = data.index !== undefined ? data.index + 1 : '?';
        const total = data.total ?? '?';
        addLog(`Received CHUNK ${idx}/${total}`);
        if (chunkStartRef.current === null) {
          chunkStartRef.current = performance.now();
        }
        // Let Service Worker handle chunk reassembly; ignore chunk messages in page
        return;
      } else {
        processMessage(data);
      }
    },
    [addLog, processMessage],
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

  const resetClient = async () => {
    await resetBaab();
    setServerConfig(null);
    setReceivedAssets([]);
    setConnectionStatus('idle');
    chunksRef.current.clear();
    addLog('Reset connection and cleared data');
  };

  return {
    serverConfig,
    receivedAssets,
    connectionStatus,
    handleConnectData,
    resetClient,
    chunkConcurrency,
    chunkJitterMs,
    lastReceiveBytes,
    lastReceiveMs,
  };
}
