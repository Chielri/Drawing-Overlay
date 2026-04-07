function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isInputFocused() { const t = document.activeElement?.tagName; return t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA'; }
function debounce(fn, ms) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }

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
