# Specification: Rich File Previewers (Phase 1 - JSON, Mermaid, ZIP)

- **Date:** 2026-09-17
- **Topic:** Extension of SAM-Agent Artifact Viewer with Modular Rich Previews
- **Phase:** Phase 1 (Zero New External Dependencies)
- **Status:** Validated Design

---

## 1. Executive Summary & Goals

SAM-Agent provides an in-browser Virtual File System (VFS) and an Artifact Viewer (`/viewer.html`). Currently, the viewer supports rich rendering for HTML (`HtmlSandboxPreview`), Markdown (`MarkdownPreview`), CSV (`CsvTablePreview`), and Images (`ImagePreview`), while falling back to a plain text/CodeMirror editor (`RawCodeViewer`) for all other file types.

Phase 1 introduces three high-impact previewers using libraries already available in `package.json` (`mermaid: ^12.0.0` and `jszip: ^3.10.2`):
1. **Interactive JSON Explorer (`.json`)**: Hierarchical tree with search, copy JSON path, expand/collapse all, and dynamic tabular view for arrays of objects.
2. **Interactive Mermaid Diagram Canvas (`.mmd`, `.mermaid`)**: Live diagram rendering, pan-and-zoom canvas, theme synchronization, and SVG/PNG export.
3. **ZIP Archive Explorer (`.zip`)**: Visual directory tree, compression statistics, file search, and individual/bulk extraction directly into VFS.

---

## 2. Architecture & File Type Resolution

### 2.1 File Type Resolver
In `entrypoints/viewer/App.tsx`, file dispatching is formalized into a centralized resolver function `resolveViewerType`:

```typescript
export type ViewerType =
  | 'html'
  | 'markdown'
  | 'csv'
  | 'image'
  | 'json'      // Phase 1
  | 'mermaid'   // Phase 1
  | 'zip'       // Phase 1
  | 'code';     // Fallback RawCodeViewer

export function resolveViewerType(path: string, mimeType?: string, content?: string): ViewerType {
  const p = path.toLowerCase();
  const m = (mimeType || '').toLowerCase();

  if (p.endsWith('.html') || p.endsWith('.htm') || m === 'text/html' || m === 'application/xhtml+xml') {
    return 'html';
  }
  if (p.endsWith('.md') || m === 'text/markdown') {
    return 'markdown';
  }
  if (p.endsWith('.csv') || m === 'text/csv') {
    return 'csv';
  }
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(p)) {
    return 'image';
  }
  if (p.endsWith('.json') || m === 'application/json') {
    return 'json';
  }
  if (p.endsWith('.mmd') || p.endsWith('.mermaid')) {
    return 'mermaid';
  }
  if (p.endsWith('.zip') || m === 'application/zip' || m === 'application/x-zip-compressed') {
    return 'zip';
  }
  return 'code';
}
```

### 2.2 Component Hierarchy & Structure
```text
src/components/viewer/
├── CsvTablePreview.tsx       (Existing)
├── HtmlSandboxPreview.tsx    (Existing)
├── ImagePreview.tsx          (Existing)
├── MarkdownPreview.tsx       (Existing)
├── RawCodeViewer.tsx         (Existing)
├── ViewerHeader.tsx          (Existing)
├── JsonTreePreview.tsx       (New - Phase 1)
├── MermaidPreview.tsx        (New - Phase 1)
├── ZipArchivePreview.tsx     (New - Phase 1)
└── index.ts                  (Central Barrel Export)
```

`ViewerHeader` retains the `preview` vs `raw` viewMode toggle:
- When `raw` is selected: Always renders `RawCodeViewer`.
- When `preview` is selected: Renders the resolved rich previewer.

---

## 3. Detailed Component Specifications

### 3.1 `JsonTreePreview` (`src/components/viewer/JsonTreePreview.tsx`)

#### Purpose
Provide a structured, interactive view for JSON files produced by API requests, scraping workflows, and agent states.

#### Props
```typescript
interface JsonTreePreviewProps {
  content: string;
  filePath?: string;
}
```

#### Key Capabilities
1. **Safe Parsing & Error Boundary**:
   - Parses `content` using `JSON.parse` wrapped in `useMemo`.
   - If parsing fails, displays a clean alert banner with line/message details and a direct button to switch to raw view.
2. **Dual-Mode Display**:
   - **Tree Mode (Default)**: Recursive collapsible nodes.
     - Object nodes display key count (e.g. `{ 4 keys }`).
     - Array nodes display item count (e.g. `[ 25 items ]`).
     - Primitive values formatted with syntax colors (strings in emerald, numbers in cyan, booleans in purple, null in muted gray).
     - Individual node click displays and copies JSON path (e.g. `data.items[0].id`).
   - **Table Mode**: Activated via toggle button when root data or main field is an array of objects.
     - Automatically derives column headers from object keys.
     - Supports search filtering and column sorting.
