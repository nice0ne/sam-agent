import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  FolderTree,
  FolderPlus,
  Search,
  Eye,
  Code2,
  Download,
  Trash2,
  RotateCw,
  FileText,
  Plus,
  FileCode,
  FileSpreadsheet,
  FileJson,
  Image,
  Clock,
  HardDrive,
  X,
  AlertTriangle,
  Share2,
  Archive,
  Upload,
  Check,
  Loader2,
  List,
} from 'lucide-react';
import { db } from '../../services/db';
import { deleteVfsFile } from '../../services/vfs';
import { removeHandle } from '../../services/handle-store';
import { MountCard } from './MountCard';
import { DropZoneOverlay } from './DropZoneOverlay';
import { GistPublishModal } from './GistPublishModal';
import { VfsTreeView } from './VfsTreeView';
import { CreateFileDialog } from './CreateFileDialog';
import { buildVfsTree } from '../../utils/vfs-tree';
import {
  exportVfsToZip,
  triggerBlobDownload,
  downloadVfsFile,
  importZipToVfs,
  importFilesToVfs,
} from '../../services/archive';
import { useAppStore } from '../../stores/useAppStore';
import type { VfsFileRecord } from '../../types/agent';

export const FilesView: React.FC = () => {
  const { activeThreadId, navigateToChat, navigateToThreads, setView } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mountRefreshTick, setMountRefreshTick] = useState(0);

  // Archive and Gist sharing state
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [gistTargetFile, setGistTargetFile] = useState<VfsFileRecord | null>(null);
  const [isGistModalOpen, setIsGistModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View mode: 'tree' (default) vs 'list'
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [createFileDialog, setCreateFileDialog] = useState<{
    isOpen: boolean;
    initialFolder?: string;
  }>({ isOpen: false });

  // Load persisted view mode preference
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get('vfsViewMode').then((res) => {
        if (res?.vfsViewMode === 'list' || res?.vfsViewMode === 'tree') {
          setViewMode(res.vfsViewMode);
        }
      });
    }
  }, []);

  const handleSetViewMode = (mode: 'tree' | 'list') => {
    setViewMode(mode);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ vfsViewMode: mode }).catch(() => {});
    }
  };

  // Reactive live query for all VFS files from IndexedDB
  const files = useLiveQuery(() => db.files.toArray(), []) || [];

  // Reactive live query for all mounted directory handles from IndexedDB
  const mountedHandles = useLiveQuery(
    () => db.handles.orderBy('mountedAt').toArray(),
    [mountRefreshTick]
  ) || [];

  // Listen to runtime messages for directory mount events (e.g. from picker popup)
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg?.type === 'DIRECTORY_PICKED') {
        setMountRefreshTick((t) => t + 1);
      }
    };
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  // Filter mounted handles based on search input
  const filteredMountedHandles = useMemo(() => {
    if (!searchQuery.trim()) {
      return mountedHandles;
    }
    const q = searchQuery.toLowerCase().trim();
    return mountedHandles.filter((h) => h.name.toLowerCase().includes(q));
  }, [mountedHandles, searchQuery]);

  // Filter files based on search input against path and name
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) {
      return files.sort((a, b) => a.path.localeCompare(b.path));
    }
    const q = searchQuery.toLowerCase().trim();
    return files
      .filter((f) => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [files, searchQuery]);

  // Hierarchical folder tree nodes
  const treeNodes = useMemo(() => {
    return buildVfsTree(files, searchQuery);
  }, [files, searchQuery]);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Format timestamp relative or date
  const formatFileDate = (timestamp: number): string => {
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

  // Determine file icon and styling based on file extension
  const getFileIcon = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'html':
      case 'htm':
        return <FileCode className="size-4 text-orange-500 shrink-0" />;
      case 'css':
        return <FileCode className="size-4 text-sky-500 shrink-0" />;
      case 'js':
      case 'mjs':
      case 'cjs':
      case 'ts':
      case 'tsx':
      case 'jsx':
        return <FileCode className="size-4 text-yellow-500 shrink-0" />;
      case 'py':
      case 'sh':
        return <FileCode className="size-4 text-emerald-500 shrink-0" />;
      case 'json':
        return <FileJson className="size-4 text-amber-500 shrink-0" />;
      case 'csv':
        return <FileSpreadsheet className="size-4 text-emerald-600 shrink-0" />;
      case 'md':
      case 'markdown':
        return <FileText className="size-4 text-indigo-400 shrink-0" />;
      case 'svg':
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
        return <Image className="size-4 text-purple-400 shrink-0" />;
      default:
        return <FileText className="size-4 text-muted-foreground shrink-0" />;
    }
  };

  // Open Mount Folder Picker Popup
  const handleMountFolder = () => {
    const url = chrome?.runtime?.getURL ? chrome.runtime.getURL('picker.html') : 'picker.html';
    if (chrome?.windows?.create) {
      chrome.windows.create({
        url,
        type: 'popup',
        width: 460,
        height: 440,
      });
    } else {
      window.open(url, '_blank', 'width=460,height=440');
    }
  };

  // Re-authorize mounted folder
  const handleReauth = (name: string) => {
    const pickerUrl = `picker.html?reauth=${encodeURIComponent(name)}`;
    const url = chrome?.runtime?.getURL ? chrome.runtime.getURL(pickerUrl) : pickerUrl;
    if (chrome?.windows?.create) {
      chrome.windows.create({
        url,
        type: 'popup',
        width: 460,
        height: 440,
      });
    } else {
      window.open(url, '_blank', 'width=460,height=440');
    }
  };

  // Unmount folder handler
  const handleUnmount = async (id: string) => {
    await removeHandle(id);
    setMountRefreshTick((t) => t + 1);
  };

  // View file in dedicated Viewer window/tab
  const handleView = (path: string) => {
    const url = chrome?.runtime?.getURL
      ? chrome.runtime.getURL('viewer.html?path=' + encodeURIComponent(path))
      : 'viewer.html?path=' + encodeURIComponent(path);
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  // Edit file in dedicated Code Editor window/tab
  const handleEdit = (path: string) => {
    const url = chrome?.runtime?.getURL
      ? chrome.runtime.getURL('editor.html?path=' + encodeURIComponent(path))
      : 'editor.html?path=' + encodeURIComponent(path);
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  // Download file blob to local disk
  const handleDownload = (file: VfsFileRecord) => {
    downloadVfsFile(file);
    showFeedback('success', `Downloading "${file.name || file.path.split('/').pop()}"`);
  };

  // Handle delete confirmation
  const handleConfirmDelete = async () => {
    if (fileToDelete) {
      await deleteVfsFile(fileToDelete);
      setFileToDelete(null);
    }
  };

  // Handle refresh animation and data reload
  const handleRefresh = () => {
    setIsRefreshing(true);
    setMountRefreshTick((t) => t + 1);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Handle new file creation in editor
  const handleCreateNewFile = () => {
    const url = chrome?.runtime?.getURL
      ? chrome.runtime.getURL('editor.html')
      : 'editor.html';
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  // Toast feedback helper
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setImportFeedback({ type, message });
    setTimeout(() => {
      setImportFeedback((cur) => (cur?.message === message ? null : cur));
    }, 3500);
  };

  // Export all VFS files to a compressed ZIP archive
  const handleExportZip = async () => {
    if (files.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const blob = await exportVfsToZip(files);
      const dateStr = new Date().toISOString().slice(0, 10);
      triggerBlobDownload(blob, `ict-agent-workspace-${dateStr}.zip`);
      showFeedback('success', `Exported ${files.length} file${files.length === 1 ? '' : 's'} to ZIP archive.`);
    } catch (err: any) {
      showFeedback('error', `Export failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Import ZIP or files from hidden file input
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsImporting(true);
    try {
      const filesArray = Array.from(selectedFiles);
      const zipFile = filesArray.find((f) => f.name.toLowerCase().endsWith('.zip'));
      if (zipFile) {
        const res = await importZipToVfs(zipFile);
        showFeedback('success', `Imported ${res.importedCount} files from ZIP archive.`);
      } else {
        const count = await importFilesToVfs(filesArray);
        showFeedback('success', `Imported ${count} file${count === 1 ? '' : 's'} to workspace.`);
      }
    } catch (err: any) {
      showFeedback('error', `Import failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    setIsImporting(true);
    try {
      const filesArray = Array.from(droppedFiles);
      const zipFile = filesArray.find((f) => f.name.toLowerCase().endsWith('.zip'));
      if (zipFile) {
        const res = await importZipToVfs(zipFile);
        showFeedback('success', `Imported ${res.importedCount} files from ZIP archive.`);
      } else {
        const count = await importFilesToVfs(filesArray);
        showFeedback('success', `Imported ${count} file${count === 1 ? '' : 's'} to workspace.`);
      }
    } catch (err: any) {
      showFeedback('error', `Import failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const hasAnyItems = files.length > 0 || mountedHandles.length > 0;

  return (
    <div
      className="relative flex flex-col h-screen bg-background text-foreground select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      <DropZoneOverlay isDragging={isDragging} />

      {/* Header */}
      <header className="flex items-center justify-between px-3.5 py-3 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (activeThreadId) {
                navigateToChat(activeThreadId);
              } else {
                setView('chat');
              }
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-all cursor-pointer"
            title="Back to Chat"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
              <span>Workspace Files</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">
                {files.length + mountedHandles.length}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* View Mode Switcher: Tree vs List */}
          <div className="flex items-center bg-secondary/80 p-0.5 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => handleSetViewMode('tree')}
              className={`p-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'tree'
                  ? 'bg-background text-primary shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Tree View (Hierarchical Folders)"
            >
              <FolderTree className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode('list')}
              className={`p-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-background text-primary shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Flat List View"
            >
              <List className="size-3.5" />
            </button>
          </div>

          {/* Mount Local Folder Button */}
          <button
            type="button"
            onClick={handleMountFolder}
            className="flex items-center gap-1 px-2.5 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border rounded-lg text-xs font-medium cursor-pointer shadow-2xs active:scale-95 transition-all"
            title="Mount Local Folder via File System Access API"
          >
            <FolderPlus className="size-3.5 text-primary" />
            <span className="hidden xs:inline">Mount Folder</span>
          </button>

          {/* Export ZIP Archive */}
          <button
            type="button"
            onClick={handleExportZip}
            disabled={files.length === 0 || isExporting}
            className="flex items-center gap-1 px-2.5 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border rounded-lg text-xs font-medium cursor-pointer shadow-2xs active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
            title={files.length === 0 ? 'No workspace files to export' : 'Export workspace files to ZIP archive'}
          >
            {isExporting ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <Archive className="size-3.5 text-primary" />
            )}
            <span className="hidden xs:inline">Export ZIP</span>
          </button>

          {/* Import ZIP or Files */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-1 px-2.5 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border rounded-lg text-xs font-medium cursor-pointer shadow-2xs active:scale-95 transition-all disabled:opacity-40"
            title="Import ZIP archive or loose files into workspace"
          >
            {isImporting ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <Upload className="size-3.5 text-primary" />
            )}
            <span className="hidden xs:inline">Import</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-all cursor-pointer"
            title="Refresh Files"
          >
            <RotateCw className={`size-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setCreateFileDialog({ isOpen: true, initialFolder: '/workspace' })}
            className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground hover:opacity-90 rounded-lg text-xs font-medium cursor-pointer shadow-2xs active:scale-95 transition-all"
            title="Create New File in VFS"
          >
            <Plus className="size-3.5" />
            <span className="hidden xs:inline">New File</span>
          </button>
        </div>
      </header>

      {/* Search Filter Bar */}
      {hasAnyItems && (
        <div className="p-3 border-b border-border/60 bg-muted/20">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files and mounted folders..."
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-3 space-y-4">
        {!hasAnyItems ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="size-12 rounded-2xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground shadow-2xs">
              <FolderTree className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground">No files or mounts yet</h3>
              <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
                Files created by the AI agent or folders mounted from your local disk will appear here.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleCreateNewFile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-xs font-medium cursor-pointer shadow-xs active:scale-95 transition-all"
              >
                <Plus className="size-3.5" />
                <span>Create First File</span>
              </button>
              <button
                type="button"
                onClick={handleMountFolder}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border rounded-xl text-xs font-medium cursor-pointer shadow-xs active:scale-95 transition-all"
              >
                <FolderPlus className="size-3.5 text-primary" />
                <span>Mount Local Folder</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mounted Local Folders Section */}
            {mountedHandles.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <HardDrive className="size-3.5 text-primary" />
                    <span>Mounted Local Folders</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono font-normal">
                      {filteredMountedHandles.length}
                    </span>
                  </h2>
                </div>

                {filteredMountedHandles.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic px-1 py-1">
                    No mounted folders matched &ldquo;{searchQuery}&rdquo;.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {filteredMountedHandles.map((record) => (
                      <MountCard
                        key={record.id}
                        record={record}
                        onUnmount={handleUnmount}
                        onReauth={handleReauth}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* VFS Workspace Files Section */}
            <section className="space-y-2">
              {mountedHandles.length > 0 && (
                <div className="flex items-center justify-between px-0.5 pt-1">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FolderTree className="size-3.5" />
                    <span>Workspace Files</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-mono font-normal">
                      {filteredFiles.length}
                    </span>
                  </h2>
                </div>
              )}

              {files.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-border/70 text-center space-y-1.5 bg-muted/10">
                  <p className="text-xs font-medium text-foreground">No workspace files yet</p>
                  <p className="text-[11px] text-muted-foreground">
                    Files created by the AI agent will appear in this section.
                  </p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-center p-6 space-y-2">
                  <div className="size-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground">
                    <Search className="size-5" />
                  </div>
                  <h3 className="text-xs font-semibold text-foreground">No matching files</h3>
                  <p className="text-[11px] text-muted-foreground max-w-xs">
                    No files matched &ldquo;{searchQuery}&rdquo;. Try a different keyword or path filter.
                  </p>
                </div>
              ) : viewMode === 'tree' ? (
                <div className="p-2.5 rounded-xl border border-border/70 bg-card/60 backdrop-blur-md shadow-2xs">
                  <VfsTreeView
                    nodes={treeNodes}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDownload={handleDownload}
                    onDelete={(path) => setFileToDelete(path)}
                    onShareGist={(file) => {
                      setGistTargetFile(file);
                      setIsGistModalOpen(true);
                    }}
                    onCreateInFolder={(folder) =>
                      setCreateFileDialog({ isOpen: true, initialFolder: folder })
                    }
                  />
                </div>
              ) : (
                filteredFiles.map((file) => {
                  const dirPath = file.path.substring(0, file.path.lastIndexOf('/') + 1) || '/';
                  return (
                    <div
                      key={file.path}
                      className="group relative flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-border/70 bg-card/70 hover:bg-card hover:border-border transition-all shadow-2xs"
                    >
                      {/* File Icon & Info */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="size-7 rounded-lg bg-muted/60 border border-border/40 flex items-center justify-center shrink-0">
                          {getFileIcon(file.path)}
                        </div>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground truncate select-text">
                              {file.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono truncate">
                            <span className="truncate opacity-75" title={file.path}>
                              {dirPath}
                            </span>
                            <span>•</span>
                            <span className="shrink-0 flex items-center gap-0.5">
                              <HardDrive className="size-2.5 inline" />
                              {formatFileSize(file.size)}
                            </span>
                            <span>•</span>
                            <span className="shrink-0 flex items-center gap-0.5">
                              <Clock className="size-2.5 inline" />
                              {formatFileDate(file.updatedAt || file.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Share to GitHub Gist */}
                        <button
                          type="button"
                          onClick={() => {
                            setGistTargetFile(file);
                            setIsGistModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          title="Share to GitHub Gist"
                        >
                          <Share2 className="size-3.5" />
                        </button>

                        {/* View in Artifact Viewer */}
                        <button
                          type="button"
                          onClick={() => handleView(file.path)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          title="View in Artifact Viewer"
                        >
                          <Eye className="size-3.5" />
                        </button>

                        {/* Edit in Code Editor */}
                        <button
                          type="button"
                          onClick={() => handleEdit(file.path)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          title="Edit in Code Editor"
                        >
                          <Code2 className="size-3.5" />
                        </button>

                        {/* Download */}
                        <button
                          type="button"
                          onClick={() => handleDownload(file)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          title="Download File"
                        >
                          <Download className="size-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => setFileToDelete(file.path)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          title="Delete File"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}
      </main>

      {/* Confirmation Modal: Delete File */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-xl space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4.5 shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">Delete File?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed break-all">
              Are you sure you want to delete <span className="font-mono font-medium text-foreground">{fileToDelete}</span>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
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

      {/* Gist Publish Modal */}
      <GistPublishModal
        file={gistTargetFile}
        isOpen={isGistModalOpen}
        onClose={() => {
          setIsGistModalOpen(false);
          setGistTargetFile(null);
        }}
      />

      {/* Create File Modal */}
      <CreateFileDialog
        isOpen={createFileDialog.isOpen}
        initialFolder={createFileDialog.initialFolder}
        onClose={() => setCreateFileDialog({ isOpen: false })}
        onCreated={(newFile) => {
          showFeedback('success', `Created file ${newFile.name}`);
        }}
      />

      {/* Hidden File Input for ZIP / Files Import */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelected}
        className="hidden"
        accept=".zip,*/*"
      />

      {/* Import / Export Feedback Toast */}
      {importFeedback && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl shadow-lg border text-xs font-medium animate-in fade-in slide-in-from-bottom-2 ${
            importFeedback.type === 'success'
              ? 'bg-card border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-card border-red-500/30 text-red-600 dark:text-red-400'
          }`}
        >
          {importFeedback.type === 'success' ? (
            <Check className="size-4 shrink-0 text-emerald-500" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 text-red-500" />
          )}
          <span>{importFeedback.message}</span>
          <button
            type="button"
            onClick={() => setImportFeedback(null)}
            className="ml-1 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
};
