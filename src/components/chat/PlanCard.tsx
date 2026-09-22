import React, { useState } from 'react';
import {
  ListChecks,
  CheckCircle2,
  LoaderCircle,
  CircleDashed,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { PlanPart, SubgoalItem } from '../../types/agent';

interface PlanCardProps {
  planPart: PlanPart;
}

export const PlanCard: React.FC<PlanCardProps> = ({ planPart }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { title, subgoals } = planPart;

  const total = subgoals.length;
  const completed = subgoals.filter((s) => s.status === 'completed').length;
  const inProgress = subgoals.filter((s) => s.status === 'in_progress').length;
  const failed = subgoals.filter((s) => s.status === 'failed').length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  const renderIcon = (status: SubgoalItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />;
      case 'in_progress':
        return <LoaderCircle className="size-4 text-blue-500 shrink-0 animate-spin" />;
      case 'failed':
        return <XCircle className="size-4 text-rose-500 shrink-0" />;
      default:
        return <CircleDashed className="size-4 text-muted-foreground shrink-0" />;
    }
  };

  return (
    <div className="my-2 rounded-xl border border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/20 overflow-hidden shadow-xs">
      {/* Header bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3.5 py-2.5 bg-blue-500/10 hover:bg-blue-500/15 cursor-pointer transition-colors select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-md bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0">
            <ListChecks className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">
              {title || 'Task Plan & Subgoals'}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">
              {completed} of {total} completed ({percentage}%)
              {inProgress > 0 && ` • 1 in progress`}
              {failed > 0 && ` • ${failed} failed`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                percentage === 100 ? 'bg-emerald-500' : 'bg-blue-600'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <button
            type="button"
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground"
          >
            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Subgoals list */}
      {isExpanded && (
        <div className="p-2 space-y-1.5 divide-y divide-border/30">
          {subgoals.map((subgoal, idx) => (
            <div
              key={subgoal.id || idx}
              className={`flex items-start gap-2.5 p-2 rounded-lg transition-colors text-xs ${
                subgoal.status === 'in_progress'
                  ? 'bg-blue-500/10 border border-blue-500/20 font-medium'
                  : subgoal.status === 'completed'
                  ? 'opacity-85'
                  : subgoal.status === 'failed'
                  ? 'bg-rose-500/10 border border-rose-500/20'
                  : 'hover:bg-muted/40'
              }`}
            >
              <div className="mt-0.5">{renderIcon(subgoal.status)}</div>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate ${
                    subgoal.status === 'completed'
                      ? 'line-through text-muted-foreground'
                      : subgoal.status === 'failed'
                      ? 'text-rose-600 dark:text-rose-400 font-medium'
                      : 'text-foreground'
                  }`}
                >
                  {subgoal.title}
                </p>
                {subgoal.summary && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 italic">
                    ↳ {subgoal.summary}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
