# User Scriptlets & Custom Tool Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full custom tool scripting for SAM-Agent: users create/edit JavaScript scriptlets in `/tools/*.js` via VFS & CodeMirror, the agent autonomously invokes them via `runTool` action blocks, and users manage & test-run them in a dedicated Tool Studio UI.

**Architecture:** VFS-backed JavaScript files parsed for JSDoc tool metadata, executed in active tab context via `chrome.scripting.executeScript`, integrated into `page-actions.ts` and `chat-runner.ts`, managed via `ToolStudioView` in Sidepanel.

**Tech Stack:** React 19, TypeScript, Chrome Scripting & Storage API, Dexie DB VFS, Tailwind CSS v4, Lucide Icons.

**Spec:** `docs/superpowers/specs/2026-09-12-user-scriptlets-custom-tools-design.md`

## Global Constraints
- Target workspace: `E:\VIBE-CODE-WS\CHROME-EXT\3.1.34_0\rebuild-ui`
- Zero TypeScript compiler errors (`npm run compile` must pass with code 0).
- Pure in-page execution returning JSON-serializable payloads.
- Default scriptlet directory: `/tools/`.

---

### Task 1: Tool Registry & In-Page Execution Service (`src/services/tool-registry.ts`)

**Files:**
- Create: `src/services/tool-registry.ts`

**Interfaces:**
- Consumes:
  - `listVfsFiles`, `saveVfsFile`, `getVfsFile`, `deleteVfsFile` from `./vfs`
- Produces:
  - `export interface UserToolMeta`
  - `listUserTools(): Promise<UserToolMeta[]>`
  - `toggleUserTool(toolName: string, enabled: boolean): Promise<void>`
  - `createUserToolTemplate(name: string, description?: string): Promise<string>`
  - `formatUserToolsPrompt(tools: UserToolMeta[]): string`
  - `executeUserTool(tabId: number, toolName: string, args?: Record<string, any>): Promise<any>`

- [ ] **Step 1: Create `src/services/tool-registry.ts`**

```typescript
import { listVfsFiles, saveVfsFile, getVfsFile, deleteVfsFile } from './vfs';

export interface UserToolMeta {
  name: string;
  path: string;
  description: string;
  paramsHelp: string;
  code: string;
  enabled: boolean;
  updatedAt: number;
}

const STORAGE_TOOLS_CONFIG_KEY = 'userToolsConfig';

/**
 * Helper to parse JSDoc annotations from JavaScript code
 */
function parseScriptletMetadata(code: string, fallbackName: string) {
  let name = fallbackName;
  let description = 'Custom user-defined scriptlet';
  let paramsHelp = '';

  const toolMatch = code.match(/@tool\s+([a-zA-Z0-9_-]+)/);
  if (toolMatch?.[1]) name = toolMatch[1].trim();

  const descMatch = code.match(/@description\s+([^\n*]+)/);
  if (descMatch?.[1]) description = descMatch[1].trim();

  const paramMatches = [...code.matchAll(/@param\s+(?:\{[^}]+\}\s+)?([^\n*]+)/g)];
  if (paramMatches.length > 0) {
    paramsHelp = paramMatches.map((m) => m[1].trim()).join(', ');
  }

  return { name, description, paramsHelp };
}

/**
 * List all scriptlets from VFS /tools/ directory
 */
export async function listUserTools(): Promise<UserToolMeta[]> {
  try {
    const files = await listVfsFiles('/tools');
    const jsFiles = files.filter((f) => f.path.startsWith('/tools/') && f.path.endsWith('.js'));

    const configData = await chrome.storage.local.get(STORAGE_TOOLS_CONFIG_KEY);
    const configMap: Record<string, boolean> = configData[STORAGE_TOOLS_CONFIG_KEY] || {};

    return jsFiles.map((file) => {
      const fallbackName = file.name.replace(/\.js$/, '');
      const meta = parseScriptletMetadata(file.content, fallbackName);
      const isEnabled = configMap[meta.name] !== false; // default true

      return {
        name: meta.name,
        path: file.path,
        description: meta.description,
        paramsHelp: meta.paramsHelp,
        code: file.content,
        enabled: isEnabled,
        updatedAt: file.updatedAt,
      };
    });
  } catch (err) {
    console.warn('[tool-registry] Failed listing user tools:', err);
    return [];
  }
}

/**
 * Toggle enable/disable status for a tool
 */
export async function toggleUserTool(toolName: string, enabled: boolean): Promise<void> {
  const configData = await chrome.storage.local.get(STORAGE_TOOLS_CONFIG_KEY);
  const configMap = configData[STORAGE_TOOLS_CONFIG_KEY] || {};
  configMap[toolName] = enabled;
  await chrome.storage.local.set({ [STORAGE_TOOLS_CONFIG_KEY]: configMap });
}

/**
 * Create a boilerplate template for a new user tool in VFS
 */
export async function createUserToolTemplate(name: string, description = ''): Promise<string> {
  const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '') || 'myTool';
  const filePath = `/tools/${cleanName}.js`;
  const desc = description.trim() || 'Custom browser scriptlet tool';

  const templateContent = `/**
 * @tool ${cleanName}
 * @description ${desc}
 * @param {string} [selector] Optional CSS selector
 */
