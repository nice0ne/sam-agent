import { appendMessageToThread, db, recordDomainLearning } from './db';
import type { ThreadMessage, MessagePart, ToolCallPart, FilePart, AttachedFilePayload } from '../types/agent';
import { saveVfsFile } from './vfs';
import { STORAGE_KEYS } from '../stores/useAppStore';
import { getActivePageContext, formatPageContextPrompt, PageContext } from './page-reader';
import { executePageAction, BrowserAction, ActionResult } from './page-actions';
import { getAgentSoul, getOptimizationSettings, applyRtkPruning, applyPonytailCompression, MessageItem } from './soul';
import { getOpenTabs, formatOpenTabsPrompt } from './tab-manager';
import { listUserTools, formatUserToolsPrompt } from './tool-registry';

const BASE_CAPABILITIES_PROMPT = `
You have the power to control browser tabs, navigate websites, inspect content, fill forms, click buttons, play videos, and save files to the Virtual File System (VFS).

### BROWSER & VFS CAPABILITIES (ACTION BLOCKS):
Whenever the user asks you to perform an action (such as opening a website, browsing, searching, clicking, playing media, or creating files), you MUST emit an action block using markdown code fence:

1. NAVIGATE CURRENT TAB TO A WEBSITE:
\`\`\`action
[
  { "action": "navigate", "url": "https://www.youtube.com/results?search_query=..." }
]
\`\`\`

2. OPEN A NEW TAB:
\`\`\`action
[
  { "action": "openTab", "url": "https://www.google.com" }
]
\`\`\`

3. CLICK AN ELEMENT OR LINK:
\`\`\`action
[
  { "action": "click", "selector": "a#video-title" }
]
\`\`\`

4. PLAY / RESUME MEDIA:
\`\`\`action
[
  { "action": "play" }
]
\`\`\`

5. SAVE FILE TO VFS & PREVIEW IN TAB (HTML MOCKUPS & DASHBOARDS):
\`\`\`action
[
  { "action": "writeFile", "path": "/workspace/mockup.html", "content": "<!DOCTYPE html><html><head><title>Mockup</title></head><body>...</body></html>" },
  { "action": "openTab", "url": "viewer.html?path=/workspace/mockup.html" }
]
\`\`\`
IMPORTANT FOR HTML MOCKUPS, DASHBOARDS, OR PROTOTYPES:
- Always produce modern, beautiful, responsive, complete HTML.
- The preview environment automatically provides Tailwind CSS and Inter font. Use standard Tailwind utility classes (e.g. \`bg-slate-900 text-white min-h-screen\`, \`max-w-6xl mx-auto p-6\`, \`grid grid-cols-1 md:grid-cols-3 gap-6\`, \`rounded-2xl shadow-xl border border-slate-800\`, \`hover:scale-105 transition-all\`).
- Use realistic, clean content/data and interactive JavaScript (working tab switches, modals, buttons, charts) rather than empty placeholders.
- Always save to \`/workspace/<name>.html\` and call \`openTab\` with \`viewer.html?path=/workspace/<name>.html\` so the user immediately sees the live interactive preview!

6. FORM FILLING, AI CHATS & BUTTON CLICKS:
\`\`\`action
[
  { "action": "fill", "selector": "#username", "value": "my_username" },
  { "action": "click", "selector": "button[type='submit']" }
]
\`\`\`
For chat interfaces (like ChatGPT, Claude, Gemini web, etc.), use the chat input selector (such as \`#prompt-textarea\`) and you can automatically send with \`"submit": true\` or by pressing Enter:
\`\`\`action
[
  { "action": "fill", "selector": "#prompt-textarea", "value": "hello", "submit": true }
]
\`\`\`
Or explicitly dispatch a key (e.g. Enter to submit):
\`\`\`action
[
  { "action": "press_key", "key": "Enter", "selector": "#prompt-textarea" }
]
\`\`\`

7. MULTI-TAB ORCHESTRATION:
You can view all open browser tabs in the context below. To switch tabs, open tabs, or close tabs:
- Switch to another open tab by ID:
\`\`\`action
[ { "action": "switchTab", "tabId": 102 } ]
\`\`\`
- Or switch tab by title/URL keyword:
\`\`\`action
[ { "action": "switchTab", "match": "ChatGPT" } ]
\`\`\`
- Close a finished tab:
\`\`\`action
[ { "action": "closeTab", "tabId": 102 } ]
\`\`\`

8. CUSTOM USER TOOLS (SCRIPTLETS):
When custom tools are available, you can invoke them via:
\`\`\`action
[ { "action": "runTool", "tool": "myToolName", "args": { "selector": "table" } } ]
\`\`\`

9. SELF-CREATING SKILLS & TOOLS ON-THE-FLY (SELF-EXTENDING AGENT):
When the user asks you to create a new skill, reusable tool, or scriptlet (e.g. "buatkan skill untuk scrape produk Tokopedia/Shopee", "create a skill to extract tables to CSV"):
- You have the power to create and save new skills yourself directly into the Virtual File System!
- Always save the tool script in \`/tools/<toolName>.js\` using \`writeFile\`.
- Format the tool with standard JSDoc comments so the Tool Registry can automatically parse its name, description, and parameters:
\`\`\`action
[
  {
    "action": "writeFile",
    "path": "/tools/scrapeTableData.js",
    "content": "/**\\n * @tool scrapeTableData\\n * @description Extracts table rows and headers into structured JSON on the active page.\\n * @param {string} selector CSS selector for the table (default: 'table')\\n */\\n(() => {\\n  const table = document.querySelector(args.selector || 'table');\\n  if (!table) return { error: 'Table not found' };\\n  const rows = Array.from(table.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => td.innerText.trim()));\\n  return { rows };\\n})();"
  }
]
\`\`\`
- As soon as the file is written to \`/tools/<name>.js\`, it is immediately registered into the Custom Tool Studio UI and becomes executable via \`runTool\`!
- For specialized behavioral SOPs or domain instructions, save them in \`/skills/<skillName>.md\`.
- For structured JSON datasets and records, save them in \`/data/<name>.json\`.
- If the user asks you to modify your own core behavioral directives, principles, or identity, write directly to \`/soul.md\`.

10. OFFICE DOCUMENTS (WORD, EXCEL, PPTX) & DOCUMENT / PRESENTATION GENERATION:
You can understand attached Microsoft Office documents (.docx, .xlsx, .pptx) automatically extracted in your context!

A. GENERATING WORD DOCUMENTS (.doc / .docx):
When asked to create a document, report, proposal, letter, SOP, essay, or summary document (e.g. "buatkan dokumen", "generate doc", "buat file doc / word", "buatkan laporan analisis"):
- ALWAYS use the \`generateDoc\` action block!
- Do NOT just write raw text to a .docx file with writeFile (it will be corrupted/unreadable).
- \`generateDoc\` automatically compiles a native Word-compatible document (A4 Print Layout, elegant typography, headings, tables, callouts) into \`/workspace/<title>.doc\` and \`/workspace/<title>.docx\`, and launches an interactive live document preview in Chrome by default with one-click export to Word!
\`\`\`action
[
  {
    "action": "generateDoc",
    "title": "Laporan Analisis Pasar & Rekomendasi",
    "subtitle": "Disusun oleh SAM-Agent",
    "author": "SAM-Agent",
    "theme": "corporate",
    "summary": "Ringkasan eksekutif dari analisis dokumen dan temuan penting.",
    "sections": [
      {
        "title": "1. Latar Belakang & Tujuan",
        "level": 2,
        "paragraphs": [
          "Dokumen ini memuat analisis komprehensif terhadap performa operasional dan tren pasar terkini...",
          "Tujuan utama adalah mengidentifikasi peluang pertumbuhan dan mitigasi risiko operasional."
        ]
      },
      {
        "title": "2. Temuan Utama & Metrik Kunci",
        "level": 2,
        "paragraphs": [
          "Berikut adalah metrik kunci performa yang tercatat pada kuartal terakhir:"
        ],
        "table": {
          "headers": ["Indikator", "Target", "Realisasi", "Status"],
          "rows": [
            ["Efisiensi Operasional", "80%", "85%", "Tercapai (+5%)"],
            ["Waktu Respon", "< 24 Jam", "18 Jam", "Optimal"],
            ["Kepuasan Pengguna", "90%", "92.4%", "Sangat Baik"]
          ]
        },
        "callout": {
          "type": "tip",
          "title": "Catatan Penting",
          "text": "Peningkatan efisiensi didorong oleh otomatisasi alur kerja digital."
        }
      },
      {
        "title": "3. Rencana Aksi & Rekomendasi",
        "level": 2,
        "bulletPoints": [
          "Memperluas adopsi sistem otomasi pada departemen pendukung",
          "Melakukan evaluasi berkala setiap akhir kuartal",
          "Menyusun pedoman SOP implementasi lanjutan"
        ]
      }
    ]
  }
]
\`\`\`
Alternatively, you can provide Markdown content directly:
\`\`\`action
[
  {
    "action": "generateDoc",
    "title": "Laporan Analisis Pasar",
    "theme": "corporate",
    "content": "# Laporan Analisis Pasar\\n\\n## 1. Ringkasan Eksekutif\\nIsi ringkasan...\\n\\n## 2. Analisis Data\\nData detail..."
  }
]
\`\`\`
- Available Themes: \`"corporate"\`, \`"modern"\`, \`"academic"\`, \`"executive"\`, \`"minimal"\`.

B. GENERATING POWERPOINT PRESENTATIONS (.pptx):
When asked to create a presentation or slide deck:
- Generate a beautiful, native PowerPoint presentation (.pptx) AND companion interactive web slide deck using the \`generatePptx\` action block:
\`\`\`action
[
  {
    "action": "generatePptx",
    "spec": {
      "title": "Analisis Pasar & Ringkasan Dokumen",
      "subtitle": "Disusun oleh SAM Agent",
      "theme": "corporate-blue",
      "slides": [
        {
          "title": "Eksekutif Summary",
          "layout": "content",
          "bulletPoints": [
            "Poin kunci pertama dari dokumen yang dianalisis",
            "Tren utama dan temuan penting",
            "Kesimpulan strategis"
          ]
        },
        {
          "title": "Metrik Utama",
          "layout": "stat",
          "statNumber": "85%",
          "statLabel": "Peningkatan Efisiensi Operasional",
          "bulletPoints": [
            "Berdasarkan data sheet finansial Q3",
            "Pertumbuhan stabil dibandingkan kuartal sebelumnya"
          ]
        },
        {
          "title": "Rencana Aksi & Rekomendasi",
          "layout": "two-column",
          "columnLeft": [
            "Fase 1: Implementasi awal",
            "Fokus pada efisiensi biaya"
          ],
          "columnRight": [
            "Fase 2: Skalabilitas",
            "Pengembangan infrastruktur tim"
          ]
        }
      ]
    }
  }
]
\`\`\`
- Available Preset Themes:
  - \`"corporate-blue"\`: Gaya korporat formal profesional (latar bersih, biru korporat & aksen sky blue, font Calibri)
  - \`"modern-dark"\`: Gaya clean modern dark mode (latar slate gelap 900, aksen sky & indigo, font Arial)
  - \`"minimal-light"\`: Gaya minimalis modern terang (latar putih bersih, kartu soft zinc, font Inter)
  - \`"sunset-warm"\`: Nuansa hangat kreatif (latar amber cream, aksen orange & amber, font Georgia)
  - \`"royal-purple"\`: Gaya elegan & premium (latar deep indigo, aksen purple & fuchsia, font Segoe UI)
  - \`"vibrant-emerald"\`: Gaya segar, eco/growth (latar deep emerald, aksen mint & neon emerald)
  - \`"midnight-oled"\`: Kontras ultra tinggi (latar hitam pekat #000000, aksen neon cyan & magenta)
  - \`"elegant-cream"\`: Gaya luxury editorial (latar cream hangat #FDFBF7, aksen deep teal & bronze, font Georgia)
- Dynamic Custom Theme / Desain Kustom:
  Jika pengguna meminta warna spesifik atau brand kit tertentu, tambahkan objek \`"customTheme"\` di dalam spec.
- Available layouts: \`"title"\`, \`"content"\`, \`"two-column"\`, \`"stat"\`, \`"conclusion"\`.
- Executing \`generatePptx\` automatically compiles a native \`.pptx\` file into \`/workspace/<title>.pptx\` (downloadable) and launches an interactive live slide presentation viewer in Chrome!

### AUTONOMOUS MULTI-STEP EXECUTION:
You operate in an autonomous execution loop! When you emit an action block, your action is executed immediately in the browser, the page state updates, and you will automatically receive an observation with the new page content and links in the next turn.
Therefore:
- In Step 1: Open the target site or perform search.
- In Step 2 (after receiving the new page results): Inspect the search results/links, choose the most relevant link/video, and click or play it!
- In the final step: When all goals requested by the user are fulfilled, provide a polite, concise summary in the user's language (e.g. Bahasa Indonesia) WITHOUT emitting any further action block.
`.trim();

