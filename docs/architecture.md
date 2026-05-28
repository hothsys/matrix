# Architecture

## Map stack

The app uses three services working together:

- **OpenStreetMap (OSM)** — the data source. A community-maintained database of roads, buildings, boundaries, and POIs.
- **OpenFreeMap** — the tile server. Renders OSM data into vector tiles (`.pbf`) and serves style JSON. Free, no API key required.
- **MapLibre GL JS** — the rendering engine. Takes tiles and style JSON and renders an interactive map on a `<canvas>` element in the browser.

## Map styles

| Style | Description |
|---|---|
| **Light Map** | Clean vector map with muted colors (Liberty style) |
| **Bright Map** | More vivid colors and greater landuse detail |
| **Dark Map** | Dark-themed vector map with normalized labels |
| **Terrain** | Light map with natural-earth shaded relief overlay |
| **3D Terrain** | True 3D elevation via AWS Terrain Tiles with hillshading |
| **Satellite** | ArcGIS World Imagery raster tiles (Esri) |
| **Globe** | Spherical globe projection |

3D Terrain elevation data comes from **AWS Terrain Tiles** (free, no API key, terrarium encoding).

## Geocoding

**Nominatim** (run by OpenStreetMap) handles geocoding — converting place names or GPS coordinates to map locations. Requests are rate-limited to 1 per second per their usage policy.

## Vendor dependencies

| Library | Version | Purpose |
|---|---|---|
| MapLibre GL JS | 5.24.0 | Map rendering |
| Supercluster | 8.0.1 | Point clustering |
| Josefin Sans | — | UI font |

Dependencies are managed in `dependencies.json` and downloaded on first run by `serve.py`.

## Privacy

Everything stays **100% local**. No data is sent anywhere except to OpenStreetMap/Nominatim for place lookups. No account, no login, no telemetry.
