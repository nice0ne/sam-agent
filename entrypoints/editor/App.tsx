import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FileCode,
  FolderOpen,
  Plus,
  Code2,
  Sparkles,
  Download,
  Check,
  AlertTriangle,
  X,
} from 'lucide-react';
import { db } from '../../src/services/db';
import {
  saveVfsFile,
  getVfsFile,
  normalizePath,
  detectMimeType,
  getFileName,
} from '../../src/services/vfs';
import { beautifyCode } from '../../src/utils/code-beautifier';
import { downloadVfsFile } from '../../src/services/archive';
import {
  EditorHeader,
  EditorSidebar,
  EditorTabBar,
  EditorStatusBar,
  CodeMirrorEditor,
  OpenFileTab,
  CursorPosition,
} from '../../src/components/editor';
import type { VfsFileRecord } from '../../src/types/agent';

export const App: React.FC = () => {
  const [tabs, setTabs] = useState<OpenFileTab[]>([]);
  const [activePath, setActivePath] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [autoSave, setAutoSave] = useState(false);
  const [cursorPositions, setCursorPositions] = useState<Record<string, CursorPosition>>({});
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [isFormatting, setIsFormatting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync theme with chrome.storage.local
  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
      setThemeMode(isDark ? 'dark' : 'light');
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['themeMode'], (result) => {
        const savedTheme = result.themeMode;
        applyTheme(savedTheme ? savedTheme === 'dark' : true);
      });

      const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local' && changes.themeMode) {
          applyTheme(changes.themeMode.newValue === 'dark');
        }
      };
      chrome.storage.onChanged.addListener(onStorage);
      return () => chrome.storage.onChanged.removeListener(onStorage);
    } else {
      applyTheme(true);
    }
  }, []);

  // Sync autoSave preference with chrome.storage.local
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['editorAutoSave'], (res) => {
        if (typeof res.editorAutoSave === 'boolean') {
          setAutoSave(res.editorAutoSave);
        }
      });

      const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local' && changes.editorAutoSave !== undefined) {
          setAutoSave(Boolean(changes.editorAutoSave.newValue));
        }
      };
      chrome.storage.onChanged.addListener(onStorage);
      return () => chrome.storage.onChanged.removeListener(onStorage);
    } else {
      const saved = localStorage.getItem('editorAutoSave');
      if (saved !== null) {
        setAutoSave(saved === 'true');
      }
    }
  }, []);

  const handleToggleAutoSave = useCallback((enabled: boolean) => {
    setAutoSave(enabled);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ editorAutoSave: enabled });
    } else {
      localStorage.setItem('editorAutoSave', String(enabled));
    }
  }, []);

  // Open or focus file tab
  const openTab = useCallback(async (filePath: string) => {
    if (!filePath) return;
    const normalized = normalizePath(filePath);

    // If tab is already open, just switch active tab
    setTabs((prevTabs) => {
      const existing = prevTabs.find((t) => t.path === normalized);
      if (existing) {
        setActivePath(normalized);
        return prevTabs;
      }
      return prevTabs;
    });

    // Fetch file from VFS database
    let record = await getVfsFile(normalized);
    const name = record?.name || getFileName(normalized);
    const content = record?.content ?? '';
    const mimeType = record?.mimeType || detectMimeType(normalized);
    const language = normalized.split('.').pop()?.toLowerCase() || 'text';

    setTabs((prevTabs) => {
      if (prevTabs.some((t) => t.path === normalized)) {
        return prevTabs;
      }
      const newTab: OpenFileTab = {
        path: normalized,
        name,
        originalContent: content,
        draftContent: content,
        isDirty: false,
        mimeType,
        language,
      };
      return [...prevTabs, newTab];
    });

    setActivePath(normalized);

    // Update URL query parameters
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('path', normalized);
      url.searchParams.delete('file');
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignored in non-browser envs
    }
  }, []);

  // Initial load from URL search params & browser navigation
  useEffect(() => {
    const loadFromUrl = () => {
      try {
        const url = new URL(window.location.href);
        const queryPath = url.searchParams.get('path') || url.searchParams.get('file');
        if (queryPath) {
          openTab(queryPath);
        }
      } catch (err) {
        console.error('Failed to parse URL query path:', err);
      }
    };

    loadFromUrl();

    window.addEventListener('popstate', loadFromUrl);
    return () => window.removeEventListener('popstate', loadFromUrl);
  }, [openTab]);

  // Active tab reference
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.path === activePath);
  }, [tabs, activePath]);

  // Prompt before unload if any tab is dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasDirty = tabs.some((t) => t.isDirty);
      if (hasDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tabs]);

  // Tab content edit
  const handleContentChange = useCallback(
    (newContent: string) => {
      if (!activePath) return;

      setTabs((prevTabs) =>
        prevTabs.map((tab) => {
          if (tab.path === activePath) {
            const isDirty = newContent !== tab.originalContent;
            return {
              ...tab,
              draftContent: newContent,
              isDirty,
            };
          }
          return tab;
        })
      );
    },
    [activePath]
  );

  // Manual save for active tab
  const handleSaveActive = useCallback(async () => {
    if (!activeTab) return;

    try {
      await saveVfsFile(activeTab.path, activeTab.draftContent, activeTab.mimeType);
      setTabs((prev) =>
        prev.map((t) =>
          t.path === activeTab.path
            ? { ...t, originalContent: activeTab.draftContent, isDirty: false }
            : t
        )
      );
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [activeTab]);

  // Format / Beautify active tab content
  const handleFormatActive = useCallback(() => {
    if (!activeTab || !activeTab.draftContent) return;

    setIsFormatting(true);
    try {
      const res = beautifyCode(activeTab.draftContent, activeTab.path);
      if (res.error) {
        setToastMessage({ message: res.error, type: 'error' });
      } else if (res.changed) {
        handleContentChange(res.formatted);
        setToastMessage({ message: 'Code beautified ✨', type: 'success' });
      } else {
        setToastMessage({ message: 'Code is already formatted', type: 'info' });
      }
    } catch (err: any) {
      setToastMessage({ message: `Format error: ${err?.message || 'Unknown error'}`, type: 'error' });
    } finally {
      setIsFormatting(false);
      setTimeout(() => setToastMessage(null), 2500);
    }
  }, [activeTab, handleContentChange]);

  // Download active tab file to disk
  const handleDownloadActive = useCallback(() => {
    if (!activeTab) return;
    try {
      downloadVfsFile({
        path: activeTab.path,
        name: activeTab.name,
        content: activeTab.draftContent,
        mimeType: activeTab.mimeType,
      });
      setToastMessage({ message: `Downloading "${activeTab.name}"`, type: 'success' });
    } catch (err: any) {
      setToastMessage({ message: `Download failed: ${err?.message}`, type: 'error' });
    } finally {
      setTimeout(() => setToastMessage(null), 2500);
    }
  }, [activeTab]);

  // Auto-save debounce effect (1.5 seconds)
  useEffect(() => {
    if (!autoSave || !activeTab || !activeTab.isDirty) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    const targetPath = activeTab.path;
    const targetContent = activeTab.draftContent;
    const targetMime = activeTab.mimeType;

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveVfsFile(targetPath, targetContent, targetMime);
        setTabs((prev) =>
          prev.map((t) =>
            t.path === targetPath && t.draftContent === targetContent
              ? { ...t, originalContent: targetContent, isDirty: false }
              : t
          )
        );
      } catch (err) {
        console.error('Auto-save failed for', targetPath, err);
      }
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [autoSave, activeTab?.path, activeTab?.draftContent, activeTab?.isDirty]);

  // Keyboard shortcuts: Ctrl+S (Save), Alt+Shift+F or Ctrl+Shift+F (Format), Ctrl+B (Sidebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S or Cmd+S -> Save
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSaveActive();
        return;
      }

      // Alt+Shift+F or Ctrl+Shift+F or Cmd+Shift+F -> Format / Beautify
      if (
        (e.altKey && e.shiftKey && (e.key === 'f' || e.key === 'F')) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F'))
      ) {
        e.preventDefault();
        handleFormatActive();
        return;
      }

      // Ctrl+B or Cmd+B -> Toggle Sidebar
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveActive, handleFormatActive]);

  // Cursor change tracking
  const handleCursorChange = useCallback(
    (cursor: CursorPosition) => {
      if (!activePath) return;
      setCursorPositions((prev) => ({
        ...prev,
        [activePath]: cursor,
      }));
    },
    [activePath]
  );

  const activeCursor = activePath ? cursorPositions[activePath] : undefined;

  // Tab switching
  const handleSelectTab = useCallback((path: string) => {
    setActivePath(path);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('path', path);
      url.searchParams.delete('file');
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignored
    }
  }, []);

  // Tab closing
  const handleCloseTab = useCallback(
    (path: string) => {
      const tabToClose = tabs.find((t) => t.path === path);
      if (!tabToClose) return;

      if (tabToClose.isDirty) {
        const confirmed = window.confirm(
          `File "${tabToClose.name}" has unsaved changes.\nAre you sure you want to discard them and close?`
        );
        if (!confirmed) return;
      }

      setTabs((prevTabs) => {
        const nextTabs = prevTabs.filter((t) => t.path !== path);

        if (activePath === path) {
          const closedIndex = prevTabs.findIndex((t) => t.path === path);
          let nextActive: string | undefined = undefined;
          if (nextTabs.length > 0) {
            const nextIndex = Math.min(closedIndex, nextTabs.length - 1);
            nextActive = nextTabs[nextIndex].path;
          }
          setActivePath(nextActive);

          try {
            const url = new URL(window.location.href);
            if (nextActive) {
              url.searchParams.set('path', nextActive);
            } else {
              url.searchParams.delete('path');
            }
            url.searchParams.delete('file');
            window.history.replaceState({}, '', url.toString());
          } catch {
            // Ignored
          }
        }

        return nextTabs;
      });
    },
    [tabs, activePath]
  );

  // New tab creation
  const handleNewTab = useCallback(async () => {
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    const newPath = `/untitled-${suffix}.js`;
    try {
      const record = await saveVfsFile(newPath, '');
      openTab(record.path);
    } catch (err) {
      console.error('Failed to create new tab file:', err);
    }
  }, [openTab]);

  // Open in viewer
  const handleOpenViewer = useCallback(() => {
    if (!activeTab?.path) return;
    const viewerUrl = typeof chrome !== 'undefined' && chrome?.runtime?.getURL
      ? chrome.runtime.getURL(`viewer.html?path=${encodeURIComponent(activeTab.path)}`)
      : `viewer.html?path=${encodeURIComponent(activeTab.path)}`;

    if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
      chrome.tabs.create({ url: viewerUrl });
    } else {
      window.open(viewerUrl, '_blank');
    }
  }, [activeTab?.path]);

  // Sidebar file deleted
  const handleFileDeleted = useCallback(
    (deletedPath: string) => {
      const normalized = normalizePath(deletedPath);
      setTabs((prevTabs) => {
        const nextTabs = prevTabs.filter((t) => t.path !== normalized);
        if (activePath === normalized) {
          const closedIndex = prevTabs.findIndex((t) => t.path === normalized);
          let nextActive: string | undefined = undefined;
          if (nextTabs.length > 0) {
            const nextIndex = Math.min(closedIndex, nextTabs.length - 1);
            nextActive = nextTabs[nextIndex].path;
          }
          setActivePath(nextActive);
        }
        return nextTabs;
      });
    },
    [activePath]
  );

  // Calculate file stats (size, lines, chars) for status bar
  const activeFileSize = useMemo(() => {
    if (!activeTab) return undefined;
    try {
      return new TextEncoder().encode(activeTab.draftContent).length;
    } catch {
      return activeTab.draftContent.length;
    }
  }, [activeTab]);

  const activeStats = useMemo(() => {
    if (!activeTab || !activeTab.draftContent) return { lines: 0, chars: 0 };
    const content = activeTab.draftContent;
    const lines = content ? content.split('\n').length : 0;
    const chars = content ? content.length : 0;
    return { lines, chars };
  }, [activeTab]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground select-none">
      {/* 1. Header */}
      <EditorHeader
        currentPath={activeTab?.path}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        isDirty={Boolean(activeTab?.isDirty)}
        autoSave={autoSave}
        onToggleAutoSave={handleToggleAutoSave}
        onSave={handleSaveActive}
        onFormat={handleFormatActive}
        onDownload={handleDownloadActive}
        onOpenViewer={handleOpenViewer}
        isFormatting={isFormatting}
      />

      {/* 2. Workspace Body: Sidebar + Editor/Tabs Area */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Sidebar */}
        <EditorSidebar
          isOpen={sidebarOpen}
          activeFilePath={activePath}
          onSelectFile={openTab}
          onFileCreated={(file) => openTab(file.path)}
          onFileDeleted={handleFileDeleted}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main Editor Center */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
          {/* Tab Bar */}
          <EditorTabBar
            tabs={tabs}
            activePath={activePath}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onNewTab={handleNewTab}
          />

          {/* Active Tab Editor or Empty State */}
          <div className="flex-1 relative overflow-hidden bg-background/50">
            {activeTab ? (
              <CodeMirrorEditor
                key={activeTab.path}
                value={activeTab.draftContent}
                onChange={handleContentChange}
                path={activeTab.path}
                theme={themeMode}
                onCursorChange={handleCursorChange}
                className="h-full w-full"
              />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center select-none text-muted-foreground">
                <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 shadow-sm">
                  <FileCode className="size-8" />
                </div>
                <h2 className="text-base font-semibold text-foreground mb-1">
                  No File Open
                </h2>
                <p className="text-xs text-muted-foreground max-w-sm mb-6">
                  Select a file from the sidebar to start editing, or create a new file directly in the virtual file system.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleNewTab}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>New File</span>
                  </button>
                  {!sidebarOpen && (
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-foreground text-xs font-medium hover:bg-muted transition-colors cursor-pointer"
                    >
                      <FolderOpen className="size-3.5" />
                      <span>Open Sidebar</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 3. Status Bar */}
      <EditorStatusBar
        cursor={activeCursor}
        fileSize={activeFileSize}
        totalLines={activeStats.lines}
        charCount={activeStats.chars}
        language={activeTab?.language}
        isDirty={activeTab?.isDirty}
        readOnly={false}
        onFormat={handleFormatActive}
      />

      {/* 4. Toast Notification Feedback */}
      {toastMessage && (
        <div
          className={`fixed bottom-10 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl shadow-lg border text-xs font-medium animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === 'success'
              ? 'bg-card border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
              : toastMessage.type === 'info'
              ? 'bg-card border-purple-500/40 text-purple-600 dark:text-purple-400'
              : 'bg-card border-red-500/40 text-red-600 dark:text-red-400'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <Check className="size-4 shrink-0 text-emerald-500" />
          ) : toastMessage.type === 'info' ? (
            <Sparkles className="size-4 shrink-0 text-purple-500" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 text-red-500" />
          )}
          <span>{toastMessage.message}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-1 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
};
