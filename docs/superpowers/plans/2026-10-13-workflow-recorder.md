# Workflow Recorder & Demonstration-to-Skill Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to record live browser interactions and automatically synthesize them into robust, parameterized user tools (`/tools/<name>.js`) in SAM-Agent's Virtual File System.

**Architecture:** A lightweight WXT content script mounts a Shadow DOM floating HUD on the active tab and captures user events (click, fill, select, navigate) into an ordered trace with a resilient multi-selector cascade. Upon completion, the trace is transmitted to the Side Panel, where a synthesis service infers `@param` variables, cleans redundant interactions, and presents an interactive review modal before saving to `/tools/*.js`.

**Tech Stack:** TypeScript, React 19, WXT (Web Extension Tools), Chrome Extension Manifest V3 (`chrome.scripting`, `chrome.storage.session`, `chrome.runtime`), Lucide React, CodeMirror, Tailwind CSS v4.

**Spec:** [`docs/superpowers/specs/2026-10-13-workflow-recorder-design.md`](file:///E:/VIBE-CODE-WS/CHROME-EXT/Sam-Agent/docs/superpowers/specs/2026-10-13-workflow-recorder-design.md)

## Global Constraints
- Target platform: Chrome Extension Manifest V3 with WXT 0.19.
- UI styling must use Tailwind utility classes matching SAM-Agent dark/light aesthetic.
- Shadow DOM content scripts must not alter the target webpage's CSS or layout.
- Synthesized tools must conform to SAM-Agent JSDoc standard (`@tool`, `@description`, `@param`) and execute via `executeUserTool`.
- All steps must compile cleanly with `npm run compile` (`tsc --noEmit`).

---

### Task 1: Event Capture & Resilient Selector Cascade Engine

**Files:**
- Create: `entrypoints/workflow-recorder.content/selector-generator.ts`
- Create: `entrypoints/workflow-recorder.content/types.ts`
- Test: `entrypoints/workflow-recorder.content/__tests__/selector-generator.test.ts` (or standalone test runner)

**Interfaces:**
- Produces:
  ```typescript
  export interface RecordedAction {
    id: string;
    type: 'click' | 'fill' | 'select' | 'toggle' | 'navigate';
    target: {
      tagName: string;
      selectors: string[]; // Priority cascade
      textMatch?: { tag: string; text: string };
      name?: string;
      placeholder?: string;
      inputType?: string;
    };
    value?: string;
    checked?: boolean;
    timestamp: number;
    url: string;
  }

  export function computeSelectorCascade(el: HTMLElement): {
    selectors: string[];
    textMatch?: { tag: string; text: string };
    name?: string;
    placeholder?: string;
    inputType?: string;
  };
  ```

- [ ] **Step 1: Write test case for selector cascade generator**
  Create unit test verifying that `computeSelectorCascade` extracts `data-testid` first, filters out dynamic numeric IDs, extracts `name`/`aria-label`, generates text fallbacks for buttons, and falls back to clean CSS paths.

- [ ] **Step 2: Implement types and selector cascade generator**
  Implement `computeSelectorCascade` in `entrypoints/workflow-recorder.content/selector-generator.ts`:
  - Check `data-testid`, `data-test`, `data-cy`.
  - Check stable `id` (rejecting patterns matching `/[0-9]{4,}|ember[0-9]|:r[0-9]:/`).
  - Check `name`, `aria-label`, `placeholder`, `title`.
  - Extract trimmed inner text for buttons and anchor links (`tag: 'button', text: '...'`).
  - Calculate hierarchical CSS selector as final fallback.

- [ ] **Step 3: Run TypeScript validation**
  Run `npm run compile` to verify types and exports.

- [ ] **Step 4: Commit**
  `git add entrypoints/workflow-recorder.content/ && git commit -m "feat(recorder): add selector cascade generator and types"`

---

### Task 2: In-Page Shadow DOM Floating HUD & Content Script

**Files:**
- Create: `entrypoints/workflow-recorder.content/RecorderHUD.tsx`
- Create: `entrypoints/workflow-recorder.content/index.tsx`
- Modify: `entrypoints/background/index.ts` (handle start/stop messages, script injection)

**Interfaces:**
- Consumes: `computeSelectorCascade` from Task 1.
- Produces:
  - Chrome runtime messages:
    - `START_WORKFLOW_RECORDING`
    - `WORKFLOW_RECORDING_STEP`
    - `WORKFLOW_RECORDING_FINISH`
    - `WORKFLOW_RECORDING_CANCEL`

- [ ] **Step 1: Create RecorderHUD React Component**
  Implement `RecorderHUD.tsx` with:
  - Draggable container with high z-index inside Shadow DOM.
  - Pulsing red dot with step counter (`● Rec [X]`).
  - Controls: Pause/Resume toggle, Finish button, Cancel button.
  - Dark mode styled pill with rounded corners, backdrop-blur, and clear icons (`Pause`, `Play`, `Check`, `X`).

- [ ] **Step 2: Implement content script lifecycle & event capture**
  In `entrypoints/workflow-recorder.content/index.tsx`:
  - Register as `defineContentScript` with `createShadowRootUi`.
  - Add capture-phase event listeners:
    - `click`: captures target, ignores HUD clicks.
    - `input` / `change`: debounced 300ms capture per element, updates `fill` action value.
    - `change` on select / checkbox / radio.
    - SPA navigation listeners (`pushState`, `popstate`, `hashchange`).
  - Sync current trace to `chrome.storage.session` for page-reload persistence.

- [ ] **Step 3: Update Background service worker message routing**
  In `entrypoints/background/index.ts`:
  - Handle `START_WORKFLOW_RECORDING`: inject content script via `chrome.scripting.executeScript` if not already mounted.
  - Forward `WORKFLOW_RECORDING_FINISH` to active extension views or store in session storage.

- [ ] **Step 4: Run compilation check**
  Run `npm run compile` to verify WXT entrypoint registration and type safety.

- [ ] **Step 5: Commit**
  `git add entrypoints/ && git commit -m "feat(recorder): implement in-page Shadow DOM recording HUD"`

---

### Task 3: Workflow Synthesizer & Parameter Inference Engine

**Files:**
- Create: `src/services/workflow-synthesizer.ts`
- Test: `src/services/__tests__/workflow-synthesizer.test.ts` (or scratch test script)

**Interfaces:**
- Consumes: `RecordedAction[]` from Task 1 & 2.
- Produces:
  ```typescript
  export interface SynthesizedParameter {
    name: string;
    type: 'string' | 'number' | 'boolean';
    defaultValue: string;
    description: string;
  }

  export interface SynthesizedWorkflow {
    toolName: string;
    description: string;
    parameters: SynthesizedParameter[];
    code: string;
  }

  export function synthesizeWorkflow(
    toolName: string,
    description: string,
    actions: RecordedAction[]
  ): SynthesizedWorkflow;
  ```

- [ ] **Step 1: Write synthesis test cases**
  Verify:
  - Removing duplicate consecutive clicks or back-to-back empty input events.
  - Inferring parameter names (`searchQuery`, `username`, `email`) from input attributes.
  - Generating valid JavaScript async function wrapped in SAM-Agent JSDoc.

- [ ] **Step 2: Implement `workflow-synthesizer.ts`**
  - Parameter inference logic based on `placeholder`, `name`, `id`, and `aria-label`.
  - Code template builder using `waitEl` and `findEl` helpers.
  - JSDoc comment generator (`@tool`, `@description`, `@param`).
  - Fallback safe error handling on execution timeouts.

- [ ] **Step 3: Verify with Node / TypeScript compile**
  Run `npm run compile`.

- [ ] **Step 4: Commit**
  `git add src/services/workflow-synthesizer.ts && git commit -m "feat(recorder): add workflow synthesis and parameter inference engine"`

---

### Task 4: Workflow Review Modal & Tool Studio Integration

**Files:**
- Create: `src/components/tools/WorkflowReviewModal.tsx`
- Modify: `src/components/tools/ToolStudioView.tsx`

**Interfaces:**
- Consumes: `synthesizeWorkflow` from `src/services/workflow-synthesizer.ts`.
- Consumes: `executeUserTool` from `src/services/tool-registry.ts`.
- Consumes: `saveVfsFile` from `src/services/vfs.ts`.

- [ ] **Step 1: Create `WorkflowReviewModal.tsx`**
  Build modal featuring:
  - **Tool Name & Description**: Text inputs with slug validation (`^[a-zA-Z0-9_-]+$`).
  - **Recorded Steps Timeline**: Step cards with icons, selector previews, and individual delete buttons.
  - **Parameter Table**: Interactive rows allowing renaming parameters, editing default values, and setting descriptions.
  - **Live Code Preview**: CodeMirror editor showing synthesized code.
  - **Test Run Button**: Executes code against active tab via `executeUserTool` with live stdout feedback.
  - **Save & Enable Button**: Saves to VFS `/tools/<name>.js` and enables in `userToolsConfig`.

- [ ] **Step 2: Update `ToolStudioView.tsx`**
  - Add primary **"Record Workflow"** button in header next to "Create Tool".
  - Add active recording listener to open `WorkflowReviewModal` when `WORKFLOW_RECORDING_FINISH` arrives.
  - Add active recording indicator if Side Panel is opened while recording is in progress on a tab.

- [ ] **Step 3: Test compilation and verify UI**
  Run `npm run compile`.

- [ ] **Step 4: Commit**
  `git add src/components/tools/ && git commit -m "feat(recorder): integrate WorkflowReviewModal and ToolStudioView"`

---

### Task 5: End-to-End Build & Extension Packaging Verification

**Files:**
- Modify: `README.md` (document Workflow Recorder in v4.7.0 release notes)
- Modify: `package.json` (bump version to 4.7.0)

- [ ] **Step 1: Bump version to 4.7.0**
  Update `package.json` version to `4.7.0`.

- [ ] **Step 2: Run full build**
  Execute `npm run build` to ensure WXT compiles all entrypoints, bundles content scripts, and generates valid extension output in `.output/chrome-mv3`.

- [ ] **Step 3: Update documentation**
  Add Workflow Recorder documentation and usage instructions to `README.md`.

- [ ] **Step 4: Commit**
  `git add package.json README.md && git commit -m "chore(release): bump version to v4.7.0 and update documentation"`
