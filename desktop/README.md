# RoboBlocks desktop app

A small launcher that installs and updates RoboBlocks, then runs the game in its own window (no browser).

## How players use it

1. Install `RoboBlocks-<version>-win-x64.exe` (Windows), the `.dmg` (macOS) or the `.AppImage` (Linux).
2. On first start, type your game server's address (for example `play.example.com:8080`) and press **Save**.
3. Press **Play**.

The app then:

- **Downloads the game from that server** and checks every file's SHA-256 before using it. It checks again on every start and every 10 minutes while you play. When a new version arrives mid-game, a **Restart now** banner appears in the game.
- **Keeps the game in step with the server.** If you switch servers (from the launcher, or **Connect** in the in-game server browser), it installs that server's version, so you never play a mismatched build.
- **Plays offline.** With no server set, or the server unreachable, it plays the last version it downloaded, or the copy bundled in the app, against AI.
- **Updates itself.** On start the launcher checks the game server's `downloads/` folder for a newer launcher, downloads it in the background, and installs it when the app closes.

Keys: **F11** or **Alt+Enter** toggles fullscreen. The launcher options can start in fullscreen, hide the launcher while playing, or skip straight to the game.

Each player's settings and offline saves live in the app's data folder (`%APPDATA%\RoboBlocks` on Windows, `~/Library/Application Support/RoboBlocks` on macOS, `~/.config/RoboBlocks` on Linux). Accounts and server saves stay on the server as usual.

## Releasing an update

**A new game version** (the usual case): upload the new server package to your dedicated server and restart it. Every desktop app picks it up the next time it checks; nothing else to do.

**A new launcher version** (only when this app's own code changes):

1. Bump `version` in `package.json`.
2. Build: `npm run dist:win`, `npm run dist:mac`, `npm run dist:linux`, or push a `v*` tag and let the repository's release workflow (`.github/workflows/release.yml`) build all three and attach them to the GitHub release.
3. Copy the installers, their `.blockmap` files and the `latest.yml`, `latest-mac.yml` and `latest-linux.yml` files into the game server's `downloads/` folder (create it next to `server/` in the File Manager). The server rewrites the yml files with its own address, and lists the installers at `/download`.

## Building

```bash
npm install
npm start            # run from source
npm run dist:win     # installer + zip in dist/ (on Linux this needs Wine)
```

`npm run bundle` copies the current game build (`../server/public/index.html`) into `game-fallback/`, the copy that ships inside the app. Set `roboblocks.defaultServer` in `package.json` to pre-fill the server address for your players.

## Signing

The builds are not code-signed. Windows SmartScreen will warn on first run ("More info → Run anyway"), and macOS needs right-click → Open the first time. For wide distribution, add a Windows code-signing certificate (`CSC_LINK`, `CSC_KEY_PASSWORD`) and an Apple Developer ID with notarization. electron-builder picks them up from environment variables.

## Security

The game window only loads the downloaded or bundled game (`rbgame://game/…`), with context isolation and the renderer sandbox on. It is allowed to talk to plain `http`/`ws` game servers, which are common on LANs and panel ports. Links to other sites open in the system browser.
