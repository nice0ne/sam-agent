import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Search,
  X,
  Filter,
  ArrowUpToLine,
  ArrowDownToLine,
  Copy,
  Check,
  WrapText,
  Hash,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  List,
} from 'lucide-react';

export interface LogStreamPreviewProps {
  content: string;
  filePath?: string;
}

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'OTHER';

export interface ParsedLogLine {
  lineNumber: number;
  rawText: string;
  level: LogLevel;
}

const ALL_LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'OTHER'];

/**
 * Detects log level using structured JSON properties, bracketed tags, or keyword heuristics.
 */
export function detectLogLevel(line: string): LogLevel {
  if (!line || !line.trim()) return 'OTHER';

  // 1. Check for JSON structured log level fields
  const jsonLevelMatch = line.match(
    /"(?:level|severity|log_level|levelname|status)"\s*:\s*"([a-zA-Z]+)"/i
  );
  if (jsonLevelMatch) {
    const lvl = jsonLevelMatch[1].toUpperCase();
    if (
      lvl.startsWith('ERR') ||
      lvl === 'FATAL' ||
      lvl.startsWith('FAIL') ||
      lvl === 'CRITICAL' ||
      lvl === 'SEVERE'
    ) {
      return 'ERROR';
    }
    if (lvl.startsWith('WARN')) return 'WARN';
    if (lvl.startsWith('INF') || lvl === 'NOTICE') return 'INFO';
    if (lvl.startsWith('DEBUG') || lvl === 'TRACE' || lvl === 'VERBOSE') return 'DEBUG';
  }

  // 2. Look in the prefix of the line (first 160 characters)
  const prefix = line.slice(0, 160);

  // Check bracketed, tagged or colon/hyphen delimited levels: [ERROR], <WARN>, (INFO), [DEBUG], ERROR:
  const tagMatch = prefix.match(
    /(?:^|[\[\(\<\|\{])\s*(ERROR|FATAL|FAIL|FAILED|CRITICAL|SEVERE|WARN|WARNING|INFO|INFORMATION|NOTICE|DEBUG|TRACE|VERBOSE)\s*(?:[\]\)\>\|\}]|\:|\s+-)/i
  );
  if (tagMatch) {
    const tag = tagMatch[1].toUpperCase();
    if (
      tag.startsWith('ERR') ||
      tag === 'FATAL' ||
      tag.startsWith('FAIL') ||
      tag === 'CRITICAL' ||
      tag === 'SEVERE'
    ) {
      return 'ERROR';
    }
    if (tag.startsWith('WARN')) return 'WARN';
    if (tag.startsWith('INF') || tag === 'NOTICE') return 'INFO';
    if (tag.startsWith('DEBUG') || tag === 'TRACE' || tag === 'VERBOSE') return 'DEBUG';
  }

  // Check word boundaries for log levels
  const wordMatch = prefix.match(
    /\b(ERROR|FATAL|FAIL|FAILED|CRITICAL|SEVERE|WARN|WARNING|INFO|DEBUG|TRACE|VERBOSE)\b/i
  );
  if (wordMatch) {
    const word = wordMatch[1].toUpperCase();
    if (
      word.startsWith('ERR') ||
      word === 'FATAL' ||
      word.startsWith('FAIL') ||
      word === 'CRITICAL' ||
      word === 'SEVERE'
    ) {
      return 'ERROR';
    }
    if (word.startsWith('WARN')) return 'WARN';
    if (word.startsWith('INF')) return 'INFO';
    if (word.startsWith('DEBUG') || word === 'TRACE' || word === 'VERBOSE') return 'DEBUG';
  }

  return 'OTHER';
}

interface LevelConfig {
  label: string;
  badge: string;
  rowHighlight: string;
  pillActive: string;
  icon: React.ComponentType<{ className?: string }>;
}

