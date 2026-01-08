import { useCallback, useEffect, useRef, useState } from 'react';
import { fromBase64Url, generateVapidKeys, serializeVapidKeys } from 'web-push-browser';

import { chat } from '@baab/shared';

import { ChatStorageManager } from '../lib/storage/chat.db';

interface UseChatHostProps {
  initialConversationId?: string;
  addLog: (msg: string) => void;
}

export function useChatHost({ initialConversationId, addLog }: UseChatHostProps) {
  const [chatStorage, setChatStorage] = useState<ChatStorageManager | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [conversations, setConversations] = useState<chat.Conversation[]>([]);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(initialConversationId || null);
  const [messages, setMessages] = useState<chat.ChatMessagePayload[]>([]);
  const [inviteLink, setInviteLink] = useState<string>('');
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
      // Load all host conversations
      const allConversations = await chatStorage.conversationsStorage.getByRole(chat.ConversationRole.HOST);
      setConversations(allConversations.sort((a, b) => b.lastActivityAt - a.lastActivityAt));

      // Set active conversation if specified
      if (initialConversationId) {
        const conv = allConversations.find((c) => c.id === initialConversationId);
        if (conv) {
          setActiveConversationId(conv.id);
          const convMessages = await chatStorage.chatMessagesStorage.getByConversationId(conv.id);
          setMessages(convMessages);
          await updateInviteLink(conv.localPushSendOptionsId);
          setQuotaExceeded(conv.storageBytesUsed >= chat.MAX_CONVERSATION_STORAGE_BYTES);
        }
      }

      setIsInitialized(true);
      addLog('Chat host initialized');
    };

    init();
  }, [chatStorage, initialConversationId]);

  const updateInviteLink = async (localPushSendOptionsId: string) => {
    if (!chatStorage) return;
    const localPushSend = await chatStorage.localPushSendStorage.get(localPushSendOptionsId);
    if (localPushSend) {
      const remoteOptions: chat.ChatRemotePushSendOptions = {
        id: localPushSend.id,
        conversationId: localPushSend.conversationId,
        type: 'remote',
        pushSubscription: localPushSend.pushSubscription,
        vapidKeys: localPushSend.vapidKeys,
        messageEncryption: localPushSend.messageEncryption,
      };
      const link = `${window.location.origin}/chat/join?connect=${encodeURIComponent(
        btoa(JSON.stringify(remoteOptions)),
      )}`;
      setInviteLink(link);
    }
  };

  // Load messages when active conversation changes
  useEffect(() => {
    if (!chatStorage || !activeConversationId) return;

    const loadMessages = async () => {
      const conv = conversations.find((c) => c.id === activeConversationId);
      if (conv) {
        const convMessages = await chatStorage.chatMessagesStorage.getByConversationId(activeConversationId);
        setMessages(convMessages);
        await updateInviteLink(conv.localPushSendOptionsId);
        setQuotaExceeded(conv.storageBytesUsed >= chat.MAX_CONVERSATION_STORAGE_BYTES);

        // Reset unread count
        if (conv.unreadCount > 0) {
          await chatStorage.conversationsStorage.resetUnreadCount(activeConversationId);
          setConversations((prev) => prev.map((c) => (c.id === activeConversationId ? { ...c, unreadCount: 0 } : c)));
        }
      }
    };

    loadMessages();
  }, [chatStorage, activeConversationId]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

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
        case chat.ChatMessagePayloadType.GUEST_TO_HOST_HANDSHAKE: {
          addLog('Received handshake from guest');
          const handshake = fullMessage as chat.GuestToHostHandshake;

          // Check if this is a reconnection (same endpoint)
          const existingRemote = await chatStorage.remotePushSendStorage.getByEndpoint(
            handshake.o.pushSubscription.endpoint!,
          );

          if (existingRemote) {
            // Update existing remote push send options
            await chatStorage.remotePushSendStorage.put({
              ...handshake.o,
              id: existingRemote.id,
              conversationId: existingRemote.conversationId,
            });

            // Update conversation status and link remote push send options
            await chatStorage.conversationsStorage.updateStatus(
              existingRemote.conversationId,
              chat.ConversationStatus.ACTIVE,
            );
            await chatStorage.conversationsStorage.resetFailedAttempts(existingRemote.conversationId);

            // Ensure remotePushSendOptionsId is set on the conversation
            const existingConv = await chatStorage.conversationsStorage.get(existingRemote.conversationId);
            if (existingConv && !existingConv.remotePushSendOptionsId) {
              const updatedConv: chat.Conversation = {
                ...existingConv,
                remotePushSendOptionsId: existingRemote.id,
                status: chat.ConversationStatus.ACTIVE,
                name: chat.generateConversationName(existingRemote.id),
                failedAttempts: 0,
              };
              await chatStorage.conversationsStorage.put(updatedConv);
              setConversations((prev) =>
                prev.map((c) => (c.id === existingRemote.conversationId ? updatedConv : c)),
              );
            } else {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === existingRemote.conversationId
                    ? { ...c, status: chat.ConversationStatus.ACTIVE, failedAttempts: 0 }
                    : c,
                ),
              );
            }

            addLog('Guest reconnected');
          } else {
            // New guest - save their credentials
            const remoteEntry: chat.ChatRemotePushSendIndexedDBEntry = {
              ...handshake.o,
              conversationId,
            };
            await chatStorage.remotePushSendStorage.put(remoteEntry);

            // Update conversation
            const updatedConv: chat.Conversation = {
              ...conv,
              remotePushSendOptionsId: remoteEntry.id,
              status: chat.ConversationStatus.ACTIVE,
              name: chat.generateConversationName(remoteEntry.id),
              lastActivityAt: Date.now(),
            };
            await chatStorage.conversationsStorage.put(updatedConv);

            setConversations((prev) => prev.map((c) => (c.id === conversationId ? updatedConv : c)));

            addLog(`Guest connected: ${updatedConv.name}`);
          }

          // Send ACK
          await sendHandshakeAck(conversationId);
          break;
        }

        case chat.ChatMessagePayloadType.MESSAGE: {
          addLog(`Received chat message for conversation ${conversationId}`);
          addLog(`Current active conversation: ${currentActiveId}`);

          // Save message
          const saveResult = await chatStorage.saveMessageWithQuotaCheck(payload);
          if (!saveResult.success) {
            if (saveResult.quotaExceeded) {
              addLog('Storage quota exceeded, message not saved');
              setQuotaExceeded(true);
            }
            return;
          }

          // Update UI - always add to messages if this is the active conversation
          if (conversationId === currentActiveId) {
            addLog('Adding message to UI');
            setMessages((prev) => [...prev, payload]);
          } else {
            addLog(`Not active conversation, incrementing unread count`);
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
    }
  };

  const sendHandshakeAck = async (conversationId: string) => {
    if (!chatStorage) return;

    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    const localPushSend = await chatStorage.localPushSendStorage.get(conv.localPushSendOptionsId);
    const remotePushSend = conv.remotePushSendOptionsId
      ? await chatStorage.remotePushSendStorage.get(conv.remotePushSendOptionsId)
      : null;

    if (!localPushSend || !remotePushSend) {
      addLog('Cannot send ACK: missing push credentials');
      return;
    }

    const payload: chat.HandshakeAck = {
      t: chat.ChatMessagePayloadType.HANDSHAKE_ACK,
    };

    const sw = navigator.serviceWorker.controller;
    if (sw) {
      sw.postMessage({
        type: 'CHAT_SEND',
        payloadString: JSON.stringify(payload),
        conversationId,
        localPushSendOption: { ...localPushSend, type: 'local' },
        remotePushSendOption: { ...remotePushSend, type: 'remote' },
      });
      addLog('Sent handshake ACK');
    }
  };

  const createNewSession = async (): Promise<string | null> => {
    if (!chatStorage) return null;

    try {
      const registration = await navigator.serviceWorker.ready;

      // Unsubscribe any existing push subscription first
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        await existingSubscription.unsubscribe();
      }

      // Generate new VAPID keys and subscribe
      const vapidKeys = await serializeVapidKeys(await generateVapidKeys());
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(vapidKeys.publicKey),
      });

      const conversationId = crypto.randomUUID();
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

      // Create conversation
      const newConversation: chat.Conversation = {
        id: conversationId,
        name: 'New Session (waiting for guest)',
        localPushSendOptionsId: localPushSendId,
        status: chat.ConversationStatus.PENDING,
        role: chat.ConversationRole.HOST,
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
      await updateInviteLink(localPushSendId);

      addLog('New session created');
      return conversationId;
    } catch (error) {
      addLog(`Failed to create session: ${error}`);
      console.error(error);
      return null;
    }
  };

  const sendMessage = async (content: string, contentType: chat.ChatMessageContentType) => {
    if (!chatStorage || !activeConversation) return;

    const remotePushSend = activeConversation.remotePushSendOptionsId
      ? await chatStorage.remotePushSendStorage.get(activeConversation.remotePushSendOptionsId)
      : null;

    if (!remotePushSend) {
      addLog('Cannot send message: no guest connected');
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
      setInviteLink('');
    }

    addLog('Conversation deleted');
  };

  const retryConnection = async (conversationId: string) => {
    if (!chatStorage) return;

    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv || !conv.remotePushSendOptionsId) return;

    await chatStorage.conversationsStorage.resetFailedAttempts(conversationId);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, status: chat.ConversationStatus.PENDING, failedAttempts: 0 } : c,
      ),
    );

    addLog('Retrying connection...');

    // Re-send ACK to try to reconnect
    await sendHandshakeAck(conversationId);
  };

  return {
    conversations,
    activeConversation,
    messages,
    isInitialized,
    inviteLink,
    quotaExceeded,
    setActiveConversationId,
    createNewSession,
    sendMessage,
    deleteMessage,
    deleteConversation,
    retryConnection,
  };
}
