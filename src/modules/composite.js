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

    if (xform && imgN) {
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
      const ctx = _prepareCtx(out, canvasW, canvasH);
      if (!ctx) return;
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
    const ctx = _prepareCtx(out, canvasW, canvasH);
    if (!ctx) return;
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
      const ctxO = _prepareCtx(cOld, wO + oldDxSbs, hO + oldDySbs);
      ctxO.fillStyle = '#fff'; ctxO.fillRect(0,0,cOld.width,cOld.height);
      ctxO.globalAlpha = aO;
      ctxO.drawImage(putImgToTempCanvas(imgO,_tmpCanvasA,_tmpCtxA),0,0,imgO.width,imgO.height,oldDxSbs,oldDySbs,wO,hO);
      ctxO.globalAlpha = 1;
    } else if (cOld.width !== 1 || cOld.height !== 1) { cOld.width = 1; cOld.height = 1; }
    // New pane
    if (imgN && visNew) {
      const ctxN = _prepareCtx(cNew, wN + newDxSbs, hN + newDySbs);
      ctxN.fillStyle = '#fff'; ctxN.fillRect(0,0,cNew.width,cNew.height);
      ctxN.globalAlpha = aN;
      ctxN.drawImage(putImgToTempCanvas(imgN,_tmpCanvasB,_tmpCtxB),0,0,imgN.width,imgN.height,newDxSbs,newDySbs,wN,hN);
      ctxN.globalAlpha = 1;
    } else if (cNew.width !== 1 || cNew.height !== 1) { cNew.width = 1; cNew.height = 1; }
    // Update labels with colors
    DOM.sbsLabelOld.style.background = DOM.colorOld.value;
    DOM.sbsLabelNew.style.background = DOM.colorNew.value;
    // Re-render draw layers on top
    if (typeof renderDrawLayer === 'function') {
      renderDrawLayer('old'); renderDrawLayer('new');
      renderDrawLayer('overlay');
    }
    // Also render to the main output canvas for export
    const ctx = _prepareCtx(out, Math.max(wO, wN), Math.max(hO, hN));
    if (!ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,out.width,out.height);
    if (imgO && visOld) { ctx.globalAlpha=aO; ctx.drawImage(cOld,0,0); }
    if (imgN && visNew) { ctx.globalAlpha=aN; ctx.drawImage(cNew,0,0); }
    ctx.globalAlpha = 1;
  }
  applySbsZoom();
  applyZoom();
}
