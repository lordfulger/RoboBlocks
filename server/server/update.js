'use strict';
// RoboBlocks server updater. Runs before the server on every start (the egg's startup command) and from the
// `update` console command or the admin page. It fetches the newest server package from one of:
//   UPDATE_FROM   another RoboBlocks server (it shares its package at /server-package.tar.gz)
//   DOWNLOAD_URL  a .tar.gz of the server files (for example a GitHub release "latest" link)
//   GIT_REPO      a Git repository (needs git in the container; GIT_BRANCH picks the branch)
// and installs it only when it is newer. Your data/, servers.json, balance.json and downloads/ are never touched,
// and the old code is kept in backups/code-<version>/ (the last three).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { unpack } = require('./tar');

const ROOT = path.join(__dirname, '..');
const MANAGED_DIRS = ['server', 'public', 'vendor'];
const MANAGED_FILES = ['package.json', 'README.md', 'egg-roboblocks.json', 'LICENSE'];
const env = process.env;

// a release has two numbers: the game's (BC_VERSION in public/index.html) and the server code's (package.json).
// A package is newer when its game is newer, or the game is the same and the server code is newer.
const pageVer = s => (String(s || '').match(/const BC_VERSION = '([^']+)'/) || [])[1] || '0.0.0';
const pkgVer = s => { try { return JSON.parse(String(s)).version || '0.0.0'; } catch (e) { return '0.0.0'; } };
const rd = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
const readVersions = (dir = ROOT) => ({ game: pageVer(rd(path.join(dir, 'public', 'index.html'))), pkg: pkgVer(rd(path.join(dir, 'package.json'))) });
const filesVersions = files => ({ game: pageVer(files.get('public/index.html')), pkg: pkgVer(files.get('package.json')) });
const readVersion = (dir = ROOT) => { const v = readVersions(dir); return v.game + (v.pkg !== v.game ? ` (server ${v.pkg})` : ''); };
const label = v => v.game + (v.pkg !== v.game ? ` (server ${v.pkg})` : '');
// 2.10.0 > 2.9.3; anything unparseable counts as 0
function isNewer(r, l) { return newer(r.game, l.game) || (r.game === l.game && newer(r.pkg, l.pkg)); }
function newer(a, b) { const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0), pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); } return false; }
const cleanUrl = u => { try { const x = new URL(String(u || '').trim()); return /^https?:$/.test(x.protocol) ? x.href.replace(/\/+$/, '') : ''; } catch (e) { return ''; } };

