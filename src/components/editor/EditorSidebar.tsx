import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus,
  RotateCw,
  Search,
  X,
  Trash2,
  Check,
  Folder,
  FolderOpen,
  FolderTree,
  List,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Wrench,
  Layers,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image as ImageIcon,
  Code2,
  Download,
} from 'lucide-react';
import { db } from '../../services/db';
import { saveVfsFile, deleteVfsFile } from '../../services/vfs';
import { downloadVfsFile } from '../../services/archive';
import { buildVfsTree, VfsTreeNode } from '../../utils/vfs-tree';
import type { VfsFileRecord } from '../../types/agent';

export interface EditorSidebarProps {
  files?: VfsFileRecord[];
  activeFilePath?: string;
  isOpen: boolean;
  onSelectFile: (path: string) => void;
  onRefresh?: () => void;
  onFileCreated?: (file: VfsFileRecord) => void;
  onFileDeleted?: (path: string) => void;
  onClose?: () => void;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const formatted = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${formatted} ${units[i] || 'B'}`;
}

function getFileIcon(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'html':
    case 'htm':
      return <FileCode className="size-4 text-orange-500 shrink-0" />;
    case 'css':
      return <FileCode className="size-4 text-sky-400 shrink-0" />;
    case 'js':
    case 'mjs':
    case 'cjs':
      return <Code2 className="size-4 text-amber-400 shrink-0" />;
    case 'ts':
    case 'mts':
    case 'cts':
      return <Code2 className="size-4 text-blue-400 shrink-0" />;
    case 'jsx':
    case 'tsx':
      return <Code2 className="size-4 text-cyan-400 shrink-0" />;
    case 'json':
    case 'yaml':
    case 'yml':
      return <FileJson className="size-4 text-amber-500 shrink-0" />;
    case 'md':
    case 'markdown':
    case 'txt':
    case 'log':
      return <FileText className="size-4 text-indigo-400 shrink-0" />;
    case 'csv':
      return <FileSpreadsheet className="size-4 text-emerald-500 shrink-0" />;
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return <ImageIcon className="size-4 text-purple-400 shrink-0" />;
    default:
      return <File className="size-4 text-muted-foreground shrink-0" />;
  }
}

function getEditorFolderVisuals(path: string, isOpen: boolean) {
  const normalized = path.toLowerCase();
  if (normalized === '/skills') {
    return {
      icon: <Sparkles className="size-3.5 text-purple-400 shrink-0" />,
    };
  }
  if (normalized === '/tools') {
    return {
      icon: <Wrench className="size-3.5 text-amber-400 shrink-0" />,
    };
  }
  if (normalized === '/workspace') {
    return {
      icon: <Layers className="size-3.5 text-emerald-400 shrink-0" />,
    };
  }
  return {
    icon: isOpen ? (
      <FolderOpen className="size-3.5 text-amber-400/90 shrink-0" />
    ) : (
      <Folder className="size-3.5 text-amber-400/90 shrink-0" />
    ),
  };
}

interface EditorTreeNodeItemProps {
  node: VfsTreeNode;
  depth: number;
  activeFilePath?: string;
  expandedPaths: Set<string>;
  deletingPath: string | null;
  toggleExpand: (path: string) => void;
  onSelectFile: (path: string) => void;
  onDeleteConfirm: (path: string) => void;
  setDeletingPath: (path: string | null) => void;
}

const EditorTreeNodeItem: React.FC<EditorTreeNodeItemProps> = ({
  node,
  depth,
  activeFilePath,
  expandedPaths,
  deletingPath,
  toggleExpand,
  onSelectFile,
  onDeleteConfirm,
  setDeletingPath,
}) => {
  const isExpanded = expandedPaths.has(node.path);

  if (node.isFolder) {
    const visuals = getEditorFolderVisuals(node.path, isExpanded);
    return (
      <div className="select-none text-xs">
        <div
          onClick={() => toggleExpand(node.path)}
          className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/60 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
          style={{ paddingLeft: `${Math.max(6, depth * 12)}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isExpanded ? (
              <ChevronDown className="size-3 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="size-3 text-muted-foreground shrink-0" />
            )}
            {visuals.icon}
            <span className="font-medium truncate text-[11px] text-foreground">{node.name}</span>
            <span className="text-[10px] text-muted-foreground font-mono ml-auto mr-1 opacity-60">
              {node.fileCount}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="border-l border-border/30 ml-2.5 my-0.5">
            {node.children.length === 0 ? (
              <div
                className="py-1 px-2 text-[10px] text-muted-foreground/60 italic"
                style={{ paddingLeft: `${(depth + 1) * 10}px` }}
              >
                (Empty)
              </div>
            ) : (
              node.children.map((child) => (
                <EditorTreeNodeItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  activeFilePath={activeFilePath}
                  expandedPaths={expandedPaths}
                  deletingPath={deletingPath}
                  toggleExpand={toggleExpand}
                  onSelectFile={onSelectFile}
                  onDeleteConfirm={onDeleteConfirm}
                  setDeletingPath={setDeletingPath}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  const file = node.file;
  if (!file) return null;

  const isActive = activeFilePath === file.path;
  const isDeleting = deletingPath === file.path;

  return (
    <div
      onClick={() => {
        if (!isDeleting) onSelectFile(file.path);
      }}
      className={`group relative flex items-center justify-between py-1 px-2 cursor-pointer transition-colors text-xs ${
        isActive
          ? 'bg-primary/15 text-primary border-l-2 border-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
      }`}
      style={{ paddingLeft: `${Math.max(6, depth * 12)}px` }}
      title={file.path}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1">
        {getFileIcon(file.path)}
        <span className="truncate text-[11px] font-mono text-foreground">{node.name}</span>
        <span className="text-[9px] text-muted-foreground font-mono ml-auto mr-1 opacity-60">
          {formatFileSize(file.size)}
        </span>
      </div>

      <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
        {isDeleting ? (
          <div className="flex items-center gap-1 bg-destructive/10 px-1 py-0.5 rounded border border-destructive/30">
            <button
              type="button"
              onClick={() => onDeleteConfirm(file.path)}
              className="size-4 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center cursor-pointer"
              title="Confirm delete"
            >
              <Check className="size-2.5" />
            </button>
            <button
              type="button"
              onClick={() => setDeletingPath(null)}
              className="size-4 rounded bg-muted hover:bg-muted/80 text-muted-foreground flex items-center justify-center cursor-pointer"
              title="Cancel"
            >
              <X className="size-2.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => downloadVfsFile(file)}
              className="size-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
              title="Download file"
            >
              <Download className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => setDeletingPath(file.path)}
              className="size-5 rounded hover:bg-destructive/15 hover:text-destructive text-muted-foreground flex items-center justify-center cursor-pointer"
              title="Delete file"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  files: propFiles,
  activeFilePath,
  isOpen,
  onSelectFile,
  onRefresh,
  onFileCreated,
  onFileDeleted,
  className = '',
}) => {
  // Live query fallback if propFiles is not provided
  const liveFiles = useLiveQuery(() => db.files.orderBy('path').toArray(), []);
  const allFiles = propFiles ?? liveFiles ?? [];

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [creationError, setCreationError] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'tree' | 'flat'>('tree');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(['/skills', '/tools', '/workspace'])
  );

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
    }
  }, [isCreating]);

  // Auto-expand folder when activeFilePath changes
  useEffect(() => {
    if (activeFilePath) {
      const parts = activeFilePath.split('/').filter(Boolean);
      let acc = '';
      const toAdd: string[] = [];
      for (let i = 0; i < parts.length - 1; i++) {
        acc += `/${parts[i]}`;
        toAdd.push(acc);
      }
      if (toAdd.length > 0) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          toAdd.forEach((p) => next.add(p));
          return next;
        });
      }
    }
  }, [activeFilePath]);

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Filtered files
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return allFiles;
    const q = searchQuery.toLowerCase();
    return allFiles.filter(
      (f) => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)
    );
  }, [allFiles, searchQuery]);

  // Hierarchical folder tree nodes
  const treeNodes = useMemo(() => {
    return buildVfsTree(allFiles, searchQuery);
  }, [allFiles, searchQuery]);

  // Handle new file submit
  const handleCreateFile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newFilePath.trim();
    if (!trimmed) {
      setCreationError('File path cannot be empty');
      return;
    }

    try {
      setCreationError(null);
      const record = await saveVfsFile(trimmed, '');
      setIsCreating(false);
      setNewFilePath('');
      onFileCreated?.(record);
      onSelectFile(record.path);
    } catch (err: any) {
      setCreationError(err?.message || 'Failed to create file');
    }
  };

  // Handle delete file
  const handleDeleteConfirm = async (filePath: string) => {
    try {
      await deleteVfsFile(filePath);
      setDeletingPath(null);
      onFileDeleted?.(filePath);
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  const handleRefreshClick = () => {
    setIsRefreshing(true);
    onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      className={`w-64 sm:w-72 h-full border-r border-border bg-card/60 backdrop-blur-sm flex flex-col shrink-0 transition-all select-none overflow-hidden ${className}`}
      aria-label="VFS File Explorer"
    >
      {/* Header: Title, File count, New File & Refresh buttons */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/80 bg-card/80 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="size-4 text-primary shrink-0" />
          <span className="text-xs font-semibold tracking-tight text-foreground truncate">
            VFS Files
          </span>
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground">
            {allFiles.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Tree vs Flat toggle */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded border border-border/50">
            <button
              type="button"
              onClick={() => setSidebarMode('tree')}
              className={`p-1 rounded transition-colors cursor-pointer ${
                sidebarMode === 'tree' ? 'bg-background text-primary shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Tree View"
            >
              <FolderTree className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarMode('flat')}
              className={`p-1 rounded transition-colors cursor-pointer ${
                sidebarMode === 'flat' ? 'bg-background text-primary shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Flat List"
            >
              <List className="size-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsCreating(true);
              setCreationError(null);
            }}
            className="size-7 rounded-md border border-transparent hover:border-border hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
            title="New File"
            aria-label="New File"
          >
            <Plus className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={handleRefreshClick}
            className="size-7 rounded-md border border-transparent hover:border-border hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
            title="Refresh files"
            aria-label="Refresh files"
          >
            <RotateCw className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search / Filter input */}
      <div className="p-2 border-b border-border/50 shrink-0">
        <div className="relative flex items-center">
          <Search className="size-3.5 text-muted-foreground absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full h-7 pl-8 pr-7 text-xs bg-muted/50 border border-border/60 rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all font-sans"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              title="Clear search"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Inline New File prompt */}
      {isCreating && (
        <form
          onSubmit={handleCreateFile}
          className="p-2 border-b border-primary/30 bg-primary/5 shrink-0 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="text-[11px] font-medium text-foreground flex items-center justify-between">
            <span>New File Path</span>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setNewFilePath('');
                setCreationError(null);
              }}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              title="Cancel"
            >
              <X className="size-3" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={newFilePath}
              onChange={(e) => {
                setNewFilePath(e.target.value);
                if (creationError) setCreationError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewFilePath('');
                  setCreationError(null);
                }
              }}
              placeholder="/src/index.js"
              className="flex-1 h-7 px-2 text-xs font-mono bg-card border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              className="size-7 rounded bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center shrink-0 cursor-pointer shadow-xs"
              title="Create file"
            >
              <Check className="size-3.5" />
            </button>
          </div>

          {creationError && (
            <span className="text-[10px] text-destructive leading-tight">
              {creationError}
            </span>
          )}
        </form>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredFiles.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5 justify-center h-32">
            <File className="size-6 text-muted-foreground/40 stroke-1" />
            <span>{searchQuery ? 'No matching files' : 'No VFS files yet'}</span>
          </div>
        ) : sidebarMode === 'tree' ? (
          <div className="px-1 py-0.5 space-y-0.5">
            {treeNodes.map((node) => (
              <EditorTreeNodeItem
                key={node.id}
                node={node}
                depth={0}
                activeFilePath={activeFilePath}
                expandedPaths={expandedPaths}
                deletingPath={deletingPath}
                toggleExpand={toggleExpand}
                onSelectFile={onSelectFile}
                onDeleteConfirm={handleDeleteConfirm}
                setDeletingPath={setDeletingPath}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {filteredFiles.map((file) => {
              const isActive = activeFilePath === file.path;
              const isDeleting = deletingPath === file.path;

              // Separate folder from name for clear presentation
              const segments = file.path.split('/').filter(Boolean);
              const fileName = segments[segments.length - 1] || file.name || file.path;
              const dirPath = segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : '';

              return (
                <div
                  key={file.path}
                  onClick={() => {
                    if (!isDeleting) onSelectFile(file.path);
                  }}
                  className={`group relative flex items-center justify-between px-2.5 py-1.5 cursor-pointer transition-colors text-xs ${
                    isActive
                      ? 'bg-primary/15 text-primary border-l-2 border-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                  title={file.path}
                >
                  {/* File info (icon, name, dir) */}
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                    {getFileIcon(file.path)}
                    <div className="min-w-0 flex flex-col leading-tight">
                      <span className="truncate text-[12px] text-foreground font-mono">
                        {fileName}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 font-mono">
                        {dirPath && <span className="truncate max-w-[90px]">{dirPath}</span>}
                        {dirPath && <span>•</span>}
                        <span>{formatFileSize(file.size)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Delete button or confirmation */}
                  <div
                    className="shrink-0 flex items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isDeleting ? (
                      <div className="flex items-center gap-1 bg-destructive/10 px-1.5 py-0.5 rounded border border-destructive/30 animate-in fade-in duration-100">
                        <span className="text-[10px] text-destructive font-medium">Del?</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteConfirm(file.path)}
                          className="size-5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center cursor-pointer"
                          title="Confirm delete"
                        >
                          <Check className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingPath(null)}
                          className="size-5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
                          title="Cancel"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => downloadVfsFile(file)}
                          className="size-6 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
                          title={`Download ${file.name || 'file'}`}
                          aria-label="Download file"
                        >
                          <Download className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingPath(file.path)}
                          className="size-6 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive text-muted-foreground flex items-center justify-center transition-all cursor-pointer"
                          title="Delete file"
                          aria-label="Delete file"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
