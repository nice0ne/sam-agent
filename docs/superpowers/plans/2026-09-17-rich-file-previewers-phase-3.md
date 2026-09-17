# Rich File Previewers (Phase 3: Office & Document Suite - PDF, Excel, Word) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand SAM-Agent's Artifact Viewer with a complete Office & Document Suite supporting PDF documents (native Chromium engine), Excel spreadsheets (multi-sheet interactive data grid via `xlsx`), and Word documents (document page viewer via `docx-preview`).

**Architecture:** Extend the modular previewer registry pattern. Install `xlsx` and `docx-preview`, update `src/components/viewer/types.ts` with `'pdf' | 'excel' | 'docx'`, create independent previewer components in `src/components/viewer/`, and wire them cleanly into `entrypoints/viewer/App.tsx`.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, Lucide React icons, `xlsx` (SheetJS v0.18.5), `docx-preview` (v0.4.0), Native Chromium PDF Plugin.

**Spec:** `docs/superpowers/specs/2026-09-17-file-previewers-phase-3-design.md`

## Global Constraints
- Preserve all existing Phase 1 & Phase 2 previewers without regressions.
- Memory management: revoke Object URLs on unmount in `PdfDocumentPreview`.
- Maintain dark/light mode consistency using Tailwind semantic classes (`bg-background`, `bg-card`, `text-foreground`, `border-border`, etc.).
- Ensure `npm run compile` (`wxt prepare && tsc --noEmit`) passes with 0 errors after every task.

---

### Task 1: Install Dependencies & Update Resolver (`types.ts`)

**Files:**
- Modify: `package.json`
- Modify: `src/components/viewer/types.ts`

