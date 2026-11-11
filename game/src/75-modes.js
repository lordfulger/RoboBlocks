// ================= MORE MODES: CAPTURE THE CORE · KING OF THE HILL · HORDE · WEEKLY BRAWL =================
// Every mode runs on the host. Clients mirror the host's state from its presence (info.md).

// ---------- weekly brawl ----------
const BRAWLS = [
  { id: 'lowg', name: 'Low Gravity', desc: 'Gravity at a third. Jumps go far and shells fly long.', grav: .35 },
  { id: 'glass', name: 'Glass Cannons', desc: 'Every weapon deals double damage. Blink and you are scrap.', dmg: 2 },
  { id: 'rapid', name: 'Rapid Fire', desc: 'All weapons reload 60% faster.', fire: .62 },
  { id: 'iron', name: 'Iron Skins', desc: 'Damage is halved. Longer fights reward focus fire.', dmg: .5 },
  { id: 'night', name: 'Night Ops', desc: 'Every map at night, and weapons hit 30% harder.', tod: 'night', dmg: 1.3 },
];
const brawlWeek = () => Math.floor((Date.now() / 864e5 + 3) / 7); // weeks start on Monday (UTC)
const brawlNow = () => BRAWLS[brawlWeek() % BRAWLS.length];
const brawlById = id => BRAWLS.find(b => b.id === id) || brawlNow();
function brawlEndsIn() { const ms = (brawlWeek() + 1) * 7 * 864e5 - 3 * 864e5 - Date.now(), d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24; return d ? `${d}d ${h}h` : `${h}h`; }

// ---------- shared setup ----------
const isTeamMode = m => m === 'tdm' || m === 'space' || m === 'arena' || m === 'elim' || m === 'ctc' || m === 'koth' || m === 'brawl';
function modeLimit(mode, N) {
  if (mode === 'ctc') return 3;
  if (mode === 'koth') return { 5: 100, 10: 130, 20: 160 }[N] || 120;
  if (mode === 'horde') return HORDE.waves;
  if (mode === 'brawl') return { 5: 20, 10: 50, 20: 100 }[N] || 20;
  return 0;
}
function modeTime(mode) { return mode === 'horde' ? 40 * 60 : mode === 'koth' ? 8 * 60 : 0; }
// after setupArena, before bots spawn
function modeSetup(opts, net) {
  const m = match.mode;
  match.hill = null; match.cores = null; match.horde = null; match.fireMul = 1;
  if (m === 'brawl') {
    const br = match.brawl = brawlById(net ? net.brawl : opts.brawl);
    if (br.grav) GRAV *= br.grav; if (br.dmg) match.dmgScale *= br.dmg; if (br.fire) match.fireMul = br.fire;
  }
  for (const p of world.points || []) p.group.visible = m === 'arena';
  if (m === 'koth') { match.hill = world.points.reduce((a, p) => !a || Math.hypot(p.x, p.z) < Math.hypot(a.x, a.z) ? p : a, null); match.hill.group.visible = true; }
  clearCores();
  if (m === 'ctc') buildCores();
}
function activePoints() { return !match ? [] : match.mode === 'koth' ? (match.hill ? [match.hill] : []) : match.mode === 'arena' ? world.points : []; }
function modeGoalText(mode, N, limit) {
  if (mode === 'ctc') return `CAPTURE THE CORE · FIRST TO ${limit}`;
  if (mode === 'koth') return `KING OF THE HILL · ${limit} POINTS`;
  if (mode === 'horde') return `HORDE · WAVE ${Math.max(1, match.score[0])} OF ${limit} · ${match.horde ? match.horde.lives : 0} REBUILDS`;
  if (mode === 'brawl') return `${(match.brawl || brawlNow()).name.toUpperCase()} · FIRST TO ${limit}`;
  return null;
}

