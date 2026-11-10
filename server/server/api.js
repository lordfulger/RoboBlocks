'use strict';
// Request/response calls from the game over the same WebSocket: {t:'api', id, op, a} -> {t:'api', id, ok, d | e}
const { DB, levelFor } = require('./db');

class Api {
  constructor({ db, log = () => { }, ext = {} }) { this.db = db; this.log = log; this.ext = ext; }
  handle(relay, id, peer, m) {
    const reply = (ok, x) => peer.send(ok ? { t: 'api', id: m.id, ok: true, d: x === undefined ? null : x } : { t: 'api', id: m.id, ok: false, e: String(x) });
    if (typeof m.op !== 'string') return reply(false, 'Bad request.');
    // a few calls a second is plenty; sign-in attempts are slower still
    const now = Date.now(); peer.apiT = peer.apiT.filter(t => now - t < 10000);
    if (peer.apiT.length >= 40) return reply(false, 'Too many requests. Wait a moment.');
    peer.apiT.push(now);
    const a = m.a && typeof m.a === 'object' ? m.a : {};
    let out;
    try { out = this.op(relay, id, peer, m.op, a); } catch (e) { this.log('api error', m.op, e && e.stack || e); return reply(false, 'Server error.'); }
    const done = x => { if (x && x.e) reply(false, x.e); else reply(true, x); };
    if (out && typeof out.then === 'function') out.then(done, e => { this.log('api error', m.op, e && e.stack || e); reply(false, 'Server error.'); }); else done(out);
  }
  me(peer) { const a = peer.acct; return a ? { ...this.db.publicProfile(a), history: (a.p.history || []).slice(0, 25) } : null; }
  op(relay, id, peer, op, a) {
    const db = this.db, acct = peer.acct, admin = !!(acct && acct.admin);
    const signIn = (r) => {
      if (r.e) return r;
      if (db.isBanned(r.a.name)) return { e: 'This account is banned.' };
      peer.acct = r.a; relay.restamp(id);
      return { token: db.newToken(r.a), me: this.me(peer) };
    };
    switch (op) {
      case 'info': return { motd: db.d.motd, servers: relay.publicServers(), me: this.me(peer) };
      case 'register': {
        if (peer.regT && Date.now() - peer.regT < 30000) return { e: 'Wait a little before making another account.' };
        const r = db.register(String(a.name || ''), a.pw); if (!r.e) peer.regT = Date.now(); return signIn(r);
      }
      case 'login': {
        peer.loginFails = peer.loginFails || 0;
        if (peer.loginFails >= 5 && Date.now() - (peer.loginT || 0) < 60000) return { e: 'Too many tries. Wait a minute.' };
        const r = db.login(String(a.name || ''), String(a.pw || ''));
        if (r.e) { peer.loginFails++; peer.loginT = Date.now(); return r; }
        peer.loginFails = 0; return signIn(r);
      }
      case 'resume': { const ac = db.byToken(a.token); if (!ac) return { e: 'Signed out. Sign in again.' }; if (db.isBanned(ac.name)) return { e: 'This account is banned.' }; peer.acct = ac; relay.restamp(id); return { me: this.me(peer) }; }
      case 'logout': { if (acct && a.token) db.dropToken(acct, a.token); peer.acct = null; relay.restamp(id); return {}; }
      case 'me': return this.me(peer);
      case 'ping': return { t: Date.now() };
      case 'account.changePw': {
        if (!acct) return { e: 'Not signed in.' };
        const r = db.login(acct.name, String(a.old || '')); if (r.e) return { e: 'Your current password is wrong.' };
        const s = db.setPassword(acct, a.pw); if (s.e) return s; return { token: db.newToken(acct) };
      }
      // playtest feedback: bug reports, script errors, player reports, post-match ratings
      case 'report.bug': case 'report.player': case 'report.feedback': {
        const k = op.slice(7), now = Date.now(); peer.rep = peer.rep || {};
        if (now - (peer.rep[k] || 0) < (k === 'feedback' ? 20000 : 30000)) return { e: 'Thanks! Please wait a little before sending another.' };
        peer.rep[k] = now;
        const who = acct ? acct.name : 'guest ' + String(a.name || '').slice(0, 16), ip = maskIp(peer.ip);
        if (k === 'bug') { const info = JSON.stringify(a.info || {}).slice(0, 6000); db.addReport('bugs', { who, ip, text: String(a.text || '').slice(0, 2000), info }, 300); this.log(`bug report from ${who}: ${String(a.text || '').slice(0, 80)}`); this.ext.onBug && this.ext.onBug(who, String(a.text || '')); }
        else if (k === 'player') { db.addReport('players', { who, ip, target: String(a.target || '').slice(0, 24), reason: String(a.reason || '').slice(0, 500), where: String(a.where || '').slice(0, 60) }, 300); this.log(`${who} reported ${a.target}`); }
        else db.addReport('feedback', { who, rating: ['fun', 'ok', 'bad'].includes(a.rating) ? a.rating : 'ok', text: String(a.text || '').slice(0, 600), mode: String(a.mode || '').slice(0, 8), map: String(a.map || '').slice(0, 8) }, 500);
        return {};
      }
      case 'report.error': { peer.errN = (peer.errN || 0) + 1; if (peer.errN > 30) return {}; db.addError(a); return {}; }
      // the pilot's save: garage bays, settings, tutorial and mutes (XP and history are kept separately)
      case 'save.get': if (!acct) return { e: 'Not signed in.' }; return acct.save || null;
      case 'save.put': {
        if (!acct) return { e: 'Not signed in.' };
        const d = a.data; if (!d || typeof d !== 'object' || Array.isArray(d)) return { e: 'Bad save.' };
        const text = JSON.stringify(d); if (text.length > 96 * 1024) return { e: 'Your save is too large (96 KB at most).' };
        if (!Array.isArray(d.bays) || d.bays.length > 5) return { e: 'Bad save.' };
        acct.save = JSON.parse(text); acct.save.t = Date.now(); db.save(); return { t: acct.save.t };
      }
      case 'profile': { const ac = db.account(a.name); if (!ac) return { e: 'No pilot by that name.' }; return { ...db.publicProfile(ac), history: (ac.p.history || []).slice(0, 25) }; }
      case 'lb': return db.leaderboard(String(a.sort || 'xp'));
      // practice battles against AI: the server can't watch these, so the reward is capped and rate limited
      case 'practice': {
        if (!acct) return { e: 'Not signed in.' };
        const last = acct.lastPractice || 0; if (Date.now() - last < 60000) return { e: 'Practice XP is limited to one battle a minute.' };
        acct.lastPractice = Date.now();
        const num = (v, max) => Math.max(0, Math.min(max, +v || 0));
        const r = { mode: String(a.mode || 'tdm').slice(0, 8), map: String(a.map || '').slice(0, 8), result: ['win', 'loss', 'draw'].includes(a.result) ? a.result : 'loss', kills: num(a.kills, 40) | 0, deaths: num(a.deaths, 40) | 0, dmg: num(a.dmg, 400000), healed: num(a.healed, 200000), practice: true, cap: 900, xpRate: this.ext.balance ? this.ext.balance().xpRate : 1 };
        const xp = db.record(acct, r); relay.restamp(id); return { xp, me: this.me(peer) };
      }
      // daily quest rewards: at most three a day, 300 XP each
      case 'quest.claim': {
        if (!acct) return { e: 'Not signed in.' };
        const day = a.day | 0, today = Math.floor(Date.now() / 86400000), xp = Math.max(0, Math.min(300, a.xp | 0));
        if (Math.abs(day - today) > 1 || !xp) return { e: 'That quest has expired.' };
        const q = acct.quests && acct.quests.day === day ? acct.quests : (acct.quests = { day, n: 0 });
        if (q.n >= 3) return { e: 'All of today\'s quest rewards are claimed.' };
        q.n++; const p = acct.p; p.xp += xp; db.save(); relay.restamp(id);
        return { xp, me: this.me(peer) };
      }
      case 'clan.create': if (!acct) return { e: 'Sign in to start a clan.' }; { const r = db.clanCreate(acct, a.tag, a.name); if (!r.e) relay.restamp(id); return r; }
      case 'clan.join': if (!acct) return { e: 'Sign in to join a clan.' }; { const r = db.clanJoin(acct, a.tag); if (!r.e) relay.restamp(id); return r; }
      case 'clan.leave': if (!acct) return { e: 'Not signed in.' }; { const r = db.clanLeave(acct); if (!r.e) relay.restamp(id); return r; }
      case 'clan.kick': if (!acct) return { e: 'Not signed in.' }; { const r = db.clanKick(acct, a.name); if (!r.e) for (const [pid, p] of relay.peers) if (p.acct && p.acct.clan == null) relay.restamp(pid); return r; }
      case 'clan.get': return db.clanInfo(a.tag);
      case 'clan.list': return db.clanBoard();
      case 'shop.list': return db.shopList(String(a.sort || 'top'), acct && acct.name);
      case 'shop.publish': if (!acct) return { e: 'Sign in to share robots.' }; return db.shopPublish(acct, a);
      case 'shop.rate': if (!acct) return { e: 'Sign in to rate robots.' }; return db.shopRate(acct, String(a.key || ''), Math.sign(+a.v || 0));
      case 'shop.get': return db.shopDownload(String(a.key || ''));
      case 'shop.delete': if (!acct) return { e: 'Not signed in.' }; return db.shopDelete(acct, String(a.key || ''));
    }
    if (!op.startsWith('admin.')) return { e: 'Unknown request.' };
    if (!admin) return { e: 'Admins only.' };
    switch (op) {
      case 'admin.players': return relay.players().map(p => ({ ...p, ip: maskIp(p.ip) }));
      case 'admin.kick': { const ok = relay.kick(String(a.id || ''), 'An admin removed you from the server.'); if (ok) this.log(`${acct.name} kicked ${a.id}`); return ok ? {} : { e: 'That pilot is gone.' }; }
      case 'admin.ban': {
        const p = relay.players().find(x => x.id === a.id); if (!p) return { e: 'That pilot is gone.' };
        if (p.admin) return { e: 'Admins cannot be banned here. Use the console.' };
        db.ban(p.acct, p.ip); relay.kick(p.id, 'You are banned from this server.'); this.log(`${acct.name} banned ${p.acct || p.name} (${p.ip})`); return {};
      }
      case 'admin.bans': return { names: db.d.bans.names.slice(), ips: db.d.bans.ips.map(maskIp) };
      case 'admin.unban': { const x = String(a.x || ''); const real = db.d.bans.ips.find(ip => maskIp(ip) === x) || x; return db.unban(real) ? {} : { e: 'Not on the ban list.' }; }
      case 'admin.motd': { db.d.motd = String(a.text || '').slice(0, 300); db.save(); relay.notice(db.d.motd ? 'Message of the day: ' + db.d.motd : 'Message of the day cleared.'); this.log(`${acct.name} set the MOTD`); return {}; }
      case 'admin.status': return { ...(this.ext.status ? this.ext.status() : {}), motd: db.d.motd, accounts: Object.keys(db.d.accounts).length };
      case 'admin.log': return this.ext.logLines ? this.ext.logLines() : [];
      case 'admin.updateState': return this.ext.updateState ? this.ext.updateState() : {};
      case 'admin.update': { if (!this.ext.update) return { e: 'Not available.' }; this.log(`${acct.name} ${a.apply ? 'installed' : 'checked for'} an update`); return this.ext.update(!!a.apply); }
      case 'admin.servers': return { text: this.ext.readServers ? this.ext.readServers() : '' };
      case 'admin.saveServers': {
        const text = String(a.text || ''); if (text.length > 64 * 1024) return { e: 'Too large.' };
        let list; try { list = JSON.parse(text); } catch (e) { return { e: 'Not valid JSON: ' + e.message }; }
        if (!Array.isArray(list) || !list.length) return { e: 'servers.json must be a list of servers.' };
        this.ext.writeServers(JSON.stringify(list, null, 2)); this.log(`${acct.name} edited servers.json from the admin page`); return {};
      }
      case 'admin.reports': return db.d.reports;
      case 'admin.clearReport': { const k = String(a.kind || ''); if (k === 'errors') db.d.reports.errors = {}; else if (Array.isArray(db.d.reports[k])) { if (a.i == null) db.d.reports[k] = []; else db.d.reports[k].splice(a.i | 0, 1); } db.save(); return {}; }
      case 'admin.stats': return db.d.stats;
      case 'admin.clearStats': db.d.stats = { matches: {}, weapons: {}, movers: {} }; db.save(); return {};
      case 'admin.resetPw': { const t = db.account(a.name); if (!t) return { e: 'No account by that name.' }; const pw = require('crypto').randomBytes(5).toString('hex'); db.setPassword(t, pw); this.log(`${acct.name} reset the password of ${t.name}`); return { pw }; }
      case 'admin.balance': return { text: this.ext.readBalance ? this.ext.readBalance() : '{}' };
      case 'admin.saveBalance': { const r = this.ext.writeBalance ? this.ext.writeBalance(String(a.text || '')) : { e: 'Not available.' }; if (!r.e) this.log(`${acct.name} changed balance.json`); return r; }
      case 'admin.say': { relay.notice(`[${acct.name}] ${String(a.text || '').slice(0, 200)}`); return {}; }
    }
    return { e: 'Unknown request.' };
  }
}
// admins see enough of an address to tell people apart, not the whole thing
function maskIp(ip) { ip = String(ip || ''); if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.') + '.x'; return ip.split(':').slice(0, 4).join(':') + ':x'; }
module.exports = { Api, maskIp };
