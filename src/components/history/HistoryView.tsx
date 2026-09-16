import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Search,
  Plus,
  Trash2,
  MessageSquare,
  Clock,
  ChevronRight,
  AlertTriangle,
  X,
  Bot,
} from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';
import { db } from '../../services/db';
import type { ThreadRecord } from '../../types/agent';

export const HistoryView: React.FC = () => {
  const { activeThreadId, navigateToChat, navigateToNewChat, deleteThread, clearAllThreads } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);

  // Live reactive query of all conversation threads sorted by updatedAt descending
  const threads = useLiveQuery(
    () => db.threads.orderBy('updatedAt').reverse().toArray(),
    []
  ) || [];

  // Filter threads based on search term
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter((t) => {
      const titleMatch = t.title.toLowerCase().includes(q);
      const contentMatch = t.messages.some((m) =>
        m.parts.some((p) => p.type === 'text' && p.text.toLowerCase().includes(q))
      );
      return titleMatch || contentMatch;
    });
  }, [threads, searchQuery]);

  // Format relative timestamp
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Extract preview snippet from the last message
  const getLastMessageSnippet = (thread: ThreadRecord) => {
    if (!thread.messages || thread.messages.length === 0) return 'Empty conversation';
    const lastMsg = thread.messages[thread.messages.length - 1];
    const textPart = lastMsg.parts.find((p) => p.type === 'text');
    if (textPart && textPart.type === 'text') {
      return textPart.text.replace(/[#*`\n]/g, ' ').trim().slice(0, 90);
    }
    return `${lastMsg.role}: [Action/Media]`;
  };

  const handleConfirmDelete = async () => {
    if (threadToDelete) {
      await deleteThread(threadToDelete);
      setThreadToDelete(null);
    }
  };

  const handleConfirmClearAll = async () => {
    await clearAllThreads();
    setIsClearAllModalOpen(false);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between px-3.5 py-3 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (activeThreadId) {
                navigateToChat(activeThreadId);
              } else if (threads.length > 0) {
                navigateToChat(threads[0].id);
              } else {
                navigateToNewChat();
              }
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-all cursor-pointer"
            title="Back to Chat"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
              <span>Chat History</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">
                {threads.length}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {threads.length > 0 && (
            <button
              type="button"
              onClick={() => setIsClearAllModalOpen(true)}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all cursor-pointer"
              title="Clear all chat history"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigateToNewChat()}
            className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground hover:opacity-90 rounded-lg text-xs font-medium cursor-pointer shadow-2xs active:scale-95 transition-all"
            title="Start New Chat"
          >
            <Plus className="size-3.5" />
            <span className="hidden xs:inline">New Chat</span>
          </button>
        </div>
      </header>

      {/* Search Filter Bar */}
      {threads.length > 0 && (
        <div className="p-3 border-b border-border/60 bg-muted/20">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-background pl-8 pr-8 py-1.5 rounded-lg border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all select-text"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main List Area */}
      <main className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredThreads.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="size-12 rounded-2xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground shadow-2xs">
              <MessageSquare className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground">
                {searchQuery ? 'No matching conversations' : 'No chat history yet'}
              </h3>
              <p className="text-[11px] text-muted-foreground max-w-xs">
                {searchQuery
                  ? `No chats matched "${searchQuery}". Try a different keyword.`
                  : 'Start a new conversation with SAM-Agent to begin research, automation, and browsing.'}
              </p>
            </div>
            {!searchQuery && (
              <button
                type="button"
                onClick={() => navigateToNewChat()}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-xs font-medium cursor-pointer shadow-xs active:scale-95 transition-all"
              >
                <Plus className="size-3.5" />
                <span>Start New Conversation</span>
              </button>
            )}
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const isCurrent = thread.id === activeThreadId;
            const snippet = getLastMessageSnippet(thread);

            return (
              <div
                key={thread.id}
                className={`group relative flex items-start justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer shadow-2xs ${
                  isCurrent
                    ? 'border-primary/50 bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border/70 bg-card/70 hover:bg-card hover:border-border'
                }`}
                onClick={() => navigateToChat(thread.id)}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div
                    className={`size-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground group-hover:text-foreground'
                    }`}
                  >
                    <MessageSquare className="size-3.5" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-foreground truncate max-w-[200px] sm:max-w-[240px]">
                        {thread.title || 'Untitled Conversation'}
                      </h4>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0 flex items-center gap-1">
                        <Clock className="size-2.5" />
                        {formatTime(thread.updatedAt || thread.createdAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
                      {snippet}
                    </p>

                    <div className="flex items-center gap-2 pt-0.5 text-[10px] text-muted-foreground font-mono">
                      <span>{thread.messages.length} messages</span>
                      {thread.tokenUsage && thread.tokenUsage.totalTokens > 0 && (
                        <>
                          <span>•</span>
                          <span>{thread.tokenUsage.totalTokens.toLocaleString()} tok</span>
                        </>
                      )}
                      {isCurrent && (
                        <>
                          <span>•</span>
                          <span className="text-primary font-semibold">Active</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Individual Delete Button on Hover */}
                <div className="flex items-center shrink-0 self-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setThreadToDelete(thread.id);
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-60 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Delete this conversation"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Confirmation Modal: Delete Single Thread */}
      {threadToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-xl space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4.5 shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">Delete Conversation?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete this chat session? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setThreadToDelete(null)}
                className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 text-xs font-medium cursor-pointer transition-all shadow-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Clear All Threads */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-xl space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4.5 shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">Clear All Chat History?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will permanently delete all {threads.length} conversation threads and messages. Are you sure?
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsClearAllModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 text-xs font-medium cursor-pointer transition-all shadow-xs"
              >
                Clear Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
