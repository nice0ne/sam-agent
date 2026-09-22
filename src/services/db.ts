import Dexie, { type Table } from 'dexie';
import type {
  ThreadRecord,
  ThreadMessage,
  DomainMemoryRecord,
  VfsFileRecord,
  StoredHandleRecord,
  AgentMemoryRecord,
} from '../types/agent';

export class AgentDatabase extends Dexie {
  threads!: Table<ThreadRecord, string>;
  domainMemory!: Table<DomainMemoryRecord, string>;
  files!: Table<VfsFileRecord, string>;
  handles!: Table<StoredHandleRecord, string>;
  memories!: Table<AgentMemoryRecord, string>;

  constructor() {
    super('IctAgentDB');
    this.version(1).stores({
      threads: 'id, title, createdAt, updatedAt',
    });
    this.version(2).stores({
      threads: 'id, title, createdAt, updatedAt',
      domainMemory: 'domain, updatedAt',
    });
    this.version(3).stores({
      threads: 'id, title, createdAt, updatedAt',
      domainMemory: 'domain, updatedAt',
      files: 'path, name, mimeType, size, updatedAt',
    });
    this.version(4).stores({
      threads: 'id, title, createdAt, updatedAt',
      domainMemory: 'domain, updatedAt',
      files: 'path, name, mimeType, size, updatedAt',
      handles: 'id, name, mountedAt',
    });
    this.version(5).stores({
      threads: 'id, title, createdAt, updatedAt',
      domainMemory: 'domain, updatedAt',
      files: 'path, name, mimeType, size, updatedAt',
      handles: 'id, name, mountedAt',
      memories: 'id, category, createdAt, lastAccessedAt, accessCount',
    });
  }
}

export const db = new AgentDatabase();

export async function createThread(id: string, initialTitle = 'New conversation...'): Promise<ThreadRecord> {
  const now = Date.now();
  const thread: ThreadRecord = {
    id,
    title: initialTitle,
    createdAt: now,
    updatedAt: now,
    messages: [],
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
  await db.threads.put(thread);
  return thread;
}

export async function appendMessageToThread(threadId: string, message: ThreadMessage): Promise<void> {
  await db.transaction('rw', db.threads, async () => {
    const thread = await db.threads.get(threadId);
    if (!thread) return;
    thread.messages.push(message);
    thread.updatedAt = Date.now();
    await db.threads.put(thread);
  });
}

export async function deleteThread(threadId: string): Promise<void> {
  await db.threads.delete(threadId);
}

export async function clearAllThreads(): Promise<void> {
  await db.threads.clear();
}

export async function updateThreadTitle(threadId: string, title: string): Promise<void> {
  await db.threads.update(threadId, { title, updatedAt: Date.now() });
}

// ==============================================================
// Domain Memory & Autonomous Self-Improvement Persistence
// ==============================================================

export async function getDomainMemory(domain: string): Promise<DomainMemoryRecord | undefined> {
  try {
    return await db.domainMemory.get(domain);
  } catch (err) {
    console.warn('[db] Failed to get domain memory:', err);
    return undefined;
  }
}

export async function saveDomainMemory(memory: DomainMemoryRecord): Promise<void> {
  try {
    await db.domainMemory.put(memory);
  } catch (err) {
    console.warn('[db] Failed to save domain memory:', err);
  }
}

export async function recordDomainLearning(
  domain: string,
  pageTitle: string | undefined,
  learning: {
    selectorMap?: Record<string, string>;
    editorTypeMap?: Record<string, string>;
    caveat?: string;
    success?: boolean;
  }
): Promise<void> {
  try {
    const existing = (await db.domainMemory.get(domain)) || {
      domain,
      title: pageTitle,
      formSelectors: {},
      verifiedEditorTypes: {},
      successfulActionsCount: 0,
      failedActionsCount: 0,
      learnedCaveats: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (pageTitle && !existing.title) {
      existing.title = pageTitle;
    }

    if (learning.selectorMap) {
      existing.formSelectors = { ...existing.formSelectors, ...learning.selectorMap };
    }

    if (learning.editorTypeMap) {
      existing.verifiedEditorTypes = { ...existing.verifiedEditorTypes, ...learning.editorTypeMap };
    }

    if (learning.caveat && !existing.learnedCaveats.includes(learning.caveat)) {
      existing.learnedCaveats.push(learning.caveat);
      if (existing.learnedCaveats.length > 20) {
        existing.learnedCaveats = existing.learnedCaveats.slice(-20);
      }
    }

    if (learning.success !== undefined) {
      if (learning.success) {
        existing.successfulActionsCount += 1;
      } else {
        existing.failedActionsCount += 1;
      }
    }

    existing.updatedAt = Date.now();
    await db.domainMemory.put(existing);
  } catch (err) {
    console.warn('[db] Failed to record domain learning:', err);
  }
}

export async function getAllDomainMemories(): Promise<DomainMemoryRecord[]> {
  try {
    return await db.domainMemory.orderBy('updatedAt').reverse().toArray();
  } catch (err) {
    return [];
  }
}

export async function clearDomainMemories(): Promise<void> {
  try {
    await db.domainMemory.clear();
  } catch (err) {
    console.warn('[db] Failed to clear domain memories:', err);
  }
}

