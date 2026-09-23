/**
 * Parallel Multi-Tab Orchestrator & Batch Scraper for SAM-Agent
 *
 * Enables the AI agent to open multiple tabs concurrently (e.g. comparing prices
 * across multiple e-commerce sites or scraping 3-5 research articles simultaneously),
 * execute in-page content extraction in parallel, and aggregate the results.
 *
 * Performance, RAM & Token Protection Mitigations:
 * 1. Strict Concurrency Cap: Max 4 concurrent tabs to prevent Chrome RAM spikes.
 * 2. Automatic Resource Cleanup: Tabs opened for batch scraping are automatically
 *    closed immediately once extraction finishes (autoCloseTabs: true by default).
 * 3. Token-Optimized Summaries: Extracted content per tab is sanitized and truncated
 *    to concise headings and key paragraphs (~500-800 words per tab).
 * 4. Resilient per-tab timeouts: Each tab has an independent timeout to ensure
 *    one slow or failing domain does not stall the entire batch.
 */

import { isRestrictedTabUrl } from './tab-manager';

export interface ParallelTabTarget {
  url: string;
  name?: string;
  extractSelector?: string;
}

export interface ParallelTabResult {
  url: string;
  name?: string;
  tabId?: number;
  success: boolean;
  title: string;
  extractedText: string;
  error?: string;
  durationMs: number;
}

export interface ParallelTabsOptions {
  targets: (string | ParallelTabTarget)[];
  concurrency?: number;
  autoCloseTabs?: boolean;
  timeoutMs?: number;
  extractSelector?: string;
}

const MAX_CONCURRENT_TABS = 4;
const DEFAULT_TAB_TIMEOUT_MS = 12000;

/**
 * In-page scraper function injected into target tab to extract clean content
 */
function inPageParallelScraper(customSelector?: string): { title: string; text: string } {
  const title = document.title || '';
  let targetEl: HTMLElement | null = null;

  if (customSelector) {
    try {
      targetEl = document.querySelector(customSelector) as HTMLElement;
    } catch (_) {}
  }

  if (!targetEl) {
    targetEl = (document.querySelector('main, article, #content, .content, #main') as HTMLElement) || document.body;
  }

  if (!targetEl) {
    return { title, text: '' };
  }

  const clone = targetEl.cloneNode(true) as HTMLElement;
  const junkSelectors = [
    'script',
    'style',
    'noscript',
    'svg',
    'iframe',
    'nav',
    'footer',
    'header',
    '.ad',
    '.ads',
    '.cookie-banner',
    '#cookie-notice',
  ];
  junkSelectors.forEach((sel) => {
    clone.querySelectorAll(sel).forEach((el) => el.remove());
  });

  let text = clone.innerText || clone.textContent || '';
  text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();

  // Limit per-tab text to 3500 chars (~600 words) for token economy
  if (text.length > 3500) {
    text = text.slice(0, 3500) + '... [Content truncated for parallel summary]';
  }

  return { title, text };
}

/**
 * Wait for a created tab to reach 'complete' status with a deadline
 */
async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        // Additional pause for dynamic DOM hydration
        await new Promise((r) => setTimeout(r, 1200));
        return;
      }
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * Scrapes a single tab asynchronously
 */
async function processSingleParallelTab(
  target: ParallelTabTarget,
  timeoutMs: number,
  autoClose: boolean
): Promise<ParallelTabResult> {
  const start = performance.now();
  let createdTabId: number | undefined;

  try {
    if (isRestrictedTabUrl(target.url)) {
      return {
        url: target.url,
        name: target.name,
        success: false,
        title: 'Restricted URL',
        extractedText: '',
        error: 'Cannot scrape restricted browser internal or webstore URL.',
        durationMs: Math.round(performance.now() - start),
      };
    }

    // Create background tab (active: false so it doesn't hijack user focus)
    const newTab = await chrome.tabs.create({
      url: target.url,
      active: false,
    });

    createdTabId = newTab.id;
    if (!createdTabId) {
      throw new Error('Failed to create background tab');
    }

    // Wait for page to load
    await waitForTabComplete(createdTabId, timeoutMs);

    // Inject scraper
    const results = await chrome.scripting.executeScript({
      target: { tabId: createdTabId },
      func: inPageParallelScraper,
      args: [target.extractSelector],
    });

    const scraped = results?.[0]?.result || { title: '', text: '' };
    const durationMs = Math.round(performance.now() - start);

    return {
      url: target.url,
      name: target.name,
      tabId: createdTabId,
      success: true,
      title: scraped.title,
      extractedText: scraped.text,
      durationMs,
    };
  } catch (err: any) {
    return {
      url: target.url,
      name: target.name,
      tabId: createdTabId,
      success: false,
      title: '',
      extractedText: '',
      error: err?.message || 'Scraping failed',
      durationMs: Math.round(performance.now() - start),
    };
  } finally {
    // Auto cleanup tab if configured
    if (autoClose && createdTabId) {
      try {
        await chrome.tabs.remove(createdTabId);
      } catch (_) {}
    }
  }
}

/**
 * Orchestrates parallel tab opening and batch scraping with a strict concurrency limit
 */
export async function executeParallelTabs(
  options: ParallelTabsOptions
): Promise<{ success: boolean; results: ParallelTabResult[]; message: string }> {
  const normalizedTargets: ParallelTabTarget[] = (options.targets || []).map((t) => {
    if (typeof t === 'string') {
      return { url: t };
    }
    return t;
  });

  if (normalizedTargets.length === 0) {
    return {
      success: false,
      results: [],
      message: 'No target URLs provided for parallel tab execution.',
    };
  }

  const concurrency = Math.min(
    Math.max(options.concurrency || 3, 1),
    MAX_CONCURRENT_TABS
  );
  const timeoutMs = options.timeoutMs || DEFAULT_TAB_TIMEOUT_MS;
  const autoClose = options.autoCloseTabs !== false; // Default true for memory safety

  const allResults: ParallelTabResult[] = [];
  const queue = [...normalizedTargets];

  // Run in chunks matching concurrency limit
  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const batchPromises = batch.map((target) =>
      processSingleParallelTab(target, timeoutMs, autoClose)
    );
    const batchResults = await Promise.all(batchPromises);
    allResults.push(...batchResults);
  }

  const successCount = allResults.filter((r) => r.success).length;
  const summaryMsg = `Parallel execution finished: ${successCount}/${allResults.length} tabs scraped successfully (${autoClose ? 'background tabs auto-closed' : 'tabs kept open'}).`;

  return {
    success: successCount > 0,
    results: allResults,
    message: summaryMsg,
  };
}

/**
 * Formats parallel tab results into a prompt observation for the LLM
 */
export function formatParallelTabsPrompt(results: ParallelTabResult[]): string {
  if (!results || results.length === 0) {
    return 'No parallel tab results available.';
  }

  const sections = results.map((r, i) => {
    const label = r.name ? `[${r.name}] ` : '';
    const statusIcon = r.success ? '🟢' : '🔴';
    let block = `### Tab ${i + 1}: ${statusIcon} ${label}${r.title || r.url}\nURL: ${r.url} (${r.durationMs}ms)`;

    if (r.error) {
      block += `\nError: ${r.error}`;
    } else if (r.extractedText) {
      block += `\n\n${r.extractedText}`;
    } else {
      block += '\n(No readable text content extracted)';
    }

    return block;
  });

  return `[PARALLEL MULTI-TAB EXTRACTION OBSERVATION]:\n\n${sections.join('\n\n---\n\n')}`;
}
