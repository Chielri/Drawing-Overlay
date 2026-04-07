# PDF Overlay Compare

A single-file web application for comparing two PDF document revisions via color-coded overlays. Built as a self-contained HTML file (~2MB) with all dependencies inlined — just open it in a browser.

## Features

- **Overlay & side-by-side modes** — compare revisions on one canvas or side by side
- **Blend modes** — multiply (default) or alpha overlay with configurable layer order
- **Per-page alignment** — offset, scale, rotation, or automatic 3-point affine alignment
- **Drawing annotations** — pen, line, arrow, highlighter, rectangle, text, eraser tools
- **Crosshair overlay** — toggleable with configurable color and size
- **Zoom & pan** — scroll-wheel zoom with drag-to-pan
- **Thumbnail panel** — collapsible page overview with click-to-navigate
- **Page cache** — LRU-based with configurable memory limit
- **Export** — single-page PNG/PDF, all-pages PDF, or all-pages ZIP
- **Presets** — save/load full comparison settings (including PDFs) as JSON
- **Keyboard shortcuts** — tool selection, page navigation, undo

## Usage

1. Open `pdf_overlay_compare.html` in a modern browser (Chrome, Edge, or Firefox)
2. Upload an **Old Revision** and a **New Revision** PDF
3. Click **Compare**
4. Adjust colors, opacity, scale, and offset in the sidebar
5. Navigate pages with the page controls or keyboard
6. Export results as PNG, PDF, or ZIP

No installation, server, or build step required — everything runs client-side.

## Color Legend

| Color | Meaning |
|-------|---------|
| Blue (old color) | Content only in the old revision (removed) |
| Red (new color) | Content only in the new revision (added) |
| Purple (overlap) | Unchanged content present in both |

Colors are fully configurable in the sidebar.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Pan tool |
| `P` | Pen tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `H` | Highlighter tool |
| `R` | Rectangle tool |
| `T` | Text tool |
| `E` | Eraser tool |
| `Ctrl+Z` | Undo last stroke |
| `Left/Right` | Previous/next page |
| `PageUp/PageDown` | Previous/next page |
| `Home/End` | First/last page |
| `Escape` | Cancel alignment |

## Development

### File Structure

```
pdf_overlay_compare.html     # Built output (do not edit directly)
build.sh                     # Packs src/ into the single HTML file
src/
├── index.html               # HTML template with __INJECT__ markers
├── styles.css               # CSS design system (dark theme, CSS vars)
├── body.html                # HTML structure (sidebar, canvas, bottom bar, thumbnails)
├── app.js                   # Main entry point — init, event binding, PDF loading
├── modules/
│   ├── state.js             # Global state, defaults, preset save/load
│   ├── utils.js             # Helpers (hexToRgb, debounce, sleep, blendOverlap)
│   ├── cache.js             # LRU cache (touchLRU, evictPage, memory tracking)
│   ├── render.js            # Render pipeline (renderPdfPage → renderPage → recolor)
│   ├── composite.js         # Compositing (overlay + SBS with blend modes)
│   ├── zoom.js              # Zoom/pan (applyZoom, doZoom, zoomFit)
│   ├── crosshair.js         # Crosshair overlay (RAF-throttled, drag-suppressed)
│   ├── transform.js         # Scale, offset, rotation, nudge controls
│   ├── align.js             # 3-point alignment (solveAffine, snapAffineRotation)
│   ├── drawing.js           # Drawing tools & strokes (initDrawing, undo/clear)
│   ├── navigation.js        # Page navigation, thumbnails, keyboard shortcuts
│   └── export.js            # PNG/PDF/ZIP export (single page & batch)
└── vendor/
    ├── pdfjs.js             # PDF.js library
    ├── jspdf.js             # jsPDF library
    ├── jszip.js             # JSZip library
    └── pdfjs-worker-blob.js # PDF.js worker (loaded via Blob URL)
```

### Architecture

- **Single-file output** — `build.sh` concatenates all source into one self-contained HTML
- **No frameworks** — vanilla JS with global state; modules communicate through shared `state.js` variables and a cached `DOM` object
- **Rendering** — HTML5 Canvas 2D context with pixel-level recoloring via LUT
- **Inlined libraries** — PDF.js (rendering), jsPDF (PDF export), JSZip (ZIP export)

### Module Dependency Order

Modules are concatenated by `build.sh` in this order:

```
state.js → utils.js → cache.js → render.js → composite.js → zoom.js →
crosshair.js → transform.js → align.js → drawing.js → navigation.js →
export.js → app.js
```

No ES module imports — modules are loaded as concatenated scripts and depend on earlier modules being defined first.

### Building

```bash
# Rebuild pdf_overlay_compare.html from src/
./build.sh

# Build to a custom output path
./build.sh output.html
```

The build script requires Python 3 (for multi-line text substitution) and Bash.

### CSS Design System

- **Theme** — dark theme with CSS custom properties (`--bg`, `--surface`, `--border`, `--text`, `--blue`, `--red`)
- **Fonts** — DM Sans (UI), JetBrains Mono (values/code)
- **Layout** — fixed 280px sidebar + flexible canvas area + collapsible 140px thumbnail panel
- **Bottom bar** — fixed position with draw toolbar and page navigation

## Requirements

- A modern browser with HTML5 Canvas support (Chrome/Edge recommended)
- JavaScript enabled

All libraries are inlined — no network requests needed.

## License

[The Unlicense](LICENSE) — public domain. Free for any use.