const LEVEL_CONFIGS: Record<LogLevel, LevelConfig> = {
  ERROR: {
    label: 'ERROR',
    badge: 'bg-red-500/10 text-red-500 border-red-500/20',
    rowHighlight: 'bg-red-500/5 hover:bg-red-500/10',
    pillActive: 'bg-red-500 text-white border-red-600 shadow-xs',
    icon: AlertCircle,
  },
  WARN: {
    label: 'WARN',
    badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    rowHighlight: 'bg-amber-500/5 hover:bg-amber-500/10',
    pillActive: 'bg-amber-500 text-white border-amber-600 shadow-xs',
    icon: AlertTriangle,
  },
  INFO: {
    label: 'INFO',
    badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    rowHighlight: 'hover:bg-muted/40',
    pillActive: 'bg-emerald-500 text-white border-emerald-600 shadow-xs',
    icon: Info,
  },
  DEBUG: {
    label: 'DEBUG',
    badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    rowHighlight: 'hover:bg-muted/40',
    pillActive: 'bg-blue-500 text-white border-blue-600 shadow-xs',
    icon: Bug,
  },
  OTHER: {
    label: 'OTHER',
    badge: 'bg-muted/50 text-muted-foreground border-border/50',
    rowHighlight: 'hover:bg-muted/40',
    pillActive: 'bg-muted text-foreground border-border shadow-xs',
    icon: List,
  },
};

/**
 * Renders text with search query highlighted via <mark>.
 */
