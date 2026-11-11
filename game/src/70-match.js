// ================= MATCH =================
let state = 'boot', paused = false, match = null, clock = 0;
const keys = {}; let mouseDown = false;
const cam = { yaw: 0, pitch: -.12, shake: 0, target: new T.Vector3(), deathT: 0, spect: null };
const hudFx = { dmg: 0 };
let setupSel = Object.assign({ mode: 'tdm', map: 'dust', smap: 'random', size: 'auto', n: 20 }, store.get('sfa.setup', {}));
function spawnPoint(team) {
  if (world.space) { const bz = team === 0 ? -world.spawnZ : world.spawnZ; for (let i = 0; i < 30; i++) { const p = new T.Vector3(rand(-40, 40), rand(35, 75), bz + rand(-20, 20)); if (!sphereAt(p, 8) && world.bots.every(b => b.dead || b.pos.distanceTo(p) > 10)) return p; } return new T.Vector3(rand(-40, 40), 55, bz); }
  if (match && match.mode === 'pit') { // anywhere, away from everyone else
    const B = world.bound - 40;
    for (let i = 0; i < 40; i++) { const p = new T.Vector3(rand(-B, B), 0, rand(-B, B)); if (world.liquid && bedH(p.x, p.z) < world.liquid.y + 1) continue; if (rocksAt(p.x, p.z).some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.cr + 6)) continue; if (world.bots.every(b => b.dead || Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > 45)) return p; }
    return new T.Vector3(rand(-B, B), 0, rand(-B, B));
  }
  const bz = team === 0 ? -world.spawnZ : world.spawnZ;
  for (let i = 0; i < 30; i++) {
    const p = new T.Vector3(rand(-42, 42), 0, bz + rand(-22, 22));
    if (world.bots.every(b => b.dead || Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > 10)) return p;
  }
  return new T.Vector3(rand(-46, 46), 0, bz + rand(-24, 24));
}
function clearBattle() {
  if (!world.scene) return;
  for (const b of world.bots) if (b.group) world.scene.remove(b.group);
  for (const d of world.debris) world.scene.remove(d.obj);
  for (const f of world.flashes) world.scene.remove(f.m);
  for (const b of world.beams) world.scene.remove(b.m);
  world.bots = []; world.projs = []; world.debris = []; world.flashes = []; world.beams = [];
  if (world.P) world.P.n = 0;
  for (const b of batches.values()) { b.n = 0; b.im.count = 0; }
  fxClearBattle();
  $('#feed').innerHTML = '';
}
function enemyArch(rnd, lv) {
  if (world.space) { const sp = ['hover', 'hover', 'heli']; if (lv >= 5) sp.push('heli', 'missile'); if (lv >= 6) sp.push('plane', 'plane'); const a = sp[rnd() * sp.length | 0]; return a === 'missile' ? 'hover' : a; }
  const pool = ['car', 'car'];
  if (lv >= 2) pool.push('hover', 'hover', 'brawler');
  if (lv >= 3) pool.push('mortar', 'jumper', 'medic', 'tank');
  if (lv >= 4) pool.push('plasma', 'chain');
  if (lv >= 5) pool.push('sniper', 'flak', 'heli', 'heli');
  if (lv >= 6) pool.push('missile', 'missile', 'plane', 'plane');
  if (lv >= 7) pool.push('walker', 'walker');
  return pool[rnd() * pool.length | 0];
}
function startBattle(opts) {
  const mode = opts.mode, net = opts.net || null;
  leaveGarageTools();
  const v = net && net.spectator ? { ok: true } : deployBay(mode) !== bayIdx ? { ok: true } : validateDesign(); if (!v.ok) { toast(v.msg); return; }
  const isSpace = id => !!(MAPS[id] && MAPS[id].space);
  let mapId = mode === 'space' ? (isSpace(opts.map) ? opts.map : isSpace(opts.smap) ? opts.smap : pickMap(SPACE_ORDER)) : mode === 'test' ? (!world.mapId || isSpace(world.mapId) ? 'dust' : world.mapId) : opts.map === 'random' || !MAPS[opts.map] || isSpace(opts.map) ? pickMap(MAP_ORDER) : opts.map;
  const mapSz = mode === 'test' ? (world.mapSize || 'medium') : mapSizeOf(opts.size, mode === 'test' ? 1 : opts.n || 20);
  if (mode === 'space' && !(net && net.spectator) && !canFlyInSpace(computeStats(deployDesign(mode).blocks))) {
    if (!net) { toast('Space Battle is for flying bots. Add thrusters, jump jets, rotors, propellers or hover pads.'); return; }
    net.spectator = true; toast('Your bot cannot fly, so you are watching this Space Battle. Add thrusters, jets, rotors, propellers or hover pads to join in.');
  }
  clearBattle();
  const wr = mulberry32(((net ? net.seed : (Math.random() * 1e9 | 0)) ^ 0x5eed) >>> 0), tods = MAP_TOD[mapId] || ['day'];
  let tod = mode === 'test' ? (world.tod || 'day') : tods[wr() * tods.length | 0], wxK = mode === 'test' ? (world.wxK == null ? .5 : world.wxK) : [0, .5, .5, 1][wr() * 4 | 0];
  if (opts.tod) tod = opts.tod; if (opts.wx != null) wxK = opts.wx;
  if (mode === 'brawl' && brawlById(net ? net.brawl : opts.brawl).tod) tod = brawlById(net ? net.brawl : opts.brawl).tod;
  if (world.mapId !== mapId || world.tod !== tod || world.mapSize !== mapSz) { setupArena(mapId, tod, mapSz); if (!HEADLESS) applyQuality(); } else resetBuildings();
  world.wxK = wxK; startWeather();
  const lv = net ? net.lv : level(), aiLv = clamp(lv + 1 + (net ? 0 : aiSkillShift()), 1, 10), budget = cpuMax(lv), aiTier = maxTier(clamp(lv + (net ? 0 : Math.min(0, aiSkillShift())), 1, 10));
  GRAV = MAPS[mapId] && MAPS[mapId].grav != null ? MAPS[mapId].grav : 22;
  const rnd = mulberry32(net ? net.seed : (Date.now() | 0));
  const names = PILOTS.slice(); for (let i = names.length - 1; i > 0; i--) { const j = rnd() * (i + 1) | 0; [names[i], names[j]] = [names[j], names[i]]; }
  const N = mode === 'test' ? 1 : opts.n || 20;
  const limit = modeLimit(mode, N) || (mode === 'tdm' || mode === 'space' ? ({ 5: 20, 10: 50, 20: 100 }[N] || 20) : mode === 'arena' ? ({ 5: 800, 10: 1200, 20: 1500 }[N] || 1000) : mode === 'pit' ? ({ 5: 12, 10: 18, 20: 25 }[N] || 15) : 0);
  match = { dmgScale: tierScale(unlockLv()), mode, mapId, mapSize: mapSz, n: N, score: [0, 0], limit, time: modeTime(mode) || (mode === 'elim' ? 7 : 10) * 60, aiLv, over: false, endT: 0, winner: null, player: null, tick: 0, net: !!net, isHost: !net || net.isHost, spectator: !!(net && net.spectator) };
  const player = new Bot(deployDesign(mode), net ? net.myTeam : 0, 'You', { player: true, human: true, netId: net ? net.me : 'me' }); match.player = player; player.bay = deployBay(mode); LOADOUT.next = null; if (net && !net.spectator) { const d = player.design; setTimeout(() => slowPresenceDesign(d), 0); } // the bay this mode allows may differ from what we last sent (after setup: presence updates re-sync the roster)
  if (net && net.spectator) { player.build(); player.dead = true; player.respawnT = Infinity; } else world.bots.push(player);
  modeSetup(opts, net);
  if (mode !== 'test') {
    const tierFor = () => Math.max(1, aiTier - (rnd() < .35 ? 1 : 0));
    const pit = mode === 'pit', horde = mode === 'horde', ai = net ? net.ai : pit ? [N * 2 - 1, 0] : horde ? [hordeSquad(N) - 1, 0] : [N - 1, N], owned = !net || net.isHost;
    if (net) for (const h of net.humans) world.bots.push(new Bot(h.design, h.team, h.name, { remote: true, human: true, netId: h.id }));
    let k = 0;
    for (const team of [0, 1]) for (let i = 0; i < ai[team]; i++, k++) {
      const d = addAiExtras(genDesign(rnd, budget * (team === 0 ? lerp(.75, 1, rnd()) : lerp(.72, .98, rnd()) * (net ? 1 : aiBudgetMul())), enemyArch(rnd, aiLv), undefined, tierFor()), rnd, aiLv);
      world.bots.push(new Bot(d, pit ? 100 + k : team, names.pop() || 'Bot ' + k, { ai: owned, remote: !owned, netId: 'a' + k }));
    }
    if (horde) { for (const b of hordePool(rnd, budget, Math.max(1, aiLv - 1), names, k)) { if (!owned) { b.remote = true; b.brain = null; } world.bots.push(b); } hordeStart(world.bots.filter(b => b.human).length); }
    for (const b of world.bots) if (!b.remote && !b.bench) b.spawn(spawnPoint(b.team), pit ? rand(0, 6.28) : b.team === 0 ? 0 : Math.PI);
  } else {
    player.spawn(spawnPoint(0), 0);
    const spots = [[-28, 65], [0, 85], [28, 65], [0, 135], [-60, 110], [60, 110]];
    spots.forEach(([x, z], i) => {
      const d = new Bot(genDesign(mulberry32(100 + i), 150 + i * 30, ['car', 'hover', 'tank', 'heli', 'car', 'hover'][i]), 1, 'Target ' + (i + 1), { dummy: true, home: new T.Vector3(x, 0, -world.spawnZ + z) });
      world.bots.push(d); d.spawn(d.home, Math.PI);
    });
  }
  for (const p of world.points) { p.owner = -1; p.prog = 0; p.group.visible = mode === 'arena' || p === match.hill; paintPoint(p); }
  resetReactors();
  player.input.weapon = WTYPES.find(t => player.guns[t].length) || 'blaster';
  resetPlayerWeapons(player);
  cam.target.copy(player.center); cam.spect = null; cam.floor = null; clock = 0;
  state = 'battle';
  $('#garage').hidden = true; $('#menu').hidden = true; $('#hud').hidden = false;
  $('#goal').textContent = modeGoalText(mode, N, limit) || (mode === 'test' ? 'TEST DRIVE' : mode === 'space' ? `SPACE · FIRST TO ${limit}` : mode === 'pit' ? `THE PIT · ${limit} KILLS` : mode === 'tdm' ? `${N}V${N} · FIRST TO ${limit}` : mode === 'arena' ? `${limit} OPENS REACTOR` : `${N}V${N} · ELIMINATION`);
  $('#scorebar').style.visibility = mode === 'test' ? 'hidden' : 'visible';
  $('#hud').classList.toggle('spec', match.spectator);
  $('#points').hidden = !activePoints().length; $('#modeHud').hidden = !(mode === 'ctc' || mode === 'horde');
  $('#fuelRow').hidden = !player.stats.jets;
  buildWeaponHud(); buildPointsHud();
  updateCamera(.016); renderBatches();
  Music.play('battle'); SFX.ambientStart(mapId); SFX.engineStart();
  if (match.spectator) { paused = false; hideOverlay(); } else showDeploy();
  recStart();
}
function paintPoint(p) {
  const col = p.owner === 0 ? 0x4fb0ff : p.owner === 1 ? 0xff5444 : 0xd8d8d8;
  p.mat.emissive.setHex(col); p.ringM.color.setHex(col); p.fill.material.color.setHex(col);
}
function onKill(killer, victim) {
  if (!match) return;
  if (killer && killer.team !== victim.team) {
    killer.kills++; statKill(killer);
    if (!match.over && match.isHost) { if (match.mode === 'tdm' || match.mode === 'space' || match.mode === 'brawl') match.score[killer.team]++; else if (match.mode === 'pit') { /* kills tally on the bot itself */ } else if (match.mode === 'arena') match.score[killer.team] = Math.min(match.limit, match.score[killer.team] + 3); }
    if (killer.isPlayer) { progress.kills = (progress.kills || 0) + 1; SFX.kill(); }
  }
  const row = document.createElement('div');
  const kn = killer ? killer.name : (world.liquid && world.liquid.type === 'lava' ? 'Lava' : 'Wreckage');
  const kc = killer ? (killer.isPlayer ? 'Y' : killer.team === 0 ? 'A' : 'E') : '';
  const vc = victim.isPlayer ? 'Y' : victim.team === 0 ? 'A' : 'E';
  const a = document.createElement('span'); a.className = kc; a.textContent = kn;
  const b = document.createElement('span'); b.className = vc; b.textContent = victim.name;
  row.append(a, document.createTextNode('  ▸  '), b);
  $('#feed').prepend(row); setTimeout(() => row.remove(), 6000);
  while ($('#feed').children.length > 6) $('#feed').lastChild.remove();
  if (victim.isPlayer) { cam.deathT = 0; cam.deathPos = victim.center.clone(); cam.killer = killer; }
  if (killer && killer.isPlayer) toastCenter(`Destroyed ${victim.name}`, 1.4);
  checkEnd();
}
function checkEnd() {
  if (match.over || match.mode === 'test' || !match.isHost) return;
  if (match.mode === 'tdm' || match.mode === 'space' || match.mode === 'brawl') { if (match.score[0] >= match.limit || match.score[1] >= match.limit) endMatch(match.score[0] >= match.score[1] ? 0 : 1); }
  if (match.mode === 'elim') { const a = aliveCount(0), e = aliveCount(1); match.score = [a, e]; if (!a || !e) endMatch(a ? 0 : e ? 1 : -1); }
  if (match.mode === 'pit') { const top = pitLeader(); if (HEADLESS && top) match.score = [top.kills, 0]; if (top && top.kills >= match.limit) endMatch(top.team); }
}
const pitLeader = () => world.bots.reduce((best, b) => !best || b.kills > best.kills ? b : best, null);
const aliveCount = team => world.bots.reduce((n, b) => n + (b.team === team && !b.dead ? 1 : 0), 0);
let centerMsgT = 0;
function toastCenter(html, t) { $('#centerMsg').textContent = html; centerMsgT = t; }
function endMatch(winner) {
  match.over = true; match.winner = winner; match.endT = 3.5;
  const mine = match.player ? match.player.team : 0;
  $('#centerMsg').textContent = match.spectator ? (winner === -1 ? 'DRAW' : 'MATCH OVER') : winner === mine ? 'VICTORY' : winner === -1 ? 'DRAW' : 'DEFEAT'; centerMsgT = 3.5;
  if (!HEADLESS && !match.spectator && match.mode !== 'test') Music.sting(winner === mine);
}
function finishMatch() {
  recStop();
  if (HEADLESS && match.net && match.isHost && window.__BC_REPORT && !match.reported) { // tell the dedicated server who did what
    match.reported = true;
    const humans = world.bots.filter(b => b.human && b.remote).map(b => { const pr = NET.slowPeers.find(x => x.peer === b.netId); return { acct: pr && pr.presence && pr.presence.acct || null, team: b.team, kills: b.kills | 0, deaths: b.deaths | 0, dmg: Math.round(b.dmgDealt || 0), healed: Math.round(b.healed || 0) }; });
    const weapons = {}, movers = {};
    try {
    for (const b of world.bots) { if (b.qs) for (const [w, v] of Object.entries(b.qs.dmgW)) weapons[w] = (weapons[w] || 0) + Math.round(v); const mv = b.mob ? (b.mob.mode === 'leg' ? 'legs' : b.mob.mode) : 'none'; const o = movers[mv] || (movers[mv] = { played: 0, won: 0 }); o.played++; if (b.team === match.winner) o.won++; }
    } catch (e) { console.error('match stats', e && e.message); }
    window.__BC_REPORT({ mode: match.mode, map: match.mapId, winner: match.winner, humans, weapons, movers, secs: Math.round((match.mode === 'elim' ? 420 : 600) - match.time) });
  }
  if (match.spectator) {
    if (document.pointerLockElement) document.exitPointerLock();
    const w = match.winner;
    const pitTop = match.mode === 'pit' ? pitLeader() : null;
    showOverlay(`<h2>${pitTop ? esc(pitTop.name) + ' wins' : w === 0 ? 'Blue team wins' : w === 1 ? 'Red team wins' : 'Draw'}</h2><p>${MODES[match.mode].name} on ${MAPS[match.mapId].name} · final score <b class="num">${match.score[0]} – ${match.score[1]}</b></p><p id="nextIn" class="next"></p><div class="btns"><button class="primary" id="ovLobby">Leave to lobby</button></div>`);
    $('#ovLobby').onclick = () => { hideOverlay(); toMenu(); showLobby(); }; match.done = true; return;
  }
  const p = match.player, win = match.winner === p.team;
  const xp = 80 + Math.round(p.dmgDealt / 12) + Math.round((p.healed || 0) / 10) + p.kills * 60 + (win ? 250 : match.winner === -1 ? 100 : 0);
  const before = level(), tpBefore = techEarned(); progress.xp += xp; progress.matches++; if (win) progress.wins++; if (!progress.remote) store.set('sfa.progress', progress);
  const result = win ? 'win' : match.winner === -1 ? 'draw' : 'loss';
  const srD = skillUpdate(win, match.winner === -1);
  if (match.mode !== 'test') beRecordMatch({ mode: match.mode, map: match.mapId, result, kills: p.kills, deaths: p.deaths, dmg: Math.round(p.dmgDealt), healed: Math.round(p.healed || 0), xp, net: match.net, server: NET.game && NET.game.server ? NET.game.server.name : '' });
  const after = level();
  const unlocked = PART_ORDER.filter(id => PARTS[id].lvl > before && PARTS[id].lvl <= after).map(id => PARTS[id].name)
    .concat(TIERS.filter(t => t && t.lvl > before && t.lvl <= after).map(t => `${t.name} armor (T${TIERS.indexOf(t)})`));
  if (document.pointerLockElement) document.exitPointerLock();
  SFX.engineUpdate(null, false); SFX.beamStop();
  const title = win ? 'Victory' : match.winner === -1 ? 'Draw' : 'Defeat';
  let html = `<h2 class="${win ? 'win' : match.winner === 1 ? 'lose' : ''}">${title}</h2>
    <p>${MODES[match.mode].name} on ${MAPS[match.mapId].name} · ${match.mode === 'pit' ? `winner <b>${esc((pitLeader() || { name: '?' }).name)}</b> with ${(pitLeader() || { kills: 0 }).kills} kills` : `final score <b class="num">${match.score[0]} – ${match.score[1]}</b>`}</p>
    <div class="grid"><div><span class="label">Kills</span><b class="num">${p.kills}</b></div><div><span class="label">Damage</span><b class="num">${Math.round(p.dmgDealt).toLocaleString()}</b></div><div><span class="label">${p.healed ? 'Repaired' : 'Deaths'}</span><b class="num">${p.healed ? Math.round(p.healed).toLocaleString() : p.deaths}</b></div></div>
    <p>+${xp} XP${BE.kind === 'server' && BE.me && match.net ? ' (confirmed by the server shortly)' : ''}${srD ? ` · skill ${mySR()} (${srD > 0 ? '+' : ''}${srD})` : ''}${after > before ? ` · <b style="color:var(--accent)">Pilot level ${after}</b>: CPU limit ${cpuMax(after)}, weapons Mk ${TIER_NAMES[after - 1]}` : ''}</p>`;
  if (unlocked.length) html += `<div class="unlock">Now available in the Tech Tree: ${unlocked.join(', ')}</div>`;
  { const tp = techEarned() - tpBefore; if (tp > 0) html += `<div class="unlock">+${tp} tech points${after > before ? ' for reaching level ' + after : ' for a new rank'}. You have ${techAvail()} to spend in the <a href="#" id="ovTech">Tech Tree</a>.</div>`; }
  html += medalsHtml() + surveyHtml();
  if (match.net) html += `<p id="nextIn" class="next"></p><div class="btns"><button class="primary" id="ovLobby">Leave to lobby</button><button id="ovMenu">Main menu</button></div>`;
  else html += `<div class="btns"><button class="primary" id="ovAgain">Battle again</button><button id="ovReplay">Watch replay</button><button id="ovGarage">Garage</button><button id="ovMenu">Main menu</button></div>`;
  showOverlay(html);
  if ($('#ovTech')) $('#ovTech').onclick = e => { e.preventDefault(); if (match.net) showTechTree('battle'); else { hideOverlay(); toMenu(); showTechTree('menu'); } };
  wireSurvey(match.mode, match.mapId);
  if (match.mode !== 'test') progMatchEnd(p, { result, mode: match.mode, map: match.mapId, xp }).then(notes => { if (!notes.length || !$('#ovBox')) return; const d = document.createElement('div'); d.className = 'unlock'; d.innerHTML = notes.map(esc).join('<br>'); const b = $('#ovBox .btns'); if (b) b.before(d); }).catch(() => { });
  if (match.net) { $('#ovLobby').onclick = () => { hideOverlay(); toMenu(); showLobby(); }; $('#ovMenu').onclick = () => { hideOverlay(); toMenu(); }; match.done = true; return; }
  $('#ovAgain').onclick = () => { hideOverlay(); leaveBattle(); startBattle(setupSel); };
  $('#ovReplay').onclick = () => startReplay();
  $('#ovGarage').onclick = () => { hideOverlay(); toGarage(); };
  $('#ovMenu').onclick = () => { hideOverlay(); toMenu(); };
  match.done = true;
}
function leaveBattle() {
  touchReset();
  if (document.pointerLockElement) document.exitPointerLock();
  clearBattle(); match = null; paused = false; mouseDown = false;
  if (NET.game) netLeave();
  SFX.engineUpdate(null, false); SFX.beamStop(); SFX.ambientStop();
  $('#hud').hidden = true; $('#lock').hidden = true;
}
function toGarage() {
  leaveBattle(); state = 'garage'; LOADOUT.bay = null; // the bay open in the garage is what you deploy next
  $('#menu').hidden = true; $('#garage').hidden = false; hideOverlay(); syncTopH();
  garage.group.rotation.y = 0;
  buildPartsUI(); buildBaysUI(); buildFinishUI(); updateStats(); Music.play('garage'); techBadge();
  if (needBeginnerPick()) showBeginnerPick(() => { if (!TUT.on && !TUT.done && !progress.matches) tutStart(); });
  else if (!TUT.on && !TUT.done && !progress.matches) tutStart();
}
function leaveGarageTools() { if (PHOTO.on) photoMode(false); if (WEAK.on) weakSpots(false); if (garage.tool2) setTool2(garage.tool2); if (garage.layer != null) setLayer(null); hidePartCard(); }
function toMenu() {
  leaveGarageTools(); leaveBattle(); state = 'menu'; garage.orbit.tx = garage.orbit.tz = 0; garage.orbit.ty = 2.2;
  $('#garage').hidden = true; $('#menu').hidden = false; hideOverlay();
  garage.ghost.visible = garage.mirrorGhost.visible = false;
  buildPilotCard(); Music.play('menu');
}
function buildPilotCard() {
  const lv = level(), a = xpForLevel(lv), b = xpForLevel(lv + 1);
  $('#pcard').innerHTML = `<span class="label">Pilot rank</span><span class="lvl num">${lv}</span>
    <div class="bar"><i style="width:${lv >= 10 ? 100 : (progress.xp - a) / (b - a) * 100}%"></i></div>
    <div class="row"><span>XP</span><b class="num">${progress.xp.toLocaleString()}${lv < 10 ? ' / ' + b.toLocaleString() : ''}</b></div>
    <div class="row"><span>Wins</span><b class="num">${progress.wins} / ${progress.matches}</b></div>
    <div class="row"><span>Kills</span><b class="num">${progress.kills || 0}</b></div>
    <div class="row"><span>Tech points</span><b class="num">${techAvail()} to spend</b></div>
    <div class="row"><span>Skill rating</span><b class="num">${mySR()}</b></div>
    <div class="row"><span>Battle pass</span><b class="num">Tier ${bpTier()} / ${BP_TIERS}</b></div>
    ${myTitle() ? `<div class="row"><span>Title</span><b>${esc(myTitle())}</b></div>` : ''}
    <div class="row"><span>Armor tier</span><b>${TIERS[maxTier(lv)].name}</b></div>
    <div class="row"><span>Active bay</span><b id="pcBay"></b></div>
    ${BE.kind === 'server' ? `<div class="row"><span>Save data</span><b>${BE.me ? 'On this server' : (HOST ? 'This computer only' : 'This browser only')}</b></div><button id="pcAcct" class="acct">${BE.me ? '● ' + esc(BE.me.name) : 'Guest · Sign in to save on the server'}</button>` : BE.kind === 'artifact' ? '<div class="row"><span>Save data</span><b>This browser</b></div>' : '<div class="row"><span>Save data</span><b>This browser</b></div>'}`;
  if ($('#pcAcct')) $('#pcAcct').onclick = () => { SFX.ui(); showAccount(); };
  $('#mAdmin').hidden = !BE.admin; techBadge();
  $('#pcBay').textContent = design.name || 'Bay ' + (bayIdx + 1);
}
function showOverlay(html, wide) { $('#ovBox').innerHTML = html; $('#ovBox').classList.toggle('wide', !!wide); $('#overlay').hidden = false; }
function hideOverlay() { $('#overlay').hidden = true; }
const fine = matchMedia('(any-pointer: fine)').matches;
function showDeploy() {
  paused = true;
  const test = match.mode === 'test', M0 = MODES[match.mode];
  showOverlay(`<h2>${test ? 'Test drive' : M0.name}</h2>
    <p>${test ? 'Drive around and shoot the parked targets. Nothing here counts toward your record.' : `${MAPS[match.mapId].name}. ${match.n} bots per team. ${M0.desc}`}</p>
    ${controlsHtml()}
    ${fine ? '' : '<p style="color:var(--warn)">Battles need a keyboard and mouse.</p>'}
    <div class="btns"><button class="primary" id="ovGo">Deploy</button><button id="ovBack">Back to garage</button></div>`, true);
  $('#ovGo').onclick = () => { hideOverlay(); paused = false; lockPointer(); };
  $('#ovBack').onclick = () => toGarage();
}
function showPause() {
  if (!match || match.over) return;
  paused = true;
  showOverlay(`<h2>Paused</h2><p>${match.mode === 'test' ? 'Test drive.' : `${MODES[match.mode].name} · ${match.score[0]} – ${match.score[1]}`}${match.net ? '. Online battles keep going while you are paused.' : ''}</p>
    <div class="btns"><button class="primary" id="ovResume">Resume</button><button id="ovSet">Settings</button><button id="ovQuit">${match.mode === 'test' ? 'Back to garage' : 'Leave match'}</button></div>
    <div class="btns"><button id="ovBug">Report a bug</button>${match.net ? '<button id="ovRep">Report a player</button>' : ''}</div>`);
  $('#ovResume').onclick = () => { hideOverlay(); paused = false; lockPointer(); };
  $('#ovBug').onclick = showBugReport; if ($('#ovRep')) $('#ovRep').onclick = () => showReportPlayer();
  $('#ovSet').onclick = () => showSettings(showPause);
  $('#ovQuit').onclick = () => { if (match && match.net) toMenu(); else toGarage(); };
}
function optButtons(id, items, sel) { return `<div class="opts" id="${id}">${items.map(([k, name, blurb]) => `<button class="opt${k === sel ? ' sel' : ''}" data-k="${k}"><b>${name}</b><span>${blurb}</span></button>`).join('')}</div>`; }
// shared by Battle setup and Host custom game: mode, map (space maps for Space Battle), map size, team size
function mapOptsHtml() {
  const sp = setupSel.mode === 'space', list = sp ? SPACE_ORDER : MAP_ORDER;
  return optButtons('oMap', list.map(k => [k, MAPS[k].name, MAPS[k].blurb]).concat([['random', 'Random', sp ? 'Any space map.' : 'Pick one for me.']]), sp ? setupSel.smap : setupSel.map);
}
function setupOptsHtml(net) {
  return `<h3>MODE</h3>${optButtons('oMode', Object.entries(MODES).map(([k, m]) => [k, m.name, m.desc]), setupSel.mode)}
    <h3 id="oMapH">${setupSel.mode === 'space' ? 'SPACE MAP' : 'MAP'}</h3><div id="oMapBox">${mapOptsHtml()}</div>
    <h3>MAP SIZE</h3>${optButtons('oMsz', [['auto', 'Auto', 'Matches the team size.'], ...Object.entries(MAP_SIZES).map(([k, z]) => [k, z.name, z.blurb])], setupSel.size || 'auto')}
    <div id="oLoadBox">${loadoutOptsHtml(setupSel.mode)}</div>
    ${net ? `<h3>AI BOTS</h3>${optButtons('oAi', [['fill', 'Fill with AI', 'Empty slots get AI bots, so a match always has two full teams.'], ['none', 'Players only', 'No AI bots: just the pilots who join.']], setupSel.ai || 'fill')}` : ''}
    <h3>TEAM SIZE</h3>${optButtons('oSize', net ? [[5, '5 v 5', 'AI fills empty slots.'], [10, '10 v 10', 'AI fills empty slots.'], [20, '20 v 20', 'AI fills empty slots.']] : [[5, '5 v 5', 'Quick skirmish.'], [10, '10 v 10', 'Mid-size brawl.'], [20, '20 v 20', 'Full-scale war.']], setupSel.n)}`;
}
function wireSetupOpts() {
  const wire = (id, key, num, after) => document.querySelectorAll(`#${id} .opt`).forEach(b => b.onclick = () => { setupSel[key] = num ? +b.dataset.k : b.dataset.k; document.querySelectorAll(`#${id} .opt`).forEach(x => x.classList.toggle('sel', x === b)); SFX.ui(); if (after) after(); });
  const maps = () => { $('#oMapBox').innerHTML = mapOptsHtml(); $('#oMapH').textContent = setupSel.mode === 'space' ? 'SPACE MAP' : 'MAP'; wire('oMap', setupSel.mode === 'space' ? 'smap' : 'map'); };
  const loads = () => { $('#oLoadBox').innerHTML = loadoutOptsHtml(setupSel.mode); wireLoadoutOpts(); };
  wire('oMode', 'mode', false, () => { maps(); loads(); }); maps(); loads(); wire('oMsz', 'size'); wire('oSize', 'n', true); if ($('#oAi')) wire('oAi', 'ai');
}
function showSetup() {
  const v = validateDesign(); if (!v.ok) { toast(v.msg); return; }
  showOverlay(`<h2>Battle setup</h2><p>Deploying <b></b>.</p>
    ${setupOptsHtml(false)}
    <div class="btns"><button class="primary" id="ovDeploy">Deploy</button><button id="ovCancel">Cancel</button></div>`, true);
  $('#ovBox p b').textContent = (bays[deployBay(setupSel.mode)] || design).name || 'your bot';
  wireSetupOpts();
  $('#ovDeploy').onclick = () => { store.set('sfa.setup', setupSel); hideOverlay(); $('#loading') && 0; startBattle(setupSel); };
  $('#ovCancel').onclick = () => { hideOverlay(); if (state === 'menu') buildPilotCard(); };
}
function showSettings(back) {
  const pct = v => Math.round(v * 100) + '%';
  showOverlay(`<h2>Settings</h2>
    <div class="srow"><label for="sMaster">Master volume</label><input type="range" id="sMaster" min="0" max="1" step=".05" value="${settings.master}"><span class="num">${pct(settings.master)}</span></div>
    <div class="srow"><label for="sMusic">Music</label><input type="range" id="sMusic" min="0" max="1" step=".05" value="${settings.music}"><span class="num">${pct(settings.music)}</span></div>
    <div class="srow"><label for="sSfx">Effects</label><input type="range" id="sSfx" min="0" max="1" step=".05" value="${settings.sfx}"><span class="num">${pct(settings.sfx)}</span></div>
    <div class="srow"><label for="sSens">Mouse speed</label><input type="range" id="sSens" min=".3" max="2.5" step=".05" value="${settings.sens}"><span class="num">${settings.sens.toFixed(2)}×</span></div>
    <div class="srow"><span>Graphics</span><div class="seg" id="sQual"><button data-k="ultra" class="${settings.quality === 'ultra' ? 'sel' : ''}">Ultra</button><button data-k="high" class="${settings.quality === 'high' ? 'sel' : ''}">High</button><button data-k="low" class="${settings.quality !== 'high' ? 'sel' : ''}">Fast</button></div><span></span></div>
    <div class="srow"><span>Soft shadowing</span><div class="seg" id="sAo"><button data-k="1" class="${settings.ao === false ? '' : 'sel'}">On</button><button data-k="0" class="${settings.ao === false ? 'sel' : ''}">Off</button></div><span></span></div>
    <div class="srow"><span>Reflections</span><div class="seg" id="sRefl"><button data-k="1" class="${settings.reflections === false ? '' : 'sel'}">On</button><button data-k="0" class="${settings.reflections === false ? 'sel' : ''}">Off</button></div><span></span></div>
    <div class="srow"><span>Show chat</span><div class="seg" id="sChat"><button data-k="1" class="${CHAT.hidden ? '' : 'sel'}">On</button><button data-k="0" class="${CHAT.hidden ? 'sel' : ''}">Off</button></div><span></span></div>
    <div class="srow"><span>Robot detail</span><div class="seg" id="sDetail"><button data-k="high" class="${settings.detail !== 'low' ? 'sel' : ''}">High</button><button data-k="low" class="${settings.detail === 'low' ? 'sel' : ''}">Simple</button></div><span></span></div>
    <div class="srow"><span>Speed units</span><div class="seg" id="sUnits"><button data-k="mph" class="${settings.units !== 'kmh' ? 'sel' : ''}">mph</button><button data-k="kmh" class="${settings.units === 'kmh' ? 'sel' : ''}">km/h</button></div><span></span></div>
    <div class="srow"><span>Keys and gamepad</span><button id="sKeys">Controls…</button><span></span></div>
    <div class="srow"><span>Invert mouse Y</span><div class="seg" id="sInv"><button data-k="0" class="${settings.invertY ? '' : 'sel'}">Off</button><button data-k="1" class="${settings.invertY ? 'sel' : ''}">On</button></div><span></span></div>
    <p style="font-size:13px">Ultra adds full-resolution rendering, light shafts, film grain and the sharpest, widest shadows. High adds glow, soft shadowing, reflections and sharper shadows. Fast is smoother on older computers. Shadowing and reflections only apply on High. Press F3 in game to see your frame rate.</p>
    <div class="btns"><button class="primary" id="ovDone">Done</button></div>`);
  const slide = (id, key, fmt) => { const el = $('#' + id); el.oninput = () => { settings[key] = +el.value; el.nextElementSibling.textContent = fmt(settings[key]); saveSettings(); SFX.apply(); }; };
  slide('sMaster', 'master', pct); slide('sMusic', 'music', pct); slide('sSfx', 'sfx', pct); slide('sSens', 'sens', v => v.toFixed(2) + '×');
  document.querySelectorAll('#sQual button').forEach(b => b.onclick = () => { settings.quality = b.dataset.k; saveSettings(); applyQuality(); document.querySelectorAll('#sQual button').forEach(x => x.classList.toggle('sel', x === b)); });
  document.querySelectorAll('#sInv button').forEach(b => b.onclick = () => { settings.invertY = b.dataset.k === '1'; saveSettings(); document.querySelectorAll('#sInv button').forEach(x => x.classList.toggle('sel', x === b)); });
  for (const [id, key] of [['#sAo', 'ao'], ['#sRefl', 'reflections']]) document.querySelectorAll(id + ' button').forEach(b => b.onclick = () => { settings[key] = b.dataset.k === '1'; saveSettings(); document.querySelectorAll(id + ' button').forEach(x => x.classList.toggle('sel', x === b)); });
  document.querySelectorAll('#sChat button').forEach(b => b.onclick = () => { CHAT.hidden = b.dataset.k === '0'; store.set('sfa.chatOff', CHAT.hidden); document.querySelectorAll('#sChat button').forEach(x => x.classList.toggle('sel', x === b)); });
  $('#ovDone').onclick = () => { if (back) back(); else { hideOverlay(); if (state === 'menu') buildPilotCard(); } };
  $('#sKeys').onclick = () => showControls(() => showSettings(back));
  document.querySelectorAll('#sUnits button').forEach(b => b.onclick = () => { settings.units = b.dataset.k; saveSettings(); document.querySelectorAll('#sUnits button').forEach(x => x.classList.toggle('sel', x === b)); if (state === 'garage') updateStats(); });
  document.querySelectorAll('#sDetail button').forEach(b => b.onclick = () => { settings.detail = b.dataset.k; saveSettings(); document.querySelectorAll('#sDetail button').forEach(x => x.classList.toggle('sel', x === b)); if (state === 'garage') { gLoad(gSerialize()); } toast(b.dataset.k === 'low' ? 'Simple robot models: faster on older computers.' : 'Detailed robot models.'); });
}
function applyQuality() {
  renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight); post.resize();
  renderer.shadowMap.type = hiQ() ? T.PCFSoftShadowMap : T.PCFShadowMap; renderer.shadowMap.needsUpdate = true;
  // Fast: simpler far bots sooner, smaller shadow maps
  LOD_D2 = ultraQ() ? 250 * 250 : hiQ() ? 170 * 170 : 95 * 95;
  if (world.sun) { const ext = ultraQ() ? 120 : 85; Object.assign(world.sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext }); world.sun.shadow.camera.updateProjectionMatrix(); const sz = ultraQ() ? 4096 : hiQ() ? 2048 : 1024; if (world.sun.shadow.mapSize.x !== sz) { world.sun.shadow.mapSize.set(sz, sz); if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; } } }
}
function showHelp() {
  showOverlay(`<h2>How to play</h2>
    <p>Build a bot in the garage from blocks, wheels and guns, then fight for your team. Every block has its own health. Shots chew through armor; anything cut off from the Pilot Seat falls away. Lose the seat, or most of your blocks, and your bot is wrecked.</p>
    <p>Levelling up and achievements earn <b>tech points</b>. Spend them in the <b>Tech Tree</b> to unlock parts, armor tiers, materials and CPU Cores: each node grows from the one before it and needs a minimum pilot level. Weapon marks rise with your level on their own. CPU limits how much you can fit on a bot. Five garage bays hold five designs.</p>
    ${controlsHtml()}
    <div class="btns"><button class="primary" id="ovDone">Got it</button></div>`, true);
  $('#ovDone').onclick = () => { hideOverlay(); if (state === 'menu') buildPilotCard(); };
}
$('#mPlay').onclick = () => { SFX.init(); SFX.ui(); showSetup(); };
$('#mQuick').onclick = () => { SFX.init(); SFX.ui(); quickPlay(); };
$('#mReplay').onclick = () => { SFX.init(); SFX.ui(); startReplay(); };
$('#mOnline').onclick = () => { SFX.init(); SFX.ui(); if (NET.requireAccount && !BE.me) { toast('This server needs an account. Sign in or create one.'); showAccount(() => { if (BE.me) showLobby(); else backToMenu(); }); return; } showLobby(); };
$('#mGarage').onclick = () => { SFX.init(); SFX.ui(); toGarage(); };
$('#mTest').onclick = () => { SFX.init(); SFX.ui(); startBattle({ mode: 'test' }); };
$('#mSettings').onclick = () => { SFX.init(); SFX.ui(); showSettings(); };
$('#mHelp').onclick = () => { SFX.init(); SFX.ui(); showHelp(); };
$('#mParty').onclick = () => { SFX.init(); SFX.ui(); showParty(); };
$('#mQuit').onclick = () => {
  SFX.ui(); saveBays(); if (typeof cloudDirty === 'function') cloudDirty();
  showOverlay(`<h2>Quit RoboBlocks?</h2><p>Your bots and progress are saved.</p><div class="btns"><button class="primary" id="qYes">Quit</button><button id="qNo">Cancel</button></div>`);
  $('#qNo').onclick = () => { hideOverlay(); buildPilotCard(); };
  $('#qYes').onclick = () => {
    if (HOST && HOST.quit) { HOST.quit(); return; }
    try { window.close(); } catch (e) { }
    setTimeout(() => showOverlay(`<h2>Quit RoboBlocks</h2><p>Your browser keeps this tab open. Close the tab to quit; everything is saved.</p><div class="btns"><button class="primary" id="qOk">OK</button></div>`) || ($('#qOk').onclick = () => { hideOverlay(); buildPilotCard(); }), 250);
  };
};
$('#mTut').onclick = () => { SFX.init(); SFX.ui(); tutStart(); toGarage(); };
$('#mProfile').onclick = () => { SFX.init(); SFX.ui(); showProfile(); };
$('#mQuests').onclick = () => { SFX.init(); SFX.ui(); showQuests(); };
$('#mClans').onclick = () => { SFX.init(); SFX.ui(); showClans(); };
$('#mPass').onclick = () => { SFX.init(); SFX.ui(); showPass(); };
$('#mTech').onclick = () => { SFX.init(); showTechTree('menu'); };
$('#btnTech').onclick = () => { SFX.init(); showTechTree('garage'); };
$('#mFriends').onclick = () => { SFX.init(); SFX.ui(); showFriends(); };
$('#mLeader').onclick = () => { SFX.init(); SFX.ui(); showLeaderboard(); };
$('#mShop').onclick = () => { SFX.init(); SFX.ui(); showShop(); };
$('#mAdmin').onclick = () => { SFX.init(); SFX.ui(); showAdmin(); };

