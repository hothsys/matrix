// ═══════════════════════════════════════
// PHOTO PROCESSING WEB WORKER
// Worker code lives in js/photo-worker.js — served as a proper file.
// ═══════════════════════════════════════

let _photoWorker = null;
let _photoWorkerCallbacks = {};
let _photoWorkerId = 0;

function getPhotoWorker() {
  if (!_photoWorker) {
    _photoWorker = new Worker('/js/photo-worker.js');
    _photoWorker.onmessage = (e) => {
      const { id } = e.data;
      const cb = _photoWorkerCallbacks[id];
      if (cb) { delete _photoWorkerCallbacks[id]; cb(e.data); }
    };
  }
  return _photoWorker;
}

function processFileInWorker(file) {
  return new Promise((resolve) => {
    const id = ++_photoWorkerId;
    const worker = getPhotoWorker();
    _photoWorkerCallbacks[id] = resolve;
    file.arrayBuffer().then(buf => {
      worker.postMessage({ id, file: { type: file.type, name: file.name }, arrayBuffer: buf }, [buf]);
    });
  });
}

// ═══════════════════════════════════════
// FILE PROCESSING
// ═══════════════════════════════════════
async function processFiles(files) {
  const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!arr.length) { showToast('No image files found','error'); return; }
  showProg(true);
  let ok=0, pinned=0, dupes=0;
  const BATCH = 4;

  for (let i=0; i<arr.length; i+=BATCH) {
    const batch = arr.slice(i, i + BATCH);
    updProg(Math.round((i/arr.length)*100), `Processing ${i+1}–${Math.min(i+BATCH,arr.length)}/${arr.length}`);

    const results = await Promise.all(batch.map(async (f) => {
      const dk = `${f.name}_${f.size}`;
      if (photos.find(p => p._dk===dk)) return { dup: true };
      try {
        const result = await processFileInWorker(f);
        if (!result.ok) return { err: true };
        return { dk, name: f.name, ...result };
      } catch(e) { return { err: true }; }
    }));

    for (const r of results) {
      if (r.dup) { dupes++; continue; }
      if (r.err) continue;
      const photoId = `p_${Date.now()}_${Math.random().toString(36).slice(2)}_${ok}`;
      // Save full-size image to disk — IndexedDB stores only the file path reference.
      // This keeps IndexedDB lean (~50KB/photo vs ~4MB with base64).
      // Verify the file is accessible before replacing base64 with the path.
      let diskDataUrl = r.dataUrl;
      if (_autoSaveAvailable && r.dataUrl && r.dataUrl.startsWith('data:')) {
        try {
          await fetch(`/api/photos/${photoId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: r.dataUrl })
          });
          const ext = (r.dataUrl.match(/data:image\/(\w+)/) || [])[1] === 'png' ? 'png' : 'jpg';
          const filePath = `matrix-photos/${photoId}.${ext}`;
          // Verify the file is servable before committing the path to IndexedDB
          const check = await fetch(`/${filePath}`, { method: 'HEAD' });
          if (check.ok) diskDataUrl = filePath;
        } catch (_) { /* fall back to base64 in IndexedDB if disk save fails */ }
      }
      const photo = {
        id: photoId,
        name: r.name.replace(/\.[^.]+$/,''),
        date: r.exif.date, time: r.exif.time,
        lat: r.exif.lat, lng: r.exif.lng,
        camera: r.exif.camera || null,
        placeName: null, countryCode: null, note: '',
        dataUrl: diskDataUrl, thumbUrl: r.thumbUrl,
        addedAt: Date.now(), _dk: r.dk
      };
      photos.push(photo);
      await dbPut('photos', photo);
      if (photo.lat !== null) pinned++;
      ok++;
    }
  }

  updProg(100,'Done!');
  setTimeout(()=>showProg(false), 700);
  refreshAll();
  if (pinned) { fitAll(); triggerTileCache(); }
  scheduleAutoSave();
  showToast(`Added ${ok} photo${ok!==1?'s':''}${pinned?`, ${pinned} pinned`:''}${dupes?`, ${dupes} skipped`:''}`, 'success');
  // Apply country codes from cache for newly added EXIF-pinned photos (no API calls)
  const needCC2 = photos.filter(p => p.lat !== null && !p.countryCode);
  if (needCC2.length) {
    let filled = 0;
    for (const p of needCC2) {
      const key = `${p.lat.toFixed(4)}_${p.lng.toFixed(4)}`;
      if (_geoCodeCache[key]) { p.countryCode = _geoCodeCache[key]; dbPut('photos', p); filled++; }
    }
    if (filled) { updateCountriesBar(); scheduleAutoSave(); }
  }
}