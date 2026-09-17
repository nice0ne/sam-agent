import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FileQuestion,
  AlertCircle,
  FolderOpen,
  FileCode,
  ArrowRight,
  HardDrive,
  LoaderCircle,
  ExternalLink,
} from 'lucide-react';
import { db } from '../../src/services/db';
import { normalizePath } from '../../src/services/vfs';
import { downloadVfsFile } from '../../src/services/archive';
import {
  ViewerHeader,
  HtmlSandboxPreview,
  MarkdownPreview,
  CsvTablePreview,
  ImagePreview,
  RawCodeViewer,
  JsonTreePreview,
  MermaidPreview,
  ZipArchivePreview,
  SvgInspectorPreview,
  AudioPlayerPreview,
  LogStreamPreview,
  resolveViewerType,
} from '../../src/components/viewer';
import type { VfsFileRecord } from '../../src/types/agent';

export const App: React.FC = () => {
  const [currentUrl, setCurrentUrl] = useState(() => window.location.href);
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [copied, setCopied] = useState(false);

  // Sync with browser navigation
  useEffect(() => {
    const handlePopState = () => setCurrentUrl(window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync theme with chrome.storage.local
  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
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

  // Extract path from search params (supports both ?path= and ?file=)
  const { rawPath, normalizedPath } = useMemo(() => {
    try {
      const url = new URL(currentUrl);
      const raw = url.searchParams.get('path') || url.searchParams.get('file') || '';
      return {
        rawPath: raw,
        normalizedPath: raw ? normalizePath(raw) : '',
      };
    } catch {
      return { rawPath: '', normalizedPath: '' };
    }
  }, [currentUrl]);

  // Reactive IndexedDB query for the requested file
  const file = useLiveQuery<VfsFileRecord | null | undefined>(async () => {
    if (!normalizedPath) return null;
    const direct = await db.files.get(normalizedPath);
    if (direct) return direct;
    if (rawPath && rawPath !== normalizedPath) {
      const fallback = await db.files.get(rawPath);
      if (fallback) return fallback;
    }
    return null;
  }, [normalizedPath, rawPath]);

  // Recent files in VFS for quick navigation in empty/404 states
  const recentFiles = useLiveQuery<VfsFileRecord[]>(() => {
    return db.files.orderBy('updatedAt').reverse().limit(12).toArray();
  }, []);

  // Navigate to a different file
  const handleSelectFile = useCallback((targetPath: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('path', targetPath);
    url.searchParams.delete('file');
    window.history.pushState({}, '', url.toString());
    setCurrentUrl(url.toString());
  }, []);

  // Header Actions
  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  const handleCopy = useCallback(async () => {
    if (!file?.content) return;
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy file content:', err);
    }
  }, [file?.content]);

  const handleDownload = useCallback(() => {
    if (!file) return;
    try {
      downloadVfsFile(file);
    } catch (err) {
      console.error('Failed to download file:', err);
    }
  }, [file]);

  const handleOpenEditor = useCallback(() => {
    const targetPath = file?.path || normalizedPath || rawPath;
    const editorUrl = chrome?.runtime?.getURL
      ? chrome.runtime.getURL('editor.html?path=' + encodeURIComponent(targetPath))
      : 'editor.html?path=' + encodeURIComponent(targetPath);

    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url: editorUrl });
    } else {
      window.open(editorUrl, '_blank');
    }
  }, [file?.path, normalizedPath, rawPath]);

  // Open HTML artifact in native browser tab
  const handleOpenNewTab = useCallback(() => {
    if (!file?.content) return;
    try {
      const mimeType = file.mimeType || (file.path.endsWith('.html') || file.path.endsWith('.htm') ? 'text/html;charset=utf-8' : 'text/plain');
      const blob = new Blob([file.content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      if (chrome?.tabs?.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error('Failed to open in new tab:', err);
    }
  }, [file?.content, file?.mimeType, file?.path]);

  const isHtml = useMemo(() => {
    if (!file) return false;
    const p = file.path.toLowerCase();
    const m = (file.mimeType || '').toLowerCase();
    return p.endsWith('.html') || p.endsWith('.htm') || m === 'text/html' || m === 'application/xhtml+xml';
  }, [file]);

  // Preview renderer based on MIME type and viewMode
  const renderContent = () => {
    // 1. Loading state
    if (file === undefined) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
          <LoaderCircle className="size-8 text-primary animate-spin" />
          <span className="text-xs font-mono">Loading artifact...</span>
        </div>
      );
    }

    // 2. Empty state: No path provided
    if (!normalizedPath) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-xl mx-auto">
          <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 shadow-sm">
            <FolderOpen className="size-8" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight mb-1">
            No Artifact Specified
          </h2>
          <p className="text-xs text-muted-foreground mb-6 max-w-sm leading-relaxed">
            Provide a file path in the query string (e.g., <code className="text-primary font-mono font-medium">?path=/index.html</code>) or select an existing artifact below.
          </p>

          {recentFiles && recentFiles.length > 0 && (
            <div className="w-full bg-card border border-border rounded-xl p-4 shadow-xs text-left">
              <div className="flex items-center justify-between mb-3 text-xs font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="size-3.5 text-muted-foreground" />
                  Available Artifacts ({recentFiles.length})
                </span>
              </div>
              <div className="divide-y divide-border/60 max-h-64 overflow-y-auto">
                {recentFiles.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => handleSelectFile(f.path)}
                    className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode className="size-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {f.path}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {f.mimeType} • {f.size} bytes
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 3. 404 state: File path specified but not found in VFS
    if (file === null) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-xl mx-auto">
          <div className="size-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mb-4 shadow-sm">
            <AlertCircle className="size-8" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight mb-1">
            Artifact Not Found
          </h2>
          <p className="text-xs text-muted-foreground mb-1 leading-relaxed">
            The requested artifact could not be located in the Virtual File System:
          </p>
          <div className="inline-block px-3 py-1 my-3 rounded-lg bg-muted border border-border text-xs font-mono text-foreground break-all max-w-md">
            {normalizedPath}
          </div>

          {recentFiles && recentFiles.length > 0 && (
            <div className="w-full bg-card border border-border rounded-xl p-4 shadow-xs text-left mt-4">
              <div className="flex items-center justify-between mb-3 text-xs font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="size-3.5 text-muted-foreground" />
                  Other Available Artifacts
                </span>
              </div>
              <div className="divide-y divide-border/60 max-h-56 overflow-y-auto">
                {recentFiles.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => handleSelectFile(f.path)}
                    className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode className="size-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {f.path}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {f.mimeType} • {f.size} bytes
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 4. Raw Code Mode
    if (viewMode === 'raw') {
      return <RawCodeViewer content={file.content} />;
    }

    // 5. Preview Mode by resolved viewer type
    const viewerType = resolveViewerType(file.path, file.mimeType, file.content);

    switch (viewerType) {
      case 'html':
        return (
          <HtmlSandboxPreview
            htmlContent={file.content}
            filePath={file.path}
            onOpenNewTab={handleOpenNewTab}
          />
        );
      case 'markdown':
        return <MarkdownPreview content={file.content} />;
      case 'csv':
        return <CsvTablePreview content={file.content} />;
      case 'image':
        return <ImagePreview content={file.content} mimeType={file.mimeType} />;
      case 'json':
        return <JsonTreePreview content={file.content} filePath={file.path} />;
      case 'mermaid':
        return <MermaidPreview content={file.content} filePath={file.path} />;
      case 'zip':
        return <ZipArchivePreview file={file} />;
      case 'svg':
        return <SvgInspectorPreview content={file.content} filePath={file.path} />;
      case 'audio':
        return (
          <AudioPlayerPreview
            content={file.content}
            filePath={file.path}
            mimeType={file.mimeType}
          />
        );
      case 'log':
        return <LogStreamPreview content={file.content} filePath={file.path} />;
      case 'code':
      default:
        return <RawCodeViewer content={file.content} />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground select-text">
      <ViewerHeader
        filePath={file?.path || normalizedPath || 'No file selected'}
        fileSize={file?.size || 0}
        updatedAt={file?.updatedAt || 0}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        onRefresh={handleRefresh}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onOpenEditor={handleOpenEditor}
        onOpenNewTab={isHtml ? handleOpenNewTab : undefined}
        copied={copied}
      />

      <main className="flex-1 min-h-0 relative overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
};
