// ═══════════════════════════════════════
// MAP
// ═══════════════════════════════════════
function _styleUrl() {
  if (_mapStyle === 'satellite' || _mapStyle === 'satellite3d') return STYLE_SAT;
  if (_mapStyle === 'dark') return STYLE_DARK;
  if (_mapStyle === 'bright') return STYLE_BRIGHT;
  return STYLE_STREET; // light, enriched, terrain3d, globe all use Liberty as base
}
const STYLE_STREET = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_BRIGHT = 'https://tiles.openfreemap.org/styles/bright';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
const STYLE_SAT = {
  version:8,
  sources:{sat:{type:'raster',tiles:['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'],tileSize:256,maxzoom:18}},
  layers:[{id:'sat',type:'raster',source:'sat',paint:{'raster-fade-duration':0}}]
};
function normalizeDarkLabels() {
  // Dark style uses uppercase + regular weight on all place labels.
  // Override to match Liberty style: title case and bold font.
  const layers = [
    'place_country_major', 'place_country_minor', 'place_country_other',
    'place_city', 'place_city_large', 'place_state',
    'place_town', 'place_village', 'place_suburb'
  ];
  // Country layers also need size overrides to match Liberty
  const sizeOverrides = {
    'place_country_major': ["interpolate",["linear"],["zoom"],1,9,4,17],
    'place_country_minor': ["interpolate",["linear"],["zoom"],2,9,5,17],
    'place_country_other': ["interpolate",["linear"],["zoom"],3,9,7,17],
  };
  for (const id of layers) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, 'text-transform', 'none');
    map.setLayoutProperty(id, 'text-font', ['Noto Sans Bold']);
    if (sizeOverrides[id]) map.setLayoutProperty(id, 'text-size', sizeOverrides[id]);
  }
  // Hide state boundaries (country boundaries patched in _patchStyleBoundaries)
  if (map.getLayer('boundary_state')) map.setLayoutProperty('boundary_state', 'visibility', 'none');
  // Shrink non-Latin country labels (e.g. Arabic, Cyrillic) to 70% of the Latin label size.
  // Both styles use concat(latin, "\n", nonlatin) — replace with format() for per-segment scaling.
  const countryLayers = [
    'place_country_major','place_country_minor','place_country_other',
    'label_country_1','label_country_2','label_country_3'
  ];
  const fmt = ["format",
    ["case",["has","name:nonlatin"],["get","name:latin"],["coalesce",["get","name_en"],["get","name"]]],{},
    ["case",["has","name:nonlatin"],["concat","\n",["get","name:nonlatin"]],""],{"font-scale":0.7}
  ];
  for (const id of countryLayers) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'text-field', fmt);
  }
}

// Move all symbol (label) layers above road/line layers so text isn't hidden behind streets.
function raiseLabelsAboveRoads() {
  const style = map.getStyle();
  if (!style || !style.layers) return;
  const symbolIds = style.layers
    .filter(l => l.type === 'symbol' && l.id !== 'photo-pins-layer')
    .map(l => l.id);
  for (const id of symbolIds) {
    try { map.moveLayer(id); } catch(_) {}
  }
  // Ensure photo pins are always on top
  if (map.getLayer('photo-pins-layer')) {
    try { map.moveLayer('photo-pins-layer'); } catch(_) {}
  }
}

// Patch a style JSON before setStyle() so water customizations render from the first frame.
// - Removes text halo from water labels
// Patch dark style boundary layers: show non-maritime country boundaries with subtle color.
// Must be done pre-setStyle so the filter applies from the first frame.
function _patchStyleBoundaries(styleObj) {
  if (_mapStyle !== 'dark' || !styleObj || !styleObj.layers) return;
  for (const layer of styleObj.layers) {
    if (layer.id === 'boundary_country_z0-4' || layer.id === 'boundary_country_z5-') {
      // Exclude maritime boundaries (coastline outlines)
      const noMaritime = ['!=', ['get', 'maritime'], 1];
      if (Array.isArray(layer.filter) && layer.filter[0] === 'all') {
        layer.filter.push(noMaritime);
      } else if (layer.filter) {
        layer.filter = ['all', layer.filter, noMaritime];
      } else {
        layer.filter = noMaritime;
      }
      if (!layer.paint) layer.paint = {};
      layer.paint['line-color'] = 'rgba(140,160,190,0.28)';
    }
  }
}

