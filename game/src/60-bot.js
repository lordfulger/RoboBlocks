// ================= BOT =================
const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3();
class Bot {
  constructor(dsg, team, name, opts = {}) {
    this.design = dsg; this.team = team; this.name = name; this.isPlayer = !!opts.player; this.dummy = !!opts.dummy;
    this.kills = 0; this.deaths = 0; this.dmgDealt = 0;
    this.pos = new T.Vector3(); this.vel = new T.Vector3(); this.yaw = 0; this.pitch = 0; this.roll = 0; this.yawVel = 0; this.vf = 0;
    this.inv = new T.Matrix4(); this.center = new T.Vector3();
    this.dead = true; this.respawnT = 0; this.fireT = 0; this.gunIdx = 0; this.fuel = 1; this.lastHitBy = null; this.lastHitT = -9;
    this.input = { throttle: 0, steer: 0, strafe: 0, jet: false, up: false, down: false, dash: false, fire: false, aim: new T.Vector3(), weapon: 'blaster' };
    this.dashCd = 0; this.dashT = 0; this.alt = 0; this.shieldT = 0; this.lock = null; this.spin = 0; this.healed = 0; this.airborne = false; this.vs = 0;
    this.brain = opts.ai ? new Brain(this) : null;
    this.remote = !!opts.remote; this.netId = opts.netId || null; this.human = !!opts.human; this.spawnCount = 0; this.killerId = '';
    this.home = opts.home || null; statInit(this);
  }
  build() {
    this.finish = this.design.f || 'standard'; this.propInit = null;
    const bl = this.design.blocks; let sx = 0, sz = 0, minY = Infinity, maxY = -Infinity;
    for (const b of bl) { sx += b.x; sz += b.z; minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y); }
    const cx = this.cx = sx / bl.length, cz = this.cz = sz / bl.length; this.minY = minY;
    this.group = new T.Group(); this.group.rotation.order = 'YXZ';
    this.cells = new Map(); this.cellList = [];
    const topTier = bl.reduce((a, b) => isShape(b.t) ? Math.max(a, b.k || 1) : a, 1), gunMul = gunHpMul(topTier);
    for (const b of bl) {
      const p = makePart(b.t, b.c, b.r || 0, b.k || 1, this.finish, b.m);
      p.root.position.set(b.x - cx, b.y - minY, b.z - cz);
      p.root.traverse(o => { if (o.isMesh && o.material !== M.flame) o.castShadow = true; });
      this.group.add(p.root);
      const cell = { x: b.x, y: b.y, z: b.z, t: b.t, c: b.c, k: b.k || 1, m: b.m, mr: isMountable(b.t) ? (b.r || 0) & 63 : 0, hp: partHp(b) * (PARTS[b.t] && PARTS[b.t].weapon ? gunMul : 1), max: partHp(b) * (PARTS[b.t] && PARTS[b.t].weapon ? gunMul : 1), obj: p.root, head: p.head, muzzle: p.muzzle, wheel: p.wheel, flame: p.flame, rotor: p.rotor, spin: p.spin, leg: p.leg, flag: p.flag, prop: p.prop, charge: p.charge, core: p.core, thrust: !!p.thrust, fly: !!p.fly, recoil: p.recoil, kick: 0, r: b.r || 0, alive: true, burnt: false };
      cell.idx = this.cellList.length; this.cells.set(ckey(b.x, b.y, b.z), cell); this.cellList.push(cell);
    }
    this.meshes = [];
    for (const c of this.cellList) { let first = true; c.obj.traverse(o => { if (o.isMesh) { o.visible = false; if (o === c.flame) o.userData.off = true; this.meshes.push({ m: o, cell: c, first }); first = false; } }); }
    this.height = maxY - minY + 1;
    this.centerLocal = new T.Vector3(0, (maxY - minY) / 2, 0);
    this.maxHp = this.cellList.reduce((a, c) => a + c.hp, 0); this.initCount = this.cellList.length;
    this.shield = new T.Mesh(world.shieldGeo, new T.MeshBasicMaterial({ color: new T.Color(this.team === 0 ? 0x4fb0ff : 0xff6a50).multiplyScalar(1.6), transparent: true, opacity: .25, blending: T.AdditiveBlending, depthWrite: false }));
    this.shield.position.copy(this.centerLocal); this.shield.scale.setScalar(Math.max(3, this.height * .9 + 1.5)); this.shield.visible = false; this.group.add(this.shield);
    if (!this.isPlayer) { this.tag = makeTag(this); this.tag.sprite.position.set(0, this.height + 1.6, 0); this.group.add(this.tag.sprite); }
    this.recalc();
  }
  recalc() {
    const alive = this.cellList.filter(c => c.alive); this.alive = alive;
    this.stats = computeStats(alive); this.mob = world.space ? spaceMobility(this.stats) : mobility(this.stats);
    // losing wheels, treads, legs, hover pads, rotors, wings or thrusters slows you, even when what is left could carry the weight
    const prop = propulsionOf(this.stats); if (this.propInit == null) this.propInit = prop;
    const pf = this.propInit > 0 ? clamp(prop / this.propInit, 0, 1) : 1;
    if (pf < 1) { const m = this.mob = { ...this.mob }, k = pf > 0 ? .25 + .75 * pf : 0; m.maxSpeed *= k; m.accel *= k; m.turn *= pf > 0 ? .5 + .5 * pf : .3; if (m.maxAlt) m.maxAlt *= .5 + .5 * pf; }
    this.propFrac = pf;
    this.bottomLocal = this.stats.bottom - this.minY;
    this.hp = alive.reduce((a, c) => a + Math.max(0, c.hp), 0);
    this.guns = {}; for (const t of WTYPES) this.guns[t] = []; this.wheels = []; this.flames = []; this.teslas = []; this.rotors = []; this.legs = []; this.flags = []; this.shields = []; this.props = []; this.energyCells = []; this.spikes = 0;
    let r = 0, r3 = 0;
    for (const c of alive) {
      if (PARTS[c.t].weapon) this.guns[c.t].push(c);
      if (c.wheel) this.wheels.push(c); if (c.flame) this.flames.push(c); if (c.t === 'tesla') this.teslas.push(c); if (c.rotor) this.rotors.push(c); if (c.leg) this.legs.push(c); if (c.flag) this.flags.push(c); if (c.t === 'shieldp') this.shields.push(c); if (c.prop) this.props.push(c); if (c.m === 'energy') this.energyCells.push(c); if (c.t === 'spike') this.spikes++;
      const lx = c.x - this.cx, lz = c.z - this.cz, ly = c.y - this.minY - this.centerLocal.y;
      r = Math.max(r, Math.hypot(lx, lz)); r3 = Math.max(r3, Math.hypot(lx, ly, lz));
    }
    this.radius = r + .6; this.radius3 = r3 + 1.2;
    if (this.tag) this.tag.dirty = true;
  }
  spawn(pos, yaw) {
    this.spawnCount++;
    this.build(); this.pos.copy(pos); this.yaw = yaw; this.pitch = this.roll = 0; this.vel.set(0, 0, 0); this.fuel = 1;
    this.pos.y = terrainH(pos.x, pos.z) - this.bottomLocal + 1.5;
    this.dead = false; this.lastHitBy = null; this.spawnT = 0; this.dashCd = 0; this.spin = 0; this.lock = null; this.heat = 0; this.overT = 0; this.flyT = 0;
    this.alt = this.mob.mode === 'rotor' ? 10 : 0; this.shieldT = match && match.mode === 'test' ? 0 : 3.5;
    if (world.space) { this.pos.y = pos.y || 50; this.alt = this.pos.y; }
    botEnergyInit(this);
    const proj = this.cellList.filter(c => c.t === 'projector').length; this.barrierMax = proj ? 1500 * (1 + (proj - 1) * .5) * (match ? match.dmgScale : 1) : 0; this.barrier = this.barrierMax;
    world.scene.add(this.group); this.updateTransform();
    if (this.isPlayer) { cam.yaw = yaw; cam.pitch = -.12; SFX.spawn(); }
  }
  updateTransform() {
    this.group.position.copy(this.pos); this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.group.updateMatrixWorld(true); this.inv.copy(this.group.matrixWorld).invert();
    this.center.copy(this.centerLocal).applyMatrix4(this.group.matrixWorld);
  }
  cellAt(p) {
    _v1.copy(p).applyMatrix4(this.inv);
    const c = this.cells.get(ckey(Math.round(_v1.x + this.cx), Math.round(_v1.y + this.minY), Math.round(_v1.z + this.cz)));
    return c && c.alive ? c : null;
  }
  cellWorld(c, out) { return out.set(c.x - this.cx, c.y - this.minY, c.z - this.cz).applyMatrix4(this.group.matrixWorld); }
  damageCell(c, dmg, attacker) {
    if (!c.alive || this.dead) return dmg;
    if (attacker && attacker.dmgMul) dmg *= attacker.dmgMul; // e.g. horde enemies
    if (this.shieldT > 0) return 0;
    if (this.remote && attacker && !attacker.remote) netReportHit(attacker, this, c.idx, dmg);
    if (this.barrier > 0) { const soak = Math.min(this.barrier, dmg); this.barrier -= soak; dmg -= soak; this.barrierFlash = 1; if (!HEADLESS && clock - (this.barrierHitT || -9) > .15) SFX.shieldHit(this.center); this.barrierHitT = clock; if (!HEADLESS && Math.random() < .3) sparks(this.cellWorld(c, _v3), 0x5fe8ff, 3, 5, .14, .25); if (dmg <= 0) { this.lastHitT = clock; return 0; } }
    const dealt = Math.min(c.hp, dmg); c.hp -= dmg; this.hp -= dealt;
    if (attacker && attacker !== this) { attacker.dmgDealt += dealt; this.lastHitBy = attacker; if (attacker.qs && attacker.team !== this.team) statDamage(attacker, dealt); }
    this.lastHitT = clock; if (this.tag) this.tag.dirty = true;
    if (c.hp <= 0) { this.destroyCell(c); return -c.hp; }
    if (!c.burnt && c.hp < c.max * .45 && isShape(c.t) && c.m !== 'energy') { c.burnt = true; c.obj.children[0].material = tierMat(c.c, c.k, true); }
    return 0;
  }
  destroyCell(c) {
    c.alive = false; this.needCheck = true;
    const wp = this.cellWorld(c, new T.Vector3());
    world.scene.attach(c.obj);
    addDebris(c.obj, this.vel.clone().add(new T.Vector3(rand(-4, 4), rand(3, 7), rand(-4, 4))), new T.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), rand(.9, 1.6));
    sparks(wp, 0xffd27a, 7, 8, .16, .4); if (Math.random() < .35) SFX.crunch(wp);
    if (Math.random() < .25) emit(wp.x, wp.y, wp.z, rand(-1, 1), 2, rand(-1, 1), 1.2, .6, 0x3b3430, -1.5);
  }
  checkIntegrity() {
    this.needCheck = false; if (this.dead) return;
    const seat = this.cellList.find(c => c.t === 'seat');
    if (!seat || !seat.alive) return this.remote ? undefined : this.die();
    const seen = new Set([ckey(seat.x, seat.y, seat.z)]); const q = [seat];
    while (q.length) { const c = q.pop(); for (const [dx, dy, dz] of NB) { const k = ckey(c.x + dx, c.y + dy, c.z + dz); if (seen.has(k)) continue; const n = this.cells.get(k); if (n && n.alive) { seen.add(k); q.push(n); } } }
    const loose = this.cellList.filter(c => c.alive && !seen.has(ckey(c.x, c.y, c.z)));
    if (loose.length) {
      const cen = new T.Vector3(); for (const c of loose) cen.add(this.cellWorld(c, _v2)); cen.divideScalar(loose.length);
      const chunk = new T.Group(); chunk.position.copy(cen); chunk.quaternion.copy(this.group.quaternion); world.scene.add(chunk); chunk.updateMatrixWorld();
      for (const c of loose) { c.alive = false; chunk.attach(c.obj); }
      const out = cen.clone().sub(this.center).setY(0).normalize().multiplyScalar(3);
      addDebris(chunk, this.vel.clone().add(out).add(new T.Vector3(0, 3, 0)), new T.Vector3(rand(-1.5, 1.5), rand(-1, 1), rand(-1.5, 1.5)), 4.5);
      SFX.pop();
    }
    const alive = this.cellList.reduce((a, c) => a + (c.alive ? 1 : 0), 0);
    if (!this.remote && alive < this.initCount * .35) return this.die();
    this.recalc();
  }
  die(forced) {
    if (this.dead || (this.remote && forced === undefined)) return; this.dead = true; this.deaths++;
    const killer = forced !== undefined ? forced : this.lastHitBy && clock - this.lastHitT < 12 ? this.lastHitBy : null;
    this.killerId = killer ? killer.netId || '' : '';
    explosion(this.center.clone(), true);
    for (const c of this.cellList) {
      if (!c.alive) continue; c.alive = false;
      const wp = this.cellWorld(c, new T.Vector3()); world.scene.attach(c.obj);
      const out = wp.clone().sub(this.center); out.y = Math.abs(out.y) + .8; out.normalize().multiplyScalar(rand(5, 14));
      addDebris(c.obj, this.vel.clone().add(out), new T.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), rand(2, 3.6));
    }
    if (this.tag) { this.tag.tex.dispose(); this.tag.sprite.material.dispose(); }
    world.scene.remove(this.group);
    this.respawnT = this.remote || match.mode === 'elim' || (match.mode === 'horde' && this.team === 1) ? Infinity : match.mode === 'test' ? 3 : BAL.respawnSeconds;
    if (match.mode === 'horde' && this.team === 0) hordeDeath(this);
    onKill(killer, this);
  }
  physics(dt) {
    const inp = this.input, m = this.mob;
    if (this.dummy) { inp.throttle = inp.steer = inp.strafe = 0; inp.jet = inp.up = inp.down = inp.dash = false; }
    this.shieldT = Math.max(0, this.shieldT - dt); if (this.dashCd > 0) { this.dashCd = Math.max(0, this.dashCd - dt); if (!this.dashCd && this.isPlayer && !HEADLESS) SFX.ready('dash'); }
    moduleTick(this, dt);
    if (this.shield) { this.shield.visible = this.shieldT > 0; if (this.shieldT > 0) this.shield.material.opacity = .18 + .12 * Math.sin(clock * 12) * Math.min(1, this.shieldT); }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    const air = m.mode === 'hover' || m.mode === 'rotor' || m.mode === 'plane' || m.mode === 'space' || !!world.space, strafer = m.mode === 'hover' || m.mode === 'rotor' || m.mode === 'space';
    const solid = air || !(world.liquid && world.liquid.type === 'lava');
    const gi = this.groundInfo(fx, fz, lx, lz, solid);
    const above = this.pos.y + this.bottomLocal - gi.ground;
    const grounded = above < .15;
    const onIce = world.liquid && world.liquid.type === 'ice' && bedH(this.pos.x, this.pos.z) < world.liquid.y;
    this.airborne = above > 3;
    let driving = false;
    // Sky Booster: a few seconds of rocket flight for bots that normally stay on the ground
    const fly = this.flyT > 0 && !air && m.mode !== 'none';
    if (this.flyT > 0) { this.flyT -= dt; if (this.flyT <= 0 && this.isPlayer && !HEADLESS) SFX.flyEnd(); }
    if (fly) {
      if (inp.up || inp.jet) this.flyAlt = Math.min(22, this.flyAlt + 8 * dt);
      if (inp.down) this.flyAlt = Math.max(1, Math.min(this.flyAlt, above + 1) - 18 * dt);
      const goal = this.flyT < 1.2 ? Math.min(this.flyAlt, this.flyT * 6) : this.flyAlt; // eases down as the fuel runs out
      this.vel.y += ((goal - above) * 3.6 - this.vel.y * 2.4) * dt + GRAV * dt; this.vel.y = clamp(this.vel.y, -14, 14);
      driving = true; inp.jet = false;
      if (!HEADLESS && Math.random() < dt * 30) emit(this.pos.x + rand(-.5, .5), this.pos.y + this.bottomLocal - .4, this.pos.z + rand(-.5, .5), rand(-.5, .5), -rand(4, 7), rand(-.5, .5), rand(.5, .9), rand(.5, .9), 0xffa040, 0, 0);
    }
    if (air) {
      // Space climbs and C descends at a steady rate; letting go holds the height you are at (no drifting on)
      const rate = m.mode === 'rotor' ? 14 : m.mode === 'plane' ? 10 : m.mode === 'space' ? 12 + 8 * m.f : 6, base = m.mode === 'hover' ? m.hoverH : m.mode === 'space' ? 0 : 1.2;
      const cur = m.mode === 'space' ? this.pos.y : above - base, lo = world.space ? -40 : 0;
      if (inp.up && !inp.down) this.alt = Math.min(m.maxAlt, Math.max(this.alt, cur - 1) + rate * dt);
      else if (inp.down && !inp.up) this.alt = Math.max(lo, Math.min(this.alt, cur + 1) - rate * 1.4 * dt);
      else if (this.vChange) this.alt = clamp(cur + this.vel.y * .12, lo, m.maxAlt); // just let go: settle right here
      this.vChange = !!(inp.up || inp.down);
      // planes climb and dive toward where you aim
      if (m.mode === 'plane' && inp.aim && !inp.up && !inp.down) {
        const dx = inp.aim.x - this.pos.x, dz = inp.aim.z - this.pos.z, ap = Math.atan2(inp.aim.y - this.pos.y, Math.hypot(dx, dz) || 1);
        const sp = Math.max(0, this.vel.x * fx + this.vel.z * fz); this.alt = clamp(this.alt + clamp(ap, -.7, .7) * sp * .85 * dt, 0, m.maxAlt);
      }
      this.alt = Math.min(this.alt, m.maxAlt);
    }
    if (m.mode === 'hover') {
      const hh = m.hoverH + this.alt;
      if (above < hh + 2.5) { this.vel.y += ((hh - above) * 26 - this.vel.y * 5) * dt + GRAV * dt; driving = true; }
    } else if (m.mode === 'rotor') {
      const hh = 1.2 + this.alt;
      this.vel.y += ((hh - above) * 7 - this.vel.y * 3.6) * dt + GRAV * dt; driving = true;
      this.vel.y = clamp(this.vel.y, -20, 16);
    } else if (m.mode === 'plane') { // lift only comes with airspeed
      const speed = Math.max(0, this.vel.x * fx + this.vel.z * fz), liftK = clamp((speed - 9) / 9, 0, 1);
      this.vel.y += ((1.2 + this.alt - above) * 4.2 * liftK - this.vel.y * 2 * liftK) * dt + GRAV * dt * liftK;
      this.vel.y = clamp(this.vel.y, -22, 14); driving = true;
      if (liftK < .3 && this.alt > 0) this.alt = Math.max(0, this.alt - 6 * dt);
    } else if (m.mode === 'space') { // zero gravity: thrusters hold the chosen height, everything glides
      this.vel.y += ((this.alt - this.pos.y) * 3.2 - this.vel.y * 2.4) * dt; this.vel.y = clamp(this.vel.y, -22, 22); driving = true;
    } else if (world.space) { this.vel.y *= Math.exp(-.3 * dt); // a bot with nothing to push it just drifts
    } else if (m.mode === 'wheel' || m.mode === 'tread' || m.mode === 'leg' || m.mode === 'ski') driving = grounded;
    this.vel.y -= GRAV * dt;
    this.jetting = false;
    if (inp.jet && m.jetAcc > 0 && this.fuel > 0 && !inp.down) { this.vel.y += m.jetAcc * dt; this.fuel = Math.max(0, this.fuel - dt * .42); this.jetting = true; }
    else if (inp.down && !air && !fly && !grounded && this.vel.y > -30) this.vel.y -= GRAV * 1.2 * dt; // C: drop faster after a jump
    else this.fuel = Math.min(1, this.fuel + dt * (grounded || driving ? .3 : .08));
    let vf = this.vel.x * fx + this.vel.z * fz, vs = this.vel.x * lx + this.vel.z * lz;
    if (driving) {
      const flyMul = fly ? 1.15 : 1;
      const target = fly ? inp.throttle * Math.max(m.maxSpeed, 24) * flyMul : m.mode === 'plane' ? (inp.throttle > 0 ? m.maxSpeed : inp.throttle < 0 ? 0 : clamp(vf, 0, m.maxSpeed)) : inp.throttle * (inp.throttle > 0 ? m.maxSpeed * (m.mode === 'ski' && onIce ? 1.3 : 1) : m.maxSpeed * (m.mode === 'tread' || m.mode === 'leg' ? .8 : .55));
      let acc = m.accel * (m.mode === 'rotor' ? 1.4 : 1) * (inp.throttle === 0 ? .7 : 1) * (Math.sign(target - vf) !== Math.sign(vf) && Math.abs(vf) > 1 ? 1.6 : 1);
      if (onIce && !air) acc *= m.mode === 'ski' ? 1.25 : .4;
      if (Math.abs(target - vf) < acc * dt) vf = target; else vf += Math.sign(target - vf) * acc * dt;
      if (m.mode === 'plane') vs *= Math.exp(-6 * dt);
      else if (air || fly) {
        const st = (inp.strafe || 0) * Math.max(m.maxSpeed, fly ? 20 : 0) * .8, a2 = m.accel * (m.mode === 'rotor' ? 1.2 : .8) * dt;
        vs += clamp(st - vs, -a2, a2); if (!inp.strafe) vs *= Math.exp(-(m.mode === 'rotor' ? 1.4 : 1.8) * dt);
      } else vs *= Math.exp(-(m.mode === 'ski' ? 2.5 : onIce ? 1.1 : m.mode === 'tread' ? 14 : 9) * dt);
      const turn = m.turn * (m.mode === 'wheel' ? clamp(.6 + Math.abs(vf) / 12, .6, 1) : 1);
      this.yawVel = lerp(this.yawVel, inp.steer * turn, 1 - Math.exp(-10 * dt));
    } else if (grounded) {
      vf *= Math.exp(-2.5 * dt); vs *= Math.exp(-2.5 * dt); this.yawVel = inp.steer * .25;
    } else {
      this.yawVel = lerp(this.yawVel, inp.steer * .7, 1 - Math.exp(-3 * dt)); vf += inp.throttle * 4 * dt;
    }
    if (this.jetting) vf += inp.throttle * 7 * dt;
    if (inp.dash && this.dashCd <= 0 && m.mode !== 'none') {
      let dz = inp.throttle || 0, dx = strafer ? (inp.strafe || 0) : 0; if (!dz && !dx) dz = 1;
      const l = Math.hypot(dx, dz); vf += dz / l * 22; vs += dx / l * 22; if (air) this.vel.y += 3;
      this.dashCd = 5; this.dashT = .4; SFX.dash(this.pos);
    }
    inp.dash = false;
    this.yaw = wrapA(this.yaw + this.yawVel * dt);
    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw), nlx = Math.cos(this.yaw), nlz = -Math.sin(this.yaw);
    this.vel.x = nfx * vf + nlx * vs; this.vel.z = nfz * vf + nlz * vs; this.vf = vf; this.vs = vs;
    this.pos.addScaledVector(this.vel, dt);
    const g2 = this.groundInfo(nfx, nfz, nlx, nlz, solid);
    if (this.pos.y + this.bottomLocal < g2.ground) {
      this.pos.y = g2.ground - this.bottomLocal;
      if (this.vel.y < 0) { if (this.vel.y < -12 && this.isPlayer) cam.shake = Math.max(cam.shake, .4); this.vel.y = 0; }
    }
    const k = 1 - Math.exp(-8 * dt), ms = Math.max(1, m.maxSpeed);
    if (m.mode === 'plane' && above > 1.5) { this.pitch = lerp(this.pitch, clamp(-this.vel.y * .035, -.5, .5), k * .5); this.roll = lerp(this.roll, clamp(-this.yawVel * .55, -.7, .7), k * .5); }
    else if ((m.mode === 'rotor' && above > 1.5) || m.mode === 'space' || (fly && above > 1.5)) { this.pitch = lerp(this.pitch, vf / ms * .22 - this.vel.y * .02, k * .5); this.roll = lerp(this.roll, -vs / ms * .3 - this.yawVel * .08, k * .5); }
    else if (m.mode === 'hover' && above > .3) { this.pitch = lerp(this.pitch, g2.pitch * .6 + vf / ms * .06, k); this.roll = lerp(this.roll, g2.roll * .6 - vs / ms * .14, k); }
    else if (above < 1.2 || driving) { this.pitch = lerp(this.pitch, g2.pitch, k); this.roll = lerp(this.roll, g2.roll, k); }
    else { this.pitch = lerp(this.pitch, 0, k * .2); this.roll = lerp(this.roll, 0, k * .2); }
    // lava burns whatever touches it
    if (!solid && world.liquid && this.pos.y + this.bottomLocal < world.liquid.y - .05) {
      this.lavaT = (this.lavaT || 0) - dt;
      if (this.lavaT <= 0) {
        this.lavaT = .25; const live = this.cellList.filter(c => c.alive); const low = Math.min(...live.map(c => c.y));
        const bottom = live.filter(c => c.y <= low + 1);
        for (let i = 0; i < 3 && bottom.length; i++) { const c = bottom[Math.random() * bottom.length | 0]; this.damageCell(c, 55 * match.dmgScale, null); }
        if (this.isPlayer) { hudFx.dmg = Math.min(1, hudFx.dmg + .15); toastCenter('Lava! Get out!', .6); }
        emit(this.pos.x, world.liquid.y + .2, this.pos.z, rand(-1, 1), 4, rand(-1, 1), .8, .6, 0xff8a2a, 2, 2.5);
      }
    }
    // visuals
    for (const c of this.wheels) c.wheel.rotation.x += vf * dt / .56;
    for (const c of this.rotors) c.rotor.rotation.y += dt * (18 + Math.abs(vf) * .4);
    const thrusting = m.mode === 'plane' ? vf > 4 : inp.throttle > 0 && driving;
    for (const c of this.props) c.prop.rotation.z += dt * (thrusting ? 40 : 4);
    for (const c of this.flames) { const on = c.fly ? this.flyT > 0 : c.thrust ? thrusting : this.jetting; c.flame.userData.off = !on; if (on) c.flame.scale.set(1, .8 + Math.random() * .5, 1); }
    if (this.legs.length) { this.walk = (this.walk || 0) + vf * dt * 1.6; const amp = Math.min(1, Math.abs(vf) / 3) * .5; for (const c of this.legs) c.leg.rotation.x = Math.sin(this.walk + (c.idx % 2) * Math.PI) * amp; }
    for (const c of this.flags) c.flag.rotation.y = Math.sin(clock * 4 + c.idx) * .35 - this.yawVel * .3;
    if (this.energyCells && clock - this.lastHitT > 4) for (const c of this.energyCells) if (c.alive && c.hp < c.max) { const add = Math.min(c.max - c.hp, c.max * .1 * dt); c.hp += add; this.hp += add; }
    if (this.barrierMax && clock - (this.barrierHitT || -9) > 6 && this.barrier < this.barrierMax) this.barrier = Math.min(this.barrierMax, this.barrier + this.barrierMax * .2 * dt);
    // back at your team's base pad and out of combat (not hit or firing for 5 s): blocks repair and lost ones grow back
    if (!this.remote && !this.dead && match && match.mode !== 'pit' && !world.space && clock - this.lastHitT > 5 && clock - (this.lastFireT || -9) > 5 && this.onHomePad()) {
      this.padT = (this.padT || 0) - dt;
      if (this.padT <= 0) { this.padT = .25; const done = this.healAt(Math.max(40, this.maxHp * .015)); this.padRepair = done > 0 ? clock : this.padRepair; if (done > 0 && !HEADLESS && camera.position.distanceToSquared(this.pos) < 90 * 90) emit(this.center.x + rand(-1.5, 1.5), this.center.y + rand(-.5, 1.5), this.center.z + rand(-1.5, 1.5), 0, 2, 0, .5, .5, 0x7dffb0, 0, 3); }
    }
    if (this.shields.length && clock - this.lastHitT > 5) for (const c of this.shields) if (c.alive && c.hp < c.max) { const add = Math.min(c.max - c.hp, 60 * dt); c.hp += add; this.hp += add; }
    if (this.jetting && Math.random() < dt * 8) SFX.jet(this.pos);
    const near = camera.position.distanceToSquared(this.pos) < 160 * 160;
    const speed = Math.hypot(vf, vs);
    if (near && world.map) {
      if (!air && grounded && speed > 6 && Math.random() < dt * speed * .45) {
        const bx = this.pos.x - nfx * this.radius * .8 + (Math.random() - .5) * this.radius, bz = this.pos.z - nfz * this.radius * .8 + (Math.random() - .5) * this.radius;
        emit(bx, terrainH(bx, bz) + .3, bz, rand(-1, 1), rand(1, 2.2), rand(-1, 1), rand(.7, 1.2), rand(.25, .6), onIce ? 0xe8f2f8 : world.map.dust, -.6);
      }
      if (air && above < 7 && Math.random() < dt * 14) {
        const a = Math.random() * 6.28; const gx = this.pos.x + Math.cos(a) * this.radius * .6, gz = this.pos.z + Math.sin(a) * this.radius * .6;
        emit(gx, terrainH(gx, gz) + .2, gz, Math.cos(a) * 6, .6, Math.sin(a) * 6, .7, .5, world.liquid && world.liquid.type === 'lava' && bedH(gx, gz) < world.liquid.y ? 0xff7a2a : world.map.dust, 0);
      }
    }
    if (this.dashT > 0) { this.dashT -= dt; if (near) emit(this.pos.x + rand(-1, 1), this.center.y + rand(-1, 1), this.pos.z + rand(-1, 1), 0, 0, 0, .35, .5, 0x8ff6ff, 0, 2.2); }
  }
  groundInfo(fx, fz, lx, lz, solid) {
    const H = solid ? terrainH : bedH;
    const d = Math.min(3, this.radius * .7), x = this.pos.x, z = this.pos.z;
    const hc = H(x, z), hf = H(x + fx * d, z + fz * d), hb = H(x - fx * d, z - fz * d), hl = H(x + lx * d, z + lz * d), hr = H(x - lx * d, z - lz * d);
    return { ground: Math.max(hc, (hf + hb) / 2, (hl + hr) / 2), pitch: -Math.atan2(hf - hb, 2 * d), roll: Math.atan2(hl - hr, 2 * d) };
  }
  onHomePad() { const bz = this.team === 0 ? -world.spawnZ : world.spawnZ, h = this.home; return h ? Math.hypot(this.pos.x - h.x, this.pos.z - h.z) < 30 : Math.hypot(this.pos.x, this.pos.z - bz) < 48; }
  healAt(amt, healer) {
    if (this.dead) return 0;
    if (this.remote) { if (healer && !healer.remote) netReportHeal(healer, this, amt); return 0; }
    const hurt = this.cellList.filter(c => c.alive && c.hp < c.max).sort((a, b) => a.hp / a.max - b.hp / b.max).slice(0, 3);
    let done = 0;
    for (const c of hurt) {
      const add = Math.min(amt, c.max - c.hp); c.hp += add; this.hp += add; done += add;
      if (c.burnt && c.hp > c.max * .6) { c.burnt = false; c.obj.children[0].material = tierMat(c.c, c.k, false, this.finish); }
    }
    if (!hurt.length && clock - (this.regrowT || 0) > .45) { this.regrowT = clock; done += this.regrow(); }
    if (done && healer && healer !== this) healer.healed = (healer.healed || 0) + done;
    if (done && this.tag) this.tag.dirty = true;
    return done;
  }
  regrow() { // nano rebuilds one lost block that touches the surviving frame
    const dead = this.cellList.filter(c => !c.alive && NB.some(([dx, dy, dz]) => { const n = this.cells.get(ckey(c.x + dx, c.y + dy, c.z + dz)); return n && n.alive; }));
    if (!dead.length) return 0;
    return this.reviveCell(dead[Math.random() * dead.length | 0], .35);
  }
  reviveCell(c, frac) {
    if (c.alive) return 0;
    const p = makePart(c.t, c.c, c.r || 0, c.k || 1, this.finish, c.m); p.root.position.set(c.x - this.cx, c.y - this.minY, c.z - this.cz); this.group.add(p.root);
    this.meshes = this.meshes.filter(e => e.cell !== c);
    Object.assign(c, { recoil: p.recoil, kick: 0, obj: p.root, head: p.head, muzzle: p.muzzle, wheel: p.wheel, flame: p.flame, rotor: p.rotor, spin: p.spin, leg: p.leg, flag: p.flag, alive: true, burnt: false, hp: c.max * frac });
    p.root.traverse(o => { if (o.isMesh) { o.visible = false; if (o === c.flame) o.userData.off = true; this.meshes.push({ m: o, cell: c }); } });
    this.hp += c.hp; this.recalc();
    sparks(this.cellWorld(c, new T.Vector3()), 0x7dffb0, 8, 4, .15, .5);
    return c.hp;
  }
  aimWeapons(dt) {
    const aimL = _v3.copy(this.input.aim).applyMatrix4(this.inv); const sel = this.input.weapon;
    if (this.guns.mortar.length) { const v = solveBallistic(this.center, this.input.aim, WEAPONS.mortar.speed, WEAPONS.mortar.grav * GRAV / 22); this.mortarPitch = Math.atan2(v.y, Math.hypot(v.x, v.z)); this.mortarDir = (this.mortarDir || new T.Vector3()).copy(v).transformDirection(this.inv); }
    const s = 10 * dt;
    // barrels kick back when they fire and ease forward again
    for (const t of WTYPES) for (const c of this.guns[t]) if (c.recoil && (c.kick > 0 || c.recoil.position.z)) { c.kick = Math.max(0, c.kick - dt * 7); c.recoil.position.z = -c.kick * c.kick * (t === 'mortar' || t === 'lancer' || t === 'rail' ? .2 : .1); }
    for (const t of WTYPES) for (const c of this.guns[t]) {
      let yaw = 0, pitch = 0;
      { // every gun tracks the crosshair, whichever weapon is selected
        let dx = aimL.x - (c.x - this.cx), dy = aimL.y - (c.y - this.minY + .05), dz = aimL.z - (c.z - this.cz);
        if (c.mr) { // a rotated mount: aim in the gun's own frame
          const v = _v2.set(dx, dy, dz); if (t === 'mortar' && this.mortarDir) v.copy(this.mortarDir); v.applyMatrix4(ROT_MI[c.mr]); dx = v.x; dy = v.y; dz = v.z;
          yaw = Math.atan2(dx, dz); pitch = Math.atan2(dy, Math.hypot(dx, dz));
        } else { yaw = Math.atan2(dx, dz); pitch = t === 'mortar' ? (this.mortarPitch || .3) : Math.atan2(dy, Math.hypot(dx, dz)); }
      }
      c.head.rotation.y = approachAngle(c.head.rotation.y, yaw, s);
      c.head.rotation.x = approachAngle(c.head.rotation.x, -clamp(pitch, -.45, 1.3), s);
    }
  }
  updateTesla(dt) {
    if (!this.teslas.length) return;
    // live blades are magnetic: an enemy close in front drags the bot onto it, so rams connect
    if (!this.dead && this.teslas.some(c => c.alive)) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); let best = null, bd = TESLA.magnet;
      for (const o of world.bots) { if (o.dead || o.team === this.team) continue; const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / Math.max(d, .01) > .3) { bd = d; best = o; } }
      if (best) { const dx = best.pos.x - this.pos.x, dz = best.pos.z - this.pos.z, d = Math.max(.5, Math.hypot(dx, dz)), k = TESLA.pull * (1 - d / TESLA.magnet) * dt; this.vel.x += dx / d * k; this.vel.z += dz / d * k; }
    }
    this.teslaT = (this.teslaT || 0) - dt; if (this.teslaT > 0) return; this.teslaT = TESLA.tick;
    const mw = this.group.matrixWorld, reach2 = TESLA.reach * TESLA.reach;
    for (const c of this.teslas) {
      if (!c.alive) continue;
      const k = c.r % 4, dx = Math.sin(k * HALF_PI), dz = Math.cos(k * HALF_PI);
      const bx = c.x - this.cx, by = c.y - this.minY + .1, bz = c.z - this.cz;
      let best = null, bestBot = null, bd = reach2; const hitPt = new T.Vector3();
      for (const s of [.6, 1.1, 1.65]) {
        _v1.set(bx + dx * s, by, bz + dz * s).applyMatrix4(mw);
        for (const o of world.bots) {
          if (o.dead || o.team === this.team) continue;
          const rr = o.radius3 + 1; if (_v1.distanceToSquared(o.center) > rr * rr) continue;
          for (const oc of o.alive) { if (!oc.alive) continue; const d = o.cellWorld(oc, _v2).distanceToSquared(_v1); if (d < bd) { bd = d; best = oc; bestBot = o; hitPt.copy(_v2); } }
        }
      }
      if (!best) continue;
      const tip = _v3.set(bx + dx * 1.5, by, bz + dz * 1.5).applyMatrix4(mw).clone();
      const before = best.hp; const td = TESLA.dmg * match.dmgScale; bestBot.damageCell(best, td, this); onHit(this, bestBot, Math.min(before, td));
      beam(tip, hitPt, 0xaff6ff, .07, .09); sparks(hitPt, 0xbff8ff, 4, 7, .12, .25);
      if (Math.random() < .5) SFX.zap(hitPt);
    }
  }
  tryFire(dt) {
    this.fireT -= dt; const inp = this.input;
    // overheated guns vent before they can fire again
    this.heat = this.heat || 0;
    if (this.overT > 0) {
      this.overT -= dt; this.spin = Math.max(0, this.spin - dt * 1.2); if (this.isPlayer) SFX.beamStop();
      if (this.overT <= 0) { this.heat = 0; if (this.isPlayer) SFX.vented(); }
      return;
    }
    if (clock - (this.shotT || -9) > .45) this.heat = Math.max(0, this.heat - dt * .4);
    // weapon groups: several weapon types fire together, or take turns
    const grp = inp.group && inp.group.length > 1 ? inp.group.filter(t => t !== 'lancer' && this.guns[t] && this.guns[t].length) : null;
    if (grp && grp.length > 1) {
      if (grp.includes('chain') && inp.fire) this.spin = Math.min(1, this.spin + dt / WEAPONS.chain.spin); else this.spin = Math.max(0, this.spin - dt * 1.2);
      for (const c of this.guns.chain) c.spin.rotation.z += dt * (1 + this.spin * 40);
      this.ft = this.ft || {}; for (const t of grp) this.ft[t] = (this.ft[t] || 0) - dt;
      if (this.isPlayer) { if (inp.fire && grp.includes('nano')) SFX.beamStart('nano'); else SFX.beamStop(); }
      if (!inp.fire) return; if (this.cloakT > 0) this.cloakT = 0;
      const shoot = t => { const W = WEAPONS[t], g = this.guns[t]; let iv = Math.max(W.minInt, W.cd / g.length) * (match.fireMul || 1); if (t === 'chain') { if (this.spin < .12) return 0; iv *= lerp(3.5, 1, this.spin); } const gun = g[(this.gi = (this.gi || 0) + 1) % g.length]; gun.kick = 1; fireWeapon(this, t, gun.muzzle.getWorldPosition(new T.Vector3()), inp.aim); heatAdd(this, t, iv * .65); return iv; };
      if (inp.groupMode === 'alt') { if (this.fireT > 0) return; const t = grp[(this.grpIdx = ((this.grpIdx || 0) + 1) % grp.length)], iv = shoot(t); this.fireT = iv ? Math.max(.08, iv / grp.length) : .05; }
      else for (const t of grp) if (this.ft[t] <= 0) { const iv = shoot(t); this.ft[t] = iv || .05; }
      return;
    }
    const type = inp.weapon, guns = this.guns[type] || [];
    if (type === 'chain' && inp.fire && guns.length) this.spin = Math.min(1, this.spin + dt / WEAPONS.chain.spin); else this.spin = Math.max(0, this.spin - dt * 1.2);
    for (const c of this.guns.chain) c.spin.rotation.z += dt * (1 + this.spin * 40);
    if (this.isPlayer) { if (inp.fire && type === 'nano' && guns.length) SFX.beamStart('nano'); else SFX.beamStop(); }
    if (type === 'lancer') { if (!lancerTick(this, dt, guns)) return; }
    else if (this.charge) lancerTick(this, dt, this.guns.lancer);
    if (!inp.fire || this.fireT > 0 || !guns.length) return;
    if (this.cloakT > 0 && type !== 'nano') this.cloakT = 0; // shooting gives you away
    const W = WEAPONS[type];
    let interval = Math.max(W.minInt, W.cd / guns.length);
    if (type === 'chain') { if (this.spin < .12) return; interval *= lerp(3.5, 1, this.spin); }
    interval *= match.fireMul || 1;
    const gun = guns[this.gunIdx++ % guns.length]; this.fireT = interval; gun.kick = 1;
    fireWeapon(this, type, gun.muzzle.getWorldPosition(new T.Vector3()), inp.aim); heatAdd(this, type, interval);
  }
}
function heatAdd(b, t, iv) {
  b.shotT = clock; const h = HEAT[t]; if (!h) return;
  const before = b.heat; b.heat = Math.min(1, b.heat + h * iv);
  if (b.isPlayer && before < .75 && b.heat >= .75) SFX.heatWarn();
  if (b.heat >= 1) { b.overT = HEAT_LOCK; if (b.isPlayer) { SFX.overheat(); toastCenter('Overheated! Venting…', 1.2); } else if (!HEADLESS) SFX.overheat(b.center); }
}
function makeTag(bot) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(5.2, 1.3, 1); sprite.renderOrder = 5;
  return { canvas: c, tex, sprite, dirty: true };
}
function drawTag(bot) {
  const t = bot.tag; t.dirty = false; const g = t.canvas.getContext('2d'); g.clearRect(0, 0, 256, 64);
  const col = bot.team === 0 ? '#4fb0ff' : '#ff5444';
  g.font = '600 26px "Chakra Petch", "Segoe UI", sans-serif'; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.75)';
  const nm = (bot.human ? '★ ' : '') + bot.name;
  g.strokeText(nm, 128, 28); g.fillStyle = bot.human ? (bot.team === 0 ? '#9fd8ff' : '#ffb0a6') : col; g.fillText(nm, 128, 28);
  const k = clamp(bot.hp / bot.maxHp, 0, 1);
  g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(38, 40, 180, 12); g.fillStyle = col; g.fillRect(40, 42, 176 * k, 8);
  t.tex.needsUpdate = true;
}
function solveBallistic(from, to, v, g) {
  if (g < .05) return to.clone().sub(from).normalize().multiplyScalar(v); // no gravity: aim straight
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y, d = Math.hypot(dx, dz), v2 = v * v;
  const disc = v2 * v2 - g * (g * d * d + 2 * dy * v2);
  const ang = disc < 0 ? Math.PI / 4 : Math.atan2(v2 - Math.sqrt(disc), g * d);
  const hx = d > .001 ? dx / d : 0, hz = d > .001 ? dz / d : 1;
  return new T.Vector3(hx * Math.cos(ang) * v, Math.sin(ang) * v, hz * Math.cos(ang) * v);
}

