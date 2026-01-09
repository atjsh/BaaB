import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { settings } from '@baab/shared';

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
});

function SettingsPage() {
  const [, setAppSettings] = useState<settings.AppSettings | null>(null);
  const [settingsStorage, setSettingsStorage] = useState<SettingsStorageManager | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Form state
  const [usePushProxy, setUsePushProxy] = useState(true);
  const [pushProxyHost, setPushProxyHost] = useState('');

  const defaultProxyUrl = import.meta.env.VITE_PROXY_URL || '';

  const addLog = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
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

  const handleSaveSettings = async () => {
    if (!settingsStorage) return;

    setIsSaving(true);
    try {
      const updated = await settingsStorage.settingsStorage.update({
        usePushProxy,
        pushProxyHost,
      });
      setAppSettings(updated);
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

  const handleResetPushSubscriptions = async () => {
    if (!confirm('This will reset all push subscriptions. You will need to create new sessions. Continue?')) {
      return;
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
  };

  const handleResetIndexedDB = async () => {
    if (
      !confirm(
        'This will delete ALL stored data including chat messages, share data, and settings. This cannot be undone. Continue?',
      )
    ) {
      return;
    }

    try {
      addLog('Resetting IndexedDB storages...');

      // Clear chat storage
      try {
        const chatStorage = await ChatStorageManager.createInstance();
        await chatStorage.localPushSendStorage.clear();
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
        await shareStorage.localPushSendStorage.clear();
        await shareStorage.remotePushSendStorage.clear();
        await shareStorage.receivedChunkedMessagesStorage.clear();
        await shareStorage.latestAssetStorage.clear();
        addLog('Share storage cleared');
      } catch (e) {
        addLog(`Failed to clear share storage: ${e}`);
      }

      // Clear settings storage
      if (settingsStorage) {
        await settingsStorage.settingsStorage.clear();
        addLog('Settings storage cleared');
      }

      addLog('IndexedDB reset complete. Refreshing page...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      addLog(`Failed to reset IndexedDB: ${error}`);
      console.error('Failed to reset IndexedDB:', error);
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
      <div className="mb-4">
        <Link to="/" className="text-blue-500 hover:underline">
          &larr; Back to Home
        </Link>
      </div>

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

          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="bg-blue-500 text-white px-4 py-2 rounded w-fit disabled:opacity-50 hover:bg-blue-600 transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </section>

      {/* Reset Section */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">Reset Options</h3>

        <div className="flex flex-col gap-4">
          <div className="border rounded p-4 bg-yellow-50">
            <h4 className="font-medium mb-2">Reset Push Subscriptions</h4>
            <p className="text-sm text-gray-600 mb-3">
              This will unsubscribe from all push notifications and unregister service workers. You will need to create
              new sessions after this.
            </p>
            <button
              onClick={handleResetPushSubscriptions}
              className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 transition-colors"
            >
              Reset Push Subscriptions
            </button>
          </div>

          <div className="border rounded p-4 bg-red-50">
            <h4 className="font-medium mb-2">Reset All Data (IndexedDB)</h4>
            <p className="text-sm text-gray-600 mb-3">
              This will delete ALL stored data including chat messages, conversations, share data, and settings.{' '}
              <strong>This action cannot be undone.</strong>
            </p>
            <button
              onClick={handleResetIndexedDB}
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
        <div className="logs p-3 bg-gray-100 rounded text-xs font-mono h-40 overflow-y-auto">
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
