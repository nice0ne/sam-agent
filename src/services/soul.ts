import { getVfsFile, saveVfsFile } from './vfs';

export const DEFAULT_SOUL_CONTENT = `# SOUL.MD - Agent Persona & Behavioral Directives
# This file governs the identity, style, and working principles of your AI Agent.

- **Name:** SAM-Agent
- **Identity:** Autonomous Browser Agent & AI Pair Programmer
- **Tone:** Concise, direct, pragmatic, and helpful
- **Language:** Matches the user's primary language (Bahasa Indonesia / English)

## Core Directives & Principles:
1. **Action-First Mentality:** Prioritize direct browser actions over lengthy explanations or redundant confirmations.
2. **Robust Input Handling:** For web chat forms (e.g. ChatGPT, Claude, Gemini), prioritize active selectors like \`#prompt-textarea\` with verified submission.
3. **Observation Economy:** In multi-step loops, summarize findings compactly to preserve context and token limits.
4. **Safety & Integrity:** Never modify readonly/disabled elements, and cleanly conclude tasks once user goals are met.
`;

export const SOUL_STORAGE_KEY = 'agentSoul';
export const RTK_STORAGE_KEY = 'enableRtk';
export const PONYTAIL_STORAGE_KEY = 'enablePonytail';

/**
 * Get current agent soul content from VFS or storage, prioritizing VFS /soul.md
 */
export async function getAgentSoul(): Promise<string> {
  try {
    // 1. Prioritize reading from VFS (/soul.md, /SOUL.md, etc.)
    const vfsCandidates = ['/soul.md', '/SOUL.md', '/SOUL.MD', '/workspace/soul.md', '/workspace/SOUL.md'];
    for (const cand of vfsCandidates) {
      const vfsSoul = await getVfsFile(cand);
      if (vfsSoul?.content && vfsSoul.content.trim().length > 0) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ [SOUL_STORAGE_KEY]: vfsSoul.content });
        }
        return vfsSoul.content;
      }
    }

    // 2. Fallback to chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(SOUL_STORAGE_KEY);
      if (data && typeof data[SOUL_STORAGE_KEY] === 'string' && data[SOUL_STORAGE_KEY].trim().length > 0) {
        return data[SOUL_STORAGE_KEY];
      }
    }
  } catch (err) {
    console.warn('[Soul] Failed to read soul:', err);
  }

  // 3. Initialize with default
  await saveAgentSoul(DEFAULT_SOUL_CONTENT);
  return DEFAULT_SOUL_CONTENT;
}

/**
 * Save agent soul content to both chrome.storage and VFS (/soul.md)
 */
export async function saveAgentSoul(content: string): Promise<void> {
  const cleanContent = content.trim() ? content : DEFAULT_SOUL_CONTENT;
  await chrome.storage.local.set({ [SOUL_STORAGE_KEY]: cleanContent });
  try {
    await saveVfsFile('/soul.md', cleanContent, 'text/markdown');
  } catch (err) {
    console.warn('[Soul] Failed to sync to VFS /soul.md:', err);
  }
}

/**
 * Reset agent soul content to default
 */
export async function resetAgentSoul(): Promise<string> {
  await saveAgentSoul(DEFAULT_SOUL_CONTENT);
  return DEFAULT_SOUL_CONTENT;
}

/**
 * Optimization Preferences (RTK & Ponytail)
 */
export interface OptimizationSettings {
  enableRtk: boolean;
  enablePonytail: boolean;
}

export async function getOptimizationSettings(): Promise<OptimizationSettings> {
  try {
    const data = await chrome.storage.local.get([RTK_STORAGE_KEY, PONYTAIL_STORAGE_KEY]);
    return {
      enableRtk: data[RTK_STORAGE_KEY] !== undefined ? Boolean(data[RTK_STORAGE_KEY]) : true,
      enablePonytail: data[PONYTAIL_STORAGE_KEY] !== undefined ? Boolean(data[PONYTAIL_STORAGE_KEY]) : true,
    };
  } catch (_) {
    return { enableRtk: true, enablePonytail: true };
  }
}

