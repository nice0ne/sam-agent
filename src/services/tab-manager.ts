export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  isRestricted: boolean;
}

const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'view-source:',
  'chrome.google.com/webstore',
  'chromewebstore.google.com',
];

/**
 * Checks whether a URL is a restricted browser internal or webstore page
 */
export function isRestrictedTabUrl(rawUrl: string): boolean {
  const lower = (rawUrl || '').toLowerCase();
  return (
    RESTRICTED_PREFIXES.some((p) => lower.startsWith(p)) ||
    lower.includes('chromewebstore.google.com') ||
    lower.includes('chrome.google.com/webstore')
  );
}

/**
 * Retrieve all open tabs in the current Chrome window
 */
export async function getOpenTabs(): Promise<TabInfo[]> {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs
      .filter((t): t is chrome.tabs.Tab & { id: number } => typeof t.id === 'number')
      .map((t) => {
        const rawUrl = t.url || '';
        const isRestricted = isRestrictedTabUrl(rawUrl);

        // Strip noisy utm_* tracking parameters from URL
        let cleanUrl = rawUrl;
        try {
          const parsed = new URL(rawUrl);
          const keysToRemove = Array.from(parsed.searchParams.keys()).filter((k) =>
            k.toLowerCase().startsWith('utm_')
          );
          keysToRemove.forEach((k) => parsed.searchParams.delete(k));
          cleanUrl = parsed.toString();
        } catch (_) {}

        return {
          id: t.id,
          title: (t.title || 'Untitled Tab').slice(0, 70),
          url: cleanUrl,
          favIconUrl: t.favIconUrl,
          active: Boolean(t.active),
          isRestricted,
        };
      });
  } catch (err) {
    console.warn('[tab-manager] Failed to query open tabs:', err);
    return [];
  }
}

/**
 * Format open tabs list into a compact token-optimized prompt block
 */
export function formatOpenTabsPrompt(tabs: TabInfo[]): string {
  if (tabs.length <= 1) return '';

  const lines = tabs.map((t) => {
    const activeFlag = t.active ? ' (ACTIVE CURRENT TAB)' : '';
    const restrictedFlag = t.isRestricted ? ' [Restricted Browser Page]' : '';
    return `- [Tab ID: ${t.id}]${activeFlag}${restrictedFlag} "${t.title}" | ${t.url.slice(0, 90)}`;
  });

  return `### OPEN BROWSER TABS IN CURRENT WINDOW:\n${lines.join('\n')}\n\nYou can switch to any tab using action: \`\`\`action\n[ { "action": "switchTab", "tabId": 123 } ]\n\`\`\` or close a tab using \`\`\`action\n[ { "action": "closeTab", "tabId": 123 } ]\n\`\`\``;
}

/**
 * Switch active browser tab by Tab ID or title/url search match
 */
export async function switchToTab(
  target: number | string
): Promise<{ success: boolean; tabId?: number; message: string }> {
  try {
    const openTabs = await chrome.tabs.query({ currentWindow: true });

    let matchedTab: chrome.tabs.Tab | undefined;
    if (typeof target === 'number') {
      matchedTab = openTabs.find((t) => t.id === target);
    } else {
      const q = target.toLowerCase();
      matchedTab = openTabs.find(
        (t) =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.url && t.url.toLowerCase().includes(q))
      );
    }

    if (!matchedTab || typeof matchedTab.id !== 'number') {
      return {
        success: false,
        message: `Tab matching '${target}' was not found. Current open tabs: ${openTabs.map((t) => `[${t.id}: ${t.title?.slice(0, 25)}]`).join(', ')}`,
      };
    }

    await chrome.tabs.update(matchedTab.id, { active: true });
    if (matchedTab.windowId) {
      await chrome.windows.update(matchedTab.windowId, { focused: true }).catch(() => {});
    }

    // Brief stabilization wait
    await new Promise((r) => setTimeout(r, 600));

    return {
      success: true,
      tabId: matchedTab.id,
      message: `Switched active tab to: [${matchedTab.id}] "${matchedTab.title || 'Tab'}"`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to switch tab: ${err.message || 'Unknown error'}`,
    };
  }
}

/**
 * Close a specific browser tab by ID
 */
export async function closeBrowserTab(
  tabId: number
): Promise<{ success: boolean; message: string }> {
  try {
    await chrome.tabs.remove(tabId);
    return {
      success: true,
      message: `Closed tab [${tabId}] successfully.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to close tab [${tabId}]: ${err.message || 'Tab may already be closed'}`,
    };
  }
}