// - Sets water label color (darker blue for light, readable blue for dark)
// - Adds missing ocean point label layer to dark style
// - Sets ocean fill color for light mode
function _patchStyleWater(styleObj) {
  if (!styleObj || !styleObj.layers) return styleObj;
  // Remove unsupported layer types that cause MapLibre v5 validation errors
  styleObj.layers = styleObj.layers.filter(l => l.type !== 'sky');
  if (styleObj.sky) delete styleObj.sky;
  if (styleObj.terrain) delete styleObj.terrain;
  // Strip natural-earth terrain raster in Light Map (not enriched) to speed up rendering
  if (_mapStyle === 'light') {
    styleObj.layers = styleObj.layers.filter(l => l.id !== 'natural_earth');
    if (styleObj.sources) delete styleObj.sources['ne2_shaded'];
  }
  // Apple Maps Dark palette — neutral dark land, distinctly blue water.
  // Colors pre-compensated for canvas filter brightness(1.8) contrast(0.9).
  if (_mapStyle === 'dark') {
    // Darker water for Dark Map
    const waterColor = '#17212b';
    for (const layer of styleObj.layers) {
      if (!layer.paint) layer.paint = {};
      if (layer.type === 'fill' && /^water/.test(layer.id)) {
        layer.paint['fill-color'] = waterColor;
      }
    }
  }
  const color = _mapStyle === 'dark' ? '#6a9fd8' : '#2c5f8a';
  let hasPointLabel = false;
  for (const layer of styleObj.layers) {
    if (layer.type === 'symbol' && layer.id.startsWith('water_name')) {
      if (!layer.paint) layer.paint = {};
      layer.paint['text-halo-width'] = 0;
      delete layer.paint['text-halo-color'];
      layer.paint['text-color'] = color;
      if (layer.id === 'water_name_point_label') hasPointLabel = true;
    }
  }
  // Hide major city labels at zoom 10+ so they don't mislead when right-clicking returns a sub-area
  const cityLayers = ['place_city', 'place_city_large', 'label_city', 'label_city_capital'];
  // Show state/province labels only at zoom 2.5+
  const stateLayers = ['place_state', 'label_state'];
  for (const layer of styleObj.layers) {
    if (cityLayers.includes(layer.id)) {
      layer.maxzoom = 10;
    }
    if (stateLayers.includes(layer.id)) {
      layer.minzoom = 2.5;
    }
  }

  // Dark style lacks a point-based water label layer — add one for ocean names
  // Guard on openmaptiles source existing (satellite style uses a different source)
  if (_mapStyle === 'dark' && !hasPointLabel && styleObj.sources && styleObj.sources['openmaptiles']) {
    const insertIdx = styleObj.layers.findIndex(l => l.id === 'water_name');
    const pointLayer = {
      id: 'water_name_point_label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      filter: ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
      layout: {
        'text-field': ['case', ['has', 'name:nonlatin'], ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']], ['coalesce', ['get', 'name_en'], ['get', 'name']]],
        'text-font': ['Noto Sans Italic'],
        'text-letter-spacing': 0.2,
        'text-max-width': 5,
        'text-size': ['interpolate', ['linear'], ['zoom'], 0, 10, 8, 14]
      },
      paint: { 'text-color': color, 'text-halo-width': 0 }
    };
    if (insertIdx !== -1) styleObj.layers.splice(insertIdx + 1, 0, pointLayer);
    else styleObj.layers.push(pointLayer);
  }

  // Add labels for oceans missing from OpenMapTiles vector tiles.
  // Guard on glyphs URL existing — satellite style has no font support.
  if (!styleObj.glyphs) return styleObj;
  const missingOceans = [
    { name: 'Indian Ocean', coords: [73, -20] },
    { name: 'Arctic Ocean', coords: [0, 80] },
  ];
  styleObj.sources['missing-oceans'] = {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: missingOceans.map(o => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: o.coords },
        properties: { name: o.name, name_en: o.name }
      }))
    }
  };
  styleObj.layers.push({
    id: 'missing_ocean_labels',
    type: 'symbol',
    source: 'missing-oceans',
    layout: {
      'text-field': ['get', 'name_en'],
      'text-font': ['Noto Sans Italic'],
      'text-letter-spacing': 0.2,
      'text-max-width': 5,
      'text-size': ['interpolate', ['linear'], ['zoom'], 0, 10, 8, 14]
    },
    paint: { 'text-color': color, 'text-halo-width': 0 }
  });

  return styleObj;
}


// Reduce label sizes at low zoom levels (z1-6) to prevent oversized text on world view.
// Captures each layer's original text-size and applies a zoom-dependent scale reduction.
// Flattens into a single interpolation to avoid MapLibre's nested zoom-expression error.
const _origTextSizes = {};
const _labelScaleStops = [[1, 1.0], [4, 1.0], [6, 1.0], [8, 1.15], [12, 1.0]];

function _scaledTextSize(orig) {
  // Numeric: straightforward multiply at each zoom stop
  if (typeof orig === 'number') {
    const stops = _labelScaleStops.flatMap(([z, s]) => [z, Math.round(orig * s * 10) / 10]);
    return ['interpolate', ['linear'], ['zoom'], ...stops];
  }
  // Zoom-based interpolation: ["interpolate", [...], ["zoom"], z1, v1, z2, v2, ...]
  if (Array.isArray(orig) && orig[0] === 'interpolate' && Array.isArray(orig[2]) && orig[2][0] === 'zoom') {
    const pairs = [];
    for (let i = 3; i < orig.length; i += 2) pairs.push([orig[i], orig[i + 1]]);
    // Linearly interpolate the original curve at a given zoom
    const lerp = (z) => {
      if (z <= pairs[0][0]) return pairs[0][1];
      if (z >= pairs[pairs.length - 1][0]) return pairs[pairs.length - 1][1];
      for (let i = 0; i < pairs.length - 1; i++) {
        if (z >= pairs[i][0] && z <= pairs[i + 1][0]) {
          const t = (z - pairs[i][0]) / (pairs[i + 1][0] - pairs[i][0]);
          return pairs[i][1] + t * (pairs[i + 1][1] - pairs[i][1]);
        }
      }
      return pairs[pairs.length - 1][1];
    };
    const stops = _labelScaleStops.flatMap(([z, s]) => [z, Math.round(lerp(z) * s * 10) / 10]);
    return ['interpolate', ['linear'], ['zoom'], ...stops];
  }
  // Other expression types (step, data-driven): leave unchanged to avoid errors
  return orig;
}

function applyLabelScale() {
  if (_mapStyle === 'satellite' || _mapStyle === 'satellite3d') return;
  const style = map.getStyle();
  if (!style || !style.layers) return;
  for (const layer of style.layers) {
    if (layer.id === 'photo-pins-layer') continue;
    if (!layer.layout || layer.layout['text-field'] == null || layer.layout['text-field'] === '') continue;
    if (!_origTextSizes[layer.id]) {
      _origTextSizes[layer.id] = layer.layout['text-size'] ?? 12;
    }
    const scaled = _scaledTextSize(_origTextSizes[layer.id]);
    map.setLayoutProperty(layer.id, 'text-size', scaled);
  }
}

