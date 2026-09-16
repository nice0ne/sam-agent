/**
 * Autonomous Scheduler Service & Data Model
 * Handles CRUD for scheduled tasks and synchronization with chrome.alarms API.
 */

export interface ScheduledTask {
  id: string;
  title: string;
  prompt: string;
  scheduleType: 'interval' | 'cron' | 'once';
  intervalMinutes?: number;
  cronExpression?: string;
  runAtTimestamp?: number;
  enabled: boolean;
  notifyOnComplete: boolean;
  lastRunTimestamp?: number;
  lastStatus?: 'success' | 'error' | 'running';
  lastOutputSummary?: string;
  createdAt: number;
}

export const STORAGE_TASKS_KEY = 'scheduledTasks';

/**
 * Helper to match single value against a cron field expression (min, max)
 */
function matchesCronField(val: number, fieldStr: string, min: number, max: number): boolean {
  if (!fieldStr || fieldStr === '*' || fieldStr === '?') return true;

  const parts = fieldStr.split(',');
  for (const part of parts) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;
      let start = min;
      let end = max;
      if (range !== '*') {
        if (range.includes('-')) {
          const [rStart, rEnd] = range.split('-');
          start = parseInt(rStart, 10);
          end = parseInt(rEnd, 10);
        } else {
          start = parseInt(range, 10);
        }
      }
      if (val >= start && val <= end && (val - start) % step === 0) return true;
    } else if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && val >= start && val <= end) return true;
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && (num === val || (num === 7 && val === 0))) return true;
    }
  }
  return false;
}

/**
 * Calculates the next matching timestamp (in ms) for a standard 5-part cron expression.
 */
