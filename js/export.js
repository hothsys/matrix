// ═══════════════════════════════════════
// VIDEO EXPORT
// ═══════════════════════════════════════

let _exporting = false;
let _exportMediaRecorder = null;
let _exportChunks = [];
let _exportCanvas = null;
let _exportCtx = null;
let _exportFrameId = null;
let _exportFade = 0;       // 0 = no fade, 0-1 = fade-to-black, 1 = full black
let _exportShowPhoto = false;
let _exportPhotoImg = null; // preloaded Image for current lightbox photo

function exportUpdateProgress(text, pct) {
  document.getElementById('export-progress').textContent = text;
  document.getElementById('export-bar').style.width = pct + '%';
}

function drawExportFrame() {
  if (!_exporting) return;
  const mapCanvas = map.getCanvas();
  const w = _exportCanvas.width, h = _exportCanvas.height;

  if (_exportShowPhoto && _exportPhotoImg && _exportPhotoImg.complete && _exportPhotoImg.naturalWidth) {
    // Photo mode: dark bg + photo + caption
    _exportCtx.fillStyle = '#000';
    _exportCtx.fillRect(0, 0, w, h);
    // Draw a subtle map underneath at low opacity
    _exportCtx.globalAlpha = 0.12;
    _exportCtx.drawImage(mapCanvas, 0, 0, w, h);
    _exportCtx.globalAlpha = 1;

    const img = _exportPhotoImg;
    const maxW = w * 0.80, maxH = h * 0.75;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2 - 20;
    // Rounded corners
    const r = 10;
    _exportCtx.save();
    _exportCtx.beginPath();
    _exportCtx.roundRect(dx, dy, dw, dh, r);
    _exportCtx.clip();
    _exportCtx.drawImage(img, dx, dy, dw, dh);
    _exportCtx.restore();

    // Caption
    const cap = document.getElementById('lb-caption').textContent;
    if (cap) {
      _exportCtx.font = '500 ' + Math.round(h * 0.024) + 'px "DM Sans", sans-serif';
      _exportCtx.fillStyle = 'rgba(255,255,255,0.85)';
      _exportCtx.textAlign = 'center';
      _exportCtx.fillText(cap, w / 2, h * 0.93);
    }
  } else {
    // Map mode
    _exportCtx.drawImage(mapCanvas, 0, 0, w, h);
  }

  // Fade overlay (used for transitions)
  if (_exportFade > 0) {
    _exportCtx.fillStyle = `rgba(0,0,0,${_exportFade})`;
    _exportCtx.fillRect(0, 0, w, h);
  }

  _exportFrameId = requestAnimationFrame(drawExportFrame);
}

// Animate fade over durationMs, from startVal to endVal
function exportAnimateFade(startVal, endVal, durationMs) {
  return new Promise(resolve => {
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / durationMs, 1);
      // Smooth ease in-out
      const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
      _exportFade = startVal + (endVal - startVal) * ease;
      if (t < 1) requestAnimationFrame(step);
      else { _exportFade = endVal; resolve(); }
    }
    requestAnimationFrame(step);
  });
}

// Preload a photo for export compositing
function exportPreloadPhoto(photoId) {
  return new Promise(resolve => {
    const p = photoMap.get(photoId);
    if (!p) { resolve(); return; }
    const img = new Image();
    img.onload = () => { _exportPhotoImg = img; resolve(); };
    img.onerror = () => resolve();
    img.src = p.dataUrl;
  });
}

