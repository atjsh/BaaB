import { useCallback, useEffect, useState } from 'react';
import { fromBase64Url, generateVapidKeys, serializeVapidKeys } from 'web-push-browser';

import { settings } from '@baab/shared';

import { SettingsStorageManager } from '../lib/storage/settings.db';

export interface PropagationResult {
  chat: { success: number; failed: number };
  share: { success: number; failed: number };
}

export interface UseLocalPushCredentialsResult {
  /**
   * Current local push credentials (null if not initialized)
   */
  credentials: settings.LocalPushCredentials | null;

  /**
   * Whether the credentials system is initialized and ready
   */
  isInitialized: boolean;

  /**
   * Whether an operation is in progress
   */
  isLoading: boolean;

  /**
   * Error message if any operation failed
   */
  error: string | null;

  /**
   * Initialize credentials from storage or create new ones
   * This should be called when the app needs push credentials.
   * It will create new credentials if none exist.
   * @param contactsType - Type of contact identifier ('random' or 'fixed')
   * @param fixedContactValue - The fixed contact value (required when contactsType is 'fixed')
   */
  initializeCredentials: (
    contactsType?: settings.WebPushContactsType,
    fixedContactValue?: string,
  ) => Promise<settings.LocalPushCredentials | null>;

  /**
   * Revoke current credentials and generate new ones.
   * Call this when user wants to regenerate their VAPID keys.
   * @param contactsType - Type of contact identifier ('random' or 'fixed')
   * @param fixedContactValue - The fixed contact value (required when contactsType is 'fixed')
   * @param propagateToRemotes - Whether to propagate new credentials to connected remotes (default: true)
   * @returns The new credentials, or null if failed
   */
  regenerateCredentials: (
    contactsType?: settings.WebPushContactsType,
    fixedContactValue?: string,
    propagateToRemotes?: boolean,
  ) => Promise<settings.LocalPushCredentials | null>;

  /**
   * Revoke (delete) current credentials without regenerating.
   * This will unsubscribe from push and clear stored credentials.
   */
  revokeCredentials: () => Promise<void>;

  /**
   * Refresh the push subscription while keeping the same VAPID keys.
   * Useful when the push subscription expires.
   */
  refreshPushSubscription: () => Promise<settings.LocalPushCredentials | null>;

  /**
   * Propagate current credentials to all connected remotes.
   * @returns Promise that resolves when propagation request is sent
   */
  propagateToRemotes: () => Promise<void>;
}

/**
 * Hook for managing unified local push credentials across the app.
 *
 * This centralizes VAPID key generation and push subscription management.
 * Both chat and share features should use these credentials.
 */
