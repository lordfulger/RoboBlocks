// ================= MULTIPLAYER =================
// Built on the artifact `room` capability: presence only (no event topics), so every signed-in
// viewer can play. Rooms: the lobby (who is online, open games), g<code> (slow: designs, roster,
// host's match state), g<code>s (fast: each player's bot state + damage reports), g<code>a<k>
// (host's AI bot states, sharded to stay under the 4 KiB presence limit).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64I = {}; for (let i = 0; i < 64; i++) B64I[B64[i]] = i;
function encodeDesign(d) {
  const fi = Math.max(0, FINISHES.findIndex(f => f.id === (d.f || 'standard')));
  let out = '~' + B64[fi] + '----', high = '', n = 0;
  for (const b of d.blocks) {
    const t = PART_CODES.indexOf(b.t); if (t < 0) continue;
    if (b.y >= 16) high += B64[(n >> 6) & 63] + B64[n & 63]; n++; // taller bots: the 5th height bit, per block
    // part code: 5 low bits at 12, a sixth bit at 31 (always 0 in older saves)
    const v = ((b.x + 8) & 15) | ((b.y & 15) << 4) | (((b.z + 8) & 15) << 8) | ((t & 31) << 12) | (((b.c | 0) & 15) << 17) | (((b.r | 0) & 63) << 21) | ((((b.k || 1) - 1) & 15) << 27) | (((t >> 5) & 1) << 31);
    for (let i = 0; i < 6; i++) out += B64[(v >>> (i * 6)) & 63];
  }
  // armor materials: '!' then, per non-standard block, its index (2 chars) and material (1 char)
  let tail = ''; d.blocks.forEach((b, i) => { const mi = MAT_CODES.indexOf(b.m); if (mi > 0 && PART_CODES.includes(b.t)) tail += B64[(i >> 6) & 63] + B64[i & 63] + B64[mi]; });
  if (high) out += '@' + high;
  return tail ? out + '!' + tail : out;
}
function decodeDesign(s) {
  const blocks = [];
  if (typeof s !== 'string') return { v: 3, blocks };
  let f = 'standard', i0 = 0, mats = '';
  const bang = s.indexOf('!'); if (bang >= 0) { mats = s.slice(bang + 1); s = s.slice(0, bang); }
  let high = ''; const at = s.indexOf('@'); if (at >= 0) { high = s.slice(at + 1); s = s.slice(0, at); }
  if (s[0] === '~') { f = (FINISHES[B64I[s[1]] | 0] || FINISHES[0]).id; i0 = 6; }
  for (let i = i0; i + 6 <= s.length && blocks.length < 700; i += 6) {
    let v = 0; for (let j = 0; j < 6; j++) v |= (B64I[s[i + j]] | 0) << (j * 6);
    const t = PART_CODES[((v >>> 12) & 31) | (((v >>> 31) & 1) << 5)]; if (!t) continue;
    const b = { x: (v & 15) - 8, y: (v >>> 4) & 15, z: ((v >>> 8) & 15) - 8, t, c: ((v >>> 17) & 15) % COLORS.length, r: (v >>> 21) & 63 };
    if (isShape(t) || isLeg(t)) b.k = ((v >>> 27) & 15) + 1; // armor tier, or a leg's size
    blocks.push(b);
  }
  for (let i = 0; i + 2 <= high.length; i += 2) { const b = blocks[((B64I[high[i]] | 0) << 6) | (B64I[high[i + 1]] | 0)]; if (b) b.y += 16; }
  for (let i = 0; i + 3 <= mats.length; i += 3) { const bi = ((B64I[mats[i]] | 0) << 6) | (B64I[mats[i + 1]] | 0), m = MAT_CODES[B64I[mats[i + 2]] | 0], b = blocks[bi]; if (b && m && m !== 'std' && isShape(b.t)) b.m = m; }
  return { v: 3, f, blocks };
}
function maskOf(b) { let s = '', acc = 0, n = 0; for (const c of b.cellList) { acc |= (c.alive ? 1 : 0) << n; if (++n === 6) { s += B64[acc]; acc = 0; n = 0; } } if (n) s += B64[acc]; return s; }
function maskAlive(m, i) { const ch = B64I[m[(i / 6) | 0]]; return ch === undefined ? true : !!((ch >> (i % 6)) & 1); }
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);

// Official servers: always listed, always joinable. Whoever has been on a server longest runs it
// (warmup countdown, map/mode rotation, AI bots, score); when they leave, the next pilot takes over mid-match.
// replaced by the dedicated server's own list when one is connected
const SERVERS = [
  { id: 'sv-scrap', name: 'Scrapyard 24/7', blurb: 'Team Deathmatch on every map.', n: 10, rot: [['tdm', 'dust'], ['tdm', 'frost'], ['tdm', 'ash']] },
  { id: 'sv-beacon', name: 'Beacon Wars', blurb: 'Battle Arena rotation.', n: 10, rot: [['arena', 'frost'], ['arena', 'dust'], ['arena', 'ash']] },
  { id: 'sv-last', name: 'Last Bot Standing', blurb: 'Fast 5v5 Elimination rounds.', n: 5, rot: [['elim', 'ash'], ['elim', 'dust'], ['elim', 'frost']] },
  { id: 'sv-war', name: 'Total War', blurb: '20v20 mixed rotation.', n: 20, rot: [['tdm', 'dust'], ['arena', 'ash'], ['tdm', 'frost'], ['arena', 'dust'], ['elim', 'frost']] },
  { id: 'sv-objective', name: 'Objective Rush', blurb: 'Capture the Core and King of the Hill.', n: 10, rot: [['ctc', 'dust'], ['koth', 'city'], ['ctc', 'frost'], ['koth', 'ash']] },
  { id: 'sv-horde', name: 'Horde Co-op', blurb: 'Team up against ten waves of AI.', n: 5, rot: [['horde', 'dust'], ['horde', 'frost'], ['horde', 'ash']] },
  { id: 'sv-brawl', name: 'Weekly Brawl', blurb: "This week's twist on team deathmatch.", n: 10, rot: [['brawl', 'dust'], ['brawl', 'city'], ['brawl', 'frost'], ['brawl', 'moon']] },
];
const WARMUP = 15, INTERMISSION = 15;
const NET = {
  room: null, tried: false, me: null, name: cleanName(store.get('sfa.callsign', '')) || 'Pilot-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
  game: null, slow: null, fast: null, shards: [], lobbyPeers: [], slowPeers: [], fastPeers: [], shardPeers: [],
  seq: 0, ring: [], pend: new Map(), seen: new Map(), sendT: 0, shardT: 0, lobbyUnsub: null, timer: 0, pubT: 0,
};
async function netInit() {
  if (NET.room || NET.tried) return NET.room;
  NET.tried = true;
  // online play only ever goes through a RoboBlocks dedicated server (e.g. on Pterodactyl): its WebSocket relay.
  // A copy opened anywhere else (such as an embedded preview) stays offline and points players at a server.
  if (!onClaudePage() && (window.__BC_LOCAL_CONN || SERVER_BASE)) NET.room = await relayRoom();
  if (!NET.room) return null;
  NET.lobbyUnsub = NET.room.onPeers(ch => {
    NET.lobbyPeers = ch.peers; const me = ch.peers.find(p => p.isMe && p.sameTab); if (me) NET.me = me.peer;
    if (!HEADLESS) { chatIngest(ch.peers, 'lobby'); partyTick(); friendsTick(); }
    if (!$('#overlay').hidden && $('#lobbyList')) renderLobbyList();
  }, () => { NET.room = null; });
  if (!NET.timer) NET.timer = setInterval(serverTick, 250);
  lobbyPresence();
  return NET.room;
}
function lobbyPresence() {
  if (!NET.room) return;
  const g = NET.game, i = g && g.info;
  NET.room.presence({
    bc: 1, srv: HEADLESS ? 1 : null, name: HEADLESS ? 'Server' : NET.name, fc: HEADLESS ? null : MY_FC, lv: level(), sr: HEADLESS ? null : mySR(), sv: g ? g.code : null, ch: CHAT.lobbyRing.length ? CHAT.lobbyRing : null,
    party: NET.party ? NET.party.id : null, pinv: HEADLESS ? null : PARTY.inv, bd: HEADLESS ? null : myBadge() || null, clan: HEADLESS ? null : myClan(),
    host: g && g.isHost && i ? { code: g.code, server: g.server ? g.server.id : null, mode: i.mode, map: i.map, n: i.n, cnt: NET.slowPeers.length || 1, phase: i.phase, cd: Math.round(i.cd || 0), tl: Math.round(i.tl || 0), started: i.phase === 'live' } : null,
  }).catch(() => { });
}
const myPeer = () => NET.me || (NET.room && (NET.room.peers().find(p => p.isMe && p.sameTab) || {}).peer) || null;
const phaseText = h => !h ? 'Empty: a match starts when you join' : h.phase === 'live' ? `In match · ${(MODES[h.mode] || MODES.tdm).name} on ${(MAPS[h.map] || MAPS.dust).name} · ${Math.floor((h.tl | 0) / 60)}:${String((h.tl | 0) % 60).padStart(2, '0')} left`
  : h.phase === 'post' ? `Next: ${(MODES[h.mode] || MODES.tdm).name} on ${(MAPS[h.map] || MAPS.dust).name} in ${h.cd | 0}s` : h.phase === 'warmup' ? `Warmup · starts in ${h.cd | 0}s` : 'Waiting for the host to start';

