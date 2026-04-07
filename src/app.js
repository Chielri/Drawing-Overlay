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
//  COMPARE
// ═══════════════════════════════════════
async function runCompare() {
  if (processing) return;
  processing = true;
  try {
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
    rebuildThumbsNow();
  } finally {
    DOM.btnCompare.textContent = 'Compare Revisions';
    processing = false;
  }
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
const _debouncedRecolorComposite = debounce(() => { if (rawOld || rawNew) recolorAndComposite(); }, 30);
function updateSharpness() {
  DOM.valSharpness.textContent = DOM.sliderSharpness.value + '%';
  invalidateRecolor();
  _debouncedRecolorComposite();
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
  try {
    await sleep(0); // yield so button text update paints
    await renderPage(currentPage);
  } finally {
    DOM.btnCompare.textContent = 'Compare Revisions';
    updateCacheUI();
  }
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
  if (p.sharpness!=null) { DOM.sliderSharpness.value=p.sharpness; DOM.valSharpness.textContent=p.sharpness+'%'; }
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
        setPageTransform(k, t); // enforces similarity constraint
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
