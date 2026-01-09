import type { ValueOf } from '../util';

/**
 * Settings IndexedDB store name
 */
export const SettingsIndexedDBStore = {
  settingsStorageName: 'app-settings',
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
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Omit<AppSettings, 'id'> = {
  usePushProxy: true,
  pushProxyHost: '',
};

/**
 * Type guard for AppSettings
 */
export function isAppSettings(obj: unknown): obj is AppSettings {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as AppSettings).id === 'number' &&
    typeof (obj as AppSettings).usePushProxy === 'boolean' &&
    typeof (obj as AppSettings).pushProxyHost === 'string'
  );
}
