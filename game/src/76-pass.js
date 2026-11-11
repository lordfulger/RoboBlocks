// ================= BATTLE PASS · FRIENDS · SERVER BROWSER =================

// ---------- battle pass: free and cosmetic only ----------
// Seasons last six weeks. Every battle's XP also fills the pass; each tier unlocks a cosmetic for good.
const SEASON_DAYS = 42, SEASON_EPOCH = Date.UTC(2026, 10, 2) / 864e5; // Monday 2 Nov 2026
const BP_TIERS = 30, BP_XP = 500;
const seasonNo = () => Math.max(1, Math.floor((Date.now() / 864e5 - SEASON_EPOCH) / SEASON_DAYS) + 1);
const seasonEndsIn = () => { const end = (SEASON_EPOCH + seasonNo() * SEASON_DAYS) * 864e5, d = Math.max(0, Math.ceil((end - Date.now()) / 864e5)); return d + (d === 1 ? ' day' : ' days'); };
const SEASON_NAMES = ['Ignition', 'Overclock', 'Meltdown', 'Static Storm', 'Overdrive', 'Deep Freeze'];
// two reward tracks alternate between seasons; ids are permanent unlock keys
const BP_TRACKS = [[
  { id: 'bp_t_rookie', k: 'title', v: 'Rookie Riveter' }, { id: 'bp_h_ember', k: 'hangar', v: 'ember', name: 'Ember hangar' }, { id: 'bp_b_spark', k: 'badge', v: '✦', name: 'Spark badge' },
  { id: 'bp_t_scrap', k: 'title', v: 'Scrap Collector' }, { id: 'bp_f_camo', k: 'finish', v: 'camo', name: 'Camo finish' }, { id: 'bp_h_ice', k: 'hangar', v: 'ice', name: 'Glacier hangar' },
  { id: 'bp_t_gear', k: 'title', v: 'Gearhead' }, { id: 'bp_b_cog', k: 'badge', v: '⚙', name: 'Cog badge' }, { id: 'bp_t_bolt', k: 'title', v: 'Bolt Thrower' },
  { id: 'bp_f_frost', k: 'finish', v: 'frost', name: 'Frost finish' }, { id: 'bp_h_toxic', k: 'hangar', v: 'toxic', name: 'Toxic hangar' }, { id: 'bp_t_sparks', k: 'title', v: 'Sparks Flying' },
  { id: 'bp_b_comet', k: 'badge', v: '☄', name: 'Comet badge' }, { id: 'bp_t_armor', k: 'title', v: 'Armor Artist' }, { id: 'bp_p_antenna', k: 'part', v: 'antenna', name: 'Antenna part' },
  { id: 'bp_h_violet', k: 'hangar', v: 'violet', name: 'Violet hangar' }, { id: 'bp_t_road', k: 'title', v: 'Road Warrior' }, { id: 'bp_b_rook', k: 'badge', v: '♜', name: 'Rook badge' },
  { id: 'bp_t_wreck', k: 'title', v: 'Wreck Maker' }, { id: 'bp_f_magma', k: 'finish', v: 'magma', name: 'Magma finish' }, { id: 'bp_h_sunset', k: 'hangar', v: 'sunset', name: 'Sunset hangar' },
  { id: 'bp_t_core', k: 'title', v: 'Core Thief' }, { id: 'bp_b_star', k: 'badge', v: '✪', name: 'Star badge' }, { id: 'bp_t_hill', k: 'title', v: 'Hill Holder' },
  { id: 'bp_p_spoiler', k: 'part', v: 'spoiler', name: 'Spoiler part' }, { id: 'bp_t_horde', k: 'title', v: 'Horde Breaker' }, { id: 'bp_h_gold', k: 'hangar', v: 'gold', name: 'Gilded hangar' },
  { id: 'bp_t_ace', k: 'title', v: 'Ace Pilot' }, { id: 'bp_b_crown', k: 'badge', v: '♔', name: 'Crown badge' }, { id: 'bp_f_holo', k: 'finish', v: 'holo', name: 'Holo finish' },
], [
  { id: 'bp_t_tinker', k: 'title', v: 'Tinkerer' }, { id: 'bp_h_ice', k: 'hangar', v: 'ice', name: 'Glacier hangar' }, { id: 'bp_b_cog', k: 'badge', v: '⚙', name: 'Cog badge' },
  { id: 'bp_t_welder', k: 'title', v: 'Night Welder' }, { id: 'bp_f_frost', k: 'finish', v: 'frost', name: 'Frost finish' }, { id: 'bp_h_ember', k: 'hangar', v: 'ember', name: 'Ember hangar' },
  { id: 'bp_t_piston', k: 'title', v: 'Piston Pusher' }, { id: 'bp_b_spark', k: 'badge', v: '✦', name: 'Spark badge' }, { id: 'bp_t_lancer', k: 'title', v: 'Lance Corporal' },
  { id: 'bp_f_camo', k: 'finish', v: 'camo', name: 'Camo finish' }, { id: 'bp_h_violet', k: 'hangar', v: 'violet', name: 'Violet hangar' }, { id: 'bp_t_static', k: 'title', v: 'Static Shock' },
  { id: 'bp_b_rook', k: 'badge', v: '♜', name: 'Rook badge' }, { id: 'bp_t_rust', k: 'title', v: 'Rust Belt' }, { id: 'bp_p_spoiler', k: 'part', v: 'spoiler', name: 'Spoiler part' },
  { id: 'bp_h_toxic', k: 'hangar', v: 'toxic', name: 'Toxic hangar' }, { id: 'bp_t_juggernaut', k: 'title', v: 'Juggernaut' }, { id: 'bp_b_comet', k: 'badge', v: '☄', name: 'Comet badge' },
  { id: 'bp_t_storm', k: 'title', v: 'Stormchaser' }, { id: 'bp_f_holo', k: 'finish', v: 'holo', name: 'Holo finish' }, { id: 'bp_h_gold', k: 'hangar', v: 'gold', name: 'Gilded hangar' },
  { id: 'bp_t_shield', k: 'title', v: 'Shield Wall' }, { id: 'bp_b_star', k: 'badge', v: '✪', name: 'Star badge' }, { id: 'bp_t_reactor', k: 'title', v: 'Reactor Raider' },
  { id: 'bp_p_antenna', k: 'part', v: 'antenna', name: 'Antenna part' }, { id: 'bp_t_overlord', k: 'title', v: 'Scrap Overlord' }, { id: 'bp_h_sunset', k: 'hangar', v: 'sunset', name: 'Sunset hangar' },
  { id: 'bp_t_legend', k: 'title', v: 'Living Legend' }, { id: 'bp_b_crown', k: 'badge', v: '♔', name: 'Crown badge' }, { id: 'bp_f_magma', k: 'finish', v: 'magma', name: 'Magma finish' },
]];
const bpTrack = () => BP_TRACKS[(seasonNo() - 1) % BP_TRACKS.length];
const bpName = r => r.name || (r.k === 'title' ? `Title: ${r.v}` : r.v);
function bpState() {
  const s = seasonNo();
  if (!PROG.bp || PROG.bp.s !== s) PROG.bp = { s, xp: 0 };
  return PROG.bp;
}
const bpTier = () => Math.min(BP_TIERS, Math.floor(bpState().xp / BP_XP));
// unlocks every reward up to the current tier; returns lines for the match summary
function bpAdd(xp) {
  const B = bpState(), before = bpTier(); B.xp += Math.max(0, xp | 0); const after = bpTier(), out = [];
  for (let i = 0; i < after; i++) { const r = bpTrack()[i]; if (!PROG.ach[r.id]) { PROG.ach[r.id] = Date.now(); if (i >= before) out.push(`Battle pass tier ${i + 1}: ${bpName(r)}`); } }
  progSave(); return out;
}
const HANGARS = { default: { name: 'Standard', bg: 0x12171b, fog: 0x141a1f }, ember: { name: 'Ember', bg: 0x1e1210, fog: 0x24140f, tint: 0xff6a2a }, ice: { name: 'Glacier', bg: 0x0f1a22, fog: 0x13222c, tint: 0x6ac8ff }, toxic: { name: 'Toxic', bg: 0x111a10, fog: 0x14200f, tint: 0x7aff4a },
  violet: { name: 'Violet', bg: 0x17111f, fog: 0x1c1426, tint: 0xa86aff }, sunset: { name: 'Sunset', bg: 0x23160f, fog: 0x2a1a12, tint: 0xff8a4a }, gold: { name: 'Gilded', bg: 0x1d180c, fog: 0x231d0e, tint: 0xffc84a } };
