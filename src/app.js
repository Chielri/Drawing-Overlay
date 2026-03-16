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
  scaleScope: $('scale-scope'),
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
  cacheFrom: $('cache-from'), cacheTo: $('cache-to'), memLimit: $('mem-limit'), memLimitVal: $('mem-limit-val'),
  offsetX: $('offset-x'), offsetY: $('offset-y'),
  offsetXSlider: $('offset-x-slider'), offsetYSlider: $('offset-y-slider'),
  offsetRange: $('offset-range'), offsetScope: $('offset-scope'),
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
  drawColor: $('draw-color'), drawWidth: $('draw-width'),
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
let drawStrokes = { old: [], new: [] }; // per-page arrays of stroke objects
let _drawCurrent = null; // in-progress stroke

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
  const v = Math.max(256, parseInt(DOM.memLimit.value) || 4096);
  cacheMemLimitMB = v;
  DOM.memLimitVal.textContent = v >= 1024 ? (v/1024).toFixed(1).replace(/\.0$/,'') + ' GB' : v + ' MB';
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
  offsetRange: 500, offsetScope: 'page',
  thumbPPI: 18,
  memLimitMB: 4096,
  scaleOld: 100, scaleNew: 100,
  scaleScope: 'page'
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
  DOM.offsetScope.value = d.offsetScope;
  thumbPPI = d.thumbPPI || 18;
  DOM.thumbPPIInput.value = thumbPPI;
  cacheMemLimitMB = d.memLimitMB || 4096;
  DOM.memLimit.value = cacheMemLimitMB;
  changeMemLimit();
  DOM.inputScaleOld.value = d.scaleOld || 100;
  DOM.inputScaleNew.value = d.scaleNew || 100;
  DOM.sliderScaleOld.value = Math.max(25, Math.min(200, d.scaleOld || 100));
  DOM.sliderScaleNew.value = Math.max(25, Math.min(200, d.scaleNew || 100));
  DOM.scaleScope.value = d.scaleScope || 'page';
  syncColors();
}

