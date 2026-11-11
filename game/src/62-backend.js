// ================= BACKEND: PROFILES, LEADERBOARDS, HISTORY, SHOP, ADMIN =================
// One interface, two providers in use:
//  - 'server':   a RoboBlocks dedicated server. Accounts, server-awarded XP, ranked rating, shop and admin
//                tools all live on the server and travel over the game's WebSocket.
//  - 'local':    anywhere else (including an embedded preview copy). Progress and history stay in this browser.
// (The older 'artifact' provider code below is no longer selected: everything online goes through a RoboBlocks server.)
const BE = { kind: 'local', token: store.get('sfa.token', null), me: null, admin: false, db: null, user: null, uid: null, mod: { motd: '', bans: {} }, ready: false };
const RANKS = [[0, 'Bronze', '#c88a5a'], [1100, 'Silver', '#c9d3d9'], [1300, 'Gold', '#ffd36a'], [1500, 'Platinum', '#7fe7ff'], [1700, 'Diamond', '#b59cff']];
const rankOf = elo => { let r = RANKS[0]; for (const x of RANKS) if (elo >= x[0]) r = x; return { name: r[1], col: r[2] }; };
const localHistory = () => store.get('sfa.history', []);
async function beInit() {
  if (HEADLESS) return;
  try {
    // accounts, saves, leaderboards, shop and clans come only from a RoboBlocks server
    if (SERVER_BASE && !onClaudePage()) {
      const room = await netInit(); // a self-hosted page: the server is right here
      if (room && room.relay && NET.accounts) BE.kind = 'server';
      if (room) setTimeout(() => { if (state === 'menu' || state === 'garage') autoJoinCheck(); }, 1800);
    }
  } catch (e) { console.warn('backend', e); }
  BE.ready = true; setSaveBadge(cloudOn() ? 'Saved to account' : BE.kind === 'server' ? (HOST ? 'Guest: this computer' : 'Guest: this browser') : (HOST ? 'This computer' : 'This browser'));
  if (state === 'menu') buildPilotCard();
  if (NET.requireAccount && !BE.me && state === 'menu') showAccount();
}
// ---------- cloud saves: garage bays, settings, tutorial, mutes ----------
// Signed in to a server, your save lives there and follows you to any browser.
// The browser keeps a copy as a cache; your guest save is set aside and comes back when you sign out.
const CLOUD = { timer: null, busy: false, pulled: false, last: '' };
const cloudOn = () => !HEADLESS && ((BE.kind === 'server' && !!BE.me) || (BE.kind === 'artifact' && !!BE.uid));
function cloudSnapshot() {
  const { quality, detail, ...portable } = settings; // graphics quality and model detail stay per device
  return { v: 1, bays: bays.map(d => d && d.blocks && d.blocks.length ? { n: cleanName(d.name || '') || '', d: encodeDesign(d), wg: d.wg || undefined } : (d ? { n: cleanName(d.name || ''), d: '' } : null)), bay: bayIdx, settings: portable, tut: !!TUT.done, muted: [...CHAT.muted].slice(0, 100), cs: NET.name, prog: { life: PROG.life, ach: PROG.ach, q: PROG.q, w: PROG.w, badge: PROG.badge, clan: PROG.clan, bp: PROG.bp, tech: PROG.tech, title: PROG.title || '', hangar: PROG.hangar || '', sr: progress.sr || 0 }, fr: FRIENDS.list, fc: MY_FC || undefined, t: Date.now() };
}
function cloudDirty() { try { if (!cloudOn() || !CLOUD.pulled) return; setSaveBadge('Saving…'); clearTimeout(CLOUD.timer); CLOUD.timer = setTimeout(cloudPush, 2000); } catch (e) { /* called during load, before this file has run */ } }
async function cloudPush() {
  if (!cloudOn() || CLOUD.busy) { if (CLOUD.busy) cloudDirty(); return; }
  const snap = cloudSnapshot(), text = JSON.stringify({ ...snap, t: 0 }); if (text === CLOUD.last) return;
  CLOUD.busy = true;
  try {
    if (BE.kind === 'server') await beApi('save.put', { data: snap });
    else await BE.db.doc(`data/users/${BE.uid}/save`).set(snap);
    CLOUD.last = text; setSaveBadge('Saved');
  } catch (e) { setSaveBadge('Not saved: ' + e.message); setTimeout(cloudDirty, 10000); }
  CLOUD.busy = false;
}
function setSaveBadge(t) { const el = $('#saveBadge'); if (el) { el.textContent = t; el.title = t; } }
async function cloudPull() {
  if (!cloudOn()) return;
  let s = null;
  try { s = BE.kind === 'server' ? await beApi('save.get') : await BE.db.doc(`data/users/${BE.uid}/save`).get().then(x => x.exists ? x.data() : null); }
  catch (e) { toast('Could not load your saved garage: ' + e.message); return; }
  if (!store.get('sfa.guest', null)) store.set('sfa.guest', { bays, bay: bayIdx }); // set the guest save aside
  if (s && Array.isArray(s.bays)) cloudApply(s);
  CLOUD.pulled = true;
  if (!s) { await cloudPush(); toast('Your garage is now saved to your account.'); }
}
function cloudApply(s) {
  const list = s.bays.slice(0, BAY_COUNT).map((x, i) => { if (!x) return null; let d; try { d = x.d ? decodeDesign(x.d) : { v: 3, blocks: [] }; } catch (e) { d = { v: 3, blocks: [] }; } d.name = cleanName(x.n || '') || 'Bay ' + (i + 1); if (Array.isArray(x.wg)) d.wg = x.wg.slice(0, 4).map(g => ({ types: (g.types || []).filter(t => WTYPES.includes(t)), mode: g.mode === 'alt' ? 'alt' : 'together' })); return migrateDesign(d); });
  while (list.length < BAY_COUNT) list.push(null);
  bays = list; bayIdx = clamp(s.bay | 0, 0, BAY_COUNT - 1);
  design = bays[bayIdx] || { name: 'Bay ' + (bayIdx + 1), v: 3, blocks: [] };
  store.set('sfa.bays', bays); store.set('sfa.bay', bayIdx);
  if (s.settings && typeof s.settings === 'object') { for (const k of ['master', 'music', 'sfx', 'sens']) if (typeof s.settings[k] === 'number') settings[k] = s.settings[k]; if (typeof s.settings.invertY === 'boolean') settings.invertY = s.settings.invertY; if (s.settings.pad && typeof s.settings.pad === 'object') { const pd = {}; for (const [k2, v2] of Object.entries(s.settings.pad)) if (/^[a-zA-Z0-9]{1,12}$/.test(k2) && Number.isInteger(v2) && v2 >= -1 && v2 < 32) pd[k2] = v2; settings.pad = pd; } if (s.settings.units === 'mph' || s.settings.units === 'kmh') settings.units = s.settings.units; if (typeof s.settings.padSwap === 'boolean') settings.padSwap = s.settings.padSwap; if (typeof s.settings.padSens === 'number') settings.padSens = clamp(s.settings.padSens, .4, 2.5); if (s.settings.keys && typeof s.settings.keys === 'object') { const k = {}; for (const a of Object.keys(KEY_DEFAULTS)) if (typeof s.settings.keys[a] === 'string' && /^[A-Za-z0-9]{2,20}$/.test(s.settings.keys[a])) k[a] = s.settings.keys[a]; settings.keys = k; } store.set('sfa.settings', settings); SFX.apply && SFX.apply(); }
  if (s.tut) { TUT.done = true; TUT.on = false; store.set('sfa.tut', { on: false, i: TUT.i, done: true }); }
  if (normCode(s.fc)) { MY_FC = normCode(s.fc); store.set('sfa.fc', MY_FC); if (NET.room) lobbyPresence(); } // your code follows your account
  if (Array.isArray(s.fr)) { FRIENDS.list = s.fr.filter(f => f && typeof f.k === 'string').slice(0, 100).map(f => ({ k: f.k.slice(0, 80), name: cleanName(f.name) || 'Pilot', t: +f.t || 0 })); store.set('sfa.friends', FRIENDS.list); }
  if (Array.isArray(s.muted)) { CHAT.muted = new Set(s.muted.map(String).slice(0, 100)); store.set('sfa.muted', [...CHAT.muted]); }
  if (s.prog && typeof s.prog === 'object') { if (s.prog.life) PROG.life = Object.assign(PROG.life, s.prog.life); if (s.prog.ach) PROG.ach = Object.assign({}, s.prog.ach); if (s.prog.q && s.prog.q.day >= ((PROG.q || {}).day || 0)) PROG.q = s.prog.q; if (s.prog.w && typeof s.prog.w === 'object' && Array.isArray(s.prog.w.list) && (s.prog.w.wk | 0) >= ((PROG.w || {}).wk | 0)) PROG.w = s.prog.w; if (typeof s.prog.badge === 'string') PROG.badge = s.prog.badge; if (s.prog.bp && typeof s.prog.bp === 'object' && (s.prog.bp.s | 0) >= ((PROG.bp || {}).s | 0) && (s.prog.bp.xp | 0) >= (((PROG.bp || {}).s === s.prog.bp.s && PROG.bp.xp) | 0)) PROG.bp = { s: s.prog.bp.s | 0, xp: s.prog.bp.xp | 0 }; if (typeof s.prog.title === 'string') PROG.title = s.prog.title.slice(0, 40); if (s.prog.tech && typeof s.prog.tech === 'object' && s.prog.tech.got && typeof s.prog.tech.got === 'object') { const got = {}; for (const [k2, v2] of Object.entries(s.prog.tech.got)) if (TECH[k2] && (v2 === 'B' || v2 === 'L')) got[k2] = v2; PROG.tech = { got, v: 1 }; } else PROG.tech = null; /* saved before the tech tree: rebuilt from the account level */ if (typeof s.prog.hangar === 'string') PROG.hangar = s.prog.hangar.slice(0, 20); if (typeof s.prog.sr === 'number' && s.prog.sr > 0) { progress.sr = s.prog.sr; store.set('sfa.progress', progress); } if (s.prog.clan !== undefined && BE.kind === 'artifact') PROG.clan = s.prog.clan; store.set('sfa.prog', PROG); }
  if (BE.kind === 'artifact' && s.cs) { NET.name = cleanName(s.cs) || NET.name; store.set('sfa.callsign', NET.name); }
  CLOUD.last = JSON.stringify({ ...cloudSnapshot(), t: 0 });
  gLoad(design); buildBaysUI(); buildFinishUI(); updateStats(); applyHangarTheme(); if (state === 'menu') buildPilotCard();
}
function cloudForget() { // signed out: bring back the guest save
  clearTimeout(CLOUD.timer); CLOUD.pulled = false; CLOUD.last = '';
  const g = store.get('sfa.guest', null); if (!g || !Array.isArray(g.bays)) return;
  store.set('sfa.guest', null);
  bays = g.bays.map(d => d ? migrateDesign(d) : null); while (bays.length < BAY_COUNT) bays.push(null);
  bayIdx = clamp(g.bay | 0, 0, BAY_COUNT - 1); design = bays[bayIdx] || { name: 'Bay ' + (bayIdx + 1), v: 3, blocks: [] };
  store.set('sfa.bays', bays); store.set('sfa.bay', bayIdx);
  gLoad(design); buildBaysUI(); buildFinishUI(); updateStats();
}
addEventListener('beforeunload', () => { if (CLOUD.timer) { clearTimeout(CLOUD.timer); cloudPush(); } });
// ---------- server provider ----------
const beApi = (op, a) => NET.room && NET.room.api ? NET.room.api(op, a) : Promise.reject(new Error('Not connected to the server.'));
BE.onSignedIn = (me, token) => {
  if (!me) return BE.onSignedOut();
  BE.me = me; BE.admin = !!me.admin; if (token) { BE.token = token; store.set('sfa.token', token); }
  progress = { xp: me.xp, matches: me.matches, wins: me.wins, kills: me.kills, remote: true };
  NET.name = me.name; lobbyPresence(); if (state === 'menu') buildPilotCard();
  setSaveBadge('Saved to account');
  if (!CLOUD.pulled && !CLOUD.pulling) { CLOUD.pulling = true; cloudPull().finally(() => { CLOUD.pulling = false; }); }
};
BE.onSignedOut = () => {
  const was = !!BE.me;
  BE.me = null; BE.admin = false; BE.token = null; store.set('sfa.token', null);
  progress = store.get('sfa.progress', { xp: 0, matches: 0, wins: 0, kills: 0 });
  if (was) cloudForget(); setSaveBadge(BE.kind === 'server' ? (HOST ? 'Guest: this computer' : 'Guest: this browser') : (HOST ? 'This computer' : 'This browser'));
  if (state === 'menu') buildPilotCard();
};
async function beRefresh() { if (BE.kind === 'server' && BE.me) try { BE.onSignedIn(await beApi('me')); } catch (e) { } }
// ---------- artifact provider ----------
async function artLoad() {
  const db = BE.db;
  try {
    const snap = await db.doc(`data/users/${BE.uid}/profile`).get(), cloud = snap.exists ? snap.data() : null;
    if (cloud && (cloud.xp | 0) >= (progress.xp | 0)) { progress = { xp: cloud.xp | 0, matches: cloud.matches | 0, wins: cloud.wins | 0, kills: cloud.kills | 0 }; store.set('sfa.progress', progress); }
    BE.me = { xp: progress.xp, matches: progress.matches, wins: progress.wins, kills: progress.kills, deaths: cloud ? cloud.deaths | 0 : 0, dmg: cloud ? +cloud.dmg || 0 : 0, elo: cloud ? +cloud.elo || 1200 : 1200, history: cloud && Array.isArray(cloud.history) ? cloud.history : localHistory() };
    if (!cloud || (cloud.xp | 0) < (progress.xp | 0)) await artSave();
  } catch (e) { console.warn('profile', e); }
  try { const m = await db.doc('mod/state').get(); if (m.exists) { const d = m.data(); BE.mod = { motd: String(d.motd || '').slice(0, 300), bans: d.bans && typeof d.bans === 'object' ? d.bans : {} }; NET.motd = BE.mod.motd; } } catch (e) { }
}
function artBanned(uid) { const until = BE.mod.bans[uid]; return until !== undefined && (until === 0 || until > Date.now()); }
async function artSave() {
  const me = BE.me; if (!me) return;
  const lv = levelFromXp(progress.xp);
  await BE.db.doc(`data/users/${BE.uid}/profile`).set({ xp: progress.xp, matches: progress.matches, wins: progress.wins, kills: progress.kills, deaths: me.deaths, dmg: Math.round(me.dmg), elo: Math.round(me.elo), history: me.history.slice(0, 25) });
  await BE.db.doc(`lb/${BE.uid}`).set({ cs: NET.name, clan: PROG.clan || null, xp: progress.xp, lv, wins: progress.wins, kills: progress.kills, matches: progress.matches, elo: Math.round(me.elo), t: Date.now() });
}
// ---------- shared: after every battle ----------
// r: { mode, map, result: 'win'|'loss'|'draw', kills, deaths, dmg, healed, xp, net, practice }
async function beRecordMatch(r) {
  const entry = { t: Date.now(), mode: r.mode, map: r.map, result: r.result, kills: r.kills, deaths: r.deaths, dmg: Math.round(r.dmg), xp: r.xp, elo: 0, server: r.server || '', practice: !r.net };
  if (BE.kind === 'server' && BE.me) {
    // online matches are scored by the server itself; practice is reported with a cap
    if (r.net) { setTimeout(beRefresh, 4000); return; }
    try { const res = await beApi('practice', r); BE.onSignedIn(res.me); toast(`+${res.xp} XP saved to ${BE.me.name}`); } catch (e) { toast(e.message); }
    return;
  }
  store.set('sfa.history', [entry].concat(localHistory()).slice(0, 25));
  if (BE.kind === 'artifact' && BE.me) {
    const me = BE.me;
    if (r.net) { entry.elo = r.result === 'win' ? 16 : r.result === 'loss' ? -16 : 0; me.elo = Math.max(100, me.elo + entry.elo); }
    me.deaths += r.deaths; me.dmg += r.dmg; me.history = [entry].concat(me.history).slice(0, 25);
    try { await artSave(); } catch (e) { console.warn('save', e); }
  }
}
function beProfile() {
  const p = progress, lh = localHistory();
  if (BE.kind === 'server' && BE.me) return Promise.resolve({ ...BE.me, lv: levelFromXp(BE.me.xp) });
  const base = { name: NET.name, xp: p.xp, lv: levelFromXp(p.xp), matches: p.matches, wins: p.wins, kills: p.kills | 0, deaths: 0, dmg: 0, elo: 1200, history: lh };
  if (BE.kind === 'artifact' && BE.me) return Promise.resolve({ ...base, deaths: BE.me.deaths, dmg: BE.me.dmg, elo: BE.me.elo, history: BE.me.history });
  base.deaths = lh.reduce((s, h) => s + (h.deaths | 0), 0); base.dmg = lh.reduce((s, h) => s + (h.dmg | 0), 0);
  return Promise.resolve(base);
}
async function beLeaderboard(sort) {
  if (BE.kind === 'server') return beApi('lb', { sort });
  if (BE.kind === 'artifact') {
    const snap = await BE.db.collection('lb').orderBy(sort === 'elo' ? 'elo' : sort, 'desc').limit(50).get();
    return snap.docs.filter(d => !artBanned(d.id)).map(d => { const x = d.data() || {}; return { name: cleanName(x.cs) || 'Pilot', xp: x.xp | 0, lv: x.lv | 0 || levelFromXp(x.xp | 0), wins: x.wins | 0, kills: x.kills | 0, matches: x.matches | 0, elo: x.elo | 0 || 1200, me: d.id === BE.uid }; });
  }
  throw new Error('Leaderboards live on RoboBlocks servers. Open your server address to see them; here your stats stay on this computer.');
}
// ---------- robot shop ----------
const designCpu = d => computeStats(d.blocks).cpu;
const designLevel = d => d.blocks.reduce((m, b) => Math.max(m, (PARTS[b.t] || { lvl: 1 }).lvl, (TIERS[b.k || 1] || { lvl: 1 }).lvl || 1), FINISHES.find(f => f.id === (d.f || 'standard')).lvl);
async function beShopList(sort) {
  if (BE.kind === 'server') return beApi('shop.list', { sort });
  if (BE.kind === 'artifact') {
    const [shops, votes] = await Promise.all([BE.db.collection('shop').get(), BE.db.collection('votes').get()]);
    const score = new Map(), dls = new Map(), my = new Map();
    for (const v of votes.docs) { const x = v.data() || {}; for (const [k, s] of Object.entries(x.v || {})) { score.set(k, (score.get(k) || 0) + Math.sign(+s || 0)); if (v.id === BE.uid) my.set(k, Math.sign(+s || 0)); } for (const k of Object.keys(x.dl || {})) dls.set(k, (dls.get(k) || 0) + 1); }
    const all = [];
    for (const s of shops.docs) { if (artBanned(s.id)) continue; for (const it of ((s.data() || {}).items || []).slice(0, 20)) { if (!it || typeof it.d !== 'string') continue; const key = s.id + ':' + it.id; all.push({ key, name: cleanName(it.name) || 'Robot', author: cleanName(it.cs) || 'Pilot', d: it.d, cpu: it.cpu | 0, lv: it.lv | 0 || 1, t: +it.t || 0, dl: dls.get(key) || 0, score: score.get(key) || 0, my: my.get(key) || 0, mine: s.id === BE.uid }); } }
    const by = { new: (a, b) => b.t - a.t, dl: (a, b) => b.dl - a.dl || b.score - a.score, top: (a, b) => b.score - a.score || b.dl - a.dl, mine: (a, b) => b.t - a.t }[sort] || ((a, b) => b.score - a.score);
    return all.filter(x => sort !== 'mine' || x.mine).sort(by).slice(0, 60);
  }
  throw new Error('The robot shop lives on RoboBlocks servers. Open your server address to use it.');
}
async function beShopPublish(d) {
  const item = { name: cleanName(d.name || '') || 'Robot', d: encodeDesign(d), cpu: designCpu(d), lv: designLevel(d) };
  if (BE.kind === 'server') return beApi('shop.publish', item);
  if (BE.kind === 'artifact') {
    const ref = BE.db.doc(`shop/${BE.uid}`), snap = await ref.get(), items = snap.exists ? ((snap.data() || {}).items || []) : [];
    if (items.length >= 20) throw new Error('You can share up to 20 robots. Delete one first.');
    if (items.some(i => i.d === item.d)) throw new Error('You already shared this robot.');
    items.push({ ...item, id: Math.random().toString(36).slice(2, 10), cs: NET.name, t: Date.now() });
    await ref.set({ items }); return {};
  }
  throw new Error('The robot shop lives on RoboBlocks servers. Open your server address to use it.');
}
async function beShopVote(key, v) {
  if (BE.kind === 'server') return beApi('shop.rate', { key, v });
  const ref = BE.db.doc(`votes/${BE.uid}`), snap = await ref.get(), x = snap.exists ? snap.data() || {} : {};
  const vv = { ...(x.v || {}) }; if (v) vv[key] = v; else delete vv[key];
  await ref.set({ v: vv, dl: x.dl || {} });
}
async function beShopGet(item) {
  if (BE.kind === 'server') return beApi('shop.get', { key: item.key });
  try { const ref = BE.db.doc(`votes/${BE.uid}`), snap = await ref.get(), x = snap.exists ? snap.data() || {} : {}; if (!(x.dl || {})[item.key]) await ref.set({ v: x.v || {}, dl: { ...(x.dl || {}), [item.key]: 1 } }); } catch (e) { }
  return { d: item.d, name: item.name };
}
async function beShopDelete(item) {
  if (BE.kind === 'server') return beApi('shop.delete', { key: item.key });
  const [owner, id] = item.key.split(':');
  if (owner !== BE.uid && !BE.admin) throw new Error('That is not your robot.');
  const ref = BE.db.doc(`shop/${owner}`), snap = await ref.get(); const items = snap.exists ? ((snap.data() || {}).items || []) : [];
  await ref.set({ items: items.filter(i => i.id !== id) });
}
// ---------- admin ----------
async function beAdmin(op, a) {
  if (BE.kind === 'server') return beApi('admin.' + op, a);
  if (BE.kind !== 'artifact' || !BE.admin) throw new Error('Admins only.');
  const ref = BE.db.doc('mod/state');
  const save = () => ref.set({ motd: BE.mod.motd, bans: BE.mod.bans });
  if (op === 'players') return NET.lobbyPeers.filter(p => !p.sameTab && p.presence && p.presence.bc && !p.presence.srv).map(p => ({ id: p.peer, by: p.by, name: cleanName(p.presence.name) || 'Pilot', acct: null, sv: p.presence.sv || null, ip: '' }));
  if (op === 'kick' || op === 'ban') {
    const p = NET.lobbyPeers.find(x => x.peer === a.id); if (!p || !p.by) throw new Error('That pilot is gone, or signed out.');
    BE.mod.bans = { ...BE.mod.bans, [p.by]: op === 'kick' ? Date.now() + 10 * 60000 : 0 }; await save(); return {};
  }
  if (op === 'bans') return { names: Object.entries(BE.mod.bans).filter(([, u]) => u === 0 || u > Date.now()).map(([id]) => id), ips: [] };
  if (op === 'unban') { const b = { ...BE.mod.bans }; delete b[a.x]; BE.mod.bans = b; await save(); return {}; }
  if (op === 'motd') { BE.mod.motd = String(a.text || '').slice(0, 300); NET.motd = BE.mod.motd; await save(); return {}; }
  throw new Error('Not available here.');
}