function applyLabelVisibility() {
  if (_mapStyle === 'satellite' || _mapStyle === 'satellite3d') return;
  const vis = labelsVisible ? 'visible' : 'none';
  const style = map.getStyle();
  if (!style || !style.layers) return;
  for (const layer of style.layers) {
    if (layer.id === 'photo-pins-layer') continue;
    if (layer.layout && layer.layout['text-field'] != null && layer.layout['text-field'] !== '') {
      map.setLayoutProperty(layer.id, 'visibility', vis);
    }
  }
}
function toggleLabels() {
  labelsVisible = !labelsVisible;
  localStorage.setItem('matrix-labels', labelsVisible ? 'visible' : 'hidden');
  applyLabelVisibility();
  const btn = document.getElementById('labels-toggle-btn');
  if (btn) {
    btn.style.opacity = labelsVisible ? '1' : '.4';
    btn.title = labelsVisible ? 'Hide labels' : 'Show labels';
  }
}

// Apply vivid parks, airport runways, mountain peaks, and optional 3D buildings
function applyExtraLayers() {
  const hasOmt = map.getSource && map.getSource('openmaptiles');
  if (!hasOmt || ['satellite', 'satellite3d', 'globe'].includes(_mapStyle)) return;

  // Vivid park fill — more saturated green over the base park layer
  if (!map.getLayer('matrix-park-vivid')) {
    map.addLayer({
      id: 'matrix-park-vivid',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      minzoom: 5,
      paint: {
        'fill-color': '#5aab5a',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.08, 12, 0.18]
      }
    }, 'park_outline');
  }

  // Airport runway & taxiway fill — visible from zoom 9+
  if (!map.getLayer('matrix-aeroway-fill')) {
    map.addLayer({
      id: 'matrix-aeroway-fill',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'aeroway',
      minzoom: 9,
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
      paint: {
        'fill-color': '#d8d4cb',
        'fill-opacity': 0.6
      }
    }, 'aeroway_fill');
  }
  if (!map.getLayer('matrix-aeroway-runway')) {
    map.addLayer({
      id: 'matrix-aeroway-runway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'aeroway',
      minzoom: 10,
      filter: ['==', ['get', 'class'], 'runway'],
      paint: {
        'line-color': '#c8c4bb',
        'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 10, 1, 18, 12]
      }
    });
  }

  // Mountain peak labels — shows summit names at zoom 10+
  if (!map.getLayer('matrix-mountain-peaks')) {
    map.addLayer({
      id: 'matrix-mountain-peaks',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 10,
      filter: ['==', ['get', 'class'], 'mountain'],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.5],
        'icon-image': 'mountain_11',
        'icon-size': 0.8,
        'icon-allow-overlap': false,
        'text-allow-overlap': false
      },
      paint: {
        'text-color': _mapStyle === 'dark' ? '#a0b8c0' : '#5a7a8a',
        'text-halo-color': _mapStyle === 'dark' ? '#1a2530' : '#ffffff',
        'text-halo-width': 1.5
      }
    });
  }

  // 3D buildings — only when toggled on, zoom 15+
  apply3DBuildings();
}

function apply3DBuildings() {
  if (!map.getSource || !map.getSource('openmaptiles')) return;
  const noBuildings = ['satellite', 'satellite3d', 'terrain3d', 'globe'];
  const shouldShow = buildings3DVisible && !noBuildings.includes(_mapStyle);
  // Toggle the style's native fill-extrusion layers (OpenFreeMap styles include 3D buildings)
  const styleLayers = map.getStyle()?.layers || [];
  const nativeExtrusions = styleLayers.filter(l => l.type === 'fill-extrusion' && l.id !== 'matrix-buildings-3d');
  if (nativeExtrusions.length) {
    const vis = shouldShow ? 'visible' : 'none';
    nativeExtrusions.forEach(l => map.setLayoutProperty(l.id, 'visibility', vis));
  } else if (shouldShow && !map.getLayer('matrix-buildings-3d')) {
    // Style lacks native 3D buildings — add custom layer (e.g. dark mode)
    const firstSymbol = styleLayers.find(l => l.type === 'symbol');
    map.addLayer({
      id: 'matrix-buildings-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': _mapStyle === 'dark' ? '#2a2e3a' : '#d9d6d0',
        'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-opacity': 0.75
      }
    }, firstSymbol?.id);
  } else if (!shouldShow && map.getLayer('matrix-buildings-3d')) {
    map.removeLayer('matrix-buildings-3d');
  }
  const btn = document.getElementById('tb-3d-buildings');
  if (btn) btn.style.opacity = buildings3DVisible ? '1' : '.4';
}

function toggle3DBuildings() {
  buildings3DVisible = !buildings3DVisible;
  localStorage.setItem('matrix-3d-buildings', buildings3DVisible ? 'visible' : 'hidden');
  apply3DBuildings();
}

