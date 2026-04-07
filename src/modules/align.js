// ═══════════════════════════════════════
//  3-POINT ALIGNMENT
// ═══════════════════════════════════════
function getPageTransform(page) { return pageTransforms[String(page)] || null; }
// Enforce similarity constraint (no shear/skew) on every store.
// Similarity: a == d, b == -c. Average the pairs to project any drift.
function setPageTransform(page, t) {
  const a = (t.a + t.d) / 2;
  const c = (t.c - t.b) / 2;
  pageTransforms[String(page)] = { a, b: -c, c, d: a, e: t.e, f: t.f };
}
function clearPageTransform(page) { delete pageTransforms[String(page)]; }

function startAlign3() {
  if (align3Active) { cancelAlign3(); return; }
  if (!rawOld || !rawNew) { alert('Compare PDFs first before aligning.'); return; }
  align3Active = true;
  align3Phase = 'old';
  align3PointsOld = [];
  align3PointsNew = [];
  DOM.align3Start.textContent = 'Cancel';
  DOM.align3Start.classList.add('active');
  DOM.align3Overlay.classList.add('picking');
  updateAlign3UI();
}

function cancelAlign3() {
  align3Active = false;
  align3Phase = 'old';
  align3PointsOld = [];
  align3PointsNew = [];
  DOM.align3Start.textContent = 'Start Alignment';
  DOM.align3Start.classList.remove('active');
  DOM.align3Overlay.classList.remove('picking');
  drawAlign3Markers();
  updateAlign3UI();
}

function clearAlign3() {
  const scope = DOM.transformScope.value;
  if (scope === 'all') {
    pageOffsets = {}; pageScales = {}; pageRotations = {}; pageTransforms = {};
  } else {
    const p = String(currentPage);
    delete pageOffsets[p]; delete pageScales[p]; delete pageRotations[p]; delete pageTransforms[p];
  }
  cancelAlign3();
  loadTransformUI();
  if (rawOld || rawNew) recolorAndComposite();
}

function updateAlign3UI() {
  const el = DOM.align3Status;
  const pts = DOM.align3Points;
  // Check if any transform values have been set (offset, scale, rotation, or affine)
  const off = getPageOffset(currentPage);
  const ps = getPageScale(currentPage);
  const rot = getPageRotation(currentPage);
  const hasTransform = !!getPageTransform(currentPage) || off.x !== 0 || off.y !== 0 || ps.old !== 100 || ps.new !== 100 || rot !== 0;

  if (!align3Active && !hasTransform) {
    el.textContent = 'Pick 3 matching point pairs to align PDFs.';
    el.className = 'align3-status';
    DOM.align3Clear.style.display = 'none';
  } else if (!align3Active && hasTransform) {
    el.textContent = 'Alignment applied via affine transform.';
    el.className = 'align3-status done';
    DOM.align3Clear.style.display = '';
  } else if (align3Phase === 'old') {
    const n = align3PointsOld.length;
    el.textContent = `Click point ${n + 1}/3 on OLD (blue) PDF`;
    el.className = 'align3-status active';
  } else {
    const n = align3PointsNew.length;
    el.textContent = `Click point ${n + 1}/3 on NEW (red) PDF`;
    el.className = 'align3-status active';
  }

  // Show picked points
  let html = '';
  const labels = ['A', 'B', 'C'];
  for (let i = 0; i < 3; i++) {
    const pO = align3PointsOld[i];
    const pN = align3PointsNew[i];
    if (pO || pN) {
      html += '<div class="align3-point-row">';
      html += `<strong style="width:10px;">${labels[i]}</strong>`;
      if (pO) html += `<span class="align3-point-dot old"></span><span>Old: ${Math.round(pO.x)}, ${Math.round(pO.y)}</span>`;
      if (pN) html += `<span class="align3-point-dot new"></span><span>New: ${Math.round(pN.x)}, ${Math.round(pN.y)}</span>`;
      html += '</div>';
    }
  }
  pts.innerHTML = html;
}

