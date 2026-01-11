import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { HowToUse } from '../../components/HowToUse';
import { MobileHeader } from '../../components/MobileHeader';
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
  staticData: {
    breadcrumb: 'Host',
  },
});

/**
 * This component creates a new chat session and redirects to the chatroom.
 * It's a simple entry point that auto-creates a session.
 */
function ChatHostComponent() {
  const navigate = useNavigate();
  const { openSidebar } = useChatLayout();
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isInitialized, createNewSession } = useChatHost({
    addLog: () => {}, // No logging needed for redirect-only component
  });

  // Auto-create a new session when component mounts
  useEffect(() => {
    if (isInitialized && !isCreatingSession) {
      handleCreateSession();
    }
  }, [isInitialized]);

  const handleCreateSession = async () => {
    setIsCreatingSession(true);
    setError(null);
    try {
      const conversationId = await createNewSession();
      if (conversationId) {
        navigate({ to: '/chat/$chatroomId', params: { chatroomId: conversationId } });
      } else {
        setError('Failed to create session. Please try again.');
        setIsCreatingSession(false);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsCreatingSession(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <MobileHeader onOpenSidebar={openSidebar} title="Host Chat" />
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {!isInitialized || isCreatingSession ? (
          <div className="animate-pulse">{isCreatingSession ? 'Creating new session...' : 'Initializing...'}</div>
        ) : error ? (
          <div className="text-center">
            <HowToUse />
            <p className="mt-4 text-red-500">{error}</p>
            <button onClick={handleCreateSession} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">
              Try Again
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-500">
            <HowToUse />
            <p className="mt-4">Creating a new hosted session...</p>
          </div>
        )}
      </div>
    </div>
  );
}
