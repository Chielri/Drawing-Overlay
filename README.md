# PDF Overlay Compare

A browser-based tool for visually comparing two PDF document revisions. Each PDF is recolored (e.g., blue for old, red for new) and overlaid on a shared canvas so differences are immediately visible.

## Features

- **Overlay mode** — both revisions drawn on one canvas with adjustable opacity and color
- **Side-by-side mode** — revisions rendered next to each other
- **Per-page offset & scale** — fine-tune alignment for each page independently
- **Zoom & pan** — scroll-wheel zoom with drag-to-pan
- **Thumbnail panel** — collapsible page overview with click-to-navigate
- **Page cache** — LRU-based caching with configurable memory limit
- **Render quality** — selectable PPI (72 draft → 300 print)
- **Export** — single-page PNG/PDF, all-pages PDF, or all-pages ZIP
- **Presets** — save/load full comparison settings (including embedded PDFs) as JSON
- **Keyboard shortcuts** — arrow keys, Page Up/Down, Home/End for navigation
- **Drawing annotations** — pen, line, arrow, highlighter, rectangle, text, and eraser tools with per-page stroke storage
- **3-point alignment** — pick 3 matching point pairs on old & new PDFs for automatic affine alignment
- **Blend modes** — multiply or alpha overlay with configurable layer order
- **Crosshair overlay** — toggleable crosshair with configurable color and size

## Usage

1. Open `pdf_overlay_compare.html` in a modern browser (Chrome, Edge, or Firefox)
2. Upload an **Old Revision** and a **New Revision** PDF
3. Click **Compare**
4. Adjust colors, opacity, scale, and offset in the sidebar
5. Navigate pages with the page controls or keyboard
6. Export results as PNG, PDF, or ZIP

No installation, server, or build step required — everything runs client-side.

## Requirements

- A modern browser with HTML5 Canvas support
- JavaScript enabled

All libraries (PDF.js, jsPDF, JSZip) are inlined in the HTML file — no network requests needed.

## How It Works

1. PDFs are parsed client-side using PDF.js
2. Each page is rendered to a canvas and the pixel data is extracted
3. Dark pixels are recolored to the chosen tint (luminance-based algorithm)
4. Both layers are composited onto a single output canvas with configurable opacity
5. Results can be exported or cached for fast page switching

## Color Legend

| Color | Meaning |
|-------|---------|
| Blue (old color) | Content only in the old revision (removed) |
| Red (new color) | Content only in the new revision (added) |
| Purple (overlap) | Unchanged content present in both |

## Planned Features

- **Dimension line markup** — draw dimension/leader lines with length labels
- **Measure tool** — click two points to measure distance on the canvas
- **Calibrate measure** — set a known real-world distance to convert pixel measurements into real units (mm, cm, m, ft, etc.)

## License

[The Unlicense](LICENSE) — public domain. Free for any use.