// ---------- lobby UI ----------
// The Server browser (the main menu's online button): the rooms on this server with live status, other
// RoboBlocks servers (from the hub) and favourites, a box to type any server's address, and custom games.
async function showLobby() {
  showOverlay(`<h2>Server browser</h2><p>Connecting…</p>`, true);
  const room = await netInit();
  if (!room) {
    showOverlay(`<h2>Server browser</h2>
      <p>${onClaudePage() ? 'This copy of the game is offline.' : 'Could not reach the RoboBlocks server.'} Online play runs on RoboBlocks servers: connect to one by its address (for example <b>your-server-ip:port</b>).</p>
      <div id="sbOthers"></div>
      <div class="sbaddr"><input id="sbAddr" placeholder="Server address, e.g. 203.0.113.5:25570" maxlength="200" spellcheck="false"><button id="sbOpen" class="primary">Connect</button></div>
      <div class="btns"><button id="ovBack">Back</button></div>`, true);
    wireServerList(false);
    $('#ovBack').onclick = () => { hideOverlay(); buildPilotCard(); };
    return;
  }
  NET.me = myPeer();
  const here = NET.serverName || (SERVER_BASE ? SERVER_BASE.replace(/^https?:\/\//, '') : 'This server');
  showOverlay(`<div class="sbTop"><div><h2>Play online</h2><p class="sbHere"><b></b> · <span id="sbOnline"></span></p></div><button id="sbParty">Party</button></div>
    <div id="lobbyList"></div>
    <div class="btns"><button class="primary" id="ovBack">Back</button><button id="sbHostBtn">Host a custom game</button></div>
    <details id="sbOther"><summary>Other servers</summary><div id="sbOthers"><p class="gempty">Looking for other servers…</p></div>
      <div class="sbaddr"><input id="sbAddr" placeholder="Server address, e.g. 203.0.113.5:25570" maxlength="200" spellcheck="false"><button id="sbOpen">Connect</button></div></details>`, true);
  $('.sbHere b').textContent = here;
  $('#ovBack').onclick = () => { hideOverlay(); buildPilotCard(); };
  $('#sbHostBtn').onclick = () => showHostGame();
  $('#sbParty').onclick = () => showParty(showLobby);
  if (NET.party) $('#sbParty').textContent = `Party (${partyMembers().length || 1})`;
  wireServerList(true);
  renderLobbyList();
}
// hosting a custom game: its own screen
function showHostGame() {
  showOverlay(`<h2>Host a custom game</h2><p>Pick the rules; friends join it from Play online.</p>
    ${setupOptsHtml(true)}
    <div class="btns"><button class="primary" id="ovHost">Host game</button><button id="ovBack">Back</button></div>`, true);
  wireSetupOpts();
  $('#ovHost').onclick = () => { if (!canDeploy()) return; store.set('sfa.setup', setupSel); joinGame('c' + Math.random().toString(36).slice(2, 7), null, { ...setupSel }); };
  $('#ovBack').onclick = () => showLobby();
}
// other RoboBlocks servers: the hub's list (when this server reports to one) plus your favourites
async function wireServerList(online) {
  const here = SERVER_BASE || '', cleanUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : null; } catch (e) { return null; } };
  const go = url => { if (!url || url === here) return; store.set('sfa.mpAddr', url); if (HOST && HOST.setServer) HOST.setServer(url); else if (onClaudePage()) { const w = window.open(url + '/', '_blank', 'noopener'); if (!w) toast('Open ' + url + ' in your browser to play online.'); } else location.href = url + '/'; };
  const inp = $('#sbAddr'); if (inp) {
    inp.value = online ? '' : store.get('sfa.mpAddr', '') || OFFICIAL_SERVER.replace(/^https?:\/\//, '');
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#sbOpen').click(); });
    $('#sbOpen').onclick = () => { let v = inp.value.trim(); if (!v) { inp.focus(); return; } if (!/^https?:\/\//i.test(v)) v = 'http://' + v; const u = cleanUrl(v); if (!u) { toast('That does not look like a server address.'); return; } go(u); };
  }
  const box = $('#sbOthers'); if (!box) return;
  const res = online ? await fetchServerList() : { ok: false };
  if (!$('#sbOthers')) return; // the window was closed meanwhile
  const list = (res.ok ? res.list : []).map(s => ({ ...s, url: cleanUrl(s.url) })).filter(s => s.url && s.url !== here);
  for (const f of FAVS.list) if (f.url !== here && !list.some(s => s.url === f.url)) list.push({ url: f.url, name: f.name || f.url, unknown: true });
  list.sort((a, b) => (FAVS.list.some(f => f.url === b.url) - FAVS.list.some(f => f.url === a.url)) || (b.players | 0) - (a.players | 0));
  if (!list.length) { box.innerHTML = '<p class="gempty">No other servers right now. You can type an address below.</p>'; return; }
  box.innerHTML = `<h3>OTHER ROBOBLOCKS SERVERS${res.hub ? ' · from ' + esc(res.hub.replace(/^https?:\/\//, '')) : ''}</h3><table class="sbt">${list.map((s, i) => `<tr><td><b>${esc(s.name || s.url)}</b><br><small>${esc(s.url.replace(/^https?:\/\//, ''))}${s.motd ? ' · ' + esc(String(s.motd).slice(0, 60)) : ''}</small></td><td>${s.unknown ? '' : (s.players | 0) + ' / ' + (s.max | 0)}</td><td>${esc(s.version || '')}</td><td><button data-go="${i}">Connect</button><button data-fav="${i}" title="Favourite">${FAVS.list.some(f => f.url === s.url) ? '★' : '☆'}</button></td></tr>`).join('')}</table>`;
  box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(list[+b.dataset.go].url));
  box.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => { const s = list[+b.dataset.fav], i = FAVS.list.findIndex(f => f.url === s.url); if (i >= 0) FAVS.list.splice(i, 1); else FAVS.list.push({ url: s.url, name: s.name }); store.set('sfa.favServers', FAVS.list.slice(0, 30)); wireServerList(online); });
}
function askPassword(server, then) {
  showOverlay(`<h2>${esc(server.name)}</h2><p>This server needs a password.</p>
    <div class="srow"><label for="svPw">Password</label><input id="svPw" type="password" maxlength="64" autocomplete="off"><span></span></div>
    <div class="btns"><button class="primary" id="ovPwGo">Join</button><button id="ovPwBack">Back</button></div>`, true);
  const go = () => { const v = $('#svPw').value; if (v) then(v); };
  $('#svPw').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); });
  $('#ovPwGo').onclick = go; $('#ovPwBack').onclick = () => showLobby(); setTimeout(() => $('#svPw').focus(), 50);
}
const canDeploy = () => { const v = validateDesign(); if (!v.ok) { toast(v.msg); return false; } return true; };
function renderLobbyList() {
  const el = $('#lobbyList'); if (!el) return;
  const others = NET.lobbyPeers.filter(p => !p.sameTab && p.presence && p.presence.bc && !p.presence.srv);
  const hosts = NET.lobbyPeers.filter(p => !p.sameTab && p.presence && p.presence.host && typeof p.presence.host.code === 'string');
  // rows are keyed and updated in place, so buttons don't move under the pointer while statuses tick
  const want = [];
  for (const sv of SERVERS) {
    const h = (hosts.find(p => p.presence.host.code === sv.id) || {}).presence;
    const inRoom = others.filter(p => p.presence.sv === sv.id), cnt = inRoom.length, meIn = NET.game && NET.game.code === sv.id;
    const who = inRoom.slice(0, 4).map(p => pilotTag(p.presence)).join(', ') + (cnt > 4 ? ` +${cnt - 4}` : '');
    const tags = [sv.locked ? '🔒 Password' : '', sv.ranked ? 'RANKED' : '', sv.noAi ? 'PLAYERS ONLY' : '', (sv.minLv || 1) > 1 || (sv.maxLv || 10) < 10 ? `Lv ${sv.minLv || 1}–${sv.maxLv || 10}` : ''].filter(Boolean).join(' · ');
    const size = sv.rot && sv.rot.length && sv.rot.every(r => r[0] === 'pit') ? sv.n * 2 + ' pilots, free-for-all' : sv.n + ' v ' + sv.n, total = cnt + (meIn ? 1 : 0);
    want.push({ key: sv.id, group: 'sv', title: sv.name, tags, status: phaseText(h && h.host), players: total ? `👤 ${total} · ${[who, meIn ? 'you' : ''].filter(Boolean).join(', ')}` : '👤 Nobody here yet', small: `${sv.blurb} ${size}.`, live: !!(h && h.host && h.host.phase === 'live'),
      btn: total || (h && h.host && h.host.phase === 'live') ? 'Join' : 'Start', go: () => { if (canDeploy()) joinGame(sv.id, sv, null); }, watch: h && h.host && h.host.phase === 'live' ? () => joinGame(sv.id, sv, null, true) : null });
  }
  for (const p of hosts.filter(p => !p.presence.host.server && String(p.presence.host.code).startsWith('c'))) {
    const h = p.presence.host, code = String(h.code).replace(/[^a-z0-9-]/g, '').slice(0, 12);
    want.push({ key: code, group: 'cu', title: `${cleanName(p.presence.name) || 'Pilot'}'s game`, tags: '', status: h.phase === 'live' ? phaseText(h) : `${(MODES[h.mode] || MODES.tdm).name} on ${(MAPS[h.map] || { name: 'a random map' }).name} · waiting for the host to start`, players: `👤 ${h.cnt | 0}`, small: `Custom game · ${h.n | 0} v ${h.n | 0}`, live: h.phase === 'live', btn: h.phase === 'live' ? 'Join in progress' : 'Join', go: () => { if (canDeploy()) joinGame(code, null, null); }, watch: h.phase === 'live' ? () => joinGame(code, null, null, true) : null });
  }
  if (!el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = '<p id="lobbyMotd" class="motd" hidden></p><div class="rlist" id="lgSv"></div><h3 id="lhCu" hidden>CUSTOM GAMES</h3><div class="rlist" id="lgCu"></div>';
  }
  if ($('#sbOnline')) $('#sbOnline').textContent = `${others.length + 1} pilot${others.length ? 's' : ''} online`;
  const mo = $('#lobbyMotd'); if (mo) { mo.hidden = !NET.motd; mo.textContent = NET.motd ? '📣 ' + NET.motd : ''; }
  $('#lhCu').hidden = !want.some(w => w.group === 'cu');
  const seen = new Set();
  for (const w of want) {
    seen.add(w.key);
    let r = el.querySelector(`.grow[data-key="${w.key}"]`);
    if (!r) {
      r = document.createElement('div'); r.className = 'grow room'; r.dataset.key = w.key;
      r.innerHTML = '<div class="ri"><div class="rt"><b></b><em></em></div><span class="rs"></span><span class="rp"></span><small></small></div><div class="rb"><button class="primary"></button><button class="watch" hidden>Watch</button></div>';
      $(w.group === 'sv' ? '#lgSv' : '#lgCu').appendChild(r);
    }
    r.querySelector('b').textContent = w.title; r.querySelector('em').textContent = w.tags || ''; r.querySelector('.rs').textContent = w.status; r.querySelector('.rp').textContent = w.players; r.querySelector('small').textContent = w.small; r.classList.toggle('live', !!w.live);
    const btn = r.querySelector('button.primary'); if (btn.textContent !== w.btn) btn.textContent = w.btn; btn.onclick = w.go;
    const wb = r.querySelector('button.watch'); wb.hidden = !w.watch; wb.onclick = w.watch;
  }
  for (const r of [...el.querySelectorAll('.grow')]) if (!seen.has(r.dataset.key)) r.remove();
}

// ---------- game rooms ----------
async function joinGame(code, server, setup, spec, pw) {
  if (!code || NET.game || NET.joining) return;
  if (BE.kind === 'artifact' && artBanned(BE.uid)) { toast('A game admin has blocked you from multiplayer.'); return; }
  if (server && server.locked && pw === undefined && !HEADLESS) { askPassword(server, p => joinGame(code, server, setup, spec, p)); return; }
  NET.joining = true;
  try { NET.slow = await NET.room.join('g' + code, pw); NET.fast = await NET.room.join('g' + code + 's'); }
  catch (e) {
    NET.joining = false;
    if (e && e.denied && /password/i.test(e.message) && server) { toast(e.message); askPassword(server, p => joinGame(code, server, setup, spec, p)); return; }
    toast(e && e.denied ? e.message : 'Could not join. Try again in a moment.'); return;
  }
  NET.joining = false; NET.lastPw = pw;
  NET.game = { code, server, custom: !server, setup: setup || null, isHost: false, spec: !!spec, since: HEADLESS ? 1 : spec ? 0 : Date.now(), info: null, inBattle: false, matchId: -1, created: !!setup };
  NET.seq = 0; NET.ring = []; NET.pend.clear(); NET.seen.clear(); NET.me = myPeer();
  NET.slow.onPeers(ch => { NET.slowPeers = ch.peers; onSlowPeers(); });
  NET.fast.onPeers(ch => { NET.fastPeers = ch.peers; });
  if (setup) becomeHost(); // you created this custom game
  chatJoin(code);
  slowPresence(true); lobbyPresence();
  ensureShards(server ? Math.ceil((server.n * 2) / 13) : Math.ceil(((setup ? setup.n : 20) * 2) / 13));
  showWaiting();
  if (spec) toast('Watching. Click or press Space to switch bots, Esc to leave.');
  setTimeout(() => { if (NET.game && NET.game.code === code && !NET.game.info) maybeClaimHost(); }, 4000);
}
function ensureShards(k) {
  for (let i = 0; i < k; i++) if (!NET.shards[i]) {
    const code = NET.game.code;
    NET.shards[i] = 'pending';
    NET.room.join('g' + code + 'a' + i).then(r => { if (!NET.game || NET.game.code !== code) { r.leave().catch(() => { }); return; } NET.shards[i] = r; r.onPeers(ch => { NET.shardPeers[i] = ch.peers; }); }).catch(() => { NET.shards[i] = null; });
  }
}
// the host settles the map and its size before each match, so every client builds the same arena
function resolveMap(mode, map) { return mode === 'space' ? (MAPS[map] && MAPS[map].space ? map : pickMap(SPACE_ORDER)) : (MAPS[map] && !MAPS[map].space ? map : pickMap(MAP_ORDER)); }
function freshInfo() {
  const g = NET.game, sv = g.server, s = g.setup || setupSel;
  const first = sv ? sv.rot[0] : [s.mode, s.mode === 'space' ? s.smap : s.map, s.size], n = sv ? sv.n : s.n;
  return { phase: sv ? 'warmup' : 'lobby', cd: WARMUP, matchId: 0, rot: 0, mode: first[0], map: resolveMap(first[0], first[1]), size: mapSizeOf(first[2], n), n, noAi: sv ? !!sv.noAi : s.ai === 'none', roster: {}, score: [0, 0], tl: 600, over: false, winner: null, pts: [], ai: [0, 0], seed: 0, lv: level() };
}
function slowPresence(withDesign) {
  if (!NET.slow || !NET.game) return;
  const g = NET.game, patch = { name: NET.name, lv: level(), sr: HEADLESS ? null : mySR(), since: g.since, spec: g.spec ? 1 : 0, pg: NET.ping || null, pt: NET.party ? NET.party.id : null, bd: HEADLESS ? null : myBadge() || null, clan: HEADLESS ? null : myClan() };
  if (withDesign) { const d = presenceDesign(); patch.d = NET.sentD = encodeDesign(d); patch.dn = cleanName(d.name || ''); }
  patch.g = g.isHost ? g.info : null;
  NET.slow.presence(patch).catch(e => { if (e && e.code === 'invalid_argument') toast('Your bot is too large to send online. Remove some blocks.'); });
}
// a server with BC_UNLOCK_ALL: open everything while connected to it, and refresh the garage to match
function setUnlockAll(on) {
  if (HEADLESS || on === UNLOCK_ALL) return; UNLOCK_ALL = on;
  try { buildPartsUI(); buildFinishUI(); updateStats(); if (typeof techBadge === 'function') techBadge(); if (state === 'menu') buildPilotCard(); } catch (e) { }
  if (on) toast('Everything is unlocked on this server: every part, armor tier, material and CPU core.');
}
// loadouts: send just the design you will respawn with
function slowPresenceDesign(d) { if (!NET.slow || !NET.game) return; const code = encodeDesign(d); if (code === NET.sentD) return; NET.sentD = code; NET.slow.presence({ d: code, dn: cleanName(d.name || '') }).catch(e => { if (e && e.code === 'invalid_argument') toast('That bot is too large to send online.'); }); }
// a remote pilot picked another bay: rebuild them with the design in their presence (checked like any other)
function netLoadout(b) {
  const p = NET.slowPeers.find(x => x.peer === b.netId); if (!p || !p.presence || !p.presence.d || p.presence.d === b.dcode) return false;
  b.dcode = p.presence.d; const rd = remoteDesign(p, b.team); if (!rd) return false; b.design = rd; return true;
}
const hostPeer = () => NET.slowPeers.find(p => p.presence && p.presence.g && !p.sameTab) || null;
const senior = (a, b) => (a.presence.since || 9e15) - (b.presence.since || 9e15) || (a.peer < b.peer ? -1 : 1);
function maybeClaimHost() {
  const g = NET.game; if (!g || g.isHost || g.spec) return;
  if (hostPeer()) return;
  // the lobby may still show someone hosting this server while their game-room presence is on its way
  if (NET.lobbyPeers.some(p => !p.sameTab && p.presence && p.presence.host && p.presence.host.code === g.code)) { setTimeout(maybeClaimHost, 2000); return; }
  const ranked = NET.slowPeers.filter(p => p.presence && p.presence.since).sort(senior);
  if (!ranked.length || ranked[0].sameTab) becomeHost();
}
function becomeHost() {
  const g = NET.game; if (!g) return;
  g.isHost = true;
  if (!g.info) g.info = freshInfo();
  for (const p of NET.slowPeers) if (!(p.peer in g.info.roster) && p.presence && p.presence.since && !(HEADLESS && p.sameTab)) assignTeam(p.peer);
  if (!(NET.me in g.info.roster) && !HEADLESS) assignTeam(NET.me);
  if (match && match.net) { // take over the AI bots mid-match
    match.isHost = true;
    for (const b of world.bots) if (!b.human && b.remote) { b.remote = false; b.brain = new Brain(b); b.net = null; if (b.dead) b.respawnT = 3; }
    if (g.inBattle && match.over) g.info.phase = 'post';
  }
  slowPresence(false); lobbyPresence();
}
function stepDown() {
  const g = NET.game; if (!g || !g.isHost) return;
  g.isHost = false;
  if (match && match.net) { match.isHost = false; for (const b of world.bots) if (!b.human && !b.isPlayer) { b.remote = true; b.brain = null; } }
  slowPresence(false); lobbyPresence();
}
function assignTeam(peer) {
  const pp = NET.slowPeers.find(x => x.peer === peer), pt = pp && pp.presence && pp.presence.pt;
  if (pt && NET.game.info.mode !== 'pit') { const mate = NET.slowPeers.find(x => x.peer !== peer && x.presence && x.presence.pt === pt && (NET.game.info.roster[x.peer] === 0 || NET.game.info.roster[x.peer] === 1)); if (mate) { NET.game.info.roster[peer] = NET.game.info.roster[mate.peer]; return; } }
  if (NET.game.info.mode === 'horde') { NET.game.info.roster[peer] = 0; return; }
  if (NET.game.info.mode === 'pit') { const used = Object.values(NET.game.info.roster); let t = 10; while (used.includes(t)) t++; NET.game.info.roster[peer] = t; return; } const c = [0, 0]; for (const t of Object.values(NET.game.info.roster)) c[t]++; NET.game.info.roster[peer] = c[1] < c[0] ? 1 : 0; }
function onSlowPeers() {
  const g = NET.game; if (!g) return;
  const other = hostPeer();
  if (g.isHost) {
    // two hosts (a race on an empty server): the more senior one keeps it
    if (other && senior(other, NET.slowPeers.find(p => p.sameTab) || { presence: { since: g.since }, peer: NET.me }) < 0) stepDown();
    else {
      const live = new Set(NET.slowPeers.map(p => p.peer)); let changed = false;
      for (const id of Object.keys(g.info.roster)) if (!live.has(id)) { delete g.info.roster[id]; changed = true; }
      for (const p of NET.slowPeers) if (!(p.peer in g.info.roster) && p.presence && p.presence.since && !(HEADLESS && p.sameTab)) { assignTeam(p.peer); changed = true; }
      if (changed) { slowPresence(false); lobbyPresence(); }
    }
  }
  if (!g.isHost) {
    if (other) { g.info = other.presence.g; g.seenHost = true; }
    else if (g.seenHost || g.info) maybeClaimHost(); // host left: the most senior pilot takes over
  }
  if (g.inBattle) syncHumans();
  followPhase();
  if (!$('#overlay').hidden && $('#wroster')) renderWaiting();
}
// everyone (host included) reacts to the shared phase
function followPhase() {
  const g = NET.game, info = g && g.info; if (!info) return;
  const mine = info.roster && info.roster[NET.me];
  if (info.phase === 'live' && (typeof mine === 'number' || g.spec) && (!g.inBattle || g.matchId !== info.matchId)) startNetBattle();
  else if ((info.phase === 'lobby' || info.phase === 'warmup') && g.inBattle) { leaveBattleView(); showWaiting(); }
}
function leaveBattleView() {
  const g = NET.game; g.inBattle = false;
  if (document.pointerLockElement) document.exitPointerLock();
  clearBattle(); match = null; paused = false; mouseDown = false;
  SFX.engineUpdate(null, false); SFX.beamStop();
  $('#hud').hidden = true; $('#lock').hidden = true; state = 'menu'; $('#menu').hidden = false;
}
// the host's clock: warmup -> live -> intermission -> next map, forever
function serverTick() {
  const g = NET.game; if (!g) return;
  if (!g.isHost) { if (!$('#overlay').hidden && ($('#wroster') || $('#nextIn'))) renderWaiting(); return; }
  const info = g.info, dt = .25;
  // a dedicated server idles in warmup until a pilot shows up (unless told to keep matches running)
  if (HEADLESS && g.server && !(window.__BC_SERVER || {}).idleMatches && !NET.slowPeers.some(p => !p.sameTab && p.presence && p.presence.since)) {
    if (info.phase !== 'warmup' || info.cd !== WARMUP) { if (g.inBattle) leaveBattleView(); info.phase = 'warmup'; info.cd = WARMUP; slowPresence(false); lobbyPresence(); }
    NET.pubT -= dt; if (NET.pubT <= 0) { NET.pubT = 2; slowPresence(false); lobbyPresence(); }
    return;
  }
  if (info.phase === 'warmup') { info.cd -= dt; if (info.cd <= 0) launchMatch(); }
  else if (info.phase === 'live') {
    if (match && match.net) { info.score = match.score.slice(); info.tl = Math.round(match.time); info.over = match.over; info.winner = match.winner; info.pts = world.points.map(p => [p.owner, r2(p.prog)]); info.rx = match.rx && match.rxMax ? match.rx.map(v => Math.round(v / match.rxMax * 1000)) : null; info.cores = coreState(); info.hz = hordeState(); info.bld = buildingState(); if (match.over) { info.phase = 'post'; info.cd = INTERMISSION; } }
    else if (!g.inBattle) startNetBattle();
  } else if (info.phase === 'post') {
    info.cd -= dt;
    if (info.cd <= 0) { if (g.server) { info.rot = (info.rot + 1) % g.server.rot.length; launchMatch(); } else { info.phase = 'lobby'; followPhase(); } }
  }
  NET.pubT -= dt; if (NET.pubT <= 0) { NET.pubT = .5; slowPresence(false); lobbyPresence(); }
  if (!$('#overlay').hidden && ($('#wroster') || $('#nextIn'))) renderWaiting();
}
function launchMatch() {
  const g = NET.game, info = g.info;
  if (g.server) { const [m, mp, sz] = g.server.rot[info.rot % g.server.rot.length]; info.mode = m; info.map = resolveMap(m, mp); info.n = g.server.n; info.size = mapSizeOf(sz, info.n); }
  // rebalance: alternate pilots by seniority so teams stay even
  const pilots = NET.slowPeers.filter(p => p.presence && p.presence.since && !(HEADLESS && p.sameTab)).sort(senior).map(p => p.peer);
  if (!pilots.includes(NET.me) && !HEADLESS) pilots.unshift(NET.me);
  const ptOf = id => { const p = NET.slowPeers.find(x => x.peer === id); return p && p.presence && p.presence.pt || null; };
  const teams = skillTeams(pilots, ptOf, id => id === NET.me ? (HEADLESS ? null : mySR()) : peerSR(id));
  info.roster = {}; pilots.forEach((id, i) => { info.roster[id] = info.mode === 'pit' ? 10 + i : info.mode === 'horde' ? 0 : teams[id]; });
  const c = [0, 0]; for (const t of Object.values(info.roster)) if (t < 2) c[t]++;
  info.ai = info.noAi ? [0, 0] : info.mode === 'pit' ? [Math.max(0, info.n * 2 - pilots.length), 0] : info.mode === 'horde' ? [Math.max(0, hordeSquad(info.n) - pilots.length), 0] : [Math.max(0, info.n - c[0]), Math.max(0, info.n - c[1])];
  info.seed = (Math.random() * 1e9) | 0; info.lv = level(); info.matchId = (info.matchId | 0) + 1;
  info.brawl = brawlNow().id; info.phase = 'live'; info.tl = modeTime(info.mode) || (info.mode === 'elim' ? 420 : 600); info.score = [0, 0]; info.over = false; info.winner = null; info.pts = [];
  slowPresence(false); lobbyPresence();
  startNetBattle();
}
function showWaiting() {
  const g = NET.game; if (!g) return;
  const title = g.server ? g.server.name : g.isHost || g.created ? 'Your custom game' : 'Custom game';
  showOverlay(`<h2>${title}</h2><p id="wsub"></p><p id="nextIn" class="next"></p>
    <div class="teams"><div><h3 id="wh1" style="color:var(--ally)">BLUE TEAM</h3><div id="wroster"></div></div><div><h3 id="wh2" style="color:var(--enemy)">RED TEAM</h3><div id="wroster2"></div></div></div>
    <p style="font-size:13px" id="wai">Empty slots are filled with AI bots.${g.server ? ' Matches start automatically and rotate maps.' : ''}</p>
    <div class="btns"><button class="primary" id="ovStart" hidden>Start battle</button><button id="ovLeave">Leave</button></div>`, true);
  $('#ovStart').onclick = () => { if (NET.game && NET.game.isHost && NET.game.info.phase === 'lobby') launchMatch(); };
  $('#ovLeave').onclick = () => { netLeave(); showLobby(); };
  renderWaiting();
}
function renderWaiting() {
  const g = NET.game; if (!g) return;
  const info = g.info;
  if ($('#nextIn')) {
    $('#nextIn').textContent = !info ? 'Connecting to the server…' : info.phase === 'warmup' ? `Warmup: next match starts in ${Math.max(0, Math.ceil(info.cd))}s`
      : info.phase === 'post' ? `Next match: ${(MODES[nextRot(g, info)[0]] || MODES.tdm).name} on ${MAPS[nextRot(g, info)[1]] ? MAPS[nextRot(g, info)[1]].name : 'a random map'} in ${Math.max(0, Math.ceil(info.cd))}s`
      : info.phase === 'lobby' ? (g.isHost ? 'Start when everyone is in.' : 'Waiting for the host to start.') : 'Match in progress. Joining…';
  }
  if ($('#ovStart')) $('#ovStart').hidden = !(g.isHost && info && info.phase === 'lobby');
  if (!$('#wroster')) return;
  const ffa = info && info.mode === 'pit';
  if ($('#wai')) $('#wai').textContent = (info && info.noAi ? (info.mode === 'horde' ? 'Players only: no AI teammates (the waves still come).' : 'Players only: no AI bots.') : 'Empty slots are filled with AI bots.') + (g.server ? ' Matches start automatically and rotate maps.' : '');
  $('#wsub').textContent = info ? `${(MODES[info.mode] || MODES.tdm).name} on ${(MAPS[info.map] || MAPS.dust).name} (${(MAP_SIZES[info.size] || MAP_SIZES.medium).name.toLowerCase()}), ${ffa ? `free-for-all: everyone against everyone, ${info.n * 2} pilots and bots` : `${info.n}v${info.n}`}.` : '';
  // The Pit has no teams: one list of pilots
  if ($('#wh1')) { $('#wh1').textContent = ffa ? 'PILOTS · EVERY ONE FOR THEMSELVES' : 'BLUE TEAM'; $('#wh1').style.color = ffa ? '#ffd36a' : 'var(--ally)'; $('#wh2').parentNode.hidden = ffa; }
  const cols = [$('#wroster'), $('#wroster2')]; cols.forEach(c => c.innerHTML = '');
  for (const p of NET.slowPeers) {
    let t = info && info.roster ? info.roster[p.peer] : undefined; if (typeof t !== 'number') continue; if (ffa) t = 0; else if (t > 1) t = Object.keys(info.roster).indexOf(p.peer) % 2;
    const d = document.createElement('div'); d.className = 'r';
    const n = document.createElement('span'); n.textContent = pilotTag(p.presence) + (p.sameTab ? ' (you)' : '') + (p.presence.g ? ' ★ host' : '');
    const s = document.createElement('span'); s.className = 'num'; s.textContent = 'Lv ' + ((p.presence.lv | 0) || 1) + (p.presence.dn ? ' · ' + cleanName(p.presence.dn) : '');
    d.append(n, s); cols[t].appendChild(d);
  }
}
const nextRot = (g, info) => g.server ? g.server.rot[(info.rot + 1) % g.server.rot.length] : [info.mode, info.map];
function startNetBattle() {
  const g = NET.game, info = g.info;
  g.inBattle = true; g.matchId = info.matchId;
  const humans = [];
  for (const p of NET.slowPeers) {
    if (p.sameTab) continue;
    const t = info.roster[p.peer]; if (typeof t !== 'number') continue;
    const rd = p.presence.d ? remoteDesign(p, t) : null; if (!rd) continue;
    humans.push({ id: p.peer, team: t, name: pilotTag(p.presence), design: rd });
  }
  if (!$('#overlay').hidden) hideOverlay();
  startBattle({ mode: info.mode, map: info.map, size: info.size, n: info.n, net: { isHost: g.isHost, spectator: HEADLESS || g.spec, me: NET.me, myTeam: info.roster[NET.me] | 0, seed: info.seed, lv: info.lv, ai: info.ai, brawl: info.brawl, humans } });
  if (!match || !match.net) { g.inBattle = false; return; }
  ensureShards(Math.ceil((info.ai[0] + info.ai[1] + (info.mode === 'horde' ? HORDE.pool : 0)) / 13));
}
// late joiners / leavers during a battle
// every client checks other pilots' bots against the rules for their (server-stamped) level
const badNoted = new Set();
function remoteDesign(p, team) {
  const d = decodeDesign(p.presence.d), lv = clamp((p.presence.lv | 0) || 1, 1, 10), why = designIssue(d, lv) || (world.space && !canFlyInSpace(computeStats(d.blocks)) ? 'it cannot fly' : null);
  if (BE.kind === 'artifact' && p.by && artBanned(p.by)) return null;
  if (!why) return d;
  const name = cleanName(p.presence.name) || 'Pilot', key = p.peer + why;
  if (!badNoted.has(key)) { badNoted.add(key); chatLocal(`${name}'s bot breaks the rules (${why}) and was left out of the battle.`); }
  return null;
}
function syncHumans() {
  if (!match || !match.net) return;
  const info = NET.game.info, have = new Map(world.bots.filter(b => b.human && b.remote).map(b => [b.netId, b]));
  const live = new Set();
  for (const p of NET.slowPeers) {
    if (p.sameTab) continue; live.add(p.peer);
    const t = info && info.roster ? info.roster[p.peer] : undefined;
    if (have.has(p.peer) || typeof t !== 'number' || !p.presence.d) continue;
    const rd = remoteDesign(p, t); if (!rd) continue;
    const b = new Bot(rd, t, pilotTag(p.presence), { remote: true, human: true, netId: p.peer });
    world.bots.push(b); toastCenter(`${b.name} joined`, 1.5);
  }
  for (const [id, b] of have) if (!live.has(id)) removeBot(b);
}
function removeBot(b) {
  if (b.group) world.scene.remove(b.group);
  b.dead = true; b.respawnT = Infinity; world.bots = world.bots.filter(x => x !== b);
  toastCenter(`${b.name} left`, 1.5);
}
function netLeave() {
  for (const r of [NET.slow, NET.fast, ...NET.shards]) if (r && r.leave) r.leave().catch(() => { });
  chatLeave();
  NET.slow = NET.fast = null; NET.shards = []; NET.game = null; NET.slowPeers = []; NET.fastPeers = []; NET.shardPeers = [];
  lobbyPresence();
}
// ---------- damage reports (shooter -> owner of the target) ----------
function netReportHit(attacker, target, idx, dmg) {
  const k = attacker.netId + '|' + target.netId; let m = NET.pend.get(k); if (!m) NET.pend.set(k, m = { a: attacker.netId, t: target.netId, cells: new Map(), heal: 0 });
  m.cells.set(idx, (m.cells.get(idx) || 0) + dmg);
}
function netReportStatus(by, target, kind, secs) {
  const k = by.netId + '|' + target.netId; let m = NET.pend.get(k); if (!m) NET.pend.set(k, m = { a: by.netId, t: target.netId, cells: new Map(), heal: 0 });
  m[kind] = Math.max(m[kind] || 0, secs);
}
function netReportHeal(healer, target, amt) {
  const k = healer.netId + '|' + target.netId; let m = NET.pend.get(k); if (!m) NET.pend.set(k, m = { a: healer.netId, t: target.netId, cells: new Map(), heal: 0 });
  m.heal += amt;
}
function flushReports(now) {
  for (const m of NET.pend.values()) {
    let p = ''; for (const [i, d] of m.cells) p += (p ? ',' : '') + i + ':' + Math.round(d);
    if (m.heal) p += (p ? ',' : '') + 'h:' + Math.round(m.heal);
    for (const kd of ['e', 'x']) if (m[kd]) p += (p ? ',' : '') + kd + ':' + m[kd].toFixed(1);
    if (p) NET.ring.push([++NET.seq, m.a, m.t, p, now]);
  }
  NET.pend.clear();
  NET.ring = NET.ring.filter(e => now - e[4] < 2.5).slice(-36);
}
const netBot = id => id ? world.bots.find(b => b.netId === id) || null : null;
// Anti-cheat: a shooter can only report as much damage as its guns could deal. Each attacker gets a
// token bucket refilled at 2.5x its best-case damage per second (splash counted generously), with a
// few seconds of burst. Anything over that is scaled down, and repeat offenders are named in chat.
const DMG_BUCKETS = new Map();
function attackerRate(b) {
  if (b._rate) return b._rate; // from the whole design, so it doesn't shrink as guns get shot off
  const sc = tierScale(10), cnt = {}; let dps = 0, heal = 0;
  for (const c of b.cellList) cnt[c.t] = (cnt[c.t] || 0) + 1;
  for (const t of WTYPES) {
    const n = cnt[t] || 0; if (!n) continue; const W = WEAPONS[t];
    if (t === 'nano') { heal += n * W.heal / W.cd * sc; continue; }
    const splashCells = W.splash ? 1 + Math.pow(W.splash, 3) * 1.4 : 1;
    dps += n * W.dmg / W.cd * splashCells * sc * (t === 'flak' ? W.airBonus : 1);
  }
  dps += (cnt.tesla || 0) * TESLA_DPS * 4;
  b._rate = { dmg: 400 + dps * 2.5, heal: 200 + heal * 2.5 }; return b._rate;
}
function allowDamage(attacker, kind, amt, now) {
  const key = attacker.netId + kind, rate = attackerRate(attacker)[kind];
  let bk = DMG_BUCKETS.get(key); if (!bk) DMG_BUCKETS.set(key, bk = { tok: rate * 4, t: now, over: 0 });
  bk.tok = Math.min(rate * 4, bk.tok + (now - bk.t) * rate); bk.t = now;
  const ok = Math.min(amt, Math.max(0, bk.tok)); bk.tok -= ok;
  if (ok < amt * .9 && amt > 50) { bk.over++; if (bk.over === 3) chatLocal(`Ignoring impossible damage from ${attacker.name}.`); }
  return amt > 0 ? ok / amt : 1;
}
function applyReports(sender, ring) {
  if (!Array.isArray(ring)) return;
  const last = NET.seen.get(sender) || 0; let max = last;
  for (const e of ring) {
    if (!Array.isArray(e) || typeof e[0] !== 'number' || e[0] <= last) continue;
    max = Math.max(max, e[0]);
    if (e[2] === 'R0' || e[2] === 'R1') { const att = netBot(e[1]); if (att && match && match.isHost) for (const part of String(e[3]).split(',').slice(0, 4)) { const v = Math.min(5000, Math.max(0, +part.split(':')[1] || 0)); reactorDamage(+e[2][1], v * allowDamage(att, 'dmg', v, performance.now() / 1000), att); } continue; }
    const target = netBot(e[2]); if (!target || target.remote || target.dead) continue;
    const attacker = netBot(e[1]); if (!attacker || attacker.team === target.team) continue; // unknown shooters (left out, or not in this match) do nothing
    const parts = String(e[3]).split(',').slice(0, 300).map(x => { const [a, b] = x.split(':'); return [a, Math.min(5000, Math.max(0, +b || 0))]; });
    const now = performance.now() / 1000, total = parts.reduce((s, [a, v]) => s + (a === 'h' || a === 'e' || a === 'x' ? 0 : v), 0), heal = parts.reduce((s, [a, v]) => s + (a === 'h' ? v : 0), 0);
    const kD = total ? allowDamage(attacker, 'dmg', total, now) : 1, kH = heal ? allowDamage(attacker, 'heal', heal, now) : 1;
    for (const [a, v0] of parts) {
      if (a === 'h') { target.healAt(v0 * kH, attacker); continue; }
      if (a === 'e' || a === 'x') { if (attacker.stats && attacker.stats.modules[a === 'e' ? 'emp' : 'disrupt']) applyStatus(target, a, Math.min(a === 'e' ? 2.5 : 8, v0), attacker); continue; }
      const v = v0 * kD, c = target.cellList[a | 0]; if (v > 0 && c && c.alive) { target.damageCell(c, v, attacker); onHit(attacker, target, v); }
    }
  }
  NET.seen.set(sender, max);
}

// ---------- bot state ----------
function encState(b) {
  if (b.dead) return [1, b.deaths, b.killerId || '', b.spawnCount];
  return [0, b.deaths, '', b.spawnCount, r1(b.pos.x), r1(b.pos.y), r1(b.pos.z), r2(b.yaw), r2(b.pitch), r2(b.roll), r1(b.vel.x), r1(b.vel.y), r1(b.vel.z),
    r1(b.input.aim.x), r1(b.input.aim.y), r1(b.input.aim.z), WTYPES.indexOf(b.input.weapon), b.input.fire ? 1 : 0, r2(b.spin), b.shieldT > 0 ? 1 : 0, maskOf(b), r1(b.alt), b.jetting ? 1 : 0, b.kills, Math.round(b.dmgDealt), Math.round(b.healed || 0), (b.cloakT > 0 ? 1 : 0) | (b.stunT > 0 ? 2 : 0) | (b.flyT > 0 ? 4 : 0), b.input.group && b.input.group.length > 1 ? b.input.group.reduce((m, t) => m | (1 << WTYPES.indexOf(t)), 0) | (b.input.groupMode === 'alt' ? 1 << 20 : 0) : 0, b.barrierMax ? r2(b.barrier / b.barrierMax) : 0];
}
const _np = new T.Vector3();
function applyState(b, s, now) {
  if (!Array.isArray(s) || !b) return;
  const [dead, deaths, killer, spawns] = s;
  if (dead) {
    if (!b.dead && b.netSpawns === spawns) { b.die(netBot(killer)); }
    b.net = null; return;
  }
  if (s.length < 23) return;
  if (b.netSpawns !== spawns) { // a (re)spawn: rebuild the full bot where the owner put it
    if (!b.dead && b.group) { world.scene.remove(b.group); b.dead = true; }
    if (b.human) netLoadout(b);
    b.netSpawns = spawns; b.spawn(_np.set(+s[4] || 0, +s[5] || 0, +s[6] || 0), +s[7] || 0); b.pos.set(+s[4] || 0, +s[5] || 0, +s[6] || 0);
  } else if (b.human && !b.dead && b.spawnT < 2 && netLoadout(b)) { // their new design arrived just after they respawned
    world.scene.remove(b.group); b.dead = true; const yaw = b.yaw; b.spawn(_np.set(+s[4] || 0, +s[5] || 0, +s[6] || 0), yaw); b.pos.set(+s[4] || 0, +s[5] || 0, +s[6] || 0);
  }
  if (b.dead) return;
  b.net = { x: +s[4], y: +s[5], z: +s[6], yaw: +s[7], pitch: +s[8], roll: +s[9], vx: +s[10], vy: +s[11], vz: +s[12], t: now };
  b.vel.set(+s[10] || 0, +s[11] || 0, +s[12] || 0);
  if (typeof s[28] === 'number' && b.barrierMax) b.barrier = clamp(s[28], 0, 1) * b.barrierMax; // the owner's shield projector barrier
  b.input.aim.set(+s[13] || 0, +s[14] || 0, +s[15] || 0);
  b.input.weapon = WTYPES[s[16] | 0] || 'blaster'; b.input.fire = !!s[17]; b.spin = +s[18] || 0; b.shieldT = s[19] ? .5 : 0;
  b.alt = +s[21] || 0; b.jetting = !!s[22]; if (typeof s[23] === 'number') b.kills = s[23] | 0; if (typeof s[24] === 'number') b.dmgDealt = Math.max(0, s[24]); if (typeof s[25] === 'number') b.healed = Math.max(0, s[25]); { const fl = s[26] | 0; b.cloaked = !!(fl & 1); b.cloakT = b.cloaked ? 1 : 0; b.stunT = fl & 2 ? .5 : 0; b.flyT = fl & 4 ? .4 : 0; const gm = s[27] | 0; b.input.group = gm ? WTYPES.filter((t, i) => gm & (1 << i)) : null; b.input.groupMode = gm & (1 << 20) ? 'alt' : 'together'; }
  const m = typeof s[20] === 'string' ? s[20] : '';
  let changed = false;
  for (const c of b.cellList) {
    const alive = maskAlive(m, c.idx);
    if (!alive && c.alive) { c.hp = 0; b.destroyCell(c); changed = true; }
    else if (alive && !c.alive) { b.reviveCell(c, .5); changed = true; }
  }
  if (changed) b.needCheck = true;
}
function netMove(b, dt) { // smooth remote bots toward their owner's latest state
  const n = b.net; if (!n || b.dead) return;
  const age = Math.min(.3, clock - n.t);
  _np.set(n.x + n.vx * age, n.y + n.vy * age, n.z + n.vz * age);
  const k = 1 - Math.exp(-14 * dt);
  if (b.pos.distanceToSquared(_np) > 400) b.pos.copy(_np); else b.pos.lerp(_np, k);
  b.yaw = approachAngle(b.yaw, n.yaw, Math.max(.02, Math.abs(wrapA(n.yaw - b.yaw)) * k)); b.pitch = lerp(b.pitch, n.pitch, k); b.roll = lerp(b.roll, n.roll, k);
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw); b.vf = b.vel.x * fx + b.vel.z * fz;
  for (const c of b.wheels) c.wheel.rotation.x += b.vf * dt / .56;
  for (const c of b.rotors) c.rotor.rotation.y += dt * 20;
  for (const c of b.flames) { c.flame.userData.off = c.fly ? !(b.flyT > 0) : c.thrust ? b.vf < 4 : !b.jetting; }
  if (b.legs.length) { b.walk = (b.walk || 0) + b.vf * dt * 1.6; const amp = Math.min(1, Math.abs(b.vf) / 3) * .5; for (const c of b.legs) c.leg.rotation.x = Math.sin(b.walk + (c.idx % 2) * Math.PI) * amp; }
  for (const c of b.flags) c.flag.rotation.y = Math.sin(clock * 4 + c.idx) * .35;
  for (const c of b.flaps || []) c.flap.rotation.x = clamp(b.vel.y * .03 + (c.x < b.cx ? 1 : -1) * (b.yawVel || 0) * .3, -.5, .5);
  if (b.shield) b.shield.visible = b.shieldT > 0;
}