// ================= WEAPONS / PROJECTILES =================
let beamGhost = false;
function fireWeapon(owner, type, from, aim) {
  const n0 = world.projs.length; beamGhost = owner.remote; owner.lastFireT = clock; /* firing keeps you in combat: no base repair */ if (REC.on) recShot(owner, type, from, aim);
  fireWeapon0(owner, type, from, aim);
  beamGhost = false;
  if (owner.remote) for (let i = n0; i < world.projs.length; i++) world.projs[i].ghost = true;
}
function fireWeapon0(owner, type, from, aim) {
  const W = WEAPONS[type], ally = owner.team === 0, scale = match.dmgScale;
  const dirTo = (spread = 0) => { const d = aim.clone().sub(from).normalize(); if (spread) { d.x += rand(-1, 1) * spread; d.y += rand(-1, 1) * spread; d.z += rand(-1, 1) * spread; d.normalize(); } return d; };
  if (type === 'blaster' || type === 'chain') {
    const dir = dirTo(W.spread * (type === 'chain' ? 1 + (1 - owner.spin) : 1));
    const m = new T.Mesh(type === 'chain' ? world.roundGeo : world.boltGeo, ally ? world.boltMatA : world.boltMatE);
    m.position.copy(from); m.lookAt(_v1.copy(from).add(dir));
    world.projs.push({ type: 'blaster', pos: from.clone(), vel: dir.multiplyScalar(W.speed), dmg: W.dmg * scale, owner, team: owner.team, life: W.life, mesh: m });
    emit(from.x, from.y, from.z, 0, 0, 0, .06, type === 'chain' ? .55 : .8, ally ? 0x9ff3ff : 0xffb35a, 0, 4); // muzzle flash
    if (Math.random() < .5) emit(from.x, from.y, from.z, dir.x * 6 + rand(-1, 1), dir.y * 6 + rand(0, 1), dir.z * 6 + rand(-1, 1), .4, .35, 0x77706a, -.2);
    if (type === 'chain') SFX.chain(from, owner.spin); else SFX.blaster(from);
  } else if (type === 'plasma') {
    const g = W.grav * GRAV / 22, vel = solveBallistic(from, aim, W.speed, g), col = ally ? 0xc9a2ff : 0xff7ad9;
    const m = new T.Mesh(world.plasmaGeo, ally ? world.plasmaMatA : world.plasmaMatE); m.position.copy(from);
    world.projs.push({ type, pos: from.clone(), vel, grav: g, splash: W.splash, dmg: W.dmg * scale, owner, team: owner.team, life: W.life, mesh: m, trail: col });
    flash(from, 1.3, col, .12); SFX.plasma(from);
    if (owner.isPlayer) cam.shake = Math.max(cam.shake, .08);
  } else if (type === 'mortar') {
    const g = W.grav * GRAV / 22, vel = solveBallistic(from, aim, W.speed, g);
    const m = new T.Mesh(world.shellGeo, world.shellMat); m.position.copy(from);
    world.projs.push({ type, pos: from.clone(), vel, grav: g, splash: W.splash, dmg: W.dmg * scale, owner, team: owner.team, life: W.life, mesh: m, trail: 0xff9a40 });
    flash(from, 1.6, 0xffa040, .15); SFX.mortar(from);
    if (owner.isPlayer) cam.shake = Math.max(cam.shake, .15);
  } else if (type === 'flak') {
    const dir = dirTo(.01), dist = Math.min(W.range, from.distanceTo(aim));
    const m = new T.Mesh(world.shellGeo, world.flakMat); m.position.copy(from); m.scale.setScalar(.6);
    world.projs.push({ type, pos: from.clone(), vel: dir.multiplyScalar(W.speed), splash: W.splash, dmg: W.dmg * scale, owner, team: owner.team, life: Math.max(.08, dist / W.speed), fuseAtEnd: true, mesh: m, trail: 0xfff0a0, air: W.airBonus });
    flash(from, 1.1, 0xfff0a0, .1); SFX.flak(from);
  } else if (type === 'seeker') {
    const dir = dirTo(); dir.y += .35; dir.normalize();
    const m = new T.Mesh(world.missileGeo, world.missileMat); m.position.copy(from);
    world.projs.push({ type, pos: from.clone(), vel: dir.multiplyScalar(W.speed), splash: W.splash, dmg: W.dmg * scale, owner, team: owner.team, life: W.life, mesh: m, trail: 0xd8d0c8, target: owner.lock && !owner.lock.dead ? owner.lock : null, aimPt: aim.clone() });
    flash(from, 1, 0xff8a5a, .1); SFX.seeker(from);
  } else if (type === 'rail') {
    const dir = dirTo(), r = traceBeam(owner, from, dir, W.range, W.dmg * scale, false);
    beam(from, r.end, ally ? 0x8ff0ff : 0xff9a5a, .16, .45); sparks(r.end, 0x9ff3ff, 10, 6, .15, .3);
    if (!HEADLESS) { const L = from.distanceTo(r.end), dd = r.end.clone().sub(from).normalize(), sx = new T.Vector3(-dd.z, 0, dd.x).normalize(), sy = sx.clone().cross(dd); for (let t = 1.5; t < L; t += 1.5) { const a = t * .9, px = from.x + dd.x * t + (sx.x * Math.cos(a) + sy.x * Math.sin(a)) * .35, py = from.y + dd.y * t + (sx.y * Math.cos(a) + sy.y * Math.sin(a)) * .35, pz = from.z + dd.z * t + (sx.z * Math.cos(a) + sy.z * Math.sin(a)) * .35; emit(px, py, pz, rand(-.2, .2), rand(0, .3), rand(-.2, .2), rand(.5, .9), .22, ally ? 0x8ff0ff : 0xff9a5a, 0, 2.5); } }
    flash(from, 1.2, 0x9ff3ff, .15); SFX.rail(from);
    if (owner.isPlayer) cam.shake = Math.max(cam.shake, .2);
  } else if (type === 'arc') fireArc(owner, from, aim);
  else if (type === 'mine') fireMine(owner, from, aim);
  else if (type === 'lancer') fireLancer(owner, from, aim);
  else if (type === 'nano') {
    const dir = dirTo(), r = traceBeam(owner, from, dir, W.range, W.heal * scale, true);
    beam(from, r.end, 0x5dffa0, r.bot ? .1 : .05, .12);
    if (r.bot && Math.random() < .5) sparks(r.end, 0x7dffb0, 2, 3, .12, .4);
  }
}
// hitscan helper for rail and nano: find where the ray stops, then walk only through bots it can touch
const _tp = new T.Vector3();
function traceBeam(owner, from, dir, range, amount, heal) {
  let tEnd = range;
  outer: for (let t = 1; t <= range; t += 1) {
    const x = from.x + dir.x * t, y = from.y + dir.y * t, z = from.z + dir.z * t;
    if (y < terrainH(x, z)) { tEnd = t; break; }
    for (const r of rocksAt(x, z)) { if (y > r.top) continue; const dx = x - r.x, dz = z - r.z; if (dx * dx + dz * dz < r.cr2) { tEnd = t; break outer; } }
  }
  if (world.spheres) tEnd = Math.min(tEnd, raySpheres(from, dir, tEnd));
  const rr = heal ? null : reactorRay(from, dir, owner); let rHit = null;
  if (rr && rr.r && rr.t < tEnd) { tEnd = rr.t; rHit = rr.r; }
  const cands = [];
  for (const b of world.bots) {
    if (b.dead || b === owner || (heal ? b.team !== owner.team : b.team === owner.team)) continue;
    const L = _v2.copy(b.center).sub(from), tc = L.dot(dir), d2 = L.lengthSq() - tc * tc, R2 = b.radius3 * b.radius3;
    if (d2 > R2 || tc < 0) continue; const th = Math.sqrt(R2 - d2), t0 = Math.max(0, tc - th);
    if (t0 < tEnd) cands.push({ b, t0, t1: Math.min(tEnd, tc + th) });
  }
  cands.sort((a, b) => a.t0 - b.t0);
  let left = amount, hit = null;
  for (const c of cands) for (let t = c.t0; t < c.t1; t += .3) {
    _tp.copy(from).addScaledVector(dir, t); const cell = c.b.cellAt(_tp); if (!cell) continue;
    if (heal) { if (!beamGhost) c.b.healAt(amount, owner); return { end: _tp.clone(), bot: c.b }; }
    if (beamGhost) return { end: _tp.clone(), bot: c.b };
    if (c.b.shieldT > 0) { shieldHit(c.b, _tp); return { end: _tp.clone(), bot: c.b }; }
    const before = left; left = c.b.damageCell(cell, left, owner); onHit(owner, c.b, before - left); hit = c.b;
    if (left <= 2) return { end: _tp.clone(), bot: c.b };
  }
  if (rHit && !beamGhost && left > 2) reactorDamage(rHit.team, left, owner);
  return { end: from.clone().addScaledVector(dir, tEnd), bot: hit };
}
function shieldHit(b, pos) { if (Math.random() < .5) sparks(pos, 0x8fd8ff, 3, 5, .14, .25); }
function hitTest(p) {
  const pos = p.pos;
  if (pos.y < terrainH(pos.x, pos.z)) { impact(p, pos); return true; }
  if (world.spheres && sphereAt(pos)) { impact(p, pos); return true; }
  if (reactorHitTest(p, pos)) return true;
  for (const r of rocksAt(pos.x, pos.z)) { if (pos.y > r.top) continue; const dx = pos.x - r.x, dz = pos.z - r.z; if (dx * dx + dz * dz < r.cr2) { impact(p, pos); return true; } }
  for (const b of world.bots) {
    if (b.dead || b.team === p.team) continue;
    const d2 = pos.distanceToSquared(b.center);
    // flak proximity fuse: burst when a block of the bot is inside the blast, not just near the bot's middle
    if (p.type === 'flak' && d2 < (b.radius3 + 2.5) ** 2) { const R2 = (WEAPONS.flak.splash * .7) ** 2; if (b.cellList.some(c => c.alive && b.cellWorld(c, _v2).distanceToSquared(pos) < R2)) { impact(p, pos); return true; } if (d2 > b.radius3 * b.radius3) continue; }
    if (p.type === 'seeker' && d2 < (b.radius3 * .85) ** 2) { if (b.shieldT > 0) { shieldHit(b, pos); return true; } impact(p, pos); return true; }
    if (d2 > b.radius3 * b.radius3) continue;
    const c = b.cellAt(pos); if (!c) continue;
    if (b.shieldT > 0) { shieldHit(b, pos); return true; }
    if (p.splash) { impact(p, pos); return true; }
    if (p.ghost) { sparks(pos, p.team === 0 ? 0x9ff3ff : 0xffc070, 3, 6, .14, .3); return true; }
    const before = p.dmg; const left = b.damageCell(c, p.dmg, p.owner); p.dmg = left;
    onHit(p.owner, b, before - left);
    sparks(pos, p.team === 0 ? 0x9ff3ff : 0xffc070, 3, 6, .14, .3);
    if (p.dmg <= 2) return true;
  }
  return false;
}
function impact(p, pos) {
  if (p.splash) {
    damageBuildings(pos, p.dmg, p.splash);
    if (!p.ghost) splashDamage(pos, p.splash, p.dmg, p.owner, p.team, p.air || 1);
    if (p.type === 'plasma') { flash(pos.clone(), 4.2, p.trail, .32); sparks(pos, p.trail, 16, 11, .2, .45); SFX.boom(pos, false); if (!HEADLESS) { shockwave(pos, 6, p.trail); addScorch(pos, 2); } }
    else if (p.type === 'flak') { flash(pos.clone(), 3.4, 0xfff0a0, .2); sparks(pos, 0xffe080, 14, 14, .16, .35); for (let i = 0; i < 6; i++) emit(pos.x, pos.y, pos.z, rand(-3, 3), rand(-1, 2), rand(-3, 3), rand(.8, 1.4), rand(.8, 1.4), 0x2a2622, -.4); SFX.flakBurst(pos); }
    else explosion(pos.clone(), false);
    return;
  }
  sparks(pos, 0xffe0a0, 4, 6, .15, .3);
  if (pos.y < terrainH(pos.x, pos.z) + .6) emit(pos.x, pos.y, pos.z, rand(-.5, .5), 1.5, rand(-.5, .5), .7, .5, world.map ? world.map.dust : 0x7a6248, -.8);
}
function splashDamage(pos, R, dmg, owner, team, airMul = 1) {
  reactorSplash(pos, R, dmg, owner, team);
  for (const b of world.bots) {
    if (b.dead || b.team === team || pos.distanceTo(b.center) > b.radius3 + R) continue;
    if (b.shieldT > 0) continue;
    const mul = b.airborne ? airMul : 1;
    // every block in the blast takes a share that falls off with distance, but one blast can only deal so much to
    // one bot (SPLASH.cap times its damage), so tightly packed bots are not punished many times over
    const hits = []; let wsum = 0;
    for (const c of b.cellList) { if (!c.alive) continue; const d = b.cellWorld(c, _v2).distanceTo(pos); if (d < R) { const w = (1 - d / R * .75) * .55; hits.push([c, w]); wsum += w; } }
    const k = wsum > SPLASH.cap ? SPLASH.cap / wsum : 1;
    let dealt = 0;
    for (const [c, w] of hits) { if (!c.alive) continue; const amt = dmg * mul * w * k * (matOf(c).splash || 1); const before = c.hp; b.damageCell(c, amt, owner); dealt += Math.min(before, amt); if (b.dead) break; }
    if (dealt > 0) onHit(owner, b, dealt);
  }
}
function updateProjectiles(dt) {
  const SW = WEAPONS.seeker;
  for (let i = world.projs.length - 1; i >= 0; i--) {
    const p = world.projs[i]; p.life -= dt; let dead = false;
    if (p.type === 'mine') { if (updateMine(p, dt)) { world.projs.splice(i, 1); continue; } p.mesh.position.copy(p.pos); continue; }
    if (p.life <= 0) { if (p.fuseAtEnd || p.type === 'seeker') impact(p, p.pos); dead = true; }
    if (!dead && p.type === 'seeker') {
      const tp = p.target && !p.target.dead ? p.target.center : p.aimPt;
      const sp = Math.min(SW.maxSpeed, p.vel.length() + 70 * dt);
      _v1.copy(tp).sub(p.pos).normalize(); _v2.copy(p.vel).normalize();
      const close = p.target ? clamp(1.6 - p.pos.distanceTo(tp) / 60, 1, 2.5) : 1;
      _v2.lerp(_v1, Math.min(1, SW.turn * close * dt)).normalize(); p.vel.copy(_v2).multiplyScalar(sp);
      if (!p.target && p.pos.distanceToSquared(p.aimPt) < 4) { impact(p, p.pos); dead = true; }
    }
    if (!dead) {
      const steps = Math.max(1, Math.ceil(p.vel.length() * dt / .45)), sdt = dt / steps;
      for (let s = 0; s < steps && !dead; s++) { if (p.grav) p.vel.y -= p.grav * sdt; p.pos.addScaledVector(p.vel, sdt); dead = hitTest(p); }
    }
    if (dead) { world.projs.splice(i, 1); continue; }
    p.mesh.position.copy(p.pos);
    if (p.type === 'blaster' || p.type === 'seeker') p.mesh.lookAt(_v1.copy(p.pos).add(p.vel));
    if (p.type === 'seeker') { emit(p.pos.x, p.pos.y, p.pos.z, rand(-.4, .4), rand(-.2, .6), rand(-.4, .4), rand(.7, 1.1), rand(.22, .42), 0x9a948e, -.6); emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, .08, .35, 0xffa050, 0, 3); }
    else if (p.type !== 'blaster' && Math.random() < .8) emit(p.pos.x, p.pos.y, p.pos.z, rand(-.5, .5), rand(-.5, .5), rand(-.5, .5), .35, p.type === 'plasma' ? .45 : .35, p.trail || 0xff9a40, 0, 2);
  }
}
let hitmarkT = 0, hitSoundT = 0, hurtSoundT = 0;
function onHit(attacker, victim, dealt) {
  if (dealt <= 0) return;
  if (attacker && attacker.isPlayer && victim !== attacker) dmgNumber(victim, dealt);
  if (victim.isPlayer && attacker && attacker !== victim) hitFrom(attacker);
  if (attacker && attacker.isPlayer) { hitmarkT = .12; if (clock - hitSoundT > .06) { hitSoundT = clock; SFX.hit(); } }
  if (victim.isPlayer) { hudFx.dmg = Math.min(1, hudFx.dmg + dealt / 400); cam.shake = Math.max(cam.shake, Math.min(.5, dealt / 300)); if (clock - hurtSoundT > .25) { hurtSoundT = clock; SFX.hurt(); } }
}