// ---------- input ----------
let noLock = TCH.on, lockFails = 0, lastFail = 0;
const lockFailed = () => { const n = performance.now(); if (n - lastFail < 300) return; lastFail = n; lockFails++; if (lockFails >= 2) noLock = true; else toast('Click the battlefield to capture the mouse.'); };
// raw mouse input (no OS acceleration, no Chromium's occasional jump) where supported, plain pointer lock otherwise
function lockPointer() {
  const plain = () => { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(lockFailed); } catch (e) { lockFailed(); } };
  try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(plain); else if (!r) { /* older browsers: the request is in flight */ } } catch (e) { plain(); }
}
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && state === 'battle' && match && !match.over && !paused) showPause(); });
document.addEventListener('pointerdown', () => SFX.init(), { capture: true });
document.addEventListener('mousemove', e => {
  if (state !== 'battle' || paused) return;
  if (document.pointerLockElement === canvas || noLock) {
    const s = .0022 * settings.sens, mx = e.movementX, my = e.movementY;
    // drop the occasional bogus jump pointer lock reports (a single huge move between ordinary ones)
    const big = Math.abs(mx) > 280 || Math.abs(my) > 280; if (big && !cam.bigMove) { cam.bigMove = true; return; } cam.bigMove = big;
    cam.yaw -= mx * s; cam.pitch = clamp(cam.pitch - my * s * (settings.invertY ? -1 : 1), -.75, .7);
  }
});
canvas.addEventListener('mousedown', e => {
  if (state !== 'battle' || paused) return;
  if (!document.pointerLockElement && !noLock) { lockPointer(); return; }
  if (match && match.spectator) { cam.spect = nextSpect(e.button === 2 ? -1 : 1); return; }
  if (e.button === 0) mouseDown = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });
