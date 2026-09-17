# Rich File Previewers (Phase 2: SVG, Audio, Log Stream) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand SAM-Agent's Artifact Viewer with specialized rich previewers for SVG vector graphics (visual canvas + XML source + PNG export), audio files (modern studio player with scrubber, speed, waveform, volume), and log streams (smart console with level badges, filtering, search, line numbers).

**Architecture:** Extend the modular previewer registry pattern established in Phase 1. Update `src/components/viewer/types.ts` with `'svg' | 'audio' | 'log'`, create independent previewer components in `src/components/viewer/`, and wire them cleanly into `entrypoints/viewer/App.tsx`.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, Lucide React icons, Web Audio / HTML5 Audio API, Canvas API.

**Spec:** `docs/superpowers/specs/2026-09-17-file-previewers-phase-2-design.md`

## Global Constraints
- Zero new dependencies in `package.json` — use standard browser APIs (HTML5 Audio, Canvas API, DOMParser, URL.createObjectURL) and existing Lucide icons.
- Avoid memory leaks: always revoke created Object URLs in `AudioPlayerPreview` on unmount.
- Preserve all existing Phase 1 previewers (`json`, `mermaid`, `zip`, `html`, `markdown`, `csv`, `image`, `code`) without regressions.
- Ensure `npm run compile` (`wxt prepare && tsc --noEmit`) passes with 0 errors after every task.

---

### Task 1: Update Resolver for SVG, Audio, and Log

**Files:**
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
    | 'code';
  export function resolveViewerType(path: string, mimeType?: string, content?: string): ViewerType;
  ```

- [x] **Step 1: Update `src/components/viewer/types.ts`**

Update `ViewerType` and `resolveViewerType`:
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
  | 'code';

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

  // 4. SVG (check before general image)
  if (p.endsWith('.svg') || m === 'image/svg+xml') {
    return 'svg';
  }

  // 5. Image
  if (
    m.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(p)
  ) {
    return 'image';
  }

  // 6. Audio
  if (
    m.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(p)
  ) {
    return 'audio';
  }

  // 7. JSON
  if (p.endsWith('.json') || m === 'application/json') {
    return 'json';
  }

  // 8. Mermaid Diagrams
  if (
    p.endsWith('.mmd') ||
    p.endsWith('.mermaid') ||
    (content && /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)\b/m.test(content))
  ) {
    return 'mermaid';
  }

  // 9. ZIP Archives
  if (
    p.endsWith('.zip') ||
    m === 'application/zip' ||
    m === 'application/x-zip-compressed'
  ) {
    return 'zip';
  }

  // 10. Log Files
  if (p.endsWith('.log') || /\.(log\.[0-9]+|log\.txt)$/i.test(p)) {
    return 'log';
  }

  // Default fallback
  return 'code';
}
```

- [x] **Step 2: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 3: Commit Task 1**

```bash
git add src/components/viewer/types.ts
git commit -m "feat(viewer): expand ViewerType to include svg, audio, and log"
```

---

### Task 2: Implement `SvgInspectorPreview` (Dual-View Canvas & XML)

**Files:**
- Create: `src/components/viewer/SvgInspectorPreview.tsx`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Consumes: `lucide-react` icons, `triggerBlobDownload` from `src/services/archive`.
- Produces:
  ```typescript
  export interface SvgInspectorPreviewProps {
    content: string;
    filePath?: string;
  }
  export const SvgInspectorPreview: React.FC<SvgInspectorPreviewProps>;
  ```

- [x] **Step 1: Create `src/components/viewer/SvgInspectorPreview.tsx`**

Key features:
1. Dual-View Mode Switcher: "Visual Canvas" vs "XML Source".
2. Header metadata badge showing extracted `width`, `height`, and `viewBox`.
3. Pan & Zoom canvas:
   - Mouse wheel zoom (scale 0.2x to 5x) with smooth GPU transform.
   - Click-and-drag pan across the canvas.
   - Zoom controls (+, -, Reset/Fit).
4. Background Mode Switcher:
   - Checkerboard (transparency grid).
   - Dark (`bg-slate-950`).
   - Light (`bg-white`).
5. Export & Copy Actions:
   - "Export PNG": draws SVG to `<canvas>` at 2x resolution and downloads via `triggerBlobDownload`.
   - "Download SVG": downloads raw `.svg` file.
   - "Copy SVG": copies XML code to clipboard.
6. In XML Source Tab:
   - Formatted monospace code view with line numbers and copy button.

- [x] **Step 2: Export in `src/components/viewer/index.ts`**

Add `export * from './SvgInspectorPreview';` to `src/components/viewer/index.ts`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 2**

```bash
git add src/components/viewer/SvgInspectorPreview.tsx src/components/viewer/index.ts
git commit -m "feat(viewer): implement SvgInspectorPreview with dual visual-canvas and XML inspector"
```

---

