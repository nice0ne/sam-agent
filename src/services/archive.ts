import JSZip from 'jszip';
import { db } from './db';
import { saveVfsFile, normalizePath, detectMimeType } from './vfs';
import type { VfsFileRecord } from '../types/agent';

/**
 * Triggers a browser download of a given Blob.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Triggers download of an individual VFS file record or content object.
 * Properly decodes Base64 data URLs (for images, audio, PDF, etc.) into binary blobs,
 * and encodes text files with the correct MIME type and UTF-8 charset.
 */
export function downloadVfsFile(file: {
  path: string;
  name?: string;
  content: string;
  mimeType?: string;
}): void {
  const filename = file.name || file.path.split('/').pop() || 'download';

  // Check if content is a data URL (e.g. data:image/png;base64,...)
  const dataUrlMatch = file.content.match(/^data:([^;]+);base64,(.*)$/s);
  if (dataUrlMatch) {
    try {
      const mime = dataUrlMatch[1] || file.mimeType || 'application/octet-stream';
      const base64Data = dataUrlMatch[2].trim().replace(/\s+/g, '');
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      triggerBlobDownload(blob, filename);
      return;
    } catch (e) {
      console.warn('Failed to parse base64 data URL for download, falling back to raw blob:', e);
    }
  }

  // Check if content is raw base64 string without data: prefix (common for office & binary files)
  const trimmed = file.content.trim().replace(/\s+/g, '');
  if (
    trimmed.startsWith('UEsDB') ||
    /\.(pptx|docx|xlsx|pdf|zip|png|jpe?g)$/i.test(file.path)
  ) {
    try {
      if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
        const byteCharacters = atob(trimmed);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const mime = file.mimeType || detectMimeType(file.path) || 'application/octet-stream';
        const blob = new Blob([byteArray], { type: mime });
        triggerBlobDownload(blob, filename);
        return;
      }
    } catch (e) {
      console.warn('Failed to parse raw base64 for download:', e);
    }
  }

  const mime = file.mimeType || detectMimeType(file.path) || 'text/plain;charset=utf-8';
  const blob = new Blob([file.content], { type: mime });
  triggerBlobDownload(blob, filename);
}

/**
 * Export VFS files to a compressed ZIP archive Blob.
 * 
 * - Iterates over files (defaults to all files in IndexedDB).
 * - Strips leading slashes for ZIP relative paths.
 * - Extracts base64 payload if content is a data URL; otherwise saves as utf-8 string.
 * - Compresses with DEFLATE level 6.
 */
export async function exportVfsToZip(files?: VfsFileRecord[]): Promise<Blob> {
  const fileRecords = files ?? (await db.files.toArray());
  const zip = new JSZip();

  for (const file of fileRecords) {
    // Strip leading slash for valid ZIP archive paths
    const zipPath = file.path.replace(/^\/+/, '');
    if (!zipPath) continue;

    // Check if content is a data URL (e.g. data:image/png;base64,...)
    const dataUrlMatch = file.content.match(/^data:([^;]+);base64,(.*)$/s);
    if (dataUrlMatch) {
      const base64Data = dataUrlMatch[2];
      zip.file(zipPath, base64Data, { base64: true });
    } else {
      zip.file(zipPath, file.content);
    }
  }

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });
}

/**
 * Helper to convert Blob to base64 Data URL.
 */
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

/**
 * Helper to check whether a MIME type represents a raster or binary image.
 */
function isImageMime(mime: string): boolean {
  return mime.startsWith('image/') && !mime.includes('svg');
}

/**
 * Import all non-directory entries of a ZIP file into the VFS.
 * - Reads each entry and detects its MIME type.
 * - Saves images as base64 data URLs, and other files as text.
 */
export async function importZipToVfs(
  zipFile: File
): Promise<{ importedCount: number; paths: string[] }> {
  const zip = await JSZip.loadAsync(zipFile);
  const importedPaths: string[] = [];

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;

    // Ensure leading slash for VFS path
    const vfsPath = normalizePath(entry.name);
    const mime = detectMimeType(vfsPath);

    let content: string;
    if (isImageMime(mime)) {
      const blob = await entry.async('blob');
      const typedBlob = new Blob([blob], { type: mime });
      content = await blobToDataUrl(typedBlob);
    } else {
      content = await entry.async('string');
    }

    await saveVfsFile(vfsPath, content, mime);
    importedPaths.push(vfsPath);
  }

  return {
    importedCount: importedPaths.length,
    paths: importedPaths,
  };
}

/**
 * Import individual files (from input or drop event) into VFS under a target directory.
 */
export async function importFilesToVfs(
  files: FileList | File[],
  targetDirectory = '/workspace'
): Promise<number> {
  const fileArray = Array.from(files);
  let count = 0;

  for (const file of fileArray) {
    const vfsPath = normalizePath(`${targetDirectory}/${file.name}`);
    const mime = file.type || detectMimeType(vfsPath);

    let content: string;
    if (isImageMime(mime)) {
      content = await blobToDataUrl(file);
    } else {
      content = await file.text();
    }

    await saveVfsFile(vfsPath, content, mime);
    count++;
  }

  return count;
}
