# Multi-Tab Pipeline & Cross-Tab Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable bidirectional cross-tab orchestration for SAM-Agent (discover open tabs, switch between tabs, close tabs, execute multi-tab data pipelines, and display live tab pills in UI).

**Architecture:** Dedicated `tab-manager.ts` service interacting with Chrome Tabs API, integrated into `page-actions.ts` and `chat-runner.ts` execution loop, with an `ActiveTabStrip` component rendered in `ChatView`.

**Tech Stack:** React 19, TypeScript, Chrome Tabs & Windows API, Tailwind CSS v4, Lucide Icons.

**Spec:** `docs/superpowers/specs/2026-09-12-multi-tab-pipeline-orchestration-design.md`

## Global Constraints
- Target workspace: `E:\VIBE-CODE-WS\CHROME-EXT\3.1.34_0\rebuild-ui`
- Zero TypeScript compiler errors (`npm run compile` must pass with code 0).
- Clean handling of restricted internal browser pages (`chrome://`, `chrome-extension://`).
- Active visual tab switching whenever agent switches or opens tabs.

---

### Task 1: Tab Discovery & Management Service (`src/services/tab-manager.ts`)

**Files:**
- Create: `src/services/tab-manager.ts`

**Interfaces:**
- Produces:
  - `export interface TabInfo { id: number; title: string; url: string; favIconUrl?: string; active: boolean; isRestricted: boolean; }`
  - `getOpenTabs(): Promise<TabInfo[]>`
  - `formatOpenTabsPrompt(tabs: TabInfo[]): string`
  - `switchToTab(target: number | string): Promise<{ success: boolean; tabId?: number; message: string }>`
  - `closeBrowserTab(tabId: number): Promise<{ success: boolean; message: string }>`

- [x] **Step 1: Create `src/services/tab-manager.ts`**

```typescript
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
 * Retrieve all open tabs in the current Chrome window
 */
export async function getOpenTabs(): Promise<TabInfo[]> {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs
      .filter((t): t is chrome.tabs.Tab & { id: number } => typeof t.id === 'number')
      .map((t) => {
        const rawUrl = t.url || '';
        const isRestricted = RESTRICTED_PREFIXES.some((p) => rawUrl.toLowerCase().startsWith(p));
        // Strip noisy tracking parameters from URL
        let cleanUrl = rawUrl;
        try {
          const parsed = new URL(rawUrl);
          parsed.searchParams.delete('utm_source');
          parsed.searchParams.delete('utm_medium');
          parsed.searchParams.delete('utm_campaign');
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
        (t) => (t.title && t.title.toLowerCase().includes(q)) || (t.url && t.url.toLowerCase().includes(q))
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
```

- [x] **Step 2: Verify with TypeScript compiler**

Run: `npm run compile` in `rebuild-ui`
Expected: 0 errors.

---

### Task 2: Action Engine Extensions (`src/services/page-actions.ts`)

**Files:**
- Modify: `src/services/page-actions.ts`

**Interfaces:**
- Consumes: `switchToTab`, `closeBrowserTab` from `./tab-manager`
- Produces: Updated `BrowserAction` supporting `switchTab`, `closeTab`, and enriched `openTab`.

- [ ] **Step 1: Add new actions to `BrowserAction` union**

In `src/services/page-actions.ts`:
```typescript
export type BrowserAction =
  | { action: 'navigate'; url: string }
  | { action: 'openTab'; url: string; active?: boolean }
  | { action: 'switchTab'; tabId?: number; match?: string }
  | { action: 'closeTab'; tabId: number }
  | { action: 'click'; selector?: string; xpath?: string }
  | { action: 'fill'; selector: string; value: string; submit?: boolean }
  | { action: 'select'; selector: string; value: string }
  | { action: 'press_key'; key: string; selector?: string }
  | { action: 'play' }
  | { action: 'writeFile'; path: string; content: string }
  | { action: 'eval'; code: string };
```

- [ ] **Step 2: Implement execution handlers in `executePageAction`**

Inside `executePageAction(tabId: number, act: BrowserAction)`:
- Handle `act.action === 'switchTab'`:
  - Calls `switchToTab(act.tabId ?? act.match ?? '')`.
  - Returns `ActionResult` with target tab details.
- Handle `act.action === 'closeTab'`:
  - Calls `closeBrowserTab(act.tabId)`.
  - Returns `ActionResult`.
- Enhance `act.action === 'openTab'`:
  - Calls `chrome.tabs.create({ url: act.url, active: act.active !== false })`.
  - Awaits tab creation and sets `res.verifiedSelector = String(newTab.id)`.

