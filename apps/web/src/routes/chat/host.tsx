import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { chat } from '@baab/shared';

import { ChatHeader } from '../../components/ChatHeader';
import { ChatInput } from '../../components/ChatInput';
import { ChatMessageList } from '../../components/ChatMessageList';
import { HowToUse } from '../../components/HowToUse';
import { QRCode } from '../../components/QRCode';
import { useChatLayout } from '../../contexts/ChatLayoutContext';
import { useChatHost } from '../../hooks/useChatHost';

export const Route = createFileRoute('/chat/host')({
  component: ChatHostComponent,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Host a secure chat session using BaaB',
      },
      {
        title: 'Host Chat - BaaB',
      },
    ],
  }),
});

function ChatHostComponent() {
  const navigate = useNavigate();
  const { openSidebar } = useChatLayout();
  const [logs, setLogs] = useState<string[]>([]);
  const [enlargeQr, setEnlargeQr] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const {
    activeConversation,
    messages,
    isInitialized,
    inviteLink,
    quotaExceeded,
    createNewSession,
    sendMessage,
    deleteMessage,
    deleteConversation,
  } = useChatHost({
    addLog: (msg: string) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    },
  });

  // Auto-create a new session when component mounts if no active conversation
  useEffect(() => {
    if (isInitialized && !activeConversation && !isCreatingSession) {
      handleCreateSession();
    }
  }, [isInitialized, activeConversation]);

  const handleCreateSession = async () => {
    setIsCreatingSession(true);
    const conversationId = await createNewSession();
    setIsCreatingSession(false);
    if (conversationId) {
      navigate({ to: '/chat/$chatroomId', params: { chatroomId: conversationId } });
    }
  };

  const handleSendMessage = async (content: string, contentType: chat.ChatMessageContentType) => {
    if (!activeConversation) return;
    await sendMessage(content, contentType);
  };

  if (!isInitialized || isCreatingSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="animate-pulse text-gray-500">
          {isCreatingSession ? 'Creating new session...' : 'Initializing...'}
        </div>
      </div>
    );
  }

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
        <HowToUse />
        <p className="mt-4">Creating a new hosted session...</p>
        <button onClick={handleCreateSession} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">
          Create Session
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
