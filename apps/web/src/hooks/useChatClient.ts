import { useCallback, useEffect, useRef, useState } from 'react';
import { fromBase64Url, generateVapidKeys, serializeVapidKeys } from 'web-push-browser';

import { chat } from '@baab/shared';

import { ChatStorageManager } from '../lib/storage/chat.db';

interface UseChatClientProps {
  initialConversationId?: string;
  addLog: (msg: string) => void;
}

export function useChatClient({ initialConversationId, addLog }: UseChatClientProps) {
  const [chatStorage, setChatStorage] = useState<ChatStorageManager | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [conversations, setConversations] = useState<chat.Conversation[]>([]);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(initialConversationId || null);
  const [messages, setMessages] = useState<chat.ChatMessagePayload[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const initializedRef = useRef(false);
  const conversationsRef = useRef<chat.Conversation[]>([]);
  const activeConversationIdRef = useRef<string | null>(initialConversationId || null);

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
    if (!chatStorage || initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      // Load all guest conversations
      const allConversations = await chatStorage.conversationsStorage.getByRole(chat.ConversationRole.GUEST);
      setConversations(allConversations.sort((a, b) => b.lastActivityAt - a.lastActivityAt));

      // Set active conversation if specified
      if (initialConversationId) {
        const conv = allConversations.find((c) => c.id === initialConversationId);
        if (conv) {
          setActiveConversationId(conv.id);
          const convMessages = await chatStorage.chatMessagesStorage.getByConversationId(conv.id);
          setMessages(convMessages);
          setQuotaExceeded(conv.storageBytesUsed >= chat.MAX_CONVERSATION_STORAGE_BYTES);

          // Auto-reconnect if conversation was active
          if (conv.status === chat.ConversationStatus.ACTIVE) {
            setConnectionStatus('connecting');
            await reconnectToHost(conv);
          }
        }
      }

      setIsInitialized(true);
      addLog('Chat client initialized');
    };

    init();
  }, [chatStorage, initialConversationId]);

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

        // Update connection status based on conversation status
        if (conv.status === chat.ConversationStatus.ACTIVE) {
          setConnectionStatus('connected');
        } else if (conv.status === chat.ConversationStatus.PENDING) {
          setConnectionStatus('connecting');
        } else {
          setConnectionStatus('idle');
        }
      }
    };

    loadMessages();
  }, [chatStorage, activeConversationId]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  const reconnectToHost = async (conv: chat.Conversation) => {
    if (!chatStorage) return;

    const localPushSend = await chatStorage.localPushSendStorage.get(conv.localPushSendOptionsId);
    const remotePushSend = conv.remotePushSendOptionsId
      ? await chatStorage.remotePushSendStorage.get(conv.remotePushSendOptionsId)
      : null;

    if (!localPushSend || !remotePushSend) {
      addLog('Cannot reconnect: missing credentials');
      return;
    }

    // Re-send handshake
    const handshake: chat.GuestToHostHandshake = {
      t: chat.ChatMessagePayloadType.GUEST_TO_HOST_HANDSHAKE,
      o: {
        id: localPushSend.id,
        conversationId: conv.id,
        type: 'remote',
        pushSubscription: localPushSend.pushSubscription,
        vapidKeys: localPushSend.vapidKeys,
        messageEncryption: localPushSend.messageEncryption,
      },
    };

    const sw = navigator.serviceWorker.controller;
    if (sw) {
      sw.postMessage({
        type: 'CHAT_SEND',
        payloadString: JSON.stringify(handshake),
        conversationId: conv.id,
        localPushSendOption: { ...localPushSend, type: 'local' },
        remotePushSendOption: { ...remotePushSend, type: 'remote' },
      });
      addLog('Reconnection handshake sent');
    }
  };

  // Handle incoming messages
  const handleIncomingMessage = useCallback(
    async (payload: chat.ChatMessagePayload) => {
      if (!chatStorage) return;

      const { conversationId, fullMessage } = payload;

      // Fetch conversation directly from storage to avoid stale state
      let conv = await chatStorage.conversationsStorage.get(conversationId);
      if (!conv) {
        // Also check ref as fallback
        conv = conversationsRef.current.find((c) => c.id === conversationId) || null;
      }
      if (!conv) {
        addLog(`Received message for unknown conversation: ${conversationId}`);
        return;
      }

      const currentActiveId = activeConversationIdRef.current;

      switch (fullMessage.t) {
        case chat.ChatMessagePayloadType.HANDSHAKE_ACK: {
          addLog('Received handshake ACK from host');
          setConnectionStatus('connected');

          // Update conversation status
          await chatStorage.conversationsStorage.updateStatus(conversationId, chat.ConversationStatus.ACTIVE);
          await chatStorage.conversationsStorage.resetFailedAttempts(conversationId);

          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId ? { ...c, status: chat.ConversationStatus.ACTIVE, failedAttempts: 0 } : c,
            ),
          );
          break;
        }

        case chat.ChatMessagePayloadType.MESSAGE: {
          addLog('Received chat message');

          // Save message
          const saveResult = await chatStorage.saveMessageWithQuotaCheck(payload);
          if (!saveResult.success) {
            if (saveResult.quotaExceeded) {
              addLog('Storage quota exceeded, message not saved');
              setQuotaExceeded(true);
            }
            return;
          }

          // Update UI
          if (conversationId === currentActiveId) {
            setMessages((prev) => [...prev, payload]);
          } else {
            // Increment unread count
            await chatStorage.conversationsStorage.incrementUnreadCount(conversationId);
          }

          // Update conversation metadata
          const msgContent = (fullMessage as chat.ChatMessage).d;
          const preview =
            (fullMessage as chat.ChatMessage).c === chat.ChatMessageContentType.TEXT_PLAIN
              ? atob(msgContent).slice(0, 50)
              : '[Image]';

          await chatStorage.conversationsStorage.updateLastActivity(conversationId, payload.timestamp, preview);

          // Update storage usage in UI
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
          break;
        }

        default:
          addLog(`Unknown message type: ${fullMessage.t}`);
      }
    },
    [chatStorage, addLog],
  );

  // Listen for SW messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED' && chat.isChatMessagePayload(event.data.payload)) {
        handleIncomingMessage(event.data.payload);
      }
      if (event.data?.type === 'PUSH_FAILED') {
        const { conversationId } = event.data;
        handlePushFailure(conversationId);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [handleIncomingMessage]);

  const handlePushFailure = async (conversationId: string) => {
    if (!chatStorage) return;
    const failedAttempts = await chatStorage.conversationsStorage.incrementFailedAttempts(conversationId);
    addLog(`Push failed for conversation, attempt ${failedAttempts}`);

    if (failedAttempts >= 3) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, status: chat.ConversationStatus.UNAVAILABLE, failedAttempts } : c,
        ),
      );
      setConnectionStatus('idle');
    }
  };

  const joinSession = async (connectData: string): Promise<string | null> => {
    if (!chatStorage) return null;

    try {
      // Extract connect data from URL if a full URL is provided
      let base64Data = connectData;
      if (connectData.includes('?connect=') || connectData.includes('&connect=')) {
        try {
          const url = new URL(connectData);
          const connectParam = url.searchParams.get('connect');
          if (connectParam) {
            base64Data = connectParam;
          }
        } catch {
          // Not a valid URL, treat as raw base64 data
        }
      }

      // Parse host's credentials from connect data
      const hostCredentials: chat.ChatRemotePushSendOptions = JSON.parse(atob(decodeURIComponent(base64Data)));

      // Check if we already have this conversation
      const existingConv = conversations.find(
        (c) => c.remotePushSendOptionsId && c.id === hostCredentials.conversationId,
      );

      if (existingConv) {
        // Reconnect to existing conversation
        setActiveConversationId(existingConv.id);
        setConnectionStatus('connecting');
        await reconnectToHost(existingConv);
        return existingConv.id;
      }

      setConnectionStatus('connecting');

      // Generate new VAPID keys and subscribe
      const registration = await navigator.serviceWorker.ready;

      // Unsubscribe any existing push subscription first
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        await existingSubscription.unsubscribe();
      }

      const vapidKeys = await serializeVapidKeys(await generateVapidKeys());
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(vapidKeys.publicKey),
      });

      const conversationId = hostCredentials.conversationId;
      const localPushSendId = crypto.randomUUID();

      // Create local push send options
      const localPushSendEntry: chat.ChatLocalPushSendIndexedDBEntry = {
        id: localPushSendId,
        conversationId,
        messageEncryption: {
          encoding: PushManager.supportedContentEncodings[0],
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
        },
        pushSubscription: {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime,
        },
        vapidKeys,
      };

      await chatStorage.localPushSendStorage.put(localPushSendEntry);

      // Save host's credentials
      const remotePushSendEntry: chat.ChatRemotePushSendIndexedDBEntry = {
        ...hostCredentials,
        conversationId,
      };
      await chatStorage.remotePushSendStorage.put(remotePushSendEntry);

      // Create conversation
      const newConversation: chat.Conversation = {
        id: conversationId,
        name: chat.generateConversationName(hostCredentials.id),
        localPushSendOptionsId: localPushSendId,
        remotePushSendOptionsId: hostCredentials.id,
        status: chat.ConversationStatus.PENDING,
        role: chat.ConversationRole.GUEST,
        lastActivityAt: Date.now(),
        unreadCount: 0,
        createdAt: Date.now(),
        failedAttempts: 0,
        storageBytesUsed: 0,
      };

      await chatStorage.conversationsStorage.put(newConversation);

      setConversations((prev) => [newConversation, ...prev]);
      setActiveConversationId(conversationId);
      setMessages([]);
      setQuotaExceeded(false);

      // Send handshake to host
      const handshake: chat.GuestToHostHandshake = {
        t: chat.ChatMessagePayloadType.GUEST_TO_HOST_HANDSHAKE,
        o: {
          id: localPushSendEntry.id,
          conversationId,
          type: 'remote',
          pushSubscription: localPushSendEntry.pushSubscription,
          vapidKeys: localPushSendEntry.vapidKeys,
          messageEncryption: localPushSendEntry.messageEncryption,
        },
      };

      const sw = navigator.serviceWorker.controller;
      if (sw) {
        sw.postMessage({
          type: 'CHAT_SEND',
          payloadString: JSON.stringify(handshake),
          conversationId,
          localPushSendOption: { ...localPushSendEntry, type: 'local' },
          remotePushSendOption: { ...remotePushSendEntry, type: 'remote' },
        });
        addLog('Handshake sent to host');
      }
      return conversationId;
    } catch (error) {
      addLog(`Failed to join session: ${error}`);
      console.error(error);
      setConnectionStatus('idle');
      return null;
    }
  };

  const sendMessage = async (content: string, contentType: chat.ChatMessageContentType) => {
    if (!chatStorage || !activeConversation) return;

    const remotePushSend = activeConversation.remotePushSendOptionsId
      ? await chatStorage.remotePushSendStorage.get(activeConversation.remotePushSendOptionsId)
      : null;

    if (!remotePushSend) {
      addLog('Cannot send message: not connected to host');
      return;
    }

    const localPushSend = await chatStorage.localPushSendStorage.get(activeConversation.localPushSendOptionsId);
    if (!localPushSend) {
      addLog('Cannot send message: missing local credentials');
      return;
    }

    const encodedContent = btoa(content);
    const messagePayload: chat.ChatMessage = {
      t: chat.ChatMessagePayloadType.MESSAGE,
      d: encodedContent,
      c: contentType,
    };

    const sizeBytes = chat.calculateMessageSizeBytes(messagePayload);
    const messageId = Math.floor(Math.random() * 1000000000);
    const timestamp = Date.now();

    const fullMessage: chat.ChatMessagePayload = {
      id: messageId,
      conversationId: activeConversation.id,
      from: localPushSend.id,
      timestamp,
      sizeBytes,
      fullMessage: messagePayload,
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

    // Send via Service Worker
    const sw = navigator.serviceWorker.controller;
    if (sw) {
      sw.postMessage({
        type: 'CHAT_SEND',
        payloadString: JSON.stringify(messagePayload),
        conversationId: activeConversation.id,
        localPushSendOption: { ...localPushSend, type: 'local' },
        remotePushSendOption: { ...remotePushSend, type: 'remote' },
      });
      addLog('Message sent');
    }
  };

  const deleteMessage = async (conversationId: string, messageId: number) => {
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
  };

  const deleteConversation = async (conversationId: string) => {
    if (!chatStorage) return;

    await chatStorage.deleteConversation(conversationId);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));

    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
      setConnectionStatus('idle');
    }

    addLog('Conversation deleted');
  };

  const retryConnection = async (conversationId: string) => {
    if (!chatStorage) return;

    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    await chatStorage.conversationsStorage.resetFailedAttempts(conversationId);
    await chatStorage.conversationsStorage.updateStatus(conversationId, chat.ConversationStatus.PENDING);

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, status: chat.ConversationStatus.PENDING, failedAttempts: 0 } : c,
      ),
    );

    setConnectionStatus('connecting');
    addLog('Retrying connection...');

    // Re-send handshake
    await reconnectToHost(conv);
  };

  return {
    conversations,
    activeConversation,
    messages,
    isInitialized,
    connectionStatus,
    quotaExceeded,
    setActiveConversationId,
    joinSession,
    sendMessage,
    deleteMessage,
    deleteConversation,
    retryConnection,
  };
}
