# Workspace Sync & Export/Import Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full VFS workspace portability (export to standard ZIP, import ZIP/files via drag-and-drop) and one-click cloud artifact sharing to GitHub Gist.

**Architecture:** Client-side in-memory zip compression/decompression via `jszip`, paired with direct GitHub REST API v3 for Gist publishing and a visual dropzone overlay integrated into `FilesView`.

**Tech Stack:** React 19, TypeScript, JSZip, Dexie DB (IndexedDB), Tailwind CSS v4, Lucide Icons, Chrome Storage Local API.

**Spec:** `docs/superpowers/specs/2026-09-11-workspace-sync-export-import-design.md`

## Global Constraints
- Target workspace: `E:\VIBE-CODE-WS\CHROME-EXT\3.1.34_0\rebuild-ui`
- Zero TypeScript compiler errors (`npm run compile` must pass with code 0).
- Pure client-side processing without intermediate background worker serialization.
- Secure storage of GitHub PAT in `chrome.storage.local` with key `githubPersonalAccessToken`.

---

### Task 1: ZIP Archive Engine Service (`src/services/archive.ts`)

**Files:**
- Create: `src/services/archive.ts`

**Interfaces:**
- Consumes:
  - `db` from `./db`
  - `saveVfsFile` from `./vfs`
  - `VfsFileRecord` from `../types/agent`
  - `JSZip` from `jszip`
- Produces:
  - `exportVfsToZip(files?: VfsFileRecord[]): Promise<Blob>`
  - `triggerBlobDownload(blob: Blob, filename: string): void`
  - `importZipToVfs(zipFile: File): Promise<{ importedCount: number; paths: string[] }>`
  - `importFilesToVfs(files: FileList | File[], targetDirectory?: string): Promise<number>`

- [ ] **Step 1: Create `src/services/archive.ts`**

Write implementation with full path normalization, MIME detection, text and binary handling:

```typescript
import JSZip from 'jszip';
import { db } from './db';
import { saveVfsFile } from './vfs';
import type { VfsFileRecord } from '../types/agent';

/**
 * Trigger immediate browser download of a Blob
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * Export VFS files to a compressed ZIP archive Blob
 */
export async function exportVfsToZip(files?: VfsFileRecord[]): Promise<Blob> {
  const zip = new JSZip();
  const fileList = files || (await db.files.toArray());

  for (const record of fileList) {
    // Strip leading slash for proper archive directory structure
    const cleanPath = record.path.replace(/^\/+/, '');
    if (!cleanPath) continue;

    if (record.content.startsWith('data:') && record.content.includes(';base64,')) {
      // Binary / Data URL: extract raw base64 part
      const base64Data = record.content.split(';base64,')[1];
      zip.file(cleanPath, base64Data, { base64: true });
    } else {
      // Standard UTF-8 text file
      zip.file(cleanPath, record.content);
    }
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Unpack a ZIP file and save all extracted entries into VFS
 */
export async function importZipToVfs(
  zipFile: File
): Promise<{ importedCount: number; paths: string[] }> {
  const zip = await JSZip.loadAsync(zipFile);
  const importedPaths: string[] = [];

  const entries: Array<{ relativePath: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((relativePath, file) => {
    if (!file.dir) {
      entries.push({ relativePath, file });
    }
  });

  for (const { relativePath, file } of entries) {
    const vfsPath = '/' + relativePath.replace(/^\/+/, '');
    const ext = vfsPath.split('.').pop()?.toLowerCase() || '';

    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext);

    if (isImage && ext !== 'svg') {
      const mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const base64 = await file.async('base64');
      const dataUrl = `data:${mime};base64,${base64}`;
      await saveVfsFile(vfsPath, dataUrl, mime);
    } else {
      const text = await file.async('text');
      await saveVfsFile(vfsPath, text);
    }

    importedPaths.push(vfsPath);
  }

  return { importedCount: importedPaths.length, paths: importedPaths };
}

/**
 * Import raw loose files from file input or drag-and-drop into target VFS folder
 */
export async function importFilesToVfs(
  files: FileList | File[],
  targetDirectory = '/workspace'
): Promise<number> {
  const fileArray = Array.from(files);
  let count = 0;

  for (const file of fileArray) {
    const cleanDir = targetDirectory.replace(/\/+$/, '');
    const vfsPath = `${cleanDir}/${file.name}`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext);

    if (isImage) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await saveVfsFile(vfsPath, dataUrl, file.type || `image/${ext}`);
    } else {
      const text = await file.text();
      await saveVfsFile(vfsPath, text);
    }
    count++;
  }

  return count;
}
```

