import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { chat } from '@baab/shared';

import { ChatroomView } from '../../components/ChatroomView';
import { useChatHost } from '../../hooks/useChatHost';
import { useChatClient } from '../../hooks/useChatClient';
import { ChatStorageManager } from '../../lib/storage/chat.db';

export const Route = createFileRoute('/chat/$chatroomId')({
  component: ChatroomComponent,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Secure chat session using BaaB',
      },
      {
        title: 'Chat - BaaB',
      },
    ],
  }),
  staticData: {
    breadcrumb: 'Chat Room',
  },
});

function ChatroomComponent() {
  const { chatroomId } = Route.useParams();

  const navigate = useNavigate();
  const [conversationRole, setConversationRole] = useState<chat.ConversationRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Determine role from stored conversation
  useEffect(() => {
    const loadConversation = async () => {
      try {
        const storage = await ChatStorageManager.createInstance();
        const conversation = await storage.conversationsStorage.get(chatroomId);

        if (conversation) {
          setConversationRole(conversation.role);
        } else {
          // Conversation not found, redirect to chat
          navigate({ to: '/chat' });
        }
      } catch (error) {
        console.error('Failed to load conversation:', error);
        navigate({ to: '/chat' });
      } finally {
        setIsLoading(false);
      }
    };
    loadConversation();
  }, [chatroomId, navigate]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="animate-pulse text-gray-500">Loading conversation...</div>
      </div>
    );
  }

  if (conversationRole === chat.ConversationRole.HOST) {
    return <HostChatroom chatroomId={chatroomId} />;
  }

  if (conversationRole === chat.ConversationRole.GUEST) {
    return <GuestChatroom chatroomId={chatroomId} />;
  }

  return null;
}

function HostChatroom({ chatroomId }: { chatroomId: string }) {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<string[]>([]);

  const {
    activeConversation,
    messages,
    isInitialized,
    inviteLink,
    quotaExceeded,
    setActiveConversationId,
    sendMessage,
    deleteMessage,
    deleteConversation,
    localPushCredentials,
  } = useChatHost({
    initialConversationId: chatroomId,
    addLog: (msg: string) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    },
  });

  // Set active conversation on mount
  useEffect(() => {
    if (isInitialized) {
      setActiveConversationId(chatroomId);
    }
  }, [isInitialized, chatroomId, setActiveConversationId]);

  if (!isInitialized) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="animate-pulse text-gray-500">Initializing...</div>
      </div>
    );
  }

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
        <p>Conversation not found</p>
        <button onClick={() => navigate({ to: '/chat' })} className="mt-4 text-blue-500 hover:underline">
          Back to Chat
        </button>
      </div>
    );
  }

  return (
    <ChatroomView
      conversation={activeConversation}
      messages={messages}
      quotaExceeded={quotaExceeded}
      onSend={sendMessage}
      onDeleteMessage={(messageId) => deleteMessage(activeConversation.id, messageId)}
      onClose={() => {
        deleteConversation(activeConversation.id);
        navigate({ to: '/chat' });
      }}
      currentUserId={localPushCredentials?.id ?? ''}
      inviteLink={inviteLink}
      logs={logs}
    />
  );
}

function GuestChatroom({ chatroomId }: { chatroomId: string }) {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<string[]>([]);

  const {
    activeConversation,
    messages,
    isInitialized,
    connectionStatus,
    quotaExceeded,
    setActiveConversationId,
    sendMessage,
    deleteMessage,
    deleteConversation,
    retryConnection,
    localPushCredentials,
  } = useChatClient({
    initialConversationId: chatroomId,
    addLog: (msg: string) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    },
  });

  // Set active conversation on mount
  useEffect(() => {
    if (isInitialized) {
      setActiveConversationId(chatroomId);
    }
  }, [isInitialized, chatroomId, setActiveConversationId]);

  if (!isInitialized) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="animate-pulse text-gray-500">Initializing...</div>
      </div>
    );
  }

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
        <p>Conversation not found</p>
        <button onClick={() => navigate({ to: '/chat' })} className="mt-4 text-blue-500 hover:underline">
          Back to Chat
        </button>
      </div>
    );
  }

  return (
    <ChatroomView
      conversation={activeConversation}
      messages={messages}
      quotaExceeded={quotaExceeded}
      onSend={sendMessage}
      onDeleteMessage={(messageId) => deleteMessage(activeConversation.id, messageId)}
      onClose={() => {
        deleteConversation(activeConversation.id);
        navigate({ to: '/chat' });
      }}
      currentUserId={localPushCredentials?.id ?? ''}
      connectionStatus={connectionStatus}
      onRetry={() => retryConnection(activeConversation.id)}
      logs={logs}
    />
  );
}
