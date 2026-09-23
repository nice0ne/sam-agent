import React, { useState, useMemo } from 'react';
import {
  Check,
  X,
  AlertCircle,
  LoaderCircle,
  ChevronRight,
  Terminal,
  FileText,
  Globe,
  Image as ImageIcon,
  MousePointerClick,
  Edit3,
  CheckSquare,
  ShieldCheck,
  Zap,
  Eye,
  ExternalLink,
  Code2,
  Play,
  Keyboard,
  Brain,
  ListChecks,
  CheckCheck,
  FileSearch,
  Activity,
  Bug,
  Radio,
  Layers,
  CalendarClock,
  Clock,
  UserCheck,
  Lock,
  ShieldAlert,
  FileSpreadsheet,
  FolderArchive,
} from 'lucide-react';
import type { ToolCallPart } from '../../types/agent';

const MAX_OUTPUT_CHARS = 12000;
const HEAD_CHARS = 8000;
const TAIL_CHARS = 4000;

function truncateOutput(text: string): { content: string; wasTruncated: boolean } {
  if (text.length <= MAX_OUTPUT_CHARS) {
    return { content: text, wasTruncated: false };
  }
  const head = text.slice(0, HEAD_CHARS);
  const tail = text.slice(-TAIL_CHARS);
  const omitted = text.length - head.length - tail.length;
  return {
    content: `${head}\n\n... [Output Truncated: ${omitted.toLocaleString()} characters omitted] ...\n\n${tail}`,
    wasTruncated: true,
  };
}

const TOOL_METADATA: Record<
  string,
  { label: string; activeLabel: string; icon: React.ComponentType<{ className?: string }> }
> = {
  bash: { label: 'Ran command', activeLabel: 'Running command', icon: Terminal },
  readFile: { label: 'Read file', activeLabel: 'Reading file', icon: FileText },
  writeFile: { label: 'Wrote file', activeLabel: 'Writing file', icon: FileText },
  searchWeb: { label: 'Searched web', activeLabel: 'Searching web', icon: Globe },
  webSearch: { label: 'Searched web', activeLabel: 'Searching web', icon: Globe },
  read_image: { label: 'Analyzed image', activeLabel: 'Analyzing image', icon: ImageIcon },
  fillField: { label: 'Filled form field', activeLabel: 'Filling form field', icon: Edit3 },
  clickElement: { label: 'Clicked element', activeLabel: 'Clicking element', icon: MousePointerClick },
  selectOption: { label: 'Selected dropdown', activeLabel: 'Selecting dropdown', icon: CheckSquare },
  navigate: { label: 'Navigated to URL', activeLabel: 'Navigating to URL', icon: Globe },
  openTab: { label: 'Opened new tab', activeLabel: 'Opening new tab', icon: ExternalLink },
  play: { label: 'Played video', activeLabel: 'Playing video', icon: Play },
  eval: { label: 'Executed script', activeLabel: 'Executing script', icon: Code2 },
  pressKey: { label: 'Pressed key', activeLabel: 'Pressing key', icon: Keyboard },
  generateDoc: { label: 'Generated Word Document', activeLabel: 'Generating Word Document', icon: FileText },
  generatePptx: { label: 'Generated Presentation', activeLabel: 'Generating Presentation', icon: FileText },
  generateExcel: { label: 'Generated Excel Spreadsheet', activeLabel: 'Generating Excel Spreadsheet', icon: FileSpreadsheet },
  generateXlsx: { label: 'Generated Excel Spreadsheet', activeLabel: 'Generating Excel Spreadsheet', icon: FileSpreadsheet },
  visualInspect: { label: 'Visual Inspection (SoM)', activeLabel: 'Capturing Visual Marks', icon: Eye },
  clickTag: { label: 'Clicked Visual Tag', activeLabel: 'Clicking Visual Tag', icon: MousePointerClick },
  fillTag: { label: 'Filled Visual Tag', activeLabel: 'Filling Visual Tag', icon: Edit3 },
  remember: { label: 'Saved to Memory', activeLabel: 'Saving to Memory', icon: Brain },
  forget: { label: 'Erased from Memory', activeLabel: 'Erasing Memory', icon: Brain },
  createPlan: { label: 'Created Task Plan', activeLabel: 'Creating Task Plan', icon: ListChecks },
  updateSubgoal: { label: 'Updated Subgoal', activeLabel: 'Updating Subgoal', icon: CheckCheck },
  ragSearch: { label: 'RAG File Search', activeLabel: 'Searching File Chunks', icon: FileSearch },
  sniffNetwork: { label: 'Sniffed Network APIs', activeLabel: 'Sniffing Network APIs', icon: Activity },
  readConsoleErrors: { label: 'Read Console Errors', activeLabel: 'Reading Console Errors', icon: Bug },
  cdpInspectNetwork: { label: 'CDP Kernel Network Inspection', activeLabel: 'Inspecting CDP Network', icon: Radio },
  openParallelTabs: { label: 'Parallel Multi-Tab Scraping', activeLabel: 'Scraping Multi-Tabs', icon: Layers },
  scheduleTask: { label: 'Scheduled Routine Task', activeLabel: 'Scheduling Routine Task', icon: CalendarClock },
  listScheduledTasks: { label: 'Listed Scheduled Tasks', activeLabel: 'Listing Scheduled Tasks', icon: Clock },
  fillProfile: { label: 'Smart Form Auto-Fill', activeLabel: 'Auto-Filling Form', icon: UserCheck },
  saveProfileVault: { label: 'Saved Encrypted Profile', activeLabel: 'Encrypting Profile', icon: Lock },
  confirmAction: { label: 'Sensitive Action Guard', activeLabel: 'Awaiting Human Approval', icon: ShieldAlert },
  backupData: { label: 'Backed up System Data', activeLabel: 'Backing up System Data', icon: FolderArchive },
  browserAction: { label: 'Browser action executed', activeLabel: 'Executing browser action', icon: Globe },
};

