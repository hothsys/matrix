
// ═══════════════════════════════════════
// DESTINATION SEARCH
// ═══════════════════════════════════════
const dInput   = document.getElementById('dest-input');
const dResults = document.getElementById('dest-results');
const dLoading = document.getElementById('dest-loading');
const dClear   = document.getElementById('dest-clear');

const _searchCache = {};
let _searchMoveTimer = null;
let _searchCategory = 'all';

// POI prefetch cache — Overpass results for the current viewport at zoom 10+
let _poiCache = [];
let _poiCacheBbox = null;
let _poiFetchInFlight = false;
let _poiPrefetchTimer = null;

const POI_CATEGORIES = {
  hotel:      { label: '🏨 Hotel',      tags: [['amenity','hotel'],['tourism','hotel']] },
  restaurant: { label: '🍽 Restaurant', tags: [['amenity','restaurant'],['amenity','cafe'],['amenity','bar'],['amenity','pub'],['amenity','fast_food']] },
  attraction: { label: '🏛 Attraction',  tags: [['tourism','attraction'],['tourism','museum'],['tourism','viewpoint']] },
};

function toggleSearchCatMenu() {
  document.getElementById('search-cat-menu').classList.toggle('open');
}

function setSearchCat(cat) {
  _searchCategory = cat;
  document.getElementById('search-cat-label').textContent = cat === 'all' ? 'All' : POI_CATEGORIES[cat].label;
  document.getElementById('search-cat-btn').classList.toggle('active', cat !== 'all');
  document.querySelectorAll('.search-cat-item').forEach(el => el.classList.toggle('active', el.dataset.cat === cat));
  document.getElementById('search-cat-menu').classList.remove('open');
  Object.keys(_searchCache).forEach(k => delete _searchCache[k]);
  const q = dInput.value.trim();
  if (q.length >= 2) {
    dResults.style.display = 'block';
    runDestSearch(q);
  } else if (cat !== 'all') {
    dResults.style.display = 'block';
    dLoading.style.display = 'none';
    dResults.innerHTML = '<div style="padding:9px 12px;font-size:.73rem;color:var(--muted)">Type to search nearby</div>';
  }
}

// Re-run visible search when the map viewport changes (pan/zoom)
function _onMapMoveForSearch() {
  clearTimeout(_searchMoveTimer);
  const q = dInput.value.trim();
  if ((q.length < 2 && _searchCategory === 'all') || dResults.style.display === 'none' || destMarkerObj) return;
  _searchMoveTimer = setTimeout(() => runDestSearch(q), 600);
}

// POI prefetch — fetch named POIs in the viewport at zoom 10+ for instant local search
function _onMapMoveForPrefetch() {
  clearTimeout(_poiPrefetchTimer);
  if (!map || _isOffline) return;
  if (map.getZoom() < 10) { _poiCache = []; _poiCacheBbox = null; return; }
  _poiPrefetchTimer = setTimeout(_prefetchPOIs, 1500);
}

function _bboxOverlap(a, b) {
  if (!a || !b) return 0;
  const intW = Math.max(a.west, b.west), intE = Math.min(a.east, b.east);
  const intS = Math.max(a.south, b.south), intN = Math.min(a.north, b.north);
  if (intW >= intE || intS >= intN) return 0;
  const intArea = (intE - intW) * (intN - intS);
  const aArea = (a.east - a.west) * (a.north - a.south);
  return aArea > 0 ? intArea / aArea : 0;
}

async function _prefetchPOIs() {
  if (!map || _poiFetchInFlight || _isOffline || map.getZoom() < 10) return;
  const b = map.getBounds();
  const bbox = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  if (_bboxOverlap(bbox, _poiCacheBbox) > 0.5) return;

  _poiFetchInFlight = true;
  const bboxStr = `(${bbox.south.toFixed(5)},${bbox.west.toFixed(5)},${bbox.north.toFixed(5)},${bbox.east.toFixed(5)})`;
  const poiTags = ['tourism', 'amenity', 'leisure', 'historic'];
  const placeTags = ['village', 'hamlet', 'town', 'isolated_dwelling', 'neighbourhood'];
  const stmts = [
    ...poiTags.flatMap(tag => [
      `node["name"]["${tag}"]${bboxStr};`,
      `way["name"]["${tag}"]${bboxStr};`,
    ]),
    ...placeTags.map(v => `node["place"="${v}"]["name"]${bboxStr};`),
  ].join('\n  ');
  const query = `[out:json][timeout:12];\n(\n  ${stmts}\n);\nout center 200;`;
  try {
    const r = await fetch('/api/overpass', { method: 'POST', body: new URLSearchParams({ data: query }) });
    if (!r.ok) { _poiFetchInFlight = false; return; }
    const data = await r.json();
    _poiCache = (data.elements || [])
      .filter(el => el.tags?.name)
      .map(el => {
        const t = el.tags, lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) return null;
        const city = t['addr:city'] || t['addr:town'] || t['addr:village'] || '';
        const country = t['addr:country'] || '';
        return {
          display_name: [t.name, city, country].filter(Boolean).join(', '),
          lat: String(lat), lon: String(lon),
          address: { city, country, country_code: (country || '').toLowerCase() }
        };
      })
      .filter(Boolean);
    _poiCacheBbox = bbox;
  } catch(_) { /* proxy unreachable — leave cache as-is */ }
  _poiFetchInFlight = false;
}

