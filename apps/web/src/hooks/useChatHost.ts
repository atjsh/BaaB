import { useCallback, useEffect, useState } from 'react';

import { chat } from '@baab/shared';

import { handleIncomingChatMessage, useChatBase } from './useChatBase';

interface UseChatHostProps {
  initialConversationId?: string;
  addLog: (msg: string) => void;
}

export function useChatHost({ initialConversationId, addLog }: UseChatHostProps) {
  const [inviteLink, setInviteLink] = useState<string>('');

  const base = useChatBase({
    role: chat.ConversationRole.HOST,
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

  // Update invite link when initial conversation is loaded or credentials change
  useEffect(() => {
    if (isInitialized && activeConversation && localPushCredentials) {
      updateInviteLink(activeConversation.id);
    }
  }, [isInitialized, activeConversation?.id, localPushCredentials?.id]);

  const updateInviteLink = (conversationId: string) => {
    if (!localPushCredentials) return;
    const remoteOptions = chat.toChatRemotePushSendOptions(localPushCredentials, conversationId);
    const link = `${window.location.origin}/chat/join?connect=${encodeURIComponent(
      btoa(JSON.stringify(remoteOptions)),
    )}`;
    setInviteLink(link);
  };

  // Handle incoming messages (host-specific logic)
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

            // Update conversation status
            await chatStorage.conversationsStorage.updateStatus(
              existingRemote.conversationId,
              chat.ConversationStatus.ACTIVE,
            );
            await chatStorage.conversationsStorage.resetFailedAttempts(existingRemote.conversationId);

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
              setConversations((prev) => prev.map((c) => (c.id === existingRemote.conversationId ? updatedConv : c)));
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

  const sendHandshakeAck = async (conversationId: string) => {
    if (!chatStorage || !localPushCredentials) return;

    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    const remotePushSend = conv.remotePushSendOptionsId
      ? await chatStorage.remotePushSendStorage.get(conv.remotePushSendOptionsId)
      : null;

    if (!remotePushSend) {
      addLog('Cannot send ACK: missing remote push credentials');
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
        localPushCredentials,
        remotePushSendOption: { ...remotePushSend, type: 'remote' },
      });
      addLog('Sent handshake ACK');
    }
  };

  const createNewSession = async (): Promise<string | null> => {
    if (!chatStorage) return null;

    try {
      // Ensure we have local push credentials
      const credentials = localPushCredentials || (await initializeCredentials());
      if (!credentials) {
        addLog('Failed to create session: could not initialize push credentials');
        return null;
      }

      const conversationId = crypto.randomUUID();

      // Create conversation
      const newConversation: chat.Conversation = {
        id: conversationId,
        name: 'New Session (waiting for guest)',
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
      updateInviteLink(conversationId);

      addLog('New session created');
      return conversationId;
    } catch (error) {
      addLog(`Failed to create session: ${error}`);
      console.error(error);
      return null;
    }
  };

  const deleteConversation = async (conversationId: string) => {
    await base.deleteConversation(conversationId);
    if (base.activeConversationId === conversationId) {
      setInviteLink('');
    }
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
    localPushCredentials,
  };
}