async function exportVideo() {
  if (_exporting || _playbackActive) return;
  if (_mapStyle === 'globe') { showToast('Export Video is not available in Globe mode', 'error'); return; }

  // Build stops (same logic as startPlayback)
  const dated = photos.filter(p => p.lat !== null && p.date)
    .sort((a, b) => photoSortKey(a) < photoSortKey(b) ? -1 : 1);

  if (dated.length < 2) {
    showToast('Need at least 2 dated pinned photos to export', 'error');
    return;
  }

  const stops = [];
  const seen = new Set();
  for (const p of dated) {
    const k = locKey(p);
    if (seen.has(k)) {
      stops.find(s => s.key === k).photoIds.push(p.id);
    } else {
      seen.add(k);
      stops.push({ key: k, lat: p.lat, lng: p.lng, photoIds: [p.id] });
    }
  }

  // Show overlay
  _exporting = true;
  document.getElementById('export-overlay').classList.add('open');
  exportUpdateProgress('Pre-caching map tiles…', 0);

  // Close any open popups
  if (activePopup) { activePopup.remove(); activePopup = null; }

  // Verify preserveDrawingBuffer is active — required to copy map canvas to export canvas
  const gl = map.getCanvas().getContext('webgl2') || map.getCanvas().getContext('webgl');
  if (gl && !gl.getContextAttributes()?.preserveDrawingBuffer) {
    showToast('Video export requires preserveDrawingBuffer — check map initialization', 'error');
    return;
  }

  // Helper: wait until map is fully rendered (tiles decoded + GPU flushed)
  async function waitForMapReady(timeoutMs = 8000) {
    await new Promise(resolve => {
      if (map.loaded() && map.areTilesLoaded() && map.isStyleLoaded()) {
        resolve(); return;
      }
      let done = false;
      const finish = () => { if (!done) { done = true; map.off('idle', finish); resolve(); } };
      map.on('idle', finish);
      setTimeout(finish, timeoutMs);
    });
    // Wait 2 animation frames for GPU to flush
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  // Background-fetch all export tiles in parallel via SW cache
  let bgFetchDone = false;
  const bgFetchPromise = (async () => {
    try {
      const templates = await getTileTemplates();
      if (templates.length) {
        const exportTileUrls = buildTileUrls(templates, stops, [12, 14], z => 2);
        // Also add world view tiles (z0-3)
        for (const tmpl of templates) {
          for (let z = 0; z <= 3; z++) {
            const max = 1 << z;
            for (let x = 0; x < max; x++) {
              for (let y = 0; y < max; y++) {
                exportTileUrls.push(tmpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
              }
            }
          }
        }
        const BATCH = 2;
        for (let i = 0; i < exportTileUrls.length; i += BATCH) {
          if (!_exporting) break;
          const batch = exportTileUrls.slice(i, i + BATCH);
          await Promise.all(batch.map(url => fetchTile(url).catch(() => {})));
          await new Promise(r => setTimeout(r, 100));
        }
      }
    } catch {}
    bgFetchDone = true;
  })();

  // Pre-cache: visit each destination at zoom 12 and 14 so tiles are decoded and ready
  // Start with world view
  exportUpdateProgress('Pre-caching world view…', 2);
  map.jumpTo({ center: [0, 20], zoom: 1.8 });
  await waitForMapReady();

  for (let i = 0; i < stops.length; i++) {
    if (!_exporting) break;
    exportUpdateProgress(`Pre-caching tiles — destination ${i + 1} of ${stops.length}`, Math.round(((i + 1) / stops.length) * 28));
    map.jumpTo({ center: [stops[i].lng, stops[i].lat], zoom: 12 });
    await waitForMapReady();
    map.jumpTo({ center: [stops[i].lng, stops[i].lat], zoom: 14 });
    await waitForMapReady();
  }

  // Wait for background tile fetching to complete
  if (!bgFetchDone) {
    exportUpdateProgress('Finishing tile cache…', 29);
    await bgFetchPromise;
  }

  if (!_exporting) { exportCleanup(); return; }

  // Reset map to world view before starting
  map.jumpTo({ center: [0, 20], zoom: 1.8 });
  await waitForMapReady();

  exportUpdateProgress('Starting recording…', 30);

  // Create recording canvas sized to map
  const mapCanvas = map.getCanvas();
  _exportCanvas = document.createElement('canvas');
  _exportCanvas.width = mapCanvas.width;
  _exportCanvas.height = mapCanvas.height;
  _exportCtx = _exportCanvas.getContext('2d');

  // Setup MediaRecorder
  const stream = _exportCanvas.captureStream(30);
  const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  let mime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  // Start a disk-streaming session — chunks written directly to disk, not held in memory
  _exportChunks = [];
  let _videoSessionId = null;
  let _chunkQueue = Promise.resolve();
  const startResp = await fetch('/api/video/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mime })
  });
  if (startResp.ok) {
    const startData = await startResp.json();
    _videoSessionId = startData.id;
  }

  _exportMediaRecorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 40000000 });
  _exportMediaRecorder.ondataavailable = (e) => {
    if (!e.data.size) return;
    if (_videoSessionId) {
      // Stream chunk to disk (fire-and-forget, queued to maintain order)
      const blob = e.data;
      _chunkQueue = _chunkQueue.then(() =>
        fetch(`/api/video/chunk?id=${_videoSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': blob.size },
          body: blob
        }).catch(() => {})
      );
    } else {
      // Fallback: buffer in memory if server unavailable
      _exportChunks.push(e.data);
    }
  };

  // Start recording + frame loop
  _exportFade = 0;
  _exportShowPhoto = false;
  _exportPhotoImg = null;
  _exportMediaRecorder.start(100);
  _exportFrameId = requestAnimationFrame(drawExportFrame);

  // Open with world view — hold for 2.5 seconds
  await waitForMapReady();
  await new Promise(r => setTimeout(r, 2500));
  if (!_exporting) { exportCleanup(); return; }

  // Play through each destination
  for (let i = 0; i < stops.length; i++) {
    if (!_exporting) break;
    const stop = stops[i];
    const totalPhotos = stop.photoIds.length;
    const pct = 30 + Math.round((i / stops.length) * 65);
    exportUpdateProgress(`Recording — destination ${i + 1} of ${stops.length}`, pct);

    // ── Fly to destination (recorded) ──
    await new Promise(resolve => {
      map.once('moveend', resolve);
      map.flyTo({
        center: [stop.lng, stop.lat], zoom: 14,
        speed: 0.6, curve: 1.0, essential: true,
        easing: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2
      });
    });
    if (!_exporting) break;

    // Wait for tiles to finish loading at destination
    await waitForMapReady();
    if (!_exporting) break;

    // Hold on map view briefly
    await new Promise(r => setTimeout(r, 1000));
    if (!_exporting) break;

    // ── Show photos at this destination ──
    lbIds = stop.photoIds;
    lbIdx = 0;
    showLbPhoto(); // updates lb-caption

    for (let j = 0; j < totalPhotos; j++) {
      exportUpdateProgress(`Recording — destination ${i + 1} of ${stops.length}, photo ${j + 1} of ${totalPhotos}`, 30 + Math.round(((i + j / totalPhotos) / stops.length) * 65));

      // Preload photo and fade in
      await exportPreloadPhoto(stop.photoIds[j]);
      if (j > 0) { lbIdx = j; showLbPhoto(); } // update caption for nav
      _exportShowPhoto = true;
      await exportAnimateFade(_exportFade > 0 ? _exportFade : 0.3, 0, 400);
      if (!_exporting) break;

      // Hold on photo
      await new Promise(r => setTimeout(r, 3000));
      if (!_exporting) break;

      // Fade out photo (to black briefly if more photos, or back to map if last)
      if (j < totalPhotos - 1) {
        await exportAnimateFade(0, 0.3, 300);
      }
    }
    if (!_exporting) break;

    // Fade out photo, reveal map
    await exportAnimateFade(0, 1, 500);
    _exportShowPhoto = false;
    _exportPhotoImg = null;
    await exportAnimateFade(1, 0, 400);

    // Hold on map briefly before flying to next stop
    await new Promise(r => setTimeout(r, 600));
  }

  // Stop recording
  exportUpdateProgress('Encoding video…', 95);
  cancelAnimationFrame(_exportFrameId);

  await new Promise(resolve => {
    _exportMediaRecorder.onstop = resolve;
    _exportMediaRecorder.stop();
  });

  // Download
  const dateStr = new Date().toISOString().slice(0, 10);
  if (_videoSessionId) {
    // Wait for all in-flight chunk uploads to complete, then finalize
    await _chunkQueue;
    await fetch(`/api/video/finalize?id=${_videoSessionId}`, { method: 'POST' });
    const a = document.createElement('a');
    a.href = `/api/video/download?id=${_videoSessionId}`;
    a.download = `matrix-trip-${dateStr}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    // Fallback: in-memory blob
    const blob = new Blob(_exportChunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matrix-trip-${dateStr}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Cleanup
  exportCleanup();
  showToast(`Video exported (${(blob.size / 1024 / 1024).toFixed(1)} MB)`, 'success');
}

function exportCleanup() {
  _exporting = false;
  if (_exportFrameId) { cancelAnimationFrame(_exportFrameId); _exportFrameId = null; }
  _exportMediaRecorder = null;
  _exportChunks = [];
  _exportCanvas = null;
  _exportCtx = null;
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('export-overlay').classList.remove('open');
}

function cancelExport() {
  if (!_exporting) return;
  _exporting = false;
  if (_exportMediaRecorder && _exportMediaRecorder.state !== 'inactive') {
    _exportMediaRecorder.stop();
  }
  // Abort any in-progress disk session
  if (typeof _videoSessionId !== 'undefined' && _videoSessionId) {
    fetch(`/api/video/abort?id=${_videoSessionId}`, { method: 'POST' }).catch(() => {});
  }
  exportCleanup();
  showToast('Export cancelled', 'error');
}

// Warn before leaving page during export
window.addEventListener('beforeunload', (e) => {
  if (_exporting) {
    e.preventDefault();
    e.returnValue = '';
  }
});