// Convert a click on the overlay canvas to PDF pixel coordinates
function align3ClickToCanvas(e) {
  const overlay = DOM.align3Overlay;
  const output = DOM.canvasOutput;
  const rect = overlay.getBoundingClientRect();
  // The overlay covers the canvas-container which may be zoomed
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  // Convert from display coords to actual canvas pixel coords
  const scaleX = output.width / rect.width;
  const scaleY = output.height / rect.height;
  return { x: clickX * scaleX, y: clickY * scaleY };
}

// Draw markers on the overlay canvas to show picked points
function drawAlign3Markers() {
  const overlay = DOM.align3Overlay;
  const output = DOM.canvasOutput;
  if (!output.width || !output.height) return;
  overlay.width = output.width;
  overlay.height = output.height;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const labels = ['A', 'B', 'C'];
  const drawPoint = (pt, color, label, offsetDir) => {
    const r = 8;
    // Outer ring
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.stroke();
    // Center dot
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
    // Label
    ctx.font = 'bold 14px DM Sans, sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(label, pt.x + 12 + 1, pt.y - 10 + 1);
    ctx.fillStyle = color;
    ctx.fillText(label, pt.x + 12, pt.y - 10);
  };

  align3PointsOld.forEach((pt, i) => drawPoint(pt, '#58a6ff', labels[i] + '₁'));
  align3PointsNew.forEach((pt, i) => drawPoint(pt, '#ff6b6b', labels[i] + '₂'));
}

// Handle click on the alignment overlay
DOM.align3Overlay.addEventListener('click', function(e) {
  if (!align3Active) return;
  e.preventDefault();
  e.stopPropagation();

  const pt = align3ClickToCanvas(e);

  if (align3Phase === 'old') {
    align3PointsOld.push(pt);
    drawAlign3Markers();
    if (align3PointsOld.length === 3) {
      align3Phase = 'new';
    }
  } else {
    align3PointsNew.push(pt);
    drawAlign3Markers();
    if (align3PointsNew.length === 3) {
      // All 6 points collected — compute and apply transform
      computeAndApplyAlign3();
    }
  }
  updateAlign3UI();
});

// Solve affine transform from 3 point pairs: src[i] → dst[i]
// Returns {a, b, c, d, e, f} such that:
//   dst.x = a * src.x + b * src.y + e
//   dst.y = c * src.x + d * src.y + f
function solveAffine(src, dst) {
  // Set up system: for each point pair (sx,sy) → (dx,dy):
  //   a*sx + b*sy + e = dx
  //   c*sx + d*sy + f = dy
  // 6 unknowns, 6 equations
  const s = src, d = dst;
  // For x-coords: [s0x s0y 1] [a]   [d0x]
  //               [s1x s1y 1] [b] = [d1x]
  //               [s2x s2y 1] [e]   [d2x]
  // Solve via Cramer's rule or direct inverse of 3x3 matrix
  const det = s[0].x * (s[1].y - s[2].y) - s[0].y * (s[1].x - s[2].x) + (s[1].x * s[2].y - s[2].x * s[1].y);
  if (Math.abs(det) < 1e-10) return null; // degenerate (collinear points)

  const invDet = 1 / det;
  // Inverse of [[s0x,s0y,1],[s1x,s1y,1],[s2x,s2y,1]]
  const m00 = (s[1].y - s[2].y) * invDet;
  const m01 = (s[2].y - s[0].y) * invDet;
  const m02 = (s[0].y - s[1].y) * invDet;
  const m10 = (s[2].x - s[1].x) * invDet;
  const m11 = (s[0].x - s[2].x) * invDet;
  const m12 = (s[1].x - s[0].x) * invDet;
  const m20 = (s[1].x * s[2].y - s[2].x * s[1].y) * invDet;
  const m21 = (s[2].x * s[0].y - s[0].x * s[2].y) * invDet;
  const m22 = (s[0].x * s[1].y - s[1].x * s[0].y) * invDet;

  // Multiply inv(S) * dx and inv(S) * dy
  const a = m00 * d[0].x + m01 * d[1].x + m02 * d[2].x;
  const b = m10 * d[0].x + m11 * d[1].x + m12 * d[2].x;
  const e = m20 * d[0].x + m21 * d[1].x + m22 * d[2].x;
  const c = m00 * d[0].y + m01 * d[1].y + m02 * d[2].y;
  const dd = m10 * d[0].y + m11 * d[1].y + m12 * d[2].y;
  const f = m20 * d[0].y + m21 * d[1].y + m22 * d[2].y;

  return { a, b, c, d: dd, e, f };
}

