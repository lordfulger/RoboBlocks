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
// A friend is a pilot you follow: their account on a dedicated server, or their claude.ai identity on the artifact.
const FRIENDS = { list: store.get('sfa.friends', []), seen: new Set() };
const peerKey = p => !p ? null : p.presence && p.presence.acct ? 'a:' + p.presence.acct : p.by ? 'u:' + p.by : null;
function friendsSave() { FRIENDS.list = FRIENDS.list.slice(0, 100); store.set('sfa.friends', FRIENDS.list); cloudDirty(); }
const isFriend = k => !!k && FRIENDS.list.some(f => f.k === k);
function addFriend(p) {
  const k = peerKey(p); if (!k) { toast('That pilot has no account, so they cannot be added. They need to sign in.'); return; }
  if (isFriend(k)) { toast('Already on your friends list.'); return; }
  FRIENDS.list.push({ k, name: cleanName(p.presence && p.presence.name) || 'Pilot', t: Date.now() }); friendsSave(); toast(`${cleanName(p.presence.name) || 'Pilot'} added to your friends.`);
}
function friendOnline(f) { return (NET.lobbyPeers || []).find(p => !p.sameTab && peerKey(p) === f.k && p.presence && p.presence.bc && !p.presence.srv) || null; }
function friendWhere(p) {
  const sv = p.presence.sv; if (!sv) return 'In the menus';
  const s = SERVERS.find(x => x.id === sv); return s ? `On ${s.name}` : 'In a custom game';
}
// called from the lobby tick: toast when a friend comes online
function friendsTick() {
  if (!NET.lobbyPeers) return;
  for (const f of FRIENDS.list) { const on = !!friendOnline(f); if (on && !FRIENDS.seen.has(f.k)) { FRIENDS.seen.add(f.k); if (FRIENDS.ready) chatLocal(`${f.name} is online.`); } else if (!on) FRIENDS.seen.delete(f.k); }
  FRIENDS.ready = true;
}
async function showFriends() {
  showOverlay('<h2>Friends</h2><p>Checking who is online…</p>', true);
  await netInit(); await new Promise(r => setTimeout(r, 400));
  const rows = FRIENDS.list.map((f, i) => { const p = friendOnline(f); if (p) f.name = cleanName(p.presence.name) || f.name;
    return `<div class="frow${p ? ' on' : ''}"><span class="dot"></span><div><b>${esc(f.name)}</b><span>${p ? esc(friendWhere(p)) + (p.presence.lv ? ' · level ' + (p.presence.lv | 0) : '') : 'Offline'}</span></div>
      ${p && p.presence.sv ? `<button data-join="${i}">Join</button>` : ''}${p ? `<button data-inv="${i}">Invite to party</button>` : ''}<button data-rm="${i}" title="Remove">✕</button></div>`; }).join('');
  const others = (NET.lobbyPeers || []).filter(p => !p.sameTab && p.presence && p.presence.bc && !p.presence.srv && peerKey(p) && !isFriend(peerKey(p))).slice(0, 30);
  showOverlay(`<h2>Friends</h2>
    <div class="flist">${rows || '<p>No friends yet. Add pilots you meet from the list below, the scoreboard or a profile.</p>'}</div>
    ${others.length ? `<h3>PILOTS ONLINE NOW</h3><div class="flist">${others.map((p, i) => `<div class="frow on"><span class="dot"></span><div><b>${esc(cleanName(p.presence.name) || 'Pilot')}</b><span>${esc(friendWhere(p))} · level ${p.presence.lv | 0}</span></div><button data-add="${i}">Add friend</button></div>`).join('')}</div>` : ''}
    <p style="font-size:13px">Friends are pilots with an account on this server${BE.kind === 'artifact' ? ' or a claude.ai account' : ''}. You get a chat note when one comes online.</p>
    <div class="btns"><button class="primary" id="ovBack">Back</button></div>`, true);
  $('#ovBack').onclick = backToMenu;
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { addFriend(others[+b.dataset.add]); showFriends(); });
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { FRIENDS.list.splice(+b.dataset.rm, 1); friendsSave(); showFriends(); });
  document.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => { const p = friendOnline(FRIENDS.list[+b.dataset.inv]); if (p) { partyInvite(p.peer); toast('Party invite sent.'); } });
  document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { const p = friendOnline(FRIENDS.list[+b.dataset.join]); if (!p) return; const sv = p.presence.sv, s = SERVERS.find(x => x.id === sv); hideOverlay(); joinGame(sv, s || null, null); });
}