**Interfaces:**
- Produces:
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
    | 'pdf'
    | 'excel'
    | 'docx'
    | 'code';
  export function resolveViewerType(path: string, mimeType?: string, content?: string): ViewerType;
  ```

- [x] **Step 1: Install `xlsx` and `docx-preview`**

Run:
```bash
npm install xlsx docx-preview
```

- [x] **Step 2: Update `src/components/viewer/types.ts`**

Update `ViewerType` and `resolveViewerType` with `'pdf'`, `'excel'`, and `'docx'`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 1**

```bash
git add package.json package-lock.json src/components/viewer/types.ts
git commit -m "feat(viewer): install xlsx and docx-preview, expand ViewerType for pdf, excel, docx"
```

---

### Task 2: Implement `PdfDocumentPreview` (Native Chromium PDF Engine)

**Files:**
- Create: `src/components/viewer/PdfDocumentPreview.tsx`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Consumes: `lucide-react` icons, `triggerBlobDownload` from `src/services/archive`.
- Produces:
  ```typescript
  export interface PdfDocumentPreviewProps {
    content: string;
    filePath?: string;
    mimeType?: string;
  }
  export const PdfDocumentPreview: React.FC<PdfDocumentPreviewProps>;
  ```

- [x] **Step 1: Create `src/components/viewer/PdfDocumentPreview.tsx`**

Key features:
1. Converts base64 data URL (`data:application/pdf;base64,...`) or binary data to Blob and Object URL.
2. Revokes Object URL on unmount to prevent memory leaks.
3. Embeds `<embed type="application/pdf" src={blobUrl} className="w-full h-full border-0" />`.
4. Header Toolbar:
   - "Open in New Tab" (`ExternalLink`).
   - "Download PDF" (`Download`) via `triggerBlobDownload`.
   - File metadata badge with filename and size.
5. Error alert card if content is empty or corrupt.

- [x] **Step 2: Export in `src/components/viewer/index.ts`**

Add `export * from './PdfDocumentPreview';` to `src/components/viewer/index.ts`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 2**

```bash
git add src/components/viewer/PdfDocumentPreview.tsx src/components/viewer/index.ts
git commit -m "feat(viewer): implement PdfDocumentPreview with native Chromium PDF embedding"
```

---

### Task 3: Implement `ExcelSpreadsheetPreview` (Multi-Sheet Data Grid)

**Files:**
- Create: `src/components/viewer/ExcelSpreadsheetPreview.tsx`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Consumes: `xlsx` (`* as XLSX`), `lucide-react` icons, `triggerBlobDownload` from `src/services/archive`.
- Produces:
  ```typescript
  export interface ExcelSpreadsheetPreviewProps {
    content: string;
    filePath?: string;
  }
  export const ExcelSpreadsheetPreview: React.FC<ExcelSpreadsheetPreviewProps>;
  ```

- [x] **Step 1: Create `src/components/viewer/ExcelSpreadsheetPreview.tsx`**

Key features:
1. Decode base64 or binary data into `Uint8Array` and parse via `XLSX.read(data, { type: 'array' })`.
2. Extract all sheet names (`workbook.SheetNames`) and build a multi-sheet tab bar with active sheet indicator.
3. For the active sheet, extract 2D grid via `XLSX.utils.sheet_to_json(sheet, { header: 1 })`.
4. Derive headers from row 0, data rows from rows 1..N.
5. Interactive grid controls:
   - Search filter across all cells in the active sheet.
   - Column sorting (ascending, descending, reset) on header click.
   - Pagination (25, 50, 100, All rows per page).
6. Action Buttons:
   - "Export Sheet to CSV": converts active sheet to CSV and triggers `triggerBlobDownload`.
   - "Download Excel": downloads original `.xlsx` file via `triggerBlobDownload`.
7. Summary stats: Total rows, columns, sheet count.

- [x] **Step 2: Export in `src/components/viewer/index.ts`**

Add `export * from './ExcelSpreadsheetPreview';` to `src/components/viewer/index.ts`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 3**

```bash
git add src/components/viewer/ExcelSpreadsheetPreview.tsx src/components/viewer/index.ts
git commit -m "feat(viewer): implement ExcelSpreadsheetPreview with multi-sheet data grid"
```

---

### Task 4: Implement `WordDocumentPreview` (Document Page Viewer)

**Files:**
- Create: `src/components/viewer/WordDocumentPreview.tsx`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Consumes: `docx-preview` (`renderAsync`), `lucide-react` icons, `triggerBlobDownload` from `src/services/archive`.
- Produces:
  ```typescript
  export interface WordDocumentPreviewProps {
    content: string;
    filePath?: string;
  }
  export const WordDocumentPreview: React.FC<WordDocumentPreviewProps>;
  ```

- [x] **Step 1: Create `src/components/viewer/WordDocumentPreview.tsx`**

Key features:
1. Decode base64 or binary data into `ArrayBuffer`.
2. For `.docx`:
   - Renders document via `renderAsync(arrayBuffer, containerRef.current, undefined, { inWrapper: true, ignoreWidth: false, ignoreHeight: false })`.
   - Styled A4 document page container with subtle drop shadow.
   - Zoom controls: Zoom In (`+`), Zoom Out (`-`), Fit-to-Width (`Maximize2`), Reset (`100%`).
3. For `.doc` (legacy format):
   - Sniffs for legacy format, extracts raw text lines if possible, and shows a friendly info card advising user to save as `.docx` with a direct download button.
4. Download button: "Download Word File" via `triggerBlobDownload`.

- [x] **Step 2: Export in `src/components/viewer/index.ts`**

Add `export * from './WordDocumentPreview';` to `src/components/viewer/index.ts`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 4**

```bash
git add src/components/viewer/WordDocumentPreview.tsx src/components/viewer/index.ts
git commit -m "feat(viewer): implement WordDocumentPreview with docx-preview page layout"
```

---

### Task 5: Integrate Phase 3 Previewers into `entrypoints/viewer/App.tsx`

**Files:**
- Modify: `entrypoints/viewer/App.tsx`

**Interfaces:**
- Consumes: `PdfDocumentPreview`, `ExcelSpreadsheetPreview`, `WordDocumentPreview`, `resolveViewerType`.

- [x] **Step 1: Update `entrypoints/viewer/App.tsx`**

1. Import `PdfDocumentPreview`, `ExcelSpreadsheetPreview`, `WordDocumentPreview` from `../../src/components/viewer`.
2. In `renderContent()`, add cases to the `switch (viewerType)` statement:
   - `'pdf'` -> `<PdfDocumentPreview content={file.content} filePath={file.path} mimeType={file.mimeType} />`
   - `'excel'` -> `<ExcelSpreadsheetPreview content={file.content} filePath={file.path} />`
   - `'docx'` -> `<WordDocumentPreview content={file.content} filePath={file.path} />`

- [x] **Step 2: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 3: Commit Task 5**

```bash
git add entrypoints/viewer/App.tsx
git commit -m "feat(viewer): wire pdf, excel, and docx previewers into viewer App"
```

---

### Task 6: Full Verification & Build Testing

**Files:**
- All modified and new files.

- [x] **Step 1: Clean compile test**

Run:
```bash
powershell -Command "Remove-Item -Recurse -Force .wxt; npm run compile"
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 2: Production build test**

Run:
```bash
npm run build
```
Expected: Exit code 0, Chrome MV3 bundle created successfully in `.output/chrome-mv3`.

- [x] **Step 3: Push to remote repository**

```bash
git push origin main
```
