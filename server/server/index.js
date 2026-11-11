'use strict';
// RoboBlocks dedicated server: serves the game, relays multiplayer, and hosts official servers 24/7.
const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Relay } = require('./relay');
const ws = require('./ws');
const { startHost } = require('./headless');
const { DB, eloDeltas, seasonNo, seasonEnds, SEASON_MIN_GAMES } = require('./db');
const { Api } = require('./api');
const { setExtraWords } = require('./filter');

const ROOT = path.join(__dirname, '..');
const env = process.env;
const PORT = parseInt(env.SERVER_PORT || env.PORT || '8080', 10);
const BIND = env.BIND_ADDRESS || '0.0.0.0';
const AI_LEVEL = Math.min(10, Math.max(1, parseInt(env.BC_AI_LEVEL || '5', 10) || 5));
const MAX_CLIENTS = Math.max(1, parseInt(env.BC_MAX_CLIENTS || '64', 10) || 64);
const IDLE_MATCHES = /^(1|true|yes)$/i.test(env.BC_IDLE_MATCHES || '');
const HOSTED = (env.BC_SERVERS || 'all').split(',').map(s => s.trim()).filter(Boolean);
const TRUST_PROXY = /^(1|true|yes)$/i.test(env.BC_TRUST_PROXY || '');
const REQUIRE_ACCOUNT = /^(1|true|yes)$/i.test(env.BC_REQUIRE_ACCOUNT || '');
// BC_UNLOCK_ALL=1: everyone on this server gets every part, tier, material and CPU core (players' own progress is untouched)
const UNLOCK_ALL = /^(1|true|yes)$/i.test(env.BC_UNLOCK_ALL || '');

const LOG = []; // recent lines for the admin page
const log = (...a) => { const line = new Date().toISOString().slice(11, 19) + ' ' + a.map(x => typeof x === 'string' ? x : String(x)).join(' '); console.log(line); LOG.push(line); if (LOG.length > 300) LOG.shift(); };
const DISCORD = (env.BC_DISCORD_WEBHOOK || '').trim();

