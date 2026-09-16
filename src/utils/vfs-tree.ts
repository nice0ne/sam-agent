import type { VfsFileRecord } from '../types/agent';

export interface VfsTreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  children: VfsTreeNode[];
  file?: VfsFileRecord;
  fileCount: number;
  totalSize: number;
}

export const STANDARD_VFS_FOLDERS = [
  { path: '/skills', name: 'skills', description: 'Agent SOPs & specialized domain guides (*.md)' },
  { path: '/tools', name: 'tools', description: 'Executable scriptlets & DOM tools (*.js)' },
  { path: '/workspace', name: 'workspace', description: 'AI generated prototypes, HTML mockups & reports' },
  { path: '/workspace/uploads', name: 'uploads', description: 'User uploaded & attached files' },
  { path: '/data', name: 'data', description: 'Structured data & exported JSON' },
];

interface InternalFolder {
  id: string;
  name: string;
  path: string;
  subFolders: Map<string, InternalFolder>;
  files: VfsTreeNode[];
}

function createFolder(name: string, path: string): InternalFolder {
  return {
    id: path,
    name,
    path,
    subFolders: new Map(),
    files: [],
  };
}

/**
 * Builds a hierarchical tree from a flat list of VfsFileRecord items
 */
export function buildVfsTree(
  files: VfsFileRecord[],
  searchQuery: string = ''
): VfsTreeNode[] {
  const q = searchQuery.toLowerCase().trim();

  // Filter files if search query is provided
  const activeFiles = q
    ? files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
      )
    : files;

  const rootFolders = new Map<string, InternalFolder>();
  const rootFiles: VfsTreeNode[] = [];

  // Helper to ensure path to folder exists and return the leaf folder
  const ensureFolder = (folderParts: string[]): InternalFolder => {
    let currentMap = rootFolders;
    let accPath = '';
    let currentFolder!: InternalFolder;

    for (const part of folderParts) {
      accPath += `/${part}`;
      let folder = currentMap.get(part);
      if (!folder) {
        folder = createFolder(part, accPath);
        currentMap.set(part, folder);
      }
      currentFolder = folder;
      currentMap = folder.subFolders;
    }

    return currentFolder;
  };

  // 1. If no search filter is active, pre-seed standard folders so they always appear
  if (!q) {
    for (const folder of STANDARD_VFS_FOLDERS) {
      const parts = folder.path.split('/').filter(Boolean);
      ensureFolder(parts);
    }
  }

  // 2. Insert all active files into their respective folders
  for (const file of activeFiles) {
    const rawPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
    const parts = rawPath.split('/').filter(Boolean);

    if (parts.length <= 1) {
      // Root level file (e.g. /soul.md)
      rootFiles.push({
        id: file.path,
        name: file.name || parts[0] || 'untitled',
        path: file.path,
        isFolder: false,
        children: [],
        file,
        fileCount: 1,
        totalSize: file.size || 0,
      });
      continue;
    }

    // Folders path: all parts except the last one (filename)
    const folderParts = parts.slice(0, -1);
    const fileName = parts[parts.length - 1];
    const targetFolder = ensureFolder(folderParts);

    targetFolder.files.push({
      id: file.path,
      name: file.name || fileName,
      path: file.path,
      isFolder: false,
      children: [],
      file,
      fileCount: 1,
      totalSize: file.size || 0,
    });
  }

  // 3. Recursively convert InternalFolder to VfsTreeNode
  function finalizeFolder(folder: InternalFolder): VfsTreeNode {
    const subFolderNodes = Array.from(folder.subFolders.values()).map(finalizeFolder);

    // If searching, hide empty subfolders
    const activeSubFolders = q
      ? subFolderNodes.filter((sf) => sf.fileCount > 0)
      : subFolderNodes;

    // Combine folders and files
    const allChildren: VfsTreeNode[] = [...activeSubFolders, ...folder.files];

    // Compute total file count and size
    const fileCount = allChildren.reduce(
      (acc, c) => acc + (c.isFolder ? c.fileCount : 1),
      0
    );
    const totalSize = allChildren.reduce(
      (acc, c) => acc + (c.isFolder ? c.totalSize : c.totalSize),
      0
    );

    // Sort children: folders first (alphabetical), then files (alphabetical)
    allChildren.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      isFolder: true,
      children: allChildren,
      fileCount,
      totalSize,
    };
  }

  // Finalize all root folders
  const finalizedRootFolders = Array.from(rootFolders.values()).map(finalizeFolder);

  // If searching, hide empty root folders
  const activeRootFolders = q
    ? finalizedRootFolders.filter((rf) => rf.fileCount > 0)
    : finalizedRootFolders;

  // Combine root folders + root files
  const result: VfsTreeNode[] = [...activeRootFolders, ...rootFiles];

  // Prioritize standard root folders (/skills, /tools, /workspace, /data) at the top
  const folderPriority = ['skills', 'tools', 'workspace', 'data'];
  result.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    if (a.isFolder && b.isFolder) {
      const pA = folderPriority.indexOf(a.name);
      const pB = folderPriority.indexOf(b.name);
      if (pA !== -1 && pB !== -1) return pA - pB;
      if (pA !== -1) return -1;
      if (pB !== -1) return 1;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return result;
}
