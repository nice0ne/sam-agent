# Rich File Previewers (Phase 1: JSON, Mermaid, ZIP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand SAM-Agent's Artifact Viewer with rich, interactive previewers for JSON (tree & table), Mermaid diagrams (pan, zoom & export), and ZIP archives (tree & extract to VFS) using existing dependencies.

**Architecture:** Create modular previewer components in `src/components/viewer/` with isolated error boundaries and clean state management. Introduce a centralized `resolveViewerType` resolver in `src/components/viewer/types.ts` and dispatch file types seamlessly in `entrypoints/viewer/App.tsx`.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, Lucide React icons, Mermaid.js v12, JSZip v3.10, Dexie.js (IndexedDB).

**Spec:** `docs/superpowers/specs/2026-09-17-file-previewers-phase-1-design.md`

## Global Constraints
- Do NOT add any new dependencies to `package.json` — utilize existing `mermaid`, `jszip`, `lucide-react`, and standard Web APIs.
- Preserve existing previewers (`HtmlSandboxPreview`, `MarkdownPreview`, `CsvTablePreview`, `ImagePreview`, `RawCodeViewer`) without regressions.
- Every new previewer must handle malformed/corrupted content gracefully with a user-friendly error state and an option to switch to raw view.
- Maintain dark/light mode consistency using Tailwind semantic classes (`bg-background`, `bg-card`, `text-foreground`, `border-border`, etc.).
- Ensure `npm run compile` (`wxt prepare && tsc --noEmit`) passes with 0 errors after each task.

---

### Task 1: Type Definitions & Resolver (`resolveViewerType`)

**Files:**
- Create: `src/components/viewer/types.ts`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type ViewerType = 'html' | 'markdown' | 'csv' | 'image' | 'json' | 'mermaid' | 'zip' | 'code';
  export function resolveViewerType(path: string, mimeType?: string, content?: string): ViewerType;
  ```

- [x] **Step 1: Create `src/components/viewer/types.ts`**

Write `src/components/viewer/types.ts`:
```typescript
export type ViewerType =
  | 'html'
  | 'markdown'
  | 'csv'
  | 'image'
  | 'json'
  | 'mermaid'
  | 'zip'
  | 'code';

/**
 * Resolves the appropriate viewer preview type based on file path, MIME type, and optional content sniff.
 */
