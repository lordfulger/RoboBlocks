// ================= WEATHER, SCORCH MARKS, SHOCKWAVES, DAMAGE SMOKE, HOVER GLOW, GRASS =================
const FX = { wx: null, scorch: null, scorchN: 0, scorchList: [], rings: [], glow: null, grass: [], smokeT: 0 };
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new T.CanvasTexture(c);
}
// ---------- weather around the camera ----------
function startWeather() {
  if (HEADLESS || !world.scene) return;
  if (FX.wx) { world.scene.remove(FX.wx.obj); FX.wx.obj.geometry.dispose(); FX.wx = null; }
  const kind = MAP_WX[world.mapId] || 'none', k = world.wxK || 0, M = world.map;
  // weather thickens the air
  world.scene.fog.near = M.fogNear * (1 - .5 * k * (kind === 'sand' ? 1 : kind === 'none' ? 0 : .55)); world.scene.fog.far = M.fogFar * (1 - .45 * k * (kind === 'sand' ? 1 : kind === 'none' ? 0 : .5));
  if (kind === 'none' || k <= 0) return;
  const N = Math.round((ultraQ() ? 5200 : hiQ() ? 3600 : 1600) * k), box = { x: 110, y: 55, z: 110 };
  const pos = new Float32Array(N * (kind === 'rain' ? 6 : 3)), vel = new Float32Array(N * 3), col = new Float32Array(N * (kind === 'rain' ? 6 : 3));
  const c1 = new T.Color(kind === 'sand' ? 0xd9b98c : kind === 'snow' ? 0xffffff : kind === 'ash' ? 0x5a5250 : 0xb8c6d4), c2 = new T.Color(kind === 'ash' ? 0xff7a2a : kind === 'sand' ? 0xbf9b72 : c1.getHex());
  for (let i = 0; i < N; i++) {
    const x = rand(-box.x, box.x), y = rand(-box.y, box.y), z = rand(-box.z, box.z);
    vel[i * 3] = kind === 'sand' ? rand(14, 26) : rand(-1, 1); vel[i * 3 + 1] = kind === 'rain' ? rand(-38, -30) : kind === 'snow' ? rand(-3, -1.5) : kind === 'ash' ? rand(-2.2, -.6) : rand(-1, 1.5); vel[i * 3 + 2] = kind === 'sand' ? rand(-4, 4) : rand(-1, 1);
    const c = kind === 'ash' && Math.random() < .08 ? c2 : kind === 'sand' && Math.random() < .5 ? c2 : c1;
    if (kind === 'rain') { pos.set([x, y, z, x, y - 1.1, z], i * 6); col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6); }
    else { pos.set([x, y, z], i * 3); col.set([c.r, c.g, c.b], i * 3); }
  }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
  let obj;
  if (kind === 'rain') obj = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .35, depthWrite: false }));
  else obj = new T.Points(geo, new T.PointsMaterial({ size: kind === 'sand' ? .35 : kind === 'snow' ? .32 : .26, map: softDot(), vertexColors: true, transparent: true, opacity: kind === 'sand' ? .55 : .9, depthWrite: false, sizeAttenuation: true }));
  obj.frustumCulled = false; obj.renderOrder = 2; world.scene.add(obj);
  FX.wx = { obj, pos, vel, N, kind, box, base: camera.position.clone() };
}
function updateWeather(dt) {
  const W = FX.wx; if (!W) return;
  const cp = camera.position, { pos, vel, N, box, kind } = W, rain = kind === 'rain', stride = rain ? 6 : 3;
  const sway = Math.sin(world.time * .7) * (kind === 'snow' ? 1.2 : .5);
  for (let i = 0; i < N; i++) {
    const o = i * stride;
    let x = pos[o] + (vel[i * 3] + sway) * dt, y = pos[o + 1] + vel[i * 3 + 1] * dt, z = pos[o + 2] + vel[i * 3 + 2] * dt;
    // keep every particle inside a box that travels with the camera
    if (x - cp.x > box.x) x -= box.x * 2; else if (x - cp.x < -box.x) x += box.x * 2;
    if (z - cp.z > box.z) z -= box.z * 2; else if (z - cp.z < -box.z) z += box.z * 2;
    if (y - cp.y < -box.y || y < terrainH(x, z) - .5) y = cp.y + box.y * rand(.5, 1); else if (y - cp.y > box.y) y = cp.y - box.y + 1;
    pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
    if (rain) { pos[o + 3] = x - vel[i * 3] * .03; pos[o + 4] = y - 1.1; pos[o + 5] = z - vel[i * 3 + 2] * .03; }
  }
  W.obj.geometry.attributes.position.needsUpdate = true;
  // rain on Rustgate at night: the odd lightning flash
  if (rain && world.tod === 'night' && Math.random() < dt * .05) { flash(cp.clone().add(new T.Vector3(rand(-200, 200), 120, rand(-200, 200))), 60, 0xbfd8ff, .25); if (SFX.boom) SFX.boom(cp.clone().add(new T.Vector3(rand(-300, 300), 0, rand(-300, 300))), true); }
}
// ---------- scorch marks ----------
function scorchSetup() {
  if (HEADLESS) return;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = mulberry32(4);
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(.55, 'rgba(10,8,6,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(32 + (r() - .5) * 60, 32 + (r() - .5) * 60, 2 + r() * 6, 0, 7); g.fill(); }
  const tex = new T.CanvasTexture(c);
  const im = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-HALF_PI), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: 0x000000 }), 160);
  im.count = 0; im.frustumCulled = false; im.renderOrder = 1; world.scene.add(im);
  FX.scorch = im; FX.scorchList = [];
}
const _fxM = new T.Matrix4(), _fxQ = new T.Quaternion(), _fxV = new T.Vector3(), _fxS = new T.Vector3(), _fxY = new T.Vector3(0, 1, 0);
function addScorch(pos, size) {
  if (!FX.scorch) return;
  const gy = terrainH(pos.x, pos.z); if (pos.y - gy > size * .8 + 1.5 || (world.liquid && bedH(pos.x, pos.z) < world.liquid.y)) return;
  FX.scorchList.push({ x: pos.x, y: gy + .06, z: pos.z, s: size * rand(1.6, 2.3), a: rand(0, 6.28), t: 40 });
  if (FX.scorchList.length > 160) FX.scorchList.shift();
}
function updateScorch(dt) {
  const im = FX.scorch; if (!im) return; let n = 0;
  for (let i = FX.scorchList.length - 1; i >= 0; i--) { const s = FX.scorchList[i]; s.t -= dt; if (s.t <= 0) FX.scorchList.splice(i, 1); }
  for (const s of FX.scorchList) { const k = s.s * Math.min(1, s.t / 6); _fxQ.setFromAxisAngle(_fxY, s.a); _fxM.compose(_fxV.set(s.x, s.y, s.z), _fxQ, _fxS.set(k, 1, k)); im.setMatrixAt(n++, _fxM); }
  im.count = n; im.instanceMatrix.needsUpdate = true;
}
// ---------- shockwave rings ----------
function shockwave(pos, R, color) {
  if (HEADLESS || !world.scene) return;
  const m = new T.Mesh(FX.ringGeo || (FX.ringGeo = new T.RingGeometry(.8, 1, 40).rotateX(-HALF_PI)), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(2.2), transparent: true, opacity: .9, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false }));
  m.position.copy(pos); m.position.y = Math.max(pos.y, terrainH(pos.x, pos.z) + .3); world.scene.add(m); FX.rings.push({ m, t: 0, life: .45, R });
}
function updateRings(dt) {
  for (let i = FX.rings.length - 1; i >= 0; i--) {
    const r = FX.rings[i]; r.t += dt; const k = r.t / r.life;
    if (k >= 1) { world.scene.remove(r.m); r.m.material.dispose(); FX.rings.splice(i, 1); continue; }
    r.m.scale.setScalar(1 + r.R * Math.sqrt(k)); r.m.material.opacity = .9 * (1 - k);
  }
}
// ---------- smoke and sparks from damaged bots ----------
const _cw = new T.Vector3();
function updateDamageFx(dt) {
  FX.smokeT -= dt; if (FX.smokeT > 0) return; FX.smokeT = .12;
  for (const b of world.bots) {
    if (b.dead || !b.cellList || b.cloaked) continue;
    const f = b.hp / b.maxHp; if (f > .55) continue;
    if (camera.position.distanceToSquared(b.center) > 260 * 260) continue;
    const alive = b.cellList.filter(c => c.alive); if (!alive.length) continue;
    const c = alive[Math.random() * alive.length | 0]; b.cellWorld(c, _cw);
    emit(_cw.x, _cw.y + .4, _cw.z, rand(-.4, .4) + b.vel.x * .3, rand(1.5, 3), rand(-.4, .4) + b.vel.z * .3, rand(1.2, 2.2), rand(.6, 1.2) * (1.4 - f), f < .3 ? 0x262220 : 0x5a5552, -.25);
    if (f < .3 && Math.random() < .6) emit(_cw.x, _cw.y + .3, _cw.z, rand(-1, 1), rand(1, 3), rand(-1, 1), rand(.3, .6), rand(.15, .3), 0xff8a2a, 2, 3);
  }
}
// ---------- glow under hovering bots ----------
function glowSetup() {
  if (HEADLESS) return;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const im = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-HALF_PI), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 }), 96);
  im.instanceColor = new T.InstancedBufferAttribute(new Float32Array(96 * 3), 3); im.count = 0; im.frustumCulled = false; world.scene.add(im); FX.glow = im;
}
const _gc = new T.Color();
function updateGlow() {
  const im = FX.glow; if (!im) return; let n = 0;
  for (const b of world.bots) {
    if (b.dead || n >= 96 || b.cloaked) continue;
    const mode = b.mob.mode; if (mode !== 'hover' && !b.jetting && !(b.mob.mode === 'rotor' && b.alt < 6)) continue;
    const gy = terrainH(b.pos.x, b.pos.z), above = b.pos.y + b.bottomLocal - gy; if (above > 9) continue;
    const k = 1 - above / 9, s = b.radius * 2.4;
    _fxM.compose(_fxV.set(b.pos.x, gy + .1, b.pos.z), _fxQ.identity(), _fxS.set(s, 1, s)); im.setMatrixAt(n, _fxM);
    _gc.setHex(mode === 'hover' ? 0x5de0ff : 0xffa040).multiplyScalar(.9 * k); im.setColorAt(n, _gc); n++;
  }
  im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
}
// ---------- grass tufts near the camera ----------
function grassSetup(rnd) {
  FX.grass = [];
  const GR = { dust: ['#b49a5a', 220], city: ['#5f6a3a', 70], frost: ['#9fb0a4', 110], ash: ['#4a3a2c', 60] }[world.mapId];
  if (HEADLESS || !GR) return;
  const blade = new T.PlaneGeometry(.9, .8); blade.translate(0, .4, 0);
  const tuft = new T.BufferGeometry(), parts = [0, Math.PI / 3, -Math.PI / 3].map(a => blade.clone().rotateY(a));
  const merged = parts.reduce((acc, g) => { const p = g.attributes.position.array, uv = g.attributes.uv.array; acc.p.push(...p); acc.uv.push(...uv); return acc; }, { p: [], uv: [] });
  tuft.setAttribute('position', new T.Float32BufferAttribute(merged.p, 3)); tuft.setAttribute('uv', new T.Float32BufferAttribute(merged.uv, 2)); tuft.computeVertexNormals();
  const c = document.createElement('canvas'); c.width = 32; c.height = 32; const g = c.getContext('2d');
  g.strokeStyle = GR[0]; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { g.beginPath(); const x = 4 + i * 3; g.moveTo(x, 32); g.quadraticCurveTo(x + (i % 3 - 1) * 3, 16, x + (i % 2 ? 4 : -3), 2 + (i * 7) % 10); g.stroke(); }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  const mat = new T.MeshStandardMaterial({ map: tex, alphaTest: .4, side: T.DoubleSide, roughness: 1 });
  // wind: the tips sway, each tuft a little out of step with its neighbours
  mat.onBeforeCompile = sh => { sh.uniforms.uTime = FX.windT || (FX.windT = { value: 0 }); sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .23;\n#else\nfloat ph = 0.0;\n#endif\nfloat sw = sin(uTime * 2.1 + ph) * .14 + sin(uTime * 3.7 + ph * 1.7) * .05;\ntransformed.x += sw * position.y; transformed.z += sw * .6 * position.y;'); };
  const CH = 64, B = world.bound, m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3();
  for (let cx = -B; cx < B; cx += CH) for (let cz = -B; cz < B; cz += CH) {
    const cap = Math.round(GR[1] * (hiQ() ? 1 : .45)), im = new T.InstancedMesh(tuft, mat, cap); let n = 0;
    for (let i = 0; i < cap * 1.4 && n < cap; i++) {
      const x = cx + rnd() * CH, z = cz + rnd() * CH;
      if (world.mapId === 'city' && cityStreet(x, z) && rnd() < .85) continue;
      if (rocksAt(x, z).some(o => Math.hypot(o.x - x, o.z - z) < o.cr + .5)) continue;
      if (world.liquid && bedH(x, z) < world.liquid.y + .5) continue; // not on lakes or lava
      const k = .6 + rnd() * .9; q.setFromEuler(e.set(0, rnd() * 6.28, 0));
      m4.compose(v.set(x, bedH(x, z) - .05, z), q, sc.set(k, k * (.7 + rnd() * .6), k)); im.setMatrixAt(n++, m4);
    }
    im.count = n; im.receiveShadow = true; im.visible = false; world.scene.add(im); FX.grass.push({ im, x: cx + CH / 2, z: cz + CH / 2 });
  }
}
function updateGrass() {
  if (!FX.grass.length) return;
  const cp = camera.position;
  for (const g of FX.grass) g.im.visible = Math.hypot(g.x - cp.x, g.z - cp.z) < (hiQ() ? 170 : 110);
  if (FX.windT) FX.windT.value = world.time;
}
// called at the end of setupArena and every battle frame
function fxSetup() { FX.rings = []; FX.wx = null; scorchSetup(); glowSetup(); grassSetup(mulberry32(world.map.seed * 13 + 5)); }
function fxUpdate(dt) { if (HEADLESS) return; updateWeather(dt); updateScorch(dt); updateRings(dt); updateDamageFx(dt); updateGlow(); updateGrass(); if (world.planet) world.planet.rotation.y += dt * .01; }
function fxClearBattle() { FX.scorchList = []; for (const r of FX.rings) world.scene.remove(r.m); FX.rings = []; }
