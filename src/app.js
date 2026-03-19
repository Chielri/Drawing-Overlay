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

const _tmpCanvasA = document.createElement('canvas');
const _tmpCanvasB = document.createElement('canvas');
const _tmpCtxA = _tmpCanvasA.getContext('2d');
const _tmpCtxB = _tmpCanvasB.getContext('2d');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isInputFocused() { const t = document.activeElement?.tagName; return t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA'; }
function debounce(fn, ms) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }

// ═══════════════════════════════════════
//  CACHE MEMORY LIMIT (incremental tracking)
// ═══════════════════════════════════════
function changeMemLimit() {
  const v = Math.max(256, Math.min(131072, parseInt(DOM.memLimit.value) || 4096));
  cacheMemLimitMB = v;
  let safety = lruOrder.length + 2;
  while (_trackedCacheBytes > cacheMemLimitMB * 1048576 && lruOrder.length > 1 && safety-- > 0) {
    const oldest = lruOrder[0];
    if (oldest === String(currentPage)) { lruOrder.push(lruOrder.shift()); continue; }
    evictPage(oldest);
  }
  updateCacheUI();
}

// FIX: O(1) — just return tracked value
function getCacheBytes() { return _trackedCacheBytes; }
function getCacheMB() { return _trackedCacheBytes / 1048576; }

// Recalculate from scratch (called only on bulk operations like clearCache)
function _recomputeCacheBytes() {
  let bytes = 0;
  for (const k in cacheOld) if (cacheOld[k]) bytes += cacheOld[k].data.byteLength;
  for (const k in cacheNew) if (cacheNew[k]) bytes += cacheNew[k].data.byteLength;
  _trackedCacheBytes = bytes;
}

function touchLRU(page) {
  const p = String(page);
  if (lruSet.has(p)) {
    const idx = lruOrder.indexOf(p);
    if (idx !== -1) lruOrder.splice(idx, 1);
  }
  lruOrder.push(p);
  lruSet.add(p);
}

function evictPage(page) {
  const p = String(page);
  if (cacheOld[p]) _trackedCacheBytes -= cacheOld[p].data.byteLength;
  if (cacheNew[p]) _trackedCacheBytes -= cacheNew[p].data.byteLength;
  delete cacheOld[p];
  delete cacheNew[p];
  if (lruSet.has(p)) {
    const idx = lruOrder.indexOf(p);
    if (idx !== -1) lruOrder.splice(idx, 1);
    lruSet.delete(p);
  }
}

function evictUntilFits(newBytes) {
  const limitBytes = cacheMemLimitMB * 1048576;
  let safety = lruOrder.length + 2;
  while (_trackedCacheBytes + newBytes > limitBytes && lruOrder.length > 0 && safety-- > 0) {
    const oldest = lruOrder[0];
    if (oldest === String(currentPage)) {
      if (lruOrder.length <= 1) break;
      lruOrder.push(lruOrder.shift());
      continue;
    }
    evictPage(oldest);
  }
}

function estimatePageBytes() {
  for (const k in cacheOld) {
    if (cacheOld[k]) return cacheOld[k].data.byteLength * 2;
  }
  const scale = getRenderScale();
  const basePixels = 1750 * 1237;
  return basePixels * (scale * scale) * 4 * 2;
}

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
  scaleOld: 100, scaleNew: 100
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
    jpegQuality: parseInt(DOM.jpegQuality.value) || 85
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

// ═══════════════════════════════════════
//  COLOR HELPERS
// ═══════════════════════════════════════
function hexToRgb(hex) { return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]; }
function hexToDim(hex) { const [r,g,b] = hexToRgb(hex); return `rgba(${r},${g},${b},0.15)`; }
function blendOverlap([r1,g1,b1], a1, [r2,g2,b2], a2) {
  const sO = [255*(1-a1)+r1*a1, 255*(1-a1)+g1*a1, 255*(1-a1)+b1*a1];
  const sN = [255*(1-a2)+r2*a2, 255*(1-a2)+g2*a2, 255*(1-a2)+b2*a2];
  if (blendMode === 'multiply') {
    return [Math.round(sO[0]*sN[0]/255), Math.round(sO[1]*sN[1]/255), Math.round(sO[2]*sN[2]/255)];
  }
  // Alpha: top layer over bottom
  if (alphaMain === 'new') {
    return [Math.round(sO[0]*(1-a2)+r2*a2), Math.round(sO[1]*(1-a2)+g2*a2), Math.round(sO[2]*(1-a2)+b2*a2)];
  }
  return [Math.round(sN[0]*(1-a1)+r1*a1), Math.round(sN[1]*(1-a1)+g1*a1), Math.round(sN[2]*(1-a1)+b1*a1)];
}

function syncColors() {
  const cOld = DOM.colorOld.value, cNew = DOM.colorNew.value;
  if (DOM.zoneOld.classList.contains('has-file')) { DOM.zoneOld.style.borderColor = cOld; DOM.zoneOld.style.background = hexToDim(cOld); }
  if (DOM.zoneNew.classList.contains('has-file')) { DOM.zoneNew.style.borderColor = cNew; DOM.zoneNew.style.background = hexToDim(cNew); }
  const oA = parseInt(DOM.sliderOpacityOld.value)/100;
  const oB = parseInt(DOM.sliderOpacityNew.value)/100;
  const rgbOld = hexToRgb(cOld), rgbNew = hexToRgb(cNew);
  // Show opacity-adjusted colors over white so legend matches canvas appearance
  const sO = [Math.round(255*(1-oA)+rgbOld[0]*oA), Math.round(255*(1-oA)+rgbOld[1]*oA), Math.round(255*(1-oA)+rgbOld[2]*oA)];
  const sN = [Math.round(255*(1-oB)+rgbNew[0]*oB), Math.round(255*(1-oB)+rgbNew[1]*oB), Math.round(255*(1-oB)+rgbNew[2]*oB)];
  DOM.swatchOld.style.background = `rgb(${sO[0]},${sO[1]},${sO[2]})`;
  DOM.swatchNew.style.background = `rgb(${sN[0]},${sN[1]},${sN[2]})`;
  const ov = blendOverlap(rgbOld, oA, rgbNew, oB);
  DOM.swatchOverlap.style.background = `rgb(${ov[0]},${ov[1]},${ov[2]})`;
  DOM.visOldBtn.classList.toggle('active', visOld); DOM.visNewBtn.classList.toggle('active', visNew);
  if (visOld) { DOM.visOldBtn.style.color=cOld; DOM.visOldBtn.style.borderColor=cOld; DOM.visOldBtn.style.background=hexToDim(cOld); }
  else { DOM.visOldBtn.style.color=''; DOM.visOldBtn.style.borderColor=''; DOM.visOldBtn.style.background=''; }
  if (visNew) { DOM.visNewBtn.style.color=cNew; DOM.visNewBtn.style.borderColor=cNew; DOM.visNewBtn.style.background=hexToDim(cNew); }
  else { DOM.visNewBtn.style.color=''; DOM.visNewBtn.style.borderColor=''; DOM.visNewBtn.style.background=''; }
  DOM.iconOld.style.color = cOld; DOM.iconNew.style.color = cNew;
  DOM.labelColorOld.style.color = cOld; DOM.labelColorNew.style.color = cNew;
  DOM.labelOpacityOld.style.color = cOld; DOM.labelOpacityNew.style.color = cNew;
  DOM.labelScaleOld.style.color = cOld; DOM.labelScaleNew.style.color = cNew;
}

// ═══════════════════════════════════════
//  INIT: apply saved defaults + build presets
// ═══════════════════════════════════════
applyDefaults(getDefaults());

const PRESETS = [
  { name:'Classic', old:'#2979ff', new:'#ff1744' },
  { name:'Cyan-Mag', old:'#00bcd4', new:'#e91e63' },
  { name:'Teal-Coral', old:'#009688', new:'#ff5722' },
  { name:'Navy-Amber', old:'#1a237e', new:'#ff8f00' },
  { name:'Purple-Org', old:'#7b1fa2', new:'#ef6c00' },
  { name:'Gray-Red', old:'#546e7a', new:'#d32f2f' },
  // Colorblind-safe (Okabe-Ito / ColorBrewer)
  { name:'CB Blue-Org', old:'#0072B2', new:'#E69F00' },
  { name:'CB Grn-Verm', old:'#009E73', new:'#D55E00' },
  { name:'CB Blue-Yel', old:'#0072B2', new:'#F0E442' },
  { name:'CB Brn-Teal', old:'#8C510A', new:'#01665E' },
];
(function() {
  PRESETS.forEach((p, i) => {
    const pill = document.createElement('div');
    pill.className = 'preset-pill' + (i===0?' selected':'');
    pill.title = p.name;
    pill.innerHTML = `<div class="preset-swatch" style="background:${p.old}"></div><div class="preset-swatch" style="background:${p.new}"></div><span class="preset-label">${p.name}</span>`;
    pill.addEventListener('click', () => {
      DOM.presetGrid.querySelectorAll('.preset-pill').forEach(el => el.classList.remove('selected'));
      pill.classList.add('selected');
      DOM.colorOld.value = p.old;
      DOM.colorNew.value = p.new;
      invalidateRecolor();
      syncColors();
      if (rawOld || rawNew) recolorAndComposite();
    });
    DOM.presetGrid.appendChild(pill);
  });
})();

// ═══════════════════════════════════════
//  UPLOAD
// ═══════════════════════════════════════
function initZone(zone, input, which) {
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files[0]) loadPdf(input.files[0], which); });
  zone.addEventListener('dragenter', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('dragover'); });
  zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragover'); });
  zone.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragover'); const f=e.dataTransfer.files[0]; if(f&&(f.type==='application/pdf'||f.name.endsWith('.pdf'))) loadPdf(f, which); });
}
initZone(DOM.zoneOld, $('file-old'), 'old');
initZone(DOM.zoneNew, $('file-new'), 'new');
DOM.canvasArea.addEventListener('dragover', e => e.preventDefault());
DOM.canvasArea.addEventListener('drop', e => {
  e.preventDefault();
  const allFiles = [...e.dataTransfer.files];
  const jsonFile = allFiles.find(f => f.name.endsWith('.json'));
  if (jsonFile) { loadPreset({ target: { files: [jsonFile] } }); return; }
  const files = allFiles.filter(f => f.type==='application/pdf'||f.name.endsWith('.pdf'));
  if (files.length >= 2) { loadPdf(files[0],'old'); loadPdf(files[1],'new'); }
  else if (files.length === 1) { if (!pdfOld) loadPdf(files[0],'old'); else loadPdf(files[0],'new'); }
});
// Allow dropping JSON preset anywhere on the page (document-level fallback)
document.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.type === 'application/json' || (i.kind === 'file'))) e.preventDefault(); });
document.addEventListener('drop', e => {
  const jsonFile = [...e.dataTransfer.files].find(f => f.name.endsWith('.json'));
  if (jsonFile) { e.preventDefault(); loadPreset({ target: { files: [jsonFile] } }); }
});

async function loadPdf(file, which) {
  cacheAbort = true;
  await sleep(20);
  cacheAbort = false;
  const nameEl = which === 'old' ? DOM.nameOld : DOM.nameNew;
  const zoneEl = which === 'old' ? DOM.zoneOld : DOM.zoneNew;
  nameEl.textContent = file.name;
  zoneEl.classList.add('has-file');
  const buf = await file.arrayBuffer();
  if (which === 'old') { pdfBufOld = buf.slice(0); recoloredOld = null; }
  else { pdfBufNew = buf.slice(0); recoloredNew = null; }
  cacheOld = {}; cacheNew = {}; lruOrder = []; lruSet = new Set();
  _trackedCacheBytes = 0;
  if (maxPages > 0) updateCacheUI();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  if (which === 'old') pdfOld = pdf; else pdfNew = pdf;
  DOM.btnCompare.disabled = !(pdfOld && pdfNew);
  syncColors();
  // Rebuild thumbnails only when new document is uploaded (thumbnails show new doc only)
  if (which === 'new') {
    maxPages = Math.max(pdfOld ? pdfOld.numPages : 0, pdfNew.numPages);
    rebuildThumbsNow();
  }
}

// ═══════════════════════════════════════
//  RENDER SCALE
// ═══════════════════════════════════════
function getRenderScale() {
  const ppi = Math.max(36, Math.min(600, parseInt(DOM.ppiSelect.value) || 150));
  return ppi / 72;
}

// ═══════════════════════════════════════
//  COMPARE
// ═══════════════════════════════════════
async function runCompare() {
  if (processing) return;
  processing = true;
  cacheAbort = true; await sleep(50); cacheAbort = false;
  DOM.btnCompare.textContent = 'Rendering page 1…';
  DOM.placeholder.style.display = 'none';
  DOM.canvasContainer.style.display = 'block';
  DOM.zoomBar.classList.add('show');
  DOM.bottomBar.classList.add('show');
  // Set correct layout for current mode
  if (mode === 'sidebyside') {
    DOM.canvasPad.style.display = 'none';
    DOM.sbsWrapper.style.display = 'flex';
  } else {
    DOM.canvasPad.style.display = '';
    DOM.sbsWrapper.style.display = 'none';
  }
  maxPages = Math.max(pdfOld.numPages, pdfNew.numPages);
  currentPage = 1;
  const ppi = parseInt(DOM.ppiSelect.value);
  if (cachePPI !== ppi) { cacheOld = {}; cacheNew = {}; lruOrder = []; lruSet = new Set(); _trackedCacheBytes = 0; }
  cachePPI = ppi;
  invalidateRecolor();
  hasRenderedOnce = false;
  await renderPage(1);
  updatePageNav(); updateCacheUI();
  DOM.cacheTo.value = maxPages;
  DOM.cacheFrom.max = maxPages;
  DOM.cacheTo.max = maxPages;
  DOM.btnCompare.textContent = 'Compare Revisions';
  processing = false;
  rebuildThumbsNow();
}

