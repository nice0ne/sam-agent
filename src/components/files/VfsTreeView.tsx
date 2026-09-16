import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image as ImageIcon,
  Wrench,
  Sparkles,
  Layers,
  UploadCloud,
  Eye,
  Code2,
  Download,
  Trash2,
  Share2,
  Plus,
  HardDrive,
} from 'lucide-react';
import type { VfsTreeNode } from '../../utils/vfs-tree';
import type { VfsFileRecord } from '../../types/agent';

export interface VfsTreeViewProps {
  nodes: VfsTreeNode[];
  onView: (path: string) => void;
  onEdit: (path: string) => void;
  onDownload: (file: VfsFileRecord) => void;
  onDelete: (path: string) => void;
  onShareGist: (file: VfsFileRecord) => void;
  onCreateInFolder?: (folderPath: string) => void;
  defaultExpandedAll?: boolean;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'html':
    case 'htm':
      return <FileCode className="size-3.5 text-orange-500 shrink-0" />;
    case 'css':
      return <FileCode className="size-3.5 text-sky-400 shrink-0" />;
    case 'js':
    case 'mjs':
    case 'cjs':
      return <Code2 className="size-3.5 text-amber-400 shrink-0" />;
    case 'ts':
    case 'tsx':
    case 'jsx':
      return <Code2 className="size-3.5 text-blue-400 shrink-0" />;
    case 'json':
    case 'yaml':
    case 'yml':
      return <FileJson className="size-3.5 text-amber-500 shrink-0" />;
    case 'md':
    case 'markdown':
    case 'txt':
    case 'log':
      return <FileText className="size-3.5 text-indigo-400 shrink-0" />;
    case 'csv':
      return <FileSpreadsheet className="size-3.5 text-emerald-500 shrink-0" />;
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return <ImageIcon className="size-3.5 text-purple-400 shrink-0" />;
    default:
      return <File className="size-3.5 text-muted-foreground shrink-0" />;
  }
}

