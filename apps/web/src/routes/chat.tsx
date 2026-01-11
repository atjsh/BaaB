import { createFileRoute, Link, Outlet, useMatches } from '@tanstack/react-router';
import { useEffect, useState, useCallback, useMemo } from 'react';

import { chat } from '@baab/shared';

import { ChatSidebar } from '../components/ChatSidebar';
import { HowToUse } from '../components/HowToUse';
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
  staticData: {
    breadcrumb: 'Chat',
  },
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

  return (
    <main className="flex relative h-[calc(100vh-6rem)]">
      <ChatSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        isLoading={isLoading}
      />

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
            <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 gap-5">
              <HowToUse />
              <div className="md:hidden gap-2 w-full max-w-sm flex mb-10">
                <Link
                  to="/chat/host"
                  onClick={() => setSidebarOpen(false)}
                  className="flex-1 bg-blue-500 text-white px-3 py-2 rounded text-center text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  Host Chat Room
                </Link>
                <Link
                  to="/chat/join"
                  onClick={() => setSidebarOpen(false)}
                  className="flex-1 bg-green-500 text-white px-3 py-2 rounded text-center text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  Join Chat Room
                </Link>
              </div>
            </div>
          )}
        </ChatLayoutContext.Provider>
      </div>
    </main>
  );
}