3. **Toolbar Actions**:
   - **Search Input**: Filters keys and values in real time with count indicator.
   - **Expand All / Collapse All**: Bulk controls for tree state.
   - **Copy Actions**: Copy Pretty Formatted JSON (2 spaces) and Copy Minified JSON.

---

### 3.2 `MermaidPreview` (`src/components/viewer/MermaidPreview.tsx`)

#### Purpose
Render architectural, system, sequence, and flow diagrams written in Mermaid syntax.

#### Props
```typescript
interface MermaidPreviewProps {
  content: string;
  filePath?: string;
}
```

#### Key Capabilities
1. **Mermaid Engine Lifecycle**:
   - Initializes `mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default', securityLevel: 'loose' })`.
   - Generates unique container IDs and invokes `mermaid.render(id, content)` asynchronously.
2. **Interactive Canvas (Pan & Zoom)**:
   - **Mouse Wheel Zoom**: Smooth zoom in/out between 0.2x and 5.0x centered on cursor.
   - **Drag & Pan**: Click and drag to translate the canvas smoothly.
   - **GPU Acceleration**: Utilizes CSS `transform: translate3d(...) scale(...)` for 60fps rendering without re-triggering SVG layout calculations.
3. **Control Toolbar**:
   - Zoom In (`+`), Zoom Out (`-`), and Reset Zoom (`1:1` / fit-to-screen).
   - Zoom percentage readout.
4. **Export Capabilities**:
   - **Export SVG**: Triggers download of the raw vector `.svg` file.
   - **Export PNG**: Draws SVG onto a high-DPI canvas (`devicePixelRatio * 2`) and triggers PNG download.
   - **Copy SVG**: Copies raw SVG string to clipboard.
5. **Syntax Error Handling**:
   - Catches syntax compilation errors gracefully without crashing the view.
   - Shows actionable error message with an "Open Raw Code" shortcut button.

---

### 3.3 `ZipArchivePreview` (`src/components/viewer/ZipArchivePreview.tsx`)

#### Purpose
Allow users to inspect, browse, and extract files from ZIP archives in the VFS without extracting everything to disk.

#### Props
```typescript
interface ZipArchivePreviewProps {
  file: VfsFileRecord;
}
```

#### Key Capabilities
1. **Archive Decoding**:
   - Handles Base64 Data URLs (`data:application/zip;base64,...`) and raw binary strings via `Uint8Array`.
   - Asynchronously loads archive metadata via `JSZip.loadAsync(binaryData)`.
2. **Header Statistics**:
   - Displays total file count, total folder count, uncompressed size, and compressed size.
   - Computes compression savings percentage (e.g. "Saved 42% space").
3. **Interactive Tree Structure**:
   - Transforms flat zip entries into a nested, collapsible folder tree.
   - Renders file icons according to file extension (code, images, documents, audio).
   - Displays uncompressed size per file in human-readable units (B, KB, MB).
4. **Search Filter**:
   - Real-time text search filtering files by name or extension inside the archive.
5. **Extraction Actions**:
   - **Download Individual File**: Extracts and triggers instant browser download of a single entry (`triggerBlobDownload`).
   - **Extract Individual File to VFS**: Writes the unzipped file directly to VFS at `/extracted/<archive-name>/<file-path>`.
   - **Extract All to VFS**: Bulk uncompresses and writes all files into the VFS directory with progress indication.

---

## 4. Performance & Safety Considerations

1. **Virtual DOM Load in JSON**:
   - Deep nested structures default to collapsed state for depths > 2 to prevent excessive DOM element creation.
2. **Mermaid Sanitization**:
   - `securityLevel: 'loose'` is run within the extension's local sandboxed context, and raw HTML inside Mermaid nodes is rendered safely without script execution.
3. **Lazy Binary Processing in ZIP**:
   - File contents are only decoded from the archive when the user explicitly clicks "Download" or "Extract to VFS", keeping memory usage minimal during browsing.

---

## 5. Verification & Test Plan

1. **Static Analysis**:
   - Run `npm run compile` (`wxt prepare && tsc --noEmit`) to verify zero TypeScript compiler errors.
2. **Functional Scenarios**:
   - **JSON**:
     - Load deep nested JSON (test tree collapse/expand).
     - Load array of 20+ objects (test toggle to Table mode, column sorting, search).
     - Load invalid JSON with missing bracket (test error boundary card).
   - **Mermaid**:
     - Load sample flowchart (`graph TD; A-->B;`).
     - Test mousewheel zoom and pan dragging.
     - Test "Export SVG" and "Export PNG" downloads.
     - Load invalid Mermaid syntax (test graceful error state).
   - **ZIP**:
     - Load sample ZIP archive with nested directories.
     - Test search filtering.
     - Test extract single file to VFS and verify presence in Dexie DB.
3. **Production Build**:
   - Run `npm run build` to ensure the final bundle passes all WXT build constraints.
