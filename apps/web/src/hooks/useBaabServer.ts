import { compress, decompress } from 'lz-string';
import { useCallback, useEffect, useState } from 'react';
import { fromBase64Url, generateVapidKeys, serializeVapidKeys } from 'web-push-browser';

import { share } from '@baab/shared';

import { ShareStorageManager } from '../lib/storage/share.db';

interface UseBaabServerProps {
  addLog: (msg: string) => void;
}

export function useBaabServer({ addLog }: UseBaabServerProps) {
  const [localPushSubscription, setLocalPushSubscription] = useState<PushSubscription | null>(null);
  const [isShareStorageReady, setIsShareStorageReady] = useState(false);
  const [shareStorage, setSharedStorage] = useState<ShareStorageManager>();
  useEffect(() => {
    ShareStorageManager.createInstance().then((instance) => {
      setSharedStorage(instance);
      setIsShareStorageReady(true);
    });
  }, []);
  const [isServerStarted, setIsServerStarted] = useState(false);
  const [localPushSendOption, setLocalPushSendOption] = useState<share.ShareLocalPushSendOptions | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const [clients, setClients] = useState<share.ShareRemotePushSendOptions[]>([]);
  const [assetMode, setAssetMode] = useState<'text' | 'image' | 'directory'>('text');
  const [assetText, setAssetText] = useState('');
  const [compressedAssetText, setCompressedAssetText] = useState('');
  const [imageAsset, setImageAsset] = useState<string>('');
  const [directoryAsset, setDirectoryAsset] = useState<any | null>(null);

  useEffect(() => {
    shareStorage?.latestAssetStorage.get(1).then((asset) => {
      if (asset) {
        if (asset.contentType === 'plain/text') {
          setAssetMode('text');
          setAssetText(decompress(asset.contentBase64));
        } else if (asset.contentType === 'image/webp') {
          setAssetMode('image');
          setImageAsset(asset.contentBase64);
        }
      }
    });
  }, [isShareStorageReady]);

  useEffect(() => {
    setCompressedAssetText(compress(assetText));
  }, [assetText]);

  // Load clients from cache when server is started
  useEffect(() => {
    if (isServerStarted) {
      shareStorage?.remotePushSendStorage.getAll().then((loadedClients) => {
        setClients((prev) => {
          const existingEndpoints = new Set(prev.map((c) => c.id));
          const newClients = loadedClients.filter((c) => !existingEndpoints.has(c.id));
          return [
            ...prev,
            ...newClients.map((c) => ({ ...c, type: 'remote' }) satisfies share.ShareRemotePushSendOptions),
          ];
        });
        if (loadedClients.length > 0) {
          addLog(`Restored ${loadedClients.length} clients from storage`);
        }
      });
    }
  }, [isServerStarted, isShareStorageReady]);

  // Initialize
  useEffect(() => {
    const init = async () => {
      // Restore server state from IndexedDB
      const latestAsset = await shareStorage?.latestAssetStorage.get(1);
      if (latestAsset) {
        setIsServerStarted(true);
        addLog('Restored Server mode');
      }

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();

        if (sub) {
          setLocalPushSubscription(sub);
          await shareStorage?.localPushSendStorage.getAll().then(async (all) => {
            if (all.length > 0) {
              setLocalPushSendOption({
                ...all[0],
                type: 'local',
              });
              addLog('Restored local push send option from storage');
            } else {
              const localPushSendId = crypto.randomUUID();
              const vapidKeys = await serializeVapidKeys(await generateVapidKeys());

              const subjsonString = JSON.stringify(sub);
              const subjson = JSON.parse(subjsonString);

              const p256dh = subjson.keys.p256dh;
              const auth = subjson.keys.auth;

              await shareStorage?.localPushSendStorage.put({
                id: localPushSendId,
                messageEncryption: {
                  encoding: PushManager.supportedContentEncodings[0],
                  p256dh: p256dh,
                  auth: auth,
                },
                pushSubscription: {
                  endpoint: sub.endpoint,
                  expirationTime: sub.expirationTime,
                },
                vapidKeys,
              });
              addLog('Found existing subscription');
            }

            shareStorage?.localPushSendStorage.getAll().then((all) => {
              if (all.length > 0) {
                setLocalPushSendOption({
                  ...all[0],
                  type: 'local',
                });
              }
            });
            setIsServerStarted(true);
            addLog('Server started');
          });
        }
      }
    };

    // init();
    if (shareStorage) {
      init();
    }
  }, [isShareStorageReady]);

  const handleIncomingMessage = useCallback(
    (payload: share.ShareMessagePayloadEnum) => {
      switch (payload.t) {
        case share.ShareMessagePayloadType.GUEST_TO_HOST_HANDSHAKE:
          {
            addLog('Received HANDSHAKE');
            if (isServerStarted) {
              setClients((prev) => {
                // Avoid duplicates
                const exists = prev.find((c) => c.pushSubscription.endpoint === payload.o.pushSubscription.endpoint);
                if (exists) {
                  return prev;
                }
                // Save to DB
                if (payload.o.pushSubscription.endpoint) {
                  shareStorage?.remotePushSendStorage.put(payload.o);
                }
                return [...prev, payload.o];
              });
              addLog('New client connected!');
            }
          }
          break;
        default:
          console.warn('[Share] Unknown payload type:', payload);
      }
    },
    [isServerStarted, addLog, isShareStorageReady],
  );

  // Listen for SW messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      console.log('[Share] SW Message:', event.data);
      if (event.data && event.data.type === 'PUSH_RECEIVED') {
        handleIncomingMessage(event.data.payload);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [handleIncomingMessage]);

  const startServer = async () => {
    let readyReg: ServiceWorkerRegistration | null = null;
    try {
      readyReg = await navigator.serviceWorker.ready;
    } catch (e) {
      addLog('Service worker not ready. Is PWA registration running?');
      throw e;
    }

    let sub = await readyReg.pushManager.getSubscription();

    console.log({ sub });

    if (!sub) {
      const localPushSendId = crypto.randomUUID();
      const vapidKeys = await serializeVapidKeys(await generateVapidKeys());

      sub = await readyReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(vapidKeys.publicKey),
      });

      setLocalPushSubscription(sub);

      const localPushSendEntry = {
        id: localPushSendId,
        messageEncryption: {
          encoding: PushManager.supportedContentEncodings[0],
          p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')!))),
        },
        pushSubscription: {
          endpoint: sub.endpoint,
          expirationTime: sub.expirationTime,
        },
        vapidKeys,
      };

      await shareStorage?.localPushSendStorage.put(localPushSendEntry);
      addLog('Subscribed to push notifications');
    }

    setLocalPushSubscription(sub);

    shareStorage?.localPushSendStorage.getAll().then((all) => {
      if (all.length > 0) {
        setLocalPushSendOption({
          ...all[0],
          type: 'local',
        });
      }
    });
    setIsServerStarted(true);
    addLog('Server started');
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

    setIsBroadcasting(true);
    addLog('Starting asset broadcast...');

    await shareStorage?.latestAssetStorage.put(1, {
      contentType: assetMode === 'text' ? 'plain/text' : assetMode === 'image' ? 'image/webp' : 'application/zip',
      contentBase64: assetMode === 'text' ? compressedAssetText : assetMode === 'image' ? assetPayload : assetPayload,
      createdAt: Date.now(),
    });

    addLog('Asset saved to cache');

    if (clients.length === 0) {
      addLog('No clients connected. Asset registered locally.');
      setIsBroadcasting(false);
      return;
    }

    addLog(`Broadcasting asset to ${clients.length} clients...`);

    const failedEndpoints: string[] = [];

    for (const client of clients) {
      await navigator.serviceWorker.ready;
      const sw = navigator.serviceWorker.controller;
      if (sw && localPushSendOption) {
        sw.postMessage({
          type: 'SHARE_SEND',
          payloadString: JSON.stringify({
            t: share.ShareMessagePayloadType.ASSET_TRANSFER,
            c: assetMode === 'text' ? 'plain/text' : assetMode === 'image' ? 'image/webp' : 'application/zip',
            d: assetPayload,
          } satisfies share.AssetTransfer),
          remotePushSendOption: {
            ...client,
          } satisfies share.ShareRemotePushSendOptions,
          localPushSendOption: {
            ...localPushSendOption,
            type: 'local',
          } satisfies share.ShareLocalPushSendOptions,
        });
      } else {
        addLog('No active Service Worker controller found');
      }
    }

    if (failedEndpoints.length > 0) {
      setClients((prev) =>
        prev.filter((c) => c.pushSubscription.endpoint && !failedEndpoints.includes(c.pushSubscription.endpoint)),
      );

      // Remove from cache
      for (const endpoint of failedEndpoints) {
        await shareStorage?.remotePushSendStorage.getAll().then((all) => {
          const target = all.find((c) => c.pushSubscription.endpoint === endpoint);
          if (target) {
            shareStorage?.remotePushSendStorage.delete(target.id);
          }
        });
      }

      addLog(`Removed ${failedEndpoints.length} unreachable clients.`);
    }

    addLog('Broadcast complete');
    setIsBroadcasting(false);
  };

  const resetServer = async () => {
    setIsServerStarted(false);
    setClients([]);
    setIsBroadcasting(false);
    // Clear IndexedDB entries
    await shareStorage?.localPushSendStorage.clear();
    await shareStorage?.remotePushSendStorage.clear();
    await shareStorage?.latestAssetStorage.clear();
    await shareStorage?.receivedChunkedMessagesStorage.clear();
    // unregister service worker
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    addLog('Server reset complete');
    if (localPushSubscription) {
      localPushSubscription.unsubscribe();
      setLocalPushSubscription(null);
    }
  };

  return {
    localPushSendOption,
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
    startServer,
    registerAsset,
    resetServer,
  };
}
