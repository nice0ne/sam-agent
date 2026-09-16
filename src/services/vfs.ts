import { db } from './db';
import type { VfsFileRecord } from '../types/agent';

const MIME_EXTENSIONS: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  ts: 'text/typescript',
  mts: 'text/typescript',
  cts: 'text/typescript',
  jsx: 'text/jsx',
  tsx: 'text/tsx',
  json: 'application/json',
  md: 'text/markdown',
  markdown: 'text/markdown',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  xml: 'application/xml',
  txt: 'text/plain',
  text: 'text/plain',
  log: 'text/plain',
  csv: 'text/csv',
  py: 'text/x-python',
  sh: 'text/x-sh',
  yaml: 'text/yaml',
  yml: 'text/yaml',
};

export function normalizePath(filePath: string): string {
  if (!filePath || filePath.trim() === '') return '/';
  const clean = filePath.trim().replace(/\\/g, '/');
  const collapsed = clean.replace(/\/+/g, '/');
  return collapsed.startsWith('/') ? collapsed : '/' + collapsed;
}

export function getFileName(filePath: string): string {
  const clean = normalizePath(filePath);
  const segments = clean.split('/').filter(Boolean);
  return segments.pop() || 'untitled';
}

export function detectMimeType(filePath: string): string {
  const parts = filePath.split('.');
  if (parts.length > 1) {
    const ext = parts.pop()!.toLowerCase();
    if (MIME_EXTENSIONS[ext]) {
      return MIME_EXTENSIONS[ext];
    }
  }
  return 'text/plain';
}

export async function saveVfsFile(
  path: string,
  content: string,
  mimeType?: string
): Promise<VfsFileRecord> {
  const normalizedPath = normalizePath(path);
  const name = getFileName(normalizedPath);
  const resolvedMimeType = mimeType || detectMimeType(normalizedPath);
  const size = new TextEncoder().encode(content).length;
  const now = Date.now();

  const existing = await db.files.get(normalizedPath);
  const record: VfsFileRecord = {
    path: normalizedPath,
    name,
    content,
    mimeType: resolvedMimeType,
    size,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  await db.files.put(record);

  // If this is soul.md, immediately sync to chrome.storage.local
  const lower = normalizedPath.toLowerCase();
  if (lower === '/soul.md' || lower === '/workspace/soul.md') {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ agentSoul: content }).catch(() => {});
    }
  }

  return record;
}

export async function getVfsFile(path: string): Promise<VfsFileRecord | undefined> {
  const normalizedPath = normalizePath(path);
  return await db.files.get(normalizedPath);
}

export async function listVfsFiles(dirPrefix?: string): Promise<VfsFileRecord[]> {
  const allFiles = await db.files.orderBy('path').toArray();
  if (!dirPrefix || dirPrefix === '/' || dirPrefix.trim() === '') {
    return allFiles;
  }
  const prefix = normalizePath(dirPrefix);
  const prefixWithSlash = prefix.endsWith('/') ? prefix : prefix + '/';
  return allFiles.filter(
    (file) => file.path === prefix || file.path.startsWith(prefixWithSlash)
  );
}

export async function deleteVfsFile(path: string): Promise<void> {
  const normalizedPath = normalizePath(path);
  await db.files.delete(normalizedPath);
}