// ---------- King of the Hill ----------
// updateCapture handles the hill as a one-point arena; this adds the scoring
function kothScore() { const h = match.hill; if (h && h.owner >= 0 && h.prog >= 1) match.score[h.owner] = Math.min(match.limit, match.score[h.owner] + 1); if (match.score[0] >= match.limit || match.score[1] >= match.limit) endMatch(match.score[0] >= match.score[1] ? 0 : 1); }

// ---------- Capture the Core ----------
const CORE_PICK = 7, CORE_CAP = 10, CORE_RETURN = 25;
function clearCores() { if (world.cores) for (const c of world.cores) { world.scene.remove(c.g); world.scene.remove(c.pad); } world.cores = null; }
function buildCores() {
  world.cores = [0, 1].map(team => {
    const z = (team === 0 ? -1 : 1) * (world.spawnZ + 26), x = 0, y = bedH(x, z), col = team === 0 ? 0x4fb0ff : 0xff5444;
    const pad = new T.Group(); pad.position.set(x, y, z);
    const base = new T.Mesh(new T.CylinderGeometry(5.5, 6.5, .8, 10), new T.MeshStandardMaterial({ color: 0x3a4248, roughness: .5, metalness: .6 })); base.position.y = .3; pad.add(base);
    const ring = new T.Mesh(new T.RingGeometry(CORE_CAP - .5, CORE_CAP, 40).rotateX(-HALF_PI), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .6, side: T.DoubleSide, depthWrite: false })); ring.position.y = .35; pad.add(ring);
    const beam = new T.Mesh(new T.CylinderGeometry(.5, .5, 60, 8, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .18, depthWrite: false, blending: T.AdditiveBlending })); beam.position.y = 30; pad.add(beam);
    world.scene.add(pad);
    const g = new T.Group(), mat = new T.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 3.2, roughness: .3 });
    const orb = new T.Mesh(new T.OctahedronGeometry(1.8, 0), mat); g.add(orb);
    const cage = new T.Mesh(new T.IcosahedronGeometry(2.6, 0), new T.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: .7 })); g.add(cage);
    world.scene.add(g);
    const home = new T.Vector3(x, y + 3.2, z);
    g.position.copy(home);
    return { team, home, pos: home.clone(), st: 0, carrier: null, dropT: 0, g, orb, cage, pad, beam, col };
  });
}
function coreOf(team) { return world.cores && world.cores[team]; }
function carriedBy(b) { return world.cores ? world.cores.find(c => c.st === 1 && c.carrier === b) : null; }
function coreReturn(c, msg) { c.st = 0; c.carrier = null; c.pos.copy(c.home); if (msg) coreAnnounce(c.team, 'returned'); }
function coreAnnounce(team, what, who) {
  if (HEADLESS || !match.player) return; const ours = team === match.player.team;
  const t = { taken: ours ? `${who || 'An enemy'} took our core!` : `${who || 'We'} took the enemy core!`, dropped: ours ? 'Our core is down. Touch it to send it home.' : 'Enemy core dropped. Grab it!', returned: ours ? 'Our core is home.' : 'The enemy core went home.', captured: ours ? 'They captured our core.' : 'Core captured!' }[what];
  if (t) { toastCenter(t, 2.4); if (what === 'captured') SFX.capture(!ours); else if (what === 'taken') { if (ours) SFX.alarm(); else SFX.capture(true); } }
}
function updateCores(dt) {
  if (!world.cores) return;
  for (const c of world.cores) {
    if (c.st === 1 && c.carrier) { c.pos.copy(c.carrier.center); c.pos.y += (c.carrier.height || 3) * .5 + 3.5; }
    c.g.position.lerp(c.pos, c.st === 1 ? 1 : Math.min(1, dt * 8));
    c.orb.rotation.y += dt * 2; c.cage.rotation.y -= dt * .8; c.cage.rotation.x += dt * .5;
    c.beam.material.opacity = c.st === 0 ? .18 : .05 + .05 * Math.sin(world.time * 6);
    if (c.st === 2) c.orb.material.emissiveIntensity = 2 + Math.sin(world.time * 8) * 1.2; else c.orb.material.emissiveIntensity = 3.2;
  }
  if (!match.isHost || match.over) return;
  for (const c of world.cores) {
    if (c.st === 1) {
      const b = c.carrier;
      if (!b || b.dead) { c.st = 2; c.carrier = null; c.pos.y = terrainH(c.pos.x, c.pos.z) + 2; c.dropT = CORE_RETURN; coreAnnounce(c.team, 'dropped'); continue; }
      const mine = world.cores[b.team];
      if (mine.st === 0 && Math.hypot(b.pos.x - mine.home.x, b.pos.z - mine.home.z) < CORE_CAP) {
        match.score[b.team] = Math.min(match.limit, match.score[b.team] + 1); coreReturn(c); coreAnnounce(c.team, 'captured');
        if (b.qs) b.qs.caps = (b.qs.caps || 0) + 1; b.kills += 0;
        if (match.score[b.team] >= match.limit) endMatch(b.team);
      }
      continue;
    }
    if (c.st === 2) { c.dropT -= dt; if (c.dropT <= 0) { coreReturn(c, true); continue; } }
    for (const b of world.bots) {
      if (b.dead || b.stunT > 0) continue;
      const d = Math.hypot(b.pos.x - c.pos.x, b.pos.z - c.pos.z); if (d > CORE_PICK || Math.abs(b.center.y - c.pos.y) > 10) continue;
      if (b.team === c.team) { if (c.st === 2) { coreReturn(c, true); break; } continue; }
      if (carriedBy(b)) continue;
      c.st = 1; c.carrier = b; if (b.cloakT > 0) b.cloakT = 0; coreAnnounce(c.team, 'taken', b.isPlayer ? 'You' : b.name); break;
    }
  }
}
// a carrier cannot cloak; a ram with spikes or a module never drops it on its own
function coreState() { return world.cores ? world.cores.map(c => [c.st, r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), c.carrier ? c.carrier.netId || '' : '']) : null; }
function applyCoreState(a) {
  if (!world.cores || !Array.isArray(a)) return;
  a.forEach((q, i) => { const c = world.cores[i]; if (!c || !Array.isArray(q)) return; const st = q[0] | 0;
    if (st !== c.st) coreAnnounce(c.team, st === 1 ? 'taken' : st === 2 ? 'dropped' : 'returned');
    c.st = st; c.carrier = st === 1 ? netBot(q[4]) || null : null; if (st !== 1) c.pos.set(+q[1] || 0, +q[2] || 0, +q[3] || 0); });
}
function drawCoresOnMap(g, mx, my) {
  if (!world.cores) return;
  for (const c of world.cores) {
    g.fillStyle = c.team === 0 ? '#4fb0ff' : '#ff5444'; g.strokeStyle = c.st ? '#fff' : '#000'; g.lineWidth = 2;
    g.beginPath(); g.arc(mx(c.home.x), my(c.home.z), 6, 0, 6.29); g.stroke();
    const x = mx(c.pos.x), y = my(c.pos.z); g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y); g.lineTo(x, y + 7); g.lineTo(x - 6, y); g.closePath(); g.fill(); if (c.st && (world.time * 4 | 0) % 2) g.stroke();
  }
}
function coreHud() {
  const el = $('#modeHud'); if (!el) return;
  if (!world.cores || !match) { el.hidden = true; return; }
  el.hidden = false; const my = match.player.team;
  const txt = c => c.st === 0 ? 'HOME' : c.st === 1 ? `CARRIED${c.carrier ? ' · ' + (c.carrier.isPlayer ? 'YOU' : c.carrier.name) : ''}` : `DOWN · ${Math.ceil(c.dropT || 0)}s`;
  el.innerHTML = `<div class="mh A"><b>OUR CORE</b><span>${esc(txt(world.cores[my] || world.cores[0]))}</span></div><div class="mh E"><b>ENEMY CORE</b><span>${esc(txt(world.cores[1 - my] || world.cores[1]))}</span></div>`;
}

