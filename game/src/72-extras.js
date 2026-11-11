// ================= QUICK PLAY, DAMAGE NUMBERS, HIT DIRECTION, MEDALS, REPLAYS =================
// ---------- quick play: the fullest server that suits you ----------
// the busiest joinable room on another server: { url, server, id, name, players }
async function bestRemoteRoom(lv) {
  const res = await fetchServerList().catch(() => ({ ok: false })); if (!res.ok) return null;
  const here = SERVER_BASE, urls = res.list.map(s => { try { return { url: new URL(s.url).origin, name: s.name }; } catch (e) { return null; } }).filter(s => s && s.url !== here).slice(0, 8);
  let best = null;
  await Promise.all(urls.map(async u => {
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 3500); const r = await fetch(u.url + '/status', { signal: ac.signal, cache: 'no-store' }); clearTimeout(t); if (!r.ok) return;
      const st = await r.json(); if (st.version && BC_VERSION && st.version.split('.')[0] !== BC_VERSION.split('.')[0]) return;
      for (const room of st.servers || []) { const n = room.players | 0; if (n > 0 && (!best || n > best.players)) best = { url: u.url, server: st.server || u.name || u.url.replace(/^https?:\/\//, ''), id: room.id, name: room.name, players: n }; }
    } catch (e) { }
  }));
  return best;
}
// switch servers and drop straight into a room there
function goJoin(url, id) {
  store.set('sfa.autoJoin', { url, id, t: Date.now() });
  if (HOST && HOST.setServer) HOST.setServer(url); else location.href = url + '/#join=' + encodeURIComponent(id);
}
// on arrival: join the room the last server sent us to (or a #join= link)
function autoJoinCheck() {
  let id = (location.hash.match(/^#join=([\w-]+)/) || [])[1]; const aj = store.get('sfa.autoJoin', null);
  if (!id && aj && Date.now() - aj.t < 120000 && aj.url === SERVER_BASE) id = aj.id;
  store.set('sfa.autoJoin', null); if (location.hash.startsWith('#join=')) history.replaceState(null, '', location.pathname);
  const sv = id && SERVERS.find(s => s.id === id); if (!sv || !canDeploy()) return;
  toast(`Joining ${sv.name}.`); joinGame(sv.id, sv, null);
}
async function quickPlay() {
  if (!canDeploy()) return;
  showOverlay('<h2>Quick play</h2><p>Finding a battle…</p>');
  const room = await netInit();
  if (!room) { hideOverlay(); toast('No servers here, so starting a battle against AI.'); startBattle({ ...setupSel, mode: setupSel.mode || 'tdm' }); return; }
  await new Promise(r => setTimeout(r, 900)); // let the lobby fill in
  const hosts = NET.lobbyPeers.filter(p => p.presence && p.presence.host), lv = level();
  const players = id => NET.lobbyPeers.filter(p => p.presence && p.presence.bc && !p.presence.srv && p.presence.sv === id).length;
  // skill-aware: prefer servers whose pilots are close to your rating
  const srGap = id => { const l = NET.lobbyPeers.filter(p => p.presence && p.presence.bc && !p.presence.srv && p.presence.sv === id && typeof p.presence.sr === 'number'); if (!l.length) return 0; return Math.abs(l.reduce((s, p) => s + p.presence.sr, 0) / l.length - mySR()); };
  const cand = SERVERS.filter(s => !s.locked && (!s.ranked || BE.me) && lv >= (s.minLv || 1) && lv <= (s.maxLv || 10) && players(s.id) < s.n * 2)
    .map(s => { const h = (hosts.find(p => p.presence.host.code === s.id) || {}).presence; const ph = h && h.host ? h.host.phase : null; return { s, score: players(s.id) * 10 + (ph === 'live' ? 5 : ph === 'warmup' ? 3 : 0) + (s.n === 10 ? 1 : 0) - Math.min(25, srGap(s.id) / 20) }; })
    .sort((a, b) => b.score - a.score);
  // other RoboBlocks servers (from the hub): go there if one has a busier room you can join
  const best = cand[0] ? players(cand[0].s.id) : -1, far = await bestRemoteRoom(lv);
  if (far && far.players > best) { toast(`Joining ${far.name} on ${far.server}.`); goJoin(far.url, far.id); return; }
  if (!cand.length) { showLobby(); toast('No open server fits right now. Pick one, or host a custom game.'); return; }
  toast(`Joining ${cand[0].s.name}.`); joinGame(cand[0].s.id, cand[0].s, null);
}
// ---------- floating damage numbers ----------
const DMGN = { pool: [], acc: new Map() };
// one number per weapon per target, coloured by weapon, so mixed loadouts show what each gun is doing
const DMG_COL = { blaster: '#8fe6ff', chain: '#ffe58a', plasma: '#c69bff', mortar: '#ffb066', rail: '#ffffff', seeker: '#ff8fb4', flak: '#ffd36a', arc: '#9fd8ff', mine: '#b8ff8a', lancer: '#e6f7ff', tesla: '#7fe8ff' };
function dmgNumber(victim, amt, src) {
  if (HEADLESS || !victim || amt <= 0) return;
  const key = victim.netId + '|' + (src || '?'), a = DMGN.acc.get(key) || { amt: 0, t: 0, v: victim, src }; a.amt += amt; DMGN.acc.set(key, a);
}
function updateDmgNumbers(dt) {
  if (HEADLESS) return;
  const box = $('#dmgNums'); if (!box) return;
  for (const [key, a] of DMGN.acc) { const v = a.v; a.t += dt; if (a.t < .22 && a.amt < 2000) continue; DMGN.acc.delete(key); if (v.dead && a.amt < 1) continue;
    let el = DMGN.pool.find(x => x.life <= 0); if (!el) { if (DMGN.pool.length > 30) continue; el = { div: document.createElement('div'), life: 0 }; el.div.className = 'dn'; box.appendChild(el.div); DMGN.pool.push(el); }
    el.div.textContent = Math.round(a.amt).toLocaleString(); el.div.classList.toggle('big', a.amt > 900); el.div.style.color = DMG_COL[a.src] || ''; el.pos = v.center.clone().add(new T.Vector3(rand(-1, 1), v.height * .5 + rand(.5, 1.5), rand(-1, 1))); el.life = 1.1; el.div.style.display = 'block'; }
  for (const el of DMGN.pool) {
    if (el.life <= 0) continue; el.life -= dt; el.pos.y += dt * 2.2;
    const p = el.pos.clone().project(camera);
    if (el.life <= 0 || p.z > 1) { el.div.style.display = 'none'; el.life = Math.min(el.life, 0); continue; }
    el.div.style.transform = `translate(${(p.x * .5 + .5) * innerWidth}px,${(-p.y * .5 + .5) * innerHeight}px) translate(-50%,-50%)`; el.div.style.opacity = Math.min(1, el.life * 2);
  }
}
// ---------- which way the hits come from ----------
const HITDIR = [];
function hitFrom(attacker) {
  if (HEADLESS || !attacker || !match || !match.player) return;
  const P = match.player, a = Math.atan2(attacker.pos.x - P.pos.x, attacker.pos.z - P.pos.z);
  const h = HITDIR.find(x => x.who === attacker); if (h) { h.t = 1.4; h.a = a; return; }
  if (HITDIR.length >= 6) HITDIR.shift(); const div = document.createElement('div'); div.className = 'hd'; $('#hitDir').appendChild(div); HITDIR.push({ who: attacker, a, t: 1.4, div });
}
function updateHitDir(dt) {
  for (let i = HITDIR.length - 1; i >= 0; i--) {
    const h = HITDIR[i]; h.t -= dt; if (h.who && !h.who.dead && match && match.player) h.a = Math.atan2(h.who.pos.x - match.player.pos.x, h.who.pos.z - match.player.pos.z);
    if (h.t <= 0) { h.div.remove(); HITDIR.splice(i, 1); continue; }
    const rel = h.a - cam.yaw; h.div.style.transform = `rotate(${-rel}rad)`; h.div.style.opacity = Math.min(1, h.t);
  }
}
// ---------- end-of-match medals ----------
function matchMedals() {
  const bots = world.bots.filter(b => b.netId !== undefined); if (!bots.length) return [];
  const score = b => b.dmgDealt / 100 + b.kills * 6 + (b.healed || 0) / 120 - b.deaths * 2;
  const top = (f, min) => { const b = bots.reduce((x, y) => f(y) > f(x) ? y : x, bots[0]); return f(b) > min ? b : null; };
  return [['MVP', top(score, 5), '★'], ['Most damage', top(b => b.dmgDealt, 500), '✹'], ['Most kills', top(b => b.kills, 0), '☠'], ['Top medic', top(b => b.healed || 0, 400), '✚']]
    .filter(m => m[1]).map(([name, b, icon]) => ({ name, icon, who: b.isPlayer ? 'You' : b.name, me: b.isPlayer, team: b.team }));
}
function medalsHtml() {
  const m = matchMedals(); if (!m.length) return '';
  return `<div class="medals">${m.map(x => `<div class="medal${x.me ? ' me' : ''}"><span class="mi">${x.icon}</span><b>${esc(x.name)}</b><span>${esc(x.who)}</span></div>`).join('')}</div>`;
}
// ---------- replays: the last battle, recorded 5 times a second ----------
const REC = { on: false, t: 0, step: .2, frames: [], bots: [], shots: [], meta: null };
const LAST_REPLAY = { data: null };
function recStart() {
  if (HEADLESS || !match || match.mode === 'test') { REC.on = false; return; }
  REC.on = true; REC.t = 0; REC.acc = 0; REC.frames = []; REC.shots = [];
  REC.bots = world.bots.map(b => ({ design: b.design, team: b.team, name: b.isPlayer ? 'You' : b.name, me: b.isPlayer }));
  REC.meta = { map: world.mapId, tod: world.tod, wx: world.wxK, mode: match.mode, n: match.n, size: world.mapSize };
}
function recTick(dt) {
  if (!REC.on || !match) return;
  REC.t += dt; REC.acc += dt; if (REC.acc < REC.step) return; REC.acc = 0;
  if (REC.frames.length > 5 * 60 * 15) return; // 15 minutes is plenty
  REC.frames.push({ t: REC.t, s: world.bots.map(b => b.dead || !b.cellList ? null : [r1(b.pos.x), r1(b.pos.y), r1(b.pos.z), r2(b.yaw), r2(b.pitch), r2(b.roll), maskOf(b)]), sc: match.score.slice() });
}
function recShot(owner, type, from, aim) { if (!REC.on || REC.shots.length > 20000) return; const i = world.bots.indexOf(owner); if (i >= 0) REC.shots.push([REC.t, i, type, r1(from.x), r1(from.y), r1(from.z), r1(aim.x), r1(aim.y), r1(aim.z)]); }
function recStop() { if (!REC.on) return; REC.on = false; if (REC.frames.length > 10) LAST_REPLAY.data = { meta: REC.meta, bots: REC.bots, frames: REC.frames, shots: REC.shots }; }
// ---------- sharing replays: upload to this server for a link, or save / open a .rbreplay file ----------
async function replayPack(R) {
  const json = JSON.stringify({ v: 1, game: BC_VERSION, meta: R.meta, bots: R.bots.map(b => b.me && b.name === 'You' ? { ...b, name: cleanName(NET.name || '') || 'Pilot' } : b), frames: R.frames, shots: R.shots });
  return new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
async function replayUnpack(buf) {
  let R; try { R = JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()); } catch (e) { throw new Error('That is not a RoboBlocks replay.'); }
  if (!R || !R.meta || !MAPS[R.meta.map] || !Array.isArray(R.bots) || !Array.isArray(R.frames) || R.frames.length < 2 || !Array.isArray(R.shots)) throw new Error('That is not a RoboBlocks replay.');
  R.bots = R.bots.slice(0, 64).map(b => ({ design: b.design, team: b.team | 0, name: cleanName(String(b.name || '')) || 'Pilot', me: false }));
  R.shots = R.shots.filter(x => Array.isArray(x) && WEAPONS[x[2]] && R.bots[x[1]]);
  return R;
}
const replayCanUpload = () => !onClaudePage() && /^https?:$/.test(location.protocol) && BE.kind === 'server';
function replayBox(html) {
  let el = $('#shareBox'); if (!el) { el = document.createElement('div'); el.id = 'shareBox'; el.className = 'panel'; document.body.appendChild(el); }
  el.innerHTML = `<button class="x" title="Close">✕</button>${html}`; el.hidden = false; el.querySelector('.x').onclick = () => { el.hidden = true; };
  return el;
}
async function shareReplay() {
  const R = LAST_REPLAY.data; if (!R) { toast('No replay yet. Finish a battle first.'); return; }
  if (RP.on) RP.playing = false;
  const el = replayBox(`<b>Share replay</b><p>${replayCanUpload() ? 'Uploading…' : 'Save the replay as a file and send it to a friend. They open it from Last replay, Open replay file.'}</p><div class="btns"><button id="shSave">Save replay file</button></div>`);
  let data; try { data = await replayPack(R); } catch (e) { el.querySelector('p').textContent = 'Could not pack the replay: ' + e.message; return; }
  el.querySelector('#shSave').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' })); a.download = `roboblocks-${R.meta.map}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.rbreplay`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  if (!replayCanUpload()) return;
  try {
    const r = await fetch('/replay', { method: 'POST', body: data, headers: { 'Content-Type': 'application/octet-stream' } }), j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(j.e || 'The server said no (' + r.status + ').');
    const link = location.origin + '/#replay=' + j.id; LAST_REPLAY.link = link;
    el.querySelector('p').innerHTML = `Anyone with this link can watch it, in a browser or the RoboBlocks app:<input id="shLink" readonly>`;
    const inp = el.querySelector('#shLink'); inp.value = link; inp.onclick = () => inp.select();
    const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Copy link'; el.querySelector('.btns').prepend(b);
    b.onclick = async () => { try { await navigator.clipboard.writeText(link); b.textContent = 'Copied'; } catch (e) { inp.select(); document.execCommand('copy'); b.textContent = 'Copied'; } };
  } catch (e) { el.querySelector('p').textContent = 'Could not upload: ' + e.message + ' You can still save it as a file.'; }
}
function openReplayFile() {
  const f = document.createElement('input'); f.type = 'file'; f.accept = '.rbreplay,application/octet-stream';
  f.onchange = async () => { const file = f.files && f.files[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) { toast('That file is too large.'); return; } try { LAST_REPLAY.data = await replayUnpack(await file.arrayBuffer()); LAST_REPLAY.link = ''; const b = $('#shareBox'); if (b) b.hidden = true; startReplay(); } catch (e) { toast(e.message); } };
  f.click();
}
function showReplayMenu() {
  const R = LAST_REPLAY.data;
  const el = replayBox(`<b>Replays</b><p>${R ? `Your last battle: ${esc(MODES[R.meta.mode] ? MODES[R.meta.mode].name : R.meta.mode)} on ${esc(MAPS[R.meta.map].name)}, ${Math.round(R.frames[R.frames.length - 1].t / 60)} min.` : 'Finish a battle to record a replay, or open one a friend sent you.'}</p><div class="btns">${R ? '<button class="primary" id="rmWatch">Watch</button><button id="rmShare">Share</button>' : ''}<button id="rmOpen">Open replay file</button></div>`);
  if (R) { el.querySelector('#rmWatch').onclick = () => { el.hidden = true; startReplay(); }; el.querySelector('#rmShare').onclick = shareReplay; }
  el.querySelector('#rmOpen').onclick = openReplayFile;
}
// a #replay=<id> link: fetch it from this server and play it
async function replayHashCheck() {
  const id = (location.hash.match(/^#replay=([a-z0-9]{10})$/) || [])[1]; if (!id) return;
  history.replaceState(null, '', location.pathname);
  toast('Loading replay…');
  try { const r = await fetch('/replay/' + id); if (!r.ok) throw new Error(r.status === 404 ? 'That replay is no longer on this server.' : 'Could not load the replay.'); LAST_REPLAY.data = await replayUnpack(await r.arrayBuffer()); LAST_REPLAY.link = location.origin + '/#replay=' + id; startReplay(); }
  catch (e) { toast(e.message); }
}
if (!HEADLESS) { const rpWait = () => { if (typeof state !== 'undefined' && state === 'menu' && window.__sfa && $('#menu') && !$('#menu').hidden) replayHashCheck(); else setTimeout(rpWait, 800); }; setTimeout(rpWait, 1500); addEventListener('hashchange', () => { if (/^#replay=/.test(location.hash) && state === 'menu') replayHashCheck(); }); }
const RP = { on: false, t: 0, speed: 1, playing: true, bots: [], si: 0, follow: 0 };
function startReplay() {
  const R = LAST_REPLAY.data; if (!R) { toast('No replay yet. Finish a battle first.'); return; }
  hideOverlay(); leaveBattle(); clearBattle();
  setupArena(R.meta.map, R.meta.tod, R.meta.size || "medium"); world.wxK = R.meta.wx; startWeather();
  match = { mode: R.meta.mode, mapId: R.meta.map, n: R.meta.n, score: [0, 0], limit: 0, time: 0, over: false, net: false, isHost: false, spectator: true, replay: true, dmgScale: 1, rx: [1, 1], rxMax: 1, player: null };
  RP.bots = R.bots.map((b, i) => { const bot = new Bot(b.design, b.team, b.name, { remote: true, netId: 'r' + i }); bot.build(); bot.dead = true; return bot; });
  match.player = new Bot(R.bots[0].design, 0, 'You', { player: true }); match.player.build(); match.player.dead = true; match.player.respawnT = Infinity;
  world.bots = RP.bots.slice(); RP.on = true; RP.t = 0; RP.si = 0; RP.speed = 1; RP.playing = true; RP.follow = Math.max(0, R.bots.findIndex(b => b.me));
  state = 'replay'; $('#menu').hidden = true; $('#garage').hidden = true; $('#hud').hidden = true; $('#replayBar').hidden = false;
  $('#rpSlider').max = Math.floor(R.frames[R.frames.length - 1].t * 10); Music.play('battle');
}
function stopReplay() { RP.on = false; $('#replayBar').hidden = true; { const b = $('#shareBox'); if (b) b.hidden = true; } clearBattle(); match = null; toMenu(); }
const _rpA = new T.Vector3();
function updateReplay(dt) {
  const R = LAST_REPLAY.data; if (!R) return;
  const end = R.frames[R.frames.length - 1].t;
  const now = performance.now(), rdt = Math.min(.25, (now - (RP.last || now)) / 1000); RP.last = now; // real time, so slow machines keep pace
  if (RP.playing) RP.t = Math.min(end, RP.t + rdt * RP.speed);
  // find the frames around now
  let i = Math.max(0, R.frames.findIndex(f => f.t > RP.t) - 1); if (i < 0) i = R.frames.length - 2;
  const f0 = R.frames[i], f1 = R.frames[Math.min(R.frames.length - 1, i + 1)], k = f1.t > f0.t ? clamp((RP.t - f0.t) / (f1.t - f0.t), 0, 1) : 0;
  RP.bots.forEach((b, j) => {
    const s0 = f0.s[j], s1 = f1.s[j] || s0;
    if (!s0) { if (!b.dead) { b.dead = true; explosion(b.center.clone(), true); world.scene.remove(b.group); } return; }
    if (b.dead || RP.rebuild) { if (!b.dead) world.scene.remove(b.group); b.dead = false; b.build(); world.scene.add(b.group); for (const c of b.cellList) if (!maskAlive(s0[6], c.idx)) c.alive = false; }
    b.pos.set(lerp(s0[0], s1[0], k), lerp(s0[1], s1[1], k), lerp(s0[2], s1[2], k)); b.yaw = s0[3] + wrapA(s1[3] - s0[3]) * k; b.pitch = lerp(s0[4], s1[4], k); b.roll = lerp(s0[5], s1[5], k);
    const m = s0[6]; for (const c of b.cellList) { const al = maskAlive(m, c.idx); if (c.alive && !al) { b.destroyCell(c); b.needCheck = false; } }
    b.updateTransform();
  });
  RP.rebuild = false; match.score = f0.sc || [0, 0];
  // shots in this window
  while (RP.si < R.shots.length && R.shots[RP.si][0] <= RP.t) {
    const s = R.shots[RP.si++], o = RP.bots[s[1]]; if (!o || o.dead || RP.t - s[0] > .5) continue;
    fireWeapon(o, s[2], new T.Vector3(s[3], s[4], s[5]), new T.Vector3(s[6], s[7], s[8]));
  }
  if (RP.si > 0 && R.shots[RP.si - 1] && R.shots[RP.si - 1][0] > RP.t + 1) RP.si = 0; // went back in time
  updateProjectiles(dt * (RP.playing ? RP.speed : 0)); updateDebris(dt); updateParticles(dt); updateFlashes(dt); fxUpdate(dt);
  // follow camera
  const tb = RP.bots[RP.follow] && !RP.bots[RP.follow].dead ? RP.bots[RP.follow] : RP.bots.find(b => !b.dead);
  if (tb) { cam.spect = tb; } cam.deathT = 99; updateCamera(dt);
  renderBatches();
  $('#rpSlider').value = Math.floor(RP.t * 10); $('#rpTime').textContent = `${Math.floor(RP.t / 60)}:${String(Math.floor(RP.t % 60)).padStart(2, '0')} / ${Math.floor(end / 60)}:${String(Math.floor(end % 60)).padStart(2, '0')}`;
  $('#rpWho').textContent = tb ? `Following ${tb.name}` : '';
}
(() => {
  if (HEADLESS) return;
  $('#rpPlay').onclick = () => { RP.playing = !RP.playing; $('#rpPlay').textContent = RP.playing ? '❚❚' : '▶'; };
  $('#rpSpeed').onclick = () => { RP.speed = RP.speed >= 4 ? .5 : RP.speed * 2; $('#rpSpeed').textContent = RP.speed + '×'; };
  $('#rpNext').onclick = () => { for (let k = 1; k <= RP.bots.length; k++) { const j = (RP.follow + k) % RP.bots.length; if (!RP.bots[j].dead) { RP.follow = j; break; } } };
  $('#rpShare').onclick = () => shareReplay();
  $('#rpExit').onclick = stopReplay;
  let drag = null; // drag to turn the replay camera
  canvas.addEventListener('pointerdown', e => { if (state === 'replay') drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointermove', e => { if (state !== 'replay' || !drag) return; cam.yaw -= (e.clientX - drag.x) * .005; cam.pitch = clamp(cam.pitch - (e.clientY - drag.y) * .005, -.75, .7); drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', () => { drag = null; });
  $('#rpSlider').oninput = () => { RP.t = +$('#rpSlider').value / 10; RP.si = 0; RP.rebuild = true; const R = LAST_REPLAY.data; while (RP.si < R.shots.length && R.shots[RP.si][0] < RP.t - .2) RP.si++; };
})();
