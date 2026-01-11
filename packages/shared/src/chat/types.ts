import type { ValueOf } from '../util';
import type { LocalPushCredentials } from '../settings/types';

// Re-export from settings for backward compatibility
export type { VapidKeys } from '../settings/types';

/**
 * Maximum storage bytes per conversation (500MB)
 */
export const MAX_CONVERSATION_STORAGE_BYTES = 500 * 1024 * 1024;

/**
 * Conversation status
 */
export const ConversationStatus = {
  /** Handshake completed, peer is reachable */
  ACTIVE: 'active',
  /** Waiting for handshake acknowledgement */
  PENDING: 'pending',
  /** Push delivery failed, peer may be offline */
  UNAVAILABLE: 'unavailable',
  /** Conversation ended by user */
  CLOSED: 'closed',
} as const;
export type ConversationStatus = ValueOf<typeof ConversationStatus>;

/**
 * Conversation role
 */
export const ConversationRole = {
  /** User created/hosts this conversation */
  HOST: 'host',
  /** User joined this conversation */
  GUEST: 'guest',
} as const;
export type ConversationRole = ValueOf<typeof ConversationRole>;

/**
 * Conversation entity
 */
export interface Conversation {
  /** UUID of the conversation */
  id: string;
  /** Display name (auto-generated: "Chat with [peer-id-prefix]") */
  name: string;
  /** ID of the remote push send options (peer's credentials) */
  remotePushSendOptionsId?: string;
  /** Current connection status */
  status: ConversationStatus;
  /** User's role in this conversation */
  role: ConversationRole;
  /** Last successful message timestamp (ms) */
  lastActivityAt: number;
  /** Last message preview text */
  lastMessagePreview?: string;
  /** Unread message count */
  unreadCount: number;
  /** Created timestamp (ms) */
  createdAt: number;
  /** Number of consecutive failed push attempts */
  failedAttempts: number;
  /** Storage bytes used by messages in this conversation */
  storageBytesUsed: number;
}

/**
 * Convert LocalPushCredentials to ChatRemotePushSendOptions format (for sharing with remote party)
 */
export function toChatRemotePushSendOptions(
  credentials: LocalPushCredentials,
  conversationId: string,
): ChatRemotePushSendOptions {
  return {
    id: credentials.id,
    conversationId,
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
export interface ChatRemotePushSendOptions {
  /**
   * UUID of this PushSendOptions
   */
  id: string;
  /**
   * UUID of the conversation this belongs to
   */
  conversationId: string;
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

  /**
   * 4. Host <-> Guest: Credentials Update (propagate new VAPID keys)
   */
  CREDENTIALS_UPDATE: '4',
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

  /**
   * Whether the content is lz-string compressed (optional, for backward compatibility)
   * Only applies to text/plain content type
   */
  z?: boolean;
}

/**
 * Host <-> Guest: Credentials Update payload
 * Sent when a user regenerates their VAPID keys to update the remote's stored credentials
 */
export interface CredentialsUpdate {
  /**
   * Payload type
   */
  t: typeof ChatMessagePayloadType.CREDENTIALS_UPDATE;

  /**
   * Updated remote push send options
   */
  o: ChatRemotePushSendOptions;
}

/**
 * Union of all chat message payloads
 */
export type ChatMessagePayloadEnum = GuestToHostHandshake | HandshakeAck | ChatMessage | CredentialsUpdate;

/**
 * The full chat message payload
 */
export interface ChatMessagePayload {
  /**
   * ID of the full message (random integer)
   */
  id: number;

  /**
   * UUID of the conversation this message belongs to
   */
  conversationId: string;

  /**
   * ID of the sender (UUID)
   */
  from: string;

  /**
   * Timestamp when message was sent (ms)
   */
  timestamp: number;

  /**
   * Size in bytes of this message (for storage quota tracking)
   */
  sizeBytes: number;

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
    typeof obj.conversationId === 'string' &&
    typeof obj.from === 'string' &&
    typeof obj.timestamp === 'number' &&
    typeof obj.sizeBytes === 'number' &&
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
   * UUID of the conversation this message belongs to
   */
  cid: string;

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
    typeof obj.cid === 'string' &&
    typeof obj.fr === 'string' &&
    typeof obj.id === 'number' &&
    typeof obj.i === 'number' &&
    typeof obj.all === 'number' &&
    typeof obj.d === 'string'
  );
}

export type ChatRemotePushSendIndexedDBEntry = Omit<ChatRemotePushSendOptions, 'type'>;
export type ChatReceivedChunkedMessageIndexedDBEntry = ChunkedChatMessagePayload;
export type ChatMessagesIndexedDBEntry = ChatMessagePayload;
export type ChatConversationIndexedDBEntry = Conversation;

export const ChatIndexedDBStore = {
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
  /**
   * ChatConversationIndexedDBEntry
   *
   * id = Conversation['id']
   */
  conversationsStorageName: 'chat-conversations',
} as const;

/**
 * Helper to generate conversation name from peer ID
 */
export function generateConversationName(peerId: string): string {
  return `Chat with ${peerId.slice(0, 8)}`;
}

/**
 * Helper to calculate message size in bytes
 */
export function calculateMessageSizeBytes(message: ChatMessagePayloadEnum): number {
  return new TextEncoder().encode(JSON.stringify(message)).length;
}