export function resolveViewerType(
  path: string,
  mimeType?: string,
  content?: string
): ViewerType {
  const p = (path || '').toLowerCase();
  const m = (mimeType || '').toLowerCase();

  // 1. HTML
  if (
    p.endsWith('.html') ||
    p.endsWith('.htm') ||
    m === 'text/html' ||
    m === 'application/xhtml+xml'
  ) {
    return 'html';
  }

  // 2. Markdown
  if (p.endsWith('.md') || p.endsWith('.markdown') || m === 'text/markdown') {
    return 'markdown';
  }

  // 3. CSV
  if (p.endsWith('.csv') || m === 'text/csv') {
    return 'csv';
  }

  // 4. Image
  if (
    m.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|ico|svg|bmp)$/i.test(p)
  ) {
    return 'image';
  }

  // 5. JSON
  if (p.endsWith('.json') || m === 'application/json') {
    return 'json';
  }

  // 6. Mermaid Diagrams
  if (
    p.endsWith('.mmd') ||
    p.endsWith('.mermaid') ||
    (content && /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)\b/m.test(content))
  ) {
    return 'mermaid';
  }

  // 7. ZIP Archives
  if (
    p.endsWith('.zip') ||
    m === 'application/zip' ||
    m === 'application/x-zip-compressed'
  ) {
    return 'zip';
  }

  // Default fallback
  return 'code';
}
```

- [x] **Step 2: Export types in `src/components/viewer/index.ts`**

Append to `src/components/viewer/index.ts`:
```typescript
export * from './types';
```

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 1**

```bash
git add src/components/viewer/types.ts src/components/viewer/index.ts
git commit -m "feat(viewer): add ViewerType and resolveViewerType resolver"
```

---

### Task 2: Implement `JsonTreePreview` (Tree & Table Modes)

**Files:**
- Create: `src/components/viewer/JsonTreePreview.tsx`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Consumes: `lucide-react` icons, standard React hooks.
- Produces:
  ```typescript
  export interface JsonTreePreviewProps {
    content: string;
    filePath?: string;
  }
  export const JsonTreePreview: React.FC<JsonTreePreviewProps>;
  ```

- [x] **Step 1: Create `src/components/viewer/JsonTreePreview.tsx`**

Implement recursive node rendering, copy JSON path, search filtering, table mode toggle for arrays of objects, and malformed JSON alerts.
Key features:
1. Search input with live match highlighting.
2. Expand all / collapse all buttons.
3. Pretty/Minified JSON copy buttons with feedback checkmark.
4. If content is an array of objects, provide a "Table Mode" switch with sorting and column extraction.
5. Error alert card if `JSON.parse` fails.

- [x] **Step 2: Export in `src/components/viewer/index.ts`**

Add `export * from './JsonTreePreview';` to `src/components/viewer/index.ts`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 2**

```bash
git add src/components/viewer/JsonTreePreview.tsx src/components/viewer/index.ts
git commit -m "feat(viewer): implement interactive JsonTreePreview with tree and table modes"
```

---

### Task 3: Implement `MermaidPreview` (Zoom, Pan & Export)

**Files:**
- Create: `src/components/viewer/MermaidPreview.tsx`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Consumes: `mermaid` (v12), `lucide-react`, `triggerBlobDownload` from `src/services/archive`.
- Produces:
  ```typescript
  export interface MermaidPreviewProps {
    content: string;
    filePath?: string;
  }
  export const MermaidPreview: React.FC<MermaidPreviewProps>;
  ```

- [x] **Step 1: Create `src/components/viewer/MermaidPreview.tsx`**

Key features:
1. Asynchronous `mermaid.render(id, content)` with unique container ID.
2. Auto-detect dark mode (`document.documentElement.classList.contains('dark')`).
3. Pan & Zoom canvas:
   - Mouse wheel listener for zoom in/out (scale 0.2x to 5x).
   - Mouse down/move/up for dragging and panning.
   - GPU-accelerated CSS transform (`transform: translate(${x}px, ${y}px) scale(${scale})`).
4. Floating Toolbar:
   - Zoom In (`+`), Zoom Out (`-`), Reset Zoom (`Fit`).
   - Export SVG (`triggerBlobDownload` of SVG Blob).
   - Export PNG (draw SVG on `<canvas>` at 2x DPI and download).
   - Copy SVG to clipboard.
5. Error Boundary:
   - Catches syntax errors from `mermaid.render`.
   - Displays alert card with error details and "View Raw Code" guidance.

- [x] **Step 2: Export in `src/components/viewer/index.ts`**

Add `export * from './MermaidPreview';` to `src/components/viewer/index.ts`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 3**

```bash
git add src/components/viewer/MermaidPreview.tsx src/components/viewer/index.ts
git commit -m "feat(viewer): implement MermaidPreview with interactive pan-zoom and export"
```

---

### Task 4: Implement `ZipArchivePreview` (Tree, Search & VFS Extract)

**Files:**
- Create: `src/components/viewer/ZipArchivePreview.tsx`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Consumes: `jszip`, `src/services/vfs`, `src/services/archive` (`triggerBlobDownload`), `src/types/agent` (`VfsFileRecord`).
- Produces:
  ```typescript
  export interface ZipArchivePreviewProps {
    file: VfsFileRecord;
  }
  export const ZipArchivePreview: React.FC<ZipArchivePreviewProps>;
  ```

- [x] **Step 1: Create `src/components/viewer/ZipArchivePreview.tsx`**

Key features:
1. Decode `file.content` (supporting base64 data URLs `data:application/zip;base64,...`, binary strings, and typed arrays).
2. Load archive via `JSZip.loadAsync(binaryData)`.
3. Parse archive entries into:
   - Header summary metrics: total files, folders, uncompressed size, compressed size, space saved percentage.
   - Nested folder and file tree structure with collapsible folders.
4. Search bar filtering files by name and extension in real time.
5. Actions per file:
   - "Download" individual file directly.
   - "Extract to VFS" writes individual file to `/extracted/<archiveName>/<path>`.
6. Header Action:
   - "Extract All to VFS" with extraction progress state.

- [x] **Step 2: Export in `src/components/viewer/index.ts`**

Add `export * from './ZipArchivePreview';` to `src/components/viewer/index.ts`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 4**

```bash
git add src/components/viewer/ZipArchivePreview.tsx src/components/viewer/index.ts
git commit -m "feat(viewer): implement ZipArchivePreview with archive tree and VFS extraction"
```

---

### Task 5: Integrate New Previewers into `entrypoints/viewer/App.tsx`

**Files:**
- Modify: `entrypoints/viewer/App.tsx`

**Interfaces:**
- Consumes: `resolveViewerType`, `JsonTreePreview`, `MermaidPreview`, `ZipArchivePreview`, `HtmlSandboxPreview`, `MarkdownPreview`, `CsvTablePreview`, `ImagePreview`, `RawCodeViewer`.

- [x] **Step 1: Update `entrypoints/viewer/App.tsx` imports & rendering**

1. Import `resolveViewerType` and new preview components from `../../src/components/viewer`.
2. In `renderContent()`, replace hardcoded `if/else` checks with `resolveViewerType(file.path, file.mimeType, file.content)`.
3. Map:
   - `'json'` -> `<JsonTreePreview content={file.content} filePath={file.path} />`
   - `'mermaid'` -> `<MermaidPreview content={file.content} filePath={file.path} />`
   - `'zip'` -> `<ZipArchivePreview file={file} />`
   - `'html'` -> `<HtmlSandboxPreview ... />`
   - `'markdown'` -> `<MarkdownPreview ... />`
   - `'csv'` -> `<CsvTablePreview ... />`
   - `'image'` -> `<ImagePreview ... />`
   - `'code'` / default -> `<RawCodeViewer content={file.content} />`

- [x] **Step 2: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 3: Commit Task 5**

```bash
git add entrypoints/viewer/App.tsx
git commit -m "feat(viewer): wire resolveViewerType and new previewers into viewer App"
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
Expected: Exit code 0, WXT generates types cleanly and `tsc --noEmit` passes with 0 errors.

- [x] **Step 2: Production build test**

Run:
```bash
npm run build
```
Expected: Exit code 0, Chrome MV3 bundle created successfully in `.output/chrome-mv3`.

- [x] **Step 3: Final verification commit and push**

Push commits to remote repository:
```bash
git push origin main
```