// ---------- config: servers.json (edit it in the panel's File Manager) ----------
const MODES = ['tdm', 'arena', 'elim', 'pit', 'space', 'ctc', 'koth', 'horde', 'brawl'], MAPS = ['dust', 'frost', 'ash', 'city', 'moon', 'space', 'nebula', 'shipyard', 'rings', 'random'], SIZES = ['auto', 'small', 'medium', 'large'];
const DEFAULT_SERVERS = [
  { id: 'sv-scrap', name: 'Scrapyard 24/7', blurb: 'Team Deathmatch on every map.', n: 10, rot: [['tdm', 'dust'], ['tdm', 'frost'], ['tdm', 'ash']] },
  { id: 'sv-beacon', name: 'Beacon Wars', blurb: 'Battle Arena rotation.', n: 10, rot: [['arena', 'frost'], ['arena', 'dust'], ['arena', 'ash']] },
  { id: 'sv-last', name: 'Last Bot Standing', blurb: 'Fast 5v5 Elimination rounds.', n: 5, rot: [['elim', 'ash'], ['elim', 'dust'], ['elim', 'frost']] },
  { id: 'sv-war', name: 'Total War', blurb: '20v20 mixed rotation on large maps.', n: 20, rot: [['tdm', 'dust', 'large'], ['arena', 'ash', 'large'], ['tdm', 'frost', 'large'], ['arena', 'dust', 'large'], ['elim', 'frost', 'large']] },
  { id: 'sv-objective', name: 'Objective Rush', blurb: 'Capture the Core and King of the Hill.', n: 10, rot: [['ctc', 'dust'], ['koth', 'city'], ['ctc', 'frost'], ['koth', 'ash']] },
  { id: 'sv-horde', name: 'Horde Co-op', blurb: 'Team up against ten waves of AI.', n: 5, rot: [['horde', 'dust'], ['horde', 'frost'], ['horde', 'ash']] },
  { id: 'sv-orbit', name: 'Orbital Command', blurb: 'Space Battle across every space map.', n: 10, rot: [['space', 'space'], ['space', 'nebula'], ['space', 'shipyard'], ['space', 'rings']] },
  { id: 'sv-pit', name: 'The Pit 24/7', blurb: 'Free-for-all: every bot for itself.', n: 5, rot: [['pit', 'dust', 'small'], ['pit', 'city', 'small'], ['pit', 'moon', 'small'], ['pit', 'frost', 'small']] },
  { id: 'sv-ranked', name: 'Ranked Season', blurb: 'Ranked 5v5: wins and losses move your season rating.', n: 5, ranked: true, rot: [['tdm', 'dust'], ['elim', 'frost'], ['arena', 'ash'], ['elim', 'city']] },
  { id: 'sv-brawl', name: 'Weekly Brawl', blurb: 'This week\'s twist on team deathmatch.', n: 10, rot: [['brawl', 'dust'], ['brawl', 'city'], ['brawl', 'frost'], ['brawl', 'moon']] },
];
function loadServers() {
  const file = path.join(ROOT, 'servers.json');
  let list = DEFAULT_SERVERS;
  if (fs.existsSync(file)) {
    try { list = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { log('servers.json is not valid JSON, using the defaults:', e.message); list = DEFAULT_SERVERS; }
    // a servers.json that still holds only the stock rooms (the file written on first start) picks up rooms added in later versions
    if (Array.isArray(list) && list.length && list.every(s => s && DEFAULT_SERVERS.some(d => d.id === s.id))) {
      const add = DEFAULT_SERVERS.filter(d => !list.some(s => s.id === d.id));
      if (add.length) { list = list.concat(add); try { fs.writeFileSync(file, JSON.stringify(list, null, 2)); log(`added new stock rooms to servers.json: ${add.map(s => s.name).join(', ')}`); } catch (e) { } }
    }
  } else { try { fs.writeFileSync(file, JSON.stringify(DEFAULT_SERVERS, null, 2)); } catch (e) { } }
  const clean = [];
  for (const s of Array.isArray(list) ? list : []) {
    const id = String(s.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
    // each rotation entry is [mode, map] or [mode, map, size]; size is auto (by team size), small, medium or large
    const rot = (Array.isArray(s.rot) ? s.rot : []).filter(r => Array.isArray(r) && MODES.includes(r[0]) && MAPS.includes(r[1]) && (r[2] == null || SIZES.includes(r[2]))).map(r => r.slice(0, 3));
    const n = [5, 10, 20].includes(+s.n) ? +s.n : 10;
    if (!id || !rot.length) { log(`skipping server entry ${JSON.stringify(s).slice(0, 80)}: needs an id and a rotation of [mode, map] pairs`); continue; }
    const lv = v => Math.min(10, Math.max(1, parseInt(v, 10) || 1));
    clean.push({ id: id.startsWith('sv-') ? id : 'sv-' + id, name: String(s.name || id).slice(0, 32), blurb: String(s.blurb || '').slice(0, 80), n, rot,
      password: s.password ? String(s.password).slice(0, 64) : '', ranked: !!s.ranked, minLv: s.minLv ? lv(s.minLv) : 1, maxLv: s.maxLv ? lv(s.maxLv) : 10,
      noAi: s.bots === false || /^(0|false|no|off)$/i.test(env.BC_BOTS || '1') }); // players only: no AI bots fill the empty slots
  }
  return clean.length ? clean : DEFAULT_SERVERS;
}
const ALL = loadServers();
const SERVERS = HOSTED.includes('all') ? ALL : ALL.filter(s => HOSTED.includes(s.id) || HOSTED.includes(s.id.replace(/^sv-/, '')));
if (!SERVERS.length) { log('BC_SERVERS matched no server ids. Known ids:', ALL.map(s => s.id).join(', ')); }

// ---------- game page ----------
const pagePath = path.join(ROOT, 'public', 'index.html');
if (!fs.existsSync(pagePath)) { log('public/index.html is missing. Re-upload the RoboBlocks server files.'); process.exit(1); }
const page = fs.readFileSync(pagePath, 'utf8');
// self-hosted: load three.js from this server instead of a CDN
const servedPage = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
  + page.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/three@[^"]+"><\/script>/, '<script src="/three.min.js"></script>') + '</body></html>';
const m = page.match(/<script>\n(\(\(\) => \{[\s\S]*\}\)\(\);)\n<\/script>/);
if (!m) { log('Could not find the game script inside public/index.html.'); process.exit(1); }
const gameCode = m[1];
const VERSION = (page.match(/const BC_VERSION = '([^']+)'/) || [])[1] || 'dev';
const DISCORD_INVITE = (env.BC_DISCORD_INVITE || '').trim();
// ---------- balance.json: tuning without new builds (applies live) ----------
const BAL_FILE = path.join(ROOT, 'balance.json');
const BAL_DEFAULT = { weaponDamage: { blaster: 1, plasma: 1, mortar: 1, rail: 1, seeker: 1, flak: 1, chain: 1, nano: 1, arc: 1, mine: 1, lancer: 1, tesla: 1 }, xpRate: 1, cpuBonus: 0, reactorHealth: 1, respawnSeconds: 6 };
function cleanBalance(b) {
  const o = JSON.parse(JSON.stringify(BAL_DEFAULT)), num = (v, lo, hi, d) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d;
  if (b && typeof b === 'object') {
    for (const k of Object.keys(o.weaponDamage)) if (b.weaponDamage && b.weaponDamage[k] != null) o.weaponDamage[k] = num(b.weaponDamage[k], 0, 5, 1);
    o.xpRate = num(b.xpRate, 0, 10, 1); o.cpuBonus = Math.round(num(b.cpuBonus, -100, 1000, 0)); o.reactorHealth = num(b.reactorHealth, .1, 10, 1); o.respawnSeconds = num(b.respawnSeconds, 1, 30, 6);
  }
  return o;
}
let BALANCE = BAL_DEFAULT;
// weekend XP event: Saturday and Sunday (UTC) every battle gives BC_WEEKEND_XP times the XP (1 turns it off)
const WEEKEND_XP = Math.max(1, Math.min(5, +(env.BC_WEEKEND_XP == null || env.BC_WEEKEND_XP === '' ? 1.5 : env.BC_WEEKEND_XP) || 1));
const weekendMul = (t = Date.now()) => { const d = new Date(t).getUTCDay(); return d === 6 || d === 0 ? WEEKEND_XP : 1; };
const balanceNow = () => ({ ...BALANCE, weekendXp: WEEKEND_XP });
try { BALANCE = cleanBalance(JSON.parse(fs.readFileSync(BAL_FILE, 'utf8'))); } catch (e) { try { fs.writeFileSync(BAL_FILE, JSON.stringify(BAL_DEFAULT, null, 2)); } catch (e2) { } }
const threeMin = fs.readFileSync(path.join(ROOT, 'vendor', 'three.min.js'));
// ---------- desktop app updates: the launcher downloads the game from the server it plays on ----------
const crypto = require('crypto');
const desktopPage = Buffer.from(servedPage.replace('<script src="/three.min.js"></script>', '<script src="three.min.js"></script>'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const LAUNCHER_FILES = { 'index.html': { body: desktopPage, type: 'text/html; charset=utf-8' }, 'three.min.js': { body: threeMin, type: 'application/javascript' } };
const launcherNotes = (() => { const m = page.match(/\['([0-9.]+)', \[((?:'(?:[^'\\]|\\.)*'(?:, )?)+)\]\]/); if (!m) return []; return [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1].replace(/\\'/g, "'")).slice(0, 8); })();
const launcherManifest = JSON.stringify({ name: 'RoboBlocks', version: VERSION, notes: launcherNotes, files: Object.entries(LAUNCHER_FILES).map(([name, f]) => ({ path: name, size: f.body.length, sha256: sha(f.body) })) });
const DOWNLOADS = path.join(ROOT, 'downloads');

// ---------- accounts, relay + hosts ----------
const db = new DB(path.join(ROOT, 'data'), log);
const { Replays } = require('./replays');
const replays = new Replays(path.join(ROOT, 'data', 'replays'), { keep: Math.max(10, Math.min(5000, +env.BC_REPLAYS_KEEP || 300)), log });
setExtraWords(db.d.words);
const startedAt = Date.now();
// ---------- updates: share this package with other servers, and check for newer ones ----------
const updater = require('./update');
const SHARE_PACKAGE = !/^(0|false|no|off)$/i.test(env.BC_SHARE_PACKAGE || '1');
const UPDATE_HOURS = Math.max(0, parseFloat(env.BC_UPDATE_CHECK_HOURS || '1') || 0);
const AUTO_UPDATE = !/^(0|false|no|off)$/i.test(env.AUTO_UPDATE || '1');
// AUTO_UPDATE also installs updates found while running, then restarts when nobody is playing (or after
// BC_RESTART_MAX_HOURS, with a warning). The panel starts the server again and it runs the new version.
const AUTO_RESTART = AUTO_UPDATE && !/^(0|false|no|off)$/i.test(env.BC_AUTO_RESTART || '1');
const RESTART_MAX_H = Math.max(0, parseFloat(env.BC_RESTART_MAX_HOURS || '6') || 0);
const UPD = { state: 'idle', latest: null, checked: 0, error: '', busy: false };
let packageCache = null;
function serverPackage() { // server code only: never data/, servers.json (it can hold passwords), balance.json or downloads/
  if (packageCache) return packageCache;
  const { pack } = require('./tar'), files = [], walk = (dir, rel) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name), r = rel + e.name; if (e.isDirectory()) walk(p, r + '/'); else if (e.isFile()) files.push({ path: 'roboblocks-server/' + r, data: fs.readFileSync(p), mtime: fs.statSync(p).mtimeMs }); } };
  for (const d of ['server', 'public', 'vendor']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), d + '/');
  for (const f of ['package.json', 'README.md', 'egg-roboblocks.json']) if (fs.existsSync(path.join(ROOT, f))) files.push({ path: 'roboblocks-server/' + f, data: fs.readFileSync(path.join(ROOT, f)) });
  return (packageCache = pack(files));
}
async function runUpdate(apply, who) {
  if (UPD.busy) return { ...UPD }; UPD.busy = true;
  try {
    const r = await updater.update({ apply, log: m => log('[update] ' + m) });
    UPD.state = r.state; UPD.latest = r.latest || null; UPD.error = r.error || ''; UPD.checked = Date.now(); UPD.source = r.source || '';
    if (r.state === 'none') log('[update] no update source: set UPDATE_FROM, DOWNLOAD_URL or GIT_REPO');
    else if (r.state === 'current') { if (who) log(`[update] ${VERSION} is up to date (${r.source})`); }
    else if (r.state === 'available') { log(`[update] RoboBlocks ${r.latest} is available (running ${r.current}). ${AUTO_UPDATE ? 'Restart the server to install it.' : 'Type "update" to install it.'}`); discordText && discordText(`RoboBlocks ${r.latest} is available for this server.`); }
    else if (r.state === 'installed') { log(`[update] RoboBlocks ${r.latest} is installed. ${AUTO_RESTART ? 'Restarting when nobody is playing.' : 'Restart the server to run it.'}`); relay.notice('This server will restart soon for an update.'); if (AUTO_RESTART) scheduleRestart(r.latest); }
    else log(`[update] could not check ${r.source}: ${r.error}`);
    return { ...UPD };
  } finally { UPD.busy = false; }
}
// restart for an update: right away when the server is empty, otherwise when the last player leaves, or after
// BC_RESTART_MAX_HOURS with a five-minute warning. Exiting lets the panel start it again on the new code.
let restartPlan = null;
function scheduleRestart(version) {
  if (restartPlan) return; const t0 = Date.now(); restartPlan = { version, warned: false };
  const go = why => { log(`[update] restarting into RoboBlocks ${version} (${why})`); setTimeout(() => process.exit(0), 1500); };
  const tick = () => {
    if (relay.humanCount === 0) return go('nobody online');
    const left = RESTART_MAX_H * 3600000 - (Date.now() - t0);
    if (RESTART_MAX_H > 0 && left <= 300000 && !restartPlan.warned) { restartPlan.warned = true; relay.notice(`This server restarts in 5 minutes to update to RoboBlocks ${version}.`); log('[update] players still online: restarting in 5 minutes'); }
    if (RESTART_MAX_H > 0 && left <= 0) { relay.notice('Restarting for the update now. Rejoin in a minute.'); return go('waited long enough'); }
    setTimeout(tick, 15000);
  };
  setTimeout(tick, 5000);
}
const updateTick = () => runUpdate(AUTO_UPDATE && !restartPlan);
if (UPDATE_HOURS > 0) { setTimeout(updateTick, 60000); setInterval(updateTick, UPDATE_HOURS * 3600000); }

const api = new Api({ db, log, ext: {
  update: apply => runUpdate(!!apply, 'admin'),
  updateState: () => ({ ...UPD, version: VERSION, auto: AUTO_UPDATE, hours: UPDATE_HOURS }),
  logLines: () => LOG.slice(-200),
  status: () => ({ players: relay.humanCount, maxPlayers: MAX_CLIENTS, weekendXp: weekendMul(), uptime: (Date.now() - startedAt) / 1000, servers: hosts.map(h => ({ id: h.id, name: (SERVERS.find(s => s.id === h.id) || {}).name, ...h.status() })) }),
  readServers: () => { try { return fs.readFileSync(path.join(ROOT, 'servers.json'), 'utf8'); } catch (e) { return JSON.stringify(SERVERS, null, 2); } },
  writeServers: text => fs.writeFileSync(path.join(ROOT, 'servers.json'), text),
  balance: balanceNow, xpRate: () => BALANCE.xpRate * weekendMul(),
  readBalance: () => JSON.stringify(BALANCE, null, 2),
  writeBalance: text => { let b; try { b = JSON.parse(text); } catch (e) { return { e: 'Not valid JSON: ' + e.message }; } BALANCE = cleanBalance(b); fs.writeFileSync(BAL_FILE, JSON.stringify(BALANCE, null, 2)); relay.broadcastAll({ t: 'balance', balance: balanceNow() }); return {}; },
  onBug: (who, text) => discordText(`🐞 Bug report from ${who}: ${text.slice(0, 300)}`),
} });
// ---------- Discord: post match results to a channel webhook ----------
let discordT = 0;
function discordPost(server, r) {
  if (!DISCORD || !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(DISCORD) || Date.now() - discordT < 10000) return;
  discordT = Date.now();
  const names = { tdm: 'Team Deathmatch', arena: 'Battle Arena', elim: 'Elimination', pit: 'The Pit' }, maps = { dust: 'Dust Basin', frost: 'Frostline', ash: 'Ashfall Rift', city: 'Rustgate Ruins', moon: 'Lunar Outpost' };
  const top = (r.humans || []).filter(h => h.acct).sort((a, b) => b.kills - a.kills).slice(0, 5).map(h => `${h.acct}: ${h.kills} kills, ${Math.round(h.dmg / 1000)}k damage`).join('\n');
  const body = JSON.stringify({ username: 'RoboBlocks', embeds: [{ title: `${server.name}: ${names[r.mode] || r.mode} on ${maps[r.map] || r.map}`, description: (r.winner === -1 ? 'Draw.' : r.mode === 'pit' ? 'Match over.' : (r.winner === 0 ? 'Blue' : 'Red') + ' team wins.') + (top ? '\n\n' + top : ''), color: 0xff8a1f }] });
  try {
    const u = new URL(DISCORD), req = require('https').request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => res.resume());
    req.on('error', e => log('Discord post failed:', e.message)); req.end(body);
  } catch (e) { log('Discord post failed:', e.message); }
}
function discordText(text) {
  if (!DISCORD || !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(DISCORD)) return;
  try { const body = JSON.stringify({ username: 'RoboBlocks', content: text.slice(0, 1900) }), u = new URL(DISCORD), req = require('https').request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => res.resume()); req.on('error', () => { }); req.end(body); } catch (e) { }
}
// ---------- daily backups of the database (the last 7 are kept) ----------
function backup() {
  try {
    db.flush(); const dir = path.join(ROOT, 'data', 'backups'); fs.mkdirSync(dir, { recursive: true });
    const name = `roboblocks-db-${new Date().toISOString().slice(0, 10)}.json`, file = path.join(ROOT, 'data', 'roboblocks-db.json');
    if (!fs.existsSync(file) || fs.existsSync(path.join(dir, name))) return;
    fs.copyFileSync(file, path.join(dir, name));
    const old = fs.readdirSync(dir).filter(f => /^(roboblocks|blockcraft)-db-.*\.json$/.test(f)).sort(); while (old.length > 7) fs.unlinkSync(path.join(dir, old.shift()));
    log('database backed up to data/backups/' + name);
  } catch (e) { log('backup failed:', e.message); }
}
setTimeout(backup, 60000); setInterval(backup, 6 * 3600 * 1000);
const SERVER_NAME = String(env.BC_NAME || 'RoboBlocks server').replace(/[<>]/g, '').slice(0, 40);
const relay = new Relay({ servers: SERVERS, maxClients: MAX_CLIENTS, log, db, api, requireAccount: REQUIRE_ACCOUNT, unlockAll: UNLOCK_ALL, serverName: SERVER_NAME, version: VERSION, balance: balanceNow });
// a hosted match ended: award XP (and rating on ranked servers) to the signed-in pilots who played it
function onMatchReport(server, r) {
  if (!r || !Array.isArray(r.humans)) return;
  discordPost(server, r);
  try { db.addMatchStats(r); } catch (e) { log('stats failed:', e.message); }
  const accts = r.humans.map(h => ({ h, a: h.acct ? db.account(h.acct) : null }));
  let deltas = [0, 0];
  if (server.ranked) {
    const avg = t => { const xs = accts.filter(x => x.h.team === t).map(x => x.a ? db.seasonOf(x.a).elo : 1200); return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 1200; };
    if (accts.some(x => x.h.team === 0) && accts.some(x => x.h.team === 1)) deltas = eloDeltas([avg(0), avg(1)], r.winner);
  }
  const num = (v, max) => Math.max(0, Math.min(max, +v || 0));
  for (const { h, a } of accts) {
    if (!a) continue;
    const result = r.winner === -1 ? 'draw' : r.winner === h.team ? 'win' : 'loss';
    const xp = db.record(a, { xpRate: BALANCE.xpRate * weekendMul(), mode: r.mode, map: r.map, result, kills: num(h.kills, 200) | 0, deaths: num(h.deaths, 200) | 0, dmg: num(h.dmg, 2e6), healed: num(h.healed, 1e6), eloDelta: server.ranked ? deltas[h.team] : 0, ranked: !!server.ranked, server: server.name, cap: 3000 });
    for (const [id, p] of relay.peers) if (p.acct === a) relay.restamp(id);
    log(`[${server.id}] ${a.name}: ${result}, +${xp} XP${server.ranked ? `, rating ${deltas[h.team] >= 0 ? '+' : ''}${Math.round(deltas[h.team])}` : ''}`);
  }
}
const hosts = [];