const WKEYS = { Digit1: 'blaster', Digit2: 'plasma', Digit3: 'mortar', Digit4: 'rail', Digit5: 'seeker', Digit6: 'flak', Digit7: 'chain', Digit8: 'nano', Digit9: 'arc', Digit0: 'mine', Minus: 'lancer' };
const modKeyOf = code => MODULE_TYPES.find(t => KB('mod_' + t) === code);
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state === 'garage') {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyR') bumpRot(0);
    else if (e.code === 'KeyT') bumpRot(2);
    else if (e.code === 'KeyF') bumpRot(4);
    else if (e.code === 'KeyP') $('#btnPaint').click();
    else if (e.code === 'KeyM') $(e.shiftKey ? '#btnMirAxis' : '#btnMirror').click();
    else if (e.code === 'KeyE') $('#btnErase').click();
    else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); doRedo(); }
    else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doUndo(); }
    else if (e.code === 'KeyY' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doRedo(); }
    else if (e.code === 'KeyB') $('#btnPlace').click();
    else if (e.code === 'KeyG') $('#btnFill').click();
    else if (e.code === 'KeyI') $('#btnPick').click();
    else if (e.code === 'KeyS' && garage.tool2 !== 'select') $('#btnSel').click();
    else if (e.code === 'KeyL') $('#btnLayer').click();
    else if (e.code === 'BracketRight' && garage.layer != null) setLayer(garage.layer + 1);
    else if (e.code === 'BracketLeft' && garage.layer != null) setLayer(garage.layer - 1);
    else if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) $('#btnBal').click();
    else if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) showKeys();
    else if (garage.tool2 === 'select' && /^(Arrow(Left|Right|Up|Down)|PageUp|PageDown)$/.test(e.code)) { e.preventDefault(); const mv = { ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0], ArrowUp: [0, 0, 1], ArrowDown: [0, 0, -1], PageUp: [0, 1, 0], PageDown: [0, -1, 0] }[e.code]; selMove(...mv, e.shiftKey || garage.selCopy); }
    else if (garage.tool2 === 'select' && (e.code === 'Delete' || e.code === 'Backspace')) { e.preventDefault(); selDelete(); }
    else if (/^Digit[0-9]$/.test(e.code)) { const i = (+e.code.slice(5) + 9) % 10; const id = PART_ORDER[i]; if (id && partOpen(id)) selectTool(id); }
    return;
  }
  if (state === 'battle' && match && NET.game && !paused) {
    if (e.code === KB('chat') || e.code === 'KeyY' || e.code === 'KeyU') { e.preventDefault(); chatOpen(e.code === 'KeyY' ? 'all' : e.code === 'KeyU' ? 'team' : null); return; }
    if (e.code === KB('callouts') && !e.repeat) { if ($('#callouts').hidden) showCallouts(); else { $('#callouts').hidden = true; } return; }
    if (!$('#callouts').hidden && /^Digit[1-6]$/.test(e.code)) { sendCallout(+e.code.slice(5) - 1); return; }
  }
  if (state !== 'battle' && e.code === 'Enter' && !$('#overlay').hidden && $('#lobbyList') && e.target === document.body) { e.preventDefault(); chatOpen(); return; }
  if (state === 'battle' && match) {
    if (e.code === KB('board')) { e.preventDefault(); $('#board').hidden = false; drawBoard(); }
    if (e.code === 'Space' || e.code === KB('up')) { e.preventDefault(); if (match.spectator && !e.repeat) cam.spect = nextSpect(1); }
    if (e.code === 'Escape' && noLock && !paused) showPause();
    const P = match.player;
    if (!P || paused || match.over) return;
    if (e.code === KB('destruct') && !e.repeat && !P.dead) P.die();
    if ((e.code === KB('boost') || (KB('boost') === 'ShiftLeft' && e.code === 'ShiftRight')) && !e.repeat) P.input.dash = true;
    if (P.dead && /^Digit[0-9]$/.test(e.code) && loadoutPick((+e.code.slice(5) + 9) % 10)) return; // 1-9, and 0 for bay 10
    if (/^Digit[1-4]$/.test(e.code) && P.wg && P.wg[+e.code.slice(5) - 1]) { selectGroup(+e.code.slice(5) - 1); return; }
    const m = WKEYS[e.code]; if (m && P.guns[m] && P.guns[m].length) { P.input.weapon = m; P.input.group = null; P.wgIdx = -1; buildWeaponHud(); SFX.ui(); }
    const mk = modKeyOf(e.code); if (mk && !e.repeat && !P.dead && hasModule(P, mk)) P.input.mod = mk;
  }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === KB('board')) $('#board').hidden = true; });

