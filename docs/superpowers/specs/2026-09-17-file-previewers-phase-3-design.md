# Specification: Rich File Previewers (Phase 3 - Office & Document Suite: PDF, Excel, Word)

- **Date:** 2026-09-17
- **Topic:** Extension of SAM-Agent Artifact Viewer with Office & Document Suite
- **Phase:** Phase 3 (Office & Document Suite: PDF, Excel, Word)
- **Status:** Validated Design

---

## 1. Executive Summary & Goals

Phases 1 and 2 established rich, interactive previewers for JSON, Mermaid diagrams, ZIP archives, SVG vector graphics, audio files, and system log streams. 

Phase 3 completes the preview subsystem by introducing full-featured support for enterprise and desktop documents frequently encountered during autonomous research, data extraction, and workflow automation:
1. **PDF Document Viewer (`.pdf`)**: Zero-dependency embedding of Chromium's high-performance native PDF engine with toolbar shortcuts to open in a dedicated tab or download locally.
2. **Excel Spreadsheet Viewer (`.xlsx`, `.xls`, `.xlsm`)**: Interactive multi-sheet spreadsheet explorer powered by `xlsx` (SheetJS), featuring real-time row search, column sorting, pagination, and per-sheet CSV export.
3. **Word Document Viewer (`.docx`, `.doc`)**: True-to-layout document page viewer powered by `docx-preview`, preserving headings, tables, embedded imagery, text styling, and document zoom, with legacy fallback for `.doc` files.

---

## 2. Architecture & File Type Resolution

### 2.1 File Type Resolver Update
In `src/components/viewer/types.ts`, `ViewerType` is expanded:

```typescript
export type ViewerType =
  | 'html'
  | 'markdown'
  | 'csv'
  | 'image'
  | 'json'
  | 'mermaid'
  | 'zip'
  | 'svg'
  | 'audio'
  | 'log'
  | 'pdf'       // Phase 3
  | 'excel'     // Phase 3
  | 'docx'      // Phase 3
  | 'code';

export function resolveViewerType(
  path: string,
  mimeType?: string,
  content?: string
): ViewerType {
  const p = (path || '').toLowerCase();
  const m = (mimeType || '').toLowerCase();

  // HTML
  if (p.endsWith('.html') || p.endsWith('.htm') || m === 'text/html' || m === 'application/xhtml+xml') {
    return 'html';
  }
  // Markdown
  if (p.endsWith('.md') || p.endsWith('.markdown') || m === 'text/markdown') {
    return 'markdown';
  }
  // CSV
  if (p.endsWith('.csv') || m === 'text/csv') {
    return 'csv';
  }
  // SVG
  if (p.endsWith('.svg') || m === 'image/svg+xml') {
    return 'svg';
  }
  // Image
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(p)) {
    return 'image';
  }
  // Audio
  if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(p)) {
    return 'audio';
  }
  // PDF
  if (p.endsWith('.pdf') || m === 'application/pdf') {
    return 'pdf';
  }
  // Excel
  if (
    p.endsWith('.xlsx') ||
    p.endsWith('.xls') ||
    p.endsWith('.xlsm') ||
    m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    m === 'application/vnd.ms-excel'
  ) {
    return 'excel';
  }
  // Word
  if (
    p.endsWith('.docx') ||
    p.endsWith('.doc') ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    m === 'application/msword'
  ) {
    return 'docx';
  }
  // JSON
  if (p.endsWith('.json') || m === 'application/json') {
    return 'json';
  }
  // Mermaid Diagrams
  if (
    p.endsWith('.mmd') ||
    p.endsWith('.mermaid') ||
    (content && /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)\b/m.test(content))
  ) {
    return 'mermaid';
  }
  // ZIP Archives
  if (p.endsWith('.zip') || m === 'application/zip' || m === 'application/x-zip-compressed') {
    return 'zip';
  }
  // Log Files
  if (p.endsWith('.log') || /\.(log\.[0-9]+|log\.txt)$/i.test(p)) {
    return 'log';
  }

  return 'code';
}
```

### 2.2 Component Structure
```text
src/components/viewer/
├── ... (Existing Phase 1 & 2 components)
├── PdfDocumentPreview.tsx       (New - Phase 3)
├── ExcelSpreadsheetPreview.tsx  (New - Phase 3)
├── WordDocumentPreview.tsx      (New - Phase 3)
└── index.ts                     (Central Barrel Export)
```

