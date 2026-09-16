import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Loader2,
  Copy,
  Check,
  Globe,
  AlertCircle,
  Terminal,
} from 'lucide-react';
import { executeUserTool, UserToolMeta } from '../../services/tool-registry';

export interface TestRunModalProps {
  tool: UserToolMeta | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TestRunModal: React.FC<TestRunModalProps> = ({ tool, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
  const [argsJson, setArgsJson] = useState('{}');
  const [argsError, setArgsError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Fetch current active tab and reset run state when modal opens
  useEffect(() => {
    if (isOpen && tool) {
      setArgsJson('{}');
      setArgsError(null);
      setExecutionResult(null);
      setCopied(false);

      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs.length > 0) {
            setActiveTab(tabs[0]);
          } else {
            setActiveTab(null);
          }
        });
      }
    }
  }, [isOpen, tool]);

  if (!isOpen || !tool) return null;

  const handleRun = async () => {
    setArgsError(null);
    let parsedArgs: Record<string, any> = {};

    try {
      const trimmed = argsJson.trim();
      if (trimmed) {
        parsedArgs = JSON.parse(trimmed);
        if (typeof parsedArgs !== 'object' || parsedArgs === null || Array.isArray(parsedArgs)) {
          setArgsError('Arguments must be a valid JSON object (e.g. {"key": "value"})');
          return;
        }
      }
    } catch (err: any) {
      setArgsError(`Invalid JSON: ${err?.message || String(err)}`);
      return;
    }

    setIsRunning(true);
    setExecutionResult(null);

    try {
      const tabId = activeTab?.id || 0;
      const result = await executeUserTool(tabId, tool.name, parsedArgs);
      setExecutionResult(result);
    } catch (err: any) {
      setExecutionResult({
        success: false,
        error: err?.message || String(err),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyResult = () => {
    if (!executionResult) return;
    const text =
      typeof executionResult === 'string'
        ? executionResult
        : JSON.stringify(executionResult, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Play className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>Test Run:</span>
                <span className="font-mono text-primary">{tool.name}</span>
              </h2>
              <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                {tool.description || 'Executes custom tool scriptlet on the active browser tab'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="space-y-3.5 overflow-y-auto flex-1 pr-0.5">
          {/* Active Tab Info Box */}
          <div className="p-2.5 rounded-xl border border-border/70 bg-muted/30 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Globe className="size-3.5 text-primary shrink-0" />
              <span>Target Active Tab</span>
            </div>
            {activeTab ? (
              <div className="space-y-0.5 font-mono text-[10px]">
                <div className="text-foreground font-semibold truncate" title={activeTab.title}>
                  {activeTab.title || 'Untitled Tab'}
                </div>
                <div className="text-muted-foreground truncate" title={activeTab.url}>
                  {activeTab.url || 'chrome://'}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-amber-500 italic">
                No active browser tab detected.
              </p>
            )}
          </div>

          {/* Parameters Hint if any */}
          {tool.paramsHelp && tool.paramsHelp !== 'None' && (
            <div className="text-[11px] text-muted-foreground bg-primary/5 border border-primary/15 rounded-lg px-2.5 py-1.5">
              <span className="font-semibold text-primary">Expected Params: </span>
              <span className="font-mono text-[10px]">{tool.paramsHelp}</span>
            </div>
          )}

          {/* JSON Arguments Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground flex items-center justify-between">
              <span>Arguments (JSON Object)</span>
              <span className="text-[10px] text-muted-foreground font-mono">e.g. {"{}"}</span>
            </label>
            <textarea
              value={argsJson}
              onChange={(e) => {
                setArgsJson(e.target.value);
                setArgsError(null);
              }}
              rows={4}
              placeholder='{\n  "query": "laptop reviews"\n}'
              className="w-full bg-background border border-border rounded-xl p-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all resize-y select-text"
            />
            {argsError && (
              <div className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{argsError}</span>
              </div>
            )}
          </div>

          {/* Execution Result Box */}
          {executionResult !== null && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                  <Terminal className="size-3.5 text-primary shrink-0" />
                  <span>Execution Output</span>
                  {executionResult?.success === false ? (
                    <span className="px-1.5 py-0.2 rounded-full bg-destructive/10 text-destructive text-[9px] font-semibold">
                      Failed
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-semibold">
                      Success
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCopyResult}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md hover:bg-muted cursor-pointer transition-colors"
                  title="Copy output JSON"
                >
                  {copied ? (
                    <>
                      <Check className="size-3 text-emerald-500" />
                      <span className="text-emerald-500">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-2.5 rounded-xl border border-border bg-muted/40 font-mono text-[11px] text-foreground overflow-x-auto max-h-56 leading-relaxed select-text whitespace-pre-wrap break-all">
                {typeof executionResult === 'string'
                  ? executionResult
                  : JSON.stringify(executionResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-medium cursor-pointer transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || !activeTab}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 text-xs font-medium cursor-pointer transition-all shadow-xs disabled:opacity-50 disabled:pointer-events-none active:scale-95"
          >
            {isRunning ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="size-3.5" />
                <span>Run Tool on Active Tab</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