// ---------- HUD ----------
function buildWeaponHud() {
  const p = match.player; const el = $('#weapons'); el.innerHTML = groupHudHtml(p);
  const nG = p.wg ? p.wg.length : 0, inG = t => p.input.group && p.input.group.includes(t);
  for (const t of WTYPES) {
    const n = p.dead ? 0 : (p.guns ? p.guns[t].length : 0); const had = p.cellList && p.cellList.some(c => c.t === t);
    if (!had) continue;
    const d = document.createElement('div'); d.className = 'wslot' + ((p.input.group ? inG(t) : p.input.weapon === t) ? ' act' : '') + (n ? '' : ' off'); d.dataset.t = t;
    d.innerHTML = `<span class="k">${nG && +WEAPONS[t].slot >= 1 && +WEAPONS[t].slot <= nG ? 'WHEEL' : WEAPONS[t].slot}</span><span class="n"></span><div class="bar"><i></i></div>`;
    d.querySelector('.n').textContent = `${PARTS[t].name} ×${n}`;
    el.appendChild(d);
  }
  if (p.cellList && p.cellList.some(c => c.t === 'tesla')) {
    const n = p.dead ? 0 : p.teslas.length;
    const d = document.createElement('div'); d.className = 'wslot passive' + (n ? '' : ' off');
    d.innerHTML = '<span class="k">CONTACT</span><span class="n"></span>';
    d.querySelector('.n').textContent = `Tesla Blade ×${n}`; el.appendChild(d);
  }
}
function buildPointsHud() { $('#points').innerHTML = activePoints().map(p => `<div class="pt" data-n="${p.name}">${p.name}<i></i></div>`).join(''); }
function drawBoard() {
  const el = $('#board'); el.innerHTML = ''; const my = match.player.team, pit = match.mode === 'pit';
  for (const team of pit ? ['all'] : [my, 1 - my]) {
    const col = document.createElement('div'); col.className = pit ? 'E' : team === 0 ? 'A' : 'E';
    const h = document.createElement('h3'); h.textContent = pit ? 'EVERY BOT FOR ITSELF' : team === my ? 'YOUR TEAM' : 'ENEMY TEAM'; col.appendChild(h);
    for (const b of world.bots.filter(b => pit || b.team === team).sort((a, b) => b.kills - a.kills)) {
      const r = document.createElement('div'); r.className = 'r' + (b.isPlayer ? ' me' : '');
      const n = document.createElement('span'); n.textContent = b.name + (b.dead ? ' (wrecked)' : '');
      const pr = b.human && NET.slowPeers ? NET.slowPeers.find(x => x.peer === b.netId) : null, pg = b.isPlayer ? NET.ping : pr && pr.presence ? pr.presence.pg : null;
      const s = document.createElement('span'); s.className = 'num'; s.textContent = `${b.kills} / ${b.deaths} · ${Math.round(b.dmgDealt / 100) / 10}k${pg ? ` · ${pg} ms` : ''}`;
      r.append(n, s); col.appendChild(r);
    }
    el.appendChild(col);
  }
}

