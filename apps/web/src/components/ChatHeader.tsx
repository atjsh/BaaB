import React from 'react';

import { chat } from '@baab/shared';

import { StoragePieChart } from './StoragePieChart';

interface ChatHeaderProps {
  conversation: chat.Conversation;
  inviteLink?: string;
  onClose: () => void;
  onOpenSidebar?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ conversation, inviteLink, onClose, onOpenSidebar }) => {
  const getStatusColor = (status: chat.ConversationStatus) => {
    switch (status) {
      case chat.ConversationStatus.ACTIVE:
        return 'bg-green-500';
      case chat.ConversationStatus.PENDING:
        return 'bg-yellow-500';
      case chat.ConversationStatus.UNAVAILABLE:
        return 'bg-red-500';
      case chat.ConversationStatus.CLOSED:
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status: chat.ConversationStatus) => {
    switch (status) {
      case chat.ConversationStatus.ACTIVE:
        return 'Connected';
      case chat.ConversationStatus.PENDING:
        return 'Waiting...';
      case chat.ConversationStatus.UNAVAILABLE:
        return 'Unavailable';
      case chat.ConversationStatus.CLOSED:
        return 'Closed';
      default:
        return status;
    }
  };

  return (
    <div className="border-b p-3 md:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          {/* Mobile menu button */}
          {onOpenSidebar && (
            <button
              onClick={onOpenSidebar}
              className="md:hidden p-1 text-gray-600 hover:text-gray-800 shrink-0"
              title="Open sidebar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          <div className="min-w-0 flex-1 flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full shrink-0 ${getStatusColor(conversation.status)}`} />
              <h2 className="font-bold text-base md:text-lg truncate">{conversation.name}</h2>
            </div>
            <span className="text-xs md:text-sm text-gray-500">{getStatusText(conversation.status)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          {/* Storage pie chart */}
          <div className="flex flex-col items-center">
            <StoragePieChart bytesUsed={conversation.storageBytesUsed} size={44} />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {inviteLink && conversation.role === chat.ConversationRole.HOST && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  alert('Invite link copied!');
                }}
                className="text-xs md:text-sm bg-blue-500 text-white px-2 md:px-3 py-1 rounded hover:bg-blue-600"
                title="Copy invite link"
              >
                Share
              </button>
            )}
            <button
              onClick={() => {
                if (confirm('Close this conversation? You can reconnect later if the peer is still available.')) {
                  onClose();
                }
              }}
              className="text-xs md:text-sm text-red-500 hover:text-red-700 px-2"
              title="Close conversation"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Quota warning */}
      {conversation.storageBytesUsed >= chat.MAX_CONVERSATION_STORAGE_BYTES * 0.9 && (
        <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs md:text-sm text-yellow-700">
          {conversation.storageBytesUsed >= chat.MAX_CONVERSATION_STORAGE_BYTES ? (
            <strong>Storage full!</strong>
          ) : (
            <strong>Storage almost full!</strong>
          )}{' '}
          Delete some messages to free up space.
        </div>
      )}
    </div>
  );
};
