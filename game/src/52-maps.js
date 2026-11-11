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
// colour grade per map (and a cooler, darker take at night): saturation, contrast, shadow tint, highlight tint
const MAP_GRADE = {
  dust: { sat: 1.08, con: 1.06, tS: [1.0, .96, .9], tH: [1.05, 1.0, .93] },
  frost: { sat: .94, con: 1.05, tS: [.92, .98, 1.07], tH: [1.0, 1.0, 1.03] },
  ash: { sat: 1.1, con: 1.1, tS: [.96, .9, .92], tH: [1.08, .98, .9] },
  city: { sat: .9, con: 1.08, tS: [.95, .98, 1.03], tH: [1.03, 1.0, .96] },
  moon: { sat: .82, con: 1.12, tS: [.96, .98, 1.04], tH: [1.0, 1.0, 1.0] },
  space: { sat: 1.12, con: 1.06, tS: [.92, .94, 1.08], tH: [1.03, 1.0, .97] },
  nebula: { sat: 1.18, con: 1.05, tS: [1.06, .9, 1.0], tH: [1.02, .98, .97] },
  shipyard: { sat: 1.05, con: 1.08, tS: [.92, .97, 1.06], tH: [1.04, 1.01, .96] },
  rings: { sat: 1.1, con: 1.06, tS: [.98, .95, .98], tH: [1.06, 1.0, .9] },
};
function gradeFor(mapId, tod) {
  const g = MAP_GRADE[mapKind(mapId)] || GRADE_NONE, out = { sat: g.sat, con: g.con, tS: g.tS.slice(), tH: g.tH.slice() };
  if (tod === 'night') { out.sat *= .85; out.tS = [out.tS[0] * .9, out.tS[1] * .96, out.tS[2] * 1.1]; }
  else if (tod === 'dusk' || tod === 'dawn') { out.sat *= 1.06; out.tH = [out.tH[0] * 1.05, out.tH[1], out.tH[2] * .94]; }
  return out;
}
// what the battle camera hands the post-processing: bloom, vignette, sun for light shafts, colour grade
function battleLook() {
  const night = world.tod === 'night', sunUp = world.sunDir && world.sunDir.y > .02;
  return { bloom: .6, vignette: .3, sun: sunUp && !night ? world.sunDir : null, sunCol: world.sun ? world.sun.color : null, rays: world.space ? .5 : world.tod === 'dusk' || world.tod === 'dawn' ? .5 : .32, grade: hiQ() ? world.grade : null };
}
function mapCraters(M) {
  if (!M.moon) return null;
  const r = mulberry32(M.seed * 3), list = [], half = M.size / 2;
  for (let i = 0; i < Math.round(46 * (M.area || 1)); i++) {
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
// ---------- Space maps (Space Battle) ----------
// Every obstacle out here is a sphere: bots, shots and beams collide with them in 3D. Four layouts share the helpers below.
const spaceFree = (x, y, z, r) => Math.abs(z) < world.spawnZ - 70 - r && world.spheres.every(o => Math.hypot(o.x - x, o.y - y, o.z - z) > o.r + r + 6);
// a field of instanced rocks; place() returns { x, y, z, r } or null
function spaceRocks(s, M, rnd, n, place, cols, o = {}) {
  const geo = jitterGeo(new T.IcosahedronGeometry(1, o.detail == null ? 1 : o.detail), o.jitter || .28, M.seed + (o.seed || 0));
  const mats = cols.map(c => new T.MeshStandardMaterial({ color: c, roughness: o.rough == null ? .95 : o.rough, metalness: o.metal || 0, flatShading: true, emissive: o.emissive || 0, emissiveIntensity: o.ei || 0 }));
  const per = Math.ceil(n / mats.length) + 1, ims = mats.map(m => new T.InstancedMesh(geo, m, per)), cnt = mats.map(() => 0);
  const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3(), st = o.stretch || [1, 1];
  for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
    const p = place(); if (!p || !spaceFree(p.x, p.y, p.z, p.r)) continue;
    const k = i % mats.length; i++; if (cnt[k] >= per) continue;
    q.setFromEuler(e.set(rnd() * 6, rnd() * 6, rnd() * 6));
    const sy = st[0] + rnd() * (st[1] - st[0]);
    m4.compose(v.set(p.x, p.y, p.z), q, sc.set(p.r, p.r * sy, p.r * (.8 + rnd() * .4))); ims[k].setMatrixAt(cnt[k]++, m4);
    world.spheres.push({ x: p.x, y: p.y, z: p.z, r: p.r * Math.min(1, sy) * .92 });
  }
  ims.forEach((im, k) => { im.count = cnt[k]; im.castShadow = im.receiveShadow = true; s.add(im); });
}
// collision spheres along a line from a to b
function spaceChain(a, b, r, step = r * 1.4) { const L = a.distanceTo(b), n = Math.max(1, Math.round(L / step)); for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); world.spheres.push({ x: p.x, y: p.y, z: p.z, r }); } }
function spaceGates(s) {
  for (const [team, sz] of [[0, -world.spawnZ], [1, world.spawnZ]]) {
    const col = team === 0 ? 0x4fb0ff : 0xff5444;
    const gate = new T.Mesh(new T.TorusGeometry(30, 1.2, 10, 48), new T.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 2.2 }));
    gate.position.set(0, 55, sz + (team === 0 ? -25 : 25)); s.add(gate);
    // marker beacons that pulse along the gate
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, b = new T.Mesh(new T.SphereGeometry(1.1, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(2.2) })); b.position.set(Math.cos(a) * 30, 55 + Math.sin(a) * 30, gate.position.z); s.add(b); }
  }
}
// a far planet: banded colours, optional rings
function spacePlanet(s, o) {
  if (HEADLESS) return;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'), r = mulberry32(o.seed || 19);
  const gr = g.createLinearGradient(0, 0, 0, 256); o.cols.forEach((col, i) => gr.addColorStop(i / (o.cols.length - 1), col)); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 46; i++) { const k = r(); g.fillStyle = `rgba(${o.band[0] + k * 60 | 0},${o.band[1] + k * 40 | 0},${o.band[2] + k * 30 | 0},${.18 + r() * .35})`; const y = r() * 256, h = 2 + r() * 12; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 2); g.lineTo(512, y + h); g.lineTo(0, y + h); g.fill(); }
  if (o.storm) { g.fillStyle = 'rgba(255,240,220,.35)'; g.beginPath(); g.ellipse(180, 150, 30, 12, 0, 0, 7); g.fill(); }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  const planet = new T.Mesh(new T.SphereGeometry(o.r, 48, 32), new T.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, fog: false, envMapIntensity: 0 }));
  planet.position.set(...o.pos); planet.rotation.z = o.tilt || .3; planet.renderOrder = -1; world.planet = planet; s.add(planet);
  // a thin glowing atmosphere
  const atm = new T.Mesh(new T.SphereGeometry(o.r * 1.04, 48, 32), new T.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: T.BackSide, blending: T.AdditiveBlending,
    uniforms: { c: { value: new T.Color(o.atm || 0x88aaff) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(c * f * 1.4, f); }' }));
  atm.position.copy(planet.position); atm.renderOrder = -1; s.add(atm);
  if (o.ring) {
    const rc = document.createElement('canvas'); rc.width = 512; rc.height = 4; const rg = rc.getContext('2d');
    for (let x = 0; x < 512; x++) { const a = (.25 + .75 * Math.abs(Math.sin(x * .07) * Math.sin(x * .013 + 1))) * (x < 30 || x > 490 ? 0 : 1) * (r() < .08 ? .2 : 1); rg.fillStyle = `rgba(${o.ring[0]},${o.ring[1]},${o.ring[2]},${a.toFixed(3)})`; rg.fillRect(x, 0, 1, 4); }
    const rt = new T.CanvasTexture(rc); rt.colorSpace = T.SRGBColorSpace;
    const inner = o.r * 1.25, outer = o.r * 2.1, rgeo = new T.RingGeometry(inner, outer, 128, 1), uv = rgeo.attributes.uv, p = rgeo.attributes.position, v3 = new T.Vector3();
    for (let i = 0; i < p.count; i++) { v3.fromBufferAttribute(p, i); uv.setXY(i, (v3.length() - inner) / (outer - inner), .5); }
    const rings = new T.Mesh(rgeo, new T.MeshBasicMaterial({ map: rt, transparent: true, side: T.DoubleSide, fog: false, depthWrite: false })); rings.position.copy(planet.position); rings.rotation.set(o.ringTilt || 1.2, .2, .1); rings.renderOrder = -1; s.add(rings);
  }
}
// the nebula sky: painted gas clouds and stars, wrapped around the sky dome (so it follows the camera)
function spaceSky(M) {
  if (HEADLESS || !world.sky) return;
  const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), r = mulberry32(M.seed * 13 + 5);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
  const cols = (M.nebula || [0x6a3cff, 0x2a8cff]).map(h => new T.Color(h)), rgba = (cl, a) => `rgba(${cl.r * 255 | 0},${cl.g * 255 | 0},${cl.b * 255 | 0},${a})`;
  // a band of gas across the sky, built from many soft blobs
  const bandY = H * (.35 + r() * .3), tilt = (r() - .5) * .5;
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = bandY + (x - W / 2) * tilt + (r() - .5) * H * .32 * (r() < .3 ? 2 : 1), rad = 30 + Math.pow(r(), 2) * 220, cl = cols[r() * cols.length | 0].clone().lerp(new T.Color(1, 1, 1), r() * .15);
    for (const dx of [0, -W, W]) { if (x + dx + rad < 0 || x + dx - rad > W) continue; const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad); gr.addColorStop(0, rgba(cl, .085)); gr.addColorStop(1, rgba(cl, 0)); g.fillStyle = gr; g.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2); }
  }
  // dark dust lanes
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 70; i++) { const x = r() * W, y = bandY + (x - W / 2) * tilt + (r() - .5) * H * .12, rad = 20 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  // stars: many faint, a few bright with a soft halo; denser along the band
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5200; i++) {
    const inBand = r() < .45, x = r() * W, y = inBand ? bandY + (x - W / 2) * tilt + (r() - .5) * H * .25 : r() * H, b = Math.pow(r(), 3), t = r();
    const col = t < .15 ? [180, 200, 255] : t < .25 ? [255, 220, 180] : [255, 255, 255];
    g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(.25 + b * .75).toFixed(2)})`; const sz = b > .8 ? 2 : 1; g.fillRect(x, y, sz, sz);
    if (b > .93) { const gr = g.createRadialGradient(x, y, 0, x, y, 7); gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},.5)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 7, y - 7, 14, 14); }
  }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  const dome = new T.Mesh(new T.SphereGeometry(990, 64, 32), new T.MeshBasicMaterial({ map: tex, side: T.BackSide, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
  dome.renderOrder = -1; dome.rotation.y = r() * 6.28; world.sky.renderOrder = -2; world.sky.add(dome);
}
// soft glowing gas clouds you fly through (visual only)
function spaceGas(s, M, rnd, n) {
  if (HEADLESS) return;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.45, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tex = new T.CanvasTexture(c), B = world.bound, cols = M.nebula.map(h => new T.Color(h));
  for (let i = 0; i < n; i++) {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, color: cols[i % cols.length].clone().multiplyScalar(.9 + rnd() * .6), transparent: true, opacity: .1 + rnd() * .14, depthWrite: false, blending: T.AdditiveBlending, fog: true }));
    sp.position.set((rnd() * 2 - 1) * B, -20 + rnd() * 200, (rnd() * 2 - 1) * B); sp.scale.setScalar(60 + rnd() * 160); sp.material.rotation = rnd() * 6.28; s.add(sp);
  }
}
const spaceMetal = () => new T.MeshStandardMaterial({ color: 0x8a929a, roughness: .42, metalness: .78 }), spaceDark = () => new T.MeshStandardMaterial({ color: 0x2c3238, roughness: .6, metalness: .6 });
const spaceGlow = (c = 0x5fe8ff, k = 2) => new T.MeshStandardMaterial({ color: 0x102030, emissive: c, emissiveIntensity: k });
function buildSpace(s, M, rnd) {
  world.spheres = [];
  const B = world.bound, A = M.area || 1, L = M.layout || 'wreck';
  spaceSky(M); spaceGates(s);
  if (L === 'wreck') {
    spaceRocks(s, M, rnd, Math.round(150 * A), () => ({ r: 2.5 + Math.pow(rnd(), 2.2) * 18, x: (rnd() * 2 - 1) * (B - 20), z: (rnd() * 2 - 1) * (B - 20), y: -25 + rnd() * 180 }), [0x6a625c, 0x4f4844]);
    // the wrecked station: a broken ring around a hub, high in the middle of the field
    const metal = spaceMetal(), dark = spaceDark(), glow = spaceGlow();
    const st = new T.Group(); st.position.set(0, 70, 0); st.rotation.set(.35, .4, .15); s.add(st);
    st.add(new T.Mesh(new T.SphereGeometry(11, 24, 16), metal));
    st.add(new T.Mesh(new T.TorusGeometry(11.2, 1, 8, 32).rotateX(HALF_PI), glow));
    for (let i = 0; i < 4; i++) { const sp = new T.Mesh(new T.BoxGeometry(1.6, 1.6, 34), dark); sp.rotation.y = i * HALF_PI; st.add(sp); }
    const ringR = 42, segs = 20, gone = [6, 7, 15];
    for (let i = 0; i < segs; i++) {
      if (gone.includes(i)) continue; // blown-out sections
      const a = i / segs * Math.PI * 2, seg = new T.Mesh(new T.BoxGeometry(9, 5, 13.5), i % 3 ? metal : dark);
      seg.position.set(Math.cos(a) * ringR, 0, Math.sin(a) * ringR); seg.rotation.y = -a; st.add(seg);
      const win = new T.Mesh(new T.BoxGeometry(9.2, 1, 6), glow); win.position.copy(seg.position); win.rotation.y = -a; st.add(win);
    }
    st.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); st.updateMatrixWorld(true);
    world.spheres.push({ x: st.position.x, y: st.position.y, z: st.position.z, r: 11.5 });
    const wp = new T.Vector3();
    for (let i = 0; i < segs * 2; i++) { if (gone.includes(Math.floor(i / 2))) continue; const a = i / (segs * 2) * Math.PI * 2; wp.set(Math.cos(a) * ringR, 0, Math.sin(a) * ringR).applyMatrix4(st.matrixWorld); world.spheres.push({ x: wp.x, y: wp.y, z: wp.z, r: 4.6 }); }
    world.station = st;
    spacePlanet(s, { r: 140, pos: [520, -160, -700], cols: ['#c9874a', '#e8b07a', '#9a5a32'], band: [120, 70, 40], ring: [216, 180, 138], atm: 0xffb07a, seed: 19 });
  } else if (L === 'nebula') {
    // ice shards: long glassy crystals that glint in the nebula light
    spaceRocks(s, M, rnd, Math.round(90 * A), () => ({ r: 2 + Math.pow(rnd(), 2) * 10, x: (rnd() * 2 - 1) * (B - 20), z: (rnd() * 2 - 1) * (B - 20), y: -20 + rnd() * 190 }), [0xb8d8ff, 0xd8a8ff], { detail: 0, jitter: .2, rough: .15, metal: .3, emissive: 0x401838, ei: .6, stretch: [1.6, 2.6], seed: 4 });
    spaceRocks(s, M, rnd, Math.round(50 * A), () => ({ r: 4 + Math.pow(rnd(), 2) * 14, x: (rnd() * 2 - 1) * (B - 20), z: (rnd() * 2 - 1) * (B - 20), y: -20 + rnd() * 190 }), [0x4a3640, 0x3a2a34]);
    spaceGas(s, M, rnd, Math.round(46 * A));
    // a derelict relay mast in the middle, dishes hanging off it at three levels
    const metal = spaceMetal(), dark = spaceDark(), glow = spaceGlow(0xff4a7a, 2.4), relay = new T.Group(); relay.position.set(0, 0, 0); relay.rotation.z = .12; s.add(relay);
    const mast = new T.Mesh(new T.CylinderGeometry(3.2, 4.2, 170, 12), dark); mast.position.y = 75; relay.add(mast);
    for (const [y, rr] of [[30, 16], [80, 22], [130, 13]]) {
      const ring = new T.Mesh(new T.TorusGeometry(rr, 1.4, 8, 36).rotateX(HALF_PI), metal); ring.position.y = y; relay.add(ring);
      const lit = new T.Mesh(new T.TorusGeometry(rr, .5, 6, 36).rotateX(HALF_PI), glow); lit.position.y = y + 1.2; relay.add(lit);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + y, arm = new T.Mesh(new T.BoxGeometry(rr, 1.2, 1.2), dark); arm.position.set(Math.cos(a) * rr / 2, y, Math.sin(a) * rr / 2); arm.rotation.y = -a; relay.add(arm); }
      const dish = new T.Mesh(new T.SphereGeometry(7, 18, 8, 0, Math.PI * 2, 0, 1.0), metal); dish.material = metal; dish.position.set(rr, y + 4, 0); dish.rotation.z = -1.1; relay.add(dish);
    }
    const tip = new T.Mesh(new T.SphereGeometry(2.4, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(0xff4a7a).multiplyScalar(3) })); tip.position.y = 162; relay.add(tip);
    relay.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); relay.updateMatrixWorld(true);
    spaceChain(new T.Vector3(0, -10, 0).applyMatrix4(relay.matrixWorld), new T.Vector3(0, 160, 0).applyMatrix4(relay.matrixWorld), 5);
    world.station = relay;
    spacePlanet(s, { r: 90, pos: [-480, 140, -620], cols: ['#5a2a4a', '#a04a5a', '#3a1a2a'], band: [140, 60, 80], atm: 0xff6a8a, seed: 31, storm: true });
  } else if (L === 'shipyard') {
    const metal = spaceMetal(), dark = spaceDark(), hullM = new T.MeshStandardMaterial({ color: 0xb8bcc2, roughness: .5, metalness: .6 }), glow = spaceGlow(0xffb84a, 2.2), stripe = new T.MeshStandardMaterial({ color: 0xd8a020, roughness: .6, metalness: .3 });
    // the half-built cruiser: finished bow, open rib cage amidships you can fly through, engines at the stern
    const ship = new T.Group(); ship.position.set(0, 60, 0); ship.rotation.y = .18; s.add(ship);
    const R = 15, bow = new T.Mesh(new T.CylinderGeometry(R, R, 70, 24).rotateZ(HALF_PI), hullM); bow.position.x = 50; ship.add(bow);
    const nose = new T.Mesh(new T.ConeGeometry(R, 34, 24).rotateZ(-HALF_PI), hullM); nose.position.x = 102; ship.add(nose);
    const bridge = new T.Mesh(new T.BoxGeometry(18, 8, 12), hullM); bridge.position.set(40, R + 3, 0); ship.add(bridge);
    const bw = new T.Mesh(new T.BoxGeometry(18.2, 1.4, 12.2), glow); bw.position.set(40, R + 4, 0); ship.add(bw);
    for (const x of [22, 78]) { const s2 = new T.Mesh(new T.CylinderGeometry(R + .2, R + .2, 3, 24).rotateZ(HALF_PI), stripe); s2.position.x = x; ship.add(s2); }
    const spine = new T.Mesh(new T.BoxGeometry(80, 3, 3), dark); spine.position.set(-25, -R + 2, 0); ship.add(spine);
    for (let i = 0; i < 7; i++) { const rib = new T.Mesh(new T.TorusGeometry(R, 1.1, 6, 28, Math.PI * 1.6).rotateY(HALF_PI), metal); rib.position.x = 8 - i * 11; rib.rotation.x = -Math.PI * .3 + (i % 2) * .2; ship.add(rib); }
    const stern = new T.Mesh(new T.CylinderGeometry(R * 1.1, R * .9, 22, 24).rotateZ(HALF_PI), hullM); stern.position.x = -76; ship.add(stern);
    for (const [y, z] of [[6, 6], [6, -6], [-6, 6], [-6, -6]]) { const eng = new T.Mesh(new T.CylinderGeometry(4.5, 5.5, 10, 16).rotateZ(HALF_PI), dark); eng.position.set(-91, y, z); ship.add(eng); const fl = new T.Mesh(new T.CircleGeometry(4, 16).rotateY(-HALF_PI), new T.MeshBasicMaterial({ color: new T.Color(0x6ab8ff).multiplyScalar(2.5) })); fl.position.set(-96.1, y, z); ship.add(fl); }
    ship.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); ship.updateMatrixWorld(true);
    const W = (x, y = 0, z = 0) => new T.Vector3(x, y, z).applyMatrix4(ship.matrixWorld);
    spaceChain(W(18), W(98), R, 9); { const b = W(40, R + 3); world.spheres.push({ x: b.x, y: b.y, z: b.z, r: 8 }); }
    spaceChain(W(-66), W(-92), R, 8); spaceChain(W(-65, -R + 2), W(15, -R + 2), 2.5, 4);
    // scaffold: a girder frame around the ship (joints collide, the open bays do not)
    const gm = new T.MeshStandardMaterial({ color: 0x6a6e74, roughness: .55, metalness: .7 }), X0 = -110, X1 = 120, Y0 = 60 - 34, Y1 = 60 + 34, Z = 34;
    const beam = (a, b) => { const L = a.distanceTo(b), m = new T.Mesh(new T.BoxGeometry(1.8, 1.8, L), gm); m.position.copy(a).lerp(b, .5); m.lookAt(b); m.castShadow = true; s.add(m); };
    const P = (x, y, z) => new T.Vector3(x, y, z).applyAxisAngle(new T.Vector3(0, 1, 0), .18);
    for (let x = X0; x <= X1; x += 46) for (const z of [-Z, Z]) {
      beam(P(x, Y0, z), P(x, Y1, z)); world.spheres.push(...[Y0, Y1].map(y => { const p = P(x, y, z); return { x: p.x, y: p.y, z: p.z, r: 2.6 }; }));
      if (x + 46 <= X1) { beam(P(x, Y0, z), P(x + 46, Y0, z)); beam(P(x, Y1, z), P(x + 46, Y1, z)); beam(P(x, Y0, z), P(x + 46, Y1, z)); }
    }
    for (let x = X0; x <= X1; x += 46) beam(P(x, Y1, -Z), P(x, Y1, Z));
    // work lights on the scaffold
    for (let x = X0; x <= X1; x += 46) for (const z of [-Z, Z]) { const p = P(x, Y1 + 1.5, z), l = new T.Mesh(new T.BoxGeometry(2.4, 1.2, 2.4), new T.MeshBasicMaterial({ color: new T.Color(0xffd27a).multiplyScalar(2.6) })); l.position.copy(p); s.add(l); }
    // cargo containers drifting in loose stacks
    const cc = [0xb8452e, 0x2e6ab8, 0xd8a020, 0x3a8a4a, 0x8a8a8a].map(c => new T.MeshStandardMaterial({ color: c, roughness: .7, metalness: .35 }));
    const cgeo = new T.BoxGeometry(6, 6, 14), q = new T.Quaternion(), e = new T.Euler(), dir = new T.Vector3();
    for (let i = 0, tries = 0; i < Math.round(46 * A) && tries < 900 * A; tries++) {
      const x = (rnd() * 2 - 1) * (B - 30), y = -10 + rnd() * 170, z = (rnd() * 2 - 1) * (B - 30); if (!spaceFree(x, y, z, 8)) continue;
      const stack = 1 + (rnd() * 3 | 0); e.set(rnd() * .6, rnd() * 6.28, rnd() * .6); q.setFromEuler(e);
      for (let k = 0; k < stack; k++) {
        const off = new T.Vector3(0, k * 6.2, 0).applyQuaternion(q), m = new T.Mesh(cgeo, cc[rnd() * cc.length | 0]); m.position.set(x + off.x, y + off.y, z + off.z); m.quaternion.copy(q); m.castShadow = m.receiveShadow = true; s.add(m);
        dir.set(0, 0, 4.2).applyQuaternion(q); world.spheres.push({ x: m.position.x + dir.x, y: m.position.y + dir.y, z: m.position.z + dir.z, r: 4.2 }, { x: m.position.x - dir.x, y: m.position.y - dir.y, z: m.position.z - dir.z, r: 4.2 });
      }
      i++;
    }
    spaceRocks(s, M, rnd, Math.round(40 * A), () => ({ r: 2 + Math.pow(rnd(), 2) * 8, x: (rnd() * 2 - 1) * (B - 20), z: (rnd() * 2 - 1) * (B - 20), y: -20 + rnd() * 190 }), [0x5a5e64, 0x45484c], { metal: .4, rough: .6, seed: 9 });
    world.station = ship;
    spacePlanet(s, { r: 260, pos: [0, -420, -760], cols: ['#2a6ab8', '#4a9ad8', '#e8f0f8', '#3a7a4a', '#1a4a8a'], band: [200, 220, 240], atm: 0x6ab8ff, seed: 7, tilt: .05 });
  } else if (L === 'rings') {
    // bands of ice and rock across the arena, tilted like the planet's rings, with clear lanes between them
    const span = world.spawnZ - 90, bands = [-.62, -.2, .2, .62].map(f => f * span), bw = 26 + 12 * (A - 1);
    spaceRocks(s, M, rnd, Math.round(240 * A), () => { const zc = bands[rnd() * bands.length | 0], x = (rnd() * 2 - 1) * (B - 15); return { r: 1.8 + Math.pow(rnd(), 2.6) * 13, x, z: zc + (rnd() - .5) * bw * 2, y: 65 + x * .1 + (rnd() - .5) * 46 }; }, [0xd8d0c4, 0xb8ac98, 0x8a7e6c], { seed: 3 });
    spaceRocks(s, M, rnd, Math.round(60 * A), () => { const zc = bands[rnd() * bands.length | 0], x = (rnd() * 2 - 1) * (B - 15); return { r: 2 + rnd() * 6, x, z: zc + (rnd() - .5) * bw * 2, y: 65 + x * .1 + (rnd() - .5) * 46 }; }, [0xc8e8ff], { detail: 0, rough: .12, metal: .25, emissive: 0x182838, ei: .5, stretch: [1.2, 1.9], seed: 6 });
    // a few huge moonlets anchor the lanes
    spaceRocks(s, M, rnd, 4, () => ({ r: 22 + rnd() * 12, x: (rnd() * 2 - 1) * (B - 80), z: bands[rnd() * bands.length | 0], y: 40 + rnd() * 60 }), [0x7a6e5c], { seed: 12 });
    // fine dust glinting in each band
    if (!HEADLESS) {
      const n = Math.round(2600 * A), pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const zc = bands[i % bands.length], x = (rnd() * 2 - 1) * B; pos[i * 3] = x; pos[i * 3 + 1] = 65 + x * .1 + (rnd() - .5) * 60; pos[i * 3 + 2] = zc + (rnd() - .5) * bw * 2.4; }
      const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
      s.add(new T.Points(pg, new T.PointsMaterial({ color: 0xffe8c8, size: .6, transparent: true, opacity: .7, depthWrite: false })));
    }
    spacePlanet(s, { r: 300, pos: [-1250, -120, 250], cols: ['#d8b878', '#b88a4a', '#e8d0a0', '#a87a3a'], band: [180, 130, 70], ring: [232, 214, 180], atm: 0xffd8a0, seed: 41, tilt: .1, ringTilt: HALF_PI - .1, storm: true });
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
