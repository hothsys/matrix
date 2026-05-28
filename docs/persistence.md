# Data Persistence

## How data is stored

- **IndexedDB** — all photos, albums, and metadata persist in the browser across sessions.
- **serve.py auto-save** — when running with the local server, data is also saved to `matrix-data.json` and photos to `matrix-photos/` on disk. This provides a durable backup that survives browser data clearing.

## Export / Import

Use the settings menu (⚙) to export your data as a gzip-compressed `.json.gz` file or import a backup. Importing supports both compressed (`.json.gz`) and plain (`.json`) files.

- Empty location pins are excluded from exports automatically.
- The export includes all photo metadata but not the full-size image files themselves.

## Migrating between machines

To move your data to another machine:

1. Export your data via Settings → **Export Data** → saves a `.json.gz` file
2. Copy both the `.json.gz` file and the `matrix-photos/` directory to the new machine
3. On the new machine, import via Settings → **Import Data**

The `matrix-photos/` directory contains full-size images and thumbnails. Without it, photos will appear in the list but won't display in the lightbox.

## Clearing the map tile cache

Settings → **Empty Map Cache** wipes the `matrix-tiles/` directory. Tiles are re-downloaded as you browse. This also flushes the browser's Cache API tile store.