function gatherUISettings() {
  return {
    colorOld: DOM.colorOld.value, colorNew: DOM.colorNew.value,
    opacityOld: parseInt(DOM.sliderOpacityOld.value),
    opacityNew: parseInt(DOM.sliderOpacityNew.value),
    ppi: DOM.ppiSelect.value, mode, visOld, visNew,
    offsetRange: parseInt(DOM.offsetRange.value) || 500,
    offsetScope: DOM.offsetScope.value,
    thumbPPI, memLimitMB: cacheMemLimitMB,
    scaleOld: parseInt(DOM.inputScaleOld.value) || 100,
    scaleNew: parseInt(DOM.inputScaleNew.value) || 100,
    scaleScope: DOM.scaleScope.value
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
  let r=255*(1-a1)+r1*a1, g=255*(1-a1)+g1*a1, b=255*(1-a1)+b1*a1;
  return [Math.round(r*(1-a2)+r2*a2), Math.round(g*(1-a2)+g2*a2), Math.round(b*(1-a2)+b2*a2)];
}

function syncColors() {
  const cOld = DOM.colorOld.value, cNew = DOM.colorNew.value;
  if (DOM.zoneOld.classList.contains('has-file')) { DOM.zoneOld.style.borderColor = cOld; DOM.zoneOld.style.background = hexToDim(cOld); }
  if (DOM.zoneNew.classList.contains('has-file')) { DOM.zoneNew.style.borderColor = cNew; DOM.zoneNew.style.background = hexToDim(cNew); }
  DOM.swatchOld.style.background = cOld;
  DOM.swatchNew.style.background = cNew;
  const oA = parseInt(DOM.sliderOpacityOld.value)/100;
  const oB = parseInt(DOM.sliderOpacityNew.value)/100;
  const ov = blendOverlap(hexToRgb(cOld), oA, hexToRgb(cNew), oB);
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
  { name:'Green-Red', old:'#2e7d32', new:'#c62828' },
  { name:'Purple-Org', old:'#7b1fa2', new:'#ef6c00' },
  { name:'Blue-Green', old:'#1565c0', new:'#2e7d32' },
  { name:'Gray-Red', old:'#546e7a', new:'#d32f2f' },
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
  const files = [...e.dataTransfer.files].filter(f => f.type==='application/pdf'||f.name.endsWith('.pdf'));
  if (files.length >= 2) { loadPdf(files[0],'old'); loadPdf(files[1],'new'); }
  else if (files.length === 1) { if (!pdfOld) loadPdf(files[0],'old'); else loadPdf(files[0],'new'); }
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
  rebuildThumbsNow();
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
  DOM.drawToolbar.classList.add('show');
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

  if (mode === 'overlay') {
    const totalW = Math.max(wO, wN + absOx), totalH = Math.max(hO, hN + absOy);
    const canvasW = Math.max(wO + (ox < 0 ? absOx : 0), wN + (ox > 0 ? ox : 0), totalW);
    const canvasH = Math.max(hO + (oy < 0 ? absOy : 0), hN + (oy > 0 ? oy : 0), totalH);
    const oldDx = ox<0?absOx:0, oldDy = oy<0?absOy:0;
    const newDx = ox>0?ox:0, newDy = oy>0?oy:0;
    out.width = canvasW; out.height = canvasH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvasW,canvasH);
    if (imgO && visOld) { ctx.globalAlpha=aO; ctx.drawImage(putImgToTempCanvas(imgO,_tmpCanvasA,_tmpCtxA),0,0,imgO.width,imgO.height,oldDx,oldDy,wO,hO); }
    if (imgN && visNew) { ctx.globalAlpha=aN; ctx.drawImage(putImgToTempCanvas(imgN,_tmpCanvasB,_tmpCtxB),0,0,imgN.width,imgN.height,newDx,newDy,wN,hN); }
    ctx.globalAlpha = 1;
  } else {
    // Side-by-side: render to two separate canvases
    const cOld = DOM.sbsCanvasOld, cNew = DOM.sbsCanvasNew;
    // Old pane
    if (imgO && visOld) {
      cOld.width = wO; cOld.height = hO;
      const ctxO = cOld.getContext('2d');
      ctxO.fillStyle = '#fff'; ctxO.fillRect(0,0,wO,hO);
      ctxO.globalAlpha = aO;
      ctxO.drawImage(putImgToTempCanvas(imgO,_tmpCanvasA,_tmpCtxA),0,0,imgO.width,imgO.height,0,0,wO,hO);
      ctxO.globalAlpha = 1;
    } else { cOld.width = 1; cOld.height = 1; }
    // New pane (with offset)
    if (imgN && visNew) {
      const nw = wN + absOx, nh = hN + absOy;
      cNew.width = nw; cNew.height = nh;
      const ctxN = cNew.getContext('2d');
      ctxN.fillStyle = '#fff'; ctxN.fillRect(0,0,nw,nh);
      ctxN.globalAlpha = aN;
      ctxN.drawImage(putImgToTempCanvas(imgN,_tmpCanvasB,_tmpCtxB),0,0,imgN.width,imgN.height, ox>=0?ox:0, oy>=0?oy:0, wN,hN);
      ctxN.globalAlpha = 1;
    } else { cNew.width = 1; cNew.height = 1; }
    // Update labels with colors
    DOM.sbsLabelOld.style.background = DOM.colorOld.value;
    DOM.sbsLabelNew.style.background = DOM.colorNew.value;
    // Re-render draw layers on top
    if (typeof renderDrawLayer === 'function') {
      renderDrawLayer('old'); renderDrawLayer('new');
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
function updateOpacity() {
  DOM.valOpacityOld.textContent = DOM.sliderOpacityOld.value+'%';
  DOM.valOpacityNew.textContent = DOM.sliderOpacityNew.value+'%';
  syncColors();
  if (rawOld || rawNew) recolorAndComposite();
}
// Scale: slider → input sync → apply
function sliderScale() {
  DOM.inputScaleOld.value = DOM.sliderScaleOld.value;
  DOM.inputScaleNew.value = DOM.sliderScaleNew.value;
  _applyScale();
}
function inputScale() {
  const sO = Math.max(10, Math.min(500, parseInt(DOM.inputScaleOld.value) || 100));
  const sN = Math.max(10, Math.min(500, parseInt(DOM.inputScaleNew.value) || 100));
  DOM.sliderScaleOld.value = Math.max(25, Math.min(200, sO));
  DOM.sliderScaleNew.value = Math.max(25, Math.min(200, sN));
  _applyScale();
}
function _applyScale() {
  const sO = parseInt(DOM.inputScaleOld.value) || 100;
  const sN = parseInt(DOM.inputScaleNew.value) || 100;
  if (DOM.scaleScope.value === 'all') {
    for (let p = 1; p <= maxPages; p++) setPageScale(p, sO, sN);
  } else {
    setPageScale(currentPage, sO, sN);
  }
  if (rawOld || rawNew) recolorAndComposite();
  scheduleThumbRefresh();
}
function resetScale() {
  if (DOM.scaleScope.value === 'all') {
    pageScales = {};
  } else {
    delete pageScales[String(currentPage)];
  }
  loadScaleUI();
  if (rawOld || rawNew) recolorAndComposite();
  scheduleThumbRefresh();
}
function matchScale() {
  const sN = parseInt(DOM.inputScaleNew.value) || 100;
  if (DOM.scaleScope.value === 'all') {
    for (let p = 1; p <= maxPages; p++) { const s = getPageScale(p); setPageScale(p, sN, s.new); }
  } else {
    const s = getPageScale(currentPage); setPageScale(currentPage, sN, s.new);
  }
  loadScaleUI();
  if (rawOld || rawNew) recolorAndComposite();
  scheduleThumbRefresh();
}
function setMode(m) {
  mode = m;
  DOM.modeOverlay.classList.toggle('active', m==='overlay');
  DOM.modeSidebyside.classList.toggle('active', m==='sidebyside');
  // Toggle between single-canvas overlay and dual-pane side-by-side
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
//  SCALE — per-page, rAF-gated composite via recolorAndComposite()
// ═══════════════════════════════════════
function getPageScale(page) { return pageScales[String(page)] || { old: 100, new: 100 }; }
function setPageScale(page, sOld, sNew) { pageScales[String(page)] = { old: sOld, new: sNew }; }
function loadScaleUI() {
  const s = getPageScale(currentPage);
  DOM.inputScaleOld.value = s.old;
  DOM.inputScaleNew.value = s.new;
  DOM.sliderScaleOld.value = Math.max(25, Math.min(200, s.old));
  DOM.sliderScaleNew.value = Math.max(25, Math.min(200, s.new));
}

// ═══════════════════════════════════════
//  OFFSET — rAF-gated composite via recolorAndComposite()
// ═══════════════════════════════════════
function getPageOffset(page) { return pageOffsets[String(page)] || {x:0,y:0}; }
function setPageOffset(page, x, y) { pageOffsets[String(page)] = {x,y}; }
function loadOffsetUI() {
  const off = getPageOffset(currentPage);
  DOM.offsetX.value = off.x;
  DOM.offsetY.value = off.y;
  syncSliders();
  loadScaleUI();
}
function syncSliders() {
  const x=parseInt(DOM.offsetX.value)||0, y=parseInt(DOM.offsetY.value)||0;
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
  const x=parseInt(DOM.offsetX.value)||0, y=parseInt(DOM.offsetY.value)||0;
  syncSliders();
  if (DOM.offsetScope.value==='all') { for(let p=1;p<=maxPages;p++) setPageOffset(p,x,y); }
  else setPageOffset(currentPage,x,y);
  // FIX: rAF-gated — slider fires 60+ Hz, but we render max once/frame
  if (rawOld||rawNew) recolorAndComposite();
  scheduleThumbRefresh();
}
function nudgeOffset(dx,dy) {
  const scope=DOM.offsetScope.value;
  if (scope==='all') { for(let p=1;p<=maxPages;p++){const o=getPageOffset(p);setPageOffset(p,o.x+dx,o.y+dy);} }
  else { const o=getPageOffset(currentPage); setPageOffset(currentPage,o.x+dx,o.y+dy); }
  loadOffsetUI();
  if (rawOld||rawNew) recolorAndComposite();
  scheduleThumbRefresh();
}
function resetOffset() {
  if (DOM.offsetScope.value==='all') pageOffsets={};
  else delete pageOffsets[String(currentPage)];
  loadOffsetUI();
  if (rawOld||rawNew) recolorAndComposite();
  scheduleThumbRefresh();
}

// ═══════════════════════════════════════
//  PAGE NAV
// ═══════════════════════════════════════
function updatePageNav() {
  DOM.pageGoto.value = currentPage;
  DOM.pageGoto.max = maxPages;
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
  const preset = { version:2, ...gatherUISettings(), pageOffsets: JSON.parse(JSON.stringify(pageOffsets)), pageScales: JSON.parse(JSON.stringify(pageScales)), maxPages, currentPage,
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
  if (p.offsetScope) DOM.offsetScope.value=p.offsetScope;
  if (p.thumbPPI) { thumbPPI=p.thumbPPI; DOM.thumbPPIInput.value=thumbPPI; }
  if (p.memLimitMB) { cacheMemLimitMB=p.memLimitMB; DOM.memLimit.value=cacheMemLimitMB; }
  if (p.scaleScope) DOM.scaleScope.value=p.scaleScope;
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
  if (p.pageOffsets) pageOffsets=p.pageOffsets;
  if (p.pdfOldB64 && p.pdfNewB64) {
    DOM.btnCompare.textContent='Parsing old PDF…'; await sleep(30);
    pdfBufOld=base64ToBuf(p.pdfOldB64); pdfOld=await pdfjsLib.getDocument({data:pdfBufOld.slice(0)}).promise;
    DOM.nameOld.textContent=p.fileOld||'old.pdf'; DOM.zoneOld.classList.add('has-file');
    DOM.btnCompare.textContent='Parsing new PDF…'; await sleep(30);
    pdfBufNew=base64ToBuf(p.pdfNewB64); pdfNew=await pdfjsLib.getDocument({data:pdfBufNew.slice(0)}).promise;
    DOM.nameNew.textContent=p.fileNew||'new.pdf'; DOM.zoneNew.classList.add('has-file');
    maxPages=Math.max(pdfOld.numPages,pdfNew.numPages); currentPage=p.currentPage||1; if(currentPage>maxPages) currentPage=1;
    cachePPI=parseInt(DOM.ppiSelect.value); cacheOld={}; cacheNew={}; lruOrder=[]; lruSet=new Set(); _trackedCacheBytes=0;
    DOM.placeholder.style.display='none'; DOM.canvasContainer.style.display='block'; DOM.zoomBar.classList.add('show'); DOM.drawToolbar.classList.add('show');
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

function exportPNG() {
  if(!DOM.canvasOutput.width) return alert('Nothing to export.');
  DOM.canvasOutput.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`overlay-page-${currentPage}.png`;a.click();URL.revokeObjectURL(a.href);},'image/png');
}
async function exportPDF() {
  const c=DOM.canvasOutput; if(!c.width) return alert('Nothing to export.');
  if (!await _ensureJsPDF()) return;
  const JsPDF = _getJsPDF(), o=c.width>=c.height?'landscape':'portrait';
  const pdf=new JsPDF({orientation:o,unit:'px',format:[c.width,c.height]});
  pdf.addImage(c.toDataURL('image/jpeg',0.92),'JPEG',0,0,c.width,c.height);
  pdf.save(`overlay-page-${currentPage}.pdf`);
}
async function exportAllPDF() {
  if(!rawOld&&!rawNew) return alert('Nothing to export.');
  if (!_ensureJsPDF()) return;
  const JsPDF = _getJsPDF(), btn=$('btn-export-all'), origText=btn.textContent;
  let pdf=null;
  const savedPage=currentPage;
  try {
    for(let p=1;p<=maxPages;p++) {
      btn.textContent=`${p}/${maxPages}…`; await sleep(30);
      currentPage=p; loadOffsetUI(); await renderPage(p);
      const c=DOM.canvasOutput, o=c.width>=c.height?'landscape':'portrait';
      if(p===1) pdf=new JsPDF({orientation:o,unit:'px',format:[c.width,c.height]});
      else pdf.addPage([c.width,c.height],o);
      pdf.addImage(c.toDataURL('image/jpeg',0.92),'JPEG',0,0,c.width,c.height);
    }
    pdf.save(`overlay-all-pages-${new Date().toISOString().slice(0,10)}.pdf`);
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
      const blob = await new Promise(r => DOM.canvasOutput.toBlob(r, 'image/png'));
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
    drag=true;area.classList.add('dragging');sx=e.clientX;sy=e.clientY;sl=area.scrollLeft;st=area.scrollTop;e.preventDefault();
  });
  area.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();}); // prevent middle-click autoscroll
  window.addEventListener('mousemove',e=>{if(!drag)return;area.scrollLeft=sl-(e.clientX-sx);area.scrollTop=st-(e.clientY-sy);});
  window.addEventListener('mouseup',()=>{if(!drag)return;drag=false;area.classList.remove('dragging');});
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
      drag=true; pane.classList.add('dragging');
      sx=e.clientX; sy=e.clientY; sl=pane.scrollLeft; st=pane.scrollTop;
      e.preventDefault();
    });
    pane.addEventListener('auxclick', e=>{if(e.button===1)e.preventDefault();}); // prevent middle-click autoscroll
    window.addEventListener('mousemove', e => {
      if(!drag) return;
      pane.scrollLeft = sl-(e.clientX-sx);
      pane.scrollTop = st-(e.clientY-sy);
    });
    window.addEventListener('mouseup', () => {
      if(!drag) return; drag=false; pane.classList.remove('dragging');
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

  // ── Crosshair overlay canvases ──
  function resizeXhair(canvas, pane) {
    const w = pane.clientWidth, h = pane.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
  }
  function drawXhair(canvas, x, y) {
    resizeXhair(canvas, canvas.parentElement);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (x < 0) return; // hidden
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
    ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    // small dot at intersection
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  function clearXhair(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Track mouse position in viewport-relative coords for the pane
  function paneMousePos(pane, e) {
    const rect = pane.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  sO.addEventListener('mousemove', e => {
    const pos = paneMousePos(sO, e);
    drawXhair(DOM.sbsXhairOld, pos.x, pos.y);
    drawXhair(DOM.sbsXhairNew, pos.x, pos.y);
  });
  sN.addEventListener('mousemove', e => {
    const pos = paneMousePos(sN, e);
    drawXhair(DOM.sbsXhairOld, pos.x, pos.y);
    drawXhair(DOM.sbsXhairNew, pos.x, pos.y);
  });
  sO.addEventListener('mouseleave', () => { clearXhair(DOM.sbsXhairOld); clearXhair(DOM.sbsXhairNew); });
  sN.addEventListener('mouseleave', () => { clearXhair(DOM.sbsXhairOld); clearXhair(DOM.sbsXhairNew); });
})();

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
  const renderOne = async (pdf, num) => {
    if (!pdf || num > pdf.numPages) return null;
    const page = await pdf.getPage(num);
    const vp = page.getViewport({ scale: getThumbScale() });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, vp.width, vp.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  };
  const cOld = await renderOne(pdfOld, pageNum);
  const cNew = await renderOne(pdfNew, pageNum);
  const w = Math.max(cOld ? cOld.width : 0, cNew ? cNew.width : 0);
  const h = Math.max(cOld ? cOld.height : 0, cNew ? cNew.height : 0);
  if (w === 0 || h === 0) {
    if (cOld) { cOld.width = 0; cOld.height = 0; }
    if (cNew) { cNew.width = 0; cNew.height = 0; }
    return null;
  }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  if (cOld) { ctx.globalAlpha = 0.5; ctx.drawImage(cOld, 0, 0); }
  if (cNew) { ctx.globalAlpha = 0.5; ctx.drawImage(cNew, 0, 0); }
  ctx.globalAlpha = 1;
  const dataUrl = out.toDataURL('image/jpeg', 0.5);
  out.width = 0; out.height = 0;
  if (cOld) { cOld.width = 0; cOld.height = 0; }
  if (cNew) { cNew.width = 0; cNew.height = 0; }
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

function scheduleThumbRefresh() {
  if (thumbTimer) clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    thumbTimer = null;
    thumbGeneration++;
    thumbDataUrls = {};
    if (thumbPanelOpen && maxPages > 0) buildThumbSlots();
  }, 30000);
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
//  KEYBOARD
// ═══════════════════════════════════════
window.addEventListener('keydown',e=>{
  if(isInputFocused()) return;
  // Drawing tool shortcuts
  if(e.key==='v'||e.key==='V'){setDrawTool('pan');return;}
  if(e.key==='p'&&!e.ctrlKey&&!e.metaKey){setDrawTool('pen');return;}
  if(e.key==='l'||e.key==='L'){setDrawTool('line');return;}
  if(e.key==='a'&&!e.ctrlKey&&!e.metaKey){setDrawTool('arrow');return;}
  if(e.key==='r'&&!e.ctrlKey&&!e.metaKey){setDrawTool('rect');return;}
  if(e.key==='t'&&!e.ctrlKey&&!e.metaKey){setDrawTool('text');return;}
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
  const draw = side === 'old' ? DOM.sbsDrawOld : DOM.sbsDrawNew;
  const src = side === 'old' ? DOM.sbsCanvasOld : DOM.sbsCanvasNew;
  if (draw.width !== src.width || draw.height !== src.height) {
    draw.width = src.width; draw.height = src.height;
  }
  draw.style.width = src.style.width;
  draw.style.height = src.style.height;
}
function setDrawTool(tool) {
  drawTool = tool;
  ['pan','pen','line','arrow','rect','text'].forEach(t => {
    const btn = document.getElementById('draw-tool-' + t);
    if (btn) btn.classList.toggle('active', t === tool);
  });
  // Update cursor style on SBS scroll panes & overlay area
  const cursor = tool === 'pan' ? 'grab' : 'crosshair';
  DOM.sbsScrollOld.style.cursor = cursor;
  DOM.sbsScrollNew.style.cursor = cursor;
  DOM.canvasArea.style.cursor = cursor;
  // Enable/disable pointer-events on draw layers
  const pe = tool === 'pan' ? 'none' : 'auto';
  DOM.sbsDrawOld.style.pointerEvents = pe;
  DOM.sbsDrawNew.style.pointerEvents = pe;
}

function getDrawKey(side) { return currentPage + '_' + side; }

function drawStrokesFor(side) {
  const key = getDrawKey(side);
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
  const canvas = side === 'old' ? DOM.sbsDrawOld : DOM.sbsDrawNew;
  const srcCanvas = side === 'old' ? DOM.sbsCanvasOld : DOM.sbsCanvasNew;
  // Match draw layer size to source canvas
  if (canvas.width !== srcCanvas.width || canvas.height !== srcCanvas.height) {
    canvas.width = srcCanvas.width;
    canvas.height = srcCanvas.height;
  }
  // Match CSS display size
  canvas.style.width = srcCanvas.style.width;
  canvas.style.height = srcCanvas.style.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const strokes = drawStrokesFor(side);
  strokes.forEach(s => drawStrokeToCtx(ctx, s));
  if (_drawCurrent && _drawCurrent.side === side) {
    drawStrokeToCtx(ctx, _drawCurrent);
  }
}

function drawStrokeToCtx(ctx, s) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.tool === 'pen') {
    if (s.pts.length < 2) return;
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
    const fontSize = Math.max(14, s.width * 6);
    ctx.font = `${fontSize}px 'DM Sans', sans-serif`;
    ctx.fillText(s.text, s.x1, s.y1);
  }
}

// Wire up drawing on SBS draw layers
function initDrawLayer(drawCanvas, scrollPane, side) {
  let drawing = false;

  drawCanvas.addEventListener('mousedown', e => {
    if (drawTool === 'pan') return;
    e.preventDefault(); e.stopPropagation();
    const pos = clientToCanvas(e, scrollPane, drawCanvas);
    const color = DOM.drawColor.value;
    const width = parseInt(DOM.drawWidth.value);

    if (drawTool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        drawStrokesFor(side).push({ tool: 'text', x1: pos.x, y1: pos.y, color, width, text });
        renderDrawLayer(side);
      }
      return;
    }

    drawing = true;
    if (drawTool === 'pen') {
      _drawCurrent = { tool: 'pen', pts: [pos], color, width, side };
    } else {
      _drawCurrent = { tool: drawTool, x1: pos.x, y1: pos.y, x2: null, y2: null, color, width, side };
    }
  });

  window.addEventListener('mousemove', e => {
    if (!drawing || !_drawCurrent || _drawCurrent.side !== side) return;
    const pos = clientToCanvas(e, scrollPane, drawCanvas);
    if (_drawCurrent.tool === 'pen') {
      _drawCurrent.pts.push(pos);
    } else {
      _drawCurrent.x2 = pos.x;
      _drawCurrent.y2 = pos.y;
    }
    renderDrawLayer(side);
  });

  window.addEventListener('mouseup', () => {
    if (!drawing || !_drawCurrent || _drawCurrent.side !== side) return;
    drawing = false;
    // Only save if there's meaningful content
    const s = _drawCurrent;
    let valid = false;
    if (s.tool === 'pen' && s.pts.length >= 2) valid = true;
    if ((s.tool === 'line' || s.tool === 'arrow' || s.tool === 'rect') && s.x2 != null) valid = true;
    if (valid) {
      const saved = { ...s };
      delete saved.side;
      drawStrokesFor(side).push(saved);
    }
    _drawCurrent = null;
    renderDrawLayer(side);
  });
}

initDrawLayer(DOM.sbsDrawOld, DOM.sbsScrollOld, 'old');
initDrawLayer(DOM.sbsDrawNew, DOM.sbsScrollNew, 'new');

function drawUndo() {
  // Undo last stroke from whichever side was drawn last
  for (const side of ['old', 'new']) {
    const key = getDrawKey(side);
    if (drawStrokes[key] && drawStrokes[key].length > 0) {
      // Find which side has the most recent stroke (just pop from both alternately)
    }
  }
  // Simple: undo from old first, then new
  const keyOld = getDrawKey('old'), keyNew = getDrawKey('new');
  const sOld = drawStrokes[keyOld] || [], sNew = drawStrokes[keyNew] || [];
  if (sNew.length >= sOld.length && sNew.length > 0) {
    sNew.pop(); renderDrawLayer('new');
  } else if (sOld.length > 0) {
    sOld.pop(); renderDrawLayer('old');
  }
}

function drawClear() {
  drawStrokes[getDrawKey('old')] = [];
  drawStrokes[getDrawKey('new')] = [];
  renderDrawLayer('old');
  renderDrawLayer('new');
}
