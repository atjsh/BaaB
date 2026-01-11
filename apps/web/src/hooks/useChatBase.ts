import { compress } from 'lz-string';
import { useCallback, useEffect, useRef, useState } from 'react';

import { chat, settings } from '@baab/shared';

import { ChatStorageManager } from '../lib/storage/chat.db';
import { useLocalPushCredentials } from './useLocalPushCredentials';

export interface UseChatBaseProps {
  role: chat.ConversationRole;
  initialConversationId?: string;
  addLog: (msg: string) => void;
}

export interface UseChatBaseReturn {
  chatStorage: ChatStorageManager | null;
  conversations: chat.Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<chat.Conversation[]>>;
  activeConversation: chat.Conversation | null;
  activeConversationId: string | null;
  messages: chat.ChatMessagePayload[];
  setMessages: React.Dispatch<React.SetStateAction<chat.ChatMessagePayload[]>>;
  isInitialized: boolean;
  setIsInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  quotaExceeded: boolean;
  setQuotaExceeded: React.Dispatch<React.SetStateAction<boolean>>;
  conversationsRef: React.MutableRefObject<chat.Conversation[]>;
  activeConversationIdRef: React.MutableRefObject<string | null>;
  setActiveConversationId: (id: string | null) => void;
  sendMessage: (content: string, contentType: chat.ChatMessageContentType) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: number) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  handlePushFailure: (conversationId: string) => Promise<void>;
  registerIncomingMessageHandler: (handler: (payload: chat.ChatMessagePayload) => Promise<void>) => void;
  /** Unified local push credentials */
  localPushCredentials: settings.LocalPushCredentials | null;
  /** Initialize local push credentials if not already initialized */
  initializeCredentials: () => Promise<settings.LocalPushCredentials | null>;
}

