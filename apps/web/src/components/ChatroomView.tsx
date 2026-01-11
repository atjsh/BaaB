import { useState } from 'react';

import { chat } from '@baab/shared';

import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { ChatMessageList } from './ChatMessageList';
import { ConnectionStatusBanner, DebugLogs, InviteLinkSection } from './ChatUIElements';
import { useChatLayout } from '../contexts/ChatLayoutContext';

export interface ChatroomViewProps {
  conversation: chat.Conversation;
  messages: chat.ChatMessagePayload[];
  quotaExceeded: boolean;
  onSend: (content: string, contentType: chat.ChatMessageContentType) => Promise<void>;
  onDeleteMessage: (messageId: number) => void;
  onClose: () => void;
  /** Current user's ID for message ownership */
  currentUserId: string;
  // Host-specific props
  inviteLink?: string;
  // Client-specific props
  connectionStatus?: 'idle' | 'connecting' | 'connected';
  onRetry?: () => void;
  // Debug
  logs?: string[];
}

export function ChatroomView({
  conversation,
  messages,
  quotaExceeded,
  onSend,
  onDeleteMessage,
  onClose,
  currentUserId,
  inviteLink,
  connectionStatus,
  onRetry,
  logs = [],
}: ChatroomViewProps) {
  const { openSidebar } = useChatLayout();
  const [enlargeQr, setEnlargeQr] = useState(false);

  const isInputDisabled =
    quotaExceeded ||
    connectionStatus === 'connecting' ||
    conversation.status === chat.ConversationStatus.UNAVAILABLE ||
    conversation.status === chat.ConversationStatus.CLOSED;

  const handleSendMessage = async (content: string, contentType: chat.ChatMessageContentType) => {
    await onSend(content, contentType);
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <ChatHeader conversation={conversation} inviteLink={inviteLink} onClose={onClose} onOpenSidebar={openSidebar} />

      {/* Invite Link Section (for pending host conversations) */}
      {conversation.role === chat.ConversationRole.HOST &&
        conversation.status === chat.ConversationStatus.PENDING &&
        inviteLink && (
          <InviteLinkSection
            inviteLink={inviteLink}
            enlargeQr={enlargeQr}
            onToggleQr={() => setEnlargeQr(!enlargeQr)}
          />
        )}

      {/* Connection Status Banner (for guest conversations) */}
      {conversation.role === chat.ConversationRole.GUEST && (
        <ConnectionStatusBanner status={conversation.status} connectionStatus={connectionStatus} onRetry={onRetry} />
      )}

      {/* Messages */}
      <ChatMessageList messages={messages} currentUserId={currentUserId} onDeleteMessage={onDeleteMessage} />

      {/* Input */}
      <ChatInput onSend={handleSendMessage} disabled={isInputDisabled} quotaExceeded={quotaExceeded} />

      {/* Debug Logs */}
      <DebugLogs logs={logs} />
    </div>
  );
}
