// ================= CHAT, CALLOUTS, MUTE, FILTER =================
// Lobby chat rides on the lobby presence; in a game, everyone also joins a small chat room g<code>c.
// Each sender keeps a short ring of recent messages in its presence; receivers show entries newer
// than the last sequence number they saw from that peer.
// The word list is stored ROT13 so the source reads clean. The dedicated server filters the same words.
const BAD_WORDS = 'shpx fuvg ovgpu phag nffubyr onfgneq qvpx pbpx chffl juber fyhg snt snttbg avttre avttn ergneq gjng jnaxre zbgureshpxre'
  .split(' ').map(w => w.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 84) % 26 + 97)));
const BAD_RE = new RegExp('(' + BAD_WORDS.map(w => w.split('').map(c => c + '+').join('[^a-z0-9]?')).join('|') + ')', 'gi');
function filterText(s) { return String(s).replace(BAD_RE, m => '*'.repeat(Math.min(8, m.length))); }
const CALLOUTS = [
  { k: 'Digit1', txt: 'Attack here!', ping: 'aim', col: '#ff8a1f' },
  { k: 'Digit2', txt: 'Defend our base!', ping: 'base', col: '#4fb0ff' },
  { k: 'Digit3', txt: 'Need repairs!', ping: 'me', col: '#5dffa0' },
  { k: 'Digit4', txt: 'Enemy spotted!', ping: 'aim', col: '#ff5444' },
  { k: 'Digit5', txt: 'On my way!', ping: 'me', col: '#ffd36a' },
  { k: 'Digit6', txt: 'Thanks!', ping: null, col: '#d8d8d8' },
];
const CHAT = {
  seq: 0, lobbyRing: [], gameRing: [], seen: new Map(), log: [], room: null, peers: [], open: false, scope: 'team', calloutT: 0,
  muted: new Set(store.get('sfa.muted', [])), hidden: !!store.get('sfa.chatOff', false), pings: [], lastSend: 0, sendTimes: [],
};
const chatTeam = () => { const g = NET.game, i = g && g.info; if (!g) return -1; if (g.spec || HEADLESS) return 2; const t = i && i.roster ? i.roster[NET.me] : undefined; return t === 0 || t === 1 ? t : -1; };
function chatJoin(code) {
  if (HEADLESS || !NET.room) return;
  NET.room.join('g' + code + 'c').then(r => {
    if (!NET.game || NET.game.code !== code) { r.leave().catch(() => { }); return; }
    CHAT.room = r; CHAT.gameRing = [];
    r.onPeers(ch => { CHAT.peers = ch.peers; chatIngest(ch.peers, 'game'); });
    chatPresence();
  }).catch(() => { });
}
function chatLeave() { if (CHAT.room) CHAT.room.leave().catch(() => { }); CHAT.room = null; CHAT.peers = []; CHAT.gameRing = []; CHAT.pings = []; }
function chatPresence() { if (CHAT.room) CHAT.room.presence({ n: NET.name, tm: chatTeam(), ch: CHAT.gameRing }).catch(() => { }); }
// sending
function chatSend(text, opts = {}) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140); if (!text) return;
  if (text[0] === '/') { chatCommand(text); return; }
  const now = Date.now(); CHAT.sendTimes = CHAT.sendTimes.filter(t => now - t < 10000);
  if (CHAT.sendTimes.length >= 6) { chatLocal('You are sending messages too fast. Wait a few seconds.'); return; }
  CHAT.sendTimes.push(now);
  text = filterText(text);
  const inGame = !!(NET.game && CHAT.room), scope = inGame ? (opts.scope || CHAT.scope) : 'all';
  const e = [++CHAT.seq, scope === 'team' ? 't' : 'a', text, opts.x == null ? null : Math.round(opts.x), opts.z == null ? null : Math.round(opts.z), opts.cid == null ? null : opts.cid, now];
  const ring = inGame ? CHAT.gameRing : CHAT.lobbyRing; ring.push(e); while (ring.length > 6) ring.shift();
  chatShow({ name: NET.name || 'You', me: true, team: chatTeam(), scope: e[1], text, x: e[3], z: e[4], cid: e[5] });
  if (inGame) chatPresence(); else lobbyPresence();
}
function chatLocal(text) { chatShow({ sys: true, text }); }
function chatCommand(text) {
  const [cmd, ...rest] = text.slice(1).split(' '), arg = rest.join(' ').trim().toLowerCase();
  if (cmd === 'mute' && arg) { CHAT.muted.add(arg); store.set('sfa.muted', [...CHAT.muted]); cloudDirty(); chatLocal(`Muted ${arg}. /unmute ${arg} to undo.`); }
  else if (cmd === 'unmute' && arg) { CHAT.muted.delete(arg); store.set('sfa.muted', [...CHAT.muted]); cloudDirty(); chatLocal(`Unmuted ${arg}.`); }
  else if (cmd === 'report' && arg) { const parts = text.slice(1).split(' ').slice(1), who = parts[0], why = parts.slice(1).join(' ') || 'No reason given'; sendReport('player', { target: who, reason: why, where: NET.game ? NET.game.code : 'lobby' }).then(() => chatLocal(`Reported ${who}. Thank you.`), e => chatLocal(e.message === 'local' ? 'Reports need a server.' : e.message)); }
  else if (cmd === 'muted') chatLocal(CHAT.muted.size ? 'Muted: ' + [...CHAT.muted].join(', ') : 'Nobody is muted.');
  else if (cmd === 'all' || cmd === 'team') { CHAT.scope = cmd; chatLocal(`Chat goes to ${cmd === 'all' ? 'everyone' : 'your team'}.`); chatScopeUi(); }
  else if (typeof adminCommand === 'function' && adminCommand(cmd, rest)) { }
  else chatLocal('Commands: /all, /team, /mute name, /unmute name, /muted, /report name reason' + (typeof adminHelp === 'function' ? adminHelp() : ''));
}
// receiving
function chatIngest(peers, kind) {
  const now = Date.now(), myTeam = chatTeam();
  for (const p of peers) {
    if (p.sameTab || !p.presence) continue;
    const ring = p.presence.ch, key = kind + ':' + p.peer;
    if (!Array.isArray(ring)) { if (!CHAT.seen.has(key)) CHAT.seen.set(key, 0); continue; }
    const last = CHAT.seen.get(key);
    let max = last || 0;
    for (const e of ring.slice(-6)) {
      if (!Array.isArray(e) || typeof e[0] !== 'number') continue;
      if (last === undefined) { max = Math.max(max, e[0]); continue; } // joined late: skip the backlog
      if (e[0] <= last) continue; max = Math.max(max, e[0]);
      if (now - (+e[6] || now) > 30000) continue;
      const name = cleanName(kind === 'game' ? p.presence.n : p.presence.name) || 'Pilot', team = kind === 'game' ? p.presence.tm : -1;
      if (CHAT.muted.has(name.toLowerCase())) continue;
      if (e[1] === 't' && kind === 'game' && team !== myTeam) continue;
      chatShow({ name, team, scope: e[1], text: filterText(String(e[2] || '').slice(0, 140)), x: e[3], z: e[4], cid: e[5] });
    }
    CHAT.seen.set(key, max);
  }
}
function chatShow(m) {
  if (CHAT.hidden && !m.sys && !m.me) return;
  if (!m.me && !m.sys && !HEADLESS) SFX.chat();
  const row = document.createElement('div'); row.className = 'cm' + (m.sys ? ' sys' : '');
  if (!m.sys) {
    const n = document.createElement('b');
    const mine = m.team === chatTeam(), col = m.team === 2 ? 'S' : m.team < 0 ? 'N' : mine ? 'A' : 'E';
    n.className = col; n.textContent = (m.scope === 't' ? '[team] ' : '') + m.name + ': ';
    if (!m.me) { n.title = 'Click to mute'; n.onclick = () => chatCommand('/mute ' + m.name.toLowerCase()); }
    row.append(n);
  }
  row.append(document.createTextNode(m.text));
  row.dataset.t = Date.now();
  const box = $('#chatLog'); box.appendChild(row); while (box.children.length > 40) box.firstChild.remove(); box.scrollTop = 1e6;
  $('#chat').classList.add('recent'); CHAT.recentT = 8;
  if (m.x != null && m.z != null && Number.isFinite(+m.x) && Number.isFinite(+m.z)) {
    const co = CALLOUTS[m.cid | 0] || CALLOUTS[0];
    CHAT.pings.push({ x: +m.x, z: +m.z, t: 6, col: m.cid != null ? co.col : '#ffd36a', name: m.name });
    if (!HEADLESS && state === 'battle') SFX.ui();
  }
}
// UI
function chatOpen(scope) {
  if (!NET.game && !$('#lobbyList')) return;
  for (const k in keys) keys[k] = false; mouseDown = false;
  CHAT.open = true; if (scope) CHAT.scope = scope;
  $('#chat').classList.add('open'); chatScopeUi();
  const inp = $('#chatIn'); inp.value = ''; inp.focus();
  if (document.pointerLockElement) document.exitPointerLock();
}
function chatClose() { CHAT.open = false; $('#chat').classList.remove('open'); $('#chatIn').blur(); }
function chatScopeUi() { const s = $('#chatScope'); if (s) s.textContent = NET.game ? (CHAT.scope === 'team' ? 'TEAM' : 'ALL') : 'LOBBY'; }
function chatTick(dt) {
  if (CHAT.recentT > 0) { CHAT.recentT -= dt; if (CHAT.recentT <= 0) $('#chat').classList.remove('recent'); }
  for (let i = CHAT.pings.length - 1; i >= 0; i--) { CHAT.pings[i].t -= dt; if (CHAT.pings[i].t <= 0) CHAT.pings.splice(i, 1); }
  const lobby = !$('#overlay').hidden && !!$('#lobbyList'), vis = !CHAT.hidden && !!NET.room && (lobby || (!!NET.game && (state === 'battle' || !$('#overlay').hidden)));
  $('#chat').hidden = !vis; if (TCH.on) { const ng = !NET.game || state !== 'battle'; $('#tChat').hidden = ng; $('#tCall').hidden = ng || (match && match.spectator); } $('#chat').classList.toggle('dock', vis && state !== 'battle');
  if (CHAT.calloutT > 0) { CHAT.calloutT -= dt; if (CHAT.calloutT <= 0) $('#callouts').hidden = true; }
}
function drawPings(g, mx, my) {
  for (const p of CHAT.pings) {
    const x = mx(p.x), y = my(p.z), r = 6 + (1 - (p.t % 1)) * 14;
    g.strokeStyle = p.col; g.globalAlpha = Math.min(1, p.t / 1.5); g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.fillStyle = p.col; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.globalAlpha = 1;
  }
}
function showCallouts() {
  if (!match || !NET.game || match.spectator) return;
  $('#callouts').hidden = false; CHAT.calloutT = 4;
}
function sendCallout(i) {
  const c = CALLOUTS[i]; if (!c || !match) return;
  $('#callouts').hidden = true; CHAT.calloutT = 0;
  const P = match.player; let x = null, z = null;
  if (c.ping === 'aim' && !P.dead) { x = aimPoint.x; z = aimPoint.z; }
  else if (c.ping === 'me' && !P.dead) { x = P.pos.x; z = P.pos.z; }
  else if (c.ping === 'base') { const t = P.team; x = 0; z = (t === 0 ? -1 : 1) * world.spawnZ; }
  chatSend(c.txt, { scope: 'team', x, z, cid: i });
}
(() => {
  if (HEADLESS) return;
  const inp = $('#chatIn');
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { chatSend(inp.value); inp.value = ''; chatClose(); e.preventDefault(); }
    else if (e.key === 'Escape') { chatClose(); e.preventDefault(); }
    else if (e.key === 'Tab') { e.preventDefault(); if (NET.game) { CHAT.scope = CHAT.scope === 'team' ? 'all' : 'team'; chatScopeUi(); } }
  });
  inp.addEventListener('keyup', e => e.stopPropagation());
  $('#chatScope').onclick = () => { if (NET.game) { CHAT.scope = CHAT.scope === 'team' ? 'all' : 'team'; chatScopeUi(); inp.focus(); } };
  document.querySelectorAll('#callouts button').forEach((b, i) => b.onclick = () => sendCallout(i));
})();