function _filterPOICache(q) {
  if (!_poiCache.length || !q) return [];
  const lower = q.toLowerCase();
  return _poiCache.filter(item => item.display_name.toLowerCase().includes(lower));
}

dInput.addEventListener('input', () => {
  const q = dInput.value.trim();
  dClear.style.display = q ? 'block' : 'none';
  clearTimeout(searchTimer);
  if (q.length < 2 && _searchCategory === 'all') { dResults.style.display='none'; return; }
  searchTimer = setTimeout(() => runDestSearch(q), 380);
});
dInput.addEventListener('keydown', e => { if(e.key==='Escape'){clearDestSearch();dInput.blur();} });
document.addEventListener('click', e => {
  if (!document.getElementById('dest-search-wrap').contains(e.target)) dResults.style.display='none';
  if (!document.getElementById('search-cat-wrap').contains(e.target)) document.getElementById('search-cat-menu').classList.remove('open');
});


function _dedupResults(data) {
  const unique = [];
  for (const item of data) {
    const name = item.display_name.split(',')[0].trim();
    const lat = parseFloat(item.lat), lon = parseFloat(item.lon);
    const isDup = unique.some(u => {
      if (u.display_name.split(',')[0].trim() !== name) return false;
      return Math.hypot(parseFloat(u.lat) - lat, parseFloat(u.lon) - lon) < 0.5;
    });
    if (!isDup) unique.push(item);
  }
  return unique;
}

function _renderResultItems(items, allItems) {
  const nameCounts = {};
  allItems.forEach(item => {
    const name = item.display_name.split(',')[0];
    nameCounts[name] = (nameCounts[name] || 0) + 1;
  });
  items.forEach(item => {
    const main = item.display_name.split(',')[0];
    // Build detail from display_name (most reliable — includes all address levels)
    let detail = item.display_name.split(',').slice(1).map(s => s.trim()).filter(Boolean).join(', ');
    // For duplicate names, enrich with archipelago/region if needed
    if (nameCounts[main] > 1 && item.address) {
      const parts = item.display_name.split(',').slice(1).map(s => s.trim()).filter(Boolean);
      if (item.address.archipelago && !parts.includes(item.address.archipelago)) {
        parts.splice(parts.length - 1, 0, item.address.archipelago);
      }
      const siblings = allItems.filter(i => i.display_name.split(',')[0].trim() === main);
      const regions = siblings.map(i => _regionFromCoords(i.lat, i.lon));
      if (new Set(regions.filter(Boolean)).size > 1) {
        const region = _regionFromCoords(item.lat, item.lon);
        if (region && !parts.includes(region)) parts.push(region);
      }
      detail = parts.filter(p => p && p !== main).join(', ');
    }
    const el = document.createElement('div');
    el.className = 'dest-item';
    el.innerHTML = `<span class="dest-item-icon">📍</span><div><div class="dest-item-name">${esc(main)}</div><div class="dest-item-detail">${esc(detail)}</div></div>`;
    el.addEventListener('click', () => flyTo(item));
    dResults.appendChild(el);
  });
}

function renderSearchResults(data, globalData) {
  dLoading.style.display = 'none';
  const nearby = globalData !== undefined ? _dedupResults(data) : [];
  const global = _dedupResults(globalData !== undefined ? globalData : data);
  const allItems = [...nearby, ...global];

  if (!allItems.length) {
    dResults.innerHTML = '<div style="padding:9px 12px;font-size:.73rem;color:var(--muted)">No results found</div>';
    return;
  }
  dResults.innerHTML = '';
  if (nearby.length) {
    _renderResultItems(nearby, allItems);
    if (global.length) {
      const divider = document.createElement('div');
      divider.className = 'dest-divider';
      divider.textContent = 'Other results';
      dResults.appendChild(divider);
    }
  }
  if (global.length) _renderResultItems(global, allItems);
}

