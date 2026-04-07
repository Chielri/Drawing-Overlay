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
  if (DOM.transformScope.value === 'all') {
    pageRotations = {};
    pageTransforms = {};
  } else {
    delete pageRotations[String(currentPage)];
    clearPageTransform(currentPage);
  }
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