---

## 3. Detailed Component Specifications

### 3.1 `PdfDocumentPreview` (`src/components/viewer/PdfDocumentPreview.tsx`)

#### Props
```typescript
export interface PdfDocumentPreviewProps {
  content: string;
  filePath?: string;
  mimeType?: string;
}
```

#### Key Capabilities
1. **Engine & Memory Management**:
   - Converts base64 Data URLs (`data:application/pdf;base64,...`) or binary strings into a `Blob` (`type: 'application/pdf'`) and generates a browser Object URL.
   - Automatically revokes the Object URL on component unmount via `URL.revokeObjectURL(url)`.
   - Embeds via `<embed type="application/pdf" src={blobUrl} className="w-full h-full" />` leveraging the native Chromium PDF viewer.
2. **Toolbar Actions**:
   - **Open in New Tab** (`ExternalLink`): Launches the PDF Object URL directly into a full-sized browser tab.
   - **Download PDF** (`Download`): Triggers instant local file download using `triggerBlobDownload`.
   - File metadata badge: Filename and human-readable byte size.

---

### 3.2 `ExcelSpreadsheetPreview` (`src/components/viewer/ExcelSpreadsheetPreview.tsx`)

#### Props
```typescript
export interface ExcelSpreadsheetPreviewProps {
  content: string;
  filePath?: string;
}
```

#### Key Capabilities
1. **Workbook Parser Engine**:
   - Uses `xlsx` (SheetJS) to decode the binary ArrayBuffer / Uint8Array.
   - Parses `workbook.SheetNames` and caches parsed sheet matrices to ensure instantaneous sheet navigation without re-parsing.
2. **Multi-Sheet Navigation**:
   - Modern spreadsheet tab bar located above the data table displaying all sheet tabs.
   - Active sheet pill highlight with row/column count badge.
3. **Data Grid & Interactivity**:
   - Column derivation from the sheet's header row.
   - Column sorting (ascending, descending, reset) on header click.
   - Real-time row search filter across all cell values in the active sheet.
   - Configurable pagination: 25, 50, 100, or all rows with page navigation buttons.
4. **Export & Download**:
   - **Export Active Sheet to CSV**: Generates CSV text using `XLSX.utils.sheet_to_csv` and downloads it via `triggerBlobDownload`.
   - **Download Original Excel**: Downloads the raw `.xlsx` file.

---

### 3.3 `WordDocumentPreview` (`src/components/viewer/WordDocumentPreview.tsx`)

#### Props
```typescript
export interface WordDocumentPreviewProps {
  content: string;
  filePath?: string;
}
```

#### Key Capabilities
1. **Document Page Layout Engine**:
   - Uses `docx-preview` (`renderAsync`) to convert `.docx` OpenXML into styled HTML inside an isolated wrapper.
   - Preserves headings, bold/italic fonts, tables with borders, ordered/unordered lists, and embedded images.
2. **Page Aesthetics & Controls**:
   - A4 styled document page cards with subtle drop-shadows and clean margins.
   - **Zoom Controls**: Zoom In (`ZoomIn`), Zoom Out (`ZoomOut`), Fit-to-Width (`Maximize2`), and 100% reset.
   - **Download DOCX**: Downloads original file via `triggerBlobDownload`.
3. **Legacy `.doc` Support**:
   - If the file is identified as older Word 97-2003 binary format (`.doc`), extracts available ASCII/Unicode strings and presents a clear informational banner with a direct download button.

---

## 4. Dependencies

- `xlsx`: `^0.18.5` (Fast client-side spreadsheet workbook parsing)
- `docx-preview`: `^0.4.0` (Client-side DOCX rendering engine)

---

## 5. Verification & Testing Plan

1. **Static Analysis**:
   - Run `npm run compile` to verify zero TypeScript compiler errors across all new and updated files.
2. **Functional Scenarios**:
   - **PDF**: Load sample PDF, verify embedded native Chrome viewer, test "Open in New Tab" and "Download PDF".
   - **Excel**: Load multi-sheet workbook, switch tabs, search cell values, sort numeric and string columns, export sheet to CSV.
   - **Word**: Load sample `.docx`, verify layout formatting, test zoom in/out, download button.
3. **Production Build**:
   - Run `npm run build` to verify Chrome MV3 bundling succeeds completely.
