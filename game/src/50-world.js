// ================= ARENA WORLD =================
// Each map is a seeded heightfield sampled bilinearly, so physics, projectiles and the mesh agree.
let TERR = null;
function valueNoise(seed) {
  const r = mulberry32(seed), perm = new Uint8Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = r() * (i + 1) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (i, j) => vals[perm[(perm[i & 255] + j) & 255]];
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbm(n, x, z, oct) { let a = 1, f = 1, s = 0, norm = 0; for (let o = 0; o < oct; o++) { s += n(x * f, z * f) * a; norm += a; a *= .5; f *= 2.03; } return s / norm; }
function buildHeights(M) {
  const R = M.size > 1000 ? 320 : 256, S = M.size, cell = S / R, half = S / 2, H = new Float32Array((R + 1) * (R + 1));
  const n = valueNoise(M.seed), n2 = valueNoise(M.seed + 7), n3 = valueNoise(M.seed + 13);
  const play = half - 50, spawnZ = half - 110;
  const flats = [[0, -spawnZ, 60, 115], [0, spawnZ, 60, 115], ...capturePoints(half).map(p => [p.x, p.z, 20, 42])], craters = mapCraters(M);
  for (let j = 0; j <= R; j++) for (let i = 0; i <= R; i++) {
    const x = -half + i * cell, z = -half + j * cell;
    if (M.space) { H[j * (R + 1) + i] = -300; continue; } // open space: the 'ground' is far below everything
    let h = fbm(n, x / 150, z / 150, 5) * M.amp * 1.6;
    if (M.ridge) h += Math.pow(1 - Math.abs(n2(x / 95, z / 95)), 3) * 18 - 5;
    if (M.canyon) { const c = Math.abs(fbm(n2, x / 170, z / 170, 2)); h += 3 - (1 - smoothstep(0, .16, c)) * 13; }
    h += .7 * n3(x / 11, z / 11) * (M.city ? .3 : 1);
    if (craters) h += craterH(craters, x, z);
    if (M.city && cityStreet(x, z)) h -= .25;
    for (const [fx, fz, r0, r1] of flats) { const d = Math.hypot(x - fx, z - fz); if (d < r1) { const f = smoothstep(r0, r1, d); h = h * f + (1 - f) * 1.2; } }
    const e = Math.max(Math.abs(x), Math.abs(z));
    if (e > play) h += Math.min(95, Math.pow(e - play, 1.5) * .5);
    H[j * (R + 1) + i] = h;
  }
  return { R, S, cell, half, H, spawnZ };
}
function bedH(x, z) {
  const t = TERR; let fx = (x + t.half) / t.cell, fz = (z + t.half) / t.cell;
  fx = fx < 0 ? 0 : fx > t.R - .0001 ? t.R - .0001 : fx; fz = fz < 0 ? 0 : fz > t.R - .0001 ? t.R - .0001 : fz;
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, R1 = t.R + 1, H = t.H;
  const a = H[j * R1 + i], b = H[j * R1 + i + 1], c = H[(j + 1) * R1 + i], d = H[(j + 1) * R1 + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// surface height: lava and ice count as the surface for projectiles, camera and hovers
function terrainH(x, z) { const h = bedH(x, z), L = world.liquid; return L && h < L.y ? L.y : h; }
const capturePoints = half => [{ x: half * .46, z: -half * .08, name: 'A' }, { x: 0, z: 0, name: 'B' }, { x: -half * .46, z: half * .08, name: 'C' }];
const world = { scene: null, rocks: [], rockGrid: new Map(), bots: [], projs: [], debris: [], flashes: [], beams: [], map: null, mapId: null, liquid: null, bound: 255, spawnZ: 205, half: 300, time: 0, points: [] };
const GRID_C = 32, NO_ROCKS = [];
const gridKey = (cx, cz) => (cx + 200) * 1000 + (cz + 200);
function addObstacle(o) {
  o.cr2 = o.cr * o.cr; world.rocks.push(o);
  const pad = o.cr + 8;
  for (let cx = Math.floor((o.x - pad) / GRID_C); cx <= Math.floor((o.x + pad) / GRID_C); cx++)
    for (let cz = Math.floor((o.z - pad) / GRID_C); cz <= Math.floor((o.z + pad) / GRID_C); cz++) { const k = gridKey(cx, cz); let a = world.rockGrid.get(k); if (!a) world.rockGrid.set(k, a = []); a.push(o); }
}
const rocksAt = (x, z) => world.rockGrid.get(gridKey(Math.floor(x / GRID_C), Math.floor(z / GRID_C))) || NO_ROCKS;
function lavaTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = mulberry32(9);
  g.fillStyle = '#5a1204'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) { const x = r() * 256, y = r() * 256, rad = 10 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,190,80,.9)'); gr.addColorStop(.5, 'rgba(255,90,20,.5)'); gr.addColorStop(1, 'rgba(120,20,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  g.strokeStyle = 'rgba(30,8,4,.75)'; g.lineWidth = 3; for (let i = 0; i < 40; i++) { g.beginPath(); let x = r() * 256, y = r() * 256; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - .5) * 60; y += (r() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; return t;
}
function skyMaterial(M, sunDir) {
  return new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { hz: { value: new T.Color(M.sky[0]) }, zn: { value: new T.Color(M.sky[1]) }, sd: { value: sunDir }, sc: { value: new T.Color(M.sunCol) }, cl: { value: M.clouds }, time: { value: 0 }, st: { value: M.stars || 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 hz; uniform vec3 zn; uniform vec3 sd; uniform vec3 sc; uniform float cl; uniform float time; uniform float st; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.07; a *= 0.5; } return s; }
      void main(){
        float h = vP.y; vec3 c = mix(hz, zn, smoothstep(-0.02, 0.5, h));
        float s = max(dot(vP, sd), 0.0); c += sc * (pow(s, 900.0) * 14.0 + pow(s, 12.0) * 0.35);
        if (st > 0.0 && h > 0.0) { vec3 q = floor(vP * 420.0); float r = fract(sin(dot(q, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          float tw = 0.6 + 0.4 * sin(time * 2.0 + r * 60.0); c += vec3(0.9, 0.95, 1.0) * step(0.9975, r) * tw * st * smoothstep(0.0, 0.25, h) * 2.5; }
        if (h > 0.0) { vec2 uv = vP.xz / (h + 0.15) * 1.3 + vec2(time * 0.006, time * 0.003); float n = fbm(uv);
          float cov = smoothstep(1.0 - cl, 1.0 - cl + 0.32, n); vec3 cc = mix(hz * 1.08, vec3(1.0), 0.35) * (0.72 + 0.45 * s);
          c = mix(c, cc, cov * smoothstep(0.0, 0.22, h) * 0.88); }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// size: 'small' | 'medium' | 'large' scales the arena; obstacle and decoration counts follow the area
function setupArena(mapId, tod = 'day', size = 'medium') {
  const M = todMap(MAPS[mapId], tod), sk = (MAP_SIZES[size] || MAP_SIZES.medium).k, area = sk * sk;
  M.size = Math.round(M.size * sk / 4) * 4; M.area = area; M.mesas = Math.round(M.mesas * area); M.rocks = Math.round(M.rocks * area);
  M.fogNear *= Math.sqrt(sk); M.fogFar *= Math.sqrt(sk); world.mapSize = MAP_SIZES[size] ? size : 'medium'; world.grade = gradeFor(mapId, tod);
  if (world.scene) clearMirrors(world.scene);
  world.tod = tod; GRAV = M.grav != null ? M.grav : 22; world.space = !!M.space; world.spheres = null; world.buildings = null; world.pads = null; world.planet = null;
  if (world.scene) { world.scene.traverse(o => { if (o.userData.own) { o.geometry.dispose(); } }); if (world.scene.environment) world.scene.environment.dispose(); }
  for (const b of batches.values()) b.im.dispose(); batches.clear();
  world.map = M; world.mapId = mapId; world.rocks = []; world.rockGrid = new Map(); world.time = 0;
  TERR = buildHeights(M); world.half = TERR.half; world.bound = TERR.half - 55; world.spawnZ = TERR.spawnZ;
  world.liquid = M.liquid ? { ...M.liquid } : null;
  const s = new T.Scene(); world.scene = s;
  s.fog = new T.Fog(M.fog, M.fogNear, M.fogFar);
  const sunDir = new T.Vector3(...M.sun).normalize();
  const sky = new T.Mesh(new T.SphereGeometry(1000, 32, 16), skyMaterial(M, sunDir)); sky.renderOrder = -1; sky.userData.own = true; world.sky = sky; s.add(sky);
  { const es = new T.Scene(); const sk2 = new T.Mesh(sky.geometry, sky.material); es.add(sk2); s.environment = envFromScene(es); }
  s.add(new T.HemisphereLight(M.hemi[0], M.hemi[1], M.hemi[2]));
  const sun = new T.DirectionalLight(M.sunCol, M.sunI); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 1, far: 480 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .03;
  world.sun = sun; world.sunDir = sunDir; s.add(sun); s.add(sun.target);
  // terrain mesh
  const R = TERR.R, S = TERR.S;
  const tg = new T.PlaneGeometry(S, S, R, R); tg.rotateX(-HALF_PI);
  const pos = tg.attributes.position, cols = new Float32Array(pos.count * 3);
  const cLow = new T.Color(M.ground[0]), cHigh = new T.Color(M.ground[1]), cRock = new T.Color(M.ground[2]), cPad = new T.Color(M.pad), cHot = new T.Color(0x7a2a12), cAsph = new T.Color(0x2e2f31), tmp = new T.Color();
  const tint = valueNoise(M.seed + 99), rr = mulberry32(5);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = bedH(x, z); pos.setY(i, h);
    const sl = Math.abs(bedH(x + 2, z) - bedH(x - 2, z)) + Math.abs(bedH(x, z + 2) - bedH(x, z - 2));
    tmp.copy(cLow).lerp(cHigh, smoothstep(-6, 10, h + tint(x / 40, z / 40) * 6));
    tmp.lerp(cRock, smoothstep(1.2, 3.2, sl) * (M.ridge ? 1 : .85));
    if (M.ridge) tmp.lerp(cHigh, smoothstep(5, 14, h) * .6);
    if (M.city && cityStreet(x, z)) tmp.lerp(cAsph, .85);
    if (M.moon) tmp.lerp(cRock, smoothstep(-6, -16, h) * .5);
    if (world.liquid && world.liquid.type === 'lava') tmp.lerp(cHot, (1 - smoothstep(world.liquid.y, world.liquid.y + 2.5, h)) * .8);
    for (const sz of [-world.spawnZ, world.spawnZ]) { const d = Math.hypot(x, z - sz); if (d < 52) tmp.lerp(cPad, .5 * (1 - smoothstep(44, 52, d))); }
    const k = .9 + rr() * .14; cols[i * 3] = tmp.r * k; cols[i * 3 + 1] = tmp.g * k; cols[i * 3 + 2] = tmp.b * k;
  }
  tg.setAttribute('color', new T.BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const ntex = noiseTexture(); ntex.repeat.set(S / 8, S / 8);
  const tmat = new T.MeshStandardMaterial({ vertexColors: true, map: ntex, bumpMap: ntex, bumpScale: M.moon ? 2.2 : 1.1, roughness: .96, metalness: 0, envMapIntensity: .45 });
  // break up texture tiling: a second, much larger sample of the same noise varies the ground
  tmat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_MAP\n diffuseColor.rgb *= mix(0.82, 1.16, texture2D(map, vMapUv * 0.071).r) * mix(0.9, 1.08, texture2D(map, vMapUv * 0.013 + 0.37).g);\n#endif'); };
  const terrain = new T.Mesh(tg, tmat);
  terrain.receiveShadow = true; terrain.userData.own = true; if (!M.space) s.add(terrain);
  // liquids
  world.lavaTex = null;
  if (world.liquid) {
    const lg = new T.PlaneGeometry(S, S).rotateX(-HALF_PI);
    let lm;
    if (world.liquid.type === 'lava') { const lt = lavaTexture(); lt.repeat.set(S / 40, S / 40); world.lavaTex = lt; lm = new T.MeshStandardMaterial({ color: 0x1a0602, emissive: 0xffffff, emissiveMap: lt, emissiveIntensity: 2.4, roughness: .9 }); }
    else lm = new T.MeshStandardMaterial({ color: world.liquid.color, roughness: .08, metalness: .1, transparent: true, opacity: .9, envMapIntensity: 1.3 });
    const lq = new T.Mesh(lg, lm); lq.position.y = world.liquid.y; lq.receiveShadow = true; lq.userData.own = true; s.add(lq);
    world.liquidMesh = lq;
    makeMirror(lq, world.liquid.type === 'lava' ? { strength: .22, rough: 1, size: 384, every: 3 } : { strength: .75, rough: .3, size: 512, every: 2 });
  }
  // obstacles
  const rnd = mulberry32(M.seed * 7 + 1), B = world.bound;
  const clearOf = (x, z, pad) => !(Math.abs(z) > world.spawnZ - 160 - pad && Math.abs(x) < 105 + pad) && capturePoints(world.half).every(p => Math.hypot(p.x - x, p.z - z) > 30 + pad);
  const wet = (x, z) => world.liquid && bedH(x, z) < world.liquid.y + .8;
  const free = (x, z, r) => world.rocks.every(o => Math.hypot(o.x - x, o.z - z) > o.cr + r + 4);
  const rockBump = natureBump(), rockMat = M.rockCol.map(c => rockMaterial(c, rockBump)), MESAS = [0, 1, 2, 3].map(i => mesaGeo(M.seed * 17 + i)), BOULDERS = [0, 1, 2, 3, 4].map(i => rockGeo(M.seed * 23 + i));
  const groundMin = (x, z, r) => Math.min(bedH(x - r * .6, z), bedH(x + r * .6, z), bedH(x, z - r * .6), bedH(x, z + r * .6), bedH(x, z));
  for (let i = 0, tries = 0; i < M.mesas && tries < 400 * M.area; tries++) {
    const x = (rnd() * 2 - 1) * (B - 40), z = (rnd() * 2 - 1) * (B - 40), r = 9 + rnd() * 13, h = 9 + rnd() * 16;
    if (!clearOf(x, z, r) || wet(x, z) || !free(x, z, r)) continue; i++;
    const gy = groundMin(x, z, r);
    if (mapId === 'ash') { // basalt column clusters
      const cnt = 5 + (rnd() * 5 | 0);
      for (let k = 0; k < cnt; k++) { const a = rnd() * 6.28, d = rnd() * r * .6, cr = r * (.25 + rnd() * .2), ch = h * (.6 + rnd() * .6); const m = new T.Mesh(new T.CylinderGeometry(cr, cr * 1.04, ch, 6), rockMat[k % 2]); m.position.set(x + Math.cos(a) * d, gy + ch / 2 - 1, z + Math.sin(a) * d); m.castShadow = m.receiveShadow = true; m.userData.own = true; s.add(m); }
      addObstacle({ x, z, r, cr: r * .85, top: gy + h * 1.1 });
    } else {
      const m = new T.Mesh(MESAS[i % MESAS.length], rockMat[i % 2]); m.scale.set(r, h, r * (.85 + (i % 3) * .1));
      m.position.set(x, gy + h / 2 - 1, z); m.rotation.y = rnd() * 6.28; m.castShadow = m.receiveShadow = true; m.userData.own = true; s.add(m);
      if (mapId === 'frost') { const cap = new T.Mesh(new T.CylinderGeometry(r * .8, r * .82, 1.2, 9), new T.MeshStandardMaterial({ color: 0xf4f8fb, roughness: .8 })); cap.position.set(x, gy + h - .6, z); cap.userData.own = true; s.add(cap); }
      addObstacle({ x, z, r, cr: r * .92, top: gy + h - 1 });
    }
  }
  for (let i = 0, tries = 0; i < M.rocks && tries < 1500 * M.area; tries++) {
    const x = (rnd() * 2 - 1) * B, z = (rnd() * 2 - 1) * B, r = 2.5 + rnd() * 5, h = 2 + rnd() * 4.5;
    if (!clearOf(x, z, 0) || wet(x, z) || !free(x, z, r)) continue; i++;
    const gy = groundMin(x, z, r);
    const m = new T.Mesh(BOULDERS[i % BOULDERS.length], rockMat[i % 2]); m.scale.set(r, h, r * (.8 + rnd() * .4)); m.position.set(x, gy + h * .25, z); m.rotation.y = rnd() * 6.28; m.castShadow = m.receiveShadow = true; s.add(m);
    addObstacle({ x, z, r, cr: r * .85, top: gy + h * 1.2 });
  }
  // wrecked hulks: old bots half-buried in the ground
  const rust = new T.MeshStandardMaterial({ color: mapId === 'frost' ? 0x5a6066 : 0x6b4a36, roughness: .75, metalness: .5 });
  for (let i = 0, tries = 0; i < (M.moon || M.space ? 0 : Math.round(12 * M.area)) && tries < 300 * M.area; tries++) {
    const x = (rnd() * 2 - 1) * (B - 30), z = (rnd() * 2 - 1) * (B - 60);
    if (!clearOf(x, z, 10) || wet(x, z) || !free(x, z, 7)) continue; i++;
    const g = new T.Group(), gy = bedH(x, z);
    const hull = new T.Mesh(new T.BoxGeometry(6, 3, 10), rust); hull.position.y = .8; g.add(hull);
    const top = new T.Mesh(new T.BoxGeometry(4, 2, 5), rust); top.position.set(.5, 2.8, -1); g.add(top);
    const gun = new T.Mesh(new T.CylinderGeometry(.3, .35, 5, 8).rotateX(HALF_PI), M_DARK()); gun.position.set(.5, 3, 2.5); gun.rotation.y = rnd() - .5; g.add(gun);
    for (const sx of [-3.4, 3.4]) for (const sz2 of [-3, 3]) { const w = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, .8, 14).rotateZ(HALF_PI), M_RUB()); w.position.set(sx, 0, sz2); g.add(w); }
    g.position.set(x, gy - .6, z); g.rotation.set((rnd() - .5) * .3, rnd() * 6.28, (rnd() - .5) * .4);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); s.add(g);
    addObstacle({ x, z, r: 5.5, cr: 5.2, top: gy + 4 });
  }
  if (M.city) buildCity(s, M, rnd);
  if (M.moon) buildMoon(s, M, rnd);
  // trees on Frostline
  if (mapId === 'frost') {
    const N = Math.round(480 * M.area), trunk = new T.InstancedMesh(new T.CylinderGeometry(.25, .35, 3, 6), new T.MeshStandardMaterial({ color: 0x4a3626, roughness: .9 }), N);
    const lo = new T.InstancedMesh(new T.ConeGeometry(2.4, 5, 7), new T.MeshStandardMaterial({ color: 0x2d4a3a, roughness: .85 }), N);
    const hi = new T.InstancedMesh(new T.ConeGeometry(1.6, 3.6, 7), new T.MeshStandardMaterial({ color: 0xdfe9ee, roughness: .8 }), N);
    let n = 0; const m4 = new T.Matrix4(), q = new T.Quaternion(), sv = new T.Vector3();
    const tn = valueNoise(M.seed + 5);
    for (let tries = 0; n < N && tries < 6000 * M.area; tries++) {
      const x = (rnd() * 2 - 1) * B, z = (rnd() * 2 - 1) * B;
      if (tn(x / 60, z / 60) < .1 || !clearOf(x, z, 0) || wet(x, z) || bedH(x, z) > 18) continue;
      if (rocksAt(x, z).some(o => Math.hypot(o.x - x, o.z - z) < o.cr + 2.5)) continue;
      const gy = bedH(x, z), sc = .8 + rnd() * .7;
      q.setFromAxisAngle(sv.set(0, 1, 0), rnd() * 6.28);
      m4.compose(sv.set(x, gy + 1.3 * sc, z), q, new T.Vector3(sc, sc, sc)); trunk.setMatrixAt(n, m4);
      m4.compose(sv.set(x, gy + 4.4 * sc, z), q, new T.Vector3(sc, sc, sc)); lo.setMatrixAt(n, m4);
      m4.compose(sv.set(x, gy + 7.2 * sc, z), q, new T.Vector3(sc, sc, sc)); hi.setMatrixAt(n, m4);
      addObstacle({ x, z, r: 1, cr: .9 * sc, top: gy + 9 * sc }); n++;
    }
    for (const im of [trunk, lo, hi]) { im.count = n; im.castShadow = true; im.receiveShadow = true; s.add(im); }
  }
  // foliage: trees and cacti (solid), shrubs (looks only)
  buildFoliage(s, M, B, (x, z, r, loose) => clearOf(x, z, loose ? 0 : r) && !wet(x, z) && (loose || free(x, z, r)) && !(M.city && (cityStreet(x, z) || (world.buildings || []).some(b => Math.abs(b.x - x) < b.w / 2 + r && Math.abs(b.z - z) < b.d / 2 + r))));
  if (M.space) buildSpace(s, M, rnd);
  // ground scatter (no collision)
  if (!M.space) {
    const N = Math.round(2200 * M.area), kind = M.decor;
    const pebbles = new T.InstancedMesh(rockGeo(M.seed + 77, { detail: 1 }).scale(.5, .5, .5), rockMaterial(M.rockCol[0], null), N);
    const extraGeo = kind === 'desert' ? new T.DodecahedronGeometry(.7, 0) : kind === 'pines' ? new T.SphereGeometry(1, 8, 5) : new T.TetrahedronGeometry(.6, 0);
    const extraMat = kind === 'desert' ? new T.MeshStandardMaterial({ color: 0x6b6a3a, roughness: .9, flatShading: true }) : kind === 'pines' ? new T.MeshStandardMaterial({ color: 0xf2f6f9, roughness: .85 }) : kind === 'rubble' ? new T.MeshStandardMaterial({ color: 0x8a857c, roughness: .9, flatShading: true }) : kind === 'moon' ? new T.MeshStandardMaterial({ color: 0x5c5c60, roughness: .95, flatShading: true }) : new T.MeshStandardMaterial({ color: 0x2a0c04, emissive: 0xff6a1a, emissiveIntensity: 2.4 });
    const extra = new T.InstancedMesh(extraGeo, extraMat, 500);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sv = new T.Vector3(), sc = new T.Vector3();
    let a = 0, b = 0;
    for (let i = 0; i < N + 500; i++) {
      const x = (rnd() * 2 - 1) * (B + 20), z = (rnd() * 2 - 1) * (B + 20); if (wet(x, z)) continue;
      const gy = bedH(x, z); q.setFromEuler(e.set(rnd() * 3, rnd() * 6, rnd() * 3));
      if (i < N) { const k = .3 + rnd() * 1.3; m4.compose(sv.set(x, gy + k * .15, z), q, sc.set(k, k * .7, k)); pebbles.setMatrixAt(a++, m4); }
      else { const k = kind === 'pines' ? 1 + rnd() * 2 : .6 + rnd() * 1.2; m4.compose(sv.set(x, gy + (kind === 'pines' ? -k * .55 : k * .3), z), kind === 'pines' ? q.identity() : q, sc.set(k, kind === 'pines' ? k * .5 : k, k)); extra.setMatrixAt(b++, m4); }
    }
    pebbles.count = a; extra.count = b; pebbles.receiveShadow = extra.receiveShadow = true; s.add(pebbles, extra);
  }
  // spawn bases
  for (const [team, sz] of M.space ? [] : [[0, -world.spawnZ], [1, world.spawnZ]]) {
    const col = team === 0 ? 0x4fb0ff : 0xff5444;
    const pad = new T.Mesh(new T.CylinderGeometry(46, 48, .6, 6), new T.MeshStandardMaterial({ color: 0x4d555b, roughness: .55, metalness: .5 }));
    pad.position.set(0, 1.0, sz); pad.receiveShadow = true; s.add(pad);
    const ring = new T.Mesh(new T.TorusGeometry(45, .3, 6, 6), new T.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 2 }));
    ring.rotation.x = HALF_PI; ring.rotation.z = Math.PI / 6; ring.position.set(0, 1.35, sz); s.add(ring);
    const bz = sz + (team === 0 ? -50 : 50);
    for (const bx of [-20, 20]) {
      const tower = new T.Mesh(new T.BoxGeometry(5, 26, 5), new T.MeshStandardMaterial({ color: 0x3a4248, roughness: .5, metalness: .6 }));
      tower.position.set(bx, bedH(bx, bz) + 13, bz); tower.castShadow = true; s.add(tower);
      const lamp = new T.Mesh(new T.BoxGeometry(5.4, 2, 5.4), new T.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 3 }));
      lamp.position.set(bx, bedH(bx, bz) + 25, bz); s.add(lamp);
      addObstacle({ x: bx, z: bz, r: 3.5, cr: 3.6, top: bedH(bx, bz) + 26 });
    }
  }
  // capture beacons (shown in Battle Arena)
  world.points = capturePoints(world.half).map(p => {
    const g = new T.Group(); const gy = bedH(p.x, p.z); g.position.set(p.x, gy, p.z);
    const base = new T.Mesh(new T.CylinderGeometry(4, 5, 1.2, 8), new T.MeshStandardMaterial({ color: 0x3a4248, roughness: .5, metalness: .6 })); base.position.y = .4; g.add(base);
    const mat = new T.MeshStandardMaterial({ color: 0x111111, emissive: 0xdddddd, emissiveIntensity: 2.2 });
    const pillar = new T.Mesh(new T.CylinderGeometry(.6, .6, 14, 8), mat); pillar.position.y = 8; g.add(pillar);
    const ringM = new T.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false });
    const ring = new T.Mesh(new T.RingGeometry(17.4, 18, 48).rotateX(-HALF_PI), ringM); ring.position.y = .4; g.add(ring);
    const fill = new T.Mesh(new T.CircleGeometry(18, 48, 0, 0).rotateX(-HALF_PI), new T.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: .14, side: T.DoubleSide, depthWrite: false })); fill.position.y = .35; g.add(fill);
    g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    s.add(g);
    return { ...p, y: gy, owner: -1, prog: 0, capTeam: -1, group: g, mat, ringM, fill, r: 18 };
  });
  addObstacle({ x: world.points[0].x, z: world.points[0].z, r: 4, cr: 4.2, top: world.points[0].y + 1 }); // bases are low walls
  for (const p of world.points.slice(1)) addObstacle({ x: p.x, z: p.z, r: 4, cr: 4.2, top: p.y + 1 });
  if (M.space) world.reactors = null; else buildReactors(s);
  // particles
  const PMAX = 4000;
  const pm = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ toneMapped: false }), PMAX);
  pm.instanceMatrix.setUsage(T.DynamicDrawUsage); pm.frustumCulled = false; pm.count = 0;
  pm.setColorAt(0, new T.Color(1, 1, 1));
  s.add(pm);
  world.pm = pm; world.P = { n: 0, max: PMAX, d: new Float32Array(PMAX * 10), col: [] };
  for (let i = 0; i < PMAX; i++) world.P.col.push(new T.Color());
  // shared projectile assets
  world.boltGeo = new T.BoxGeometry(.2, .2, 1.8);
  world.roundGeo = new T.BoxGeometry(.12, .12, 1.2);
  world.boltMatA = new T.MeshBasicMaterial({ color: new T.Color(0x9ff3ff).multiplyScalar(2.2) });
  world.boltMatE = new T.MeshBasicMaterial({ color: new T.Color(0xffb35a).multiplyScalar(2.2) });
  world.shellGeo = new T.SphereGeometry(.38, 10, 8);
  world.shellMat = new T.MeshBasicMaterial({ color: new T.Color(0xffa040).multiplyScalar(2.5) });
  world.flakMat = new T.MeshBasicMaterial({ color: new T.Color(0xfff0a0).multiplyScalar(2.5) });
  world.plasmaGeo = new T.SphereGeometry(.5, 12, 10);
  world.plasmaMatA = new T.MeshBasicMaterial({ color: new T.Color(0xc9a2ff).multiplyScalar(2.6) });
  world.plasmaMatE = new T.MeshBasicMaterial({ color: new T.Color(0xff7ad9).multiplyScalar(2.6) });
  world.missileGeo = new T.CylinderGeometry(.13, .16, 1.1, 8).rotateX(HALF_PI);
  world.missileMat = new T.MeshStandardMaterial({ color: 0xd8dde0, roughness: .4, metalness: .6, emissive: 0xff3050, emissiveIntensity: .3 });
  world.flashGeo = new T.SphereGeometry(1, 16, 12);
  world.beamGeo = new T.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(HALF_PI);
  world.shieldGeo = new T.IcosahedronGeometry(1, 2);
  buildMinimapImage();
  fxSetup();
}
const M_DARK = () => M.dark, M_RUB = () => M.rubber;
function buildMinimapImage() {
  const N = 240, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N), M = world.map;
  if (M.space) { g.fillStyle = '#07060e'; g.fillRect(0, 0, N, N); const r = mulberry32(5); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${.2 + r() * .6})`; g.fillRect(r() * N, r() * N, 1, 1); } world.mapImg = c; return; }
  const lo = new T.Color(M.ground[0]), hi = new T.Color(M.ground[1]), tmp = new T.Color();
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const x = (.5 - px / N) * world.half * 2, z = (.5 - py / N) * world.half * 2, h = bedH(x, z);
    if (world.liquid && h < world.liquid.y) tmp.setHex(world.liquid.type === 'lava' ? 0xd2461a : 0x9ccbe2);
    else { tmp.copy(lo).lerp(hi, smoothstep(-8, 14, h)); const sh = clamp((bedH(x - 3, z) - bedH(x + 3, z)) * .08, -.25, .25); tmp.offsetHSL(0, 0, sh); }
    tmp.convertLinearToSRGB(); const o = (py * N + px) * 4; img.data[o] = tmp.r * 255; img.data[o + 1] = tmp.g * 255; img.data[o + 2] = tmp.b * 255; img.data[o + 3] = 200;
  }
  g.putImageData(img, 0, 0); world.mapImg = c;
}

function noiseTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = mulberry32(42);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { const v = 170 + r() * 85 | 0; g.fillStyle = `rgba(${v},${v},${v},.6)`; const s = 1 + r() * 3; g.fillRect(r() * 256, r() * 256, s, s); }
  g.strokeStyle = 'rgba(120,120,120,.25)'; g.lineWidth = 1;
  for (let i = 0; i < 26; i++) { g.beginPath(); let x = r() * 256, y = r() * 256; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - .5) * 40; y += (r() - .5) * 40; g.lineTo(x, y); } g.stroke(); }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(70, 70); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
}
function jitterGeo(geo, amt, seed) {
  const p = geo.attributes.position; const v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453; const n = h - Math.floor(h);
    const h2 = Math.sin(v.x * 39.3468 + v.y * 11.135 + v.z * 83.155 + seed) * 24634.6345; const n2 = h2 - Math.floor(h2);
    v.multiplyScalar(1 + (n - .5) * amt); v.y += (n2 - .5) * amt * .5; p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); return geo;
}

// ---------- particles ----------
function emit(x, y, z, vx, vy, vz, life, size, color, grav = 18, hdr = 1) {
  const P = world.P; if (P.n >= P.max) return; const i = P.n++, o = i * 10, d = P.d;
  d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = life; d[o + 7] = life; d[o + 8] = size; d[o + 9] = grav;
  P.col[i].setHex(color); if (hdr !== 1) P.col[i].multiplyScalar(hdr);
}
const _m4 = new T.Matrix4(), _q = new T.Quaternion(), _s = new T.Vector3(), _p = new T.Vector3(), _e = new T.Euler();
function updateParticles(dt) {
  const P = world.P, d = P.d;
  for (let i = 0; i < P.n; i++) {
    const o = i * 10; d[o + 6] -= dt;
    if (d[o + 6] <= 0) { // swap-remove
      const last = --P.n; if (i !== last) { const lo = last * 10; for (let k = 0; k < 10; k++) d[o + k] = d[lo + k]; P.col[i].copy(P.col[last]); } i--; continue;
    }
    d[o + 4] -= d[o + 9] * dt; d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
    const gy = terrainH(d[o], d[o + 2]); if (d[o + 1] < gy) { d[o + 1] = gy; d[o + 4] *= -.3; d[o + 3] *= .5; d[o + 5] *= .5; }
  }
  const pm = world.pm;
  for (let i = 0; i < P.n; i++) {
    const o = i * 10; const k = d[o + 6] / d[o + 7]; const sz = d[o + 8] * (.3 + .7 * k);
    _e.set(d[o] * 3.1, d[o + 2] * 2.3, 0); _q.setFromEuler(_e);
    _m4.compose(_p.set(d[o], d[o + 1], d[o + 2]), _q, _s.set(sz, sz, sz)); pm.setMatrixAt(i, _m4); pm.setColorAt(i, P.col[i]);
  }
  pm.count = P.n; pm.instanceMatrix.needsUpdate = true; if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
}
function sparks(pos, color, n, speed = 9, size = .18, life = .45) {
  for (let i = 0; i < n; i++) emit(pos.x, pos.y, pos.z, rand(-1, 1) * speed, rand(-.3, 1.2) * speed, rand(-1, 1) * speed, rand(.5, 1) * life, size * rand(.6, 1.3), color, 18, 2.4);
}
function flash(pos, size, color, life = .35) {
  const m = new T.Mesh(world.flashGeo, new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(2.6), transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.position.copy(pos); m.scale.setScalar(size * .3); world.scene.add(m); world.flashes.push({ m, life, max: life, size });
}
function explosion(pos, big) {
  flash(pos, big ? 7 : 3, 0xffa040, big ? .55 : .3);
  if (!HEADLESS) {
    shockwave(pos, big ? 16 : 7, 0xffb060); addScorch(pos, big ? 4 : 2.2);
    const d = camera.position.distanceTo(pos); cam.shake = Math.max(cam.shake, (big ? .7 : .3) / (1 + d / 22));
    for (let i = 0; i < (big ? 8 : 3); i++) emit(pos.x, pos.y, pos.z, rand(-1.5, 1.5), rand(2, 5), rand(-1.5, 1.5), rand(2.5, 4), rand(1.8, 3), 0x2e2a28, -.35);
  }
  sparks(pos, 0xffc060, big ? 40 : 14, big ? 16 : 10, big ? .3 : .2, big ? .9 : .5);
  for (let i = 0; i < (big ? 16 : 5); i++) emit(pos.x + rand(-1, 1), pos.y + rand(0, 1), pos.z + rand(-1, 1), rand(-2, 2), rand(1, 4), rand(-2, 2), rand(1, 1.8), big ? rand(.8, 1.6) : rand(.4, .8), 0x3b3430, -1.5);
  SFX.boom(pos, big);
}
function updateFlashes(dt) {
  for (let i = world.flashes.length - 1; i >= 0; i--) {
    const f = world.flashes[i]; f.life -= dt; const k = f.life / f.max;
    if (k <= 0) { world.scene.remove(f.m); f.m.material.dispose(); world.flashes.splice(i, 1); continue; }
    f.m.scale.setScalar(f.size * (1 - k * .7)); f.m.material.opacity = k;
  }
  for (let i = world.beams.length - 1; i >= 0; i--) {
    const b = world.beams[i]; b.life -= dt; const k = b.life / b.max;
    if (k <= 0) { world.scene.remove(b.m); b.m.material.dispose(); world.beams.splice(i, 1); continue; }
    b.m.material.opacity = k; b.m.scale.x = b.m.scale.y = b.w * (0.4 + k);
  }
}
function beam(a, b, color, w = .14, life = .35) {
  const m = new T.Mesh(world.beamGeo, new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(3), transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const len = a.distanceTo(b); m.position.copy(a).add(b).multiplyScalar(.5); m.lookAt(b); m.scale.set(w, w, len);
  world.scene.add(m); world.beams.push({ m, life, max: life, w });
}

// ---------- instanced batches: every bot block, debris piece and shell shares a few draw calls ----------
const batches = new Map();
function growBatch(key, m, old) {
  const cap = old ? old.cap * 2 : 64;
  const im = new T.InstancedMesh(m.geometry, m.material, cap);
  im.frustumCulled = false; im.instanceMatrix.setUsage(T.DynamicDrawUsage);
  im.castShadow = !m.material.transparent; im.receiveShadow = true; im.count = 0;
  if (old) { im.instanceMatrix.array.set(old.im.instanceMatrix.array); world.scene.remove(old.im); old.im.dispose(); }
  world.scene.add(im);
  const b = { im, n: old ? old.n : 0, cap }; batches.set(key, b); return b;
}
function batchAdd(m) {
  const key = m.geometry.id + ':' + m.material.id;
  let b = batches.get(key);
  if (!b || b.n >= b.cap) b = growBatch(key, m, b);
  b.im.setMatrixAt(b.n++, m.matrixWorld);
}
let LOD_D2 = 170 * 170;
function renderBatches() {
  for (const b of batches.values()) b.n = 0;
  for (const bot of world.bots) {
    if (bot.dead || !bot.meshes) continue;
    if (!visibleToViewer(bot)) { if (bot.tag) bot.tag.sprite.visible = false; continue; }
    bot.group.updateMatrixWorld(true);
    // far away, only the main shape of each block is drawn
    const far = !bot.isPlayer && camera.position.distanceToSquared(bot.pos) > LOD_D2;
    for (const e of bot.meshes) if (e.cell.alive && !e.m.userData.off && (!far || e.first)) batchAdd(e.m);
  }
  for (const d of world.debris) { d.obj.updateMatrixWorld(true); for (const m of d.meshes) batchAdd(m); }
  for (const p of world.projs) { p.mesh.visible = false; p.mesh.updateMatrixWorld(); batchAdd(p.mesh); }
  for (const b of batches.values()) { b.im.count = b.n; b.im.instanceMatrix.needsUpdate = true; }
}

// ---------- debris ----------
function addDebris(obj, vel, spin, life) {
  const meshes = []; obj.traverse(o => { if (o.isMesh && !o.userData.off) meshes.push(o); });
  world.debris.push({ obj, vel, spin, life, max: life, meshes });
  if (world.debris.length > 700) { const d = world.debris.shift(); world.scene.remove(d.obj); }
}
function updateDebris(dt) {
  for (let i = world.debris.length - 1; i >= 0; i--) {
    const d = world.debris[i]; d.life -= dt;
    if (d.life <= 0) { world.scene.remove(d.obj); world.debris.splice(i, 1); continue; }
    d.vel.y -= GRAV * dt; d.obj.position.addScaledVector(d.vel, dt);
    d.obj.rotation.x += d.spin.x * dt; d.obj.rotation.y += d.spin.y * dt; d.obj.rotation.z += d.spin.z * dt;
    const gy = terrainH(d.obj.position.x, d.obj.position.z) + .35;
    if (d.obj.position.y < gy) { d.obj.position.y = gy; d.vel.y = Math.abs(d.vel.y) * .25; d.vel.x *= .55; d.vel.z *= .55; d.spin.multiplyScalar(.5); }
    if (d.life < .6) d.obj.scale.multiplyScalar(Math.max(.01, 1 - dt * 5));
  }
}

