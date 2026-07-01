
// ═══════════════════════════════════════
// DEMOS
// ═══════════════════════════════════════

// Ctrl+Shift+D — automated app walkthrough with fake cursor
// Ctrl+Shift+G — globe rotation demo
// L/D/T/3/S/G — map style shortcuts  F — fit all pins
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') { e.preventDefault(); runDemo(); }
  if (e.ctrlKey && e.shiftKey && e.key === 'G') { e.preventDefault(); runGlobeDemo(); }

  // Map style + navigation shortcuts — skip when typing in inputs or using modifier keys
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  switch (e.key) {
    case 'l': case 'L': setMapStyle('light'); break;
    case 'd': case 'D': setMapStyle('dark'); break;
    case 't': case 'T': setMapStyle('enriched'); break;
    case '3': setMapStyle('terrain3d'); break;
    case 's': case 'S': setMapStyle('satellite'); break;
    case 'g': case 'G': setMapStyle('globe'); break;
    case 'f': case 'F': fitAll(); break;
  }
});

// ═══════════════════════════════════════
// APP WALKTHROUGH DEMO (Ctrl+Shift+D)
// ═══════════════════════════════════════
function runDemo() {
  const step = (fn) => new Promise(res => fn(res));
  const fly = (center, zoom, duration) => step(res => {
    map.flyTo({ center, zoom, duration });
    map.once('moveend', res);
  });
  const wait = (ms) => new Promise(res => setTimeout(res, ms));
  const rightClick = (lat, lng) => step(res => {
    const point = map.project([lng, lat]);
    map.fire('contextmenu', { lngLat: { lng, lat }, point, preventDefault: () => {} });
    const poll = setInterval(() => {
      const btn = document.querySelector('.dest-popup-btn[onclick*="pinEmptyLocation"]');
      if (btn) { clearInterval(poll); res(btn); }
    }, 300);
  });

  const hover = (el) => {
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  };
  const unhover = (el) => {
    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  };

  // Fake cursor element
  const cursor = document.createElement('div');
  cursor.style.cssText = 'position:fixed;z-index:100000;pointer-events:none;width:32px;height:32px;transition:left .5s ease,top .5s ease,opacity .3s;opacity:0;left:-50px;top:-50px';
  cursor.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
  document.body.appendChild(cursor);

  const moveTo = async (target, duration = 500) => {
    let x, y;
    if (target instanceof Element) {
      const r = target.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    } else if (target.lat !== undefined) {
      const pt = map.project([target.lng, target.lat]);
      const mapRect = map.getContainer().getBoundingClientRect();
      x = mapRect.left + pt.x;
      y = mapRect.top + pt.y;
    }
    cursor.style.transition = `left ${duration}ms ease, top ${duration}ms ease, opacity .3s`;
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    cursor.style.opacity = '1';
    await wait(duration + 50);
  };
  const hideCursor = () => { cursor.style.opacity = '0'; };
  const clickPulse = async () => {
    cursor.style.transition = 'transform .1s';
    cursor.style.transform = 'scale(0.8)';
    await wait(100);
    cursor.style.transform = 'scale(1)';
    await wait(100);
  };

  (async () => {
    const preExistingIds = new Set(photos.map(p => p.id));

    if (activeAlbumId) closeAlbumDetail();
    switchSideTab('photos');
    await wait(300);
    setMapStyle('dark');
    await wait(1500);

    map.jumpTo({ center: [2.3, 46.6], zoom: 4 });
    await wait(1000);
    await fly([2.3522, 48.8566], 8, 3000);
    await wait(500);

    await moveTo({ lat: 48.8566, lng: 2.3522 });
    await clickPulse();
    const pinBtn = await rightClick(48.8566, 2.3522);
    await wait(800);

    await moveTo(pinBtn);
    await clickPulse();
    pinBtn.click();
    await wait(1500);
    hideCursor();

    await fly([2.3522, 48.8566], 2, 2000);
    await wait(1000);

    await fly([80.7718, 7.8731], 7, 4000);
    await wait(1500);

    await fly([32.0, 39.9], 7, 4000);
    await wait(1000);

    await fly([32.0, 39.9], 1, 2000);
    setMapStyle('light');
    await wait(2000);

    await fly([-62.783, 17.357], 10, 4000);
    await wait(1000);
    await fly([-62.6884, 17.2829], 16, 3000);
    await wait(2000);

    const flags = document.querySelectorAll('#countries-flags span');
    if (flags.length >= 2) {
      await moveTo(flags[0]);
      hover(flags[0]);
      await wait(1000);
      unhover(flags[0]);
      await moveTo(flags[1]);
      hover(flags[1]);
      await wait(1000);
      unhover(flags[1]);
    }
    await wait(500);

    const albumsTab = document.querySelector('.stab:nth-child(3)');
    if (albumsTab) {
      await moveTo(albumsTab);
      await clickPulse();
    }
    switchSideTab('albums');
    await wait(800);

    const albumCard = document.querySelector('.album-card');
    if (albumCard) {
      await moveTo(albumCard);
      await clickPulse();
      albumCard.click();
      await wait(1000);

      const photoRow = document.querySelector('#alb-detail-body .alb-photo-row');
      if (photoRow) {
        await moveTo(photoRow);
        await clickPulse();
        photoRow.click();

        await step(res => {
          const poll = setInterval(() => {
            const lb = document.getElementById('lightbox');
            const img = document.getElementById('lb-img');
            if (lb.classList.contains('open') && img && img.complete && img.naturalWidth) {
              clearInterval(poll);
              res();
            }
          }, 200);
        });
        hideCursor();
        await wait(2000);

        closeLightbox();
      }
    }

    cursor.remove();

    const demoPins = photos.filter(p => p.isEmptyPin && !preExistingIds.has(p.id));
    for (const p of demoPins) {
      photos.splice(photos.indexOf(p), 1);
      photoMap.delete(p.id);
      dbDel('photos', p.id);
      deletePhotoFiles(p.id);
    }
    if (demoPins.length) {
      refreshAll();
      scheduleAutoSave();
    }
  })();
}

