import { db } from './db';
import type { StoredHandleRecord } from '../types/agent';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'handle_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Deduplicates directory mount names by appending (1), (2), etc. if already taken.
 */
export function generateMountName(baseName: string, existingNames: string[]): string {
  const clean = baseName.trim() || 'mount';
  if (!existingNames.includes(clean)) {
    return clean;
  }
  let counter = 1;
  while (existingNames.includes(`${clean} (${counter})`)) {
    counter++;
  }
  return `${clean} (${counter})`;
}

/**
 * Persists a FileSystemDirectoryHandle to Dexie db.handles.
 */
export async function storeHandle(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite',
  name?: string
): Promise<StoredHandleRecord> {
  const existingRecords = await getStoredHandles();
  const existingNames = existingRecords.map((r) => r.name);
  const baseName = name?.trim() || handle.name || 'folder';
  const mountName = generateMountName(baseName, existingNames);

  const record: StoredHandleRecord = {
    id: generateId(),
    name: mountName,
    handle,
    mode,
    mountedAt: Date.now(),
  };

  await db.handles.put(record);
  return record;
}

/**
 * Retrieves all stored directory handles ordered by mount timestamp.
 */
export async function getStoredHandles(): Promise<StoredHandleRecord[]> {
  try {
    return await db.handles.orderBy('mountedAt').toArray();
  } catch (err) {
    console.warn('[handle-store] Failed to get stored handles:', err);
    return [];
  }
}

/**
 * Retrieves a stored directory handle by either ID or mount name.
 */
export async function getStoredHandle(nameOrId: string): Promise<StoredHandleRecord | undefined> {
  try {
    const byId = await db.handles.get(nameOrId);
    if (byId) return byId;
    return await db.handles.where('name').equals(nameOrId).first();
  } catch (err) {
    console.warn('[handle-store] Failed to get stored handle:', err);
    return undefined;
  }
}

/**
 * Removes a directory handle record from Dexie by its ID.
 */
export async function removeHandle(id: string): Promise<void> {
  try {
    await db.handles.delete(id);
  } catch (err) {
    console.warn('[handle-store] Failed to remove handle:', err);
  }
}

/**
 * Verifies (or prompts for) permission to read or read/write with a FileSystemDirectoryHandle.
 */
export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  readWrite = true
): Promise<boolean> {
  const options: FileSystemHandlePermissionDescriptor = {
    mode: readWrite ? 'readwrite' : 'read',
  };

  try {
    if (typeof handle.queryPermission === 'function') {
      const status = await handle.queryPermission(options);
      if (status === 'granted') {
        return true;
      }
    }
    if (typeof handle.requestPermission === 'function') {
      const status = await handle.requestPermission(options);
      if (status === 'granted') {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn('[handle-store] Failed to verify permission:', err);
    return false;
  }
}

