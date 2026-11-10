// ================= MAP VARIANTS: TIME OF DAY, RUSTGATE RUINS, LUNAR OUTPOST =================
const TOD_LOOK = {
  dawn: { sky: [0xf0b7a0, 0x5f78aa], fog: [0xe6b8a4, .35], sunY: .2, sunCol: 0xffc9a0, sunK: .8, hemiK: .8, stars: 0 },
  dusk: { sky: [0xff9558, 0x2e3a66], fog: [0xc9866a, .4], sunY: .14, flip: true, sunCol: 0xffa868, sunK: .72, hemiK: .7, stars: .25 },
  night: { sky: [0x1b2438, 0x04060b], fog: [0x141a26, .75], sunY: .55, sunCol: 0x9fb4ff, sunK: .32, hemiK: .5, hemi: [0x5a6a90, 0x151515], stars: 1, clouds: .5 },
};
function todMap(M, tod) {
  const L = TOD_LOOK[tod], out = { ...M, stars: M.moon ? 1 : 0 };
  if (!L) return out;
  const mix = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
  out.sky = L.sky.slice(); out.fog = mix(M.fog, L.fog[0], L.fog[1]);
  const s = new T.Vector3(...M.sun); if (L.flip) { s.x = -s.x; s.z = -s.z; } s.y = L.sunY; s.normalize(); out.sun = [s.x, s.y, s.z];
  out.sunCol = L.sunCol; out.sunI = M.sunI * L.sunK;
  out.hemi = [L.hemi ? L.hemi[0] : M.hemi[0], L.hemi ? L.hemi[1] : M.hemi[1], M.hemi[2] * L.hemiK];
  out.stars = L.stars; if (L.clouds) out.clouds = M.clouds * L.clouds;
  out.night = tod === 'night'; out.tod = tod;
  return out;
}
// ---------- heightfield extras ----------
function mapCraters(M) {
  if (!M.moon) return null;
  const r = mulberry32(M.seed * 3), list = [], half = M.size / 2;
  for (let i = 0; i < 46; i++) {
    const x = (r() * 2 - 1) * (half - 70), z = (r() * 2 - 1) * (half - 70), R = 10 + Math.pow(r(), 2) * 46;
    if (Math.abs(z) > half - 190 && Math.abs(x) < 90) continue; // keep the bases flat
    list.push([x, z, R, .25 + r() * .2]);
  }
  return list;
}
function craterH(list, x, z) {
  let h = 0;
  for (const [cx, cz, R, d] of list) {
    const q = Math.hypot(x - cx, z - cz) / R; if (q > 1.6) continue;
    h += q < 1 ? -R * d * (1 - q * q) + R * .1 * Math.pow(q, 6) : R * .1 * Math.max(0, 1 - (q - 1) / .6) ** 2;
  }
  return h;
}
const CITY_GRID = 74, CITY_STREET = 18;
function cityStreet(x, z) { const m = v => { const a = ((v % CITY_GRID) + CITY_GRID) % CITY_GRID; return a < CITY_STREET; }; return m(x + 9) || m(z + 9); }
// ---------- buildings (Rustgate) ----------
// A building is a box made of floors. Its footprint is covered by small round colliders, so the
// existing physics, projectiles and line-of-sight code treat it like any other obstacle.
// Heavy explosions knock floors off; the host decides and sends the floor counts to everyone.
const FLOOR_H = 6;
function windowTexture(lit) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'), r = mulberry32(lit ? 3 : 2);
  g.fillStyle = lit ? '#000' : '#8a8780'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const on = r() < .35;
    g.fillStyle = lit ? (on ? '#ffcf86' : '#000') : (r() < .3 ? '#2b2e31' : '#3c4146'); g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
  }
  if (!lit) { g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 30; i++) g.fillRect(r() * 64, r() * 64, 2 + r() * 6, 1 + r() * 3); }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = lit ? T.LinearSRGBColorSpace : T.SRGBColorSpace; t.magFilter = T.NearestFilter; return t;
}
function buildCity(s, M, rnd) {
  world.buildings = [];
  const B = world.bound, wall = windowTexture(false), lit = windowTexture(true), night = !!M.night || M.tod === 'dusk';
  const mats = [0x8a857c, 0x7a7d80, 0x9a8a78, 0x6e6a66].map(c => { const m = new T.MeshStandardMaterial({ color: c, map: wall, roughness: .88, metalness: .05 }); if (night) { m.emissive = new T.Color(1, .85, .6); m.emissiveMap = lit; m.emissiveIntensity = M.night ? 1.6 : .7; } return m; });
  const roofMat = new T.MeshStandardMaterial({ color: 0x3b3a39, roughness: .95 });
  const clear = (x, z, r) => !(Math.abs(z) > world.spawnZ - 130 - r && Math.abs(x) < 95 + r) && capturePoints(world.half).every(p => Math.hypot(p.x - x, p.z - z) > 34 + r);
  const geo = new T.BoxGeometry(1, 1, 1);
  for (let gx = -B + 10; gx < B - 30; gx += CITY_GRID) for (let gz = -B + 10; gz < B - 30; gz += CITY_GRID) {
    const lot = CITY_GRID - CITY_STREET, ox = gx + CITY_STREET - 9 + 2, oz = gz + CITY_STREET - 9 + 2;
    const n = 1 + (rnd() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const w = 12 + rnd() * (lot * .5), d = 12 + rnd() * (lot * .5), x = ox + rnd() * (lot - w - 4) + w / 2, z = oz + rnd() * (lot - d - 4) + d / 2;
      if (!clear(x, z, Math.max(w, d) / 2) || world.buildings.some(b => Math.abs(b.x - x) < (b.w + w) / 2 + 3 && Math.abs(b.z - z) < (b.d + d) / 2 + 3)) continue;
      const floors = 2 + (rnd() * (rnd() < .2 ? 7 : 4) | 0), gy = Math.min(bedH(x - w / 2, z - d / 2), bedH(x + w / 2, z + d / 2), bedH(x, z)) - .5;
      const mat = mats[rnd() * mats.length | 0]; // shared: each building scales its own texture coordinates instead
      const g = new T.Group(); g.position.set(x, gy, z); s.add(g);
      const b = { x, z, w, d, gy, floors, max: floors, hp: 2600, g, mat, roofMat, geo, cols: [], meshes: [] };
      // round colliders on a grid over the footprint
      const step = 4.5, cr = step * .75;
      for (let cx = -w / 2 + step / 2; cx < w / 2; cx += step) for (let cz = -d / 2 + step / 2; cz < d / 2; cz += step) {
        const o = { x: x + Math.min(cx, w / 2 - cr * .7), z: z + Math.min(cz, d / 2 - cr * .7), r: cr, cr, top: gy + floors * FLOOR_H, bld: b }; addObstacle(o); b.cols.push(o);
      }
      world.buildings.push(b); cityBuildingMesh(b);
    }
  }
  // street lamps and burnt-out barricades
  const lampMat = new T.MeshStandardMaterial({ color: 0x2c2f33, roughness: .6, metalness: .6 }), bulb = new T.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd9a0, emissiveIntensity: night ? 4 : .6 });
  for (let gx = -B + 10; gx < B; gx += CITY_GRID) for (let gz = -B + 10; gz < B; gz += CITY_GRID * 2) {
    const x = gx - 1, z = gz + 30; if (!clear(x, z, 4)) continue;
    const p = new T.Mesh(new T.CylinderGeometry(.18, .22, 9, 6), lampMat); p.position.set(x, bedH(x, z) + 4.5, z); s.add(p);
    const l = new T.Mesh(new T.BoxGeometry(1.4, .3, .5), bulb); l.position.set(x + .6, bedH(x, z) + 9, z); s.add(l);
  }
}
function cityBuildingMesh(b) {
  for (const m of b.meshes) b.g.remove(m); b.meshes = [];
  const H = b.floors * FLOOR_H;
  if (b.bodyGeo) b.bodyGeo.dispose();
  b.bodyGeo = new T.BoxGeometry(1, 1, 1); const uv = b.bodyGeo.attributes.uv;
  // faces: +x, -x, +y, -y, +z, -z (4 vertices each). Windows repeat every 6 m across and once per floor.
  for (let f = 0; f < 6; f++) { const su = f < 2 ? Math.max(1, Math.round(b.d / 6)) : f > 3 ? Math.max(1, Math.round(b.w / 6)) : 0, sv = f === 2 || f === 3 ? 0 : b.floors; for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv); } }
  const body = new T.Mesh(b.bodyGeo, b.mat); body.scale.set(b.w, H, b.d); body.position.y = H / 2;
  const roof = new T.Mesh(b.geo, b.roofMat); roof.scale.set(b.w + .6, .7, b.d + .6); roof.position.y = H + .2;
  b.meshes.push(body, roof);
  if (b.floors < b.max) { // jagged broken top
    const r = mulberry32(b.floors * 31 + (b.x | 0));
    for (let i = 0; i < 7; i++) { const c = new T.Mesh(b.geo, b.mat); const sx = 2 + r() * b.w * .35, sz = 2 + r() * b.d * .35; c.scale.set(sx, 1 + r() * 3.5, sz); c.position.set((r() - .5) * (b.w - sx), H + c.scale.y / 2, (r() - .5) * (b.d - sz)); b.meshes.push(c); }
  }
  for (const m of b.meshes) { m.castShadow = m.receiveShadow = true; b.g.add(m); }
  for (const o of b.cols) o.top = b.gy + H;
}
// host only: heavy explosions wear buildings down a floor at a time
function damageBuildings(pos, dmg, R) {
  if (!world.buildings || !match || !match.isHost || match.over) return;
  for (const b of world.buildings) {
    if (b.floors <= 1) continue;
    const dx = Math.max(0, Math.abs(pos.x - b.x) - b.w / 2), dz = Math.max(0, Math.abs(pos.z - b.z) - b.d / 2);
    if (dx > R + 1 || dz > R + 1 || pos.y > b.gy + b.floors * FLOOR_H + R) continue;
    b.hp -= dmg;
    if (b.hp <= 0) { b.hp = 2600; buildingDrop(b, true); match.bldDirty = true; }
  }
}
function buildingDrop(b, fx) {
  b.floors = Math.max(1, b.floors - 1); cityBuildingMesh(b);
  if (fx && !HEADLESS) {
    const top = new T.Vector3(b.x, b.gy + b.floors * FLOOR_H + 3, b.z);
    explosion(top, true); for (let i = 0; i < 26; i++) emit(b.x + rand(-b.w / 2, b.w / 2), top.y + rand(0, 3), b.z + rand(-b.d / 2, b.d / 2), rand(-3, 3), rand(1, 5), rand(-3, 3), rand(2, 4), rand(1.5, 3), 0x8a857c, -.6);
    for (let i = 0; i < 8; i++) { const c = new T.Mesh(b.geo, b.mat); c.scale.set(rand(1, 2.5), rand(1, 2.5), rand(1, 2.5)); c.position.copy(top).add(new T.Vector3(rand(-b.w / 3, b.w / 3), rand(0, 2), rand(-b.d / 3, b.d / 3))); world.scene.add(c); addDebris(c, new T.Vector3(rand(-8, 8), rand(4, 12), rand(-8, 8)), new T.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)), rand(5, 8)); }
  }
}
// the host sends floor counts; everyone else catches up
const buildingState = () => world.buildings ? world.buildings.map(b => b.floors) : null;
function applyBuildingState(arr) {
  if (!world.buildings || !Array.isArray(arr)) return;
  world.buildings.forEach((b, i) => { const f = clamp(arr[i] | 0, 1, b.max); while (b.floors > f) buildingDrop(b, true); });
}
function resetBuildings() { if (!world.buildings) return; for (const b of world.buildings) if (b.floors !== b.max) { b.floors = b.max; b.hp = 2600; cityBuildingMesh(b); } }
// ---------- Lunar Outpost ----------
function buildMoon(s, M, rnd) {
  world.pads = [];
  const B = world.bound;
  // the home planet hangs in the sky
  if (!HEADLESS) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'), r = mulberry32(8);
    g.fillStyle = '#1d4f9a'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < .5 ? '#3f7d3a' : '#8a7a4a'; g.beginPath(); g.ellipse(r() * 256, 20 + r() * 88, 8 + r() * 30, 5 + r() * 16, r() * 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 60; i++) { g.beginPath(); g.ellipse(r() * 256, r() * 128, 6 + r() * 24, 2 + r() * 5, 0, 0, 7); g.fill(); }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const planet = new T.Mesh(new T.SphereGeometry(60, 32, 20), new T.MeshBasicMaterial({ map: tex, fog: false }));
    planet.position.set(-420, 330, 620); planet.rotation.z = .4; planet.renderOrder = -1; planet.userData.own = true; world.planet = planet; s.add(planet);
  }
  const glass = new T.MeshStandardMaterial({ color: 0x8fd8ff, roughness: .05, metalness: .2, transparent: true, opacity: .35, envMapIntensity: 1.6 });
  const metal = new T.MeshStandardMaterial({ color: 0xc9ccd2, roughness: .35, metalness: .8 });
  const clear = (x, z, r) => !(Math.abs(z) > world.spawnZ - 120 - r && Math.abs(x) < 95 + r) && capturePoints(world.half).every(p => Math.hypot(p.x - x, p.z - z) > 32 + r) && world.rocks.every(o => Math.hypot(o.x - x, o.z - z) > o.cr + r + 4);
  for (let i = 0, tries = 0; i < 9 && tries < 300; tries++) {
    const x = (rnd() * 2 - 1) * (B - 50), z = (rnd() * 2 - 1) * (B - 60), r = 10 + rnd() * 9; if (!clear(x, z, r)) continue; i++;
    const gy = bedH(x, z) - .5;
    const ring = new T.Mesh(new T.CylinderGeometry(r + .6, r + .9, 2.2, 28), metal); ring.position.set(x, gy + 1.1, z); s.add(ring);
    const dome = new T.Mesh(new T.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass); dome.position.set(x, gy + 2.2, z); s.add(dome);
    const core = new T.Mesh(new T.CylinderGeometry(r * .3, r * .35, r * .5, 12), new T.MeshStandardMaterial({ color: 0x223, emissive: 0x7fdcff, emissiveIntensity: 1.5 })); core.position.set(x, gy + 2.2 + r * .25, z); s.add(core);
    ring.castShadow = ring.receiveShadow = true;
    addObstacle({ x, z, r, cr: r * .92, top: gy + 2 + r * .9 });
  }
  for (let i = 0, tries = 0; i < 7 && tries < 300; tries++) { // antenna masts
    const x = (rnd() * 2 - 1) * (B - 40), z = (rnd() * 2 - 1) * (B - 40); if (!clear(x, z, 3)) continue; i++;
    const gy = bedH(x, z), h = 18 + rnd() * 14;
    const mast = new T.Mesh(new T.CylinderGeometry(.35, .6, h, 6), metal); mast.position.set(x, gy + h / 2, z); mast.castShadow = true; s.add(mast);
    const dish = new T.Mesh(new T.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, 1.1), metal); dish.position.set(x, gy + h, z); dish.rotation.x = -1; s.add(dish);
    const blink = new T.Mesh(new T.SphereGeometry(.4, 8, 6), new T.MeshBasicMaterial({ color: new T.Color(0xff3030).multiplyScalar(3) })); blink.position.set(x, gy + h + 1.6, z); s.add(blink);
    addObstacle({ x, z, r: 1, cr: 1.2, top: gy + h });
  }
  // jump pads: drive on, get launched
  const padSpots = [[-120, -60], [120, 60], [0, -150], [0, 150], [-200, 120], [200, -120], [-60, 40], [60, -40]];
  for (const [px, pz] of padSpots) {
    const x = px * world.half / 450, z = pz * world.half / 450; if (Math.abs(x) > B - 20 || Math.abs(z) > B - 20) continue;
    const gy = bedH(x, z), g = new T.Group(); g.position.set(x, gy + .15, z);
    const base = new T.Mesh(new T.CylinderGeometry(6, 6.6, .5, 24), metal); g.add(base);
    const glow = new T.Mesh(new T.RingGeometry(3.4, 5.4, 32).rotateX(-HALF_PI), new T.MeshBasicMaterial({ color: new T.Color(0x5df0ff).multiplyScalar(2.5), transparent: true, opacity: .9, side: T.DoubleSide })); glow.position.y = .3; g.add(glow);
    s.add(g); world.pads.push({ x, z, y: gy, r: 6, glow });
  }
}
function updatePads(dt) {
  if (!world.pads) return;
  for (const p of world.pads) { p.glow.material.opacity = .55 + .4 * Math.sin(world.time * 5 + p.x); p.glow.rotation.y += dt; }
  for (const b of world.bots) {
    if (b.dead || b.remote) continue;
    b.padCd = Math.max(0, (b.padCd || 0) - dt);
    if (b.padCd > 0) continue;
    for (const p of world.pads) {
      if (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > p.r || b.pos.y + b.bottomLocal > p.y + 3) continue;
      b.vel.y = Math.max(b.vel.y, 24); const sp = Math.hypot(b.vel.x, b.vel.z); if (sp > 2) { b.vel.x *= 1.35; b.vel.z *= 1.35; }
      b.padCd = 1.5; if (!HEADLESS) { flash(new T.Vector3(p.x, p.y + 1, p.z), 3, 0x5df0ff, .3); SFX.dash && SFX.dash(b.center); }
    }
  }
}
// minimap marks for buildings and pads
function drawMapExtras(g, mx, my, S) {
  if (world.spheres) { g.fillStyle = 'rgba(150,140,130,.55)'; for (const o of world.spheres) { g.beginPath(); g.arc(mx(o.x), my(o.z), Math.max(1.5, o.r * S), 0, 7); g.fill(); } }
  if (world.buildings) { g.fillStyle = 'rgba(30,30,32,.75)'; for (const b of world.buildings) g.fillRect(mx(b.x + b.w / 2), my(b.z + b.d / 2), b.w * S, b.d * S); }
  if (world.pads) { g.strokeStyle = '#5df0ff'; g.lineWidth = 2; for (const p of world.pads) { g.beginPath(); g.arc(mx(p.x), my(p.z), 5, 0, 7); g.stroke(); } }
}
// ---------- Orbital Wreckfield (Space Battle) ----------
// Asteroids and the wrecked station are spheres: bots, shots and beams collide with them in 3D.
function buildSpace(s, M, rnd) {
  world.spheres = [];
  const B = world.bound, rock = new T.MeshStandardMaterial({ color: 0x6a625c, roughness: .95, flatShading: true }), rock2 = new T.MeshStandardMaterial({ color: 0x4f4844, roughness: .95, flatShading: true });
  const geo = jitterGeo(new T.IcosahedronGeometry(1, 1), .28, M.seed);
  const ims = [new T.InstancedMesh(geo, rock, 200), new T.InstancedMesh(geo, rock2, 200)], cnt = [0, 0];
  const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3();
  const free = (x, y, z, r) => Math.abs(z) < world.spawnZ - 70 - r && world.spheres.every(o => Math.hypot(o.x - x, o.y - y, o.z - z) > o.r + r + 6);
  for (let i = 0, tries = 0; i < 150 && tries < 3000; tries++) {
    const r = 2.5 + Math.pow(rnd(), 2.2) * 18, x = (rnd() * 2 - 1) * (B - 20), z = (rnd() * 2 - 1) * (B - 20), y = -25 + rnd() * 180;
    if (!free(x, y, z, r)) continue; i++;
    const k = i % 2; q.setFromEuler(e.set(rnd() * 6, rnd() * 6, rnd() * 6));
    m4.compose(v.set(x, y, z), q, sc.set(r, r * (.75 + rnd() * .4), r * (.8 + rnd() * .4))); ims[k].setMatrixAt(cnt[k]++, m4);
    world.spheres.push({ x, y, z, r: r * .92 });
  }
  ims.forEach((im, k) => { im.count = cnt[k]; im.castShadow = im.receiveShadow = true; s.add(im); });
  // the wrecked station: a broken ring around a hub, high in the middle of the field
  const metal = new T.MeshStandardMaterial({ color: 0x8a929a, roughness: .45, metalness: .75 }), dark = new T.MeshStandardMaterial({ color: 0x2c3238, roughness: .6, metalness: .6 });
  const glow = new T.MeshStandardMaterial({ color: 0x102030, emissive: 0x5fe8ff, emissiveIntensity: 2 });
  const st = new T.Group(); st.position.set(0, 70, 0); st.rotation.set(.35, .4, .15); s.add(st);
  const hub = new T.Mesh(new T.SphereGeometry(11, 24, 16), metal); st.add(hub);
  const band = new T.Mesh(new T.TorusGeometry(11.2, 1, 8, 32).rotateX(HALF_PI), glow); st.add(band);
  for (let i = 0; i < 4; i++) { const sp = new T.Mesh(new T.BoxGeometry(1.6, 1.6, 34), dark); sp.rotation.y = i * HALF_PI / 2 * 2; sp.position.set(0, 0, 0); st.add(sp); }
  const ringR = 42, segs = 20;
  for (let i = 0; i < segs; i++) {
    if (i === 6 || i === 7 || i === 15) continue; // blown-out sections
    const a = i / segs * Math.PI * 2, seg = new T.Mesh(new T.BoxGeometry(9, 5, 13.5), i % 3 ? metal : dark);
    seg.position.set(Math.cos(a) * ringR, 0, Math.sin(a) * ringR); seg.rotation.y = -a; st.add(seg);
    const win = new T.Mesh(new T.BoxGeometry(9.2, 1, 6), glow); win.position.copy(seg.position); win.rotation.y = -a; st.add(win);
  }
  st.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  st.updateMatrixWorld(true);
  const wp = new T.Vector3(); world.spheres.push({ x: st.position.x, y: st.position.y, z: st.position.z, r: 11.5 });
  for (let i = 0; i < segs * 2; i++) { const seg = Math.floor(i / 2); if (seg === 6 || seg === 7 || seg === 15) continue; const a = i / (segs * 2) * Math.PI * 2; wp.set(Math.cos(a) * ringR, 0, Math.sin(a) * ringR).applyMatrix4(st.matrixWorld); world.spheres.push({ x: wp.x, y: wp.y, z: wp.z, r: 4.2 }); }
  world.station = st;
  // launch gates where each team arrives
  for (const [team, sz] of [[0, -world.spawnZ], [1, world.spawnZ]]) {
    const col = team === 0 ? 0x4fb0ff : 0xff5444;
    const gate = new T.Mesh(new T.TorusGeometry(30, 1.2, 10, 48), new T.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 2.2 }));
    gate.position.set(0, 55, sz + (team === 0 ? -25 : 25)); s.add(gate);
  }
  // a planet and a sun disk far away
  if (!HEADLESS) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'), r = mulberry32(19);
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#c9874a'); gr.addColorStop(.5, '#e8b07a'); gr.addColorStop(1, '#9a5a32'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${120 + r() * 80 | 0},${70 + r() * 40 | 0},${40 + r() * 30 | 0},.5)`; g.fillRect(0, r() * 128, 256, 2 + r() * 8); }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const planet = new T.Mesh(new T.SphereGeometry(140, 40, 24), new T.MeshBasicMaterial({ map: tex, fog: false })); planet.position.set(520, -160, -700); planet.rotation.z = .3; planet.renderOrder = -1; world.planet = planet; s.add(planet);
    const rings = new T.Mesh(new T.RingGeometry(170, 250, 64), new T.MeshBasicMaterial({ color: 0xd8b48a, transparent: true, opacity: .35, side: T.DoubleSide, fog: false, depthWrite: false })); rings.position.copy(planet.position); rings.rotation.set(1.2, .2, .3); s.add(rings);
  }
}
// ---------- sphere obstacles (space) ----------
function sphereAt(p, pad = 0) { const S = world.spheres; if (!S) return null; for (const o of S) { const r = o.r + pad, dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z; if (dx * dx + dy * dy + dz * dz < r * r) return o; } return null; }
// distance along a ray to the first sphere, or Infinity
function raySpheres(o, d, maxT) {
  const S = world.spheres; if (!S) return Infinity; let best = Infinity;
  for (const s of S) { const lx = s.x - o.x, ly = s.y - o.y, lz = s.z - o.z, tc = lx * d.x + ly * d.y + lz * d.z; if (tc < 0 || tc - s.r > maxT) continue; const d2 = lx * lx + ly * ly + lz * lz - tc * tc; if (d2 > s.r * s.r) continue; const t = tc - Math.sqrt(s.r * s.r - d2); if (t >= 0 && t < best) best = t; }
  return best;
}
function segmentClear(a, b) { if (!world.spheres) return true; const d = b.clone().sub(a), L = d.length(); d.divideScalar(L || 1); return raySpheres(a, d, L) > L; }
function pushOutOfSpheres(b) {
  const S = world.spheres; if (!S) return;
  for (const o of S) {
    const dx = b.center.x - o.x, dy = b.center.y - o.y, dz = b.center.z - o.z, min = o.r + b.radius * .75, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= min * min || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, push = min - d;
    b.pos.x += nx * push; b.pos.y += ny * push; b.pos.z += nz * push; b.alt += ny * push;
    const vn = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz; if (vn < 0) { b.vel.x -= vn * nx * 1.3; b.vel.y -= vn * ny * 1.3; b.vel.z -= vn * nz * 1.3; }
  }
}