export function useLocalPushCredentials(): UseLocalPushCredentialsResult {
  const [credentials, setCredentials] = useState<settings.LocalPushCredentials | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageManager, setStorageManager] = useState<SettingsStorageManager | null>(null);

  // Initialize storage on mount
  useEffect(() => {
    SettingsStorageManager.createInstance().then((manager) => {
      setStorageManager(manager);
    });
  }, []);

  // Load existing credentials when storage is ready
  useEffect(() => {
    if (!storageManager) return;

    storageManager.localPushCredentialsStorage
      .get()
      .then((existingCredentials) => {
        if (existingCredentials) {
          setCredentials(existingCredentials);
        }
        setIsInitialized(true);
      })
      .catch((err) => {
        console.error('Failed to load push credentials:', err);
        setError('Failed to load push credentials');
        setIsInitialized(true);
      });
  }, [storageManager]);

  /**
   * Generate new VAPID keys and create a push subscription
   * @param contactsType - Type of contact identifier ('random' or 'fixed')
   * @param fixedContactValue - The fixed contact value (required when contactsType is 'fixed')
   */
  const createNewCredentials = useCallback(
    async (
      contactsType: settings.WebPushContactsType = 'random',
      fixedContactValue?: string,
    ): Promise<settings.LocalPushCredentials | null> => {
      if (!('serviceWorker' in navigator)) {
        setError('Service Worker not supported');
        return null;
      }

      try {
        // Generate new VAPID keys
        const vapidKeys = await serializeVapidKeys(await generateVapidKeys());

        // Get service worker registration
        const registration = await navigator.serviceWorker.ready;

        // Unsubscribe from existing push subscription if any
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
          await existingSubscription.unsubscribe();
        }

        // Create new push subscription with the new VAPID public key
        const pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: fromBase64Url(vapidKeys.publicKey),
        });

        // Extract keys from subscription
        const subscriptionJSON = pushSubscription.toJSON();
        const p256dh = subscriptionJSON.keys?.p256dh;
        const auth = subscriptionJSON.keys?.auth;

        if (!p256dh || !auth) {
          throw new Error('Failed to get encryption keys from push subscription');
        }

        // Generate webPushContacts based on type
        let webPushContacts: string;
        if (contactsType === 'fixed') {
          if (!fixedContactValue) {
            throw new Error('Fixed contact value is required when contactsType is "fixed"');
          }
          webPushContacts = fixedContactValue;
        } else {
          // Generate random format: mailto:${randomUUID}@${origin}
          webPushContacts = `mailto:${crypto.randomUUID()}@${window.location.hostname}`;
        }

        const now = new Date().toISOString();
        const newCredentials: Omit<settings.LocalPushCredentials, 'id'> = {
          webPushContacts,
          webPushContactsType: contactsType,
          pushSubscription: {
            endpoint: pushSubscription.endpoint,
            expirationTime: pushSubscription.expirationTime,
          },
          vapidKeys,
          messageEncryption: {
            encoding: PushManager.supportedContentEncodings?.[0] || 'aes128gcm',
            p256dh,
            auth,
          },
          createdAt: now,
          updatedAt: now,
        };

        return newCredentials as settings.LocalPushCredentials;
      } catch (err) {
        console.error('Failed to create push credentials:', err);
        throw err;
      }
    },
    [],
  );

  const initializeCredentials = useCallback(
    async (
      contactsType: settings.WebPushContactsType = 'random',
      fixedContactValue?: string,
    ): Promise<settings.LocalPushCredentials | null> => {
      if (!storageManager) {
        setError('Storage not initialized');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Check for existing credentials
        const existing = await storageManager.localPushCredentialsStorage.get();
        if (existing) {
          setCredentials(existing);
          return existing;
        }

        // Create new credentials
        const newCredentials = await createNewCredentials(contactsType, fixedContactValue);
        if (!newCredentials) {
          return null;
        }

        // Save to storage
        const saved = await storageManager.localPushCredentialsStorage.put(newCredentials);
        setCredentials(saved);
        return saved;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize credentials';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [storageManager, createNewCredentials],
  );

  const regenerateCredentials = useCallback(
    async (
      contactsType: settings.WebPushContactsType = 'random',
      fixedContactValue?: string,
      propagateToRemotes = true,
    ): Promise<settings.LocalPushCredentials | null> => {
      if (!storageManager) {
        setError('Storage not initialized');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Delete existing credentials
        await storageManager.localPushCredentialsStorage.delete();

        // Create new credentials
        const newCredentials = await createNewCredentials(contactsType, fixedContactValue);
        if (!newCredentials) {
          return null;
        }

        // Save to storage
        const saved = await storageManager.localPushCredentialsStorage.put(newCredentials);

        console.log({ saved });

        // Propagate to all connected remotes
        if (propagateToRemotes && saved) {
          const sw = navigator.serviceWorker.controller;
          console.log({ sw, credentials });

          if (sw) {
            sw.postMessage({
              type: 'PROPAGATE_CREDENTIALS',
              localPushCredentials: saved,
              previousLocalPushCredentialId: credentials?.id,
            });
          }
        }

        setCredentials(saved);

        return saved;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to regenerate credentials';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [storageManager, createNewCredentials, credentials],
  );

  const propagateToRemotes = useCallback(async (): Promise<void> => {
    if (!credentials) {
      setError('No credentials to propagate');
      return;
    }

    const sw = navigator.serviceWorker.controller;
    if (sw) {
      sw.postMessage({
        type: 'PROPAGATE_CREDENTIALS',
        localPushCredentials: credentials,
        previousLocalPushCredentialId: credentials.id,
      });
    } else {
      setError('Service Worker not available');
    }
  }, [credentials]);

  const revokeCredentials = useCallback(async (): Promise<void> => {
    if (!storageManager) {
      setError('Storage not initialized');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Unsubscribe from push
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }

      // Delete from storage
      await storageManager.localPushCredentialsStorage.delete();
      setCredentials(null);
      console.log('nullify called');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke credentials';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [storageManager]);

  const refreshPushSubscription = useCallback(async (): Promise<settings.LocalPushCredentials | null> => {
    if (!storageManager) {
      setError('Storage not initialized');
      return null;
    }

    const existingCredentials = await storageManager.localPushCredentialsStorage.get();
    if (!existingCredentials) {
      // No existing credentials, initialize new ones
      return initializeCredentials();
    }

    setIsLoading(true);
    setError(null);

    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker not supported');
      }

      const registration = await navigator.serviceWorker.ready;

      // Unsubscribe from existing
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        await existingSubscription.unsubscribe();
      }

      // Create new subscription with existing VAPID keys
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(existingCredentials.vapidKeys.publicKey),
      });

      // Extract keys from subscription
      const subscriptionJSON = pushSubscription.toJSON();
      const p256dh = subscriptionJSON.keys?.p256dh;
      const auth = subscriptionJSON.keys?.auth;

      if (!p256dh || !auth) {
        throw new Error('Failed to get encryption keys from push subscription');
      }

      // Update credentials with new subscription
      const updated = await storageManager.localPushCredentialsStorage.update({
        pushSubscription: {
          endpoint: pushSubscription.endpoint,
          expirationTime: pushSubscription.expirationTime,
        },
        messageEncryption: {
          encoding: PushManager.supportedContentEncodings?.[0] || 'aes128gcm',
          p256dh,
          auth,
        },
      });

      if (updated) {
        setCredentials(updated);
      }
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh push subscription';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [storageManager, initializeCredentials]);

  return {
    credentials,
    isInitialized,
    isLoading,
    error,
    initializeCredentials,
    regenerateCredentials,
    revokeCredentials,
    refreshPushSubscription,
    propagateToRemotes,
  };
}
