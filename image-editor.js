(function () {
  'use strict';

  /* =========================================================
     Constants & state
     ========================================================= */
  const MAX_HISTORY = 30;
  const MAX_CANVAS_DIM = 3000;

  const state = {
    /* lifecycle */
    initialized: false,
    container: null,
    wrapper: null,
    bgEl: null,
    drawingCanvas: null,
    drawingCtx: null,
    cropCanvas: null,
    cropCtx: null,
    strokeCanvas: null,   // offscreen: pixel strokes only
    strokeCtx: null,

    /* document */
    sourceUrl: null,
    format: 'png',
    bgImage: null,        // HTMLImageElement
    bgLoaded: false,
    bgCorsClean: true,
    srcW: 800,
    srcH: 600,
    aspect: 4 / 3,

    /* content */
    texts: [],            // vector text objects
    history: [],          // [{strokes, texts, w, h}]
    historyIndex: -1,
    restoreToken: 0,

    /* interaction */
    tool: 'brush',
    brushColor: '#ff0000',
    brushSize: 5,
    painting: false,
    dragging: null,       // {text, dx, dy, moved}
    cropping: null,       // {startX, startY, rect:{x,y,w,h}}
    pointerId: null,
    rafPending: false
  };

  /* =========================================================
     Small helpers
     ========================================================= */
  function $(id) { return document.getElementById(id); }

  function notify(message, isError) {
    try {
      if (typeof showNotification === 'function') {
        showNotification(message, !!isError);
        return;
      }
    } catch (_) { /* ignore */ }
    (isError ? console.error : console.log)('[ImageEditor]', message);
  }

  function setStatus(message) {
    const el = $('editorStatus');
    if (el) el.textContent = message || '';
  }

  function getImageFormatFromUrl(url) {
    if (!url) return null;
    const match = String(url).match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);
    if (!match) return null;
    const ext = match[1].toLowerCase();
    if (ext === 'jpg') return 'jpeg';
    if (['jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) return ext;
    return null;
  }

  function pickMime() {
    return ['jpeg', 'png', 'webp'].includes(state.format)
      ? 'image/' + state.format
      : 'image/png';
  }

  /* =========================================================
     Canvas sizing & composite
     ========================================================= */
  function computeCanvasSize(w, h) {
    const scale = Math.min(1, MAX_CANVAS_DIM / Math.max(w || 1, h || 1));
    return {
      w: Math.max(1, Math.round((w || 1) * scale)),
      h: Math.max(1, Math.round((h || 1) * scale))
    };
  }

  function ensureStrokeCanvas() {
    if (!state.strokeCanvas) {
      state.strokeCanvas = document.createElement('canvas');
      state.strokeCtx = state.strokeCanvas.getContext('2d');
    }
  }

  function setCanvasSize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));

    ensureStrokeCanvas();
    state.strokeCanvas.width = w;
    state.strokeCanvas.height = h;
    state.strokeCtx.clearRect(0, 0, w, h);

    state.drawingCanvas.width = w;
    state.drawingCanvas.height = h;

    state.cropCanvas.width = w;
    state.cropCanvas.height = h;

    state.srcW = w;
    state.srcH = h;
    state.aspect = w / h;

    composite();
  }

  function composite() {
    const { drawingCtx, drawingCanvas, strokeCanvas, texts } = state;
    if (!drawingCtx || !drawingCanvas) return;

    drawingCtx.globalCompositeOperation = 'source-over';
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawingCtx.drawImage(strokeCanvas, 0, 0);

    for (const t of texts) drawTextObject(drawingCtx, t);
  }

  function scheduleComposite() {
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(() => {
      state.rafPending = false;
      composite();
    });
  }

  /* =========================================================
     Text rendering
     ========================================================= */
  function drawTextObject(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = t.font || `${t.size}px Arial, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);

    if (t.selected) {
      const w = t.width || ctx.measureText(t.text).width;
      ctx.strokeStyle = 'rgba(47,124,246,0.95)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(t.x - 4, t.y - 4, w + 8, t.size + 8);
    }
    ctx.restore();
  }

  function hitTestText(x, y) {
    for (let i = state.texts.length - 1; i >= 0; i--) {
      const t = state.texts[i];
      const w = t.width || 0;
      const h = t.size;
      if (x >= t.x - 6 && x <= t.x + w + 6 && y >= t.y - 6 && y <= t.y + h + 6) {
        return t;
      }
    }
    return null;
  }

  function placeText(text, x, y, centered) {
    if (!state.strokeCtx) return;

    const size = Math.max(14, Math.min(96, Math.round(state.brushSize * 3)));
    const font = `${size}px Arial, sans-serif`;

    state.strokeCtx.save();
    state.strokeCtx.font = font;
    const width = state.strokeCtx.measureText(text).width;
    state.strokeCtx.restore();

    const obj = {
      text,
      x: centered ? x - width / 2 : x,
      y: centered ? y - size / 2 : y,
      color: state.brushColor,
      size,
      font,
      width,
      selected: true
    };

    state.texts.forEach(t => { t.selected = false; });
    state.texts.push(obj);

    composite();
    pushHistory();
    setStatus('Text added — drag it to reposition');
  }

  /* =========================================================
     History / undo
     ========================================================= */
  function makeSnapshot() {
    return {
      strokes: state.strokeCanvas.toDataURL('image/png'),
      texts: state.texts.map(t => ({
        text: t.text,
        x: t.x,
        y: t.y,
        color: t.color,
        size: t.size,
        font: t.font,
        width: t.width
      })),
      w: state.strokeCanvas.width,
      h: state.strokeCanvas.height
    };
  }

  function pushHistory() {
    if (!state.strokeCanvas) return;
    state.history.length = state.historyIndex + 1;   // drop redo branch
    state.history.push(makeSnapshot());
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.historyIndex = state.history.length - 1;
  }

  function restoreSnapshot(snap) {
    if (!snap || !state.strokeCtx) return;
    if (snap.w !== state.strokeCanvas.width || snap.h !== state.strokeCanvas.height) return;

    const token = ++state.restoreToken;
    const img = new Image();

    img.onload = () => {
      if (token !== state.restoreToken) return;      // stale async restore
      state.strokeCtx.clearRect(0, 0, snap.w, snap.h);
      state.strokeCtx.drawImage(img, 0, 0);
      state.texts = snap.texts.map(t => Object.assign({}, t, { selected: false }));
      composite();
    };
    img.onerror = () => { /* swallow */ };
    img.src = snap.strokes;
  }

  function undo() {
    if (state.historyIndex <= 0) { setStatus('Nothing to undo'); return; }
    state.historyIndex--;
    restoreSnapshot(state.history[state.historyIndex]);
    setStatus('');
  }

  function clearAll() {
    if (!state.strokeCtx) return;
    if (!confirm('Clear all drawings and text?')) return;

    state.strokeCtx.clearRect(0, 0, state.strokeCanvas.width, state.strokeCanvas.height);
    state.texts = [];
    composite();
    pushHistory();
    setStatus('Cleared');
  }

  /* =========================================================
     Stroke engine
     ========================================================= */
  function configureStrokeCtx() {
    const ctx = state.strokeCtx;
    const erasing = state.tool === 'eraser';

    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    ctx.strokeStyle = erasing ? 'rgba(0,0,0,1)' : state.brushColor;
    ctx.lineWidth = state.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function strokeStart(x, y) {
    configureStrokeCtx();
    const ctx = state.strokeCtx;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function strokeMove(x, y) {
    configureStrokeCtx();
    const ctx = state.strokeCtx;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  /* =========================================================
     Crop overlay
     ========================================================= */
  function clearCropOverlay() {
    if (!state.cropCtx) return;
    state.cropCtx.clearRect(0, 0, state.cropCanvas.width, state.cropCanvas.height);
  }

  function drawCropOverlay() {
    if (!state.cropCtx || !state.cropping) return;

    const ctx = state.cropCtx;
    const W = state.cropCanvas.width;
    const H = state.cropCanvas.height;
    const r = state.cropping.rect;

    ctx.clearRect(0, 0, W, H);
    if (!r || r.w <= 0 || r.h <= 0) return;

    ctx.save();

    // Dim everything outside the selection
    ctx.fillStyle = 'rgba(5,10,20,0.55)';
    ctx.fillRect(0, 0, W, r.y);
    ctx.fillRect(0, r.y + r.h, W, H - (r.y + r.h));
    ctx.fillRect(0, r.y, r.x, r.h);
    ctx.fillRect(r.x + r.w, r.y, W - (r.x + r.w), r.h);

    // Dashed border
    const lw = Math.max(1, W / 800);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = lw;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w, r.h);

    // Corner handles
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    const s = Math.max(6, W / 140);
    [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]
      .forEach(([cx, cy]) => ctx.fillRect(cx - s / 2, cy - s / 2, s, s));

    ctx.restore();
  }

  function applyCrop(rect) {
    if (!state.drawingCanvas || !state.strokeCanvas) return;

    const W = state.drawingCanvas.width;
    const H = state.drawingCanvas.height;
    const x = Math.max(0, Math.round(rect.x));
    const y = Math.max(0, Math.round(rect.y));
    const w = Math.min(W - x, Math.round(rect.w));
    const h = Math.min(H - y, Math.round(rect.h));

    if (w < 2 || h < 2) { clearCropOverlay(); setStatus(''); return; }

    // Flatten background + strokes + text into the crop region
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d');

    tctx.save();
    tctx.translate(-x, -y);
    if (state.bgImage && state.bgLoaded) {
      tctx.drawImage(state.bgImage, 0, 0, W, H);
    }
    tctx.drawImage(state.strokeCanvas, 0, 0);
    for (const t of state.texts) {
      drawTextObject(tctx, Object.assign({}, t, { selected: false }));
    }
    tctx.restore();

    let dataUrl;
    try {
      dataUrl = tmp.toDataURL('image/png');
    } catch (err) {
      console.error('Crop export blocked:', err);
      clearCropOverlay();
      setStatus('');
      notify('Cannot crop this image (cross-origin restriction).', true);
      return;
    }

    const newImg = new Image();
    newImg.onload = () => {
      state.bgImage = newImg;
      state.bgLoaded = true;
      state.bgCorsClean = true;          // data URLs are always clean
      state.bgEl.src = dataUrl;
      state.bgEl.style.display = 'block';

      state.texts = [];
      setCanvasSize(w, h);
      fitWrapper(w, h);

      // Old snapshots have the wrong dimensions — start fresh.
      state.history = [];
      state.historyIndex = -1;
      pushHistory();

      clearCropOverlay();
      setStatus(`Cropped to ${w} × ${h}`);
      setTool('brush');
    };
    newImg.onerror = () => {
      clearCropOverlay();
      setStatus('');
      notify('Crop failed while rebuilding the image.', true);
    };
    newImg.src = dataUrl;
  }

  /* =========================================================
     Wrapper sizing
     ========================================================= */
  function fitWrapper(imgW, imgH) {
    const c = state.container;
    const wrap = state.wrapper;
    if (!c || !wrap) return;

    const pad = 48; // 24px padding on each side of the container
    const availW = Math.max(160, c.clientWidth - pad);
    const availH = Math.max(160, c.clientHeight - pad);

    const scale = Math.min(availW / imgW, availH / imgH, 1);
    const w = Math.max(80, Math.round(imgW * scale));
    const h = Math.max(80, Math.round(imgH * scale));

    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    state.aspect = imgW / imgH;
  }

  function refit() {
    if (!state.bgImage || !state.bgLoaded) return;
    fitWrapper(state.bgImage.naturalWidth, state.bgImage.naturalHeight);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!state.wrapper) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refit, 120);
  });

  /* =========================================================
     Pointer interaction
     ========================================================= */
  function toCanvasPoint(e) {
    const c = state.drawingCanvas;
    const rect = c.getBoundingClientRect();
    const sx = c.width / rect.width;
    const sy = c.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy
    };
  }

  function eraseTextAt(x, y) {
    const text = hitTestText(x, y);
    if (!text) return;
    state.texts = state.texts.filter(item => item !== text);
    composite();
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!state.drawingCanvas) return;

    const pt = toCanvasPoint(e);

    state.pointerId = e.pointerId;
    try { state.wrapper.setPointerCapture(e.pointerId); } catch (_) {}

    /* ---- Crop ---- */
    if (state.tool === 'crop') {
      state.cropping = {
        startX: pt.x,
        startY: pt.y,
        rect: { x: pt.x, y: pt.y, w: 0, h: 0 }
      };
      drawCropOverlay();
      return;
    }

    /* ---- Text ---- */
    if (state.tool === 'text') {
      const hit = hitTestText(pt.x, pt.y);
      if (hit) {
        state.texts.forEach(t => { t.selected = false; });
        hit.selected = true;
        state.dragging = {
          text: hit,
          dx: pt.x - hit.x,
          dy: pt.y - hit.y,
          moved: false
        };
        composite();
        return;
      }

      const input = $('textInput');
      const value = input ? input.value.trim() : '';
      if (value) {
        placeText(value, pt.x, pt.y, false);
        if (input) input.value = '';
        return;
      }

      state.texts.forEach(t => { t.selected = false; });
      composite();
      return;
    }

    /* ---- Brush / Eraser ---- */
    if (state.tool === 'eraser') eraseTextAt(pt.x, pt.y);
    state.painting = true;
    strokeStart(pt.x, pt.y);
    scheduleComposite();
  }

  function onPointerMove(e) {
    if (!state.drawingCanvas) return;
    const pt = toCanvasPoint(e);

    if (state.cropping) {
      const c = state.cropping;
      c.rect.x = Math.min(c.startX, pt.x);
      c.rect.y = Math.min(c.startY, pt.y);
      c.rect.w = Math.abs(pt.x - c.startX);
      c.rect.h = Math.abs(pt.y - c.startY);
      drawCropOverlay();
      return;
    }

    if (state.dragging) {
      const t = state.dragging.text;
      t.x = pt.x - state.dragging.dx;
      t.y = pt.y - state.dragging.dy;
      state.dragging.moved = true;
      scheduleComposite();
      return;
    }

    if (state.painting) {
      if (state.tool === 'eraser') eraseTextAt(pt.x, pt.y);
      strokeMove(pt.x, pt.y);
      scheduleComposite();
    }
  }

  function onPointerUp(e) {
    if (state.pointerId !== null && e.pointerId !== undefined && e.pointerId !== state.pointerId) {
      return;
    }
    if (state.pointerId !== null) {
      try { state.wrapper.releasePointerCapture(state.pointerId); } catch (_) {}
    }
    state.pointerId = null;

    if (state.cropping) {
      const r = state.cropping.rect;
      state.cropping = null;
      if (r.w >= 10 && r.h >= 10) {
        applyCrop(r);
      } else {
        clearCropOverlay();
        setStatus('');
      }
      return;
    }

    if (state.dragging) {
      const moved = state.dragging.moved;
      state.dragging = null;
      if (moved) pushHistory();
      return;
    }

    if (state.painting) {
      state.painting = false;
      pushHistory();
    }
  }

  function attachPointerHandlers(el) {
    if (!el) return;
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('lostpointercapture', onPointerUp);
  }

  /* =========================================================
     Tools
     ========================================================= */
  function setTool(tool) {
    if (!['brush', 'text', 'eraser', 'crop'].includes(tool)) tool = 'brush';

    if (state.tool === 'crop' && tool !== 'crop') {
      state.cropping = null;
      clearCropOverlay();
    }

    state.tool = tool;

    $('brushTool')?.classList.toggle('active', tool === 'brush');
    $('textTool')?.classList.toggle('active', tool === 'text');
    $('eraserTool')?.classList.toggle('active', tool === 'eraser');
    $('cropTool')?.classList.toggle('active', tool === 'crop');

    const tc = $('textControls');
    if (tc) tc.style.display = tool === 'text' ? 'flex' : 'none';

    if (state.wrapper) {
      state.wrapper.style.cursor = tool === 'text' ? 'text' : 'crosshair';
    }

    if (tool !== 'text') {
      let changed = false;
      state.texts.forEach(t => {
        if (t.selected) { t.selected = false; changed = true; }
      });
      if (changed) composite();
    }

    if (tool === 'crop') {
      setStatus('Drag on the image to select a crop area');
    } else if (tool === 'text') {
      setStatus('Type below, then click the image to place');
    } else {
      setStatus('');
    }
  }

  /* =========================================================
     Image loading
     ========================================================= */
  function loadImage(url, withCors) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (withCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ img, cors: withCors });
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = url;
    });
  }

  async function loadSourceImage(url) {
    const bust = url + (url.includes('?') ? '&t=' : '?t=') + Date.now();
    setStatus('Loading image…');

    let result = null;
    try {
      result = await loadImage(bust, true);            // preferred: CORS-clean
    } catch (_) {
      try {
        result = await loadImage(bust, false);         // fallback: display only
      } catch (_) {
        result = null;
      }
    }

    if (!result) { onImageFail(); return; }

    const { img, cors } = result;
    state.bgImage = img;
    state.bgLoaded = true;
    state.bgCorsClean = cors;

    const size = computeCanvasSize(img.naturalWidth, img.naturalHeight);
    setCanvasSize(size.w, size.h);

    state.bgEl.src = img.src;
    state.bgEl.style.display = 'block';

    fitWrapper(img.naturalWidth, img.naturalHeight);

    state.history = [];
    state.historyIndex = -1;
    pushHistory();

    setTool('brush');

    if (!cors) {
      setStatus('Cross-origin image — drawing works, export may be blocked.');
    } else {
      setStatus('');
    }
  }

  function onImageFail() {
    state.bgImage = null;
    state.bgLoaded = false;
    state.bgCorsClean = true;

    if (state.bgEl) state.bgEl.style.display = 'none';
    setCanvasSize(800, 600);
    fitWrapper(800, 600);

    state.history = [];
    state.historyIndex = -1;
    pushHistory();

    setStatus('');
    notify('Image could not be loaded, but you can still draw.', false);
  }

  function initBlank() {
    if (state.bgEl) state.bgEl.style.display = 'none';
    setCanvasSize(800, 600);
    fitWrapper(800, 600);

    state.history = [];
    state.historyIndex = -1;
    pushHistory();

    setTool('brush');
    setStatus('');
  }

  /* =========================================================
     Editor build / teardown
     ========================================================= */
  function initEditor(imageUrl) {
    const container = $('toastImageEditorContainer');
    if (!container) {
      notify('Image editor container not found', true);
      return;
    }

    // Reset all per-document state
    state.container = container;
    state.sourceUrl = imageUrl || null;
    state.format = imageUrl ? (getImageFormatFromUrl(imageUrl) || 'png') : 'png';
    state.bgImage = null;
    state.bgLoaded = false;
    state.bgCorsClean = true;
    state.texts = [];
    state.history = [];
    state.historyIndex = -1;
    state.restoreToken = 0;
    state.painting = false;
    state.dragging = null;
    state.cropping = null;
    state.pointerId = null;

    // Build the three-layer stage
    container.innerHTML = `
      <div class="editor-canvas-wrapper">
        <img class="editor-background-image" alt="Image background">
        <canvas class="drawing-canvas"></canvas>
        <canvas class="crop-overlay-canvas"></canvas>
      </div>
    `;

    state.wrapper = container.querySelector('.editor-canvas-wrapper');
    state.bgEl = container.querySelector('.editor-background-image');
    state.drawingCanvas = container.querySelector('.drawing-canvas');
    state.cropCanvas = container.querySelector('.crop-overlay-canvas');

    state.drawingCtx = state.drawingCanvas.getContext('2d');
    state.cropCtx = state.cropCanvas.getContext('2d');

    ensureStrokeCanvas();
    setCanvasSize(800, 600);

    attachPointerHandlers(state.wrapper);

    if (imageUrl) {
      loadSourceImage(imageUrl);
    } else {
      initBlank();
    }
  }

  function closeEditor() {
    const modal = $('imageEditorModal');
    if (modal) modal.style.display = 'none';

    if (state.strokeCanvas) {
      state.strokeCanvas.width = 0;
      state.strokeCanvas.height = 0;
    }

    state.strokeCanvas = null;
    state.strokeCtx = null;
    state.drawingCanvas = null;
    state.drawingCtx = null;
    state.cropCanvas = null;
    state.cropCtx = null;
    state.bgImage = null;
    state.bgEl = null;
    state.wrapper = null;
    state.container = null;
    state.texts = [];
    state.history = [];
    state.historyIndex = -1;
    state.painting = false;
    state.dragging = null;
    state.cropping = null;
    state.pointerId = null;
    state.restoreToken++;

    const container = $('toastImageEditorContainer');
    if (container) container.innerHTML = '';
  }

  /* =========================================================
     Saving
     ========================================================= */
  async function saveImage() {
    const btn = $('saveImageEdit');

    if (!state.drawingCanvas) {
      notify('Image editor is still loading, please wait.', true);
      return;
    }
    if (state.bgLoaded && !state.bgCorsClean) {
      notify('This image can\'t be exported because it was loaded from another origin.', true);
      return;
    }

    if (btn) btn.disabled = true;
    setStatus('Saving image…');

    try {
      const W = state.drawingCanvas.width;
      const H = state.drawingCanvas.height;

      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const octx = out.getContext('2d');

      if (state.bgImage && state.bgLoaded) {
        octx.drawImage(state.bgImage, 0, 0, W, H);
      } else {
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, W, H);
      }

      octx.drawImage(state.strokeCanvas, 0, 0);
      for (const t of state.texts) {
        drawTextObject(octx, Object.assign({}, t, { selected: false }));
      }

      const mime = pickMime();
      let dataUrl;
      try {
        dataUrl = out.toDataURL(mime, mime === 'image/jpeg' ? 0.92 : 1);
      } catch (err) {
        throw new Error('Canvas export blocked (cross-origin image).');
      }

      const blob = await (await fetch(dataUrl)).blob();
      const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
      const file = new File([blob], `edited_image_${Date.now()}.${ext}`, { type: mime });

      /* These globals live in login.js */
      const result = await uploadToCloudinary(file);
      const imageUrl = result && (result.secure_url || result.url);
      if (!imageUrl) throw new Error('Upload returned no URL');

      const timestamp = Date.now();
      const message = {
        id: `msg_${timestamp}_${userId}`,
        name: username,
        userId: userId,
        text: 'Edited image',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: timestamp,
        channel: userChannel,
        mediaType: 'image',
        mediaUrl: imageUrl
      };

      await db.ref('chat').push(message);

      notify('Edited image sent!');
      setStatus('Saved');
      closeEditor();
    } catch (error) {
      console.error('Error saving edited image:', error);
      setStatus('Save failed');
      notify('Failed to save image: ' + error.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* =========================================================
     Public API
     ========================================================= */
  let handlersBound = false;

  function initializeImageEditor() {
    if (handlersBound) return;
    handlersBound = true;

    const modal = $('imageEditorModal');
    if (!modal) {
      console.warn('Image editor modal not present in DOM');
      return;
    }

    $('cancelImageEdit')?.addEventListener('click', closeEditor);
    $('saveImageEdit')?.addEventListener('click', saveImage);

    $('brushTool')?.addEventListener('click', () => setTool('brush'));
    $('textTool')?.addEventListener('click', () => setTool('text'));
    $('eraserTool')?.addEventListener('click', () => setTool('eraser'));
    $('cropTool')?.addEventListener('click', () => {
      setTool(state.tool === 'crop' ? 'brush' : 'crop');
    });

    const colorInput = $('brushColor');
    const sizeInput = $('brushSize');

    if (colorInput) {
      state.brushColor = colorInput.value || '#ff0000';
      colorInput.addEventListener('input', () => {
        state.brushColor = colorInput.value || '#ff0000';
      });
    }
    if (sizeInput) {
      state.brushSize = parseInt(sizeInput.value, 10) || 5;
      sizeInput.addEventListener('input', () => {
        state.brushSize = Math.max(1, parseInt(sizeInput.value, 10) || 5);
      });
    }

    $('undoEdit')?.addEventListener('click', undo);
    $('clearEdit')?.addEventListener('click', clearAll);

    const addTextBtn = $('addTextBtn');
    const textInput = $('textInput');

    addTextBtn?.addEventListener('click', () => {
      if (!state.drawingCanvas) return;
      const value = (textInput ? textInput.value : '').trim();
      if (!value) {
        textInput?.focus();
        return;
      }
      const W = state.drawingCanvas.width;
      const H = state.drawingCanvas.height;
      placeText(value, W / 2, H / 2, true);
      if (textInput) textInput.value = '';
      setTool('text');
      textInput?.focus();
    });

    textInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTextBtn?.click();
      }
    });

    // Keyboard shortcuts (only while the editor is visible)
    document.addEventListener('keydown', (e) => {
      if (!modal || modal.style.display === '' || modal.style.display === 'none') return;
      const tag = (e.target && e.target.tagName ? e.target.tagName : '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape') {
        if (state.cropping) {
          state.cropping = null;
          clearCropOverlay();
          setStatus('');
        }
      }
    });
  }

  function openImageEditor(imageUrl) {
    initializeImageEditor();

    const modal = $('imageEditorModal');
    if (!modal) return;

    modal.style.display = 'flex';

    // Let the modal lay out before measuring the container for fitWrapper()
    requestAnimationFrame(() => initEditor(imageUrl));
  }

  window.ImageEditor = {
    initialize: initializeImageEditor,
    open: openImageEditor
  };
})();