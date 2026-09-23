/**
 * Passive Network & Console Error Sniffer for SAM-Agent
 *
 * Captures in-page XHR / Fetch API requests, HTTP status codes,
 * and JavaScript runtime errors/warnings passively without triggering
 * intrusive Chrome debugger warning banners.
 *
 * Security & Token Protection Mitigations:
 * 1. Automatic header & payload redaction (Bearer tokens, cookies, passwords, api keys).
 * 2. Strict filtering (only captures XHR/fetch endpoints, ignores images, fonts, styles).
 * 3. Truncated payloads (max 400-500 chars) to prevent context window bloat.
 * 4. Fixed-size circular ring buffer (max 50 entries) to prevent memory leaks.
 */

export interface NetworkLogEntry {
  id: string;
  url: string;
  method: string;
  status: number;
  statusText?: string;
  durationMs: number;
  timestamp: number;
  type: 'fetch' | 'xhr';
  requestHeaders?: Record<string, string>;
  requestBodySnippet?: string;
  responseSnippet?: string;
  error?: string;
}

export interface ConsoleLogEntry {
  id: string;
  level: 'error' | 'warn' | 'exception' | 'unhandledrejection';
  message: string;
  stack?: string;
  source?: string;
  timestamp: number;
}

export interface SniffFilterOptions {
  filter?: 'all' | 'failed';
  urlPattern?: string;
  limit?: number;
}

export interface ConsoleFilterOptions {
  level?: 'all' | 'error' | 'warn';
  limit?: number;
}

// Sensitive keys to redact in headers and JSON payloads
const SENSITIVE_KEY_REGEX = /(auth|bearer|token|secret|password|passwd|cookie|key|credential|creditcard|api[-_]?key)/i;

/**
 * Sanitize headers by redacting sensitive authorization, cookie, and key tokens.
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value.length > 120 ? value.slice(0, 120) + '...' : value;
    }
  }
  return sanitized;
}

/**
 * Sanitize URL query parameters that might contain API keys or auth tokens.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Sanitize string/JSON payloads to mask passwords, tokens, and secret strings.
 */
export function sanitizePayloadSnippet(rawText?: string, maxLen = 450): string | undefined {
  if (!rawText) return undefined;
  let text = rawText;

  // Redact "password": "...", "token": "...", etc.
  text = text.replace(
    /("?(?:password|token|secret|apiKey|api_key|credential|accessToken|refreshToken)"?\s*[:=]\s*)"(?:[^"\\]|\\.)*"/gi,
    '$1"[REDACTED]"'
  );

  // Redact Bearer tokens in raw strings
  text = text.replace(/Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi, 'Bearer [REDACTED]');

  if (text.length > maxLen) {
    return text.slice(0, maxLen) + '... [truncated]';
  }
  return text;
}

/**
 * In-page injection script executed in world: 'MAIN' to passively monitor
 * fetch, XMLHttpRequest, and runtime console errors.
 */
