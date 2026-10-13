# Visual Web Scraper & Schema Extractor Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive visual web scraper that detects repeating element patterns via two clicks, extracts multi-column structured datasets, supports multi-page crawling, and exports cleanly into Excel (`.xlsx`), CSV, and SAM-Agent's built-in Excel Studio.

**Architecture:** A WXT content script mounts an in-page Shadow DOM toolbar with an SVG/CSS highlighting overlay. The user clicks 2 items; a Lowest Common Ancestor (LCA) pattern engine derives the repeating card container and field selectors. Users map columns (text, link URLs, image URLs) and configure pagination. A crawler engine extracts rows into memory and streams them into SAM-Agent's `generateExcelWorkbook` service and VFS.

**Tech Stack:** TypeScript, React 19, WXT (Chrome MV3), SheetJS (xlsx), Lucide React, Tailwind CSS v4.

**Spec:** [`docs/superpowers/specs/2026-10-13-visual-web-scraper-design.md`](file:///E:/VIBE-CODE-WS/CHROME-EXT\Sam-Agent\docs\superpowers\specs\2026-10-13-visual-web-scraper-design.md)

## Global Constraints
- Target platform: Chrome Extension Manifest V3 with WXT 0.19.
- Content script overlay must use Shadow DOM with zero layout shift on host pages.
- Must cleanly integrate with existing `src/services/excel-generator.ts` and `viewer.html` Excel previewer.
- Must compile with `npm run compile` (`tsc --noEmit`).

---

### Task 1: Pattern Inference Engine & Data Types

**Files:**
- Create: `entrypoints/web-scraper.content/types.ts`
- Create: `src/services/scraper-pattern.ts`
- Test: `src/services/__tests__/scraper-pattern.test.ts` (or standalone validation script)

**Interfaces:**
- Produces:
  ```typescript
  export interface ScraperField {
    id: string;
    name: string;
    selector: string;
    attribute: 'text' | 'href' | 'src' | 'value';
    type: 'string' | 'number' | 'currency' | 'url';
  }

  export interface ScraperSchema {
    containerSelector: string;
    fields: ScraperField[];
    nextButtonSelector?: string;
    paginationMode: 'none' | 'next-button' | 'infinite-scroll';
    maxPages: number;
    delayMs: number;
  }

  export function inferRepeatingPattern(
    el1: HTMLElement,
    el2: HTMLElement
  ): {
    containerSelector: string;
    relativeFieldSelector: string;
    matchedCount: number;
  };
  ```

- [ ] **Step 1: Define TypeScript types**
  Implement `entrypoints/web-scraper.content/types.ts`.

- [ ] **Step 2: Implement Pattern Inference Algorithm**
  In `src/services/scraper-pattern.ts`:
  - Calculate Lowest Common Ancestor (LCA).
  - Find container cards $C_1, C_2$ under LCA.
  - Generate container selector and relative field selector.
  - Query current DOM to compute match count.

- [ ] **Step 3: Run compilation check**
  Run `npm run compile`.

- [ ] **Step 4: Commit**
  `git add entrypoints/web-scraper.content/types.ts src/services/scraper-pattern.ts; git commit -m "feat(scraper): implement pattern inference engine and types"`

---

### Task 2: In-Page Visual Picker Toolbar & Highlighting Overlay

**Files:**
- Create: `entrypoints/web-scraper.content/ScraperToolbar.tsx`
- Create: `entrypoints/web-scraper.content/index.tsx`
- Modify: `entrypoints/background/index.ts`

**Interfaces:**
- Consumes: `inferRepeatingPattern` from Task 1.
- Produces:
  - Runtime message `START_VISUAL_SCRAPER`
  - Runtime message `SCRAPER_OPEN_STUDIO` with extracted schema and sample rows

- [ ] **Step 1: Create ScraperToolbar React component**
  Floating draggable toolbar in Shadow DOM with:
  - Step 1: Click first item.
  - Step 2: Click second matching item.
  - Pattern matched pill: `✓ [X] items detected`.
  - Buttons: "+ Add Column", "⚙️ Pagination", "🚀 Extract Data", "Cancel".

- [ ] **Step 2: Implement Content Script & SVG Highlight Overlay**
  In `entrypoints/web-scraper.content/index.tsx`:
  - Hover outline over candidate elements.
  - Solid emerald highlight over all matching container cards.
  - Sub-field selection handler (inspects `<a>`, `<img>`, or text).

- [ ] **Step 3: Update background message routing**
  In `entrypoints/background/index.ts`, handle `START_VISUAL_SCRAPER` and inject `web-scraper.content.js`.

- [ ] **Step 4: Verify with compilation check**
  Run `npm run compile`.

- [ ] **Step 5: Commit**
  `git add entrypoints/web-scraper.content/ entrypoints/background/; git commit -m "feat(scraper): implement in-page picker toolbar and overlay"`

---

### Task 3: Scraper Engine & Multi-Page Crawler

**Files:**
- Create: `src/services/scraper-engine.ts`

**Interfaces:**
- Consumes: `ScraperSchema` from Task 1.
- Produces:
  ```typescript
  export interface ScrapeResult {
    rows: Record<string, any>[];
    totalRows: number;
    pagesCrawled: number;
    domain: string;
  }

  export function extractPageRows(
    doc: Document,
    schema: ScraperSchema
  ): Record<string, any>[];

  export function runMultiPageCrawl(
    tabId: number,
    schema: ScraperSchema,
    onProgress: (status: { page: number; rows: number }) => void
  ): Promise<ScrapeResult>;
  ```

- [ ] **Step 1: Implement DOM row extractor with lazy image fallbacks**
  In `src/services/scraper-engine.ts`:
  - Queries containers.
  - For each container, extracts mapped fields.
  - Resolves lazy image attributes (`data-src`, `data-original`, `srcset`).

- [ ] **Step 2: Implement multi-page crawler loop**
  - Handles Next button clicking with polite throttle (`delayMs`).
  - Handles infinite scroll walking.
  - Halts on error, disabled next button, or `maxPages` limit.

- [ ] **Step 3: Verify compilation**
  Run `npm run compile`.

- [ ] **Step 4: Commit**
  `git add src/services/scraper-engine.ts; git commit -m "feat(scraper): implement scraper engine and multi-page crawler"`

---

### Task 4: Scraper Studio Results Modal & Export UI

**Files:**
- Create: `src/components/scraper/ScraperStudioModal.tsx`
- Modify: `src/components/tools/ToolStudioView.tsx` (add Visual Scraper launch button)
- Modify: `src/components/chat/ChatHeader.tsx` (optional quick access)

**Interfaces:**
- Consumes: `ScrapeResult` from `src/services/scraper-engine.ts`.
- Consumes: `generateExcelWorkbook` from `src/services/excel-generator.ts`.

- [ ] **Step 1: Create ScraperStudioModal component**
  - Table preview of extracted rows with search & pagination.
  - Column headers with editable labels.
  - "Open in Excel Studio" button (writes `.xlsx` to VFS and launches viewer).
  - "Download .xlsx" and "Download .csv" buttons.

- [ ] **Step 2: Add Visual Scraper launch trigger in ToolStudioView**
  Add "Visual Scraper" button beside "Record Workflow".

- [ ] **Step 3: Verify compilation**
  Run `npm run compile`.

- [ ] **Step 4: Commit**
  `git add src/components/scraper/ src/components/tools/; git commit -m "feat(scraper): create ScraperStudioModal and UI integration"`

---

### Task 5: End-to-End Build, Docs & Version Bump (v4.7.1)

**Files:**
- Modify: `package.json` (bump to `4.7.1`)
- Modify: `README.md` (add v4.7.1 Visual Web Scraper documentation)

- [ ] **Step 1: Update version in package.json to 4.7.1**
- [ ] **Step 2: Update README.md with v4.7.1 release notes**
- [ ] **Step 3: Run full production build (`npm run build`)**
- [ ] **Step 4: Commit and push**