const ownsHangar = h => h === 'default' || bpOwned('hangar', h);
function bpOwned(k, v) { return BP_TRACKS.some(t => t.some(r => r.k === k && r.v === v && PROG.ach[r.id])); }
function applyHangarTheme() {
  if (HEADLESS || !garage.scene) return; const h = HANGARS[ownsHangar(PROG.hangar || 'default') ? PROG.hangar || 'default' : 'default'] || HANGARS.default;
  garage.scene.background = new T.Color(h.bg); if (garage.scene.fog) garage.scene.fog.color.setHex(h.fog);
  // a coloured wash over the hangar walls and floor
  if (!garage.themeLight) { garage.themeLight = new T.HemisphereLight(0xffffff, 0x000000, 0); garage.scene.add(garage.themeLight); const pl = new T.PointLight(0xffffff, 0, 60, 1.6); pl.position.set(0, 14, -18); garage.scene.add(pl); garage.themeSpot = pl; }
  garage.themeLight.color.setHex(h.tint || 0xffffff); garage.themeLight.intensity = h.tint ? .55 : 0;
  garage.themeSpot.color.setHex(h.tint || 0xffffff); garage.themeSpot.intensity = h.tint ? 160 : 0;
}
const passBadges = () => BP_TRACKS[0].concat(BP_TRACKS[1]).filter((r, i, a) => r.k === 'badge' && a.findIndex(x => x.id === r.id) === i);
const myTitle = () => PROG.title && bpOwned('title', PROG.title) ? PROG.title : '';
function showPass() {
  const B = bpState(), t = bpTier(), track = bpTrack(), into = t >= BP_TIERS ? BP_XP : B.xp - t * BP_XP;
  const icon = r => r.k === 'badge' ? r.v : r.k === 'finish' ? '◐' : r.k === 'hangar' ? '▣' : r.k === 'part' ? '✚' : '❝';
  const cells = track.map((r, i) => { const got = !!PROG.ach[r.id], open = i < t;
    const eq = got && (r.k === 'title' ? PROG.title === r.v : r.k === 'hangar' ? PROG.hangar === r.v : r.k === 'badge' ? PROG.badge === r.v : false);
    return `<div class="bpc${open ? ' open' : ''}${got ? ' got' : ''}"><small>TIER ${i + 1}</small><span class="bpi">${icon(r)}</span><b>${esc(bpName(r))}</b>${got && ['title', 'hangar', 'badge'].includes(r.k) ? `<button data-eq="${r.k}" data-v="${esc(r.v)}">${eq ? 'Equipped' : 'Equip'}</button>` : got ? '<em>Owned</em>' : ''}</div>`; }).join('');
  showOverlay(`<h2>Battle pass · Season ${seasonNo()}: ${SEASON_NAMES[(seasonNo() - 1) % SEASON_NAMES.length]}</h2>
    <p>Free for everyone, cosmetics only. Every battle's XP fills the pass. Ends in ${seasonEndsIn()}.</p>
    <div class="bphead"><b class="num">Tier ${t} / ${BP_TIERS}</b><div class="bar"><i style="width:${(into / BP_XP * 100).toFixed(1)}%"></i></div><span class="num">${t >= BP_TIERS ? 'Complete' : `${into} / ${BP_XP} XP to tier ${t + 1}`}</span></div>
    <div class="bpgrid">${cells}</div>
    <p style="font-size:13px">Titles show on your pilot card and profile, hangars change the garage, finishes and parts appear in the garage, badges sit next to your name.</p>
    <div class="btns"><button class="primary" id="ovBack">Back</button></div>`, true);
  $('#ovBack').onclick = backToMenu;
  document.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => {
    const k = b.dataset.eq, v = b.dataset.v;
    if (k === 'title') PROG.title = PROG.title === v ? '' : v;
    if (k === 'hangar') { PROG.hangar = PROG.hangar === v ? 'default' : v; applyHangarTheme(); }
    if (k === 'badge') { PROG.badge = PROG.badge === v ? '' : v; lobbyPresence(); }
    progSave(); showPass(); SFX.ui();
  });
}

