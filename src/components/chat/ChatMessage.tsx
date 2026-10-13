import React from 'react';
import { MessageBubble } from './MessageBubble';
import type { ThreadMessage } from '../../types/agent';

export interface ChatMessageProps {
  message: ThreadMessage;
  isWaiting?: boolean;
  hostedModel?: string;
}

/**
 * ChatMessage component rendering messages and their parts (including subagent pipeline)
 */
export const ChatMessage: React.FC<ChatMessageProps> = (props) => {
  return <MessageBubble {...props} />;
};

export default ChatMessage;