export interface ChatRunOptions {
  threadId: string;
  prompt: string;
  files?: AttachedFilePayload[];
  provider: string;
  model: string;
  thinkingLevel?: string;
  includePageContext?: boolean;
  onUpdate?: () => void;
  signal?: AbortSignal;
}

/**
 * Wait for a browser tab to finish loading and hydrate DOM
 */
async function waitForTabReady(tabId?: number, maxWaitMs = 10000): Promise<void> {
  if (!tabId || tabId <= 0) {
    await new Promise((r) => setTimeout(r, 2000));
    return;
  }
  const startTime = Date.now();
  await new Promise((r) => setTimeout(r, 600));

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        // Additional grace time for dynamic SPAs (e.g. YouTube Polymer) to mount
        await new Promise((r) => setTimeout(r, 2200));
        return;
      }
    } catch (_) {
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Wait for ChatGPT or similar AI web UI to finish streaming/generating answer
 */
async function waitForChatGPTResponse(tabId?: number, maxWaitMs = 60000): Promise<void> {
  if (!tabId || tabId <= 0) return;
  const startTime = Date.now();

  // Initial wait for ChatGPT to receive the prompt and start generating
  await new Promise((r) => setTimeout(r, 2200));

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const hasStopBtn = !!document.querySelector(
            'button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="Hentikan"], button[data-testid="composer-speech-button"]:disabled'
          );
          const isStreaming = !!document.querySelector('.result-streaming');
          return hasStopBtn || isStreaming;
        },
      });

      const isStillGenerating = res?.result === true;
      if (!isStillGenerating) {
        // Double check after 1.5s to ensure generation didn't just pause momentarily
        await new Promise((r) => setTimeout(r, 1500));
        const [doubleCheck] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const hasStopBtn = !!document.querySelector(
              'button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="Hentikan"]'
            );
            const isStreaming = !!document.querySelector('.result-streaming');
            return hasStopBtn || isStreaming;
          },
        });
        if (!doubleCheck?.result) {
          // Finished generating!
          return;
        }
      }
    } catch (_) {
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * Stream text from the configured AI provider
 */
async function streamFromProvider(
  provider: string,
  model: string,
  storageData: Record<string, any>,
  systemPrompt: string,
  contextMessages: Array<{ role: string; content: string }>,
  onUpdateText: (accumulated: string) => Promise<void>,
  signal?: AbortSignal
): Promise<string> {
  let accumulated = '';

  if (provider === 'gemini') {
    const apiKey = storageData.geminiApiKey || '';
    if (!apiKey.trim()) {
      throw new Error('Google Gemini API Key is missing. Please add it in Settings.');
    }
    const baseUrl = (storageData[`${provider}_baseUrl`] || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey.trim()}`;

    const contents = contextMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const bodyPayload: any = { contents };
    if (systemPrompt) {
      bodyPayload.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 150) || res.statusText}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      let buffer = '';
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (delta) {
                accumulated += delta;
                await onUpdateText(accumulated);
              }
            } catch (_) {}
          }
        }
      }
    }
  } else if (provider === 'anthropic') {
    const apiKey = storageData.anthropicApiKey || '';
    if (!apiKey.trim()) {
      throw new Error('Anthropic API Key is missing. Please add it in Settings.');
    }
    const baseUrl = (storageData[`${provider}_baseUrl`] || 'https://api.anthropic.com').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/v1/messages`;

    const msgs = contextMessages.filter((m) => m.role === 'user' || m.role === 'assistant');

    const bodyPayload: any = {
      model,
      messages: msgs,
      max_tokens: 4096,
      stream: true,
    };
    if (systemPrompt) {
      bodyPayload.system = systemPrompt;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(bodyPayload),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 150) || res.statusText}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      let buffer = '';
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta?.text || '';
                if (delta) {
                  accumulated += delta;
                  await onUpdateText(accumulated);
                }
              }
            } catch (_) {}
          }
        }
      }
    }
  } else {
    // OpenAI, DeepSeek, GLM, and OpenAI Compatible
    let apiKey = '';
    let defaultBaseUrl = 'http://localhost:11434/v1';

    if (provider === 'openai') {
      apiKey = storageData.openaiApiKey || '';
      defaultBaseUrl = 'https://api.openai.com/v1';
    } else if (provider === 'deepseek') {
      apiKey = storageData.deepseekApiKey || '';
      defaultBaseUrl = 'https://api.deepseek.com';
    } else if (provider === 'glm') {
      apiKey = storageData.glmApiKey || '';
      defaultBaseUrl = 'https://open.bigmodel.cn/api/paas/v4';
    } else if (provider === 'custom_openai') {
      apiKey = storageData.customApiKey || storageData.custom_openai_apiKey || '';
      defaultBaseUrl = 'http://localhost:11434/v1';
    }

    if (!apiKey.trim() && provider !== 'custom_openai') {
      throw new Error(`${provider.toUpperCase()} API Key is missing. Please add it in Settings.`);
    }

    const customUrl = provider === 'custom_openai' ? (storageData.customBaseUrl || storageData.custom_baseUrl) : undefined;
    const baseUrl = (storageData[`${provider}_baseUrl`] || customUrl || defaultBaseUrl).replace(/\/+$/, '');
    const endpoint = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const messages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...contextMessages]
      : contextMessages;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150) || res.statusText}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      let buffer = '';
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:') && trimmed.replace(/^data:\s*/, '') !== '[DONE]') {
            try {
              const parsed = JSON.parse(trimmed.replace(/^data:\s*/, ''));
              const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
              if (delta) {
                accumulated += delta;
                await onUpdateText(accumulated);
              }
            } catch (_) {}
          }
        }
      }

      // If leftover buffer has content (or if provider sent non-streaming JSON)
      const trimmedRemaining = buffer.trim();
      if (trimmedRemaining) {
        if (trimmedRemaining.startsWith('data:') && trimmedRemaining.replace(/^data:\s*/, '') !== '[DONE]') {
          try {
            const parsed = JSON.parse(trimmedRemaining.replace(/^data:\s*/, ''));
            const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
            if (delta) {
              accumulated += delta;
              await onUpdateText(accumulated);
            }
          } catch (_) {}
        } else if (!accumulated) {
          try {
            const parsed = JSON.parse(trimmedRemaining);
            const content =
              parsed.choices?.[0]?.message?.content ||
              parsed.choices?.[0]?.delta?.content ||
              parsed.choices?.[0]?.text ||
              parsed.response ||
              '';
            if (content) {
              accumulated = content;
              await onUpdateText(accumulated);
            }
          } catch (_) {}
        }
      }
    }
  }

  return accumulated;
}

