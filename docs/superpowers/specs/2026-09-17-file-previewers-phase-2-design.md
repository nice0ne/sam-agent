# Specification: Rich File Previewers (Phase 2 - SVG, Audio, Log Stream)

- **Date:** 2026-09-17
- **Topic:** Extension of SAM-Agent Artifact Viewer with Media & System Logs
- **Phase:** Phase 2 (Media & System Logs)
- **Status:** Validated Design

---

## 1. Executive Summary & Goals

Building upon Phase 1 (which introduced JSON, Mermaid, and ZIP previewers), Phase 2 expands the Artifact Viewer (`/viewer.html`) with specialized previews for visual vector graphics, audio files, and system execution logs:
1. **SVG Vector Inspector (`.svg`)**: Dual-mode preview offering an interactive visual vector canvas (with zoom, pan, and background toggles) alongside an XML source code inspector with PNG export.
2. **Audio & Voice Player (`.mp3`, `.wav`, `.ogg`, `.m4a`, etc.)**: A modern, self-contained audio studio player featuring scrubber controls, playback speed selection (0.5x to 2x), volume/mute control, animated equalizer visualizer, and local download.
3. **Smart Log Console (`.log`)**: An intelligent log stream viewer featuring automatic log level parsing (ERROR, WARN, INFO, DEBUG), metric summary badges, interactive level filtering, live text search, line numbers, word-wrap toggles, and top/bottom quick jumps.

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
  | 'svg'       // Phase 2
  | 'audio'     // Phase 2
  | 'log'       // Phase 2
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
  // SVG (explicitly resolved before general image)
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
├── ... (Existing Phase 1 components)
├── SvgInspectorPreview.tsx   (New - Phase 2)
├── AudioPlayerPreview.tsx    (New - Phase 2)
├── LogStreamPreview.tsx      (New - Phase 2)
└── index.ts                  (Central Barrel Export)
```

---

## 3. Detailed Component Specifications

### 3.1 `SvgInspectorPreview` (`src/components/viewer/SvgInspectorPreview.tsx`)

#### Props
```typescript
export interface SvgInspectorPreviewProps {
  content: string;
  filePath?: string;
}
```

#### Capabilities
1. **Dual-View Switcher**:
   - Tab 1: **Visual Canvas (Rendered Vector)**: Interactive vector view.
   - Tab 2: **XML Source**: Formatted monospace XML code view with syntax coloring and quick copy.
2. **Dimension Metadata**:
   - Parses `width`, `height`, and `viewBox` attributes from root `<svg>` tag and displays them in a header badge (e.g. `24 × 24 px | viewBox: 0 0 24 24`).
3. **Interactive Canvas**:
   - Mouse wheel zoom (scale 0.2x to 5.0x) and drag-to-pan with GPU transform.
   - Control buttons: Zoom In, Zoom Out, Reset (1:1 / fit-to-screen).
4. **Canvas Background Switcher**:
   - **Checkerboard**: High-contrast transparency grid pattern.
   - **Dark**: Dark slate background (`bg-slate-950`).
   - **Light**: Pure white background (`bg-white`).
5. **Export & Actions**:
   - **Export PNG**: Draws SVG onto an HTML5 canvas at 2x resolution and downloads via `triggerBlobDownload`.
   - **Download SVG**: Downloads the raw vector file.
   - **Copy SVG**: Copies raw XML to clipboard with feedback checkmark.

---

### 3.2 `AudioPlayerPreview` (`src/components/viewer/AudioPlayerPreview.tsx`)

#### Props
```typescript
export interface AudioPlayerPreviewProps {
  content: string;
  filePath?: string;
  mimeType?: string;
}
```

#### Capabilities
1. **Source Loading & Memory Safety**:
   - Resolves Base64 Data URLs (`data:audio/...;base64,...`) or binary byte sequences into a browser Object URL (`URL.createObjectURL(blob)`).
   - Automatically revokes Object URLs on component unmount to prevent memory leaks.
2. **Playback Engine & Controls**:
   - Native HTML5 Audio element instance managed via React refs.
   - Play/Pause toggle with Spacebar keyboard shortcut support.
   - Skip Back 5s and Skip Forward 5s controls.
   - Timeline Scrubber: Interactive progress bar with time display (`01:15 / 03:42`).
   - Playback Speed Selector: Toggle between `0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, and `2.0x`.
   - Volume Control: Smooth slider (0-100%) and instant mute toggle.
   - Loop Toggle: Replay audio seamlessly upon completion.
   - Download Button: Triggers immediate local file download.
3. **Visual Aesthetics**:
   - Centered album card displaying filename, format badge (MP3, WAV, etc.), and file size.
   - Animated Equalizer Waveform: Spectrum bars animate dynamically while audio is actively playing.

---

### 3.3 `LogStreamPreview` (`src/components/viewer/LogStreamPreview.tsx`)

#### Props
```typescript
export interface LogStreamPreviewProps {
  content: string;
  filePath?: string;
}
```

#### Capabilities
1. **Intelligent Log Line Parsing**:
   - Splits content into lines and parses level badges:
     - `ERROR` / `FATAL` / `FAIL`: Red badge and subtle row highlight.
     - `WARN` / `WARNING`: Amber badge and subtle row highlight.
     - `INFO`: Emerald badge.
     - `DEBUG` / `TRACE`: Cyan/Blue badge.
     - Other / Unlabeled: Muted monospaced text.
2. **Metrics & Stats Badges**:
   - Displays count badges for Total Lines, Errors, Warnings, Infos, and Debugs.
   - Clicking an Error or Warning badge instantly sets the active filter to isolate those messages.
3. **Interactive Filtering & Navigation**:
   - **Live Search Bar**: Text search with real-time match highlighting (`<mark>`) and matched line count readout.
   - **Level Filter Checkboxes**: Toggle visibility of individual levels (`ERROR`, `WARN`, `INFO`, `DEBUG`, `OTHER`).
   - **Word Wrap Toggle**: Switch between soft-wrapping long lines or horizontal scrolling.
   - **Line Numbers Toggle**: Show/hide line number gutter.
   - **Quick Jumps**: "Jump to Top" and "Jump to Bottom" buttons.
   - **Copy Actions**: Copy Filtered Lines or Copy Entire Log.

---

## 4. Verification & Testing Plan

1. **Static Typecheck**:
   - Run `npm run compile` to verify zero TypeScript compilation errors.
2. **Functional Scenarios**:
   - **SVG**: Test with vector icons and multi-colored illustrations, test background toggles, zoom/pan, XML source tab, and PNG export.
   - **Audio**: Test with MP3/WAV audio, test playback, scrubber seek, speed toggles, mute, and loop.
   - **Log**: Test with multiline logs containing mixed ERROR/WARN/INFO lines, verify level filter toggles, search matches, and line numbers.
3. **Production Build**:
   - Run `npm run build` to ensure the final bundle passes all WXT Manifest V3 constraints.