- [ ] **Step 3: Verify with TypeScript compiler**

Run: `npm run compile` in `rebuild-ui`
Expected: 0 errors.

---

### Task 3: Autonomous Loop Multi-Tab Orchestration (`src/services/chat-runner.ts`)

**Files:**
- Modify: `src/services/chat-runner.ts`

**Interfaces:**
- Consumes:
  - `getOpenTabs`, `formatOpenTabsPrompt` from `./tab-manager`
- Produces:
  - Updated prompt directives with multi-tab examples.
  - Turn-level dynamic tab discovery.
  - Active tab tracking after `switchTab` or `openTab`.

- [ ] **Step 1: Update BASE_AGENT_PROMPT in `chat-runner.ts`**

Add action block guidance for Multi-Tab orchestration:
```markdown
7. MULTI-TAB ORCHESTRATION:
- Switch to another open tab:
\`\`\`action
[ { "action": "switchTab", "tabId": 102 } ]
\`\`\`
- Or search tab by name:
\`\`\`action
[ { "action": "switchTab", "match": "Google Sheets" } ]
\`\`\`
- Close finished tab:
\`\`\`action
[ { "action": "closeTab", "tabId": 102 } ]
\`\`\`
```

- [ ] **Step 2: Inject open tabs prompt dynamically in `runChatStream`**

Inside `while (currentStep <= MAX_AGENT_STEPS)`:
- Query `const openTabs = await getOpenTabs()`.
- If `openTabs.length >= 2`, format with `formatOpenTabsPrompt(openTabs)` and append to `finalSystemPrompt`.
- If an action executed was `switchTab` or `openTab`:
  - If new tab is activated, update current active target tab reference and wait for stabilization.
  - Next turn's `getActivePageContext()` reads the new tab automatically.

- [ ] **Step 3: Verify with TypeScript compiler**

Run: `npm run compile` in `rebuild-ui`
Expected: 0 errors.

---

### Task 4: Active Tab Strip UI Component (`src/components/chat/ActiveTabStrip.tsx`)

**Files:**
- Create: `src/components/chat/ActiveTabStrip.tsx`
- Modify: `src/components/chat/ChatView.tsx`

- [x] **Step 1: Create `src/components/chat/ActiveTabStrip.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { Globe, RotateCw, Layers } from 'lucide-react';
import { getOpenTabs, switchToTab, TabInfo } from '../../services/tab-manager';

export const ActiveTabStrip: React.FC = () => {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTabs = async () => {
    setIsRefreshing(true);
    const data = await getOpenTabs();
    setTabs(data);
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadTabs();
    // Listen for tab switch or creation events
    const tabActivatedHandler = () => loadTabs();
    const tabUpdatedHandler = () => loadTabs();
    const tabRemovedHandler = () => loadTabs();

    chrome.tabs.onActivated.addListener(tabActivatedHandler);
    chrome.tabs.onUpdated.addListener(tabUpdatedHandler);
    chrome.tabs.onRemoved.addListener(tabRemovedHandler);

    return () => {
      chrome.tabs.onActivated.removeListener(tabActivatedHandler);
      chrome.tabs.onUpdated.removeListener(tabUpdatedHandler);
      chrome.tabs.onRemoved.removeListener(tabRemovedHandler);
    };
  }, []);

  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 border-b border-border text-xs overflow-x-auto no-scrollbar select-none">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 font-medium mr-1">
        <Layers className="size-3 text-primary" />
        <span>Tabs ({tabs.length})</span>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchToTab(tab.id)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all shrink-0 cursor-pointer border ${
              tab.active
                ? 'bg-background border-primary/40 text-foreground shadow-xs'
                : 'bg-card/50 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/80'
            }`}
            title={`${tab.title}\n${tab.url}`}
          >
            {tab.active ? (
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            ) : tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://') ? (
              <img src={tab.favIconUrl} alt="" className="size-3 rounded-xs shrink-0" />
            ) : (
              <Globe className="size-3 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate max-w-[90px]">{tab.title}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={loadTabs}
        className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors shrink-0 cursor-pointer"
        title="Refresh open tabs"
      >
        <RotateCw className={`size-2.5 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
```

- [x] **Step 2: Mount `ActiveTabStrip` in `src/components/chat/ChatView.tsx`**

Render `<ActiveTabStrip />` directly below `<Header />`.

- [x] **Step 3: Verification**

Run: `npm run compile` (`tsc --noEmit`) && `npm run build` (`wxt build`)
Expected: 0 errors.
