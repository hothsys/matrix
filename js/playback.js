// ═══════════════════════════════════════
// TRIP PLAYBACK
// _playbackActive, _playbackStops, _playbackIdx, _playbackTimer moved to state.js
// to fix circular dependency with lightbox.js (2026-05-16)
// ═══════════════════════════════════════

function togglePlayback() {
  if (_playbackActive) stopPlayback();
  else startPlayback();
}

function startPlayback() {
  // Build chronological sequence of pinned, dated photos grouped by location
  const dated = photos.filter(p => p.lat !== null && p.date)
    .sort((a, b) => photoSortKey(a) < photoSortKey(b) ? -1 : 1);

  if (dated.length < 2) {
    showToast('Need at least 2 dated pinned photos to play', 'warn');
    return;
  }

  // Group into stops by location, preserving chronological order
  const stops = [];
  const seen = new Set();
  for (const p of dated) {
    const k = locKey(p);
    if (seen.has(k)) {
      // Add to existing stop
      stops.find(s => s.key === k).photoIds.push(p.id);
    } else {
      seen.add(k);
      stops.push({ key: k, lat: p.lat, lng: p.lng, photoIds: [p.id] });
    }
  }

  _playbackStops = stops;
  _playbackIdx = 0;
  _playbackActive = true;

  // Close any open popups
  if (activePopup) { activePopup.remove(); activePopup = null; }

  // Update button
  const btn = document.getElementById('tb-play');
  btn.textContent = '■ Stop';
  btn.classList.add('active');

  playNextStop();
}

function stopPlayback() {
  _playbackActive = false;
  if (_playbackTimer) { clearTimeout(_playbackTimer); _playbackTimer = null; }
  document.getElementById('lightbox').classList.remove('open');
  const btn = document.getElementById('tb-play');
  btn.textContent = '▶ Play';
  btn.classList.remove('active');
}

async function playNextStop() {
  if (!_playbackActive || _playbackIdx >= _playbackStops.length) {
    stopPlayback();
    return;
  }

  const stop = _playbackStops[_playbackIdx];
  _playbackIdx++;

  // Fly to location
  await new Promise(resolve => {
    map.once('moveend', resolve);
    map.flyTo({
      center: [stop.lng, stop.lat], zoom: 14,
      speed: 0.8, curve: 1.0, essential: true,
      easing: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2
    });
  });

  if (!_playbackActive) return;

  // Brief pause before opening lightbox
  await new Promise(r => { _playbackTimer = setTimeout(r, 600); });
  if (!_playbackActive) return;

  // Open lightbox with this stop's photos
  lbIds = stop.photoIds;
  lbIdx = 0;
  showLbPhoto();
  document.getElementById('lightbox').classList.add('open');

  // Auto-advance through photos at this stop
  for (let i = 1; i < stop.photoIds.length; i++) {
    await new Promise(r => { _playbackTimer = setTimeout(r, 3000); });
    if (!_playbackActive) return;
    lbNav(1);
  }

  // Hold on last photo
  await new Promise(r => { _playbackTimer = setTimeout(r, 3000); });
  if (!_playbackActive) return;

  // Close lightbox and continue
  document.getElementById('lightbox').classList.remove('open');

  // Brief pause before flying to next stop
  await new Promise(r => { _playbackTimer = setTimeout(r, 800); });
  if (!_playbackActive) return;

  playNextStop();
}