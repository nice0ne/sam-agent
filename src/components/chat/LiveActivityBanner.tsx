import React from 'react';
import { LoaderCircle, Sparkles, Bot, Square } from 'lucide-react';

export interface LiveActivityBannerProps {
  isStreaming: boolean;
  activeTool?: string;
  onAbort?: () => void;
}

export const LiveActivityBanner: React.FC<LiveActivityBannerProps> = ({
  isStreaming,
  activeTool,
  onAbort,
}) => {
  if (!isStreaming) return null;


  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-blue-200/80 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 shadow-2xs transition-all">
      <div className="flex items-center gap-2 min-w-0 truncate">
        <div className="relative flex items-center justify-center shrink-0">
          <LoaderCircle className="size-4 animate-spin text-blue-600 dark:text-blue-400" />
          <Sparkles className="size-2 absolute text-amber-500" />
        </div>
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <Bot className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-semibold text-blue-800 dark:text-blue-100 truncate">
            {activeTool ? `Running tool: ${activeTool}...` : 'AI Agent is working...'}
          </span>
        </div>
      </div>

      {onAbort && (
        <button
          type="button"
          onClick={onAbort}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 text-[11px] font-medium transition-all cursor-pointer shrink-0 active:scale-95"
          title="Stop agent execution"
        >
          <Square className="size-2.5" />
          <span>Stop</span>
        </button>
      )}
    </div>
  );
};
