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
- **Blend modes**: Multiply (default) or alpha overlay with configurable layer order
- **Recoloring**: Dark pixels in each PDF are tinted to a user-chosen color (blue for old, red for new)
- **Per-page settings**: Offsets, scales, rotations, and affine transforms stored per page in `pageOffsets` / `pageScales` / `pageRotations` / `pageTransforms`
- **3-point alignment**: Pick 3 matching points on old & new PDFs → raw affine transform stored directly (avoids decomposition errors). Decomposed values shown in UI for reference. Snaps rotation < 1° to 0°
- **Drawing annotations**: Single annotation layer per page, rendered on both overlay and SBS panes. Supports pen, line, arrow, highlighter, rectangle, text, eraser tools with per-tool cursors
- **Crosshair**: Toggleable crosshair overlay, RAF-throttled, viewport-sized canvas in sticky wrapper (not inside zoomed container) for performance. Suppressed during drag-to-pan
- **LRU cache**: Rendered page ImageData cached with memory limit and eviction
- **Thumbnails**: Show new document only, cached on upload, rebuilt when new PDF uploaded
- **Presets**: Full settings (including PDF buffers as base64) saved/loaded as JSON, drag-and-drop JSON support

## File Structure

```
pdf_overlay_compare.html     # Built output (do not edit directly)
build.sh                     # Packs src/ into the single HTML file
src/
├── index.html               # HTML template with __INJECT__ markers
├── styles.css               # CSS design system (dark theme, CSS vars)
├── body.html                # HTML structure (sidebar, canvas, bottom bar, thumbnails)
├── app.js                   # Application JavaScript (~2300 lines)
└── vendor/
    ├── pdfjs.js             # PDF.js library
    ├── jspdf.js             # jsPDF library
    ├── jszip.js             # JSZip library
    └── pdfjs-worker-blob.js # PDF.js worker (loaded via Blob URL)
```

## Build

Run `./build.sh` to regenerate `pdf_overlay_compare.html` from source files.
Edit files in `src/`, then rebuild.

## CSS Design System

