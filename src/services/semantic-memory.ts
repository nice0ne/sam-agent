import { db } from './db';
import type { AgentMemoryRecord } from '../types/agent';

const COMMON_STOPWORDS = new Set([
  // Indonesian
  'dan', 'di', 'ke', 'dari', 'yang', 'untuk', 'pada', 'adalah', 'ini', 'itu', 'dengan',
  'saya', 'kamu', 'anda', 'dia', 'mereka', 'kita', 'kami', 'bisa', 'akan', 'ada', 'jika',
  'atau', 'karena', 'agar', 'namun', 'juga', 'sudah', 'telah', 'saat', 'ketika', 'dalam',
  // English
  'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of', 'with',
  'it', 'that', 'this', 'you', 'i', 'we', 'they', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'but', 'by', 'from', 'as', 'if', 'or',
]);

/**
 * Tokenize text into lowercased alphanumeric keywords, filtering stopwords.
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !COMMON_STOPWORDS.has(w));
}

/**
 * Calculate Jaccard / Overlap similarity between two token sets.
 */
function calculateSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  let matches = 0;
  for (const token of tokensB) {
    if (setA.has(token)) matches++;
  }
  return matches / Math.sqrt(tokensA.length * tokensB.length);
}

/**
 * Store a new memory item or update existing if highly similar.
 */
export async function addMemory(
  content: string,
  category: AgentMemoryRecord['category'] = 'fact',
  sourceThreadId?: string,
  sourceUrl?: string
): Promise<AgentMemoryRecord> {
  const cleanContent = content.trim();
  const keywords = extractKeywords(cleanContent);
  const now = Date.now();

  // Deduplication check: check if an existing memory has >= 0.85 similarity
  const all = await db.memories.toArray();
  const existing = all.find((m) => calculateSimilarity(m.keywords, keywords) >= 0.85);

  if (existing) {
    existing.content = cleanContent;
    existing.keywords = Array.from(new Set([...existing.keywords, ...keywords]));
    existing.lastAccessedAt = now;
    existing.accessCount = (existing.accessCount || 1) + 1;
    if (sourceThreadId) existing.sourceThreadId = sourceThreadId;
    if (sourceUrl) existing.sourceUrl = sourceUrl;
    await db.memories.put(existing);
    return existing;
  }

  const record: AgentMemoryRecord = {
    id: crypto.randomUUID(),
    category,
    content: cleanContent,
    keywords,
    sourceThreadId,
    sourceUrl,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 1,
  };

  await db.memories.put(record);
  return record;
}

/**
 * Retrieve top relevant memories matching a prompt using BM25-style local scoring.
 */
export async function searchMemories(query: string, maxResults = 4): Promise<AgentMemoryRecord[]> {
  const queryTokens = extractKeywords(query);
  if (queryTokens.length === 0) return [];

  const memories = await db.memories.toArray();
  if (memories.length === 0) return [];

  const now = Date.now();
  const queryTokenSet = new Set(queryTokens);

  // Score each memory
  const scored = memories.map((mem) => {
    let matchScore = 0;
    const memTokens = mem.keywords.length > 0 ? mem.keywords : extractKeywords(mem.content);

    for (const token of memTokens) {
      if (queryTokenSet.has(token)) {
        matchScore += 1.5;
      }
    }

    // Direct substring bonus
    if (query.toLowerCase().includes(mem.content.toLowerCase().slice(0, 30))) {
      matchScore += 3.0;
    }

    // Recency boost (up to 1.0 for items accessed within last 7 days)
    const daysSinceAccess = (now - (mem.lastAccessedAt || mem.createdAt)) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 1 - daysSinceAccess / 7);

    // Frequency boost
    const frequencyBoost = Math.min(1.0, (mem.accessCount || 1) * 0.1);

    const totalScore = matchScore + recencyBoost * 0.5 + frequencyBoost * 0.3;
    return { mem, totalScore, matchScore };
  });

  // Filter only items with at least some lexical relevance
  const relevant = scored
    .filter((s) => s.matchScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, maxResults)
    .map((s) => s.mem);

  // Update access stats asynchronously
  if (relevant.length > 0) {
    for (const m of relevant) {
      m.lastAccessedAt = now;
      m.accessCount = (m.accessCount || 1) + 1;
      db.memories.put(m).catch(() => {});
    }
  }

  return relevant;
}

/**
 * Get all stored memories sorted by last accessed date.
 */
export async function listAllMemories(): Promise<AgentMemoryRecord[]> {
  return (await db.memories.toArray()).sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
}

/**
 * Delete a specific memory item by ID.
 */
export async function deleteMemory(id: string): Promise<void> {
  await db.memories.delete(id);
}

/**
 * Clear all episodic memories.
 */
export async function clearAllMemories(): Promise<void> {
  await db.memories.clear();
}

/**
 * Format relevant memories into a concise prompt chunk for LLM system instructions.
 */
export async function formatRelevantMemoriesPrompt(query: string): Promise<string> {
  try {
    const relevant = await searchMemories(query, 4);
    if (relevant.length === 0) return '';

    const lines = relevant.map((m) => `- [${m.category.toUpperCase()}]: ${m.content}`);
    return `### EPISODIC & SEMANTIC MEMORY (PREVIOUSLY LEARNED FACTS & PREFERENCES):
You remember the following verified context across conversations:
${lines.join('\n')}
(Keep these preferences and instructions in mind when assisting the user without explicitly mentioning this internal memory block unless relevant).`;
  } catch (err) {
    console.warn('[SemanticMemory] Failed to format memories prompt:', err);
    return '';
  }
}