// ================= RAYCAST / LOS =================
function castRay(o, d, tMin, maxT, ignore) {
  let best = maxT;
  for (let t = tMin + 2; t <= maxT; t += 2) {
    const y = o.y + d.y * t;
    if (y < terrainH(o.x + d.x * t, o.z + d.z * t)) {
      let lo = t - 2, hi = t; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (o.y + d.y * m < terrainH(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m; }
      best = hi; break;
    }
  }
  if (world.spheres) { const ts = raySpheres(o.clone().addScaledVector(d, tMin), d, best); if (ts + tMin < best) best = ts + tMin; }
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-6) for (const r of world.rocks) {
    const fx = o.x - r.x, fz = o.z - r.z, b = 2 * (fx * d.x + fz * d.z), c = fx * fx + fz * fz - r.cr2, disc = b * b - 4 * a * c;
    if (disc < 0) continue; const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t > tMin && t < best && o.y + d.y * t < r.top) best = t;
  }
  for (const bot of world.bots) {
    if (bot.dead || bot === ignore) continue;
    const L = _v2.copy(bot.center).sub(o); const tc = L.dot(d); const d2 = L.lengthSq() - tc * tc; const R2 = bot.radius3 * bot.radius3;
    if (d2 > R2) continue; const th = Math.sqrt(R2 - d2); const t0 = Math.max(tMin, tc - th), t1 = Math.min(best, tc + th);
    for (let t = t0; t < t1; t += .3) { _v1.copy(o).addScaledVector(d, t); if (bot.cellAt(_v1)) { best = t; break; } }
  }
  return best;
}
function lineOfSight(a, b) {
  if (world.spheres && !segmentClear(a, b)) return false;
  const d = a.distanceTo(b), n = Math.ceil(d / 3);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
    if (y < terrainH(x, z) - .3) return false;
    for (const r of rocksAt(x, z)) { if (y > r.top) continue; const dx = x - r.x, dz = z - r.z; if (dx * dx + dz * dz < r.cr2) return false; }
  }
  return true;
}