// Solve least-squares similarity transform (uniform scale + rotation + translation).
// Maps srcPts → dstPts with minimum error, constrained to no shear/skew.
// Returns {a, b, c, d, e, f} where a=s*cos, b=-s*sin, c=s*sin, d=s*cos.
function solveSimilarity(srcPts, dstPts) {
  const n = srcPts.length;
  // Compute centroids
  let csx = 0, csy = 0, cdx = 0, cdy = 0;
  for (let i = 0; i < n; i++) {
    csx += srcPts[i].x; csy += srcPts[i].y;
    cdx += dstPts[i].x; cdy += dstPts[i].y;
  }
  csx /= n; csy /= n; cdx /= n; cdy /= n;

  // Solve for a, b in least-squares: dst' = [a -b; b a] * src'
  // Normal equations: a = Σ(x'·X' + y'·Y') / S, b = Σ(-y'·X' + x'·Y') / S
  // where S = Σ(x'² + y'²)
  let S = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    const sx = srcPts[i].x - csx, sy = srcPts[i].y - csy;
    const dx = dstPts[i].x - cdx, dy = dstPts[i].y - cdy;
    S += sx * sx + sy * sy;
    sumA += sx * dx + sy * dy;
    sumB += -sy * dx + sx * dy;
  }
  if (Math.abs(S) < 1e-10) return null; // degenerate (all source points coincide)

  const a = sumA / S;  // s * cos(θ)
  const b = sumB / S;  // s * sin(θ)
  const e = cdx - (a * csx - b * csy);
  const f = cdy - (b * csx + a * csy);
  return { a: a, b: -b, c: b, d: a, e, f };
}

// Snap rotation (<1° → 0) and/or scale (within 1% of expected → exact) in a similarity transform.
// srcPts/dstPts: the point pairs used to compute the transform (for recomputing translation).
function snapAffineTransform(t, srcPts, dstPts, expectedScale) {
  const angle = Math.atan2(t.c, t.a); // radians
  const angleDeg = angle * 180 / Math.PI;

  // Extract uniform scale (should be same for x and y in a similarity transform)
  let scale = Math.sqrt(t.a * t.a + t.c * t.c);

  let snapRot = Math.abs(angleDeg) < 1;
  let snapScale = false;

  // Snap scale if within 1% of expectedScale
  if (expectedScale > 0) {
    const tol = expectedScale * 0.01;
    if (Math.abs(scale - expectedScale) < tol) {
      scale = expectedScale;
      snapScale = true;
    }
  }

  if (!snapRot && !snapScale) return t; // nothing to snap

  // Recompose with snapped values
  const cosR = snapRot ? 1 : Math.cos(angle);
  const sinR = snapRot ? 0 : Math.sin(angle);
  const newA = cosR * scale;
  const newB = -sinR * scale;
  const newC = sinR * scale;
  const newD = cosR * scale;

  // Recompute translation so centroids still map correctly
  const csx = (srcPts[0].x + srcPts[1].x + srcPts[2].x) / 3;
  const csy = (srcPts[0].y + srcPts[1].y + srcPts[2].y) / 3;
  const cdx = (dstPts[0].x + dstPts[1].x + dstPts[2].x) / 3;
  const cdy = (dstPts[0].y + dstPts[1].y + dstPts[2].y) / 3;
  const newE = cdx - (newA * csx + newB * csy);
  const newF = cdy - (newC * csx + newD * csy);
  return { a: newA, b: newB, c: newC, d: newD, e: newE, f: newF };
}

