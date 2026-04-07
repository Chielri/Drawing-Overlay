// ═══════════════════════════════════════
//  RENDER SCALE
// ═══════════════════════════════════════
function getRenderScale() {
  const ppi = Math.max(36, Math.min(600, parseInt(DOM.ppiSelect.value) || 150));
  return ppi / 72;
}

function validateCanvasSize(w, h) {
  if (w > MAX_CANVAS_DIM || h > MAX_CANVAS_DIM)
    return `Canvas dimension ${Math.round(Math.max(w, h))}px exceeds browser limit of ${MAX_CANVAS_DIM}px.`;
  if (w * h > MAX_CANVAS_PIXELS)
    return `Canvas size ${Math.round(w)}×${Math.round(h)} (${Math.round(w*h/1e6)}M pixels) exceeds safe limit.`;
  return null;
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
  // Yield to let UI update (e.g. "Re-rendering…" text) before heavy recolor
  await sleep(0);
  _doRecolorAndComposite();
  if (!hasRenderedOnce) { hasRenderedOnce = true; requestAnimationFrame(() => zoomFit()); }
}

async function renderPdfPage(pdf, num) {
  if (!pdf || num > pdf.numPages) return null;
  const page = await pdf.getPage(num);
  const vp = page.getViewport({ scale: getRenderScale() });

  const sizeErr = validateCanvasSize(vp.width, vp.height);
  if (sizeErr) {
    alert(`Page ${num} is too large to render at ${DOM.ppiSelect.value} PPI.\n\n${sizeErr}\nTry a lower PPI setting.`);
    return null;
  }

  const c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    alert(`Page ${num}: browser refused canvas context at ${Math.round(vp.width)}×${Math.round(vp.height)}.\nTry a lower PPI setting.`);
    c.width = 0; c.height = 0;
    return null;
  }

  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, vp.width, vp.height);

  const renderPromise = page.render({ canvasContext: ctx, viewport: vp }).promise;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), RENDER_TIMEOUT_MS)
  );
  try {
    await Promise.race([renderPromise, timeoutPromise]);
  } catch (e) {
    const reason = e.message === 'timeout'
      ? `Rendering page ${num} timed out after ${RENDER_TIMEOUT_MS / 1000}s.`
      : `Rendering page ${num} failed: ${e.message}`;
    alert(`${reason}\nTry a lower PPI setting.`);
    c.width = 0; c.height = 0;
    return null;
  }

  const imgData = ctx.getImageData(0, 0, vp.width, vp.height);
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
  const srcData = src.data;
  const len = srcData.length;
  const out = new ImageData(src.width, src.height);
  const tR = rgb[0], tG = rgb[1], tB = rgb[2];
  const sharpness = parseInt(DOM.sliderSharpness.value) || 0;

  // Precompute LUT: luminance (0-255) → packed RGBA as uint32
  // Sharpness applies a power curve to boost contrast on text/lines:
  //   gamma < 1 pushes mid-darkness toward full opacity → crisper edges
  const gamma = sharpness > 0 ? 1 / (1 + sharpness / 100 * 9) : 1; // 1.0 → 0.1
  const lut = new Uint32Array(256);
  for (let lum = 0; lum < 256; lum++) {
    let dk = 1 - lum / 255;
    if (dk < 0.03) {
      lut[lum] = _isLittleEndian ? 0x00FFFFFF : 0xFFFFFF00;
    } else {
      if (gamma < 1) dk = Math.pow(dk, gamma);
      const invDk = 1 - dk;
      const r = (tR*dk + 255*invDk + 0.5) | 0;
      const g = (tG*dk + 255*invDk + 0.5) | 0;
      const b = (tB*dk + 255*invDk + 0.5) | 0;
      const a = (dk*255 + 0.5) | 0;
      lut[lum] = _isLittleEndian ? (a << 24 | b << 16 | g << 8 | r)
                                 : (r << 24 | g << 16 | b << 8 | a);
    }
  }

  // Process pixels: integer luminance + LUT lookup + uint32 write
  const out32 = new Uint32Array(out.data.buffer);
  for (let i = 0, j = 0; i < len; i += 4, j++) {
    // Integer luminance: 77/256≈0.301, 150/256≈0.586, 29/256≈0.113
    out32[j] = lut[(77*srcData[i] + 150*srcData[i+1] + 29*srcData[i+2]) >> 8];
  }
  return out;
}

// Resize canvas only when dimensions actually change — avoids GPU texture reallocation.
// Setting canvas.width/height unconditionally deallocates + reallocates the backing store
// every frame, which at 300 PPI means churning ~70MB of GPU memory per composite call.
function _prepareCtx(canvas, w, h) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return ctx;
}

// FIX: reuse temp canvases — skip putImageData when same ImageData is already on canvas
function putImgToTempCanvas(img, tmpCanvas, tmpCtx) {
  if (tmpCanvas._lastImg === img) return tmpCanvas;
  if (tmpCanvas.width !== img.width) tmpCanvas.width = img.width;
  if (tmpCanvas.height !== img.height) tmpCanvas.height = img.height;
  if (!tmpCtx) return tmpCanvas;
  tmpCtx.putImageData(img, 0, 0);
  tmpCanvas._lastImg = img;
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