const HighlightMatch: React.FC<{ text: string; term: string }> = React.memo(({ text, term }) => {
  const query = term.trim();
  if (!query) return <>{text}</>;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  const lowerQuery = query.toLowerCase();

  return (
    <>
      {parts.map((part, idx) =>
        part.toLowerCase() === lowerQuery ? (
          <mark
            key={idx}
            className="bg-yellow-400/30 text-yellow-600 dark:text-yellow-300 rounded-xs px-0.5 font-semibold"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </>
  );
});

HighlightMatch.displayName = 'HighlightMatch';

export const LogStreamPreview: React.FC<LogStreamPreviewProps> = ({ content, filePath }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS));
  const [wordWrap, setWordWrap] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [copiedFiltered, setCopiedFiltered] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Smart Log Line Parser
  const allLines: ParsedLogLine[] = useMemo(() => {
    if (!content) return [];
    const rawLines = content.split(/\r?\n/);
    return rawLines.map((line, idx) => ({
      lineNumber: idx + 1,
      rawText: line,
      level: detectLogLevel(line),
    }));
  }, [content]);

  // 2. Summary Metrics & Stats Badges
  const stats = useMemo(() => {
    const counts: Record<LogLevel, number> = {
      ERROR: 0,
      WARN: 0,
      INFO: 0,
      DEBUG: 0,
      OTHER: 0,
    };
    for (const line of allLines) {
      counts[line.level]++;
    }
    return {
      total: allLines.length,
      ...counts,
    };
  }, [allLines]);

  // 3. Filtered Log Lines
  const filteredLines = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return allLines.filter((line) => {
      if (!enabledLevels.has(line.level)) {
        return false;
      }
      if (term && !line.rawText.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [allLines, enabledLevels, searchTerm]);

  // Total occurrences of the search term across filtered lines
  const matchCount = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return 0;
    let count = 0;
    for (const line of filteredLines) {
      let pos = 0;
      const lower = line.rawText.toLowerCase();
      while ((pos = lower.indexOf(term, pos)) !== -1) {
        count++;
        pos += term.length;
      }
    }
    return count;
  }, [filteredLines, searchTerm]);

  // Toggle or isolate level filter
  const isIsolatedTo = useCallback(
    (level: LogLevel) => {
      return enabledLevels.size === 1 && enabledLevels.has(level);
    },
    [enabledLevels]
  );

  const handleIsolateLevel = useCallback(
    (level: LogLevel) => {
      if (isIsolatedTo(level)) {
        setEnabledLevels(new Set(ALL_LEVELS));
      } else {
        setEnabledLevels(new Set([level]));
      }
    },
    [isIsolatedTo]
  );

  const toggleLevel = useCallback((level: LogLevel) => {
    setEnabledLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  const handleSelectAllLevels = useCallback(() => {
    setEnabledLevels(new Set(ALL_LEVELS));
  }, []);

  const handleJumpToTop = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleJumpToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  const handleCopyFiltered = useCallback(async () => {
    const text = filteredLines.map((l) => l.rawText).join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedFiltered(true);
    setTimeout(() => setCopiedFiltered(false), 2000);
  }, [filteredLines]);

  const handleCopyAll = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }, [content]);

  const isAllLevelsEnabled = enabledLevels.size === ALL_LEVELS.length;
  const isFilteringActive = !isAllLevelsEnabled || searchTerm.trim().length > 0;

  if (allLines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground bg-background">
        <List className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium text-foreground">Empty Log Stream</p>
        <p className="text-xs mt-1 text-muted-foreground">
          {filePath ? `"${filePath}" contains no log lines.` : 'This file contains no log lines.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background select-text">
      {/* Top Header Summary Metrics & Action Bar */}
      <div className="px-4 py-2.5 border-b border-border bg-card/70 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Header Summary Metrics & Stats Badges */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <span>Total:</span>
            <span className="text-foreground font-semibold font-mono">
              {stats.total.toLocaleString()} lines
            </span>
          </div>

          <span className="text-border">|</span>

          {/* Clickable Error badge */}
          <button
            type="button"
            onClick={() => handleIsolateLevel('ERROR')}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
              isIsolatedTo('ERROR')
                ? LEVEL_CONFIGS.ERROR.pillActive
                : LEVEL_CONFIGS.ERROR.badge
            }`}
            title={isIsolatedTo('ERROR') ? 'Show all lines' : 'Isolate Error logs'}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{stats.ERROR.toLocaleString()} Errors</span>
          </button>

          {/* Clickable Warning badge */}
          <button
            type="button"
            onClick={() => handleIsolateLevel('WARN')}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
              isIsolatedTo('WARN')
                ? LEVEL_CONFIGS.WARN.pillActive
                : LEVEL_CONFIGS.WARN.badge
            }`}
            title={isIsolatedTo('WARN') ? 'Show all lines' : 'Isolate Warning logs'}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{stats.WARN.toLocaleString()} Warnings</span>
          </button>

          {/* Clickable Info badge */}
          <button
            type="button"
            onClick={() => handleIsolateLevel('INFO')}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
              isIsolatedTo('INFO')
                ? LEVEL_CONFIGS.INFO.pillActive
                : LEVEL_CONFIGS.INFO.badge
            }`}
            title={isIsolatedTo('INFO') ? 'Show all lines' : 'Isolate Info logs'}
          >
            <Info className="w-3.5 h-3.5" />
            <span>{stats.INFO.toLocaleString()} Info</span>
          </button>

          {/* Clickable Debug badge */}
          <button
            type="button"
            onClick={() => handleIsolateLevel('DEBUG')}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
              isIsolatedTo('DEBUG')
                ? LEVEL_CONFIGS.DEBUG.pillActive
                : LEVEL_CONFIGS.DEBUG.badge
            }`}
            title={isIsolatedTo('DEBUG') ? 'Show all lines' : 'Isolate Debug logs'}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>{stats.DEBUG.toLocaleString()} Debug</span>
          </button>
        </div>

        {/* Action Controls: Jump to Top/Bottom, Wrap, Line Numbers, Copy */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Jump Buttons */}
          <button
            type="button"
            onClick={handleJumpToTop}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer"
            title="Jump to Top"
          >
            <ArrowUpToLine className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Top</span>
          </button>

          <button
            type="button"
            onClick={handleJumpToBottom}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer"
            title="Jump to Bottom"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bottom</span>
          </button>

          <span className="w-px h-4 bg-border my-auto" />

          {/* Word Wrap Toggle */}
          <button
            type="button"
            onClick={() => setWordWrap(!wordWrap)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
              wordWrap
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border-border/60'
            }`}
            title={wordWrap ? 'Disable word wrap (horizontal scroll)' : 'Enable word wrap'}
          >
            <WrapText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Wrap</span>
          </button>

          {/* Line Numbers Toggle */}
          <button
            type="button"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
              showLineNumbers
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border-border/60'
            }`}
            title={showLineNumbers ? 'Hide line numbers gutter' : 'Show line numbers gutter'}
          >
            <Hash className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lines</span>
          </button>

          <span className="w-px h-4 bg-border my-auto" />

          {/* Copy Actions */}
          {isFilteringActive && (
            <button
              type="button"
              onClick={handleCopyFiltered}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer"
              title="Copy filtered lines to clipboard"
            >
              {copiedFiltered ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Filtered</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60 transition-colors cursor-pointer"
            title="Copy all logs to clipboard"
          >
            {copiedAll ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy All</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sub-toolbar: Search bar and Level filter toggle pills */}
      <div className="px-4 py-2 border-b border-border/80 bg-muted/30 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Search Bar */}
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search logs (regex or keyword)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-20 py-1 text-xs bg-background/80 hover:bg-background focus:bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all font-mono"
            />
            <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
              {searchTerm && (
                <>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5 rounded"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Level Filter Toggle Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium hidden md:inline">Levels:</span>
          </div>

          {/* All Reset Pill */}
          <button
            type="button"
            onClick={handleSelectAllLevels}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              isAllLevelsEnabled
                ? 'bg-foreground text-background border-foreground shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border-border/60'
            }`}
          >
            All
          </button>

          {/* ERROR Pill */}
          <button
            type="button"
            onClick={() => toggleLevel('ERROR')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
              enabledLevels.has('ERROR')
                ? 'bg-red-500/15 text-red-500 border-red-500/30'
                : 'opacity-40 hover:opacity-75 bg-transparent text-muted-foreground border-border/40'
            }`}
            title="Toggle ERROR level"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>ERROR</span>
            <span className="text-[10px] opacity-80 font-mono">({stats.ERROR})</span>
          </button>

          {/* WARN Pill */}
          <button
            type="button"
            onClick={() => toggleLevel('WARN')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
              enabledLevels.has('WARN')
                ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                : 'opacity-40 hover:opacity-75 bg-transparent text-muted-foreground border-border/40'
            }`}
            title="Toggle WARN level"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>WARN</span>
            <span className="text-[10px] opacity-80 font-mono">({stats.WARN})</span>
          </button>

          {/* INFO Pill */}
          <button
            type="button"
            onClick={() => toggleLevel('INFO')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
              enabledLevels.has('INFO')
                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                : 'opacity-40 hover:opacity-75 bg-transparent text-muted-foreground border-border/40'
            }`}
            title="Toggle INFO level"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>INFO</span>
            <span className="text-[10px] opacity-80 font-mono">({stats.INFO})</span>
          </button>

          {/* DEBUG Pill */}
          <button
            type="button"
            onClick={() => toggleLevel('DEBUG')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
              enabledLevels.has('DEBUG')
                ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                : 'opacity-40 hover:opacity-75 bg-transparent text-muted-foreground border-border/40'
            }`}
            title="Toggle DEBUG level"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>DEBUG</span>
            <span className="text-[10px] opacity-80 font-mono">({stats.DEBUG})</span>
          </button>

          {/* OTHER Pill */}
          <button
            type="button"
            onClick={() => toggleLevel('OTHER')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all cursor-pointer ${
              enabledLevels.has('OTHER')
                ? 'bg-muted text-foreground border-border'
                : 'opacity-40 hover:opacity-75 bg-transparent text-muted-foreground border-border/40'
            }`}
            title="Toggle UNLABELED / OTHER lines"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            <span>OTHER</span>
            <span className="text-[10px] opacity-80 font-mono">({stats.OTHER})</span>
          </button>

          {/* Lines Match Counter */}
          {filteredLines.length !== allLines.length && (
            <span className="text-[11px] text-muted-foreground font-mono ml-1">
              ({filteredLines.length} / {allLines.length} lines)
            </span>
          )}
        </div>
      </div>

      {/* Main Log Lines Viewport */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-card">
        {filteredLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-foreground">No matching log entries</p>
            <p className="text-xs mt-1 max-w-sm">
              No lines match your current search term or active level filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                handleSelectAllLevels();
              }}
              className="mt-3 px-3 py-1 rounded-md text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors cursor-pointer"
            >
              Reset all filters
            </button>
          </div>
        ) : (
          <div className={`py-1 ${wordWrap ? 'w-full' : 'min-w-fit w-full'}`}>
            {filteredLines.map((line) => {
              const config = LEVEL_CONFIGS[line.level];
              return (
                <div
                  key={line.lineNumber}
                  className={`flex items-start transition-colors group font-mono text-xs ${config.rowHighlight}`}
                >
                  {/* Line Number Gutter */}
                  {showLineNumbers && (
                    <div className="w-14 min-w-14 shrink-0 px-2 py-0.5 text-right select-none text-muted-foreground/40 group-hover:text-muted-foreground/70 border-r border-border/40 text-[11px] leading-5">
                      {line.lineNumber}
                    </div>
                  )}

                  {/* Level Badge Column */}
                  <div className="w-20 min-w-20 shrink-0 px-2 py-0.5 flex items-center justify-center select-none leading-5">
                    {line.level !== 'OTHER' ? (
                      <span
                        className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border leading-none shrink-0 ${config.badge}`}
                      >
                        {config.label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40 tracking-wider">
                        —
                      </span>
                    )}
                  </div>

                  {/* Log Content */}
                  <div
                    className={`flex-1 min-w-0 px-3 py-0.5 leading-5 text-foreground/90 ${
                      wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                    }`}
                  >
                    <HighlightMatch text={line.rawText} term={searchTerm} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogStreamPreview;