- Theme vars: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text-dim`, `--blue`, `--red`
- Fonts: DM Sans (UI), JetBrains Mono (values/code)
- Layout: Fixed 280px sidebar + flexible canvas area + collapsible 140px thumbnail panel
- Bottom bar: Fixed position, contains draw toolbar + page navigation

## Application Code Sections (src/app.js)

| Section | Purpose |
|---------|---------|
| Global state | `pdfOld/pdfNew`, `cacheOld/cacheNew`, `lruOrder`, `pageOffsets`, `pageScales`, `pageTransforms`, `drawStrokes`, `blendMode`, `xhairEnabled` |
| Defaults/presets | `getDefaults()`, `applyDefaults()`, `savePreset()`, `loadPreset()` |
| Color utilities | `hexToRgb()`, `hexToDim()`, `syncColors()`, `blendOverlap()` |
| Upload & compare | `loadPdf()`, `runCompare()` |
| Render pipeline | `renderPdfPage()` → `renderPage()` → `recolor()` → `composite()` |
| Cache management | `touchLRU()`, `evictPage()`, `evictUntilFits()`, `estimatePageBytes()` |
| Compositing | `composite()` (overlay with multiply/alpha + side-by-side), `recolorAndComposite()` (RAF-gated) |
| Zoom/pan | `applyZoom()`, `doZoom()`, `zoomFit()`, drag handlers (IIFE scoped) |
| Blend mode | `setBlendMode()`, `setAlphaMain()` — multiply vs alpha overlay |
| Crosshair | `drawXhair()`, `clearXhair()`, `_drawXhairImmediate()` — RAF-throttled, viewport-sized canvas, drag-suppressed |
| Transform | `_applyScale()`, `applyOffset()`, `nudgeOffset()`, `applyRotation()` — clear affine on manual edit |
| 3-Point Align | `startAlign3()`, `solveAffine()`, `snapAffineRotation()`, `computeAndApplyAlign3()` — stores raw affine |
| Drawing | `initDrawing()`, `renderDrawLayer()`, `drawStrokeToCtx()`, `drawUndo()`, `drawClear()` — single layer per page |
| Page navigation | `changePage()`, `goToPage()`, keyboard shortcuts |
| Thumbnails | `toggleThumbs()`, `buildThumbSlots()`, `renderMissingThumbs()` — new doc only |
| Export | `exportPNG()`, `exportPDF()`, `exportAllPDF()`, `exportAllPNG()`, `collectAnnotationsForPage()` |

## Development Notes

- DOM refs cached in `DOM` object at startup via `$()` helper
- Rendering is gated through `requestAnimationFrame` via `_compositeScheduled` flag
- Two reusable temp canvases (`_tmpCanvasA/B`) reduce GC pressure
- Cache memory tracked incrementally via `_trackedCacheBytes`
- Crosshair drawing is RAF-throttled (`_xhairRAF`) and suppressed during drag (`_isDragging`). Overlay crosshair lives in a sticky wrapper inside `canvas-area` (not `canvas-container`) so the canvas buffer stays viewport-sized regardless of zoom level
- 3-point alignment stores raw affine in `pageTransforms` with sN pre-baked into the linear components (a,b,c,d). This means composite() applies the affine directly without multiplying by sN again. Decomposed offset/scale/rotation shown in UI but rendering uses affine path directly. Manual edits to offset/scale/rotation clear the affine and switch to standard composite path
- Drawing uses a single stroke list per page (`drawStrokes[pageNum]`), rendered on all visible canvases (overlay + both SBS panes)
- Keyboard shortcuts: V=pan, P=pen, L=line, A=arrow, H=highlight, R=rect, T=text, E=eraser, Ctrl+Z=undo, Left/Right/PageUp/Down/Home/End for navigation, Escape cancels alignment

## Layout Structure

| Area | Description |
|------|-------------|
| Sidebar (280px) | All controls: files, mode, blend, visibility, colors, presets, legend, quality, opacity, transform, save/load, cache |
| Canvas area | Main overlay canvas with zoom/pan, or SBS dual-pane wrapper |
| Bottom bar | Draw toolbar (tools, color, size slider, text size slider, crosshair controls, undo/clear) + page navigation |
| Zoom bar | Fixed position zoom controls (+/−/fit/percentage) |
| Thumb panel | Collapsible right panel showing new document page thumbnails |

## Sidebar Sections

| Section | Controls |
|---------|----------|
| Input Files | Upload zones for old/new PDFs |
| Display Mode | Overlay vs side-by-side toggle |
| Blend Mode | Multiply vs alpha toggle, alpha layer order (old/new on top) |
| Visibility | Old/new visibility toggles |
| Colors | Color pickers + preset grid (includes colorblind-safe Okabe-Ito presets) |
| Legend | Color meanings (old only, new only, overlap) |
| Render Quality | PPI dropdown (72–300) |
| Opacity | Sliders for old/new (0–100%) |
| **Transform** | Unified section with 4 sub-panels: |
|  — Scale | Per-layer scale (old/new, 10–500%) |
|  — Translation | X/Y offset with sliders + nudge buttons |
|  — Rotation | Manual rotation in degrees (number input) |
|  — 3-Point Align | Pick 3 point pairs → raw affine transform (snaps <1° rotation to 0°) |
| Save / Load | Preset export/import, PNG/PDF/ZIP export, set/reset defaults |
| Memory & Cache | Collapsible section with summary line, memory limit slider, cache range controls |

## Drawing Tools (Bottom Bar)

| Tool | Shortcut | Cursor |
|------|----------|--------|
| Pan | V | grab |
| Pen | P | crosshair |
| Line | L | crosshair |
| Arrow | A | crosshair |
| Highlighter | H | highlight indicator |
| Rectangle | R | crosshair |
| Text | T | text cursor |
| Eraser | E | circle |

- **Size slider**: 1–20px range slider with throttled updates
- **Text size slider**: 10–80px, stored per stroke as `textSize`
- All strokes stored per page, rendered on all visible canvases

## Planned Features

- **Dimension line markup**: Draw dimension/leader lines with length labels on the canvas as annotation strokes
- **Measure tool**: Click two points to measure the pixel distance between them, displayed as an on-canvas readout
- **Calibrate measure tool**: Set a known real-world distance (e.g. "this segment = 10m") to convert pixel measurements into calibrated units (mm, cm, m, ft, etc.)

## Known Issues

- Memory tracking for thumbnail data URLs uses string `.length` instead of byte size
- LRU array uses `indexOf()` which is O(n) per access
- No input validation on PPI (user can set extreme values)
- Export-all modifies global `currentPage` state without try-finally guard

## Testing

No automated tests. Manual testing:
1. Open the HTML file in a modern browser (Chrome/Edge recommended)
2. Upload two PDF files (old and new revisions)
3. Click "Compare" to render the overlay
4. Test overlay vs side-by-side modes, zoom, pan, page navigation
5. Test multiply vs alpha blend modes
6. Test drawing tools in both overlay and SBS modes
7. Test export (PNG, PDF, ZIP) and preset save/load
8. Test 3-point alignment: pick 3 points on old, then 3 on new, verify transform applies and UI updates
9. Test that manual offset/scale/rotation edits after alignment work (should clear affine)
10. Test alignment with page scope (this page / all pages), clear, and Escape to cancel
11. Test thumbnails update on new document upload