export const ToolCallCard: React.FC<{ toolPart: ToolCallPart }> = ({ toolPart }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);

  const { toolName, state, input, output, errorText } = toolPart;
  const meta = TOOL_METADATA[toolName] || {
    label: 'Executed tool',
    activeLabel: 'Executing tool',
    icon: Terminal,
  };
  const IconComponent = meta.icon;

  const rawOutputString = useMemo(() => {
    if (output === undefined && errorText === undefined) return '';
    if (errorText) return errorText;
    return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  }, [output, errorText]);

  const outputPreview = useMemo(() => truncateOutput(rawOutputString), [rawOutputString]);

  const statusBadge = useMemo(() => {
    switch (state) {
      case 'completed':
        return <Check className="size-3.5 mt-0.5 text-emerald-500 shrink-0" />;
      case 'cancelled':
        return <X className="size-3.5 mt-0.5 text-red-500 shrink-0" />;
      case 'error':
        return <AlertCircle className="size-3.5 mt-0.5 text-amber-500 shrink-0" />;
      default:
        return <LoaderCircle className="size-3.5 mt-0.5 text-primary animate-spin shrink-0" />;
    }
  }, [state]);

  const titleText = useMemo(() => {
    const action = state === 'pending' ? meta.activeLabel : meta.label;
    if (input?.url) return `${action}: ${input.url}`;
    if (input?.value && (input?.selector || input?.label || input?.name)) {
      return `${action}: ${input.selector || input.label || input.name} → "${input.value}"`;
    }
    if (input?.command) return `${action}: ${input.command}`;
    if (input?.path) return `${action}: ${input.path}`;
    if (input?.query) return `${action}: "${input.query}"`;
    if (input?.selector || input?.text) return `${action}: ${input.selector || input.text}`;
    return action;
  }, [state, meta, input]);

  const filePath =
    toolName === 'writeFile' || toolName === 'generateDoc' || toolName === 'generatePptx'
      ? (input?.path || input?.filePath || input?.file || input?.filename || (output && typeof output === 'object' && (output.docPath || output.pptxPath || output.target || output.path)))
      : undefined;

  const handleOpenViewer = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const url = chrome?.runtime?.getURL
      ? chrome.runtime.getURL(`viewer.html?path=${encodeURIComponent(path)}`)
      : `viewer.html?path=${encodeURIComponent(path)}`;
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  const handleOpenEditor = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const url = chrome?.runtime?.getURL
      ? chrome.runtime.getURL(`editor.html?path=${encodeURIComponent(path)}`)
      : `editor.html?path=${encodeURIComponent(path)}`;
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="my-1.5 border border-border rounded-lg bg-card text-card-foreground overflow-hidden shadow-2xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-mono hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0 pr-2 flex-1">
          {statusBadge}
          <IconComponent className="size-3.5 text-muted-foreground shrink-0" />
          <span className="truncate text-foreground/90 font-medium">{titleText}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {toolPart.selfCorrected && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Zap className="size-2.5" />
              Self-Corrected ({toolPart.attempts}x)
            </span>
          )}
          {toolPart.verified && !toolPart.selfCorrected && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="size-2.5" />
              Verified
            </span>
          )}
          {filePath && (
            <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={(e) => handleOpenViewer(e, filePath)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25 transition-colors cursor-pointer"
                title={`Open ${filePath} in Artifact Viewer`}
              >
                <Eye className="size-2.5" />
                <span>View</span>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenEditor(e, filePath)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-colors cursor-pointer"
                title={`Open ${filePath} in Code Editor`}
              >
                <Code2 className="size-2.5" />
                <span>Edit</span>
              </button>
            </div>
          )}
          <ChevronRight
            className={`size-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border px-3 py-2.5 bg-muted/20 text-xs font-mono space-y-2">
          {filePath && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/20 text-xs">
              <div className="flex items-center gap-2 text-foreground font-sans truncate mr-2">
                <FileText className="size-3.5 text-primary shrink-0" />
                <span className="truncate font-mono text-[11px] font-medium">{filePath}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleOpenViewer(e, filePath)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-sans font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-2xs cursor-pointer"
                >
                  <Eye className="size-3" />
                  <span>View</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleOpenEditor(e, filePath)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-sans font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border transition-all shadow-2xs cursor-pointer"
                >
                  <Code2 className="size-3" />
                  <span>Edit</span>
                </button>
              </div>
            </div>
          )}
          {(toolPart.strategyUsed || (toolPart.attempts && toolPart.attempts > 1)) && (
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-muted/50 text-[11px] font-sans border border-border/60">
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="font-semibold text-foreground">Injection Strategy:</span>
                <span>{toolPart.strategyUsed || 'Standard DOM Setter'}</span>
              </div>
              <span className="text-muted-foreground">
                Attempts: <strong className="text-foreground">{toolPart.attempts || 1}</strong>
              </span>
            </div>
          )}

          {input && Object.keys(input).length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
                Parameters
              </div>
              <pre className="p-2 rounded bg-muted/60 text-foreground overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}

          {rawOutputString && (
            <div>
              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
                <span>Output</span>
                {outputPreview.wasTruncated && (
                  <button
                    type="button"
                    onClick={() => setShowFullOutput(!showFullOutput)}
                    className="text-primary hover:underline lowercase font-normal cursor-pointer"
                  >
                    {showFullOutput ? 'Show truncated' : 'Show full output'}
                  </button>
                )}
              </div>
              <pre
                className={`p-2 rounded overflow-x-auto whitespace-pre-wrap ${
                  state === 'error'
                    ? 'bg-destructive/10 text-destructive border border-destructive/20'
                    : 'bg-muted/60 text-foreground'
                }`}
              >
                {outputPreview.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