// ═══════════════════════════════════════
//  CACHE SYSTEM
// ═══════════════════════════════════════
function isPageCached(p) { return cacheOld[p] !== undefined && cacheNew[p] !== undefined; }
function getCachedCount() { let n=0; for(let p=1;p<=maxPages;p++) if(isPageCached(p)) n++; return n; }

function estimateCacheMemMB() {
  let bytes = _trackedCacheBytes;
  // Data URLs are base64-encoded; each char is 1 byte in JS string (UCS-2 = 2 bytes per char)
  for (const k in thumbDataUrls) if (thumbDataUrls[k]) bytes += thumbDataUrls[k].length * 2;
  return (bytes / 1048576).toFixed(1);
}

function updateCacheUI() {
  const total = maxPages, cached = getCachedCount();
  if (cached >= total) { DOM.cacheStatus.textContent = `✓ All ${total} pages cached`; DOM.cacheStatus.style.color = '#3fb950'; }
  else { DOM.cacheStatus.textContent = `${cached}/${total} pages cached`; DOM.cacheStatus.style.color = ''; }
  DOM.cacheBar.style.width = total > 0 ? (cached/total*100)+'%' : '0%';
  DOM.cacheBar.style.background = cached >= total ? '#3fb950' : '#58a6ff';
  const usedMB = parseFloat(estimateCacheMemMB());
  const pct = Math.min(100, (usedMB / cacheMemLimitMB * 100)).toFixed(0);
  DOM.memEst.textContent = `~${usedMB} / ${cacheMemLimitMB} MB (${pct}%)`;
  DOM.memEst.style.color = usedMB > cacheMemLimitMB * 0.9 ? '#ff6b6b' : '';
  // Update collapsed summary
  DOM.cacheSummaryText.textContent = DOM.cacheStatus.textContent;
  DOM.cacheSummaryMem.textContent = `${usedMB} / ${cacheMemLimitMB} MB`;
  DOM.cacheIndicator.innerHTML = '';
  if (total > 0 && total <= 60) {
    let html = '';
    for (let p=1; p<=total; p++) {
      const cls = (isPageCached(p)?'cached ':'') + (p===currentPage?'active':'');
      html += `<div class="cache-dot ${cls}" data-page="${p}" title="Page ${p}${isPageCached(p)?' (cached)':''}">${p}</div>`;
    }
    DOM.cacheIndicator.innerHTML = html;
  } else if (total > 60) {
    DOM.cacheIndicator.innerHTML = `<span style="font-size:9px;color:var(--text-dim);">${cached}/${total} pages — use range cache</span>`;
  }
}
DOM.cacheIndicator.addEventListener('click', e => {
  const dot = e.target.closest('.cache-dot');
  if (!dot) return;
  const p = parseInt(dot.dataset.page);
  if (isNaN(p)) return;
  currentPage = p;
  loadOffsetUI();
  renderPage(p).then(() => { updatePageNav(); updateCacheUI(); });
});

async function cacheRange() {
  const from = Math.max(1, parseInt(DOM.cacheFrom.value)||1);
  const to = Math.min(maxPages, parseInt(DOM.cacheTo.value)||maxPages);
  if (from > to || !pdfOld || !pdfNew) return;
  cacheAbort = false;
  for (let p = from; p <= to; p++) {
    if (cacheAbort) break;
    if (isPageCached(p)) { touchLRU(p); continue; }
    DOM.btnCompare.textContent = `Caching ${p}/${to}…`;
    evictUntilFits(estimatePageBytes());
    if (cacheOld[p] === undefined) {
      const img = await renderPdfPage(pdfOld, p);
      cacheOld[p] = img;
      if (img) _trackedCacheBytes += img.data.byteLength;
    }
    if (cacheAbort) break;
    if (cacheNew[p] === undefined) {
      const img = await renderPdfPage(pdfNew, p);
      cacheNew[p] = img;
      if (img) _trackedCacheBytes += img.data.byteLength;
    }
    if (cacheAbort) break;
    touchLRU(p);
    updateCacheUI();
    await sleep(10);
  }
  DOM.btnCompare.textContent = 'Compare Revisions';
  updateCacheUI();
}
async function cacheAllPages() { DOM.cacheFrom.value=1; DOM.cacheTo.value=maxPages; await cacheRange(); }
function clearCache() {
  cacheAbort = true;
  cacheOld = {}; cacheNew = {};
  _trackedCacheBytes = 0;
  invalidateRecolor();
  lruOrder = []; lruSet = new Set();
  if (rawOld) { cacheOld[currentPage] = rawOld; _trackedCacheBytes += rawOld.data.byteLength; touchLRU(currentPage); }
  if (rawNew) { cacheNew[currentPage] = rawNew; _trackedCacheBytes += rawNew.data.byteLength; }
  clearThumbCache();
  updateCacheUI();
}

// ═══════════════════════════════════════
//  RENDER PAGE
// ═══════════════════════════════════════
async function renderPage(num) {
  if (cacheOld[num] !== undefined) {
    rawOld = cacheOld[num];
  } else {
    evictUntilFits(estimatePageBytes());
    rawOld = await renderPdfPage(pdfOld, num);
    if (rawOld) {
      cacheOld[num] = rawOld;
      _trackedCacheBytes += rawOld.data.byteLength;
    }
  }
  if (cacheNew[num] !== undefined) {
    rawNew = cacheNew[num];
  } else {
    rawNew = await renderPdfPage(pdfNew, num);
    if (rawNew) {
      cacheNew[num] = rawNew;
      _trackedCacheBytes += rawNew.data.byteLength;
    }
  }
  if (!rawOld && !rawNew) return;
  touchLRU(num);
  invalidateRecolor();
  _doRecolorAndComposite();
  if (!hasRenderedOnce) { hasRenderedOnce = true; requestAnimationFrame(() => zoomFit()); }
}

async function renderPdfPage(pdf, num) {
  if (!pdf || num > pdf.numPages) return null;
  const page = await pdf.getPage(num);
  const vp = page.getViewport({ scale: getRenderScale() });
  const c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  // FIX: willReadFrequently hint — tells browser we'll call getImageData
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,vp.width,vp.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const imgData = ctx.getImageData(0,0,vp.width,vp.height);
  c.width = 0; c.height = 0;
  return imgData;
}

// ═══════════════════════════════════════
//  RECOLOR — cached, only recomputed when colors change
// ═══════════════════════════════════════
function invalidateRecolor() {
  recoloredOld = null; recoloredNew = null;
  lastColorOld = ''; lastColorNew = '';
}

function recolor(src, rgb) {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  const tR = rgb[0], tG = rgb[1], tB = rgb[2];
  const len = d.length;
  // FIX: tighter loop — bitwise truncation, cached invDk
  for (let i = 0; i < len; i += 4) {
    const dk = 1 - (0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]) / 255;
    if (dk < 0.03) {
      d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = 0;
    } else {
      const invDk = 1 - dk;
      d[i]   = (tR*dk + 255*invDk + 0.5) | 0;
      d[i+1] = (tG*dk + 255*invDk + 0.5) | 0;
      d[i+2] = (tB*dk + 255*invDk + 0.5) | 0;
      d[i+3] = (dk*255 + 0.5) | 0;
    }
  }
  return out;
}

// FIX: reuse temp canvases instead of creating new ones each frame
function putImgToTempCanvas(img, tmpCanvas, tmpCtx) {
  if (tmpCanvas.width !== img.width) tmpCanvas.width = img.width;
  if (tmpCanvas.height !== img.height) tmpCanvas.height = img.height;
  tmpCtx.putImageData(img, 0, 0);
  return tmpCanvas;
}

// Synchronous recolor + composite — safe, no async race conditions
function _doRecolorAndComposite() {
  const cOldHex = DOM.colorOld.value;
  const cNewHex = DOM.colorNew.value;
  // Only recolor if color actually changed or data is new
  if (!recoloredOld || lastColorOld !== cOldHex) {
    recoloredOld = rawOld ? recolor(rawOld, hexToRgb(cOldHex)) : null;
    lastColorOld = cOldHex;
  }
  if (!recoloredNew || lastColorNew !== cNewHex) {
    recoloredNew = rawNew ? recolor(rawNew, hexToRgb(cNewHex)) : null;
    lastColorNew = cNewHex;
  }
  const w = Math.max(recoloredOld?recoloredOld.width:0, recoloredNew?recoloredNew.width:0);
  const h = Math.max(recoloredOld?recoloredOld.height:0, recoloredNew?recoloredNew.height:0);
  composite(w, h, recoloredOld, recoloredNew);
}

// FIX: rAF-gated — coalesces rapid slider/offset events into max 1 composite per frame
function recolorAndComposite() {
  if (_compositeScheduled) return;  // already queued for this frame, skip
  _compositeScheduled = true;
  requestAnimationFrame(() => {
    _compositeScheduled = false;
    _doRecolorAndComposite();
  });
}

// ═══════════════════════════════════════
//  COMPOSITE — synchronous, uses reusable temp canvases, supports per-layer scale
// ═══════════════════════════════════════
function composite(w, h, imgO, imgN) {
  const out = DOM.canvasOutput;
  const aO = parseInt(DOM.sliderOpacityOld.value)/100;
  const aN = parseInt(DOM.sliderOpacityNew.value)/100;
  const ps = getPageScale(currentPage);
  const sO = ps.old / 100;
  const sN = ps.new / 100;
  const off = getPageOffset(currentPage);
  const ox = off.x, oy = off.y;
  const absOx = Math.abs(ox), absOy = Math.abs(oy);

  // Scaled dimensions for each layer
  const wO = imgO ? imgO.width * sO : 0, hO = imgO ? imgO.height * sO : 0;
  const wN = imgN ? imgN.width * sN : 0, hN = imgN ? imgN.height * sN : 0;

  const xform = getPageTransform(currentPage);

  if (mode === 'overlay') {
    // Determine draw order for alpha mode
    const secondBlend = blendMode === 'multiply' ? 'multiply' : 'source-over';
    // In alpha mode, alphaMain determines which layer is on top (drawn second)
    const oldFirst = blendMode === 'multiply' || alphaMain === 'new';

    if (xform) {
      // Affine transform mode: old stays fixed, new is transformed
      // The stored affine already has sN baked into its linear components (a,b,c,d),
      // so we apply it directly without multiplying by sN again.
      const corners = [[0,0],[imgN.width,0],[0,imgN.height],[imgN.width,imgN.height]];
      let minX=0, minY=0, maxX=wO, maxY=hO;
      corners.forEach(([px,py]) => {
        const cx = xform.a*px + xform.b*py + xform.e;
        const cy = xform.c*px + xform.d*py + xform.f;
        maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy);
        minX = Math.min(minX, cx); minY = Math.min(minY, cy);
      });
      // Shift everything so negative coords become positive
      const shiftX = minX < 0 ? -minX : 0;
      const shiftY = minY < 0 ? -minY : 0;
      const canvasW = Math.ceil(maxX - minX);
      const canvasH = Math.ceil(maxY - minY);
      out.width = canvasW; out.height = canvasH;
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvasW, canvasH);

      const drawOldLayer = () => {
        if (imgO && visOld) { ctx.globalAlpha = aO; ctx.drawImage(putImgToTempCanvas(imgO, _tmpCanvasA, _tmpCtxA), 0, 0, imgO.width, imgO.height, shiftX, shiftY, wO, hO); }
      };
      const drawNewLayer = () => {
        if (imgN && visNew) {
          ctx.globalAlpha = aN; ctx.save();
          ctx.setTransform(xform.a, xform.c, xform.b, xform.d, xform.e + shiftX, xform.f + shiftY);
          ctx.drawImage(putImgToTempCanvas(imgN, _tmpCanvasB, _tmpCtxB), 0, 0);
          ctx.restore();
        }
      };

      if (oldFirst) { drawOldLayer(); ctx.globalCompositeOperation = secondBlend; drawNewLayer(); }
      else { drawNewLayer(); ctx.globalCompositeOperation = secondBlend; drawOldLayer(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      renderDrawLayer('overlay');
    } else {
    // Standard offset-based alignment (with optional rotation)
    const rotDeg = getPageRotation(currentPage);
    const rotRad = rotDeg * Math.PI / 180;
    const totalW = Math.max(wO, wN + absOx), totalH = Math.max(hO, hN + absOy);
    const canvasW = Math.max(wO + (ox < 0 ? absOx : 0), wN + (ox > 0 ? ox : 0), totalW);
    const canvasH = Math.max(hO + (oy < 0 ? absOy : 0), hN + (oy > 0 ? oy : 0), totalH);
    const oldDx = ox<0?absOx:0, oldDy = oy<0?absOy:0;
    const newDx = ox>0?ox:0, newDy = oy>0?oy:0;
    out.width = canvasW; out.height = canvasH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvasW,canvasH);

    const drawOldLayer = () => {
      if (imgO && visOld) { ctx.globalAlpha=aO; ctx.drawImage(putImgToTempCanvas(imgO,_tmpCanvasA,_tmpCtxA),0,0,imgO.width,imgO.height,oldDx,oldDy,wO,hO); }
    };
    const drawNewLayer = () => {
      if (imgN && visNew) {
        ctx.globalAlpha=aN;
        if (Math.abs(rotDeg) > 0.001) {
          const cx = newDx + wN / 2, cy = newDy + hN / 2;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotRad);
          ctx.drawImage(putImgToTempCanvas(imgN,_tmpCanvasB,_tmpCtxB),0,0,imgN.width,imgN.height,-wN/2,-hN/2,wN,hN);
          ctx.restore();
        } else {
          ctx.drawImage(putImgToTempCanvas(imgN,_tmpCanvasB,_tmpCtxB),0,0,imgN.width,imgN.height,newDx,newDy,wN,hN);
        }
      }
    };

    if (oldFirst) { drawOldLayer(); ctx.globalCompositeOperation = secondBlend; drawNewLayer(); }
    else { drawNewLayer(); ctx.globalCompositeOperation = secondBlend; drawOldLayer(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    renderDrawLayer('overlay');
    }
  } else {
    // Side-by-side: render to two separate canvases
    // Offset logic: positive ox/oy shifts new right/down, negative shifts old right/down
    const cOld = DOM.sbsCanvasOld, cNew = DOM.sbsCanvasNew;
    const oldDxSbs = ox < 0 ? absOx : 0, oldDySbs = oy < 0 ? absOy : 0;
    const newDxSbs = ox > 0 ? ox : 0,    newDySbs = oy > 0 ? oy : 0;
    // Old pane
    if (imgO && visOld) {
      cOld.width = wO + oldDxSbs; cOld.height = hO + oldDySbs;
      const ctxO = cOld.getContext('2d');
      ctxO.fillStyle = '#fff'; ctxO.fillRect(0,0,cOld.width,cOld.height);
      ctxO.globalAlpha = aO;
      ctxO.drawImage(putImgToTempCanvas(imgO,_tmpCanvasA,_tmpCtxA),0,0,imgO.width,imgO.height,oldDxSbs,oldDySbs,wO,hO);
      ctxO.globalAlpha = 1;
    } else { cOld.width = 1; cOld.height = 1; }
    // New pane
    if (imgN && visNew) {
      cNew.width = wN + newDxSbs; cNew.height = hN + newDySbs;
      const ctxN = cNew.getContext('2d');
      ctxN.fillStyle = '#fff'; ctxN.fillRect(0,0,cNew.width,cNew.height);
      ctxN.globalAlpha = aN;
      ctxN.drawImage(putImgToTempCanvas(imgN,_tmpCanvasB,_tmpCtxB),0,0,imgN.width,imgN.height,newDxSbs,newDySbs,wN,hN);
      ctxN.globalAlpha = 1;
    } else { cNew.width = 1; cNew.height = 1; }
    // Update labels with colors
    DOM.sbsLabelOld.style.background = DOM.colorOld.value;
    DOM.sbsLabelNew.style.background = DOM.colorNew.value;
    // Re-render draw layers on top
    if (typeof renderDrawLayer === 'function') {
      renderDrawLayer('old'); renderDrawLayer('new');
      renderDrawLayer('overlay');
    }
    // Also render to the main output canvas for export
    out.width = Math.max(wO, wN); out.height = Math.max(hO, hN);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,out.width,out.height);
    if (imgO && visOld) { ctx.globalAlpha=aO; ctx.drawImage(cOld,0,0); }
    if (imgN && visNew) { ctx.globalAlpha=aN; ctx.drawImage(cNew,0,0); }
    ctx.globalAlpha = 1;
  }
  applySbsZoom();
  applyZoom();
}

