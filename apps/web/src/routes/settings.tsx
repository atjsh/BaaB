import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { settings } from '@baab/shared';

import { useLocalPushCredentials, type PropagationResult } from '../hooks/useLocalPushCredentials';
import { ChatStorageManager } from '../lib/storage/chat.db';
import { SettingsStorageManager } from '../lib/storage/settings.db';
import { ShareStorageManager } from '../lib/storage/share.db';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Configure your BaaB application settings',
      },
      {
        title: 'Settings - BaaB',
      },
    ],
  }),
  staticData: {
    breadcrumb: 'Settings',
  },
});

function SettingsPage() {
  const [, setAppSettings] = useState<settings.AppSettings | null>(null);
  const [settingsStorage, setSettingsStorage] = useState<SettingsStorageManager | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  // Form state
  const [usePushProxy, setUsePushProxy] = useState(true);
  const [pushProxyHost, setPushProxyHost] = useState('');

  // Push credentials state
  const {
    credentials: pushCredentials,
    isInitialized: isCredentialsInitialized,
    isLoading: isCredentialsLoading,
    error: credentialsError,
    regenerateCredentials,
    initializeCredentials,
    propagateToRemotes,
  } = useLocalPushCredentials();
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Web Push Contacts form state
  const [webPushContactsType, setWebPushContactsType] = useState<settings.WebPushContactsType>('random');
  const [fixedContactValue, setFixedContactValue] = useState('');
  const [isPropagating, setIsPropagating] = useState(false);
  const [propagationResult, setPropagationResult] = useState<PropagationResult | null>(null);
  const [connectedRemotesCount, setConnectedRemotesCount] = useState<{ chat: number; share: number }>({
    chat: 0,
    share: 0,
  });
  const defaultProxyUrl = import.meta.env.VITE_PROXY_URL || '';

  const addLog = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const formatLastUpdated = (isoString: string | null): string => {
    if (!isoString) return '';

    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);

    // Show "Just Now" if updated within the last 10 seconds
    if (diffSeconds < 10) {
      return 'Just Now';
    }

    // Format as YYYY/MM/DD HH:MM:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `at ${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  // Initialize storage and load settings
  useEffect(() => {
    const init = async () => {
      try {
        const storage = await SettingsStorageManager.createInstance();
        setSettingsStorage(storage);

        const loadedSettings = await storage.settingsStorage.getOrDefault();
        setAppSettings(loadedSettings);
        setUsePushProxy(loadedSettings.usePushProxy);
        setPushProxyHost(loadedSettings.pushProxyHost);
        setLastUpdatedAt(loadedSettings.lastUpdatedAt);

        // Load connected remotes count
        const chatStorage = await ChatStorageManager.createInstance();
        const shareStorage = await ShareStorageManager.createInstance();
        const chatRemotes = await chatStorage.remotePushSendStorage.getAll();
        const shareRemotes = await shareStorage.remotePushSendStorage.getAll();
        setConnectedRemotesCount({ chat: chatRemotes.length, share: shareRemotes.length });

        addLog('Settings loaded');
      } catch (error) {
        addLog(`Failed to load settings: ${error}`);
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // Listen for propagation results from service worker
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CREDENTIALS_PROPAGATED') {
        const results = event.data.results as PropagationResult;
        setPropagationResult(results);
        setIsPropagating(false);
        addLog(
          `Credentials propagated: Chat ${results.chat.success}/${results.chat.success + results.chat.failed}, Share ${results.share.success}/${results.share.success + results.share.failed}`,
        );
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  }, []);

  const handleSaveSettings = async () => {
    if (!settingsStorage) return;

    setIsSaving(true);
    try {
      const updated = await settingsStorage.settingsStorage.update({
        usePushProxy,
        pushProxyHost,
      });
      setAppSettings(updated);
      setLastUpdatedAt(updated.lastUpdatedAt);
      addLog('Settings saved');

      // Notify service worker about settings change
      const sw = navigator.serviceWorker.controller;
      if (sw) {
        sw.postMessage({
          type: 'SETTINGS_UPDATED',
          payload: updated,
        });
        addLog('Service Worker notified of settings change');
      }
    } catch (error) {
      addLog(`Failed to save settings: ${error}`);
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateCredentials = async () => {
    // Validate fixed contact value if type is 'fixed'
    if (webPushContactsType === 'fixed' && !fixedContactValue.trim()) {
      addLog('Error: Fixed contact value is required');
      return;
    }

    const totalRemotes = connectedRemotesCount.chat + connectedRemotesCount.share;
    const confirmMessage =
      totalRemotes > 0
        ? `This will generate new VAPID keys and propagate them to ${totalRemotes} connected remote(s). Continue?`
        : 'This will generate new VAPID keys for your push credentials. Continue?';

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsRegenerating(true);
    setPropagationResult(null);
    addLog(`Regenerating credentials with ${webPushContactsType} contact...`);

    try {
      const newCredentials = await regenerateCredentials(
        webPushContactsType,
        webPushContactsType === 'fixed' ? fixedContactValue.trim() : undefined,
        totalRemotes > 0,
      );
      if (newCredentials) {
        addLog(`New credentials generated (ID: ${newCredentials.id.slice(0, 8)}...)`);
        addLog(`Contact: ${newCredentials.webPushContacts}`);
        if (totalRemotes > 0) {
          setIsPropagating(true);
          addLog('Propagating to connected remotes...');
        }
      } else {
        addLog('Failed to regenerate credentials');
      }
    } catch (error) {
      addLog(`Error regenerating credentials: ${error}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handlePropagateCredentials = async () => {
    if (!pushCredentials) {
      addLog('No credentials to propagate');
      return;
    }

    const totalRemotes = connectedRemotesCount.chat + connectedRemotesCount.share;
    if (totalRemotes === 0) {
      addLog('No connected remotes to propagate to');
      return;
    }

    setIsPropagating(true);
    setPropagationResult(null);
    addLog('Propagating credentials to connected remotes...');

    try {
      await propagateToRemotes();
    } catch (error) {
      addLog(`Error propagating credentials: ${error}`);
      setIsPropagating(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addLog(`${label} copied to clipboard`);
    } catch (error) {
      addLog(`Failed to copy ${label}: ${error}`);
    }
  };

  const handleReset = async () => {
    if (!confirm('This will delete ALL stored data. This cannot be undone. Continue?')) {
      return;
    }

    try {
      addLog('Resetting IndexedDB storages...');

      // Clear chat storage
      try {
        const chatStorage = await ChatStorageManager.createInstance();
        await chatStorage.remotePushSendStorage.clear();
        await chatStorage.receivedChunkedMessagesStorage.clear();
        await chatStorage.chatMessagesStorage.clear();
        await chatStorage.conversationsStorage.clear();
        addLog('Chat storage cleared');
      } catch (e) {
        addLog(`Failed to clear chat storage: ${e}`);
      }

      // Clear share storage
      try {
        const shareStorage = await ShareStorageManager.createInstance();
        await shareStorage.remotePushSendStorage.clear();
        await shareStorage.receivedChunkedMessagesStorage.clear();
        await shareStorage.latestAssetStorage.clear();
        addLog('Share storage cleared');
      } catch (e) {
        addLog(`Failed to clear share storage: ${e}`);
      }

      // Clear settings storage (including push credentials)
      if (settingsStorage) {
        await settingsStorage.settingsStorage.clear();
        await settingsStorage.localPushCredentialsStorage.clear();
        addLog('Settings storage cleared');
      }

      try {
        addLog('Resetting push subscriptions...');

        // Unsubscribe from push
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
              await subscription.unsubscribe();
              addLog('Unsubscribed from push notifications');
            }
            await registration.unregister();
            addLog('Service worker unregistered');
          }
        }

        addLog('Push subscriptions reset complete. Refreshing page...');
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        addLog(`Failed to reset push subscriptions: ${error}`);
        console.error('Failed to reset push subscriptions:', error);
      }

      addLog('Reset complete. Refreshing page...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      addLog(`Failed to reset data: ${error}`);
      console.error('Failed to reset data:', error);
    }
  };

  if (isLoading) {
    return (
      <main className="p-5 max-w-2xl">
        <h2 className="text-xl font-bold mb-4">Settings</h2>
        <p className="text-gray-500">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="p-5 max-w-2xl">
      <h2 className="text-xl font-bold mb-6">Settings</h2>

      {/* Push Proxy Settings Section */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">Push Proxy Configuration</h3>

        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={usePushProxy}
              onChange={(e) => setUsePushProxy(e.target.checked)}
              className="w-5 h-5 rounded"
            />
            <div>
              <span className="font-medium">Use Push Proxy</span>
              <p className="text-sm text-gray-600">
                When enabled, push messages are sent through a proxy server. When disabled, messages are sent directly
                to push endpoints.
              </p>
            </div>
          </label>

          {usePushProxy && (
            <div className="ml-8">
              <label className="block mb-2">
                <span className="font-medium">Push Proxy Server Host</span>
                <p className="text-sm text-gray-600 mb-2">
                  Leave empty to use the default proxy server{defaultProxyUrl ? ` (${defaultProxyUrl})` : ''}.
                </p>
              </label>
              <input
                type="url"
                value={pushProxyHost}
                onChange={(e) => setPushProxyHost(e.target.value)}
                placeholder={defaultProxyUrl || 'https://your-proxy-server.com'}
                className="w-full border px-3 py-2 rounded text-sm"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="bg-blue-500 text-white px-4 py-2 rounded w-fit disabled:opacity-50 hover:bg-blue-600 transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Push Configuration'}
            </button>
            {lastUpdatedAt && <span className="text-sm text-gray-500">Updated {formatLastUpdated(lastUpdatedAt)}</span>}
          </div>
        </div>
      </section>

      {/* Push Credentials Section */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">Push Credentials</h3>

        {!isCredentialsInitialized ? (
          <p className="text-gray-500">Loading credentials...</p>
        ) : credentialsError ? (
          <div className="border rounded p-4 bg-red-50">
            <p className="text-red-600">{credentialsError}</p>
            <button
              onClick={() =>
                initializeCredentials(
                  webPushContactsType,
                  webPushContactsType === 'fixed' ? fixedContactValue.trim() : undefined,
                )
              }
              className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Initialize Credentials
            </button>
          </div>
        ) : pushCredentials ? (
          <div className="flex flex-col gap-4">
            {/* Web Push Contacts Display */}
            <div className="border rounded p-4 bg-green-50">
              <h4 className="font-medium mb-2">Your Web Push Contact</h4>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white border px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {pushCredentials.webPushContacts}
                </code>
              </div>
              <p className=" mt-2">Note: Others can see your Web Push Contact.</p>
            </div>
            {/* VAPID Public Key */}
            <div className="border rounded p-4 bg-gray-50 hidden">
              <h4 className="font-medium mb-2">VAPID Public Key</h4>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white border px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {pushCredentials.vapidKeys.publicKey}
                </code>
                <button
                  onClick={() => copyToClipboard(pushCredentials.vapidKeys.publicKey, 'Public key')}
                  className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Credential ID: {pushCredentials.id.slice(0, 8)}...</p>
              {pushCredentials.createdAt && (
                <p className="text-xs text-gray-500">Created: {new Date(pushCredentials.createdAt).toLocaleString()}</p>
              )}
              {pushCredentials.updatedAt && pushCredentials.updatedAt !== pushCredentials.createdAt && (
                <p className="text-xs text-gray-500">Updated: {new Date(pushCredentials.updatedAt).toLocaleString()}</p>
              )}
            </div>

            {/* Connected Remotes */}
            <div className="border rounded p-4 bg-blue-50">
              <h4 className="font-medium mb-2">Connected Remotes</h4>
              <p className="text-sm text-gray-600">
                <span className="font-medium">{connectedRemotesCount.chat}</span> chat conversation(s),{' '}
                <span className="font-medium">{connectedRemotesCount.share}</span> share connection(s)
              </p>
              {connectedRemotesCount.chat + connectedRemotesCount.share > 0 && (
                <button
                  onClick={handlePropagateCredentials}
                  disabled={isPropagating}
                  className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {isPropagating ? 'Propagating...' : 'Propagate Credentials to Remotes'}
                </button>
              )}
              {propagationResult && (
                <p className="text-sm text-green-600 mt-2">
                  ✓ Sent to {propagationResult.chat.success + propagationResult.share.success} remote(s)
                  {propagationResult.chat.failed + propagationResult.share.failed > 0 && (
                    <span className="text-red-600">
                      , {propagationResult.chat.failed + propagationResult.share.failed} failed
                    </span>
                  )}
                </p>
              )}
            </div>
            {/* Regenerate Credentials */}
            <div className="border rounded p-4 bg-yellow-50">
              <h4 className="font-medium mb-2">Revoke & Regenerate</h4>
              <p className="text-sm text-gray-600 mb-3">
                Generate new VAPID keys. This will invalidate your current credentials and notify all connected remotes
                of the change.
              </p>
              <div className="mb-4">
                <h5 className=" mb-2">Web Push Contacts</h5>
                <p className="text-sm text-gray-600 mb-3">
                  Choose how the contact identifier is generated when regenerating credentials.
                </p>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="contactsType"
                      value="random"
                      checked={webPushContactsType === 'random'}
                      onChange={() => setWebPushContactsType('random')}
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="font-medium">Random</span>
                      <p className="text-xs text-gray-500">Generated as UUID@{window.location.hostname}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="contactsType"
                      value="fixed"
                      checked={webPushContactsType === 'fixed'}
                      onChange={() => setWebPushContactsType('fixed')}
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="font-medium">Fixed</span>
                      <p className="text-xs text-gray-500">User-provided value (e.g., mailto:you@example.com)</p>
                    </div>
                  </label>
                  {webPushContactsType === 'fixed' && (
                    <div className="ml-6">
                      <input
                        type="text"
                        value={fixedContactValue}
                        onChange={(e) => setFixedContactValue(e.target.value)}
                        placeholder="mailto:you@example.com or https://example.com"
                        className="w-full border px-3 py-2 rounded text-sm bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleRegenerateCredentials}
                disabled={isRegenerating || isCredentialsLoading}
                className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 transition-colors disabled:opacity-50"
              >
                {isRegenerating ? 'Regenerating...' : 'Revoke & Regenerate Credentials'}
              </button>
            </div>
          </div>
        ) : (
          <div className="border rounded p-4 bg-gray-50">
            <p className="text-gray-600 mb-3">No push credentials found. Initialize to enable push messaging.</p>

            {/* Contact Type Selection for New Credentials */}
            <div className="mb-4">
              <h4 className="font-medium mb-2">Contact Type</h4>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="initContactsType"
                    value="random"
                    checked={webPushContactsType === 'random'}
                    onChange={() => setWebPushContactsType('random')}
                    className="w-4 h-4"
                  />
                  <div>
                    <span className="font-medium">Random</span>
                    <p className="text-xs text-gray-500">Generated as UUID@{window.location.hostname}</p>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="initContactsType"
                    value="fixed"
                    checked={webPushContactsType === 'fixed'}
                    onChange={() => setWebPushContactsType('fixed')}
                    className="w-4 h-4"
                  />
                  <div>
                    <span className="font-medium">Fixed</span>
                    <p className="text-xs text-gray-500">User-provided value (e.g., mailto:you@example.com)</p>
                  </div>
                </label>
                {webPushContactsType === 'fixed' && (
                  <div className="ml-6">
                    <input
                      type="text"
                      value={fixedContactValue}
                      onChange={(e) => setFixedContactValue(e.target.value)}
                      placeholder="mailto:you@example.com or https://example.com"
                      className="w-full border px-3 py-2 rounded text-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (webPushContactsType === 'fixed' && !fixedContactValue.trim()) {
                  addLog('Error: Fixed contact value is required');
                  return;
                }
                initializeCredentials(
                  webPushContactsType,
                  webPushContactsType === 'fixed' ? fixedContactValue.trim() : undefined,
                );
              }}
              disabled={isCredentialsLoading}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isCredentialsLoading ? 'Initializing...' : 'Initialize Credentials'}
            </button>
          </div>
        )}
      </section>

      {/* Reset Section */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">Reset Options</h3>

        <div className="flex flex-col gap-4">
          <div className="border rounded p-4 bg-red-50">
            <h4 className="font-medium mb-2">Reset All Data</h4>
            <ul className="list-disc list-inside text-sm text-gray-600 mb-4">
              <li>Web Push credentials</li>
              <li>Settings</li>
              <li>File sharing sessions</li>
              <li>Chat messages and conversations</li>
            </ul>
            <button
              onClick={handleReset}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
            >
              Reset All Data
            </button>
          </div>
        </div>
      </section>

      {/* Logs Section */}
      <section>
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">Activity Log</h3>
        <div className="logs p-3 bg-gray-200 rounded text-xs font-mono h-40 overflow-y-auto">
          {logs.length === 0 ? (
            <span className="text-gray-500">No activity yet</span>
          ) : (
            logs.map((log, i) => <div key={i}>{log}</div>)
          )}
        </div>
      </section>
    </main>
  );
}