async function get(url, ms = 60000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal, redirect: 'follow', headers: { 'User-Agent': 'RoboBlocks-server-updater' } }); if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`); return Buffer.from(await r.arrayBuffer()); }
  finally { clearTimeout(t); }
}
function source() {
  if (cleanUrl(env.UPDATE_FROM)) return { kind: 'server', url: cleanUrl(env.UPDATE_FROM) };
  if (cleanUrl(env.DOWNLOAD_URL)) return { kind: 'download', url: cleanUrl(env.DOWNLOAD_URL) };
  if (String(env.GIT_REPO || '').trim()) return { kind: 'git', url: String(env.GIT_REPO).trim(), branch: String(env.GIT_BRANCH || '').trim() };
  return null;
}
// the package as Map(relative path -> Buffer), rooted at the folder that holds server/index.js
function rootAt(files) {
  const idx = [...files.keys()].filter(f => /(^|\/)server\/index\.js$/.test(f)).sort((a, b) => a.length - b.length)[0];
  if (!idx) throw new Error('the package has no server/index.js');
  const base = idx.slice(0, -'server/index.js'.length), out = new Map();
  for (const [k, v] of files) if (k.startsWith(base)) out.set(k.slice(base.length), v);
  return out;
}
function readTree(dir, base = dir, out = new Map()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === '.git') continue; const p = path.join(dir, e.name); if (e.isDirectory()) readTree(p, base, out); else if (e.isFile()) out.set(path.relative(base, p).split(path.sep).join('/'), fs.readFileSync(p)); }
  return out;
}
async function fetchPackage(src, log) {
  if (src.kind === 'server') {
    // ask for the version first, so an up-to-date peer costs one tiny request
    try { const st = JSON.parse((await get(src.url + '/status', 10000)).toString('utf8')); const r = { game: st.version || '0.0.0', pkg: st.serverVersion || st.version || '0.0.0' }; if (st && st.version && !isNewer(r, readVersions())) return { versions: r, files: null }; } catch (e) { log(`could not read ${src.url}/status: ${e.message}`); }
    return { files: rootAt(unpack(await get(src.url + '/server-package.tar.gz'))) };
  }
  if (src.kind === 'download') return { files: rootAt(unpack(await get(src.url))) };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-git-'));
  try {
    const args = ['clone', '--depth', '1']; if (src.branch) args.push('--branch', src.branch); args.push(src.url, tmp);
    execFileSync('git', args, { stdio: 'ignore', timeout: 120000 });
    return { files: rootAt(readTree(tmp)) };
  } catch (e) { throw new Error(e.code === 'ENOENT' ? 'git is not installed in this container; use DOWNLOAD_URL or UPDATE_FROM instead' : 'git clone failed: ' + e.message); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
function install(files, version, log) {
  const current = readVersions().game + '-' + readVersions().pkg, backup = path.join(ROOT, 'backups', 'code-' + current);
  // keep a copy of the running code
  fs.rmSync(backup, { recursive: true, force: true }); fs.mkdirSync(backup, { recursive: true });
  for (const d of MANAGED_DIRS) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(backup, d), { recursive: true });
  for (const f of MANAGED_FILES) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(backup, f));
  const olds = fs.readdirSync(path.join(ROOT, 'backups')).filter(n => n.startsWith('code-')).map(n => ({ n, t: fs.statSync(path.join(ROOT, 'backups', n)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const o of olds.slice(3)) fs.rmSync(path.join(ROOT, 'backups', o.n), { recursive: true, force: true });
  // write the new files next to the old ones, then swap folder by folder
  const stage = path.join(ROOT, '.update-stage'); fs.rmSync(stage, { recursive: true, force: true });
  let n = 0;
  for (const [rel, data] of files) {
    const top = rel.split('/')[0];
    if (!(MANAGED_DIRS.includes(top) && rel.includes('/')) && !MANAGED_FILES.includes(rel)) continue;
    const dest = path.join(stage, rel); if (!dest.startsWith(stage + path.sep)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data); n++;
  }
  if (!fs.existsSync(path.join(stage, 'server', 'index.js')) || !fs.existsSync(path.join(stage, 'public', 'index.html'))) { fs.rmSync(stage, { recursive: true, force: true }); throw new Error('the package is incomplete (needs server/ and public/)'); }
  for (const d of MANAGED_DIRS) if (fs.existsSync(path.join(stage, d))) { fs.rmSync(path.join(ROOT, d), { recursive: true, force: true }); fs.renameSync(path.join(stage, d), path.join(ROOT, d)); }
  for (const f of MANAGED_FILES) if (fs.existsSync(path.join(stage, f))) fs.copyFileSync(path.join(stage, f), path.join(ROOT, f));
  fs.rmSync(stage, { recursive: true, force: true });
  log(`installed ${version} (${n} files). The previous code (${current}) is in backups/code-${current}/.`);
}
// check: { apply } -> { state: 'none'|'current'|'available'|'installed'|'error', current, latest, source, error }
async function update({ apply = true, log = m => console.log('[update] ' + m) } = {}) {
  const cur = readVersions(), current = label(cur), src = source();
  if (!src) return { state: 'none', current };
  try {
    const got = await fetchPackage(src, log);
    const rv = got.files ? filesVersions(got.files) : got.versions, latest = label(rv);
    if (!isNewer(rv, cur)) return { state: 'current', current, latest, source: src.kind + ' ' + src.url };
    if (!apply) return { state: 'available', current, latest, source: src.kind + ' ' + src.url };
    install(got.files, latest, log);
    return { state: 'installed', current, latest, source: src.kind + ' ' + src.url };
  } catch (e) { return { state: 'error', current, source: src.kind + ' ' + src.url, error: e.message }; }
}
module.exports = { update, newer, isNewer, readVersion, readVersions };

// started directly (the egg runs this before the server): update when AUTO_UPDATE is on, never block startup
if (require.main === module) {
  if (/^(0|false|no|off)$/i.test(String(env.AUTO_UPDATE || '1'))) { console.log('[update] automatic updates are off (AUTO_UPDATE=0)'); process.exit(0); }
  update({ apply: true }).then(r => {
    if (r.state === 'none') console.log('[update] no update source set (UPDATE_FROM, DOWNLOAD_URL or GIT_REPO); skipping');
    else if (r.state === 'current') console.log(`[update] ${r.current} is up to date (${r.source})`);
    else if (r.state === 'installed') console.log(`[update] updated ${r.current} -> ${r.latest} from ${r.source}`);
    else if (r.state === 'error') console.log(`[update] could not update from ${r.source}: ${r.error}. Starting ${r.current}.`);
    process.exit(0);
  }).catch(e => { console.log('[update] ' + e.message); process.exit(0); });
}
