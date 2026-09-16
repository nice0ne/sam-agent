import React from 'react';
import {
  PanelLeft,
  ChevronRight,
  FileCode,
  Save,
  Eye,
  Sparkles,
  Download,
} from 'lucide-react';

export interface EditorHeaderProps {
  currentPath?: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  isDirty: boolean;
  autoSave: boolean;
  onToggleAutoSave: (enabled: boolean) => void;
  onSave: () => void;
  onFormat?: () => void;
  onDownload?: () => void;
  onOpenViewer?: () => void;
  isFormatting?: boolean;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  currentPath,
  sidebarOpen,
  onToggleSidebar,
  isDirty,
  autoSave,
  onToggleAutoSave,
  onSave,
  onFormat,
  onDownload,
  onOpenViewer,
  isFormatting = false,
}) => {
  // Parse path breadcrumbs
  const pathSegments = React.useMemo(() => {
    if (!currentPath) return [];
    return currentPath.split('/').filter(Boolean);
  }, [currentPath]);

  const fileName = pathSegments[pathSegments.length - 1] || '';
  const dirSegments = pathSegments.slice(0, -1);

  const handleOpenViewer = () => {
    if (onOpenViewer) {
      onOpenViewer();
      return;
    }
    if (!currentPath) return;

    const viewerUrl = typeof chrome !== 'undefined' && chrome?.runtime?.getURL
      ? chrome.runtime.getURL(`viewer.html?path=${encodeURIComponent(currentPath)}`)
      : `viewer.html?path=${encodeURIComponent(currentPath)}`;

    if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
      chrome.tabs.create({ url: viewerUrl });
    } else {
      window.open(viewerUrl, '_blank');
    }
  };

  return (
    <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-card/90 backdrop-blur-md sticky top-0 z-20 shadow-xs transition-colors shrink-0">
      {/* Left section: Sidebar toggle & Path breadcrumb */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`size-8 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
            sidebarOpen
              ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
              : 'border-border/60 bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title={sidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-4" />
        </button>

        {/* Path breadcrumb */}
        <div className="flex items-center gap-1.5 min-w-0 text-xs font-mono overflow-hidden">
          {currentPath ? (
            <>
              <div className="size-6 rounded-md bg-muted/80 flex items-center justify-center text-muted-foreground shrink-0">
                <FileCode className="size-3.5" />
              </div>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap">
                <span className="text-muted-foreground hover:text-foreground transition-colors cursor-default">
                  /
                </span>
                {dirSegments.map((segment, idx) => (
                  <React.Fragment key={`${segment}-${idx}`}>
                    <span
                      className="text-muted-foreground hover:text-foreground transition-colors max-w-[100px] truncate"
                      title={segment}
                    >
                      {segment}
                    </span>
                    <ChevronRight className="size-3 text-muted-foreground/50 shrink-0" />
                  </React.Fragment>
                ))}
                <span
                  className="font-medium text-foreground max-w-[180px] truncate"
                  title={fileName}
                >
                  {fileName}
                </span>
                {isDirty && (
                  <span
                    className="size-2 rounded-full bg-amber-500 shrink-0 animate-pulse ml-0.5"
                    title="Unsaved changes"
                  />
                )}
              </div>
            </>
          ) : (
            <span className="text-xs text-muted-foreground italic font-sans">
              No file open
            </span>
          )}
        </div>
      </div>

      {/* Right section: Beautify, Download, Auto-save switch, Save button, Viewer button */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Beautify / Format button */}
        {onFormat && (
          <button
            type="button"
            onClick={onFormat}
            disabled={!currentPath || isFormatting}
            className={`h-7.5 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs ${
              currentPath
                ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:border-purple-500/40 cursor-pointer active:scale-95'
                : 'bg-muted/40 border-border/30 text-muted-foreground/40 opacity-50 cursor-not-allowed'
            }`}
            title={currentPath ? 'Beautify / Format Code (Alt+Shift+F)' : 'Open a file first'}
            aria-label="Beautify / Format Code"
          >
            <Sparkles className={`size-3.5 ${isFormatting ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Beautify</span>
          </button>
        )}

        {/* Download file button */}
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            disabled={!currentPath}
            className={`h-7.5 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs ${
              currentPath
                ? 'bg-muted/70 hover:bg-muted border-border/70 text-foreground cursor-pointer active:scale-95'
                : 'bg-muted/40 border-border/30 text-muted-foreground/40 opacity-50 cursor-not-allowed'
            }`}
            title={currentPath ? 'Download file to computer' : 'Open a file first'}
            aria-label="Download file"
          >
            <Download className="size-3.5" />
            <span className="hidden md:inline">Download</span>
          </button>
        )}

        <div className="w-[1px] h-4 bg-border mx-0.5" />

        {/* Auto-save switch */}
        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none px-2 py-1 rounded-md hover:bg-muted/50 transition-colors"
          title="Automatically save changes as you type"
        >
          <button
            type="button"
            role="switch"
            aria-checked={autoSave}
            onClick={() => onToggleAutoSave(!autoSave)}
            className={`w-7 h-4 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer ${
              autoSave ? 'bg-primary' : 'bg-muted border border-border'
            }`}
          >
            <span
              className={`size-3 rounded-full bg-white shadow-xs transition-transform duration-150 ${
                autoSave ? 'translate-x-3' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-[11px] font-medium hidden lg:inline">Auto-save</span>
        </label>

        <div className="w-[1px] h-4 bg-border mx-0.5" />

        {/* Save button */}
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty}
          className={`h-7.5 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs ${
            isDirty
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer ring-1 ring-primary/30 active:scale-95'
              : 'bg-muted/60 text-muted-foreground border border-border/40 opacity-60 cursor-not-allowed'
          }`}
          title={isDirty ? 'Save changes (Ctrl+S)' : 'No changes to save'}
          aria-label="Save file"
        >
          <Save className="size-3.5" />
          <span>Save</span>
          <kbd
            className={`text-[9px] px-1 py-0.2 rounded font-mono hidden sm:inline-block ${
              isDirty ? 'bg-black/20 text-primary-foreground' : 'bg-muted text-muted-foreground/70'
            }`}
          >
            Ctrl+S
          </kbd>
        </button>

        {/* Open in Viewer button */}
        <button
          type="button"
          onClick={handleOpenViewer}
          disabled={!currentPath}
          className={`h-7.5 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs ${
            currentPath
              ? 'bg-secondary/80 hover:bg-secondary border-border/80 text-secondary-foreground cursor-pointer active:scale-95'
              : 'bg-muted/40 border-border/30 text-muted-foreground/50 opacity-50 cursor-not-allowed'
          }`}
          title={currentPath ? 'Open in Artifact Viewer' : 'Open a file first'}
          aria-label="Open in Viewer"
        >
          <Eye className="size-3.5" />
          <span>Viewer</span>
        </button>
      </div>
    </header>
  );
};
