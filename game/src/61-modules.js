// ================= ENERGY, MODULES, ARC LANCE, GRAVITY MINES, RAIL LANCER =================
// Modules run on energy (100 + 25 per Power Cell, refilling 9 a second). Each module type has its own key.
// Effects on other bots (EMP stun, disruption) travel with damage reports in multiplayer.
function botEnergyInit(b) {
  const s = b.stats || { modules: {} };
  b.mods = {}; for (const t of MODULE_TYPES) if (s.modules[t]) b.mods[t] = s.modules[t];
  b.energyMax = 100 + 25 * (b.mods.power || 0); b.energy = b.energyMax; b.modCd = {};
  b.cloakT = 0; b.stunT = 0; b.disruptT = 0; b.charge = 0;
}
function hasModule(b, t) { return !!(b.mods && b.mods[t] && b.cellList.some(c => c.alive && PARTS[c.t].module === t)); }
function moduleReady(b, t) { const M0 = MODULES[t]; return hasModule(b, t) && !(b.modCd[t] > 0) && b.disruptT <= 0 && b.stunT <= 0 && b.energy >= M0.cost; }
function useModule(b, t) {
  if (!moduleReady(b, t)) { if (b.isPlayer && hasModule(b, t)) { SFX.ui(); toastCenter(b.disruptT > 0 ? 'Modules disrupted!' : b.modCd[t] > 0 ? `${MODULES[t].name} recharging` : 'Not enough energy', .8); } return false; }
  const M0 = MODULES[t]; b.energy -= M0.cost; b.modCd[t] = M0.cd * upMod(b); if (b.qs) b.qs.mods++;
  const c = b.center.clone();
  if (t === 'shield') { b.shieldT = Math.max(b.shieldT, 3); if (!HEADLESS) shockwave(c, 4, 0x5fe8ff); }
  else if (t === 'cloak') { b.cloakT = 6; if (!HEADLESS) sparks(c, 0xc77dff, 18, 6, .16, .5); }
  else if (t === 'blink') {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), sp = Math.hypot(b.vel.x, b.vel.z);
    let dx = sp > 2 ? b.vel.x / sp : fx, dz = sp > 2 ? b.vel.z / sp : fz, dist = 30;
    // stop short of rocks and buildings
    for (let d = 3; d <= 30; d += 1.5) { const x = b.pos.x + dx * d, z = b.pos.z + dz * d; if (rocksAt(x, z).some(o => Math.hypot(o.x - x, o.z - z) < o.cr + b.radius * .8 && o.top > terrainH(x, z) + 1.5) || Math.abs(x) > world.bound || Math.abs(z) > world.bound) { dist = d - 2; break; } }
    if (!HEADLESS) { flash(c, 3, 0x5aa8ff, .3); sparks(c, 0x5aa8ff, 16, 8, .16, .4); }
    b.pos.x += dx * dist; b.pos.z += dz * dist; const gy = terrainH(b.pos.x, b.pos.z) - b.bottomLocal + .5; if (b.pos.y < gy) b.pos.y = gy;
    b.updateTransform(); if (!HEADLESS) flash(b.center.clone(), 3, 0x5aa8ff, .3);
  }
  else if (t === 'emp' || t === 'disrupt') {
    const R = t === 'emp' ? 25 : 30;
    if (!HEADLESS) { shockwave(c, R, t === 'emp' ? 0xffe14a : 0xff3050); flash(c, 5, t === 'emp' ? 0xffe14a : 0xff3050, .35); }
    for (const o of world.bots) {
      if (o.dead || o.team === b.team || o.center.distanceTo(c) > R + o.radius) continue;
      if (o.shieldT > 0) continue;
      if (t === 'emp') applyStatus(o, 'e', 2.5, b); else applyStatus(o, 'x', 8, b);
    }
  }
  else if (t === 'fly') { b.flyT = 6; b.flyAlt = 9; b.vel.y = Math.max(b.vel.y, 7); if (!HEADLESS) { flash(c, 2.5, 0xffa040, .25); SFX.flyStart(c, b.isPlayer); } }
  else if (t === 'power') { b.energy = Math.min(b.energyMax, b.energy + 60); if (!HEADLESS) sparks(c, 0x4dff8f, 14, 5, .14, .5); }
  if (!HEADLESS) SFX.mod(t, c);
  if (t !== 'cloak' && b.cloakT > 0 && t !== 'power') b.cloakT = 0;
  return true;
}
// status effects: applied here when we own the bot, reported to the owner otherwise
function applyStatus(o, kind, secs, by) {
  if (o.remote) { if (by && !by.remote) netReportStatus(by, o, kind, secs); return; }
  if (kind === 'e') { o.stunT = Math.max(o.stunT || 0, secs); if (o.isPlayer) toastCenter('Stunned by EMP!', 1.2); }
  else { o.disruptT = Math.max(o.disruptT || 0, secs); o.energy = Math.max(0, (o.energy || 0) - 50); o.cloakT = 0; if (o.isPlayer) toastCenter('Modules disrupted!', 1.2); }
}
function moduleTick(b, dt) {
  if (!b.mods) return;
  b.energy = Math.min(b.energyMax, b.energy + dt * (b.disruptT > 0 ? 0 : 9));
  for (const t in b.modCd) if (b.modCd[t] > 0) { b.modCd[t] -= dt; if (b.modCd[t] <= 0 && b.isPlayer && !HEADLESS) SFX.ready(t); }
  b.cloakT = Math.max(0, b.cloakT - dt); b.stunT = Math.max(0, b.stunT - dt); b.disruptT = Math.max(0, b.disruptT - dt);
  b.cloaked = b.cloakT > 0;
  if (b.stunT > 0) { const inp = b.input; inp.throttle = inp.steer = inp.strafe = 0; inp.fire = inp.jet = inp.up = inp.dash = false; if (!HEADLESS && Math.random() < dt * 10) sparks(b.center, 0xffe14a, 2, 5, .12, .25); }
  if (b.input.mod) { const t = b.input.mod; b.input.mod = null; if (!b.remote) useModule(b, t); }
}
// seen by the viewer? enemies under cloak vanish beyond 12 m
function visibleToViewer(b) {
  if (!b.cloaked || !match || !match.player) return true;
  if (b.team === match.player.team) return true;
  return b.center.distanceTo(camera.position) < 14 || (match.player && !match.player.dead && b.center.distanceTo(match.player.center) < 12);
}
// ---------- new weapons ----------
// Arc Lance: a continuous beam, damage every tick it touches
function fireArc(owner, from, aim) {
  const W = WEAPONS.arc, dir = aim.clone().sub(from).normalize(), r = traceBeam(owner, from, dir, W.range, W.dmg * match.dmgScale, false);
  if (HEADLESS) return;
  // jagged lightning: a few short beams with random kinks
  let a = from.clone(); const n = 5, end = r.end;
  for (let i = 1; i <= n; i++) { const b2 = from.clone().lerp(end, i / n); if (i < n) b2.add(new T.Vector3(rand(-.5, .5), rand(-.5, .5), rand(-.5, .5))); beam(a, b2, 0xaff6ff, .07, .08); a = b2; }
  if (r.bot && Math.random() < .5) sparks(end, 0xbff8ff, 3, 6, .12, .25);
  if (owner.isPlayer || Math.random() < .3) SFX.arc(end);
}
// Gravity Mine: lobbed, arms after a second, pulls enemies in, then bursts
function fireMine(owner, from, aim) {
  const W = WEAPONS.mine, mine = world.projs.filter(p => p.type === 'mine' && p.owner === owner);
  if (mine.length >= 6) { const old = mine[0]; old.life = 0; }
  const g = W.grav * GRAV / 22, vel = solveBallistic(from, aim.distanceTo(from) > W.range ? from.clone().add(aim.clone().sub(from).setLength(W.range)) : aim, W.speed, Math.max(g, world.space ? 0 : g));
  const m = new T.Mesh(world.mineGeo || (world.mineGeo = new T.OctahedronGeometry(.45, 0)), owner.team === 0 ? (world.mineMatA || (world.mineMatA = new T.MeshBasicMaterial({ color: new T.Color(0x9a7dff).multiplyScalar(2.2) }))) : (world.mineMatE || (world.mineMatE = new T.MeshBasicMaterial({ color: new T.Color(0xff5ab0).multiplyScalar(2.2) }))));
  m.position.copy(from);
  world.projs.push({ type: 'mine', pos: from.clone(), vel, grav: g, splash: W.splash, dmg: W.dmg * match.dmgScale, owner, team: owner.team, life: W.life, mesh: m, arm: 1, landed: false, trail: 0x9a7dff });
  if (!HEADLESS) { flash(from, 1, 0x9a7dff, .1); SFX.mine(from); }
}
// returns true when the mine is used up
function updateMine(p, dt) {
  if (!p.landed) {
    p.vel.y -= p.grav * dt; p.pos.addScaledVector(p.vel, dt);
    const gy = terrainH(p.pos.x, p.pos.z) + .4;
    if (world.space) { p.vel.multiplyScalar(Math.exp(-2.5 * dt)); if (p.vel.lengthSq() < 1) { p.landed = true; p.vel.set(0, 0, 0); } }
    if (p.pos.y <= gy) { p.pos.y = gy; p.landed = true; p.vel.set(0, 0, 0); if (!HEADLESS) sparks(p.pos, 0x9a7dff, 6, 4, .12, .3);
      // landing inside an enemy's reach: the well snaps shut almost at once, otherwise it waits as a mine
      if (world.bots.some(b => !b.dead && b.team !== p.team && b.center.distanceTo(p.pos) < WEAPONS.mine.pull + b.radius)) p.arm = Math.min(p.arm, .3); }
    for (const r of rocksAt(p.pos.x, p.pos.z)) { if (p.pos.y > r.top) continue; if (Math.hypot(p.pos.x - r.x, p.pos.z - r.z) < r.cr) { p.landed = true; p.vel.set(0, 0, 0); } }
    return false;
  }
  p.arm -= dt; p.mesh.rotation.y += dt * 3; p.mesh.position.y = p.pos.y + Math.sin(world.time * 4) * .1;
  if (p.arm > 0) return false;
  const W = WEAPONS.mine; let trig = false;
  for (const b of world.bots) {
    if (b.dead || b.team === p.team) continue;
    const d = b.center.distanceTo(p.pos);
    if (d < W.pull + b.radius) { // gravity well tugs them in
      if (!b.remote) { const k = (1 - d / (W.pull + b.radius)) * 30 * dt; b.vel.x += (p.pos.x - b.pos.x) / Math.max(1, d) * k * 6; b.vel.z += (p.pos.z - b.pos.z) / Math.max(1, d) * k * 6; }
      if (d < 3.2 + b.radius * .5) trig = true;
    }
  }
  if (!HEADLESS && Math.random() < dt * 6) emit(p.pos.x + rand(-2, 2), p.pos.y + rand(0, 1), p.pos.z + rand(-2, 2), 0, .5, 0, .6, .25, 0x9a7dff, -.5, 2);
  if (trig || p.life <= .05) { impact(p, p.pos); if (!HEADLESS) shockwave(p.pos, W.splash * 2.2, 0x9a7dff); return true; }
  return false;
}
// Rail Lancer: holding fire charges the coils; at full charge it fires by itself
function lancerTick(b, dt, guns) {
  const W = WEAPONS.lancer, firing = b.input.fire && b.input.weapon === 'lancer' && guns.length && b.fireT <= 0;
  b.charge = firing ? Math.min(W.charge, (b.charge || 0) + dt) : Math.max(0, (b.charge || 0) - dt * 2);
  const k = b.charge / W.charge;
  for (const c of b.guns.lancer) if (c.charge) c.charge.forEach((m, i) => { m.userData.off = false; m.scale.x = k > i / 4 ? 1.3 : 1; });
  if (b.isPlayer && firing && Math.random() < dt * 12) SFX.zap && SFX.zap(b.center);
  if (k < 1) return false;
  b.charge = 0; return true;
}
function fireLancer(owner, from, aim) {
  const W = WEAPONS.lancer, dir = aim.clone().sub(from).normalize();
  const r = traceBeam(owner, from, dir, W.range, W.dmg * match.dmgScale, false);
  if (HEADLESS) return;
  beam(from, r.end, 0xffffff, .32, .6); beam(from, r.end, owner.team === 0 ? 0x8ff0ff : 0xff9a5a, .6, .35);
  shockwave(r.end, 5, 0x9ff3ff); flash(from, 2.4, 0x9ff3ff, .2); sparks(r.end, 0xffffff, 18, 10, .2, .5); addScorch(r.end, 1.6);
  SFX.lancer(from); if (owner.isPlayer) cam.shake = Math.max(cam.shake, .45);
}
// AI designs pick up modules and the newer weapons as their level allows
function addAiExtras(d, rnd, lv) {
  const occ = new Set(d.blocks.map(b => ckey(b.x, b.y, b.z)));
  const mods = ['m_shield', 'm_power', 'm_cloak', 'm_blink', 'm_emp', 'm_disrupt', 'm_fly'].filter(t => PARTS[t].lvl <= lv);
  const want = lv >= 4 ? (rnd() < .65 ? 1 : 0) + (lv >= 7 && rnd() < .4 ? 1 : 0) : 0;
  for (let i = 0; i < want && mods.length; i++) {
    const t = mods[rnd() * mods.length | 0];
    // on top of the hull, near the middle
    const tops = d.blocks.filter(b => PARTS[b.t].shape && !occ.has(ckey(b.x, b.y + 1, b.z))).sort((a, b) => (Math.abs(a.x) + Math.abs(a.z)) - (Math.abs(b.x) + Math.abs(b.z)));
    const spot = tops[(rnd() * Math.min(6, tops.length)) | 0]; if (!spot) break;
    d.blocks.push({ x: spot.x, y: spot.y + 1, z: spot.z, t, c: spot.c, r: 0 }); occ.add(ckey(spot.x, spot.y + 1, spot.z));
  }
  // armor materials for variety: heavy brawlers, light flyers, glowing energy armor late on
  const mr = rnd(), mat = lv >= 8 && mr < .12 ? 'energy' : lv >= 3 && mr < .3 ? 'heavy' : lv >= 2 && mr < .45 ? 'light' : lv >= 5 && mr < .55 ? 'reactive' : null;
  if (mat) for (const b of d.blocks) if (PARTS[b.t].shape) b.m = mat;
  if (lv >= 9 && rnd() < .2) { const tops = d.blocks.filter(b => PARTS[b.t].shape && !occ.has(ckey(b.x, b.y + 1, b.z))); const s = tops[0]; if (s) { d.blocks.push({ x: s.x, y: s.y + 1, z: s.z, t: 'projector', c: s.c, r: 0 }); occ.add(ckey(s.x, s.y + 1, s.z)); } }
  const swap = lv >= 9 && rnd() < .15 ? 'lancer' : lv >= 6 && rnd() < .14 ? 'arc' : lv >= 5 && rnd() < .12 ? 'mine' : null;
  if (swap) for (const b of d.blocks) if (PARTS[b.t].weapon && b.t !== 'nano') b.t = swap;
  return d;
}
