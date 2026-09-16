import React, { useState, useEffect, useRef } from 'react';
import {
  Bot, Plus, Settings, Zap, Moon, Sun, History,
  FolderTree, Wrench, CalendarClock, MoreVertical
} from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';

interface HeaderProps {
  title: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export const Header: React.FC<HeaderProps> = ({ title, tokenUsage }) => {
  const {
    provider,
    hostedModel,
    view,
    navigateToNewChat,
    navigateToSettings,
    navigateToThreads,
    navigateToFiles,
    navigateToTools,
    navigateToScheduler,
  } = useAppStore();

  const [isDark, setIsDark] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check saved theme from storage
    chrome.storage.local.get(['themeMode'], (result) => {
      const savedTheme = result.themeMode;
      const shouldUseDark = savedTheme ? savedTheme === 'dark' : true; // Default dark
      setIsDark(shouldUseDark);
      if (shouldUseDark) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
      }
    });
  }, []);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    chrome.storage.local.set({ themeMode: nextDark ? 'dark' : 'light' });
  };

  const handleAction = (actionFn: () => void) => {
    setIsMenuOpen(false);
    actionFn();
  };

  return (
    <header className="flex items-center justify-between px-3.5 py-2 border-b border-border bg-card/85 backdrop-blur-xl sticky top-0 z-30 shadow-2xs transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative size-7 rounded-lg bg-gradient-to-br from-primary/30 via-primary/10 to-transparent border border-primary/30 flex items-center justify-center text-primary shadow-xs shrink-0">
          <Bot className="size-4" />
          <span className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-card animate-pulse" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xs font-semibold truncate text-foreground tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-primary/15 text-primary font-semibold capitalize text-[9px] border border-primary/25">
              <Zap className="size-2.5 fill-current" />
              {provider}
            </span>
            <span>•</span>
            <span className="truncate max-w-28 text-foreground/80">{hostedModel}</span>
            {tokenUsage && tokenUsage.totalTokens > 0 && (
              <>
                <span>•</span>
                <span className="text-muted-foreground hidden xs:inline">
                  {tokenUsage.totalTokens.toLocaleString()} tok
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* New Chat Button */}
        <button
          type="button"
          onClick={() => navigateToNewChat()}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer border border-primary/20"
          title="Start New Chat"
        >
          <Plus className="size-3.5" />
          <span className="text-[11px] font-medium hidden xs:inline">New</span>
        </button>

        {/* Unified More / Navigation Menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer border ${
              isMenuOpen
                ? 'bg-muted text-foreground border-border'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/80 border-transparent'
            }`}
            title="App Navigation & Settings"
          >
            <MoreVertical className="size-4" />
          </button>

          {/* Clean Dropdown Popover */}
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-card border border-border rounded-xl shadow-xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => handleAction(navigateToFiles)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors cursor-pointer ${
                  view === 'files' ? 'text-primary font-medium bg-primary/5' : 'text-foreground'
                }`}
              >
                <FolderTree className="size-3.5 text-primary" />
                <span>Workspace Files (VFS)</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction(navigateToTools)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors cursor-pointer ${
                  view === 'tools' ? 'text-primary font-medium bg-primary/5' : 'text-foreground'
                }`}
              >
                <Wrench className="size-3.5 text-amber-500" />
                <span>Custom Tool Studio</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction(navigateToScheduler)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors cursor-pointer ${
                  view === 'scheduler' ? 'text-primary font-medium bg-primary/5' : 'text-foreground'
                }`}
              >
                <CalendarClock className="size-3.5 text-emerald-500" />
                <span>Task Scheduler</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction(navigateToThreads)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors cursor-pointer ${
                  view === 'threads' ? 'text-primary font-medium bg-primary/5' : 'text-foreground'
                }`}
              >
                <History className="size-3.5 text-indigo-500" />
                <span>Chat History</span>
              </button>

              <div className="my-1 border-t border-border/60" />

              <button
                type="button"
                onClick={() => handleAction(navigateToSettings)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors cursor-pointer ${
                  view === 'settings' ? 'text-primary font-medium bg-primary/5' : 'text-foreground'
                }`}
              >
                <Settings className="size-3.5 text-muted-foreground" />
                <span>AI Models & Settings</span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted transition-colors text-foreground cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  {isDark ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5 text-indigo-500" />}
                  <span>{isDark ? 'Light Theme' : 'Dark Theme'}</span>
                </div>
                <span className="text-[10px] text-muted-foreground uppercase font-mono">{isDark ? 'Dark' : 'Light'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