async function run(args = {}) {
  // Access the live page DOM via document and window
  const selector = args.selector || 'body';
  const element = document.querySelector(selector);
  
  if (!element) {
    return { error: \`Element '\${selector}' not found on page\` };
  }

  return {
    url: window.location.href,
    title: document.title,
    contentSample: element.textContent ? element.textContent.slice(0, 200).trim() : '',
  };
}
`;

  await saveVfsFile(filePath, templateContent, 'text/javascript');
  return filePath;
}

/**
 * Format enabled tools into a compact prompt section for LLM
 */
export function formatUserToolsPrompt(tools: UserToolMeta[]): string {
  const activeTools = tools.filter((t) => t.enabled);
  if (activeTools.length === 0) return '';

  const toolLines = activeTools.map((t) => {
    const params = t.paramsHelp ? ` [args: ${t.paramsHelp}]` : '';
    return `- ${t.name}(args): ${t.description}${params}`;
  });

  return `### CUSTOM USER TOOLS (EXECUTE VIA ACTION BLOCK):\nYou have access to custom user-written JavaScript tools installed in the browser. You can execute any of them when helpful:\n${toolLines.join('\n')}\n\nTo execute a custom tool, emit:\n\`\`\`action\n[\n  { "action": "runTool", "tool": "${activeTools[0].name}", "args": {} }\n]\n\`\`\``;
}

/**
 * Execute a user tool directly on the target browser tab DOM
 */
export async function executeUserTool(
  tabId: number,
  toolName: string,
  args: Record<string, any> = {}
): Promise<any> {
  const tools = await listUserTools();
  const tool = tools.find((t) => t.name.toLowerCase() === toolName.toLowerCase());

  if (!tool) {
    throw new Error(`Custom tool '${toolName}' not found in VFS /tools/ directory.`);
  }

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (scriptSource: string, toolArgs: any) => {
      try {
        const runner = new Function(
          'args',
          `${scriptSource}\nif (typeof run !== 'function') throw new Error('Scriptlet must define an async function run(args)');\nreturn run(args);`
        );
        return await runner(toolArgs);
      } catch (err: any) {
        return { error: err.message || String(err), stack: err.stack };
      }
    },
    args: [tool.code, args],
  });

  return injection?.result;
}
```

- [ ] **Step 2: Verify with TypeScript compiler**

Run: `npm run compile` in `rebuild-ui`
Expected: 0 errors.

---

### Task 2: Action Engine & Autonomous Loop Integration (`page-actions.ts`, `chat-runner.ts`)

**Files:**
- Modify: `src/services/page-actions.ts`
- Modify: `src/services/chat-runner.ts`

- [ ] **Step 1: Update `page-actions.ts`**

- Import `executeUserTool` from `./tool-registry`.
- Add to `BrowserAction` union:
  ```typescript
  | { action: 'runTool'; tool: string; args?: Record<string, any> }
  ```
- In `executePageAction`:
  ```typescript
  if (act.action === 'runTool') {
    try {
      const toolOutput = await executeUserTool(tabId, act.tool, act.args || {});
      const hasError = toolOutput && typeof toolOutput === 'object' && 'error' in toolOutput;
      return {
        action: 'runTool',
        success: !hasError,
        message: hasError
          ? `Tool '${act.tool}' error: ${toolOutput.error}`
          : `Tool '${act.tool}' executed successfully.`,
        target: act.tool,
        data: toolOutput,
      };
    } catch (toolErr: any) {
      return {
        action: 'runTool',
        success: false,
        message: `Failed executing tool '${act.tool}': ${toolErr.message}`,
        target: act.tool,
      };
    }
  }
  ```

- [ ] **Step 2: Update `chat-runner.ts`**

- Import `listUserTools`, `formatUserToolsPrompt` from `./tool-registry`.
- In `parseAndExecuteActions`:
  - Set `toolName = act.action === 'runTool' ? 'runTool' : ...`
  - Ensure tool output JSON is serialized into `part.output` in DB.
- In `runChatStream`:
  - Query user tools at each step: `const userTools = await listUserTools();`
  - Format custom tools prompt: `const userToolsPrompt = formatUserToolsPrompt(userTools);`
  - Append to `finalSystemPrompt` if non-empty.

- [ ] **Step 3: Verify with TypeScript compiler**

Run: `npm run compile` in `rebuild-ui`
Expected: 0 errors.

---

### Task 3: Store Navigation & Header Updates (`useAppStore.ts`, `Header.tsx`)

**Files:**
- Modify: `src/stores/useAppStore.ts`
- Modify: `src/components/chat/Header.tsx`

- [ ] **Step 1: Add `'tools'` view to `useAppStore.ts`**

- Update `view: 'threads' | 'chat' | 'settings' | 'files' | 'tools'`.
- Add `navigateToTools: () => void`.
- Update `loadSettings` and `setView` accordingly.

- [ ] **Step 2: Add Tool Studio icon button to `Header.tsx`**

- Import `Wrench` or `Puzzle` icon from `lucide-react`.
- Add button in right-side buttons group:
  ```tsx
  <button
    type="button"
    onClick={() => navigateToTools()}
    className={`p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer ${
      view === 'tools'
        ? 'text-primary bg-primary/10'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
    }`}
    title="Custom Tool Studio"
  >
    <Wrench className="size-4" />
  </button>
  ```

- [ ] **Step 3: Verify with TypeScript compiler**

Run: `npm run compile` in `rebuild-ui`
Expected: 0 errors.

---

### Task 4: Tool Studio UI Components (`ToolStudioView.tsx`, `TestRunModal.tsx`, `App.tsx`)

**Files:**
- Create: `src/components/tools/TestRunModal.tsx`
- Create: `src/components/tools/ToolStudioView.tsx`
- Modify: `entrypoints/sidepanel/App.tsx`

- [ ] **Step 1: Create `src/components/tools/TestRunModal.tsx`**

- Dialog that takes `tool: UserToolMeta | null`, `isOpen: boolean`, `onClose: () => void`.
- Allows editing arguments JSON.
- Executes `executeUserTool(activeTabId, tool.name, parsedArgs)`.
- Displays formatted JSON response with copy button.

- [ ] **Step 2: Create `src/components/tools/ToolStudioView.tsx`**

- Renders header with "+ New Tool" button.
- Lists all tools from `listUserTools()`.
- Provides toggle switch for enabled/disabled.
- Provides "Edit Code" (opens `editor.html?path=${encodeURIComponent(tool.path)}`).
- Provides "Test Run" (opens `TestRunModal`).
- Provides "Delete" (deletes from VFS).
- Provides template creation modal for "+ New Tool".

- [ ] **Step 3: Mount in `entrypoints/sidepanel/App.tsx`**

- When `view === 'tools'`, renders `<ToolStudioView />`.

- [ ] **Step 4: Verification**

- Run `npm run compile` (`tsc --noEmit`).
- Run `npm run build` (`wxt build`).
- Expected: 0 errors, build completes cleanly.
