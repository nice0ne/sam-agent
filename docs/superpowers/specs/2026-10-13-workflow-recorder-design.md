# Architecture & Design Specification: Workflow Recorder & Demonstration-to-Skill Studio

**Date:** 2026-10-13  
**Status:** Approved  
**Target Version:** v4.7.0  
**Scope:** Sub-Project 1 of Automation Enhancements (Demonstration-to-Skill Studio)

---

## 1. Executive Summary

The **Workflow Recorder & Demonstration-to-Skill Studio** enables users to record live browser interactions (clicks, form filling, dropdown selections, navigation) directly on any web page. The system captures the user's action trace, computes a resilient multi-selector cascade for each touched element, extracts dynamic input values into editable `@param` variables, and synthesizes an executable JavaScript user tool in the Virtual File System (`/tools/<name>.js`).

Generated tools integrate natively into SAM-Agent's tool ecosystem:
- Directly runnable by the AI in chat via `{ "action": "runTool", "tool": "name", "args": {...} }`.
- Executable manually via the **Tool Studio** with custom arguments.
- Schedulable as autonomous cron background routines.

---

## 2. Architectural Overview

```
┌────────────────────────────────────────────────────────┐
│                     Active Web Page                    │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │  entrypoints/workflow-recorder.content         │   │
│   │   ├── Shadow DOM Floating Pill HUD             │   │
│   │   │     (Rec Indicator, Steps, Pause, Finish)  │   │
│   │   ├── Event Capture Engine                     │   │
│   │   │     (click, input/change, select, nav)     │   │
│   │   └── Resilient Selector Cascade Resolver      │   │
│   └───────────────────────┬────────────────────────┘   │
└───────────────────────────┼────────────────────────────┘
                            │ chrome.runtime.sendMessage
                            ▼
┌────────────────────────────────────────────────────────┐
│              Background Service Worker                 │
│   - Manages recording session state per tabId          │
│   - Session persistence via chrome.storage.session     │
│   - Notifies Side Panel when recording completes       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               Side Panel / Tool Studio                 │
│   ├── src/services/workflow-synthesizer.ts             │
│   │     - Action trace optimization                    │
│   │     - Parameter inference engine                   │
│   │     - Deterministic JavaScript code generator      │
│   └── src/components/tools/WorkflowReviewModal.tsx     │
│         - Interactive Step Timeline & Deletion         │
│         - Parameter Definition Editor                  │
│         - CodeMirror Live Code Preview                 │
│         - Immediate In-Tab "Test Run" Verification     │
│         - Save to VFS (/tools/<name>.js) & Enable      │
└────────────────────────────────────────────────────────┘
```

---

## 3. Component Specifications

### 3.1. In-Page Recorder HUD (`entrypoints/workflow-recorder.content/`)
* **Mounting**: Injected on-demand using WXT `createShadowRootUi` with `anchor: 'body'`. Ensures zero CSS bleed into or from the host web page.
* **UI Controls**:
  * **Status Pill**: Pulsing red record indicator with live step counter (`● Rec [4 steps]`).
  * **Pause / Resume Button**: Suspends event capturing to let the user navigate, inspect, or scroll freely without logging spurious events.
  * **Finish Button**: Finalizes the session, sends the action trace to the Side Panel, and unmounts the HUD.
  * **Cancel Button**: Discards the recorded trace without saving.
* **Self-Exclusion**: All clicks, keyboard inputs, and events originating inside the HUD Shadow DOM are filtered out and never recorded.

### 3.2. Event Capture & Selector Cascade Engine
The content script listens to browser events at the capture phase (`useCapture: true`):

| Event | Action Recorded | Details Captured |
| :--- | :--- | :--- |
| `click` | `click` | Target element, selector cascade, inner text |
| `input`, `change` | `fill` | 300ms debounce per input, current text value, input type, placeholder, name |
| `change` (select) | `select` | Selected value, selected option text |
| `change` (checkbox/radio) | `toggle` | Checked status (`true`/`false`) |
| SPA / URL Change | `navigate` | New target URL, transition type |

#### Resilient Selector Cascade
For every interacted element, the engine generates an ordered array of candidate selectors:
1. **Data Test Attributes**: `[data-testid="..."]`, `[data-test="..."]`, `[data-cy="..."]`.
2. **Stable ID**: `#id` (excluding dynamic generated patterns such as hashes or numeric suffixes like `:r1:`, `ember1234`, `input-3829`).
3. **Form & Accessibility Attributes**: `input[name="..."]`, `[aria-label="..."]`, `[placeholder="..."]`.
4. **Text-Matching Anchor**: Tag + trimmed text (e.g. `button:has-text("Submit Order")`, `a:has-text("Invoices")`).
5. **Scoped CSS Path**: Shortest unique CSS selector traversing up to the nearest unique ancestor.

