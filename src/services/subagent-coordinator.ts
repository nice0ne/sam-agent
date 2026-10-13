/**
 * Sub-Agent Delegation Pipeline Coordinator for SAM-Agent
 *
 * Orchestrates multi-agent task execution by spawning specialized worker subagents
 * (researcher, scraper, analyst) with sandboxed execution loops, concurrency limits,
 * tab lifecycle isolation, and deliverable aggregation.
 */

import type {
  WorkerRole,
  WorkerSpec,
  WorkerDeliverable,
  PipelineProgress,
} from '../types/subagent';
import { useAppStore } from '../stores/useAppStore';
import { streamFromProvider } from './chat-runner';
import { executePageAction } from './page-actions';
import { executeWebSearch, formatWebSearchResults } from './web-search';
import { saveVfsFile } from './vfs';
import type { MessageItem } from './soul';

/**
 * Generate role-specific system prompts with capability boundaries
 */
export function generateRolePrompt(worker: WorkerSpec): string {
  const targetUrlsList =
    worker.targetUrls && worker.targetUrls.length > 0
      ? `\nTarget URLs:\n${worker.targetUrls.map((u) => `- ${u}`).join('\n')}`
      : '';

  switch (worker.role) {
    case 'researcher':
      return `You are a specialized autonomous Researcher sub-agent ("${worker.name}").
Your goal: ${worker.taskPrompt}${targetUrlsList}

You specialize in web research, searching relevant information, inspecting pages, and synthesizing facts.
AVAILABLE ACTIONS (emit in \`\`\`action\`\`\` blocks):
1. Instant background web search:
\`\`\`action
[ { "action": "searchWeb", "query": "search query here" } ]
\`\`\`
2. Navigate to a URL:
\`\`\`action
[ { "action": "navigate", "url": "https://example.com" } ]
\`\`\`
3. Read / inspect active page content:
\`\`\`action
[ { "action": "readPage" } ]
\`\`\`

EXECUTION RULES:
- Focus on fast, fact-based search and reading.
- Cite sources and key findings clearly.
- When done, summarize your findings concisely. Do NOT emit action blocks once your findings are complete.`;

    case 'scraper':
      return `You are a specialized autonomous Scraper sub-agent ("${worker.name}").
Your goal: ${worker.taskPrompt}${targetUrlsList}

You specialize in DOM traversal, reading pages, visual inspection, clicking elements, scrolling, and structured data harvesting.
AVAILABLE ACTIONS (emit in \`\`\`action\`\`\` blocks):
1. Read active page DOM text:
\`\`\`action
[ { "action": "readPage" } ]
\`\`\`
2. Visually inspect DOM elements by selector:
\`\`\`action
[ { "action": "visualInspect", "selector": ".card-title" } ]
\`\`\`
3. Click an element or tag:
\`\`\`action
[ { "action": "clickTag", "tag": "button" } ]
\`\`\`
or
\`\`\`action
[ { "action": "click", "selector": "button#next" } ]
\`\`\`
4. Scroll page to load dynamic content:
\`\`\`action
[ { "action": "scrollPage", "amount": 600 } ]
\`\`\`

EXECUTION RULES:
- Extract structured records into a clean JSON array enclosed in \`\`\`json\`\`\` code fences.
- When extraction is finished, output the final summary of scraped data. Do NOT emit action blocks once finished.`;

    case 'analyst':
      return `You are a specialized autonomous Analyst sub-agent ("${worker.name}").
Your goal: ${worker.taskPrompt}

You specialize in deep data synthesis, generating formal Word documents (.docx), creating Excel spreadsheets (.xlsx), and writing files to the Virtual File System (VFS).
AVAILABLE ACTIONS (emit in \`\`\`action\`\`\` blocks):
1. Generate Word document (.doc / .docx):
\`\`\`action
[ { "action": "generateDoc", "title": "Report_Title", "content": "# Executive Summary\\n\\n..." } ]
\`\`\`
2. Generate Excel spreadsheet (.xlsx):
\`\`\`action
[ { "action": "generateExcel", "filename": "summary.xlsx", "sheets": [{ "name": "Overview", "data": [["Col 1", "Col 2"], ["Val 1", "Val 2"]] }] } ]
\`\`\`
3. Save file to VFS:
\`\`\`action
[ { "action": "writeFile", "path": "/workspace/analysis.md", "content": "Analysis content..." } ]
\`\`\`

EXECUTION RULES:
- Synthesize all provided information with analytical rigor, key metrics, and strategic recommendations.
- Generate concrete file artifacts whenever requested.
- Deliver an executive conclusion when done.`;

    default:
      return `You are an autonomous sub-agent ("${worker.name}").
Your goal: ${worker.taskPrompt}${targetUrlsList}`;
  }
}