export function inPageSnifferInstaller(): void {
  const win = window as any;
  if (win.__SAM_SNIFFER_INITIALIZED__) {
    return;
  }
  win.__SAM_SNIFFER_INITIALIZED__ = true;

  const MAX_LOGS = 50;
  win.__SAM_NETWORK_LOGS__ = win.__SAM_NETWORK_LOGS__ || [];
  win.__SAM_CONSOLE_LOGS__ = win.__SAM_CONSOLE_LOGS__ || [];

  function pushNetwork(entry: any) {
    win.__SAM_NETWORK_LOGS__.push(entry);
    if (win.__SAM_NETWORK_LOGS__.length > MAX_LOGS) {
      win.__SAM_NETWORK_LOGS__.shift();
    }
  }

  function pushConsole(entry: any) {
    win.__SAM_CONSOLE_LOGS__.push(entry);
    if (win.__SAM_CONSOLE_LOGS__.length > MAX_LOGS) {
      win.__SAM_CONSOLE_LOGS__.shift();
    }
  }

  // 1. Hook window.fetch
  if (typeof win.fetch === 'function') {
    const origFetch = win.fetch;
    win.fetch = async function (...args: any[]) {
      const startTime = performance.now();
      const reqInput = args[0];
      const reqInit = args[1] || {};

      let url = typeof reqInput === 'string' ? reqInput : reqInput?.url || '';
      let method = (reqInit.method || (typeof reqInput === 'object' ? reqInput.method : 'GET') || 'GET').toUpperCase();
      let bodySnippet: string | undefined;

      try {
        if (typeof reqInit.body === 'string') {
          bodySnippet = reqInit.body.slice(0, 450);
        } else if (reqInit.body instanceof FormData) {
          bodySnippet = '[FormData payload]';
        }
      } catch (_) {}

      try {
        const response = await origFetch.apply(this, args);
        const durationMs = Math.round(performance.now() - startTime);

        // Read response body snippet passively without consuming the original body stream
        let resSnippet: string | undefined;
        try {
          const clone = response.clone();
          const contentType = clone.headers.get('content-type') || '';
          if (contentType.includes('json') || contentType.includes('text') || contentType.includes('xml')) {
            clone.text().then((txt: string) => {
              if (txt) {
                resSnippet = txt.slice(0, 500);
                pushNetwork({
                  id: `fetch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  url,
                  method,
                  status: response.status,
                  statusText: response.statusText,
                  durationMs,
                  timestamp: Date.now(),
                  type: 'fetch',
                  requestBodySnippet: bodySnippet,
                  responseSnippet: resSnippet,
                });
              }
            }).catch(() => {});
            return response;
          }
        } catch (_) {}

        pushNetwork({
          id: `fetch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          url,
          method,
          status: response.status,
          statusText: response.statusText,
          durationMs,
          timestamp: Date.now(),
          type: 'fetch',
          requestBodySnippet: bodySnippet,
          responseSnippet: resSnippet,
        });

        return response;
      } catch (err: any) {
        const durationMs = Math.round(performance.now() - startTime);
        pushNetwork({
          id: `fetch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          url,
          method,
          status: 0,
          statusText: 'Network Error',
          durationMs,
          timestamp: Date.now(),
          type: 'fetch',
          requestBodySnippet: bodySnippet,
          error: err?.message || 'Fetch failed',
        });
        throw err;
      }
    };
  }

  // 2. Hook XMLHttpRequest
  if (win.XMLHttpRequest) {
    const origOpen = win.XMLHttpRequest.prototype.open;
    const origSend = win.XMLHttpRequest.prototype.send;

    win.XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: any[]) {
      this.__sam_meta = {
        method: (method || 'GET').toUpperCase(),
        url: String(url),
        startTime: 0,
      };
      return origOpen.apply(this, [method, url, ...rest] as any);
    };

    win.XMLHttpRequest.prototype.send = function (body?: any) {
      if (this.__sam_meta) {
        this.__sam_meta.startTime = performance.now();
        if (typeof body === 'string') {
          this.__sam_meta.bodySnippet = body.slice(0, 450);
        }

        this.addEventListener('loadend', () => {
          try {
            const meta = this.__sam_meta || {};
            const durationMs = meta.startTime ? Math.round(performance.now() - meta.startTime) : 0;
            let resSnippet: string | undefined;
            if (this.responseType === '' || this.responseType === 'text') {
              resSnippet = (this.responseText || '').slice(0, 500);
            }

            pushNetwork({
              id: `xhr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              url: meta.url || '',
              method: meta.method || 'GET',
              status: this.status,
              statusText: this.statusText,
              durationMs,
              timestamp: Date.now(),
              type: 'xhr',
              requestBodySnippet: meta.bodySnippet,
              responseSnippet: resSnippet,
            });
          } catch (_) {}
        });
      }
      return origSend.apply(this, [body] as any);
    };
  }

  // 3. Hook Console Errors & Warnings
  if (win.console) {
    const origError = win.console.error;
    const origWarn = win.console.warn;

    win.console.error = function (...args: any[]) {
      try {
        const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        pushConsole({
          id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          level: 'error',
          message: msg.slice(0, 500),
          timestamp: Date.now(),
        });
      } catch (_) {}
      return origError.apply(this, args);
    };

    win.console.warn = function (...args: any[]) {
      try {
        const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        pushConsole({
          id: `warn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          level: 'warn',
          message: msg.slice(0, 500),
          timestamp: Date.now(),
        });
      } catch (_) {}
      return origWarn.apply(this, args);
    };
  }

  // 4. Hook Unhandled Window Exceptions & Promise Rejections
  win.addEventListener('error', (event: ErrorEvent) => {
    try {
      pushConsole({
        id: `exc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        level: 'exception',
        message: event.message || 'Script error',
        stack: event.error?.stack?.slice(0, 400),
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
        timestamp: Date.now(),
      });
    } catch (_) {}
  });

  win.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    try {
      const reason = event.reason;
      const msg = typeof reason === 'object' ? reason?.message || JSON.stringify(reason) : String(reason);
      pushConsole({
        id: `rej-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        level: 'unhandledrejection',
        message: (msg || 'Unhandled Promise Rejection').slice(0, 500),
        stack: reason?.stack?.slice(0, 400),
        timestamp: Date.now(),
      });
    } catch (_) {}
  });
}

/**
 * In-page reader function executed in world: 'MAIN' to read
 * logged entries from the circular buffers.
 */
export function inPageSnifferReader(payload: {
  getNetwork?: boolean;
  getConsole?: boolean;
  filter?: 'all' | 'failed';
  urlPattern?: string;
  limit?: number;
}): { networkLogs: NetworkLogEntry[]; consoleLogs: ConsoleLogEntry[] } {
  const win = window as any;
  const rawNet: NetworkLogEntry[] = win.__SAM_NETWORK_LOGS__ || [];
  const rawConsole: ConsoleLogEntry[] = win.__SAM_CONSOLE_LOGS__ || [];

  let networkLogs: NetworkLogEntry[] = [];
  if (payload.getNetwork) {
    let filtered = rawNet;
    if (payload.filter === 'failed') {
      filtered = filtered.filter((n) => n.status === 0 || n.status >= 400 || !!n.error);
    }
    if (payload.urlPattern) {
      const pat = payload.urlPattern.toLowerCase();
      filtered = filtered.filter((n) => n.url.toLowerCase().includes(pat));
    }
    const lim = payload.limit || 10;
    networkLogs = filtered.slice(-lim);
  }

  let consoleLogs: ConsoleLogEntry[] = [];
  if (payload.getConsole) {
    const lim = payload.limit || 10;
    consoleLogs = rawConsole.slice(-lim);
  }

  return { networkLogs, consoleLogs };
}

/**
 * Ensure the passive sniffer is hooked into the target browser tab.
 */
export async function installSnifferInTab(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: inPageSnifferInstaller,
    });
  } catch (err) {
    // Ignore restricted page injection errors
  }
}

/**
 * Query network logs from the active tab with privacy redactions applied.
 */
export async function sniffTabNetwork(
  tabId: number,
  options: SniffFilterOptions = {}
): Promise<{ success: boolean; logs: NetworkLogEntry[]; message: string }> {
  try {
    await installSnifferInTab(tabId);

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: inPageSnifferReader,
      args: [
        {
          getNetwork: true,
          getConsole: false,
          filter: options.filter || 'all',
          urlPattern: options.urlPattern,
          limit: options.limit || 10,
        },
      ],
    });

    const data = results?.[0]?.result;
    const rawLogs: NetworkLogEntry[] = data?.networkLogs || [];

    // Apply security & token redaction on all extracted logs
    const sanitizedLogs = rawLogs.map((log) => ({
      ...log,
      url: sanitizeUrl(log.url),
      requestHeaders: log.requestHeaders ? sanitizeHeaders(log.requestHeaders) : undefined,
      requestBodySnippet: sanitizePayloadSnippet(log.requestBodySnippet),
      responseSnippet: sanitizePayloadSnippet(log.responseSnippet),
    }));

    return {
      success: true,
      logs: sanitizedLogs,
      message:
        sanitizedLogs.length === 0
          ? 'No matching network requests found in buffer (buffer holds the last 50 XHR/Fetch API calls).'
          : `Captured ${sanitizedLogs.length} network API requests (sanitized, token-safe).`,
    };
  } catch (err: any) {
    return {
      success: false,
      logs: [],
      message: `Failed to sniff network: ${err?.message || 'Script injection error'}`,
    };
  }
}

/**
 * Query runtime console errors and warnings from the active tab.
 */
export async function readTabConsoleErrors(
  tabId: number,
  options: ConsoleFilterOptions = {}
): Promise<{ success: boolean; logs: ConsoleLogEntry[]; message: string }> {
  try {
    await installSnifferInTab(tabId);

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: inPageSnifferReader,
      args: [
        {
          getNetwork: false,
          getConsole: true,
          limit: options.limit || 10,
        },
      ],
    });

    const data = results?.[0]?.result;
    let rawLogs: ConsoleLogEntry[] = data?.consoleLogs || [];

    if (options.level && options.level !== 'all') {
      rawLogs = rawLogs.filter((c) =>
        options.level === 'error'
          ? c.level === 'error' || c.level === 'exception' || c.level === 'unhandledrejection'
          : c.level === options.level
      );
    }

    const sanitizedLogs = rawLogs.map((log) => ({
      ...log,
      message: sanitizePayloadSnippet(log.message, 350) || log.message,
    }));

    return {
      success: true,
      logs: sanitizedLogs,
      message:
        sanitizedLogs.length === 0
          ? 'No console errors or unhandled exceptions recorded in buffer.'
          : `Captured ${sanitizedLogs.length} console error/warning events.`,
    };
  } catch (err: any) {
    return {
      success: false,
      logs: [],
      message: `Failed to read console errors: ${err?.message || 'Script injection error'}`,
    };
  }
}

/**
 * Formats captured network requests for LLM observation context.
 */
export function formatNetworkLogsPrompt(logs: NetworkLogEntry[]): string {
  if (!logs || logs.length === 0) {
    return 'No network XHR/Fetch calls detected.';
  }

  const lines = logs.map((n, i) => {
    const statusLabel =
      n.status === 0
        ? '🔴 [NETWORK FAILURE / CORS]'
        : n.status >= 400
        ? `🔴 HTTP ${n.status} ${n.statusText || 'Error'}`
        : `🟢 HTTP ${n.status} ${n.statusText || 'OK'}`;

    let details = `${i + 1}. ${statusLabel} ${n.method} ${n.url} (${n.durationMs}ms)`;
    if (n.requestBodySnippet) {
      details += `\n   Payload: ${n.requestBodySnippet}`;
    }
    if (n.responseSnippet) {
      details += `\n   Response: ${n.responseSnippet}`;
    }
    if (n.error) {
      details += `\n   Error: ${n.error}`;
    }
    return details;
  });

  return `[Recent Network Requests (Filtered & Token-Safe)]:\n${lines.join('\n\n')}`;
}

/**
 * Formats captured console logs for LLM observation context.
 */
export function formatConsoleErrorsPrompt(logs: ConsoleLogEntry[]): string {
  if (!logs || logs.length === 0) {
    return 'No console errors or unhandled exceptions detected on page.';
  }

  const lines = logs.map((c, i) => {
    const badge =
      c.level === 'error' || c.level === 'exception' || c.level === 'unhandledrejection' ? '🔴' : '🟡';
    let detail = `${i + 1}. ${badge} [${c.level.toUpperCase()}]: ${c.message}`;
    if (c.source) {
      detail += `\n   Location: ${c.source}`;
    }
    if (c.stack) {
      detail += `\n   Stack: ${c.stack.split('\n').slice(0, 2).join(' ')}`;
    }
    return detail;
  });

  return `[Recent Console Errors & Warnings]:\n${lines.join('\n')}`;
}