// ---------- server browser: one server acts as the hub, the others report to it ----------
const PUBLIC_URL = cleanOrigin(env.BC_PUBLIC_URL || '');
// where desktop app updates come from when downloads/ is empty: DESKTOP_REPO (owner/repo), else the GitHub repo in DOWNLOAD_URL
const DESKTOP_REPO = (() => { const m = String(env.DESKTOP_REPO || '').trim().replace(/^https?:\/\/github\.com\//i, '').match(/^([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/) || String(env.DOWNLOAD_URL || '').match(/^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\//i); return /^(0|off|none)$/i.test(String(env.DESKTOP_REPO || '').trim()) ? '' : m ? m[1] : ''; })();
const ymlCache = new Map();
async function githubYml(name) {
  const c = ymlCache.get(name); if (c && Date.now() - c.t < 600000) return c.y;
  // /releases/latest/download/<file> redirects to /releases/download/<tag>/<file>: read the tag from that redirect
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 15000);
  try {
    const head = await fetch(`https://github.com/${DESKTOP_REPO}/releases/latest/download/${name}`, { redirect: 'manual', signal: ac.signal, headers: { 'User-Agent': 'RoboBlocks-server' } });
    const loc = head.headers.get('location') || '', tag = (loc.match(/\/releases\/download\/([^/]+)\//) || [])[1];
    if (!tag) { ymlCache.set(name, { t: Date.now(), y: null }); return null; }
    const base = `https://github.com/${DESKTOP_REPO}/releases/download/${tag}/`;
    const r = await fetch(base + name, { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': 'RoboBlocks-server' } }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const y = (await r.text()).replace(/^(\s*-?\s*(?:url|path):\s*)(?!https?:)(\S+)\s*$/gm, (m, k, f) => k + base + f);
    ymlCache.set(name, { t: Date.now(), y }); return y;
  } finally { clearTimeout(timer); }
}
const IS_HUB = /^(1|true|yes)$/i.test(env.BC_HUB || '');
const HUB_URL = cleanOrigin(env.BC_HUB_URL || '');
const hubList = new Map(); // origin -> { entry, seen, checked }
const hubRate = new Map();
let hubCache = { t: 0, list: [] };
function cleanOrigin(u) { try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) && !x.username && !x.password ? x.origin : ''; } catch (e) { return ''; } }
function selfEntry(req) {
  let url = PUBLIC_URL;
  if (!url && req) { const proto = TRUST_PROXY && /^https$/i.test(String(req.headers['x-forwarded-proto'] || '')) ? 'https' : 'http'; url = cleanOrigin(`${proto}://${req.headers.host || 'localhost'}`); }
  return { url, name: SERVER_NAME, players: relay.humanCount, max: MAX_CLIENTS, version: VERSION, motd: (db.d.motd || '').slice(0, 120), modes: [...new Set(SERVERS.flatMap(s => s.rot.map(r => r[0])))], locked: SERVERS.every(s => s.password), t: Date.now() };
}
function cleanEntry(e, url) {
  const str = (v, n) => String(v == null ? '' : v).replace(/[<>\u0000-\u001f]/g, '').slice(0, n);
  return { url, name: str(e.name, 40) || url, players: Math.max(0, Math.min(999, e.players | 0)), max: Math.max(0, Math.min(999, e.max | 0)), version: str(e.version, 16), motd: str(e.motd, 120), modes: (Array.isArray(e.modes) ? e.modes : []).filter(m => MODES.includes(m)).slice(0, 12), locked: !!e.locked };
}
async function probe(url) { // a reporting server must really be a RoboBlocks server
  try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 4000); const r = await fetch(url + '/status', { signal: ac.signal }); clearTimeout(t); const j = await r.json(); return j && (j.name === 'RoboBlocks' || j.name === 'RoboBlocks'); } catch (e) { return false; }
}
function readBody(req, max) { return new Promise((ok, no) => { let n = 0; const parts = []; req.on('data', c => { n += c.length; if (n > max) { no(new Error('too big')); req.destroy(); } else parts.push(c); }); req.on('end', () => ok(Buffer.concat(parts).toString('utf8'))); req.on('error', no); }); }
async function hubBeat(req, res, ip) {
  const now = Date.now(); if (now - (hubRate.get(ip) || 0) < 10000) { res.writeHead(429); res.end(); return; } hubRate.set(ip, now);
  let e; try { e = JSON.parse(await readBody(req, 16384)); } catch (err) { res.writeHead(400); res.end(); return; }
  const url = cleanOrigin(e && e.url); if (!url) { res.writeHead(400); res.end('bad url'); return; }
  let rec = hubList.get(url);
  if (!rec || now - rec.checked > 600000) { if (!(await probe(url))) { res.writeHead(403); res.end('not reachable'); return; } rec = { checked: now }; if (!hubList.has(url)) log(`hub: ${url} listed`); }
  if (hubList.size >= 500 && !hubList.has(url)) { res.writeHead(503); res.end(); return; }
  rec.entry = cleanEntry(e, url); rec.seen = now; hubList.set(url, rec);
  rec.season = e.season && (e.season.s | 0) === seasonNo() && Array.isArray(e.season.top) ? e.season.top.slice(0, 25).map(x => ({ name: String(x && x.n || '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 20), elo: Math.max(0, Math.min(5000, x.e | 0)), games: Math.max(0, x.g | 0), wins: Math.max(0, x.w | 0), server: rec.entry.name, url })).filter(x => x.name) : [];
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
}
// ranked season ladder across every server on the hub (this hub's own pilots included)
function hubSeason() {
  const own = db.seasonBoard(50).map(x => ({ name: x.name, elo: x.elo, games: x.games, wins: x.wins, server: SERVER_NAME, url: PUBLIC_URL || '' }));
  const all = own.concat(...[...hubList.values()].filter(r => Date.now() - r.seen < 120000).map(r => r.season || []));
  return all.filter(x => x.games >= SEASON_MIN_GAMES).sort((a, b) => b.elo - a.elo || b.wins - a.wins).slice(0, 100);
}
let seasonCache = { t: 0, j: null };
async function globalSeason() {
  if (IS_HUB || !HUB_URL) return { hub: IS_HUB, list: IS_HUB ? hubSeason() : [] };
  if (Date.now() - seasonCache.t < 60000 && seasonCache.j) return seasonCache.j;
  try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000); const r = await fetch(HUB_URL + '/hub/season', { signal: ac.signal }); clearTimeout(t); const j = await r.json(); seasonCache = { t: Date.now(), j: { hub: true, list: Array.isArray(j.list) ? j.list.slice(0, 100) : [] } }; return seasonCache.j; }
  catch (e) { return { hub: false, list: [], e: 'The hub did not answer.' }; }
}
function hubEntries() { const now = Date.now(), out = []; for (const [u, r] of hubList) { if (now - r.seen > 120000) { hubList.delete(u); continue; } out.push(r.entry); } return out; }
async function serverList(req) {
  const me = selfEntry(req);
  if (IS_HUB) return { hub: me.url, servers: [me, ...hubEntries().filter(e => e.url !== me.url)] };
  if (!HUB_URL) return { hub: '', servers: [me] };
  if (Date.now() - hubCache.t > 30000) {
    try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000); const r = await fetch(HUB_URL + '/hub/list', { signal: ac.signal }); clearTimeout(t); const j = await r.json(); hubCache = { t: Date.now(), list: (Array.isArray(j.servers) ? j.servers : []).slice(0, 500).map(e => cleanEntry(e, cleanOrigin(e.url))).filter(e => e.url) }; }
    catch (e) { hubCache.t = Date.now() - 20000; }
  }
  return { hub: HUB_URL, servers: [me, ...hubCache.list.filter(e => e.url !== me.url)] };
}
if (HUB_URL && PUBLIC_URL && HUB_URL !== PUBLIC_URL) {
  let warned = false;
  const beat = () => fetch(HUB_URL + '/hub/beat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selfEntry(), season: { s: seasonNo(), top: db.seasonBoard(25).filter(x => x.placed).map(x => ({ n: x.name, e: x.elo, g: x.games, w: x.wins })) } }) })
    .then(r => { if (!r.ok && !warned) { warned = true; log(`server browser: the hub answered ${r.status}. Check BC_PUBLIC_URL is reachable from the hub.`); } else if (r.ok && warned) { warned = false; log('server browser: listed on the hub again'); } })
    .catch(e => { if (!warned) { warned = true; log('server browser: cannot reach the hub:', e.message); } });
  setTimeout(beat, 5000); setInterval(beat, 30000);
} else if (HUB_URL && !PUBLIC_URL) log('server browser: BC_HUB_URL is set but BC_PUBLIC_URL is empty, so this server is not listed. Set BC_PUBLIC_URL to the address players use.');

const httpServer = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  const headers = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' };
  if (url === '/' || url === '/index.html') { res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); res.end(servedPage); return; }
  if (url === '/join' || url === '/join/') {
    const html = fs.readFileSync(path.join(__dirname, 'join.html'), 'utf8').replace(/\{\{VERSION\}\}/g, VERSION).replace('{{DISCORD}}', DISCORD_INVITE && /^https:\/\//.test(DISCORD_INVITE) ? `<a class="btn" href="${DISCORD_INVITE.replace(/["<>]/g, '')}">Join the Discord</a>` : '');
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  if (url === '/admin' || url === '/admin/') { res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' }); res.end(fs.readFileSync(path.join(__dirname, 'admin.html'))); return; }
  if (url === '/three.min.js') { res.writeHead(200, { ...headers, 'Content-Type': 'application/javascript', 'Cache-Control': 'max-age=86400' }); res.end(threeMin); return; }
  if (url === '/server-package.tar.gz' && SHARE_PACKAGE) { let b; try { b = serverPackage(); } catch (e) { res.writeHead(500); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': b.length, 'Content-Disposition': 'attachment; filename="roboblocks-server.tar.gz"' }); res.end(b); return; }
  if (url === '/launcher/manifest.json') { res.writeHead(200, { ...headers, 'Content-Type': 'application/json' }); res.end(launcherManifest); return; }
  if (url.startsWith('/launcher/files/')) { const f = LAUNCHER_FILES[url.slice(16)]; if (f) { res.writeHead(200, { ...headers, 'Content-Type': f.type, 'Content-Length': f.body.length }); res.end(f.body); return; } }
  // desktop installers: files the admin put in downloads/, otherwise the latest GitHub release (DESKTOP_REPO)
  if (url === '/download' || url === '/download/') {
    let files = []; try { files = fs.readdirSync(DOWNLOADS).filter(f => /^[\w.\- ]+\.(exe|dmg|zip|AppImage|deb|tar\.gz)$/.test(f)); } catch (e) { }
    if (!files.length && DESKTOP_REPO) { res.writeHead(302, { Location: `https://github.com/${DESKTOP_REPO}/releases/latest` }); res.end(); return; }
    const rows = files.map(f => `<li><a href="/downloads/${encodeURIComponent(f)}">${f.replace(/[<>&]/g, '')}</a> <small>${(fs.statSync(path.join(DOWNLOADS, f)).size / 1048576).toFixed(1)} MB</small></li>`).join('');
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download RoboBlocks</title><body style="font:16px system-ui;background:#0e1215;color:#e9edf0;max-width:640px;margin:40px auto;padding:0 16px"><h1>RoboBlocks for desktop</h1><p>The app keeps itself up to date: it downloads each new version from this server when it starts.</p>${rows ? '<ul>' + rows + '</ul>' : '<p>No installers have been uploaded to this server yet. You can still <a style="color:#ff8a1f" href="/">play in the browser</a>.</p>'}<p>After installing, enter this server's address when the app asks: <b>${(PUBLIC_URL || 'http://' + (req.headers.host || '')).replace(/[<>&"]/g, '')}</b></p></body>`); return;
  }
  if (url.startsWith('/downloads/')) {
    const name = decodeURIComponent(url.slice(11)); const file = path.join(DOWNLOADS, name);
    // launcher self-update lists: point every file at this server with a full address
    if (/^latest(-mac|-linux)?\.yml$/.test(name) && fs.existsSync(file)) {
      const proto = TRUST_PROXY && /^https$/i.test(String(req.headers['x-forwarded-proto'] || '')) ? 'https' : 'http', base = PUBLIC_URL || cleanOrigin(`${proto}://${req.headers.host || 'localhost'}`);
      const yml = fs.readFileSync(file, 'utf8').replace(/^(\s*-?\s*(?:url|path):\s*)(?!https?:)(\S+)\s*$/gm, (m, k, f) => k + base + '/downloads/' + f);
      res.writeHead(200, { ...headers, 'Content-Type': 'text/yaml; charset=utf-8' }); res.end(yml); return;
    }
    // no local copy: hand desktop apps the update list from the latest GitHub release (installers download from GitHub)
    if (/^latest(-mac|-linux)?\.yml$/.test(name) && DESKTOP_REPO) {
      githubYml(name).then(y => { if (!y) { res.writeHead(404); res.end(); return; } res.writeHead(200, { ...headers, 'Content-Type': 'text/yaml; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(y); }).catch(() => { res.writeHead(502); res.end(); });
      return;
    }
    if (/^[\w.\- ]+$/.test(name) && path.dirname(file) === DOWNLOADS && fs.existsSync(file)) { const st = fs.statSync(file); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Content-Disposition': `attachment; filename="${name}"` }); fs.createReadStream(file).pipe(res); return; }
  }
  // friends lists: names and whereabouts for friend codes (the game asks every server it knows about)
  if (url === '/friends' && req.method === 'GET') {
    const codes = (new URL(req.url || '/', 'http://x').searchParams.get('codes') || '').split(',').map(s => s.trim().toUpperCase()).filter(c => /^RB-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(c)).slice(0, 100);
    const info = relay.codeInfo(codes); for (const c of Object.keys(info)) if (info[c].sv) { const s = SERVERS.find(x => x.id === info[c].sv); info[c].room = s ? s.name : 'a custom game'; }
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ server: SERVER_NAME, url: PUBLIC_URL || '', codes: info })); return;
  }
  if (url === '/servers' && req.method === 'GET') { serverList(req).then(j => { res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(j)); }).catch(() => { res.writeHead(500); res.end(); }); return; }
  if (url === '/hub/list' && IS_HUB) { res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ servers: [selfEntry(req), ...hubEntries()] })); return; }
  if (url === '/hub/beat' && IS_HUB && req.method === 'POST') { const fwd = TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); hubBeat(req, res, (fwd || req.socket.remoteAddress || '').replace(/^::ffff:/, '')).catch(() => { try { res.writeHead(500); res.end(); } catch (e) { } }); return; }
  if (url === '/replay' && req.method === 'POST') { const fwd = TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); replays.upload(req, res, (fwd || req.socket.remoteAddress || '').replace(/^::ffff:/, '')); return; }
  if (url.startsWith('/replay/') && req.method === 'GET') { replays.serve(url.slice(8), res); return; }
  if (url === '/hub/season' && IS_HUB) { res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ s: seasonNo(), list: hubSeason() })); return; }
  if (url === '/season' && req.method === 'GET') { globalSeason().then(g => { res.writeHead(200, { ...headers, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ s: seasonNo(), ends: seasonEnds(seasonNo()), server: SERVER_NAME, local: db.seasonBoard(50), global: g })); }).catch(() => { res.writeHead(500); res.end(); }); return; }
  if (url === '/status') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ name: 'RoboBlocks', server: SERVER_NAME, version: VERSION, serverVersion: (() => { try { return require('../package.json').version; } catch (e) { return VERSION; } })(), players: relay.humanCount, maxPlayers: MAX_CLIENTS, weekendXp: weekendMul(), servers: hosts.map(h => ({ id: h.id, name: (SERVERS.find(s => s.id === h.id) || {}).name, ...h.status() })) }));
    return;
  }
  res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' }); res.end('Not found');
});
ws.attach(httpServer, '/ws', 256 * 1024, (sock, req) => {
  const fwd = TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = (fwd || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const send = msg => sock.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  const conn = relay.connect(send, { ip, close: () => sock.close(1008) });
  if (!conn) { setTimeout(() => sock.close(1013), 100); return; }
  sock.onmessage = text => conn.onMessage(text);
  sock.onclose = () => conn.close();
});
httpServer.on('error', e => { log('HTTP server error:', e.message); if (e.code === 'EADDRINUSE') process.exit(1); });
httpServer.listen(PORT, BIND, () => {
  for (const s of SERVERS) {
    const h = startHost({ code: gameCode, server: s, aiLevel: AI_LEVEL, idleMatches: IDLE_MATCHES, unlockAll: UNLOCK_ALL, relay, log, report: r => onMatchReport(s, r) });
    if (h) { hosts.push(h); log(`hosting ${s.name} (${s.id}): ${s.n}v${s.n}, rotation ${s.rot.map(r => r.join('/')).join(' > ')}`); }
  }
  log(`AI level ${AI_LEVEL}, up to ${MAX_CLIENTS} players, ${IDLE_MATCHES ? 'matches keep running when empty' : 'servers idle until someone joins'}${REQUIRE_ACCOUNT ? ', accounts required to play' : ''}`);
  log(`RoboBlocks ${VERSION}. Tester page: /join · admin page: /admin`); if (UNLOCK_ALL) log('Everything is unlocked for players on this server (BC_UNLOCK_ALL=1).');
  log(`RoboBlocks server ready on port ${PORT}. Open http://<your-server-ip>:${PORT}/ in a browser to play, and /admin for the admin page.`);
});

// ---------- console (Pterodactyl sends commands on stdin) ----------
let lastPlayers = 0;
setInterval(() => { const n = relay.humanCount; if (n !== lastPlayers) { log(`players online: ${n}`); lastPlayers = n; } }, 5000);
const who = q => { const list = relay.findPlayers(q); if (!list.length) log(`nobody online called "${q}"`); return list; };
const commands = {
  help() { log('commands: update [check], status, players, resetpw <account>, kick <name>, ban <name>, unban <name|ip>, bans, op <account>, deop <account>, motd <text>, say <text>, password <server-id> <password|off>, accounts, filter <word>, stop'); },
  status() {
    log(`players online: ${relay.humanCount}/${MAX_CLIENTS}`);
    for (const h of hosts) { const s = h.status(); log(`  ${h.id}: ${s.phase}${s.mode ? ` · ${s.mode} on ${s.map}` : ''} · ${s.players | 0} players${s.phase === 'live' ? ` · score ${s.score} · ${s.timeLeft}s left` : s.cd ? ` · ${s.cd}s` : ''}`); }
  },
  players() { const list = relay.players(); log(list.length ? list.map(p => `${p.acct || p.name}${p.acct ? '' : ' (guest)'}${p.admin ? ' [admin]' : ''}${p.sv ? ' @ ' + p.sv : ' (menu)'} ${p.ip}`).join(', ') : 'nobody online'); },
  kick(q) { for (const p of who(q)) { relay.kick(p.id, 'You were removed from the server.'); log(`kicked ${p.acct || p.name}`); } },
  ban(q) {
    const online = relay.findPlayers(q);
    if (online.length) for (const p of online) { db.ban(p.acct, p.ip); relay.kick(p.id, 'You are banned from this server.'); log(`banned ${p.acct || p.name} (${p.ip})`); }
    else if (db.account(q)) { db.ban(q, null); log(`banned account ${q}`); }
    else if (/^[0-9a-f.:]+$/i.test(q)) { db.ban(null, q); log(`banned address ${q}`); }
    else log(`nobody online or registered called "${q}"`);
  },
  resetpw(q) { const a = db.account(q); if (!a) return log(`no account called "${q}"`); const pw = require('crypto').randomBytes(5).toString('hex'); db.setPassword(a, pw); log(`new password for ${a.name}: ${pw} (they can change it in the game: Account, Change password)`); },
  unban(q) { log(db.unban(q) ? `unbanned ${q}` : `${q} is not banned`); },
  bans() { const b = db.d.bans; log(`banned accounts: ${b.names.join(', ') || 'none'} · banned addresses: ${b.ips.join(', ') || 'none'}`); },
  op(q) { const a = db.account(q); if (!a) return log(`no account called "${q}"`); a.admin = true; db.save(); log(`${a.name} is now an admin`); },
  deop(q) { const a = db.account(q); if (!a) return log(`no account called "${q}"`); a.admin = false; db.save(); log(`${a.name} is no longer an admin`); },
  motd(text) { db.d.motd = text.slice(0, 300); db.save(); if (text) relay.notice('Message of the day: ' + db.d.motd); log(text ? 'MOTD set' : 'MOTD cleared'); },
  say(text) { if (text) relay.notice('[Server] ' + text.slice(0, 200)); },
  password(rest) {
    const [id, pw] = rest.split(/\s+/); const s = SERVERS.find(x => x.id === id || x.id === 'sv-' + id); if (!s) return log(`no hosted server "${id}"`);
    s.password = !pw || pw === 'off' ? '' : pw.slice(0, 64); log(s.password ? `${s.name} now needs a password (until restart; put "password" in servers.json to keep it)` : `${s.name} is open`);
  },
  accounts() { const list = Object.values(db.d.accounts); log(`${list.length} accounts${list.length ? ': ' + list.slice(0, 60).map(a => a.name + (a.admin ? ' [admin]' : '')).join(', ') : ''}`); },
  filter(word) { const w = String(word || '').toLowerCase(); if (!/^[a-z0-9]{3,30}$/.test(w)) return log('usage: filter <word> (letters and numbers, 3 to 30)'); db.d.words = [...new Set((db.d.words || []).concat(w))]; setExtraWords(db.d.words); db.save(); log(`added "${w}" to the chat filter`); },
  update(arg) { runUpdate(arg !== 'check'); },
  stop() { shutdown(); },
};
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => { const t = line.trim(), cmd = t.toLowerCase().split(/\s+/)[0]; if (!cmd) return; const rest = t.slice(cmd.length).trim(); (commands[cmd] || (() => log(`unknown command "${cmd}". Type help.`)))(rest); });
function shutdown() { log('stopping RoboBlocks server'); db.flush(); httpServer.close(); setTimeout(() => process.exit(0), 300); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
process.on('uncaughtException', e => log('error:', e && e.stack || e));
