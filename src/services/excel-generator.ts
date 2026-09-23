/**
 * Excel Spreadsheet Generator Service for SAM-Agent
 * Generates standards-compliant, multi-sheet Microsoft Excel (.xlsx) workbooks
 * and companion CSV files directly in browser using SheetJS (xlsx).
 *
 * Features:
 * - Full multi-sheet workbook generation with custom sheet names.
 * - Automatic conversion from JSON records, 2D arrays, Markdown tables, or CSV strings.
 * - Intelligent column width auto-calculation (!cols) to prevent clipped text.
 * - Support for typed values (numbers, currencies, dates, booleans, strings).
 * - Automatic summary/total calculation rows.
 * - Binary Base64 VFS persistence and instant browser viewer launching.
 */

import * as XLSX from 'xlsx';
import { saveVfsFile } from './vfs';

export interface ExcelColumnSpec {
  key?: string;
  label?: string;
  title?: string;
  width?: number; // character width
  type?: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'percent';
}

export interface ExcelSheetSpec {
  name?: string;
  title?: string;
  columns?: (string | ExcelColumnSpec)[];
  rows?: (string | number | boolean | null | undefined)[][];
  data?: Record<string, any>[] | (string | number | boolean | null | undefined)[][];
  summaryRow?: boolean | (string | number | null | undefined)[];
}

export interface ExcelWorkbookSpec {
  title?: string;
  filename?: string;
  author?: string;
  sheets?: ExcelSheetSpec[];
  // Shortcut for single-sheet creation:
  sheetName?: string;
  columns?: (string | ExcelColumnSpec)[];
  rows?: (string | number | boolean | null | undefined)[][];
  data?: Record<string, any>[] | (string | number | boolean | null | undefined)[][];
  summaryRow?: boolean | (string | number | null | undefined)[];
  // Raw content fallbacks:
  content?: string;
  markdownTable?: string;
  csv?: string;
}

/**
 * Parses a Markdown table string into a 2D array of trimmed cell strings.
 */
export function parseMarkdownTableToAoA(md: string): string[][] {
  if (!md || typeof md !== 'string') return [];

  const lines = md.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: string[][] = [];

  for (const line of lines) {
    // Skip divider line like |---|:---:|---|
    if (/^\|?(\s*:?-+:?\s*\|?)+$/.test(line)) {
      continue;
    }
    if (!line.includes('|')) continue;

    // Remove leading and trailing pipes
    let content = line;
    if (content.startsWith('|')) content = content.slice(1);
    if (content.endsWith('|')) content = content.slice(0, -1);

    const cells = content.split('|').map((c) => c.trim());
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * Parses CSV or TSV string into a 2D array of strings.
 */
export function parseDelimitedStringToAoA(text: string): string[][] {
  if (!text || typeof text !== 'string') return [];
  try {
    const wb = XLSX.read(text, { type: 'string' });
    const firstSheetName = wb.SheetNames[0];
    if (firstSheetName) {
      const sheet = wb.Sheets[firstSheetName];
      return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];
    }
  } catch {
    // Fallback simple line splitter
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = lines[0]?.includes('\t') ? '\t' : ',';
  return lines.map((line) => line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, '')));
}

/**
 * Normalizes input parameters into a clean ExcelWorkbookSpec.
 */
export function normalizeWorkbookSpec(input: any): ExcelWorkbookSpec {
  if (!input || typeof input !== 'object') {
    return {
      title: 'Spreadsheet',
      sheets: [{ name: 'Sheet1', rows: [['Data Tidak Tersedia']] }],
    };
  }

  const title = input.title || input.filename || input.name || 'Spreadsheet';
  const filename = input.filename || input.fileName || undefined;
  const author = input.author || 'SAM-Agent';

  // 1. If sheets array is already provided and non-empty
  if (Array.isArray(input.sheets) && input.sheets.length > 0) {
    const normalizedSheets: ExcelSheetSpec[] = input.sheets.map((s: any, idx: number) => {
      const sheetName = (s.name || s.title || `Sheet${idx + 1}`)
        .replace(/[*?:/\\\[\]]/g, '_')
        .slice(0, 31);
      return {
        name: sheetName,
        columns: s.columns || s.headers,
        rows: s.rows,
        data: s.data,
        summaryRow: s.summaryRow,
      };
    });

    return { title, filename, author, sheets: normalizedSheets };
  }

  // 2. If markdownTable or content contains a markdown table
  const rawText = input.markdownTable || input.content || input.table || input.markdown;
  if (typeof rawText === 'string' && rawText.includes('|') && /\|.*\|/.test(rawText)) {
    const aoa = parseMarkdownTableToAoA(rawText);
    if (aoa.length > 0) {
      return {
        title,
        filename,
        author,
        sheets: [
          {
            name: (input.sheetName || 'Data').slice(0, 31),
            rows: aoa,
          },
        ],
      };
    }
  }

  // 3. If CSV or TSV string provided
  if (typeof input.csv === 'string' || (typeof rawText === 'string' && rawText.includes(','))) {
    const aoa = parseDelimitedStringToAoA(input.csv || rawText);
    if (aoa.length > 0) {
      return {
        title,
        filename,
        author,
        sheets: [
          {
            name: (input.sheetName || 'Data').slice(0, 31),
            rows: aoa,
          },
        ],
      };
    }
  }

  // 4. Single-sheet shorthand: columns + rows or data
  const sheetName = (input.sheetName || input.sheet || 'Sheet1')
    .replace(/[*?:/\\\[\]]/g, '_')
    .slice(0, 31);

  return {
    title,
    filename,
    author,
    sheets: [
      {
        name: sheetName,
        columns: input.columns || input.headers,
        rows: input.rows,
        data: input.data || input.items || input.records,
        summaryRow: input.summaryRow,
      },
    ],
  };
}