// ═══════════════════════════════════════
// GLOBE ROTATION DEMO (Ctrl+Shift+G)
// ═══════════════════════════════════════
let _globeDemoActive = false;
async function runGlobeDemo() {
  if (_globeDemoActive) { _globeDemoActive = false; return; }
  _globeDemoActive = true;

  setMapStyle('globe');

  await new Promise(r => setTimeout(r, 1200));
  if (!_globeDemoActive) return;

  map.flyTo({ center: [-100, 0], zoom: 2.35, bearing: 0, pitch: 0, duration: 800 });
  await new Promise(r => setTimeout(r, 1000));
  if (!_globeDemoActive) return;

  // Replace DOM cluster markers with GPU-rendered circle dots — no jitter during rotation
  _animatingMap = true;
  Object.values(domMarkers).forEach(m => m.remove());
  domMarkers = {};
  const pinSrc = map.getSource('photo-pins');
  if (pinSrc) pinSrc.setData({ type: 'FeatureCollection', features: [] });

  // Query Supercluster at the globe zoom to get clusters with counts
  const globeZoom = Math.floor(map.getZoom());
  const items = scIndex ? scIndex.getClusters([-180, -85, 180, 85], globeZoom) : [];
  const dotFeatures = [];
  for (const f of items) {
    const [lng, lat] = f.geometry.coordinates;
    let color, count;
    if (f.properties.cluster) {
      count = f.properties.point_count;
      let topCC = null;
      const ccCounts = f.properties.ccCounts;
      if (ccCounts) {
        let max = 0;
        for (const cc in ccCounts) { if (ccCounts[cc] > max) { max = ccCounts[cc]; topCC = cc; } }
      }
      color = _continentColor(lat, lng, topCC);
    } else {
      count = 1;
      const p = photoMap.get(f.properties.id);
      const cc = p?.countryCode || _geoCodeCache[`${lat.toFixed(4)}_${lng.toFixed(4)}`] || null;
      color = _continentColor(lat, lng, cc);
    }
    const size = count > 1 ? Math.min(10 + Math.sqrt(count) * 2.5, 22) : 6;
    dotFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { color, count, size, label: count > 1 ? String(count) : '' }
    });
  }
  const demoData = { type: 'FeatureCollection', features: dotFeatures };
  if (!map.getSource('globe-demo-dots')) {
    map.addSource('globe-demo-dots', { type: 'geojson', data: demoData });
  } else {
    map.getSource('globe-demo-dots').setData(demoData);
  }
  if (!map.getLayer('globe-demo-dots-layer')) {
    map.addLayer({
      id: 'globe-demo-dots-layer',
      type: 'circle',
      source: 'globe-demo-dots',
      paint: {
        'circle-radius': ['get', 'size'],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff'
      }
    });
  }
  if (!map.getLayer('globe-demo-labels-layer')) {
    map.addLayer({
      id: 'globe-demo-labels-layer',
      type: 'symbol',
      source: 'globe-demo-dots',
      filter: ['>', ['get', 'count'], 1],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-font': ['Noto Sans Bold'],
        'text-allow-overlap': true
      },
      paint: {
        'text-color': '#ffffff'
      }
    });
  }

  // Spin the globe along the equator — 3 rotations, 25s each
  const ROTATIONS = 3;
  const MS_PER_ROTATION = 25000;
  const TOTAL_MS = ROTATIONS * MS_PER_ROTATION;
  const start = performance.now();

  await new Promise(resolve => {
    function frame(now) {
      if (!_globeDemoActive) { resolve(); return; }
      const elapsed = now - start;
      if (elapsed >= TOTAL_MS) {
        resolve();
        return;
      }
      const lng = -100 + (elapsed / MS_PER_ROTATION) * 360;
      map.setCenter([lng, 0]);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  // Cleanup — remove demo layers, restore normal clusters
  if (map.getLayer('globe-demo-labels-layer')) map.removeLayer('globe-demo-labels-layer');
  if (map.getLayer('globe-demo-dots-layer')) map.removeLayer('globe-demo-dots-layer');
  if (map.getSource('globe-demo-dots')) map.removeSource('globe-demo-dots');
  _animatingMap = false;
  _refreshClustersNow();
  _globeDemoActive = false;
}