// ═══════════════════════════════════════
//  ZOOM
// ═══════════════════════════════════════
function applyZoom() {
  const dw = DOM.canvasOutput.width*currentZoom, dh = DOM.canvasOutput.height*currentZoom;
  DOM.canvasContainer.style.width = dw+'px'; DOM.canvasContainer.style.height = dh+'px';
  DOM.canvasOutput.style.width = '100%'; DOM.canvasOutput.style.height = '100%';
  DOM.canvasPad.style.minWidth = (dw+48)+'px'; DOM.canvasPad.style.minHeight = (dh+48)+'px';
  DOM.zoomLabel.textContent = Math.round(currentZoom*getRenderScale()*100)+'%';
}
function applySbsZoom() {
  if (mode !== 'sidebyside') return;
  // Scale the SBS canvases via CSS width/height
  const cO = DOM.sbsCanvasOld, cN = DOM.sbsCanvasNew;
  cO.style.width = (cO.width*currentZoom)+'px'; cO.style.height = (cO.height*currentZoom)+'px';
  cN.style.width = (cN.width*currentZoom)+'px'; cN.style.height = (cN.height*currentZoom)+'px';
  // Sync draw layer sizes
  syncDrawLayerSize('old');
  syncDrawLayerSize('new');
}
function doZoom(delta) {
  currentZoom = Math.max(0.03, Math.min(5, currentZoom+delta));
  applyZoom(); applySbsZoom();
}
function zoomFit() {
  if (mode === 'sidebyside') {
    // Fit to one pane (half the area width)
    const paneW = DOM.canvasArea.clientWidth / 2 - 30;
    const paneH = DOM.canvasArea.clientHeight - 64;
    const cW = Math.max(DOM.sbsCanvasOld.width, DOM.sbsCanvasNew.width, 1);
    const cH = Math.max(DOM.sbsCanvasOld.height, DOM.sbsCanvasNew.height, 1);
    currentZoom = Math.min(paneW / cW, paneH / cH);
  } else {
    if (!DOM.canvasOutput.width||!DOM.canvasOutput.height) return;
    currentZoom = Math.min((DOM.canvasArea.clientWidth-64)/DOM.canvasOutput.width, (DOM.canvasArea.clientHeight-64)/DOM.canvasOutput.height);
  }
  applyZoom(); applySbsZoom();
}

// ═══════════════════════════════════════
//  CONTROLS
// ═══════════════════════════════════════
const _debouncedComposite = debounce(() => { if (rawOld || rawNew) recolorAndComposite(); }, 30);
const _debouncedApplyScale = debounce(_applyScale, 30);
function updateOpacity() {
  DOM.valOpacityOld.textContent = DOM.sliderOpacityOld.value+'%';
  DOM.valOpacityNew.textContent = DOM.sliderOpacityNew.value+'%';
  syncColors();
  _debouncedComposite();
}
// Scale: slider → input sync → apply
function sliderScale() {
  DOM.inputScaleOld.value = DOM.sliderScaleOld.value;
  DOM.inputScaleNew.value = DOM.sliderScaleNew.value;
  _debouncedApplyScale();
}
function inputScale() {
  const sO = Math.max(10, Math.min(500, parseFloat(DOM.inputScaleOld.value) || 100));
  const sN = Math.max(10, Math.min(500, parseFloat(DOM.inputScaleNew.value) || 100));
  DOM.sliderScaleOld.value = Math.max(25, Math.min(200, sO));
  DOM.sliderScaleNew.value = Math.max(25, Math.min(200, sN));
  _applyScale();
}
function _applyScale() {
  const sO = parseFloat(DOM.inputScaleOld.value) || 100;
  const sN = parseFloat(DOM.inputScaleNew.value) || 100;
  const pages = DOM.transformScope.value === 'all' ? Array.from({length:maxPages},(_,i)=>i+1) : [currentPage];
  for (const p of pages) {
    const xf = getPageTransform(p);
    if (xf && rawNew) {
      // Scale the affine's linear part proportionally, keeping center stable
      const oldSN = getPageScale(p).new;
      if (oldSN > 0) {
        const ratio = sN / oldSN;
        const imgW = rawNew.width, imgH = rawNew.height;
        // Adjust translation so the image center stays in place
        const cxBefore = xf.a * imgW/2 + xf.b * imgH/2;
        const cyBefore = xf.c * imgW/2 + xf.d * imgH/2;
        xf.a *= ratio; xf.b *= ratio; xf.c *= ratio; xf.d *= ratio;
        xf.e += (1 - ratio) * cxBefore;
        xf.f += (1 - ratio) * cyBefore;
        setPageTransform(p, xf);
      }
    } else {
      clearPageTransform(p);
    }
    setPageScale(p, sO, sN);
  }
  if (rawOld || rawNew) recolorAndComposite();
}
function resetScale() {
  if (DOM.transformScope.value === 'all') {
    pageScales = {};
  } else {
    delete pageScales[String(currentPage)];
  }
  loadScaleUI();
  if (rawOld || rawNew) recolorAndComposite();
}
function matchScale() {
  const sN = parseFloat(DOM.inputScaleNew.value) || 100;
  if (DOM.transformScope.value === 'all') {
    for (let p = 1; p <= maxPages; p++) { const s = getPageScale(p); setPageScale(p, sN, s.new); }
  } else {
    const s = getPageScale(currentPage); setPageScale(currentPage, sN, s.new);
  }
  loadScaleUI();
  if (rawOld || rawNew) recolorAndComposite();
}
function setMode(m) {
  mode = m;
  DOM.modeOverlay.classList.toggle('active', m==='overlay');
  DOM.modeSidebyside.classList.toggle('active', m==='sidebyside');
  // Single stroke list shared between modes — no sync needed
  if (hasRenderedOnce) {
    if (m === 'sidebyside') {
      DOM.canvasPad.style.display = 'none';
      DOM.sbsWrapper.style.display = 'flex';
    } else {
      DOM.canvasPad.style.display = '';
      DOM.sbsWrapper.style.display = 'none';
    }
  }
  if (rawOld || rawNew) recolorAndComposite();
}

function setBlendMode(bm) {
  blendMode = bm;
  DOM.blendMultiply.classList.toggle('active', bm === 'multiply');
  DOM.blendAlpha.classList.toggle('active', bm === 'alpha');
  DOM.alphaMainRow.style.display = bm === 'alpha' ? '' : 'none';
  invalidateRecolor();
  syncColors();
  if (rawOld || rawNew) recolorAndComposite();
}

function setAlphaMain(which) {
  alphaMain = which;
  DOM.alphaMainOld.classList.toggle('active', which === 'old');
  DOM.alphaMainNew.classList.toggle('active', which === 'new');
  if (rawOld || rawNew) recolorAndComposite();
}

function toggleXhair() {
  xhairEnabled = !xhairEnabled;
  DOM.xhairToggle.classList.toggle('active', xhairEnabled);
  if (!xhairEnabled) {
    clearXhair(DOM.sbsXhairOld); clearXhair(DOM.sbsXhairNew);
    clearXhair(DOM.overlayXhair);
  }
}

function toggleVis(which) {
  if (which==='old') visOld=!visOld; else visNew=!visNew;
  syncColors();
  if (rawOld || rawNew) recolorAndComposite();
}
const _onColorChange = debounce(() => {
  DOM.presetGrid.querySelectorAll('.preset-pill').forEach(el => el.classList.remove('selected'));
  invalidateRecolor(); syncColors();
  if (rawOld || rawNew) recolorAndComposite();
}, 80);
// Immediate UI feedback for swatches, debounced recolor for performance
DOM.colorOld.addEventListener('input', () => { syncColors(); _onColorChange(); });
DOM.colorNew.addEventListener('input', () => { syncColors(); _onColorChange(); });

async function changePPI() {
  if (!pdfOld&&!pdfNew) return; if (!rawOld&&!rawNew) return;
  const oldPPI = cachePPI || parseInt(DOM.ppiSelect.value);
  const newPPI = parseInt(DOM.ppiSelect.value);
  // Scale all offsets proportionally so alignment is preserved
  if (oldPPI > 0 && newPPI > 0 && oldPPI !== newPPI) {
    const ratio = newPPI / oldPPI;
    for (const key in pageOffsets) {
      pageOffsets[key].x = Math.round(pageOffsets[key].x * ratio);
      pageOffsets[key].y = Math.round(pageOffsets[key].y * ratio);
    }
    // Scale affine transform translations proportionally
    for (const key in pageTransforms) {
      pageTransforms[key].e *= ratio;
      pageTransforms[key].f *= ratio;
    }
    loadOffsetUI();
  }
  cacheAbort = true; await sleep(50); cacheAbort = false;
  cacheOld={}; cacheNew={}; lruOrder=[]; lruSet = new Set();
  _trackedCacheBytes = 0;
  invalidateRecolor();
  cachePPI = newPPI;
  DOM.btnCompare.textContent = 'Re-rendering…';
  hasRenderedOnce = false;
  await renderPage(currentPage);
  DOM.btnCompare.textContent = 'Compare Revisions';
  updateCacheUI();
}

// ═══════════════════════════════════════
//  TRANSFORM — unified scale, translation, rotation, 3-point align
// ═══════════════════════════════════════