// ---------- battle update ----------
function updateCapture(dt) {
  match.tick += dt;
  for (const p of activePoints()) {
    const cnt = [0, 0];
    for (const b of world.bots) if (!b.dead && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < p.r && b.center.y - p.y < 16) cnt[b.team]++;
    const prev = p.owner;
    if (cnt[0] && !cnt[1] || cnt[1] && !cnt[0]) {
      const t = cnt[0] ? 0 : 1, rate = .11 * Math.min(3, cnt[t]) * dt;
      if (p.owner === t) p.prog = Math.min(1, p.prog + rate);
      else { p.prog -= rate; if (p.prog <= 0) { p.prog = 0; p.owner = t; } }
    }
    if (p.owner !== prev) { paintPoint(p); const P0 = match.player; if (p.owner >= 0 && P0 && !P0.dead && P0.team === p.owner && P0.qs && Math.hypot(P0.pos.x - p.x, P0.pos.z - p.z) < p.r) P0.qs.caps++; if (p.owner >= 0) { SFX.capture(p.owner === 0); toastCenter(`${p.owner === 0 ? 'We took' : 'Enemy took'} beacon ${p.name}`, 1.6); } }
    p.fill.material.opacity = .1 + .12 * p.prog + (cnt[0] && cnt[1] ? .1 * Math.sin(clock * 10) : 0);
  }
  if (match.tick >= 1) {
    match.tick -= 1;
    if (match.mode === 'koth') kothScore();
    else { for (const p of world.points) if (p.owner >= 0 && p.prog >= 1) match.score[p.owner] = Math.min(match.limit, match.score[p.owner] + 3); checkEnd(); }
  }
}
const _lk = new T.Vector3();
function updateLock(dt) {
  const P = match.player, el = $('#lock');
  if (P.dead || P.input.weapon !== 'seeker' || !P.guns.seeker.length) { P.lock = null; P.lockCand = null; el.hidden = true; return; }
  const L = _look; let best = null, ba = .13;
  for (const b of world.bots) {
    if (b.dead || b.team === P.team) continue;
    _lk.copy(b.center).sub(camera.position); const d = _lk.length(); if (d > WEAPONS.seeker.range) continue;
    const a = Math.acos(clamp(_lk.dot(L) / d, -1, 1)); if (a < ba) { ba = a; best = b; }
  }
  if (best !== P.lockCand) { P.lockCand = best; P.lockT = 0; if (P.lock && P.lock !== best) P.lock = null; }
  if (best) { P.lockT += dt; if (!P.lock && P.lockT > .55) { P.lock = best; SFX.lock(true); } else if (!P.lock && Math.random() < dt * 6) SFX.lock(false); }
  const tgt = P.lock || best;
  if (!tgt) { el.hidden = true; return; }
  _lk.copy(tgt.center).project(camera);
  if (_lk.z > 1) { el.hidden = true; return; }
  el.hidden = false; el.classList.toggle('on', !!P.lock);
  el.style.left = ((_lk.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _lk.y) / 2 * innerHeight) + 'px';
}
function ambientFx(dt) {
  if (!world.map) return;
  const c = camera.position, id = world.mapId;
  const n = id === 'frost' ? 10 : id === 'ash' ? 6 : 2;
  for (let i = 0; i < n * dt * 30; i++) {
    const x = c.x + rand(-40, 40), z = c.z + rand(-40, 40);
    if (id === 'frost') emit(x, c.y + rand(5, 25), z, rand(-1.5, 1.5), -2, rand(-1.5, 1.5), 5, .12, 0xffffff, .4, 1.2);
    else if (id === 'ash') emit(x, terrainH(x, z) + rand(0, 6), z, rand(-.5, .5), rand(1, 3), rand(-.5, .5), 3, .12, 0xff7a2a, -.3, 3);
    else if (Math.random() < .3) emit(x, terrainH(x, z) + rand(0, 2), z, rand(4, 8), .3, rand(-1, 1), 2, .5, world.map.dust, 0);
  }
}
// shield projector: a glowing bubble flashes around the bot whenever its barrier absorbs a hit
const BARRIER_GEO = HEADLESS ? null : new T.IcosahedronGeometry(1, 3);
function barrierFx(b, dt) {
  if (HEADLESS) return;
  const on = !b.dead && b.barrierMax > 0 && (b.barrierFlash || 0) > 0;
  if (!on) { if (b.barrierMesh) b.barrierMesh.visible = false; return; }
  if (!b.barrierMesh || b.barrierMesh.parent !== world.scene) {
    b.barrierMesh = new T.Mesh(BARRIER_GEO, new T.MeshBasicMaterial({ color: new T.Color(0x5fe8ff).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
    world.scene.add(b.barrierMesh);
  }
  b.barrierFlash = Math.max(0, b.barrierFlash - dt * 2.5);
  const m = b.barrierMesh, k = b.barrier / b.barrierMax; m.visible = true; m.position.copy(b.center); m.scale.setScalar(b.radius3 + .6);
  m.material.opacity = b.barrierFlash * (.12 + .25 * k);
}
function updateBattle(dt) {
  clock += dt; world.time += dt;
  const P = match.player;
  if (match.mode !== 'test' && !match.over) {
    match.time = Math.max(0, match.time - dt);
    if (match.time <= 0 && match.isHost) { match.time = 0; if (match.mode === 'horde') endMatch(1); else if (match.mode === 'elim') { const a = aliveCount(0), e = aliveCount(1); endMatch(a > e ? 0 : e > a ? 1 : -1); } else if (match.mode === 'pit') { const top = pitLeader(), tie = world.bots.filter(b => b.kills === (top ? top.kills : 0)).length > 1; endMatch(top && !tie ? top.team : -1); } else if (match.mode === 'arena' && Math.abs(rxFrac(0) - rxFrac(1)) > .001) endMatch(rxFrac(0) > rxFrac(1) ? 0 : 1); else endMatch(match.score[0] > match.score[1] ? 0 : match.score[1] > match.score[0] ? 1 : -1); }
  }
  if (match.over && !match.done) { match.endT -= dt; if (match.endT <= 0) finishMatch(); }
  if (!P.dead) {
    const k = keys, inp = P.input, ctl = !match.over && !paused;
    const h = a => !!k[KB(a)];
    inp.throttle = ctl ? clamp((h('forward') || k.ArrowUp ? 1 : 0) - (h('back') || k.ArrowDown ? 1 : 0) + TCH.throttle + PAD.throttle, -1, 1) : 0;
    inp.steer = ctl ? clamp((h('left') || k.ArrowLeft ? 1 : 0) - (h('right') || k.ArrowRight ? 1 : 0) + TCH.steer + PAD.steer, -1, 1) : 0;
    inp.strafe = ctl ? clamp((h('strafeL') ? 1 : 0) - (h('strafeR') ? 1 : 0) + PAD.strafe, -1, 1) : 0;
    inp.jet = inp.up = ctl && (h('up') || TCH.up || PAD.up); inp.down = ctl && (h('down') || TCH.down || PAD.down); inp.fire = ctl && (mouseDown || TCH.fire || PAD.fire);
  }
  for (const b of world.bots) if (!b.dead && b.brain) { b.brain.update(dt); if (match.over) { b.input.fire = false; b.input.throttle = 0; } }
  for (const b of world.bots) if (!b.dead && !b.remote) b.physics(dt);
  netTick(dt);
  resolveCollisions();
  for (const b of world.bots) if (!b.dead) b.updateTransform();
  updateCamera(dt);
  updateLock(dt);
  for (const b of world.bots) if (!b.dead) { b.aimWeapons(dt); b.tryFire(dt); }
  updateProjectiles(dt);
  M.tesla.emissiveIntensity = 1.4 + Math.random() * 2;
  for (const b of world.bots) if (!b.dead && !b.remote) b.updateTesla(dt);
  let weaponsChanged = false;
  for (const b of world.bots) if (b.needCheck) { const sig = () => WTYPES.map(t => b.guns[t].length).join() + '|' + b.teslas.length; const before = b.isPlayer ? sig() : ''; b.checkIntegrity(); if (b.isPlayer && (b.dead || sig() !== before)) weaponsChanged = true; }
  if (weaponsChanged) { if (!P.dead && !P.guns[P.input.weapon].length) P.input.weapon = WTYPES.find(t => P.guns[t].length) || P.input.weapon; buildWeaponHud(); }
  if ((match.mode === 'arena' || match.mode === 'koth') && !match.over && match.isHost) updateCapture(dt);
  if (match.mode === 'ctc') updateCores(dt); if (match.mode === 'horde') updateHorde(dt);
  updateReactors(dt); updatePads(dt); recTick(dt);
  if (match.mode === 'elim' && !match.over && match.isHost) { match.score = [aliveCount(0), aliveCount(1)]; }
  for (const b of world.bots) if (b.dead && !b.remote) {
    b.respawnT -= dt;
    if (b.respawnT <= 0 && !match.over) { if (b.isPlayer) applyLoadout(b); b.spawn(b.home ? b.home : spawnPoint(b.team), match.mode === 'pit' ? rand(0, 6.28) : b.team === 0 ? 0 : Math.PI); if (b.isPlayer) { resetPlayerWeapons(P); buildWeaponHud(); $('#fuelRow').hidden = !P.stats.jets; drawLoadoutBar(); } }
  }
  updateDebris(dt); updateParticles(dt); updateFlashes(dt); ambientFx(dt); fxUpdate(dt);
  if (world.sky) world.sky.material.uniforms.time.value = world.time;
  if (world.lavaTex) { world.lavaTex.offset.x = world.time * .004; world.lavaTex.offset.y = Math.sin(world.time * .05) * .02; }
  for (const b of world.bots) barrierFx(b, dt);
  for (const b of world.bots) if (!b.dead && b.tag) {
    if (b.tag.dirty && clock - (b.tag.t || 0) > .15) { b.tag.t = clock; drawTag(b); }
    const dist = camera.position.distanceTo(b.center); const s = clamp(dist / 28, 1, 5);
    b.tag.sprite.scale.set(5.2 * s * .8, 1.3 * s * .8, 1); b.tag.sprite.visible = dist < 360;
  }
  if (HEADLESS) return;
  renderBatches();
  SFX.engineUpdate(P, !match.over); SFX.ambientTick(dt);
  updateHud(dt);
}
function resolveCollisions() {
  const bots = world.bots, B = world.bound;
  for (const b of bots) {
    if (b.dead || b.remote) continue;
    for (const r of world.space ? NO_ROCKS : rocksAt(b.pos.x, b.pos.z)) {
      if (b.pos.y + b.bottomLocal + (b.mob.step || 0) > r.top) continue;
      const dx = b.pos.x - r.x, dz = b.pos.z - r.z, min = r.cr + b.radius * .8, d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d; b.pos.x += nx * (min - d); b.pos.z += nz * (min - d);
        const vn = b.vel.x * nx + b.vel.z * nz; if (vn < 0) { b.vel.x -= vn * nx * 1.2; b.vel.z -= vn * nz * 1.2; }
      }
    }
    if (world.space) { b.updateTransform(); pushOutOfSpheres(b); if (b.pos.y > 175) { b.pos.y = 175; b.vel.y = Math.min(0, b.vel.y); b.alt = Math.min(b.alt, 170); } if (b.pos.y < -45) { b.pos.y = -45; b.vel.y = Math.max(0, b.vel.y); b.alt = Math.max(b.alt, -40); } }
    if (Math.abs(b.pos.x) > B) { b.pos.x = Math.sign(b.pos.x) * B; b.vel.x = 0; }
    if (Math.abs(b.pos.z) > B) { b.pos.z = Math.sign(b.pos.z) * B; b.vel.z = 0; }
  }
  for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) {
    const a = bots[i], b = bots[j]; if (a.dead || b.dead || (a.remote && b.remote)) continue;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, min = (a.radius + b.radius) * .75, d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-6 || Math.abs(a.center.y - b.center.y) > (a.height + b.height) * .6) continue;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (min - d) / 2;
    const ma = a.stats.mass, mb = b.stats.mass; let wa = mb / (ma + mb), wb = ma / (ma + mb);
    if (a.remote) { wa = 0; wb = 1; } else if (b.remote) { wb = 0; wa = 1; }
    a.pos.x -= nx * push * 2 * wa; a.pos.z -= nz * push * 2 * wa; b.pos.x += nx * push * 2 * wb; b.pos.z += nz * push * 2 * wb;
    const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
    if (rv < -4 && a.team !== b.team) for (const [x, y] of [[a, b], [b, a]]) if (x.spikes && !x.remote && clock - (x.ramT || 0) > .4) { x.ramT = clock; const dmg = Math.min(1200, -rv * 28 * Math.min(6, x.spikes)) * match.dmgScale, near = y.cellList.filter(c => c.alive).sort((p, q) => y.cellWorld(p, _v1).distanceToSquared(x.center) - y.cellWorld(q, _v2).distanceToSquared(x.center)).slice(0, 3); for (const c of near) { y.damageCell(c, dmg / 3, x); } onHit(x, y, dmg); if (!HEADLESS) { sparks(y.center.clone().lerp(x.center, .5), 0xffd27a, 14, 9, .18, .4); SFX.crunch(y.center); } }
    if (rv < 0) { a.vel.x += nx * rv * wa; a.vel.z += nz * rv * wa; b.vel.x -= nx * rv * wb; b.vel.z -= nz * rv * wb; }
  }
}
const _camPos = new T.Vector3(), _look = new T.Vector3(), aimPoint = new T.Vector3();
const KILLCAM_T = 3.4;
function nextSpect(dir) {
  const live = world.bots.filter(b => !b.dead && b !== match.player); if (!live.length) return null;
  const i = live.indexOf(cam.spect); return live[((i < 0 ? 0 : i + dir) + live.length) % live.length];
}
function updateCamera(dt) {
  const P = match.player;
  const L = _look.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  let tgt, dist, lift;
  if (!P.dead) { cam.target.lerp(P.center, 1 - Math.exp(-18 * dt)); tgt = cam.target; dist = 5 + P.radius3 * 1.45; lift = 1.8 + P.radius3 * .45; }
  else {
    cam.deathT += dt;
    const K = cam.killer, killcam = !match.spectator && K && K !== P && cam.deathT < KILLCAM_T && !match.over;
    if (match.spectator) { if (!cam.spect || cam.spect.dead) cam.spect = nextSpect(0); }
    else if (match.mode === 'elim' && cam.deathT > 3) { // spectate a teammate
      if (!cam.spect || cam.spect.dead) cam.spect = world.bots.find(b => !b.dead && b.team === P.team) || world.bots.find(b => !b.dead) || null;
    }
    if (killcam) { // look at whoever destroyed us, from the wreck's side
      const kc = K.dead && K.lastCenter ? K.lastCenter : K.center; if (!K.dead) K.lastCenter = (K.lastCenter || new T.Vector3()).copy(K.center);
      const dp = cam.deathPos || kc, hx = kc.x - dp.x, hz = kc.z - dp.z, hd = Math.hypot(hx, hz);
      if (hd > 1) cam.yaw = lerp(cam.yaw, cam.yaw + wrapA(Math.atan2(hx, hz) - cam.yaw), 1 - Math.exp(-4 * dt));
      cam.pitch = lerp(cam.pitch, -.12, 1 - Math.exp(-3 * dt));
      cam.target.lerp(kc, 1 - Math.exp(-5 * dt)); tgt = cam.target; dist = Math.min(7 + K.radius3 * 1.6, Math.max(8, hd * .6)); lift = 2.5;
    } else if (cam.spect && !cam.spect.dead) { cam.target.lerp(cam.spect.center, 1 - Math.exp(-6 * dt)); tgt = cam.target; dist = 6 + cam.spect.radius3 * 1.5; lift = 3; cam.yaw = lerp(cam.yaw, cam.yaw + wrapA(cam.spect.yaw - cam.yaw), dt * 1.5); }
    else { cam.yaw += dt * .25; tgt = cam.deathPos || cam.target; dist = 16; lift = 6; }
  }
  _camPos.copy(tgt).addScaledVector(L, -dist); _camPos.y += lift;
  // keep the camera above the ground: look at the ground in a small ring around it (so a bump does not pop it up the
  // moment it passes over), rise at once when needed, settle back down gently
  let gh = terrainH(_camPos.x, _camPos.z); for (let i = 0; i < 6; i++) { const a = i * 1.047; gh = Math.max(gh, terrainH(_camPos.x + Math.cos(a) * 2.5, _camPos.z + Math.sin(a) * 2.5) - .4); }
  gh += 1.2; cam.floor = cam.floor == null || gh > cam.floor ? gh : lerp(cam.floor, gh, 1 - Math.exp(-3 * dt)); if (_camPos.y < cam.floor) _camPos.y = cam.floor;
  if (cam.shake > 0) { _camPos.x += rand(-1, 1) * cam.shake * .5; _camPos.y += rand(-1, 1) * cam.shake * .5; cam.shake = Math.max(0, cam.shake - dt * 1.8); }
  camera.position.copy(_camPos);
  camera.lookAt(_v1.copy(_camPos).add(L)); camera.updateMatrixWorld();
  if (world.sky) world.sky.position.copy(camera.position);
  const sp = tgt;
  world.sun.position.set(sp.x + world.sunDir.x * 220, sp.y + world.sunDir.y * 220, sp.z + world.sunDir.z * 220); world.sun.target.position.copy(sp); world.sun.target.updateMatrixWorld();
  if (!P.dead) {
    const t = castRay(_camPos, L, dist * .9, 700, P);
    aimPoint.copy(_camPos).addScaledVector(L, t); P.input.aim.copy(aimPoint);
  }
}
let hudT = 0;
function updateHud(dt) {
  const P = match.player;
  updateDmgNumbers(dt); updateHitDir(dt);
  hitmarkT -= dt; $('#hitmark').classList.toggle('show', hitmarkT > 0);
  hudFx.dmg = Math.max(0, hudFx.dmg - dt * 1.2); $('#vignette').style.opacity = (hudFx.dmg * .6).toFixed(2);
  if (centerMsgT > 0) { centerMsgT -= dt; if (centerMsgT <= 0 && !(P.dead && !match.over)) $('#centerMsg').textContent = ''; }
  $('#hud').classList.toggle('killcam', !!(P.dead && !match.spectator && cam.killer && cam.killer !== P && cam.deathT < KILLCAM_T && !match.over));
  if (match.spectator) {
    $('#centerMsg').innerHTML = ''; const s = document.createElement('small');
    s.textContent = cam.spect ? `Watching ${cam.spect.name} (${cam.spect.team === 0 ? 'blue' : 'red'}) · click or Space for next · Esc to leave` : 'Waiting for bots…';
    $('#centerMsg').append(s);
  } else if (P.dead && !match.over) {
    const k = cam.killer; $('#centerMsg').innerHTML = '';
    if (k && k !== P && cam.deathT < KILLCAM_T) {
      const main = WTYPES.reduce((a, t) => k.guns[t].length > (a ? k.guns[a].length : 0) ? t : a, null);
      const info = document.createElement('div'); info.className = 'kc';
      info.textContent = `KILLCAM · ${k.name} · ${k.dead ? 'destroyed' : Math.round(clamp(k.hp / k.maxHp, 0, 1) * 100) + '% integrity'}${main ? ' · ' + PARTS[main].name : k.teslas.length ? ' · Tesla Blades' : ''}`;
      $('#centerMsg').append(info);
    }
    const a = document.createElement('div'); a.textContent = 'Bot destroyed';
    const s = document.createElement('small');
    s.textContent = match.mode === 'elim' ? `${k ? 'by ' + k.name + ' · ' : ''}${cam.spect ? 'spectating ' + cam.spect.name : 'out for this round'}` : `${k ? 'by ' + k.name + ' · ' : ''}rebuilding in ${Math.max(0, Math.ceil(P.respawnT))}s`;
    $('#centerMsg').append(a, s);
  } else if (!P.dead && centerMsgT <= 0 && !match.over && $('#centerMsg').textContent) $('#centerMsg').textContent = '';
  hudT -= dt; if (hudT > 0) return; hudT = .08;
  drawLoadoutBar(); updateReactorHud();
  const k = P.dead ? 0 : clamp(P.hp / P.maxHp, 0, 1);
  $('#hpPct').textContent = Math.round(k * 100) + '%';
  $('#hpBar i').style.width = k * 100 + '%';
  const bm = !P.dead && P.barrierMax > 0; if ($('#barRow').hidden === bm) $('#barRow').hidden = !bm; if (bm) $('#barBar i').style.width = Math.round(P.barrier / P.barrierMax * 100) + '%'; $('#hpBar').classList.toggle('low', k < .35);
  $('#spdVal').textContent = fmtSpeed(Math.hypot(P.vel.x, P.vel.z));
  $('#kdVal').textContent = `K ${P.kills} · D ${P.deaths}`;
  $('#fuelRow .bar i').style.width = P.fuel * 100 + '%';
  $('#boostRow .bar i').style.width = (1 - P.dashCd / 5) * 100 + '%';
  const hasMods = !P.dead && P.mods && Object.keys(P.mods).length;
  $('#enRow').hidden = !hasMods;
  if (hasMods) {
    $('#enRow .bar i').style.width = (P.energy / P.energyMax * 100).toFixed(1) + '%'; $('#enVal').textContent = Math.floor(P.energy);
    const el = $('#mods'); const want = Object.keys(P.mods).join();
    if (el.dataset.k !== want) { el.dataset.k = want; el.innerHTML = Object.keys(P.mods).map(t => `<div class="mslot" data-t="${t}"><span class="k">${keyLabel(KB('mod_' + t))}</span><span class="n">${MODULES[t].name}</span><i></i></div>`).join(''); el.querySelectorAll('.mslot').forEach(s => s.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); P.input.mod = s.dataset.t; }); }
    el.querySelectorAll('.mslot').forEach(s => { const t = s.dataset.t, cd = P.modCd[t] || 0, ready = moduleReady(P, t); s.classList.toggle('ready', ready); s.querySelector('i').style.width = (cd > 0 ? (1 - cd / MODULES[t].cd) * 100 : 100) + '%'; });
  } else if ($('#mods').dataset.k) { $('#mods').dataset.k = ''; $('#mods').innerHTML = ''; }
  $('#hud').classList.toggle('cloaked', !P.dead && P.cloaked); $('#hud').classList.toggle('stunned', !P.dead && P.stunT > 0);
  $('#altVal').textContent = !P.dead && (P.mob.mode === 'rotor' || P.mob.mode === 'hover') ? `· alt ${Math.round(P.alt + (P.mob.mode === 'hover' ? P.mob.hoverH : 0))} m` : '';
  if (match.mode === 'pit') { const top = pitLeader(); match.score = [P.kills, top ? top.kills : 0]; }
  $('#scA').textContent = match.score[0]; $('#scE').textContent = match.score[1];
  const t = Math.ceil(match.time); $('#timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  { const hb = $('#heat'), usesHeat = WTYPES.some(t => HEAT[t] && P.guns && P.guns[t] && P.guns[t].length); hb.hidden = !usesHeat || P.dead;
    if (usesHeat) { const over = P.overT > 0; hb.querySelector('i').style.width = ((over ? P.overT / HEAT_LOCK : P.heat || 0) * 100).toFixed(1) + '%'; hb.classList.toggle('hot', !over && (P.heat || 0) > .75); hb.classList.toggle('over', over); hb.querySelector('span').textContent = over ? 'VENTING' : 'HEAT'; } }
  document.querySelectorAll('.wslot[data-t]').forEach(el => {
    const t = el.dataset.t, W = WEAPONS[t], n = P.guns ? P.guns[t].length : 0;
    const interval = n ? Math.max(W.minInt, W.cd / n) : 1;
    let ready = P.input.group ? (P.input.group.includes(t) && P.ft ? clamp(1 - (P.ft[t] || 0) / interval, 0, 1) : 1) : P.input.weapon === t ? clamp(1 - P.fireT / interval, 0, 1) : 1;
    if (t === 'chain' && P.input.weapon === 'chain') ready = P.spin;
    el.querySelector('.bar i').style.width = ready * 100 + '%';
  });
  if (match.mode === 'ctc') coreHud(); if (match.mode === 'horde') { hordeHud(); $('#goal').textContent = modeGoalText('horde', match.n, match.limit); }
  if (match.mode === 'arena' || match.mode === 'koth') document.querySelectorAll('#points .pt').forEach((el, i) => { const p = activePoints()[i]; if (!p) return; el.className = 'pt' + (p.owner === 0 ? ' A' : p.owner === 1 ? ' E' : ''); el.querySelector('i').style.width = (p.owner >= 0 ? p.prog * 100 : 0) + '%'; });
  if (!$('#board').hidden) drawBoard();
  drawMinimap();
}
function drawMinimap() {
  const c = $('#minimap'), g = c.getContext('2d'), W = c.width, S = W / (world.half * 2);
  const mx = x => (.5 - x * S / W) * W, my = z => (.5 - z * S / W) * W;
  g.clearRect(0, 0, W, W);
  if (world.mapImg) { g.imageSmoothingEnabled = true; g.drawImage(world.mapImg, 0, 0, W, W); }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(mx(world.bound), my(world.bound), world.bound * 2 * S, world.bound * 2 * S);
  g.strokeStyle = 'rgba(79,176,255,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(mx(0), my(-world.spawnZ), 46 * S, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(255,84,68,.9)'; g.beginPath(); g.arc(mx(0), my(world.spawnZ), 46 * S, 0, 7); g.stroke();
  for (const p of activePoints()) {
    g.fillStyle = p.owner === 0 ? '#4fb0ff' : p.owner === 1 ? '#ff5444' : '#e0e0e0'; g.globalAlpha = .85;
    g.beginPath(); g.arc(mx(p.x), my(p.z), 12, 0, 7); g.fill(); g.globalAlpha = 1;
    g.fillStyle = '#111'; g.font = '700 14px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.name, mx(p.x), my(p.z) + 1);
  }
  drawMapExtras(g, mx, my, S); drawReactorsOnMap(g, mx, my); drawCoresOnMap(g, mx, my); drawPings(g, mx, my);
  if (match.mode === 'pit') { const top = pitLeader(); if (top && !top.dead && top.kills > 0) { g.strokeStyle = '#ffd36a'; g.lineWidth = 3; g.beginPath(); g.arc(mx(top.pos.x), my(top.pos.z), 10 + Math.sin(world.time * 6) * 2, 0, 7); g.stroke(); } }
  const P = match.player;
  for (const b of world.bots) {
    if (b.dead || b.isPlayer || !visibleToViewer(b)) continue;
    g.fillStyle = b.team === 0 ? '#4fb0ff' : '#ff5444'; g.strokeStyle = '#0008'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(mx(b.pos.x), my(b.pos.z), b.mob.mode === 'rotor' ? 6 : 4.5, 0, 7); g.fill(); g.stroke();
  }
  if (!P.dead) {
    const x = mx(P.pos.x), y = my(P.pos.z);
    g.save(); g.translate(x, y);
    const a = Math.atan2(-Math.cos(cam.yaw), -Math.sin(cam.yaw));
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 60, a - .55, a + .55); g.closePath(); g.fill();
    g.restore();
    g.save(); g.translate(x, y); g.rotate(-P.yaw);
    g.fillStyle = '#ff8a1f'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
}

