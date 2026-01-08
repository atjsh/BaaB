import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { chat } from '@baab/shared';

import { ChatHeader } from '../../components/ChatHeader';
import { ChatInput } from '../../components/ChatInput';
import { ChatMessageList } from '../../components/ChatMessageList';
import { QRCode } from '../../components/QRCode';
import { useChatLayout } from '../../contexts/ChatLayoutContext';
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
  const { openSidebar } = useChatLayout();
  const [logs, setLogs] = useState<string[]>([]);
  const [enlargeQr, setEnlargeQr] = useState(false);

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

  const handleSendMessage = async (content: string, contentType: chat.ChatMessageContentType) => {
    if (!activeConversation) return;
    await sendMessage(content, contentType);
  };

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
    <div className="flex-1 flex flex-col h-full">
      <ChatHeader
        conversation={activeConversation}
        inviteLink={inviteLink}
        onClose={() => {
          deleteConversation(activeConversation.id);
          navigate({ to: '/chat' });
        }}
        onOpenSidebar={openSidebar}
      />

      {/* Invite Link Section (for pending conversations) */}
      {activeConversation.status === chat.ConversationStatus.PENDING && inviteLink && (
        <div className="border-b p-4 bg-yellow-50">
          <p className="text-sm font-medium mb-2">Share this link to start chatting:</p>
          <div className="flex flex-row gap-4 flex-wrap">
            <div>
              <p className="text-xs font-bold mb-1">Scan QR code</p>
              <div
                onClick={() => setEnlargeQr(!enlargeQr)}
                className="cursor-pointer"
                style={{ width: enlargeQr ? 200 : 100, height: enlargeQr ? 200 : 100 }}
              >
                <QRCode value={inviteLink} />
              </div>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-xs font-bold">Or copy link:</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="border p-2 rounded text-xs flex-1 truncate"
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    alert('Link copied!');
                  }}
                  className="bg-blue-500 text-white px-3 py-1 rounded text-xs whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <ChatMessageList
        messages={messages}
        currentUserId={activeConversation.localPushSendOptionsId}
        onDeleteMessage={(messageId: number) => deleteMessage(activeConversation.id, messageId)}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={
          quotaExceeded ||
          activeConversation.status === chat.ConversationStatus.UNAVAILABLE ||
          activeConversation.status === chat.ConversationStatus.CLOSED
        }
        quotaExceeded={quotaExceeded}
      />

      {/* Debug Logs */}
      {logs.length > 0 && (
        <div className="border-t p-2 bg-gray-100 text-xs font-mono h-24 overflow-y-auto">
          {logs.slice(0, 20).map((log, i) => (
            <div key={i} className="text-gray-600">
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GuestChatroom({ chatroomId }: { chatroomId: string }) {
  const navigate = useNavigate();
  const { openSidebar } = useChatLayout();
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

  const handleSendMessage = async (content: string, contentType: chat.ChatMessageContentType) => {
    if (!activeConversation) return;
    await sendMessage(content, contentType);
  };

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
    <div className="flex-1 flex flex-col h-full">
      <ChatHeader
        conversation={activeConversation}
        onClose={() => {
          deleteConversation(activeConversation.id);
          navigate({ to: '/chat' });
        }}
        onOpenSidebar={openSidebar}
      />

      {/* Connection Status */}
      {connectionStatus === 'connecting' && (
        <div className="border-b p-4 bg-yellow-50">
          <p className="text-sm">Connecting to host...</p>
        </div>
      )}

      {activeConversation.status === chat.ConversationStatus.UNAVAILABLE && (
        <div className="border-b p-4 bg-red-50">
          <p className="text-sm text-red-700 mb-2">Unable to reach the host. They may be offline.</p>
          <button
            onClick={() => retryConnection(activeConversation.id)}
            className="text-xs bg-red-500 text-white px-3 py-1 rounded"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Messages */}
      <ChatMessageList
        messages={messages}
        currentUserId={activeConversation.localPushSendOptionsId}
        onDeleteMessage={(messageId: number) => deleteMessage(activeConversation.id, messageId)}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={
          quotaExceeded ||
          connectionStatus === 'connecting' ||
          activeConversation.status === chat.ConversationStatus.UNAVAILABLE ||
          activeConversation.status === chat.ConversationStatus.CLOSED
        }
        quotaExceeded={quotaExceeded}
      />

      {/* Debug Logs */}
      {logs.length > 0 && (
        <div className="border-t p-2 bg-gray-100 text-xs font-mono h-24 overflow-y-auto">
          {logs.slice(0, 20).map((log, i) => (
            <div key={i} className="text-gray-600">
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
