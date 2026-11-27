/* =========================================================
   video-editor.js — full rewrite
   - Rebuilds the modal UI via JS (login.html stays untouched)
   - CapCut-style dual-handle trim timeline with tap-to-seek
   - Real playback preview of the selected range
   - Working FFmpeg trim + mute, with progress + Cancel
   - Uploads to Cloudinary with real progress
   ========================================================= */
(function () {
  'use strict';

  /* ---------- CDN constants ---------- */
  const FFMPEG_UMD    = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js';
  const FFMPEG_WORKER = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js';
  const FFMPEG_CORE   = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js';
  const FFMPEG_WASM   = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm';
  const CLOUD_NAME    = 'dbjmbf92h';
  const UPLOAD_PRESET = 'chat_upload';
  const MIN_TRIM      = 0.1; // seconds

  /* ---------- state ---------- */
  const s = {
    bound: false,
    els: {},
    videoUrl: null,
    videoBlob: null,
    duration: 0,
    currentTime: 0,
    trimStart: 0,
    trimEnd: 0,
    muted: true,
    playing: false,
    dragging: null,          // 'left' | 'right' | 'seek' | null
    pendingTimelinePointer: null,
    timelineFrame: null,
    previewEnd: null,        // when preview button was pressed
    onSave: null,
    exporting: false,
    ffmpeg: null,
    ffmpegLoading: null
  };

  /* ---------- small utilities ---------- */
  const $ = (id) => document.getElementById(id);

  function notify(msg, isErr) {
    if (typeof showNotification === 'function') {
      try { showNotification(msg, !!isErr); return; } catch (_) {}
    }
    (isErr ? console.error : console.log)('[VideoEditor]', msg);
  }

  function fmt(t) {
    t = Math.max(0, Number(t) || 0);
    const m = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + url + '"]')) return resolve();
      const el = document.createElement('script');
      el.src = url;
      el.async = true;
      el.onload = resolve;
      el.onerror = () => reject(new Error('Failed to load ' + url));
      document.head.appendChild(el);
    });
  }

  async function fetchBlobURL(url, contentType) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch FFmpeg asset (' + response.status + '): ' + url);
    }
    return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: contentType }));
  }

  /* =========================================================
     BUILD THE UI (injected into the existing modal shell)
     ========================================================= */
  const ICONS = {
    close:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    send:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    play:    '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    preview: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    mute:    '<svg class="ve-ic-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg><svg class="ve-ic-on" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
    reset:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
  };

  function buildUI() {
    const modal = $('videoEditorModal');
    if (!modal) { console.error('[VideoEditor] #videoEditorModal missing'); return false; }

    modal.innerHTML = `
      <div class="ve-shell">
        <header class="ve-header">
          <button class="ve-icon-btn" id="veClose" type="button" aria-label="Close">
            ${ICONS.close}
          </button>
          <div class="ve-title-wrap">
            <div class="ve-title" id="videoEditorTitle">Edit Video</div>
            <div class="ve-subtitle" id="veSubtitle">Loading…</div>
          </div>
          <button class="ve-primary-btn" id="veExport" type="button">
            ${ICONS.send}<span>Send</span>
          </button>
        </header>

        <div class="ve-stage" id="veStage">
          <video id="vePlayer" playsinline preload="metadata"></video>
          <button class="ve-bigplay" id="veBigPlay" type="button" aria-label="Play">
            ${ICONS.play}
          </button>
          <div class="ve-overlay-time" id="veOverlayTime">0:00</div>
        </div>

        <div class="ve-controls">
          <div class="ve-timeline" id="veTimeline">
            <div class="ve-timeline-inner" id="veTimelineInner">
              <div class="ve-track-bg"></div>
              <div class="ve-track-selection" id="veSelection"></div>
              <div class="ve-playhead" id="vePlayhead"></div>
              <button class="ve-handle ve-handle-left" id="veHandleLeft" type="button" aria-label="Trim start">
                <span></span>
              </button>
              <button class="ve-handle ve-handle-right" id="veHandleRight" type="button" aria-label="Trim end">
                <span></span>
              </button>
            </div>
          </div>

          <div class="ve-times">
            <span class="ve-time" id="veStartLabel">0:00</span>
            <span class="ve-time ve-time-mid" id="veMidLabel">Selected 0:00</span>
            <span class="ve-time" id="veEndLabel">0:00</span>
          </div>

          <div class="ve-actions">
            <button class="ve-action-btn" id="vePreviewBtn" type="button">
              ${ICONS.preview}<span>Preview</span>
            </button>
            <button class="ve-action-btn" id="veMuteBtn" type="button">
              ${ICONS.mute}<span>Muted</span>
            </button>
            <button class="ve-action-btn" id="veResetBtn" type="button">
              ${ICONS.reset}<span>Reset</span>
            </button>
          </div>
        </div>

        <div class="ve-progress-overlay" id="veProgressOverlay">
          <div class="ve-progress-card">
            <div class="ve-spinner"></div>
            <div class="ve-progress-title" id="veProgressTitle">Processing…</div>
            <div class="ve-progress-sub" id="veProgressSub">Please wait</div>
            <div class="ve-progress-bar"><div id="veProgressFill"></div></div>
          </div>
        </div>
      </div>
    `;

    const e = s.els;
    e.modal           = modal;
    e.player          = $('vePlayer');
    e.stage           = $('veStage');
    e.bigPlay         = $('veBigPlay');
    e.overlayTime     = $('veOverlayTime');
    e.subtitle        = $('veSubtitle');
    e.timeline        = $('veTimeline');
    e.timelineInner   = $('veTimelineInner');
    e.selection       = $('veSelection');
    e.playhead        = $('vePlayhead');
    e.handleLeft      = $('veHandleLeft');
    e.handleRight     = $('veHandleRight');
    e.startLabel      = $('veStartLabel');
    e.midLabel        = $('veMidLabel');
    e.endLabel        = $('veEndLabel');
    e.previewBtn      = $('vePreviewBtn');
    e.muteBtn         = $('veMuteBtn');
    e.resetBtn        = $('veResetBtn');
    e.closeBtn        = $('veClose');
    e.exportBtn       = $('veExport');
    e.progressOverlay = $('veProgressOverlay');
    e.progressTitle   = $('veProgressTitle');
    e.progressSub     = $('veProgressSub');
    e.progressFill    = $('veProgressFill');

    return true;
  }

  /* =========================================================
     TIMELINE / PLAYER SYNC
     ========================================================= */
  function refreshTimeline() {
    const d = s.duration || 1;
    const leftPct  = (s.trimStart / d) * 100;
    const rightPct = (s.trimEnd   / d) * 100;
    const playPct  = (s.currentTime / d) * 100;

    s.els.selection.style.left  = leftPct + '%';
    s.els.selection.style.width = Math.max(0, rightPct - leftPct) + '%';
    s.els.handleLeft.style.left  = leftPct + '%';
    s.els.handleRight.style.left = rightPct + '%';
    s.els.playhead.style.left    = Math.min(100, Math.max(0, playPct)) + '%';

    s.els.startLabel.textContent = fmt(s.trimStart);
    s.els.endLabel.textContent   = fmt(s.trimEnd);
    s.els.midLabel.textContent   = 'Selected ' + fmt(s.trimEnd - s.trimStart);
  }

  function refreshOverlayTime() {
    s.els.overlayTime.textContent = fmt(s.currentTime) + ' / ' + fmt(s.duration);
  }

  function setTrimStart(t) {
    s.trimStart = Math.max(0, Math.min(s.trimEnd - MIN_TRIM, t));
    if (s.els.player.currentTime < s.trimStart) {
      s.els.player.currentTime = s.trimStart;
      s.currentTime = s.trimStart;
    }
    refreshTimeline();
    refreshOverlayTime();
  }

  function setTrimEnd(t) {
    s.trimEnd = Math.max(s.trimStart + MIN_TRIM, Math.min(s.duration || t, t));
    if (s.els.player.currentTime > s.trimEnd) {
      s.els.player.currentTime = s.trimEnd;
      s.currentTime = s.trimEnd;
    }
    refreshTimeline();
    refreshOverlayTime();
  }

  function seekTo(t) {
    const clamped = Math.max(0, Math.min(s.duration || t, t));
    s.els.player.currentTime = clamped;
    s.currentTime = clamped;
    refreshTimeline();
    refreshOverlayTime();
  }

  /* ---- pointer events on the timeline ---- */
  function onTimelineDown(e) {
    if (s.exporting) return;
    e.preventDefault();

    const target = e.target;
    let mode = 'seek';
    if (target.closest && target.closest('.ve-handle-left'))  mode = 'left';
    else if (target.closest && target.closest('.ve-handle-right')) mode = 'right';

    s.dragging = mode;
    try { s.els.timelineInner.setPointerCapture(e.pointerId); } catch (_) {}

    if (mode !== 'seek' && !s.els.player.paused) s.els.player.pause();
    handleTimelinePointer(e);
  }

  function onTimelineMove(e) {
    if (!s.dragging) return;
    e.preventDefault();
    s.pendingTimelinePointer = e;
    if (s.timelineFrame === null) {
      s.timelineFrame = requestAnimationFrame(() => {
        s.timelineFrame = null;
        const pointerEvent = s.pendingTimelinePointer;
        s.pendingTimelinePointer = null;
        if (pointerEvent && s.dragging) handleTimelinePointer(pointerEvent);
      });
    }
  }

  function onTimelineUp(e) {
    if (!s.dragging) return;
    if (s.timelineFrame !== null) {
      cancelAnimationFrame(s.timelineFrame);
      s.timelineFrame = null;
    }
    s.pendingTimelinePointer = null;
    handleTimelinePointer(e);
    s.dragging = null;
    try { s.els.timelineInner.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  function handleTimelinePointer(e) {
    const rect = s.els.timelineInner.getBoundingClientRect();
    if (!rect.width || !s.duration) return;
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const t = (x / rect.width) * s.duration;

    if (s.dragging === 'left')      setTrimStart(t);
    else if (s.dragging === 'right') setTrimEnd(t);
    else                             seekTo(t);
  }

  /* =========================================================
     PLAYBACK CONTROLS
     ========================================================= */
  function togglePlay() {
    if (s.exporting || !s.duration) return;
    const p = s.els.player;

    if (p.paused) {
      if (s.currentTime >= s.trimEnd - 0.05 || s.currentTime < s.trimStart) {
        p.currentTime = s.trimStart;
        s.currentTime = s.trimStart;
      }
      s.previewEnd = null;
      p.play().catch(() => {});
    } else {
      p.pause();
    }
  }

  function previewSelection() {
    if (s.exporting || !s.duration) return;
    if (s.trimEnd - s.trimStart < MIN_TRIM) {
      notify('Select at least ' + MIN_TRIM + 's to preview', true);
      return;
    }
    const p = s.els.player;
    p.currentTime = s.trimStart;
    s.currentTime = s.trimStart;
    s.previewEnd = s.trimEnd;
    p.play().catch(() => {});
  }

  function toggleMute() {
    s.muted = !s.muted;
    s.els.player.muted = s.muted;
    refreshMuteUI();
  }

  function refreshMuteUI() {
    const btn = s.els.muteBtn;
    btn.classList.toggle('is-on', !s.muted);
    btn.querySelector('span').textContent = s.muted ? 'Muted' : 'Audio on';
  }

  function resetTrim() {
    if (!s.duration) return;
    s.trimStart = 0;
    s.trimEnd = s.duration;
    refreshTimeline();
    refreshOverlayTime();
  }

  /* ---- video events ---- */
  function onTimeUpdate() {
    s.currentTime = s.els.player.currentTime;

    if (!s.els.player.paused) {
      const stopAt = s.previewEnd != null ? s.previewEnd : s.trimEnd;
      if (s.currentTime >= stopAt - 0.05) {
        s.els.player.pause();
        s.currentTime = stopAt;
        s.els.player.currentTime = stopAt;
        s.previewEnd = null;
      }
    }

    refreshTimeline();
    refreshOverlayTime();
  }

  /* =========================================================
     FFmpeg
     ========================================================= */
  function loadFFmpeg() {
    if (s.ffmpeg) return Promise.resolve(s.ffmpeg);
    if (s.ffmpegLoading) return s.ffmpegLoading;

    s.ffmpegLoading = (async () => {
      if (!window.FFmpegWASM) await loadScript(FFMPEG_UMD);
      const lib = window.FFmpegWASM;
      if (!lib || typeof lib.FFmpeg !== 'function') {
        throw new Error('FFmpeg module failed to initialize');
      }
      const ff = new lib.FFmpeg();
      const assetUrls = [];
      try {
        const classWorkerURL = await fetchBlobURL(FFMPEG_WORKER, 'text/javascript');
        assetUrls.push(classWorkerURL);
        const coreURL = await fetchBlobURL(FFMPEG_CORE, 'text/javascript');
        assetUrls.push(coreURL);
        const wasmURL = await fetchBlobURL(FFMPEG_WASM, 'application/wasm');
        assetUrls.push(wasmURL);

        await ff.load({ classWorkerURL, coreURL, wasmURL });
        s.ffmpeg = ff;
        return ff;
      } finally {
        assetUrls.forEach((url) => URL.revokeObjectURL(url));
      }
    })();

    return s.ffmpegLoading.catch((err) => {
      s.ffmpegLoading = null;
      s.ffmpeg = null;
      throw err;
    });
  }

  /* =========================================================
     PROGRESS OVERLAY
     ========================================================= */
  function showProgress(title, sub, ratio) {
    const e = s.els;
    e.progressTitle.textContent = title || 'Processing…';
    e.progressSub.textContent   = sub   || 'Please wait';
    e.progressFill.style.width  = Math.round((ratio || 0) * 100) + '%';
    e.progressOverlay.classList.add('visible');
  }
  function updateProgress(ratio) {
    s.els.progressFill.style.width = Math.round((ratio || 0) * 100) + '%';
  }
  function hideProgress() {
    s.els.progressOverlay.classList.remove('visible');
    s.els.progressFill.style.width = '0%';
  }

  /* =========================================================
     CLOUDINARY UPLOAD (with progress)
     ========================================================= */
  function uploadVideo(blob, onProgress) {
    if (typeof window.uploadToCloudinary === 'function') {
      const file = blob instanceof File
        ? blob
        : new File([blob], 'edited_video_' + Date.now() + '.mp4', { type: blob.type || 'video/mp4' });
      return window.uploadToCloudinary(file, (percent) => onProgress(percent / 100));
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', blob, 'video_' + Date.now() + '.mp4');
      form.append('upload_preset', UPLOAD_PRESET);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data);
        else reject(new Error((data && data.error && data.error.message) || ('HTTP ' + xhr.status)));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/video/upload');
      xhr.send(form);
    });
  }

  /* =========================================================
     EXPORT
     ========================================================= */
  async function exportVideo() {
    if (s.exporting) return;

    if (!s.videoUrl && !s.videoBlob) {
      notify('No video loaded', true);
      return;
    }
    if (!s.duration) {
      notify('Video is still loading', true);
      return;
    }
    if (s.trimEnd - s.trimStart < MIN_TRIM) {
      notify('Selection must be at least ' + MIN_TRIM + 's', true);
      return;
    }

    const start = s.trimStart;
    const end   = s.trimEnd;
    const dur   = end - start;
    const needsTrim   = start > 0.05 || end < s.duration - 0.05;
    const needsMute   = s.muted;
    const needsProcess = needsTrim || needsMute;

    setBusy(true);
    showProgress('Preparing…', 'Getting video ready', 0);

    try {
      /* 1. fetch bytes */
      let sourceBlob = s.videoBlob;
      if (!sourceBlob) {
        showProgress('Downloading…', 'Fetching source video', 0);
        const resp = await fetch(s.videoUrl);
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' while downloading');
        sourceBlob = await resp.blob();
        s.videoBlob = sourceBlob;
      }

      let finalBlob = sourceBlob;
      let label     = s.muted ? 'Muted video' : 'Video';

      /* 2. process with FFmpeg if needed */
      if (needsProcess) {
        showProgress('Loading processor…', 'First use may take a moment', 0);
        const ff = await loadFFmpeg();

        const inName  = 've_input_' + Date.now() + '.mp4';
        const outName = 've_output_' + Date.now() + '.mp4';

        showProgress('Preparing trim…', 'Reading video', 0);
        const bytes = new Uint8Array(await sourceBlob.arrayBuffer());
        await ff.writeFile(inName, bytes);

        const baseArgs = ['-ss', String(start), '-i', inName, '-t', String(dur)];
        if (s.muted) baseArgs.push('-an');

        let lastPct = 0;
        const onProg = (ev) => {
          const p = Math.min(0.92, Math.max(lastPct, ev && typeof ev.progress === 'number' ? ev.progress : 0));
          lastPct = p;
          updateProgress(p);
          showProgress('Trimming video…', Math.round(p * 100) + '%', p);
        };

        try { ff.on('progress', onProg); } catch (_) {}

        try {
          // Fast copy first
          let ok = true;
          try {
            const code = await ff.exec(baseArgs.concat(['-c', 'copy', outName]));
            if (typeof code === 'number' && code !== 0) ok = false;
          } catch (_) { ok = false; }

          if (!ok) {
            // Fallback: re-encode
            showProgress('Re-encoding…', 'Fast trim failed, using safe encoder', lastPct);
            await ff.exec(baseArgs.concat([
              '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac', '-b:a', '128k',
              outName
            ]));
          }
        } finally {
          try { ff.off('progress', onProg); } catch (_) {}
        }

        const data = await ff.readFile(outName);
        const arr  = data instanceof Uint8Array ? data : new Uint8Array(data);
        if (!arr.byteLength) throw new Error('FFmpeg produced empty output');

        const copy = new Uint8Array(arr.byteLength);
        copy.set(arr);
        finalBlob = new Blob([copy.buffer], { type: 'video/mp4' });
        label     = s.muted ? 'Trimmed & muted video' : 'Trimmed video';

        await ff.deleteFile(inName).catch(() => {});
        await ff.deleteFile(outName).catch(() => {});
      }

      if (s.onSave) {
        const file = new File(
          [finalBlob],
          `edited_video_${Date.now()}.mp4`,
          { type: finalBlob.type || 'video/mp4' }
        );
        await s.onSave(file);
        notify('Edited video ready to send.');
        setBusy(false);
        closeEditor();
        return;
      }

      /* 3. upload */
      showProgress('Uploading…', '0%', 0);
      const result = await uploadVideo(finalBlob, (p) => {
        showProgress('Uploading…', Math.round(p * 100) + '%', p);
      });

      const url = result.secure_url || result.url;
      if (!url) throw new Error('Cloudinary returned no URL');

      /* 4. send message */
      const timestamp = Date.now();
      const message = {
        id: 'msg_' + timestamp + '_' + (typeof userId !== 'undefined' ? userId : 'anon'),
        name: typeof username !== 'undefined' ? username : 'User',
        userId: typeof userId !== 'undefined' ? userId : '',
        text: label,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: timestamp,
        channel: typeof userChannel !== 'undefined' ? userChannel : 'general',
        mediaType: 'video',
        mediaUrl: url
      };
      await db.ref('chat').push(message);

      notify(label + ' sent!');
      closeEditor();
    } catch (err) {
      console.error('[VideoEditor] export failed:', err);
      notify('Export failed: ' + (err && err.message ? err.message : 'unknown error'), true);
    } finally {
      hideProgress();
      setBusy(false);
    }
  }

  function setBusy(busy) {
    s.exporting = busy;
    const e = s.els;
    ['exportBtn', 'closeBtn', 'previewBtn', 'muteBtn', 'resetBtn'].forEach((k) => {
      if (e[k]) e[k].disabled = busy;
    });
    e.modal.classList.toggle('is-busy', busy);
  }

  /* =========================================================
     OPEN / CLOSE
     ========================================================= */
  function openEditor(videoUrl, optionalFile, options = {}) {
    initOnce();
    if (!s.els.modal) return;

    s.videoUrl   = videoUrl || null;
    s.videoBlob  = optionalFile || null;
    s.onSave     = typeof options.onSave === 'function' ? options.onSave : null;
    s.duration   = 0;
    s.currentTime = 0;
    s.trimStart  = 0;
    s.trimEnd    = 0;
    s.previewEnd = null;
    s.muted      = true;
    s.els.player.muted = true;

    s.els.player.pause();
    s.els.player.removeAttribute('src');
    s.els.player.load();

    s.els.subtitle.textContent = 'Loading…';
    refreshMuteUI();
    refreshTimeline();
    refreshOverlayTime();

    s.els.player.onloadedmetadata = () => {
      s.duration = Number.isFinite(s.els.player.duration) ? s.els.player.duration : 0;
      s.trimEnd  = s.duration;
      s.els.subtitle.textContent = 'Duration ' + fmt(s.duration);
      refreshTimeline();
      refreshOverlayTime();

      // Pre-fetch in background so Send is fast
      if (!s.videoBlob && s.videoUrl) {
        fetch(s.videoUrl)
          .then((r) => (r.ok ? r.blob() : null))
          .then((b) => { if (b) s.videoBlob = b; })
          .catch(() => {});
      }
    };
    s.els.player.onerror = () => {
      s.els.subtitle.textContent = 'Failed to load';
      notify('Could not load this video', true);
    };

    s.els.modal.hidden = false;
    s.els.modal.style.display = 'flex';
    s.els.player.src = videoUrl || '';
    s.els.player.load();
  }

  function closeEditor() {
    if (s.exporting) return;
    const e = s.els;
    if (!e.modal) return;

    if (s.timelineFrame !== null) {
      cancelAnimationFrame(s.timelineFrame);
      s.timelineFrame = null;
    }
    s.pendingTimelinePointer = null;
    s.dragging = null;

    if (e.player) {
      e.player.pause();
      e.player.removeAttribute('src');
      e.player.load();
    }
    e.modal.style.display = 'none';
    e.modal.hidden = true;

    s.videoUrl  = null;
    s.videoBlob = null;
    s.onSave = null;
    s.duration  = 0;
    s.currentTime = 0;
    s.trimStart = 0;
    s.trimEnd   = 0;
    s.previewEnd = null;
  }

  /* =========================================================
     INIT / BINDINGS
     ========================================================= */
  function initOnce() {
    if (s.bound) return;
    if (!buildUI()) return;
    s.bound = true;

    const e = s.els;

    e.closeBtn.addEventListener('click', closeEditor);
    e.exportBtn.addEventListener('click', exportVideo);
    e.bigPlay.addEventListener('click', (ev) => { ev.stopPropagation(); togglePlay(); });
    e.stage.addEventListener('click', (ev) => {
      if (ev.target === e.stage || ev.target === e.player) togglePlay();
    });
    e.previewBtn.addEventListener('click', previewSelection);
    e.muteBtn.addEventListener('click', toggleMute);
    e.resetBtn.addEventListener('click', resetTrim);

    // Timeline pointer events
    e.timelineInner.addEventListener('pointerdown', onTimelineDown);
    e.timelineInner.addEventListener('pointermove', onTimelineMove);
    e.timelineInner.addEventListener('pointerup', onTimelineUp);
    e.timelineInner.addEventListener('pointercancel', onTimelineUp);

    // Video events
    e.player.addEventListener('timeupdate', onTimeUpdate);
    e.player.addEventListener('play', () => {
      e.bigPlay.classList.add('is-hidden');
      s.playing = true;
    });
    e.player.addEventListener('pause', () => {
      e.bigPlay.classList.remove('is-hidden');
      s.playing = false;
    });
    e.player.addEventListener('loadedmetadata', () => {
      // extra safety for browsers that fire timeupdate before metadata
      if (!s.duration && Number.isFinite(e.player.duration)) {
        s.duration = e.player.duration;
        s.trimEnd = s.duration;
        refreshTimeline();
        refreshOverlayTime();
      }
    });

    // Keyboard
    document.addEventListener('keydown', (ev) => {
      if (e.modal.style.display === 'none') return;
      if (s.exporting) return;
      const tag = (ev.target && ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (ev.key === 'Escape') closeEditor();
      else if (ev.key === ' ') { ev.preventDefault(); togglePlay(); }
    });
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */
  window.VideoEditor = {
    initialize: initOnce,
    open: openEditor,
    close: closeEditor
  };
})();