import type { ValueOf } from '../util';

/**
 * VAPID keypair for Web Push
 */
export type VapidKeys = { publicKey: string; privateKey: string };

/**
 * Unified local push credentials shared across the app (chat & share features)
 *
 * Users can generate, revoke, and regenerate these credentials.
 * When credentials are updated, they should be propagated to all connected remotes.
 */
/**
 * Type of web push contact identifier
 * - 'random': Generated as `${randomUUID}@${window.origin}`
 * - 'fixed': User-provided value
 */
export type WebPushContactsType = 'random' | 'fixed';

export interface LocalPushCredentials {
  /**
   * UUID of these credentials
   */
  id: string;

  /**
   * Web Push contact identifier (used as VAPID subject)
   * Format depends on webPushContactsType:
   * - 'random': `${randomUUID}@${origin}`
   * - 'fixed': User-provided value (e.g., 'mailto:user@example.com')
   */
  webPushContacts: string;

  /**
   * Type of web push contact identifier
   */
  webPushContactsType: WebPushContactsType;

  /**
   * The browser's push subscription
   */
  pushSubscription: PushSubscriptionJSON;

  /**
   * VAPID keys for authenticating push messages
   */
  vapidKeys: VapidKeys;

  /**
   * Message encryption parameters from the push subscription
   */
  messageEncryption: {
    /**
     * Content encoding (e.g., 'aes128gcm')
     */
    encoding: (typeof PushManager.supportedContentEncodings)[number];
    /**
     * Public key for message encryption (base64url)
     */
    p256dh: string;
    /**
     * Authentication secret (base64url)
     */
    auth: string;
  };

  /**
   * Timestamp when credentials were created (ISO string)
   */
  createdAt: string;

  /**
   * Timestamp when credentials were last updated (ISO string)
   */
  updatedAt: string;
}

/**
 * Type guard for LocalPushCredentials
 */
export function isLocalPushCredentials(obj: unknown): obj is LocalPushCredentials {
  if (typeof obj !== 'object' || obj === null) return false;
  const creds = obj as LocalPushCredentials;
  return (
    typeof creds.id === 'string' &&
    typeof creds.webPushContacts === 'string' &&
    (creds.webPushContactsType === 'random' || creds.webPushContactsType === 'fixed') &&
    typeof creds.pushSubscription === 'object' &&
    creds.pushSubscription !== null &&
    typeof creds.vapidKeys === 'object' &&
    creds.vapidKeys !== null &&
    typeof creds.vapidKeys.publicKey === 'string' &&
    typeof creds.vapidKeys.privateKey === 'string' &&
    typeof creds.messageEncryption === 'object' &&
    creds.messageEncryption !== null &&
    typeof creds.messageEncryption.encoding === 'string' &&
    typeof creds.messageEncryption.p256dh === 'string' &&
    typeof creds.messageEncryption.auth === 'string' &&
    typeof creds.createdAt === 'string' &&
    typeof creds.updatedAt === 'string'
  );
}

/**
 * Settings IndexedDB store name
 */
export const SettingsIndexedDBStore = {
  settingsStorageName: 'app-settings',
  localPushCredentialsStorageName: 'local-push-credentials',
} as const;
export type SettingsIndexedDBStore = ValueOf<typeof SettingsIndexedDBStore>;

/**
 * Application settings
 */
export interface AppSettings {
  /**
   * Primary key for IndexedDB (always 1, singleton pattern)
   */
  id: number;

  /**
   * Whether to use push proxy server or send push directly
   */
  usePushProxy: boolean;

  /**
   * Custom push proxy server host URL
   * When empty/null, uses the default VITE_PROXY_URL
   */
  pushProxyHost: string;

  /**
   * Last time settings were updated (ISO string)
   */
  lastUpdatedAt: string | null;
}

/**
 * Type guard for AppSettings
 */
export function isAppSettings(obj: unknown): obj is AppSettings {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as AppSettings).id === 'number' &&
    typeof (obj as AppSettings).usePushProxy === 'boolean' &&
    typeof (obj as AppSettings).pushProxyHost === 'string' &&
    ((obj as AppSettings).lastUpdatedAt === null || typeof (obj as AppSettings).lastUpdatedAt === 'string')
  );
}
