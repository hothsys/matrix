# Tips & Features

## Photo tips

- **JPEG photos from iPhones** almost always have GPS data embedded — they'll auto-pin perfectly.
- Photos **without GPS** still appear in the sidebar and can be manually pinned via the metadata editor or destination search.
- **Right-click the map** to pin any location and add photos to it.
- **Countries visited** flags appear automatically as you click pins. Country codes are persisted so they load instantly on refresh.
- The app works in both **Chrome and Safari** on macOS.

## Video export

The **Play** button animates the map between your pinned locations in chronological order. **Export Video** records this animation using the browser's `MediaRecorder` API and saves it as a `.webm` file (VP9 codec, 40 Mbps).

- WebM plays natively in Chrome, Firefox, and VLC.
- For Apple apps (QuickTime, iMovie, Photos): `ffmpeg -i trip.webm trip.mp4`
- Export Video is not available in Globe mode.

## Offline support

The app works offline after your first visit:

- **Vendor libraries** are bundled locally in `vendor/` (auto-downloaded on first `serve.py` run)
- **Map tiles** are served from cache — previously viewed areas render without internet
- **Photos, albums, and timeline** work fully offline (stored in IndexedDB)
- **Destination search and geocoding** require internet — a friendly message appears when offline
- An **orange banner** appears at the top when you're offline

## Search

The search bar supports both place names and GPS coordinates:
- Type a place name: `Eiffel Tower` → flies to location
- Type coordinates: `48.8584, 2.2945` → reverse geocodes and flies to location
- Supports formats: `48.8566, 2.3522` · `48.8566° N, 2.3522° E` · `-33.8688, 151.2093`

## 3D Terrain

- Use the **exaggeration slider** (bottom-left in 3D Terrain mode) to adjust terrain height (1× to 3×)
- **Right-click** in 3D Terrain mode shows elevation in meters in the popup
- The **⊙ reset button** appears when bearing is non-zero — click to snap back to north
- Terrain artifacts at zoom 15+ are a limitation of the free AWS Terrain Tiles (~30m resolution)
