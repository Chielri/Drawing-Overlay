# PDF Overlay Compare

A browser-based tool for visually comparing two PDF document revisions. Each PDF is recolored (e.g., blue for old, red for new) and overlaid on a shared canvas so differences are immediately visible.

## Features

- **Overlay & side-by-side modes** — compare revisions on one canvas or side by side
- **Blend modes** — multiply or alpha overlay with configurable layer order
- **Per-page alignment** — offset, scale, rotation, or automatic 3-point affine alignment
- **Drawing annotations** — pen, line, arrow, highlighter, rectangle, text, eraser tools
- **Crosshair overlay** — toggleable with configurable color and size
- **Zoom & pan** — scroll-wheel zoom with drag-to-pan
- **Thumbnail panel** — collapsible page overview with click-to-navigate
- **Page cache** — LRU-based with configurable memory limit
- **Export** — single-page PNG/PDF, all-pages PDF, or all-pages ZIP
- **Presets** — save/load full comparison settings as JSON
- **Keyboard shortcuts** — tool selection, page navigation, undo

## Usage

1. Open `pdf_overlay_compare.html` in a modern browser (Chrome, Edge, or Firefox)
2. Upload an **Old Revision** and a **New Revision** PDF
3. Click **Compare**
4. Adjust colors, opacity, scale, and offset in the sidebar
5. Navigate pages with the page controls or keyboard
6. Export results as PNG, PDF, or ZIP

No installation, server, or build step required — everything runs client-side.

## Development

The source lives in `src/`. The application JavaScript is organized into focused modules under `src/modules/`, each handling one concern (state, rendering, drawing, export, etc.). See [CLAUDE.md](CLAUDE.md) for the full module map and architecture details.

```bash
# Rebuild the single-file output after editing src/
./build.sh
```

## Requirements

- A modern browser with HTML5 Canvas support
- JavaScript enabled

All libraries (PDF.js, jsPDF, JSZip) are inlined — no network requests needed.

## Color Legend

| Color | Meaning |
|-------|---------|
| Blue (old color) | Content only in the old revision (removed) |
| Red (new color) | Content only in the new revision (added) |
| Purple (overlap) | Unchanged content present in both |

## License

[The Unlicense](LICENSE) — public domain. Free for any use.
