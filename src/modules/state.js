// On file://, Chrome treats each file as a unique security origin and logs
// "Unsafe attempt to load URL" warnings when PDF.js tries to create a Web Worker.
// Fix: evaluate the worker code on the main thread so PDF.js uses its built-in
// fake worker mode (via globalThis.pdfjsWorker) instead of spawning a Worker.
if (window.location.protocol === 'file:' && window.__pdfWorkerCode) {
  try { new Function(window.__pdfWorkerCode)(); } catch(e) { console.warn('Worker main-thread init failed:', e); }
  delete window.__pdfWorkerCode;
}
pdfjsLib.GlobalWorkerOptions.workerSrc = window.__pdfWorkerBlobURL;

// ═══════════════════════════════════════
//  CACHED DOM REFERENCES
// ═══════════════════════════════════════
const $ = id => document.getElementById(id);
const DOM = {
  colorOld: $('color-old'), colorNew: $('color-new'),
  zoneOld: $('zone-old'), zoneNew: $('zone-new'),
  nameOld: $('name-old'), nameNew: $('name-new'),
  iconOld: $('icon-old'), iconNew: $('icon-new'),
  swatchOld: $('swatch-old'), swatchNew: $('swatch-new'), swatchOverlap: $('swatch-overlap'),
  visOldBtn: $('vis-old'), visNewBtn: $('vis-new'),
  labelColorOld: $('label-color-old'), labelColorNew: $('label-color-new'),
  labelOpacityOld: $('label-opacity-old'), labelOpacityNew: $('label-opacity-new'),
  labelScaleOld: $('label-scale-old'), labelScaleNew: $('label-scale-new'),
  sliderOpacityOld: $('slider-opacity-old'), sliderOpacityNew: $('slider-opacity-new'),
  valOpacityOld: $('val-opacity-old'), valOpacityNew: $('val-opacity-new'),
  sliderSharpness: $('slider-sharpness'), valSharpness: $('val-sharpness'),
  sliderScaleOld: $('slider-scale-old'), sliderScaleNew: $('slider-scale-new'),
  inputScaleOld: $('input-scale-old'), inputScaleNew: $('input-scale-new'),
  transformScope: $('transform-scope'),
  ppiSelect: $('ppi-select'),
  btnCompare: $('btn-compare'),
  modeOverlay: $('mode-overlay'), modeSidebyside: $('mode-sidebyside'),
  placeholder: $('placeholder'), canvasContainer: $('canvas-container'),
  canvasOutput: $('canvas-output'), canvasArea: $('canvas-area'), canvasPad: $('canvas-pad'),
  zoomBar: $('zoom-bar'), zoomLabel: $('zoom-label'),
  pageGoto: $('page-goto'), pageTotal: $('page-total'),
  btnPrev: $('btn-prev'), btnNext: $('btn-next'),
  cacheBar: $('cache-bar'), cacheStatus: $('cache-status'), memEst: $('mem-est'),
  cacheIndicator: $('cache-indicator'),
  cacheFrom: $('cache-from'), cacheTo: $('cache-to'), memLimit: $('mem-limit'),
  offsetX: $('offset-x'), offsetY: $('offset-y'),
  offsetXSlider: $('offset-x-slider'), offsetYSlider: $('offset-y-slider'),
  offsetRange: $('offset-range'),
  thumbPanel: $('thumb-panel'), thumbToggle: $('thumb-toggle'),
  thumbScroll: $('thumb-scroll'), thumbPPIInput: $('thumb-ppi'),
  presetGrid: $('preset-grid'),
  loadInput: $('load-input'),
  // Side-by-side dual pane
  sbsWrapper: $('sbs-wrapper'),
  sbsScrollOld: $('sbs-scroll-old'), sbsScrollNew: $('sbs-scroll-new'),
  sbsCanvasOld: $('sbs-canvas-old'), sbsCanvasNew: $('sbs-canvas-new'),
  sbsLabelOld: $('sbs-label-old'), sbsLabelNew: $('sbs-label-new'),
  sbsXhairOld: $('sbs-xhair-old'), sbsXhairNew: $('sbs-xhair-new'),
  sbsDrawOld: $('sbs-draw-old'), sbsDrawNew: $('sbs-draw-new'),
  drawToolbar: $('draw-toolbar'),
  drawColor: $('draw-color'), drawWidth: $('draw-width'), drawWidthVal: $('draw-width-val'),
  drawTextSize: $('draw-text-size'), drawTextSizeVal: $('draw-text-size-val'),
  xhairColor: $('xhair-color'), xhairSize: $('xhair-size'),
  xhairToggle: $('xhair-toggle'),
  // Overlay drawing + crosshair
  overlayDrawLayer: $('overlay-draw-layer'), overlayXhair: $('overlay-xhair'),
  // Blend mode
  blendMultiply: $('blend-multiply'), blendAlpha: $('blend-alpha'),
  alphaMainRow: $('alpha-main-row'),
  alphaMainOld: $('alpha-main-old'), alphaMainNew: $('alpha-main-new'),
  // Bottom bar (page nav + draw tools)
  bottomBar: $('bottom-bar'), pageNavBar: $('page-nav-bar'),
  // Cache summary
  cacheSummaryText: $('cache-summary-text'), cacheSummaryMem: $('cache-summary-mem'),
  cacheDetail: $('cache-detail'),
  // Transform
  inputRotation: $('input-rotation'),
  // 3-point alignment
  align3Status: $('align3-status'), align3Start: $('align3-start'),
  align3Clear: $('align3-clear'), align3Points: $('align3-points'),
  align3Overlay: $('align3-overlay'),
  jpegQuality: $('jpeg-quality'), jpegQualityVal: $('jpeg-quality-val'),
};

