# Architecture & Design Specification: Sub-Agent Delegation Pipeline (Planner ↔ Worker)

**Date:** 2026-10-13  
**Status:** Approved  
**Target Version:** v4.8.0  
**Scope:** Sub-Project 3 of Automation Enhancements (Multi-Agent Hierarchical Pipeline)

---

## 1. Executive Summary

The **Sub-Agent Delegation Pipeline** transforms SAM-Agent from a single-threaded loop into a hierarchical multi-agent orchestrator. When tasked with complex, multi-site, or multi-step research and automation goals, a high-level **Planner Agent** autonomously decomposes the objective into focused sub-tasks and delegates them to specialized, sandboxed **Worker Sub-Agents** (`researcher`, `scraper`, `analyst`).

Each worker executes in parallel within an isolated context window (max 6–8 steps, 1,500 token ceiling), preventing massive DOM/HTML bloat from degrading the Planner's primary token context. A resilient **Result Aggregator** collates worker findings, self-heals around partial worker timeouts, and injects distilled insights back to the Planner for final executive synthesis. Real-time execution is visualized in the chat stream via `SubagentPipelineCard.tsx` and synchronized live with the **3D Virtual Office**.

---

## 2. Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    User Prompt / Task Goal                   │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  Planner Agent (chat-runner)                 │
│   - Analyzes complexity & identifies parallel targets        │
│   - Emits: { "action": "delegateSubagents", "workers": [...] }│
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│           Sub-Agent Coordinator (subagent-coordinator)       │
│   - Manages concurrency pool (up to 3 parallel workers)      │
│   - Streams progress to SubagentPipelineCard in chat         │
│   - Broadcasts spawn events to Virtual Office 3D             │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐   │
│   │ Worker 1: Researcher (Web search, read articles)     │   │
│   ├──────────────────────────────────────────────────────┤   │
│   │ Worker 2: Scraper    (DOM inspection, tables, lists) │   │
│   ├──────────────────────────────────────────────────────┤   │
│   │ Worker 3: Analyst    (Document/Spreadsheet builder)  │   │
│   └──────────────────────────────────────────────────────┘   │
└──────────────────────────────┬───────────────────────────────┘
                               │ Structured Deliverables
                               ▼
┌──────────────────────────────────────────────────────────────┐
│              Result Aggregator & Self-Healing Guard          │
│   - Gathers worker summaries & structured datasets           │
│   - Retries or gracefully notes worker timeouts/errors       │
│   - Injects concise observation into Planner turn            │
└──────────────────────────────┬───────────────────────────────┘
                               │ Distilled Observation
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                Planner Final Executive Synthesis             │
│   - Unified comprehensive answer                             │
│   - Multi-tab Word (.docx) or Excel (.xlsx) final report     │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Component Specifications

### 3.1. Sub-Agent Coordinator (`src/services/subagent-coordinator.ts`)
* **Worker Specification Contract**:
  ```typescript
  export interface WorkerSpec {
    id: string;
    name: string;
    role: 'researcher' | 'scraper' | 'analyst';
    taskPrompt: string;
    targetUrls?: string[];
    maxSteps?: number;
    color?: string;
  }

  export interface WorkerDeliverable {
    workerId: string;
    name: string;
    role: 'researcher' | 'scraper' | 'analyst';
    status: 'completed' | 'failed' | 'timeout';
    summary: string;
    extractedData?: Record<string, any>[];
    artifactsCreated?: string[];
    stepsUsed: number;
    durationMs: number;
    error?: string;
  }
  ```

* **Execution Engine (`executeWorkerSubagent`)**:
  * Spins up an independent, lightweight chat runner loop.
  * System prompt is dynamically pruned and role-specific (e.g. Researcher receives search & navigation tools; Scraper receives page reading & visual inspection tools).
  * Enforces strict timeout (45,000ms) and turn budget (default: 8 turns).
  * Automatically closes any auxiliary browser tabs opened by the worker upon completion.

### 3.2. Chat Runner Integration (`src/services/chat-runner.ts`)
* **New Action Definition**:
  ```json
  {
    "action": "delegateSubagents",
    "planTitle": "Market Price and Review Comparison",
    "workers": [
      {
        "id": "w1",
        "name": "Tokopedia Scout",
        "role": "researcher",
        "taskPrompt": "Search for Lenovo Yoga Slim 7 on Tokopedia and extract price and rating"
      },
      {
        "id": "w2",
        "name": "Shopee Scout",
        "role": "researcher",
        "taskPrompt": "Search for Lenovo Yoga Slim 7 on Shopee and extract price and rating"
      }
    ]
  }
  ```
* **Observation Return**:
  * The coordinator intercepts the tool call, displays the UI card, waits for completion via `Promise.allSettled()`, and returns an executive Markdown observation block to the Planner.

### 3.3. Live Pipeline Card Component (`src/components/chat/SubagentPipelineCard.tsx`)
* **Header**: Plan title, status indicator, progress percentage bar.
* **Worker Grid**:
  * Status pills (`● Running` [pulsing blue], `✓ Completed` [emerald], `⚠ Failed` [red]).
  * Role badge with icon (`Search`, `Table`, `FileText`).
  * Turn counter (`Turn 4/8`).
  * Collapsible drawer: "View Thought Log" showing live worker reasoning trace without leaving the chat.
* **Chat Input Toggle**:
  * "Multi-Agent Mode" pill toggle in `ChatInput.tsx` enabling users to explicitly enforce parallel delegation.

### 3.4. Virtual Office 3D Integration
* Calls `sendOfficeEvent()` (`STAGE: EXECUTING_SUBAGENTS`) upon worker dispatch.
* Passes `subagents: [{ name, role, task, color }]` to trigger 3D portal teleportation and live whiteboard updates on `localhost:8000`.

---

## 4. Error Handling & Self-Healing

1. **Partial Worker Failure**:
   * If 1 of 3 workers fails or times out, the coordinator aggregates the successful 2 workers, appends a warning to the observation block, and allows the Planner to formulate the final answer using available data.
2. **Context Budget Exceeded**:
   * If a worker hits its 8-turn limit before producing a formal answer, the coordinator captures the worker's latest thoughts and extracts whatever partial data was found.
3. **Tab Leakage Prevention**:
   * Every tab created by a worker is recorded in `workerCreatedTabs: Set<number>`. A `finally` block guarantees all non-active auxiliary tabs are closed when the worker terminates.

---

## 5. Verification & Testing Plan

1. **Unit Tests (`subagent-coordinator.test.ts`)**:
   * Verify worker task specification validation.
   * Verify aggregation format for both complete and partial success scenarios.
2. **End-to-End Extension Test**:
   * Trigger multi-agent prompt (e.g. comparing 2 topics simultaneously).
   * Verify `SubagentPipelineCard` displays and animates progress.
   * Verify workers run concurrently and complete within step quotas.
   * Verify Planner synthesizes the combined report cleanly.
   * Verify Virtual Office 3D receives stage and subagent broadcasts.