export function useChatBase({ role, initialConversationId, addLog }: UseChatBaseProps): UseChatBaseReturn {
  const [chatStorage, setChatStorage] = useState<ChatStorageManager | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [conversations, setConversations] = useState<chat.Conversation[]>([]);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(initialConversationId || null);
  const [messages, setMessages] = useState<chat.ChatMessagePayload[]>([]);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const initializedRef = useRef(false);
  const conversationsRef = useRef<chat.Conversation[]>([]);
  const activeConversationIdRef = useRef<string | null>(initialConversationId || null);
  const incomingMessageHandlerRef = useRef<((payload: chat.ChatMessagePayload) => Promise<void>) | null>(null);

  // Use unified local push credentials
  const {
    credentials: localPushCredentials,
    isInitialized: isCredentialsInitialized,
    initializeCredentials,
  } = useLocalPushCredentials();

  // Wrapped setter that updates both state and ref synchronously
  const setActiveConversationId = useCallback((id: string | null) => {
    activeConversationIdRef.current = id;
    setActiveConversationIdState(id);
  }, []);

  // Keep refs in sync
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Initialize storage
  useEffect(() => {
    ChatStorageManager.createInstance().then((instance) => {
      setChatStorage(instance);
    });
  }, []);

  // Initialize conversations
  useEffect(() => {
    if (!chatStorage || !isCredentialsInitialized || initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const allConversations = await chatStorage.conversationsStorage.getByRole(role);
      setConversations(allConversations.sort((a, b) => b.lastActivityAt - a.lastActivityAt));

      if (initialConversationId) {
        const conv = allConversations.find((c) => c.id === initialConversationId);
        if (conv) {
          setActiveConversationId(conv.id);
          const convMessages = await chatStorage.chatMessagesStorage.getByConversationId(conv.id);
          setMessages(convMessages);
          setQuotaExceeded(conv.storageBytesUsed >= chat.MAX_CONVERSATION_STORAGE_BYTES);
        }
      }

      setIsInitialized(true);
      addLog(`Chat ${role === chat.ConversationRole.HOST ? 'host' : 'client'} initialized`);
    };

    init();
  }, [chatStorage, isCredentialsInitialized, initialConversationId, role, setActiveConversationId, addLog]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!chatStorage || !activeConversationId) return;

    const loadMessages = async () => {
      const conv = conversations.find((c) => c.id === activeConversationId);
      if (conv) {
        const convMessages = await chatStorage.chatMessagesStorage.getByConversationId(activeConversationId);
        setMessages(convMessages);
        setQuotaExceeded(conv.storageBytesUsed >= chat.MAX_CONVERSATION_STORAGE_BYTES);

        // Reset unread count
        if (conv.unreadCount > 0) {
          await chatStorage.conversationsStorage.resetUnreadCount(activeConversationId);
          setConversations((prev) => prev.map((c) => (c.id === activeConversationId ? { ...c, unreadCount: 0 } : c)));
        }
      }
    };

    loadMessages();
  }, [chatStorage, activeConversationId, conversations]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  // Handle push failure
  const handlePushFailure = useCallback(
    async (conversationId: string) => {
      if (!chatStorage) return;
      const failedAttempts = await chatStorage.conversationsStorage.incrementFailedAttempts(conversationId);
      addLog(`Push failed for conversation, attempt ${failedAttempts}`);

      if (failedAttempts >= 3) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, status: chat.ConversationStatus.UNAVAILABLE, failedAttempts } : c,
          ),
        );
      }
    },
    [chatStorage, addLog],
  );

  // Handle remote forgotten (deleted after max failures)
  const handleRemoteForgotten = useCallback(
    async (remoteId: string, conversationId?: string, conversationName?: string) => {
      if (!chatStorage) return;

      addLog(`Remote ${remoteId} forgotten after repeated failures`);

      // Update conversation status in local state
      if (conversationId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, status: chat.ConversationStatus.UNAVAILABLE, remotePushSendOptionsId: undefined }
              : c,
          ),
        );
      }

      // Show notification to user
      const displayName =
        conversationName || (conversationId ? `Conversation ${conversationId.slice(0, 8)}` : 'A peer');
      const notification = new Notification('Connection Lost', {
        body: `${displayName} is no longer reachable. Ask them to rejoin via a new invite link.`,
        tag: `remote-forgotten-${remoteId}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    },
    [chatStorage, addLog, setConversations],
  );

  // Register incoming message handler
  const registerIncomingMessageHandler = useCallback((handler: (payload: chat.ChatMessagePayload) => Promise<void>) => {
    incomingMessageHandlerRef.current = handler;
  }, []);

  // Listen for SW messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED' && chat.isChatMessagePayload(event.data.payload)) {
        incomingMessageHandlerRef.current?.(event.data.payload);
      }
      if (event.data?.type === 'PUSH_FAILED') {
        const { conversationId } = event.data;
        handlePushFailure(conversationId);
      }
      if (event.data?.type === 'REMOTE_FORGOTTEN' && event.data.context === 'chat') {
        const { remoteId, conversationId, conversationName } = event.data;
        handleRemoteForgotten(remoteId, conversationId, conversationName);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [handlePushFailure, handleRemoteForgotten]);

  // Send message (shared logic)
  const sendMessage = useCallback(
    async (content: string, contentType: chat.ChatMessageContentType) => {
      if (!chatStorage || !activeConversation || !localPushCredentials) return;

      const remotePushSend = activeConversation.remotePushSendOptionsId
        ? await chatStorage.remotePushSendStorage.get(activeConversation.remotePushSendOptionsId)
        : null;

      if (!remotePushSend) {
        addLog(
          role === chat.ConversationRole.HOST
            ? 'Cannot send message: no guest connected'
            : 'Cannot send message: not connected to host',
        );
        return;
      }

      // Compress text content using lz-string, store uncompressed locally
      const isTextMessage = contentType === chat.ChatMessageContentType.TEXT_PLAIN;
      const encodedContent = btoa(content);
      const compressedContent = isTextMessage ? compress(content) : null;

      // Message payload for local storage (uncompressed for display)
      const localMessagePayload: chat.ChatMessage = {
        t: chat.ChatMessagePayloadType.MESSAGE,
        d: encodedContent,
        c: contentType,
      };

      // Message payload for sending (compressed for text)
      const sendMessagePayload: chat.ChatMessage =
        isTextMessage && compressedContent
          ? {
              t: chat.ChatMessagePayloadType.MESSAGE,
              d: compressedContent,
              c: contentType,
              z: true, // Mark as compressed
            }
          : localMessagePayload;

      const sizeBytes = chat.calculateMessageSizeBytes(localMessagePayload);
      const messageId = Math.floor(Math.random() * 1000000000);
      const timestamp = Date.now();

      const fullMessage: chat.ChatMessagePayload = {
        id: messageId,
        conversationId: activeConversation.id,
        from: localPushCredentials.id,
        timestamp,
        sizeBytes,
        fullMessage: localMessagePayload, // Store uncompressed locally
      };

      // Check quota and save
      const saveResult = await chatStorage.saveMessageWithQuotaCheck(fullMessage);
      if (!saveResult.success) {
        if (saveResult.quotaExceeded) {
          addLog('Storage quota exceeded');
          setQuotaExceeded(true);
        }
        return;
      }

      // Update UI immediately
      setMessages((prev) => [...prev, fullMessage]);

      // Update conversation metadata
      const preview = contentType === chat.ChatMessageContentType.TEXT_PLAIN ? content.slice(0, 50) : '[Image]';
      await chatStorage.conversationsStorage.updateLastActivity(activeConversation.id, timestamp, preview);

      const newConv = await chatStorage.conversationsStorage.get(activeConversation.id);
      if (newConv) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversation.id
              ? {
                  ...c,
                  lastActivityAt: timestamp,
                  lastMessagePreview: preview,
                  storageBytesUsed: newConv.storageBytesUsed,
                }
              : c,
          ),
        );
      }

      // Send via Service Worker (use compressed payload for sending)
      const sw = navigator.serviceWorker.controller;
      if (sw) {
        sw.postMessage({
          type: 'CHAT_SEND',
          payloadString: JSON.stringify(sendMessagePayload),
          conversationId: activeConversation.id,
          localPushCredentials,
          remotePushSendOption: { ...remotePushSend, type: 'remote' },
        });
        addLog('Message sent');
      }
    },
    [chatStorage, activeConversation, localPushCredentials, role, addLog],
  );

  // Delete message
  const deleteMessage = useCallback(
    async (conversationId: string, messageId: number) => {
      if (!chatStorage) return;

      await chatStorage.deleteMessageAndUpdateStorage(messageId, conversationId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      // Update storage usage in UI
      const newConv = await chatStorage.conversationsStorage.get(conversationId);
      if (newConv) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, storageBytesUsed: newConv.storageBytesUsed } : c)),
        );
        setQuotaExceeded(newConv.storageBytesUsed >= chat.MAX_CONVERSATION_STORAGE_BYTES);
      }

      addLog('Message deleted');
    },
    [chatStorage, addLog],
  );

  // Delete conversation (base implementation - can be extended)
  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!chatStorage) return;

      await chatStorage.deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));

      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }

      addLog('Conversation deleted');
    },
    [chatStorage, activeConversationId, setActiveConversationId, addLog],
  );

  return {
    chatStorage,
    conversations,
    setConversations,
    activeConversation,
    activeConversationId,
    messages,
    setMessages,
    isInitialized,
    setIsInitialized,
    quotaExceeded,
    setQuotaExceeded,
    conversationsRef,
    activeConversationIdRef,
    setActiveConversationId,
    sendMessage,
    deleteMessage,
    deleteConversation,
    handlePushFailure,
    registerIncomingMessageHandler,
    localPushCredentials,
    initializeCredentials,
  };
}

/**
 * Shared handler for incoming MESSAGE type payloads.
 * Can be used by both host and client hooks.
 */
export async function handleIncomingChatMessage(
  payload: chat.ChatMessagePayload,
  chatStorage: ChatStorageManager,
  currentActiveId: string | null,
  setMessages: React.Dispatch<React.SetStateAction<chat.ChatMessagePayload[]>>,
  setConversations: React.Dispatch<React.SetStateAction<chat.Conversation[]>>,
  setQuotaExceeded: React.Dispatch<React.SetStateAction<boolean>>,
  addLog: (msg: string) => void,
): Promise<boolean> {
  const { conversationId, fullMessage } = payload;

  // Save message
  const saveResult = await chatStorage.saveMessageWithQuotaCheck(payload);
  if (!saveResult.success) {
    if (saveResult.quotaExceeded) {
      addLog('Storage quota exceeded, message not saved');
      setQuotaExceeded(true);
    }
    return false;
  }

  // Update UI
  if (conversationId === currentActiveId) {
    addLog('Adding message to UI');
    setMessages((prev) => [...prev, payload]);
  } else {
    addLog('Not active conversation, incrementing unread count');
    await chatStorage.conversationsStorage.incrementUnreadCount(conversationId);
  }

  // Update conversation metadata
  // Messages are stored as base64-encoded after decompression in service worker
  // Use try-catch for backward compatibility with any legacy format
  const msgContent = (fullMessage as chat.ChatMessage).d;
  let decodedContent: string;
  try {
    decodedContent = atob(msgContent);
  } catch {
    // Fallback for any malformed content
    decodedContent = msgContent;
  }
  const preview =
    (fullMessage as chat.ChatMessage).c === chat.ChatMessageContentType.TEXT_PLAIN
      ? decodedContent.slice(0, 50)
      : '[Image]';

  await chatStorage.conversationsStorage.updateLastActivity(conversationId, payload.timestamp, preview);

  // Update storage usage
  const newConv = await chatStorage.conversationsStorage.get(conversationId);
  if (newConv) {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastActivityAt: payload.timestamp,
              lastMessagePreview: preview,
              storageBytesUsed: newConv.storageBytesUsed,
              unreadCount: conversationId === currentActiveId ? 0 : c.unreadCount + 1,
            }
          : c,
      ),
    );
  }

  return true;
}
