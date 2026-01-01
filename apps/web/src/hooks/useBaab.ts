import { useCallback, useState } from 'react';
import { fromBase64Url, generateVapidKeys, serializeVapidKeys } from 'web-push-browser';
import { dbClear, dbPut } from '../lib/db';
import type { VapidKeys } from '@baab/shared';

type EnsureOptions = {
  vapidKeysOverride?: VapidKeys;
};

export function useBaab() {
  const [vapidKeys, setVapidKeys] = useState<VapidKeys | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  }, []);

  const ensureKeysAndSubscription = async (opts?: EnsureOptions) => {
    const overrideKeys = opts?.vapidKeysOverride;
    let keys = overrideKeys ?? vapidKeys;
    if (!keys) {
      // Try to load from local storage first
      const storedKeys = localStorage.getItem('baab_vapid_keys');
      if (storedKeys) {
        keys = JSON.parse(storedKeys);
        setVapidKeys(keys);
      } else {
        const k = await generateVapidKeys();
        keys = await serializeVapidKeys(k);
        setVapidKeys(keys);
        localStorage.setItem('baab_vapid_keys', JSON.stringify(keys));
        await dbPut('config', 'vapid-keys', keys);
        addLog('Generated new VAPID keys');
      }
    } else {
      // Ensure keys are in DB
      await dbPut('config', 'vapid-keys', keys);
      setVapidKeys(keys);
      localStorage.setItem('baab_vapid_keys', JSON.stringify(keys));
    }

    let sub = subscription;
    if (!sub) {
      // Wait for SW to be ready (registered via main.tsx registerSW)
      let readyReg: ServiceWorkerRegistration | null = null;
      try {
        readyReg = await navigator.serviceWorker.ready;
      } catch (e) {
        addLog('Service worker not ready. Is PWA registration running?');
        throw e;
      }

      // Try to get existing subscription
      sub = await readyReg.pushManager.getSubscription();

      if (!sub) {
        sub = await readyReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: fromBase64Url(keys!.publicKey),
        });
        addLog('Subscribed to push notifications');
      }
      setSubscription(sub);
    }
    return { keys, sub };
  };

  const reset = async () => {
    if (subscription) await subscription.unsubscribe();
    localStorage.removeItem('baab_vapid_keys');
    localStorage.removeItem('baab_mode');

    // Clear caches
    await dbClear('config');
    await dbClear('clients');
    await dbClear('assets');

    setVapidKeys(null);
    setSubscription(null);
    setLogs([]);
  };

  return {
    vapidKeys,
    setVapidKeys,
    subscription,
    setSubscription,
    logs,
    setLogs,
    addLog,
    ensureKeysAndSubscription,
    reset,
  };
}
