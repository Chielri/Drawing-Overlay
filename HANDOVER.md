# Refactoring Handover

## Status
- **Current step**: 13 of 13 — COMPLETE
- **All modules extracted**: `state.js`, `utils.js`, `cache.js`, `render.js`, `composite.js`, `zoom.js`, `crosshair.js`, `transform.js`, `align.js`, `drawing.js`, `navigation.js`, `export.js`
- **Branch**: `claude/continue-refactoring-zqL4z`
- **app.js**: 608 lines remaining (was 2664 → 2368 → 608)

## What Was Done

### Infrastructure
- Created `src/modules/` directory
- Updated `build.sh` to concatenate module files in dependency order before `app.js`
  - Module files are optional — if a module file doesn't exist yet, it's skipped
  - Build injects `// ── modules/<name>.js ──` markers between modules for debugging

### Extracted Modules

#### `src/modules/state.js` (252 lines)
- pdfjsLib worker setup
- `$()` helper and `DOM` object (all cached DOM references)
- All global state variables (pdfOld/New, raw/recolored, cache, page state, drawing, blend, crosshair, etc.)
- Temp canvases (`_tmpCanvasA/B`) and constants (`MAX_CANVAS_DIM`, etc.)
- `INIT_KEY`, `HARDCODED_DEFAULTS`
- Functions: `getDefaults()`, `applyDefaults()`, `gatherUISettings()`, `setAsDefault()`, `resetToDefaults()`
- Crosshair shared vars: `_xhairRAF`, `_xhairPending`, `_isDragging`

#### `src/modules/utils.js` (46 lines)
- Functions: `sleep()`, `isInputFocused()`, `debounce()`
- Functions: `hexToRgb()`, `hexToDim()`, `blendOverlap()`, `syncColors()`

#### `src/modules/cache.js` (67 lines)
- Functions: `changeMemLimit()`, `getCacheBytes()`, `getCacheMB()`, `_recomputeCacheBytes()`
- Functions: `touchLRU()`, `evictPage()`, `evictUntilFits()`, `estimatePageBytes()`

#### `src/modules/render.js` (175 lines)
- Functions: `getRenderScale()`, `validateCanvasSize()`
- Functions: `renderPage()`, `renderPdfPage()`
- Functions: `invalidateRecolor()`, `recolor()` (LUT-based pixel recoloring)
- Functions: `_prepareCtx()`, `putImgToTempCanvas()`
- Functions: `_doRecolorAndComposite()`, `recolorAndComposite()` (rAF-gated)

#### `src/modules/composite.js` (139 lines)
- Function: `composite()` — overlay + side-by-side compositing with blend modes

#### `src/modules/zoom.js` (37 lines)
- Functions: `applyZoom()`, `applySbsZoom()`, `doZoom()`, `zoomFit()`

#### `src/modules/crosshair.js` (68 lines)
- Functions: `toggleXhair()`, `_drawXhairImmediate()`, `drawXhair()`, `clearXhair()`, `paneMousePos()`

#### `src/modules/transform.js` (165 lines)
- Functions: `toggleSubSection()`, `toggleCacheSection()`
- Functions: `resetAllTransforms()`, `getPageScale()`, `setPageScale()`, `loadScaleUI()`
- Functions: `getPageRotation()`, `setPageRotation()`, `loadRotationUI()`, `applyRotation()`, `resetRotation()`
- Functions: `getPageOffset()`, `setPageOffset()`, `loadTransformUI()`, `loadOffsetUI()`
- Functions: `syncSliders()`, `sliderToInput()`, `updateSliderRange()`, `applyOffset()`, `nudgeOffset()`, `resetOffset()`

#### `src/modules/align.js` (330 lines)
- Functions: `getPageTransform()`, `setPageTransform()`, `clearPageTransform()`
- Functions: `startAlign3()`, `cancelAlign3()`, `clearAlign3()`, `updateAlign3UI()`
- Functions: `align3ClickToCanvas()`, `drawAlign3Markers()`
- Functions: `solveAffine()`, `solveSimilarity()`, `snapAffineTransform()`, `computeAndApplyAlign3()`
- Event listener: `DOM.align3Overlay` click handler

#### `src/modules/drawing.js` (330 lines)
- Functions: `syncDrawLayerSize()`, `setDrawTool()`, `updateDrawWidth()`, `updateTextSize()`
- Functions: `getDrawKey()`, `drawStrokesFor()`, `clientToCanvas()`, `renderDrawLayer()`, `drawStrokeToCtx()`
- Functions: `strokeHitsPoint()`, `distToSegment2()`, `initDrawing()`, `drawUndo()`, `drawClear()`
- `_toolCursors` constant, `initDrawing()` call, context menu preventions

#### `src/modules/navigation.js` (115 lines)
- Functions: `updatePageNav()`, `goToPage()`, `changePage()`
- Functions: `getThumbScale()`, `toggleThumbs()`, `buildThumbSlots()`, `renderThumbPage()`
- Functions: `renderMissingThumbs()`, `rebuildThumbsNow()`, `clearThumbCache()`, `changeThumbPPI()`
- Event listener: `DOM.thumbScroll` click handler

#### `src/modules/export.js` (172 lines)
- Functions: `_getJsPDF()`, `_ensureJsPDF()`
- Functions: `collectAnnotationsForPage()`, `renderAnnotationsCanvas()`, `compositeWithAnnotations()`
- Functions: `exportPNG()`, `getJpegQuality()`, `updateJpegQuality()`
- Functions: `canvasToBlob()`, `canvasToSmallestImage()`, `pdfPageDims()`, `addCanvasImageToPdf()`
- Functions: `exportPDF()`, `exportAllPDF()`, `exportAllPNG()`

### What Remains in `app.js` (608 lines)
- Init: `applyDefaults()` call, PRESETS array + pill builder
- Upload: `initZone()`, `loadPdf()`, drag-drop handlers
- `runCompare()` — orchestrates comparison
- Cache system UI: `isPageCached()`, `getCachedCount()`, `estimateCacheMemMB()`, `updateCacheUI()`, `cacheRange()`, `cacheAllPages()`, `clearCache()`
- Controls: `updateOpacity()`, `updateSharpness()`, `sliderScale()`, `inputScale()`, `_applyScale()`, `resetScale()`, `matchScale()`, `setMode()`, `setBlendMode()`, `setAlphaMain()`, `toggleVis()`, color handlers, `changePPI()`
- Save/Load preset: `bufToBase64()`, `base64ToBuf()`, `savePreset()`, `loadPreset()`
- Drag-to-pan + wheel zoom event handlers (overlay + SBS)
- Keyboard handler

## Module Dependency Order (for build.sh)
```
state.js → utils.js → cache.js → render.js → composite.js → zoom.js → crosshair.js → transform.js → align.js → drawing.js → navigation.js → export.js → app.js
```

## Build Verification
```bash
./build.sh && echo "OK"
```
Output should show "Injected 7 files into template" and ~2MB file size.
