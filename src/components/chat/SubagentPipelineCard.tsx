import React, { useState, useMemo } from 'react';
import {
  Network,
  Users,
  Search,
  Globe,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Terminal,
  BrainCircuit,
  Database,
  FileCheck,
  Zap,
} from 'lucide-react';
import type { PipelineProgress, WorkerDeliverable, WorkerRole } from '../../types/subagent';

export interface SubagentPipelineCardProps {
  progress?: PipelineProgress;
  planTitle?: string;
  deliverables?: WorkerDeliverable[];
}

interface MergedWorker {
  id: string;
  name: string;
  role: WorkerRole;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: number;
  maxSteps: number;
  lastThought?: string;
  summary?: string;
  logs?: string[];
  extractedDataCount?: number;
  artifactsCount?: number;
  error?: string;
}

export const SubagentPipelineCard: React.FC<SubagentPipelineCardProps> = ({
  progress,
  planTitle,
  deliverables,
}) => {
  const [expandedWorkers, setExpandedWorkers] = useState<Record<string, boolean>>({});

  const toggleWorker = (id: string) => {
    setExpandedWorkers((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Merge progress and deliverables into a unified view list
  const workers = useMemo<MergedWorker[]>(() => {
    const map = new Map<string, MergedWorker>();

    // 1. Ingest progress workers if available
    if (progress?.workers) {
      Object.entries(progress.workers).forEach(([id, pw]) => {
        const inferredRole: WorkerRole =
          pw.role ||
          (pw.name?.toLowerCase().includes('scrap') || id.includes('scrap')
            ? 'scraper'
            : pw.name?.toLowerCase().includes('anal') || id.includes('anal')
            ? 'analyst'
            : 'researcher');

        map.set(id, {
          id,
          name: pw.name || id,
          role: inferredRole,
          status: pw.status,
          currentStep: pw.currentStep,
          maxSteps: pw.maxSteps || 8,
          lastThought: pw.lastThought,
          logs: pw.logs || [],
        });
      });
    }

    // 2. Ingest deliverables (takes precedence on status/summary/counts)
    if (deliverables && deliverables.length > 0) {
      deliverables.forEach((d) => {
        const existing = map.get(d.workerId);
        const resolvedStatus = d.status === 'completed' ? 'completed' : 'failed';

        map.set(d.workerId, {
          id: d.workerId,
          name: d.name || existing?.name || d.workerId,
          role: d.role || existing?.role || 'researcher',
          status: resolvedStatus,
          currentStep: d.stepsUsed || existing?.currentStep || 1,
          maxSteps: existing?.maxSteps || 8,
          lastThought: d.summary || existing?.lastThought,
          summary: d.summary,
          logs: d.logs && d.logs.length > 0 ? d.logs : existing?.logs || [],
          extractedDataCount: d.extractedData?.length,
          artifactsCount: d.artifactsCreated?.length,
          error: d.error,
        });
      });
    }

    return Array.from(map.values());
  }, [progress, deliverables]);

  const displayTitle = planTitle || progress?.planTitle || 'Multi-Agent Delegation Pipeline';
  const totalWorkers = progress?.totalWorkers || (workers.length > 0 ? workers.length : 1);
  const completedWorkers =
    progress?.completedWorkers ??
    workers.filter((w) => w.status === 'completed').length;

  const pct = Math.min(100, Math.round((completedWorkers / Math.max(totalWorkers, 1)) * 100));
  const isAllComplete = completedWorkers >= totalWorkers && totalWorkers > 0;
  const isRunning = workers.some((w) => w.status === 'running') || (!isAllComplete && workers.length > 0);

  const getRoleBadge = (role: WorkerRole) => {
    switch (role) {
      case 'researcher':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25">
            <Search className="size-2.5" />
            Researcher
          </span>
        );
      case 'scraper':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
            <Globe className="size-2.5" />
            Scraper
          </span>
        );
      case 'analyst':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25">
            <BarChart3 className="size-2.5" />
            Analyst
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
            <Users className="size-2.5" />
            Worker
          </span>
        );
    }
  };

  const getStatusPill = (status: MergedWorker['status']) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 shadow-2xs">
            <span className="relative flex size-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full size-1.5 bg-blue-500"></span>
            </span>
            ● Running
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shadow-2xs">
            <CheckCircle2 className="size-3 text-emerald-500" />
            ✓ Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25 shadow-2xs">
            <AlertTriangle className="size-3 text-rose-500" />
            ⚠ Failed
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
            <Clock className="size-3" />
            Pending
          </span>
        );
    }
  };

  return (
    <div className="my-3 rounded-xl border border-primary/25 bg-card/95 shadow-xs overflow-hidden backdrop-blur-xs transition-all">
      {/* Header */}
      <div className="p-3 bg-primary/5 dark:bg-primary/10 border-b border-border/60">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-primary/15 text-primary shrink-0 ring-1 ring-primary/25">
              <Network className="size-4 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                <span>{displayTitle}</span>
              </h4>
              <p className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                <Users className="size-2.5 inline" />
                <span>Hierarchical Multi-Agent Orchestration</span>
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5">
            {isAllComplete ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="size-3" />
                All Complete
              </span>
            ) : isRunning ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                <Zap className="size-3 animate-bounce" />
                Pipeline Active
              </span>
            ) : null}
          </div>
        </div>

        {/* Progress Bar & Counter */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold text-foreground">
              {completedWorkers} / {totalWorkers} workers completed ({pct}%)
            </span>
          </div>
          <div className="w-full bg-muted/60 dark:bg-muted/40 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out rounded-full ${
                isAllComplete
                  ? 'bg-emerald-500'
                  : 'bg-linear-to-r from-blue-500 to-indigo-500 animate-pulse'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Grid of Worker Cards */}
      <div className="p-3 bg-background/50 space-y-2">
        {workers.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground italic flex items-center justify-center gap-1.5">
            <Clock className="size-3.5 animate-spin" />
            <span>Spawning parallel worker sub-agents...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {workers.map((worker) => {
              const isExpanded = !!expandedWorkers[worker.id];
              const hasThoughts = Boolean(worker.lastThought || worker.summary);
              const hasLogs = Boolean(worker.logs && worker.logs.length > 0);
              const hasDetails = hasThoughts || hasLogs || worker.error;

              return (
                <div
                  key={worker.id}
                  className={`rounded-lg border transition-all ${
                    worker.status === 'running'
                      ? 'border-blue-500/40 bg-blue-500/5 shadow-2xs'
                      : worker.status === 'completed'
                      ? 'border-border/80 bg-card hover:border-emerald-500/30'
                      : worker.status === 'failed'
                      ? 'border-rose-500/30 bg-rose-500/5'
                      : 'border-border/60 bg-muted/20'
                  }`}
                >
                  {/* Worker Summary Row */}
                  <div className="p-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">
                            {worker.name}
                          </span>
                          {getRoleBadge(worker.role)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/40">
                        Turn {worker.currentStep} / {worker.maxSteps}
                      </span>
                      {getStatusPill(worker.status)}

                      {hasDetails && (
                        <button
                          type="button"
                          onClick={() => toggleWorker(worker.id)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          title={isExpanded ? 'Collapse thoughts & activity logs' : 'Inspect thoughts & activity logs'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Badges for extracted data / artifacts */}
                  {(worker.extractedDataCount || worker.artifactsCount) ? (
                    <div className="px-2.5 pb-2 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                      {worker.extractedDataCount !== undefined && worker.extractedDataCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <Database className="size-3" />
                          {worker.extractedDataCount} records
                        </span>
                      )}
                      {worker.artifactsCount !== undefined && worker.artifactsCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                          <FileCheck className="size-3" />
                          {worker.artifactsCount} artifacts
                        </span>
                      )}
                    </div>
                  ) : null}

                  {/* Collapsible Drawer: Thoughts & Logs */}
                  {isExpanded && hasDetails && (
                    <div className="px-2.5 pb-2.5 pt-1 border-t border-border/40 space-y-2 text-xs">
                      {/* Error Banner */}
                      {worker.error && (
                        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px]">
                          <strong>Error:</strong> {worker.error}
                        </div>
                      )}

                      {/* Latest Thoughts / Summary */}
                      {hasThoughts && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <BrainCircuit className="size-3" />
                            <span>Latest Thought</span>
                          </div>
                          <div className="p-2 rounded-md bg-background/80 border border-border/50 text-[11px] text-foreground/90 font-mono leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                            {worker.lastThought || worker.summary}
                          </div>
                        </div>
                      )}

                      {/* Activity Logs */}
                      {hasLogs && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <Terminal className="size-3" />
                            <span>Activity Logs ({worker.logs?.length})</span>
                          </div>
                          <div className="max-h-32 overflow-y-auto rounded-md bg-zinc-950 p-2 text-[10px] font-mono text-zinc-300 space-y-0.5 border border-zinc-800">
                            {worker.logs?.map((log, lIdx) => (
                              <div key={lIdx} className="leading-tight flex items-start gap-1">
                                <span className="text-zinc-500 select-none">&gt;</span>
                                <span className="break-all">{log}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubagentPipelineCard;
