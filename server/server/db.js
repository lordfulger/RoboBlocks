'use strict';
// A small JSON-file database for accounts, profiles, the robot shop and moderation.
// Everything lives in data/roboblocks-db.json; writes are debounced and atomic (write temp, rename).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// same curve as the game: level L needs 125*L*(L-1) XP, up to level 10
const xpForLevel = l => 250 * (l - 1) * l / 2;
function levelFor(xp) { let l = 1; while (l < 10 && xp >= xpForLevel(l + 1)) l++; return l; }

class DB {
  constructor(dir, log = () => { }) {
    this.dir = dir; this.file = path.join(dir, 'roboblocks-db.json');
    // saves from before the rename to RoboBlocks
    try { const old = path.join(dir, 'blockcraft-db.json'); if (!fs.existsSync(this.file) && fs.existsSync(old)) fs.renameSync(old, this.file); } catch (e) { } this.log = log; this.timer = null;
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { }
    let d = {};
    try { if (fs.existsSync(this.file)) d = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (e) { log('database file is damaged, keeping a copy and starting fresh:', e.message); try { fs.copyFileSync(this.file, this.file + '.broken-' + Date.now()); } catch (e2) { } }
    this.d = Object.assign({ accounts: {}, shop: {}, bans: { names: [], ips: [] }, motd: '', words: [], clans: {}, reports: {}, stats: {} }, d);
    this.d.reports = Object.assign({ bugs: [], errors: {}, players: [], feedback: [] }, this.d.reports);
    this.d.stats = Object.assign({ matches: {}, weapons: {}, movers: {} }, this.d.stats);
  }
  save() { if (this.timer) return; this.timer = setTimeout(() => this.flush(), 1500); }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    try { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.d)); fs.renameSync(tmp, this.file); }
    catch (e) { this.log('could not save the database:', e.message); }
  }
  // ---------- accounts ----------
  static key(name) { return String(name || '').trim().toLowerCase(); }
  static validName(name) { return /^[A-Za-z0-9_-]{3,16}$/.test(String(name || '')); }
  account(name) { return this.d.accounts[DB.key(name)] || null; }
  hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
  register(name, pw) {
    if (!DB.validName(name)) return { e: 'Use 3 to 16 letters, numbers, - or _.' };
    if (typeof pw !== 'string' || pw.length < 6 || pw.length > 72) return { e: 'Use a password of 6 to 72 characters.' };
    const k = DB.key(name); if (this.d.accounts[k]) return { e: 'That name is taken.' };
    const salt = crypto.randomBytes(16).toString('hex');
    const first = !Object.keys(this.d.accounts).length;
    this.d.accounts[k] = { name, salt, hash: this.hashPw(pw, salt), admin: false, created: Date.now(), tokens: [], p: newProfile() };
    this.save(); this.log(`account created: ${name}${first ? ' (first account; use the console command "op ' + name + '" to make it an admin)' : ''}`);
    return { a: this.d.accounts[k] };
  }
  login(name, pw) {
    const a = this.account(name); if (!a) return { e: 'Wrong name or password.' };
    const h = this.hashPw(pw, a.salt);
    if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(a.hash, 'hex'))) return { e: 'Wrong name or password.' };
    return { a };
  }
  newToken(a) {
    const t = crypto.randomBytes(24).toString('hex'), h = crypto.createHash('sha256').update(t).digest('hex');
    a.tokens = (a.tokens || []).concat(h).slice(-5); this.save(); return t;
  }
  byToken(t) {
    if (typeof t !== 'string' || t.length > 100) return null;
    const h = crypto.createHash('sha256').update(t).digest('hex');
    for (const a of Object.values(this.d.accounts)) if ((a.tokens || []).includes(h)) return a;
    return null;
  }
  dropToken(a, t) { const h = crypto.createHash('sha256').update(String(t)).digest('hex'); a.tokens = (a.tokens || []).filter(x => x !== h); this.save(); }
  // ---------- profiles ----------
  publicProfile(a) {
    const p = a.p || newProfile();
    return { name: a.name, clan: a.clan && this.d.clans[a.clan] ? a.clan : null, admin: !!a.admin, xp: p.xp, lv: levelFor(p.xp), matches: p.matches, wins: p.wins, kills: p.kills, deaths: p.deaths, dmg: Math.round(p.dmg), healed: Math.round(p.healed || 0), elo: Math.round(p.elo), ranked: p.ranked || 0, created: a.created, season: p.sea && p.sea.s === seasonNo() ? { elo: Math.round(p.sea.elo), games: p.sea.games, wins: p.sea.wins, placed: p.sea.games >= SEASON_MIN_GAMES } : null, past: (p.past || []).slice(0, 6) };
  }
  // one finished match for one pilot. Returns the XP awarded.
  record(a, r) {
    const p = a.p || (a.p = newProfile());
    const win = r.result === 'win', draw = r.result === 'draw';
    const xp = Math.round(Math.min(r.cap || 3000, 80 + Math.round(r.dmg / 12) + Math.round((r.healed || 0) / 10) + r.kills * 60 + (win ? 250 : draw ? 100 : 0)) * (r.xpRate == null ? 1 : r.xpRate));
    p.xp += xp; p.matches++; if (win) p.wins++; p.kills += r.kills; p.deaths += r.deaths; p.dmg += r.dmg; p.healed = (p.healed || 0) + (r.healed || 0);
    if (r.eloDelta) { p.elo = Math.max(100, p.elo + r.eloDelta); p.ranked = (p.ranked || 0) + 1; }
    if (r.ranked && r.eloDelta) { const se = this.seasonOf(a); se.elo = Math.max(100, se.elo + (r.eloDelta || 0)); se.games++; if (win) se.wins++; se.peak = Math.max(se.peak, se.elo); }
    p.history = [{ t: Date.now(), mode: r.mode, map: r.map, result: r.result, kills: r.kills, deaths: r.deaths, dmg: Math.round(r.dmg), xp, elo: r.eloDelta ? Math.round(r.eloDelta) : 0, server: r.server || '', practice: !!r.practice }].concat(p.history || []).slice(0, 25);
    this.save(); return xp;
  }
  // this season's record for an account (rolls over when a new season starts)
  seasonOf(a) {
    const p = a.p || (a.p = newProfile()), cur = seasonNo();
    if (!p.sea || p.sea.s !== cur) {
      if (p.sea && p.sea.games >= SEASON_MIN_GAMES) p.past = [{ s: p.sea.s, elo: Math.round(p.sea.elo), peak: Math.round(p.sea.peak), games: p.sea.games, wins: p.sea.wins }].concat(p.past || []).slice(0, 24);
      const base = p.sea ? 1200 + (p.sea.elo - 1200) / 2 : 1200;
      p.sea = { s: cur, elo: base, peak: base, games: 0, wins: 0 };
    }
    return p.sea;
  }
  seasonPublic(a) { const se = this.seasonOf(a); return { s: se.s, elo: Math.round(se.elo), peak: Math.round(se.peak), games: se.games, wins: se.wins, placed: se.games >= SEASON_MIN_GAMES }; }
  seasonBoard(n = 50) {
    const cur = seasonNo();
    return Object.values(this.d.accounts).filter(a => a.p && a.p.sea && a.p.sea.s === cur && a.p.sea.games > 0 && !this.isBanned(a.name))
      .map(a => ({ name: a.name, clan: a.clan || null, elo: Math.round(a.p.sea.elo), games: a.p.sea.games, wins: a.p.sea.wins, placed: a.p.sea.games >= SEASON_MIN_GAMES }))
      .sort((x, y) => (y.placed - x.placed) || y.elo - x.elo || y.wins - x.wins).slice(0, n);
  }
  leaderboard(sort) {
    const key = { xp: 'xp', wins: 'wins', kills: 'kills', elo: 'elo' }[sort] || 'xp';
    return Object.values(this.d.accounts).filter(a => a.p && (a.p.matches || 0) > 0 && !this.isBanned(a.name))
      .map(a => this.publicProfile(a)).sort((x, y) => y[key] - x[key] || y.xp - x.xp).slice(0, 50);
  }
  // ---------- moderation ----------
  isBanned(name, ip) { const b = this.d.bans; return (!!name && b.names.includes(DB.key(name))) || (!!ip && b.ips.includes(ip)); }
  ban(name, ip) { const b = this.d.bans; if (name && !b.names.includes(DB.key(name))) b.names.push(DB.key(name)); if (ip && !b.ips.includes(ip)) b.ips.push(ip); this.save(); }
  unban(x) { const b = this.d.bans, k = DB.key(x); const n = b.names.length + b.ips.length; b.names = b.names.filter(v => v !== k); b.ips = b.ips.filter(v => v !== x); this.save(); return n !== b.names.length + b.ips.length; }
  // ---------- playtest reports ----------
  addReport(kind, item, cap) { const L = this.d.reports[kind]; L.unshift({ ...item, t: Date.now() }); if (L.length > cap) L.length = cap; this.save(); }
  addError(e) {
    const E = this.d.reports.errors, key = (String(e.msg).slice(0, 160) + '|' + String(e.where || '').slice(0, 80));
    const x = E[key] || (E[key] = { msg: String(e.msg).slice(0, 300), stack: String(e.stack || '').slice(0, 1200), where: String(e.where || '').slice(0, 80), n: 0, first: Date.now(), ver: '' });
    x.n++; x.last = Date.now(); x.ver = String(e.ver || '').slice(0, 20);
    const keys = Object.keys(E); if (keys.length > 200) { keys.sort((a, b) => E[a].last - E[b].last); delete E[keys[0]]; }
    this.save();
  }
  setPassword(a, pw) { if (typeof pw !== 'string' || pw.length < 6 || pw.length > 72) return { e: 'Use a password of 6 to 72 characters.' }; a.salt = crypto.randomBytes(16).toString('hex'); a.hash = this.hashPw(pw, a.salt); a.tokens = []; this.save(); return {}; }
  // ---------- match stats for balancing ----------
  addMatchStats(r) {
    const S = this.d.stats, k = `${r.mode}/${r.map}`, m = S.matches[k] || (S.matches[k] = { n: 0, blue: 0, red: 0, draw: 0, secs: 0 });
    m.n++; if (r.winner === 0) m.blue++; else if (r.winner === 1) m.red++; else m.draw++; m.secs += Math.max(0, Math.min(3600, r.secs | 0));
    for (const [w, v] of Object.entries(r.weapons || {})) S.weapons[w] = (S.weapons[w] || 0) + Math.max(0, Math.min(1e7, +v || 0));
    for (const [mv, x] of Object.entries(r.movers || {})) { const o = S.movers[mv] || (S.movers[mv] = { played: 0, won: 0 }); o.played += x.played | 0; o.won += x.won | 0; }
    this.save();
  }
  // ---------- clans ----------
  clanOf(a) { return a && a.clan && this.d.clans[a.clan] ? this.d.clans[a.clan] : null; }
  clanCreate(a, tag, name) {
    tag = String(tag || '').toUpperCase(); if (!/^[A-Z0-9]{2,5}$/.test(tag)) return { e: 'A clan tag is 2 to 5 letters or numbers.' };
    if (this.clanOf(a)) return { e: 'Leave your clan first.' };
    if (this.d.clans[tag]) return { e: 'That tag is taken.' };
    name = String(name || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 28) || tag;
    this.d.clans[tag] = { tag, name, owner: DB.key(a.name), members: [DB.key(a.name)], t: Date.now() }; a.clan = tag; this.save(); return { tag };
  }
  clanJoin(a, tag) {
    tag = String(tag || '').toUpperCase(); const c = this.d.clans[tag]; if (!c) return { e: 'No clan with that tag.' };
    if (this.clanOf(a)) return { e: 'Leave your clan first.' };
    if (c.members.length >= 30) return { e: 'That clan is full (30 pilots).' };
    c.members.push(DB.key(a.name)); a.clan = tag; this.save(); return { tag };
  }
  clanLeave(a) {
    const c = this.clanOf(a); if (!c) return { e: 'You are not in a clan.' };
    const k = DB.key(a.name); c.members = c.members.filter(m => m !== k); a.clan = null;
    if (!c.members.length) delete this.d.clans[c.tag]; else if (c.owner === k) c.owner = c.members[0];
    this.save(); return {};
  }
  clanKick(a, name) {
    const c = this.clanOf(a); if (!c || c.owner !== DB.key(a.name)) return { e: 'Only the clan leader can do that.' };
    const v = this.account(name); if (!v || v.clan !== c.tag || v === a) return { e: 'No such member.' };
    c.members = c.members.filter(m => m !== DB.key(v.name)); v.clan = null; this.save(); return {};
  }
  clanInfo(tag) {
    const c = this.d.clans[String(tag || '').toUpperCase()]; if (!c) return { e: 'No clan with that tag.' };
    const members = c.members.map(k => this.d.accounts[k]).filter(Boolean).map(x => this.publicProfile(x)).sort((x, y) => y.xp - x.xp);
    return { tag: c.tag, name: c.name, owner: (this.d.accounts[c.owner] || {}).name || c.owner, members, xp: members.reduce((s, m) => s + m.xp, 0), wins: members.reduce((s, m) => s + m.wins, 0), t: c.t };
  }
  clanBoard() { return Object.keys(this.d.clans).map(t => this.clanInfo(t)).filter(c => !c.e).map(({ members, ...c }) => ({ ...c, size: members.length })).sort((x, y) => y.xp - x.xp).slice(0, 50); }
  // ---------- robot shop ----------
  shopList(sort, viewer) {
    const items = Object.values(this.d.shop).filter(i => !this.isBanned(i.owner));
    const score = i => Object.values(i.votes || {}).reduce((s, v) => s + v, 0);
    const by = { new: (a, b) => b.t - a.t, dl: (a, b) => b.dl - a.dl || score(b) - score(a), top: (a, b) => score(b) - score(a) || b.dl - a.dl }[sort] || ((a, b) => score(b) - score(a) || b.t - a.t);
    const vk = viewer ? DB.key(viewer) : null;
    return items.filter(i => sort !== 'mine' || i.owner === vk).sort(by).slice(0, 60)
      .map(i => ({ key: i.key, name: i.name, author: (this.d.accounts[i.owner] || {}).name || i.owner, d: i.d, cpu: i.cpu, lv: i.lv, t: i.t, dl: i.dl, score: score(i), my: vk ? (i.votes || {})[vk] || 0 : 0, mine: i.owner === vk }));
  }
  shopPublish(a, it) {
    const owner = DB.key(a.name), mine = Object.values(this.d.shop).filter(i => i.owner === owner);
    if (mine.length >= 20) return { e: 'You can share up to 20 robots. Delete one first.' };
    if (typeof it.d !== 'string' || it.d.length < 12 || it.d.length > 6000 || !/^[~A-Za-z0-9+/_!-]+$/.test(it.d)) return { e: 'That design could not be read.' };
    if (mine.some(i => i.d === it.d)) return { e: 'You already shared this robot.' };
    const key = crypto.randomBytes(6).toString('hex');
    this.d.shop[key] = { key, owner, name: String(it.name || 'Robot').slice(0, 24), d: it.d, cpu: Math.max(0, Math.min(5000, it.cpu | 0)), lv: Math.max(1, Math.min(10, it.lv | 0)), t: Date.now(), dl: 0, votes: {} };
    this.save(); return { key };
  }
  shopRate(a, key, v) { const i = this.d.shop[key]; if (!i) return { e: 'That robot is gone.' }; if (i.owner === DB.key(a.name)) return { e: 'You cannot rate your own robot.' }; i.votes = i.votes || {}; if (v === 0) delete i.votes[DB.key(a.name)]; else i.votes[DB.key(a.name)] = v > 0 ? 1 : -1; this.save(); return {}; }
  shopDownload(key) { const i = this.d.shop[key]; if (!i) return { e: 'That robot is gone.' }; i.dl++; this.save(); return { d: i.d, name: i.name }; }
  shopDelete(a, key) { const i = this.d.shop[key]; if (!i) return { e: 'That robot is gone.' }; if (i.owner !== DB.key(a.name) && !a.admin) return { e: 'That is not your robot.' }; delete this.d.shop[key]; this.save(); return {}; }
}
// ranked seasons: one per calendar month (UTC). Ratings start each season halfway back to 1200, and the
// final rating of every season you played at least 5 ranked games in is kept on your profile.
const SEASON_MIN_GAMES = 5;
function seasonNo(t = Date.now()) { const d = new Date(t); return (d.getUTCFullYear() - 2026) * 12 + d.getUTCMonth() + 1; }
function seasonEnds(s) { return Date.UTC(2026 + Math.floor(s / 12), s % 12, 1); }
function newProfile() { return { xp: 0, matches: 0, wins: 0, kills: 0, deaths: 0, dmg: 0, healed: 0, elo: 1200, ranked: 0, history: [] }; }
// ELO for one team result: everyone on a team moves by the same amount
function eloDeltas(teamElo, winner, K = 32) {
  const [a, b] = teamElo, ea = 1 / (1 + Math.pow(10, (b - a) / 400));
  const sa = winner === 0 ? 1 : winner === 1 ? 0 : .5;
  return [K * (sa - ea), K * ((1 - sa) - (1 - ea))];
}
module.exports = { DB, levelFor, eloDeltas, seasonNo, seasonEnds, SEASON_MIN_GAMES };
