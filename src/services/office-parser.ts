import JSZip from 'jszip';

export interface ParsedOfficeDoc {
  text: string;
  type: 'docx' | 'xlsx' | 'pptx' | 'unknown';
  filename: string;
  sheetNames?: string[];
  slideCount?: number;
  wordCount: number;
  summaryPreview: string;
}

/**
 * Check whether a filename corresponds to a supported Microsoft Office document
 */
export function isOfficeDocument(filename: string): boolean {
  return /\.(docx|xlsx|pptx)$/i.test(filename);
}

/**
 * Detect Office document type from filename
 */
export function getOfficeDocType(filename: string): 'docx' | 'xlsx' | 'pptx' | 'unknown' {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'pptx') return 'pptx';
  return 'unknown';
}

/**
 * Extract text, headings, and tables from Word Document (.docx)
 */
export async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Invalid docx: word/document.xml not found.');
  }

  const xmlText = await docXmlFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const lines: string[] = [];

  // Iterate over paragraphs and tables in order
  const body = doc.querySelector('body') || doc.documentElement;
  const elements = body.children;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const tagName = el.localName || el.nodeName;

    if (tagName === 'p') {
      // Paragraph
      const pText = extractParagraphText(el);
      if (pText.trim()) {
        const isHeading = isParagraphHeading(el);
        if (isHeading) {
          lines.push(`\n## ${pText.trim()}\n`);
        } else {
          lines.push(pText.trim());
        }
      }
    } else if (tagName === 'tbl') {
      // Table
      const tableText = extractTableText(el);
      if (tableText) {
        lines.push(`\n${tableText}\n`);
      }
    }
  }

  return lines.join('\n').trim();
}

function extractParagraphText(pEl: Element): string {
  const textNodes = pEl.querySelectorAll('t');
  const parts: string[] = [];
  textNodes.forEach((t) => {
    parts.push(t.textContent || '');
  });
  return parts.join('');
}

function isParagraphHeading(pEl: Element): boolean {
  const pStyle = pEl.querySelector('pStyle');
  if (pStyle) {
    const val = pStyle.getAttribute('w:val') || '';
    if (/heading|title/i.test(val)) return true;
  }
  return false;
}

function extractTableText(tblEl: Element): string {
  const rows = tblEl.querySelectorAll('tr');
  const tableData: string[][] = [];

  rows.forEach((row) => {
    const cells = row.querySelectorAll('tc');
    const rowData: string[] = [];
    cells.forEach((cell) => {
      const pList = cell.querySelectorAll('p');
      const cellText = Array.from(pList)
        .map((p) => extractParagraphText(p))
        .join(' ')
        .replace(/\|/g, '/')
        .trim();
      rowData.push(cellText || '-');
    });
    if (rowData.length > 0) {
      tableData.push(rowData);
    }
  });

  if (tableData.length === 0) return '';

  const colCount = Math.max(...tableData.map((r) => r.length));
  const mdRows: string[] = [];

  tableData.forEach((row, idx) => {
    // Pad columns
    while (row.length < colCount) row.push('-');
    mdRows.push(`| ${row.join(' | ')} |`);
    if (idx === 0) {
      mdRows.push(`| ${Array(colCount).fill('---').join(' | ')} |`);
    }
  });

  return mdRows.join('\n');
}

/**
 * Extract slides, titles, and bullet points from PowerPoint Presentation (.pptx)
 */
export async function parsePptx(
  buffer: ArrayBuffer
): Promise<{ text: string; slideCount: number }> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  // Find all slide files: ppt/slides/slide1.xml, slide2.xml, etc.
  const slideEntries = Object.keys(zip.files).filter((path) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(path)
  );

  // Sort by slide index
  slideEntries.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
    const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
    return numA - numB;
  });

  const slideTexts: string[] = [];

  for (let i = 0; i < slideEntries.length; i++) {
    const slidePath = slideEntries[i];
    const file = zip.file(slidePath);
    if (!file) continue;

    const xml = await file.async('text');
    const doc = parser.parseFromString(xml, 'application/xml');

    const paragraphs = doc.querySelectorAll('p');
    const pTexts: string[] = [];

    paragraphs.forEach((p) => {
      const textEls = p.querySelectorAll('t');
      const text = Array.from(textEls)
        .map((t) => t.textContent || '')
        .join('')
        .trim();
      if (text) {
        pTexts.push(text);
      }
    });

    if (pTexts.length > 0) {
      const title = pTexts[0];
      const body = pTexts.slice(1).map((t) => `• ${t}`).join('\n');
      slideTexts.push(
        `--- SLIDE ${i + 1}: ${title} ---\n${body || title}`
      );
    } else {
      slideTexts.push(`--- SLIDE ${i + 1} ---\n(Empty or Image Slide)`);
    }
  }

  return {
    text: slideTexts.join('\n\n'),
    slideCount: slideEntries.length,
  };
}

/**
 * Extract sheets, tables, and cell values from Excel Spreadsheet (.xlsx)
 */
