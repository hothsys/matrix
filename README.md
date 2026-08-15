# <img src="logo_stroke.svg" width="100" valign="middle" hspace="10" vspace="4"/>Matrix

*A local-first travel photo mapping app. Runs entirely in your browser, no account needed.*

![Globe rotation](assets/globe.gif)

<details>
<summary>Interface</summary>

![Interface](assets/interface.png)
</details>

<details>
<summary>Dark Map Interaction</summary>

![Dark Map](assets/dark.gif)
</details>

<details>
<summary>Pin a Location</summary>

![Pin a location](assets/pin.gif)
</details>

## Quick Start

1. **Download** the repository (git clone it).

2. **Launch the server** (requires Python 3):
   ```bash
   python3 serve.py
   ```
   or
   ```bash
   ./start.command
   ```
   On first run, `serve.py` downloads vendor dependencies into `vendor/`.
   Your browser will open automatically at **http://localhost:8765**

3. **Add photos** — drag & drop JPEG/HEIC files (with GPS data) onto the upload zone.

---

[![Watch video](https://github.com/user-attachments/assets/d667bd48-5f01-463a-abe7-107561fb01b1)](https://www.youtube.com/watch?v=w9MhBRoiUho)

---

## Background Service (macOS)

Run the server as a persistent background daemon via `launchctl`:

```bash
# Install the LaunchAgent (one-time setup)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.matrix.travel.plist

# Start it now (no login required)
launchctl kickstart -k gui/$(id -u)/com.matrix.travel

# Check status
launchctl print gui/$(id -u)/com.matrix.travel

# Stop the service
launchctl bootout gui/$(id -u)/com.matrix.travel
```

The LaunchAgent (`~/Library/LaunchAgents/com.matrix.travel.plist`) runs headless — no `RunAtLoad` so it won't start on login unless you explicitly `kickstart` it. Logs go to `matrix-out.log` / `matrix-err.log` in the project directory.

---

## Features

| Feature | Detail |
|---|---|
| 📍 Auto-pin | GPS EXIF read — no manual coordinates needed |
| 🔎 Destination search | Search any place or paste GPS coordinates |
| 🖱 Right-click pin | Right-click the map to pin a location |
| 🏳 Countries visited | Flag emojis for every country you've visited |
| 📁 Albums | Named albums with optional date ranges |
| 🗓 Timeline | Chronological photo browser |
| 🖼 Lightbox | Full-size viewer with navigation and camera info |
| 📝 Notes | Add notes to any pin |
| 🛰 Map styles | Light, Dark, Terrain, 3D Terrain, Satellite, 3D Satellite, Globe |
| 🔄 Clustering | Pins cluster by zoom, expand on click |
| 💾 Auto-save | Background backup to disk via `serve.py` |
| 📦 Export / Import | Full dataset as compressed `.json.gz` |
| 🎬 Video export | Trip animation as WebM video (VP9) |
| 📡 Offline mode | Browse photos and cached tiles without internet |

## Documentation

- [Architecture](docs/architecture.md)
- [Data persistence & migration](docs/persistence.md)
- [Data storage internals](docs/data-storage.md)
- [Tile caching architecture](docs/tile-caching.md)
- [Tips & features](docs/tips.md)
- [Keyboard shortcuts](docs/keyboard-shortcuts.md)
- [Synology NAS + Tailscale setup](docs/synology-setup.md)
- [Demo modes](docs/demo-mode.md)
- [Testing](docs/testing.md)
- [GitHub workflows](docs/github-workflows.md)

---

Built with [Claude Code](https://claude.ai/claude-code)