// -- Sub-section toggle --
function toggleSubSection(headerEl) {
  headerEl.parentElement.classList.toggle('collapsed');
}
function toggleCacheSection(titleEl) {
  const chevron = titleEl.querySelector('.sub-section-chevron');
  const detail = DOM.cacheDetail;
  const summary = DOM.cacheSummaryText.parentElement;
  if (detail.style.display === 'none') {
    detail.style.display = '';
    summary.style.display = 'none';
    chevron.textContent = '▾';
  } else {
    detail.style.display = 'none';
    summary.style.display = '';
    chevron.textContent = '▸';
  }
}
// -- Reset all transforms for scope --
function resetAllTransforms() {
  const all = DOM.transformScope.value === 'all';
  if (all) { pageScales = {}; pageOffsets = {}; pageRotations = {}; pageTransforms = {}; }
  else {
    const p = String(currentPage);
    delete pageScales[p]; delete pageOffsets[p]; delete pageRotations[p]; delete pageTransforms[p];
  }
  loadTransformUI();
  if (rawOld || rawNew) recolorAndComposite();
}

// -- Scale --
function getPageScale(page) { return pageScales[String(page)] || { old: 100, new: 100 }; }
function setPageScale(page, sOld, sNew) { pageScales[String(page)] = { old: sOld, new: sNew }; }
function loadScaleUI() {
  const s = getPageScale(currentPage);
  DOM.inputScaleOld.value = s.old;
  DOM.inputScaleNew.value = s.new;
  DOM.sliderScaleOld.value = Math.max(25, Math.min(200, s.old));
  DOM.sliderScaleNew.value = Math.max(25, Math.min(200, s.new));
}

// -- Rotation --
function getPageRotation(page) { return pageRotations[String(page)] || 0; }
function setPageRotation(page, deg) { pageRotations[String(page)] = deg; }
function loadRotationUI() {
  DOM.inputRotation.value = getPageRotation(currentPage);
}
function applyRotation() {
  const deg = parseFloat(DOM.inputRotation.value) || 0;
  const pages = DOM.transformScope.value === 'all' ? Array.from({length:maxPages},(_,i)=>i+1) : [currentPage];
  for (const p of pages) {
    const xf = getPageTransform(p);
    if (xf && rawNew) {
      // Compose rotation delta into the affine, rotating around the image center
      const oldDeg = getPageRotation(p);
      const deltaRad = (deg - oldDeg) * Math.PI / 180;
      if (Math.abs(deltaRad) > 1e-10) {
        const cosD = Math.cos(deltaRad), sinD = Math.sin(deltaRad);
        const imgW = rawNew.width, imgH = rawNew.height;
        // Center of transformed image (before shift)
        const cxT = xf.a * imgW/2 + xf.b * imgH/2 + xf.e;
        const cyT = xf.c * imgW/2 + xf.d * imgH/2 + xf.f;
        // Rotate linear part: R(Δ) * [a b; c d]
        const na = cosD * xf.a - sinD * xf.c;
        const nb = cosD * xf.b - sinD * xf.d;
        const nc = sinD * xf.a + cosD * xf.c;
        const nd = sinD * xf.b + cosD * xf.d;
        // Rotate translation around center
        const ne = cosD * (xf.e - cxT) - sinD * (xf.f - cyT) + cxT;
        const nf = sinD * (xf.e - cxT) + cosD * (xf.f - cyT) + cyT;
        xf.a = na; xf.b = nb; xf.c = nc; xf.d = nd; xf.e = ne; xf.f = nf;
        setPageTransform(p, xf);
      }
    } else {
      clearPageTransform(p);
    }
    setPageRotation(p, deg);
  }
  if (rawOld || rawNew) recolorAndComposite();
}
function resetRotation() {
  if (DOM.transformScope.value === 'all') pageRotations = {};
  else delete pageRotations[String(currentPage)];
  loadRotationUI();
  if (rawOld || rawNew) recolorAndComposite();
}

// -- Translation (offset) --
function getPageOffset(page) { return pageOffsets[String(page)] || {x:0,y:0}; }
function setPageOffset(page, x, y) { pageOffsets[String(page)] = {x,y}; }

// -- Load all transform UI for current page --
function loadTransformUI() {
  const off = getPageOffset(currentPage);
  DOM.offsetX.value = off.x;
  DOM.offsetY.value = off.y;
  syncSliders();
  loadScaleUI();
  loadRotationUI();
  if (typeof updateAlign3UI === 'function') updateAlign3UI();
}
// Legacy alias — many call sites use loadOffsetUI
function loadOffsetUI() { loadTransformUI(); }
function syncSliders() {
  const x=parseFloat(DOM.offsetX.value)||0, y=parseFloat(DOM.offsetY.value)||0;
  DOM.offsetXSlider.value = Math.max(parseInt(DOM.offsetXSlider.min),Math.min(parseInt(DOM.offsetXSlider.max),x));
  DOM.offsetYSlider.value = Math.max(parseInt(DOM.offsetYSlider.min),Math.min(parseInt(DOM.offsetYSlider.max),y));
}
function sliderToInput(axis) {
  if (axis==='x') { DOM.offsetX.value = DOM.offsetXSlider.value; }
  else { DOM.offsetY.value = DOM.offsetYSlider.value; }
  applyOffset();
}
function updateSliderRange() {
  const r = Math.max(50, parseInt(DOM.offsetRange.value)||500);
  DOM.offsetRange.value = r;
  DOM.offsetXSlider.min=-r; DOM.offsetXSlider.max=r;
  DOM.offsetYSlider.min=-r; DOM.offsetYSlider.max=r;
  syncSliders();
}
function applyOffset() {
  const x=parseFloat(DOM.offsetX.value)||0, y=parseFloat(DOM.offsetY.value)||0;
  syncSliders();
  const pages = DOM.transformScope.value==='all' ? Array.from({length:maxPages},(_,i)=>i+1) : [currentPage];
  for (const p of pages) {
    const xf = getPageTransform(p);
    if (xf) {
      // Update affine translation to match new offset, preserving the transform
      const oldOff = getPageOffset(p);
      xf.e += (x - oldOff.x); xf.f += (y - oldOff.y);
      setPageTransform(p, xf);
    } else {
      clearPageTransform(p);
    }
    setPageOffset(p, x, y);
  }
  if (rawOld||rawNew) recolorAndComposite();
}
function nudgeOffset(dx,dy) {
  const scope=DOM.transformScope.value;
  const pages = scope==='all' ? Array.from({length:maxPages},(_,i)=>i+1) : [currentPage];
  for (const p of pages) {
    const xf = getPageTransform(p);
    if (xf) {
      // Update affine translation directly so the transform is preserved
      xf.e += dx; xf.f += dy;
      setPageTransform(p, xf);
    } else {
      clearPageTransform(p);
    }
    const o = getPageOffset(p);
    setPageOffset(p, o.x + dx, o.y + dy);
  }
  loadOffsetUI();
  if (rawOld||rawNew) recolorAndComposite();
}
function resetOffset() {
  if (DOM.transformScope.value==='all') pageOffsets={};
  else delete pageOffsets[String(currentPage)];
  loadOffsetUI();
  if (rawOld||rawNew) recolorAndComposite();
}