export function getNextCronTimestamp(cron: string, fromDate: Date = new Date()): number | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const [minExpr, hourExpr, dayExpr, monthExpr, dowExpr] = parts;

  // Advance by at least 1 minute from the reference date
  const candidate = new Date(fromDate.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Search forward up to 1 year (525600 minutes)
  for (let i = 0; i < 525600; i++) {
    const month = candidate.getMonth() + 1; // 1-12
    if (!matchesCronField(month, monthExpr, 1, 12)) {
      candidate.setMonth(candidate.getMonth() + 1, 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    const day = candidate.getDate(); // 1-31
    const dow = candidate.getDay(); // 0-6 (0 is Sunday)
    if (!matchesCronField(day, dayExpr, 1, 31) || !matchesCronField(dow, dowExpr, 0, 6)) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    const hour = candidate.getHours(); // 0-23
    if (!matchesCronField(hour, hourExpr, 0, 23)) {
      candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
      continue;
    }

    const minute = candidate.getMinutes(); // 0-59
    if (matchesCronField(minute, minExpr, 0, 59)) {
      return candidate.getTime();
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

/**
 * Retrieve all scheduled tasks from chrome.storage.local.
 */
export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(STORAGE_TASKS_KEY);
      const tasks = res?.[STORAGE_TASKS_KEY];
      if (Array.isArray(tasks)) {
        return tasks;
      }
    }
  } catch (err) {
    console.error('[Scheduler] Failed to load scheduled tasks:', err);
  }
  return [];
}

/**
 * Synchronize a single task's alarm with chrome.alarms.
 * Clears existing alarm and re-registers if task is enabled.
 */
export async function syncTaskAlarm(task: ScheduledTask): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.alarms) {
    return;
  }

  try {
    // Clear any previous alarm for this task
    await chrome.alarms.clear(task.id);

    if (!task.enabled) {
      return;
    }

    if (task.scheduleType === 'interval') {
      const interval = Math.max(1, Math.round(task.intervalMinutes || 15));
      chrome.alarms.create(task.id, {
        delayInMinutes: interval,
        periodInMinutes: interval,
      });
    } else if (task.scheduleType === 'once') {
      if (task.runAtTimestamp && task.runAtTimestamp > Date.now()) {
        chrome.alarms.create(task.id, {
          when: task.runAtTimestamp,
        });
      }
    } else if (task.scheduleType === 'cron') {
      const cron = task.cronExpression?.trim();
      if (cron) {
        // Quick check for simple step intervals e.g. */10 * * * *
        const stepMatch = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
        if (stepMatch) {
          const stepMins = Math.max(1, parseInt(stepMatch[1], 10) || 1);
          chrome.alarms.create(task.id, {
            delayInMinutes: stepMins,
            periodInMinutes: stepMins,
          });
        } else {
          // Approximate next run timestamp using cron parser
          const nextRun = getNextCronTimestamp(cron);
          if (nextRun && nextRun > Date.now()) {
            chrome.alarms.create(task.id, {
              when: nextRun,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Scheduler] Failed to sync alarm for task ${task.id}:`, err);
  }
}

/**
 * Save or update a scheduled task in storage and sync its alarm.
 */
export async function saveScheduledTask(task: ScheduledTask): Promise<void> {
  const tasks = await listScheduledTasks();
  const existingIdx = tasks.findIndex((t) => t.id === task.id);
  if (existingIdx >= 0) {
    tasks[existingIdx] = { ...tasks[existingIdx], ...task };
  } else {
    tasks.push(task);
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_TASKS_KEY]: tasks });
  }

  await syncTaskAlarm(task);
}

/**
 * Flip the enabled flag for a scheduled task and update its alarm status.
 */
export async function toggleTaskEnabled(taskId: string, enabled: boolean): Promise<void> {
  const tasks = await listScheduledTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  task.enabled = enabled;

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_TASKS_KEY]: tasks });
  }

  await syncTaskAlarm(task);
}

/**
 * Delete a scheduled task from storage and clear its alarm.
 */
export async function deleteScheduledTask(taskId: string): Promise<void> {
  const tasks = await listScheduledTasks();
  const filtered = tasks.filter((t) => t.id !== taskId);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_TASKS_KEY]: filtered });
  }

  if (typeof chrome !== 'undefined' && chrome.alarms) {
    await chrome.alarms.clear(taskId);
  }
}

/**
 * Iterate over all scheduled tasks and ensure their alarms are correctly registered or cleared.
 */
export async function syncAllTaskAlarms(): Promise<void> {
  const tasks = await listScheduledTasks();
  for (const task of tasks) {
    await syncTaskAlarm(task);
  }
}

/**
 * Generate a friendly human-readable description for a task's schedule.
 */
export function formatScheduleDescription(task: ScheduledTask): string {
  switch (task.scheduleType) {
    case 'interval': {
      const mins = task.intervalMinutes || 15;
      if (mins === 1) return 'Every 1 minute';
      if (mins < 60) return `Every ${mins} minutes`;
      const hours = Math.floor(mins / 60);
      const rem = mins % 60;
      if (rem === 0) {
        return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
      }
      return `Every ${hours}h ${rem}m`;
    }
    case 'once': {
      if (!task.runAtTimestamp) return 'Run once (unscheduled)';
      const date = new Date(task.runAtTimestamp);
      return `Run once at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${date.toLocaleDateString()}`;
    }
    case 'cron': {
      const expr = task.cronExpression?.trim() || '';
      if (!expr) return 'Cron (unspecified)';

      const stepMatch = expr.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
      if (stepMatch) {
        return `Every ${stepMatch[1]} minutes`;
      }
      if (expr === '0 * * * *') return 'Hourly at minute 0';
      if (expr === '0 0 * * *') return 'Daily at midnight (00:00)';

      const dailyMatch = expr.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
      if (dailyMatch) {
        const h = dailyMatch[2].padStart(2, '0');
        const m = dailyMatch[1].padStart(2, '0');
        return `Daily at ${h}:${m}`;
      }

      const weekdayMatch = expr.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+1-5$/);
      if (weekdayMatch) {
        const h = weekdayMatch[2].padStart(2, '0');
        const m = weekdayMatch[1].padStart(2, '0');
        return `Weekdays (Mon-Fri) at ${h}:${m}`;
      }

      return `Cron (${expr})`;
    }
    default:
      return 'Manual execution';
  }
}
