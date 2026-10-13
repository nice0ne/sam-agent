# Sub-Agent Delegation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform SAM-Agent into a hierarchical multi-agent assistant by implementing a Planner ↔ Worker delegation pipeline with isolated execution sandboxes, live in-chat visualization, fault-tolerant aggregation, and 3D Virtual Office sync.

**Architecture:** A subagent coordinator service spins up sandboxed worker runners with role-specific system prompts and bounded budgets (max 6-8 turns). Workers execute in parallel via `Promise.allSettled()`, stream progress to a `SubagentPipelineCard` in the chat timeline, and send findings to a result aggregator. The Planner receives distilled observations without context bloat and completes the final response.

**Tech Stack:** TypeScript, React 19, WXT (Chrome MV3), Lucide React, Tailwind CSS v4, Virtual Office 3D SDK.

**Spec:** [`docs/superpowers/specs/2026-10-13-subagent-delegation-design.md`](file:///E:/VIBE-CODE-WS/CHROME-EXT/Sam-Agent/docs/superpowers/specs/2026-10-13-subagent-delegation-design.md)

## Global Constraints
- Target platform: Chrome Extension Manifest V3 with WXT 0.19.
- Sandboxed worker messages must NOT pollute the main thread context.
- Workers must enforce strict timeouts and automatic tab cleanup.
- Must compile cleanly with `npm run compile` (`tsc --noEmit`).

---

### Task 1: Subagent Types & Contract Interfaces

**Files:**
- Create: `src/types/subagent.ts`
- Modify: `src/types/agent.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type WorkerRole = 'researcher' | 'scraper' | 'analyst';

  export interface WorkerSpec {
    id: string;
    name: string;
    role: WorkerRole;
    taskPrompt: string;
    targetUrls?: string[];
    maxSteps?: number;
    color?: string;
  }

  export interface WorkerDeliverable {
    workerId: string;
    name: string;
    role: WorkerRole;
    status: 'completed' | 'failed' | 'timeout';
    summary: string;
    extractedData?: Record<string, any>[];
    artifactsCreated?: string[];
    stepsUsed: number;
    durationMs: number;
    error?: string;
    logs?: string[];
  }

  export interface PipelineProgress {
    planTitle: string;
    totalWorkers: number;
    completedWorkers: number;
    workers: Record<string, {
      status: 'pending' | 'running' | 'completed' | 'failed';
      currentStep: number;
      maxSteps: number;
      lastThought?: string;
    }>;
  }
  ```

- [ ] **Step 1: Implement `src/types/subagent.ts`**
  Define all contract interfaces, status enums, and pipeline progress structures.

- [ ] **Step 2: Update `src/types/agent.ts`**
  Add `SubagentPipelinePart` to `MessagePart` union type for chat rendering.

- [ ] **Step 3: Run compilation check**
  Run `npm run compile`.

- [ ] **Step 4: Commit**
  `git add src/types/; git commit -m "feat(subagent): add subagent types and contract interfaces"`

---

### Task 2: Sub-Agent Coordinator & Sandboxed Worker Runner

**Files:**
- Create: `src/services/subagent-coordinator.ts`

**Interfaces:**
- Consumes: `WorkerSpec`, `WorkerDeliverable` from Task 1.
- Produces:
  ```typescript
  export async function runSubagentPipeline(
    planTitle: string,
    workers: WorkerSpec[],
    onProgress?: (progress: PipelineProgress) => void
  ): Promise<{
    deliverables: WorkerDeliverable[];
    aggregatedObservation: string;
  }>;
  ```

- [ ] **Step 1: Implement role-specific system prompt generator**
  Tailor prompts for `researcher`, `scraper`, and `analyst`.

- [ ] **Step 2: Implement sandboxed worker execution runner (`executeWorkerSubagent`)**
  - Independent messages array.
  - Step counter & 45-second timeout safeguard.
  - Auxiliary tab tracking & cleanup.

- [ ] **Step 3: Implement concurrency pool and 3D Virtual Office sync**
  - Run up to 3 workers with `Promise.allSettled()`.
  - Send spawn & stage events to Virtual Office via `notify.js`.

- [ ] **Step 4: Implement result aggregator & fault-tolerant observer**
  Compile clean Markdown summary for Planner observation.

- [ ] **Step 5: Verify compilation**
  Run `npm run compile`.

- [ ] **Step 6: Commit**
  `git add src/services/subagent-coordinator.ts; git commit -m "feat(subagent): implement subagent coordinator and sandbox runner"`

---

### Task 3: Planner Integration in Chat Runner Loop

**Files:**
- Modify: `src/services/chat-runner.ts`

**Interfaces:**
- Consumes: `runSubagentPipeline` from Task 2.

- [ ] **Step 1: Add `delegateSubagents` action definition to system prompt**
  Instruct Planner on when and how to delegate to specialized sub-agents.

- [ ] **Step 2: Implement action block handler in chat-runner**
  Parse `delegateSubagents` action, invoke coordinator, stream progress into message parts, and inject aggregated observation into next turn.

- [ ] **Step 3: Verify compilation**
  Run `npm run compile`.

- [ ] **Step 4: Commit**
  `git add src/services/chat-runner.ts; git commit -m "feat(subagent): integrate delegateSubagents action into chat runner"`

---

### Task 4: Live Pipeline UI Card & Chat Input Mode Toggle

**Files:**
- Create: `src/components/chat/SubagentPipelineCard.tsx`
- Modify: `src/components/chat/ChatMessage.tsx`
- Modify: `src/components/chat/ChatInput.tsx`

**Interfaces:**
- Consumes: `PipelineProgress` from Task 1 & 2.

- [ ] **Step 1: Build `SubagentPipelineCard.tsx`**
  - Progress bar with percentage indicator.
  - Worker cards with role icons, live status pills, and step counters.
  - Expandable drawer to inspect worker reasoning traces.

- [ ] **Step 2: Update `ChatMessage.tsx`**
  Render `SubagentPipelineCard` when message part is `subagent_pipeline`.

- [ ] **Step 3: Update `ChatInput.tsx`**
  Add "Multi-Agent Mode" button with visual active badge.

- [ ] **Step 4: Verify compilation**
  Run `npm run compile`.

- [ ] **Step 5: Commit**
  `git add src/components/chat/; git commit -m "feat(subagent): create SubagentPipelineCard and ChatInput toggle"`

---

### Task 5: End-to-End Build, Extension Packaging & Version Bump (v4.8.0)

**Files:**
- Modify: `package.json` (bump to `4.8.0`)
- Modify: `README.md` (add v4.8.0 release notes)

- [ ] **Step 1: Update package.json version to 4.8.0**
- [ ] **Step 2: Update README.md with v4.8.0 documentation**
- [ ] **Step 3: Run full production build (`npm run build`)**
- [ ] **Step 4: Commit and push to GitHub**
