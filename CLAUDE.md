# CLAUDE.md — PDF Overlay Compare

## Project Overview

A single-file web application for comparing two PDF document revisions via color-coded overlays. Built as a self-contained HTML file with all dependencies inlined (PDF.js, jsPDF, JSZip).

## Architecture

- **Single HTML file**: `pdf_overlay_compare.html` (~1960 lines, ~1.9MB)
- **No build system** — open directly in a browser
- **Inlined libraries**: PDF.js (rendering), jsPDF (PDF export), JSZip (ZIP export)
- **Rendering**: HTML5 Canvas 2D context with pixel-level recoloring
- **State**: Global variables, no framework — vanilla JS

## Key Concepts

- **Overlay mode**: Both PDFs drawn on one canvas with configurable opacity/color
- **Side-by-side mode**: PDFs rendered next to each other for comparison
- **Recoloring**: Dark pixels in each PDF are tinted to a user-chosen color (blue for old, red for new)
- **Per-page settings**: Offsets and scales stored per page number in `pageOffsets` / `pageScales`
- **LRU cache**: Rendered page ImageData cached with memory limit and eviction
- **Presets**: Full settings (including PDF buffers as base64) saved/loaded as JSON

## File Structure

```
pdf_overlay_compare.html   # The entire application
├── <style>                # Lines 7-173: CSS design system (dark theme, CSS vars)
├── <script> (libraries)   # Lines 176-627: Inlined PDF.js, jsPDF, JSZip
├── <body>                 # Lines 628-821: HTML structure (sidebar, canvas, thumbnails)
└── <script> (app)         # Lines 823-1960: Application JavaScript
```

## CSS Design System

- Theme vars: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text-dim`, `--blue`, `--red`
- Fonts: DM Sans (UI), JetBrains Mono (values/code)
- Layout: Fixed 280px sidebar + flexible canvas area + collapsible 140px thumbnail panel

## Application Code Sections (lines 823+)

| Section | Purpose |
|---------|---------|
| Global state | `pdfOld/pdfNew`, `cacheOld/cacheNew`, `lruOrder`, `pageOffsets`, `pageScales` |
| Defaults/presets | `getDefaults()`, `applyDefaults()`, `savePreset()`, `loadPreset()` |
| Color utilities | `hexToRgb()`, `hexToDim()`, `syncColors()` |
| Upload & compare | `loadPdf()`, `runCompare()` |
| Render pipeline | `renderPdfPage()` → `renderPage()` → `recolor()` → `composite()` |
| Cache management | `touchLRU()`, `evictPage()`, `evictUntilFits()`, `estimatePageBytes()` |
| Compositing | `composite()` (overlay & side-by-side), `recolorAndComposite()` (RAF-gated) |
| Zoom/pan | `applyZoom()`, `doZoom()`, `zoomFit()`, drag handlers |
| Scale/offset | `_applyScale()`, `applyOffset()`, `nudgeOffset()` |
| Page navigation | `changePage()`, `goToPage()`, keyboard shortcuts |
| Thumbnails | `toggleThumbs()`, `buildThumbSlots()`, `renderMissingThumbs()` |
| Export | `exportPNG()`, `exportPDF()`, `exportAllPDF()`, `exportAllPNG()` |

## Development Notes

- All DOM lookups use `document.getElementById()` — no cached references
- Rendering is gated through `requestAnimationFrame` via `_compositeScheduled` flag
- Two reusable temp canvases (`_tmpCanvasA/B`) reduce GC pressure
- Cache memory tracked incrementally via `_trackedCacheBytes`
- Keyboard shortcuts: Left/Right arrows, PageUp/Down, Home/End for navigation

## Known Issues

- Memory tracking for thumbnail data URLs uses string `.length` instead of byte size
- LRU array uses `indexOf()` which is O(n) per access
- No input validation on PPI (user can set extreme values)
- Export-all modifies global `currentPage` state without try-finally guard
- Side-by-side mode ignores negative X offset on the new layer
- Thumbnail rendering doesn't reflect per-page scale settings

## Testing

No automated tests. Manual testing:
1. Open the HTML file in a modern browser (Chrome/Edge recommended)
2. Upload two PDF files (old and new revisions)
3. Click "Compare" to render the overlay
4. Test overlay vs side-by-side modes, zoom, pan, page navigation
5. Test export (PNG, PDF, ZIP) and preset save/load
