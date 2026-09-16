# User Scriptlets & Custom Tool Studio Specification

**Date:** 2026-09-12  
**Project:** SAM-Agent Chrome Extension (Rebuild UI)  
**Status:** Approved for Implementation  
**Sub-Project:** 3 of 4 (Agent Extensibility & User Tools)

---

## 1. Overview & Objectives

SAM-Agent comes with standard built-in actions (`navigate`, `click`, `fill`, `switchTab`, `closeTab`, `writeFile`, `play`). However, domain-specific websites often require specialized scraping, DOM traversal, or custom client-side workflows (e.g., extracting e-commerce tables to CSV, scraping article metadata, bypassing specific consent modals, or computing page stats).

This sub-project implements **User Scriptlets & Custom Tool Studio**:
1. Users write and save JavaScript functions in VFS under `/tools/<toolName>.js`.
2. JSDoc comments (`@tool`, `@description`, `@param`) in the scriptlet are parsed automatically to provide the LLM agent with tool descriptions.
3. The autonomous agent is empowered with a new action block:
   ```action
   [ { "action": "runTool", "tool": "tableToCsv", "args": { "selector": "table#report" } } ]
   ```
4. Scripts execute directly in the active browser tab via `chrome.scripting.executeScript` and return JSON or string results back to the agent as observation data for subsequent steps.
5. A dedicated **Tool Studio UI** allows users to browse installed tools, toggle them active/inactive, create boilerplate templates, test run scripts on the active tab, and launch the CodeMirror editor with one click.

---

## 2. Technical Architecture & Module Layout

```
rebuild-ui/
├── src/
│   ├── services/
│   │   ├── tool-registry.ts    <-- [NEW] Tool discovery, JSDoc parsing, prompt formatting, execution
│   │   ├── page-actions.ts     <-- [MODIFIED] Added 'runTool' action handler
│   │   └── chat-runner.ts      <-- [MODIFIED] Inject active custom tools into prompt, record tool output
│   ├── stores/
│   │   └── useAppStore.ts      <-- [MODIFIED] Added 'tools' view navigation state
│   └── components/
│       ├── chat/
│       │   └── Header.tsx      <-- [MODIFIED] Added navigation icon to Tool Studio
│       └── tools/
│           ├── ToolStudioView.tsx <-- [NEW] List, toggle, test run, delete, and create scriptlets
│           └── TestRunModal.tsx   <-- [NEW] Modal running scriptlet on active tab with JSON preview
```

---

## 3. Detailed Specifications

### 3.1 Scriptlet Structure in VFS (`/tools/<name>.js`)

Every tool is stored as a file in VFS under the `/tools/` directory.

Example:
```javascript
/**
 * @tool extractArticleInfo
 * @description Extracts main headline, author, publish date, and paragraphs from news articles.
 * @param {string} [scope] Optional CSS selector to limit content extraction.
 */
async function run(args = {}) {
  const root = args.scope ? document.querySelector(args.scope) : document;
  if (!root) return { error: `Scope '${args.scope}' not found` };

  const headline = document.querySelector('h1')?.textContent?.trim() || document.title;
  const author = document.querySelector('[rel="author"], .byline, .author')?.textContent?.trim() || 'Unknown';
  const paragraphs = [...root.querySelectorAll('p')]
    .map(p => p.textContent.trim())
    .filter(t => t.length > 20);

  return { headline, author, paragraphCount: paragraphs.length, paragraphs };
}
```

---

### 3.2 Tool Registry Service (`src/services/tool-registry.ts`)

#### Types:
```typescript
export interface UserToolMeta {
  name: string;
  path: string;
  description: string;
  paramsHelp: string;
  code: string;
  enabled: boolean;
  updatedAt: number;
}
```

#### Functions:
1. **`listUserTools(): Promise<UserToolMeta[]>`**
   - Queries `listVfsFiles('/tools')` from `src/services/vfs.ts`.
   - Filters files ending with `.js`.
   - Parses JSDoc annotations:
     - `@tool <name>` (falls back to filename without `.js`).
     - `@description <text>` (falls back to `"Custom user-defined scriptlet"`).
     - `@param <description>` (extracted for syntax hints).
   - Reads enabled/disabled toggle map from `chrome.storage.local` (`userToolsConfig`).
   - Defaults to `enabled: true`.

2. **`toggleUserTool(toolName: string, enabled: boolean): Promise<void>`**
   - Updates `userToolsConfig` dictionary in `chrome.storage.local`.

