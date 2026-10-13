# Architecture & Design Specification: Visual Web Scraper & Schema Extractor Studio

**Date:** 2026-10-13  
**Status:** Approved  
**Target Version:** v4.7.1  
**Scope:** Sub-Project 2 of Automation Enhancements (Visual Web Scraper & Schema Extractor Studio)

---

## 1. Executive Summary

The **Visual Web Scraper & Schema Extractor Studio** provides an interactive, zero-code tool for extracting repeating tabular and catalog data (products, search results, real estate listings, job postings) directly from any webpage. Using a two-click visual pattern inference algorithm, the tool automatically detects repeating card containers, derives relative child selectors, enables mapping multiple columns (Text, Links, Images), supports multi-page crawling (Next button & Infinite Scroll), and streams the extracted dataset into SAM-Agent's native **Excel Spreadsheet Studio** (`.xlsx`), CSV, and JSON files in the Virtual File System.

---

## 2. Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                       Active Web Page                        │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐   │
│   │ entrypoints/web-scraper.content                      │   │
│   │   ├── Shadow DOM Floating Toolbar                    │   │
│   │   │     (Pick Item 1, Pick Item 2, Add Columns)      │   │
│   │   ├── Visual Element Highlighter Overlay             │   │
│   │   └── Pattern Inference Engine (LCA & Relative Path) │   │
│   └──────────────────────────┬───────────────────────────┘   │
└──────────────────────────────┼───────────────────────────────┘
                               │ Schema & Extracted Rows
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  Background Service Worker                   │
│   - Coordinates multi-page pagination & scroll triggers      │
│   - Manages crawl limits (maxPages, maxItems, delay)         │
│   - Aggregates collected rows in session memory              │
└──────────────────────────────┬───────────────────────────────┘
                               │ Extracted Dataset
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                 Side Panel / Scraper Studio                  │
│   ├── src/services/scraper-engine.ts                         │
│   │     - DOM extraction executor                            │
│   │     - Attribute & image URL fallback resolver            │
│   │     - Next button & scroll handler                       │
│   └── src/components/scraper/ScraperStudioModal.tsx          │
│         - Live Data Table Preview & Column Renaming          │
│         - Export to Excel (.xlsx) via excel-generator.ts     │
│         - Export to CSV / JSON in VFS (/workspace/)          │
│         - 1-Click Launch into Excel Spreadsheet Studio       │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Component Specifications

### 3.1. In-Page Visual Picker (`entrypoints/web-scraper.content/`)
* **Mounting**: Injected on-demand using WXT `createShadowRootUi` with `anchor: 'body'`.
* **Visual States**:
  * **Picking Item 1**: Hovered elements glow purple. Clicking records element $E_1$.
  * **Picking Item 2**: Hovered elements glow purple. Clicking records element $E_2$ and runs the **Two-Click Pattern Inference Algorithm**.
  * **Pattern Matched**: All detected repeating cards glow with an emerald outline and display a floating pill: `✓ [X] items detected on this page`.
  * **Adding Sub-Fields**: User clicks any element inside any matched card to add a column.
    * If `<a>` tag: prompts choice of "Link Text" or "Link URL (`href`)".
    * If `<img>` tag: automatically selects image URL (`src`, `data-src`, or `srcset`).
    * If regular element: extracts trimmed text content.
  * **Pagination Setup**: User can optionally click a "Next Page" button or toggle "Infinite Scroll".

### 3.2. Two-Click Pattern Inference Engine (`src/services/scraper-pattern.ts`)
1. Given $E_1$ and $E_2$:
2. Traverse ancestor chains to find the Lowest Common Ancestor (LCA).
3. Identify the two direct child containers of LCA: $C_1$ and $C_2$.
4. Generate the **Container Selector**:
   * Uses class names, tag hierarchies, or `:nth-child` pattern to match all sibling cards under LCA.
5. Generate the **Relative Field Selector**:
   * Computes the relative selector from container $C$ to field $E$.
6. Validates by querying `document.querySelectorAll(containerSelector)` to ensure at least 2 cards are returned.

### 3.3. Multi-Page Crawler Engine (`src/services/scraper-engine.ts`)
* **Single Page Mode**: Extracts all matching elements from current DOM and finishes.
* **Next Button Mode**:
  * Extracts current page.
  * Finds Next button via stored selector.
  * Clicks Next button, waits for DOM change or page navigation with a configurable polite delay (`800ms - 2000ms`).
  * Recursively extracts until `page >= maxPages` or Next button is disabled/missing.
* **Infinite Scroll Mode**:
  * Scrolls the window in increments (`800px`), waits 1000ms for lazy content, and extracts newly added items.
  * Stops when `rowCount >= maxItems` or when 3 consecutive scrolls yield 0 new items.

### 3.4. Scraper Studio Modal & Export Pipeline (`src/components/scraper/ScraperStudioModal.tsx`)
* **Live Interactive Table**: Displays extracted rows with sorting, search filtering, and row count badge.
* **Column Customizer**: Editable column headers and data type indicators (`text`, `number`, `url`, `image`).
* **Export Options**:
  * **Excel (.xlsx)**: Calls `generateExcelWorkbook()` with styled headers and auto-calculated column widths. Saved to `/workspace/scraped_<domain>_<timestamp>.xlsx`.
  * **Open in Excel Studio**: Automatically opens the generated workbook in SAM-Agent's native Excel previewer (`viewer.html?path=...`).
  * **Download CSV / JSON**: Immediate local browser download or copy to clipboard.

---

## 4. State Management & Runtime Messages

* `START_VISUAL_SCRAPER`: Background injects `web-scraper.content.js`.
* `SCRAPER_PATTERN_DETECTED`: Content script notifies panel of matched item count and proposed schema.
* `SCRAPER_EXTRACT_PAGE`: Dispatches page extraction to active tab.
* `SCRAPER_EXTRACT_COMPLETE`: Content script delivers extracted `Record<string, any>[]` rows to panel.
* `SCRAPER_CANCEL`: Content script removes Shadow DOM overlay and highlights.

---

## 5. Verification & Testing Plan

1. **Unit Tests (`scraper-pattern.test.ts`)**:
   * Verify Lowest Common Ancestor (LCA) resolution across nested DOM structures.
   * Verify relative child selector computation.
2. **Integration Tests**:
   * Verify two-click selection on sample ecommerce and blog lists.
   * Verify multi-page crawl halts at `maxPages` limit.
   * Verify `generateExcelWorkbook` creates a valid multi-column `.xlsx` spreadsheet in VFS.
   * Verify Excel Spreadsheet Studio preview loads the scraped file without errors.