/**
 * Calculates optimal column widths based on maximum content length with padding.
 */
function calculateColumnWidths(aoa: any[][], columnSpecs?: (string | ExcelColumnSpec)[]): XLSX.ColInfo[] {
  if (!aoa || aoa.length === 0) return [];

  const maxCols = Math.max(...aoa.map((row) => (Array.isArray(row) ? row.length : 0)));
  const colWidths: number[] = new Array(maxCols).fill(10);

  // Consider explicit column widths if provided
  if (Array.isArray(columnSpecs)) {
    columnSpecs.forEach((col, idx) => {
      if (typeof col === 'object' && col !== null && typeof col.width === 'number' && col.width > 0) {
        colWidths[idx] = col.width;
      }
    });
  }

  // Measure content lengths
  for (const row of aoa) {
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (val !== undefined && val !== null) {
        const strVal = String(val);
        // Double width estimate for wide Asian characters if any
        let len = 0;
        for (let i = 0; i < strVal.length; i++) {
          len += strVal.charCodeAt(i) > 255 ? 2 : 1;
        }
        if (len + 3 > colWidths[c]) {
          colWidths[c] = Math.min(len + 3, 60); // Cap max auto-width at 60
        }
      }
    }
  }

  return colWidths.map((wch) => ({ wch: Math.max(wch, 10) }));
}

/**
 * Coerces cell values to numbers, dates, or booleans when appropriate.
 */
function normalizeCellValue(val: any): any {
  if (val === undefined || val === null) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (val instanceof Date) return val;

  const str = String(val).trim();
  if (str === '') return '';

  // Check if string represents a pure integer or float
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const num = Number(str);
    if (!isNaN(num) && Number.isFinite(num)) {
      return num;
    }
  }

  // Indonesian / European currency or number formats like "Rp 150.000" or "1.500,50"
  const cleanCurrency = str.replace(/^(Rp|IDR|\$|€|£|¥)\s*/i, '').trim();
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleanCurrency)) {
    const normalized = cleanCurrency.replace(/\./g, '').replace(',', '.');
    const num = Number(normalized);
    if (!isNaN(num)) return num;
  }

  // Check booleans
  if (str.toLowerCase() === 'true') return true;
  if (str.toLowerCase() === 'false') return false;

  return str;
}

/**
 * Builds a SheetJS WorkSheet from a sheet specification.
 */
