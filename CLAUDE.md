---
name: matrix-project
description: CLAUDE.md for the Matrix project - local-first travel photo mapping app
metadata:
  project_type: travel-photo-mapping
  test_framework: playwright
---

# Matrix Project

A local-first travel photo mapping app. Runs entirely in the browser with no account needed.

## Running the App

```bash
# Start server (default port 8765)
python3 serve.py

# Start on custom port
python3 serve.py 8080
```

## Running Tests

```bash
python3 serve.py --run-tests
```

## Project Structure

```
matrix/
├── assets/                # Images/gifs for README
├── css/                   # Stylesheets
├── js/                    # JavaScript modules
├── tests/
│   └── fixtures/          # Test images (tokyo.jpg, paris.jpg, nyc.jpg, etc.)
├── vendor/                # Downloaded dependencies (maplibre-gl, fonts, etc.)
├── serve.py               # Local server with auto-save
├── index.html             # Main app
├── sw.js                  # Service worker for tile caching
├── dependencies.json      # Vendor dependency manifest
└── matrix-data.json      # Auto-save backup (runtime)
```

## Runtime Directories

- `matrix-photos/` - Full-size images and thumbnails
- `matrix-tiles/` - Cached map tiles

## Dependencies

Vendor dependencies defined in `dependencies.json`:
- `maplibre-gl` - Map visualization library
- `supercluster` - Clustering library
- `exif-js` - EXIF metadata extraction

## Testing

Test images are stored in `tests/fixtures/`:
- `tokyo.jpg`
- `paris.jpg`
- `nyc.jpg`
- `noexif.jpg`
- `nogps.jpg`