// ═══════════════════════════════════════
//  PAGE NAV
// ═══════════════════════════════════════
function updatePageNav() {
  DOM.pageGoto.value = currentPage;
  DOM.pageGoto.max = maxPages;
  DOM.pageGoto.style.width = Math.max(3, String(maxPages).length + 1) + 'ch';
  DOM.pageTotal.textContent = maxPages;
  DOM.btnPrev.disabled = (currentPage<=1);
  DOM.btnNext.disabled = (currentPage>=maxPages);
  DOM.thumbScroll.querySelectorAll('.thumb-item').forEach((el,i) => el.classList.toggle('active', i+1===currentPage));
  const activeThumb = DOM.thumbScroll.querySelector('.thumb-item.active');
  if (activeThumb) activeThumb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function goToPage() {
  const n = parseInt(DOM.pageGoto.value);
  if (isNaN(n) || n < 1 || n > maxPages || n === currentPage) return;
  currentPage = n; loadOffsetUI();
  renderPage(currentPage).then(() => { updatePageNav(); updateCacheUI(); });
}
async function changePage(delta) {
  const n = currentPage+delta; if(n<1||n>maxPages) return;
  currentPage = n; loadOffsetUI();
  await renderPage(currentPage);
  updatePageNav(); updateCacheUI();
}

// ═══════════════════════════════════════
//  SAVE / LOAD PRESET
// ═══════════════════════════════════════
function bufToBase64(buf) { const b=new Uint8Array(buf); let s=''; const c=8192; for(let i=0;i<b.length;i+=c) s+=String.fromCharCode.apply(null,b.subarray(i,i+c)); return btoa(s); }
function base64ToBuf(b64) { const s=atob(b64),b=new Uint8Array(s.length); for(let i=0;i<s.length;i++) b[i]=s.charCodeAt(i); return b.buffer; }

async function savePreset() {
  const btn = document.querySelector('.save-btn.primary');
  btn.textContent = '⏳ Saving…'; btn.style.pointerEvents = 'none';
  await sleep(50);
  const preset = { version:2, ...gatherUISettings(), pageOffsets: JSON.parse(JSON.stringify(pageOffsets)), pageScales: JSON.parse(JSON.stringify(pageScales)), pageRotations: JSON.parse(JSON.stringify(pageRotations)), pageTransforms: JSON.parse(JSON.stringify(pageTransforms)), maxPages, currentPage,
    fileOld: DOM.nameOld.textContent||'', fileNew: DOM.nameNew.textContent||'', savedAt: new Date().toISOString() };
  if (pdfBufOld) preset.pdfOldB64 = bufToBase64(pdfBufOld);
  if (pdfBufNew) preset.pdfNewB64 = bufToBase64(pdfBufNew);
  const json = JSON.stringify(preset);
  const blob = new Blob([json], {type:'application/json'});
  const sizeMB = (blob.size/1048576).toFixed(1);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `overlay-preset-${new Date().toISOString().slice(0,16).replace(/[T:]/g,'-')}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  btn.textContent = `✓ Saved (${sizeMB} MB)`; btn.style.pointerEvents = '';
  setTimeout(() => { btn.textContent = '💾 Save Preset'; }, 2500);
}

async function loadPreset(e) {
  const file = e.target.files[0]; if(!file) return; e.target.value='';
  DOM.btnCompare.textContent = 'Loading preset…';
  let p; try { p = JSON.parse(await file.text()); } catch(err) { alert('Invalid preset: '+err.message); DOM.btnCompare.textContent='Compare Revisions'; return; }
  if (p.colorOld) DOM.colorOld.value=p.colorOld;
  if (p.colorNew) DOM.colorNew.value=p.colorNew;
  if (p.opacityOld!=null) { DOM.sliderOpacityOld.value=p.opacityOld; DOM.valOpacityOld.textContent=p.opacityOld+'%'; }
  if (p.opacityNew!=null) { DOM.sliderOpacityNew.value=p.opacityNew; DOM.valOpacityNew.textContent=p.opacityNew+'%'; }
  if (p.ppi) DOM.ppiSelect.value=p.ppi;
  if (p.mode) { mode=p.mode; setMode(mode); }
  if (p.visOld!=null) visOld=p.visOld; if(p.visNew!=null) visNew=p.visNew;
  if (p.offsetRange) { DOM.offsetRange.value=p.offsetRange; updateSliderRange(); }
  if (p.transformScope) DOM.transformScope.value=p.transformScope;
  else if (p.offsetScope) DOM.transformScope.value=p.offsetScope;
  if (p.thumbPPI) { thumbPPI=p.thumbPPI; DOM.thumbPPIInput.value=thumbPPI; }
  if (p.memLimitMB) { cacheMemLimitMB=p.memLimitMB; DOM.memLimit.value=cacheMemLimitMB; }
  // Legacy: scaleScope fallback handled above via transformScope || offsetScope
  if (p.pageScales) pageScales=p.pageScales;
  else if (p.scaleOld!=null || p.scaleNew!=null) {
    // Legacy: convert global scale to per-page for all pages
    const sO = p.scaleOld || 100, sN = p.scaleNew || 100;
    pageScales = {}; // will apply as default via getPageScale fallback
    if (sO !== 100 || sN !== 100) {
      const mp = p.maxPages || 1;
      for (let i = 1; i <= mp; i++) pageScales[String(i)] = { old: sO, new: sN };
    }
  }
  if (p.pageTransforms) {
    pageTransforms = {};
    for (const k in p.pageTransforms) {
      const t = p.pageTransforms[k];
      if (t && typeof t.a === 'number' && typeof t.d === 'number' &&
          isFinite(t.a) && isFinite(t.b) && isFinite(t.c) && isFinite(t.d) && isFinite(t.e) && isFinite(t.f)) {
        pageTransforms[k] = { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f };
      } else {
        console.warn('Preset: skipping invalid transform for page', k, t);
      }
    }
  }
  if (p.pageRotations) pageRotations=JSON.parse(JSON.stringify(p.pageRotations));
  if (p.pageOffsets) pageOffsets=JSON.parse(JSON.stringify(p.pageOffsets));
  if (p.pdfOldB64 && p.pdfNewB64) {
    DOM.btnCompare.textContent='Parsing old PDF…'; await sleep(30);
    pdfBufOld=base64ToBuf(p.pdfOldB64); pdfOld=await pdfjsLib.getDocument({data:pdfBufOld.slice(0)}).promise;
    DOM.nameOld.textContent=p.fileOld||'old.pdf'; DOM.zoneOld.classList.add('has-file');
    DOM.btnCompare.textContent='Parsing new PDF…'; await sleep(30);
    pdfBufNew=base64ToBuf(p.pdfNewB64); pdfNew=await pdfjsLib.getDocument({data:pdfBufNew.slice(0)}).promise;
    DOM.nameNew.textContent=p.fileNew||'new.pdf'; DOM.zoneNew.classList.add('has-file');
    maxPages=Math.max(pdfOld.numPages,pdfNew.numPages); currentPage=p.currentPage||1; if(currentPage>maxPages) currentPage=1;
    cachePPI=parseInt(DOM.ppiSelect.value); cacheOld={}; cacheNew={}; lruOrder=[]; lruSet=new Set(); _trackedCacheBytes=0;
    DOM.placeholder.style.display='none'; DOM.canvasContainer.style.display='block'; DOM.zoomBar.classList.add('show'); DOM.bottomBar.classList.add('show');
    if (mode === 'sidebyside') { DOM.canvasPad.style.display = 'none'; DOM.sbsWrapper.style.display = 'flex'; }
    else { DOM.canvasPad.style.display = ''; DOM.sbsWrapper.style.display = 'none'; }
    DOM.btnCompare.disabled=false; DOM.btnCompare.textContent='Rendering page '+currentPage+'…'; await sleep(30);
    invalidateRecolor(); syncColors(); loadOffsetUI();
    hasRenderedOnce=false; await renderPage(currentPage); updatePageNav(); updateCacheUI();
    DOM.cacheTo.value=maxPages;
    DOM.btnCompare.textContent='Compare Revisions';
    rebuildThumbsNow();
  } else {
    syncColors(); loadOffsetUI();
    if (rawOld||rawNew) recolorAndComposite();
    DOM.btnCompare.textContent='Compare Revisions';
    alert('Preset loaded (settings only). Upload PDFs and click Compare.');
  }
}

// ═══════════════════════════════════════
//  EXPORT (with jsPDF availability guard)
// ═══════════════════════════════════════
function _getJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  return null;
}
function _ensureJsPDF() {
  if (_getJsPDF()) return true;
  alert('PDF export unavailable — jsPDF library failed to initialize.');
  return false;
}

// Collect all annotation strokes for the current page (from all sides)
function collectAnnotationsForPage(page) {
  const key = String(page);
  return drawStrokes[key] ? [...drawStrokes[key]] : [];
}

// Render annotations to a temp canvas matching the output canvas size
function renderAnnotationsCanvas(annotations, w, h) {
  if (!annotations.length) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  annotations.forEach(s => drawStrokeToCtx(ctx, s));
  return c;
}

// Composite output + annotations into a single canvas for PNG export
function compositeWithAnnotations() {
  const out = DOM.canvasOutput;
  const annotations = collectAnnotationsForPage(currentPage);
  if (!annotations.length) return out;
  const c = document.createElement('canvas');
  c.width = out.width; c.height = out.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(out, 0, 0);
  const annCanvas = renderAnnotationsCanvas(annotations, out.width, out.height);
  if (annCanvas) ctx.drawImage(annCanvas, 0, 0);
  return c;
}

function exportPNG() {
  if(!DOM.canvasOutput.width) return alert('Nothing to export.');
  const c = compositeWithAnnotations();
  c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`overlay-page-${currentPage}.png`;a.click();URL.revokeObjectURL(a.href);},'image/png');
}
// ── PDF Export compression helpers ──
function getJpegQuality() {
  return (parseInt(DOM.jpegQuality.value) || 85) / 100;
}
function updateJpegQuality() {
  DOM.jpegQualityVal.textContent = DOM.jpegQuality.value + '%';
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
    }, type, quality);
  });
}

// Auto-pick: generate both JPEG and PNG, return whichever is smaller.
// PNG wins on technical drawings (large white areas deflate well);
// JPEG wins on photo-heavy or noisy content.
async function canvasToSmallestImage(canvas, jpegQuality) {
  const [jpegData, pngData] = await Promise.all([
    canvasToBlob(canvas, 'image/jpeg', jpegQuality),
    canvasToBlob(canvas, 'image/png')
  ]);
  if (pngData.byteLength <= jpegData.byteLength) {
    return { data: pngData, format: 'PNG' };
  }
  return { data: jpegData, format: 'JPEG' };
}

const JSPDF_MAX_DIM = 14400;
function pdfPageDims(w, h) {
  const scale = Math.min(1, JSPDF_MAX_DIM / Math.max(w, h));
  if (scale < 1) console.warn(`PDF page ${w}×${h}px exceeds jsPDF limit of ${JSPDF_MAX_DIM}. Scaling to ${Math.round(w*scale)}×${Math.round(h*scale)} in PDF (image quality preserved).`);
  return { pw: w * scale, ph: h * scale, scale, clamped: scale < 1 };
}

async function addCanvasImageToPdf(pdf, canvas, x, y, w, h) {
  const img = await canvasToSmallestImage(canvas, getJpegQuality());
  pdf.addImage(img.data, img.format, x, y, w, h, undefined, 'FAST');
  return img;
}

async function exportPDF() {
  const out=DOM.canvasOutput; if(!out.width) return alert('Nothing to export.');
  if (!await _ensureJsPDF()) return;
  const JsPDF = _getJsPDF();
  const {pw, ph, clamped} = pdfPageDims(out.width, out.height);
  const o=pw>=ph?'landscape':'portrait';
  const pdf=new JsPDF({orientation:o,unit:'px',format:[pw,ph],compress:true});
  // Base overlay — auto-picks PNG or JPEG (whichever is smaller)
  const img = await addCanvasImageToPdf(pdf, out, 0, 0, pw, ph);
  // Annotations as separate transparent PNG layer
  const annotations = collectAnnotationsForPage(currentPage);
  const annCanvas = renderAnnotationsCanvas(annotations, out.width, out.height);
  if (annCanvas) {
    const pngData = await canvasToBlob(annCanvas, 'image/png');
    pdf.addImage(pngData,'PNG',0,0,pw,ph,undefined,'FAST');
  }
  pdf.save(`overlay-page-${currentPage}.pdf`);
  const info = `Export: ${img.format}, ${(img.data.byteLength/1048576).toFixed(1)} MB`;
  if (clamped) console.warn(info + ` (PDF page scaled down to fit jsPDF ${JSPDF_MAX_DIM}px limit)`);
  else console.log(info);
}
async function exportAllPDF() {
  if(!rawOld&&!rawNew) return alert('Nothing to export.');
  if (!_ensureJsPDF()) return;
  const JsPDF = _getJsPDF(), btn=$('btn-export-all'), origText=btn.textContent;
  let pdf=null, totalBytes=0, anyClamped=false;
  const savedPage=currentPage;
  try {
    for(let p=1;p<=maxPages;p++) {
      btn.textContent=`${p}/${maxPages}…`; await sleep(30);
      currentPage=p; loadOffsetUI(); await renderPage(p);
      const c=DOM.canvasOutput;
      const {pw, ph, clamped} = pdfPageDims(c.width, c.height);
      if (clamped) anyClamped = true;
      const o=pw>=ph?'landscape':'portrait';
      if(p===1) pdf=new JsPDF({orientation:o,unit:'px',format:[pw,ph],compress:true});
      else pdf.addPage([pw,ph],o);
      // Base overlay — auto-picks PNG or JPEG
      const img = await addCanvasImageToPdf(pdf, c, 0, 0, pw, ph);
      totalBytes += img.data.byteLength;
      // Annotations as separate transparent PNG layer
      const annotations = collectAnnotationsForPage(p);
      const annCanvas = renderAnnotationsCanvas(annotations, c.width, c.height);
      if (annCanvas) {
        const pngData = await canvasToBlob(annCanvas, 'image/png');
        pdf.addImage(pngData,'PNG',0,0,pw,ph,undefined,'FAST');
      }
    }
    pdf.save(`overlay-all-pages-${new Date().toISOString().slice(0,10)}.pdf`);
    const info = `Export all: ${maxPages} pages, ~${(totalBytes/1048576).toFixed(1)} MB image data`;
    if (anyClamped) console.warn(info + ` (some pages scaled down to fit jsPDF ${JSPDF_MAX_DIM}px limit)`);
    else console.log(info);
  } finally {
    currentPage=savedPage; loadOffsetUI(); await renderPage(savedPage); updatePageNav();
    btn.textContent=origText;
  }
}

async function exportAllPNG() {
  if (!rawOld && !rawNew) return alert('Nothing to export.');
  if (typeof JSZip === 'undefined') return alert('JSZip library not available.');
  const zip = new JSZip();
  const btn = $('btn-export-zip');
  const origText = btn.textContent;
  const savedPage = currentPage;
  try {
    for (let p = 1; p <= maxPages; p++) {
      btn.textContent = `${p}/${maxPages}…`;
      await sleep(30);
      currentPage = p; loadOffsetUI();
      await renderPage(p);
      const c = compositeWithAnnotations();
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      zip.file(`overlay-page-${String(p).padStart(3, '0')}.png`, blob);
    }
    btn.textContent = 'Zipping…';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `overlay-all-pages-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click(); URL.revokeObjectURL(a.href);
  } finally {
    currentPage = savedPage; loadOffsetUI();
    await renderPage(savedPage); updatePageNav();
    btn.textContent = origText;
  }
}

// ═══════════════════════════════════════
//  DRAG-TO-PAN + WHEEL ZOOM (overlay mode)
// ═══════════════════════════════════════
(function(){
  const area=DOM.canvasArea; let drag=false,sx,sy,sl,st;
  area.addEventListener('mousedown',e=>{
    if(e.target.closest('.zoom-bar')||e.target.closest('.sbs-wrapper'))return;
    if(e.button!==1&&drawTool!=='pan')return; // left-click only in pan mode, middle-click always
    drag=true;_isDragging=true;area.classList.add('dragging');sx=e.clientX;sy=e.clientY;sl=area.scrollLeft;st=area.scrollTop;e.preventDefault();
    clearXhair(DOM.overlayXhair);
  });
  area.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();}); // prevent middle-click autoscroll
  window.addEventListener('mousemove',e=>{if(!drag)return;area.scrollLeft=sl-(e.clientX-sx);area.scrollTop=st-(e.clientY-sy);});
  window.addEventListener('mouseup',()=>{if(!drag)return;drag=false;_isDragging=false;area.classList.remove('dragging');});
  area.addEventListener('wheel',e=>{
    if(mode==='sidebyside')return; // SBS has its own zoom
    if(!DOM.canvasOutput.width)return;e.preventDefault();
    const d=e.deltaY>0?-0.1:0.1,rect=area.getBoundingClientRect(),mx=e.clientX-rect.left+area.scrollLeft,my=e.clientY-rect.top+area.scrollTop,old=currentZoom;
    currentZoom=Math.max(0.03,Math.min(5,currentZoom+d));const r=currentZoom/old;
    applyZoom();area.scrollLeft=mx*r-(e.clientX-rect.left);area.scrollTop=my*r-(e.clientY-rect.top);
  },{passive:false});
})();

// ═══════════════════════════════════════
//  SIDE-BY-SIDE: SYNCED SCROLL + DRAG + WHEEL ZOOM
// ═══════════════════════════════════════
(function(){
  const sO = DOM.sbsScrollOld, sN = DOM.sbsScrollNew;

  // Scroll sync: when one pane scrolls, mirror to the other
  function syncScroll(source, target) {
    if (_sbsSyncLock) return;
    _sbsSyncLock = true;
    target.scrollLeft = source.scrollLeft;
    target.scrollTop = source.scrollTop;
    _sbsSyncLock = false;
  }
  sO.addEventListener('scroll', () => syncScroll(sO, sN));
  sN.addEventListener('scroll', () => syncScroll(sN, sO));

  // Drag-to-pan for each pane (synced via scroll events above)
  function initPaneDrag(pane) {
    let drag=false, sx, sy, sl, st;
    pane.addEventListener('mousedown', e => {
      if(e.button!==1&&drawTool!=='pan') return; // left-click only in pan mode, middle-click always
      drag=true; _isDragging=true; pane.classList.add('dragging');
      sx=e.clientX; sy=e.clientY; sl=pane.scrollLeft; st=pane.scrollTop;
      e.preventDefault();
      clearXhair(DOM.sbsXhairOld); clearXhair(DOM.sbsXhairNew);
    });
    pane.addEventListener('auxclick', e=>{if(e.button===1)e.preventDefault();}); // prevent middle-click autoscroll
    window.addEventListener('mousemove', e => {
      if(!drag) return;
      pane.scrollLeft = sl-(e.clientX-sx);
      pane.scrollTop = st-(e.clientY-sy);
    });
    window.addEventListener('mouseup', () => {
      if(!drag) return; drag=false; _isDragging=false; pane.classList.remove('dragging');
    });
  }
  initPaneDrag(sO);
  initPaneDrag(sN);

  // Wheel zoom on either SBS pane
  function sbsWheelZoom(e) {
    if(mode !== 'sidebyside') return;
    e.preventDefault();
    const d = e.deltaY > 0 ? -0.1 : 0.1;
    const old = currentZoom;
    currentZoom = Math.max(0.03, Math.min(5, currentZoom + d));
    const r = currentZoom / old;
    applySbsZoom();
    DOM.zoomLabel.textContent = Math.round(currentZoom*getRenderScale()*100)+'%';
    // Adjust scroll to keep zoom centered on cursor for the pane being scrolled
    const pane = e.currentTarget;
    const rect = pane.getBoundingClientRect();
    const mx = e.clientX - rect.left + pane.scrollLeft;
    const my = e.clientY - rect.top + pane.scrollTop;
    pane.scrollLeft = mx*r - (e.clientX - rect.left);
    pane.scrollTop = my*r - (e.clientY - rect.top);
  }
  sO.addEventListener('wheel', sbsWheelZoom, {passive:false});
  sN.addEventListener('wheel', sbsWheelZoom, {passive:false});

  sO.addEventListener('mousemove', e => {
    if (!xhairEnabled) return;
    const pos = paneMousePos(sO, e);
    const w = sO.clientWidth, h = sO.clientHeight;
    drawXhair(DOM.sbsXhairOld, pos.x, pos.y, w, h);
    drawXhair(DOM.sbsXhairNew, pos.x, pos.y, sN.clientWidth, sN.clientHeight);
  });
  sN.addEventListener('mousemove', e => {
    if (!xhairEnabled) return;
    const pos = paneMousePos(sN, e);
    const w = sN.clientWidth, h = sN.clientHeight;
    drawXhair(DOM.sbsXhairOld, pos.x, pos.y, sO.clientWidth, sO.clientHeight);
    drawXhair(DOM.sbsXhairNew, pos.x, pos.y, w, h);
  });
  sO.addEventListener('mouseleave', () => { clearXhair(DOM.sbsXhairOld); clearXhair(DOM.sbsXhairNew); });
  sN.addEventListener('mouseleave', () => { clearXhair(DOM.sbsXhairOld); clearXhair(DOM.sbsXhairNew); });

  // Overlay mode crosshair — uses canvasArea viewport dimensions (not zoomed container)
  DOM.canvasArea.addEventListener('mousemove', e => {
    if (!xhairEnabled || mode !== 'overlay') return;
    if (DOM.canvasContainer.style.display === 'none') return;
    const rect = DOM.canvasArea.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) { clearXhair(DOM.overlayXhair); return; }
    drawXhair(DOM.overlayXhair, x, y, Math.round(rect.width), Math.round(rect.height));
  });
  DOM.canvasArea.addEventListener('mouseleave', () => { clearXhair(DOM.overlayXhair); });
})();

