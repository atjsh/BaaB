import type { ValueOf } from '../util';
import type { LocalPushCredentials } from '../settings/types';

// Re-export from settings for backward compatibility
export type { VapidKeys } from '../settings/types';

/**
 * Convert LocalPushCredentials to ShareRemotePushSendOptions format (for sharing with remote party)
 */
export function toShareRemotePushSendOptions(credentials: LocalPushCredentials): ShareRemotePushSendOptions {
  return {
    id: credentials.id,
    type: 'remote',
    pushSubscription: credentials.pushSubscription,
    vapidKeys: credentials.vapidKeys,
    messageEncryption: credentials.messageEncryption,
    webPushContacts: credentials.webPushContacts,
  };
}

/**
 * Web Push send options for "remote" side
 */
export interface ShareRemotePushSendOptions {
  /**
   * UUID of this PushSendOptions
   */
  id: string;
  type: 'remote';
  pushSubscription: PushSubscriptionJSON;
  vapidKeys: {
    privateKey: string;
    publicKey: string;
  };
  messageEncryption: {
    encoding: (typeof PushManager.supportedContentEncodings)[number];
    p256dh: string;
    auth: string;
  };
  webPushContacts: string;
  /**
   * Number of consecutive failed push attempts for this remote
   */
  failedAttempts?: number;
}

/**
 * Share message payload types
 */
export const ShareMessagePayloadType = {
  /**
   * 1. Guest -> Host: Handshake Request
   */
  GUEST_TO_HOST_HANDSHAKE: '1',

  /**
   * 2. Host -> Guest: Handshake Acknowledgement
   */
  HANDSHAKE_ACK: '2',

  /**
   * 3. Host <-> Guest: Asset Transfer
   */
  ASSET_TRANSFER: '3',

  /**
   * 4. Host <-> Guest: Credentials Update (propagate new VAPID keys)
   */
  CREDENTIALS_UPDATE: '4',
} as const;
export type ShareMessagePayloadType = ValueOf<typeof ShareMessagePayloadType>;

/**
 * Guest -> Host: Handshake Request payload
 */
export interface GuestToHostHandshake {
  /**
   * Payload type
   */
  t: typeof ShareMessagePayloadType.GUEST_TO_HOST_HANDSHAKE;

  /**
   * Guest's PushSendOptions (Usage: Host->Guest)
   */
  o: ShareRemotePushSendOptions;
}

/**
 * Host -> Guest: Handshake Acknowledgement payload
 */
export interface HandshakeAck {
  /**
   * Payload type
   */
  t: typeof ShareMessagePayloadType.HANDSHAKE_ACK;
}

/**
 * Host <-> Guest: Share Message payload
 */
export interface AssetTransfer {
  /**
   * Payload type
   */
  t: typeof ShareMessagePayloadType.ASSET_TRANSFER;
  /**
   * Message content (base64 encoded)
   */
  d: string;

  /**
   * Message content type, as in MIME type (text/plain, image/webp, etc.)
   */
  c: string;
}

/**
 * Host <-> Guest: Credentials Update payload
 * Sent when a user regenerates their VAPID keys to update the remote's stored credentials
 */
export interface CredentialsUpdate {
  /**
   * Payload type
   */
  t: typeof ShareMessagePayloadType.CREDENTIALS_UPDATE;

  /**
   * Updated remote push send options
   */
  o: ShareRemotePushSendOptions;

  /**
   * ID of the remote whose credentials are being updated
   */
  p: string;
}

export type ShareMessagePayloadEnum = GuestToHostHandshake | HandshakeAck | AssetTransfer | CredentialsUpdate;

/**
 * The full share message payload
 */
export interface ShareMessagePayload {
  /**
   * ID of the full message (random integer)
   */
  id: number;

  /**
   * Full reconstructed message payload
   */
  fullMessage: ShareMessagePayloadEnum;
}

export function isShareMessagePayload(obj: any): obj is ShareMessagePayload {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.fullMessage === 'object' &&
    obj.fullMessage !== null &&
    typeof obj.fullMessage.t === 'string' &&
    Object.values(ShareMessagePayloadType).includes(obj.fullMessage.t)
  );
}

/**
 * Chunked payload created from ShareMessagePayload
 */
export interface ChunkedShareMessagePayload {
  /**
   * Type of this payload chunk (always 's' for "ShareMessagePayload")
   */
  t: 's';

  /**
   * ID of the sender (UUID)
   */
  fr: string;

  /**
   * ID of the chunked message (random integer)
   */
  id: number;

  /**
   * ID of the full message (random integer)
   */
  mid: number;

  /**
   * Index of this chunk (0-based)
   */
  i: number;

  /**
   * Total number of chunks in the full message
   */
  all: number;

  /**
   * Data of this chunk (base64 encoded, expected to be UTF-8 JSON)
   */
  d: string;
}

export function isChunkedShareMessagePayload(obj: any): obj is ChunkedShareMessagePayload {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    obj.t === 's' &&
    typeof obj.fr === 'string' &&
    typeof obj.id === 'number' &&
    typeof obj.i === 'number' &&
    typeof obj.all === 'number' &&
    typeof obj.d === 'string'
  );
}

/**
 * The metadata & content of the asset to be shared
 */
export interface ShareLatestAsset {
  /**
   * MIME type of the asset (e.g., image/webp, text/plain, application/zip, etc.)
   */
  contentType: string;

  /**
   * Base64 encoded content of the asset
   */
  contentBase64: string;

  /**
   * Timestamp when the asset was created
   */
  createdAt: number;
}

export type ShareRemotePushSendIndexedDBEntry = Omit<ShareRemotePushSendOptions, 'type'>;
export type ShareReceivedChunkedMessageIndexedDBEntry = ChunkedShareMessagePayload;
export type ShareLatestAssetIndexedDBEntry = ShareLatestAsset;
export const ShareIndexedDBStore = {
  /**
   * ShareRemotePushSendIndexedDBEntry
   *
   * id = ShareRemotePushSendOptions['id']
   */
  remotePushSendStorageName: 'share-remote-push-send-options',
  /**
   * ShareReceivedChunkedMessageIndexedDBEntry
   *
   * id = random integer
   */
  receivedChunkedMessagesStorageName: 'share-received-chunked-messages',
  /**
   * ShareLatestAssetIndexedDBEntry
   *
   * id = 1 (constant key)
   */
  latestAssetStorageName: 'share-latest-asset',
} as const;
export type ShareIndexedDBStore = ValueOf<typeof ShareIndexedDBStore>;
