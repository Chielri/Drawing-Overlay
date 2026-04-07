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
  const strokes = drawStrokesFor();
  const hasContent = strokes.length > 0 || _drawCurrent;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!hasContent) return;
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
