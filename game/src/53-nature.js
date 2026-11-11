// ================= NATURE: detailed rocks and foliage =================
// Rock shapes are built once per map from seeded noise (so every client gets the same ones). Foliage that blocks
// shots and movement (trees, cacti) is placed from its own seeded random stream, identical on every client and on
// the dedicated server; grass and shrubs are only for looks.

// cheap 3D noise from two 2D value-noise fields
function noise3(seed) { const a = valueNoise(seed), b = valueNoise(seed + 1); return (x, y, z) => a(x + z * .71, y - z * .37) * .6 + b(y + x * .43, z + x * .19) * .4; }
const _vk = v => `${Math.round(v.x * 1e3)},${Math.round(v.y * 1e3)},${Math.round(v.z * 1e3)}`;
// smooth normals across the duplicated vertices of a non-indexed geometry (polyhedra), keeping one shape
function smoothNormals(g) {
  g.computeVertexNormals(); const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), v = new T.Vector3(), w = new T.Vector3();
  for (let i = 0; i < p.count; i++) { const k = _vk(v.fromBufferAttribute(p, i)); const s = acc.get(k) || acc.set(k, new T.Vector3()).get(k); s.add(w.fromBufferAttribute(n, i)); }
  for (let i = 0; i < p.count; i++) { const s = acc.get(_vk(v.fromBufferAttribute(p, i))).clone().normalize(); n.setXYZ(i, s.x, s.y, s.z); }
  n.needsUpdate = true; return g;
}
// a boulder: a dense sphere pushed in and out by two scales of noise, a flat-ish base, darker crevices
function rockGeo(seed, o = {}) {
  const g = new T.IcosahedronGeometry(1, o.detail == null ? 3 : o.detail), p = g.attributes.position, v = new T.Vector3();
  const big = noise3(seed), small = noise3(seed + 17), cols = new Float32Array(p.count * 3);
  const sx = o.sx || 1, sy = o.sy || 1, sz = o.sz || 1;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const b = big(v.x * 1.25 + seed * .01, v.y * 1.25, v.z * 1.25), s = small(v.x * 3.9, v.y * 3.9, v.z * 3.9);
    // a few broad planes (chipped faces) plus lumps and fine grit
    const chip = Math.max(0, v.dot(_rockCut(seed, 0)) - .55) * .55 + Math.max(0, v.dot(_rockCut(seed, 1)) - .62) * .45;
    const r = 1 + b * .3 + s * .085 - chip;
    v.multiplyScalar(r); if (v.y < -.38) v.y = -.38 + (v.y + .38) * .2; // sits on the ground
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
    const shade = clamp(.74 + b * .28 + s * .2 - chip * .5 + (v.y > .35 ? .07 : 0), .45, 1.12); cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new T.BufferAttribute(cols, 3)); return smoothNormals(g);
}
function _rockCut(seed, k) { const r = mulberry32(seed * 7 + k * 131), a = r() * 6.28, y = r() * .9 - .2; return new T.Vector3(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y)); }
// a mesa / rock pillar: a dense cylinder with layered strata, a weathered outline and a ragged rim (unit size)
function mesaGeo(seed) {
  const g = new T.CylinderGeometry(.8, 1.05, 1, 44, 14), p = g.attributes.position, v = new T.Vector3(), out = noise3(seed), fine = noise3(seed + 5), cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const r = Math.hypot(v.x, v.z), a = Math.atan2(v.z, v.x), y = v.y;
    const lump = out(Math.cos(a) * 1.6, y * 1.8, Math.sin(a) * 1.6) * .16, grit = fine(Math.cos(a) * 5, y * 6, Math.sin(a) * 5) * .05;
    const strata = Math.sin(y * 21 + out(Math.cos(a), y, Math.sin(a)) * 2.4) * .028 * (y > -.45 ? 1 : 0);
    let k = 1 + lump + grit + strata, yy = y;
    if (y > .49) yy = y + fine(v.x * 3, 0, v.z * 3) * .05 * Math.min(1, r * 1.4); // a rough top
    if (r > 1e-4) { v.x *= k; v.z *= k; } v.y = yy; p.setXYZ(i, v.x, v.y, v.z);
    const band = .82 + Math.sin(y * 21) * .07 + lump * .6 + grit * 1.4 + (y > .49 ? .08 : 0); cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = clamp(band, .5, 1.1);
  }
  g.setAttribute('color', new T.BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
}
// rock materials: vertex shading over the map's rock colour, with a fine surface bump
function rockMaterial(col, bump) {
  const m = new T.MeshStandardMaterial({ color: col, vertexColors: true, roughness: .93, metalness: 0 });
  if (bump) { m.bumpMap = bump; m.bumpScale = 1.4; }
  return m;
}
function natureBump() { if (HEADLESS) return null; const t = noiseTexture(); t.repeat.set(3, 3); return t; }

