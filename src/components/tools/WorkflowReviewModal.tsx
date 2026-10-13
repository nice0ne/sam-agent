import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Play,
  Save,
  Trash2,
  Sliders,
  Code2,
  ListOrdered,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MousePointer,
  FormInput,
  CheckSquare,
  Globe,
  Sparkles,
} from 'lucide-react';
import { RecordedAction } from '../../../entrypoints/workflow-recorder.content/types';
import {
  synthesizeWorkflow,
  SynthesizedParameter,
} from '../../services/workflow-synthesizer';
import { saveVfsFile } from '../../services/vfs';
import { executeUserTool } from '../../services/tool-registry';
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor';

export interface WorkflowReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawActions: RecordedAction[];
  initialUrl: string;
  onSaved: (toolPath: string) => void;
}

export const WorkflowReviewModal: React.FC<WorkflowReviewModalProps> = ({
  isOpen,
  onClose,
  rawActions,
  initialUrl,
  onSaved,
}) => {
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [toolName, setToolName] = useState('');
  const [toolDesc, setToolDesc] = useState('');
  const [parameters, setParameters] = useState<SynthesizedParameter[]>([]);
  const [generatedCode, setGeneratedCode] = useState('');
  const [activeTab, setActiveTab] = useState<'steps' | 'params' | 'code'>('steps');

  // Test Run State
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize synthesis when modal opens
  useEffect(() => {
    if (isOpen && rawActions.length > 0) {
      setActions([...rawActions]);
      setTestResult(null);
      setErrorMsg(null);

      // Infer default tool name from URL host or path
      let baseName = 'myAutomatedWorkflow';
      try {
        if (initialUrl) {
          const u = new URL(initialUrl);
          const host = u.hostname.replace(/^www\./, '').split('.')[0];
          baseName = `${host}Workflow`;
        }
      } catch (_) {}

      const initialSynth = synthesizeWorkflow(
        baseName,
        `Automated workflow for ${initialUrl || 'target page'}.`,
        rawActions
      );

      setToolName(initialSynth.toolName);
      setToolDesc(initialSynth.description);
      setParameters(initialSynth.parameters);
      setGeneratedCode(initialSynth.code);
    }
  }, [isOpen, rawActions, initialUrl]);

  // Re-synthesize code when actions or parameters are modified
  const reSynthesize = (updatedActions: RecordedAction[], updatedParams?: SynthesizedParameter[]) => {
    const synth = synthesizeWorkflow(toolName, toolDesc, updatedActions);
    if (updatedParams) {
      setParameters(updatedParams);
    } else {
      setParameters(synth.parameters);
    }
    setGeneratedCode(synth.code);
  };

  const handleDeleteStep = (indexToDelete: number) => {
    const nextActions = actions.filter((_, idx) => idx !== indexToDelete);
    setActions(nextActions);
    reSynthesize(nextActions);
  };

  const handleParamChange = (index: number, field: keyof SynthesizedParameter, value: string) => {
    const next = [...parameters];
    next[index] = { ...next[index], [field]: value };
    setParameters(next);
    // Refresh generated code with updated params
    const synth = synthesizeWorkflow(toolName, toolDesc, actions);
    setGeneratedCode(synth.code);
  };

  const handleTestRun = async () => {
    setIsRunning(true);
    setTestResult(null);
    setErrorMsg(null);

    try {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = currentTab?.id || 0;

      // Build mock args from default parameter values
      const testArgs: Record<string, any> = {};
      for (const p of parameters) {
        testArgs[p.name] = p.defaultValue;
      }

      // Execute code directly inside active tab
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (codeToRun: string, toolArgs: Record<string, any>) => {
          try {
            const fn = new Function(
              'args',
              `return (async () => {
                try {
                  ${codeToRun}
                } catch (err) {
                  return { success: false, error: err && err.message ? err.message : String(err) };
                }
              })();`
            );
            return fn(toolArgs);
          } catch (syntaxErr: any) {
            return { success: false, error: syntaxErr?.message || String(syntaxErr) };
          }
        },
        args: [generatedCode, testArgs],
      });

      if (results && results[0]) {
        setTestResult(results[0].result);
      } else {
        setTestResult({ success: false, error: 'No response from tab' });
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err?.message || String(err) });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSave = async () => {
    const cleanName = toolName.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanName) {
      setErrorMsg('Please enter a valid tool name using alphanumeric characters.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const filePath = `/tools/${cleanName}.js`;
      await saveVfsFile(filePath, generatedCode, 'text/javascript');

      // Mark tool as enabled in chrome.storage.local
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get('userToolsConfig');
        const config = stored?.userToolsConfig || {};
        config[cleanName] = true;
        await chrome.storage.local.set({ userToolsConfig: config });
      }

      onSaved(filePath);
      onClose();
    } catch (err: any) {
      setErrorMsg(`Failed to save tool: ${err?.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>Workflow Review & Skill Synthesizer</span>
              </h2>
              <p className="text-[11px] text-muted-foreground truncate max-w-md">
                Turn your recorded actions into an autonomous, parameterized tool.
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

        {/* Name and Description Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div>
            <label className="text-[11px] font-medium text-foreground block mb-1">
              Tool Name
            </label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => {
                setToolName(e.target.value);
                const synth = synthesizeWorkflow(e.target.value, toolDesc, actions);
                setGeneratedCode(synth.code);
              }}
              className="w-full bg-background px-3 py-1.5 rounded-lg border border-border text-xs text-foreground font-mono focus:outline-none focus:border-primary/60"
              placeholder="e.g. loginAndDownload"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-foreground block mb-1">
              Description
            </label>
            <input
              type="text"
              value={toolDesc}
              onChange={(e) => {
                setToolDesc(e.target.value);
                const synth = synthesizeWorkflow(toolName, e.target.value, actions);
                setGeneratedCode(synth.code);
              }}
              className="w-full bg-background px-3 py-1.5 rounded-lg border border-border text-xs text-foreground focus:outline-none focus:border-primary/60"
              placeholder="What does this workflow automate?"
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 border-b border-border/60 pb-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('steps')}
            className={`px-3 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'steps'
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ListOrdered className="size-3.5" />
            <span>Steps ({actions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('params')}
            className={`px-3 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'params'
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="size-3.5" />
            <span>Parameters ({parameters.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'code'
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Code2 className="size-3.5" />
            <span>Generated Code</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto space-y-3 min-h-[180px] max-h-[340px] pr-1">
          {activeTab === 'steps' && (
            <div className="space-y-2">
              {actions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-6">
                  No actions captured in this recording.
                </p>
              ) : (
                actions.map((act, idx) => (
                  <div
                    key={act.id || idx}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-border/70 bg-muted/20 text-xs"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span className="size-5 rounded-md bg-muted flex items-center justify-center font-mono text-[10px] text-muted-foreground shrink-0">
                        {idx + 1}
                      </span>
                      <div className="shrink-0 text-muted-foreground">
                        {act.type === 'click' && <MousePointer className="size-3.5 text-blue-400" />}
                        {act.type === 'fill' && <FormInput className="size-3.5 text-emerald-400" />}
                        {act.type === 'toggle' && <CheckSquare className="size-3.5 text-amber-400" />}
                        {act.type === 'navigate' && <Globe className="size-3.5 text-purple-400" />}
                      </div>
                      <div className="truncate">
                        <span className="font-semibold uppercase tracking-wider text-[10px] text-foreground mr-1.5">
                          {act.type}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {act.target.selectors[0] || act.target.tagName}
                        </span>
                        {act.value && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-primary truncate">
                            "{act.value}"
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteStep(idx)}
                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 ml-2"
                      title="Remove this recorded step"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'params' && (
            <div className="space-y-2">
              {parameters.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-6">
                  No dynamic form inputs detected. This workflow executes statically.
                </p>
              ) : (
                parameters.map((param, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl border border-border/70 bg-muted/20 space-y-2 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-muted-foreground block mb-0.5">
                          Parameter Name
                        </span>
                        <input
                          type="text"
                          value={param.name}
                          onChange={(e) => handleParamChange(idx, 'name', e.target.value)}
                          className="w-full bg-background px-2 py-1 rounded border border-border font-mono text-xs text-foreground focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block mb-0.5">
                          Default Value
                        </span>
                        <input
                          type="text"
                          value={param.defaultValue}
                          onChange={(e) => handleParamChange(idx, 'defaultValue', e.target.value)}
                          className="w-full bg-background px-2 py-1 rounded border border-border font-mono text-xs text-foreground focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'code' && (
            <div className="h-64 rounded-xl border border-border overflow-hidden">
              <CodeMirrorEditor
                value={generatedCode}
                onChange={setGeneratedCode}
                path={`/tools/${toolName || 'workflow'}.js`}
              />
            </div>
          )}
        </div>

        {/* Test Run Output */}
        {testResult && (
          <div
            className={`p-2.5 rounded-xl border text-xs font-mono shrink-0 ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold mb-1">
              {testResult.success ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
              <span>{testResult.success ? 'Test Run Passed' : 'Test Run Failed'}</span>
            </div>
            <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap">
              {typeof testResult === 'string' ? testResult : JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        )}

        {errorMsg && (
          <p className="text-xs text-destructive flex items-center gap-1.5 shrink-0">
            <AlertCircle className="size-4" />
            <span>{errorMsg}</span>
          </p>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60 shrink-0">
          <button
            type="button"
            onClick={handleTestRun}
            disabled={isRunning || actions.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/80 text-foreground text-xs font-medium cursor-pointer transition-all disabled:opacity-50"
            title="Execute workflow against the active browser tab"
          >
            {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 text-primary" />}
            <span>{isRunning ? 'Testing...' : 'Test Run in Tab'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || actions.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer shadow-sm transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              <span>Save & Enable Tool</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
