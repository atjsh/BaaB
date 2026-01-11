import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { chat } from '@baab/shared';

import { ChatHeader } from '../../components/ChatHeader';
import { ChatInput } from '../../components/ChatInput';
import { ChatMessageList } from '../../components/ChatMessageList';
import { MobileHeader } from '../../components/MobileHeader';
import { useChatLayout } from '../../contexts/ChatLayoutContext';
import { useChatClient } from '../../hooks/useChatClient';

type ChatJoinRouteSearch = {
  connect?: string;
};

export const Route = createFileRoute('/chat/join')({
  component: ChatJoinComponent,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Join a secure chat session using BaaB',
      },
      {
        title: 'Join Chat - BaaB',
      },
    ],
  }),
  staticData: {
    breadcrumb: 'Join',
  },
  validateSearch: (search): ChatJoinRouteSearch => {
    const res: ChatJoinRouteSearch = {};
    if ('connect' in search && typeof search.connect === 'string' && search.connect.length > 0) {
      res.connect = search.connect;
    }
    return res;
  },
});

function ChatJoinComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { openSidebar } = useChatLayout();
  const [logs, setLogs] = useState<string[]>([]);
  const [manualConnectString, setManualConnectString] = useState('');

  const {
    activeConversation,
    messages,
    isInitialized,
    connectionStatus,
    quotaExceeded,
    joinSession,
    sendMessage,
    deleteMessage,
    deleteConversation,
    retryConnection,
    localPushCredentials,
  } = useChatClient({
    addLog: (msg: string) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    },
  });

  // Handle connect URL parameter
  useEffect(() => {
    if (search.connect && isInitialized && connectionStatus === 'idle') {
      joinSession(search.connect).then((conversationId) => {
        if (conversationId) {
          navigate({
            to: '/chat/$chatroomId',
            params: { chatroomId: conversationId },
            replace: true,
          });
        }
      });
    }
  }, [search.connect, isInitialized, connectionStatus, joinSession, navigate]);

  const handleManualJoin = async () => {
    if (!manualConnectString.trim()) return;
    const conversationId = await joinSession(manualConnectString.trim());
    if (conversationId) {
      navigate({
        to: '/chat/$chatroomId',
        params: { chatroomId: conversationId },
      });
    }
  };

  const handleSendMessage = async (content: string, contentType: chat.ChatMessageContentType) => {
    if (!activeConversation) return;
    await sendMessage(content, contentType);
  };

  if (!isInitialized) {
    return (
      <div className="flex-1 flex flex-col">
        <MobileHeader onOpenSidebar={openSidebar} title="Join Chat" />
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="animate-pulse text-gray-500">Initializing...</div>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'connecting') {
    return (
      <div className="flex-1 flex flex-col">
        <MobileHeader onOpenSidebar={openSidebar} title="Join Chat" />
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="animate-pulse text-gray-500">Connecting to host...</div>
        </div>
      </div>
    );
  }

  // Show join form if no active conversation and no connect param
  if (!activeConversation && !search.connect) {
    return (
      <div className="flex-1 flex flex-col">
        <MobileHeader onOpenSidebar={openSidebar} title="Join Chat" />
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter invite link or connection string:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualConnectString}
                onChange={(e) => setManualConnectString(e.target.value)}
                placeholder="Paste invite link here..."
                className="flex-1 border rounded px-3 py-2 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleManualJoin()}
              />
              <button
                onClick={handleManualJoin}
                disabled={!manualConnectString.trim()}
                className="bg-green-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col">
        <MobileHeader onOpenSidebar={openSidebar} title="Join Chat" />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
          <p>No active conversation</p>
        </div>
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
        currentUserId={localPushCredentials?.id ?? ''}
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
        <div className="border-t p-2 bg-gray-200 text-xs font-mono h-24 overflow-y-auto">
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