/**
 * Wait for a browser tab to finish loading
 */
async function waitForTabReady(tabId?: number, maxWaitMs = 8000): Promise<void> {
  if (!tabId || tabId <= 0) {
    await new Promise((r) => setTimeout(r, 1500));
    return;
  }
  const startTime = Date.now();
  await new Promise((r) => setTimeout(r, 500));

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        await new Promise((r) => setTimeout(r, 800));
        return;
      }
    } catch (_) {
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * Inspect tab DOM content cleanly
 */
async function inspectTabContent(tabId: number): Promise<{ title: string; text: string; url: string }> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title || '';
        const el = (document.querySelector('main, article, #content, .content, #main, body') as HTMLElement) || document.body;
        const bodyText = el ? (el.innerText || el.textContent || '') : '';
        const clean = bodyText.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
        return {
          title,
          url: window.location.href,
          text: clean.slice(0, 3500),
        };
      },
    });
    return results[0]?.result || { title: tab.title || '', text: '', url: tab.url || '' };
  } catch (err: any) {
    return { title: '', text: `Failed to inspect tab: ${err?.message || 'Access error'}`, url: '' };
  }
}

/**
 * Scroll page within tab
 */
async function scrollTab(tabId: number, amount: number = 600): Promise<{ success: boolean; message: string }> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (scrollAmount: number) => {
        window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
      },
      args: [amount],
    });
    return { success: true, message: `Scrolled page down by ${amount}px.` };
  } catch (err: any) {
    return { success: false, message: `Failed to scroll page: ${err?.message || 'Unknown error'}` };
  }
}

/**
 * Parse action blocks from LLM response text
 */
function parseWorkerActions(fullText: string): any[] {
  const codeBlockRegex = /```(?:([a-zA-Z0-9_:-]+))?\s*([\s\S]*?)```/gi;
  const actionsToRun: any[] = [];
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
            if (!item.action && typeHint) item.action = typeHint;
            if (item.action) actionsToRun.push(item);
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        if (!parsed.action && typeHint) parsed.action = typeHint;
        if (parsed.action) actionsToRun.push(parsed);
      }
    } catch (_) {}
  }

  // Fallback: look for unfenced action arrays
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
    }
  }

  return actionsToRun;
}

/**
 * Extract structured JSON records from LLM response
 */
function extractStructuredData(fullText: string): Record<string, any>[] {
  const jsonBlocks = /```(?:json)?\s*([\s\S]*?)```/gi;
  const records: Record<string, any>[] = [];
  let match;

  while ((match = jsonBlocks.exec(fullText)) !== null) {
    const content = match[1]?.trim();
    if (!content) continue;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && !item.action) {
            records.push(item);
          }
        }
      } else if (parsed && typeof parsed === 'object' && !parsed.action) {
        records.push(parsed);
      }
    } catch (_) {}
  }

  return records;
}

/**
 * Extract clean summary by removing action and JSON code fences
 */
