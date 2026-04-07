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

function pdfPageDims(w, h) {
  // Convert canvas pixels back to 72-DPI PDF points.
  // The image is rendered at getRenderScale() × 72 DPI, so dividing by that
  // gives the true page size in points — always within jsPDF's 14400 limit.
  const s = getRenderScale();
  return { pw: w / s, ph: h / s, scale: 1 / s, clamped: false };
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
  const {pw, ph} = pdfPageDims(out.width, out.height);
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
  console.log(`Export: ${img.format}, ${(img.data.byteLength/1048576).toFixed(1)} MB`);
}
async function exportAllPDF() {
  if(!rawOld&&!rawNew) return alert('Nothing to export.');
  if (!_ensureJsPDF()) return;
  const JsPDF = _getJsPDF(), btn=$('btn-export-all'), origText=btn.textContent;
  let pdf=null, totalBytes=0;
  const savedPage=currentPage;
  try {
    for(let p=1;p<=maxPages;p++) {
      btn.textContent=`${p}/${maxPages}…`; await sleep(30);
      currentPage=p; loadOffsetUI(); await renderPage(p);
      const c=DOM.canvasOutput;
      const {pw, ph} = pdfPageDims(c.width, c.height);
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
    console.log(`Export all: ${maxPages} pages, ~${(totalBytes/1048576).toFixed(1)} MB image data`);
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