- [ ] **Step 2: Verify with TypeScript compiler**

Run: `npm run compile` in `E:\VIBE-CODE-WS\CHROME-EXT\3.1.34_0\rebuild-ui`
Expected: 0 errors.

---

### Task 2: GitHub Gist API Client Service (`src/services/gist.ts`)

**Files:**
- Create: `src/services/gist.ts`

**Interfaces:**
- Produces:
  - `GITHUB_TOKEN_KEY: 'githubPersonalAccessToken'`
  - `getGitHubToken(): Promise<string>`
  - `saveGitHubToken(token: string): Promise<void>`
  - `createGitHubGist(options: CreateGistOptions): Promise<GistResult>`

- [ ] **Step 1: Create `src/services/gist.ts`**

Write implementation with GitHub REST API headers and error parsing:

```typescript
export const GITHUB_TOKEN_KEY = 'githubPersonalAccessToken';

export interface CreateGistOptions {
  token: string;
  description: string;
  isPublic: boolean;
  filename: string;
  content: string;
}

export interface GistResult {
  id: string;
  url: string;
  htmlUrl: string;
}

/**
 * Retrieve saved GitHub Personal Access Token from chrome storage
 */
export async function getGitHubToken(): Promise<string> {
  try {
    const data = await chrome.storage.local.get(GITHUB_TOKEN_KEY);
    return data[GITHUB_TOKEN_KEY] || '';
  } catch (_) {
    return '';
  }
}

/**
 * Save GitHub Personal Access Token to chrome storage
 */
export async function saveGitHubToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [GITHUB_TOKEN_KEY]: token.trim() });
}

/**
 * Publish a file directly to GitHub Gist
 */
export async function createGitHubGist(options: CreateGistOptions): Promise<GistResult> {
  const { token, description, isPublic, filename, content } = options;

  if (!token.trim()) {
    throw new Error('GitHub Personal Access Token is required.');
  }

  const cleanFilename = filename.replace(/^\/+/, '') || 'artifact.txt';

  const bodyPayload = {
    description: description.trim() || `Generated by SAM-Agent: ${cleanFilename}`,
    public: isPublic,
    files: {
      [cleanFilename]: {
        content: content || ' ',
      },
    },
  };

  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('Bad credentials (401). Please check that your GitHub token is valid and has "gist" scope.');
    }
    throw new Error(`GitHub API Error (${res.status}): ${errorBody.message || res.statusText}`);
  }

  const data = await res.json();

  return {
    id: data.id,
    url: data.url,
    htmlUrl: data.html_url,
  };
}
```

- [ ] **Step 2: Verify with TypeScript compiler**

Run: `npm run compile` in `rebuild-ui`
Expected: 0 errors.

---

### Task 3: UI Components (`DropZoneOverlay.tsx` & `GistPublishModal.tsx`)

**Files:**
- Create: `src/components/files/DropZoneOverlay.tsx`
- Create: `src/components/files/GistPublishModal.tsx`

- [ ] **Step 1: Create `src/components/files/DropZoneOverlay.tsx`**

```tsx
import React from 'react';
import { UploadCloud, FileArchive } from 'lucide-react';

interface DropZoneOverlayProps {
  isDragging: boolean;
}

export const DropZoneOverlay: React.FC<DropZoneOverlayProps> = ({ isDragging }) => {
  if (!isDragging) return null;

  return (
    <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 border-2 border-dashed border-primary animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
      <div className="flex items-center justify-center size-16 rounded-2xl bg-primary/10 text-primary mb-3 shadow-inner">
        <UploadCloud className="size-8 animate-bounce" />
      </div>
      <h3 className="font-semibold text-sm text-foreground">Drop files or ZIP archive here</h3>
      <p className="text-xs text-muted-foreground mt-1 text-center max-w-xs">
        ZIP files will be automatically unpacked into VFS; loose files will be saved to <code className="font-mono text-primary">/workspace</code>.
      </p>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
        <FileArchive className="size-3.5" />
        <span>Auto-Unpack & VFS Sync</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create `src/components/files/GistPublishModal.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { X, Check, Copy, ExternalLink, Shield, Key, Eye, EyeOff, LoaderCircle, AlertCircle, Share2 } from 'lucide-react';
import { getGitHubToken, saveGitHubToken, createGitHubGist } from '../../services/gist';
import type { VfsFileRecord } from '../../types/agent';

