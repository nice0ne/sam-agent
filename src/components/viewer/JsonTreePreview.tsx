import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Table,
  ListTree,
  AlertCircle,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
} from 'lucide-react';

export interface JsonTreePreviewProps {
  content: string;
  filePath?: string;
}

interface TableCandidate {
  key: string;
  label: string;
  data: Record<string, unknown>[];
}

// Helper to construct dot/bracket notation paths
function buildPath(parentPath: string, key: string | number): string {
  if (typeof key === 'number' || /^\d+$/.test(String(key))) {
    return parentPath ? `${parentPath}[${key}]` : `[${key}]`;
  }
  const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(String(key));
  if (!parentPath) {
    return isValidIdentifier ? String(key) : `["${key}"]`;
  }
  return isValidIdentifier ? `${parentPath}.${key}` : `${parentPath}["${key}"]`;
}

// Recursive text highlighter for search matches
const HighlightMatch: React.FC<{ text: string; term: string }> = ({ text, term }) => {
  if (!term.trim()) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const index = lowerText.indexOf(lowerTerm);
  if (index === -1) return <>{text}</>;

  const before = text.slice(0, index);
  const match = text.slice(index, index + term.length);
  const after = text.slice(index + term.length);

  return (
    <>
      {before}
      <mark className="bg-yellow-400/30 text-yellow-600 dark:text-yellow-300 rounded-xs px-0.5 font-medium">
        {match}
      </mark>
      <HighlightMatch text={after} term={term} />
    </>
  );
};

// Check if a node or any of its descendants match the search term
function nodeMatchesSearch(
  value: unknown,
  keyName: string | number | undefined,
  term: string
): boolean {
  if (!term.trim()) return true;
  const lowerTerm = term.toLowerCase();

  // Match key name
  if (keyName !== undefined && String(keyName).toLowerCase().includes(lowerTerm)) {
    return true;
  }

  // Match primitives
  if (value === null) {
    return 'null'.includes(lowerTerm);
  }
  if (value === undefined) {
    return 'undefined'.includes(lowerTerm);
  }
  if (typeof value !== 'object') {
    return String(value).toLowerCase().includes(lowerTerm);
  }

  // Match children in object/array
  if (Array.isArray(value)) {
    return value.some((item, idx) => nodeMatchesSearch(item, idx, term));
  }
  return Object.entries(value as Record<string, unknown>).some(([k, v]) =>
    nodeMatchesSearch(v, k, term)
  );
}