3. **`createUserToolTemplate(name: string, description = ''): Promise<string>`**
   - Normalizes tool name (camelCase/alphanumeric).
   - Generates boilerplate with JSDoc headers and an `async function run(args)` stub.
   - Saves file to `/tools/${cleanName}.js` via `saveVfsFile`.
   - Returns the created VFS path.

4. **`formatUserToolsPrompt(tools: UserToolMeta[]): string`**
   - Filters `tools.filter(t => t.enabled)`.
   - If empty, returns empty string.
   - Formats clean markdown section:
     ```markdown
     ### CUSTOM USER SCRIPTLETS & TOOLS (RUN VIA ACTION BLOCK):
     The user has installed the following custom tools. When appropriate, execute them using the "runTool" action:
     - extractArticleInfo(args): Extracts main headline, author, publish date...
     Example action block:
     ```action
     [ { "action": "runTool", "tool": "extractArticleInfo", "args": { "scope": "article" } } ]
     ```
     ```

5. **`executeUserTool(tabId: number, toolName: string, args: Record<string, any> = {}): Promise<any>`**
   - Locates tool in VFS `/tools/${toolName}.js`.
   - Throws error if tool is missing.
   - Injects the script into target browser tab via `chrome.scripting.executeScript`:
     ```typescript
     const results = await chrome.scripting.executeScript({
       target: { tabId },
       func: async (scriptSource: string, toolArgs: any) => {
         try {
           // Wrap in async evaluation scope
           const runner = new Function('args', `${scriptSource}\nreturn run(args);`);
           return await runner(toolArgs);
         } catch (err: any) {
           return { error: err.message || String(err), stack: err.stack };
         }
       },
       args: [tool.code, args],
     });
     return results[0]?.result;
     ```

---

### 3.3 Page Action Extension (`src/services/page-actions.ts`)

#### Action Definition:
```typescript
export type BrowserAction =
  | ... // existing actions
  | { action: 'runTool'; tool: string; args?: Record<string, any> };
```

#### Execution:
- Handler validates active tab (ensure non-restricted).
- Calls `executeUserTool(tabId, act.tool, act.args || {})`.
- Formats `ActionResult`:
  - `success: !res?.error`
  - `message: res?.error ? \`Tool '\${act.tool}' error: \${res.error}\` : \`Tool '\${act.tool}' executed successfully.\``
  - `data: res`

---

### 3.4 Autonomous Loop Integration (`src/services/chat-runner.ts`)

- Queries `listUserTools()`.
- Appends `formatUserToolsPrompt(tools)` to `finalSystemPrompt`.
- In `parseAndExecuteActions`, registers `toolName = 'runTool'` in DB thread message with its inputs and output.
- Next step observation receives stringified tool output JSON, allowing the agent to reason about the extracted data.

---

### 3.5 UI Components: Tool Studio (`ToolStudioView.tsx` & `TestRunModal.tsx`)

#### `ToolStudioView.tsx`
- Layout:
  - Header: Back to Chat (`ArrowLeft`), Title *"Custom Tool Studio"*, Count badge, "+ New Tool" button.
  - Quick Info Card: Explains how custom tools work and how the AI utilizes them.
  - Grid/List of Tool Cards:
    - Tool name (`font-mono font-semibold`).
    - Enabled/Disabled switch.
    - Description paragraph.
    - Action buttons:
      - **Edit in Code Editor** (Opens `editor.html?path=${encodeURIComponent(tool.path)}`).
      - **Test Run** (Opens `TestRunModal` to run scriptlet on current active tab).
      - **Delete Tool** (Prompts and removes file from VFS).

#### `TestRunModal.tsx`
- Modal dialog displaying:
  - Tool Name.
  - Active Tab Title & URL where script will run.
  - Arguments JSON input field (default: `{}`).
  - "Run on Active Tab" button with loading spinner.
  - JSON result viewer with syntax formatting and one-click copy button.

---

## 4. Verification Plan

1. **TypeScript Verification**:
   - Run `npm run compile` (`tsc --noEmit`) - must pass with 0 errors.
2. **Production Bundle**:
   - Run `npm run build` (`wxt build`) - verify zero bundling issues.
3. **Functional Verification**:
   - Create a sample tool `/tools/extractMeta.js` via UI.
   - Run "Test Run" on an active tab and verify JSON output.
   - Ask agent in chat: *"Gunakan tool extractMeta untuk mengambil data dari halaman ini"* and verify agent emits `{ "action": "runTool", "tool": "extractMeta" }`.
