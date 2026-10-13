import React from 'react';
import { MessageInput } from './MessageInput';
import type { AttachedFilePayload } from '../../types/agent';

export interface ChatInputProps {
  onSend: (prompt: string, files?: AttachedFilePayload[], includePageContext?: boolean) => void;
  onStop: () => void;
  isStreaming?: boolean;
}

/**
 * ChatInput component providing text and voice input, attachment handling,
 * and Multi-Agent mode delegation controls.
 */
export const ChatInput: React.FC<ChatInputProps> = (props) => {
  return <MessageInput {...props} />;
};

export default ChatInput;
