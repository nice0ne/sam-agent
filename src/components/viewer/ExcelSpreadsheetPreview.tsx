import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Table,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  FileSpreadsheet,
  AlertCircle,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { triggerBlobDownload } from '../../services/archive';

export interface ExcelSpreadsheetPreviewProps {
  content: string;
  filePath?: string;
}

interface ParsedWorkbookState {
  workbook: XLSX.WorkBook | null;
  sheetNames: string[];
  rawBytes: Uint8Array;
  error: string | null;
}

/**
 * Decodes content (Base64 data URL, raw Base64 string, or binary char string) into Uint8Array.
 */
function decodeContentToUint8Array(content: string): Uint8Array {
  if (!content) return new Uint8Array(0);

  // 1. Data URL prefix (e.g. data:...;base64,...)
  const dataUrlMatch = content.match(/^data:[^;]+;base64,(.*)$/s);
  if (dataUrlMatch) {
    try {
      const base64Data = dataUrlMatch[1].trim();
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    } catch {
      // Fall through to other strategies
    }
  }

  // 2. Raw Base64 string check (ZIP magic PK.. is UEsDB in Base64; OLE magic is 0M8R4)
  const trimmed = content.trim();
  if (
    trimmed.startsWith('UEsDB') ||
    trimmed.startsWith('0M8R4') ||
    /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)
  ) {
    try {
      const binaryStr = atob(trimmed);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      // Check magic signatures: ZIP (0x50 0x4B) or OLE/BIFF8 XLS (0xD0 0xCF)
      if (
        (bytes[0] === 0x50 && bytes[1] === 0x4b) ||
        (bytes[0] === 0xd0 && bytes[1] === 0xcf)
      ) {
        return bytes;
      }
      // If valid base64 without whitespace and non-empty, use as decoded bytes
      if (bytes.length > 0 && !trimmed.includes(' ')) {
        return bytes;
      }
    } catch {
      // Fall through
    }
  }

  // 3. Binary string fallback (character codes)
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    bytes[i] = content.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export const ExcelSpreadsheetPreview: React.FC<ExcelSpreadsheetPreviewProps> = ({
  content,
  filePath,
}) => {
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [isParsing, setIsParsing] = useState(true);

  // Derived file name
  const fileName = useMemo(() => {
    if (!filePath) return 'spreadsheet.xlsx';
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || 'spreadsheet.xlsx';
  }, [filePath]);

  // Parse workbook from content
  const { workbook, sheetNames, rawBytes, error } = useMemo<ParsedWorkbookState>(() => {
    if (!content || content.trim().length === 0) {
      return {
        workbook: null,
        sheetNames: [],
        rawBytes: new Uint8Array(0),
        error: 'Spreadsheet content is empty.',
      };
    }

    try {
      const bytes = decodeContentToUint8Array(content);
      if (bytes.length === 0) {
        return {
          workbook: null,
          sheetNames: [],
          rawBytes: bytes,
          error: 'Decoded spreadsheet content is empty.',
        };
      }

      const wb = XLSX.read(bytes, { type: 'array' });
      if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
        return {
          workbook: wb,
          sheetNames: [],
          rawBytes: bytes,
          error: 'Workbook contains no readable sheets.',
        };
      }

      return {
        workbook: wb,
        sheetNames: wb.SheetNames,
        rawBytes: bytes,
        error: null,
      };
    } catch (err) {
      return {
        workbook: null,
        sheetNames: [],
        rawBytes: new Uint8Array(0),
        error: err instanceof Error ? err.message : 'Failed to parse Excel file.',
      };
    }
  }, [content]);

  // Handle parsing state and initial active sheet
  useEffect(() => {
    setIsParsing(false);
    if (sheetNames.length > 0) {
      if (!sheetNames.includes(activeSheetName)) {
        setActiveSheetName(sheetNames[0]);
      }
    } else {
      setActiveSheetName('');
    }
  }, [sheetNames, activeSheetName]);

  // Active worksheet reference
  const activeSheet = useMemo(() => {
    if (!workbook || !activeSheetName) return null;
    return workbook.Sheets[activeSheetName] || null;
  }, [workbook, activeSheetName]);

  // Extract tabular data from active sheet
  const { headers, rows } = useMemo(() => {
    if (!activeSheet) {
      return { headers: [], rows: [] };
    }

    const rawData = XLSX.utils.sheet_to_json(activeSheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as any[][];

    if (!rawData || rawData.length === 0) {
      return { headers: [], rows: [] };
    }

    // Determine max columns across all rows
    let maxCols = 0;
    for (const r of rawData) {
      if (Array.isArray(r) && r.length > maxCols) {
        maxCols = r.length;
      }
    }

    if (maxCols === 0) {
      return { headers: [], rows: [] };
    }

    // Row 0 as headers
    const rawHeaders = Array.isArray(rawData[0]) ? rawData[0] : [];
    const derivedHeaders: string[] = [];

    for (let c = 0; c < maxCols; c++) {
      const headerVal = rawHeaders[c];
      if (headerVal !== undefined && headerVal !== null && String(headerVal).trim() !== '') {
        derivedHeaders.push(String(headerVal).trim());
      } else {
        const colLetter = XLSX.utils.encode_col(c);
        derivedHeaders.push(colLetter || `Column ${c + 1}`);
      }
    }

    // Data rows from 1..N
    const rawRows = rawData.slice(1);
    const dataRows: string[][] = [];

    for (const r of rawRows) {
      if (!Array.isArray(r)) continue;
      // Skip row if completely empty
      const hasContent = r.some(
        (cell) => cell !== undefined && cell !== null && String(cell).trim() !== ''
      );
      if (!hasContent) continue;

      const cells: string[] = [];
      for (let c = 0; c < maxCols; c++) {
        const cellVal = r[c];
        cells.push(cellVal !== undefined && cellVal !== null ? String(cellVal) : '');
      }
      dataRows.push(cells);
    }

    return { headers: derivedHeaders, rows: dataRows };
  }, [activeSheet]);

  // Sheet switching handler
  const handleSelectSheet = (sheetName: string) => {
    setActiveSheetName(sheetName);
    setSearchTerm('');
    setSortCol(null);
    setSortDir('asc');
    setCurrentPage(1);
  };

  // Column sort toggle handler (asc -> desc -> unsorted)
  const handleHeaderClick = (colIdx: number) => {
    if (sortCol === colIdx) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortCol(null);
        setSortDir('asc');
      }
    } else {
      setSortCol(colIdx);
      setSortDir('asc');
    }
  };

  // Filter and sort rows
  const filteredAndSortedRows = useMemo(() => {
    let result = rows;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(term))
      );
    }

    if (sortCol !== null && sortCol >= 0) {
      result = [...result].sort((a, b) => {
        const valA = a[sortCol] ?? '';
        const valB = b[sortCol] ?? '';

        if (valA === '' && valB === '') return 0;
        if (valA === '') return 1;
        if (valB === '') return -1;

        const numA = Number(valA);
        const numB = Number(valB);

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDir === 'asc' ? numA - numB : numB - numA;
        }

        return sortDir === 'asc'
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    return result;
  }, [rows, searchTerm, sortCol, sortDir]);

  // Pagination calculations
  const totalRows = filteredAndSortedRows.length;
  const totalPages =
    pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalRows / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRows = useMemo(() => {
    if (pageSize === 'all') return filteredAndSortedRows;
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, safeCurrentPage, pageSize]);

  // Export active sheet to CSV
  const handleExportCsv = () => {
    if (!activeSheet) return;
    try {
      const csvData = XLSX.utils.sheet_to_csv(activeSheet);
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const baseName = fileName.replace(/\.[^/.]+$/, '');
      const sanitizedSheet = (activeSheetName || 'Sheet').replace(/[^a-zA-Z0-9_-]/g, '_');
      triggerBlobDownload(blob, `${baseName}_${sanitizedSheet}.csv`);
    } catch (err) {
      console.error('Failed to export sheet to CSV:', err);
    }
  };

  // Download original Excel workbook
  const handleDownloadExcel = () => {
    if (rawBytes.length > 0) {
      const blob = new Blob([rawBytes as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      triggerBlobDownload(blob, fileName);
    } else if (workbook) {
      try {
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout as any], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        triggerBlobDownload(blob, fileName);
      } catch (err) {
        console.error('Failed to export workbook:', err);
      }
    }
  };

  // Loading state
  if (isParsing) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-card text-muted-foreground">
        <LoaderCircle className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm font-medium text-foreground">Loading Spreadsheet</p>
        <p className="text-xs mt-1">Parsing workbook structure and sheets...</p>
      </div>
    );
  }

  // Error state
  if (error || !workbook || sheetNames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-card text-muted-foreground">
        <div className="size-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 text-amber-500">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          Unable to Preview Spreadsheet
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mb-6 leading-relaxed">
          {error || 'This spreadsheet file could not be decoded or contains no readable sheets.'}
        </p>
        {(rawBytes.length > 0 || content.length > 0) && (
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download Original File
          </button>
        )}
      </div>
    );
  }

  const startRowIndex =
    totalRows === 0
      ? 0
      : pageSize === 'all'
      ? 1
      : (safeCurrentPage - 1) * pageSize + 1;
  const endRowIndex =
    pageSize === 'all'
      ? totalRows
      : Math.min(safeCurrentPage * pageSize, totalRows);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card text-foreground">
      {/* Top Header & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-xs shrink-0">
        {/* File information and summary stats */}
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate max-w-[220px]" title={fileName}>
              {fileName}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">
              {sheetNames.length} sheet{sheetNames.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">
              {rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">
              {headers.length} col{headers.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!activeSheet}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            title={`Export active sheet "${activeSheetName}" as CSV`}
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Export Sheet to CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
            title="Download original Excel workbook"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Excel</span>
          </button>
        </div>
      </div>

      {/* Multi-Sheet Navigation Tabs */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-muted/30 overflow-x-auto shrink-0 scrollbar-thin">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-2 shrink-0 select-none">
          <Table className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Sheets ({sheetNames.length}):</span>
        </div>

        {sheetNames.map((sheetName) => {
          const isActive = sheetName === activeSheetName;
          return (
            <button
              key={sheetName}
              type="button"
              onClick={() => handleSelectSheet(sheetName)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/70'
              }`}
            >
              <Table className={`w-3 h-3 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              <span className="truncate max-w-[160px]">{sheetName}</span>
            </button>
          );
        })}
      </div>

      {/* Filter and Grid Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
        {/* Search Filter */}
        <div className="relative w-72 max-w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={`Search in "${activeSheetName}"...`}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-muted/40 hover:bg-muted/70 focus:bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Row count and page size selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] text-muted-foreground">
            {searchTerm.trim() ? (
              <>
                Matched <strong className="text-foreground">{totalRows}</strong> of{' '}
                <strong className="text-foreground">{rows.length}</strong> rows
              </>
            ) : (
              <>
                Total <strong className="text-foreground">{rows.length}</strong> rows
              </>
            )}
          </span>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <label htmlFor="excel-page-size" className="text-[11px]">
              Rows per page:
            </label>
            <select
              id="excel-page-size"
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value;
                setPageSize(val === 'all' ? 'all' : Number(val));
                setCurrentPage(1);
              }}
              className="bg-muted/60 border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Sheet Data Grid */}
      <div className="flex-1 overflow-auto bg-card relative">
        {headers.length === 0 && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
            <Table className="w-10 h-10 stroke-1 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-foreground">Worksheet is Empty</p>
            <p className="text-xs mt-1">"{activeSheetName}" does not contain any rows or columns.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/90 backdrop-blur-md sticky top-0 z-10 border-b border-border select-none shadow-2xs">
              <tr>
                {/* Row number column header */}
                <th className="w-12 px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase text-center border-r border-border/50 sticky left-0 bg-muted/95 z-20">
                  #
                </th>

                {/* Column headers with sorting */}
                {headers.map((h, i) => {
                  const isSorted = sortCol === i;
                  return (
                    <th
                      key={i}
                      onClick={() => handleHeaderClick(i)}
                      className="px-4 py-2.5 font-semibold text-foreground border-r border-border/40 last:border-r-0 hover:bg-muted cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate" title={h}>
                          {h}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {isSorted ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-primary" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />
                          )}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-border/50">
              {paginatedRows.length > 0 ? (
                paginatedRows.map((row, rIdx) => {
                  const absoluteIndex =
                    (safeCurrentPage - 1) * (pageSize === 'all' ? 0 : pageSize) + rIdx + 1;
                  return (
                    <tr
                      key={rIdx}
                      className="hover:bg-muted/40 transition-colors group"
                    >
                      {/* Row Index */}
                      <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground/60 text-center select-none bg-muted/15 border-r border-border/40 sticky left-0 group-hover:bg-muted/30">
                        {absoluteIndex}
                      </td>

                      {/* Cell Values */}
                      {headers.map((_, cIdx) => {
                        const cellVal = row[cIdx] !== undefined ? row[cIdx] : '';
                        return (
                          <td
                            key={cIdx}
                            className="px-4 py-2 text-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis max-w-sm border-r border-border/40 last:border-r-0 font-sans"
                            title={cellVal}
                          >
                            {cellVal}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={headers.length + 1}
                    className="py-16 text-center text-xs text-muted-foreground italic"
                  >
                    {searchTerm.trim() ? (
                      <div className="flex flex-col items-center gap-2">
                        <span>No rows match the search query "{searchTerm}".</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm('');
                            setCurrentPage(1);
                          }}
                          className="text-xs text-primary hover:underline cursor-pointer"
                        >
                          Clear search filter
                        </button>
                      </div>
                    ) : (
                      <span>This sheet contains no data rows.</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {pageSize !== 'all' && totalRows > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border bg-card/90 backdrop-blur-xs shrink-0 select-none">
          <div className="text-[11px] text-muted-foreground">
            Showing <strong className="text-foreground">{startRowIndex}</strong> -{' '}
            <strong className="text-foreground">{endRowIndex}</strong> of{' '}
            <strong className="text-foreground">{totalRows}</strong> rows
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-medium px-2 py-0.5 text-foreground">
              Page {safeCurrentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