// ---------- friends ----------
// A friend is a pilot you follow, found by their friend code. Every pilot has one (RB-XXXX-XXXX), guests too;
// it is kept with your save, so a signed-in account keeps the same code on every computer.
const FC_ABC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O or 1/I, so codes read back without mistakes
function normCode(c) {
  let s = String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); if (s.length === 10 && s.startsWith('RB')) s = s.slice(2);
  return s.length === 8 && [...s].every(ch => FC_ABC.includes(ch)) ? 'RB-' + s.slice(0, 4) + '-' + s.slice(4) : null;
}
function newFriendCode() { const a = new Uint8Array(8); crypto.getRandomValues(a); const s = [...a].map(x => FC_ABC[x & 31]).join(''); return 'RB-' + s.slice(0, 4) + '-' + s.slice(4); }
let MY_FC = HEADLESS ? null : normCode(store.get('sfa.fc', '')) || (() => { const c = newFriendCode(); store.set('sfa.fc', c); return c; })();
const FRIENDS = { list: store.get('sfa.friends', []), seen: new Set() };
// a pilot's keys: their friend code, plus the older account keys so earlier friends lists still match
const peerKeys = p => { const pr = p && p.presence || {}, out = []; const c = normCode(pr.fc); if (c) out.push('c:' + c); if (pr.acct) out.push('a:' + pr.acct); if (p && p.by) out.push('u:' + p.by); return out; };
const peerKey = p => peerKeys(p)[0] || null;
const isFriendPeer = p => peerKeys(p).some(k => isFriend(k));
function friendsSave() { FRIENDS.list = FRIENDS.list.slice(0, 100); store.set('sfa.friends', FRIENDS.list); cloudDirty(); }
const isFriend = k => !!k && FRIENDS.list.some(f => f.k === k);
function addFriend(p) {
  const k = peerKey(p); if (!k) { toast('That pilot is on an older version of the game and has no friend code yet.'); return; }
  if (isFriendPeer(p)) { toast('Already on your friends list.'); return; }
  FRIENDS.list.push({ k, name: peerName(p), t: Date.now() }); friendsSave(); toast(`${cleanName(p.presence.name) || 'Pilot'} added to your friends.`);
}
function friendOnline(f) { return (NET.lobbyPeers || []).find(p => !p.sameTab && peerKeys(p).includes(f.k) && p.presence && p.presence.bc && !p.presence.srv) || null; }
function addFriendCode(raw) {
  const c = normCode(raw); if (!c) { toast('Friend codes look like RB-7K3Q-X9PD.'); return false; }
  if (c === MY_FC) { toast('That is your own code.'); return false; }
  if (isFriend('c:' + c)) { toast('Already on your friends list.'); return false; }
  const p = (NET.lobbyPeers || []).find(x => !x.sameTab && peerKeys(x).includes('c:' + c));
  FRIENDS.list.push({ k: 'c:' + c, name: p ? peerName(p) : c, t: Date.now() }); friendsSave();
  toast(p ? `${peerName(p)} added to your friends.` : `${c} added.`);
  if (!p) friendLookup([c]).then(x => { const f = FRIENDS.list.find(y => y.k === 'c:' + c), nm = x[c] && x[c].name && cleanName(x[c].name); if (f && nm) { f.name = nm; friendsSave(); toast(`${c} is ${nm}.`); if ($('#frCode')) showFriends(); } });
  return true;
}
function copyFriendCode() { try { navigator.clipboard.writeText(MY_FC).then(() => toast('Friend code copied.'), () => toast('Your friend code: ' + MY_FC)); } catch (e) { toast('Your friend code: ' + MY_FC); } }
const myCodeHtml = () => MY_FC ? `<div class="fcode">Your friend code <b>${MY_FC}</b> <button class="fcCopy">Copy</button></div>` : '';
function wireMyCode() { document.querySelectorAll('.fcCopy').forEach(b => b.onclick = copyFriendCode); }
function friendWhere(p) {
  const sv = p.presence.sv; if (!sv) return 'In the menus';
  const s = SERVERS.find(x => x.id === sv); return s ? `On ${s.name}` : 'In a custom game';
}
// called from the lobby tick: toast when a friend comes online
// a friend's display name: their account name when signed in, otherwise their callsign
const peerName = p => cleanName(p && p.presence && (p.presence.acct || p.presence.name)) || 'Pilot';
const friendCode = f => String(f.k || '').startsWith('c:') ? f.k.slice(2) : null;
function friendsTick() {
  if (!NET.lobbyPeers) return;
  let named = false;
  for (const f of FRIENDS.list) {
    const p = friendOnline(f), on = !!p;
    if (p && peerName(p) !== f.name) { f.name = peerName(p); named = true; } // keep the saved name current
    if (on && !FRIENDS.seen.has(f.k)) { FRIENDS.seen.add(f.k); if (FRIENDS.ready) chatLocal(`${f.name} is online.`); } else if (!on) FRIENDS.seen.delete(f.k);
  }
  if (named) friendsSave();
  FRIENDS.ready = true;
}
// ask this server and every server the hub lists where these friend codes are (names, online, which room)
async function friendLookup(codes) {
  if (!codes.length || !SERVER_BASE || BE.kind !== 'server') return {};
  const list = await fetchServerList().catch(() => ({ ok: false })), urls = [SERVER_BASE, ...((list.ok ? list.list : []).map(s => { try { return new URL(s.url).origin; } catch (e) { return null; } }))].filter((u, i, a) => u && a.indexOf(u) === i).slice(0, 12);
  const out = {};
  await Promise.all(urls.map(async u => {
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000);
      const r = await fetch(u + '/friends?codes=' + encodeURIComponent(codes.join(',')), { signal: ac.signal, cache: 'no-store' }); clearTimeout(t); if (!r.ok) return;
      const j = await r.json();
      for (const [c, x] of Object.entries(j.codes || {})) {
        const cur = out[c] || {}; if (x.name && (!cur.name || x.seen > (cur.seen || 0))) { cur.name = x.name; cur.seen = x.seen; }
        if (x.online) { cur.online = true; cur.server = u === SERVER_BASE ? null : (j.server || u.replace(/^https?:\/\//, '')); cur.url = u; cur.room = x.room || null; }
        out[c] = cur;
      }
    } catch (e) { }
  }));
  return out;
}
async function showFriends() {
  showOverlay('<h2>Friends</h2><p>Checking who is online…</p>', true);
  await netInit(); await new Promise(r => setTimeout(r, 400));
  const look = await friendLookup(FRIENDS.list.map(friendCode).filter(Boolean)); let named = false;
  if (!$('#overlay') || $('#overlay').hidden) return;
  const rows = FRIENDS.list.map((f, i) => { const p = friendOnline(f), x = look[friendCode(f)] || {};
    const nm = p ? peerName(p) : x.name ? cleanName(x.name) : null; if (nm && nm !== f.name) { f.name = nm; named = true; }
    const code = friendCode(f), elsewhere = !p && x.online;
    const status = p ? friendWhere(p) + (p.presence.lv ? ' · level ' + (p.presence.lv | 0) : '') : elsewhere ? `Online on ${x.server || 'this server'}${x.room ? ' · in ' + x.room : ''}` : 'Offline' + (x.seen ? ' · last seen ' + new Date(x.seen).toLocaleDateString() : '');
    return `<div class="frow${p || elsewhere ? ' on' : ''}"><span class="dot"></span><div><b>${esc(f.name)}</b><span>${esc(status)}${code && f.name !== code ? ' · ' + code : ''}</span></div>${elsewhere && x.url && x.server ? `<button data-goto="${esc(x.url)}">Go to server</button>` : ''}
      ${p && p.presence.sv ? `<button data-join="${i}">Join</button>` : ''}${p ? `<button data-inv="${i}">Invite to party</button>` : ''}<button data-rm="${i}" title="Remove">✕</button></div>`; }).join('');
  const others = (NET.lobbyPeers || []).filter(p => !p.sameTab && p.presence && p.presence.bc && !p.presence.srv && peerKey(p) && !isFriendPeer(p)).slice(0, 30);
  showOverlay(`<h2>Friends</h2>
    ${myCodeHtml()}
    <div class="sbaddr"><input id="frCode" placeholder="Add a friend by code, e.g. RB-7K3Q-X9PD" maxlength="20" spellcheck="false"><button id="frAdd" class="primary">Add</button></div>
    <div class="flist">${rows || '<p>No friends yet. Add pilots you meet from the list below, the scoreboard or a profile.</p>'}</div>
    ${others.length ? `<h3>PILOTS ONLINE NOW</h3><div class="flist">${others.map((p, i) => `<div class="frow on"><span class="dot"></span><div><b>${esc(cleanName(p.presence.name) || 'Pilot')}</b><span>${esc(friendWhere(p))} · level ${p.presence.lv | 0}</span></div><button data-add="${i}">Add friend</button></div>`).join('')}</div>` : ''}
    <p style="font-size:13px">Share your friend code, or add pilots you meet in the Server browser. You get a chat note when a friend comes online, and can join their game from here.</p>
    <div class="btns"><button class="primary" id="ovBack">Back</button></div>`, true);
  $('#ovBack').onclick = backToMenu; wireMyCode(); if (named) friendsSave();
  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { const u = b.dataset.goto; if (HOST && HOST.setServer) HOST.setServer(u); else location.href = u + '/'; });
  $('#frCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#frAdd').click(); });
  $('#frAdd').onclick = () => { if (addFriendCode($('#frCode').value)) showFriends(); };
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { addFriend(others[+b.dataset.add]); showFriends(); });
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { FRIENDS.list.splice(+b.dataset.rm, 1); friendsSave(); showFriends(); });
  document.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => { const p = friendOnline(FRIENDS.list[+b.dataset.inv]); if (p) { partyInvite(p.peer); toast('Party invite sent.'); } });
  document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { const p = friendOnline(FRIENDS.list[+b.dataset.join]); if (!p) return; const sv = p.presence.sv, s = SERVERS.find(x => x.id === sv); hideOverlay(); joinGame(sv, s || null, null); });
}

// ---------- server browser ----------
// Lists every RoboBlocks server that reports to a hub (dedicated servers with BC_HUB_URL set), plus the rooms on this one.
const FAVS = { list: store.get('sfa.favServers', []) };
async function fetchServerList() {
  if (BE.kind !== 'server' || !SERVER_BASE) return { ok: false, why: 'Not connected to a RoboBlocks server.' };
  try { const r = await fetch(SERVER_BASE + '/servers', { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); return { ok: true, list: Array.isArray(j.servers) ? j.servers : [], hub: j.hub || '' }; }
  catch (e) { return { ok: false, why: 'Could not load the server list: ' + e.message }; }
}
// the Server browser is the lobby (65-net.js showLobby)
const showServerBrowser = () => showLobby();
Object.assign(window.__sfa, { normCode, addFriendCode, get MY_FC() { return MY_FC; }, bpAdd, bpState, bpTier, showPass, showFriends, showServerBrowser, FRIENDS, PROG, seasonNo, mySR, skillTeams, brawlNow });