function getFolderVisuals(path: string, isOpen: boolean) {
  const normalized = path.toLowerCase();
  if (normalized === '/skills') {
    return {
      icon: <Sparkles className="size-3.5 text-purple-500 shrink-0" />,
      badge: 'skills',
      badgeColor: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    };
  }
  if (normalized === '/tools') {
    return {
      icon: <Wrench className="size-3.5 text-amber-500 shrink-0" />,
      badge: 'tools',
      badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    };
  }
  if (normalized === '/workspace') {
    return {
      icon: <Layers className="size-3.5 text-emerald-500 shrink-0" />,
      badge: 'workspace',
      badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
  }
  if (normalized === '/workspace/uploads') {
    return {
      icon: <UploadCloud className="size-3.5 text-sky-500 shrink-0" />,
      badge: 'uploads',
      badgeColor: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
    };
  }
  return {
    icon: isOpen ? (
      <FolderOpen className="size-3.5 text-amber-400/90 shrink-0" />
    ) : (
      <Folder className="size-3.5 text-amber-400/90 shrink-0" />
    ),
    badge: undefined,
    badgeColor: undefined,
  };
}

interface TreeNodeItemProps {
  node: VfsTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  onView: (path: string) => void;
  onEdit: (path: string) => void;
  onDownload: (file: VfsFileRecord) => void;
  onDelete: (path: string) => void;
  onShareGist: (file: VfsFileRecord) => void;
  onCreateInFolder?: (folderPath: string) => void;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  depth,
  expandedPaths,
  toggleExpand,
  onView,
  onEdit,
  onDownload,
  onDelete,
  onShareGist,
  onCreateInFolder,
}) => {
  const isExpanded = expandedPaths.has(node.path);

  if (node.isFolder) {
    const visuals = getFolderVisuals(node.path, isExpanded);

    return (
      <div className="select-none text-xs">
        {/* Folder Row */}
        <div
          className="group flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
          style={{ paddingLeft: `${Math.max(8, depth * 16)}px` }}
          onClick={() => toggleExpand(node.path)}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.path);
              }}
              className="p-0.5 text-muted-foreground hover:text-foreground rounded"
            >
              {isExpanded ? (
                <ChevronDown className="size-3 text-muted-foreground transition-transform" />
              ) : (
                <ChevronRight className="size-3 text-muted-foreground transition-transform" />
              )}
            </button>

            {visuals.icon}

            <span className="font-medium text-foreground truncate">{node.name}</span>

            {visuals.badge && (
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full border font-mono ${visuals.badgeColor}`}
              >
                {visuals.badge}
              </span>
            )}

            <span className="text-[10px] text-muted-foreground font-mono ml-auto mr-1 opacity-70">
              {node.fileCount} {node.fileCount === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* Folder Quick Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onCreateInFolder && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateInFolder(node.path);
                }}
                className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title={`Create file in ${node.path}`}
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Children (Subfolders and Files) */}
        {isExpanded && (
          <div className="relative border-l border-border/40 ml-3.5 my-0.5">
            {node.children.length === 0 ? (
              <div
                className="py-1 px-3 text-[11px] text-muted-foreground/60 italic"
                style={{ paddingLeft: `${(depth + 1) * 12}px` }}
              >
                (Empty folder)
              </div>
            ) : (
              node.children.map((child) => (
                <TreeNodeItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  toggleExpand={toggleExpand}
                  onView={onView}
                  onEdit={onEdit}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  onShareGist={onShareGist}
                  onCreateInFolder={onCreateInFolder}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // File Node Row
  const file = node.file;
  if (!file) return null;

  return (
    <div
      className="group flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/70 transition-colors"
      style={{ paddingLeft: `${Math.max(8, depth * 16)}px` }}
    >
      {/* File Info */}
      <div
        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
        onClick={() => onView(file.path)}
        title={file.path}
      >
        <span className="opacity-0 w-3 inline-block" />
        {getFileIcon(file.path)}
        <span className="font-normal text-foreground truncate text-xs select-text">
          {node.name}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono ml-auto mr-2 shrink-0 opacity-70">
          <HardDrive className="size-2.5 inline mr-0.5" />
          {formatFileSize(file.size)}
        </span>
      </div>

      {/* File Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {/* Share to Gist */}
        <button
          type="button"
          onClick={() => onShareGist(file)}
          className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          title="Share to GitHub Gist"
        >
          <Share2 className="size-3" />
        </button>

        {/* View in Artifact Viewer */}
        <button
          type="button"
          onClick={() => onView(file.path)}
          className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          title="View Preview"
        >
          <Eye className="size-3" />
        </button>

        {/* Edit in Code Editor */}
        <button
          type="button"
          onClick={() => onEdit(file.path)}
          className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          title="Edit Code"
        >
          <Code2 className="size-3" />
        </button>

        {/* Download file */}
        <button
          type="button"
          onClick={() => onDownload(file)}
          className="p-1 rounded text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer"
          title="Download File"
        >
          <Download className="size-3" />
        </button>

        {/* Delete file */}
        <button
          type="button"
          onClick={() => onDelete(file.path)}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          title="Delete File"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
};

export const VfsTreeView: React.FC<VfsTreeViewProps> = ({
  nodes,
  onView,
  onEdit,
  onDownload,
  onDelete,
  onShareGist,
  onCreateInFolder,
}) => {
  // By default, standard folders are expanded
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    return new Set(['/skills', '/tools', '/workspace']);
  });

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

  const expandAll = () => {
    const allFolderPaths = new Set<string>();
    const collect = (list: VfsTreeNode[]) => {
      for (const item of list) {
        if (item.isFolder) {
          allFolderPaths.add(item.path);
          collect(item.children);
        }
      }
    };
    collect(nodes);
    setExpandedPaths(allFolderPaths);
  };

  const collapseAll = () => {
    setExpandedPaths(new Set());
  };

  return (
    <div className="space-y-1">
      {/* Tree View Controls */}
      <div className="flex items-center justify-between px-2 pb-1.5 text-[11px] text-muted-foreground border-b border-border/40">
        <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
          Folder Hierarchy
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            Expand All
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={collapseAll}
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            Collapse
          </button>
        </div>
      </div>

      {/* Nodes List */}
      <div className="pt-1">
        {nodes.map((node) => (
          <TreeNodeItem
            key={node.id}
            node={node}
            depth={0}
            expandedPaths={expandedPaths}
            toggleExpand={toggleExpand}
            onView={onView}
            onEdit={onEdit}
            onDownload={onDownload}
            onDelete={onDelete}
            onShareGist={onShareGist}
            onCreateInFolder={onCreateInFolder}
          />
        ))}
      </div>
    </div>
  );
};