function extractCleanSummary(fullText: string): string {
  return fullText
    .replace(/```(?:action|json)[\s\S]*?```/gi, '')
    .replace(/\[\s*\{\s*"action"[\s\S]*?\}\s*\]/g, '')
    .trim();
}

/**
 * Non-blocking broadcast to Sam's Virtual Office 3D via local event endpoint
 */
export async function notifyVirtualOfficeSpawn(worker: WorkerSpec): Promise<void> {
  try {
    const payload = {
      stage: 'EXECUTING_SUBAGENTS',
      subagents: [
        {
          id: worker.id,
          name: worker.name,
          role: worker.role,
          task: worker.taskPrompt,
          color:
            worker.color ||
            (worker.role === 'researcher'
              ? '#38bdf8'
              : worker.role === 'scraper'
              ? '#34d399'
              : '#a78bfa'),
        },
      ],
      speaker: 'kamala',
      speakerMessage: `Merekrut subagent baru: ${worker.name} (${worker.role}) untuk Dev Lab!`,
      updatedAt: new Date().toISOString(),
    };

    await fetch('http://localhost:8000/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1500),
    }).catch(() => {});
  } catch (_) {
    // Fail-safe & non-blocking
  }
}

/**
 * Sandboxed execution of a single worker subagent with turn limits and 45s timeout
 */
