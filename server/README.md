# RoboBlocks dedicated server

A self-hosted server for RoboBlocks. One Node.js process:

- serves the game at `http://<server-ip>:<port>/` (players just open it in a browser),
- relays multiplayer over a WebSocket at `/ws`,
- hosts always-on **official servers** itself: warmup, AI bots that fill empty slots, scoring, beacons, reactors, and map/mode rotation all run on the server, so matches don't depend on any player's computer,
- keeps **pilot accounts**: levels, XP, match history and ranked rating are stored on the server and awarded by it, with leaderboards and a **robot shop** where players share designs,
- keeps each signed-in pilot's **save data** on the server: garage bays, settings, quests, achievements and badges, so it follows them to any browser,
- runs **clans** with tags and a clan leaderboard, and lets **parties** of friends join servers together on the same team,
- gives you **admin tools**: a web admin page at `/admin`, kick, ban, server passwords, a message of the day, a chat word filter, Discord match posts and daily database backups.

No `npm install` is needed. The only requirement is Node.js 18 or newer. three.js is bundled in `vendor/` (MIT license, see `vendor/THREE-LICENSE.txt`).

## Upgrading from BlockCraft

RoboBlocks is the same game under a new name, and everything carries over:

1. In the panel, import `egg-roboblocks.json` (the startup line changed to `RoboBlocks server ready`, so the old egg would never report the server as started). Switch the server to the new egg, or edit the old egg's *Startup Configuration → Start* text to match.
2. Upload `roboblocks-server.tar.gz` over the old files and restart.

`data/blockcraft-db.json` is renamed to `data/roboblocks-db.json` on first start, so accounts, saves and clans are kept. Your `servers.json`, `balance.json` and all `BC_*` variables keep working unchanged. Share codes made before the rename (`BC1:…`) still load.

## Updates

The server keeps itself up to date. Every time it starts, the egg's startup command runs `server/update.js` before the server. If a newer release is available, it installs it first. Your `data/` (accounts, saves, clans), `servers.json`, `balance.json` and `downloads/` are never touched, and the previous code is kept in `backups/code-<version>/` (the last three).

Where updates come from (the first one set wins):

| Variable | Use it when |
|---|---|
| `UPDATE_FROM` | You run several servers: point them at one of them (for example your hub, `https://hub.example.com`). Each server shares its own files at `/server-package.tar.gz` (turn that off with `BC_SHARE_PACKAGE=0`). Then you only upload a new release to one server. |
| `DOWNLOAD_URL` | The default. The egg points it at the official GitHub releases, `https://github.com/lordfulger/RoboBlocks/releases/latest/download/roboblocks-server.tar.gz`, which always serves the newest release. Use your own fork's link to publish your own builds. The repository must be public for this link to download. |
| `GIT_REPO` (+ `GIT_BRANCH`) | The server files live in a Git repository. Needs `git` in the container (the standard Node images have it). |

A release only installs when it is newer: either the game version (`BC_VERSION`) is higher, or the game is the same and `package.json`'s version is higher. Pointing at an older server never downgrades you.

- **On every restart:** controlled by `AUTO_UPDATE` (default `1`; `0` turns it off).
- **While running:** every `BC_UPDATE_CHECK_HOURS` hours (default 1) the server checks. With `AUTO_UPDATE=1` it installs the new release straight away, then restarts itself: at once if nobody is online, otherwise when the last player leaves, or after `BC_RESTART_MAX_HOURS` (default 6) with a five-minute warning in game. `BC_AUTO_RESTART=0` installs but waits for you to restart. The restart relies on the panel starting the server again, which Wings does by default (crash detection, with clean exits counted). If your node has that turned off, the server stays stopped after an update until you press Start.
- **By hand:** type `update` in the console (or press **Install update** on the admin page). `update check` only checks.
- **Roll back:** stop the server, copy the folders from `backups/code-<version>/` back over `server/`, `public/` and `vendor/`, set `AUTO_UPDATE=0`, and start it.

**Updating the egg itself.** In the panel go to *Admin → Nests → RoboBlocks → (the egg) → Update Egg* and upload the new `egg-roboblocks.json`. Servers keep running on it, and new variables appear with their defaults. If you are moving from an egg older than 2.7.0, the startup command changes to `node server/update.js; node server/index.js`. Check it under the server's *Startup* tab if you had edited it.

## Install on Pterodactyl

