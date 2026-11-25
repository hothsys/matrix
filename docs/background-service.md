# Background service (macOS)

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

The LaunchAgent (`~/Library/LaunchAgents/com.matrix.travel.plist`) runs headless, with no `RunAtLoad` so it won't start on login unless you explicitly `kickstart` it. Logs go to `matrix-out.log` / `matrix-err.log` in the project directory.
