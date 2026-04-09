# PDF Overlay Compare

A single-file web application for comparing two PDF document revisions via color-coded overlays. Built as a self-contained HTML file (~2MB) with all dependencies inlined — just open it in a browser.

## Features

### Display Modes
- **Overlay mode** — both PDFs rendered on a single canvas with configurable opacity and blend modes
- **Side-by-side mode** — dual-pane horizontal split with synchronized scrolling and labeled "OLD"/"NEW" panes

### Blend Modes & Color
- **Multiply blend** (default) — darkens where layers overlap
- **Alpha blend** — transparent overlay with configurable layer order (old on top or new on top)
- **Recoloring** — dark pixels in each PDF tinted to user-chosen colors (default blue=old, red=new)
- **10 preset color themes** — Classic, Cyan-Mag, Teal-Coral, Navy-Amber, Purple-Org, Gray-Red, and 4 colorblind-friendly palettes
- **Independent opacity sliders** — 0–100% per layer with show/hide toggles
- **Line sharpness slider** — 0–100% threshold to boost text and line contrast

### Render Quality
- **PPI presets** — 72 (draft), 150 (standard), 200 (high), 300 (print), 400 (ultra)

### Transform Controls
- **Translation** — X/Y pixel offset via numeric inputs, sliders (adjustable ±range), and nudge buttons (±1 px, ±5 px)
- **Scale** — independent scale for old and new PDFs (10–500%), with "Match to New" shortcut
- **Rotation** — precise degree input with decimal support, positive = clockwise
- **Scope selector** — apply transforms to current page only or all pages at once
- **Reset buttons** — clear offset, scale, or rotation individually

### 3-Point Alignment
- **Interactive point picking** — click 3 matching points on old PDF, then 3 on new PDF
- **Visual markers** — colored circles with A/B/C labels and coordinate readout
- **Auto affine solve** — computes translation + rotation + uniform scale from point pairs
- **Rotation snapping** — rotations under 1° automatically snap to 0°
- **Similarity constraint** — prevents shear/skew for clean alignment
- **Per-page storage** — each page can have its own independent affine transform
- **Manual edit clears affine** — editing offset/scale/rotation after alignment reverts to manual mode

### Zoom & Pan
- **Scroll-wheel zoom** — ±0.15 per notch, 0.03x–5x range
- **Drag to pan** — click-and-drag with grab cursor feedback
- **Fit button** — auto-sizes canvas to fill viewport
- **Zoom level display** — percentage readout with −/+ controls

### Page Navigation
- **Page input** — go-to-page with numeric input
- **Previous/next buttons** — disabled at boundaries
- **Keyboard navigation** — arrow keys, Page Up/Down, Home/End
- **Thumbnail click** — jump to any page from the thumbnail panel

### Thumbnail Panel
- **Collapsible right sidebar** — miniatures of all pages with page numbers
- **Adjustable quality** — separate PPI slider (8–72) for thumbnail rendering
- **Active page highlighting** — current page bordered in blue with auto-scroll
- **Lazy generation** — thumbnails built on-demand during idle time
- **Refresh button** — force rebuild all thumbnails

### Drawing Tools
- **Pan** (V) — drag to pan without drawing
- **Pen** (P) — freehand drawing
- **Line** (L) — straight line from click to release
- **Arrow** (A) — line with arrowhead (size scales with stroke width)
- **Highlighter** (H) — semi-transparent wide stroke (35% opacity, 10–20x width)
- **Rectangle** (R) — hollow rectangle from corner to corner
- **Text** (T) — click to place text with configurable font size (10–80 px)
- **Eraser** (E) — remove strokes by clicking near them
- **Configurable stroke** — color picker and width slider (1–20 px)
- **Per-page strokes** — each page stores its own annotation layer
- **Undo** (Ctrl+Z) — remove last stroke on current page
- **Clear all** — remove all strokes on current page
- **Multi-canvas rendering** — annotations appear on overlay and both side-by-side panes

### Crosshair Overlay
- **Toggleable** — on/off button in the drawing toolbar
- **Three sizes** — Small, Medium, Large
- **Custom color** — independent color picker (default green)
- **Dashed lines with center dot** — RAF-throttled, suppressed during drag

### Memory & Caching
- **LRU cache** — least-recently-used eviction for rendered pages
- **Adjustable memory limit** — 256–131,072 MB (default 4,096 MB)
- **Cache summary** — shows cached pages and MB usage with expandable per-page details
- **Visual cache indicators** — page-status dot grid for documents ≤60 pages
- **Cache range / cache all** — pre-cache pages on demand
- **Auto-eviction** — oldest pages evicted when new renders exceed the limit

### Export
- **Single-page PNG** — lossless export with annotations included
- **Single-page PDF** — with configurable JPEG quality (50–98%)
- **All pages to PDF** — multi-page PDF with auto portrait/landscape per page
- **All pages to ZIP** — PNG files in a single archive
- **Progress indicator** — button shows "N/Total…" during batch export
- **Date-stamped filenames** — `overlay-all-pages-YYYY-MM-DD.zip/pdf`

### Presets & Defaults
- **Save preset** — export full state (settings + PDF buffers as base64) to JSON file
- **Load preset** — import JSON file or drag-and-drop onto canvas
- **Set as default** — persist current settings to localStorage for future sessions
- **Reset defaults** — restore factory settings with confirmation dialog
- **Persisted settings** — colors, opacity, PPI, mode, visibility, scales, offsets, rotation, threshold, thumbnail PPI, memory limit, JPEG quality

### File Input
- **Drag-and-drop** — drop PDFs onto upload zones or anywhere on the page
- **Click to browse** — standard file picker for each revision
- **Drop 2 at once** — drop two PDFs simultaneously to load both
- **Preset drop** — drop a JSON preset file on the canvas to load it

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
| `Enter` | Go to page (when page input focused) |
| `Escape` | Cancel 3-point alignment |

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
