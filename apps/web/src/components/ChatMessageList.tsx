import React, { useEffect, useRef } from 'react';

import { chat } from '@baab/shared';

interface ChatMessageListProps {
  messages: chat.ChatMessagePayload[];
  currentUserId: string;
  onDeleteMessage: (messageId: number) => void;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, currentUserId, onDeleteMessage }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const decodeContent = (msg: chat.ChatMessage) => {
    try {
      return atob(msg.d);
    } catch {
      return msg.d;
    }
  };

  // Filter to only show actual messages (not handshakes)
  const chatMessages = messages.filter((msg) => msg.fullMessage.t === chat.ChatMessagePayloadType.MESSAGE);

  // Group messages by date
  const groupedMessages: { date: string; messages: chat.ChatMessagePayload[] }[] = [];
  let currentDate = '';

  chatMessages.forEach((msg) => {
    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== currentDate) {
      currentDate = dateStr;
      groupedMessages.push({ date: dateStr, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  if (chatMessages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 p-4">
        No messages yet. Start the conversation!
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-gray-50">
      {groupedMessages.map((group) => (
        <div key={group.date}>
          {/* Date separator */}
          <div className="flex items-center justify-center my-4">
            <span className="px-3 py-1 bg-gray-200 text-gray-600 text-xs rounded-full">{group.date}</span>
          </div>

          {/* Messages */}
          {group.messages.map((msg) => {
            const isMe = msg.from === currentUserId;
            const chatMsg = msg.fullMessage as chat.ChatMessage;
            const isText = chatMsg.c === chat.ChatMessageContentType.TEXT_PLAIN;
            const content = decodeContent(chatMsg);

            return (
              <div key={msg.id} className={`flex mb-3 ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`group relative max-w-[85%] md:max-w-[75%] ${isMe ? 'order-1' : 'order-2'}`}>
                  <div
                    className={`rounded-2xl px-3 md:px-4 py-2 ${
                      isMe ? 'bg-blue-500 text-white rounded-br-sm' : 'bg-white border rounded-bl-sm'
                    }`}
                  >
                    {/* Sender label */}
                    <div className={`text-xs mb-1 ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                      {isMe ? 'You' : 'Peer'}
                    </div>

                    {/* Message content */}
                    {isText ? (
                      <p className="whitespace-pre-wrap wrap-break-word text-sm md:text-base">{content}</p>
                    ) : (
                      <img
                        src={content}
                        alt="Shared image"
                        className="max-w-full rounded-lg"
                        style={{ maxHeight: 300 }}
                      />
                    )}

                    {/* Timestamp */}
                    <div className={`text-xs mt-1 ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>

                  {/* Delete button (visible on hover, always accessible on touch devices) */}
                  <button
                    onClick={() => {
                      if (confirm('Delete this message?')) {
                        onDeleteMessage(msg.id);
                      }
                    }}
                    className={`absolute top-1 opacity-50 md:opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity text-xs text-red-500 hover:text-red-700 bg-white rounded-full p-1.5 shadow min-w-[28px] min-h-[28px] flex items-center justify-center ${
                      isMe ? 'left-0 -translate-x-full -ml-1' : 'right-0 translate-x-full ml-1'
                    }`}
                    title="Delete message"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};
