import React from 'react';
import { Link } from '@tanstack/react-router';

import { chat } from '@baab/shared';

interface ConversationListProps {
  conversations: chat.Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onRetryConnection?: (id: string) => void;
  linkMode?: boolean; // When true, render as Links instead of clickable divs
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onRetryConnection,
  linkMode = false,
}) => {
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

  const formatStorageSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getStoragePercentage = (bytes: number) => {
    return Math.min(100, (bytes / chat.MAX_CONVERSATION_STORAGE_BYTES) * 100);
  };

  if (conversations.length === 0) {
    return <div className="text-gray-500 text-sm p-2 bg-gray-50 rounded">No conversations yet.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {conversations.map((conv) => {
        const content = (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(conv.status)}`} title={conv.status} />
                <span className="font-medium text-sm truncate">{conv.name}</span>
                {conv.unreadCount > 0 && (
                  <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full shrink-0">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500 shrink-0 ml-2">{formatTime(conv.lastActivityAt)}</span>
            </div>

            {conv.lastMessagePreview && (
              <p className="text-xs text-gray-500 mt-1 truncate">{conv.lastMessagePreview}</p>
            )}

            {/* Storage usage bar */}
            {!linkMode && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>{formatStorageSize(conv.storageBytesUsed)}</span>
                  <span>500 MB</span>
                </div>
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      getStoragePercentage(conv.storageBytesUsed) > 90
                        ? 'bg-red-500'
                        : getStoragePercentage(conv.storageBytesUsed) > 70
                          ? 'bg-yellow-500'
                          : 'bg-blue-500'
                    }`}
                    style={{ width: `${getStoragePercentage(conv.storageBytesUsed)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action buttons (only in non-link mode) */}
            {!linkMode && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t">
                <span className="text-xs text-gray-400 capitalize">{conv.status}</span>
                <div className="flex gap-2">
                  {conv.status === chat.ConversationStatus.UNAVAILABLE && onRetryConnection && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onRetryConnection(conv.id);
                      }}
                      className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded hover:bg-yellow-600"
                    >
                      Try Again
                    </button>
                  )}
                  {onDeleteConversation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (confirm('Delete this conversation? All messages will be lost.')) {
                          onDeleteConversation(conv.id);
                        }
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        );

        const className = `border rounded-lg p-3 cursor-pointer transition-colors ${
          activeConversationId === conv.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
        }`;

        if (linkMode) {
          return (
            <Link
              key={conv.id}
              to="/chat/$chatroomId"
              params={{ chatroomId: conv.id }}
              className={`block ${className}`}
            >
              {content}
            </Link>
          );
        }

        return (
          <div key={conv.id} className={className} onClick={() => onSelectConversation(conv.id)}>
            {content}
          </div>
        );
      })}
    </div>
  );
};
