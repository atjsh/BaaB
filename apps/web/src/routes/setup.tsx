import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { settings } from '@baab/shared';

import { useLocalPushCredentials } from '../hooks/useLocalPushCredentials';
import { SettingsStorageManager } from '../lib/storage/settings.db';

export const Route = createFileRoute('/setup')({
  component: SetupPage,
  head: () => ({
    meta: [
      {
        title: 'Setup - BaaB',
      },
      {
        name: 'description',
        content: 'Initial setup for BaaB application',
      },
    ],
  }),
  staticData: {
    breadcrumb: 'Setup',
  },
});

type SetupStep = 1 | 2 | 3;

function SetupPage() {
  const navigate = Route.useNavigate();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<SetupStep>(1);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings storage
  const [settingsStorage, setSettingsStorage] = useState<SettingsStorageManager | null>(null);
  const [isStorageLoading, setIsStorageLoading] = useState(true);

  // Push Proxy form state (Step 1)
  const [usePushProxy, setUsePushProxy] = useState(true);
  const [pushProxyHost, setPushProxyHost] = useState('');
  const defaultProxyUrl = import.meta.env.VITE_PROXY_URL || '';

  // Push Credentials form state (Step 2)
  const [webPushContactsType, setWebPushContactsType] = useState<settings.WebPushContactsType>('random');
  const [fixedContactValue, setFixedContactValue] = useState('');

  // Push credentials hook
  const {
    credentials: pushCredentials,
    isInitialized: isCredentialsInitialized,
    isLoading: isCredentialsLoading,
    error: credentialsError,
    initializeCredentials,
  } = useLocalPushCredentials();

  // Initialize storage
  useEffect(() => {
    const init = async () => {
      try {
        const storage = await SettingsStorageManager.createInstance();
        setSettingsStorage(storage);

        // Load existing settings if any
        const loadedSettings = await storage.settingsStorage.getOrDefault();
        setUsePushProxy(loadedSettings.usePushProxy);
        setPushProxyHost(loadedSettings.pushProxyHost);
      } catch (err) {
        console.error('Failed to initialize storage:', err);
        setError('Failed to initialize storage');
      } finally {
        setIsStorageLoading(false);
      }
    };

    init();
  }, []);

  // Redirect to settings if setup is already complete (credentials exist)
  useEffect(() => {
    if (isCredentialsInitialized && pushCredentials) {
      navigate({ to: '/settings', replace: true });
    }
  }, [isCredentialsInitialized, pushCredentials, navigate]);

  // Prevent back navigation during setup using history manipulation
  useEffect(() => {
    // Push a dummy state to prevent back navigation
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      // Push state again to prevent going back
      window.history.pushState(null, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Handle Step 1: Save Push Proxy settings and go to next step
  const handleStep1Next = async () => {
    if (!settingsStorage) {
      setError('Storage not initialized');
      return;
    }

    setError(null);

    try {
      const updated = await settingsStorage.settingsStorage.update({
        usePushProxy,
        pushProxyHost,
      });

      // Notify service worker about settings change
      const sw = navigator.serviceWorker?.controller;
      if (sw) {
        sw.postMessage({
          type: 'SETTINGS_UPDATED',
          payload: updated,
        });
      }

      setCurrentStep(2);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings');
    }
  };

  // Handle Step 2: Initialize credentials and complete setup
  const handleStep2Complete = async () => {
    // Validate fixed contact value if type is 'fixed'
    if (webPushContactsType === 'fixed' && !fixedContactValue.trim()) {
      setError('Please enter a contact value (e.g., mailto:you@example.com)');
      return;
    }

    setError(null);
    setIsCompleting(true);

    try {
      await initializeCredentials(
        webPushContactsType,
        webPushContactsType === 'fixed' ? fixedContactValue.trim() : undefined,
      );

      setCurrentStep(3);
    } catch (err) {
      console.error('Failed to initialize credentials:', err);
      setError('Failed to initialize credentials');
    } finally {
      setIsCompleting(false);
    }
  };

  // Handle completion: Navigate to home
  const handleGoToHome = () => {
    navigate({ to: '/', replace: true });
  };

  // Show loading state
  if (isStorageLoading || !isCredentialsInitialized) {
    return (
      <main className="p-5 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6">Setting up BaaB...</h1>
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  // If credentials already exist, show redirect message (will redirect via useEffect)
  if (pushCredentials) {
    return (
      <main className="p-5 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6">Setup Complete</h1>
        <p className="text-gray-500">Redirecting to settings...</p>
      </main>
    );
  }

  return (
    <main className="p-5 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">Welcome to BaaB</h1>
      <p className="text-gray-600 mb-6">Let's get you set up in just a few steps.</p>

      {/* Progress Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep === step
                  ? 'bg-blue-500 text-white'
                  : currentStep > step
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {currentStep > step ? '✓' : step}
            </div>
            {step < 3 && <div className={`w-8 h-0.5 ${currentStep > step ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Error Display */}
      {(error || credentialsError) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          {error || credentialsError}
        </div>
      )}

      {/* Step 1: Push Proxy Configuration */}
      {currentStep === 1 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Step 1: Push Proxy Configuration</h2>
          <p className="text-sm text-gray-600 mb-4">
            Configure how push messages are sent. You can change this later in Settings.
          </p>

          <div className="flex flex-col gap-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={usePushProxy}
                onChange={(e) => setUsePushProxy(e.target.checked)}
                className="w-5 h-5 rounded mt-0.5"
              />
              <div>
                <span className="font-medium">Use Push Proxy</span>
                <p className="text-sm text-gray-600">
                  When enabled, push messages are sent through a proxy server. This is recommended for better
                  reliability.
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
              onClick={handleStep1Next}
              className="mt-4 bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition-colors w-fit"
            >
              Next →
            </button>
          </div>
        </section>
      )}

      {/* Step 2: Push Credentials */}
      {currentStep === 2 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Step 2: Push Credentials</h2>
          <p className="text-sm text-gray-600 mb-4">
            Create your push credentials. These are used to send and receive messages securely.
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-medium mb-2">Web Push Contact</h3>
              <p className="text-sm text-gray-600 mb-3">
                Choose how your contact identifier is generated. This is visible to others you communicate with.
              </p>

              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="contactsType"
                    value="random"
                    checked={webPushContactsType === 'random'}
                    onChange={() => setWebPushContactsType('random')}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div>
                    <span className="font-medium">Random (Recommended)</span>
                    <p className="text-xs text-gray-500">Generated as UUID@{window.location.hostname}</p>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="contactsType"
                    value="fixed"
                    checked={webPushContactsType === 'fixed'}
                    onChange={() => setWebPushContactsType('fixed')}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div>
                    <span className="font-medium">Custom</span>
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

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-6 py-2 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleStep2Complete}
                disabled={isCompleting || isCredentialsLoading}
                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {isCompleting || isCredentialsLoading ? 'Setting up...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 3: Completion */}
      {currentStep === 3 && (
        <section className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-lg font-semibold mb-2">Setup Complete!</h2>
          <p className="text-sm text-gray-600 mb-6">
            Your BaaB is ready to use. You can now share files and chat with friends.
          </p>

          <CredentialsSummary />

          <button
            onClick={handleGoToHome}
            className="bg-blue-500 text-white px-8 py-3 rounded hover:bg-blue-600 transition-colors"
          >
            Get Started →
          </button>
        </section>
      )}
    </main>
  );

  function CredentialsSummary() {
    if (!pushCredentials) return null;

    return (
      <div className="text-left mb-6 p-4 bg-gray-50 rounded">
        <h3 className="font-medium mb-2">Your Web Push Contact</h3>
        <code className="text-xs bg-white border px-2 py-1 rounded block overflow-hidden text-ellipsis whitespace-nowrap">
          {pushCredentials.webPushContacts}
        </code>
      </div>
    );
  }
}
