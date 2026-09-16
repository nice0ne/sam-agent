import React from 'react';
import { Header } from './Header';
import { ActiveTabStrip } from './ActiveTabStrip';

export interface ChatViewProps {
  title?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  children?: React.ReactNode;
}

/**
 * ChatView component rendering Header, ActiveTabStrip, and child content
 */
export const ChatView: React.FC<ChatViewProps> = ({
  title = 'SAM-Agent',
  tokenUsage,
  children,
}) => {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title={title} tokenUsage={tokenUsage} />
      <ActiveTabStrip />
      {children}
    </div>
  );
};

export default ChatView;
