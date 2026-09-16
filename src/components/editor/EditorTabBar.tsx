import React, { useRef, useEffect } from 'react';
import {
  X,
  Plus,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image as ImageIcon,
  Code2,
} from 'lucide-react';
import type { OpenFileTab } from './types';

export interface EditorTabBarProps {
  tabs: OpenFileTab[];
  activePath?: string;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onNewTab?: () => void;
  className?: string;
}

function getTabIcon(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'html':
    case 'htm':
      return <FileCode className="size-3.5 text-orange-500 shrink-0" />;
    case 'css':
      return <FileCode className="size-3.5 text-sky-400 shrink-0" />;
    case 'js':
    case 'mjs':
    case 'cjs':
      return <Code2 className="size-3.5 text-amber-400 shrink-0" />;
    case 'ts':
    case 'mts':
    case 'cts':
      return <Code2 className="size-3.5 text-blue-400 shrink-0" />;
    case 'jsx':
    case 'tsx':
      return <Code2 className="size-3.5 text-cyan-400 shrink-0" />;
    case 'json':
    case 'yaml':
    case 'yml':
      return <FileJson className="size-3.5 text-amber-500 shrink-0" />;
    case 'md':
    case 'markdown':
    case 'txt':
    case 'log':
      return <FileText className="size-3.5 text-indigo-400 shrink-0" />;
    case 'csv':
      return <FileSpreadsheet className="size-3.5 text-emerald-500 shrink-0" />;
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return <ImageIcon className="size-3.5 text-purple-400 shrink-0" />;
    default:
      return <File className="size-3.5 text-muted-foreground shrink-0" />;
  }
}

export const EditorTabBar: React.FC<EditorTabBarProps> = ({
  tabs,
  activePath,
  onSelectTab,
  onCloseTab,
  onNewTab,
  className = '',
}) => {
  const activeTabRef = useRef<HTMLDivElement>(null);

  // Auto scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [activePath]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      role="tablist"
      aria-label="Open editor files"
      className={`flex items-center overflow-x-auto no-scrollbar border-b border-border bg-muted/30 min-h-[35px] select-none shrink-0 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.path === activePath;
        const fileName = tab.name || tab.path.split('/').pop() || 'untitled';

        return (
          <div
            key={tab.path}
            ref={isActive ? activeTabRef : undefined}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => onSelectTab(tab.path)}
            onMouseDown={(e) => {
              // Middle click closes tab
              if (e.button === 1) {
                e.preventDefault();
                onCloseTab(tab.path);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectTab(tab.path);
              }
            }}
            title={tab.path}
            className={`group relative flex items-center gap-2 px-3 py-1.5 h-[35px] text-xs font-mono cursor-pointer border-r border-border/60 transition-all shrink-0 max-w-[200px] ${
              isActive
                ? 'bg-card text-foreground font-medium border-b-2 border-b-primary shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50 border-b-2 border-b-transparent'
            }`}
          >
            {/* File Icon */}
            {getTabIcon(tab.path)}

            {/* Tab Name */}
            <span className="truncate text-xs flex-1">{fileName}</span>

            {/* Dirty indicator or Close button */}
            <div className="flex items-center gap-1 shrink-0 ml-1">
              {tab.isDirty && (
                <span
                  className="size-2 rounded-full bg-amber-500 shrink-0 ring-2 ring-amber-500/20"
                  title="Unsaved changes"
                />
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.path);
                }}
                className="size-4.5 rounded-sm flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-muted-foreground/20 transition-all cursor-pointer opacity-70 group-hover:opacity-100"
                title={`Close ${fileName}`}
                aria-label={`Close ${fileName}`}
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        );
      })}

      {/* New tab / file button */}
      {onNewTab && (
        <button
          type="button"
          onClick={onNewTab}
          className="size-7 mx-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors cursor-pointer shrink-0"
          title="New file"
          aria-label="New file"
        >
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
  );
};