/**
 * Parse code blocks and execute browser actions
 */
async function parseAndExecuteActions(
  fullText: string,
  targetAssistantMsgId: string,
  pageContext: PageContext | null,
  threadId: string,
  onUpdate?: () => void
): Promise<ActionResult[]> {
  let targetTabId = pageContext?.tabId;
  if (!targetTabId || targetTabId <= 0) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTabId = activeTab?.id;
    } catch (e) {
      console.warn('[chat-runner] Could not query active tab:', e);
    }
  }

  // Matches ```action, ```action:navigate, ```action:batch, ```json, etc.
  const codeBlockRegex = /```(?:([a-zA-Z0-9_:-]+))?\s*([\s\S]*?)```/gi;
  const actionsToRun: BrowserAction[] = [];

  let match;
  while ((match = codeBlockRegex.exec(fullText)) !== null) {
    const tag = (match[1] || '').toLowerCase();
    const rawJson = match[2]?.trim();
    if (!rawJson) continue;

    const isActionTag = tag === 'action' || tag.startsWith('action:');
    const isJsonTag = tag === 'json';

    if (!isActionTag && !isJsonTag) continue;

    const typeHint = tag.startsWith('action:') ? tag.split(':')[1] : undefined;

    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            if (!item.action && typeHint) {
              item.action = typeHint;
            }
            if (item.action) {
              actionsToRun.push(item);
            }
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        if (!parsed.action && typeHint) {
          parsed.action = typeHint;
        }
        if (parsed.action) {
          actionsToRun.push(parsed);
        }
      }
    } catch (e) {
      // Not valid JSON
    }
  }

  // Fallback: parse un-fenced JSON array or object if model omitted markdown backticks
  if (actionsToRun.length === 0) {
    const nakedArrayMatch = fullText.match(/\[\s*\{[\s\S]*?"action"\s*:[\s\S]*?\}\s*\]/);
    if (nakedArrayMatch) {
      try {
        const parsed = JSON.parse(nakedArrayMatch[0]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item?.action) actionsToRun.push(item);
          }
        }
      } catch (_) {}
    } else {
      const nakedObjMatch = fullText.match(/\{\s*"action"\s*:\s*"[^"]+"[\s\S]*?\}/);
      if (nakedObjMatch) {
        try {
          const parsed = JSON.parse(nakedObjMatch[0]);
          if (parsed?.action) actionsToRun.push(parsed);
        } catch (_) {}
      }
    }
  }

  if (actionsToRun.length === 0) return [];

  const results: ActionResult[] = [];

  for (const act of actionsToRun) {
    const isTablessAction =
      act.action === 'writeFile' ||
      act.action === 'generatePptx' ||
      act.action === 'generateDoc' ||
      act.action === 'generateDocs' ||
      (act as any).action === 'createDoc';
    const isNavAction = act.action === 'navigate' || act.action === 'openTab' || (act as any).action === 'newTab';
    const isTabAction = act.action === 'switchTab' || act.action === 'closeTab';
    const isToolAction = act.action === 'runTool';

    // Skip DOM actions on restricted tabs
    if (!isTablessAction && !isNavAction && !isTabAction && !isToolAction && (!targetTabId || pageContext?.isRestricted)) {
      console.warn(`[chat-runner] Skipping in-page DOM action '${act.action}' on restricted tab.`);
      continue;
    }

    const toolId = crypto.randomUUID();
    const toolName =
      act.action === 'runTool'
        ? 'runTool'
        : act.action === 'switchTab'
        ? 'switchTab'
        : act.action === 'closeTab'
        ? 'closeTab'
        : act.action === 'fill'
        ? 'fillField'
        : act.action === 'click'
        ? 'clickElement'
        : act.action === 'select'
        ? 'selectOption'
        : act.action === 'navigate'
        ? 'navigate'
        : act.action === 'openTab' || (act as any).action === 'newTab'
        ? 'openTab'
        : act.action === 'play'
        ? 'play'
        : act.action === 'writeFile'
        ? 'writeFile'
        : act.action === 'generatePptx'
        ? 'generatePptx'
        : act.action === 'generateDoc' || act.action === 'generateDocs' || (act as any).action === 'createDoc'
        ? 'generateDoc'
        : act.action === 'eval'
        ? 'eval'
        : act.action === 'press_key' || (act as any).action === 'pressKey' || (act as any).action === 'key'
        ? 'pressKey'
        : 'browserAction';

    // Append pending tool-call part to message
    await db.transaction('rw', db.threads, async () => {
      const current = await db.threads.get(threadId);
      if (!current) return;
      const msg = current.messages.find((m) => m.id === targetAssistantMsgId);
      if (msg) {
        msg.parts.push({
          type: 'tool-call',
          toolCallId: toolId,
          toolName,
          state: 'pending',
          input: act,
        });
        await db.threads.put(current);
      }
    });
    onUpdate?.();

    // Execute live action
    const res = await executePageAction(targetTabId || 0, act);
    results.push(res);

    // Update tool-call part with result
    await db.transaction('rw', db.threads, async () => {
      const current = await db.threads.get(threadId);
      if (!current) return;
      const msg = current.messages.find((m) => m.id === targetAssistantMsgId);
      if (msg) {
        const part = msg.parts.find((p) => p.type === 'tool-call' && p.toolCallId === toolId);
        if (part && part.type === 'tool-call') {
          part.state = res.success ? 'completed' : 'error';
          part.output = res.message;
          part.verified = res.verified;
          part.attempts = res.attempts;
          part.selfCorrected = res.selfCorrected;
          part.strategyUsed = res.strategyUsed;
          if (!res.success) {
            part.errorText = res.error || res.message;
          }
          await db.threads.put(current);
        }
      }
    });
    onUpdate?.();

    // Domain learning
    if (pageContext?.domain && !pageContext.isRestricted && res.success) {
      try {
        const selectorKey = (act as any).label || (act as any).name || (act as any).selector || '';
        const verifiedSel = res.verifiedSelector || (act as any).selector;
        const selectorMap: Record<string, string> = {};
        if (selectorKey && verifiedSel) {
          selectorMap[selectorKey] = verifiedSel;
        }

        const editorTypeMap: Record<string, string> = {};
        if (res.editorType && verifiedSel) {
          editorTypeMap[verifiedSel] = res.editorType;
        }

        let caveat: string | undefined;
        if (res.selfCorrected) {
          caveat = `Selector "${verifiedSel}" required self-correction fallback (${res.strategyUsed || 'fallback'}).`;
        } else if (res.editorType?.includes('wysihtml5')) {
          caveat = `Selector "${verifiedSel}" is a WYSIWYG editor requiring synchronized iframe body injection.`;
        }

        await recordDomainLearning(pageContext.domain, pageContext.title, {
          selectorMap: Object.keys(selectorMap).length > 0 ? selectorMap : undefined,
          editorTypeMap: Object.keys(editorTypeMap).length > 0 ? editorTypeMap : undefined,
          caveat,
          success: res.success,
        });
      } catch (memErr) {
        console.warn('[chat-runner] Error recording domain learning:', memErr);
      }
    }
  }

  return results;
}