// ================= AI =================
const DESIRED = { blaster: 30, plasma: 45, mortar: 110, rail: 95, seeker: 120, flak: 70, chain: 35, nano: 22, arc: 30, mine: 55, lancer: 160 };
class Brain {
  constructor(bot) {
    this.bot = bot; this.target = null; this.retarget = 0; this.strafe = Math.random() < .5 ? 1 : -1; this.strafeT = 3;
    this.jitter = new T.Vector3(); this.jitterT = 0; this.los = false; this.losT = 0; this.stuckT = 0; this.reverseT = 0; this.jetT = 0;
    this.skill = rand(.5, .85); this.wander = new T.Vector3(rand(-80, 80), 0, rand(-80, 80)); this.burstT = 0;
    this.role = Math.random() < .55 ? 'capper' : 'hunter'; this.healPref = Math.random() < .7; this.altGoal = rand(0, 1); this.altT = 0; this.patient = null;
  }
  update(dt) {
    const b = this.bot, inp = b.input, mob = b.mob, air = mob.mode === 'hover' || mob.mode === 'rotor' || mob.mode === 'plane', plane = mob.mode === 'plane';
    const medic = b.guns.nano.length > 0;
    this.retarget -= dt;
    if (!this.target || this.target.dead || this.retarget <= 0) {
      this.target = nearestEnemy(b); this.retarget = 1.5 + Math.random() * 1.5;
      this.patient = medic ? hurtAlly(b) : null;
    }
    if (this.patient && (this.patient.dead || this.patient.hp >= this.patient.maxHp * .985)) this.patient = null;
    const tg = this.target;
    let d = Infinity; if (tg) d = Math.hypot(tg.pos.x - b.pos.x, tg.pos.z - b.pos.z);
    let best = null, bn = 0; for (const t of WTYPES) { if (t === 'nano') continue; const n = b.guns[t].length; if (n > bn) { bn = n; best = t; } }
    if ((best === 'mortar' || best === 'rail' || best === 'seeker') && d < 30 && b.guns.blaster.length) best = 'blaster';
    const healing = medic && this.patient && (!tg || d > 60 || !best || this.healPref);
    inp.weapon = healing ? 'nano' : best || (medic ? 'nano' : 'blaster');
    const W = inp.weapon, melee = b.teslas.length > 0;
    const desired = melee ? -20 : DESIRED[W] || 40, range = WEAPONS[W] ? WEAPONS[W].range : 100;
    this.strafeT -= dt; if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 2.5 + Math.random() * 4; }
    let gx, gz, goal = null;
    // Battle Arena: cappers head for the nearest beacon we don't own when nothing is close
    const mg = modeGoal(b, this, tg, d); if (mg) goal = mg;
    else if (match.mode === 'arena' && this.role === 'capper' && (!tg || d > 90)) {
      let bd = Infinity;
      for (const p of world.points) { if (p.owner === b.team && p.prog >= 1) continue; const dd = Math.hypot(p.x - b.pos.x, p.z - b.pos.z); if (dd < bd) { bd = dd; goal = p; } }
      if (!goal) goal = world.points[Math.random() * 3 | 0];
    }
    const rg = healing ? null : aiReactorGoal(b), rd = rg ? Math.hypot(rg.x - b.pos.x, rg.z - b.pos.z) : Infinity;
    const pushR = !!rg && (!tg || d > 45 || rd < 70);
    if (pushR) { const sg = rg.z > 0 ? -1 : 1, back = clamp(melee ? 6 : desired * .7, 14, 70); goal = { x: rg.x + this.strafe * 14, z: rg.z + sg * back }; }
    if (healing) { const p = this.patient; const dd = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z); if (dd > 24) { gx = p.pos.x; gz = p.pos.z; } else { gx = b.pos.x + (p.pos.z - b.pos.z) * this.strafe * .3; gz = b.pos.z - (p.pos.x - b.pos.x) * this.strafe * .3; } }
    else if (goal) { const off = (b.pos.x * 7 + b.pos.z) % 10, j = goal.exact ? 0 : 9; gx = goal.x + Math.sin(off) * j; gz = goal.z + Math.cos(off) * j; }
    else if (tg) {
      const ux = (tg.pos.x - b.pos.x) / d, uz = (tg.pos.z - b.pos.z) / d;
      if (d > desired + 15) { gx = tg.pos.x; gz = tg.pos.z; }
      else if (d < desired - 12) { gx = b.pos.x - ux * 30 + uz * this.strafe * 15; gz = b.pos.z - uz * 30 - ux * this.strafe * 15; }
      else { gx = b.pos.x + uz * this.strafe * 30 + ux * 4; gz = b.pos.z - ux * this.strafe * 30 + uz * 4; }
    } else { gx = this.wander.x; gz = this.wander.z; if (Math.hypot(gx - b.pos.x, gz - b.pos.z) < 15) this.wander.set(rand(-.5, .5) * world.bound, 0, rand(-.5, .5) * world.bound); }
    if (Math.abs(b.pos.x) > world.bound - 35 || Math.abs(b.pos.z) > world.bound - 25) { gx = 0; gz = 0; }
    let head = Math.atan2(gx - b.pos.x, gz - b.pos.z);
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), lx = Math.cos(b.yaw), lz = -Math.sin(b.yaw);
    const high = (mob.mode === 'rotor' || plane) && b.alt > 12;
    if (!high) for (const r of rocksAt(b.pos.x + fx * 12, b.pos.z + fz * 12)) {
      const rx = r.x - b.pos.x, rz = r.z - b.pos.z, ahead = rx * fx + rz * fz;
      if (ahead < 0 || ahead > r.cr + 16) continue;
      const lat = rx * lx + rz * lz;
      if (Math.abs(lat) < r.cr + b.radius + 2) { head = b.yaw + (lat > 0 ? -1.1 : 1.1); break; }
    }
    // wheeled bots steer around lava
    if (!air && world.liquid && world.liquid.type === 'lava') {
      const ax = b.pos.x + fx * 14, az = b.pos.z + fz * 14;
      if (bedH(ax, az) < world.liquid.y + .3) { const lft = bedH(b.pos.x + lx * 12 + fx * 8, b.pos.z + lz * 12 + fz * 8), rgt = bedH(b.pos.x - lx * 12 + fx * 8, b.pos.z - lz * 12 + fz * 8); head = b.yaw + (lft > rgt ? 1.2 : -1.2); }
    }
    const sp = Math.hypot(b.vel.x, b.vel.z);
    if (this.reverseT > 0) { this.reverseT -= dt; inp.throttle = -1; inp.steer = this.strafe; }
    else {
      const diff = wrapA(head - b.yaw); inp.steer = clamp(diff * 2.2, -1, 1); inp.throttle = Math.abs(diff) < 1.4 ? 1 : .25;
      if (sp < 1.2 && mob.mode !== 'none') { this.stuckT += dt; if (this.stuckT > 1.6) { this.reverseT = 1.1; this.stuckT = 0; if (mob.jetAcc > 0) this.jetT = .8; } } else this.stuckT = 0;
    }
    // movement abilities
    inp.strafe = air && !plane && tg && d < 160 && !healing ? this.strafe : 0;
    if (plane) { inp.throttle = 1; if (tg && d < 60) inp.steer = clamp(inp.steer + this.strafe * .5, -1, 1); }
    this.altT -= dt; if (this.altT <= 0) { this.altT = 3 + Math.random() * 4; this.altGoal = Math.random(); }
    if (world.space && mob.mode === 'space') { const want = tg ? clamp(tg.pos.y + (this.altGoal - .5) * 14, -30, 160) : 40 + this.altGoal * 60; inp.up = b.alt < want - 1; inp.down = b.alt > want + 1; }
    else if (air) { const want = plane ? 14 + this.altGoal * 22 : mob.mode === 'rotor' ? 8 + this.altGoal * 22 : this.altGoal < .7 ? 0 : 3; inp.up = b.alt < want - .5; inp.down = b.alt > want + .5; }
    if (clock - b.lastHitT < .25 && Math.random() < dt * 6) inp.dash = true;
    if (b.mods && Math.random() < dt * 2) {
      const hurt = b.hp < b.maxHp * .6, close = tg && d < 22, foes = world.bots.filter(o => !o.dead && o.team !== b.team && o.center.distanceTo(b.center) < 24).length;
      if (b.mods.shield && clock - b.lastHitT < .4 && hurt && moduleReady(b, 'shield')) inp.mod = 'shield';
      else if (b.mods.emp && foes >= 2 && moduleReady(b, 'emp')) inp.mod = 'emp';
      else if (b.mods.disrupt && close && moduleReady(b, 'disrupt')) inp.mod = 'disrupt';
      else if (b.mods.cloak && tg && d > 60 && d < 140 && moduleReady(b, 'cloak')) inp.mod = 'cloak';
      else if (b.mods.blink && (this.stuckT > 1 || (melee && tg && d > 25 && d < 45)) && moduleReady(b, 'blink')) inp.mod = 'blink';
      else if (b.mods.power && b.energy < b.energyMax * .3 && moduleReady(b, 'power')) inp.mod = 'power';
      else if (b.mods.fly && !(b.flyT > 0) && tg && (tg.pos.y - b.pos.y > 6 || this.stuckT > 1 || (d > 40 && d < 120 && Math.random() < dt * .25)) && moduleReady(b, 'fly')) inp.mod = 'fly';
    }
    if (melee && tg && d < 32 && d > 3 && b.dashCd <= 0 && Math.random() < dt * 3) inp.dash = true; // lunge in with the blades
    if (this.jetT > 0) { this.jetT -= dt; inp.jet = true; }
    else { inp.jet = false; if (mob.jetAcc > 0 && Math.random() < dt * .15) this.jetT = .5 + Math.random() * .6; }
    if (mob.mode !== 'hover' && mob.mode !== 'rotor' && inp.jet) inp.up = true;
    // aim and fire
    this.jitterT -= dt;
    if (this.jitterT <= 0) { this.jitterT = .45 + Math.random() * .5; const m = (1.35 - this.skill) * (.5 + Math.min(d, 300) * .03); this.jitter.set(rand(-1, 1) * m, rand(-.5, .7) * m, rand(-1, 1) * m); }
    if (healing) {
      const p = this.patient; inp.aim.copy(p.center);
      this.losT -= dt; if (this.losT <= 0) { this.losT = .3; this.los = lineOfSight(b.center, p.center); }
      inp.fire = this.los && b.center.distanceTo(p.center) < WEAPONS.nano.range;
      b.lock = null;
    } else if (pushR && rd < range + 10 && (!tg || d > 45)) {
      inp.aim.copy(rg.pos).add(this.jitter); b.lock = null; inp.fire = W !== 'nano';
    } else if (tg) {
      const spd = { blaster: 230, chain: 270, plasma: 125, mortar: 85, flak: 190, mine: 34 }[W];
      const lead = spd ? d / spd : 0;
      inp.aim.copy(tg.center).addScaledVector(tg.vel, lead * this.skill).add(this.jitter);
      this.losT -= dt; if (this.losT <= 0) { this.losT = .3; this.los = lineOfSight(b.center, tg.center); }
      this.burstT -= dt; if (this.burstT < -2.5) this.burstT = rand(.4, 1.2);
      b.lock = W === 'seeker' ? tg : null;
      inp.fire = W !== 'nano' && d < range && (this.los || ((W === 'mortar' || W === 'seeker') && d > 40)) && (this.burstT < 0 || W === 'chain');
    } else { inp.fire = false; inp.aim.set(b.pos.x + fx * 50, b.pos.y + 2, b.pos.z + fz * 50); }
  }
}
function nearestEnemy(b) {
  let best = null, bd = Infinity;
  for (const o of world.bots) { if (o.dead || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos) * (o.isPlayer ? .9 : 1); if (o.cloaked && d > 15) continue; if (d < bd) { bd = d; best = o; } }
  return best;
}
function hurtAlly(b) {
  let best = null, bs = 1.02;
  for (const o of world.bots) { if (o.dead || o === b || o.team !== b.team) continue; const r = o.hp / o.maxHp; const dd = o.pos.distanceTo(b.pos); if (dd > 260) continue; const score = r + dd / 1600; if (score < bs) { bs = score; best = o; } }
  return best;
}
