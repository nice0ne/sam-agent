export type ToolExecutionState = 'pending' | 'completed' | 'cancelled' | 'error';

export interface DomainMemoryRecord {
  domain: string;
  title?: string;
  formSelectors: Record<string, string>;
  verifiedEditorTypes?: Record<string, string>;
  successfulActionsCount: number;
  failedActionsCount: number;
  learnedCaveats: string[];
  updatedAt: number;
  createdAt: number;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  state: ToolExecutionState;
  input?: Record<string, any>;
  output?: any;
  errorText?: string;
  verified?: boolean;
  attempts?: number;
  selfCorrected?: boolean;
  strategyUsed?: string;
}

export interface TextPart {
  type: 'text';
  text: string;
}

export interface FilePart {
  type: 'file';
  url: string;
  mediaType?: string;
  filename?: string;
  size?: number;
}

export interface AttachedFilePayload {
  id?: string;
  name: string;
  size: number;
  type: string;
  content: string;
  isImage?: boolean;
  isPdf?: boolean;
  isOfficeDoc?: boolean;
  officeType?: 'docx' | 'xlsx' | 'pptx';
  extractedText?: string;
  wordCount?: number;
}

export interface ReasoningPart {
  type: 'reasoning';
  text: string;
  state?: 'thinking' | 'done';
}

export type MessagePart = TextPart | FilePart | ReasoningPart | ToolCallPart;

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  timestamp: number;
}

export interface ThreadRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ThreadMessage[];
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface VfsFileRecord {
  path: string;
  name: string;
  content: string;
  mimeType: string;
  size: number;
  updatedAt: number;
  createdAt: number;
}

export interface StoredHandleRecord {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  mode: 'read' | 'readwrite';
  mountedAt: number;
}

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }
  interface FileSystemHandle {
    queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }
}

export type { ScheduledTask } from '../services/scheduler';
