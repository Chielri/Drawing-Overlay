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
