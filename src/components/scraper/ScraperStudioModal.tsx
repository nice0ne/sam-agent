import React, { useState, useMemo } from 'react';
import {
  X,
  Table,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  Search,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ExternalLink,
  Globe,
  FileText,
  Loader2,
  Sparkles,
  Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { generateExcelWorkbook, generateExcelBlob } from '../../services/excel-generator';

export interface ScraperStudioData {
  rows: Record<string, any>[];
  totalRows?: number;
  pagesCrawled?: number;
  domain?: string;
  url?: string;
  schema?: any;
}

export interface ScraperStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  data?: ScraperStudioData | null;
  rows?: Record<string, any>[];
  totalRows?: number;
  pagesCrawled?: number;
  domain?: string;
  url?: string;
  onLaunchScraper?: () => void;
}

export const ScraperStudioModal: React.FC<ScraperStudioModalProps> = ({
  isOpen,
  onClose,
  data,
  rows: propsRows,
  totalRows: propsTotalRows,
  pagesCrawled: propsPagesCrawled,
  domain: propsDomain,
  url: propsUrl,
  onLaunchScraper,
}) => {
  // Support loading demo sample data if user opened an empty studio
  const [demoRows, setDemoRows] = useState<Record<string, any>[] | null>(null);

  // Aggregate effective values
  const effectiveRows = useMemo(() => {
    if (demoRows && (!data?.rows || data.rows.length === 0) && (!propsRows || propsRows.length === 0)) {
      return demoRows;
    }
    return data?.rows || propsRows || [];
  }, [data?.rows, propsRows, demoRows]);

  const effectiveTotalRows = data?.totalRows ?? propsTotalRows ?? effectiveRows.length;
  const effectivePagesCrawled = data?.pagesCrawled ?? propsPagesCrawled ?? 1;
  const effectiveUrl = data?.url || propsUrl || '';
  const effectiveDomain = useMemo(() => {
    if (data?.domain || propsDomain) {
      return (data?.domain || propsDomain || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    if (effectiveUrl) {
      try {
        const u = new URL(effectiveUrl);
        return u.hostname.replace(/^www\./, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      } catch {
        // Fallback
      }
    }
    return 'web';
  }, [data?.domain, propsDomain, effectiveUrl]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Actions loading & status states
  const [isOpeningExcelStudio, setIsOpeningExcelStudio] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleLoadDemoData = () => {
    setDemoRows([
      {
        Rank: 1,
        Title: 'Artificial Intelligence - An Overview',
        Category: 'Technology',
        URL: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
        Views: '4,820,100',
      },
      {
        Rank: 2,
        Title: 'Machine Learning Fundamentals & Models',
        Category: 'Data Science',
        URL: 'https://en.wikipedia.org/wiki/Machine_learning',
        Views: '3,150,420',
      },
      {
        Rank: 3,
        Title: 'Deep Learning & Neural Architectures',
        Category: 'Deep Learning',
        URL: 'https://en.wikipedia.org/wiki/Deep_learning',
        Views: '2,940,800',
      },
      {
        Rank: 4,
        Title: 'Natural Language Processing and LLMs',
        Category: 'AI Research',
        URL: 'https://en.wikipedia.org/wiki/Natural_language_processing',
        Views: '2,110,650',
      },
      {
        Rank: 5,
        Title: 'Autonomous Agents & Multi-Agent Systems',
        Category: 'Robotics & Agents',
        URL: 'https://en.wikipedia.org/wiki/Intelligent_agent',
        Views: '1,780,200',
      },
    ]);
  };

  // Derive all unique column keys
  const columns = useMemo(() => {
    if (!effectiveRows || effectiveRows.length === 0) return [];
    const colSet = new Set<string>();

    // If schema fields exist, preserve their declared order
    if (data?.schema?.fields && Array.isArray(data.schema.fields)) {
      data.schema.fields.forEach((f: any) => {
        if (f.name) colSet.add(f.name);
      });
    }

    effectiveRows.forEach((r) => {
      if (r && typeof r === 'object') {
        Object.keys(r).forEach((k) => colSet.add(k));
      }
    });

    return Array.from(colSet);
  }, [effectiveRows, data?.schema]);

  // Filtered and sorted rows
  const filteredAndSortedRows = useMemo(() => {
    let result = [...effectiveRows];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((row) => {
        return Object.values(row).some((val) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // Column sorting
    if (sortKey) {
      result.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        return sortOrder === 'asc'
          ? strA.localeCompare(strB, undefined, { numeric: true })
          : strB.localeCompare(strA, undefined, { numeric: true });
      });
    }

    return result;
  }, [effectiveRows, searchQuery, sortKey, sortOrder]);

  // Paginated slice
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, currentPage, pageSize]);

  // Reset page when filter changes
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleSort = (col: string) => {
    if (sortKey === col) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortKey(null);
        setSortOrder('asc');
      }
    } else {
      setSortKey(col);
      setSortOrder('asc');
    }
  };

  // Base filename helper
  const getBaseName = () => {
    const timestamp = Date.now();
    return `scraped_${effectiveDomain}_${timestamp}`;
  };

  // Action: Open in Excel Studio
  const handleOpenInExcelStudio = async () => {
    if (effectiveRows.length === 0) return;
    setIsOpeningExcelStudio(true);
    setStatusMessage(null);

    try {
      const baseName = getBaseName();
      const spec = {
        title: baseName,
        sheetName: 'Scraped Data',
        data: effectiveRows,
      };

      const res = await generateExcelWorkbook(spec, baseName);

      // Open in built-in Excel previewer
      const viewerUrl =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL(`viewer.html?path=${encodeURIComponent(res.xlsxPath)}`)
          : `viewer.html?path=${encodeURIComponent(res.xlsxPath)}`;

      if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
        await chrome.tabs.create({ url: viewerUrl, active: true });
      } else {
        window.open(viewerUrl, '_blank');
      }

      setStatusMessage(`Saved to ${res.xlsxPath} and opened in Excel Studio.`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('[ScraperStudioModal] Failed to open Excel Studio:', err);
      setStatusMessage(`Failed to generate Excel: ${err?.message || String(err)}`);
    } finally {
      setIsOpeningExcelStudio(false);
    }
  };

  // Action: Download .xlsx
  const handleDownloadXlsx = async () => {
    if (effectiveRows.length === 0) return;
    try {
      const baseName = getBaseName();
      const blob = await generateExcelBlob({
        title: baseName,
        sheetName: 'Scraped Data',
        data: effectiveRows,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('[ScraperStudioModal] Failed to download .xlsx:', err);
    }
  };

  // Action: Download .csv
  const handleDownloadCsv = () => {
    if (effectiveRows.length === 0) return;
    try {
      const baseName = getBaseName();
      const ws = XLSX.utils.json_to_sheet(effectiveRows);
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('[ScraperStudioModal] Failed to download .csv:', err);
    }
  };

  // Action: Copy JSON
  const handleCopyJson = async () => {
    if (effectiveRows.length === 0) return;
    try {
      const jsonText = JSON.stringify(effectiveRows, null, 2);
      await navigator.clipboard.writeText(jsonText);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch (err) {
      console.error('[ScraperStudioModal] Failed to copy JSON:', err);
    }
  };

  // Render cell helper
  const renderCellContent = (value: any, colName: string) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-muted-foreground/50 italic select-none">—</span>;
    }

    if (typeof value === 'boolean') {
      return (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
            value ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
          }`}
        >
          {String(value)}
        </span>
      );
    }

    const strVal = String(value);

    // If it's a URL
    if (strVal.startsWith('http://') || strVal.startsWith('https://')) {
      const isImg =
        colName.toLowerCase().includes('image') ||
        colName.toLowerCase().includes('img') ||
        colName.toLowerCase().includes('photo') ||
        colName.toLowerCase().includes('src') ||
        /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(strVal);

      if (isImg) {
        return (
          <div className="flex items-center gap-2">
            <img
              src={strVal}
              alt=""
              className="size-6 object-cover rounded border border-border/80 shrink-0 bg-muted/40"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <a
              href={strVal}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline truncate max-w-[200px] flex items-center gap-1 text-[11px]"
              title={strVal}
            >
              <span className="truncate">{strVal}</span>
              <ExternalLink className="size-2.5 shrink-0 opacity-70" />
            </a>
          </div>
        );
      }

      return (
        <a
          href={strVal}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline truncate max-w-[240px] inline-flex items-center gap-1 text-[11px]"
          title={strVal}
        >
          <span className="truncate">{strVal}</span>
          <ExternalLink className="size-2.5 shrink-0 opacity-70" />
        </a>
      );
    }

    if (typeof value === 'number') {
      return <span className="font-mono text-foreground">{value.toLocaleString()}</span>;
    }

    return (
      <span className="truncate max-w-[260px] inline-block" title={strVal}>
        {strVal}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs select-none">
      <div className="w-full max-w-5xl rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border/60 shrink-0">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
              <Table className="size-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <span>Visual Web Scraper Studio</span>
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[11px] font-medium flex items-center gap-1">
                    <Sparkles className="size-3" />
                    {effectiveTotalRows} {effectiveTotalRows === 1 ? 'row' : 'rows'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[11px] font-medium flex items-center gap-1">
                    <Layers className="size-3" />
                    {effectivePagesCrawled} {effectivePagesCrawled === 1 ? 'page' : 'pages'} crawled
                  </span>
                </div>
              </div>

              {/* Target URL */}
              {effectiveUrl && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate max-w-xl">
                  <Globe className="size-3.5 shrink-0 opacity-70" />
                  <span className="font-medium text-foreground/80 shrink-0">Target:</span>
                  <a
                    href={effectiveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:text-primary transition-colors inline-flex items-center gap-1 underline-offset-2 hover:underline"
                    title={effectiveUrl}
                  >
                    <span className="truncate">{effectiveUrl}</span>
                    <ExternalLink className="size-3 shrink-0 opacity-70" />
                  </a>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Toolbar: Search, Sorting Info & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Filter extracted records..."
              className="w-full bg-background pl-8 pr-8 py-1.5 rounded-lg border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all select-text"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Copy JSON */}
            <button
              type="button"
              onClick={handleCopyJson}
              disabled={effectiveRows.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/60 text-xs font-medium text-foreground transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs active:scale-95"
              title="Copy all extracted records as JSON to clipboard"
            >
              {copiedJson ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5 text-muted-foreground" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>

            {/* Download CSV */}
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={effectiveRows.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/60 text-xs font-medium text-foreground transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs active:scale-95"
              title="Download CSV spreadsheet"
            >
              <FileText className="size-3.5 text-muted-foreground" />
              <span>Download .csv</span>
            </button>

            {/* Download XLSX */}
            <button
              type="button"
              onClick={handleDownloadXlsx}
              disabled={effectiveRows.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/60 text-xs font-medium text-foreground transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs active:scale-95"
              title="Download Microsoft Excel spreadsheet"
            >
              <Download className="size-3.5 text-muted-foreground" />
              <span>Download .xlsx</span>
            </button>

            {/* Open in Excel Studio */}
            <button
              type="button"
              onClick={handleOpenInExcelStudio}
              disabled={effectiveRows.length === 0 || isOpeningExcelStudio}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-95"
              title="Persist to VFS and open live interactive spreadsheet viewer"
            >
              {isOpeningExcelStudio ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-3.5" />
              )}
              <span>Open in Excel Studio</span>
            </button>
          </div>
        </div>

        {/* Status Message Notice */}
        {statusMessage && (
          <div className="px-3 py-2 rounded-xl border border-primary/20 bg-primary/10 text-xs text-primary flex items-center justify-between shrink-0 animate-in fade-in">
            <span>{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-primary/70 hover:text-primary cursor-pointer"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        {/* Live Data Table Preview */}
        <div className="flex-1 overflow-auto rounded-xl border border-border bg-card min-h-[240px] max-h-[50vh] relative select-text">
          {effectiveRows.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="size-12 rounded-2xl bg-muted/60 border border-border/80 flex items-center justify-center text-muted-foreground/80">
                <Table className="size-6 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Belum Ada Data Ekstraksi</p>
                <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                  Tabel ini masih kosong. Buka halaman web lalu jalankan <strong>Visual Scraper</strong> untuk mengekstrak data otomatis, atau muat Data Sampel untuk mencoba fitur Studio.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleLoadDemoData}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-xs font-medium cursor-pointer shadow-sm transition-all"
                >
                  Muat Data Sampel (Demo)
                </button>
                {onLaunchScraper && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLaunchScraper();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <Sparkles className="size-3.5" />
                    Mulai Visual Scraper
                  </button>
                )}
              </div>
            </div>
          ) : filteredAndSortedRows.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-2">
              <Search className="size-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground font-medium">
                No records matching &quot;{searchQuery}&quot;
              </p>
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                Clear search filter
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur-md z-10 border-b border-border text-muted-foreground select-none">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-[11px] w-12 text-center border-r border-border/50">
                    #
                  </th>
                  {columns.map((col) => {
                    const isSorted = sortKey === col;
                    return (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className="py-2.5 px-3 font-semibold text-[11px] hover:text-foreground cursor-pointer transition-colors border-r border-border/50 last:border-r-0 whitespace-nowrap"
                        title={`Click to sort by ${col}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="capitalize">{col}</span>
                          <span className="text-muted-foreground/60">
                            {isSorted ? (
                              sortOrder === 'asc' ? (
                                <ChevronUp className="size-3 text-primary" />
                              ) : (
                                <ChevronDown className="size-3 text-primary" />
                              )
                            ) : (
                              <ArrowUpDown className="size-2.5 opacity-50" />
                            )}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedRows.map((row, rowIdx) => {
                  const globalIdx = (currentPage - 1) * pageSize + rowIdx + 1;
                  return (
                    <tr
                      key={rowIdx}
                      className="hover:bg-muted/40 transition-colors odd:bg-card even:bg-muted/15"
                    >
                      <td className="py-2 px-3 text-muted-foreground/70 font-mono text-[10px] text-center border-r border-border/40 select-none">
                        {globalIdx}
                      </td>
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="py-2 px-3 border-r border-border/40 last:border-r-0 text-foreground"
                        >
                          {renderCellContent(row[col], col)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / Pagination Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60 shrink-0 text-xs text-muted-foreground flex-wrap gap-2">
          <div>
            Showing{' '}
            <span className="font-medium text-foreground">
              {filteredAndSortedRows.length === 0
                ? 0
                : (currentPage - 1) * pageSize + 1}
            </span>
            -
            <span className="font-medium text-foreground">
              {Math.min(currentPage * pageSize, filteredAndSortedRows.length)}
            </span>{' '}
            of{' '}
            <span className="font-medium text-foreground">
              {filteredAndSortedRows.length}
            </span>{' '}
            rows
            {searchQuery && (
              <span className="ml-1 text-muted-foreground/70">
                (filtered from {effectiveRows.length})
              </span>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 select-none">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-md border border-border bg-card hover:bg-muted text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                Previous
              </button>
              <span className="px-2 text-xs font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-md border border-border bg-card hover:bg-muted text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
