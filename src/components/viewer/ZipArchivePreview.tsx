import React, { useState, useEffect, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileImage,
  FileText,
  Download,
  HardDrive,
  Search,
  Check,
  AlertCircle,
  LoaderCircle,
  X,
  ArrowDownToLine,
  ChevronRight,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import type { VfsFileRecord } from '../../types/agent';
import { triggerBlobDownload } from '../../services/archive';
import { saveVfsFile, normalizePath, detectMimeType } from '../../services/vfs';

export interface ZipArchivePreviewProps {
  file: VfsFileRecord;
}

interface ZipEntryInfo {
  name: string;
  path: string;
  isDir: boolean;
  uncompressedSize: number;
  compressedSize: number;
  date?: Date;
  entry?: JSZip.JSZipObject;
}

interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  uncompressedSize: number;
  date?: Date;
  entry?: JSZip.JSZipObject;
  children: Map<string, TreeNode>;
}

interface DisplayNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  uncompressedSize: number;
  date?: Date;
  entry?: JSZip.JSZipObject;
  children: DisplayNode[];
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i] || 'B'}`;
}

function formatDate(date?: Date): string {
  if (!date) return '-';
  try {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function decodeToUint8Array(content: string): Uint8Array {
  const dataUrlMatch = content.match(/^data:([^;]+);base64,(.*)$/s);
  if (dataUrlMatch) {
    const base64Data = dataUrlMatch[2].trim();
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return byteNumbers;
  }

  // Raw string: convert char codes to Uint8Array
  const byteNumbers = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    byteNumbers[i] = content.charCodeAt(i) & 0xff;
  }
  return byteNumbers;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function isBinaryMime(mime: string): boolean {
  return (
    (mime.startsWith('image/') && !mime.includes('svg')) ||
    mime.startsWith('audio/') ||
    mime.startsWith('video/') ||
    mime === 'application/pdf' ||
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed' ||
    mime === 'application/octet-stream' ||
    mime.startsWith('font/')
  );
}

async function extractEntryContent(
  entry: JSZip.JSZipObject,
  vfsPath: string
): Promise<{ content: string; mime: string }> {
  const mime = detectMimeType(vfsPath);
  if (isBinaryMime(mime)) {
    const blob = await entry.async('blob');
    const typedBlob = new Blob([blob], { type: mime });
    const dataUrl = await blobToDataUrl(typedBlob);
    return { content: dataUrl, mime };
  } else {
    try {
      const text = await entry.async('string');
      return { content: text, mime };
    } catch {
      const blob = await entry.async('blob');
      const typedBlob = new Blob([blob], { type: mime || 'application/octet-stream' });
      const dataUrl = await blobToDataUrl(typedBlob);
      return { content: dataUrl, mime: typedBlob.type };
    }
  }
}

type FileCategory = 'code' | 'image' | 'text' | 'archive' | 'generic';

function getFileCategory(filename: string): FileCategory {
  const ext = (filename.toLowerCase().split('.').pop() || '').trim();

  const codeExts = new Set([
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts',
    'html', 'htm', 'css', 'scss', 'sass', 'less',
    'json', 'json5', 'yaml', 'yml', 'xml', 'toml', 'ini',
    'py', 'pyw', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp',
    'cs', 'go', 'rs', 'swift', 'kt', 'kts', 'sh', 'bash', 'zsh',
    'bat', 'cmd', 'ps1', 'sql', 'graphql', 'gql', 'vue', 'svelte',
  ]);

  const imageExts = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif',
  ]);

  const textExts = new Set([
    'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'rtf', 'pdf', 'doc', 'docx',
  ]);

  const archiveExts = new Set([
    'zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2', 'xz', 'iso', 'jar', 'war',
  ]);

  if (codeExts.has(ext)) return 'code';
  if (imageExts.has(ext)) return 'image';
  if (textExts.has(ext)) return 'text';
  if (archiveExts.has(ext)) return 'archive';
  return 'generic';
}

function getFileIcon(filename: string, className = 'size-4') {
  const category = getFileCategory(filename);
  switch (category) {
    case 'code':
      return <FileCode className={`${className} text-sky-400`} />;
    case 'image':
      return <FileImage className={`${className} text-emerald-400`} />;
    case 'text':
      return <FileText className={`${className} text-amber-400`} />;
    case 'archive':
      return <HardDrive className={`${className} text-purple-400`} />;
    case 'generic':
    default:
      return <File className={`${className} text-muted-foreground`} />;
  }
}

function computeNodeSizes(node: TreeNode): number {
  if (!node.isDir) {
    return node.uncompressedSize;
  }
  let total = 0;
  for (const child of node.children.values()) {
    total += computeNodeSizes(child);
  }
  node.uncompressedSize = total;
  return total;
}

function toDisplayNodes(node: TreeNode): DisplayNode[] {
  const result: DisplayNode[] = [];
  for (const child of node.children.values()) {
    result.push({
      id: child.id,
      name: child.name,
      path: child.path,
      isDir: child.isDir,
      uncompressedSize: child.uncompressedSize,
      date: child.date,
      entry: child.entry,
      children: toDisplayNodes(child),
    });
  }

  return result.sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function filterNodes(nodes: DisplayNode[], query: string): DisplayNode[] {
  const q = query.toLowerCase();

  function filterNode(node: DisplayNode): DisplayNode | null {
    if (!node.isDir) {
      if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
        return node;
      }
      return null;
    }

    const matchingChildren: DisplayNode[] = [];
    for (const child of node.children) {
      const filtered = filterNode(child);
      if (filtered) matchingChildren.push(filtered);
    }

    if (matchingChildren.length > 0 || node.name.toLowerCase().includes(q)) {
      return {
        ...node,
        children: matchingChildren,
      };
    }

    return null;
  }

  const result: DisplayNode[] = [];
  for (const n of nodes) {
    const fn = filterNode(n);
    if (fn) result.push(fn);
  }
  return result;
}

interface TreeNodeRowProps {
  node: DisplayNode;
  depth: number;
  expandedFolders: Set<string>;
  onToggleFolder: (id: string) => void;
  onDownload: (node: DisplayNode, e?: React.MouseEvent) => void;
  onExtract: (node: DisplayNode, e?: React.MouseEvent) => void;
  extractingId: string | null;
  extractedMap: Record<string, boolean>;
  isSearching: boolean;
}

const TreeNodeRow: React.FC<TreeNodeRowProps> = ({
  node,
  depth,
  expandedFolders,
  onToggleFolder,
  onDownload,
  onExtract,
  extractingId,
  extractedMap,
  isSearching,
}) => {
  const isExpanded = isSearching || expandedFolders.has(node.id);
  const isExtracting = extractingId === node.id;
  const isExtracted = Boolean(extractedMap[node.id]);

  if (node.isDir) {
    return (
      <div className="flex flex-col select-none">
        <div
          onClick={() => onToggleFolder(node.id)}
          className="flex items-center justify-between py-1.5 px-3 hover:bg-muted/50 rounded-lg group text-xs border border-transparent hover:border-border/40 transition-colors cursor-pointer"
          style={{ paddingLeft: `${depth * 18 + 10}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
              {isExpanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </span>
            <span className="text-amber-500 shrink-0">
              {isExpanded ? (
                <FolderOpen className="size-4" />
              ) : (
                <Folder className="size-4" />
              )}
            </span>
            <span className="font-medium text-foreground truncate">{node.name}</span>
            <span className="text-[10px] text-muted-foreground font-mono ml-1">
              ({node.children.length} {node.children.length === 1 ? 'item' : 'items'})
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0 text-muted-foreground text-[11px] font-mono pr-2">
            <span>{formatBytes(node.uncompressedSize)}</span>
          </div>
        </div>

        {isExpanded && node.children.length > 0 && (
          <div className="flex flex-col">
            {node.children.map((child) => (
              <TreeNodeRow
                key={child.id}
                node={child}
                depth={depth + 1}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onDownload={onDownload}
                onExtract={onExtract}
                extractingId={extractingId}
                extractedMap={extractedMap}
                isSearching={isSearching}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between py-1.5 px-3 hover:bg-muted/40 rounded-lg group text-xs border border-transparent hover:border-border/40 transition-colors"
      style={{ paddingLeft: `${depth * 18 + 26}px` }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-3">
        <span className="shrink-0">{getFileIcon(node.name)}</span>
        <span className="text-foreground/90 font-mono truncate text-[11px]" title={node.path}>
          {node.name}
        </span>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="w-20 text-right font-mono text-[11px] text-muted-foreground">
          {formatBytes(node.uncompressedSize)}
        </span>

        <span className="w-36 text-right text-[11px] text-muted-foreground hidden sm:inline-block">
          {formatDate(node.date)}
        </span>

        <div className="w-28 flex items-center justify-end gap-1">
          {/* Extract to VFS Button */}
          <button
            type="button"
            onClick={(e) => onExtract(node, e)}
            disabled={isExtracting}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border transition-all cursor-pointer ${
              isExtracted
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                : 'bg-muted/60 hover:bg-muted border-border/60 text-foreground hover:border-border'
            }`}
            title="Extract single file to VFS (/extracted/...)"
          >
            {isExtracting ? (
              <LoaderCircle className="size-3 animate-spin text-primary" />
            ) : isExtracted ? (
              <>
                <Check className="size-3 text-emerald-500" />
                <span className="hidden sm:inline">Saved</span>
              </>
            ) : (
              <>
                <ArrowDownToLine className="size-3" />
                <span className="hidden sm:inline">VFS</span>
              </>
            )}
          </button>

          {/* Download Button */}
          <button
            type="button"
            onClick={(e) => onDownload(node, e)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border/60 transition-all cursor-pointer"
            title="Download file to device"
          >
            <Download className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const ZipArchivePreview: React.FC<ZipArchivePreviewProps> = ({ file }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [treeNodes, setTreeNodes] = useState<DisplayNode[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [folderCount, setFolderCount] = useState(0);
  const [totalUncompressed, setTotalUncompressed] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Extraction states
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractedMap, setExtractedMap] = useState<Record<string, boolean>>({});
  const [isExtractingAll, setIsExtractingAll] = useState(false);
  const [extractProgress, setExtractProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const [extractAllSuccess, setExtractAllSuccess] = useState<string | null>(null);

  // Parse archive content
  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!file.content) {
        throw new Error('Archive content is empty.');
      }

      const binaryData = decodeToUint8Array(file.content);
      if (binaryData.length === 0) {
        throw new Error('Could not decode archive binary data.');
      }

      const zip = await JSZip.loadAsync(binaryData);
      setZipInstance(zip);

      const byteLength = binaryData.byteLength || file.size || 0;
      setCompressedSize(byteLength);

      const zipEntries: ZipEntryInfo[] = [];
      let totalUncomp = 0;
      let files = 0;
      const foldersSet = new Set<string>();

      const entries = Object.values(zip.files);
      if (entries.length === 0) {
        throw new Error('The ZIP archive contains no files or folders.');
      }

      for (const entry of entries) {
        const normalizedName = entry.name.replace(/\\/g, '/');
        const isDir = entry.dir || normalizedName.endsWith('/');
        const rawData = (entry as any)._data;
        const uncompSize =
          typeof rawData?.uncompressedSize === 'number' ? rawData.uncompressedSize : 0;
        const compSize =
          typeof rawData?.compressedSize === 'number' ? rawData.compressedSize : 0;

        if (isDir) {
          const cleanDir = normalizedName.replace(/\/+$/, '');
          if (cleanDir) foldersSet.add(cleanDir);
        } else {
          files++;
          totalUncomp += uncompSize;
          const parts = normalizedName.split('/');
          let currentPath = '';
          for (let i = 0; i < parts.length - 1; i++) {
            currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
            foldersSet.add(currentPath);
          }
        }

        zipEntries.push({
          name: normalizedName.split('/').filter(Boolean).pop() || normalizedName,
          path: normalizedName,
          isDir,
          uncompressedSize: uncompSize,
          compressedSize: compSize,
          date: entry.date,
          entry,
        });
      }

      setFileCount(files);
      setFolderCount(foldersSet.size);
      setTotalUncompressed(totalUncomp);

      // Build tree
      const rootNode: TreeNode = {
        id: '',
        name: '',
        path: '',
        isDir: true,
        uncompressedSize: 0,
        children: new Map(),
      };

      for (const entry of zipEntries) {
        const cleanPath = entry.path.replace(/^\/+/, '').replace(/\/+$/, '');
        if (!cleanPath) continue;

        const parts = cleanPath.split('/');
        let curr = rootNode;

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isLast = i === parts.length - 1;
          const isDirectory = isLast ? entry.isDir : true;
          const subPath = parts.slice(0, i + 1).join('/');

          if (!curr.children.has(part)) {
            curr.children.set(part, {
              id: subPath,
              name: part,
              path: subPath,
              isDir: isDirectory,
              uncompressedSize: isLast && !isDirectory ? entry.uncompressedSize : 0,
              date: isLast ? entry.date : undefined,
              entry: isLast ? entry.entry : undefined,
              children: new Map(),
            });
          } else {
            const existing = curr.children.get(part)!;
            if (isLast) {
              existing.isDir = isDirectory;
              if (!isDirectory) {
                existing.uncompressedSize = entry.uncompressedSize;
              }
              existing.date = entry.date;
              existing.entry = entry.entry;
            }
          }

          curr = curr.children.get(part)!;
        }
      }

      computeNodeSizes(rootNode);
      const displayTree = toDisplayNodes(rootNode);
      setTreeNodes(displayTree);

      // Auto-expand top level folders
      const initialOpen = new Set<string>();
      displayTree.forEach((node) => {
        if (node.isDir) initialOpen.add(node.id);
      });
      setExpandedFolders(initialOpen);
    } catch (err: any) {
      console.error('Failed to parse zip archive:', err);
      setError(err?.message || 'Invalid or corrupted ZIP archive.');
    } finally {
      setLoading(false);
    }
  }, [file]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  // Toggle folder open/close
  const handleToggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const allDirs = new Set<string>();
    function collect(nodes: DisplayNode[]) {
      for (const n of nodes) {
        if (n.isDir) {
          allDirs.add(n.id);
          collect(n.children);
        }
      }
    }
    collect(treeNodes);
    setExpandedFolders(allDirs);
  };

  const handleCollapseAll = () => {
    setExpandedFolders(new Set());
  };

  // Download single file from zip
  const handleDownloadFile = async (node: DisplayNode, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!node.entry || node.isDir) return;

    try {
      const blob = await node.entry.async('blob');
      const mime = detectMimeType(node.path);
      const typedBlob = new Blob([blob], { type: mime || 'application/octet-stream' });
      triggerBlobDownload(typedBlob, node.name);
    } catch (err) {
      console.error('Failed to download file from zip:', err);
    }
  };

  // Extract single file to VFS
  const handleExtractSingle = async (node: DisplayNode, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!node.entry || node.isDir) return;

    setExtractingId(node.id);
    try {
      const archiveFolder =
        (file.name || 'archive')
          .replace(/\.[^/.]+$/, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_') || 'archive';

      const safePath = node.path.replace(/^\/+/, '').replace(/\.\.\//g, '');
      const vfsPath = normalizePath(`/extracted/${archiveFolder}/${safePath}`);
      const { content, mime } = await extractEntryContent(node.entry, vfsPath);
      await saveVfsFile(vfsPath, content, mime);

      setExtractedMap((prev) => ({ ...prev, [node.id]: true }));
      setTimeout(() => {
        setExtractedMap((prev) => {
          const next = { ...prev };
          delete next[node.id];
          return next;
        });
      }, 2500);
    } catch (err) {
      console.error('Failed to extract file to VFS:', err);
    } finally {
      setExtractingId(null);
    }
  };

  // Extract all files to VFS
  const handleExtractAll = async () => {
    if (isExtractingAll || !zipInstance) return;

    setIsExtractingAll(true);
    setExtractAllSuccess(null);

    const archiveFolder =
      (file.name || 'archive')
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_') || 'archive';

    const fileEntries = Object.values(zipInstance.files).filter(
      (e) => !e.dir && !e.name.endsWith('/')
    );

    const total = fileEntries.length;
    let count = 0;

    try {
      for (const entry of fileEntries) {
        count++;
        setExtractProgress({
          current: count,
          total,
          currentFile: entry.name,
        });

        const entryPath = entry.name.replace(/^\/+/, '').replace(/\.\.\//g, '');
        const vfsPath = normalizePath(`/extracted/${archiveFolder}/${entryPath}`);
        const { content, mime } = await extractEntryContent(entry, vfsPath);
        await saveVfsFile(vfsPath, content, mime);
      }

      setExtractAllSuccess(`Extracted ${total} files to /extracted/${archiveFolder}/`);
      setTimeout(() => setExtractAllSuccess(null), 5000);
    } catch (err: any) {
      console.error('Failed extracting archive to VFS:', err);
      setError(err?.message || 'Failed to extract archive files to VFS');
    } finally {
      setIsExtractingAll(false);
      setExtractProgress(null);
    }
  };

  // Filter tree nodes based on search
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return treeNodes;
    return filterNodes(treeNodes, searchQuery.trim());
  }, [treeNodes, searchQuery]);

  // Space saved percentage calculation
  const spaceSaved = useMemo(() => {
    if (totalUncompressed <= 0 || compressedSize <= 0) return 0;
    if (totalUncompressed <= compressedSize) return 0;
    return Math.round(((totalUncompressed - compressedSize) / totalUncompressed) * 100);
  }, [totalUncompressed, compressedSize]);

  // Render loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
        <LoaderCircle className="size-8 animate-spin text-primary mb-3" />
        <p className="text-sm font-medium text-foreground">Reading ZIP Archive...</p>
        <p className="text-xs mt-1 text-muted-foreground">Decompressing file catalog and directory index</p>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-3">
          <AlertCircle className="size-6" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Cannot Read Archive</h3>
        <p className="text-xs text-muted-foreground max-w-md mb-4">{error}</p>
        <button
          type="button"
          onClick={loadArchive}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors cursor-pointer"
        >
          <RefreshCw className="size-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 gap-4">
      {/* Header Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        {/* Card 1: Files & Folders */}
        <div className="p-3 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Entries</span>
            <Folder className="size-4 text-amber-500" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">
              {fileCount} <span className="text-xs font-normal text-muted-foreground">files</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {folderCount} {folderCount === 1 ? 'folder' : 'folders'}
            </div>
          </div>
        </div>

        {/* Card 2: Uncompressed Size */}
        <div className="p-3 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Uncompressed</span>
            <FileText className="size-4 text-sky-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground font-mono">
              {formatBytes(totalUncompressed)}
            </div>
            <div className="text-[11px] text-muted-foreground">Total extracted volume</div>
          </div>
        </div>

        {/* Card 3: Compressed Size */}
        <div className="p-3 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Archive Size</span>
            <HardDrive className="size-4 text-purple-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground font-mono">
              {formatBytes(compressedSize)}
            </div>
            <div className="text-[11px] text-muted-foreground">On-disk ZIP payload</div>
          </div>
        </div>

        {/* Card 4: Space Saved */}
        <div className="p-3 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Ratio</span>
            <ArrowDownToLine className="size-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">
              {spaceSaved > 0 ? `Saved ${spaceSaved}%` : 'Standard'}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {spaceSaved > 0
                ? `${formatBytes(Math.max(0, totalUncompressed - compressedSize))} saved`
                : 'No compression'}
            </div>
          </div>
        </div>
      </div>

      {/* Extraction Progress Banner */}
      {isExtractingAll && extractProgress && (
        <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 shrink-0 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <LoaderCircle className="size-3.5 animate-spin text-primary" />
              <span>Extracting to VFS...</span>
              <span className="text-muted-foreground font-mono">
                ({extractProgress.current}/{extractProgress.total})
              </span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">
              {Math.round((extractProgress.current / extractProgress.total) * 100)}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-150 rounded-full"
              style={{
                width: `${(extractProgress.current / extractProgress.total) * 100}%`,
              }}
            />
          </div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            Current: {extractProgress.currentFile}
          </div>
        </div>
      )}

      {/* Extraction Success Banner */}
      {extractAllSuccess && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 shrink-0 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Check className="size-4" />
            <span className="font-medium">{extractAllSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setExtractAllSuccess(null)}
            className="text-emerald-500/70 hover:text-emerald-500 cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Action and Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="size-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search entries by name or extension (e.g. .ts, image)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-muted/50 hover:bg-muted/70 focus:bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Tree controls & Extract All */}
        <div className="flex items-center gap-2">
          {!searchQuery && (
            <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/50 text-[11px]">
              <button
                type="button"
                onClick={handleExpandAll}
                className="px-2 py-1 text-muted-foreground hover:text-foreground rounded hover:bg-card/70 transition-colors cursor-pointer"
                title="Expand all folders"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="px-2 py-1 text-muted-foreground hover:text-foreground rounded hover:bg-card/70 transition-colors cursor-pointer"
                title="Collapse all folders"
              >
                Collapse All
              </button>
            </div>
          )}

          {/* Extract All Button */}
          <button
            type="button"
            onClick={handleExtractAll}
            disabled={isExtractingAll || fileCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-xs font-medium transition-all shadow-xs cursor-pointer shrink-0"
            title="Extract all files into VFS (/extracted/...)"
          >
            {isExtractingAll ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <ArrowDownToLine className="size-3.5" />
            )}
            <span>Extract All to VFS</span>
          </button>
        </div>
      </div>

      {/* Directory Tree Container */}
      <div className="flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs flex flex-col min-h-0">
        {/* Table/Tree Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/80 backdrop-blur border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 z-10 select-none">
          <div className="flex-1 min-w-0">Name</div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="w-20 text-right">Size</span>
            <span className="w-36 text-right hidden sm:inline-block">Modified</span>
            <span className="w-28 text-right">Actions</span>
          </div>
        </div>

        {/* Tree Content */}
        <div className="p-2 overflow-y-auto flex-1 divide-y divide-border/20">
          {filteredTree.length > 0 ? (
            filteredTree.map((node) => (
              <TreeNodeRow
                key={node.id}
                node={node}
                depth={0}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
                onDownload={handleDownloadFile}
                onExtract={handleExtractSingle}
                extractingId={extractingId}
                extractedMap={extractedMap}
                isSearching={Boolean(searchQuery.trim())}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Search className="size-8 opacity-30 mb-2" />
              <p className="text-xs font-medium text-foreground">No matching entries found</p>
              <p className="text-[11px] mt-0.5">
                No files or directories in this archive matched "{searchQuery}"
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ZipArchivePreview;