function addPinLayers() {
  if (!map.getSource('photo-pins')) {
    map.addSource('photo-pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer('photo-pins-layer')) {
    map.addLayer({ id: 'photo-pins-layer', type: 'symbol', source: 'photo-pins',
      layout: { 'icon-image': ['get', 'iconId'], 'icon-size': 1,
        'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center' }
    });
  }
  // Click handler for canvas-rendered pins
  map.on('click', 'photo-pins-layer', (e) => {
    if (!e.features || !e.features.length) return;
    const f = e.features[0];
    const lat = parseFloat(f.properties.lat);
    const lng = parseFloat(f.properties.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    e.originalEvent.stopPropagation();
    if (_playbackActive) { stopPlayback(); return; }
    try { openPinPopup(lat, lng); } catch(err) { console.error(err); }
    const isEmpty = f.properties.iconId === 'pin-empty';
    if (!isEmpty) {
      // Zoom in by at most 4 levels from current zoom, capped at 14
      // Prevents a jarring jump from low zoom levels (e.g. zoom 3 → 14)
      const targetZoom = Math.min(Math.max(map.getZoom(), map.getZoom() + 4), 14);
      const needsZoom = map.getZoom() < targetZoom;
      const dist = Math.hypot(map.getCenter().lng - lng, map.getCenter().lat - lat);
      const alreadyThere = dist < 0.005 && !needsZoom;
      if (!alreadyThere) {
        // In 3D Terrain (pitched view), offset the focal point downward in screen space
        // so the pin appears in the visible ground area rather than drifting off-screen
        const pitchOffset = (_mapStyle === 'terrain3d' || _mapStyle === 'satellite3d') ? [0, Math.round(map.transform?.height * 0.15 || 100)] : [0, 0];
        map.flyTo({ center: [lng, lat], zoom: targetZoom, speed: 0.8, curve: 1.0, essential: true,
          offset: pitchOffset,
          easing: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2 });
      }
    }
  });
  map.on('mouseenter', 'photo-pins-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'photo-pins-layer', () => { map.getCanvas().style.cursor = ''; });
}

// ═══════════════════════════════════════
// THEME (LIGHT / DARK)
// ═══════════════════════════════════════
function initTheme() {
  const stored = localStorage.getItem('matrix-theme');
  if (stored && ['dark', 'light', 'bright', 'enriched', 'terrain3d', 'globe'].includes(stored)) {
    _mapStyle = stored;
  } else {
    _mapStyle = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme();
}
function _syncExportBtnState() {
  const exportBtn = document.getElementById('tb-export-video');
  if (exportBtn) {
    exportBtn.disabled = _mapStyle === 'globe';
    exportBtn.title = _mapStyle === 'globe' ? 'Export Video is not available in Globe mode' : 'Export trip animation as video';
  }
}

function applyTheme() {
  document.getElementById('map')?.classList.toggle('dark-map', _mapStyle === 'dark');
  _tileTemplatesCache = null;
  const btn = document.getElementById('tb-style-btn');
  const labels = { light: 'Light Map', bright: 'Bright Map', enriched: 'Terrain', dark: 'Dark Map', satellite: 'Satellite', satellite3d: '3D Satellite', terrain3d: '3D Terrain', globe: 'Globe' };
  if (btn) btn.textContent = (labels[_mapStyle] || _mapStyle) + ' ▾';
  document.querySelectorAll('.style-menu-item').forEach(el => el.classList.toggle('active', el.dataset.style === _mapStyle));
  _syncExportBtnState();
}
// Cache fetched style JSONs so switching between styles is instant after the first load
const _styleJsonCache = {};

// Shared helper: swap MapLibre style with pre-fetched + patched JSON.
// Caches raw style JSON by URL so repeat switches skip the network entirely.
async function _doStyleSwap(style) {
  const go = async () => {
    Object.keys(_origTextSizes).forEach(k => delete _origTextSizes[k]);
    let styleObj;
    if (typeof style === 'string') {
      // Use cached style JSON if available, otherwise fetch and cache
      if (_styleJsonCache[style]) {
        styleObj = JSON.parse(JSON.stringify(_styleJsonCache[style]));
      } else {
        try {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), 5000);
          const r = await fetch(style, { signal: ac.signal });
          clearTimeout(timer);
          const json = await r.json();
          _styleJsonCache[style] = json;
          styleObj = JSON.parse(JSON.stringify(json));
        } catch(_) { styleObj = style; }
      }
    } else {
      styleObj = JSON.parse(JSON.stringify(style));
    }
    if (typeof styleObj === 'object') { _patchStyleWater(styleObj); _patchStyleBoundaries(styleObj); }
    map.setStyle(styleObj);
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      _pinIconsAdded.clear();
      if (!map.getSource('photo-pins')) addPinLayers();
      normalizeDarkLabels();
      raiseLabelsAboveRoads();
      applyLabelScale();
      applyLabelVisibility();
      applyExtraLayers();
      // Re-add pin icons from pixel cache (fast) and refresh clusters
      // without rebuilding the Supercluster index (unchanged)
      // Update dark-map CSS class after pin icons are re-added with correct compensation
      document.getElementById('map')?.classList.toggle('dark-map', _mapStyle === 'dark');
      // Apply terrain + projection BEFORE refreshing clusters so markers
      // are positioned under the correct projection (globe vs mercator)
      _applyTerrainAndProjection();
      if (scIndex) {
        const pinned = photos.filter(p => p.lat !== null);
        const seen = new Set();
        pinned.forEach(p => {
          const k = locKey(p);
          if (seen.has(k)) return;
          seen.add(k);
          ensurePinIcon(p);
        });
        Object.values(domMarkers).forEach(m => m.remove());
        domMarkers = {};
        _refreshClustersNow();
      } else {
        buildClusterIndex();
      }
    };
    map.once('styledata', () => setTimeout(restore, 100));
    setTimeout(restore, 600);
  };
  go();
}

function _initMapOverlays() {
  const mapEl = document.getElementById('map');
  const zoomEl = document.createElement('div');
  zoomEl.id = 'zoom-debug';
  zoomEl.style.cssText = 'position:absolute;bottom:24px;left:8px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;z-index:10;pointer-events:none;font-family:monospace';
  mapEl.appendChild(zoomEl);
  const pitchWrap = document.createElement('div');
  pitchWrap.id = 'pitch-wrap';
  pitchWrap.style.cssText = 'position:absolute;bottom:24px;left:70px;display:none;align-items:center;z-index:10;background:rgba(0,0,0,.6);border-radius:4px;font-family:monospace;font-size:11px;color:#fff';
  const pitchEl = document.createElement('span');
  pitchEl.id = 'pitch-debug';
  pitchEl.style.cssText = 'padding:2px 6px;pointer-events:none';
  const resetViewEl = document.createElement('button');
  resetViewEl.id = 'reset-view-btn';
  resetViewEl.title = 'Reset north';
  resetViewEl.textContent = '⊙';
  resetViewEl.style.cssText = 'background:none;color:#fff;font-size:15px;border:none;border-left:1px solid rgba(255,255,255,.2);cursor:pointer;padding:0 6px;font-family:monospace;display:none;line-height:1';
  resetViewEl.addEventListener('click', () => { map.easeTo({ bearing: 0, duration: 500 }); });
  pitchWrap.appendChild(pitchEl);
  pitchWrap.appendChild(resetViewEl);
  mapEl.appendChild(pitchWrap);
  const exaggerationEl = document.createElement('div');
  exaggerationEl.id = 'exaggeration-ctrl';
  exaggerationEl.style.cssText = 'position:absolute;bottom:24px;left:310px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:2px 8px;border-radius:4px;z-index:10;font-family:monospace;display:none;align-items:center;gap:6px';
  exaggerationEl.innerHTML = '⛰ <input type="range" id="exaggeration-slider" min="1" max="3" step="0.1" value="1.2" style="width:70px;accent-color:#fff;vertical-align:middle"> <span id="exaggeration-val">1.2×</span>';
  mapEl.appendChild(exaggerationEl);
  document.getElementById('exaggeration-slider').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('exaggeration-val').textContent = val.toFixed(1) + '×';
    if (map.getTerrain()) map.setTerrain({ source: 'terrain-dem', exaggeration: val });
  });
  const coordsEl = document.createElement('div');
  coordsEl.id = 'coords-debug';
  coordsEl.style.cssText = 'position:absolute;bottom:24px;right:50px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;z-index:10;pointer-events:none;font-family:monospace;display:none';
  mapEl.appendChild(coordsEl);
  map.on('mousemove', (e) => {
    coordsEl.textContent = `${e.lngLat.lat.toFixed(4)}°, ${e.lngLat.lng.toFixed(4)}°`;
    coordsEl.style.display = '';
  });
  map.getCanvas().addEventListener('mouseout', () => { coordsEl.style.display = 'none'; });
  const updateZoom = () => {
    zoomEl.textContent = 'z' + map.getZoom().toFixed(2);
    const is3D = _mapStyle === 'terrain3d' || _mapStyle === 'satellite3d';
    if (is3D) {
      pitchWrap.style.display = 'flex';
      pitchEl.textContent = `p${map.getPitch().toFixed(0)}° b${map.getBearing().toFixed(0)}°`;
      const tilted = Math.abs(map.getBearing()) > 1;
      resetViewEl.style.display = tilted ? '' : 'none';
    } else {
      pitchWrap.style.display = 'none';
    }
    const exCtrl = document.getElementById('exaggeration-ctrl');
    if (exCtrl) exCtrl.style.display = is3D ? 'flex' : 'none';
  };
  map.on('zoom', updateZoom);
  map.on('pitch', updateZoom);
  map.on('rotate', updateZoom);
  map.on('moveend', updateZoom);
  map.on('moveend', _onMapMoveForSearch);
  map.on('moveend', _onMapMoveForPrefetch);
  updateZoom();
}

