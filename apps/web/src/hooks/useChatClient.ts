import { useCallback, useEffect, useState } from 'react';

import { chat } from '@baab/shared';

import { handleIncomingChatMessage, useChatBase } from './useChatBase';

interface UseChatClientProps {
  initialConversationId?: string;
  addLog: (msg: string) => void;
}

export function useChatClient({ initialConversationId, addLog }: UseChatClientProps) {
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');

  const base = useChatBase({
    role: chat.ConversationRole.GUEST,
    initialConversationId,
    addLog,
  });

  const {
    chatStorage,
    conversations,
    setConversations,
    activeConversation,
    messages,
    setMessages,
    isInitialized,
    quotaExceeded,
    setQuotaExceeded,
    conversationsRef,
    activeConversationIdRef,
    setActiveConversationId,
    sendMessage,
    deleteMessage,
    registerIncomingMessageHandler,
    localPushCredentials,
    initializeCredentials,
  } = base;

  // Auto-reconnect on initialization if conversation was active
  useEffect(() => {
    if (isInitialized && activeConversation?.status === chat.ConversationStatus.ACTIVE) {
      setConnectionStatus('connecting');
      reconnectToHost(activeConversation);
    }
  }, [isInitialized]);

  // Update connection status when active conversation changes
  useEffect(() => {
    if (!activeConversation) {
      setConnectionStatus('idle');
      return;
    }
    if (activeConversation.status === chat.ConversationStatus.ACTIVE) {
      setConnectionStatus('connected');
    } else if (activeConversation.status === chat.ConversationStatus.PENDING) {
      setConnectionStatus('connecting');
    } else {
      setConnectionStatus('idle');
    }
  }, [activeConversation]);

  const reconnectToHost = async (conv: chat.Conversation) => {
    if (!chatStorage || !localPushCredentials) return;

    const remotePushSend = conv.remotePushSendOptionsId
      ? await chatStorage.remotePushSendStorage.get(conv.remotePushSendOptionsId)
      : null;

    if (!remotePushSend) {
      addLog('Cannot reconnect: missing remote credentials');
      return;
    }

    // Re-send handshake
    const handshake: chat.GuestToHostHandshake = {
      t: chat.ChatMessagePayloadType.GUEST_TO_HOST_HANDSHAKE,
      o: chat.toChatRemotePushSendOptions(localPushCredentials, conv.id),
    };

    const sw = navigator.serviceWorker.controller;
    if (sw) {
      sw.postMessage({
        type: 'CHAT_SEND',
        payloadString: JSON.stringify(handshake),
        conversationId: conv.id,
        localPushCredentials,
        remotePushSendOption: { ...remotePushSend, type: 'remote' },
      });
      addLog('Reconnection handshake sent');
    }
  };

  // Handle incoming messages (client-specific logic)
  const handleIncomingMessage = useCallback(
    async (payload: chat.ChatMessagePayload) => {
      if (!chatStorage) return;

      const { conversationId, fullMessage } = payload;

      // Fetch conversation directly from storage to avoid stale state
      let conv = await chatStorage.conversationsStorage.get(conversationId);
      if (!conv) {
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
          await handleIncomingChatMessage(
            payload,
            chatStorage,
            currentActiveId,
            setMessages,
            setConversations,
            setQuotaExceeded,
            addLog,
          );
          break;
        }

        default:
          addLog(`Unknown message type: ${fullMessage.t}`);
      }
    },
    [chatStorage, conversationsRef, activeConversationIdRef, setConversations, setMessages, setQuotaExceeded, addLog],
  );

  // Register the handler
  useEffect(() => {
    registerIncomingMessageHandler(handleIncomingMessage);
  }, [registerIncomingMessageHandler, handleIncomingMessage]);

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

      // Ensure we have local push credentials
      const credentials = localPushCredentials || (await initializeCredentials());
      if (!credentials) {
        addLog('Failed to join session: could not initialize push credentials');
        setConnectionStatus('idle');
        return null;
      }

      const conversationId = hostCredentials.conversationId;

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
        o: chat.toChatRemotePushSendOptions(credentials, conversationId),
      };

      const sw = navigator.serviceWorker.controller;
      if (sw) {
        sw.postMessage({
          type: 'CHAT_SEND',
          payloadString: JSON.stringify(handshake),
          conversationId,
          localPushCredentials: credentials,
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

  const deleteConversation = async (conversationId: string) => {
    await base.deleteConversation(conversationId);
    if (base.activeConversationId === conversationId) {
      setConnectionStatus('idle');
    }
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
    localPushCredentials,
  };
}