// Tree Node Props
interface TreeNodeProps {
  keyName?: string | number;
  value: unknown;
  path: string;
  depth: number;
  searchTerm: string;
  expandedOverrides: Record<string, boolean>;
  globalExpand: 'default' | 'expandAll' | 'collapseAll';
  onToggleExpand: (path: string) => void;
  onCopyPath: (path: string) => void;
  onHoverPath: (path: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(
  ({
    keyName,
    value,
    path,
    depth,
    searchTerm,
    expandedOverrides,
    globalExpand,
    onToggleExpand,
    onCopyPath,
    onHoverPath,
  }) => {
    const isObject = value !== null && typeof value === 'object';
    const isArray = Array.isArray(value);

    // Filter check: if search term is provided, hide node if neither it nor descendants match
    const isVisible = useMemo(() => {
      if (!searchTerm.trim()) return true;
      return nodeMatchesSearch(value, keyName, searchTerm);
    }, [value, keyName, searchTerm]);

    // Determine expansion status
    const isExpanded = useMemo(() => {
      if (!isObject) return false;
      // Search expansion: auto-expand nodes that match search term
      if (searchTerm.trim().length > 0) {
        return true;
      }
      if (path in expandedOverrides) {
        return expandedOverrides[path];
      }
      if (globalExpand === 'expandAll') return true;
      if (globalExpand === 'collapseAll') return false;
      // Default: expand up to depth 2
      return depth <= 2;
    }, [isObject, searchTerm, path, expandedOverrides, globalExpand, depth]);

    if (!isVisible) return null;

    // Render primitive value
    const renderPrimitive = (val: unknown) => {
      if (val === null) {
        return <span className="text-muted-foreground italic font-mono">null</span>;
      }
      if (val === undefined) {
        return <span className="text-muted-foreground italic font-mono">undefined</span>;
      }
      if (typeof val === 'string') {
        return (
          <span className="text-emerald-600 dark:text-emerald-400 font-mono break-all">
            &quot;
            <HighlightMatch text={val} term={searchTerm} />
            &quot;
          </span>
        );
      }
      if (typeof val === 'number') {
        return (
          <span className="text-blue-600 dark:text-blue-400 font-mono">
            <HighlightMatch text={String(val)} term={searchTerm} />
          </span>
        );
      }
      if (typeof val === 'boolean') {
        return (
          <span className="text-purple-600 dark:text-purple-400 font-mono font-medium">
            {String(val)}
          </span>
        );
      }
      return <span className="text-foreground font-mono">{String(val)}</span>;
    };

    const entries = isObject
      ? isArray
        ? (value as unknown[]).map((v, i) => [i, v] as const)
        : Object.entries(value as Record<string, unknown>)
      : [];

    const itemCount = entries.length;
    const badgeLabel = isArray
      ? `[ ${itemCount} ${itemCount === 1 ? 'item' : 'items'} ]`
      : `{ ${itemCount} ${itemCount === 1 ? 'key' : 'keys'} }`;

    return (
      <div
        className="text-xs leading-relaxed font-mono"
        onMouseEnter={() => path && onHoverPath(path)}
      >
        <div className="flex items-center gap-1.5 py-0.5 px-1.5 rounded-md hover:bg-muted/50 group transition-colors">
          {/* Collapse/Expand chevron */}
          {isObject && itemCount > 0 ? (
            <button
              type="button"
              onClick={() => onToggleExpand(path)}
              className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer shrink-0 transition-transform"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {/* Key name (clickable to copy path) */}
          {keyName !== undefined && (
            <button
              type="button"
              onClick={() => onCopyPath(path)}
              className="inline-flex items-center gap-1 group/key text-foreground hover:text-primary font-medium cursor-pointer transition-colors text-left"
              title={`Click to copy path: ${path}`}
            >
              {typeof keyName === 'number' ? (
                <span className="text-muted-foreground font-mono">[{keyName}]</span>
              ) : (
                <span className="text-foreground font-semibold font-mono">
                  <HighlightMatch text={String(keyName)} term={searchTerm} />
                </span>
              )}
              <span className="text-muted-foreground mr-0.5">:</span>
              <Copy className="w-3 h-3 opacity-0 group-hover/key:opacity-100 text-muted-foreground hover:text-primary transition-opacity" />
            </button>
          )}

          {/* Value or structure badge */}
          {isObject ? (
            <div
              onClick={() => itemCount > 0 && onToggleExpand(path)}
              className="flex items-center gap-1 cursor-pointer select-none"
            >
              <span className="text-muted-foreground font-mono">
                {isArray ? '[' : '{'}
              </span>
              {!isExpanded && (
                <>
                  <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-sans font-medium bg-muted text-muted-foreground border border-border/60">
                    {badgeLabel}
                  </span>
                  <span className="text-muted-foreground font-mono">
                    {isArray ? ']' : '}'}
                  </span>
                </>
              )}
              {isExpanded && (
                <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-sans font-medium bg-muted/60 text-muted-foreground/80 border border-border/40">
                  {badgeLabel}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              {renderPrimitive(value)}
            </div>
          )}
        </div>

        {/* Child items */}
        {isObject && isExpanded && itemCount > 0 && (
          <div className="border-l border-border/50 pl-3.5 ml-3.5 my-0.5 space-y-0.5">
            {entries.map(([childKey, childValue]) => {
              const childPath = buildPath(path, childKey);
              return (
                <TreeNode
                  key={String(childKey)}
                  keyName={childKey}
                  value={childValue}
                  path={childPath}
                  depth={depth + 1}
                  searchTerm={searchTerm}
                  expandedOverrides={expandedOverrides}
                  globalExpand={globalExpand}
                  onToggleExpand={onToggleExpand}
                  onCopyPath={onCopyPath}
                  onHoverPath={onHoverPath}
                />
              );
            })}
            <div className="text-muted-foreground font-mono px-1.5 py-0.5 select-none">
              {isArray ? ']' : '}'}
            </div>
          </div>
        )}
      </div>
    );
  }
);
TreeNode.displayName = 'TreeNode';

export const JsonTreePreview: React.FC<JsonTreePreviewProps> = ({
  content,
  filePath,
}) => {
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');
  const [searchTerm, setSearchTerm] = useState('');
  const [showRawFallback, setShowRawFallback] = useState(false);

  // Copy feedbacks
  const [copiedAction, setCopiedAction] = useState<'formatted' | 'minified' | null>(null);
  const [copiedPathToast, setCopiedPathToast] = useState<string | null>(null);
  const [activeHoverPath, setActiveHoverPath] = useState<string>('');

  // Tree expansion state
  const [globalExpand, setGlobalExpand] = useState<'default' | 'expandAll' | 'collapseAll'>('default');
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});

  // Table sorting & pagination state
  const [selectedTableCandidate, setSelectedTableCandidate] = useState<string>('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Parse JSON safely
  const { parsedData, parseError } = useMemo(() => {
    if (!content || !content.trim()) {
      return { parsedData: null, parseError: 'JSON content is empty.' };
    }
    try {
      const data = JSON.parse(content);
      return { parsedData: data, parseError: null };
    } catch (err) {
      return {
        parsedData: null,
        parseError: err instanceof Error ? err.message : 'Unknown JSON parse error.',
      };
    }
  }, [content]);

  // Auto-detect array of objects for Table View
  const tableCandidates = useMemo<TableCandidate[]>(() => {
    if (!parsedData || typeof parsedData !== 'object') return [];
    const candidates: TableCandidate[] = [];

    // Check if root is array of objects
    if (
      Array.isArray(parsedData) &&
      parsedData.length > 0 &&
      typeof parsedData[0] === 'object' &&
      parsedData[0] !== null
    ) {
      candidates.push({
        key: '__root__',
        label: `Root Array (${parsedData.length} items)`,
        data: parsedData as Record<string, unknown>[],
      });
    }

    // Check primary properties of root object
    if (!Array.isArray(parsedData)) {
      for (const [key, value] of Object.entries(parsedData)) {
        if (
          Array.isArray(value) &&
          value.length > 0 &&
          typeof value[0] === 'object' &&
          value[0] !== null
        ) {
          candidates.push({
            key,
            label: `${key} (${value.length} items)`,
            data: value as Record<string, unknown>[],
          });
        }
      }
    }

    return candidates;
  }, [parsedData]);

  const isTableCompatible = tableCandidates.length > 0;

  // Auto-select initial table candidate and default mode on load
  useEffect(() => {
    if (tableCandidates.length > 0) {
      setSelectedTableCandidate(tableCandidates[0].key);
      // Auto-switch to Table View if root is array of objects
      if (Array.isArray(parsedData)) {
        setViewMode('table');
      }
    } else {
      setViewMode('tree');
    }
  }, [tableCandidates, parsedData]);

  // Active table data
  const currentTableCandidate = useMemo(() => {
    return (
      tableCandidates.find((c) => c.key === selectedTableCandidate) ||
      tableCandidates[0]
    );
  }, [tableCandidates, selectedTableCandidate]);

  // Derive columns from object keys
  const tableColumns = useMemo(() => {
    if (!currentTableCandidate) return [];
    const keySet = new Set<string>();
    for (const row of currentTableCandidate.data) {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach((k) => keySet.add(k));
      }
    }
    return Array.from(keySet);
  }, [currentTableCandidate]);

  // Filtered and sorted table rows
  const filteredAndSortedTableRows = useMemo(() => {
    if (!currentTableCandidate) return [];
    let rows = currentTableCandidate.data;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((val) => {
          if (val === null || val === undefined) return false;
          if (typeof val === 'object') {
            return JSON.stringify(val).toLowerCase().includes(term);
          }
          return String(val).toLowerCase().includes(term);
        })
      );
    }

    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const valA = a[sortCol];
        const valB = b[sortCol];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        const numA = Number(valA);
        const numB = Number(valB);
        if (
          !isNaN(numA) &&
          !isNaN(numB) &&
          typeof valA !== 'boolean' &&
          typeof valB !== 'boolean' &&
          typeof valA !== 'object' &&
          typeof valB !== 'object'
        ) {
          return sortDir === 'asc' ? numA - numB : numB - numA;
        }

        const strA = typeof valA === 'object' ? JSON.stringify(valA) : String(valA);
        const strB = typeof valB === 'object' ? JSON.stringify(valB) : String(valB);
        return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return rows;
  }, [currentTableCandidate, searchTerm, sortCol, sortDir]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedTableRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedTableRows.slice(start, start + pageSize);
  }, [filteredAndSortedTableRows, currentPage, pageSize]);

  // Reset pagination on search or data change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTableCandidate, pageSize]);

  // Copy Handlers
  const handleCopyFormatted = async () => {
    if (!parsedData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(parsedData, null, 2));
      setCopiedAction('formatted');
      setTimeout(() => setCopiedAction(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyMinified = async () => {
    if (!parsedData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(parsedData));
      setCopiedAction('minified');
      setTimeout(() => setCopiedAction(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyPath = useCallback((path: string) => {
    if (!path) return;
    navigator.clipboard.writeText(path);
    setCopiedPathToast(path);
    setTimeout(() => setCopiedPathToast(null), 2500);
  }, []);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedOverrides((prev) => {
      // If path currently exists in overrides, toggle it; otherwise determine current default
      const current = prev[path];
      return {
        ...prev,
        [path]: current !== undefined ? !current : false,
      };
    });
  }, []);

  const handleExpandAll = () => {
    setGlobalExpand('expandAll');
    setExpandedOverrides({});
  };

  const handleCollapseAll = () => {
    setGlobalExpand('collapseAll');
    setExpandedOverrides({});
  };

  const handleTableSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortCol(null);
        setSortDir('asc');
      }
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  // Error State Handling
  if (parseError) {
    return (
      <div className="flex flex-col h-full overflow-hidden p-6 bg-background">
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col gap-3 text-amber-600 dark:text-amber-400 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Malformed JSON Detected</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Unable to parse content as valid JSON:
              </p>
              <pre className="mt-2 p-2.5 rounded-lg bg-background/80 border border-border text-[11px] font-mono text-foreground overflow-x-auto select-text">
                {parseError}
              </pre>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-amber-500/20">
            <button
              type="button"
              onClick={() => setShowRawFallback(!showRawFallback)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer"
            >
              {showRawFallback ? 'Hide Raw Content' : 'View Raw Content'}
            </button>
            <span className="text-xs text-muted-foreground">
              You can also switch to Raw view using the header toolbar.
            </span>
          </div>
        </div>

        {showRawFallback && (
          <div className="mt-4 flex-1 overflow-auto rounded-xl border border-border bg-card p-4">
            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap select-text">
              {content}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background select-text">
      {/* Top Toolbar */}
      <div className="p-3 border-b border-border bg-card/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Search input & Dual-mode switch */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder={viewMode === 'tree' ? 'Filter keys or values...' : 'Filter table rows...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-muted/40 hover:bg-muted/60 focus:bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'tree'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ListTree className="w-3.5 h-3.5" />
              <span>Tree View</span>
            </button>

            <button
              type="button"
              disabled={!isTableCompatible}
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-background text-foreground shadow-xs'
                  : isTableCompatible
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
              title={
                isTableCompatible
                  ? 'Switch to Table View'
                  : 'Table View requires an array of objects'
              }
            >
              <Table className="w-3.5 h-3.5" />
              <span>Table View</span>
              {isTableCompatible && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
          </div>

          {/* Table candidate selector if multiple arrays exist */}
          {viewMode === 'table' && tableCandidates.length > 1 && (
            <select
              value={selectedTableCandidate}
              onChange={(e) => setSelectedTableCandidate(e.target.value)}
              className="text-xs bg-muted/50 border border-border rounded-lg px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {tableCandidates.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {viewMode === 'tree' && (
            <>
              <button
                type="button"
                onClick={handleExpandAll}
                className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                title="Expand all nodes"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                title="Collapse all nodes"
              >
                Collapse All
              </button>
              <div className="w-px h-4 bg-border/60 mx-1" />
            </>
          )}

          {/* Copy Formatted */}
          <button
            type="button"
            onClick={handleCopyFormatted}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-border bg-card hover:bg-muted/60 text-foreground transition-colors cursor-pointer shadow-2xs"
            title="Copy formatted JSON (2 spaces)"
          >
            {copiedAction === 'formatted' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Copy Formatted</span>
              </>
            )}
          </button>

          {/* Copy Minified */}
          <button
            type="button"
            onClick={handleCopyMinified}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-border bg-card hover:bg-muted/60 text-foreground transition-colors cursor-pointer shadow-2xs"
            title="Copy minified compact JSON"
          >
            {copiedAction === 'minified' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Copy Minified</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'tree' ? (
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs overflow-x-auto min-h-full">
            <TreeNode
              value={parsedData}
              path=""
              depth={0}
              searchTerm={searchTerm}
              expandedOverrides={expandedOverrides}
              globalExpand={globalExpand}
              onToggleExpand={handleToggleExpand}
              onCopyPath={handleCopyPath}
              onHoverPath={setActiveHoverPath}
            />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Table Container */}
            <div className="flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-muted/90 backdrop-blur sticky top-0 z-10 border-b border-border select-none">
                  <tr>
                    <th className="w-12 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase text-center border-r border-border/40">
                      #
                    </th>
                    {tableColumns.map((col) => {
                      const isSorted = sortCol === col;
                      return (
                        <th
                          key={col}
                          onClick={() => handleTableSort(col)}
                          className="px-4 py-2 font-semibold text-foreground border-r border-border/40 last:border-r-0 hover:bg-muted cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="truncate">{col}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {isSorted ? (
                                sortDir === 'asc' ? (
                                  <ArrowUp className="w-3 h-3 text-primary" />
                                ) : (
                                  <ArrowDown className="w-3 h-3 text-primary" />
                                )
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                              )}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tableColumns.length + 1}
                        className="py-12 text-center text-muted-foreground"
                      >
                        {searchTerm
                          ? `No rows matching "${searchTerm}"`
                          : 'No data rows found'}
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, rowIdx) => {
                      const absoluteIdx = (currentPage - 1) * pageSize + rowIdx + 1;
                      return (
                        <tr
                          key={rowIdx}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-3 py-1.5 text-center text-[10px] text-muted-foreground border-r border-border/40 select-none">
                            {absoluteIdx}
                          </td>
                          {tableColumns.map((col) => {
                            const val = row[col];
                            const isNull = val === null;
                            const isUndefined = val === undefined;
                            const isObj = val !== null && typeof val === 'object';

                            return (
                              <td
                                key={col}
                                className="px-4 py-1.5 border-r border-border/40 last:border-r-0 max-w-xs truncate"
                                title={
                                  isObj ? JSON.stringify(val) : String(val ?? '')
                                }
                              >
                                {isNull ? (
                                  <span className="text-muted-foreground/60 italic">
                                    null
                                  </span>
                                ) : isUndefined ? (
                                  <span className="text-muted-foreground/40">-</span>
                                ) : isObj ? (
                                  <span className="px-1.5 py-0.2 text-[10px] rounded-sm bg-muted text-muted-foreground border border-border/50">
                                    {Array.isArray(val)
                                      ? `[${val.length}]`
                                      : `{${Object.keys(val as object).length}}`}
                                  </span>
                                ) : typeof val === 'boolean' ? (
                                  <span className="text-purple-600 dark:text-purple-400 font-medium">
                                    {String(val)}
                                  </span>
                                ) : typeof val === 'number' ? (
                                  <span className="text-blue-600 dark:text-blue-400">
                                    {val}
                                  </span>
                                ) : (
                                  <span className="text-foreground">
                                    <HighlightMatch
                                      text={String(val)}
                                      term={searchTerm}
                                    />
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Pagination Bar */}
            <div className="flex items-center justify-between px-3 py-2 mt-2 bg-card rounded-lg border border-border text-xs text-muted-foreground">
              <div>
                Showing{' '}
                <strong className="text-foreground">
                  {filteredAndSortedTableRows.length === 0
                    ? 0
                    : (currentPage - 1) * pageSize + 1}
                </strong>{' '}
                to{' '}
                <strong className="text-foreground">
                  {Math.min(
                    currentPage * pageSize,
                    filteredAndSortedTableRows.length
                  )}
                </strong>{' '}
                of{' '}
                <strong className="text-foreground">
                  {filteredAndSortedTableRows.length}
                </strong>{' '}
                rows
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="bg-muted/50 border border-border rounded-md px-2 py-0.5 text-xs text-foreground cursor-pointer focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1 rounded-md border border-border hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 text-xs">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1 rounded-md border border-border hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="h-7 px-3.5 border-t border-border bg-card/60 backdrop-blur-sm flex items-center justify-between text-[11px] text-muted-foreground shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0 truncate">
          <span className="font-semibold text-foreground/80">Path:</span>
          {activeHoverPath ? (
            <button
              type="button"
              onClick={() => handleCopyPath(activeHoverPath)}
              className="font-mono text-primary hover:underline truncate cursor-pointer transition-colors"
              title="Click to copy path"
            >
              {activeHoverPath}
            </button>
          ) : (
            <span className="italic text-muted-foreground/70">
              Click any key to copy its JSON path
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {filePath && (
            <span className="font-mono text-[10px] text-muted-foreground/80">
              {filePath}
            </span>
          )}
          <span>{new Blob([content]).size} bytes</span>
        </div>
      </div>

      {/* Floating Toast Notification for Copied Path */}
      {copiedPathToast && (
        <div className="fixed bottom-10 right-6 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground text-background text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            Copied path: <strong className="font-mono">{copiedPathToast}</strong>
          </span>
        </div>
      )}
    </div>
  );
};
