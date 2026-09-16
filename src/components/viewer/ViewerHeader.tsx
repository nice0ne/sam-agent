import React from 'react';
import {
  FileText,
  Eye,
  Code2,
  RotateCw,
  Copy,
  Check,
  Download,
  ExternalLink,
} from 'lucide-react';

export interface ViewerHeaderProps {
  filePath: string;
  fileSize: number;
  updatedAt: number;
  viewMode: 'preview' | 'raw';
  onToggleViewMode: (mode: 'preview' | 'raw') => void;
  onRefresh: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onOpenEditor: () => void;
  onOpenNewTab?: () => void;
  copied: boolean;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const formatted = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${formatted} ${units[i] || 'B'}`;
}

function formatLastModified(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const ViewerHeader: React.FC<ViewerHeaderProps> = ({
  filePath,
  fileSize,
  updatedAt,
  viewMode,
  onToggleViewMode,
  onRefresh,
  onCopy,
  onDownload,
  onOpenEditor,
  onOpenNewTab,
  copied,
}) => {
  const formattedSize = formatFileSize(fileSize);
  const formattedTime = formatLastModified(updatedAt);

  return (
    <header className="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-20 shadow-xs transition-colors shrink-0">
      {/* Left: File metadata & breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-xs">
          <FileText className="size-4" />
        </div>
        <div className="min-w-0 flex flex-col">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-xs font-medium text-foreground truncate max-w-[180px] sm:max-w-[280px]"
              title={filePath}
            >
              {filePath || 'No file selected'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
            <span>{formattedSize}</span>
            {formattedTime && (
              <>
                <span className="text-border">•</span>
                <span title={new Date(updatedAt).toLocaleString()}>{formattedTime}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Center: Segmented mode switcher */}
      <div className="flex items-center p-0.5 rounded-lg bg-muted border border-border/50 shrink-0">
        <button
          type="button"
          onClick={() => onToggleViewMode('preview')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
            viewMode === 'preview'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Preview mode"
        >
          <Eye className="size-3.5" />
          <span>Preview</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleViewMode('raw')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
            viewMode === 'raw'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Raw code mode"
        >
          <Code2 className="size-3.5" />
          <span>Raw</span>
        </button>
      </div>

      {/* Right: Quick actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onRefresh}
          className="size-7.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
          title="Refresh file"
          aria-label="Refresh"
        >
          <RotateCw className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={onCopy}
          className={`size-7.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/80 flex items-center justify-center transition-all cursor-pointer ${
            copied ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground'
          }`}
          title={copied ? 'Copied to clipboard' : 'Copy contents'}
          aria-label="Copy"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>

        <button
          type="button"
          onClick={onDownload}
          className="size-7.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
          title="Download file"
          aria-label="Download"
        >
          <Download className="size-3.5" />
        </button>

        {/* Open in native browser tab */}
        {onOpenNewTab && (
          <button
            type="button"
            onClick={onOpenNewTab}
            className="h-7.5 px-2.5 rounded-lg border border-border/80 hover:bg-muted text-xs font-medium text-foreground flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            title="Open in Chrome Browser Tab"
          >
            <ExternalLink className="size-3.5" />
            <span className="hidden sm:inline">New Tab</span>
          </button>
        )}

        <div className="w-[1px] h-4 bg-border mx-0.5" />

        <button
          type="button"
          onClick={onOpenEditor}
          className="h-7.5 px-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          title="Open in Code Editor"
        >
          <Code2 className="size-3.5" />
          <span>Edit</span>
        </button>
      </div>
    </header>
  );
};
