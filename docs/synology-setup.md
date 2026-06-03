# Synology NAS Setup

Run Matrix on a Synology NAS so every device in your household can access it (locally or remotely) with full tile caching and offline support.

## Prerequisites

- Synology NAS running DSM 7+
- Python 3 installed (DSM packages or community)
- [Tailscale](https://tailscale.com/kb/1131/synology) package installed on the NAS
- Tailscale installed on each device that will access the app
- MagicDNS and HTTPS certificates enabled in your Tailscale admin console

## 1. Copy the app to your NAS

Copy the repository to your Synology home folder (via SSH, File Station, or git):

```bash
ssh your-nas
cd ~/apps
git clone <repo-url> matrix
```

## 2. Launch the server

```bash
cd ~/apps/matrix
python3 serve.py
```

On first run, vendor dependencies are downloaded automatically. Verify the app works by visiting `http://your-nas-ip:8765` from a device on your LAN.

## 3. Configure Tailscale Serve

Tailscale Serve creates an HTTPS reverse proxy with a real Let's Encrypt certificate. This is required because Service Workers (used for tile caching) only register on secure origins.

**Default (port 443):**

```bash
sudo tailscale serve --bg http://localhost:8765
```

This serves at `https://your-nas.tail1234.ts.net` (no port suffix). Works if nothing else on the NAS is using port 443.

**Custom port (if DSM occupies 443):**

```bash
sudo tailscale serve --bg --https=8443 http://localhost:8765
```

This serves at `https://your-nas.tail1234.ts.net:8443`.

`--bg` runs it persistently in the background. Verify the config:

```bash
sudo tailscale serve status
```

You should see output like:

```
https://your-nas.tail1234.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:8765
```

This is a **one-time command**. The config persists across reboots — Tailscale's daemon remembers it.

**To remove the config:**

```bash
# Default port:
sudo tailscale serve / off

# Custom port:
sudo tailscale serve --https=8443 / off
```

Verify with `sudo tailscale serve status` — it should show no config.

## 4. Access the app

From any device on your tailnet, open:

```
https://your-nas.tail1234.ts.net
```

Or if using a custom port:

```
https://your-nas.tail1234.ts.net:8443
```

Find your exact hostname by running `tailscale status` on the NAS, or check the [Tailscale admin console](https://login.tailscale.com/admin/machines).

No port forwarding needed — Tailscale uses encrypted WireGuard tunnels that punch through NAT automatically.

## 5. Auto-start on boot

The Tailscale serve config survives reboots on its own. You only need to ensure `serve.py` starts when the NAS boots.

**DSM → Control Panel → Task Scheduler:**

1. Click **Create → Triggered Task → User-defined script**
2. **General tab:**
   - Task name: `Matrix`
   - User: `root` (or your user account)
   - Event: **Boot-up**
3. **Task Settings tab:**
   - Command:
     ```
     cd /volume1/homes/<your-user>/apps/matrix && python3 serve.py
     ```
4. Click **OK**

## 6. Verify everything works

After setup, confirm these features work from a remote device:

| Feature | How to verify |
|---|---|
| App loads | Visit the Tailscale HTTPS URL |
| Service Worker | DevTools → Application → Service Workers shows "activated and running" |
| Photo upload | Drop a photo → check `matrix-photos/` on NAS has the image + thumbnail |
| Tile caching | Pan/zoom the map → check `matrix-tiles/` on NAS starts populating |
| Offline mode | Disconnect from internet → cached map tiles and photos still display |

## Troubleshooting

**"Site can't be reached"**
- Is Tailscale running on both the NAS and your device?
- Are both on the same tailnet? Check `tailscale status` on each.

**Redirected to DSM login page**
- Port 443 is taken by DSM. Use port 8443 (or another unused port) for Tailscale Serve.

**Service Worker not registering**
- Confirm you're accessing via `https://` (the Tailscale URL), not `http://`.
- Check DevTools → Console for SW registration errors.

**Tiles not caching to disk**
- After a fresh install or SW update, clear the tile cache: Settings gear → Empty Map Cache, then hard refresh (`Cmd+Shift+R`).
- Check that the `matrix-tiles/` directory exists and has write permissions.

**Thumbnails not rendering**
- Ensure `serve.py` was running when the photo was uploaded (thumbnails are saved to disk during auto-save).
- If thumbnails are missing, re-upload the affected photos.
