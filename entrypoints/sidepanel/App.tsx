import React, { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bot, Sparkles, Compass, ShieldCheck } from 'lucide-react';
import { useAppStore, STORAGE_KEYS } from '../../src/stores/useAppStore';
import { db } from '../../src/services/db';
import { ToolCallCard } from '../../src/components/chat/ToolCallCard';
import { MarkdownContent } from '../../src/components/chat/MarkdownContent';
import { Header } from '../../src/components/chat/Header';
import { ActiveTabStrip } from '../../src/components/chat/ActiveTabStrip';
import { MessageInput } from '../../src/components/chat/MessageInput';
import { SettingsView } from '../../src/components/settings/SettingsView';
import { HistoryView } from '../../src/components/history/HistoryView';
import { runChatStream } from '../../src/services/chat-runner';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { LiveActivityBanner } from '../../src/components/chat/LiveActivityBanner';
import { FilesView } from '../../src/components/files/FilesView';
import { ToolStudioView } from '../../src/components/tools/ToolStudioView';
import { SchedulerView } from '../../src/components/scheduler/SchedulerView';

export const App: React.FC = () => {
  const {
    view,
    activeThreadId,
    provider,
    hostedModel,
    thinkingLevel,
    loadSettings,
    isSettingsLoaded,
    addToMessageHistory,
  } = useAppStore();

  const [isStreaming, setIsStreaming] = React.useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleAbort = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  // Auto-scroll to bottom when new messages arrive or while streaming
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Initialize settings & Heartbeat
  useEffect(() => {
    loadSettings();
    const interval = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'sidepanel-heartbeat' }).catch(() => {});
    }, 500);

    const onMessage = (msg: any) => {
      if (msg.type === 'close-sidepanel') {
        window.close();
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [loadSettings]);

  // 2. Reactive query from IndexedDB for live chat timeline
  const activeThread = useLiveQuery(
    () => (activeThreadId ? db.threads.get(activeThreadId) : undefined),
    [activeThreadId]
  );

  useEffect(() => {
    scrollToBottom();
  }, [activeThread?.messages, isStreaming]);

  // 3. Listen for Omnibox or In-Page Quick Command submissions
  useEffect(() => {
    const checkPendingOmnibox = async () => {
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.pendingOmniboxMessage,
        STORAGE_KEYS.pendingOmniboxMessageId,
      ]);
      const prompt = data[STORAGE_KEYS.pendingOmniboxMessage];
      if (prompt && typeof prompt === 'string') {
        await chrome.storage.local.remove([
          STORAGE_KEYS.pendingOmniboxMessage,
          STORAGE_KEYS.pendingOmniboxMessageId,
        ]);
        const targetThreadId = activeThreadId || (await useAppStore.getState().navigateToNewChat());
        chrome.runtime.sendMessage({
          type: 'AGENT_DISPATCH_PROMPT',
          threadId: targetThreadId,
          prompt,
        });
      }
    };

    checkPendingOmnibox();
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STORAGE_KEYS.pendingOmniboxMessage]) {
        checkPendingOmnibox();
      }
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, [activeThreadId]);

  if (!isSettingsLoaded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background text-muted-foreground font-mono text-xs gap-2">
        <Bot className="size-6 text-primary animate-pulse" />
        <span>Loading SAM-Agent...</span>
      </div>
    );
  }

  if (view === 'settings') {
    return <SettingsView />;
  }

  if (view === 'threads') {
    return <HistoryView />;
  }

  if (view === 'files') {
    return <FilesView />;
  }

  if (view === 'tools') {
    return <ToolStudioView />;
  }

  if (view === 'scheduler') {
    return <SchedulerView />;
  }

  const hasMessages = activeThread && activeThread.messages.length > 0;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground selection:bg-primary/20">
      <Header
        title={activeThread?.title || 'SAM-Agent'}
        tokenUsage={activeThread?.tokenUsage}
      />
      <ActiveTabStrip />

      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scroll-smooth">
        {!hasMessages ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 my-auto">
            <div className="size-12 rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-transparent border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              <Bot className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground tracking-tight">How can I assist your browsing?</h2>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                Autonomous browser agent for research, web form automation, and full-page workflows.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs text-left pt-2">
              <div className="p-2.5 rounded-xl border border-border/70 bg-card/60 text-xs text-muted-foreground flex items-center gap-2.5">
                <Compass className="size-4 text-primary shrink-0" />
                <span>Navigate & research multi-tab sources</span>
              </div>
              <div className="p-2.5 rounded-xl border border-border/70 bg-card/60 text-xs text-muted-foreground flex items-center gap-2.5">
                <Sparkles className="size-4 text-amber-500 shrink-0" />
                <span>Reasoning models with step-by-step thinking</span>
              </div>
              <div className="p-2.5 rounded-xl border border-border/70 bg-card/60 text-xs text-muted-foreground flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
                <span>Isolated sandbox code execution & VFS</span>
              </div>
            </div>
          </div>
        ) : (
          activeThread.messages.map((message, idx) => {
            const hasText = message.parts.some((p) => p.type === 'text' && p.text.trim().length > 0);
            const hasToolCalls = message.parts.some((p) => p.type === 'tool-call');
            const hasContent = hasText || hasToolCalls;
            const isLast = idx === activeThread.messages.length - 1;
            const isWaiting = isStreaming && isLast && message.role === 'assistant' && !hasContent;

            return (
              <MessageBubble
                key={message.id}
                message={message}
                isWaiting={isWaiting}
                hostedModel={hostedModel}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>

      <div className="p-3 border-t border-border bg-card/60 backdrop-blur-md space-y-2">
        <LiveActivityBanner
          isStreaming={isStreaming}
          onAbort={handleAbort}
        />
        <MessageInput
          isStreaming={isStreaming}
          onSend={async (prompt, files, includePageContext = true) => {
            if (!prompt.trim() && (!files || files.length === 0)) return;
            const threadId = activeThreadId || (await useAppStore.getState().navigateToNewChat());
            await addToMessageHistory(prompt);

            const controller = new AbortController();
            abortControllerRef.current = controller;

            // Trigger direct in-sidepanel streaming chat runner with autonomous multi-step loop
            setIsStreaming(true);
            try {
              await runChatStream({
                threadId,
                prompt,
                files,
                provider,
                model: hostedModel,
                thinkingLevel,
                includePageContext,
                signal: controller.signal,
              });
            } finally {
              setIsStreaming(false);
              abortControllerRef.current = null;
            }
          }}
          onStop={handleAbort}
        />
      </div>
    </div>
  );
};
