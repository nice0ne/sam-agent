import { create } from 'zustand';
import { db, createThread } from '../services/db';

export const STORAGE_KEYS = {
  geminiApiKey: 'geminiApiKey',
  useProxy: 'useProxy',
  provider: 'provider',
  hostedModel: 'hostedModel',
  anthropicModel: 'anthropicModel',
  openaiModel: 'openaiModel',
  thinkingLevel: 'thinkingLevel',
  lastActiveThreadId: 'lastActiveThreadId',
  lastView: 'lastView',
  messageHistory: 'messageHistory',
  pendingOmniboxMessage: 'omniboxPendingMessage',
  pendingOmniboxMessageId: 'omniboxPendingMessageId',
  agentSoul: 'agentSoul',
  enableRtk: 'enableRtk',
  enablePonytail: 'enablePonytail',
} as const;

export interface AppState {
  view: 'threads' | 'chat' | 'settings' | 'files' | 'tools' | 'scheduler';
  activeThreadId: string | null;
  messageHistory: string[];
  provider: string;
  hostedModel: string;
  anthropicModel: string;
  openaiModel: string;
  thinkingLevel: 'none' | 'low' | 'medium' | 'high';
  isSettingsLoaded: boolean;

  // Actions
  setView: (view: 'threads' | 'chat' | 'settings' | 'files' | 'tools' | 'scheduler') => void;
  navigateToChat: (threadId: string) => void;
  navigateToNewChat: () => Promise<string>;
  navigateToThreads: () => void;
  navigateToFiles: () => void;
  navigateToTools: () => void;
  navigateToScheduler: () => void;
  navigateToSettings: () => void;
  deleteThread: (threadId: string) => Promise<void>;
  clearAllThreads: () => Promise<void>;
  setProvider: (provider: string) => Promise<void>;
  setThinkingLevel: (level: 'none' | 'low' | 'medium' | 'high') => Promise<void>;
  addToMessageHistory: (msg: string) => Promise<void>;
  loadSettings: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'chat',
  activeThreadId: null,
  messageHistory: [],
  provider: 'anthropic',
  hostedModel: 'claude-3-7-sonnet-20250219',
  anthropicModel: 'claude-3-7-sonnet-20250219',
  openaiModel: 'gpt-4o',
  thinkingLevel: 'high',
  isSettingsLoaded: false,

  setView: (view) => {
    set({ view });
    if (view === 'chat') {
      chrome.storage.local.set({ [STORAGE_KEYS.lastView]: 'chat' });
    }
  },

  navigateToChat: (threadId) => {
    set({ view: 'chat', activeThreadId: threadId });
    chrome.storage.local.set({
      [STORAGE_KEYS.lastActiveThreadId]: threadId,
      [STORAGE_KEYS.lastView]: 'chat',
    });
  },

  navigateToNewChat: async () => {
    const threadId = crypto.randomUUID();
    await createThread(threadId);
    set({ view: 'chat', activeThreadId: threadId });
    await chrome.storage.local.set({
      [STORAGE_KEYS.lastActiveThreadId]: threadId,
      [STORAGE_KEYS.lastView]: 'chat',
    });
    return threadId;
  },

  navigateToThreads: () => {
    set({ view: 'threads' });
  },

  navigateToFiles: () => {
    set({ view: 'files' });
  },

  navigateToTools: () => {
    set({ view: 'tools' });
  },

  navigateToScheduler: () => {
    set({ view: 'scheduler' });
  },

  navigateToSettings: () => set({ view: 'settings' }),

  deleteThread: async (threadId) => {
    await db.threads.delete(threadId);
    if (get().activeThreadId === threadId) {
      const latest = await db.threads.orderBy('updatedAt').last();
      set({ activeThreadId: latest ? latest.id : null, view: 'chat' });
      if (latest) {
        await chrome.storage.local.set({ [STORAGE_KEYS.lastActiveThreadId]: latest.id });
      } else {
        await chrome.storage.local.remove([STORAGE_KEYS.lastActiveThreadId]);
      }
    }
  },

  clearAllThreads: async () => {
    await db.threads.clear();
    set({ activeThreadId: null, view: 'chat' });
    await chrome.storage.local.remove([STORAGE_KEYS.lastActiveThreadId]);
  },

  setProvider: async (provider) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.provider]: provider });
    set({ provider });
  },

  setThinkingLevel: async (thinkingLevel) => {
    await chrome.storage.local.set({ [STORAGE_KEYS.thinkingLevel]: thinkingLevel });
    set({ thinkingLevel });
  },

  addToMessageHistory: async (msg) => {
    const trimmed = msg.trim();
    if (!trimmed) return;
    const prev = get().messageHistory;
    const updated = [...prev.filter((m) => m !== trimmed), trimmed].slice(-100);
    await chrome.storage.local.set({ [STORAGE_KEYS.messageHistory]: updated });
    set({ messageHistory: updated });
  },

  loadSettings: async () => {
    const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
    let view: AppState['view'] = 'chat';
    let activeThreadId: string | null = null;

    if (data[STORAGE_KEYS.lastActiveThreadId]) {
      const exists = await db.threads.get(data[STORAGE_KEYS.lastActiveThreadId]);
      if (exists) {
        activeThreadId = exists.id;
      }
    }

    if (!activeThreadId) {
      const latestThread = await db.threads.orderBy('updatedAt').last();
      if (latestThread) {
        activeThreadId = latestThread.id;
      }
    }

    // Always ensure startup view is 'chat' and sanitize storage
    view = 'chat';
    await chrome.storage.local.set({ [STORAGE_KEYS.lastView]: 'chat' });

    set({
      view,
      activeThreadId,
      messageHistory: Array.isArray(data[STORAGE_KEYS.messageHistory]) ? data[STORAGE_KEYS.messageHistory] : [],
      provider: data[STORAGE_KEYS.provider] && data[STORAGE_KEYS.provider] !== 'proxy' ? data[STORAGE_KEYS.provider] : 'anthropic',
      hostedModel: data[STORAGE_KEYS.hostedModel] || 'claude-3-7-sonnet-20250219',
      anthropicModel: data[STORAGE_KEYS.anthropicModel] || 'claude-3-7-sonnet-20250219',
      openaiModel: data[STORAGE_KEYS.openaiModel] || 'gpt-4o',
      thinkingLevel: data[STORAGE_KEYS.thinkingLevel] || 'high',
      isSettingsLoaded: true,
    });
  },
}));
