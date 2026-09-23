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
  Sparkles,
  CheckCheck,
  Wrench,
} from 'lucide-react';
import { triggerBlobDownload } from '../../services/archive';
import { saveVfsFile } from '../../services/vfs';
import { parseMarkdownTableToAoA } from '../../services/excel-generator';

export interface ExcelSpreadsheetPreviewProps {
  content: string;
  filePath?: string;
}

interface ParsedWorkbookState {
  workbook: XLSX.WorkBook | null;
  sheetNames: string[];
  rawBytes: Uint8Array;
  error: string | null;
  isRecovered: boolean;
  recoveredFrom: string | null;
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

/**
 * Multi-strategy parser that parses valid binary XLSX/XLS or recovers
 * Markdown tables, JSON arrays, CSV/TSV, and HTML tables seamlessly.
 */
function parseWorkbookWithRecovery(content: string): ParsedWorkbookState {
  if (!content || content.trim().length === 0) {
    return {
      workbook: null,
      sheetNames: [],
      rawBytes: new Uint8Array(0),
      error: 'Spreadsheet content is empty.',
      isRecovered: false,
      recoveredFrom: null,
    };
  }

  const trimmed = content.trim();

  // Strategy 1: Binary XLSX / XLS (Base64 data URL or raw binary bytes)
  const isDataUrl = trimmed.startsWith('data:');
  const isBase64Zip = trimmed.startsWith('UEsDB') || trimmed.startsWith('0M8R4');
  if (isDataUrl || isBase64Zip) {
    try {
      const bytes = decodeContentToUint8Array(content);
      if (bytes.length > 0) {
        const wb = XLSX.read(bytes, { type: 'array' });
        if (wb && wb.SheetNames && wb.SheetNames.length > 0) {
          return {
            workbook: wb,
            sheetNames: wb.SheetNames,
            rawBytes: bytes,
            error: null,
            isRecovered: false,
            recoveredFrom: null,
          };
        }
      }
    } catch {
      // Fall through to text recovery strategies
    }
  }

  // Strategy 2: Markdown Table Recovery (e.g. LLM wrote Markdown table into .xlsx file)
  if (trimmed.includes('|') && /\|.*\|/.test(trimmed)) {
    try {
      const aoa = parseMarkdownTableToAoA(trimmed);
      if (aoa.length > 0) {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data Tabel');
        return {
          workbook: wb,
          sheetNames: ['Data Tabel'],
          rawBytes: new Uint8Array(0),
          error: null,
          isRecovered: true,
          recoveredFrom: 'Markdown Table',
        };
      }
    } catch {
      // Fall through
    }
  }

  // Strategy 3: JSON Array of Objects Recovery
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const ws = XLSX.utils.json_to_sheet(parsed);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data JSON');
        return {
          workbook: wb,
          sheetNames: ['Data JSON'],
          rawBytes: new Uint8Array(0),
          error: null,
          isRecovered: true,
          recoveredFrom: 'JSON Array',
        };
      } else if (typeof parsed === 'object' && parsed !== null) {
        const wb = XLSX.utils.book_new();
        let sheetCount = 0;
        for (const [key, val] of Object.entries(parsed)) {
          if (Array.isArray(val) && val.length > 0) {
            const safeSheetName = key.replace(/[*?:/\\\[\]]/g, '_').slice(0, 31) || `Sheet${sheetCount + 1}`;
            const ws = XLSX.utils.json_to_sheet(val);
            XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
            sheetCount++;
          }
        }
        if (sheetCount > 0) {
          return {
            workbook: wb,
            sheetNames: wb.SheetNames,
            rawBytes: new Uint8Array(0),
            error: null,
            isRecovered: true,
            recoveredFrom: 'JSON Object',
          };
        }
      }
    } catch {
      // Fall through
    }
  }

  // Strategy 4: CSV / TSV / Delimited String
  if (trimmed.includes(',') || trimmed.includes('\t') || trimmed.includes(';')) {
    try {
      const wb = XLSX.read(trimmed, { type: 'string' });
      if (wb && wb.SheetNames && wb.SheetNames.length > 0) {
        return {
          workbook: wb,
          sheetNames: wb.SheetNames,
          rawBytes: new Uint8Array(0),
          error: null,
          isRecovered: true,
          recoveredFrom: trimmed.includes('\t') ? 'TSV' : 'CSV',
        };
      }
    } catch {
      // Fall through
    }
  }

  // Strategy 5: HTML Table
  if (trimmed.toLowerCase().includes('<table') && trimmed.toLowerCase().includes('</table>')) {
    try {
      const wb = XLSX.read(trimmed, { type: 'string' });
      if (wb && wb.SheetNames && wb.SheetNames.length > 0) {
        return {
          workbook: wb,
          sheetNames: wb.SheetNames,
          rawBytes: new Uint8Array(0),
          error: null,
          isRecovered: true,
          recoveredFrom: 'HTML Table',
        };
      }
    } catch {
      // Fall through
    }
  }

  // Strategy 6: Binary fallback via decodeContentToUint8Array
  try {
    const bytes = decodeContentToUint8Array(content);
    if (bytes.length > 0) {
      const wb = XLSX.read(bytes, { type: 'array' });
      if (wb && wb.SheetNames && wb.SheetNames.length > 0) {
        return {
          workbook: wb,
          sheetNames: wb.SheetNames,
          rawBytes: bytes,
          error: null,
          isRecovered: false,
          recoveredFrom: null,
        };
      }
    }
  } catch (err) {
    return {
      workbook: null,
      sheetNames: [],
      rawBytes: new Uint8Array(0),
      error: err instanceof Error ? err.message : 'Failed to parse Excel file.',
      isRecovered: false,
      recoveredFrom: null,
    };
  }

  return {
    workbook: null,
    sheetNames: [],
    rawBytes: new Uint8Array(0),
    error: 'Format berkas tidak dikenali sebagai Excel, CSV, JSON, atau tabel Markdown.',
    isRecovered: false,
    recoveredFrom: null,
  };
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
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairedSuccess, setRepairedSuccess] = useState(false);

  // Derived file name
  const fileName = useMemo(() => {
    if (!filePath) return 'spreadsheet.xlsx';
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || 'spreadsheet.xlsx';
  }, [filePath]);

  // Parse workbook from content using multi-strategy recovery
  const { workbook, sheetNames, rawBytes, error, isRecovered, recoveredFrom } = useMemo<ParsedWorkbookState>(() => {
    return parseWorkbookWithRecovery(content);
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

  // Download Excel workbook (guaranteed valid binary XLSX)
  const handleDownloadExcel = () => {
    if (workbook) {
      try {
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
        const blob = new Blob([wbout as any], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const safeDownloadName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
        triggerBlobDownload(blob, safeDownloadName);
        return;
      } catch (err) {
        console.error('Failed to export workbook:', err);
      }
    }

    if (rawBytes.length > 0) {
      const blob = new Blob([rawBytes as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      triggerBlobDownload(blob, fileName);
    }
  };

  // One-click repair: normalize recovered text-based spreadsheet to native binary XLSX in VFS
  const handleRepairAndSaveToVfs = async () => {
    if (!workbook || !filePath) return;
    try {
      setIsRepairing(true);
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
      const blob = new Blob([wbout as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const base64Url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const targetPath = filePath.endsWith('.xlsx') ? filePath : `${filePath}.xlsx`;
      await saveVfsFile(
        targetPath,
        base64Url,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      setRepairedSuccess(true);
      setTimeout(() => setRepairedSuccess(false), 4500);
    } catch (err) {
      console.error('Failed to normalize and save native XLSX to VFS:', err);
    } finally {
      setIsRepairing(false);
    }
  };

  // Loading state (forced light theme)
  if (isParsing) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center bg-white text-slate-600 select-none"
        style={{ colorScheme: 'light' }}
      >
        <LoaderCircle className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
        <p className="text-sm font-semibold text-slate-900">Loading Spreadsheet</p>
        <p className="text-xs text-slate-500 mt-1">Parsing workbook structure and sheets...</p>
      </div>
    );
  }

  // Error state (forced light theme)
  if (error || !workbook || sheetNames.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-8 text-center bg-white text-slate-600 select-none"
        style={{ colorScheme: 'light' }}
      >
        <div className="size-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-4 text-amber-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">
          Unable to Preview Spreadsheet
        </h3>
        <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
          {error || 'This spreadsheet file could not be decoded or contains no readable sheets.'}
        </p>
        {(rawBytes.length > 0 || content.length > 0) && (
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
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
    <div
      className="flex flex-col h-full w-full overflow-hidden bg-white text-slate-900 select-text font-sans"
      style={{ colorScheme: 'light' }}
    >
      {/* Top Header & Toolbar (Always clean light Excel theme) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        {/* File information and summary stats */}
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-900 truncate max-w-[220px]" title={fileName}>
              {fileName}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {sheetNames.length} sheet{sheetNames.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              {headers.length} col{headers.length === 1 ? '' : 's'}
            </span>
            {isRecovered && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/80">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Auto-Recovered ({recoveredFrom})</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {isRecovered && filePath && (
            <button
              type="button"
              onClick={handleRepairAndSaveToVfs}
              disabled={isRepairing || repairedSuccess}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer shadow-2xs ${
                repairedSuccess
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
              }`}
              title="Konversi dan simpan berkas ini menjadi file OpenXML binary .xlsx asli di VFS"
            >
              {repairedSuccess ? (
                <>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Tersimpan Sebagai .xlsx Asli!</span>
                </>
              ) : isRepairing ? (
                <>
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  <span>Menyimpan .xlsx...</span>
                </>
              ) : (
                <>
                  <Wrench className="w-3.5 h-3.5 text-amber-600" />
                  <span>Normalisasi ke .xlsx Asli</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!activeSheet}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200/80 text-slate-800 border border-slate-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            title={`Export active sheet "${activeSheetName}" as CSV`}
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export Sheet to CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer shadow-2xs"
            title="Download valid Microsoft Excel workbook (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-white" />
            <span>Download Excel</span>
          </button>
        </div>
      </div>

      {/* Auto-Recovery Notice Banner */}
      {isRecovered && !repairedSuccess && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50/80 border-b border-amber-200/70 text-amber-900 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Spreadsheet Otomatis Dipulihkan:</strong> Berkas ini awalnya berupa teks ({recoveredFrom}) tetapi disimpan dengan nama <code>{fileName}</code>. SAM-Agent telah mengonversi dan me-rendernya ke grid Excel secara rapi.
            </span>
          </div>
          {filePath && (
            <button
              type="button"
              onClick={handleRepairAndSaveToVfs}
              disabled={isRepairing}
              className="text-xs font-semibold underline text-amber-800 hover:text-amber-950 shrink-0 cursor-pointer"
            >
              Simpan permanen sebagai .xlsx asli
            </button>
          )}
        </div>
      )}

      {/* Multi-Sheet Navigation Tabs (Excel Sheet Bar) */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-200 bg-slate-50 overflow-x-auto shrink-0 scrollbar-thin">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-2 shrink-0 select-none">
          <Table className="w-3.5 h-3.5 text-slate-400" />
          <span>Sheets ({sheetNames.length}):</span>
        </div>

        {sheetNames.map((sheetName) => {
          const isActive = sheetName === activeSheetName;
          return (
            <button
              key={sheetName}
              type="button"
              onClick={() => handleSelectSheet(sheetName)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border ${
                isActive
                  ? 'bg-white text-emerald-700 border-emerald-500 shadow-xs font-semibold ring-1 ring-emerald-500/20'
                  : 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <Table className={`w-3 h-3 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="truncate max-w-[160px]">{sheetName}</span>
            </button>
          );
        })}
      </div>

      {/* Filter and Grid Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        {/* Search Filter */}
        <div className="relative w-72 max-w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={`Search in "${activeSheetName}"...`}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Row count and page size selector */}
        <div className="flex items-center gap-3 flex-wrap select-none">
          <span className="text-[11px] text-slate-600">
            {searchTerm.trim() ? (
              <>
                Matched <strong className="text-slate-900 font-semibold">{totalRows}</strong> of{' '}
                <strong className="text-slate-900 font-semibold">{rows.length}</strong> rows
              </>
            ) : (
              <>
                Total <strong className="text-slate-900 font-semibold">{rows.length}</strong> rows
              </>
            )}
          </span>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
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
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 cursor-pointer"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Sheet Data Grid (Pure White Spreadsheet Grid) */}
      <div className="flex-1 overflow-auto bg-white relative">
        {headers.length === 0 && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500 select-none">
            <Table className="w-10 h-10 stroke-1 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-800">Worksheet is Empty</p>
            <p className="text-xs mt-1 text-slate-500">"{activeSheetName}" does not contain any rows or columns.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-300 select-none shadow-xs">
              <tr>
                {/* Row number column header */}
                <th className="w-12 px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase text-center border-r border-slate-300 sticky left-0 bg-slate-100 z-20">
                  #
                </th>

                {/* Column headers with sorting */}
                {headers.map((h, i) => {
                  const isSorted = sortCol === i;
                  return (
                    <th
                      key={i}
                      onClick={() => handleHeaderClick(i)}
                      className="px-4 py-2.5 font-semibold text-slate-800 border-r border-slate-300 last:border-r-0 hover:bg-slate-200/80 cursor-pointer transition-colors group select-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate" title={h}>
                          {h}
                        </span>
                        <span className="shrink-0 text-slate-400">
                          {isSorted ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
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

            <tbody className="divide-y divide-slate-200 bg-white">
              {paginatedRows.length > 0 ? (
                paginatedRows.map((row, rIdx) => {
                  const absoluteIndex =
                    (safeCurrentPage - 1) * (pageSize === 'all' ? 0 : pageSize) + rIdx + 1;
                  return (
                    <tr
                      key={rIdx}
                      className="hover:bg-emerald-50/50 transition-colors group bg-white"
                    >
                      {/* Row Index */}
                      <td className="px-3 py-2 text-[11px] font-mono text-slate-400 text-center select-none bg-slate-50 border-r border-slate-300 sticky left-0 group-hover:bg-emerald-100/50">
                        {absoluteIndex}
                      </td>

                      {/* Cell Values */}
                      {headers.map((_, cIdx) => {
                        const cellVal = row[cIdx] !== undefined ? row[cIdx] : '';
                        return (
                          <td
                            key={cIdx}
                            className="px-4 py-2 text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis max-w-sm border-r border-slate-200 last:border-r-0 font-sans"
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
                    className="py-16 text-center text-xs text-slate-500 italic bg-white"
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
                          className="text-xs text-emerald-600 hover:underline cursor-pointer font-medium"
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
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-slate-200 bg-white shrink-0 select-none">
          <div className="text-[11px] text-slate-600">
            Showing <strong className="text-slate-900 font-semibold">{startRowIndex}</strong> -{' '}
            <strong className="text-slate-900 font-semibold">{endRowIndex}</strong> of{' '}
            <strong className="text-slate-900 font-semibold">{totalRows}</strong> rows
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              className="p-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer border border-slate-200"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-medium px-2 py-0.5 text-slate-800 bg-slate-50 rounded border border-slate-200">
              Page {safeCurrentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="p-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer border border-slate-200"
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