// ---------- foliage ----------
function mergeGeos(list) { // [{geo, m4, color}] -> one geometry with vertex colours
  const pos = [], nor = [], col = [], v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3(), c = new T.Color();
  for (const { geo, m4, color } of list) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, nn = g.attributes.normal; nm.getNormalMatrix(m4); c.set(color);
    const vc = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m4); n.fromBufferAttribute(nn, i).applyMatrix3(nm).normalize(); pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z);
      const k = vc ? vc.getX(i) : 1; col.push(c.r * k, c.g * k, c.b * k);
    }
  }
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new T.Float32BufferAttribute(col, 3)); return out;
}
const M4 = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
// a shrub: a few lumpy balls
function shrubGeo(seed, cols) {
  const r = mulberry32(seed), parts = [];
  for (let i = 0; i < 4; i++) { const a = r() * 6.28, d = i ? .35 + r() * .25 : 0, s = (i ? .45 : .6) + r() * .2; parts.push({ geo: rockGeo(seed + i, { detail: 1 }), m4: M4(Math.cos(a) * d, s * .55, Math.sin(a) * d, s, s * .8, s), color: cols[i % cols.length] }); }
  return mergeGeos(parts);
}
// a cactus: trunk and two arms
function cactusGeo(col) {
  const trunk = new T.CylinderGeometry(.42, .48, 1, 10, 1), cap = new T.SphereGeometry(.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), armV = new T.CylinderGeometry(.28, .3, 1, 8, 1), armH = new T.CylinderGeometry(.28, .28, 1, 8, 1);
  return mergeGeos([
    { geo: trunk, m4: M4(0, 2.2, 0, 1, 4.4, 1), color: col }, { geo: cap, m4: M4(0, 4.4, 0), color: col },
    { geo: armH, m4: M4(.7, 2.1, 0, 1, 1, 1, 0, 0, HALF_PI), color: col }, { geo: armV, m4: M4(1.1, 2.9, 0, 1, 1.6, 1), color: col }, { geo: cap, m4: M4(1.1, 3.7, 0, .66, .66, .66), color: col },
    { geo: armH, m4: M4(-.6, 2.9, 0, 1, .8, 1, 0, 0, HALF_PI), color: col }, { geo: armV, m4: M4(-.95, 3.4, 0, 1, 1, 1), color: col }, { geo: cap, m4: M4(-.95, 3.9, 0, .66, .66, .66), color: col },
  ]);
}
// a flat-topped savanna tree, or a dead charred one
function treeGeo(seed, kind) {
  const r = mulberry32(seed), parts = [], bark = kind === 'dead' ? 0x2a2420 : 0x5a4330;
  parts.push({ geo: new T.CylinderGeometry(.22, .4, 1, 7), m4: M4(0, 2, 0, 1, 4, 1, (r() - .5) * .15, 0, (r() - .5) * .15), color: bark });
  for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + r(), l = 1.6 + r() * 1.2; parts.push({ geo: new T.CylinderGeometry(.08, .16, 1, 5), m4: M4(Math.cos(a) * l * .38, 3.6 + r() * .6, Math.sin(a) * l * .38, 1, l, 1, Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0), color: bark }); }
  if (kind !== 'dead') for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + r(), d = i ? 1.4 : 0; parts.push({ geo: rockGeo(seed + 40 + i, { detail: 1, sy: .35 }), m4: M4(Math.cos(a) * d, 4.6 + r() * .4, Math.sin(a) * d, 2 + r() * .6, 1.4, 2 + r() * .6), color: [0x55682e, 0x627535, 0x4a5c28][i % 3] }); }
  return mergeGeos(parts);
}
const FOLIAGE = {
  desert: { shrubs: 360, shrubCols: [0x6f7440, 0x8a8250, 0x5d6a38], cacti: 70, trees: 22, treeKind: 'savanna' },
  pines: { shrubs: 300, shrubCols: [0x3f5a48, 0xd8e2e6, 0x4c6a52] },
  embers: { shrubs: 160, shrubCols: [0x3a302a, 0x4a3a2c, 0x2a2420], trees: 110, treeKind: 'dead' },
  rubble: { shrubs: 220, shrubCols: [0x4f6a2e, 0x5f7a36, 0x3e5524], trees: 26, treeKind: 'savanna' },
};
// called from setupArena once rocks are placed; ok(x, z, r) says whether a spot is free
function buildFoliage(s, M, B, ok) {
  const F = FOLIAGE[M.decor]; if (!F || M.space) return;
  const A = M.area || 1, m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3();
  const mat = () => new T.MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: 0 });
  // trees and cacti block movement and shots: their own random stream, the same everywhere
  const solid = (n, geo, rad, top) => {
    const r = mulberry32(M.seed * 101 + n), N = Math.round(n * A), im = new T.InstancedMesh(geo, mat(), N); let k = 0;
    for (let tries = 0; k < N && tries < N * 30; tries++) {
      const x = (r() * 2 - 1) * (B - 20), z = (r() * 2 - 1) * (B - 20), sz2 = .8 + r() * .5, ry = r() * 6.28;
      if (!ok(x, z, rad * sz2 + 2)) continue;
      const gy = bedH(x, z) - .2; m4.compose(v.set(x, gy, z), q.setFromEuler(e.set(0, ry, 0)), sc.set(sz2, sz2, sz2)); im.setMatrixAt(k++, m4);
      addObstacle({ x, z, r: rad * sz2, cr: rad * sz2 * .8, top: gy + top * sz2 });
    }
    im.count = k; im.castShadow = im.receiveShadow = true; s.add(im);
  };
  if (F.cacti) solid(F.cacti, cactusGeo(0x4f7a3a), 1.1, 4.6);
  if (F.trees) solid(F.trees, treeGeo(M.seed + 3, F.treeKind), F.treeKind === 'dead' ? .6 : 1.2, 5.4);
  // shrubs: looks only
  if (F.shrubs && !HEADLESS) {
    const r = mulberry32(M.seed * 103 + 9), N = Math.round(F.shrubs * A * (hiQ() ? 1 : .6)), geos = [0, 1, 2].map(i => shrubGeo(M.seed + i * 11, F.shrubCols));
    for (const [gi, geo] of geos.entries()) {
      const im = new T.InstancedMesh(geo, mat(), Math.ceil(N / 3)); let k = 0;
      for (let tries = 0; k < im.count && tries < N * 12; tries++) {
        const x = (r() * 2 - 1) * (B + 10), z = (r() * 2 - 1) * (B + 10); if (!ok(x, z, 1.2, true)) continue;
        const s2 = .6 + r() * 1.1; m4.compose(v.set(x, bedH(x, z) - .15, z), q.setFromEuler(e.set(0, r() * 6.28, 0)), sc.set(s2, s2 * (.7 + r() * .5), s2)); im.setMatrixAt(k++, m4);
      }
      im.count = k; im.receiveShadow = true; im.castShadow = gi === 0; s.add(im);
    }
  }
}
