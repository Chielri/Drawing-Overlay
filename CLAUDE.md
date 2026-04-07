# CLAUDE.md — PDF Overlay Compare

## Project Overview

A single-file web application for comparing two PDF document revisions via color-coded overlays. Built as a self-contained HTML file with all dependencies inlined (PDF.js, jsPDF, JSZip).

## Architecture

- **Output**: `pdf_overlay_compare.html` — single self-contained file (~2MB), open directly in a browser
- **Source**: Unpacked into `src/` for readability; `build.sh` packs back into the single HTML
- **Inlined libraries**: PDF.js (rendering), jsPDF (PDF export), JSZip (ZIP export)
- **Rendering**: HTML5 Canvas 2D context with pixel-level recoloring
- **State**: Global variables, no framework — vanilla JS

## File Structure

```
pdf_overlay_compare.html     # Built output (do not edit directly)
build.sh                     # Packs src/ into the single HTML file
src/
├── index.html               # HTML template with __INJECT__ markers
├── styles.css               # CSS design system (dark theme, CSS vars)
├── body.html                # HTML structure (sidebar, canvas, bottom bar, thumbnails)
├── app.js                   # Main entry point — imports and initializes modules
├── modules/
│   ├── state.js             # Global state, defaults, preset save/load
│   ├── utils.js             # Color utilities (hexToRgb, hexToDim, syncColors, blendOverlap)
│   ├── pdf.js               # PDF loading (loadPdf, runCompare)
│   ├── cache.js             # LRU cache (touchLRU, evictPage, evictUntilFits, estimatePageBytes)
│   ├── render.js            # Render pipeline (renderPdfPage → renderPage → recolor)
│   ├── composite.js         # Compositing (composite, recolorAndComposite, blend modes)
│   ├── zoom.js              # Zoom/pan (applyZoom, doZoom, zoomFit, drag handlers)
│   ├── crosshair.js         # Crosshair overlay (drawXhair, clearXhair, RAF-throttled)
│   ├── transform.js         # Scale, offset, rotation, nudge — clears affine on manual edit
│   ├── align.js             # 3-point alignment (startAlign3, solveAffine, snapAffineRotation)
│   ├── drawing.js           # Drawing tools & strokes (initDrawing, renderDrawLayer, undo/clear)
│   ├── navigation.js        # Page navigation, keyboard shortcuts, thumbnails
│   └── export.js            # PNG/PDF/ZIP export (single page & batch)
└── vendor/
    ├── pdfjs.js             # PDF.js library
    ├── jspdf.js             # jsPDF library
    ├── jszip.js             # JSZip library
    └── pdfjs-worker-blob.js # PDF.js worker (loaded via Blob URL)
```

## Build

Run `./build.sh` to regenerate `pdf_overlay_compare.html` from source files.
Edit files in `src/`, then rebuild.

**Build must concatenate modules in dependency order** — the build script handles this. No ES module imports; modules communicate through shared global state and the `DOM` object.

## Refactoring Plan

The original `app.js` (~2700 lines) is being split into focused modules under `src/modules/`. Goals:

1. **One concern per file** — each module owns a clear feature area
2. **Shared state via `state.js`** — all global variables live here; other modules read/write them
3. **DOM refs stay in `DOM` object** — cached at startup, passed where needed
4. **No new frameworks or build tools** — still vanilla JS, still concatenated into one `<script>`
5. **Preserve all existing behavior** — refactor only, no feature changes

### Module Dependency Order

```
state.js       → no deps (defines globals)
utils.js       → state
cache.js       → state
render.js      → state, cache, utils
composite.js   → state, render, utils
zoom.js        → state, composite
crosshair.js   → state
transform.js   → state, composite
align.js       → state, transform, composite
drawing.js     → state, composite
navigation.js  → state, composite, drawing
export.js      → state, render, drawing
app.js         → all modules (init, event binding)
```

## Key Concepts

- **Overlay mode**: Both PDFs on one canvas with configurable opacity/color
- **Side-by-side mode**: PDFs rendered next to each other
- **Blend modes**: Multiply (default) or alpha overlay with configurable layer order
- **Recoloring**: Dark pixels tinted to user-chosen color (blue=old, red=new)
- **Per-page settings**: Offsets, scales, rotations, affine transforms per page
- **3-point alignment**: 3 matching point pairs → raw affine transform (snaps rotation <1° to 0°)
- **Drawing annotations**: Single layer per page, rendered on overlay + SBS panes
- **Crosshair**: RAF-throttled, viewport-sized canvas in sticky wrapper, drag-suppressed
- **LRU cache**: Rendered ImageData cached with memory limit and eviction
- **Presets**: Full settings (including PDF buffers as base64) saved/loaded as JSON

## Development Notes

- DOM refs cached in `DOM` object at startup via `$()` helper
- Rendering gated through `requestAnimationFrame` via `_compositeScheduled` flag
- Two reusable temp canvases (`_tmpCanvasA/B`) reduce GC pressure
- Cache memory tracked incrementally via `_trackedCacheBytes`
- Crosshair RAF-throttled (`_xhairRAF`), suppressed during drag (`_isDragging`), lives in sticky wrapper inside `canvas-area`
- 3-point alignment stores raw affine in `pageTransforms` with sN pre-baked into (a,b,c,d). composite() applies affine directly. Manual edits clear affine → standard path
- Drawing: single stroke list per page (`drawStrokes[pageNum]`), rendered on all visible canvases
- Keyboard shortcuts: V=pan, P=pen, L=line, A=arrow, H=highlight, R=rect, T=text, E=eraser, Ctrl+Z=undo, arrows/PageUp/Down/Home/End for nav, Escape cancels alignment

## CSS Design System

- Theme vars: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text-dim`, `--blue`, `--red`
- Fonts: DM Sans (UI), JetBrains Mono (values/code)
- Layout: Fixed 280px sidebar + flexible canvas area + collapsible 140px thumbnail panel
- Bottom bar: Fixed position, draw toolbar + page navigation

## Known Issues

- Memory tracking for thumbnail data URLs uses string `.length` instead of byte size
- LRU array uses `indexOf()` — O(n) per access
- No input validation on PPI (user can set extreme values)
- Export-all modifies global `currentPage` state without try-finally guard

## Testing

No automated tests. Manual testing:
1. Open the HTML file in a modern browser (Chrome/Edge recommended)
2. Upload two PDF files (old and new revisions)
3. Click "Compare" to render the overlay
4. Test overlay vs side-by-side modes, zoom, pan, page navigation
5. Test blend modes, drawing tools, export, presets, 3-point alignment
6. Test that manual offset/scale/rotation edits after alignment clear the affine
7. Test thumbnails update on new document upload
