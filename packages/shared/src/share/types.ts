import { ValueOf } from '../util';

/**
 * VAPID keypair
 */
export type VapidKeys = { publicKey: string; privateKey: string };

/**
 * Web Push send options for "my" side
 */
export interface ShareLocalPushSendOptions {
  /**
   * UUID of this PushSendOptions
   */
  id: string;
  type: 'local';
  pushSubscription: PushSubscriptionJSON;
  vapidKeys: VapidKeys;
  messageEncryption: {
    encoding: (typeof PushManager.supportedContentEncodings)[number];
    p256dh: string;
    auth: string;
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

export type ShareMessagePayloadEnum = GuestToHostHandshake | HandshakeAck | AssetTransfer;

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

export type ShareLocalPushSendIndexedDBEntry = Omit<ShareLocalPushSendOptions, 'type'>;
export type ShareRemotePushSendIndexedDBEntry = Omit<ShareRemotePushSendOptions, 'type'>;
export type ShareReceivedChunkedMessageIndexedDBEntry = ChunkedShareMessagePayload;
export type ShareLatestAssetIndexedDBEntry = ShareLatestAsset;
export const ShareIndexedDBStore = {
  /**
   * ShareLocalPushSendIndexedDBEntry
   *
   * id = ShareLocalPushSendOptions['id']
   */
  localPushSendStorageName: 'share-local-push-send-options',

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