// Reverse geocode GPS coordinates — returns a single result formatted
// identically to forward search so it renders in the same dropdown
async function runReverseGeoSearch(lat, lng) {
  try {
    await nominatimThrottle();
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (d.error) {
      dLoading.style.display = 'none';
      dResults.innerHTML = '<div style="padding:9px 12px;font-size:.73rem;color:var(--muted)">No results for these coordinates</div>';
      return;
    }
    // Build a meaningful display_name from address fields — Nominatim reverse often
    // returns a street number as the first element which isn't useful for navigation
    const a = d.address || {};
    // Pick the most meaningful name — landmark/POI first, then road, then area
    const mainName = d.name || a.tourism || a.building || a.amenity || a.leisure || a.road || a.suburb || a.neighbourhood || a.city || a.town || a.village || a.state || d.display_name.split(',')[0];
    const city = a.city || a.town || a.village || '';
    const country = a.country || '';
    const displayParts = [mainName, city, country].filter((v, i, arr) => v && arr.indexOf(v) === i);
    const displayName = displayParts.join(', ');

    const result = [{
      display_name: displayName,
      lat: String(lat),
      lon: String(lng),
      address: a
    }];
    _searchCache[`${lat},${lng}`] = result;
    renderSearchResults(result);
  } catch (err) {
    console.warn('Reverse geo search failed:', err);
    dLoading.style.display = 'none';
    dResults.innerHTML = '<div style="padding:9px 12px;font-size:.73rem;color:var(--accent2)">Coordinate lookup failed — try again</div>';
  }
}

async function runCategorySearch(q, cat, cacheKey) {
  if (!map || q.length < 2) {
    dLoading.style.display = 'none';
    dResults.innerHTML = '<div style="padding:9px 12px;font-size:.73rem;color:var(--muted)">Type to search nearby</div>';
    return;
  }
  const b = map.getBounds();

  // --- Attempt 1: Overpass via local proxy (precise tag-based POI search) ---
  const bbox = `(${b.getSouth().toFixed(5)},${b.getWest().toFixed(5)},${b.getNorth().toFixed(5)},${b.getEast().toFixed(5)})`;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameFilter = `["name"~"${safe}",i]`;
  const stmts = POI_CATEGORIES[cat].tags.flatMap(([k, v]) => [
    `node["${k}"="${v}"]${nameFilter}${bbox};`,
    `way["${k}"="${v}"]${nameFilter}${bbox};`,
    `relation["${k}"="${v}"]${nameFilter}${bbox};`,
  ]).join('\n  ');
  const query = `[out:json][timeout:10];\n(\n  ${stmts}\n);\nout center 20;`;
  try {
    const r = await fetch('/api/overpass', { method: 'POST', body: new URLSearchParams({ data: query }) });
    if (r.ok) {
      const data = await r.json();
      const results = (data.elements || [])
        .filter(el => el.tags?.name)
        .map(el => {
          const t = el.tags, lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
          if (lat == null || lon == null) return null;
          const city = t['addr:city'] || t['addr:town'] || t['addr:village'] || '';
          const country = t['addr:country'] || '';
          return {
            display_name: [t.name, city, country].filter(Boolean).join(', '),
            lat: String(lat), lon: String(lon),
            address: { city, country }
          };
        })
        .filter(Boolean);
      _searchCache[cacheKey] = results;
      renderSearchResults(results);
      return;
    }
  } catch(_) { /* proxy unreachable — fall through to Nominatim */ }

  // --- Fallback: Nominatim bounded=1 + layer=poi (works everywhere, less precise) ---
  const viewbox = `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}&bounded=1&layer=poi`;
  await nominatimThrottle();
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=20&addressdetails=1${viewbox}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    _searchCache[cacheKey] = data;
    renderSearchResults(data);
  } catch(err) {
    console.warn('Category search failed:', err);
    dLoading.style.display = 'none';
    dResults.innerHTML = `<div style="padding:9px 12px;font-size:.73rem;color:var(--accent2)">Search failed — try again</div>`;
  }
}

