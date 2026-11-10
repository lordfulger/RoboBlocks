# RoboBlocks

An original block-built robot battle game. Build a bot from blocks, wheels, hover pads, thrusters and guns in the garage, then fight in team battles against AI and other players, on the ground or in space.

This repository holds all of it:

| Folder | What it is |
|---|---|
| `game/` | The game. `game/src/*.js` are joined into one HTML page by `game/build.sh`. |
| `server/` | The dedicated server (Node.js, no dependencies) and the Pterodactyl egg. It serves the game, relays multiplayer, hosts always-on match servers with AI, keeps accounts and saves, and updates itself. See [server/README.md](server/README.md). |
| `desktop/` | The desktop app: a launcher that keeps the game up to date and runs it in its own window. See [desktop/README.md](desktop/README.md). |

## Building the game

```bash
bash game/build.sh
```

This writes `game/dist/roboblocks.html` (a single page; open it in a browser to play offline) and copies it to `server/public/index.html`. Commit `server/public/index.html` with your changes: servers that update from Git use it.

## Running a server

```bash
cd server
node server/index.js
```

Then open `http://localhost:8080/`. To host on Pterodactyl, import `server/egg-roboblocks.json`; the egg installs and updates from the latest GitHub release.

## Releasing

1. Bump `BC_VERSION` (and add a changelog entry) in `game/src/10-data.js`, and `version` in `server/package.json`.
2. Build the game and commit.
3. Tag and push: `git tag v2.8.0 && git push origin v2.8.0`.

The **Release** workflow then builds the game, smoke-tests the server, and publishes a GitHub Release with `roboblocks-server.tar.gz`, `egg-roboblocks.json` and the desktop installers for Windows, macOS and Linux. Pterodactyl servers pick the new release up on their next restart (or straight away with the `update` console command). Desktop apps get the new game from their server automatically.

## What's new in 2.8.0

- **Loadouts:** your garage bays are your loadout. Choose which bot to deploy with, and while you are wrecked press 1–5 (or LB/RB on a gamepad) to rebuild as a different bot. Works online too.
- **Map sizes:** Small, Medium and Large arenas, or Auto to match the team size.
- **Space maps:** Crimson Nebula, Dry Dock and Ring Belt join Orbital Wreckfield, each with a painted nebula sky.
- **Graphics:** a new Ultra preset with full-resolution rendering, light shafts and film grain, plus a colour grade for every map on High and Ultra.