1. **Import the egg.** In the admin area go to *Nests*, pick or create a nest (for example "Games"), choose *Import Egg*, and upload `egg-roboblocks.json`.
2. **Create a server** with the RoboBlocks egg. Give it one port allocation; that port is both the web page and the WebSocket. 1 CPU core and 512 MB RAM is plenty: all four default servers running full AI matches at once (90 bots) measured about half a core and 250 MB.
3. **Get the files onto the server**, using one of these:
   - **Upload them.** Open the server's *File Manager*, upload `roboblocks-server.tar.gz`, then *Unarchive* it in the top folder so that `server/index.js` sits at the root.
   - **Download URL (the default).** The egg already points at the newest GitHub release, so a new server installs it straight away. Point it somewhere else and *Reinstall* to use another build.
   - **Set Git repository.** Set it to the RoboBlocks repository (or your fork), then *Reinstall*. The installer finds the `server/` folder inside the repository.
4. **Start the server.** The console shows `RoboBlocks server ready on port …` when it's up.
5. **Play.** Open `http://<server-ip>:<port>/`, choose **Multiplayer**, and join a server. Matches start automatically after a 15-second warmup.

## Variables

| Variable | Default | What it does |
|---|---|---|
| `BC_SERVERS` | `all` | Comma-separated server ids from `servers.json` to host. |
| `BC_AI_LEVEL` | `5` | Level 1 to 10 for AI bots (armor tier, CPU budget, weapon mark). |
| `BC_MAX_CLIENTS` | `64` | Most players connected at once. |
| `BC_IDLE_MATCHES` | `0` | `1` keeps AI-only matches running with nobody online; `0` idles in warmup until someone joins. |
| `DOWNLOAD_URL` | empty | Optional `.tar.gz` for the installer to fetch. |
| `GIT_REPO`, `GIT_BRANCH` | empty | Optional Git source for the installer. |
| `BC_REQUIRE_ACCOUNT` | `0` | `1` means only signed-in pilots can play, so every pilot's progress and garage is saved on the server. Guests can still open the page and sign up. |
| `BC_DISCORD_WEBHOOK` | empty | A Discord channel webhook URL. Match results from the hosted servers are posted there. |
| `BC_DISCORD_INVITE` | empty | A Discord invite link shown on the tester page (`/join`). |
| `AUTO_UPDATE` | `1` | Install a newer release on every restart (see Updates). |
| `UPDATE_FROM` | empty | Another RoboBlocks server to copy updates from. |
| `BC_BOTS` | `1` | `0` makes every room players only: no AI bots fill the empty slots. One room at a time: `"bots": false` in `servers.json`. |
| `BC_UNLOCK_ALL` | `0` | `1` unlocks every part, armor tier, material, finish and CPU core for everyone on this server (players' own progress is untouched). |
| `BC_WEEKEND_XP` | `1.5` | Weekend XP event: every battle on Saturday and Sunday (UTC) gives this many times the XP. `1` turns it off. |
| `BC_REPLAYS_KEEP` | `300` | How many shared replays the server keeps (in `data/replays`); the oldest are deleted first. |
| `BC_UPDATE_CHECK_HOURS` | `1` | How often a running server checks for updates; `0` turns it off. |
| `BC_AUTO_RESTART` | `1` | After installing an update while running, restart when nobody is playing. `0` waits for you. |
| `BC_RESTART_MAX_HOURS` | `6` | Longest wait for an empty server before restarting anyway (with a warning). `0` waits until empty. |
| `DESKTOP_REPO` | empty | GitHub `owner/repo` whose latest release supplies desktop app updates. Empty uses the one in `DOWNLOAD_URL`; `off` disables it. |
| `BC_SHARE_PACKAGE` | `1` | Let other servers update from this one (`/server-package.tar.gz`, code only, never your data). |
| `BC_NAME` | `RoboBlocks server` | The name shown in the in-game server browser. |
| `BC_PUBLIC_URL` | empty | The address players open (for example `https://play.example.com`). Needed to appear in the server browser. |
| `BC_HUB` | `0` | `1` makes this server a server-browser hub that other RoboBlocks servers report to. |
| `BC_HUB_URL` | empty | The address of a hub. This server reports to it every 30 seconds and shows the hub's list in its server browser. |
| `BC_TRUST_PROXY` | `0` | `1` reads player addresses from `X-Forwarded-For`. Turn it on only behind your own reverse proxy, so IP bans hit the right address. |

`SERVER_PORT` comes from the allocation, and the server binds to `0.0.0.0`.

## Customising servers

`servers.json` is created on first start. Edit it in the File Manager and restart:

```json
[
  { "id": "sv-scrap", "name": "Scrapyard 24/7", "blurb": "Team Deathmatch on every map.", "n": 10,
    "rot": [["tdm", "dust"], ["tdm", "frost"], ["tdm", "ash"]] }
]
```

- `n` is the team size: 5, 10 or 20.
- `password` (optional) makes players type a password to join.
- `ranked: true` (optional) needs a signed-in account and changes players' rating after each match.
- `minLv` and `maxLv` (optional, 1 to 10) limit which pilot levels may join; they also need an account, so levels can't be faked.
- `rot` is the rotation, as `[mode, map]` or `[mode, map, size]` entries. Modes are `tdm` (Team Deathmatch), `arena` (Battle Arena, with reactors), `elim` (Elimination), `pit` (The Pit, free-for-all), `ctc` (Capture the Core), `koth` (King of the Hill), `horde` (co-op against ten waves of AI, every player on one team), `brawl` (Weekly Brawl: team deathmatch with a rule that changes every Monday) and `space` (Space Battle: zero gravity, flying bots only). Ground maps are `dust`, `frost`, `ash`, `city` (Rustgate Ruins, with buildings that crumble) and `moon` (Lunar Outpost, low gravity and jump pads). Space maps, for `space` only, are `space` (Orbital Wreckfield), `nebula` (Crimson Nebula), `shipyard` (Dry Dock) and `rings` (Ring Belt). `random` picks a fitting map each match. Add `"bots": false` to a room to make it players only (no AI bots). Size is `small`, `medium`, `large` or `auto` (the default: 5v5 small, 10v10 medium, 20v20 large). Each match also picks a time of day and weather.
- `id` may use letters, numbers and dashes; `sv-` is added if missing.

Example with all the options:

```json
{ "id": "sv-ranked", "name": "Ranked 10v10", "blurb": "Rated matches.", "n": 10, "rot": [["arena", "dust"], ["tdm", "ash"]],
  "ranked": true, "minLv": 3, "maxLv": 10, "password": "" }
```

## Accounts, leaderboards and the robot shop

Players choose **Guest · Sign in** on the main menu card to create an account (a pilot name and a password). Passwords are stored as salted scrypt hashes. Signed-in pilots:

- keep their level, XP, kills, wins and last 25 matches on the server, so progress follows them to any browser,
- earn XP from server-hosted matches as the server scores them (practice battles against AI give capped XP, at most one a minute),
- appear on the **Leaderboards** (experience, wins, kills, rating),
- get a **rating** (starting at 1200, Bronze to Diamond) that moves on ranked servers,
- can share robots in the **Robot Shop**, and rate and download other pilots' designs.

Guests can still play every unranked server; their progress stays in their own browser.

Signed-in pilots' save data (garage bays, settings, quests, achievements, badges, clan) is stored with their account. Daily quest rewards are capped at three a day, 300 XP each.

Everything is saved in `data/roboblocks-db.json`. The server copies it to `data/backups/` once a day and keeps the last seven copies. The first account created is not an admin: make yourself one from the console with `op <name>`.

Every player also checks other pilots' bots against the build rules for their verified level (CPU, locked parts and tiers), and damage reports are capped at what a bot's guns could really deal, so edited game files don't win fights.

## Playtesting

- Send testers to `http://<server-ip>:<port>/join`: a short page with the live server list, how to play, and how to report problems.
- In the game, **F8** opens a bug report (the game attaches the version, map, mode, browser, frame rate, ping and recent errors), **F3** shows frame rate and ping, and players can report other players from the pause menu or with `/report name reason` in chat. Every fifth match asks an optional "how was that?" question.
- Script errors from players' browsers are collected automatically.
- Everything lands on the admin page. New bug reports are also posted to your Discord webhook if one is set.
- The page shows its version on the menu; if the server has a newer build than a player's open page, they get a "refresh" notice. A short "What's new" appears after an update.
- Players can change their password in the game (Account, Change password). If someone forgets theirs, reset it from the admin page or with the console command `resetpw <name>`, and give them the temporary password.

## Balance without new builds

`balance.json` (created on first start) holds damage multipliers per weapon, the XP rate, a CPU bonus for every level, reactor health and the respawn time. Edit it on the admin page and press **Save and apply**: every connected player and every hosted match picks it up immediately. The admin page also shows match stats (win rates by mode and map, each weapon's share of damage, win rates by movement type) to guide changes.

## Admin page

Open `http://<server-ip>:<port>/admin` and sign in with an admin account. It shows every hosted server's match, the pilots online (with kick and ban), the ban list, the message of the day, announcements, bug reports, browser errors, player reports, after-match feedback, match stats, the `balance.json` editor, password resets, the recent log, and an editor for `servers.json` (changes apply after a restart).

## Console commands

- `status` shows each hosted server's phase, map, players and score.
- `players` lists who is online, their account, where they are and their address.
- `resetpw <account>` gives an account a new temporary password and prints it.
- `kick <name>` removes a player (they can come back).
- `ban <name>` bans an online player's account and address, or a registered account, or an address. `unban <name|address>` lifts it; `bans` lists them.
- `op <account>` / `deop <account>` grants or removes admin. Admins see an **Admin** button on the main menu (players online with kick and ban, bans list, message of the day) and can type `/kick name`, `/ban name` and `/motd text` in chat.
- `motd <text>` sets the message of the day shown above the server list (`motd` alone clears it). `say <text>` sends a notice to everyone.
- `password <server-id> <password|off>` locks or opens a server until the next restart (put `password` in `servers.json` to keep it).
- `filter <word>` adds a word to the chat filter. Chat, names and bot names are filtered on the server as well as in the game.
- `accounts` lists registered accounts.
- `update` downloads and installs a newer release (restart to run it); `update check` only checks. See Updates.
- `stop` shuts down cleanly (the panel's Stop button sends this).

## HTTPS

Passwords and everything else travel unencrypted until you put HTTPS in front of the game. [HTTPS.md](HTTPS.md) walks through it with ready-made configs for nginx (machines that already run the Pterodactyl panel) and Caddy, in [`https/`](https/).

## Desktop app

Players can also install the RoboBlocks desktop app, which runs the game in its own window and keeps it up to date from this server:

- The server publishes its game build at `/launcher/manifest.json`, with checksums. Desktop apps download it when they start and every 10 minutes, so **uploading a new server package is all it takes to update every player.**
- **The app updates itself from GitHub automatically.** When `downloads/` is empty, the server reads the update list from the latest GitHub release of `DESKTOP_REPO` (by default the repository in `DOWNLOAD_URL`), and `/download` sends players to that release's page. Every release published by the repository's Release workflow therefore reaches every desktop app with nothing to copy.
- To host the installers yourself instead, put them in a `downloads/` folder next to `server/` (the `.exe`, `.dmg` and `.AppImage` files, their `.blockmap` files and the `latest*.yml` files). Local files take priority.
- When the app asks for a server address, players enter the one they use in the browser (set `BC_PUBLIC_URL` so the download page shows it).

The app's source and build steps are in the repository's `desktop/` folder.

## Server browser

Players find servers from **Server browser** in the main menu. It lists the rooms on the server they are on, plus every RoboBlocks server that reports to the same hub.

1. Pick one server to be the hub and set `BC_HUB=1` and `BC_PUBLIC_URL` on it.
2. On every other server set `BC_HUB_URL` to the hub's address and `BC_PUBLIC_URL` to its own address.

The hub checks each server's `/status` page before listing it and drops servers that stop reporting for two minutes. A server with no hub settings lists only itself. Pilots can also type any server address, and star favourites.

## Matchmaking, friends, the tech tree and the battle pass

- **Skill rating.** Every pilot has a rating (shown on the pilot card) that moves after each team match, Elo-style. Teams are balanced by rating when a match starts, parties are kept together, and Quick Play prefers servers with pilots near your rating. Offline AI gets tougher or easier with it.
- **Friends** are pilots with an account on this server. Add them from the Friends screen while they are online; you see where they are, can join their game or invite them to your party, and get a chat note when they come online.
- **Tech Tree.** Parts, armor tiers, materials and CPU Cores are unlocked with tech points, earned by levelling up (and every 2,000 XP past level 10, using the XP the server awards) and from achievements. Unlocks are saved with the account. Every node still needs a minimum pilot level, so clients keep checking each other's bots against the server-stamped level; the CPU check allows for the five CPU Core nodes (+75).
- **Battle pass.** A free, cosmetic-only pass with 30 tiers per six-week season. Battle XP fills it. Rewards are titles, badges, garage hangar themes, paint finishes and two cosmetic parts. It is saved with the account like the rest of the progress.

## HTTPS and domains

The game works over plain HTTP on the allocation port. To serve it on a domain with HTTPS, put a reverse proxy (nginx, Caddy, or Cloudflare Tunnel) in front and forward WebSocket upgrades for the `/ws` path. The page connects with `wss://` automatically when it's loaded over HTTPS.

Example nginx location:

```nginx
location / {
    proxy_pass http://127.0.0.1:PORT;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

## Health check

`GET /status` returns JSON with player counts and every hosted server's phase, map, score and time left.

## Notes

- Garage bays (bot designs) are saved in each player's browser for this site's address. Levels and history are saved on the server for signed-in pilots and in the browser for guests.
- Players can also watch a live match without playing: **Watch** appears next to servers that are mid-match.
- Custom games that players host from the Multiplayer screen run in the host player's browser. Only the official servers listed above run on this server.
- Fonts load from Google Fonts when available and fall back to system fonts on offline networks.
