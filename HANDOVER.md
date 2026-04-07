# Refactoring Handover

## Status
- **Current step**: 2 of 13
- **Last completed modules**: `state.js`, `utils.js`
- **Branch**: `claude/refactor-code-simplification-2sZWm`
- **app.js**: 2368 lines remaining (was 2664)

## What Was Done

### Infrastructure
- Created `src/modules/` directory
- Updated `build.sh` to concatenate module files in dependency order before `app.js`
  - Module files are optional — if a module file doesn't exist yet, it's skipped
  - Build injects `// ── modules/<name>.js ──` markers between modules for debugging

### Extracted Modules

#### `src/modules/state.js` (248 lines)
- pdfjsLib worker setup
- `$()` helper and `DOM` object (all cached DOM references)
- All global state variables (pdfOld/New, raw/recolored, cache, page state, drawing, blend, crosshair, etc.)
- Temp canvases (`_tmpCanvasA/B`) and constants (`MAX_CANVAS_DIM`, etc.)
- `INIT_KEY`, `HARDCODED_DEFAULTS`
- Functions: `getDefaults()`, `applyDefaults()`, `gatherUISettings()`, `setAsDefault()`, `resetToDefaults()`

#### `src/modules/utils.js` (46 lines)
- Functions: `sleep()`, `isInputFocused()`, `debounce()`
- Functions: `hexToRgb()`, `hexToDim()`, `blendOverlap()`, `syncColors()`

## Completed Modules
- [x] `state.js` — global state, DOM refs, defaults
- [x] `utils.js` — utility functions, color helpers

## Next Session — Extract `cache.js`
- **Module to extract**: `src/modules/cache.js`
- **Functions to move** (currently at top of `app.js`, lines 1-72):
  - `changeMemLimit()` — adjusts cache memory limit, evicts if needed
  - `getCacheBytes()`, `getCacheMB()` — return tracked cache size
  - `_recomputeCacheBytes()` — recalculate from scratch
  - `touchLRU()` — move page to end of LRU
  - `evictPage()` — remove page from cache + LRU
  - `evictUntilFits()` — evict oldest pages until new data fits
  - `estimatePageBytes()` — estimate bytes for one page pair
- **Watch out for**:
  - `changeMemLimit()` calls `evictPage()` and `updateCacheUI()` (updateCacheUI stays in app.js for now)
  - All cache functions read/write globals from `state.js` (`cacheOld`, `cacheNew`, `_trackedCacheBytes`, `lruOrder`, `lruSet`, `cacheMemLimitMB`, `currentPage`)
  - `estimatePageBytes()` calls `getRenderScale()` which is still in app.js (will go to render.js later)

## After `cache.js`, continue with:
3. `cache.js` — cache management + LRU
4. `render.js` — PDF rendering + recolor
5. `composite.js` — compositing + blend modes
6. `zoom.js` — zoom/pan
7. `crosshair.js` — crosshair overlay
8. `transform.js` — scale/rotation/offset
9. `align.js` — 3-point alignment
10. `drawing.js` — drawing tools
11. `navigation.js` — page nav + thumbnails
12. `export.js` — export + presets
13. `app.js` — remaining init, event binding

## Module Dependency Order (for build.sh)
```
state.js → utils.js → cache.js → render.js → composite.js → zoom.js → crosshair.js → transform.js → align.js → drawing.js → navigation.js → export.js → app.js
```

## Build Verification
```bash
./build.sh && echo "OK"
```
Output should show "Injected 7 files into template" and ~2MB file size.
