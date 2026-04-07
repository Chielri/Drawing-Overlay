// ═══════════════════════════════════════
//  CROSSHAIR
// ═══════════════════════════════════════
function toggleXhair() {
  xhairEnabled = !xhairEnabled;
  DOM.xhairToggle.classList.toggle('active', xhairEnabled);
  if (!xhairEnabled) {
    clearXhair(DOM.sbsXhairOld); clearXhair(DOM.sbsXhairNew);
    clearXhair(DOM.overlayXhair);
  }
}

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
