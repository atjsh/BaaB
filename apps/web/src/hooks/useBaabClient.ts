import { decompress } from 'lz-string';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fromBase64Url, generateVapidKeys, serializeVapidKeys } from 'web-push-browser';

import { share } from '@baab/shared';

import { ShareStorageManager } from '../lib/storage/share.db';

interface UseBaabClientProps {
  addLog: (msg: string) => void;
}

export function useBaabClient({ addLog }: UseBaabClientProps) {
  const [localPushSubscription, setLocalPushSubscription] = useState<PushSubscription | null>(null);
  const [, setLocalPushSendOption] = useState<share.ShareLocalPushSendOptions | null>(null);
  const [isShareStorageReady, setIsShareStorageReady] = useState(false);
  const [shareStorage, setSharedStorage] = useState<ShareStorageManager>();
  useEffect(() => {
    ShareStorageManager.createInstance().then((instance) => {
      setSharedStorage(instance);
      setIsShareStorageReady(true);
    });
  }, []);
  const initializedRef = useRef(false);
  const [serverConfig, setServerConfig] = useState<share.ShareRemotePushSendOptions | null>(null);
  const [receivedAssets, setReceivedAssets] = useState<
    ({ type: 'text'; content: string } | { type: 'image'; content: string })[]
  >([]);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');

  const handleConnectData = useCallback(
    async (connectData: string) => {
      if (connectionStatus !== 'idle') return;
      try {
        const config = JSON.parse(atob(decodeURIComponent(connectData)));
        setServerConfig(config);
        await (await ShareStorageManager.createInstance()).remotePushSendStorage.put(config);
        addLog('Server configuration loaded');
        setConnectionStatus('connecting');
      } catch (e) {
        addLog('Error parsing connection data');
        console.error(e);
      }
    },
    [connectionStatus, isShareStorageReady],
  );

  // Load existing keys and subscription on mount
  useEffect(() => {
    if (!isShareStorageReady) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init = async () => {
      console.log({ ran: true });

      const remotePushSendConfigs = await shareStorage?.remotePushSendStorage.getAll();
      if (remotePushSendConfigs && remotePushSendConfigs.length > 0) {
        const config = remotePushSendConfigs[0];
        setServerConfig({
          ...config,
          type: 'remote',
        });
        addLog('Restored server configuration from storage');
      } else {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          const sub = await registration.pushManager.getSubscription();
          if (sub) {
            setLocalPushSubscription(sub);
            const localPushSendId = crypto.randomUUID();
            alert(`The localPushSendId is ${localPushSendId}`);
            const vapidKeys = await serializeVapidKeys(await generateVapidKeys());

            // const p256dh = sub.getKey('p256dh');
            // const auth = sub.getKey('auth');

            // if (!p256dh) {
            //   addLog('Subscription keys are missing');
            //   return;
            // }

            // if (!auth) {
            //   addLog('Subscription auth key is missing');
            //   return;
            // }

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
        }
      }
      setConnectionStatus('connecting');
    };
    init();
  }, [isShareStorageReady]);

  const connectToServer = async () => {
    if (!serverConfig) return;

    const localPushSends = await shareStorage?.localPushSendStorage.getAll();
    if (!localPushSends || localPushSends.length === 0) {
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
        alert(`The localPushSendId is ${localPushSendId}`);
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

        await navigator.serviceWorker.ready;
        const sw = navigator.serviceWorker.controller;
        if (sw) {
          sw.postMessage({
            type: 'SHARE_SEND',
            payloadString: JSON.stringify({
              t: share.ShareMessagePayloadType.GUEST_TO_HOST_HANDSHAKE,
              o: {
                type: 'remote',
                id: localPushSendEntry.id,
                messageEncryption: localPushSendEntry.messageEncryption,
                pushSubscription: localPushSendEntry.pushSubscription,
                vapidKeys: localPushSendEntry.vapidKeys,
              },
            } satisfies share.GuestToHostHandshake),
            remotePushSendOption: {
              ...serverConfig,
            } satisfies share.ShareRemotePushSendOptions,
            localPushSendOption: {
              ...localPushSendEntry,
              type: 'local',
            } satisfies share.ShareLocalPushSendOptions,
          });
        } else {
          addLog('No active Service Worker controller found');
        }

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
    } else {
      setLocalPushSendOption({
        ...localPushSends[0],
        type: 'local',
      });

      await navigator.serviceWorker.ready;
      const sw = navigator.serviceWorker.controller;
      if (sw) {
        sw.postMessage({
          type: 'SHARE_SEND',
          payloadString: JSON.stringify({
            t: share.ShareMessagePayloadType.GUEST_TO_HOST_HANDSHAKE,
            o: {
              type: 'remote',
              id: localPushSends[0].id,
              messageEncryption: localPushSends[0].messageEncryption,
              pushSubscription: localPushSends[0].pushSubscription,
              vapidKeys: localPushSends[0].vapidKeys,
            },
          } satisfies share.GuestToHostHandshake),
          remotePushSendOption: {
            ...serverConfig,
          } satisfies share.ShareRemotePushSendOptions,
          localPushSendOption: {
            ...localPushSends[0],
            type: 'local',
          } satisfies share.ShareLocalPushSendOptions,
        });
      } else {
        addLog('No active Service Worker controller found');
      }
    }
  };

  // Trigger connection when status is connecting
  useEffect(() => {
    if (connectionStatus === 'connecting' && serverConfig && isShareStorageReady) {
      connectToServer();
    }
  }, [connectionStatus, serverConfig, isShareStorageReady]);

  const processMessage = useCallback(
    (data: share.ShareMessagePayloadEnum) => {
      console.log({ 'data.t': data.t });

      switch (data.t) {
        case share.ShareMessagePayloadType.HANDSHAKE_ACK:
          addLog('Received HANDSHAKE_ACK from server');
          setConnectionStatus('connected');
          break;
        case share.ShareMessagePayloadType.ASSET_TRANSFER:
          {
            addLog('Received ASSET_TRANSFER message');

            const { d: assetPayload, c: contentType } = data;

            // original text serialization from the server:
            // btoa(unescape(encodeURIComponent(decompress(assetPayload))))

            const content = contentType === 'plain/text' ? decompress(assetPayload) : assetPayload;

            setReceivedAssets((prev) => [{ type: contentType === 'plain/text' ? 'text' : 'image', content }, ...prev]);
          }
          break;
        default:
          addLog(`Received unhandled message type: ${data.t}`);
          break;
      }
    },
    [isShareStorageReady],
  );

  const handleIncomingMessage = useCallback(
    (payload: share.ShareMessagePayloadEnum) => {
      console.log('[Receive] handleIncomingMessage payload:', payload);

      processMessage(payload);
    },
    [addLog, processMessage],
  );

  // Listen for SW messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      console.log('[Receive] SW Message:', event.data);
      if (event.data && event.data.type === 'PUSH_RECEIVED') {
        handleIncomingMessage(event.data.payload);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [handleIncomingMessage]);

  const resetClient = async () => {
    setServerConfig(null);
    setReceivedAssets([]);
    setConnectionStatus('idle');
    await shareStorage?.remotePushSendStorage.clear();
    await shareStorage?.localPushSendStorage.clear();
    await shareStorage?.receivedChunkedMessagesStorage.clear();
    await shareStorage?.latestAssetStorage.clear();
    // unregister service worker
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    addLog('Reset connection and cleared data');
    if (localPushSubscription) {
      localPushSubscription.unsubscribe();
      setLocalPushSubscription(null);
    }
  };

  return {
    serverConfig,
    receivedAssets,
    connectionStatus,
    handleConnectData,
    resetClient,
  };
}
