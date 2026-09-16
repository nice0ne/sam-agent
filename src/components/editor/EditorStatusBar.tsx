import React from 'react';
import { Check, CircleDot, Lock, Sparkles } from 'lucide-react';
import type { CursorPosition } from './types';

export interface EditorStatusBarProps {
  cursor?: CursorPosition;
  fileSize?: number;
  totalLines?: number;
  charCount?: number;
  language?: string;
  isDirty?: boolean;
  readOnly?: boolean;
  onFormat?: () => void;
  className?: string;
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const formatted = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${formatted} ${units[i] || 'B'}`;
}

function formatLanguageName(lang?: string): string {
  if (!lang) return 'Plain Text';
  const lower = lang.toLowerCase();
  switch (lower) {
    case 'js':
    case 'javascript':
      return 'JavaScript';
    case 'ts':
    case 'typescript':
      return 'TypeScript';
    case 'jsx':
      return 'JSX';
    case 'tsx':
      return 'TSX';
    case 'html':
      return 'HTML';
    case 'css':
      return 'CSS';
    case 'json':
      return 'JSON';
    case 'md':
    case 'markdown':
      return 'Markdown';
    case 'py':
    case 'python':
      return 'Python';
    case 'csv':
      return 'CSV';
    default:
      return lang.charAt(0).toUpperCase() + lang.slice(1);
  }
}

export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  cursor,
  fileSize,
  totalLines,
  charCount,
  language,
  isDirty,
  readOnly,
  onFormat,
  className = '',
}) => {
  const line = cursor?.line ?? 1;
  const col = cursor?.column ?? 1;
  const selectionLength = cursor?.selectionLength ?? 0;

  return (
    <footer
      role="status"
      aria-label="Editor Status"
      className={`flex items-center justify-between px-3 py-1 border-t border-border bg-card/85 backdrop-blur-md text-[11px] font-mono text-muted-foreground select-none shrink-0 h-6.5 transition-colors ${className}`}
    >
      {/* Left: Line, Column, Selection, Total Lines & Characters */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 text-foreground/80">
          <span>
            Ln {line}, Col {col}
          </span>
          {selectionLength > 0 && (
            <span className="text-muted-foreground">
              ({selectionLength} selected)
            </span>
          )}
        </div>

        {totalLines !== undefined && (
          <span className="hidden sm:inline text-muted-foreground/75" title="Total lines in file">
            {totalLines} {totalLines === 1 ? 'line' : 'lines'}
          </span>
        )}

        {charCount !== undefined && (
          <span className="hidden md:inline text-muted-foreground/75" title="Total characters">
            {charCount.toLocaleString()} chars
          </span>
        )}

        {readOnly && (
          <div className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border/50 text-[10px]">
            <Lock className="size-2.5" />
            <span>Read-Only</span>
          </div>
        )}
      </div>

      {/* Right: Encoding, File size, Language, Format Button, Save Status */}
      <div className="flex items-center gap-2.5 shrink-0">
        {onFormat && (
          <button
            type="button"
            onClick={onFormat}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors cursor-pointer"
            title="Format / Beautify Code"
          >
            <Sparkles className="size-2.5" />
            <span className="hidden sm:inline">Format</span>
          </button>
        )}

        <span className="hidden sm:inline hover:text-foreground transition-colors cursor-default" title="Character encoding">
          UTF-8
        </span>

        {fileSize !== undefined && (
          <span className="hover:text-foreground transition-colors cursor-default" title="File size">
            {formatFileSize(fileSize)}
          </span>
        )}

        <span
          className="hover:text-foreground transition-colors cursor-default font-medium text-foreground/80"
          title={`Language mode: ${formatLanguageName(language)}`}
        >
          {formatLanguageName(language)}
        </span>

        <div className="w-[1px] h-3 bg-border" />

        {/* Save status badge */}
        {isDirty ? (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20"
            title="Unsaved changes pending save"
          >
            <CircleDot className="size-2.5 animate-pulse" />
            <span>Unsaved Changes</span>
          </span>
        ) : (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
            title="All changes saved"
          >
            <Check className="size-2.5" />
            <span>Saved</span>
          </span>
        )}
      </div>
    </footer>
  );
};