export async function parseXlsx(
  buffer: ArrayBuffer
): Promise<{ text: string; sheetNames: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  // 1. Read shared strings table if present (xl/sharedStrings.xml)
  const sharedStrings: string[] = [];
  const sstFile = zip.file('xl/sharedStrings.xml');
  if (sstFile) {
    const sstXml = await sstFile.async('text');
    const sstDoc = parser.parseFromString(sstXml, 'application/xml');
    const siElements = sstDoc.querySelectorAll('si');
    siElements.forEach((si) => {
      const tEls = si.querySelectorAll('t');
      const text = Array.from(tEls)
        .map((t) => t.textContent || '')
        .join('');
      sharedStrings.push(text);
    });
  }

  // 2. Read workbook to get sheet names (xl/workbook.xml)
  const sheetNames: string[] = [];
  const wbFile = zip.file('xl/workbook.xml');
  if (wbFile) {
    const wbXml = await wbFile.async('text');
    const wbDoc = parser.parseFromString(wbXml, 'application/xml');
    const sheets = wbDoc.querySelectorAll('sheet');
    sheets.forEach((s) => {
      const name = s.getAttribute('name');
      if (name) sheetNames.push(name);
    });
  }

  // 3. Parse individual sheet files (xl/worksheets/sheet1.xml, etc.)
  const sheetFiles = Object.keys(zip.files).filter((path) =>
    /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)
  );

  sheetFiles.sort((a, b) => {
    const numA = parseInt(a.match(/sheet(\d+)\.xml/i)?.[1] || '0', 10);
    const numB = parseInt(b.match(/sheet(\d+)\.xml/i)?.[1] || '0', 10);
    return numA - numB;
  });

  const parsedSheets: string[] = [];

  for (let sIdx = 0; sIdx < Math.min(sheetFiles.length, 5); sIdx++) {
    const path = sheetFiles[sIdx];
    const sFile = zip.file(path);
    if (!sFile) continue;

    const sheetName = sheetNames[sIdx] || `Sheet ${sIdx + 1}`;
    const xml = await sFile.async('text');
    const doc = parser.parseFromString(xml, 'application/xml');

    const rows = doc.querySelectorAll('row');
    const tableRows: string[][] = [];

    // Limit to first 100 rows per sheet to prevent huge token blowup
    const maxRows = Math.min(rows.length, 100);

    for (let rIdx = 0; rIdx < maxRows; rIdx++) {
      const row = rows[rIdx];
      const cells = row.querySelectorAll('c');
      const rowData: string[] = [];

      cells.forEach((cell) => {
        const type = cell.getAttribute('t');
        const vEl = cell.querySelector('v');
        let cellVal = vEl?.textContent || '';

        if (type === 's') {
          // Shared string lookup
          const sstIdx = parseInt(cellVal, 10);
          cellVal = !isNaN(sstIdx) && sharedStrings[sstIdx] !== undefined
            ? sharedStrings[sstIdx]
            : cellVal;
        } else if (type === 'inlineStr') {
          cellVal = cell.querySelector('is t')?.textContent || cellVal;
        }

        rowData.push(cellVal.replace(/[\r\n|]/g, ' ').trim());
      });

      if (rowData.some((c) => c !== '')) {
        tableRows.push(rowData);
      }
    }

    if (tableRows.length > 0) {
      const colCount = Math.max(...tableRows.map((r) => r.length));
      const mdRows: string[] = [];

      tableRows.forEach((r, idx) => {
        while (r.length < colCount) r.push('');
        mdRows.push(`| ${r.join(' | ')} |`);
        if (idx === 0) {
          mdRows.push(`| ${Array(colCount).fill('---').join(' | ')} |`);
        }
      });

      parsedSheets.push(`### Sheet: ${sheetName}\n${mdRows.join('\n')}`);
    }
  }

  return {
    text: parsedSheets.join('\n\n'),
    sheetNames,
  };
}

/**
 * Unified Office Document parser extracting readable text and structured metadata
 */
export async function extractOfficeText(
  fileOrBlob: File | Blob,
  filename: string
): Promise<ParsedOfficeDoc> {
  const type = getOfficeDocType(filename);
  const buffer = await fileOrBlob.arrayBuffer();

  let text = '';
  let sheetNames: string[] | undefined;
  let slideCount: number | undefined;

  switch (type) {
    case 'docx':
      text = await parseDocx(buffer);
      break;
    case 'pptx': {
      const pptxRes = await parsePptx(buffer);
      text = pptxRes.text;
      slideCount = pptxRes.slideCount;
      break;
    }
    case 'xlsx': {
      const xlsxRes = await parseXlsx(buffer);
      text = xlsxRes.text;
      sheetNames = xlsxRes.sheetNames;
      break;
    }
    default:
      throw new Error(`Unsupported Office format for file: ${filename}`);
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const summaryPreview = text.slice(0, 200).replace(/\s+/g, ' ').trim() + (text.length > 200 ? '...' : '');

  return {
    text,
    type,
    filename,
    sheetNames,
    slideCount,
    wordCount,
    summaryPreview,
  };
}