// ================= LOOP =================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  SFX.budget = 0;
  if (!HEADLESS) { tutTick(dt); chatTick(dt); perfTick(dt); padTick(dt); }
  if (HEADLESS) { if (state === 'battle' && match) updateBattle(dt); return; }
  if (state === 'garage' || state === 'menu') {
    // the placement / paint / erase highlight only belongs on the garage with nothing open over it
    if ((state !== 'garage' || !$('#overlay').hidden || ($('#techTree') && !$('#techTree').hidden)) && (garage.ghost.visible || garage.mirrorGhost.visible)) garage.ghost.visible = garage.mirrorGhost.visible = false;
    if (state === 'menu') { garage.orbit.theta += dt * .12; garage.orbit.phi = 1.18; garage.orbit.r = lerp(garage.orbit.r, 17, dt * 2); }
    const off = state === 'menu' && innerWidth > 820;
    if (off) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * .16, 0, innerWidth, innerHeight); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    if (state === 'garage') photoTick(dt);
    updateGarageCamera(dt);
    post.render(garage.scene, camera, { bloom: .45, vignette: state === 'menu' ? .55 : .3 });
    photoAfterRender();
  } else if (state === 'battle' && world.scene) {
    if (camera.view && camera.view.enabled) camera.clearViewOffset();
    if (!paused || (match && match.net)) updateBattle(dt); else SFX.engineUpdate(null, false);
    post.render(world.scene, camera, battleLook());
  } else if (state === 'replay' && world.scene && match) {
    if (camera.view && camera.view.enabled) camera.clearViewOffset();
    updateReplay(dt); post.render(world.scene, camera, battleLook());
  }
}

