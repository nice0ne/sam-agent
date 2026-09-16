import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Plus,
  RotateCw,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Bell,
  Clock,
} from 'lucide-react';
import {
  ScheduledTask,
  listScheduledTasks,
  toggleTaskEnabled,
  deleteScheduledTask,
  formatScheduleDescription,
} from '../../services/scheduler';
import { executeScheduledTask } from '../../services/scheduler-runner';
import { useAppStore } from '../../stores/useAppStore';
import { CreateTaskModal } from './CreateTaskModal';

export const SchedulerView: React.FC = () => {
  const { setView, activeThreadId, navigateToChat } = useAppStore();

  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [runningTaskIds, setRunningTaskIds] = useState<Set<string>>(new Set());
  const [expandedSummaryIds, setExpandedSummaryIds] = useState<Set<string>>(new Set());
  const [taskToDelete, setTaskToDelete] = useState<ScheduledTask | null>(null);

  // Load scheduled tasks
  const loadTasks = useCallback(async () => {
    try {
      const items = await listScheduledTasks();
      setTasks(items);
    } catch (err) {
      console.error('[SchedulerView] Failed to load tasks:', err);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    loadTasks().finally(() => setIsLoading(false));
  }, [loadTasks]);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTasks();
    setTimeout(() => setIsRefreshing(false), 400);
  };

  // Toggle active/paused state
  const handleToggleEnabled = async (task: ScheduledTask) => {
    const nextState = !task.enabled;
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, enabled: nextState } : t))
    );
    try {
      await toggleTaskEnabled(task.id, nextState);
      await loadTasks();
    } catch (err) {
      console.error('[SchedulerView] Error toggling task:', err);
      await loadTasks();
    }
  };

  // Run task immediately
  const handleRunNow = async (task: ScheduledTask) => {
    if (runningTaskIds.has(task.id)) return;

    setRunningTaskIds((prev) => new Set(prev).add(task.id));
    // Update local card status to running
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, lastStatus: 'running' } : t))
    );

    try {
      await executeScheduledTask(task);
    } catch (err) {
      console.error('[SchedulerView] Error running task:', err);
    } finally {
      setRunningTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      await loadTasks();
    }
  };

  // Delete task confirmation
  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    const targetId = taskToDelete.id;
    setTaskToDelete(null);

    // Optimistic removal
    setTasks((prev) => prev.filter((t) => t.id !== targetId));
    try {
      await deleteScheduledTask(targetId);
      await loadTasks();
    } catch (err) {
      console.error('[SchedulerView] Error deleting task:', err);
      await loadTasks();
    }
  };

  // Toggle output summary expansion
  const toggleSummaryExpand = (taskId: string) => {
    setExpandedSummaryIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  return (
    <div className="relative flex flex-col h-screen bg-background text-foreground select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (activeThreadId) {
                navigateToChat(activeThreadId);
              } else {
                setView('chat');
              }
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-all cursor-pointer"
            title="Back to Chat"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5 truncate">
              <span>Autonomous Scheduler</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">
                {tasks.length}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-all cursor-pointer"
            title="Refresh Tasks"
          >
            <RotateCw className={`size-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </button>

          {/* New Task Button */}
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-primary-foreground hover:opacity-90 active:scale-95 rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-all"
            title="Create New Scheduled Task"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">New Task</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center text-muted-foreground space-y-2">
            <Loader2 className="size-6 text-primary animate-spin" />
            <span className="text-xs font-mono">Loading scheduled tasks...</span>
          </div>
        ) : tasks.length === 0 ? (
          /* Empty State */
          <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-6 space-y-4 my-auto">
            <div className="size-12 rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-transparent border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <CalendarClock className="size-6" />
            </div>
            <div className="space-y-1 max-w-xs">
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                No autonomous tasks scheduled
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Autonomous background tasks run on recurring intervals or cron schedules using Chrome Alarms, executing instructions without keeping the sidepanel open.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 active:scale-95 rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-all"
            >
              <Plus className="size-3.5" />
              <span>Create First Task</span>
            </button>
          </div>
        ) : (
          /* Task Cards List */
          <div className="grid gap-3">
            {tasks.map((task) => {
              const isTaskRunning =
                runningTaskIds.has(task.id) || task.lastStatus === 'running';
              const isExpanded = expandedSummaryIds.has(task.id);
              const scheduleDesc = formatScheduleDescription(task);

              return (
                <div
                  key={task.id}
                  className={`group relative rounded-xl border transition-all p-3.5 shadow-2xs space-y-3 ${
                    task.enabled
                      ? 'border-border/90 bg-card/80 hover:bg-card'
                      : 'border-border/50 bg-muted/20 opacity-80'
                  }`}
                >
                  {/* Top Bar: Title, Badges, Switch */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-foreground truncate select-text">
                          {task.title}
                        </span>

                        {/* Status Indicator */}
                        {isTaskRunning ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 text-[10px] font-medium border border-blue-500/30 animate-pulse">
                            <Loader2 className="size-2.5 animate-spin" />
                            <span>Executing in background...</span>
                          </span>
                        ) : task.enabled ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-medium border border-emerald-500/30">
                            <span className="size-1.5 rounded-full bg-emerald-500"></span>
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium border border-border">
                            <span className="size-1.5 rounded-full bg-muted-foreground"></span>
                            <span>Paused</span>
                          </span>
                        )}

                        {/* Notification indicator */}
                        {task.notifyOnComplete && (
                          <span
                            className="text-muted-foreground/70"
                            title="Chrome desktop notifications enabled"
                          >
                            <Bell className="size-3" />
                          </span>
                        )}
                      </div>

                      {/* Schedule Badge */}
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground text-[10px] font-mono border border-border/60">
                        <CalendarClock className="size-3 text-primary shrink-0" />
                        <span>{scheduleDesc}</span>
                      </div>
                    </div>

                    {/* Switch Toggle */}
                    <label
                      className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5"
                      title={task.enabled ? 'Click to pause task' : 'Click to activate task'}
                    >
                      <input
                        type="checkbox"
                        checked={task.enabled}
                        onChange={() => handleToggleEnabled(task)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {/* Task Prompt Snippet */}
                  <div className="p-2 rounded-lg bg-background/50 border border-border/50 text-[11px] text-muted-foreground leading-relaxed select-text line-clamp-2">
                    {task.prompt}
                  </div>

                  {/* Output Summary & Last Run Section */}
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="size-3 text-muted-foreground/80" />
                        <span>
                          {task.lastRunTimestamp
                            ? `Last run: ${new Date(task.lastRunTimestamp).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : 'Not executed yet'}
                        </span>
                      </div>

                      {task.lastStatus === 'success' && (
                        <span className="inline-flex items-center gap-1 text-emerald-500 font-medium text-[10px]">
                          <CheckCircle2 className="size-3" />
                          <span>Success</span>
                        </span>
                      )}
                      {task.lastStatus === 'error' && (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium text-[10px]">
                          <AlertCircle className="size-3" />
                          <span>Error</span>
                        </span>
                      )}
                    </div>

                    {/* Output Summary Box */}
                    {task.lastOutputSummary && (
                      <div className="rounded-lg border border-border/60 bg-muted/30 p-2 text-xs space-y-1">
                        <div
                          className={`font-mono text-[10px] text-foreground/90 whitespace-pre-wrap select-text leading-relaxed ${
                            !isExpanded ? 'line-clamp-2' : ''
                          }`}
                        >
                          {task.lastOutputSummary}
                        </div>
                        {task.lastOutputSummary.length > 100 && (
                          <button
                            type="button"
                            onClick={() => toggleSummaryExpand(task.id)}
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                          >
                            <span>{isExpanded ? 'Show less' : 'Show full output'}</span>
                            {isExpanded ? (
                              <ChevronUp className="size-3" />
                            ) : (
                              <ChevronDown className="size-3" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Footer: Run Now & Delete */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                    <button
                      type="button"
                      disabled={isTaskRunning}
                      onClick={() => handleRunNow(task)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-medium cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Execute task immediately in background"
                    >
                      {isTaskRunning ? (
                        <Loader2 className="size-3 animate-spin text-primary" />
                      ) : (
                        <Play className="size-3 text-emerald-500" />
                      )}
                      <span>Run Now</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTaskToDelete(task)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive text-[11px] font-medium cursor-pointer transition-colors"
                      title="Delete Task"
                    >
                      <Trash2 className="size-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={loadTasks}
      />

      {/* Delete Confirmation Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 space-y-3 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-destructive">
              <div className="size-8 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
                <Trash2 className="size-4" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">Delete Scheduled Task</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete &ldquo;
              <strong className="text-foreground">{taskToDelete.title}</strong>&rdquo;? Its background alarm will be cancelled immediately.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-destructive text-destructive-foreground hover:opacity-90 active:scale-95 cursor-pointer transition-all shadow-xs"
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
