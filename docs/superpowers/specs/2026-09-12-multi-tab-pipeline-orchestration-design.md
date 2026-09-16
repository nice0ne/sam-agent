# Multi-Tab Pipeline & Cross-Tab Orchestration Specification

**Date:** 2026-09-12  
**Project:** SAM-Agent Chrome Extension (Rebuild UI)  
**Status:** Approved for Implementation  
**Sub-Project:** 2 of 4 (Multi-Tab Browser Agent Orchestration)

---

## 1. Overview & Objectives

Currently, SAM-Agent operates primarily on the active browser tab. While it can open a new tab (`openTab`), it lacks bidirectional cross-tab orchestration:
1. It does not know what other tabs are open in the browser window.
2. It cannot switch focus to an existing tab (`switchTab`).
3. It cannot close temporary tabs (`closeTab`) after extracting data.
4. Users cannot visually track or switch between the tabs being operated on directly from the Sidepanel.

This sub-project empowers SAM-Agent to become a **true multi-tab autonomous agent**:
- Dynamically discovers all open tabs in the active window.
- Injects structured tab metadata into the agent's system prompt.
- Executes `switchTab`, `closeTab`, and enhanced `openTab` actions with visual active tab switching.
- Enables seamless cross-tab data pipelines (e.g., read data from Tab A, store in VFS or memory, switch to Tab B, and submit form).
- Provides an `ActiveTabStrip` UI component in the Sidepanel chat view displaying all open tabs with instant click-to-switch capability.

---

## 2. Technical Architecture & Module Layout

```
rebuild-ui/
├── src/
│   ├── services/
│   │   ├── tab-manager.ts     <-- [NEW] Tab discovery, formatting, and cross-tab context helpers
│   │   ├── page-actions.ts    <-- [MODIFIED] Added 'switchTab', 'closeTab', and enhanced 'openTab'
│   │   └── chat-runner.ts     <-- [MODIFIED] Inject open tabs context & dynamic tab switching in loop
│   └── components/
│       └── chat/
│           ├── ActiveTabStrip.tsx <-- [NEW] Horizontal pill strip displaying open tabs & active focus
│           └── ChatView.tsx       <-- [MODIFIED] Renders ActiveTabStrip above message list
```

---

## 3. Detailed Specifications

### 3.1 `src/services/tab-manager.ts` (Tab Context & Discovery)

#### Types:
```typescript
export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  isRestricted: boolean;
}
```

#### Functions:
1. **`getOpenTabs(): Promise<TabInfo[]>`**
   - Calls `chrome.tabs.query({ currentWindow: true })`.
   - Filters out null IDs.
   - Flags `isRestricted` if URL begins with `chrome://`, `chrome-extension://`, `edge://`, or Chrome Webstore.
   - Cleans URL (strips noisy UTM tracking parameters).
   - Truncates title to 60 characters to conserve prompt tokens.

2. **`formatOpenTabsPrompt(tabs: TabInfo[]): string`**
   - Formats list into high-density prompt text:
     ```
     [OPEN BROWSER TABS IN CURRENT WINDOW]:
     * [Tab 412] (ACTIVE) "Google Sheets - Q3 Leads" | https://docs.google.com/spreadsheets/...
     * [Tab 415] "HubSpot CRM - New Contact" | https://app.hubspot.com/...
     * [Tab 418] "YouTube - Search" | https://www.youtube.com/...
     ```
   - Only included if 2 or more tabs are open.

3. **`switchToTab(target: number | string): Promise<{ success: boolean; tabId?: number; message: string }>`**
   - If `target` is a number (`tabId`), activates it via `chrome.tabs.update(tabId, { active: true })`.
   - If `target` is a string (`match`), searches open tabs for matching title or URL substring, then activates the best match.
   - Brings browser window to front via `chrome.windows.update(tab.windowId, { focused: true })`.

4. **`closeBrowserTab(tabId: number): Promise<{ success: boolean; message: string }>`**
   - Removes tab via `chrome.tabs.remove(tabId)`.

---

### 3.2 Action Engine Enhancements (`src/services/page-actions.ts`)

#### Action Definitions:
```typescript
export type BrowserAction =
  | ... // existing actions (navigate, click, fill, select, play, writeFile, eval, press_key)
  | { action: 'switchTab'; tabId?: number; match?: string }
  | { action: 'closeTab'; tabId: number }
  | { action: 'openTab'; url: string; active?: boolean };
```

#### Execution Logic:
- **`switchTab`**:
  - Validates target tab exists.
  - Calls `switchToTab(act.tabId || act.match)`.
  - Waits 600ms for browser paint and DOM stabilization.
  - Returns `ActionResult` with target tabId and updated title.
- **`closeTab`**:
  - Calls `closeBrowserTab(act.tabId)`.
  - Returns confirmation message.
- **`openTab`**:
  - Creates new tab via `chrome.tabs.create({ url, active: true })`.
  - Waits for tab creation and returns `ActionResult` with new `tabId`.

---

### 3.3 Autonomous Execution Loop Integration (`src/services/chat-runner.ts`)

1. **System Prompt Injection**:
   - In `runChatStream`, calls `getOpenTabs()` at the start of each step.
   - Appends formatted `formatOpenTabsPrompt(tabs)` to `finalSystemPrompt`.
   - Agent system prompt instructs:
     ```
     To switch tabs or work across multiple websites:
     ```action
     [ { "action": "switchTab", "tabId": 102 } ]
     ```
     To close a finished tab:
     ```action
     [ { "action": "closeTab", "tabId": 101 } ]
     ```
     ```
2. **Context Switching**:
   - When a `switchTab` or `openTab` action completes successfully, `targetTabId` is updated to the newly active tab.
   - Next turn's `pageContext = await getActivePageContext()` naturally reads the newly activated tab's DOM, allowing seamless data shuttling.

---

### 3.4 UI Component: `src/components/chat/ActiveTabStrip.tsx`

- Positioned above the message thread in `ChatView.tsx`.
- Uses `chrome.tabs.onActivated`, `chrome.tabs.onUpdated`, `chrome.tabs.onRemoved` listeners or periodic refresh to keep state live.
- Visual elements:
  - Mini horizontal scrollable pill strip.
  - Active tab highlighted with a pulsing green indicator (`size-2 rounded-full bg-emerald-500 animate-pulse`).
  - Favicon image or fallback `Globe` icon.
  - Tab title truncated nicely (max ~20 chars).
  - Clicking any tab pill triggers `chrome.tabs.update(tab.id, { active: true })`.
  - Refresh button (`RotateCw` icon) to resync tab list.

---

## 4. Error Handling & Edge Cases

1. **Target Tab Closed**:
   - If agen attempts to `switchTab` to a tab that was closed by the user, returns clear error: `Tab with ID ${id} not found. Please check current open tabs.`
2. **Restricted Tabs**:
   - Attempting DOM actions on internal browser tabs is rejected cleanly with a warning.
3. **Closing the Only Tab**:
   - If user/agent attempts to close the sole remaining tab, handles gracefully without crashing Chrome window.

---

## 5. Verification Plan

1. **TypeScript Verification**:
   - Run `npm run compile` (`tsc --noEmit`) - must pass with 0 errors.
2. **Bundle Build**:
   - Run `npm run build` (`wxt build`) - verify zero bundling issues.
3. **Functional Verification**:
   - Verify `ActiveTabStrip` displays open tabs in Sidepanel.
   - Ask agent: *"Lihat tab yang terbuka, buka tab baru ke wikipedia.org, lalu kembali ke tab sebelumnya"*.
   - Verify agent emits `openTab` -> `switchTab` and executes active tab switching visually.