// ---------- server browser ----------
// Lists every RoboBlocks server that reports to a hub (dedicated servers with BC_HUB_URL set), plus the rooms on this one.
const FAVS = { list: store.get('sfa.favServers', []) };
async function fetchServerList() {
  if (BE.kind !== 'server') return { ok: false, why: 'The server browser lists dedicated RoboBlocks servers. It works when you play on one of them.' };
  try { const r = await fetch(SERVER_BASE + '/servers', { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); return { ok: true, list: Array.isArray(j.servers) ? j.servers : [], hub: j.hub || '' }; }
  catch (e) { return { ok: false, why: 'Could not load the server list: ' + e.message }; }
}
async function showServerBrowser() {
  showOverlay('<h2>Server browser</h2><p>Loading servers…</p>', true);
  const res = await fetchServerList();
  const here = SERVER_BASE || location.origin, cleanUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : null; } catch (e) { return null; } };
  const list = (res.ok ? res.list : []).map(s => ({ ...s, url: cleanUrl(s.url) })).filter(s => s.url);
  for (const f of FAVS.list) if (!list.some(s => s.url === f.url)) list.push({ url: f.url, name: f.name || f.url, unknown: true });
  list.sort((a, b) => (FAVS.list.some(f => f.url === b.url) - FAVS.list.some(f => f.url === a.url)) || (b.players | 0) - (a.players | 0));
  const rooms = SERVERS.map(s => `<tr><td><b>${esc(s.name)}</b><br><small>${esc(s.blurb || '')}</small></td><td>${(s.rot || []).map(r => (MODES[r[0]] || { short: r[0] }).short).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</td><td>${s.n}v${s.n}</td><td>${s.locked ? '🔒' : ''}${s.ranked ? ' Ranked' : ''}</td><td><button data-room="${esc(s.id)}">Join</button></td></tr>`).join('');
  const rows = list.map((s, i) => `<tr${s.url === here ? ' class="here"' : ''}><td><b>${esc(s.name || s.url)}</b><br><small>${esc(s.url.replace(/^https?:\/\//, ''))}${s.motd ? ' · ' + esc(String(s.motd).slice(0, 60)) : ''}</small></td><td>${s.unknown ? '?' : (s.players | 0) + ' / ' + (s.max | 0)}</td><td>${esc(s.version || '')}</td><td>${s.ping != null ? s.ping + ' ms' : ''}</td>
    <td>${s.url === here ? '<em>You are here</em>' : `<button data-go="${i}">Connect</button>`}<button data-fav="${i}" title="Favourite">${FAVS.list.some(f => f.url === s.url) ? '★' : '☆'}</button></td></tr>`).join('');
  showOverlay(`<h2>Server browser</h2>
    <h3>ROOMS ON THIS SERVER</h3><table class="sbt">${rooms}</table>
    <h3>ROBOBLOCKS SERVERS${res.hub ? ' · from ' + esc(res.hub.replace(/^https?:\/\//, '')) : ''}</h3>
    ${res.ok ? `<table class="sbt">${rows || '<tr><td>No other servers have reported in yet.</td></tr>'}</table>` : `<p>${esc(res.why)}</p>`}
    <div class="sbaddr"><input id="sbAddr" placeholder="Server address, e.g. play.example.com:8080" maxlength="120"><button id="sbOpen">Connect</button></div>
    <p style="font-size:13px">${HOST ? 'Connecting switches the app to that server and updates the game to its version.' : "Connecting opens that server's page."} Your account and saves belong to each server separately.</p>
    <div class="btns"><button id="sbRefresh">Refresh</button><button class="primary" id="ovBack">Back</button></div>`, true);
  $('#ovBack').onclick = backToMenu; $('#sbRefresh').onclick = showServerBrowser;
  const go = url => { if (!url || url === here) return; if (HOST && HOST.setServer) HOST.setServer(url); else location.href = url + '/'; };
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(list[+b.dataset.go].url));
  document.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => { const s = list[+b.dataset.fav], i = FAVS.list.findIndex(f => f.url === s.url); if (i >= 0) FAVS.list.splice(i, 1); else FAVS.list.push({ url: s.url, name: s.name }); store.set('sfa.favServers', FAVS.list.slice(0, 30)); showServerBrowser(); });
  document.querySelectorAll('[data-room]').forEach(b => b.onclick = () => { const s = SERVERS.find(x => x.id === b.dataset.room); hideOverlay(); joinGame(s.id, s, null); });
  $('#sbOpen').onclick = () => { let v = $('#sbAddr').value.trim(); if (!v) return; if (!/^https?:\/\//.test(v)) v = 'http://' + v; const u = cleanUrl(v); if (!u) { toast('That does not look like a server address.'); return; } go(u); };
}
Object.assign(window.__sfa, { bpAdd, bpState, bpTier, showPass, showFriends, showServerBrowser, FRIENDS, PROG, seasonNo, mySR, skillTeams, brawlNow });
