'use strict';
// Presence relay: the same model as the claude.ai `room` capability.
// Each connection is a peer; peers join named rooms and keep one presence object per room,
// which the relay hands to everyone in that room and to newcomers.
// On top of that the relay knows who is signed in, so it can stamp verified fields (acct, lv, rk)
// into presence, and it enforces bans, server passwords, ranked servers and level limits.
const crypto = require('crypto');
const { filterText, cleanChat } = require('./filter');
const { levelFor } = require('./db');
const ROOM_RE = /^[a-z0-9_][a-z0-9_.-]{0,47}$/;

class Relay {
  constructor({ servers, maxClients = 64, maxPresence = 16384, log = () => { }, db = null, api = null, requireAccount = false, unlockAll = false, version = '', balance = () => null }) {
    this.version = version; this.balance = balance; this.requireAccount = requireAccount; this.unlockAll = unlockAll; this.servers = servers; this.maxClients = maxClients; this.maxPresence = maxPresence; this.log = log; this.db = db; this.api = api;
    this.peers = new Map(); // id -> { send, close, rooms: Set, local, budget, t, ip, acct, unlocked: Set }
    this.rooms = new Map(); // name -> Map(peerId -> presence)
  }
  get humanCount() { let n = 0; for (const p of this.peers.values()) if (!p.local) n++; return n; }
  publicServers() { return this.servers.map(s => ({ id: s.id, name: s.name, blurb: s.blurb, n: s.n, rot: s.rot, locked: !!s.password, ranked: !!s.ranked, minLv: s.minLv || 1, maxLv: s.maxLv || 10 })); }
  connect(send, { local = false, ip = '', close = () => { } } = {}) {
    if (!local && this.humanCount >= this.maxClients) return null;
    if (!local && this.db && this.db.isBanned(null, ip)) { send({ t: 'kicked', reason: 'You are banned from this server.' }); return null; }
    const id = 'p' + crypto.randomBytes(8).toString('hex');
    const peer = { send, close, rooms: new Set(), local, budget: 120, t: Date.now(), ip, acct: null, unlocked: new Set(), apiT: [] };
    this.peers.set(id, peer);
    send({ t: 'welcome', peer: id, servers: this.publicServers(), motd: this.db ? this.db.d.motd : '', accounts: !!this.db, requireAccount: this.requireAccount, unlockAll: this.unlockAll, version: this.version, balance: this.balance() });
    return { id, onMessage: raw => this.handle(id, raw), close: () => this.drop(id) };
  }
  handle(id, raw) {
    const peer = this.peers.get(id); if (!peer) return;
    if (!peer.local) { // simple token bucket: ~120 messages a second, burst 240 (players send 20 updates a second in battle)
      const now = Date.now(); peer.budget = Math.min(240, peer.budget + (now - peer.t) * .12); peer.t = now;
      if (peer.budget < 1) return; peer.budget--;
    }
    let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'api') { if (this.api) this.api.handle(this, id, peer, m); return; }
    if (typeof m.room !== 'string' || !ROOM_RE.test(m.room)) return;
    if (m.t === 'join') return this.join(id, m.room, m.pw);
    if (m.t === 'leave') return this.leave(id, m.room);
    if (m.t === 'pres' && m.p && typeof m.p === 'object' && !Array.isArray(m.p)) {
      const room = this.rooms.get(m.room); if (!room || !room.has(id)) return;
      const cur = { ...room.get(id) };
      for (const k of Object.keys(m.p)) { if (m.p[k] === null) delete cur[k]; else cur[k] = m.p[k]; }
      // chat and names pass through the word filter
      if ('ch' in m.p && cur.ch) cur.ch = cleanChat(cur.ch);
      for (const k of ['name', 'n', 'dn']) if (typeof m.p[k] === 'string') cur[k] = filterText(m.p[k].slice(0, 24));
      this.stamp(peer, cur);
      if (JSON.stringify(cur).length > this.maxPresence) return;
      room.set(id, cur); if (m.room === '__lobby') this.noteCode(cur);
      this.broadcast(m.room, { t: 'pres', room: m.room, peer: id, presence: cur }, id);
    }
  }
  // verified fields: only the relay may set these
  stamp(peer, cur) {
    if (peer.local) return;
    const a = peer.acct;
    cur.acct = a ? a.name : null;
    cur.clan = a && a.clan && this.db && this.db.d.clans[a.clan] ? a.clan : null;
    if (a) { cur.lv = levelFor((a.p || {}).xp || 0); cur.rk = Math.round((a.p || {}).elo || 1200); if (cur.name !== undefined) cur.name = a.name; if (cur.n !== undefined) cur.n = a.name; }
    else delete cur.rk;
  }
  restamp(id) { // after sign-in/out: re-send this peer's presence everywhere
    const peer = this.peers.get(id); if (!peer) return;
    for (const name of peer.rooms) { const room = this.rooms.get(name); if (!room || !room.has(id)) continue; const cur = { ...room.get(id) }; this.stamp(peer, cur); room.set(id, cur); this.broadcast(name, { t: 'pres', room: name, peer: id, presence: cur }); }
  }
  serverFor(room) {
    for (const s of this.servers) { const base = 'g' + s.id; if (room === base || (room.startsWith(base) && /^(s|c|a\d{1,2})$/.test(room.slice(base.length)))) return s; }
    return null;
  }
  access(peer, name, pw) {
    if (peer.local) return null;
    if (peer.acct && peer.acct.admin) return null;
    if (this.db && this.db.isBanned(peer.acct && peer.acct.name, peer.ip)) return 'You are banned from this server.';
    if (this.requireAccount && !peer.acct && name !== '__lobby') return 'This server needs an account. Sign in from the main menu.';
    const s = this.serverFor(name); if (!s) return null;
    const isMain = name === 'g' + s.id;
    if (s.password && !peer.unlocked.has(s.id)) {
      if (!isMain || pw !== s.password) return pw ? 'Wrong password.' : 'This server needs a password.';
      peer.unlocked.add(s.id);
    }
    if ((s.ranked || (s.minLv || 1) > 1 || (s.maxLv || 10) < 10) && !peer.acct) return s.ranked ? 'Ranked servers need an account. Sign in from the main menu.' : 'This server checks pilot levels. Sign in from the main menu.';
    if (peer.acct) { const lv = levelFor((peer.acct.p || {}).xp || 0); if (lv < (s.minLv || 1) || lv > (s.maxLv || 10)) return `This server is for pilot levels ${s.minLv || 1} to ${s.maxLv || 10}.`; }
    return null;
  }
  join(id, name, pw) {
    const peer = this.peers.get(id); if (!peer || peer.rooms.has(name) || peer.rooms.size >= 24) return;
    const why = this.access(peer, name, typeof pw === 'string' ? pw.slice(0, 64) : '');
    if (why) { peer.send({ t: 'denied', room: name, reason: why }); return; }
    let room = this.rooms.get(name); if (!room) this.rooms.set(name, room = new Map());
    const cur = {}; this.stamp(peer, cur);
    room.set(id, cur); peer.rooms.add(name);
    peer.send({ t: 'peers', room: name, peers: [...room.entries()].map(([p, presence]) => ({ peer: p, presence })) });
    this.broadcast(name, { t: 'pres', room: name, peer: id, presence: cur }, id);
  }
  leave(id, name) {
    const peer = this.peers.get(id), room = this.rooms.get(name);
    if (peer) peer.rooms.delete(name);
    if (!room || !room.delete(id)) return;
    if (!room.size) this.rooms.delete(name);
    this.broadcast(name, { t: 'left', room: name, peer: id });
  }
  drop(id) {
    const peer = this.peers.get(id); if (!peer) return;
    for (const name of [...peer.rooms]) this.leave(id, name);
    this.peers.delete(id);
  }
  kick(id, reason) {
    const peer = this.peers.get(id); if (!peer || peer.local) return false;
    try { peer.send({ t: 'kicked', reason: reason || 'You were removed from the server.' }); } catch (e) { }
    this.drop(id); setTimeout(() => { try { peer.close(); } catch (e) { } }, 100);
    return true;
  }
  broadcastAll(msg) { for (const p of this.peers.values()) p.send(p.local ? msg : JSON.stringify(msg)); }
  notice(text) { for (const p of this.peers.values()) if (!p.local) p.send({ t: 'notice', text: String(text).slice(0, 300) }); }
  broadcast(name, msg, except) {
    const room = this.rooms.get(name); if (!room) return;
    let text = null;
    for (const pid of room.keys()) {
      if (pid === except) continue;
      const p = this.peers.get(pid); if (!p) continue;
      if (p.local) p.send(msg); else p.send(text || (text = JSON.stringify(msg)));
    }
  }
  // friend codes: remember the name that goes with each code, so friends lists can show names (and where they are)
  noteCode(pr) {
    const fc = String(pr.fc || ''); if (!this.db || !/^RB-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(fc)) return;
    const name = String(pr.acct || pr.name || '').slice(0, 24); if (!name) return;
    const m = this.db.d.fcodes || (this.db.d.fcodes = {}), old = m[fc];
    if (old && old.n === name && Date.now() - old.t < 3600000) return; // only write when it changes, or hourly
    m[fc] = { n: name, t: Date.now() };
    const keys = Object.keys(m); if (keys.length > 20000) { keys.sort((a, b) => m[a].t - m[b].t); for (const k of keys.slice(0, keys.length - 20000)) delete m[k]; }
    this.db.save();
  }
  // codes -> { name, online, sv (room id), seen }
  codeInfo(codes) {
    const lobby = this.rooms.get('__lobby') || new Map(), out = {}, fcodes = (this.db && this.db.d.fcodes) || {};
    const want = new Set(codes); for (const c of want) { const f = fcodes[c]; out[c] = { name: f ? f.n : null, seen: f ? f.t : 0, online: false, sv: null }; }
    for (const [id, pr] of lobby) { const p = this.peers.get(id); if (!p || p.local || !want.has(pr.fc)) continue; out[pr.fc] = { name: String(pr.acct || pr.name || out[pr.fc].name || '').slice(0, 24), seen: Date.now(), online: true, sv: pr.sv || null }; }
    return out;
  }
  // who is online, for the console and the admin panel
  players() {
    const lobby = this.rooms.get('__lobby') || new Map(), out = [];
    for (const [id, p] of this.peers) {
      if (p.local) continue;
      const pr = lobby.get(id) || {};
      out.push({ id, name: String(pr.name || '?').slice(0, 16), acct: p.acct ? p.acct.name : null, admin: !!(p.acct && p.acct.admin), sv: pr.sv || null, ip: p.ip });
    }
    return out;
  }
  findPlayers(q) { q = String(q || '').toLowerCase(); return this.players().filter(p => p.id === q || p.name.toLowerCase() === q || (p.acct && p.acct.toLowerCase() === q)); }
  lobbyNames() { return this.players().map(p => ({ name: p.acct || p.name, sv: p.sv })); }
}
module.exports = { Relay };
