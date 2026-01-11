import { Link } from '@tanstack/react-router';

import { chat } from '@baab/shared';

import { ConversationList } from './ConversationList';

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: chat.Conversation[];
  isLoading: boolean;
}

export function ChatSidebar({ isOpen, onClose, conversations, isLoading }: ChatSidebarProps) {
  const hostConversations = conversations.filter((c) => c.role === chat.ConversationRole.HOST);
  const guestConversations = conversations.filter((c) => c.role === chat.ConversationRole.GUEST);

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />}

      {/* Left Panel - Conversation List */}
      <aside
        className={`
          bg-white fixed inset-y-0 left-0 z-50 w-72 flex flex-col transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0 md:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Gradient border on right */}
        <div className="absolute top-0 right-0 w-px h-full bg-linear-to-b from-black to-transparent" />
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">
              <Link to="/chat" onClick={onClose}>
                Chat
              </Link>
            </h2>
            {/* Close button for mobile */}
            <button onClick={onClose} className="md:hidden p-1 text-gray-500 hover:text-gray-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-2">
            <Link
              to="/chat/host"
              onClick={onClose}
              className="flex-1 bg-blue-500 text-white px-3 py-2 rounded text-center text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              Host
            </Link>
            <Link
              to="/chat/join"
              onClick={onClose}
              className="flex-1 bg-green-500 text-white px-3 py-2 rounded text-center text-sm font-medium hover:bg-green-600 transition-colors"
            >
              Join
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : conversations.length === 0 ? (
            <p className="text-gray-500 text-sm">No conversations yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {hostConversations.length > 0 && (
                <div>
                  <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">
                    Hosted ({hostConversations.length})
                  </h3>
                  <ConversationList
                    conversations={hostConversations}
                    activeConversationId={null}
                    onSelectConversation={onClose}
                    linkMode
                  />
                </div>
              )}
              {guestConversations.length > 0 && (
                <div>
                  <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">
                    Joined ({guestConversations.length})
                  </h3>
                  <ConversationList
                    conversations={guestConversations}
                    activeConversationId={null}
                    onSelectConversation={onClose}
                    linkMode
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