function buildWorkSheet(sheetSpec: ExcelSheetSpec): XLSX.WorkSheet {
  let aoa: any[][] = [];

  // Case A: data is an array of objects (JSON records)
  if (
    Array.isArray(sheetSpec.data) &&
    sheetSpec.data.length > 0 &&
    typeof sheetSpec.data[0] === 'object' &&
    !Array.isArray(sheetSpec.data[0])
  ) {
    const records = sheetSpec.data as Record<string, any>[];

    // Determine headers
    let headers: string[] = [];
    if (Array.isArray(sheetSpec.columns) && sheetSpec.columns.length > 0) {
      headers = sheetSpec.columns.map((col) => {
        if (typeof col === 'string') return col;
        return col.label || col.title || col.key || '';
      });
    } else {
      headers = Object.keys(records[0]);
    }

    aoa.push(headers);

    for (const rec of records) {
      const row: any[] = [];
      if (Array.isArray(sheetSpec.columns) && sheetSpec.columns.length > 0) {
        for (const col of sheetSpec.columns) {
          const key = typeof col === 'string' ? col : col.key || col.label || '';
          row.push(normalizeCellValue(rec[key]));
        }
      } else {
        for (const key of headers) {
          row.push(normalizeCellValue(rec[key]));
        }
      }
      aoa.push(row);
    }
  }
  // Case B: rows array is provided (2D array)
  else if (Array.isArray(sheetSpec.rows) && sheetSpec.rows.length > 0) {
    // If explicit columns headers exist and first row isn't already the header
    if (Array.isArray(sheetSpec.columns) && sheetSpec.columns.length > 0) {
      const headerRow = sheetSpec.columns.map((c) =>
        typeof c === 'string' ? c : c.label || c.title || c.key || ''
      );
      aoa.push(headerRow);
    }

    for (const r of sheetSpec.rows) {
      if (Array.isArray(r)) {
        aoa.push(r.map(normalizeCellValue));
      }
    }
  }
  // Case C: data array is a 2D array
  else if (Array.isArray(sheetSpec.data) && sheetSpec.data.length > 0 && Array.isArray(sheetSpec.data[0])) {
    if (Array.isArray(sheetSpec.columns) && sheetSpec.columns.length > 0) {
      const headerRow = sheetSpec.columns.map((c) =>
        typeof c === 'string' ? c : c.label || c.title || c.key || ''
      );
      aoa.push(headerRow);
    }
    for (const r of sheetSpec.data as any[][]) {
      if (Array.isArray(r)) {
        aoa.push(r.map(normalizeCellValue));
      }
    }
  } else {
    // Fallback: simple message sheet
    aoa = [['Informasi'], ['Tidak ada data tabel yang diberikan.']];
  }

  // Handle optional summary/total row
  if (sheetSpec.summaryRow && aoa.length > 1) {
    if (Array.isArray(sheetSpec.summaryRow)) {
      aoa.push(sheetSpec.summaryRow.map(normalizeCellValue));
    } else {
      // Auto-compute SUM for numeric columns
      const numCols = Math.max(...aoa.map((r) => r.length));
      const summaryRow: any[] = new Array(numCols).fill('');
      summaryRow[0] = 'Total';

      for (let c = 1; c < numCols; c++) {
        let sum = 0;
        let hasNumeric = false;
        // Examine data rows (row 1 to N-1)
        for (let r = 1; r < aoa.length; r++) {
          const val = aoa[r][c];
          if (typeof val === 'number' && !isNaN(val)) {
            sum += val;
            hasNumeric = true;
          }
        }
        if (hasNumeric) {
          summaryRow[c] = Math.round(sum * 100) / 100;
        }
      }
      aoa.push(summaryRow);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Apply autofit column widths
  ws['!cols'] = calculateColumnWidths(aoa, sheetSpec.columns);

  return ws;
}

/**
 * Generates an Excel XLSX file Blob from a workbook specification.
 */
export async function generateExcelBlob(specInput: ExcelWorkbookSpec | any): Promise<Blob> {
  const spec = normalizeWorkbookSpec(specInput);
  const wb = XLSX.utils.book_new();

  wb.Props = {
    Title: spec.title || 'Spreadsheet',
    Author: spec.author || 'SAM-Agent',
    CreatedDate: new Date(),
  };

  const sheets = spec.sheets || [];
  if (sheets.length === 0) {
    sheets.push({ name: 'Sheet1', rows: [['Data Kosong']] });
  }

  for (const sheetSpec of sheets) {
    const safeSheetName = (sheetSpec.name || 'Sheet')
      .replace(/[*?:/\\\[\]]/g, '_')
      .slice(0, 31);
    const ws = buildWorkSheet(sheetSpec);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  }

  const excelBytes = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  });

  return new Blob([excelBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Creates Excel (.xlsx) and companion (.csv) artifacts in VFS.
 *
 * Saves:
 * 1. /workspace/<cleanTitle>.xlsx (Valid OpenXML Spreadsheet)
 * 2. /workspace/<cleanTitle>.csv (Standard CSV text format)
 */
export async function createExcelArtifact(
  specInput: any,
  baseName?: string
): Promise<{ xlsxPath: string; csvPath: string; xlsxBlob: Blob }> {
  const spec = normalizeWorkbookSpec(specInput);

  const rawTitle = (baseName || spec.filename || spec.title || 'spreadsheet')
    .replace(/\.(xlsx|csv|xls)$/i, '');

  const cleanTitle = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'spreadsheet';

  const xlsxFilename = `${cleanTitle}.xlsx`;
  const csvFilename = `${cleanTitle}.csv`;

  const xlsxPath = `/workspace/${xlsxFilename}`;
  const csvPath = `/workspace/${csvFilename}`;

  // 1. Generate native .xlsx binary Blob
  const xlsxBlob = await generateExcelBlob(spec);

  // 2. Convert Blob to Base64 Data URL for VFS binary storage
  const base64XlsxUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(xlsxBlob);
  });

  // Save .xlsx into VFS
  await saveVfsFile(
    xlsxPath,
    base64XlsxUrl,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  // 3. Generate companion CSV from first sheet for instant accessibility
  try {
    const firstSheet = spec.sheets?.[0];
    if (firstSheet) {
      const ws = buildWorkSheet(firstSheet);
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      await saveVfsFile(csvPath, csvContent, 'text/csv;charset=utf-8');
    }
  } catch (err) {
    console.warn('[ExcelGenerator] Failed to create companion CSV:', err);
  }

  return {
    xlsxPath,
    csvPath,
    xlsxBlob,
  };
}