---

### 3.3. Workflow Synthesis & Parameter Inference (`src/services/workflow-synthesizer.ts`)

#### Parameter Detection
For every `fill` action, the synthesizer analyzes metadata from the target element to automatically infer dynamic arguments:
* Input name/id/placeholder matching keywords (`search`, `query`, `keyword`) $\rightarrow$ `@param {string} searchQuery`.
* Input with `type="email"` or matching `email` $\rightarrow$ `@param {string} email`.
* Date pickers $\rightarrow$ `@param {string} targetDate`.
* Generic inputs without clear semantics $\rightarrow$ `@param {string} inputField<Index>`.

#### Code Template Architecture
The synthesizer generates a clean, self-contained async JavaScript tool:
```javascript
/**
 * @tool <toolName>
 * @description <toolDescription>
 * @param {string} <paramName> <paramDescription> (default: "<defaultValue>")
 */
(async (args) => {
  const findEl = (selectors, textMatch) => {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    if (textMatch) {
      const all = document.querySelectorAll(textMatch.tag || '*');
      for (const el of all) {
        if (el.textContent && el.textContent.trim().toLowerCase() === textMatch.text.toLowerCase()) {
          return el;
        }
      }
    }
    return null;
  };

  const waitEl = async (selectors, textMatch, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = findEl(selectors, textMatch);
      if (found) return found;
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Timeout waiting for element: ${selectors.join(' or ')}`);
  };

  // Step-by-step replay logic...
  // Uses args.<paramName> || "<defaultValue>"

  return { success: true, message: "Workflow completed successfully" };
})
```

---

### 3.4. UI Integration (`ToolStudioView.tsx` & `WorkflowReviewModal.tsx`)

1. **Tool Studio Integration**:
   * Add a **"Record Workflow"** button with a distinct red record icon in `ToolStudioView.tsx`.
   * Add active recording banner if the side panel is opened while a recording is in progress on the current tab.
2. **Review Modal**:
   * **Tool Details**: Name input (alphanumeric validation) and description input.
   * **Step Timeline**: Card per recorded step with action type icon, target preview, and delete button to remove spurious clicks.
   * **Parameter Table**: Table of extracted parameters with editable Name, Type, Default Value, and Description.
   * **Code Editor**: CodeMirror editor allowing manual inspection or adjustments.
   * **Actions**:
     * **Test Run**: Calls `executeUserTool` on the active tab and displays live stdout / execution results.
     * **Save & Enable**: Writes the generated code to `/tools/<toolName>.js` via `saveVfsFile`, sets `userToolsConfig[toolName] = true`, and closes the modal.

---

## 4. State Management & Runtime Protocol

### Chrome Messages:
* `START_WORKFLOW_RECORDING`: Sent from Side Panel to Background, which registers tab ID and injects the content script.
* `WORKFLOW_RECORDING_STEP`: Sent from content script to background to update in-memory count and sync to `chrome.storage.session`.
* `WORKFLOW_RECORDING_FINISH`: Sent when user clicks Finish, conveying `{ actions: RecordedAction[], initialUrl: string }`.
* `WORKFLOW_RECORDING_CANCEL`: Sent to abort recording and clean up session state.

### Multi-Page Navigation Resilience:
* In-progress traces are synced to `chrome.storage.session` key `active_workflow_recording_${tabId}` on every action.
* When a full page reload or navigation occurs, the content script checks `chrome.storage.session` on mount and resumes the active recording session with the existing step count.

---

## 5. Verification & Testing Plan

1. **Unit Tests (`workflow-synthesizer.test.ts`)**:
   * Verify selector cascade generator produces correct priority order for mocked DOM nodes.
   * Verify parameter extraction correctly identifies variable values and produces valid JSDoc.
   * Verify synthesized JavaScript passes syntax validation (`new Function(...)`).
2. **End-to-End Extension Test**:
   * Click "Record Workflow" on a form page.
   * Perform click, text fill, dropdown select, and click submit.
   * Click Finish on the floating HUD.
   * Verify steps and inferred parameters populate in `WorkflowReviewModal`.
   * Test Run execution on the tab and assert all fields fill and submit cleanly.
   * Save to VFS and verify tool is listed and executable in `ToolStudioView`.
