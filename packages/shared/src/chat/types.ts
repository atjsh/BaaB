import type { ValueOf } from '../util';

/**
 * VAPID keypair
 */
export type VapidKeys = { publicKey: string; privateKey: string };

/**
 * Web Push send options for "my" side
 */
export interface ChatLocalPushSendOptions {
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
export interface ChatRemotePushSendOptions {
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
 * Chat message payload types
 */
export const ChatMessagePayloadType = {
  /**
   * 1. Guest -> Host: Handshake Request
   */
  GUEST_TO_HOST_HANDSHAKE: '1',

  /**
   * 2. Host -> Guest: Handshake Acknowledgement
   */
  HANDSHAKE_ACK: '2',

  /**
   * 3. Host <-> Guest: Chat Message
   */
  MESSAGE: '3',
} as const;
export type ChatMessagePayloadType = ValueOf<typeof ChatMessagePayloadType>;

/**
 * Guest -> Host: Handshake Request payload
 */
export interface GuestToHostHandshake {
  /**
   * Payload type
   */
  t: typeof ChatMessagePayloadType.GUEST_TO_HOST_HANDSHAKE;

  /**
   * Guest's PushSendOptions (Usage: Host->Guest)
   */
  o: ChatRemotePushSendOptions;
}

/**
 * Host -> Guest: Handshake Acknowledgement payload
 */
export interface HandshakeAck {
  /**
   * Payload type
   */
  t: typeof ChatMessagePayloadType.HANDSHAKE_ACK;
}

/**
 * Chat message content type, as in MIME type
 */
export const ChatMessageContentType = {
  TEXT_PLAIN: 'text/plain; charset=utf-8',
  WEBP_IMAGE: 'image/webp',
} as const;
export type ChatMessageContentType = ValueOf<typeof ChatMessageContentType>;

/**
 * Host <-> Guest: Chat Message payload
 */
export interface ChatMessage {
  /**
   * Payload type
   */
  t: typeof ChatMessagePayloadType.MESSAGE;

  /**
   * Message content (base64 encoded)
   */
  d: string;

  /**
   * Message content type, as in MIME type
   */
  c: ChatMessageContentType;
}

/**
 * Union of all chat message payloads
 */
export type ChatMessagePayloadEnum = GuestToHostHandshake | HandshakeAck | ChatMessage;

/**
 * The full chat message payload
 */
export interface ChatMessagePayload {
  /**
   * ID of the full message (random integer)
   */
  id: number;

  /**
   * ID of the sender (UUID)
   */
  from: string;

  /**
   * Full reconstructed message payload
   */
  fullMessage: ChatMessagePayloadEnum;
}

export function isChatMessagePayload(obj: any): obj is ChatMessagePayload {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.from === 'string' &&
    typeof obj.fullMessage === 'object' &&
    obj.fullMessage !== null &&
    typeof obj.fullMessage.t === 'string' &&
    Object.values(ChatMessagePayloadType).includes(obj.fullMessage.t)
  );
}

/**
 * Chunked payload created from ChatMessagePayload
 */
export interface ChunkedChatMessagePayload {
  /**
   * Type of this payload chunk (always 'c' for "ChatMessagePayload")
   */
  t: 'c';

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

export function isChunkedChatMessagePayload(obj: any): obj is ChunkedChatMessagePayload {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    obj.t === 'c' &&
    typeof obj.fr === 'string' &&
    typeof obj.id === 'number' &&
    typeof obj.i === 'number' &&
    typeof obj.all === 'number' &&
    typeof obj.d === 'string'
  );
}

export type ChatLocalPushSendIndexedDBEntry = Omit<ChatLocalPushSendOptions, 'type'>;
export type ChatRemotePushSendIndexedDBEntry = Omit<ChatRemotePushSendOptions, 'type'>;
export type ChatReceivedChunkedMessageIndexedDBEntry = ChunkedChatMessagePayload;
export type ChatMessagesIndexedDBEntry = ChatMessagePayload;
export const ChatIndexedDBStore = {
  /**
   * ChatLocalPushSendIndexedDBEntry
   *
   * id = ChatLocalPushSendOptions['id']
   */
  localPushSendStorageName: 'chat-local-push-send-options',
  /**
   * ChatRemotePushSendIndexedDBEntry
   *
   * id = ChatRemotePushSendOptions['id']
   */
  remotePushSendStorageName: 'chat-remote-push-send-options',
  /**
   * ChatReceivedChunkedMessageIndexedDBEntry
   *
   * id = random integer
   */
  receivedChunkedMessagesStorageName: 'chat-received-chunked-messages',
  /**
   * ChatMessagesIndexedDBEntry
   *
   * id = ChatMessagesIndexedDBEntry['id']
   */
  messagesStorageName: 'chat-messages',
} as const;
