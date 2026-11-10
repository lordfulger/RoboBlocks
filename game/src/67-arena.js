// ================= BATTLE ARENA: PROTONIUM REACTORS =================
// Each base has a reactor behind its spawn pad. In Battle Arena, kills and beacons fill a team's bar;
// when a bar is full the OTHER team's reactor loses its shield, and destroying it wins the match.
// The host owns reactor HP. Other players report reactor hits like bot hits, with target id 'R0' or 'R1'.
const RX_R = 6.5;
function buildReactors(s) {
  world.reactors = [];
  for (const team of [0, 1]) {
    const sz = team === 0 ? -world.spawnZ : world.spawnZ, z = sz + (team === 0 ? -50 : 50), x = 0, gy = bedH(x, z);
    const col = team === 0 ? 0x4fb0ff : 0xff5444, g = new T.Group(); g.position.set(x, gy, z);
    const metal = new T.MeshStandardMaterial({ color: 0x3a4248, roughness: .45, metalness: .7 });
    const plinth = new T.Mesh(new T.CylinderGeometry(9, 10.5, 2.4, 8), metal); plinth.position.y = 1.2; g.add(plinth);
    for (let i = 0; i < 4; i++) {
      const a = i * HALF_PI + Math.PI / 4, py = new T.Mesh(new T.BoxGeometry(1.6, 13, 1.6), metal);
      py.position.set(Math.cos(a) * 7, 7.5, Math.sin(a) * 7); py.rotation.z = Math.cos(a) * .18; py.rotation.x = -Math.sin(a) * .18; g.add(py);
      const cap = new T.Mesh(new T.BoxGeometry(2, 1, 2), new T.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 3 })); cap.position.set(Math.cos(a) * 5.8, 14, Math.sin(a) * 5.8); g.add(cap);
    }
    const coreMat = new T.MeshStandardMaterial({ color: 0x222222, emissive: 0x9ff7ff, emissiveIntensity: 3, roughness: .3, metalness: .2 });
    const core = new T.Mesh(new T.IcosahedronGeometry(3.6, 1), coreMat); core.position.y = 8; g.add(core);
    const cage = new T.Mesh(new T.IcosahedronGeometry(4.4, 0), new T.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: .7 })); cage.position.y = 8; g.add(cage);
    const shield = new T.Mesh(new T.SphereGeometry(RX_R + 3.5, 32, 16), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .16, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
    shield.position.y = 8; g.add(shield);
    g.traverse(o => { if (o.isMesh && o !== shield) { o.castShadow = true; o.receiveShadow = true; } });
    s.add(g);
    addObstacle({ x, z, r: 9, cr: 9.5, top: gy + 3 }); // the plinth; the core above is hit-tested as a sphere
    world.reactors.push({ team, x, z, y: gy + 8, group: g, core, cage, coreMat, shield, pos: new T.Vector3(x, gy + 8, z), sparkT: 0 });
  }
}
function reactorsLive() { return match && match.mode === 'arena' && world.reactors; }
function reactorExposed(team) { return !!(reactorsLive() && match.score[1 - team] >= match.limit && match.rx[team] > 0); }
function rxFrac(team) { return match && match.rxMax ? clamp(match.rx[team] / match.rxMax, 0, 1) : 1; }
const RX_PSEUDO = [{ netId: 'R0' }, { netId: 'R1' }];
function reactorDamage(team, amt, attacker) {
  if (!reactorExposed(team) || match.over || amt <= 0) return;
  if (attacker && attacker.team === team) return;
  if (attacker) { attacker.dmgDealt += amt; if (attacker.isPlayer) { hitmarkT = .12; if (clock - hitSoundT > .06) { hitSoundT = clock; SFX.hit(); } } }
  if (match.isHost) {
    match.rx[team] = Math.max(0, match.rx[team] - amt);
    if (match.rx[team] <= 0) reactorDestroyed(team);
  } else if (attacker && !attacker.remote) netReportHit(attacker, RX_PSEUDO[team], 0, amt);
}
function reactorDestroyed(team) {
  const r = world.reactors[team];
  for (let i = 0; i < 4; i++) setTimeout(() => explosion(r.pos.clone().add(new T.Vector3(rand(-4, 4), rand(-2, 5), rand(-4, 4))), true), i * 180);
  if (match.isHost && !match.over) endMatch(1 - team);
}
// projectile vs reactor sphere: true when the projectile is used up
function reactorHitTest(p, pos) {
  if (!world.reactors) return false;
  for (const r of world.reactors) {
    if (r.team === p.team) continue;
    const d2 = pos.distanceToSquared(r.pos), live = reactorsLive() && match.rx[r.team] > 0;
    if (!live) { if (d2 < RX_R * RX_R) { sparks(pos, 0xffe0a0, 3, 5, .14, .25); if (p.splash) impact(p, pos); return true; } continue; }
    const exposed = reactorExposed(r.team), R = exposed ? RX_R : RX_R + 3.5;
    if (d2 > R * R) continue;
    if (!exposed) { sparks(pos, r.team === 0 ? 0x8fd8ff : 0xff9a8a, 4, 5, .16, .3); return true; }
    if (p.splash) { impact(p, pos); return true; }
    if (!p.ghost) reactorDamage(r.team, p.dmg, p.owner);
    sparks(pos, 0x9ff7ff, 5, 7, .16, .35); return true;
  }
  return false;
}
function reactorSplash(pos, R, dmg, owner, team) {
  if (!reactorsLive()) return;
  for (const r of world.reactors) if (r.team !== team && reactorExposed(r.team)) { const d = pos.distanceTo(r.pos); if (d < RX_R + R) reactorDamage(r.team, dmg * .55 * (1 - Math.max(0, d - RX_R) / R * .75), owner); }
}
// ray vs reactor for hitscan weapons: distance along the ray, or Infinity
function reactorRay(from, dir, owner) {
  let best = Infinity, hit = null;
  if (!world.reactors) return { t: best, r: hit };
  for (const r of world.reactors) {
    if (owner && r.team === owner.team) continue;
    const R = reactorExposed(r.team) || !reactorsLive() ? RX_R : RX_R + 3.5;
    const L = _v2.copy(r.pos).sub(from), tc = L.dot(dir), d2 = L.lengthSq() - tc * tc;
    if (tc < 0 || d2 > R * R) continue; const t = tc - Math.sqrt(R * R - d2);
    if (t < best) { best = Math.max(0, t); hit = r; }
  }
  return { t: best, r: hit };
}
function resetReactors() {
  const N = match.n || 10;
  match.rxMax = Math.round(16000 * Math.sqrt(N / 10) * (N >= 10 ? 1.6 : 1) * BAL.reactorHealth);
  match.rx = [match.rxMax, match.rxMax]; match.rxSeen = [false, false];
  if (!world.reactors) return;
  for (const r of world.reactors) { r.core.visible = r.cage.visible = true; r.shield.visible = true; r.group.visible = true; }
  const el = $('#reactors'); if (el) el.hidden = match.mode !== 'arena';
}
function updateReactors(dt) {
  if (!world.reactors || !match) return;
  const arena = match.mode === 'arena';
  for (const r of world.reactors) {
    const alive = !arena || match.rx[r.team] > 0, exposed = arena && reactorExposed(r.team), f = arena ? rxFrac(r.team) : 1;
    r.core.visible = r.cage.visible = alive;
    r.shield.visible = alive && !exposed;
    if (!alive) continue;
    r.core.rotation.y += dt * (exposed ? 2.4 : .6); r.core.rotation.x += dt * .3; r.cage.rotation.y -= dt * .4;
    const pulse = 1 + .25 * Math.sin(world.time * (exposed ? 9 : 2.5));
    r.coreMat.emissiveIntensity = (exposed ? 1.6 + 2.4 * f : 3) * pulse * (exposed && Math.random() < .08 ? .3 : 1);
    if (r.shield.visible) r.shield.material.opacity = .12 + .05 * Math.sin(world.time * 3 + r.team);
    if (exposed) {
      r.sparkT -= dt;
      if (r.sparkT <= 0 && !HEADLESS) { r.sparkT = .1 + f * .4; sparks(r.pos, 0x9ff7ff, 3, 6, .14, .4); if (f < .5) emit(r.pos.x + rand(-2, 2), r.pos.y + 2, r.pos.z + rand(-2, 2), rand(-.5, .5), rand(2, 4), rand(-.5, .5), rand(1.2, 2), rand(.8, 1.4), 0x2c2826, -.4); }
    }
  }
  if (!arena) return;
  // announcements on every client when a reactor's shield drops
  for (const t of [0, 1]) {
    const ex = reactorExposed(t);
    if (ex && !match.rxSeen[t]) { match.rxSeen[t] = true; const ours = t === match.player.team; toastCenter(ours ? 'Our reactor is exposed! Defend it' : 'Enemy reactor exposed! Destroy it', 3); if (!HEADLESS) SFX.capture(!ours); }
  }
}
function updateReactorHud() {
  const el = $('#reactors'); if (!el || el.hidden || !match.rxMax) return;
  const my = match.player.team;
  el.querySelectorAll('.rx').forEach((row, i) => {
    const t = i === 0 ? my : 1 - my, f = rxFrac(t), ex = reactorExposed(t);
    row.querySelector('i').style.width = (f * 100).toFixed(1) + '%';
    row.classList.toggle('open', ex); row.classList.toggle('gone', f <= 0);
    row.querySelector('b').textContent = f <= 0 ? 'DESTROYED' : ex ? Math.ceil(f * 100) + '%' : 'SHIELDED';
  });
}
function drawReactorsOnMap(g, mx, my) {
  if (!world.reactors || match.mode !== 'arena') return;
  for (const r of world.reactors) {
    const x = mx(r.x), y = my(r.z), ex = reactorExposed(r.team);
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
    g.fillStyle = r.team === 0 ? '#4fb0ff' : '#ff5444'; g.strokeStyle = ex && (world.time * 4 | 0) % 2 ? '#fff' : '#000'; g.lineWidth = 2.5;
    g.fillRect(-8, -8, 16, 16); g.strokeRect(-8, -8, 16, 16); g.restore();
  }
}
// AI: when the enemy reactor is open, push it; aim at the core if no enemy is close
function aiReactorGoal(b) {
  if (!reactorsLive()) return null;
  const r = world.reactors[1 - b.team]; return reactorExposed(r.team) ? r : null;
}