function syncTopH() { const tb = document.querySelector('#garage .topbar'); if (tb && tb.offsetHeight) document.documentElement.style.setProperty('--topH', tb.offsetHeight + 'px'); const bar = document.querySelector('#toolbar'); if (bar && bar.offsetHeight) document.documentElement.style.setProperty('--tbH', bar.offsetHeight + 'px'); }
addEventListener('resize', syncTopH);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncTopH);
function start() {
  setupGarage(); renderIcons(); buildPartsUI(); buildSwatches(); syncToolButtons();
  gLoad(design); buildBaysUI(); buildFinishUI();
  $('#loading').remove();
  beInit();
  if (!HEADLESS) setTimeout(() => { if (state === 'menu' && $('#overlay').hidden) showWhatsNew(); }, 1500);
  applyQuality();
  if (!HEADLESS) {
    SFX.init(); // the desktop app plays straight away; browsers may hold audio until the first key or click anywhere
    const wake = () => { SFX.init(); if (SFX.ctx && SFX.ctx.state === 'running') for (const ev of ['pointerdown', 'keydown', 'touchstart']) removeEventListener(ev, wake, true); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, wake, true);
  }
  toMenu();
  requestAnimationFrame(frame);
  if (HEADLESS) { // dedicated server: host this official server forever
    const cfg = window.__BC_SERVER || {};
    netInit().then(async r => { if (!r) return; const sv = SERVERS.find(s => s.id === cfg.id); if (!sv) return; await joinGame(sv.id, sv, null); becomeHost(); });
  }
}
if (window.claude && window.claude.hot && window.claude.hot.snapshot) { try { window.claude.hot.snapshot(() => ({ bays, progress })); } catch (e) { } }
window.__sfa = { get RP() { return RP; }, get REC() { return REC; }, NET, terrainH, encodeDesign, decodeDesign, camera, showLobby, gen: genDesign, load: d => gLoad(d), rng: mulberry32, sim: (sec) => { for (let i = 0; i < sec * 30; i++) updateBattle(1 / 30); }, startBattle, toGarage, toMenu, get match() { return match; }, world, garage, keys, setMouse: v => { mouseDown = v; }, unpause: () => { paused = false; hideOverlay(); }, cam, setupArena, get state() { return state; } };
// start() runs from 99-end.js, after every file has loaded
