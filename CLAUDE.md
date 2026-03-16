# CLAUDE.md — PDF Overlay Compare

## Project Overview

A single-file web application for comparing two PDF document revisions via color-coded overlays. Built as a self-contained HTML file with all dependencies inlined (PDF.js, jsPDF, JSZip).

## Architecture

- **Output**: `pdf_overlay_compare.html` — single self-contained file (~2MB), open directly in a browser
- **Source**: Unpacked into `src/` for readability; `build.sh` packs back into the single HTML
- **Inlined libraries**: PDF.js (rendering), jsPDF (PDF export), JSZip (ZIP export)
- **Rendering**: HTML5 Canvas 2D context with pixel-level recoloring
- **State**: Global variables, no framework — vanilla JS

## Key Concepts

- **Overlay mode**: Both PDFs drawn on one canvas with configurable opacity/color
- **Side-by-side mode**: PDFs rendered next to each other for comparison
- **Recoloring**: Dark pixels in each PDF are tinted to a user-chosen color (blue for old, red for new)
- **Per-page settings**: Offsets, scales, rotations, and affine transforms stored per page in `pageOffsets` / `pageScales` / `pageRotations` / `pageTransforms`
- **3-point alignment**: Pick 3 matching points on old & new PDFs to compute an affine transform (translation, rotation, scale, shear)
- **LRU cache**: Rendered page ImageData cached with memory limit and eviction
- **Presets**: Full settings (including PDF buffers as base64) saved/loaded as JSON

## File Structure

```
pdf_overlay_compare.html     # Built output (do not edit directly)
build.sh                     # Packs src/ into the single HTML file
src/
├── index.html               # HTML template with __INJECT__ markers
├── styles.css               # CSS design system (dark theme, CSS vars)
├── body.html                # HTML structure (sidebar, canvas, thumbnails)
├── app.js                   # Application JavaScript (~1900 lines)
└── vendor/
    ├── pdfjs.js             # PDF.js library
    ├── jspdf.js             # jsPDF library
    ├── jszip.js             # JSZip library
    └── pdfjs-worker-blob.js # PDF.js worker (loaded via Blob URL)
```

## Build

Run `./build.sh` to regenerate `pdf_overlay_compare.html` from source files.
Edit files in `src/`, then rebuild. The build produces a byte-identical output.

## CSS Design System

- Theme vars: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text-dim`, `--blue`, `--red`
- Fonts: DM Sans (UI), JetBrains Mono (values/code)
- Layout: Fixed 280px sidebar + flexible canvas area + collapsible 140px thumbnail panel

## Application Code Sections (src/app.js)

| Section | Purpose |
|---------|---------|
| Global state | `pdfOld/pdfNew`, `cacheOld/cacheNew`, `lruOrder`, `pageOffsets`, `pageScales`, `pageTransforms` |
| Defaults/presets | `getDefaults()`, `applyDefaults()`, `savePreset()`, `loadPreset()` |
| Color utilities | `hexToRgb()`, `hexToDim()`, `syncColors()` |
| Upload & compare | `loadPdf()`, `runCompare()` |
| Render pipeline | `renderPdfPage()` → `renderPage()` → `recolor()` → `composite()` |
| Cache management | `touchLRU()`, `evictPage()`, `evictUntilFits()`, `estimatePageBytes()` |
| Compositing | `composite()` (overlay & side-by-side), `recolorAndComposite()` (RAF-gated) |
| Zoom/pan | `applyZoom()`, `doZoom()`, `zoomFit()`, drag handlers |
| Transform (scale/offset/rotation/align) | `_applyScale()`, `applyOffset()`, `nudgeOffset()`, `applyRotation()`, `snapAffineRotation()`, `startAlign3()`, `solveAffine()`, `computeAndApplyAlign3()` |
| Page navigation | `changePage()`, `goToPage()`, keyboard shortcuts |
| Thumbnails | `toggleThumbs()`, `buildThumbSlots()`, `renderMissingThumbs()` |
| Export | `exportPNG()`, `exportPDF()`, `exportAllPDF()`, `exportAllPNG()` |

## Development Notes

- All DOM lookups use `document.getElementById()` — no cached references
- Rendering is gated through `requestAnimationFrame` via `_compositeScheduled` flag
- Two reusable temp canvases (`_tmpCanvasA/B`) reduce GC pressure
- Cache memory tracked incrementally via `_trackedCacheBytes`
- Keyboard shortcuts: Left/Right arrows, PageUp/Down, Home/End for navigation

## Sidebar Sections

| Section | Controls |
|---------|----------|
| Input Files | Upload zones for old/new PDFs |
| Display Mode | Overlay vs side-by-side toggle |
| Visibility | Old/new visibility toggles |
| Colors | Color pickers + preset grid |
| Render Quality | PPI dropdown (72–300) |
| Opacity | Sliders for old/new (0–100%) |
| **Transform** | Unified section with 4 sub-panels: |
|  — Scale | Per-layer scale (old/new, 10–500%) |
|  — Translation | X/Y offset with sliders + nudge buttons |
|  — Rotation | Manual rotation in degrees (number input) |
|  — 3-Point Align | Pick 3 point pairs → affine transform (snaps <1° rotation to 0°) |
| Page Navigation | Prev/next, page input, cache controls |
| Legend | Color meanings |
| Save / Load | Preset export/import, PNG/PDF/ZIP export |

## Known Issues

- Memory tracking for thumbnail data URLs uses string `.length` instead of byte size
- LRU array uses `indexOf()` which is O(n) per access
- No input validation on PPI (user can set extreme values)
- Export-all modifies global `currentPage` state without try-finally guard
- Thumbnail rendering doesn't reflect per-page scale settings

## Testing

No automated tests. Manual testing:
1. Open the HTML file in a modern browser (Chrome/Edge recommended)
2. Upload two PDF files (old and new revisions)
3. Click "Compare" to render the overlay
4. Test overlay vs side-by-side modes, zoom, pan, page navigation
5. Test export (PNG, PDF, ZIP) and preset save/load
6. Test 3-point alignment: pick 3 points on old, then 3 on new, verify transform applies
7. Test alignment with page scope (this page / all pages), clear, and Escape to cancel
