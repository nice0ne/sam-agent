# Autonomous Background Task Scheduler & Cron Specification

**Date:** 2026-09-12  
**Project:** SAM-Agent Chrome Extension (Rebuild UI)  
**Status:** Approved for Implementation  
**Sub-Project:** 4 of 4 (Scheduled Background Automation)

---

## 1. Overview & Objectives

SAM-Agent currently requires real-time user interaction within the active sidepanel chat. This final sub-project adds **Autonomous Background Scheduling**:
1. Users define scheduled tasks with natural language prompts (e.g. *"Daily at 8 AM, open finance news, extract top 5 stories, and save to /workspace/news.md"*).
2. Schedules can be configured via easy presets (15 mins, 30 mins, 1 hour, 6 hours, 24 hours, one-shot timer) or flexible 5-field Cron expressions.
3. Chrome Extension Manifest V3 `chrome.alarms` wakes the service worker (`background.ts`) right on schedule without draining device memory or battery while idle.
4. When an alarm triggers, the agent executes the task autonomously in background, updates execution history, saves any VFS artifacts, and optionally triggers a Chrome desktop notification (`chrome.notifications.create`).
5. A dedicated **Scheduler UI** allows users to manage, pause/resume, delete, and manually "Run Now" any scheduled task with one click.

---

## 2. Technical Architecture & Module Layout

```
rebuild-ui/
├── entrypoints/
│   ├── background.ts          <-- [MODIFIED] Added chrome.alarms listener & background task executor
│   └── sidepanel/
│       └── App.tsx            <-- [MODIFIED] Render SchedulerView when view === 'scheduler'
├── src/
│   ├── services/
│   │   ├── scheduler.ts       <-- [NEW] Task CRUD, alarm registration, next run formatting, cron calculator
│   │   └── scheduler-runner.ts<-- [NEW] Autonomous background execution logic for scheduled tasks
│   ├── stores/
│   │   └── useAppStore.ts     <-- [MODIFIED] Added 'scheduler' view to AppState
│   └── components/
│       ├── chat/
│       │   └── Header.tsx     <-- [MODIFIED] Added CalendarClock icon button for Scheduler View
│       └── scheduler/
│           ├── SchedulerView.tsx <-- [NEW] Task list, pause/resume, run now, delete, and create modal
│           └── CreateTaskModal.tsx<-- [NEW] Form for interval/cron, prompt, and notification toggle
```

---

## 3. Detailed Specifications

### 3.1 Task Data Model (`src/services/scheduler.ts`)

```typescript
export interface ScheduledTask {
  id: string;                      // UUID
  title: string;                   // User-defined title
  prompt: string;                  // AI instruction prompt
  scheduleType: 'interval' | 'cron' | 'once';
  intervalMinutes?: number;        // e.g. 15, 30, 60, 360, 1440
  cronExpression?: string;         // 5-field cron expression, e.g. "0 9 * * 1-5"
  runAtTimestamp?: number;         // One-shot timer timestamp
  enabled: boolean;                // Active or paused
  notifyOnComplete: boolean;       // Display native Chrome notification
  lastRunTimestamp?: number;       // Epoch ms of previous run
  lastStatus?: 'success' | 'error' | 'running';
  lastOutputSummary?: string;      // AI response or error message
  createdAt: number;
}
```

#### Storage Key:
- `scheduledTasks`: Array of `ScheduledTask` persisted in `chrome.storage.local`.

---

### 3.2 Scheduler Service Functions (`src/services/scheduler.ts`)

1. **`listScheduledTasks(): Promise<ScheduledTask[]>`**
   - Retrieves all tasks from `chrome.storage.local`.
2. **`saveScheduledTask(task: ScheduledTask): Promise<void>`**
   - Upserts task into storage.
   - If `task.enabled`, registers or updates alarm via `syncTaskAlarm(task)`.
   - If `!task.enabled`, removes alarm via `chrome.alarms.clear(task.id)`.
3. **`toggleTaskEnabled(taskId: string, enabled: boolean): Promise<void>`**
   - Updates status and creates/clears corresponding Chrome alarm.
