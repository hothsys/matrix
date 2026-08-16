// Matrix — Service Worker for offline support
const CACHE_VERSION = 'matrix-v21';
const APP_CACHE = `${CACHE_VERSION}-app`;
const TILE_CACHE = `${CACHE_VERSION}-tiles`;

// App shell files to pre-cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/utils.js',
  '/js/state.js',
  '/js/map.js',
  '/js/pins.js',
  '/js/photos.js',
  '/js/albums.js',
  '/js/modals.js',
  '/js/search.js',
  '/js/media.js',
  '/js/photo-worker.js',
  '/js/data.js',
  '/js/demo.js',
  '/vendor/maplibre-gl.js',
  '/vendor/maplibre-gl.css',
  '/vendor/supercluster.min.js',
  '/vendor/fonts.css',
];

// Tile URL patterns to cache (raster + vector tiles, sprites, glyphs)
const TILE_PATTERNS = [
  /tiles\.openfreemap\.org\/planet\//,  // vector tiles only (not style JSON)
  /tiles\.maps\.eox\.at/,
  /\.pbf(\?|$)/,     // vector tile protobuf files
  /sprites?\//,       // map sprites
  /glyphs?\//,        // map font glyphs
];

// Max cached tiles (LRU eviction when exceeded). Kept well below Chrome's
// cache.keys() limit (~10k entries) which throws "Operation too large".
const MAX_TILES = 5000;

console.log(`SW: ${CACHE_VERSION} loaded`);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        // Don't fail install if some files aren't available yet
        console.warn('SW: Some app shell files not cached:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const current = new Set([APP_CACHE, TILE_CACHE]);
      const oldTileCaches = keys.filter((k) => !current.has(k) && k.endsWith('-tiles'));
      const oldAppCaches = keys.filter((k) => !current.has(k) && !k.endsWith('-tiles'));

      // Old tile caches are preserved (tiles are map data — still valid across
      // app updates). But if a cache grew too large for Chrome to enumerate
      // (cache.keys() throws "Operation too large"), it can never be evicted
      // selectively, so reset it entirely.
      await Promise.all(oldTileCaches.map(async (name) => {
        try {
          const cache = await caches.open(name);
          await cache.keys();
        } catch {
          console.warn(`SW: cache ${name} too large to enumerate, resetting`);
          await caches.delete(name);
        }
      }));

      await Promise.all(oldAppCaches.map((k) => caches.delete(k)));
    })
  );
  self.clients.claim();
});

function isTileRequest(url) {
  return TILE_PATTERNS.some((p) => p.test(url));
}

function isLocalApi(url) {
  return new URL(url).pathname.startsWith('/api/');
}

function isNominatim(url) {
  return url.includes('nominatim.openstreetmap.org');
}

function isFontFile(url) {
  return url.includes('/vendor/fonts/') || url.includes('fonts.gstatic.com');
}

// Network-first for app shell, cache-first for tiles
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Only handle http(s) requests — ignore chrome-extension://, etc.
  if (!url.startsWith('http')) return;

  // Don't intercept local API calls or POST/DELETE requests
  if (isLocalApi(url) || request.method !== 'GET') {
    return;
  }

  // Don't cache Nominatim — it's transient geocoding data
  if (isNominatim(url)) {
    return;
  }

  // Map tiles: cache-first (tiles don't change often)
  if (isTileRequest(url)) {
    event.respondWith(tileStrategy(request));
    return;
  }

  // Font files: cache-first
  if (isFontFile(url)) {
    event.respondWith(cacheFirst(request, APP_CACHE));
    return;
  }

  // Everything else (app shell): network-first with cache fallback
  event.respondWith(networkFirst(request, APP_CACHE));
});

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    throw err;
  }
}

const TRANSPARENT_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII='), c => c.charCodeAt(0));

async function tileStrategy(request) {
  // L1: browser Cache API (instant)
  let cached;
  try {
    cached = await caches.match(request, { ignoreVary: true });
  } catch (err) {
    // Cache may be corrupted or too large to query — fall through to L2/L3
  }
  if (cached) return cached;

  const proxyUrl = `${self.location.origin}/api/tiles/proxy?url=${encodeURIComponent(request.url)}`;

  const cacheAndReturn = async (body, ct) => {
    try {
      const cacheResp = new Response(body, { status: 200, headers: { 'Content-Type': ct } });
      const cache = await caches.open(TILE_CACHE);
      cache.put(request, cacheResp.clone());
      evictOldTiles(cache).catch(() => {});
      return cacheResp;
    } catch {
      return new Response(body, { status: 200, headers: { 'Content-Type': ct } });
    }
  };

  // Race L2 (disk) and L3 (origin) — whichever responds first wins
  const diskCheck = fetch(proxyUrl).then(r => {
    if (!r.ok) throw new Error('miss');
    return r.arrayBuffer().then(body => ({ body, ct: r.headers.get('Content-Type') || 'application/octet-stream' }));
  });

  const originFetch = fetch(request).then(r => {
    if (!r.ok) throw new Error('origin error');
    return r.arrayBuffer().then(body => {
      const ct = r.headers.get('Content-Type') || 'application/octet-stream';
      // Save to disk in background
      fetch(`${self.location.origin}/api/tiles/cache?url=${encodeURIComponent(request.url)}`, {
        method: 'POST', body: body.slice(0)
      }).catch(() => {});
      return { body, ct };
    });
  });

  try {
    const { body, ct } = await Promise.any([diskCheck, originFetch]);
    return cacheAndReturn(body, ct);
  } catch {
    return new Response(TRANSPARENT_PNG, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
    });
  }
}

function zoomFromUrl(url) {
  // Tile URLs contain /{z}/{x}/{y} — extract z from the path
  const m = url.match(/\/(\d+)\/\d+\/\d+(?:\.pbf)?(?:\?|$)/);
  return m ? parseInt(m[1], 10) : 99;
}

let lastEvictCheck = 0;

async function evictOldTiles(cache) {
  // Don't enumerate the whole cache on every tile put — Chrome throws
  // "Operation too large" when a cache has too many entries to list.
  const now = Date.now();
  if (now - lastEvictCheck < 5000) return;
  lastEvictCheck = now;

  let keys;
  try {
    keys = await cache.keys();
  } catch (err) {
    // Cache too large to enumerate — can't evict selectively, so reset it.
    console.warn('SW: tile cache too large, resetting');
    await caches.delete(TILE_CACHE);
    return;
  }
  if (keys.length <= MAX_TILES) return;
  // Protect low-zoom tiles (z ≤ 8) — they cover the most area
  const protectedKeys = [];
  const evictableKeys = [];
  keys.forEach((k) => {
    if (zoomFromUrl(k.url) <= 8) protectedKeys.push(k);
    else evictableKeys.push(k);
  });
  let excess = keys.length - MAX_TILES;
  // Evict high-zoom tiles first (oldest first)
  const toDelete = evictableKeys.slice(0, Math.min(excess, evictableKeys.length));
  excess -= toDelete.length;
  // If still over limit, evict protected tiles too
  if (excess > 0) toDelete.push(...protectedKeys.slice(0, excess));
  await Promise.all(toDelete.map((k) => cache.delete(k)));
}
