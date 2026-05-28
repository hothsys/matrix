# Data Storage

All data storage is cross-browser (Chrome, Firefox, Safari) — none depends on the service worker.

| Storage | What it stores | Purpose | Cross-browser |
|---|---|---|---|
| **IndexedDB** | Photo objects (full-size base64 image + thumbnail + all metadata), album objects, geo caches | Primary data store — the app reads from here on every load | Yes |
| **Disk (matrix-data.json)** | JSON dump of all IndexedDB content | Backup that survives browser data clearing; auto-saved by `serve.py` | Yes |
| **Disk (matrix-photos/)** | Individual image files (`{id}.jpg`, `{id}_thumb.jpg`) extracted from base64 | Used by the export flow (avoids embedding huge base64 in JSON) and for lightbox display after import | Yes |

**IndexedDB** is the source of truth during normal use. `matrix-data.json` and `matrix-photos/` are redundant backups maintained by `serve.py`. If you clear browser data, the app offers to restore from `matrix-data.json` on next load.

## Scalability note

IndexedDB currently stores full-size images as base64 inside each photo record. At scale (thousands of large photos), this can cause high memory usage at startup since all records are loaded into memory. A future refactor will move full-size images to `matrix-photos/` only, keeping IndexedDB lean (metadata + thumbnails). See the [planned refactor](../plans/reactive-bubbling-creek.md) for details.