// RoboBlocks servers have bandwidth to spare: send player state 20 times a second and AI 10 (other hosts 12 and 6)
const NET_FAST = () => HEADLESS || BE.kind === 'server' || !!(NET.room && NET.room.relay);
// ---------- per-frame network tick ----------
function netTick(dt) {
  if (!match || !match.net || !NET.game) return;
  const now = clock, P = match.player, g = NET.game;
  // receive
  const owners = new Set();
  for (const p of NET.fastPeers) {
    if (p.sameTab || !p.presence || p.presence.m !== g.matchId) continue;
    const b = netBot(p.peer); owners.add(p.peer);
    if (b && b.remote) applyState(b, p.presence.s, now);
    applyReports(p.peer, p.presence.h);
  }
  if (!g.isHost) {
    NET.shardPeers.forEach(list => { for (const p of list || []) { if (p.sameTab || !p.presence || p.presence.m !== g.matchId || !Array.isArray(p.presence.a)) continue; for (const e of p.presence.a) if (Array.isArray(e)) applyState(netBot('a' + e[0]), e.slice(1), now); } });
    const h = hostPeer();
    if (h && h.presence.g && h.presence.g.matchId === g.matchId) {
      const info = g.info = h.presence.g;
      if (Array.isArray(info.score)) match.score = [info.score[0] | 0, info.score[1] | 0];
      if (typeof info.tl === 'number') match.time = info.tl;
      if (Array.isArray(info.pts)) info.pts.forEach((q, i) => { const pt = world.points[i]; if (pt && Array.isArray(q)) { const o = q[0] | 0; if (pt.owner !== o) { pt.owner = o; paintPoint(pt); } pt.prog = +q[1] || 0; } });
      if (Array.isArray(info.bld)) applyBuildingState(info.bld);
      if (Array.isArray(info.rx) && match.rxMax) match.rx = [0, 1].map(i => Math.max(0, Math.min(1000, info.rx[i] | 0)) / 1000 * match.rxMax);
      if (info.cores) applyCoreState(info.cores); if (info.hz) applyHordeState(info.hz);
      if (info.over && !match.over) endMatch(info.winner);
    }
  }
  for (const b of world.bots) if (b.remote) netMove(b, dt);
  // send
  NET.sendT -= dt;
  if (NET.sendT <= 0) {
    NET.sendT = NET_FAST() ? 1 / 20 : 1 / 12; flushReports(now);
    NET.fast.presence({ m: g.matchId, s: encState(P), h: NET.ring.map(e => e.slice(0, 4)) }).catch(() => { });
  }
  if (g.isHost) {
    NET.shardT -= dt;
    if (NET.shardT <= 0) {
      NET.shardT = NET_FAST() ? 1 / 10 : 1 / 6;
      const ai = world.bots.filter(b => !b.human && !b.isPlayer);
      NET.shards.forEach((r, k) => { if (r && r.presence) r.presence({ m: g.matchId, a: ai.slice(k * 13, k * 13 + 13).map(b => [b.netId.slice(1) | 0, ...encState(b)]) }).catch(() => { }); });
    }
  }
}