async function runDestSearch(q) {
  if (_isOffline) {
    dResults.style.display='block'; dLoading.style.display='none';
    dResults.innerHTML='<div style="padding:9px 12px;font-size:.73rem;color:var(--accent2)">Search requires internet connection</div>';
    return;
  }
  dResults.style.display='block'; dLoading.style.display='block';
  dResults.querySelectorAll('.dest-item,.dest-divider').forEach(el=>el.remove());

  // Detect GPS coordinate input (e.g. "48.8566, 2.3522" or "48.8566° N, 2.3522° E")
  const coordMatch = q.trim().match(/^(-?\d+\.?\d*)[°\s]*[NSns]?\s*,\s*(-?\d+\.?\d*)[°\s]*[EWew]?$/);
  if (coordMatch) {
    let lat = parseFloat(coordMatch[1]), lng = parseFloat(coordMatch[2]);
    // Handle S/W suffixes making coords negative
    if (/[Ss]/.test(q)) lat = -Math.abs(lat);
    if (/[Ww]/.test(q)) lng = -Math.abs(lng);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      await runReverseGeoSearch(lat, lng);
      return;
    }
  }

  const zoom = map ? map.getZoom() : 0;
  // Category searches are viewport-dependent (Overpass bbox); general searches are not
  const cacheKey = _searchCategory !== 'all'
    ? q + (zoom >= 3 ? `@${map.getCenter().lng.toFixed(1)},${map.getCenter().lat.toFixed(1)}` : '') + `#${_searchCategory}`
    : q;

  if (_searchCategory !== 'all') {
    if (_searchCache[cacheKey]) { renderSearchResults(_searchCache[cacheKey]); return; }
    await runCategorySearch(q, _searchCategory, cacheKey);
    return;
  }

  // Filter prefetched POI cache for instant nearby results
  const nearby = _filterPOICache(q);

  // Check Nominatim cache
  let nominatimData = _searchCache[cacheKey];
  if (!nominatimData) {
    try {
      await nominatimThrottle();
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=10&addressdetails=1`,{headers:{'Accept-Language':'en'}});
      if (!r.ok) { throw new Error(`HTTP ${r.status}`); }
      nominatimData = await r.json();
      _searchCache[cacheKey] = nominatimData;
    } catch(err) {
      console.warn('Search failed:', err);
      if (!nearby.length) {
        dLoading.style.display='none';
        dResults.innerHTML=`<div style="padding:9px 12px;font-size:.73rem;color:var(--accent2)">Search failed — try again in a moment</div>`;
        return;
      }
      nominatimData = [];
    }
  }

  // Split Nominatim results by viewport bounds — in-bounds results join
  // the nearby group, out-of-bounds go below the "Other results" divider
  let inBoundsNom = [], outBoundsNom = [];
  if (map && zoom >= 3) {
    const b = map.getBounds();
    for (const d of nominatimData) {
      const lat = parseFloat(d.lat), lon = parseFloat(d.lon);
      if (lat >= b.getSouth() && lat <= b.getNorth() && lon >= b.getWest() && lon <= b.getEast()) {
        inBoundsNom.push(d);
      } else {
        outBoundsNom.push(d);
      }
    }
  } else {
    inBoundsNom = nominatimData;
  }

  // Merge POI cache + in-bounds Nominatim, dedup by name + proximity
  const allNearby = [...nearby];
  for (const nd of inBoundsNom) {
    const nName = nd.display_name.split(',')[0].trim().toLowerCase();
    const isDup = allNearby.some(nb => {
      const nbName = nb.display_name.split(',')[0].trim().toLowerCase();
      return nbName === nName && Math.hypot(parseFloat(nb.lat) - parseFloat(nd.lat), parseFloat(nb.lon) - parseFloat(nd.lon)) < 0.15;
    });
    if (!isDup) allNearby.push(nd);
  }

  // Dedup out-of-bounds against nearby
  const globalData = outBoundsNom.filter(nd => {
    const nName = nd.display_name.split(',')[0].trim().toLowerCase();
    return !allNearby.some(nb => {
      const nbName = nb.display_name.split(',')[0].trim().toLowerCase();
      return nbName === nName && Math.hypot(parseFloat(nb.lat) - parseFloat(nd.lat), parseFloat(nb.lon) - parseFloat(nd.lon)) < 0.15;
    });
  });

  if (allNearby.length && globalData.length) {
    renderSearchResults(allNearby, globalData);
  } else if (allNearby.length) {
    renderSearchResults(allNearby);
  } else {
    renderSearchResults(globalData);
  }
}

function flyTo(item) {
  const lat=parseFloat(item.lat), lng=parseFloat(item.lon);
  dResults.style.display='none';
  const a = item.address || {};
  const main = item.display_name.split(',')[0];
  const country = a.country || item.display_name.split(',').pop().trim();
  dInput.value = country && country !== main ? `${main}, ${country}` : main;
  dClear.style.display='block';
  map.flyTo({center:[lng,lat],zoom:12,duration:1200});
  if (destMarkerObj) { destMarkerObj.marker.remove(); if(destMarkerObj.popup) destMarkerObj.popup.remove(); destMarkerObj=null; }
  const dw=document.createElement('div');
  const el=document.createElement('div');
  el.className='dest-pin-el';
  el.innerHTML='<div class="dest-pin-el-inner">📍</div>';
  const detail = a.country && a.country !== main ? a.country : item.display_name.split(',').pop().trim();
  // Cache the search name, country, and country code so pin popups and countries bar use it
  const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
  _geoCache[cacheKey] = main;
  const parts = item.display_name.split(',').map(s=>s.trim());
  if (parts.length > 1) _geoCountryCache[cacheKey] = parts[parts.length-1];
  if (item.address?.country_code) _geoCodeCache[cacheKey] = item.address.country_code.toUpperCase();
  const marker=new maplibregl.Marker({element:el, anchor:'top-left', offset:[-14,-28]}).setLngLat([lng,lat]).addTo(map);
  marker.getElement().addEventListener('click', (e) => {
    e.stopPropagation();
    reopenDestPopup();
  });
  const popup=new maplibregl.Popup({maxWidth:'240px',closeButton:true,offset:30})
    .setLngLat([lng,lat])
    .setHTML(`<div class="dest-popup"><div class="dest-popup-name">${esc(main)}</div><div class="dest-popup-detail">${esc(detail)}</div><button class="dest-popup-btn" onclick="openPinPickerAt(${lat},${lng})">＋ Add photos to this location</button><button class="dest-popup-btn" onclick="pinEmptyLocation(${lat},${lng})">📌 Pin this location</button><div class="dest-popup-coords">${lat.toFixed(3)}, ${lng.toFixed(3)}</div></div>`)
    .addTo(map);
  popup.on('close', () => { if (destMarkerObj) { destMarkerObj.marker.remove(); destMarkerObj = null; } });
  destMarkerObj={marker,popup};
}

function openPinPickerAt(lat,lng){
  if(destMarkerObj?.popup) destMarkerObj.popup.remove();
  openPinPicker(lat,lng);
}
async function pinEmptyLocation(lat, lng) {
  if (destMarkerObj) { destMarkerObj.marker.remove(); if (destMarkerObj.popup) destMarkerObj.popup.remove(); destMarkerObj = null; }
  const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
  const geoName = _geoCache[cacheKey] || null;
  const cc = _geoCodeCache[cacheKey] || null;
  const pin = {
    id: 'pin-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    lat, lng,
    placeName: geoName,
    countryCode: cc,
    isEmptyPin: true,
    name: geoName || 'Pinned Location',
    date: null, time: null,
    dataUrl: null, thumbUrl: null,
    addedAt: Date.now()
  };
  photos.push(pin);
  await dbPut('photos', pin);
  refreshAll();
  scheduleAutoSave();
  triggerTileCache();
  showToast('Location pinned ✓', 'success');
}
function reopenDestPopup(){
  if(!destMarkerObj || !destMarkerObj.marker) return;
  // Remove existing popup if any
  if(destMarkerObj.popup) { try { destMarkerObj.popup.remove(); } catch(e){} }
  const lngLat = destMarkerObj.marker.getLngLat();
  const lat=lngLat.lat, lng=lngLat.lng;
  const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
  const main = _geoCache[cacheKey] || `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
  const country = _geoCountryCache[cacheKey];
  const detail = country || '';
  const popup = new maplibregl.Popup({maxWidth:'240px',closeButton:true,offset:30})
    .setLngLat([lng,lat])
    .setHTML(`<div class="dest-popup"><div class="dest-popup-name">${esc(main)}</div><div class="dest-popup-detail">${esc(detail)}</div><button class="dest-popup-btn" onclick="openPinPickerAt(${lat},${lng})">＋ Add photos to this location</button><button class="dest-popup-btn" onclick="pinEmptyLocation(${lat},${lng})">📌 Pin this location</button><div class="dest-popup-coords">${lat.toFixed(3)}, ${lng.toFixed(3)}</div></div>`)
    .addTo(map);
  popup.on('close', () => { if (destMarkerObj) { destMarkerObj.marker.remove(); destMarkerObj = null; } });
  destMarkerObj.popup = popup;
}
function clearDestSearch(){
  dInput.value=''; dClear.style.display='none'; dResults.style.display='none';
  if(destMarkerObj){destMarkerObj.marker.remove();if(destMarkerObj.popup)destMarkerObj.popup.remove();destMarkerObj=null;}
}
