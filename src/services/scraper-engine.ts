/**
 * Scraper Engine Service
 *
 * Handles DOM data extraction based on configured schemas,
 * multi-page crawling with delay, pagination via next button or infinite scroll,
 * and data format conversions (CSV, JSON).
 */

import {
  CrawlProgress,
  ScrapeResult,
  ScraperSchema,
} from '../../entrypoints/web-scraper.content/types';

/**
 * Utility helper to pause execution for a given milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts data rows from a Document according to the given ScraperSchema
 */
export function extractPageRows(
  doc: Document,
  schema: ScraperSchema
): Record<string, any>[] {
  if (!schema.containerSelector) return [];

  let containerElements: HTMLElement[] = [];
  try {
    containerElements = Array.from(
      doc.querySelectorAll<HTMLElement>(schema.containerSelector)
    );
  } catch (err) {
    console.error('[ScraperEngine] Invalid container selector:', schema.containerSelector, err);
    return [];
  }

  const rows: Record<string, any>[] = [];

  for (const container of containerElements) {
    const row: Record<string, any> = {};

    for (const field of schema.fields) {
      let targetEl: HTMLElement | null = null;

      if (!field.selector || field.selector === ':scope' || field.selector === '.') {
        targetEl = container;
      } else {
        try {
          targetEl = container.querySelector<HTMLElement>(field.selector);
        } catch (_) {
          targetEl = null;
        }
      }

      if (!targetEl) {
        row[field.name] = null;
        continue;
      }

      let rawVal: any = '';

      switch (field.attribute) {
        case 'href': {
          let href = targetEl.getAttribute('href') || (targetEl as HTMLAnchorElement).href || '';
          if (href && doc.baseURI) {
            try {
              href = new URL(href, doc.baseURI).href;
            } catch (_) {}
          }
          rawVal = href;
          break;
        }

        case 'src': {
          let src =
            targetEl.getAttribute('src') ||
            targetEl.getAttribute('data-src') ||
            targetEl.getAttribute('data-original') ||
            targetEl.getAttribute('data-lazy-src') ||
            (targetEl as HTMLImageElement).src ||
            '';

          // Check srcset fallback if src is not found
          if (!src && targetEl.getAttribute('srcset')) {
            const srcset = targetEl.getAttribute('srcset')!;
            const candidates = srcset
              .split(',')
              .map((s) => s.trim().split(' ')[0])
              .filter(Boolean);
            if (candidates.length > 0) {
              src = candidates[candidates.length - 1];
            }
          }

          if (src && doc.baseURI) {
            try {
              src = new URL(src, doc.baseURI).href;
            } catch (_) {}
          }
          rawVal = src;
          break;
        }

        case 'value': {
          const inputEl = targetEl as HTMLInputElement;
          rawVal = inputEl.value !== undefined ? inputEl.value : targetEl.getAttribute('value') || '';
          break;
        }

        case 'text':
        default: {
          const text = targetEl.innerText !== undefined ? targetEl.innerText : targetEl.textContent || '';
          rawVal = text.trim();
          break;
        }
      }

      // Apply type normalization
      if (typeof rawVal === 'string') {
        if (field.type === 'number') {
          const cleanNum = rawVal.replace(/[^\d.-]/g, '');
          const parsed = parseFloat(cleanNum);
          row[field.name] = isNaN(parsed) ? rawVal : parsed;
        } else if (field.type === 'currency') {
          // Normalize whitespace and preserve clean currency string
          row[field.name] = rawVal.replace(/\s+/g, ' ').trim();
        } else if (field.type === 'url') {
          if (rawVal && doc.baseURI) {
            try {
              row[field.name] = new URL(rawVal, doc.baseURI).href;
            } catch (_) {
              row[field.name] = rawVal;
            }
          } else {
            row[field.name] = rawVal;
          }
        } else {
          row[field.name] = rawVal.replace(/\s+/g, ' ').trim();
        }
      } else {
        row[field.name] = rawVal;
      }
    }

    rows.push(row);
  }

  return rows;
}

export interface MultiPageCrawlOptions {
  doc?: Document;
  win?: Window;
  onProgress?: (progress: CrawlProgress) => void;
  shouldStop?: () => boolean;
}

/**
 * Executes a multi-page crawl handling Next button navigation,
 * infinite scroll pagination, and configurable crawl delays.
 */