interface GistPublishModalProps {
  file: VfsFileRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const GistPublishModal: React.FC<GistPublishModalProps> = ({ file, isOpen, onClose }) => {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [rememberToken, setRememberToken] = useState(true);
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && file) {
      setError(null);
      setResultUrl(null);
      setCopied(false);
      setDescription(`Artifact from SAM-Agent: ${file.name}`);
      getGitHubToken().then((t) => setToken(t));
    }
  }, [isOpen, file]);

  if (!isOpen || !file) return null;

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Please provide a GitHub Personal Access Token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (rememberToken) {
        await saveGitHubToken(token);
      }
      const res = await createGitHubGist({
        token,
        description,
        isPublic,
        filename: file.name,
        content: file.content,
      });
      setResultUrl(res.htmlUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to publish Gist.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!resultUrl) return;
    navigator.clipboard.writeText(resultUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
            <Share2 className="size-4 text-primary" />
            <span>Share to GitHub Gist</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5">
          {resultUrl ? (
            <div className="space-y-3 py-2 text-center animate-in fade-in">
              <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
                <Check className="size-6" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-foreground">Gist Published Successfully!</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Your file is now live on GitHub Gist.</p>
              </div>

              <div className="flex items-center gap-1.5 p-1.5 bg-background border border-border rounded-lg">
                <input
                  type="text"
                  readOnly
                  value={resultUrl}
                  className="w-full text-xs font-mono bg-transparent px-1 text-foreground focus:outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded font-medium shrink-0 flex items-center gap-1 cursor-pointer hover:opacity-90"
                >
                  {copied ? <Check className="size-3 text-emerald-300" /> : <Copy className="size-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                >
                  <ExternalLink className="size-3.5" />
                  <span>Open in GitHub</span>
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePublish} className="space-y-3">
              {/* File details */}
              <div className="p-2.5 rounded-lg bg-background border border-border/80 flex items-center justify-between text-xs">
                <span className="font-mono text-foreground truncate max-w-[200px]">{file.path}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  {file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`}
                </span>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground font-medium">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Visibility Switch */}
              <div className="flex items-center justify-between p-2 rounded-lg border border-border/80 bg-background/50">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-foreground">{isPublic ? 'Public Gist' : 'Secret Gist (Unlisted)'}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {isPublic ? 'Visible to anyone and searchable' : 'Only people with the link can view'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isPublic ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isPublic ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* GitHub Token */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                    <Key className="size-3 text-primary" />
                    <span>Personal Access Token (classic / fine-grained)</span>
                  </label>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=gist&description=ICT+Agent+Extension"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    <span>Create token</span>
                    <ExternalLink className="size-2.5" />
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full bg-background border border-border rounded-lg pl-2.5 pr-8 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <input
                    type="checkbox"
                    id="rememberToken"
                    checked={rememberToken}
                    onChange={(e) => setRememberToken(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-0 cursor-pointer size-3"
                  />
                  <label htmlFor="rememberToken" className="text-[10px] text-muted-foreground cursor-pointer">
                    Remember token locally in Chrome
                  </label>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] flex items-start gap-1.5">
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                  <span className="break-all">{error}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="size-3.5 animate-spin" />
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="size-3.5" />
                      <span>Publish Gist</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Verify with TypeScript compiler**

Run: `npm run compile` in `rebuild-ui`
Expected: 0 errors.

---

### Task 4: UI Integration in `src/components/files/FilesView.tsx`

**Files:**
- Modify: `src/components/files/FilesView.tsx`

**Interfaces:**
- Consumes:
  - `exportVfsToZip`, `triggerBlobDownload`, `importZipToVfs`, `importFilesToVfs` from `../../services/archive`
  - `DropZoneOverlay` from `./DropZoneOverlay`
  - `GistPublishModal` from `./GistPublishModal`
- Produces:
  - Updated FilesView with Export ZIP button, Import ZIP/Files input, drag-and-drop support, and Gist share buttons.

- [ ] **Step 1: Update `FilesView.tsx`**

Integrate:
- File input ref (`fileInputRef.current?.click()`) for `.zip,*`.
- Drag and drop listeners on root container (`onDragOver`, `onDragLeave`, `onDrop`).
- Toolbar buttons: "Export ZIP" (`Archive` / `Download` icon) and "Import ZIP / Files" (`Upload` icon).
- Per-row Share button (`Share2` icon) opening `GistPublishModal`.
- Toast / notification banner for import success/error.

- [ ] **Step 2: Verify with TypeScript compiler & WXT build**

Run: `npm run compile` && `npm run build`
Expected: 0 errors, `.output/chrome-mv3` successfully generated.
