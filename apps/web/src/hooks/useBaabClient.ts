import { decompress } from 'lz-string';
import { useCallback, useEffect, useRef, useState } from 'react';

import { settings, share } from '@baab/shared';

import { ShareStorageManager } from '../lib/storage/share.db';
import { useLocalPushCredentials } from './useLocalPushCredentials';

interface UseBaabClientProps {
  addLog: (msg: string) => void;
}

export function useBaabClient({ addLog }: UseBaabClientProps) {
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

  // Load existing server config on mount
  useEffect(() => {
    if (!isShareStorageReady) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    const init = async () => {
      const remotePushSendConfigs = await shareStorage?.remotePushSendStorage.getAll();
      if (remotePushSendConfigs && remotePushSendConfigs.length > 0) {
        const config = remotePushSendConfigs[0];
        setServerConfig({
          ...config,
          type: 'remote',
        });
        addLog('Restored server configuration from storage');
        setConnectionStatus('connecting');
      }
    };
    init();
  }, [isShareStorageReady]);

  const connectToServer = async () => {
    if (!serverConfig) return;

    // Initialize credentials if needed
    const credentials = localPushCredentials || (await initializeCredentials());
    if (!credentials) {
      addLog('Failed to initialize push credentials');
      return;
    }

    await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller;
    if (sw) {
      sw.postMessage({
        type: 'SHARE_SEND',
        payloadString: JSON.stringify({
          t: share.ShareMessagePayloadType.GUEST_TO_HOST_HANDSHAKE,
          o: share.toShareRemotePushSendOptions(credentials),
        } satisfies share.GuestToHostHandshake),
        remotePushSendOption: {
          ...serverConfig,
        } satisfies share.ShareRemotePushSendOptions,
        localPushCredentials: credentials satisfies settings.LocalPushCredentials,
      });
      addLog('Handshake sent to server');
    } else {
      addLog('No active Service Worker controller found');
    }
  };

  // Trigger connection when status is connecting
  useEffect(() => {
    if (connectionStatus === 'connecting' && serverConfig && isShareStorageReady && isCredentialsInitialized) {
      connectToServer();
    }
  }, [connectionStatus, serverConfig, isShareStorageReady, isCredentialsInitialized]);

  const processMessage = useCallback(
    (data: share.ShareMessagePayloadEnum) => {
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
      processMessage(payload);
    },
    [addLog, processMessage],
  );

  // Listen for SW messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PUSH_RECEIVED' && share.isShareMessagePayload(event.data.payload)) {
        handleIncomingMessage(event.data.payload.fullMessage);
      }
      if (event.data?.type === 'REMOTE_FORGOTTEN' && event.data.context === 'share') {
        const { remoteId } = event.data;
        addLog(`Server ${remoteId.slice(0, 8)} disconnected after repeated failures`);
        setConnectionStatus('idle');
        setServerConfig(null);

        // Show notification
        const notification = new Notification('Server Disconnected', {
          body: `The share server is no longer reachable. You may need to reconnect.`,
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

  const resetClient = async () => {
    setServerConfig(null);
    setReceivedAssets([]);
    setConnectionStatus('idle');
    await shareStorage?.remotePushSendStorage.clear();
    await shareStorage?.receivedChunkedMessagesStorage.clear();
    await shareStorage?.latestAssetStorage.clear();
    // unregister service worker
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    addLog('Reset connection and cleared data');
  };

  return {
    serverConfig,
    receivedAssets,
    connectionStatus,
    handleConnectData,
    resetClient,
  };
}
