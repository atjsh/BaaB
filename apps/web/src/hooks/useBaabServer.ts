import { compress, decompress } from 'lz-string';
import { useCallback, useEffect, useState } from 'react';

import { settings, share } from '@baab/shared';

import { ShareStorageManager } from '../lib/storage/share.db';
import { useLocalPushCredentials } from './useLocalPushCredentials';

interface UseBaabServerProps {
  addLog: (msg: string) => void;
}

export function useBaabServer({ addLog }: UseBaabServerProps) {
  const [isShareStorageReady, setIsShareStorageReady] = useState(false);
  const [shareStorage, setSharedStorage] = useState<ShareStorageManager>();

  const {
    credentials: localPushCredentials,
    isInitialized: isCredentialsInitialized,
    initializeCredentials,
  } = useLocalPushCredentials();

  useEffect(() => {
    ShareStorageManager.createInstance().then((instance) => {
      setSharedStorage(instance);
      setIsShareStorageReady(true);
    });
  }, []);

  const [isServerStarted, setIsServerStarted] = useState(false);
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

  // Initialize server when credentials are ready
  useEffect(() => {
    const init = async () => {
      if (!shareStorage || !isCredentialsInitialized) return;

      // Restore server state from IndexedDB
      const latestAsset = await shareStorage.latestAssetStorage.get(1);
      if (latestAsset) {
        setIsServerStarted(true);
        addLog('Restored Server mode');
      }

      // If we have credentials, consider server started
      if (localPushCredentials) {
        setIsServerStarted(true);
        addLog('Server started with existing credentials');
      }
    };

    init();
  }, [isShareStorageReady, isCredentialsInitialized, localPushCredentials]);

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
      console.log({ event });

      if (event.data && event.data.type === 'PUSH_RECEIVED' && share.isShareMessagePayload(event.data.payload)) {
        handleIncomingMessage(event.data.payload.fullMessage);
      }
      if (event.data?.type === 'REMOTE_FORGOTTEN' && event.data.context === 'share') {
        const { remoteId } = event.data;
        // Remove from local clients list
        setClients((prev) => prev.filter((c) => c.id !== remoteId));
        addLog(`Client ${remoteId.slice(0, 8)} disconnected after repeated failures`);

        // Show notification
        const notification = new Notification('Client Disconnected', {
          body: `A share client is no longer reachable.`,
          tag: `share-remote-forgotten-${remoteId}`,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [handleIncomingMessage, addLog]);

  const startServer = async () => {
    // Initialize credentials if not already done
    const credentials = await initializeCredentials();
    if (!credentials) {
      addLog('Failed to initialize push credentials');
      return;
    }

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
      if (sw && localPushCredentials) {
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
          localPushCredentials: localPushCredentials satisfies settings.LocalPushCredentials,
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
    await shareStorage?.remotePushSendStorage.clear();
    await shareStorage?.latestAssetStorage.clear();
    await shareStorage?.receivedChunkedMessagesStorage.clear();
    // unregister service worker
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    addLog('Server reset complete');
  };

  return {
    localPushCredentials,
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
