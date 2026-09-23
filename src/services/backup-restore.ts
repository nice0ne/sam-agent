/**
 * Backup, Export & Restore Service for SAM-Agent
 * Provides comprehensive data export, JSON archive serialization,
 * optional AES-GCM encryption with password, integrity validation,
 * and intelligent merge/overwrite restoration into Dexie IndexedDB
 * and chrome.storage.local.
 */

import { db } from './db';
import { triggerBlobDownload } from './archive';
import { saveVfsFile } from './vfs';

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupScopeOptions {
  includeConfigs?: boolean;       // Provider, models, soul.md, RTK, ponytail, search engine
  includeApiKeys?: boolean;       // API keys (Anthropic, Gemini, OpenAI, DeepSeek, etc.)
  includeThreads?: boolean;       // Chat conversation history & parts
  includeVfs?: boolean;           // Virtual File System records
  includeMemories?: boolean;      // Episodic memory & domain memory
  includeSchedules?: boolean;     // Scheduled background tasks
  includeProfileVault?: boolean;  // Encrypted profile vault
}

export interface BackupArchiveManifest {
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  scope: BackupScopeOptions;
  encrypted: boolean;
  itemCounts: {
    threads: number;
    vfsFiles: number;
    episodicMemories: number;
    domainMemories: number;
    scheduledTasks: number;
    hasProfileVault: boolean;
    configsCount: number;
  };
}

export interface BackupArchiveData {
  configs?: Record<string, any>;
  threads?: any[];
  vfsFiles?: any[];
  episodicMemories?: any[];
  domainMemories?: any[];
  scheduledTasks?: any[];
  profileVault?: any;
  fileChunks?: any[];
}

export interface BackupArchivePayload {
  manifest: BackupArchiveManifest;
  data: BackupArchiveData;
}

export interface EncryptedBackupArchive {
  manifest: BackupArchiveManifest;
  encrypted: true;
  salt: string;       // base64
  iv: string;         // base64
  ciphertext: string; // base64
}

export interface RestorePreview {
  valid: boolean;
  error?: string;
  isEncrypted: boolean;
  manifest?: BackupArchiveManifest;
  rawArchive?: BackupArchivePayload | EncryptedBackupArchive;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  restoredCounts: {
    threads: number;
    vfsFiles: number;
    episodicMemories: number;
    domainMemories: number;
    scheduledTasks: number;
    configs: number;
  };
}

// Keys stored in chrome.storage.local
const SENSITIVE_API_KEYS = [
  'anthropicApiKey',
  'geminiApiKey',
  'openaiApiKey',
  'deepseekApiKey',
  'customApiKey',
  'braveApiKey',
  'tavilyApiKey',
  'github_personal_token',
];

const GENERAL_CONFIG_KEYS = [
  'provider',
  'hostedModel',
  'thinkingLevel',
  'agent_soul_prompt',
  'enable_rtk_trimming',
  'enable_ponytail_compression',
  'webSearchProvider',
  'customBaseUrl',
  'custom_baseUrl',
  'user_tools_list_v1',
];

// --- Web Crypto AES-GCM Helpers ---

async function deriveEncryptionKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypts an archive payload using AES-256-GCM.
 */
async function encryptArchive(payload: BackupArchivePayload, password: string): Promise<EncryptedBackupArchive> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(password, salt);

  const enc = new TextEncoder();
  const dataBytes = enc.encode(JSON.stringify(payload.data));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    dataBytes
  );

  return {
    manifest: {
      ...payload.manifest,
      encrypted: true,
    },
    encrypted: true,
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(cipherBuffer),
  };
}

/**
 * Decrypts an encrypted archive payload using AES-256-GCM.
 */
async function decryptArchive(archive: EncryptedBackupArchive, password: string): Promise<BackupArchivePayload> {
  const salt = new Uint8Array(base64ToBuffer(archive.salt));
  const iv = new Uint8Array(base64ToBuffer(archive.iv));
  const ciphertext = base64ToBuffer(archive.ciphertext);

  const key = await deriveEncryptionKey(password, salt);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Password salah atau berkas backup terkorupsi.');
  }

  const dec = new TextDecoder();
  const dataJson = dec.decode(decryptedBuffer);
  const data = JSON.parse(dataJson);

  return {
    manifest: archive.manifest,
    data,
  };
}

// --- Export Functionality ---

/**
 * Generates a full or granular backup archive of SAM-Agent.
 */
