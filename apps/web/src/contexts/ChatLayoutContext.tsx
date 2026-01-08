import { createContext, useContext } from 'react';

interface ChatLayoutContextValue {
  openSidebar: () => void;
}

export const ChatLayoutContext = createContext<ChatLayoutContextValue | null>(null);

export function useChatLayout() {
  const context = useContext(ChatLayoutContext);
  if (!context) {
    // Return a no-op if not within the context
    return { openSidebar: () => {} };
  }
  return context;
}