export async function executeWorkerSubagent(
  worker: WorkerSpec,
  onWorkerStep?: (step: number, thought: string) => void
): Promise<WorkerDeliverable> {
  const startTime = Date.now();
  const maxSteps = worker.maxSteps && worker.maxSteps > 0 ? worker.maxSteps : 8;
  const timeoutMs = 45000;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort(new Error('Worker execution timed out after 45 seconds'));
  }, timeoutMs);

  const createdTabIds: number[] = [];
  let workerTabId: number | undefined;

  const logs: string[] = [];
  const artifactsCreated: string[] = [];
  const extractedData: Record<string, any>[] = [];
  let currentStep = 0;
  let finalSummary = '';
  let status: 'completed' | 'failed' | 'timeout' = 'completed';
  let errorMessage: string | undefined;

  try {
    // 1. Resolve active model settings from store or defaults
    const state = useAppStore.getState() as any;
    const settings = state?.settings || state || {};
    const provider = settings.provider || state?.provider || 'anthropic';
    const model =
      (provider === 'gemini'
        ? settings.geminiModel || settings.hostedModel || state?.hostedModel
        : provider === 'openai'
        ? settings.openaiModel || state?.openaiModel
        : settings.anthropicModel || settings.hostedModel || state?.anthropicModel || state?.hostedModel) ||
      'claude-3-7-sonnet-20250219';

    // 2. Fetch API keys from storage
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

    // 3. Open initial target URL if specified for researcher/scraper
    if (worker.targetUrls && worker.targetUrls.length > 0) {
      try {
        const initialTab = await chrome.tabs.create({
          url: worker.targetUrls[0],
          active: false,
        });
        if (initialTab.id) {
          workerTabId = initialTab.id;
          createdTabIds.push(initialTab.id);
          await waitForTabReady(initialTab.id, 6000);
        }
      } catch (err: any) {
        logs.push(`Could not open initial target URL: ${err?.message || 'unknown'}`);
      }
    }

    // 4. Construct prompt & initial message history
    const systemPrompt = generateRolePrompt(worker);
    const messages: MessageItem[] = [
      {
        role: 'user',
        content: `Worker Task: ${worker.taskPrompt}${
          worker.targetUrls && worker.targetUrls.length > 0
            ? `\nTarget URLs: ${worker.targetUrls.join(', ')}`
            : ''
        }\n\nPlease proceed step-by-step. Emit action blocks when necessary or deliver your final findings.`,
      },
    ];

    // 5. Sandboxed execution loop
    while (currentStep < maxSteps) {
      if (abortController.signal.aborted) {
        status = 'timeout';
        errorMessage = 'Worker execution timed out after 45 seconds';
        break;
      }

      currentStep++;
      onWorkerStep?.(currentStep, 'Thinking and planning next step...');

      let responseText = '';
      try {
        responseText = await streamFromProvider(
          provider,
          model,
          storageData,
          systemPrompt,
          messages,
          async (accumulated) => {
            const firstLine = accumulated
              .split('\n')[0]
              .replace(/^[#*-\s]+/, '')
              .slice(0, 100);
            if (firstLine) {
              onWorkerStep?.(currentStep, firstLine);
            }
          },
          abortController.signal
        );
      } catch (err: any) {
        if (abortController.signal.aborted) {
          status = 'timeout';
          errorMessage = 'Worker execution timed out after 45 seconds';
          break;
        }
        throw err;
      }

      if (!responseText) {
        break;
      }

      // Check for structured records
      const parsedRecords = extractStructuredData(responseText);
      if (parsedRecords.length > 0) {
        extractedData.push(...parsedRecords);
      }

      // Parse actions
      const actions = parseWorkerActions(responseText);
      if (actions.length === 0) {
        // Worker has completed and produced final report
        finalSummary = extractCleanSummary(responseText);
        logs.push(`Completed task at step ${currentStep}.`);
        break;
      }

      // Record assistant turn
      messages.push({
        role: 'assistant',
        content: responseText,
      });

      // Execute actions
      const observationSnippets: string[] = [];
      for (const act of actions) {
        if (abortController.signal.aborted) break;

        logs.push(`Step ${currentStep} executing action: ${act.action}`);

        if (act.action === 'searchWeb' || act.action === 'webSearch') {
          try {
            const results = await executeWebSearch(act.query || '');
            const formatted = formatWebSearchResults(results);
            observationSnippets.push(`[searchWeb Results]:\n${formatted}`);
          } catch (e: any) {
            observationSnippets.push(`[searchWeb Error]: ${e?.message || 'Search failed'}`);
          }
        } else if (act.action === 'navigate') {
          try {
            if (workerTabId) {
              await chrome.tabs.update(workerTabId, { url: act.url });
              await waitForTabReady(workerTabId, 8000);
              observationSnippets.push(`[navigate]: Navigated to ${act.url}`);
            } else {
              const tab = await chrome.tabs.create({ url: act.url, active: false });
              if (tab.id) {
                workerTabId = tab.id;
                createdTabIds.push(tab.id);
                await waitForTabReady(tab.id, 8000);
              }
              observationSnippets.push(`[navigate]: Opened and navigated to ${act.url}`);
            }
          } catch (e: any) {
            observationSnippets.push(`[navigate Error]: ${e?.message || 'Navigation failed'}`);
          }
        } else if (act.action === 'openTab' || act.action === 'newTab') {
          try {
            const tab = await chrome.tabs.create({ url: act.url, active: false });
            if (tab.id) {
              workerTabId = tab.id;
              createdTabIds.push(tab.id);
              await waitForTabReady(tab.id, 8000);
            }
            observationSnippets.push(`[openTab]: Opened tab with URL ${act.url}`);
          } catch (e: any) {
            observationSnippets.push(`[openTab Error]: ${e?.message || 'Failed to open tab'}`);
          }
        } else if (act.action === 'readPage') {
          if (workerTabId) {
            const info = await inspectTabContent(workerTabId);
            observationSnippets.push(
              `[readPage]: Title: "${info.title}" | URL: ${info.url}\nPage Text Excerpt:\n${info.text}`
            );
          } else {
            observationSnippets.push(`[readPage]: No active tab open for reading.`);
          }
        } else if (act.action === 'scrollPage' || act.action === 'scroll') {
          if (workerTabId) {
            const scrollRes = await scrollTab(workerTabId, act.amount || 600);
            observationSnippets.push(`[scrollPage]: ${scrollRes.message}`);
          } else {
            observationSnippets.push(`[scrollPage]: No active tab open to scroll.`);
          }
        } else if (act.action === 'writeFile') {
          try {
            await saveVfsFile(act.path, act.content, act.mimeType || 'text/plain');
            artifactsCreated.push(act.path);
            observationSnippets.push(`[writeFile]: Saved file to ${act.path}`);
          } catch (e: any) {
            observationSnippets.push(`[writeFile Error]: ${e?.message || 'Save failed'}`);
          }
        } else if (
          act.action === 'generateDoc' ||
          act.action === 'generateDocs' ||
          act.action === 'createDoc'
        ) {
          try {
            const res = await executePageAction(0, act);
            const docPath = `/workspace/${act.title || 'document'}.docx`;
            artifactsCreated.push(docPath);
            observationSnippets.push(`[generateDoc]: ${res.message}`);
          } catch (e: any) {
            observationSnippets.push(`[generateDoc Error]: ${e?.message || 'Doc creation failed'}`);
          }
        } else if (
          act.action === 'generateExcel' ||
          act.action === 'generateXlsx' ||
          act.action === 'createExcel'
        ) {
          try {
            const res = await executePageAction(0, act);
            const xlsxPath = `/workspace/${act.filename || 'data.xlsx'}`;
            artifactsCreated.push(xlsxPath);
            observationSnippets.push(`[generateExcel]: ${res.message}`);
          } catch (e: any) {
            observationSnippets.push(
              `[generateExcel Error]: ${e?.message || 'Excel creation failed'}`
            );
          }
        } else {
          // Standard page action fallback
          try {
            const res = await executePageAction(workerTabId || 0, act);
            observationSnippets.push(`[${act.action}]: ${res.message}`);
          } catch (e: any) {
            observationSnippets.push(`[${act.action} Error]: ${e?.message || 'Action failed'}`);
          }
        }
      }

      // Feed observations back into context for next turn
      messages.push({
        role: 'user',
        content: `Observations:\n${observationSnippets.join('\n\n')}`,
      });
    }

    if (!finalSummary && messages.length > 0) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant) {
        finalSummary = extractCleanSummary(lastAssistant.content);
      }
    }
  } catch (err: any) {
    status = 'failed';
    errorMessage = err?.message || String(err);
    logs.push(`Worker failed: ${errorMessage}`);
  } finally {
    clearTimeout(timeoutId);

    // Clean up all isolated browser tabs opened by this worker
    for (const tid of createdTabIds) {
      try {
        await chrome.tabs.remove(tid);
      } catch (_) {}
    }
  }

  return {
    workerId: worker.id,
    name: worker.name,
    role: worker.role,
    status,
    summary:
      finalSummary ||
      (status === 'timeout'
        ? 'Worker execution timed out after 45 seconds.'
        : status === 'failed'
        ? `Worker execution failed: ${errorMessage}`
        : 'Worker completed execution.'),
    extractedData: extractedData.length > 0 ? extractedData : undefined,
    artifactsCreated: artifactsCreated.length > 0 ? artifactsCreated : undefined,
    stepsUsed: currentStep,
    durationMs: Date.now() - startTime,
    error: errorMessage,
    logs: logs.length > 0 ? logs : undefined,
  };
}