export async function createBackupArchive(
  scope: BackupScopeOptions,
  password?: string
): Promise<{ jsonString: string; filename: string; manifest: BackupArchiveManifest }> {
  const data: BackupArchiveData = {};
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // 1. Collect configuration & storage
  let configsCount = 0;
  if (scope.includeConfigs || scope.includeApiKeys) {
    const keysToFetch: string[] = [];
    if (scope.includeConfigs) keysToFetch.push(...GENERAL_CONFIG_KEYS);
    if (scope.includeApiKeys) keysToFetch.push(...SENSITIVE_API_KEYS);

    const storageResult = await chrome.storage.local.get(keysToFetch);
    data.configs = storageResult;
    configsCount = Object.keys(storageResult).length;
  }

  // 2. Collect Profile Vault
  let hasProfileVault = false;
  if (scope.includeProfileVault) {
    const vaultRes = await chrome.storage.local.get('sam_agent_profile_vault_v1');
    if (vaultRes.sam_agent_profile_vault_v1) {
      data.profileVault = vaultRes.sam_agent_profile_vault_v1;
      hasProfileVault = true;
    }
  }

  // 3. Collect Scheduled Tasks
  let scheduledTasksCount = 0;
  if (scope.includeSchedules) {
    const schedRes = await chrome.storage.local.get('sam_agent_scheduled_tasks_v1');
    if (Array.isArray(schedRes.sam_agent_scheduled_tasks_v1)) {
      data.scheduledTasks = schedRes.sam_agent_scheduled_tasks_v1;
      scheduledTasksCount = data.scheduledTasks.length;
    }
  }

  // 4. Collect Dexie DB Tables
  let threadsCount = 0;
  if (scope.includeThreads) {
    data.threads = await db.threads.toArray();
    threadsCount = data.threads.length;
  }

  let vfsCount = 0;
  if (scope.includeVfs) {
    data.vfsFiles = await db.files.toArray();
    data.fileChunks = await db.fileChunks.toArray();
    vfsCount = data.vfsFiles.length;
  }

  let episodicCount = 0;
  let domainCount = 0;
  if (scope.includeMemories) {
    data.episodicMemories = await db.memories.toArray();
    data.domainMemories = await db.domainMemory.toArray();
    episodicCount = data.episodicMemories.length;
    domainCount = data.domainMemories.length;
  }

  const manifest: BackupArchiveManifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: '4.5.1',
    createdAt: new Date().toISOString(),
    scope,
    encrypted: Boolean(password && password.trim().length > 0),
    itemCounts: {
      threads: threadsCount,
      vfsFiles: vfsCount,
      episodicMemories: episodicCount,
      domainMemories: domainCount,
      scheduledTasks: scheduledTasksCount,
      hasProfileVault,
      configsCount,
    },
  };

  const payload: BackupArchivePayload = {
    manifest,
    data,
  };

  let finalOutput: string;
  let filenameSuffix = manifest.encrypted ? 'encrypted.json' : 'json';
  const filename = `sam_agent_backup_${dateStr}.${filenameSuffix}`;

  if (manifest.encrypted && password) {
    const encryptedArchive = await encryptArchive(payload, password);
    finalOutput = JSON.stringify(encryptedArchive, null, 2);
  } else {
    finalOutput = JSON.stringify(payload, null, 2);
  }

  return {
    jsonString: finalOutput,
    filename,
    manifest,
  };
}

/**
 * Initiates user browser download of the backup archive file.
 */
export async function downloadBackupArchive(
  scope: BackupScopeOptions,
  password?: string
): Promise<BackupArchiveManifest> {
  const { jsonString, filename, manifest } = await createBackupArchive(scope, password);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  triggerBlobDownload(blob, filename);
  return manifest;
}

/**
 * Saves a backup file directly into the agent's Virtual File System (/workspace).
 */
export async function saveBackupToVfs(
  scope: BackupScopeOptions,
  customPath?: string
): Promise<{ path: string; manifest: BackupArchiveManifest }> {
  const { jsonString, filename, manifest } = await createBackupArchive(scope);
  const vfsPath = customPath || `/workspace/${filename}`;
  await saveVfsFile(vfsPath, jsonString, 'application/json;charset=utf-8');
  return { path: vfsPath, manifest };
}

// --- Import & Restore Functionality ---

/**
 * Validates and previews a backup JSON file before restoration.
 */
export async function inspectBackupFile(fileContent: string): Promise<RestorePreview> {
  if (!fileContent || fileContent.trim().length === 0) {
    return { valid: false, isEncrypted: false, error: 'Berkas cadangan kosong.' };
  }

  try {
    const parsed = JSON.parse(fileContent);

    if (!parsed || typeof parsed !== 'object' || !parsed.manifest) {
      return {
        valid: false,
        isEncrypted: false,
        error: 'Format berkas tidak valid: manifes cadangan SAM-Agent tidak ditemukan.',
      };
    }

    const manifest = parsed.manifest as BackupArchiveManifest;
    if (manifest.schemaVersion > BACKUP_SCHEMA_VERSION) {
      return {
        valid: false,
        isEncrypted: manifest.encrypted,
        error: `Versi skema cadangan (${manifest.schemaVersion}) lebih baru dari versi ekstensi ini. Harap perbarui SAM-Agent terlebih dahulu.`,
      };
    }

    if (parsed.encrypted === true || manifest.encrypted === true) {
      return {
        valid: true,
        isEncrypted: true,
        manifest,
        rawArchive: parsed,
      };
    }

    if (!parsed.data || typeof parsed.data !== 'object') {
      return {
        valid: false,
        isEncrypted: false,
        error: 'Payload data cadangan tidak ditemukan di dalam berkas.',
      };
    }

    return {
      valid: true,
      isEncrypted: false,
      manifest,
      rawArchive: parsed as BackupArchivePayload,
    };
  } catch (err: any) {
    return {
      valid: false,
      isEncrypted: false,
      error: `Gagal membaca format JSON: ${err.message}`,
    };
  }
}