export async function runMultiPageCrawl(
  schema: ScraperSchema,
  options?: MultiPageCrawlOptions
): Promise<ScrapeResult> {
  const doc = options?.doc || (typeof document !== 'undefined' ? document : ({} as Document));
  const win = options?.win || (typeof window !== 'undefined' ? window : ({} as Window));
  const delayMs = schema.delayMs > 0 ? schema.delayMs : 1500;
  const maxPages = schema.maxPages > 0 ? schema.maxPages : 1;
  const domain = doc.location?.hostname || '';

  const allRows: Record<string, any>[] = [];
  const seenKeys = new Set<string>();

  const appendRows = (newRows: Record<string, any>[]): number => {
    let added = 0;
    for (const r of newRows) {
      const key = JSON.stringify(r);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allRows.push(r);
        added++;
      }
    }
    return added;
  };

  // Case 1: No pagination
  if (schema.paginationMode === 'none' || maxPages <= 1) {
    const pageRows = extractPageRows(doc, schema);
    appendRows(pageRows);
    options?.onProgress?.({
      page: 1,
      rows: allRows.length,
      rowsCount: allRows.length,
      status: 'done',
      message: `Extracted ${allRows.length} rows.`,
    });
    return {
      rows: allRows,
      totalRows: allRows.length,
      pagesCrawled: 1,
      domain,
    };
  }

  // Case 2: Next Button pagination
  if (schema.paginationMode === 'next-button') {
    let currentPage = 1;

    while (currentPage <= maxPages) {
      if (options?.shouldStop?.()) {
        options?.onProgress?.({
          page: currentPage,
        rows: allRows.length,
        rowsCount: allRows.length,
          status: 'stopped',
          message: 'Crawl stopped by user.',
        });
        break;
      }

      const pageRows = extractPageRows(doc, schema);
      appendRows(pageRows);

      options?.onProgress?.({
        page: currentPage,
        rows: allRows.length,
      rowsCount: allRows.length,
        status: 'crawling',
        message: `Crawled page ${currentPage} (${allRows.length} total rows)`,
      });

      if (currentPage >= maxPages) break;

      // Locate next button
      if (!schema.nextButtonSelector) break;
      let nextBtn: HTMLElement | null = null;
      try {
        nextBtn = doc.querySelector<HTMLElement>(schema.nextButtonSelector);
      } catch (_) {
        nextBtn = null;
      }

      if (!nextBtn) {
        options?.onProgress?.({
          page: currentPage,
        rows: allRows.length,
        rowsCount: allRows.length,
          status: 'done',
          message: `Next button not found. Finished at page ${currentPage}.`,
        });
        break;
      }

      const isDisabled =
        nextBtn.hasAttribute('disabled') ||
        nextBtn.getAttribute('aria-disabled') === 'true' ||
        nextBtn.classList.contains('disabled');

      if (isDisabled) {
        options?.onProgress?.({
          page: currentPage,
        rows: allRows.length,
        rowsCount: allRows.length,
          status: 'done',
          message: `Next button is disabled. Finished at page ${currentPage}.`,
        });
        break;
      }

      options?.onProgress?.({
        page: currentPage,
        rows: allRows.length,
      rowsCount: allRows.length,
        status: 'clicking_next',
        message: `Clicking next button for page ${currentPage + 1}...`,
      });

      if (typeof nextBtn.scrollIntoView === 'function') {
        nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      await sleep(200);

      nextBtn.click();
      currentPage++;
      await sleep(delayMs);
    }

    return {
      rows: allRows,
      totalRows: allRows.length,
      pagesCrawled: currentPage,
      domain,
    };
  }

  // Case 3: Infinite scroll pagination
  if (schema.paginationMode === 'infinite-scroll') {
    let scrollPage = 1;
    let consecutiveNoNewRows = 0;

    while (scrollPage <= maxPages) {
      if (options?.shouldStop?.()) {
        options?.onProgress?.({
          page: scrollPage,
        rows: allRows.length,
        rowsCount: allRows.length,
          status: 'stopped',
          message: 'Crawl stopped by user.',
        });
        break;
      }

      const currentRows = extractPageRows(doc, schema);
      const newlyAdded = appendRows(currentRows);

      options?.onProgress?.({
        page: scrollPage,
        rows: allRows.length,
      rowsCount: allRows.length,
        status: 'crawling',
        message: `Scrolled page ${scrollPage} (${allRows.length} total rows)`,
      });

      if (scrollPage >= maxPages) break;

      if (newlyAdded === 0 && scrollPage > 1) {
        consecutiveNoNewRows++;
        if (consecutiveNoNewRows >= 2) {
          options?.onProgress?.({
            page: scrollPage,
          rows: allRows.length,
        rowsCount: allRows.length,
            status: 'done',
            message: `No new items loaded after scroll. Finished at page ${scrollPage}.`,
          });
          break;
        }
      } else {
        consecutiveNoNewRows = 0;
      }

      options?.onProgress?.({
        page: scrollPage,
        rowsCount: allRows.length,
        status: 'scrolling',
        message: `Scrolling down for page ${scrollPage + 1}...`,
      });

      if (typeof win.scrollTo === 'function') {
        const scrollHeight =
          doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 10000;
        win.scrollTo({ top: scrollHeight, behavior: 'smooth' });
      }

      scrollPage++;
      await sleep(delayMs);
    }

    return {
      rows: allRows,
      totalRows: allRows.length,
      pagesCrawled: scrollPage,
      domain,
    };
  }

  return {
    rows: allRows,
    totalRows: allRows.length,
    pagesCrawled: 1,
    domain,
  };
}

/**
 * Converts scrape rows into CSV formatted string
 */
export function convertRowsToCsv(rows: Record<string, any>[]): string {
  if (!rows || rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerRow = headers.map(escapeCsv).join(',');
  const dataRows = rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(','));

  return [headerRow, ...dataRows].join('\r\n');
}

/**
 * Converts scrape rows into formatted JSON string
 */
export function convertRowsToJson(rows: Record<string, any>[]): string {
  return JSON.stringify(rows, null, 2);
}