// ═══════════════════════════════════════
//  STATE
// ═══════════════════════════════════════
let pdfOld = null, pdfNew = null;
let rawOld = null, rawNew = null;
let recoloredOld = null, recoloredNew = null;
let lastColorOld = '', lastColorNew = '';
let currentPage = 1, maxPages = 1, currentZoom = 1;
let mode = 'overlay', visOld = true, visNew = true, processing = false;
let pdfBufOld = null, pdfBufNew = null;
let cacheOld = {}, cacheNew = {};
let cachePPI = 0;
let cacheAbort = false;
let pageOffsets = {};
let pageScales = {};
let hasRenderedOnce = false;

// Per-page rotation (degrees)
let pageRotations = {};        // { "1": 5.0, "2": 0, ... }

// 3-point alignment state
let pageTransforms = {};       // { "1": {a,b,c,d,e,f}, ... } — affine matrix per page
let align3Active = false;      // picking mode on/off
let align3Phase = 'old';       // 'old' or 'new' — which PDF we're picking points for
let align3PointsOld = [];      // [{x,y}, ...] up to 3
let align3PointsNew = [];      // [{x,y}, ...] up to 3

// LRU cache management — uses a Set for O(1) has/delete + Array for order
let lruOrder = [];
let lruSet = new Set();
let cacheMemLimitMB = 512;

let _trackedCacheBytes = 0;

// Thumbnail state
let thumbPPI = 18;
let thumbDataUrls = {};
let thumbGeneration = 0;
let thumbTimer = null;
let thumbPanelOpen = false;
let thumbRendering = false;

let _compositeScheduled = false;
let _sbsSyncLock = false; // prevents scroll-sync infinite loop

// Drawing state
let drawTool = 'pan'; // 'pan' | 'pen' | 'line' | 'arrow' | 'rect' | 'text'
let drawStrokes = {}; // per-page arrays of stroke objects (single layer)
let _drawCurrent = null; // in-progress stroke

// Blend mode state
let blendMode = 'multiply'; // 'multiply' | 'alpha'
let alphaMain = 'new'; // which layer is on top in alpha mode: 'old' | 'new'

// Crosshair state
let xhairEnabled = true;
let _xhairRAF = 0;
let _xhairPending = null;
let _isDragging = false; // set by drag-to-pan handlers to suppress crosshair

const _tmpCanvasA = document.createElement('canvas');
const _tmpCanvasB = document.createElement('canvas');
const _tmpCtxA = _tmpCanvasA.getContext('2d');
const _tmpCtxB = _tmpCanvasB.getContext('2d');
const _isLittleEndian = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;

const MAX_CANVAS_DIM = 16384;       // max px per side (Safari limit)
const MAX_CANVAS_PIXELS = 268435456; // max total pixels
const RENDER_TIMEOUT_MS = 30000;     // 30s timeout for page.render()

// ═══════════════════════════════════════
//  INIT FILE (localStorage + export/import)
// ═══════════════════════════════════════
const INIT_KEY = 'pdf_overlay_defaults';
const HARDCODED_DEFAULTS = {
  colorOld: '#2979ff', colorNew: '#ff1744',
  opacityOld: 70, opacityNew: 70,
  ppi: '150', mode: 'overlay',
  visOld: true, visNew: true,
  offsetRange: 500, transformScope: 'page',
  thumbPPI: 18,
  memLimitMB: 4096,
  scaleOld: 100, scaleNew: 100,
  sharpness: 0
};

