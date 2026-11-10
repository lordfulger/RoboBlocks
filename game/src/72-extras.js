// ================= QUICK PLAY, DAMAGE NUMBERS, HIT DIRECTION, MEDALS, REPLAYS =================
// ---------- quick play: the fullest server that suits you ----------
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
  if (!cand.length) { showLobby(); toast('No open server fits right now. Pick one, or host a custom game.'); return; }
  toast(`Joining ${cand[0].s.name}.`); joinGame(cand[0].s.id, cand[0].s, null);
}
// ---------- floating damage numbers ----------
const DMGN = { pool: [], acc: new Map() };
function dmgNumber(victim, amt) {
  if (HEADLESS || !victim || amt <= 0) return;
  const a = DMGN.acc.get(victim) || { amt: 0, t: 0 }; a.amt += amt; DMGN.acc.set(victim, a);
}
function updateDmgNumbers(dt) {
  if (HEADLESS) return;
  const box = $('#dmgNums'); if (!box) return;
  for (const [v, a] of DMGN.acc) { a.t += dt; if (a.t < .22 && a.amt < 2000) continue; DMGN.acc.delete(v); if (v.dead && a.amt < 1) continue;
    let el = DMGN.pool.find(x => x.life <= 0); if (!el) { if (DMGN.pool.length > 30) continue; el = { div: document.createElement('div'), life: 0 }; el.div.className = 'dn'; box.appendChild(el.div); DMGN.pool.push(el); }
    el.div.textContent = Math.round(a.amt).toLocaleString(); el.div.classList.toggle('big', a.amt > 900); el.pos = v.center.clone().add(new T.Vector3(rand(-1, 1), v.height * .5 + rand(.5, 1.5), rand(-1, 1))); el.life = 1.1; el.div.style.display = 'block'; }
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
function stopReplay() { RP.on = false; $('#replayBar').hidden = true; clearBattle(); match = null; toMenu(); }
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
  $('#rpExit').onclick = stopReplay;
  let drag = null; // drag to turn the replay camera
  canvas.addEventListener('pointerdown', e => { if (state === 'replay') drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointermove', e => { if (state !== 'replay' || !drag) return; cam.yaw -= (e.clientX - drag.x) * .005; cam.pitch = clamp(cam.pitch - (e.clientY - drag.y) * .005, -.75, .7); drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', () => { drag = null; });
  $('#rpSlider').oninput = () => { RP.t = +$('#rpSlider').value / 10; RP.si = 0; RP.rebuild = true; const R = LAST_REPLAY.data; while (RP.si < R.shots.length && R.shots[RP.si][0] < RP.t - .2) RP.si++; };
})();