function computeAndApplyAlign3() {
  // We want a stored affine that maps rawNewPx → oldCanvasPos (before shift).
  // composite() uses: ctx.setTransform(xform...) then drawImage(newImg, 0, 0),
  // so the stored affine must map raw pixel coords directly.
  //
  // Unified approach: always construct the "current transform" that describes
  // how the new layer is currently drawn, then invert it to recover raw pixel
  // coordinates from click positions, and solve a fresh affine.

  if (!rawOld || !rawNew) {
    alert('Compare PDFs first before aligning.');
    cancelAlign3();
    return;
  }

  const ps = getPageScale(currentPage);
  const sO = ps.old / 100;
  const sN = ps.new / 100;
  let transform;

  // Get the current transform, or construct the implicit one from offset+scale+rotation
  let currentXform = getPageTransform(currentPage);
  let hadAffine = !!currentXform;
  if (!currentXform) {
    // No affine exists — build the equivalent from the standard composite path's
    // offset + scale + rotation so we can invert it to get raw pixel coordinates.
    // The implicit transform maps rawNewPx → position relative to old at (0,0),
    // matching how composite's standard path draws: old at (oldDx,oldDy), new at
    // (newDx + rotation, newDy + rotation), with the offset ox = newDx - oldDx.
    const off = getPageOffset(currentPage);
    const ox = off.x, oy = off.y;
    const rotDeg = getPageRotation(currentPage);
    const rotRad = rotDeg * Math.PI / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const hw = rawNew.width / 2, hh = rawNew.height / 2;
    currentXform = {
      a:  cosR * sN,
      b: -sinR * sN,
      c:  sinR * sN,
      d:  cosR * sN,
      e:  sN * (hw * (1 - cosR) + hh * sinR) + ox,
      f:  sN * (-hw * sinR + hh * (1 - cosR)) + oy
    };
  }

  // ── Unified alignment: invert currentXform to get raw pixel coords, solve fresh ──
  const wO0 = rawOld.width * sO, hO0 = rawOld.height * sO;

  // Compute the canvas shift that was used during rendering.
  // For the affine path: composite computes shift from transformed corners.
  // For the standard path: old is at (oldDx, oldDy) = (max(0,-ox), max(0,-oy)).
  let shiftX, shiftY;
  if (hadAffine) {
    const corners = [[0,0],[rawNew.width,0],[0,rawNew.height],[rawNew.width,rawNew.height]];
    let minX = 0, minY = 0;
    corners.forEach(([px, py]) => {
      const cx2 = currentXform.a * px + currentXform.b * py + currentXform.e;
      const cy2 = currentXform.c * px + currentXform.d * py + currentXform.f;
      minX = Math.min(minX, cx2); minY = Math.min(minY, cy2);
    });
    shiftX = minX < 0 ? -minX : 0;
    shiftY = minY < 0 ? -minY : 0;
  } else {
    // Standard path: old drawn at (oldDx, oldDy) where oldDx = max(0, -ox)
    const off = getPageOffset(currentPage);
    shiftX = off.x < 0 ? -off.x : 0;
    shiftY = off.y < 0 ? -off.y : 0;
  }

  // Remove canvas shift to get pre-shift positions
  const adjOld = align3PointsOld.map(pt => ({ x: pt.x - shiftX, y: pt.y - shiftY }));
  const adjNew = align3PointsNew.map(pt => ({ x: pt.x - shiftX, y: pt.y - shiftY }));

  // Convert new clicked positions to raw new pixel coordinates
  // by inverting the current transform: rawNewPx = E⁻¹(adjNew)
  const E = currentXform;
  const det = E.a * E.d - E.b * E.c;
  if (Math.abs(det) < 1e-10) {
    alert('Current transform is degenerate. Clear alignment and try again.');
    cancelAlign3();
    return;
  }
  const rawNewPts = adjNew.map(pt => ({
    x: (E.d * (pt.x - E.e) - E.b * (pt.y - E.f)) / det,
    y: (-E.c * (pt.x - E.e) + E.a * (pt.y - E.f)) / det
  }));

  // Solve least-squares similarity transform: rawNewPx → adjOld
  // Uses uniform scale + rotation (no shear/skew) to avoid distortion from click imprecision.
  // adjOld = sO * rawOldPx, which is where old features sit in pre-shift canvas.
  transform = solveSimilarity(rawNewPts, adjOld);
  if (!transform) {
    alert('Points are coincident — pick distinct points.');
    cancelAlign3();
    return;
  }

  // Snap small rotations (<1° → 0) and scale close to sO caused by imprecise clicking
  transform = snapAffineTransform(transform, rawNewPts, adjOld, sO);

  console.log('3-point align: fresh solve from raw pixels', {
    hadExistingAffine: hadAffine,
    shift: [shiftX, shiftY], det,
    rawNewPts: rawNewPts.map(p => [Math.round(p.x), Math.round(p.y)]),
    adjOld: adjOld.map(p => [Math.round(p.x), Math.round(p.y)]),
    result: { a: transform.a.toFixed(6), b: transform.b.toFixed(6), c: transform.c.toFixed(6), d: transform.d.toFixed(6), e: transform.e.toFixed(2), f: transform.f.toFixed(2) }
  });

  // ── Decompose for UI display ──
  // The stored transform is a similarity: uniform scale + rotation + translation.
  const rotRad = Math.atan2(transform.c, transform.a);
  const rotDeg = Math.round(rotRad * 180 / Math.PI * 100) / 100;
  const effScale = Math.sqrt(transform.a * transform.a + transform.c * transform.c);
  // effScale includes sN baked in, so display scale = effScale * 100 (percentage of raw)
  let scaleNewPercent = Math.round(effScale * 100 * 10) / 10;
  if (Math.abs(scaleNewPercent - Math.round(scaleNewPercent)) < 0.15) scaleNewPercent = Math.round(scaleNewPercent);
  // Compute display offset from affine translation (rotation around image center)
  const imgW = rawNew.width, imgH = rawNew.height;
  const wN_eff = imgW * effScale, hN_eff = imgH * effScale;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
  const cxN = wN_eff / 2, cyN = hN_eff / 2;
  const dispOx = Math.round((transform.e + cosR * cxN - sinR * cyN - cxN) * 10) / 10;
  const dispOy = Math.round((transform.f + sinR * cxN + cosR * cyN - cyN) * 10) / 10;

  const scope = DOM.transformScope.value;
  if (scope === 'all') {
    for (let p = 1; p <= maxPages; p++) {
      setPageTransform(p, { ...transform });
      setPageOffset(p, dispOx, dispOy);
      setPageRotation(p, rotDeg);
      setPageScale(p, ps.old, scaleNewPercent);
    }
  } else {
    setPageTransform(currentPage, { ...transform });
    setPageOffset(currentPage, dispOx, dispOy);
    setPageRotation(currentPage, rotDeg);
    setPageScale(currentPage, ps.old, scaleNewPercent);
  }

  // End picking mode — clear markers since alignment is applied to offset/scale/rotation
  align3Active = false;
  align3PointsOld = [];
  align3PointsNew = [];
  DOM.align3Start.textContent = 'Start Alignment';
  DOM.align3Start.classList.remove('active');
  DOM.align3Overlay.classList.remove('picking');
  drawAlign3Markers(); // clears overlay since points arrays are now empty
  updateAlign3UI();
  loadTransformUI();

  // Re-render with decomposed transform values
  if (rawOld || rawNew) recolorAndComposite();
}