function _initMapControls() {
  normalizeDarkLabels();
  raiseLabelsAboveRoads();
  const ctrlContainer = document.querySelector('.maplibregl-ctrl-bottom-right');
  const navGroup = ctrlContainer?.querySelector('.maplibregl-ctrl-group');
  if (ctrlContainer && navGroup) {
    const wrap = document.createElement('div');
    wrap.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    wrap.id = 'labels-toggle-wrap';
    const btn = document.createElement('button');
    btn.id = 'labels-toggle-btn';
    btn.type = 'button';
    btn.className = 'maplibregl-ctrl-labels';
    btn.title = labelsVisible ? 'Hide labels' : 'Show labels';
    btn.setAttribute('aria-label', 'Toggle labels');
    btn.style.opacity = labelsVisible ? '1' : '.4';
    btn.innerHTML = '<span style="font-size:13px;font-weight:700;line-height:29px;display:block;color:var(--text);opacity:.7;font-family:var(--font)">Aa</span>';
    btn.addEventListener('click', toggleLabels);
    wrap.appendChild(btn);
    navGroup.after(wrap);

    const bldgWrap = document.createElement('div');
    bldgWrap.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    bldgWrap.id = 'buildings-toggle-wrap';
    const bldgBtn = document.createElement('button');
    bldgBtn.id = 'tb-3d-buildings';
    bldgBtn.type = 'button';
    bldgBtn.title = '3D Buildings (zoom 15+)';
    bldgBtn.setAttribute('aria-label', 'Toggle 3D buildings');
    bldgBtn.style.opacity = buildings3DVisible ? '1' : '.4';
    bldgBtn.innerHTML = '<span style="font-size:11px;font-weight:700;line-height:29px;display:block;color:var(--text);opacity:.7;font-family:var(--font)">3D</span>';
    bldgBtn.addEventListener('click', toggle3DBuildings);
    bldgWrap.appendChild(bldgBtn);
    if (['satellite', 'satellite3d', 'terrain3d', 'globe'].includes(_mapStyle)) bldgWrap.style.display = 'none';
    navGroup.before(bldgWrap);
  }
  applyLabelScale();
  applyLabelVisibility();
  applyExtraLayers();
  _applyTerrainAndProjection();
  const tileSpinner = document.getElementById('tile-spinner');
  map.on('dataloading', () => { tileSpinner?.classList.add('active'); });
  map.on('idle', () => { tileSpinner?.classList.remove('active'); });
}

