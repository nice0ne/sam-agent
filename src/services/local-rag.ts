import { db } from './db';
import { getVfsFile } from './vfs';
import { extractKeywords } from './semantic-memory';
import type { FileChunkRecord } from '../types/agent';

const DEFAULT_WORDS_PER_CHUNK = 400;
const DEFAULT_OVERLAP_WORDS = 50;

/**
 * Smart Text Chunker: Splits document into semantic chunks with overlap.
 * Respects paragraph boundaries and Markdown headings where possible.
 */
export function splitIntoSmartChunks(
  text: string,
  maxWords = DEFAULT_WORDS_PER_CHUNK,
  overlapWords = DEFAULT_OVERLAP_WORDS
): string[] {
  if (!text || text.trim().length === 0) return [];

  // 1. Split into paragraphs
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentChunkWords: string[] = [];

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(Boolean);

    // If a single paragraph exceeds maxWords, split it by sentence or hard word boundary
    if (paraWords.length > maxWords) {
      if (currentChunkWords.length > 0) {
        chunks.push(currentChunkWords.join(' '));
        // Keep overlap from end of current chunk
        currentChunkWords = currentChunkWords.slice(-overlapWords);
      }

      for (let i = 0; i < paraWords.length; i += maxWords - overlapWords) {
        const slice = paraWords.slice(i, i + maxWords);
        chunks.push(slice.join(' '));
      }
      currentChunkWords = [];
      continue;
    }

    if (currentChunkWords.length + paraWords.length > maxWords) {
      chunks.push(currentChunkWords.join(' '));
      // Overlap from previous chunk
      currentChunkWords = [...currentChunkWords.slice(-overlapWords), ...paraWords];
    } else {
      currentChunkWords.push(...paraWords);
    }
  }

  if (currentChunkWords.length > 0) {
    chunks.push(currentChunkWords.join(' '));
  }

  return chunks.filter((c) => c.trim().length > 0);
}

/**
 * Index a text document into IndexedDB fileChunks table with caching.
 */
export async function indexFileContent(
  filePath: string,
  textContent: string,
  updatedAt: number = Date.now()
): Promise<{ chunkCount: number }> {
  const normPath = filePath.startsWith('/') ? filePath : `/${filePath}`;

  // 1. Check existing cached chunks for this file
  const existing = await db.fileChunks.where('filePath').equals(normPath).toArray();
  if (existing.length > 0 && existing[0].updatedAt >= updatedAt) {
    return { chunkCount: existing.length };
  }

  // 2. Clear old chunks for this file
  await db.fileChunks.where('filePath').equals(normPath).delete();

  // 3. Generate smart chunks
  const chunks = splitIntoSmartChunks(textContent);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  const records: FileChunkRecord[] = chunks.map((chunkText, idx) => ({
    id: `${normPath}#chunk-${idx}`,
    filePath: normPath,
    chunkIndex: idx,
    totalChunks: chunks.length,
    content: chunkText,
    wordCount: chunkText.split(/\s+/).length,
    keywords: extractKeywords(chunkText),
    updatedAt,
  }));

  await db.fileChunks.bulkPut(records);
  return { chunkCount: records.length };
}

/**
 * Search relevant chunks for a specific file or across VFS files using BM25 scoring.
 */
export async function searchFileChunks(
  filePath: string,
  query: string,
  topK = 4
): Promise<FileChunkRecord[]> {
  const normPath = filePath ? (filePath.startsWith('/') ? filePath : `/${filePath}`) : '';
  const queryTokens = extractKeywords(query);

  let candidateChunks: FileChunkRecord[] = [];
  if (normPath) {
    // Check if file is already indexed
    candidateChunks = await db.fileChunks.where('filePath').equals(normPath).toArray();

    // If not indexed yet, check VFS to index it on-the-fly!
    if (candidateChunks.length === 0) {
      const vfsFile = await getVfsFile(normPath);
      if (vfsFile?.content && typeof vfsFile.content === 'string') {
        const { chunkCount } = await indexFileContent(normPath, vfsFile.content, vfsFile.updatedAt);
        if (chunkCount > 0) {
          candidateChunks = await db.fileChunks.where('filePath').equals(normPath).toArray();
        }
      }
    }
  } else {
    // Across all VFS indexed files
    candidateChunks = await db.fileChunks.toArray();
  }

  if (candidateChunks.length === 0) return [];

  // Check if query is asking for a global summary / overview
  const isGlobalSummaryQuery = /summary|ringkasan|ikhtisar|garis besar|overview|jelaskan isi|rangkum/i.test(query);

  if (isGlobalSummaryQuery && candidateChunks.length > topK) {
    // Hierarchical sampling: Take opening chunk, middle representative chunk(s), and conclusion chunk
    const sampled: FileChunkRecord[] = [];
    sampled.push(candidateChunks[0]); // intro
    const step = Math.floor(candidateChunks.length / (topK - 1));
    for (let i = 1; i < topK - 1; i++) {
      sampled.push(candidateChunks[Math.min(i * step, candidateChunks.length - 2)]);
    }
    sampled.push(candidateChunks[candidateChunks.length - 1]); // conclusion
    return sampled;
  }

  const queryTokenSet = new Set(queryTokens);

  // BM25-style lexical scoring
  const scored = candidateChunks.map((chunk) => {
    let score = 0;
    const chunkTokens = chunk.keywords || [];

    for (const token of chunkTokens) {
      if (queryTokenSet.has(token)) {
        score += 2.0;
      }
    }

    // Direct substring phrase match boost
    if (query.length > 5 && chunk.content.toLowerCase().includes(query.toLowerCase())) {
      score += 4.0;
    }

    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

/**
 * Format retrieved chunks into a prompt excerpt for LLM observations.
 */
export async function formatRagSearchPrompt(
  filePath: string,
  query: string,
  topK = 4
): Promise<string> {
  const chunks = await searchFileChunks(filePath, query, topK);
  if (chunks.length === 0) {
    return `No matching excerpts found in "${filePath}" for query: "${query}". Try broadening your keywords.`;
  }

  const total = chunks[0]?.totalChunks || chunks.length;
  const formattedExcerpts = chunks.map((c) => {
    return `--- [Excerpt from ${c.filePath} | Section ${c.chunkIndex + 1} of ${total} (~${c.wordCount} words)] ---\n${c.content}\n--- [End Excerpt] ---`;
  });

  return `### RETRIEVED RELEVANT EXCERPTS (CHUNKED RAG):\n${formattedExcerpts.join('\n\n')}`;
}

/**
 * Delete cached chunks when file is deleted from VFS.
 */
export async function deleteFileChunks(filePath: string): Promise<void> {
  const normPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  await db.fileChunks.where('filePath').equals(normPath).delete();
}