// ---------- WebSocket relay transport (self-hosted servers) ----------
// Same shape as the artifact `room` capability: presence, peers, onPeers, join, leave.
function relayRoom() {
  return new Promise(resolve => {
    const rooms = new Map(), calls = new Map(), waits = new Map(); let me = null, sock = null, open = false, done = false, lobby = null, callId = 0;
    const send = m => { if (open && sock) try { sock.send(JSON.stringify(m)); } catch (e) { } };
    function room(name, pw) {
      let r = rooms.get(name); if (r) return r.api;
      r = { peers: new Map(), mine: {}, listeners: new Set(), conn: new Set(), snap: Object.freeze([]) };
      r.rebuild = () => {
        r.snap = Object.freeze([...r.peers.entries()].map(([p, v]) => Object.freeze({ peer: p, by: null, isMe: p === me, sameTab: p === me, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.t })));
        for (const l of r.listeners) l({ peers: r.snap, joined: [], left: [], updated: [] });
      };
      r.api = Object.freeze({
        name,
        presence(patch) {
          const m = { ...r.mine }; for (const k in patch) { if (patch[k] === null) delete m[k]; else m[k] = patch[k]; }
          r.mine = m; if (me) r.peers.set(me, { presence: m, t: Date.now() }); send({ t: 'pres', room: name, p: patch }); r.rebuild(); return Promise.resolve();
        },
        peers: () => r.snap,
        onPeers(h) { r.listeners.add(h); setTimeout(() => h({ peers: r.snap, joined: r.snap, left: [], updated: [] }), 0); return () => r.listeners.delete(h); },
        connected: () => open,
        onConnection(h) { r.conn.add(h); setTimeout(() => h(open), 0); return () => r.conn.delete(h); },
        emit: () => Promise.resolve(), on: () => () => { },
        leave() { rooms.delete(name); send({ t: 'leave', room: name }); return Promise.resolve(); },
      });
      rooms.set(name, r); r.pw = pw || ''; send({ t: 'join', room: name, pw: r.pw });
      return r.api;
    }
    function handle(m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'api') { const c = calls.get(m.id); if (c) { calls.delete(m.id); clearTimeout(c.timer); if (m.ok) c.resolve(m.d); else c.reject(new Error(m.e || 'Request failed.')); } return; }
      if (m.t === 'notice') { if (typeof chatLocal === 'function') chatLocal(String(m.text || '')); toast(String(m.text || '').slice(0, 160)); return; }
      if (m.t === 'balance') { applyBalance(m.balance); return; }
      if (m.t === 'kicked') { NET.kicked = String(m.reason || 'Removed from the server.'); if (NET.game) netLeave(); if (state === 'battle') toMenu(); showOverlay(`<h2>Disconnected</h2><p>${esc(NET.kicked)}</p><div class="btns"><button class="primary" id="ovDone">OK</button></div>`); $('#ovDone').onclick = () => { hideOverlay(); buildPilotCard(); }; return; }
      if (m.t === 'denied') { const w = waits.get(m.room); rooms.delete(m.room); if (w) { waits.delete(m.room); w.reject(Object.assign(new Error(String(m.reason || 'Not allowed.')), { denied: true })); } return; }
      if (m.t === 'welcome') {
        me = m.peer; open = true; NET.motd = String(m.motd || ''); NET.serverName = String(m.name || '').slice(0, 40); NET.accounts = !!m.accounts; NET.requireAccount = !!m.requireAccount; setUnlockAll(!!m.unlockAll); serverVersion(m.version); applyBalance(m.balance); const recon = done;
        if (BE.kind === 'server' && BE.token) api('resume', { token: BE.token }).then(r => BE.onSignedIn(r && r.me, BE.token)).catch(() => BE.onSignedOut());
        if (Array.isArray(m.servers) && m.servers.length) SERVERS.splice(0, SERVERS.length, ...m.servers.filter(s => s && s.id && Array.isArray(s.rot) && s.rot.length));
        for (const [name, r] of rooms) { r.peers.clear(); r.peers.set(me, { presence: r.mine, t: Date.now() }); send({ t: 'join', room: name, pw: r.pw }); if (Object.keys(r.mine).length) send({ t: 'pres', room: name, p: r.mine }); }
        if (!lobby) { lobby = room('__lobby'); }
        if (!done) {
          done = true;
          // join resolves once the relay lets us in, or rejects with the reason (password, ranked, ban)
          const join = (n, pw) => { if (rooms.has(n)) return Promise.resolve(room(n)); return new Promise((ok, no) => { const api = room(n, pw); waits.set(n, { resolve: ok, reject: no }); setTimeout(() => { const w = waits.get(n); if (w) { waits.delete(n); ok(api); } }, 4000); }); };
          resolve(Object.freeze({ ...lobby, join, api, relay: true }));
        } else if (recon && NET.onReconnect) setTimeout(NET.onReconnect, 100);
        return;
      }
      const r = rooms.get(m.room); if (!r) return;
      if (m.t === 'peers') { const w = waits.get(m.room); if (w) { waits.delete(m.room); setTimeout(() => w.resolve(r.api), 0); } }
      if (m.t === 'peers') { r.peers = new Map((m.peers || []).map(p => [p.peer, { presence: p.presence || {}, t: Date.now() }])); r.peers.set(me, { presence: r.mine, t: Date.now() }); r.rebuild(); }
      else if (m.t === 'pres') { if (m.peer !== me) { r.peers.set(m.peer, { presence: m.presence || {}, t: Date.now() }); r.rebuild(); } }
      else if (m.t === 'left') { if (r.peers.delete(m.peer)) r.rebuild(); }
    }
    function api(op, a) {
      return new Promise((resolve, reject) => {
        if (!open) { reject(new Error('Not connected to the server.')); return; }
        const id = ++callId, timer = setTimeout(() => { calls.delete(id); reject(new Error('The server did not answer.')); }, 10000);
        calls.set(id, { resolve, reject, timer }); send({ t: 'api', id, op, a: a || {} });
      });
    }
    function connect() {
      try { sock = window.__BC_LOCAL_CONN ? window.__BC_LOCAL_CONN() : new WebSocket(SERVER_BASE.replace(/^http/, 'ws') + '/ws'); }
      catch (e) { if (!done) { done = true; resolve(null); } return; }
      sock.onopen = () => { open = true; for (const r of rooms.values()) for (const h of r.conn) h(true); };
      sock.onmessage = e => { try { handle(JSON.parse(e.data)); } catch (err) { } };
      sock.onclose = () => { const was = open; open = false; if (done && !NET.kicked) netBanner(true); for (const c of calls.values()) { clearTimeout(c.timer); c.reject(new Error('Lost the connection to the server.')); } calls.clear(); for (const r of rooms.values()) for (const h of r.conn) h(false); if (!done) { done = true; resolve(null); return; } if (!NET.kicked) setTimeout(connect, 2500); };
      sock.onerror = () => { };
    }
    connect();
    setTimeout(() => { if (!done) { done = true; resolve(null); } }, 6000);
  });
}