export async function saveOptimizationSettings(settings: Partial<OptimizationSettings>): Promise<void> {
  const updates: Record<string, boolean> = {};
  if (settings.enableRtk !== undefined) updates[RTK_STORAGE_KEY] = settings.enableRtk;
  if (settings.enablePonytail !== undefined) updates[PONYTAIL_STORAGE_KEY] = settings.enablePonytail;
  await chrome.storage.local.set(updates);
}

export interface ImageItem {
  data: string;
  mimeType: string;
  url?: string;
}

export interface MessageItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ImageItem[];
}

/**
 * RTK (Round-Trip Knowledge) Pruning:
 * Trims verbose previous action JSON blocks and redundant DOM dumps from earlier turns,
 * replacing them with high-density compact status ledgers to conserve up to 60% tokens.
 */
export function applyRtkPruning(messages: MessageItem[]): MessageItem[] {
  if (messages.length <= 2) return messages;

  return messages.map((m, idx) => {
    // Keep the very latest user observation and latest assistant response untouched
    if (idx >= messages.length - 2) return m;

    let content = m.content;

    // Prune raw action blocks in older messages down to compact summaries
    if (m.role === 'assistant' && (content.includes('```action') || content.includes('```json'))) {
      content = content.replace(/```(?:action|json)[\s\S]*?```/g, (match) => {
        const lines = match.split('\n').filter((l) => l.trim().length > 0);
        // Extract actions concisely
        const actions = lines
          .filter((l) => l.includes('"action":'))
          .map((l) => l.replace(/.*"action":\s*"([^"]+)".*/, '$1'))
          .join(', ');
        return `[RTK: Executed action (${actions || 'browser step'}) completed]`;
      });
    }

    // Prune excessive observation dumps in older user turns
    if (m.role === 'user' && content.includes('[Observation / Results from Step')) {
      const parts = content.split('\n\n');
      // Keep only first 2 summary lines and strip heavy repetitive prompt suffixes
      const summaryHeader = parts[0] || '';
      content = `${summaryHeader}\n[RTK: Step outcome archived]`;
    }

    // For turns older than the last 2 turns, prune images to avoid token bloat
    return {
      role: m.role,
      content,
      images: undefined,
    };
  });
}

/**
 * Ponytail Context Compression (Head-Tail Compression):
 * Keeps the initial user goal (Head) and recent turns (Tail) 100% intact,
 * while compressing the middle interaction turns into an ultra-concise recap.
 */
export function applyPonytailCompression(
  messages: MessageItem[],
  maxKeepTail = 3
): MessageItem[] {
  // If conversation is short, no compression needed
  if (messages.length <= 5) return messages;

  const head = messages[0]; // Initial user intent / command
  const tail = messages.slice(-maxKeepTail); // 2-3 most recent turns + observations
  const middle = messages.slice(1, -maxKeepTail);

  if (middle.length === 0) return messages;

  // Synthesize middle history into a concise checkpoint
  const summaryBullets: string[] = [];
  let stepCounter = 1;

  for (const item of middle) {
    if (item.role === 'assistant') {
      const snippet = item.content.slice(0, 100).replace(/\n/g, ' ').trim();
      if (snippet) {
        summaryBullets.push(`- Step ${stepCounter}: ${snippet}...`);
        stepCounter++;
      }
    }
  }

  const compressionBlock: MessageItem = {
    role: 'assistant',
    content: `[Ponytail Context Compression: ${middle.length} intermediary turns condensed]\nKey actions taken:\n${summaryBullets.slice(-6).join('\n') || '- Processed intermediate steps successfully.'}\n[Ready to continue with current state.]`,
  };

  return [head, compressionBlock, ...tail];
}