// ── Crosshair drawing utilities (global scope) ──
let _xhairRAF = 0;
let _xhairPending = null;
let _isDragging = false; // set by drag-to-pan handlers to suppress crosshair

function _drawXhairImmediate(canvas, x, y, w, h) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (x < 0) return;
  const color = DOM.xhairColor.value;
  const sz = parseInt(DOM.xhairSize.value);
  const lw = sz;
  const dotR = 2 + sz * 2;
  const dash = [3 + sz, 3 + sz];
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = lw + 2;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x, 0); ctx.lineTo(x, h);
  ctx.moveTo(0, y); ctx.lineTo(w, y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x, 0); ctx.lineTo(x, h);
  ctx.moveTo(0, y); ctx.lineTo(w, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.arc(x, y, dotR + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2); ctx.fill();
}
function drawXhair(canvas, x, y, w, h) {
  if (_isDragging) return; // skip during pan drag
  // Throttle via RAF — at most one redraw per frame
  if (!_xhairRAF) {
    _xhairRAF = requestAnimationFrame(() => {
      _xhairRAF = 0;
      if (_xhairPending) {
        _xhairPending.forEach(p => _drawXhairImmediate(p.canvas, p.x, p.y, p.w, p.h));
        _xhairPending = null;
      }
    });
  }
  if (!_xhairPending) _xhairPending = [];
  const idx = _xhairPending.findIndex(p => p.canvas === canvas);
  if (idx >= 0) _xhairPending[idx] = { canvas, x, y, w, h };
  else _xhairPending.push({ canvas, x, y, w, h });
}
function clearXhair(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
function paneMousePos(pane, e) {
  const rect = pane.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ═══════════════════════════════════════
//  THUMBNAILS
// ═══════════════════════════════════════
function getThumbScale() { return thumbPPI / 72; }

function toggleThumbs() {
  thumbPanelOpen = !thumbPanelOpen;
  DOM.thumbPanel.classList.toggle('open', thumbPanelOpen);
  DOM.thumbToggle.classList.toggle('shifted', thumbPanelOpen);
  if (thumbPanelOpen && maxPages > 0) buildThumbSlots();
}

function buildThumbSlots() {
  DOM.thumbScroll.innerHTML = '';
  for (let p = 1; p <= maxPages; p++) {
    const item = document.createElement('div');
    item.className = 'thumb-item' + (p === currentPage ? ' active' : '');
    item.dataset.page = p;
    const cvs = document.createElement('canvas');
    cvs.width = 1; cvs.height = 1;
    item.appendChild(cvs);
    const lbl = document.createElement('div');
    lbl.className = 'thumb-label';
    lbl.textContent = p;
    item.appendChild(lbl);
    if (thumbDataUrls[p]) {
      const img = new Image();
      img.onload = function() { cvs.width = this.width; cvs.height = this.height; cvs.getContext('2d').drawImage(this, 0, 0); };
      img.src = thumbDataUrls[p];
    } else {
      item.insertAdjacentHTML('beforeend', '<div class="thumb-spinner">…</div>');
    }
    DOM.thumbScroll.appendChild(item);
  }
  renderMissingThumbs();
}

DOM.thumbScroll.addEventListener('click', e => {
  const item = e.target.closest('.thumb-item');
  if (!item) return;
  const p = parseInt(item.dataset.page);
  if (isNaN(p) || p === currentPage) return;
  currentPage = p; loadOffsetUI();
  renderPage(p).then(() => { updatePageNav(); updateCacheUI(); });
});

async function renderThumbPage(pageNum) {
  // Render only the new document for thumbnails
  if (!pdfNew || pageNum > pdfNew.numPages) return null;
  const page = await pdfNew.getPage(pageNum);
  const vp = page.getViewport({ scale: getThumbScale() });
  const c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, vp.width, vp.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const dataUrl = c.toDataURL('image/jpeg', 0.5);
  c.width = 0; c.height = 0;
  return dataUrl;
}

async function renderMissingThumbs() {
  if (thumbRendering) return;
  thumbRendering = true;
  const gen = thumbGeneration;
  for (let p = 1; p <= maxPages; p++) {
    if (gen !== thumbGeneration) break;
    if (thumbDataUrls[p]) continue;
    const url = await renderThumbPage(p);
    if (gen !== thumbGeneration) break;
    if (!url) continue;
    thumbDataUrls[p] = url;
    const item = document.querySelector(`.thumb-item[data-page="${p}"]`);
    if (item) {
      const cvs = item.querySelector('canvas');
      const spinner = item.querySelector('.thumb-spinner');
      if (spinner) spinner.remove();
      const img = new Image();
      img.onload = function() { cvs.width = this.width; cvs.height = this.height; cvs.getContext('2d').drawImage(this, 0, 0); };
      img.src = url;
    }
    await sleep(5);
  }
  thumbRendering = false;
}

function rebuildThumbsNow() {
  thumbGeneration++;
  thumbDataUrls = {};
  if (thumbTimer) { clearTimeout(thumbTimer); thumbTimer = null; }
  if (thumbPanelOpen && maxPages > 0) buildThumbSlots();
}


function clearThumbCache() {
  thumbGeneration++;
  thumbDataUrls = {};
  if (thumbTimer) { clearTimeout(thumbTimer); thumbTimer = null; }
  DOM.thumbScroll.innerHTML = '';
}

function changeThumbPPI() {
  const v = Math.max(8, Math.min(72, parseInt(DOM.thumbPPIInput.value) || 18));
  DOM.thumbPPIInput.value = v;
  thumbPPI = v;
  rebuildThumbsNow();
}

// ═══════════════════════════════════════
//  3-POINT ALIGNMENT
// ═══════════════════════════════════════
function getPageTransform(page) { return pageTransforms[String(page)] || null; }
function setPageTransform(page, t) { pageTransforms[String(page)] = t; }
function clearPageTransform(page) { delete pageTransforms[String(page)]; }

function startAlign3() {
  if (align3Active) { cancelAlign3(); return; }
  if (!rawOld || !rawNew) { alert('Compare PDFs first before aligning.'); return; }
  align3Active = true;
  align3Phase = 'old';
  align3PointsOld = [];
  align3PointsNew = [];
  DOM.align3Start.textContent = 'Cancel';
  DOM.align3Start.classList.add('active');
  DOM.align3Overlay.classList.add('picking');
  updateAlign3UI();
}

function cancelAlign3() {
  align3Active = false;
  align3Phase = 'old';
  align3PointsOld = [];
  align3PointsNew = [];
  DOM.align3Start.textContent = 'Start Alignment';
  DOM.align3Start.classList.remove('active');
  DOM.align3Overlay.classList.remove('picking');
  drawAlign3Markers();
  updateAlign3UI();
}

function clearAlign3() {
  const scope = DOM.transformScope.value;
  if (scope === 'all') {
    pageOffsets = {}; pageScales = {}; pageRotations = {}; pageTransforms = {};
  } else {
    const p = String(currentPage);
    delete pageOffsets[p]; delete pageScales[p]; delete pageRotations[p]; delete pageTransforms[p];
  }
  cancelAlign3();
  loadTransformUI();
  if (rawOld || rawNew) recolorAndComposite();
}

function updateAlign3UI() {
  const el = DOM.align3Status;
  const pts = DOM.align3Points;
  // Check if any transform values have been set (offset, scale, rotation, or affine)
  const off = getPageOffset(currentPage);
  const ps = getPageScale(currentPage);
  const rot = getPageRotation(currentPage);
  const hasTransform = !!getPageTransform(currentPage) || off.x !== 0 || off.y !== 0 || ps.old !== 100 || ps.new !== 100 || rot !== 0;

  if (!align3Active && !hasTransform) {
    el.textContent = 'Pick 3 matching point pairs to align PDFs.';
    el.className = 'align3-status';
    DOM.align3Clear.style.display = 'none';
  } else if (!align3Active && hasTransform) {
    el.textContent = 'Alignment applied via affine transform.';
    el.className = 'align3-status done';
    DOM.align3Clear.style.display = '';
  } else if (align3Phase === 'old') {
    const n = align3PointsOld.length;
    el.textContent = `Click point ${n + 1}/3 on OLD (blue) PDF`;
    el.className = 'align3-status active';
  } else {
    const n = align3PointsNew.length;
    el.textContent = `Click point ${n + 1}/3 on NEW (red) PDF`;
    el.className = 'align3-status active';
  }

  // Show picked points
  let html = '';
  const labels = ['A', 'B', 'C'];
  for (let i = 0; i < 3; i++) {
    const pO = align3PointsOld[i];
    const pN = align3PointsNew[i];
    if (pO || pN) {
      html += '<div class="align3-point-row">';
      html += `<strong style="width:10px;">${labels[i]}</strong>`;
      if (pO) html += `<span class="align3-point-dot old"></span><span>Old: ${Math.round(pO.x)}, ${Math.round(pO.y)}</span>`;
      if (pN) html += `<span class="align3-point-dot new"></span><span>New: ${Math.round(pN.x)}, ${Math.round(pN.y)}</span>`;
      html += '</div>';
    }
  }
  pts.innerHTML = html;
}

// Convert a click on the overlay canvas to PDF pixel coordinates
function align3ClickToCanvas(e) {
  const overlay = DOM.align3Overlay;
  const output = DOM.canvasOutput;
  const rect = overlay.getBoundingClientRect();
  // The overlay covers the canvas-container which may be zoomed
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  // Convert from display coords to actual canvas pixel coords
  const scaleX = output.width / rect.width;
  const scaleY = output.height / rect.height;
  return { x: clickX * scaleX, y: clickY * scaleY };
}

// Draw markers on the overlay canvas to show picked points
function drawAlign3Markers() {
  const overlay = DOM.align3Overlay;
  const output = DOM.canvasOutput;
  if (!output.width || !output.height) return;
  overlay.width = output.width;
  overlay.height = output.height;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const labels = ['A', 'B', 'C'];
  const drawPoint = (pt, color, label, offsetDir) => {
    const r = 8;
    // Outer ring
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.stroke();
    // Center dot
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
    // Label
    ctx.font = 'bold 14px DM Sans, sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(label, pt.x + 12 + 1, pt.y - 10 + 1);
    ctx.fillStyle = color;
    ctx.fillText(label, pt.x + 12, pt.y - 10);
  };

  align3PointsOld.forEach((pt, i) => drawPoint(pt, '#58a6ff', labels[i] + '₁'));
  align3PointsNew.forEach((pt, i) => drawPoint(pt, '#ff6b6b', labels[i] + '₂'));
}

// Handle click on the alignment overlay
DOM.align3Overlay.addEventListener('click', function(e) {
  if (!align3Active) return;
  e.preventDefault();
  e.stopPropagation();

  const pt = align3ClickToCanvas(e);

  if (align3Phase === 'old') {
    align3PointsOld.push(pt);
    drawAlign3Markers();
    if (align3PointsOld.length === 3) {
      align3Phase = 'new';
    }
  } else {
    align3PointsNew.push(pt);
    drawAlign3Markers();
    if (align3PointsNew.length === 3) {
      // All 6 points collected — compute and apply transform
      computeAndApplyAlign3();
    }
  }
  updateAlign3UI();
});

// Solve affine transform from 3 point pairs: src[i] → dst[i]
// Returns {a, b, c, d, e, f} such that:
//   dst.x = a * src.x + b * src.y + e
//   dst.y = c * src.x + d * src.y + f
function solveAffine(src, dst) {
  // Set up system: for each point pair (sx,sy) → (dx,dy):
  //   a*sx + b*sy + e = dx
  //   c*sx + d*sy + f = dy
  // 6 unknowns, 6 equations
  const s = src, d = dst;
  // For x-coords: [s0x s0y 1] [a]   [d0x]
  //               [s1x s1y 1] [b] = [d1x]
  //               [s2x s2y 1] [e]   [d2x]
  // Solve via Cramer's rule or direct inverse of 3x3 matrix
  const det = s[0].x * (s[1].y - s[2].y) - s[0].y * (s[1].x - s[2].x) + (s[1].x * s[2].y - s[2].x * s[1].y);
  if (Math.abs(det) < 1e-10) return null; // degenerate (collinear points)

  const invDet = 1 / det;
  // Inverse of [[s0x,s0y,1],[s1x,s1y,1],[s2x,s2y,1]]
  const m00 = (s[1].y - s[2].y) * invDet;
  const m01 = (s[2].y - s[0].y) * invDet;
  const m02 = (s[0].y - s[1].y) * invDet;
  const m10 = (s[2].x - s[1].x) * invDet;
  const m11 = (s[0].x - s[2].x) * invDet;
  const m12 = (s[1].x - s[0].x) * invDet;
  const m20 = (s[1].x * s[2].y - s[2].x * s[1].y) * invDet;
  const m21 = (s[2].x * s[0].y - s[0].x * s[2].y) * invDet;
  const m22 = (s[0].x * s[1].y - s[1].x * s[0].y) * invDet;

  // Multiply inv(S) * dx and inv(S) * dy
  const a = m00 * d[0].x + m01 * d[1].x + m02 * d[2].x;
  const b = m10 * d[0].x + m11 * d[1].x + m12 * d[2].x;
  const e = m20 * d[0].x + m21 * d[1].x + m22 * d[2].x;
  const c = m00 * d[0].y + m01 * d[1].y + m02 * d[2].y;
  const dd = m10 * d[0].y + m11 * d[1].y + m12 * d[2].y;
  const f = m20 * d[0].y + m21 * d[1].y + m22 * d[2].y;

  return { a, b, c, d: dd, e, f };
}

// Solve least-squares similarity transform (uniform scale + rotation + translation).
// Maps srcPts → dstPts with minimum error, constrained to no shear/skew.
// Returns {a, b, c, d, e, f} where a=s*cos, b=-s*sin, c=s*sin, d=s*cos.
function solveSimilarity(srcPts, dstPts) {
  const n = srcPts.length;
  // Compute centroids
  let csx = 0, csy = 0, cdx = 0, cdy = 0;
  for (let i = 0; i < n; i++) {
    csx += srcPts[i].x; csy += srcPts[i].y;
    cdx += dstPts[i].x; cdy += dstPts[i].y;
  }
  csx /= n; csy /= n; cdx /= n; cdy /= n;

  // Solve for a, b in least-squares: dst' = [a -b; b a] * src'
  // Normal equations: a = Σ(x'·X' + y'·Y') / S, b = Σ(-y'·X' + x'·Y') / S
  // where S = Σ(x'² + y'²)
  let S = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    const sx = srcPts[i].x - csx, sy = srcPts[i].y - csy;
    const dx = dstPts[i].x - cdx, dy = dstPts[i].y - cdy;
    S += sx * sx + sy * sy;
    sumA += sx * dx + sy * dy;
    sumB += -sy * dx + sx * dy;
  }
  if (Math.abs(S) < 1e-10) return null; // degenerate (all source points coincide)

  const a = sumA / S;  // s * cos(θ)
  const b = sumB / S;  // s * sin(θ)
  const e = cdx - (a * csx - b * csy);
  const f = cdy - (b * csx + a * csy);
  return { a: a, b: -b, c: b, d: a, e, f };
}

// Snap rotation (<1° → 0) and/or scale (within 1% of expected → exact) in a similarity transform.
// srcPts/dstPts: the point pairs used to compute the transform (for recomputing translation).
function snapAffineTransform(t, srcPts, dstPts, expectedScale) {
  const angle = Math.atan2(t.c, t.a); // radians
  const angleDeg = angle * 180 / Math.PI;

  // Extract uniform scale (should be same for x and y in a similarity transform)
  let scale = Math.sqrt(t.a * t.a + t.c * t.c);

  let snapRot = Math.abs(angleDeg) < 1;
  let snapScale = false;

  // Snap scale if within 1% of expectedScale
  if (expectedScale > 0) {
    const tol = expectedScale * 0.01;
    if (Math.abs(scale - expectedScale) < tol) {
      scale = expectedScale;
      snapScale = true;
    }
  }

  if (!snapRot && !snapScale) return t; // nothing to snap

  // Recompose with snapped values
  const cosR = snapRot ? 1 : Math.cos(angle);
  const sinR = snapRot ? 0 : Math.sin(angle);
  const newA = cosR * scale;
  const newB = -sinR * scale;
  const newC = sinR * scale;
  const newD = cosR * scale;

  // Recompute translation so centroids still map correctly
  const csx = (srcPts[0].x + srcPts[1].x + srcPts[2].x) / 3;
  const csy = (srcPts[0].y + srcPts[1].y + srcPts[2].y) / 3;
  const cdx = (dstPts[0].x + dstPts[1].x + dstPts[2].x) / 3;
  const cdy = (dstPts[0].y + dstPts[1].y + dstPts[2].y) / 3;
  const newE = cdx - (newA * csx + newB * csy);
  const newF = cdy - (newC * csx + newD * csy);
  return { a: newA, b: newB, c: newC, d: newD, e: newE, f: newF };
}

function computeAndApplyAlign3() {
  // We want a stored affine that maps rawNewPx → oldCanvasPos (before shift).
  // composite() uses: ctx.setTransform(xform...) then drawImage(newImg, 0, 0),
  // so the stored affine must map raw pixel coords directly.
  //
  // Unified approach: always construct the "current transform" that describes
  // how the new layer is currently drawn, then invert it to recover raw pixel
  // coordinates from click positions, and solve a fresh affine.

  if (!rawOld || !rawNew) {
    alert('Compare PDFs first before aligning.');
    cancelAlign3();
    return;
  }

  const ps = getPageScale(currentPage);
  const sO = ps.old / 100;
  const sN = ps.new / 100;
  let transform;

  // Get the current transform, or construct the implicit one from offset+scale+rotation
  let currentXform = getPageTransform(currentPage);
  let hadAffine = !!currentXform;
  if (!currentXform) {
    // No affine exists — build the equivalent from the standard composite path's
    // offset + scale + rotation so we can invert it to get raw pixel coordinates.
    // The implicit transform maps rawNewPx → position relative to old at (0,0),
    // matching how composite's standard path draws: old at (oldDx,oldDy), new at
    // (newDx + rotation, newDy + rotation), with the offset ox = newDx - oldDx.
    const off = getPageOffset(currentPage);
    const ox = off.x, oy = off.y;
    const rotDeg = getPageRotation(currentPage);
    const rotRad = rotDeg * Math.PI / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const hw = rawNew.width / 2, hh = rawNew.height / 2;
    currentXform = {
      a:  cosR * sN,
      b: -sinR * sN,
      c:  sinR * sN,
      d:  cosR * sN,
      e:  sN * (hw * (1 - cosR) + hh * sinR) + ox,
      f:  sN * (-hw * sinR + hh * (1 - cosR)) + oy
    };
  }

  // ── Unified alignment: invert currentXform to get raw pixel coords, solve fresh ──
  const wO0 = rawOld.width * sO, hO0 = rawOld.height * sO;

  // Compute the canvas shift that was used during rendering.
  // For the affine path: composite computes shift from transformed corners.
  // For the standard path: old is at (oldDx, oldDy) = (max(0,-ox), max(0,-oy)).
  let shiftX, shiftY;
  if (hadAffine) {
    const corners = [[0,0],[rawNew.width,0],[0,rawNew.height],[rawNew.width,rawNew.height]];
    let minX = 0, minY = 0;
    corners.forEach(([px, py]) => {
      const cx2 = currentXform.a * px + currentXform.b * py + currentXform.e;
      const cy2 = currentXform.c * px + currentXform.d * py + currentXform.f;
      minX = Math.min(minX, cx2); minY = Math.min(minY, cy2);
    });
    shiftX = minX < 0 ? -minX : 0;
    shiftY = minY < 0 ? -minY : 0;
  } else {
    // Standard path: old drawn at (oldDx, oldDy) where oldDx = max(0, -ox)
    const off = getPageOffset(currentPage);
    shiftX = off.x < 0 ? -off.x : 0;
    shiftY = off.y < 0 ? -off.y : 0;
  }

  // Remove canvas shift to get pre-shift positions
  const adjOld = align3PointsOld.map(pt => ({ x: pt.x - shiftX, y: pt.y - shiftY }));
  const adjNew = align3PointsNew.map(pt => ({ x: pt.x - shiftX, y: pt.y - shiftY }));

  // Convert new clicked positions to raw new pixel coordinates
  // by inverting the current transform: rawNewPx = E⁻¹(adjNew)
  const E = currentXform;
  const det = E.a * E.d - E.b * E.c;
  if (Math.abs(det) < 1e-10) {
    alert('Current transform is degenerate. Clear alignment and try again.');
    cancelAlign3();
    return;
  }
  const rawNewPts = adjNew.map(pt => ({
    x: (E.d * (pt.x - E.e) - E.b * (pt.y - E.f)) / det,
    y: (-E.c * (pt.x - E.e) + E.a * (pt.y - E.f)) / det
  }));

  // Solve least-squares similarity transform: rawNewPx → adjOld
  // Uses uniform scale + rotation (no shear/skew) to avoid distortion from click imprecision.
  // adjOld = sO * rawOldPx, which is where old features sit in pre-shift canvas.
  transform = solveSimilarity(rawNewPts, adjOld);
  if (!transform) {
    alert('Points are coincident — pick distinct points.');
    cancelAlign3();
    return;
  }

  // Snap small rotations (<1° → 0) and scale close to sO caused by imprecise clicking
  transform = snapAffineTransform(transform, rawNewPts, adjOld, sO);

  console.log('3-point align: fresh solve from raw pixels', {
    hadExistingAffine: hadAffine,
    shift: [shiftX, shiftY], det,
    rawNewPts: rawNewPts.map(p => [Math.round(p.x), Math.round(p.y)]),
    adjOld: adjOld.map(p => [Math.round(p.x), Math.round(p.y)]),
    result: { a: transform.a.toFixed(6), b: transform.b.toFixed(6), c: transform.c.toFixed(6), d: transform.d.toFixed(6), e: transform.e.toFixed(2), f: transform.f.toFixed(2) }
  });

  // ── Decompose for UI display ──
  // The stored transform is a similarity: uniform scale + rotation + translation.
  const rotRad = Math.atan2(transform.c, transform.a);
  const rotDeg = Math.round(rotRad * 180 / Math.PI * 100) / 100;
  const effScale = Math.sqrt(transform.a * transform.a + transform.c * transform.c);
  // effScale includes sN baked in, so display scale = effScale * 100 (percentage of raw)
  let scaleNewPercent = Math.round(effScale * 100 * 10) / 10;
  if (Math.abs(scaleNewPercent - Math.round(scaleNewPercent)) < 0.15) scaleNewPercent = Math.round(scaleNewPercent);
  // Compute display offset from affine translation (rotation around image center)
  const imgW = rawNew.width, imgH = rawNew.height;
  const wN_eff = imgW * effScale, hN_eff = imgH * effScale;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
  const cxN = wN_eff / 2, cyN = hN_eff / 2;
  const dispOx = Math.round((transform.e + cosR * cxN - sinR * cyN - cxN) * 10) / 10;
  const dispOy = Math.round((transform.f + sinR * cxN + cosR * cyN - cyN) * 10) / 10;

  const scope = DOM.transformScope.value;
  if (scope === 'all') {
    for (let p = 1; p <= maxPages; p++) {
      setPageTransform(p, { ...transform });
      setPageOffset(p, dispOx, dispOy);
      setPageRotation(p, rotDeg);
      setPageScale(p, ps.old, scaleNewPercent);
    }
  } else {
    setPageTransform(currentPage, { ...transform });
    setPageOffset(currentPage, dispOx, dispOy);
    setPageRotation(currentPage, rotDeg);
    setPageScale(currentPage, ps.old, scaleNewPercent);
  }

  // End picking mode — clear markers since alignment is applied to offset/scale/rotation
  align3Active = false;
  align3PointsOld = [];
  align3PointsNew = [];
  DOM.align3Start.textContent = 'Start Alignment';
  DOM.align3Start.classList.remove('active');
  DOM.align3Overlay.classList.remove('picking');
  drawAlign3Markers(); // clears overlay since points arrays are now empty
  updateAlign3UI();
  loadTransformUI();

  // Re-render with decomposed transform values
  if (rawOld || rawNew) recolorAndComposite();
}

// ═══════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════
window.addEventListener('keydown',e=>{
  if(isInputFocused()) return;
  // Cancel 3-point alignment on Escape
  if(e.key==='Escape'&&align3Active){cancelAlign3();return;}
  // Drawing tool shortcuts
  if(e.key==='v'||e.key==='V'){setDrawTool('pan');return;}
  if(e.key==='p'&&!e.ctrlKey&&!e.metaKey){setDrawTool('pen');return;}
  if(e.key==='l'||e.key==='L'){setDrawTool('line');return;}
  if(e.key==='a'&&!e.ctrlKey&&!e.metaKey){setDrawTool('arrow');return;}
  if(e.key==='h'&&!e.ctrlKey&&!e.metaKey){setDrawTool('highlight');return;}
  if(e.key==='r'&&!e.ctrlKey&&!e.metaKey){setDrawTool('rect');return;}
  if(e.key==='t'&&!e.ctrlKey&&!e.metaKey){setDrawTool('text');return;}
  if(e.key==='e'&&!e.ctrlKey&&!e.metaKey){setDrawTool('eraser');return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();drawUndo();return;}
  if(maxPages<=1) return;
  if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();changePage(-1);}
  else if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();changePage(1);}
  else if(e.key==='Home'){e.preventDefault();currentPage=1;loadOffsetUI();renderPage(1);updatePageNav();}
  else if(e.key==='End'){e.preventDefault();currentPage=maxPages;loadOffsetUI();renderPage(maxPages);updatePageNav();}
});

