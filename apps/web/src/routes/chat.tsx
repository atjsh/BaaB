import { createFileRoute, Link, Outlet, useMatches } from '@tanstack/react-router';
import { useEffect, useState, useCallback, useMemo } from 'react';

import { chat } from '@baab/shared';

import { ConversationList } from '../components/ConversationList';
import { HowToUse } from '../components/HowToUse';
import { SessionInfo } from '../components/SessionInfo';
import { ChatLayoutContext } from '../contexts/ChatLayoutContext';
import { ChatStorageManager } from '../lib/storage/chat.db';

export const Route = createFileRoute('/chat')({
  component: ChatLayoutComponent,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Chat securely using BaaB',
      },
      {
        title: 'Chat - BaaB',
      },
    ],
  }),
});

function ChatLayoutComponent() {
  const [conversations, setConversations] = useState<chat.Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const matches = useMatches();

  // Check if we're on a child route (has chatroom selected)
  const isChildRoute = matches.some(
    (m) => m.routeId.includes('$chatroomId') || m.routeId.includes('/host') || m.routeId.includes('/join'),
  );

  const loadConversations = useCallback(async () => {
    try {
      const storage = await ChatStorageManager.createInstance();
      const allConversations = await storage.conversationsStorage.getAll();
      setConversations(allConversations.sort((a, b) => b.lastActivityAt - a.lastActivityAt));
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Refresh conversations periodically
  useEffect(() => {
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // Close sidebar when navigating to a child route on mobile
  useEffect(() => {
    if (isChildRoute) {
      setSidebarOpen(false);
    }
  }, [isChildRoute]);

  const hostConversations = conversations.filter((c) => c.role === chat.ConversationRole.HOST);
  const guestConversations = conversations.filter((c) => c.role === chat.ConversationRole.GUEST);

  return (
    <main className="flex relative h-[calc(100vh-4.5rem)]">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Left Panel - Conversation List */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 border-r flex flex-col bg-gray-50 transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0 md:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-4 border-b bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Chat</h2>
            {/* Close button for mobile */}
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-500 hover:text-gray-700">
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
              onClick={() => setSidebarOpen(false)}
              className="flex-1 bg-blue-500 text-white px-3 py-2 rounded text-center text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              Host
            </Link>
            <Link
              to="/chat/join"
              onClick={() => setSidebarOpen(false)}
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
                    onSelectConversation={() => setSidebarOpen(false)}
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
                    onSelectConversation={() => setSidebarOpen(false)}
                    linkMode
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3 border-t bg-white">
          <SessionInfo compact />
        </div>
      </aside>

      {/* Center + Right Panel - Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with hamburger menu */}
        {!isChildRoute && (
          <div className="md:hidden border-b p-3 bg-white flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-1 text-gray-600 hover:text-gray-800">
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
            <span className="font-semibold">Chat</span>
          </div>
        )}

        <ChatLayoutContext.Provider value={useMemo(() => ({ openSidebar: () => setSidebarOpen(true) }), [])}>
          {isChildRoute ? (
            <Outlet />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 text-gray-500">
              <HowToUse />
              <p className="mt-4 text-center">Select a conversation from the list or start a new session.</p>
            </div>
          )}
        </ChatLayoutContext.Provider>
      </div>
    </main>
  );
}
