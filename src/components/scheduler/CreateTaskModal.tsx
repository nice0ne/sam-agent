import React, { useState } from 'react';
import { X, CalendarClock, Plus, Loader2, AlertCircle } from 'lucide-react';
import { ScheduledTask, saveScheduledTask } from '../../services/scheduler';

export interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export type SchedulePreset = '15m' | '30m' | '1h' | '6h' | '24h' | 'once' | 'cron';

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [title, setTitle] = useState('');
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>('1h');
  const [cronExpression, setCronExpression] = useState('0 9 * * 1-5');
  const [onceMinutes, setOnceMinutes] = useState(15);
  const [prompt, setPrompt] = useState('');
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanTitle = title.trim();
    const cleanPrompt = prompt.trim();

    if (!cleanTitle) {
      setError('Please provide a task title.');
      return;
    }

    if (!cleanPrompt) {
      setError('Please enter the prompt instructions for the agent to execute.');
      return;
    }

    let scheduleType: 'interval' | 'cron' | 'once' = 'interval';
    let intervalMinutes: number | undefined;
    let finalCron: string | undefined;
    let runAtTimestamp: number | undefined;

    if (schedulePreset === '15m') {
      scheduleType = 'interval';
      intervalMinutes = 15;
    } else if (schedulePreset === '30m') {
      scheduleType = 'interval';
      intervalMinutes = 30;
    } else if (schedulePreset === '1h') {
      scheduleType = 'interval';
      intervalMinutes = 60;
    } else if (schedulePreset === '6h') {
      scheduleType = 'interval';
      intervalMinutes = 360;
    } else if (schedulePreset === '24h') {
      scheduleType = 'interval';
      intervalMinutes = 1440;
    } else if (schedulePreset === 'once') {
      scheduleType = 'once';
      const mins = Number(onceMinutes);
      if (isNaN(mins) || mins <= 0) {
        setError('Minutes from now must be a positive number.');
        return;
      }
      runAtTimestamp = Date.now() + mins * 60 * 1000;
    } else if (schedulePreset === 'cron') {
      scheduleType = 'cron';
      const cleanCron = cronExpression.trim();
      const parts = cleanCron.split(/\s+/);
      if (parts.length !== 5) {
        setError('Cron expression must have exactly 5 fields (minute hour day-of-month month day-of-week).');
        return;
      }
      finalCron = cleanCron;
    }

    setIsSubmitting(true);
    try {
      const newTask: ScheduledTask = {
        id: crypto.randomUUID(),
        title: cleanTitle,
        prompt: cleanPrompt,
        scheduleType,
        intervalMinutes,
        cronExpression: finalCron,
        runAtTimestamp,
        enabled: true,
        notifyOnComplete,
        createdAt: Date.now(),
      };

      await saveScheduledTask(newTask);

      // Reset form fields
      setTitle('');
      setPrompt('');
      setSchedulePreset('1h');
      setCronExpression('0 9 * * 1-5');
      setOnceMinutes(15);
      setNotifyOnComplete(true);

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save scheduled task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in zoom-in-95">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <CalendarClock className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-foreground">Create Autonomous Task</h2>
              <p className="text-[11px] text-muted-foreground">
                Schedules background execution with Chrome Alarms
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-2.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 overflow-y-auto flex-1 pr-0.5">
          {/* Task Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Task Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pantau Berita & Cuaca"
              className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              autoFocus
            />
          </div>

          {/* Schedule Preset Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Schedule Type</label>
            <select
              value={schedulePreset}
              onChange={(e) => setSchedulePreset(e.target.value as SchedulePreset)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background/50 text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
            >
              <option value="15m">Every 15 mins</option>
              <option value="30m">Every 30 mins</option>
              <option value="1h">Every 1 hour</option>
              <option value="6h">Every 6 hours</option>
              <option value="24h">Daily (24h)</option>
              <option value="once">Run once in N minutes</option>
              <option value="cron">Custom 5-field cron expression</option>
            </select>
          </div>

          {/* Conditional: Cron Expression */}
          {schedulePreset === 'cron' && (
            <div className="space-y-1.5 p-2.5 rounded-xl border border-border/80 bg-muted/20">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  Cron Expression <span className="text-destructive">*</span>
                </label>
                <span className="text-[10px] text-muted-foreground font-mono">min hr dom mon dow</span>
              </div>
              <input
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 9 * * 1-5"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border bg-background/70 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Standard 5-part cron syntax. Example: <code className="font-mono text-foreground">0 9 * * 1-5</code> (Mon-Fri at 9:00 AM) or <code className="font-mono text-foreground">*/15 * * * *</code> (every 15 min).
              </p>
            </div>
          )}

          {/* Conditional: Once in N minutes */}
          {schedulePreset === 'once' && (
            <div className="space-y-1.5 p-2.5 rounded-xl border border-border/80 bg-muted/20">
              <label className="text-xs font-medium text-foreground">
                Run Once In (Minutes from now) <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={10080}
                value={onceMinutes}
                onChange={(e) => setOnceMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-border bg-background/70 text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              <p className="text-[10px] text-muted-foreground">
                The task will trigger once at approximately {new Date(Date.now() + onceMinutes * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
              </p>
            </div>
          )}

          {/* Prompt Instructions */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Prompt Instructions <span className="text-destructive">*</span>
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Check current trending news on tech websites and summarize the top 3 headlines in bullet points."
              className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-y"
            />
          </div>

          {/* Checkbox: Desktop Notification */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-foreground select-none">
              <input
                type="checkbox"
                checked={notifyOnComplete}
                onChange={(e) => setNotifyOnComplete(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary size-4 cursor-pointer"
              />
              <span>Show Chrome desktop notification on completion</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Scheduling...</span>
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  <span>Schedule Task</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