4. **`deleteScheduledTask(taskId: string): Promise<void>`**
   - Removes task from storage and clears alarm.
5. **`syncAllTaskAlarms(): Promise<void>`**
   - Re-registers alarms for all enabled tasks (called on extension startup/install).
6. **`formatScheduleDescription(task: ScheduledTask): string`**
   - Returns human-friendly text (e.g. *"Every 1 hour"*, *"Daily (24h)"*, *"Cron: 0 9 * * 1-5"*).
7. **`calculateNextRunMinutes(task: ScheduledTask): number`**
   - Calculates remaining minutes until next execution.

---

### 3.3 Background Execution Service (`src/services/scheduler-runner.ts`)

1. **`executeScheduledTask(task: ScheduledTask): Promise<{ success: boolean; output: string }>`**:
   - Updates task `lastStatus = 'running'`.
   - Reads active AI provider, model, API keys, and `agentSoul` from storage.
   - If task requires browsing (detected by keywords like *buka, search, visit, check, pantau, http*), creates a background tab via `chrome.tabs.create({ active: false })`.
   - Calls the autonomous execution loop to process the prompt.
   - Captures text output and any VFS changes.
   - Closes temporary background tab if one was created.
   - Updates task with `lastRunTimestamp = Date.now()`, `lastStatus: 'success' | 'error'`, `lastOutputSummary = summary`.
   - If `task.notifyOnComplete`:
     - Dispatches `chrome.notifications.create` with title *"SAM-Agent: Task Selesai"* and summary text.

---

### 3.4 Integration in `entrypoints/background.ts`

- Add listener `chrome.alarms.onAlarm.addListener(async (alarm) => { ... })`:
  - Matches `alarm.name` against `listScheduledTasks()`.
  - If found and enabled, invokes `executeScheduledTask(task)`.
- Add listener `chrome.runtime.onStartup` & `chrome.runtime.onInstalled`:
  - Calls `syncAllTaskAlarms()`.

---

### 3.5 UI Components (`SchedulerView.tsx` & `CreateTaskModal.tsx`)

#### `SchedulerView.tsx`
- Header:
  - Back to chat button (`ArrowLeft`), Title *"Autonomous Scheduler"*, Count badge, "+ New Task" button.
- Task List:
  - Renders cards with:
    - Status badge: Active (green pulse), Paused (gray), Running (blue spinner).
    - Schedule badge (`CalendarClock` icon, description).
    - Last run time & status badge.
    - Expandable summary of last AI output.
    - Quick actions:
      - **Run Now** (`Play` icon): executes task immediately.
      - **Toggle Switch**: pause or resume task.
      - **Delete** (`Trash2` icon): confirms and deletes.
- Empty State: Clean card explaining how scheduled automations work.

#### `CreateTaskModal.tsx`
- Dialog inputs:
  - Task Title input (e.g. *"Pantau Berita Harian"*).
  - Schedule Type Selector:
    - Interval Presets (15 min, 30 min, 1 hour, 6 hours, 24 hours).
    - One-Shot Timer (minutes from now).
    - Custom Cron Expression.
  - Prompt Instructions Textarea.
  - Checkbox: "Show Chrome desktop notification on completion".
  - Submit button: "Create Scheduled Task".

---

## 4. Error Handling & Edge Cases

1. **Browser Sleep / Restart**:
   - `chrome.alarms` automatically fires for missed recurring intervals once the browser wakes up.
2. **Execution Timeout**:
   - Background tasks have an internal timeout (3 minutes max) to prevent stalled execution.
3. **Notification Permissions**:
   - Manifest includes `"notifications"` permission; handles permission fallback gracefully.

---

## 5. Verification Plan

1. **TypeScript Verification**:
   - Run `npm run compile` (`tsc --noEmit`) - must pass with 0 errors.
2. **Production Bundle**:
   - Run `npm run build` (`wxt build`) - verify background entrypoint bundles cleanly.
3. **Functional Verification**:
   - Create a test scheduled task (e.g. interval 1 minute or One-Shot timer).
   - Click "Run Now" and verify immediate background execution.
   - Verify task card updates with timestamp and summary.
   - Verify desktop notification triggers on completion.