/**
 * Main Autonomous Streaming Chat Runner
 */
export async function runChatStream(options: ChatRunOptions): Promise<void> {
  const { threadId, prompt, provider, model, includePageContext = true, onUpdate, signal } = options;

  // 1. Inspect initial active tab for thread naming
  let initialContext: PageContext | null = null;
  if (includePageContext) {
    try {
      initialContext = await getActivePageContext();
    } catch (_) {}
  }

  // 2. Append User Message
  const userMsgId = crypto.randomUUID();
  const fileParts: FilePart[] = (options.files || []).map((f) => ({
    type: 'file',
    url: f.content,
    mediaType: f.type,
    filename: f.name,
    size: f.size,
  }));

  const userMessage: ThreadMessage = {
    id: userMsgId,
    role: 'user',
    parts: [{ type: 'text', text: prompt }, ...fileParts],
    timestamp: Date.now(),
  };
  await appendMessageToThread(threadId, userMessage);

  // Automatically save attached files into VFS /workspace/uploads/
  if (options.files && options.files.length > 0) {
    for (const file of options.files) {
      try {
        await saveVfsFile(`/workspace/uploads/${file.name}`, file.content, file.type);
      } catch (err) {
        console.warn('[chat-runner] Could not save attached file to VFS:', file.name, err);
      }
    }
  }

  // If thread is untitled or 'New Chat', update it
  const existingThread = await db.threads.get(threadId);
  if (existingThread && (existingThread.title === 'New Chat' || !existingThread.title)) {
    if (initialContext?.title && !initialContext.isRestricted) {
      existingThread.title = initialContext.title.slice(0, 36);
      await db.threads.put(existingThread);
    } else {
      existingThread.title = prompt.slice(0, 32);
      await db.threads.put(existingThread);
    }
  }
  onUpdate?.();

  // 3. Fetch API Keys & BaseUrls from storage
  const storageData = await chrome.storage.local.get([
    'anthropicApiKey',
    'geminiApiKey',
    'openaiApiKey',
    'deepseekApiKey',
    'glmApiKey',
    'customApiKey',
    'custom_openai_apiKey',
    'customBaseUrl',
    'custom_baseUrl',
    `${provider}_baseUrl`,
  ]);

  // Retrieve agent soul and token optimization preferences
  const [agentSoul, optimizationSettings] = await Promise.all([
    getAgentSoul(),
    getOptimizationSettings(),
  ]);

  // Retrieve message history for context
  const thread = await db.threads.get(threadId);
  const contextMessages: MessageItem[] = (thread?.messages || []).slice(-20).map((m) => {
    let content = m.parts.map((p) => (p.type === 'text' ? p.text : '')).filter(Boolean).join('\n');
    const msgFileParts = m.parts.filter((p): p is FilePart => p.type === 'file');
    if (msgFileParts.length > 0) {
      const fileTextBlocks = msgFileParts
        .map((f) => {
          const isImg = f.mediaType?.startsWith('image/');
          if (isImg) {
            return `[User attached image: "${f.filename || 'image'}" (${Math.round((f.size || 0) / 1024)} KB), saved in /workspace/uploads/${f.filename}]`;
          }
          // Check if this file has parsed Office text
          const matchedOptFile = options.files?.find((optF) => optF.name === f.filename);
          if (matchedOptFile?.extractedText) {
            return `--- ATTACHED OFFICE DOCUMENT: "${f.filename}" (${Math.round((f.size || 0) / 1024)} KB, ${matchedOptFile.wordCount || 0} words) ---\n${matchedOptFile.extractedText}\n--- END ATTACHED FILE ---`;
          }
          // If content is text (not data URL)
          if (f.url && !f.url.startsWith('data:')) {
            return `--- ATTACHED FILE: ${f.filename} ---\n${f.url}\n--- END ATTACHED FILE ---`;
          }
          return `[User attached file: "${f.filename || 'file'}" (${Math.round((f.size || 0) / 1024)} KB), saved in /workspace/uploads/${f.filename}]`;
        })
        .join('\n\n');
      content = fileTextBlocks ? `${fileTextBlocks}\n\n${content}` : content;
    }
    return {
      role: (m.role === 'assistant' || m.role === 'system' ? m.role : 'user') as 'user' | 'assistant' | 'system',
      content,
    };
  }).filter((m) => m.content.trim().length > 0);

  // Autonomous Execution Loop
  const isContinuousGoal =
    prompt.toLowerCase().includes('jalankan terus') ||
    prompt.toLowerCase().includes('sampai ada perintah stop') ||
    prompt.toLowerCase().includes('tanya jawab') ||
    prompt.toLowerCase().includes('terus menerus') ||
    prompt.toLowerCase().includes('continuous') ||
    prompt.toLowerCase().includes('until stop');

  const MAX_AGENT_STEPS = isContinuousGoal ? 60 : 6;
  let currentStep = 1;

  while (currentStep <= MAX_AGENT_STEPS) {
    if (signal?.aborted) break;

    // Refresh active page context for each step
    let pageContext: PageContext | null = null;
    let systemContextPrompt = '';

    if (includePageContext) {
      try {
        pageContext = await getActivePageContext();
        if (pageContext && (pageContext.url || pageContext.text)) {
          systemContextPrompt = formatPageContextPrompt(pageContext);
        }
      } catch (err) {
        console.warn('[chat-runner] Error fetching active page context:', err);
      }
    }

    // Parse Agent Name from soul if present
    const nameMatch = agentSoul.match(/(?:Name|name)[:\*]*\s*([^\n\r*]+)/i);
    const agentName = nameMatch ? nameMatch[1].trim() : 'SAM-Agent';

    // Assemble final system prompt: Injected Agent Soul (persona) + Base Capabilities + Dynamic Page Context
    let finalSystemPrompt = `# AGENT SOUL & CORE IDENTITY (MANDATORY):
${agentSoul}

### IDENTITY DIRECTIVES:
- Your official name is: "${agentName}"
- You MUST strictly adopt and express the persona, name, tone, language, and directives specified in SOUL.MD above.
- When the user asks "who are you" ("siapa kamu", etc.), introduce yourself as "${agentName}" according to SOUL.MD. Always adhere to the name and identity specified in SOUL.MD.

${BASE_CAPABILITIES_PROMPT}`;
    if (systemContextPrompt) {
      finalSystemPrompt += `\n\n${systemContextPrompt}`;
    }

    // Append open tabs context if available
    try {
      const openTabs = await getOpenTabs();
      const tabsPrompt = formatOpenTabsPrompt(openTabs);
      if (tabsPrompt) {
        finalSystemPrompt += `\n\n${tabsPrompt}`;
      }
    } catch (tabErr) {
      console.warn('[chat-runner] Error querying open tabs:', tabErr);
    }

    // Append custom user tools if available
    try {
      const userTools = await listUserTools();
      const userToolsPrompt = formatUserToolsPrompt(userTools);
      if (userToolsPrompt) {
        finalSystemPrompt += `\n\n${userToolsPrompt}`;
      }
    } catch (toolErr) {
      console.warn('[chat-runner] Error querying user tools:', toolErr);
    }

    // Prepare Assistant Placeholder Message in DB
    const assistantMsgId = crypto.randomUUID();
    const assistantMessage: ThreadMessage = {
      id: assistantMsgId,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      timestamp: Date.now(),
    };
    await appendMessageToThread(threadId, assistantMessage);
    onUpdate?.();

    // Helper to update assistant text live in DB
    const updateAssistantText = async (fullText: string) => {
      await db.transaction('rw', db.threads, async () => {
        const current = await db.threads.get(threadId);
        if (!current) return;
        const msg = current.messages.find((m) => m.id === assistantMsgId);
        if (msg) {
          const nonTextParts = msg.parts.filter((p) => p.type !== 'text');
          msg.parts = [{ type: 'text', text: fullText }, ...nonTextParts];
          await db.threads.put(current);
        }
      });
      onUpdate?.();
    };

    // Apply RTK & Ponytail token optimizations to context payload before transmitting to LLM
    let optimizedMessages = [...contextMessages];
    if (optimizationSettings.enableRtk) {
      optimizedMessages = applyRtkPruning(optimizedMessages);
    }
    if (optimizationSettings.enablePonytail) {
      optimizedMessages = applyPonytailCompression(optimizedMessages);
    }

    let accumulated = '';
    try {
      accumulated = await streamFromProvider(
        provider,
        model,
        storageData,
        finalSystemPrompt,
        optimizedMessages,
        updateAssistantText,
        signal
      );
    } catch (err: any) {
      if (signal?.aborted) break;
      console.error('[chat-runner] Stream error:', err);
      await updateAssistantText(
        `⚠️ **Error:** ${err.message || 'Failed to generate response.'}\n\nPlease verify your API Key and Model settings.`
      );
      break;
    }

    if (signal?.aborted) break;

    // Execute actions
    let executedResults: ActionResult[] = [];
    if (accumulated) {
      executedResults = await parseAndExecuteActions(
        accumulated,
        assistantMsgId,
        pageContext,
        threadId,
        onUpdate
      );
    }

    // If no actions were emitted:
    if (executedResults.length === 0) {
      if (isContinuousGoal && currentStep < MAX_AGENT_STEPS) {
        contextMessages.push({
          role: 'assistant',
          content: accumulated,
        });
        contextMessages.push({
          role: 'user',
          content: `Please continue the ongoing Q&A session with ChatGPT! Read ChatGPT's reply from the active page and emit an action block to send your next question:\n\`\`\`action\n[\n  { "action": "fill", "selector": "#prompt-textarea", "value": "Pertanyaan berikutnya...", "submit": true }\n]\n\`\`\``,
        });
        currentStep++;
        continue;
      }
      break;
    }

    // If an action was 'play' and succeeded, the goal is achieved! Conclude gracefully without extra step.
    const hadSuccessfulPlay = executedResults.some((r) => r.action === 'play' && r.success);
    if (hadSuccessfulPlay) {
      const threadNow = await db.threads.get(threadId);
      const lastMsg = threadNow?.messages.find((m) => m.id === assistantMsgId);
      const currentText = lastMsg?.parts.find((p) => p.type === 'text')?.text || '';
      const cleanText = currentText
        .replace(/```json[\s\S]*?```/g, '')
        .replace(/\[\s*\{\s*"action"[\s\S]*?\}\s*\]/g, '')
        .trim();

      if (!cleanText) {
        await updateAssistantText(
          '🎬 Video telah berhasil ditemukan dan saat ini sedang diputar di YouTube. Selamat menonton!'
        );
      }
      break;
    }

    if (currentStep >= MAX_AGENT_STEPS) {
      break;
    }

    // Wait for page transition / loading / ChatGPT streaming
    const hadTabSwitch = executedResults.some((r) => r.action === 'switchTab' && r.success);
    const hadTabOpen = executedResults.some(
      (r) => (r.action === 'openTab' || (r as any).action === 'newTab') && r.success
    );
    const hadNavigation = executedResults.some((r) => r.action === 'navigate');
    const hadClickOrPlay = executedResults.some((r) => r.action === 'click' || r.action === 'play');
    const hadChatSubmission =
      (pageContext?.domain?.includes('chatgpt.com') || pageContext?.url?.includes('chatgpt.com')) &&
      executedResults.some(
        (r) =>
          r.action === 'fill' ||
          r.action === 'press_key' ||
          (r.action === 'click' && (r.target?.includes('send') || r.target?.includes('prompt')))
      );

    let targetTabId = pageContext?.tabId;
    if (hadTabSwitch || hadTabOpen) {
      const tabActionResult = executedResults.find(
        (r) => (r.action === 'switchTab' || r.action === 'openTab' || (r as any).action === 'newTab') && r.success
      );
      if (tabActionResult?.tabId) {
        targetTabId = tabActionResult.tabId;
      } else {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          targetTabId = activeTab?.id;
        } catch (_) {}
      }
    } else if (!targetTabId || targetTabId <= 0) {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        targetTabId = activeTab?.id;
      } catch (_) {}
    }

    if (hadTabSwitch || hadTabOpen) {
      await waitForTabReady(targetTabId);
    } else if (hadNavigation) {
      await waitForTabReady(targetTabId);
    } else if (hadChatSubmission) {
      // Intelligently wait for ChatGPT to finish generating its response before proceeding to next question!
      await waitForChatGPTResponse(targetTabId);
    } else if (hadClickOrPlay) {
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      await new Promise((r) => setTimeout(r, 800));
    }

    if (signal?.aborted) break;

    // Append history for the next step observation
    contextMessages.push({
      role: 'assistant',
      content: accumulated,
    });

    const actionSummary = executedResults
      .map((r) => `- [${r.action}]: ${r.success ? 'SUCCESS' : 'FAILED'} (${r.message})`)
      .join('\n');

    const nextObservationPrompt = isContinuousGoal
      ? `[Observation / Results from Step ${currentStep}]:\n${actionSummary}\n\nThe user requested a continuous Q&A session with ChatGPT UNTIL THEY CLICK STOP. ChatGPT has completed its answer on the active page. Please inspect the updated page context to read ChatGPT's latest reply, formulate your next insightful follow-up question based on it, and immediately emit an action block to send it:\n\`\`\`action\n[\n  { "action": "fill", "selector": "#prompt-textarea", "value": "Your next follow-up question...", "submit": true }\n]\n\`\`\`\nKeep the continuous Q&A cycle active without stopping!`
      : `[Observation / Results from Step ${currentStep}]:\n${actionSummary}\n\nThe browser tab has executed the action(s). Please inspect the updated page context and proceed autonomously to complete the user's request: "${prompt}". When finished (e.g. video is playing or goal achieved), summarize your actions without emitting further action blocks.`;

    contextMessages.push({
      role: 'user',
      content: nextObservationPrompt,
    });

    currentStep++;
  }

  // Cleanup: ensure no lingering empty assistant placeholder in the thread
  try {
    const threadAfterLoop = await db.threads.get(threadId);
    if (threadAfterLoop) {
      let changed = false;
      const filteredMessages = threadAfterLoop.messages.filter((m) => {
        if (m.role !== 'assistant') return true;
        const hasText = m.parts.some((p) => p.type === 'text' && p.text.trim().length > 0);
        const hasToolCalls = m.parts.some((p) => p.type === 'tool-call');
        if (!hasText && !hasToolCalls) {
          changed = true;
          return false;
        }
        return true;
      });

      if (changed) {
        threadAfterLoop.messages = filteredMessages;
        await db.threads.put(threadAfterLoop);
        onUpdate?.();
      }
    }
  } catch (cleanErr) {
    console.warn('[chat-runner] Cleanup error:', cleanErr);
  }
}