// ═══════════════════════════════════════
//  DRAWING TOOLS
// ═══════════════════════════════════════
function syncDrawLayerSize(side) {
  if (side === 'overlay') return; // overlay draw layer sized in renderDrawLayer
  const draw = side === 'old' ? DOM.sbsDrawOld : DOM.sbsDrawNew;
  const src = side === 'old' ? DOM.sbsCanvasOld : DOM.sbsCanvasNew;
  if (draw.width !== src.width || draw.height !== src.height) {
    draw.width = src.width; draw.height = src.height;
  }
  draw.style.width = src.style.width;
  draw.style.height = src.style.height;
}
// Cursor map per tool
const _toolCursors = {
  pan: 'grab', pen: 'crosshair', line: 'crosshair', arrow: 'crosshair',
  highlight: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Crect x=\'5\' y=\'8\' width=\'14\' height=\'8\' fill=\'%23ffeb3b\' opacity=\'0.5\' rx=\'1\'/%3E%3C/svg%3E") 12 12, crosshair',
  rect: 'crosshair',
  text: 'text',
  eraser: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 20 20\'%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'8\' fill=\'none\' stroke=\'%23fff\' stroke-width=\'2\'/%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'8\' fill=\'none\' stroke=\'%23888\' stroke-width=\'1\'/%3E%3C/svg%3E") 10 10, crosshair'
};