async function initMap() {
  initTheme();
  // Fetch and patch style JSON before creating the map to prevent halo flash
  const styleUrl = _styleUrl();
  let initStyle;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const r = await fetch(styleUrl, { signal: ac.signal });
    clearTimeout(timer);
    const json = await r.json();
    _styleJsonCache[styleUrl] = json; // seed cache so first style switch is instant
    initStyle = JSON.parse(JSON.stringify(json));
    _patchStyleWater(initStyle);
    _patchStyleBoundaries(initStyle);
  } catch(_) { initStyle = styleUrl; }
  // Pre-warm the other style into cache so the first switch is instant
  const otherUrl = styleUrl === STYLE_DARK ? STYLE_STREET : STYLE_DARK;
  fetch(otherUrl).then(r => r.json()).then(j => { _styleJsonCache[otherUrl] = j; }).catch(() => {});
  map = new maplibregl.Map({ container:'map', style: initStyle, center:[0,20], zoom:1.8, attributionControl:false, maxTileCacheSize:200, canvasContextAttributes:{ preserveDrawingBuffer:true } });
  // Suppress non-critical style validation errors (sky/terrain-dem references in
  // unpatched style JSON when the pre-fetch falls back to URL loading)
  const _suppressedErrors = /sky|terrain-dem|non-existing layer|same source.*hillshade/i;
  map.on('error', (e) => {
    const msg = e.error?.message || e.message || '';
    if (!_suppressedErrors.test(msg)) console.error('MapLibre error:', msg);
  });
  map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'bottom-right');
  // Recover from WebGL context loss (Safari loses context after sleep or memory pressure)
  const canvas = map.getCanvas();
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // allow context to be restored
    console.warn('WebGL context lost — waiting for restore');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    console.log('WebGL context restored — reinitializing map');
    map.triggerRepaint();
  });
  // Safety net: if map is still blank after 8 seconds, show a reload prompt
  setTimeout(() => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl || gl.isContextLost()) {
      console.warn('Map canvas has no WebGL context — prompting reload');
      showToast('Map failed to load — please refresh the page', 'error');
    }
  }, 8000);
  // Provide a transparent 1x1 placeholder for any missing sprite images (e.g. POI icons)
  map.on('styleimagemissing', (e) => {
    if (!map.hasImage(e.id)) {
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    }
  });
  map.on('load', () => {
    addPinLayers();
    map.on('moveend', refreshClusters);
    _initMapOverlays();
    _initMapControls();
  });
  map.on('movestart', () => { _mapBusy = true; });
  map.on('moveend', () => { _mapBusy = false; });

  // Right-click on map to pin a location
  map.on('contextmenu', async (e) => {
    try {
    e.preventDefault();
    // Detect water vs land early — water clicks are allowed at any zoom,
    // Water clicks allowed at any zoom; land clicks require zoom >= 5.
    // Satellite/terrain3d/globe have no vector layers for water detection.
    const allHits = map.queryRenderedFeatures(e.point);
    const noVectorLayers = ['satellite', 'satellite3d', 'terrain3d', 'globe'].includes(_mapStyle);
    const isWater = !noVectorLayers && allHits.some(f => f.layer.type === 'fill' && /^(water|ocean)/.test(f.layer.id));
    // If style is mid-transition (queryRenderedFeatures returns nothing), treat as land
    if (!isWater && map.getZoom() < 5) return;
    const { lng, lat } = e.lngLat;
    // Close any existing popups
    if (activePopup) { activePopup.remove(); activePopup = null; }
    if (destMarkerObj) { destMarkerObj.marker.remove(); if (destMarkerObj.popup) destMarkerObj.popup.remove(); destMarkerObj = null; }

    // Show loading popup
    const loadingPopup = new maplibregl.Popup({ maxWidth: '240px', closeButton: true, anchor: 'left', offset: 20 })
      .setLngLat([lng, lat])
      .setHTML(`<div class="dest-popup"><div class="dest-popup-name">Looking up location...</div></div>`)
      .addTo(map);

    let clickedLabel = null;
    let labelCoords = null; // use feature's own coordinates for geocoding when a label is clicked
    if (isWater) {
      // On water: search a wider area for water name labels (the label text
      // may not be exactly at the click point)
      const r = 80;
      const box = [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]];
      const waterHits = map.queryRenderedFeatures(box);
      for (const f of waterHits) {
        if (f.layer.type !== 'symbol') continue;
        if (!/water|ocean/.test(f.layer.id)) continue;
        const n = f.properties['name_en'] || f.properties['name:latin'] || f.properties['name'];
        if (n) { clickedLabel = n; break; }
      }
    } else {
      // On land: prefer any place/POI label the user clicked on directly,
      // skip roads, water, and our own pin layer.
      for (const f of allHits) {
        if (f.layer.type !== 'symbol') continue;
        const id = f.layer.id;
        if (id === 'photo-pins-layer') continue;
        if (/^(road|highway|water|ferry|aeroway|boundary)/.test(id)) continue;
        const n = f.properties['name_en'] || f.properties['name:latin'] || f.properties['name'];
        if (n) {
          clickedLabel = n;
          // Use the feature's actual coordinates for reverse geocode — the click
          // point may be offset from the city center (e.g. Dubrovnik near Bosnia border)
          const geom = f.geometry;
          if (geom && geom.type === 'Point') {
            labelCoords = { lng: geom.coordinates[0], lat: geom.coordinates[1] };
          }
          break;
        }
      }
    }

    // Reverse geocode using label's own coordinates when available (more accurate
    // for border cities like Dubrovnik), otherwise fall back to click point
    const geoLat = labelCoords ? labelCoords.lat : lat;
    const geoLng = labelCoords ? labelCoords.lng : lng;
    const geoName = await reverseGeocode(geoLat, geoLng);
    const cacheKey = `${geoLat.toFixed(4)}_${geoLng.toFixed(4)}`;
    const placeName = clickedLabel || geoName || `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    const country = _geoCountryCache[cacheKey] || '';

    loadingPopup.remove();

    // Elevation — only in 3D Terrain mode
    let elevationStr = '';
    if (_mapStyle === 'terrain3d' || _mapStyle === 'satellite3d') {
      try {
        const elev = map.queryTerrainElevation([lng, lat]);
        if (elev !== null && elev !== undefined) {
          elevationStr = `${Math.round(elev).toLocaleString()}m`;
        }
      } catch(e) {
        // Elevation error when zoom exceeds source maxzoom — ignore
      }
    }

    // Create dest marker + confirmation popup
    const el = document.createElement('div');
    el.className = 'dest-pin-el';
    el.innerHTML = '<div class="dest-pin-el-inner">📍</div>';
    const marker = new maplibregl.Marker({ element: el, anchor: 'top-left', offset: [-14, -28] }).setLngLat([lng, lat]).addTo(map);
    marker.getElement().addEventListener('click', (ev) => { ev.stopPropagation(); reopenDestPopup(); });

    const displayName = country && country !== placeName ? `${placeName}, ${country}` : placeName;
    const popup = new maplibregl.Popup({ maxWidth: '240px', closeButton: true, offset: 30 })
      .setLngLat([lng, lat])
      .setHTML(`<div class="dest-popup"><div class="dest-popup-name">${esc(displayName)}</div>${elevationStr ? `<div class="dest-popup-detail">⛰ ${elevationStr} elevation</div>` : ''}<button class="dest-popup-btn" onclick="openPinPickerAt(${lat},${lng})">＋ Add photos to this location</button><button class="dest-popup-btn" onclick="pinEmptyLocation(${lat},${lng})">📌 Pin this location</button><div class="dest-popup-coords">${lat.toFixed(3)}, ${lng.toFixed(3)}</div></div>`)
      .addTo(map);
    popup.on('close', () => { if (destMarkerObj) { destMarkerObj.marker.remove(); destMarkerObj = null; } });

    destMarkerObj = { marker, popup };
    } catch(err) { console.error('[right-click] ERROR in handler:', err); }
  });

  // Window-level capture handler — fires before anything else can intercept.
  window.addEventListener('click', function(e) {
    const wrapper = e.target.closest?.('.pin-el');
    if (!wrapper || !wrapper.dataset.lat) return;
    const lat = parseFloat(wrapper.dataset.lat);
    const lng = parseFloat(wrapper.dataset.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    try { openPinPopup(lat, lng); } catch(err) { console.error(err); }
    const k = locKey({lat, lng});
    const isEmpty = photos.filter(p => locKey(p) === k).every(p => p.isEmptyPin);
    if (!isEmpty) {
      const targetZoom = Math.max(map.getZoom(), 14);
      const dist = Math.hypot(map.getCenter().lng - lng, map.getCenter().lat - lat);
      const alreadyThere = dist < 0.005 && map.getZoom() >= 13;
      if (!alreadyThere) map.flyTo({ center:[lng, lat], zoom:targetZoom, duration:1200, offset:[0, 150] });
    }
  }, true); // capture phase at window level — nothing can intercept before this
}

// Ctrl+Shift+D to trigger demo
// Ctrl+Shift+G to trigger globe rotation demo
// See js/demo.js for implementations

// ═══════════════════════════════════════
// FIT MAP
// ═══════════════════════════════════════
// Fade out markers, clear them, run a map animation, then rebuild markers at the end
function animateMapClean(animFn) {
  _animatingMap = true;
  Object.values(domMarkers).forEach(m => {
    m.getElement().style.transition = 'opacity .2s ease';
    m.getElement().style.opacity = '0';
  });
  setTimeout(() => {
    Object.values(domMarkers).forEach(m => m.remove());
    domMarkers = {};
    map.once('moveend', () => { _animatingMap = false; _refreshClustersNow(); });
    animFn();
  }, 200);
}

function zoomOut() {
  if (activePopup) { activePopup.remove(); activePopup = null; }
  animateMapClean(() => map.easeTo({ zoom: Math.max(map.getZoom() - 3, 1), duration: 1200 }));
}

function fitAll(animate=true) {
  if (activePopup) { activePopup.remove(); activePopup = null; }
  const pts = photos.filter(p => p.lat !== null);
  if (!pts.length) return;
  const lngs=pts.map(p=>p.lng), lats=pts.map(p=>p.lat);
  if (!animate) {
    if (pts.length === 1) map.jumpTo({center:[pts[0].lng,pts[0].lat],zoom:12});
    else map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:80,maxZoom:12,duration:0});
    _refreshClustersNow();
    return;
  }
  animateMapClean(() => {
    if (pts.length === 1) map.easeTo({center:[pts[0].lng,pts[0].lat],zoom:12,duration:1400});
    else map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:80,maxZoom:12,duration:1400});
  });
}

// ═══════════════════════════════════════
// MAP STYLE DROPDOWN
// ═══════════════════════════════════════
function toggleStyleMenu(e) {
  e && e.stopPropagation();
  const menu = document.getElementById('style-menu');
  menu.classList.toggle('open');
  // Update active indicator
  menu.querySelectorAll('.style-menu-item').forEach(el => el.classList.toggle('active', el.dataset.style === _mapStyle));
}

function setMapStyle(mode) {
  const wasDark = _mapStyle === 'dark';
  _mapStyle = mode;
  // Persist style preference (satellite/satellite3d reset to previous on reload)
  if (mode !== 'satellite' && mode !== 'satellite3d') localStorage.setItem('matrix-theme', mode);

  // Defer dark-map CSS class removal until pin icons are re-added with correct
  // compensation (otherwise pre-darkened images render without the CSS filter)
  const mapEl = document.getElementById('map');
  if (_mapStyle === 'dark') mapEl.classList.add('dark-map');
  mapEl.classList.toggle('sat-mode', ['satellite', 'satellite3d', 'terrain3d', 'globe'].includes(_mapStyle));

  // Labels toggle visibility
  const labelsWrap = document.getElementById('labels-toggle-wrap');
  if (labelsWrap) labelsWrap.style.visibility = (_mapStyle === 'satellite' || _mapStyle === 'satellite3d') ? 'hidden' : 'visible';
  // Hide 3D buildings toggle in modes where buildings don't make sense
  const bldgWrap = document.getElementById('buildings-toggle-wrap');
  if (bldgWrap) bldgWrap.style.display = ['satellite', 'satellite3d', 'terrain3d', 'globe'].includes(_mapStyle) ? 'none' : '';

  _syncExportBtnState();

  // Update button label
  const labels = { light: 'Light Map', bright: 'Bright Map', enriched: 'Terrain', dark: 'Dark Map', satellite: 'Satellite', satellite3d: '3D Satellite', terrain3d: '3D Terrain', globe: 'Globe' };
  const btn = document.getElementById('tb-style-btn');
  if (btn) btn.textContent = (labels[mode] || mode) + ' ▾';

  // Update active state in menu
  document.querySelectorAll('.style-menu-item').forEach(el => el.classList.toggle('active', el.dataset.style === mode));

  // Close the dropdown
  document.getElementById('style-menu').classList.remove('open');

  // Clean up terrain + projection before swapping styles so the style diff doesn't fail
  // (terrain-dem source added via map.addSource would cause a diff error if left attached)
  if (map.getTerrain()) map.setTerrain(null);
  if (map.setProjection) map.setProjection({ type: 'mercator' });

  _doStyleSwap(_styleUrl());
}

function _applyTerrainAndProjection() {
  const is3D = _mapStyle === 'terrain3d' || _mapStyle === 'satellite3d';
  const isGlobe = _mapStyle === 'globe';

  // Set projection FIRST — before any camera moves — so easeTo never runs under the wrong projection
  if (map.setProjection) {
      // Add atmospheric fog for depth perception in 3D modes
      if (map.setFog) {
        map.setFog({
          color: 'white',
          'high-color': '#add8e6',
          'horizon-blend': 0.3,
          atmosphere: 0.5
        });
      }
    map.setProjection({ type: isGlobe ? 'globe' : 'mercator' });
  }

  // Terrain — AWS Terrain Tiles (free, no API key, terrarium encoding)
  if (is3D) {
    // Use separate sources for terrain mesh and hillshade to improve rendering quality
    if (!map.getSource('terrain-dem')) {
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 512, maxzoom: 15, encoding: 'terrarium'
      });
    }
    if (!map.getSource('hillshade-dem')) {
      map.addSource('hillshade-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 512, maxzoom: 15, encoding: 'terrarium'
      });
    }
    const sliderEl = document.getElementById('exaggeration-slider');
    const exaggeration = sliderEl ? parseFloat(sliderEl.value) : 1.2;
    map.setTerrain({ source: 'terrain-dem', exaggeration });
      map.setPaintProperty('terrain-dem', 'raster-blur', 3);
        // Add sky layer for atmospheric background in 3D
        if (map.getLayer('sky') === undefined) {
          map.addLayer({ id: 'sky', type: 'sky', paint: { 'sky-type': 'gradient', 'sky-gradient': ['interpolate', ['linear'], ['sky-radial-progress'], 0, 'rgba(255,255,255,0)', 0.5, '#87cefa', 1, '#4682b4'] } });
        }
    if (_mapStyle !== 'satellite3d' && !map.getLayer('terrain-hillshade')) {
      // Insert below the first road/label layer so hillshading shows through
      const firstSymbol = map.getStyle().layers.find(l => l.type === 'line' || l.type === 'symbol');
      map.addLayer({
        id: 'terrain-hillshade',
        type: 'hillshade',
        source: 'hillshade-dem',
        paint: {
          'hillshade-exaggeration': 1.0,
          'hillshade-illumination-direction': 270,
          'hillshade-illumination-anchor': 'viewport',
          'hillshade-shadow-color': '#1a2a35',
          'hillshade-highlight-color': '#f0f4f8',
          'hillshade-accent-color': '#2d4a5a',
        }
      }, firstSymbol?.id);
        // Add 3D building extrusion if OpenMapTiles source is present
        if (map.getSource('openmaptiles') && !map.getLayer('3d-buildings')) {
          map.addLayer({
            id: '3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 15,
            paint: {
              'fill-extrusion-color': '#ddd',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.6
            }
          }, 'terrain-hillshade');
        }
    }
    map.easeTo({ pitch: 50, bearing: 0, duration: 800 });
  } else {
    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer('terrain-hillshade')) map.removeLayer('terrain-hillshade');
    if (isGlobe) {
      map.setMinZoom(1);
      map.flyTo({ center: [0, 0], zoom: 2, pitch: 0, bearing: 0, duration: 800 });
    } else {
      map.setMinZoom(-2);
      map.jumpTo({ pitch: 0, bearing: 0 });
    }
  }
}