// ---------- Horde (co-op) ----------
const HORDE = { waves: 10, pool: 26, light: 12, std: 10, heavy: 2, boss: 2, rest: 10, enemyDmg: .75 };
function hordeSquad(N) { return Math.min(N, 4); }
// the enemy pool is built up front from the match seed so every client makes the same bots
function hordePool(rnd, budget, aiLv, names, startK) {
  const out = []; let k = startK;
  const mk = (i, f, arch, tier, boss) => {
    const d = addAiExtras(genDesign(rnd, budget * f, arch, boss ? { main: 2, acc: 0 } : undefined, tier), rnd, aiLv);
    const b = new Bot(d, 1, boss ? 'BOSS ' + (names.pop() || 'Titan') : names.pop() || 'Drone ' + k, { ai: true, netId: 'a' + k }); b.bench = true; b.respawnT = Infinity; b.boss = !!boss; b.hTier = i; k++; out.push(b);
  };
  const tier = maxTier(Math.min(10, aiLv)), t1 = Math.max(1, tier - 1);
  for (let i = 0; i < HORDE.light; i++) mk(0, lerp(.38, .55, rnd()), ['car', 'hover', 'car', 'brawler'][i % 4], t1);
  for (let i = 0; i < HORDE.std; i++) mk(1, lerp(.65, .85, rnd()), enemyArch(rnd, aiLv), t1);
  for (let i = 0; i < HORDE.heavy; i++) mk(2, 1.25, 'tank', tier);
  for (let i = 0; i < HORDE.boss; i++) mk(3, 2.6, i ? 'walker' : 'tank', tier, true);
  for (const b of out) b.dmgMul = HORDE.enemyDmg; // the horde hits a little softer than a real opponent
  return out;
}
function hordeStart(humans) {
  match.horde = { wave: 0, lives: 8 + 4 * Math.max(1, humans), restT: 6, live: false };
  match.score = [0, 0];
}
function hordeWaveList(w, humans) {
  const n = Math.min(12, 2 + w + (humans - 1) * 2), list = [];
  const boss = w % 5 === 0 ? (w === 10 ? 2 : 1) : 0;
  for (let i = 0; i < boss; i++) list.push(3);
  const heavy = w >= 6 ? Math.min(2, Math.floor((w - 4) / 3)) : 0; for (let i = 0; i < heavy; i++) list.push(2);
  while (list.length < n) list.push(w <= 3 || Math.random() < Math.max(.3, .9 - w * .07) ? 0 : 1);
  return list;
}
function hordeSpawnWave() {
  const H = match.horde, humans = Math.max(1, world.bots.filter(b => b.human && b.team === 0).length);
  H.wave++; match.score[0] = H.wave;
  const want = hordeWaveList(H.wave, humans), pool = world.bots.filter(b => b.team === 1);
  let placed = 0;
  for (const tier of want) {
    let b = pool.find(x => x.dead && x.hTier === tier && !x.inWave) || pool.find(x => x.dead && !x.boss && !x.inWave && x.hTier !== 3);
    if (!b) continue; b.inWave = true; b.bench = false;
    const p = spawnPoint(1); if (tier === 3) p.z = Math.sign(p.z || 1) * (world.spawnZ - 10);
    b.spawn(p, Math.PI); placed++;
  }
  for (const b of pool) b.inWave = false;
  match.score[1] = placed; H.live = true;
  toastCenter(H.wave % 5 === 0 ? `WAVE ${H.wave} · BOSS INCOMING` : `WAVE ${H.wave}`, 2.6); if (!HEADLESS) SFX.wave();
}
function updateHorde(dt) {
  const H = match.horde; if (!H || match.over) return;
  const P = match.player;
  // a wave cleared: every bot on the squad is fully repaired
  if (H.prevLive && !H.live) for (const b of world.bots) if (b.team === 0 && !b.dead && !b.remote) { for (const c of b.cellList) if (!c.alive) b.reviveCell(c, 1); for (const c of b.cellList) if (c.alive && c.hp < c.max) { b.hp += c.max - c.hp; c.hp = c.max; } b.needCheck = true; if (b.isPlayer) toastCenter('Squad repaired', 1.6); }
  H.prevLive = H.live;
  // between waves, everyone who ran out of rebuilds comes back for free
  if (!H.live && P && P.dead && P.respawnT === Infinity && !match.spectator && H.wave > 0) P.respawnT = 2;
  if (!match.isHost) return;
  const left = world.bots.reduce((n, b) => n + (b.team === 1 && !b.dead ? 1 : 0), 0);
  if (H.live) {
    match.score[1] = left;
    if (!left) {
      H.live = false; H.restT = HORDE.rest;
      if (H.wave >= HORDE.waves) { endMatch(0); return; }
      toastCenter(`Wave ${H.wave} cleared · next in ${HORDE.rest}s`, 2.4);
      for (const b of world.bots) if (b.team === 0 && b.dead && !b.remote && b.respawnT === Infinity) b.respawnT = 2;
    }
  } else { H.restT -= dt; if (H.restT <= 0) hordeSpawnWave(); }
  // defeat: no rebuilds left and nobody on the squad still running for a while
  const alive0 = world.bots.some(b => b.team === 0 && !b.dead);
  H.downT = alive0 || H.lives > 0 ? 0 : (H.downT || 0) + dt;
  if (H.downT > BAL.respawnSeconds + 2 && H.wave > 0) endMatch(1);
}
// a squad bot went down: spend a rebuild or stay out until the wave is cleared
function hordeDeath(b) {
  const H = match.horde; if (!H) return;
  if (match.isHost) { if (H.lives > 0) H.lives--; else if (!b.remote) b.respawnT = Infinity; }
  else if (b.isPlayer && H.lives <= 0) b.respawnT = Infinity;
}
function hordeState() { const H = match.horde; return H ? [H.wave, H.lives, H.live ? 1 : 0, Math.round(H.restT)] : null; }
function applyHordeState(a) { if (!Array.isArray(a)) return; const H = match.horde || (match.horde = { wave: 0, lives: 0, live: false, restT: 0 }); if ((a[0] | 0) > H.wave && !HEADLESS) SFX.wave(); if ((a[0] | 0) > H.wave && !HEADLESS) toastCenter((a[0] | 0) % 5 === 0 ? `WAVE ${a[0] | 0} · BOSS INCOMING` : `WAVE ${a[0] | 0}`, 2.6); H.wave = a[0] | 0; H.lives = a[1] | 0; H.live = !!a[2]; H.restT = +a[3] || 0; }
function hordeHud() {
  const el = $('#modeHud'); if (!el) return; const H = match && match.horde;
  if (!H) { if (!world.cores) el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="mh A"><b>WAVE ${Math.max(1, H.wave)} / ${HORDE.waves}</b><span>${H.live ? match.score[1] + ' enemies left' : H.wave ? 'next wave in ' + Math.max(0, Math.ceil(H.restT)) + 's' : 'get ready · ' + Math.max(0, Math.ceil(H.restT)) + 's'}</span></div><div class="mh"><b>REBUILDS</b><span>${H.lives} left for the squad</span></div>`;
}

// ---------- AI goals for the new modes ----------
// returns a point to drive to, or null to fight as usual
function modeGoal(b, brain, tg, d) {
  if (!match) return null;
  if (match.mode === 'koth' && match.hill) {
    const h = match.hill, dh = Math.hypot(h.x - b.pos.x, h.z - b.pos.z);
    if (dh > h.r * .6 && (!tg || d > 55 || brain.role === 'capper')) return h;
    return null;
  }
  if (match.mode === 'ctc' && world.cores) {
    const mine = world.cores[b.team], theirs = world.cores[1 - b.team];
    const at = v => ({ x: v.x, z: v.z, exact: true });
    if (theirs.carrier === b) return at(mine.home); // run it home
    if (mine.st === 2 && (brain.role === 'hunter' || Math.hypot(mine.pos.x - b.pos.x, mine.pos.z - b.pos.z) < 80)) return at(mine.pos);
    if (mine.st === 1 && mine.carrier && brain.role === 'hunter') { brain.target = mine.carrier; return null; }
    // escort our carrier, or go and take theirs
    if (theirs.st === 1 && theirs.carrier && theirs.carrier.team === b.team) return brain.role === 'capper' && (!tg || d > 35) ? theirs.carrier.pos : null;
    if (brain.role === 'capper' && (!tg || d > 30 || Math.hypot(theirs.pos.x - b.pos.x, theirs.pos.z - b.pos.z) < 40)) return at(theirs.pos);
    return null;
  }
  return null;
}

// ---------- skill rating (matchmaking) ----------
// one number per pilot, Elo-style: AI count at a rating from their level
const SR0 = 1000;
const mySR = () => Math.round(progress.sr || SR0);
const aiSR = lv => 760 + lv * 55;
function skillUpdate(won, drew) {
  if (!match || match.mode === 'test' || match.mode === 'horde' || match.spectator || !isTeamMode(match.mode) && match.mode !== 'pit') return 0;
  const P = match.player, sr = b => b.isPlayer ? mySR() : b.human ? (peerSR(b.netId) || SR0) : aiSR(match.aiLv || 5);
  let mine, opp;
  if (match.mode === 'pit') { const others = world.bots.filter(b => b !== P); opp = others.reduce((s, b) => s + sr(b), 0) / Math.max(1, others.length); mine = mySR(); }
  else { const avg = t => { const l = world.bots.filter(b => b.team === t); return l.reduce((s, b) => s + sr(b), 0) / Math.max(1, l.length); }; mine = avg(P.team); opp = avg(1 - P.team); }
  const exp = 1 / (1 + Math.pow(10, (opp - mine) / 400)), res = won ? 1 : drew ? .5 : 0;
  const k = (progress.matches || 0) < 10 ? 48 : 24, perf = clamp((P.kills - P.deaths) * 1.2, -6, 6);
  const delta = Math.round(k * (res - exp) + perf);
  progress.sr = Math.max(100, mySR() + delta); store.set('sfa.progress', progress);
  return delta;
}
function peerSR(id) { const p = NET.slowPeers && NET.slowPeers.find(x => x.peer === id); return p && p.presence && typeof p.presence.sr === 'number' ? p.presence.sr : null; }
// teams by skill: parties stay together; the bigger and stronger groups go first to whichever team is weaker
function skillTeams(pilots, partyOf, srOf) {
  const groups = new Map(); for (const id of pilots) { const k = partyOf(id) || id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(id); }
  const list = [...groups.values()].map(g => ({ ids: g, sr: g.reduce((s, id) => s + (srOf(id) || SR0), 0) })).sort((a, b) => b.ids.length - a.ids.length || b.sr - a.sr);
  const out = {}, c = [0, 0], s = [0, 0];
  for (const g of list) {
    let t = c[0] + g.ids.length - c[1] > 1 ? 1 : c[1] + g.ids.length - c[0] > 1 ? 0 : s[0] <= s[1] ? 0 : 1;
    for (const id of g.ids) out[id] = t; c[t] += g.ids.length; s[t] += g.sr;
  }
  return out;
}
// offline AI follows your rating: stronger pilots meet higher-level, bigger AI
function aiSkillShift() { const d = (mySR() - SR0) / 250; return clamp(Math.round(d), -2, 3); }
function aiBudgetMul() { return clamp(1 + (mySR() - SR0) / 2000, .8, 1.2); }

// ---------- mode picker extras ----------
function brawlBlurb() { const b = brawlNow(); return `This week: ${b.name}. ${b.desc} Changes in ${brawlEndsIn()}.`; }
