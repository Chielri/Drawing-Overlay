// ═══════════════════════════════════════
//  PAGE NAV
// ═══════════════════════════════════════
function updatePageNav() {
  DOM.pageGoto.value = currentPage;
  DOM.pageGoto.max = maxPages;
  DOM.pageGoto.style.width = Math.max(3, String(maxPages).length + 1) + 'ch';
  DOM.pageTotal.textContent = maxPages;
  DOM.btnPrev.disabled = (currentPage<=1);
  DOM.btnNext.disabled = (currentPage>=maxPages);
  DOM.thumbScroll.querySelectorAll('.thumb-item').forEach((el,i) => el.classList.toggle('active', i+1===currentPage));
  const activeThumb = DOM.thumbScroll.querySelector('.thumb-item.active');
  if (activeThumb) activeThumb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function goToPage() {
  const n = parseInt(DOM.pageGoto.value);
  if (isNaN(n) || n < 1 || n > maxPages || n === currentPage) return;
  currentPage = n; loadOffsetUI();
  renderPage(currentPage).then(() => { updatePageNav(); updateCacheUI(); });
}
async function changePage(delta) {
  const n = currentPage+delta; if(n<1||n>maxPages) return;
  currentPage = n; loadOffsetUI();
  await renderPage(currentPage);
  updatePageNav(); updateCacheUI();
}

// ═══════════════════════════════════════
//  THUMBNAILS
// ═══════════════════════════════════════
function getThumbScale() { return thumbPPI / 72; }

function toggleThumbs() {
  thumbPanelOpen = !thumbPanelOpen;
  DOM.thumbPanel.classList.toggle('open', thumbPanelOpen);
  DOM.thumbToggle.classList.toggle('shifted', thumbPanelOpen);
  if (thumbPanelOpen && maxPages > 0) buildThumbSlots();
}

function buildThumbSlots() {
  DOM.thumbScroll.innerHTML = '';
  for (let p = 1; p <= maxPages; p++) {
    const item = document.createElement('div');
    item.className = 'thumb-item' + (p === currentPage ? ' active' : '');
    item.dataset.page = p;
    const cvs = document.createElement('canvas');
    cvs.width = 1; cvs.height = 1;
    item.appendChild(cvs);
    const lbl = document.createElement('div');
    lbl.className = 'thumb-label';
    lbl.textContent = p;
    item.appendChild(lbl);
    if (thumbDataUrls[p]) {
      const img = new Image();
      img.onload = function() { cvs.width = this.width; cvs.height = this.height; cvs.getContext('2d').drawImage(this, 0, 0); };
      img.src = thumbDataUrls[p];
    } else {
      item.insertAdjacentHTML('beforeend', '<div class="thumb-spinner">…</div>');
    }
    DOM.thumbScroll.appendChild(item);
  }
  renderMissingThumbs();
}

DOM.thumbScroll.addEventListener('click', e => {
  const item = e.target.closest('.thumb-item');
  if (!item) return;
  const p = parseInt(item.dataset.page);
  if (isNaN(p) || p === currentPage) return;
  currentPage = p; loadOffsetUI();
  renderPage(p).then(() => { updatePageNav(); updateCacheUI(); });
});

async function renderThumbPage(pageNum) {
  // Render only the new document for thumbnails
  if (!pdfNew || pageNum > pdfNew.numPages) return null;
  const page = await pdfNew.getPage(pageNum);
  const vp = page.getViewport({ scale: getThumbScale() });
  const c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, vp.width, vp.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const dataUrl = c.toDataURL('image/jpeg', 0.5);
  c.width = 0; c.height = 0;
  return dataUrl;
}

async function renderMissingThumbs() {
  if (thumbRendering) return;
  thumbRendering = true;
  const gen = thumbGeneration;
  for (let p = 1; p <= maxPages; p++) {
    if (gen !== thumbGeneration) break;
    if (thumbDataUrls[p]) continue;
    const url = await renderThumbPage(p);
    if (gen !== thumbGeneration) break;
    if (!url) continue;
    thumbDataUrls[p] = url;
    const item = document.querySelector(`.thumb-item[data-page="${p}"]`);
    if (item) {
      const cvs = item.querySelector('canvas');
      const spinner = item.querySelector('.thumb-spinner');
      if (spinner) spinner.remove();
      const img = new Image();
      img.onload = function() { cvs.width = this.width; cvs.height = this.height; cvs.getContext('2d').drawImage(this, 0, 0); };
      img.src = url;
    }
    await sleep(5);
  }
  thumbRendering = false;
}

function rebuildThumbsNow() {
  thumbGeneration++;
  thumbDataUrls = {};
  if (thumbTimer) { clearTimeout(thumbTimer); thumbTimer = null; }
  if (thumbPanelOpen && maxPages > 0) buildThumbSlots();
}


function clearThumbCache() {
  thumbGeneration++;
  thumbDataUrls = {};
  if (thumbTimer) { clearTimeout(thumbTimer); thumbTimer = null; }
  DOM.thumbScroll.innerHTML = '';
}

function changeThumbPPI() {
  const v = Math.max(8, Math.min(72, parseInt(DOM.thumbPPIInput.value) || 18));
  DOM.thumbPPIInput.value = v;
  thumbPPI = v;
  rebuildThumbsNow();
}
