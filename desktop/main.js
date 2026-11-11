'use strict';
// RoboBlocks desktop app.
// The launcher window checks the game server for a newer version of the game, downloads it, verifies it and
// swaps it in. "Play" opens the game in its own window (not a browser). While you play, the launcher keeps
// checking; when an update lands the game shows a "Restart now" banner. The launcher program itself updates
// from GitHub releases (electron-updater) when it was built and published that way.
const { app, BrowserWindow, ipcMain, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const PKG = require('./package.json');
if (process.env.RB_USER_DATA) app.setPath('userData', process.env.RB_USER_DATA); // for tests and portable installs
const USER = app.getPath('userData');
const GAME = path.join(USER, 'game');
const CFG_FILE = path.join(USER, 'config.json');
const FALLBACK = path.join(__dirname, 'game-fallback');
const CHECK_EVERY = Math.max(5000, +process.env.RB_CHECK_MS || 10 * 60 * 1000);

protocol.registerSchemesAsPrivileged([{ scheme: 'rbgame', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// ---------- settings ----------
const cleanServer = s => { try { const u = new URL(/^https?:\/\//i.test(String(s).trim()) ? String(s).trim() : 'http://' + String(s).trim()); return /^https?:$/.test(u.protocol) && u.hostname ? u.origin : ''; } catch (e) { return ''; } };
let cfg = { server: cleanServer((PKG.roboblocks || {}).defaultServer || ''), fullscreen: false, hideLauncher: true, autoPlay: false };
try { Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'))); } catch (e) { }
const saveCfg = () => fsp.writeFile(CFG_FILE, JSON.stringify(cfg, null, 2)).catch(() => { });

// ---------- installed game ----------
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function installed() { const v = readJson(path.join(GAME, 'version.json')); return v && fs.existsSync(path.join(GAME, 'index.html')) ? v : null; }
function gameDir() { return installed() ? GAME : FALLBACK; }
function gameVersion() { const v = installed() || readJson(path.join(FALLBACK, 'version.json')); return v ? v.version : '?'; }

// ---------- updates ----------
let launcherWin = null, gameWin = null, busy = null, pendingVersion = null;
const LAST = {}; // the latest message on each channel, for a window that opens after it was sent
const send = (ch, data) => { LAST[ch] = data; for (const w of [launcherWin, gameWin]) if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
const status = (state, extra = {}) => send('status', { state, server: cfg.server, version: gameVersion(), ...extra });
const log = (...a) => fs.appendFile(path.join(USER, 'launcher.log'), new Date().toISOString() + ' ' + a.join(' ') + '\n', () => { });
async function fetchT(url, ms = 15000) { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms); try { return await fetch(url, { signal: ac.signal, cache: 'no-store' }); } finally { clearTimeout(t); } }
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
// returns 'current' | 'updated' | 'offline' | 'noserver' | 'error'
async function checkForUpdate(why) {
  if (busy) return busy;
  busy = (async () => {
    if (!cfg.server) { status('noserver'); return 'noserver'; }
    status('checking');
    let man;
    try { const r = await fetchT(cfg.server + '/launcher/manifest.json'); if (!r.ok) throw new Error('HTTP ' + r.status); man = await r.json(); }
    catch (e) { log('update check failed:', e.message); status('offline', { error: e.message }); return 'offline'; }
    if (!man || !man.version || !Array.isArray(man.files) || !man.files.length) { status('error', { error: 'The server did not send a game update list.' }); return 'error'; }
    send('news', { version: man.version, notes: Array.isArray(man.notes) ? man.notes.slice(0, 8) : [] });
    const cur = installed();
    if (cur && cur.version === man.version && cur.server === cfg.server && man.files.every(f => cur.files && cur.files[f.path] === f.sha256)) { status('current'); return 'current'; }
    // download into a fresh folder, check every file, then swap folders
    const tmp = GAME + '.new'; await fsp.rm(tmp, { recursive: true, force: true }); await fsp.mkdir(tmp, { recursive: true });
    const total = man.files.reduce((s, f) => s + (f.size || 0), 0) || 1; let done = 0; const hashes = {};
    try {
      for (const f of man.files) {
        if (!/^[\w.\-]+$/.test(f.path)) throw new Error('Bad file name in the update list.');
        status('downloading', { target: man.version, progress: done / total });
        const r = await fetchT(cfg.server + '/launcher/files/' + encodeURIComponent(f.path), 120000); if (!r.ok) throw new Error(`${f.path}: HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (f.sha256 && sha256(buf) !== f.sha256) throw new Error(`${f.path} did not match its checksum. Try again.`);
        await fsp.writeFile(path.join(tmp, f.path), buf); hashes[f.path] = sha256(buf); done += buf.length;
      }
      await fsp.writeFile(path.join(tmp, 'version.json'), JSON.stringify({ version: man.version, server: cfg.server, files: hashes, at: Date.now() }));
      const old = GAME + '.old'; await fsp.rm(old, { recursive: true, force: true });
      if (fs.existsSync(GAME)) await fsp.rename(GAME, old);
      await fsp.rename(tmp, GAME); await fsp.rm(old, { recursive: true, force: true });
    } catch (e) { await fsp.rm(tmp, { recursive: true, force: true }); log('update failed:', e.message); status('error', { error: e.message }); return 'error'; }
    log('game updated to', man.version, 'from', cfg.server);
    status('updated', { from: cur ? cur.version : null });
    if (gameWin && !gameWin.isDestroyed() && why === 'background') { pendingVersion = man.version; gameWin.webContents.send('update-ready', man.version); }
    return 'updated';
  })();
  try { return await busy; } finally { busy = null; }
}

// ---------- windows ----------
const ICON = path.join(__dirname, 'build', 'icon.png');
function createLauncher() {
  launcherWin = new BrowserWindow({ width: 980, height: 620, minWidth: 760, minHeight: 520, backgroundColor: '#0b0f13', title: 'RoboBlocks', icon: ICON, autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-launcher.js'), contextIsolation: true, sandbox: true } });
  launcherWin.loadFile(path.join(__dirname, 'launcher', 'index.html'));
  launcherWin.once('ready-to-show', () => launcherWin.show());
  launcherWin.on('closed', () => { launcherWin = null; if (!gameWin) app.quit(); });
  lockDown(launcherWin);
}
function createGame() {
  if (gameWin && !gameWin.isDestroyed()) { gameWin.focus(); return; }
  gameWin = new BrowserWindow({ width: 1600, height: 900, minWidth: 960, minHeight: 560, backgroundColor: '#0b0f13', title: 'RoboBlocks', icon: ICON, autoHideMenuBar: true, fullscreen: !!cfg.fullscreen, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-game.js'), contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false,
      allowRunningInsecureContent: true } }); // game servers are often plain http/ws on a LAN or panel port
  gameWin.loadURL('rbgame://game/index.html');
  gameWin.once('ready-to-show', () => gameWin.show());
  gameWin.webContents.on('before-input-event', (e, inp) => {
    if (inp.type !== 'keyDown') return;
    if (inp.key === 'F11' || (inp.alt && inp.key === 'Enter')) { e.preventDefault(); gameWin.setFullScreen(!gameWin.isFullScreen()); }
    if (inp.key === 'F12' && !app.isPackaged) gameWin.webContents.toggleDevTools();
  });
  gameWin.on('closed', () => { gameWin = null; if (launcherWin) { launcherWin.show(); status(pendingVersion ? 'updated' : 'idle'); } else app.quit(); });
  lockDown(gameWin);
  if (cfg.hideLauncher && launcherWin) launcherWin.hide();
}
// keep both windows on our own pages; anything else opens in the system browser
function lockDown(win) {
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!/^(rbgame:|file:)/.test(url)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
}

// ---------- messages from the pages ----------
ipcMain.on('host-info', e => { e.returnValue = { server: cfg.server, version: gameVersion(), launcher: app.getVersion(), platform: process.platform }; });
ipcMain.handle('get-state', () => ({ cfg, version: gameVersion(), launcher: app.getVersion(), installed: !!installed(), last: LAST }));
ipcMain.handle('check', () => checkForUpdate('manual'));
ipcMain.handle('play', async () => { if (busy) await busy; createGame(); return true; });
ipcMain.handle('set-config', async (_e, patch) => {
  const before = cfg.server;
  if (patch && typeof patch === 'object') {
    if ('server' in patch) cfg.server = cleanServer(patch.server);
    for (const k of ['fullscreen', 'hideLauncher', 'autoPlay']) if (k in patch) cfg[k] = !!patch[k];
  }
  await saveCfg(); if (cfg.server !== before) checkForUpdate('manual');
  return cfg;
});
// the game's server browser switches servers: update to that server's version and reload
ipcMain.handle('set-server', async (_e, url) => { cfg.server = cleanServer(url); await saveCfg(); await checkForUpdate('manual'); if (gameWin && !gameWin.isDestroyed()) gameWin.reload(); return cfg.server; });
ipcMain.handle('restart-game', async () => { await checkForUpdate('manual'); pendingVersion = null; if (gameWin && !gameWin.isDestroyed()) gameWin.reload(); });
ipcMain.handle('quit-app', () => { app.quit(); });
ipcMain.handle('open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

// ---------- start ----------
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const w = gameWin || launcherWin; if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // the game is served from the downloaded copy (or the bundled one) under rbgame://game/
    protocol.handle('rbgame', req => {
      const u = new URL(req.url), rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html', base = gameDir(), file = path.normalize(path.join(base, rel));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createLauncher();
    const r = await checkForUpdate('start');
    if (cfg.autoPlay && r !== 'error') createGame();
    setInterval(() => checkForUpdate('background'), CHECK_EVERY);
    // the launcher program itself, from GitHub releases
    if (app.isPackaged) {
      try {
        const { autoUpdater } = require('electron-updater');
        // new launcher builds come from the game server's downloads/ folder (latest.yml + installer), so no other hosting is needed
        if (cfg.server) autoUpdater.setFeedURL({ provider: 'generic', url: cfg.server + '/downloads/' });
        autoUpdater.on('update-available', i => send('self-update', { state: 'downloading', version: i.version }));
        autoUpdater.on('update-downloaded', i => send('self-update', { state: 'ready', version: i.version }));
        autoUpdater.logger = { info: m => log('updater', m), warn: m => log('updater warn', m), error: m => log('updater error', m), debug: () => { } };
        autoUpdater.on('error', e => log('launcher update error:', e && e.message));
        ipcMain.handle('install-launcher-update', () => autoUpdater.quitAndInstall());
        autoUpdater.checkForUpdates().catch(e => log('launcher update check failed:', e && e.message));
      } catch (e) { }
    }
  });
  app.on('window-all-closed', () => app.quit());
}