/**
 * Unlocks an encrypted backup archive with user password.
 */
export async function unlockBackupArchive(
  encryptedArchive: EncryptedBackupArchive,
  password: string
): Promise<BackupArchivePayload> {
  return decryptArchive(encryptedArchive, password);
}

/**
 * Restores data from a validated BackupArchivePayload.
 *
 * @param payload The decrypted or plain backup archive
 * @param mode 'merge' preserves existing unique records; 'overwrite' wipes and replaces the specified categories.
 */
export async function restoreBackupData(
  payload: BackupArchivePayload,
  mode: 'merge' | 'overwrite' = 'merge'
): Promise<RestoreResult> {
  const { data } = payload;
  const stats = {
    threads: 0,
    vfsFiles: 0,
    episodicMemories: 0,
    domainMemories: 0,
    scheduledTasks: 0,
    configs: 0,
  };

  try {
    // 1. Restore Configurations
    if (data.configs && Object.keys(data.configs).length > 0) {
      await chrome.storage.local.set(data.configs);
      stats.configs = Object.keys(data.configs).length;
    }

    // 2. Restore Profile Vault
    if (data.profileVault) {
      await chrome.storage.local.set({ sam_agent_profile_vault_v1: data.profileVault });
    }

    // 3. Restore Scheduled Tasks
    if (Array.isArray(data.scheduledTasks) && data.scheduledTasks.length > 0) {
      if (mode === 'overwrite') {
        await chrome.storage.local.set({ sam_agent_scheduled_tasks_v1: data.scheduledTasks });
        stats.scheduledTasks = data.scheduledTasks.length;
      } else {
        const curRes = await chrome.storage.local.get('sam_agent_scheduled_tasks_v1');
        const existing: any[] = Array.isArray(curRes.sam_agent_scheduled_tasks_v1)
          ? curRes.sam_agent_scheduled_tasks_v1
          : [];
        const existingIds = new Set(existing.map((t) => t.id));
        const merged = [...existing];

        for (const task of data.scheduledTasks) {
          if (!existingIds.has(task.id)) {
            merged.push(task);
            stats.scheduledTasks++;
          }
        }
        await chrome.storage.local.set({ sam_agent_scheduled_tasks_v1: merged });
      }
    }

    // 4. Restore Dexie DB: Threads
    if (Array.isArray(data.threads) && data.threads.length > 0) {
      if (mode === 'overwrite') {
        await db.threads.clear();
        await db.threads.bulkPut(data.threads);
        stats.threads = data.threads.length;
      } else {
        await db.threads.bulkPut(data.threads);
        stats.threads = data.threads.length;
      }
    }

    // 5. Restore Dexie DB: VFS Files
    if (Array.isArray(data.vfsFiles) && data.vfsFiles.length > 0) {
      if (mode === 'overwrite') {
        await db.files.clear();
        await db.files.bulkPut(data.vfsFiles);
        stats.vfsFiles = data.vfsFiles.length;
      } else {
        await db.files.bulkPut(data.vfsFiles);
        stats.vfsFiles = data.vfsFiles.length;
      }

      if (Array.isArray(data.fileChunks) && data.fileChunks.length > 0) {
        if (mode === 'overwrite') {
          await db.fileChunks.clear();
        }
        await db.fileChunks.bulkPut(data.fileChunks);
      }
    }

    // 6. Restore Dexie DB: Episodic & Semantic Memories
    if (Array.isArray(data.episodicMemories) && data.episodicMemories.length > 0) {
      if (mode === 'overwrite') {
        await db.memories.clear();
      }
      await db.memories.bulkPut(data.episodicMemories);
      stats.episodicMemories = data.episodicMemories.length;
    }

    // 7. Restore Dexie DB: Domain Learning Memory
    if (Array.isArray(data.domainMemories) && data.domainMemories.length > 0) {
      if (mode === 'overwrite') {
        await db.domainMemory.clear();
      }
      await db.domainMemory.bulkPut(data.domainMemories);
      stats.domainMemories = data.domainMemories.length;
    }

    return {
      success: true,
      message: `Pemulihan data berhasil (${mode === 'merge' ? 'Penggabungan' : 'Timpa Bersih'}).`,
      restoredCounts: stats,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal memulihkan data: ${err.message}`,
      restoredCounts: stats,
    };
  }
}

/**
 * Factory Reset: Safely wipes local databases and resets settings to default.
 */
export async function executeFactoryReset(): Promise<void> {
  // Clear Dexie tables
  await Promise.all([
    db.threads.clear(),
    db.files.clear(),
    db.fileChunks.clear(),
    db.memories.clear(),
    db.domainMemory.clear(),
    db.handles.clear(),
  ]);

  // Clear chrome.storage.local
  await chrome.storage.local.clear();
}
