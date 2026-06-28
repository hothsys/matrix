# Data Storage

All data storage is cross-browser (Chrome, Firefox, Safari) — none depends on the service worker.

| Storage | What it stores | Purpose |
|---|---|---|
| **matrix-photos/** | Full-size images (`{id}.jpg`) and thumbnails (`{id}_thumb.jpg`) | Source of truth for image data — written on upload, served directly for display |
| **IndexedDB** | Photo metadata (coords, date, camera, notes) + file path references to `matrix-photos/`, album objects | Source of truth for metadata — the app reads from here on every load |
| **matrix-data.json** | JSON backup of metadata, albums, and geo caches (file paths, not image data) | Backup that survives browser data clearing; auto-saved by `serve.py` |

## How it works

**Image data** lives on disk in `matrix-photos/`. IndexedDB stores only metadata and a path reference (e.g. `matrix-photos/p_123.jpg`), keeping the database lean (~50KB/photo vs ~4MB with embedded base64). This lets the app handle tens of thousands of photos without bloating browser storage.

**On upload**, `processFiles()` saves the full-size image to disk via `POST /api/photos/{id}`, verifies the file is servable, then stores the file path in IndexedDB.

**On load**, the app reads metadata from IndexedDB and references images by their disk paths. If IndexedDB is empty (e.g. after clearing browser data), the app offers to restore metadata from `matrix-data.json`. The image files in `matrix-photos/` remain intact regardless.

**Auto-save** (`scheduleAutoSave()`) writes metadata to `matrix-data.json` via `POST /api/data` after any data-modifying action. This file contains file paths — not image data — so it stays small.