function setDrawTool(tool) {
  drawTool = tool;
  ['pan','pen','line','arrow','highlight','rect','text','eraser'].forEach(t => {
    const btn = document.getElementById('draw-tool-' + t);
    if (btn) btn.classList.toggle('active', t === tool);
  });
  // Update cursor per tool
  const cursor = _toolCursors[tool] || 'crosshair';
  DOM.sbsScrollOld.style.cursor = cursor;
  DOM.sbsScrollNew.style.cursor = cursor;
  DOM.canvasArea.style.cursor = cursor;
  // Enable/disable pointer-events on draw layers
  const pe = tool === 'pan' ? 'none' : 'auto';
  DOM.sbsDrawOld.style.pointerEvents = pe;
  DOM.sbsDrawNew.style.pointerEvents = pe;
  // Overlay draw layer
  DOM.overlayDrawLayer.classList.toggle('drawing', tool !== 'pan');
}

// Throttled slider updates
let _drawWidthTimer = null;
function updateDrawWidth() {
  const v = DOM.drawWidth.value;
  DOM.drawWidthVal.textContent = v;
  if (_drawWidthTimer) clearTimeout(_drawWidthTimer);
  _drawWidthTimer = setTimeout(() => { _drawWidthTimer = null; }, 50);
}

let _textSizeTimer = null;
function updateTextSize() {
  const v = DOM.drawTextSize.value;
  DOM.drawTextSizeVal.textContent = v;
  if (_textSizeTimer) clearTimeout(_textSizeTimer);
  _textSizeTimer = setTimeout(() => { _textSizeTimer = null; }, 50);
}

function getDrawKey() { return String(currentPage); }

function drawStrokesFor() {
  const key = getDrawKey();
  if (!drawStrokes[key]) drawStrokes[key] = [];
  return drawStrokes[key];
}

// Convert client coords to canvas-space coords (accounting for zoom + scroll)
function clientToCanvas(e, scrollPane, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function renderDrawLayer(side) {
  let canvas, srcCanvas;
  if (side === 'overlay') {
    canvas = DOM.overlayDrawLayer;
    srcCanvas = DOM.canvasOutput;
  } else {
    canvas = side === 'old' ? DOM.sbsDrawOld : DOM.sbsDrawNew;
    srcCanvas = side === 'old' ? DOM.sbsCanvasOld : DOM.sbsCanvasNew;
  }
  // Match draw layer size to source canvas
  if (canvas.width !== srcCanvas.width || canvas.height !== srcCanvas.height) {
    canvas.width = srcCanvas.width;
    canvas.height = srcCanvas.height;
  }
  // Match CSS display size (overlay uses 100% from CSS)
  if (side !== 'overlay') {
    canvas.style.width = srcCanvas.style.width;
    canvas.style.height = srcCanvas.style.height;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const strokes = drawStrokesFor();
  strokes.forEach(s => drawStrokeToCtx(ctx, s));
  if (_drawCurrent) {
    drawStrokeToCtx(ctx, _drawCurrent);
  }
}

function drawStrokeToCtx(ctx, s) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 1;
  if (s.tool === 'highlight') {
    // Semi-transparent wide stroke
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(s.width * 10, 20);
    ctx.lineCap = 'butt';
    if (s.pts && s.pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (s.tool === 'pen') {
    if (s.pts.length < 2) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(s.pts[0].x, s.pts[0].y);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
    ctx.stroke();
  } else if (s.tool === 'line') {
    if (!s.x2) return;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  } else if (s.tool === 'arrow') {
    if (!s.x2) return;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    // Arrowhead
    const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const headLen = Math.max(10, s.width * 5);
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - headLen * Math.cos(angle - 0.4), s.y2 - headLen * Math.sin(angle - 0.4));
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - headLen * Math.cos(angle + 0.4), s.y2 - headLen * Math.sin(angle + 0.4));
    ctx.stroke();
  } else if (s.tool === 'rect') {
    if (!s.x2) return;
    ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2),
                   Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
  } else if (s.tool === 'text') {
    const fontSize = s.textSize || Math.max(14, s.width * 6);
    ctx.font = `${fontSize}px 'DM Sans', sans-serif`;
    ctx.fillText(s.text, s.x1, s.y1);
  }
  ctx.restore();
}

// Hit-test: does a stroke come within `radius` of point (px, py)?
function strokeHitsPoint(s, px, py, radius) {
  const r2 = radius * radius;
  if (s.tool === 'pen' || s.tool === 'highlight') {
    for (const pt of s.pts) {
      if ((pt.x - px) ** 2 + (pt.y - py) ** 2 < r2) return true;
    }
  } else if (s.tool === 'line' || s.tool === 'arrow') {
    if (distToSegment2(px, py, s.x1, s.y1, s.x2, s.y2) < r2) return true;
  } else if (s.tool === 'rect') {
    const x1 = Math.min(s.x1, s.x2), y1 = Math.min(s.y1, s.y2);
    const x2 = Math.max(s.x1, s.x2), y2 = Math.max(s.y1, s.y2);
    // Check 4 edges
    if (distToSegment2(px, py, x1, y1, x2, y1) < r2) return true;
    if (distToSegment2(px, py, x2, y1, x2, y2) < r2) return true;
    if (distToSegment2(px, py, x2, y2, x1, y2) < r2) return true;
    if (distToSegment2(px, py, x1, y2, x1, y1) < r2) return true;
  } else if (s.tool === 'text') {
    const fontSize = s.textSize || Math.max(14, s.width * 6);
    if (px >= s.x1 && px <= s.x1 + fontSize * s.text.length * 0.6 &&
        py >= s.y1 - fontSize && py <= s.y1) return true;
  }
  return false;
}

function distToSegment2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nx = x1 + t * dx, ny = y1 + t * dy;
  return (px - nx) ** 2 + (py - ny) ** 2;
}

// Wire up drawing on SBS draw layers
function initDrawing() {
  let drawing = false;
  let drawSide = null; // which canvas initiated the draw

  function getActiveCanvas() {
    if (mode === 'overlay') return { canvas: DOM.overlayDrawLayer, scroll: DOM.canvasArea };
    // In SBS, use the new pane as the drawing surface
    return { canvas: DOM.sbsDrawNew, scroll: DOM.sbsScrollNew };
  }

  function renderAllDrawLayers() {
    if (mode === 'overlay') {
      renderDrawLayer('overlay');
    } else {
      renderDrawLayer('old');
      renderDrawLayer('new');
    }
  }

  // Accept drawing input from overlay layer, or either SBS pane
  [
    { canvas: DOM.overlayDrawLayer, scroll: DOM.canvasArea, side: 'overlay' },
    { canvas: DOM.sbsDrawOld, scroll: DOM.sbsScrollOld, side: 'old' },
    { canvas: DOM.sbsDrawNew, scroll: DOM.sbsScrollNew, side: 'new' }
  ].forEach(({ canvas: drawCanvas, scroll: scrollPane, side }) => {
    drawCanvas.addEventListener('mousedown', e => {
      if (drawTool === 'pan' || e.button !== 0) return;
      if (side === 'overlay' && mode !== 'overlay') return;
      if (side !== 'overlay' && mode !== 'sidebyside') return;
      e.preventDefault(); e.stopPropagation();
      drawSide = side;
      const pos = clientToCanvas(e, scrollPane, drawCanvas);
      const color = DOM.drawColor.value;
      const width = parseInt(DOM.drawWidth.value);
      const textSize = parseInt(DOM.drawTextSize.value);

      if (drawTool === 'text') {
        const text = prompt('Enter text:');
        if (text) {
          drawStrokesFor().push({ tool: 'text', x1: pos.x, y1: pos.y, color, width, text, textSize });
          renderAllDrawLayers();
        }
        drawSide = null;
        return;
      }

      if (drawTool === 'eraser') {
        drawing = true;
        _drawCurrent = { tool: 'eraser', pts: [pos], width };
        return;
      }

      drawing = true;
      if (drawTool === 'pen' || drawTool === 'highlight') {
        _drawCurrent = { tool: drawTool, pts: [pos], color, width };
      } else {
        _drawCurrent = { tool: drawTool, x1: pos.x, y1: pos.y, x2: null, y2: null, color, width };
      }
    });
  });

  window.addEventListener('mousemove', e => {
    if (!drawing || !_drawCurrent || !drawSide) return;
    // Use the canvas that initiated the draw
    const { canvas, scroll } = drawSide === 'overlay'
      ? { canvas: DOM.overlayDrawLayer, scroll: DOM.canvasArea }
      : drawSide === 'old'
        ? { canvas: DOM.sbsDrawOld, scroll: DOM.sbsScrollOld }
        : { canvas: DOM.sbsDrawNew, scroll: DOM.sbsScrollNew };
    const pos = clientToCanvas(e, scroll, canvas);
    if (_drawCurrent.tool === 'eraser') {
      _drawCurrent.pts.push(pos);
      const eraserR = Math.max(_drawCurrent.width * 5, 10);
      const strokes = drawStrokesFor();
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokeHitsPoint(strokes[i], pos.x, pos.y, eraserR)) strokes.splice(i, 1);
      }
      renderAllDrawLayers();
      return;
    }
    if (_drawCurrent.tool === 'pen' || _drawCurrent.tool === 'highlight') {
      _drawCurrent.pts.push(pos);
    } else {
      _drawCurrent.x2 = pos.x;
      _drawCurrent.y2 = pos.y;
    }
    renderAllDrawLayers();
  });

  window.addEventListener('mouseup', () => {
    if (!drawing || !_drawCurrent) return;
    drawing = false;
    const s = _drawCurrent;
    let valid = false;
    if ((s.tool === 'pen' || s.tool === 'highlight') && s.pts && s.pts.length >= 2) valid = true;
    if ((s.tool === 'line' || s.tool === 'arrow' || s.tool === 'rect') && s.x2 != null) valid = true;
    if (s.tool === 'eraser') valid = false;
    if (valid) {
      const saved = { ...s };
      if (saved.pts) saved.pts = saved.pts.map(p => ({...p}));
      drawStrokesFor().push(saved);
    }
    _drawCurrent = null;
    drawSide = null;
    renderAllDrawLayers();
  });
}

initDrawing();
DOM.sbsDrawOld.addEventListener('contextmenu', e => e.preventDefault());
DOM.sbsDrawNew.addEventListener('contextmenu', e => e.preventDefault());
DOM.overlayDrawLayer.addEventListener('contextmenu', e => e.preventDefault());

function drawUndo() {
  const key = getDrawKey();
  if (drawStrokes[key] && drawStrokes[key].length > 0) {
    drawStrokes[key].pop();
    if (mode === 'overlay') renderDrawLayer('overlay');
    else { renderDrawLayer('old'); renderDrawLayer('new'); }
  }
}

function drawClear() {
  drawStrokes[getDrawKey()] = [];
  if (mode === 'overlay') renderDrawLayer('overlay');
  else { renderDrawLayer('old'); renderDrawLayer('new'); }
}
