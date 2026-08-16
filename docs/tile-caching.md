# Tile Caching

Map tiles are cached in a multi-layer architecture designed for fast rendering and offline access.

## Storage Layers

| Layer | What it is | Speed | Persistence | Browser support |
|---|---|---|---|---|
| **L1 — Cache API** | Browser-side HTTP response cache, managed by the service worker | Instant (~0ms) | Cleared with browser data | Chrome, Firefox (not Safari) |
| **L2 — Disk cache** | Local filesystem at `matrix-tiles/`, served by `serve.py` | Fast (~5-10ms) | Persists until manually deleted or evicted | Chrome, Firefox (writes + reads); Safari (reads only, if tiles exist from a Chrome session) |
| **L3 — Origin** | Remote tile servers (OpenFreeMap, ArcGIS) | Network-dependent (~50-200ms) | N/A | All browsers |

## How it works

**Chrome / Firefox (with service worker):**
```
MapLibre requests tile
    → SW intercepts
    → L1 check (Cache API) — instant hit if previously fetched
    → L1 miss: race L2 (disk proxy) and L3 (origin) via Promise.any
        → Whichever responds first wins
        → Result stored in L1 for future requests
        → Origin fetches saved to L2 in background
```

**Safari (no service worker):**

Safari's service worker implementation has persistent issues. The SW is intentionally disabled in Safari. Tiles flow directly:
```
MapLibre requests tile
    → Browser fetches from origin (L3)
    → Proactive caching prefetches tiles via serve.py
    → Disk cache (L2) available for offline use via serve.py proxy
```

## Data Storage (separate from tile caching)

See [data-storage.md](data-storage.md) for full details on IndexedDB, `matrix-data.json`, and `matrix-photos/`.

## Configuration

- **Disk cache limit:** 500 MB with LRU eviction (oldest tiles removed down to 80% when exceeded)
- **Eviction runs:** at startup and after each new tile is cached
- **Eviction logging:** written to `matrix-requests.log`
- **SW Cache API limit:** 5,000 entries with zoom-aware LRU (low-zoom tiles z≤8 protected). Kept below Chrome's `cache.keys()` enumeration limit (~10k) which throws `AbortError: Operation too large`; if a tile cache somehow exceeds it, the service worker resets that cache automatically.

## URL-based versioning

Tile URLs include a version segment (e.g., `20260415_001001_pt`) that changes when OpenFreeMap rebuilds their tile set. Cached tiles are never stale — old versioned directories are cleaned up automatically when their tiles are evicted.

## Proactive caching

After app load (10s delay), tiles for the world overview (z0–3) and pinned photo locations (z4–14) are prefetched in small batches without blocking map interaction.
