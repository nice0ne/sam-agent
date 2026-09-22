/**
 * Web Search Service for SAM-Agent
 * Provides instant background web research with zero-config default engine (DuckDuckGo),
 * plus optional premium support for Brave Search and Tavily APIs.
 */

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  query: string;
  provider: 'duckduckgo' | 'brave' | 'tavily';
  results: SearchResultItem[];
  error?: string;
}

/**
 * Decode DuckDuckGo redirected URL parameter (uddg) to original URL
 */
function cleanDdgUrl(rawUrl: string): string {
  try {
    if (!rawUrl) return '';
    const fullUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
    if (fullUrl.includes('uddg=')) {
      const parsed = new URL(fullUrl.startsWith('http') ? fullUrl : `https://duckduckgo.com${fullUrl}`);
      const target = parsed.searchParams.get('uddg');
      if (target) return decodeURIComponent(target);
    }
    return fullUrl;
  } catch {
    return rawUrl;
  }
}

/**
 * Perform web search using DuckDuckGo HTML (Zero-Config, no API Key required)
 */
async function searchWithDuckDuckGo(query: string, maxResults = 6): Promise<SearchResultItem[]> {
  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    },
    body: `q=${encodeURIComponent(query)}&b=`,
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo HTTP ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const resultElements = Array.from(doc.querySelectorAll('.result, .web-result'));
  const items: SearchResultItem[] = [];

  for (const el of resultElements) {
    if (items.length >= maxResults) break;

    const titleEl = el.querySelector('.result__title a, .result__a');
    const snippetEl = el.querySelector('.result__snippet');

    const title = titleEl?.textContent?.trim() || '';
    const rawUrl = titleEl?.getAttribute('href') || '';
    const url = cleanDdgUrl(rawUrl);
    const snippet = snippetEl?.textContent?.trim() || '';

    if (title && url && !url.includes('duckduckgo.com/feedback')) {
      items.push({ title, url, snippet });
    }
  }

  // Fallback: If HTML parser found 0 results (e.g. anti-bot challenge), try Instant Answer API
  if (items.length === 0) {
    const instantRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
    if (instantRes.ok) {
      const data = await instantRes.json();
      if (data.AbstractText) {
        items.push({
          title: data.Heading || query,
          url: data.AbstractURL || 'https://duckduckgo.com',
          snippet: data.AbstractText,
        });
      }
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (items.length >= maxResults) break;
          if (topic.Text && topic.FirstURL) {
            items.push({
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }
    }
  }

  return items;
}

/**
 * Perform web search using Brave Search API
 */
async function searchWithBrave(query: string, apiKey: string, maxResults = 6): Promise<SearchResultItem[]> {
  const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey.trim(),
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Brave Search HTTP ${res.status}: ${errText.slice(0, 100) || res.statusText}`);
  }

  const data = await res.json();
  const rawItems = data.web?.results || [];

  return rawItems.slice(0, maxResults).map((r: any) => ({
    title: r.title || 'Untitled',
    url: r.url || '',
    snippet: r.description || '',
  }));
}

/**
 * Perform web search using Tavily Search API
 */
async function searchWithTavily(query: string, apiKey: string, maxResults = 6): Promise<SearchResultItem[]> {
  const endpoint = 'https://api.tavily.com/search';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey.trim(),
      query,
      max_results: maxResults,
      search_depth: 'basic',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Tavily HTTP ${res.status}: ${errText.slice(0, 100) || res.statusText}`);
  }

  const data = await res.json();
  const rawItems = data.results || [];

  return rawItems.slice(0, maxResults).map((r: any) => ({
    title: r.title || 'Untitled',
    url: r.url || '',
    snippet: r.content || '',
  }));
}

/**
 * Main Web Search Dispatcher
 * Automatically picks configured provider (Tavily/Brave) or falls back to DuckDuckGo.
 */
export async function executeWebSearch(query: string, maxResults = 6): Promise<WebSearchResponse> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      query: '',
      provider: 'duckduckgo',
      results: [],
      error: 'Search query cannot be empty.',
    };
  }

  let storageData: Record<string, any> = {};
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      storageData = await chrome.storage.local.get([
        'webSearchProvider',
        'braveApiKey',
        'tavilyApiKey',
      ]);
    }
  } catch (err) {
    console.warn('[web-search] Failed to read storage:', err);
  }

  const preferredProvider = storageData.webSearchProvider || 'auto';
  const braveKey = (storageData.braveApiKey || '').trim();
  const tavilyKey = (storageData.tavilyApiKey || '').trim();

  // 1. Tavily if selected or configured
  if ((preferredProvider === 'tavily' || (preferredProvider === 'auto' && tavilyKey)) && tavilyKey) {
    try {
      const results = await searchWithTavily(cleanQuery, tavilyKey, maxResults);
      return { query: cleanQuery, provider: 'tavily', results };
    } catch (err: any) {
      console.warn('[web-search] Tavily failed, falling back to DuckDuckGo:', err);
    }
  }

  // 2. Brave if selected or configured
  if ((preferredProvider === 'brave' || (preferredProvider === 'auto' && braveKey)) && braveKey) {
    try {
      const results = await searchWithBrave(cleanQuery, braveKey, maxResults);
      return { query: cleanQuery, provider: 'brave', results };
    } catch (err: any) {
      console.warn('[web-search] Brave Search failed, falling back to DuckDuckGo:', err);
    }
  }

  // 3. Zero-Config DuckDuckGo Default Engine
  try {
    const results = await searchWithDuckDuckGo(cleanQuery, maxResults);
    return { query: cleanQuery, provider: 'duckduckgo', results };
  } catch (err: any) {
    console.error('[web-search] DuckDuckGo search error:', err);
    return {
      query: cleanQuery,
      provider: 'duckduckgo',
      results: [],
      error: err.message || 'Failed to retrieve search results.',
    };
  }
}

/**
 * Format search results into a clean markdown string for agent observation
 */
export function formatWebSearchResults(response: WebSearchResponse): string {
  if (response.error && response.results.length === 0) {
    return `[Web Search Failed for "${response.query}"]: ${response.error}`;
  }

  if (response.results.length === 0) {
    return `[Web Search for "${response.query}"]: No results found. Try alternative keywords or visit the target site directly.`;
  }

  const lines: string[] = [
    `### 🔍 Web Search Results for "${response.query}" (${response.results.length} results via ${response.provider}):`,
  ];

  response.results.forEach((r, idx) => {
    lines.push(`${idx + 1}. **[${r.title}](${r.url})**`);
    if (r.snippet) {
      lines.push(`   ${r.snippet}`);
    }
    lines.push(`   *Source:* \`${r.url}\``);
  });

  lines.push('\nYou can answer directly based on these snippets, or emit an `openTab` action to inspect a specific URL in depth.');

  return lines.join('\n');
}