function getDefaults() {
  try {
    const stored = localStorage.getItem(INIT_KEY);
    if (stored) return { ...HARDCODED_DEFAULTS, ...JSON.parse(stored) };
  } catch(e) {}
  return { ...HARDCODED_DEFAULTS };
}

function applyDefaults(d) {
  DOM.colorOld.value = d.colorOld;
  DOM.colorNew.value = d.colorNew;
  DOM.sliderOpacityOld.value = d.opacityOld;
  DOM.sliderOpacityNew.value = d.opacityNew;
  DOM.valOpacityOld.textContent = d.opacityOld + '%';
  DOM.valOpacityNew.textContent = d.opacityNew + '%';
  DOM.ppiSelect.value = d.ppi;
  mode = d.mode;
  DOM.modeOverlay.classList.toggle('active', mode === 'overlay');
  DOM.modeSidebyside.classList.toggle('active', mode === 'sidebyside');
  visOld = d.visOld; visNew = d.visNew;
  DOM.offsetRange.value = d.offsetRange;
  updateSliderRange();
  DOM.transformScope.value = d.transformScope || d.offsetScope || d.scaleScope || 'page';
  thumbPPI = d.thumbPPI || 18;
  DOM.thumbPPIInput.value = thumbPPI;
  cacheMemLimitMB = d.memLimitMB || 4096;
  DOM.memLimit.value = cacheMemLimitMB;
  changeMemLimit();
  DOM.inputScaleOld.value = d.scaleOld || 100;
  DOM.inputScaleNew.value = d.scaleNew || 100;
  DOM.sliderScaleOld.value = Math.max(25, Math.min(200, d.scaleOld || 100));
  DOM.sliderScaleNew.value = Math.max(25, Math.min(200, d.scaleNew || 100));
  DOM.jpegQuality.value = d.jpegQuality || 85;
  updateJpegQuality();
  DOM.sliderSharpness.value = d.sharpness || 0;
  DOM.valSharpness.textContent = (d.sharpness || 0) + '%';
  syncColors();
}

function gatherUISettings() {
  return {
    colorOld: DOM.colorOld.value, colorNew: DOM.colorNew.value,
    opacityOld: parseInt(DOM.sliderOpacityOld.value),
    opacityNew: parseInt(DOM.sliderOpacityNew.value),
    ppi: DOM.ppiSelect.value, mode, visOld, visNew,
    offsetRange: parseInt(DOM.offsetRange.value) || 500,
    transformScope: DOM.transformScope.value,
    thumbPPI, memLimitMB: cacheMemLimitMB,
    scaleOld: parseFloat(DOM.inputScaleOld.value) || 100,
    scaleNew: parseFloat(DOM.inputScaleNew.value) || 100,
    jpegQuality: parseInt(DOM.jpegQuality.value) || 85,
    sharpness: parseInt(DOM.sliderSharpness.value) || 0
  };
}

function setAsDefault() {
  try {
    localStorage.setItem(INIT_KEY, JSON.stringify(gatherUISettings()));
    alert('Current settings saved as default. They will load automatically next time.');
  } catch(e) {
    alert('Could not save to browser storage: ' + e.message);
  }
}

function resetToDefaults() {
  if (!confirm('Reset all settings to factory defaults? This also clears your saved defaults.')) return;
  cacheAbort = true;
  try { localStorage.removeItem(INIT_KEY); } catch(e) {}
  pageOffsets = {};
  cacheOld = {}; cacheNew = {};
  _trackedCacheBytes = 0;
  cachePPI = 0;
  lruOrder = []; lruSet = new Set();
  invalidateRecolor();
  clearThumbCache();
  thumbPPI = HARDCODED_DEFAULTS.thumbPPI;
  DOM.thumbPPIInput.value = thumbPPI;
  DOM.offsetX.value = 0;
  DOM.offsetY.value = 0;
  DOM.offsetXSlider.value = 0;
  DOM.offsetYSlider.value = 0;
  pageScales = {};
  pageRotations = {};
  pageTransforms = {};
  currentZoom = 1;
  applyDefaults(HARDCODED_DEFAULTS);
  document.querySelectorAll('.preset-pill').forEach((el, i) => el.classList.toggle('selected', i === 0));
  if (rawOld || rawNew) {
    hasRenderedOnce = false;
    cacheAbort = false;
    renderPage(currentPage).then(() => updateCacheUI());
  }
}