/**
 * Aggregate worker deliverables into an integrated markdown observation
 */
export function aggregateWorkerDeliverables(
  planTitle: string,
  deliverables: WorkerDeliverable[]
): string {
  const total = deliverables.length;
  const completed = deliverables.filter((d) => d.status === 'completed').length;
  const failed = deliverables.filter((d) => d.status === 'failed').length;
  const timeout = deliverables.filter((d) => d.status === 'timeout').length;

  const lines: string[] = [];
  lines.push(`### 🤖 Sub-Agent Delegation Results: "${planTitle}"`);
  lines.push(
    `**Execution Status:** ${completed}/${total} completed successfully (${failed} failed, ${timeout} timed out).\n`
  );

  for (const deliv of deliverables) {
    const icon = deliv.status === 'completed' ? '✅' : deliv.status === 'timeout' ? '⏱️' : '❌';
    const roleBadge = `\`${deliv.role.toUpperCase()}\``;
    lines.push(`#### ${icon} ${deliv.name} (${roleBadge})`);
    lines.push(
      `- **Status:** ${deliv.status} | Steps: ${deliv.stepsUsed} | Duration: ${(
        deliv.durationMs / 1000
      ).toFixed(1)}s`
    );

    if (deliv.summary) {
      lines.push(`- **Summary:**\n${deliv.summary.trim()}`);
    }

    if (deliv.artifactsCreated && deliv.artifactsCreated.length > 0) {
      lines.push(`- **Artifacts Created:**`);
      deliv.artifactsCreated.forEach((art) => lines.push(`  - \`${art}\``));
    }

    if (deliv.extractedData && deliv.extractedData.length > 0) {
      lines.push(`- **Extracted Records:** ${deliv.extractedData.length} items`);
      const sample = deliv.extractedData.slice(0, 2);
      lines.push('```json');
      lines.push(JSON.stringify(sample, null, 2));
      lines.push('```');
    }

    if (deliv.error) {
      lines.push(`- **Error Details:** ${deliv.error}`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push(
    'All worker sub-agents have finished execution. Synthesize these deliverables and present the final comprehensive report to the user.'
  );

  return lines.join('\n');
}

/**
 * Execute a sub-agent pipeline with a concurrency pool of up to 3 parallel workers
 */
export async function runSubagentPipeline(
  planTitle: string,
  workers: WorkerSpec[],
  onProgress?: (progress: PipelineProgress) => void
): Promise<{ deliverables: WorkerDeliverable[]; aggregatedObservation: string }> {
  const MAX_CONCURRENCY = 3;

  // Initialize pipeline progress
  const progress: PipelineProgress = {
    planTitle,
    totalWorkers: workers.length,
    completedWorkers: 0,
    workers: {},
  };

  for (const w of workers) {
    progress.workers[w.id] = {
      status: 'pending',
      currentStep: 0,
      maxSteps: w.maxSteps || 8,
    };
  }
  onProgress?.(progress);

  // Broadcast spawn events to Virtual Office
  for (const w of workers) {
    notifyVirtualOfficeSpawn(w).catch(() => {});
  }

  const deliverables: WorkerDeliverable[] = [];
  let nextWorkerIndex = 0;

  // Worker pool executor with concurrency cap of 3
  const poolWorkers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, workers.length) },
    async () => {
      while (nextWorkerIndex < workers.length) {
        const index = nextWorkerIndex++;
        const worker = workers[index];

        progress.workers[worker.id].status = 'running';
        onProgress?.(progress);

        try {
          const deliverable = await executeWorkerSubagent(worker, (step, thought) => {
            progress.workers[worker.id].currentStep = step;
            progress.workers[worker.id].lastThought = thought;
            onProgress?.(progress);
          });

          deliverables.push(deliverable);
          progress.workers[worker.id].status =
            deliverable.status === 'completed' ? 'completed' : 'failed';
        } catch (err: any) {
          const failedDeliverable: WorkerDeliverable = {
            workerId: worker.id,
            name: worker.name,
            role: worker.role,
            status: 'failed',
            summary: `Worker encountered an unhandled exception: ${err?.message || 'unknown'}`,
            stepsUsed: progress.workers[worker.id].currentStep || 1,
            durationMs: 0,
            error: err?.message || String(err),
          };
          deliverables.push(failedDeliverable);
          progress.workers[worker.id].status = 'failed';
        } finally {
          progress.completedWorkers++;
          onProgress?.(progress);
        }
      }
    }
  );

  await Promise.allSettled(poolWorkers);

  const aggregatedObservation = aggregateWorkerDeliverables(planTitle, deliverables);

  return {
    deliverables,
    aggregatedObservation,
  };
}