### Task 3: Implement `AudioPlayerPreview` (Modern Audio Studio Player)

**Files:**
- Create: `src/components/viewer/AudioPlayerPreview.tsx`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Consumes: `lucide-react` icons, `triggerBlobDownload` from `src/services/archive`.
- Produces:
  ```typescript
  export interface AudioPlayerPreviewProps {
    content: string;
    filePath?: string;
    mimeType?: string;
  }
  export const AudioPlayerPreview: React.FC<AudioPlayerPreviewProps>;
  ```

- [x] **Step 1: Create `src/components/viewer/AudioPlayerPreview.tsx`**

Key features:
1. Decode base64 data URLs (`data:audio/...;base64,...`) or binary data into a Blob and create an Object URL.
2. Clean up Object URL via `useEffect` return cleanup (`URL.revokeObjectURL(url)`).
3. Audio engine controls:
   - Play / Pause (with spacebar toggle).
   - Rewind 5s (`RotateCcw`) and Skip Forward 5s (`RotateCw`).
   - Interactive timeline scrubber with current time and total duration (`00:45 / 03:12`).
   - Playback speed selector: `0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`.
   - Volume slider (0-100%) and Mute/Unmute toggle.
   - Loop toggle button (`Repeat`).
   - Download audio file button.
4. Visual Aesthetics:
   - Centered audio player studio card with format badge.
   - Dynamic animated waveform equalizer bars when audio is playing.

- [x] **Step 2: Export in `src/components/viewer/index.ts`**

Add `export * from './AudioPlayerPreview';` to `src/components/viewer/index.ts`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 3**

```bash
git add src/components/viewer/AudioPlayerPreview.tsx src/components/viewer/index.ts
git commit -m "feat(viewer): implement AudioPlayerPreview with modern playback studio and waveform"
```

---

### Task 4: Implement `LogStreamPreview` (Smart Log Console)

**Files:**
- Create: `src/components/viewer/LogStreamPreview.tsx`
- Modify: `src/components/viewer/index.ts`

**Interfaces:**
- Consumes: `lucide-react` icons.
- Produces:
  ```typescript
  export interface LogStreamPreviewProps {
    content: string;
    filePath?: string;
  }
  export const LogStreamPreview: React.FC<LogStreamPreviewProps>;
  ```

- [x] **Step 1: Create `src/components/viewer/LogStreamPreview.tsx`**

Key features:
1. Log line parsing:
   - Extracts timestamps and log levels (`ERROR`, `WARN`, `INFO`, `DEBUG`, `OTHER`).
   - Applies semantic color badges per level.
2. Header Summary Metrics:
   - Total lines count.
   - Count badges for Errors (red), Warnings (amber), Infos (emerald), and Debugs (blue).
   - Clicking an Error/Warning badge instantly sets the active filter to that level.
3. Interactive Filtering & Search:
   - Real-time keyword search bar with match count and `<mark>` text highlighting.
   - Level filter checkboxes/pills to toggle visibility of individual levels.
   - Word-wrap toggle (wrap vs horizontal scroll).
   - Line numbers toggle.
   - Jump to Top & Jump to Bottom buttons.
   - Copy filtered logs & Copy all logs actions.

- [x] **Step 2: Export in `src/components/viewer/index.ts`**

Add `export * from './LogStreamPreview';` to `src/components/viewer/index.ts`.

- [x] **Step 3: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 4: Commit Task 4**

```bash
git add src/components/viewer/LogStreamPreview.tsx src/components/viewer/index.ts
git commit -m "feat(viewer): implement LogStreamPreview with smart level parsing and filtering"
```

---

### Task 5: Integrate Phase 2 Previewers into `entrypoints/viewer/App.tsx`

**Files:**
- Modify: `entrypoints/viewer/App.tsx`

**Interfaces:**
- Consumes: `SvgInspectorPreview`, `AudioPlayerPreview`, `LogStreamPreview`, `resolveViewerType`.

- [x] **Step 1: Update `entrypoints/viewer/App.tsx`**

1. Import `SvgInspectorPreview`, `AudioPlayerPreview`, `LogStreamPreview` from `../../src/components/viewer`.
2. In `renderContent()`, add cases to the `switch (viewerType)` statement:
   - `'svg'` -> `<SvgInspectorPreview content={file.content} filePath={file.path} />`
   - `'audio'` -> `<AudioPlayerPreview content={file.content} filePath={file.path} mimeType={file.mimeType} />`
   - `'log'` -> `<LogStreamPreview content={file.content} filePath={file.path} />`

- [x] **Step 2: Run TypeScript compile verification**

Run:
```bash
npm run compile
```
Expected: Exit code 0 with 0 errors.

- [x] **Step 3: Commit Task 5**

```bash
git add entrypoints/viewer/App.tsx
git commit -m "feat(viewer): wire svg, audio, and log previewers into viewer App"
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
