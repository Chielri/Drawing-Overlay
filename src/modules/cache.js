// ═══════════════════════════════════════
//  CACHE MEMORY LIMIT (incremental tracking)
// ═══════════════════════════════════════
function changeMemLimit() {
  const v = Math.max(256, Math.min(131072, parseInt(DOM.memLimit.value) || 4096));
  cacheMemLimitMB = v;
  let safety = lruOrder.length + 2;
  while (_trackedCacheBytes > cacheMemLimitMB * 1048576 && lruOrder.length > 1 && safety-- > 0) {
    const oldest = lruOrder[0];
    if (oldest === String(currentPage)) { lruOrder.push(lruOrder.shift()); continue; }
    evictPage(oldest);
  }
  updateCacheUI();
}

// FIX: O(1) — just return tracked value
function getCacheBytes() { return _trackedCacheBytes; }
function getCacheMB() { return _trackedCacheBytes / 1048576; }

// Recalculate from scratch (called only on bulk operations like clearCache)
function _recomputeCacheBytes() {
  let bytes = 0;
  for (const k in cacheOld) if (cacheOld[k]) bytes += cacheOld[k].data.byteLength;
  for (const k in cacheNew) if (cacheNew[k]) bytes += cacheNew[k].data.byteLength;
  _trackedCacheBytes = bytes;
}

function touchLRU(page) {
  const p = String(page);
  if (lruSet.has(p)) {
    const idx = lruOrder.indexOf(p);
    if (idx !== -1) lruOrder.splice(idx, 1);
  }
  lruOrder.push(p);
  lruSet.add(p);
}

function evictPage(page) {
  const p = String(page);
  if (cacheOld[p]) _trackedCacheBytes -= cacheOld[p].data.byteLength;
  if (cacheNew[p]) _trackedCacheBytes -= cacheNew[p].data.byteLength;
  delete cacheOld[p];
  delete cacheNew[p];
  if (lruSet.has(p)) {
    const idx = lruOrder.indexOf(p);
    if (idx !== -1) lruOrder.splice(idx, 1);
    lruSet.delete(p);
  }
}

function evictUntilFits(newBytes) {
  const limitBytes = cacheMemLimitMB * 1048576;
  let safety = lruOrder.length + 2;
  while (_trackedCacheBytes + newBytes > limitBytes && lruOrder.length > 0 && safety-- > 0) {
    const oldest = lruOrder[0];
    if (oldest === String(currentPage)) {
      if (lruOrder.length <= 1) break;
      lruOrder.push(lruOrder.shift());
      continue;
    }
    evictPage(oldest);
  }
}

function estimatePageBytes() {
  for (const k in cacheOld) {
    if (cacheOld[k]) return cacheOld[k].data.byteLength * 2;
  }
  const scale = getRenderScale();
  const basePixels = 1750 * 1237;
  return basePixels * (scale * scale) * 4 * 2;
}
