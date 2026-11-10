// ================= DETAILED PART MODELS =================
// Higher-detail builders for weapons, movement parts, cockpits and modules. Every piece is an ordinary mesh,
// so the instanced batches still draw each kind of piece in one call. The first mesh of every part is its main
// body: far-away bots draw only that. Settings → Robot detail switches back to the simple models.
const DM = {
  gun: new T.MeshStandardMaterial({ color: 0x3a4148, roughness: .38, metalness: .85 }),
  gunDark: new T.MeshStandardMaterial({ color: 0x1c2126, roughness: .5, metalness: .7 }),
  chrome: new T.MeshStandardMaterial({ color: 0xc9d1d8, roughness: .16, metalness: 1 }),
  brass: new T.MeshStandardMaterial({ color: 0xb08a3a, roughness: .3, metalness: .95 }),
  black: new T.MeshStandardMaterial({ color: 0x0b0d0f, roughness: .8, metalness: .2 }),
  hazard: (() => { if (HEADLESS) return new T.MeshStandardMaterial({ color: 0xffc23a }); const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#ffc23a'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#181818'; for (let i = -64; i < 128; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i + 75, 64); g.lineTo(i + 64, 64); g.fill(); } const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return new T.MeshStandardMaterial({ map: t, roughness: .6, metalness: .2 }); })(),
  vent: (() => { if (HEADLESS) return new T.MeshStandardMaterial({ color: 0x222 }); const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#2a3036'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#0c0e10'; for (let y = 6; y < 64; y += 10) g.fillRect(4, y, 56, 5); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return new T.MeshStandardMaterial({ map: t, roughness: .6, metalness: .6 }); })(),
};
// geometry helpers, cached by size
const DG = {
  b: (w, h, d) => g2(`b${w},${h},${d}`, () => new T.BoxGeometry(w, h, d)),
  // box with chamfered edges (armor plates, bodies)
  rb: (w, h, d, r = .04) => g2(`rb${w},${h},${d},${r}`, () => roundedBox(w, h, d, r, 2)),
  cz: (r1, r2, l, s = 14) => g2(`cz${r1},${r2},${l},${s}`, () => new T.CylinderGeometry(r2, r1, l, s).rotateX(HALF_PI)), // r1 at the back, r2 at the front
  cy: (r1, r2, l, s = 14) => g2(`cy${r1},${r2},${l},${s}`, () => new T.CylinderGeometry(r2, r1, l, s)),
  cx: (r, l, s = 12) => g2(`cx${r},${l},${s}`, () => new T.CylinderGeometry(r, r, l, s).rotateZ(HALF_PI)),
  tz: (R, t, s = 16) => g2(`tz${R},${t},${s}`, () => new T.TorusGeometry(R, t, 6, s)), // ring facing +z
  ty: (R, t, s = 16) => g2(`ty${R},${t},${s}`, () => new T.TorusGeometry(R, t, 6, s).rotateX(HALF_PI)),
  sp: (r, s = 10) => g2(`sp${r},${s}`, () => new T.SphereGeometry(r, s, Math.max(6, s * .7 | 0))),
  cone: (r, l, s = 10) => g2(`co${r},${l},${s}`, () => new T.ConeGeometry(r, l, s).rotateX(HALF_PI)),
};
// a box whose edges are rounded off: subdivided box, every vertex pulled onto a rounded hull
function roundedBox(w, h, d, r, seg = 2) {
  const g = new T.BoxGeometry(w, h, d, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1), p = g.attributes.position, v = new T.Vector3(), inner = new T.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    const dir = v.clone().sub(inner); if (dir.lengthSq() < 1e-9) continue; dir.normalize().multiplyScalar(r);
    p.setXYZ(i, inner.x + dir.x, inner.y + dir.y, inner.z + dir.z);
  }
  g.computeVertexNormals(); return g;
}
// bevelled versions of the box-like blocks
const BEVEL_GEO = { box: roundedBox(1, 1, 1, .045, 2), slab: roundedBox(1, .5, 1, .04, 2).translate(0, -.25, 0), plate: roundedBox(1, .22, 1, .03, 2).translate(0, -.39, 0) };
const detailOn = () => !HEADLESS && settings.detail !== 'low';

// shared pieces
function dTurretBase(c) {
  const { mesh, P } = c;
  mesh(DG.rb(.9, .14, .9, .03), DM.gun, 0, -.43, 0);
  mesh(DG.cy(.4, .36, .12, 20), DM.gunDark, 0, -.31, 0);
  mesh(DG.ty(.38, .025, 20), P, 0, -.33, 0);
  for (const [x, z] of [[-.36, -.36], [.36, -.36], [-.36, .36], [.36, .36]]) mesh(DG.cy(.035, .035, .05, 6), DM.chrome, x, -.34, z);
}
function dYoke(c, h, w = .3, y = 0) {
  const { mesh, P } = c;
  for (const s of [-1, 1]) { mesh(DG.rb(.08, .36, .42, .02), P, s * w, y - .06, -.02, h); mesh(DG.cx(.07, .1, 10), DM.chrome, s * (w + .06), y, -.02, h); }
}
function dRecoil(c, h) { const g = new T.Group(); h.add(g); c.out.recoil = g; return g; }

const DETAIL = {
  // ---------- core ----------
  seat(c) {
    const { mesh, P } = c;
    mesh(GEO.box, M.dark);
    mesh(DG.rb(1.02, .22, 1.02, .05), P, 0, .42, 0);
    // canopy: a glass dome with a frame
    mesh(DG.rb(.7, .26, .62, .1), M.glowCyan, 0, .58, .06);
    mesh(DG.b(.06, .3, .64), P, 0, .6, .06);
    for (const s of [-1, 1]) { mesh(DG.b(.04, .2, .62), M.glowCyan, s * .51, .08, 0); mesh(DG.rb(.12, .14, .3, .03), DM.gun, s * .44, .38, -.3); }
    mesh(DG.b(.72, .3, .04), M.glowCyan, 0, .08, .51); mesh(DG.b(.72, .3, .04), M.glowCyan, 0, .08, -.51);
    mesh(DG.b(.5, .06, .3), DM.hazard, 0, .54, -.36);
    mesh(DG.cy(.03, .02, .4, 6), DM.chrome, .3, .72, -.3); mesh(DG.sp(.04, 8), M.glowRed, .3, .94, -.3);
  },
  // ---------- movement ----------
  wheel(c) {
    const { mesh, root, out, P } = c;
    mesh(DG.rb(.7, .34, .34, .05), M.dark);
    const spin = new T.Group(); root.add(spin);
    mesh(GEO.tire, M.rubber, 0, 0, 0, spin);
    // tread blocks on the tyre
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, b2 = mesh(DG.b(.52, .07, .14), M.rubber, 0, Math.cos(a) * .56, Math.sin(a) * .56, spin); b2.rotation.x = -a; }
    mesh(DG.cx(.33, .52, 16), DM.gun, 0, 0, 0, spin);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, s2 = mesh(DG.b(.54, .07, .3), P, 0, Math.cos(a) * .17, Math.sin(a) * .17, spin); s2.rotation.x = -a; }
    mesh(DG.cx(.1, .58, 10), DM.chrome, 0, 0, 0, spin);
    out.wheel = spin;
  },
  tread(c) {
    const { mesh, root, out, P } = c;
    mesh(GEO.treadBelt, M.rubber);
    for (const z of [-.42, -.21, 0, .21, .42]) { mesh(DG.b(.92, .08, .12), DM.gunDark, 0, .48, z); mesh(DG.b(.92, .08, .12), DM.gunDark, 0, -.48, z); }
    for (const s of [-1, 1]) mesh(DG.rb(.06, .5, .9, .03), P, s * .45, .08, 0);
    const spin = new T.Group(); root.add(spin);
    for (const s of [-1, 1]) { mesh(DG.cx(.3, .08, 14), DM.gun, s * .47, 0, 0, spin); for (let i = 0; i < 4; i++) { const k = mesh(DG.b(.09, .06, .5), DM.chrome, s * .48, 0, 0, spin); k.rotation.x = i * Math.PI / 4; } }
    out.wheel = spin;
  },
  hover(c) {
    const { mesh, out, P } = c;
    mesh(DG.rb(1, .5, 1, .06), P, 0, .19, 0);
    mesh(DG.b(.7, .04, .7), DM.vent, 0, .45, 0);
    mesh(DG.cy(.48, .4, .26, 24), DM.gun, 0, -.2, 0);
    mesh(DG.ty(.44, .04, 24), DM.chrome, 0, -.1, 0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, f = mesh(DG.b(.04, .22, .24), DM.gunDark, Math.cos(a) * .3, -.24, Math.sin(a) * .3); f.rotation.y = -a; }
    out.glow = mesh(DG.cy(.37, .37, .06, 24), M.glowBlue, 0, -.36, 0);
    mesh(DG.ty(.22, .03, 16), M.glowBlue, 0, -.37, 0);
  },
  jet(c) {
    const { mesh, out, P } = c;
    mesh(DG.rb(.86, .55, .86, .06), P, 0, .2, 0);
    mesh(DG.cy(.42, .3, .5, 18), DM.gun, 0, -.22, 0);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4, f = mesh(DG.b(.04, .36, .3), P, Math.cos(a) * .36, -.18, Math.sin(a) * .36); f.rotation.y = -a; }
    mesh(DG.ty(.33, .04, 18), DM.chrome, 0, -.42, 0);
    mesh(DG.cy(.26, .26, .04, 18), M.glowOrange, 0, -.47, 0);
    mesh(DG.b(.6, .05, .14), DM.hazard, 0, .49, .3);
    const f = mesh(GEO.flame, M.flame, 0, -1.2, 0); f.visible = false; out.flame = f;
  },
  thruster(c) {
    const { mesh, out, P } = c;
    mesh(DG.rb(.78, .68, .6, .06), P, 0, 0, .1);
    mesh(DG.cz(.36, .3, .5, 18), DM.gun, 0, 0, -.38);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, p = mesh(DG.b(.05, .05, .42), DM.chrome, Math.cos(a) * .32, Math.sin(a) * .32, -.38); }
    mesh(DG.tz(.27, .035, 18), M.glowOrange, 0, 0, -.62);
    mesh(DG.cz(.16, .2, .12, 14), M.glowOrange, 0, 0, -.6);
    mesh(DG.b(.6, .08, .4), DM.vent, 0, .35, .12);
    const f = mesh(GEO.thrFlame, M.flame, 0, 0, -1.4); f.visible = false; out.flame = f; out.thrust = true;
  },
  rotor(c) {
    const { mesh, root, out, P } = c;
    mesh(DG.rb(.66, .4, .66, .06), P, 0, -.29, 0);
    mesh(DG.b(.5, .04, .5), DM.vent, 0, -.08, 0);
    mesh(DG.cy(.1, .07, .62, 10), DM.chrome, 0, 0, 0);
    const spin = new T.Group(); spin.position.y = .32; root.add(spin);
    mesh(DG.cy(.2, .16, .14, 14), DM.gun, 0, 0, 0, spin); mesh(DG.cone(.08, .14, 10), DM.chrome, 0, .1, 0, spin).rotation.x = -HALF_PI;
    for (let i = 0; i < 3; i++) {
      const p = new T.Group(); p.rotation.y = i * Math.PI * 2 / 3; spin.add(p);
      const b2 = mesh(DG.b(.98, .035, .2), P, .55, .02, 0, p); b2.rotation.x = .12;
      mesh(DG.b(.12, .04, .21), DM.hazard, 1.0, .025, 0, p);
    }
    out.rotor = spin;
  },
  leg(c) {
    const { mesh, root, out, P } = c;
    mesh(DG.rb(.8, .34, .7, .05), P, 0, .3, 0);
    mesh(DG.cx(.13, .9, 12), DM.gun, 0, .2, 0);
    const g = new T.Group(); g.position.y = .2; root.add(g);
    mesh(DG.rb(.3, .5, .32, .04), DM.gun, 0, -.2, 0, g);
    mesh(DG.cy(.05, .05, .46, 8), DM.chrome, .12, -.25, .14, g); // piston
    mesh(DG.rb(.36, .5, .38, .04), P, 0, -.55, .05, g);
    mesh(DG.cx(.08, .42, 10), DM.chrome, 0, -.35, .02, g);
    mesh(DG.rb(.62, .14, .82, .04), DM.gun, 0, -.78, .08, g);
    for (const s of [-1, 1]) mesh(DG.b(.12, .1, .2), DM.gunDark, s * .22, -.8, .48, g);
    out.leg = g;
  },
  // ---------- weapons ----------
  blaster(c) {
    const { mesh, head, muzzle, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .3);
    mesh(DG.rb(.5, .36, .62, .05), P, 0, 0, 0, h);
    mesh(DG.rb(.42, .07, .5, .02), DM.gun, 0, .21, -.02, h);
    for (const s of [-1, 1]) mesh(DG.b(.04, .12, .3), M.glowOrange, s * .26, .02, -.05, h);
    mesh(DG.b(.08, .08, .2), DM.gunDark, 0, .27, .05, h); mesh(DG.cz(.03, .03, .08, 8), M.glowRed, 0, .27, .16, h); // sight
    const r = dRecoil(c, h);
    mesh(DG.cz(.12, .1, .5, 12), DM.gun, 0, .03, .52, r);
    for (const z of [.38, .5, .62]) mesh(DG.tz(.125, .022, 12), DM.chrome, 0, .03, z, r);
    mesh(DG.cz(.06, .06, .3, 10), DM.gunDark, 0, .03, .88, r);
    mesh(DG.cz(.09, .1, .08, 10), DM.gun, 0, .03, 1.02, r); mesh(DG.cz(.06, .06, .02, 10), M.glowOrange, 0, .03, 1.065, r);
    muzzle(h, .03, 1.1);
  },
  plasma(c) {
    const { mesh, head, muzzle, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .37);
    mesh(DG.rb(.66, .46, .7, .07), P, 0, 0, 0, h);
    for (const s of [-1, 1]) { mesh(DG.cz(.09, .09, .7, 12), DM.gun, s * .3, .16, 0, h); for (const z of [-.15, .1]) mesh(DG.tz(.1, .025, 12), M.glowViolet, s * .3, .16, z, h); }
    for (const x of [-.12, 0, .12]) mesh(DG.b(.04, .1, .4), DM.gunDark, x, .27, -.05, h);
    const r = dRecoil(c, h);
    mesh(DG.cz(.22, .17, .5, 18), DM.gun, 0, .04, .55, r);
    for (const z of [.4, .58, .76]) mesh(DG.tz(.2, .03, 18), M.glowViolet, 0, .04, z, r);
    mesh(DG.sp(.1, 12), M.glowViolet, 0, .04, .78, r);
    mesh(DG.tz(.17, .04, 18), DM.chrome, 0, .04, .82, r);
    muzzle(h, .04, 1.0);
  },
  mortar(c) {
    const { mesh, head, muzzle, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .42);
    mesh(DG.rb(.78, .48, .7, .06), P, 0, 0, 0, h);
    mesh(DG.b(.6, .04, .4), DM.vent, 0, .25, -.1, h);
    mesh(DG.cx(.2, .26, 16), DM.gun, .5, -.02, -.15, h); mesh(DG.cx(.21, .05, 16), DM.hazard, .62, -.02, -.15, h); // ammo drum
    const tilt = new T.Group(); tilt.position.set(0, .08, .1); tilt.rotation.x = -.18; h.add(tilt);
    const r = dRecoil(c, tilt);
    mesh(DG.cz(.27, .24, .78, 18), DM.gun, 0, 0, .38, r);
    mesh(DG.tz(.27, .04, 18), DM.chrome, 0, 0, .12, r); mesh(DG.tz(.26, .05, 18), M.glowOrange, 0, 0, .76, r);
    for (const s of [-1, 1]) mesh(DG.cz(.035, .035, .5, 8), DM.chrome, s * .3, -.12, .2, r);
    muzzle(h, .2, .95);
  },
  rail(c) {
    const { mesh, head, muzzle, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .27);
    mesh(DG.rb(.46, .38, .82, .05), P, 0, 0, 0, h);
    for (const s of [-1, 1]) { mesh(DG.rb(.08, .26, .5, .02), DM.gun, s * .27, .02, -.1, h); mesh(DG.b(.02, .06, .4), M.glowCyan, s * .315, .04, -.1, h); }
    mesh(DG.cz(.05, .05, .4, 10), DM.gunDark, 0, .26, .05, h); mesh(DG.cz(.06, .06, .02, 10), M.glowCyan, 0, .26, .26, h); // scope
    const r = dRecoil(c, h);
    for (const s of [-1, 1]) mesh(DG.b(.07, .11, 1.5), DM.chrome, s * .12, .03, .9, r);
    for (const z of [.45, .7, .95, 1.2, 1.45]) mesh(DG.b(.17, .14, .05), M.glowCyan, 0, .03, z, r);
    mesh(DG.b(.32, .05, .18), DM.gun, 0, .1, 1.55, r); mesh(DG.b(.32, .05, .18), DM.gun, 0, -.04, 1.55, r);
    muzzle(h, .03, 1.7);
  },
  seeker(c) {
    const { mesh, head, muzzle, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .4);
    mesh(DG.rb(.74, .62, .66, .06), P, 0, .06, 0, h);
    mesh(DG.b(.66, .54, .06), DM.gunDark, 0, .06, .34, h);
    for (const x of [-.17, .17]) for (const y of [-.09, .21]) { mesh(DG.cz(.1, .1, .1, 12), DM.gun, x, y, .37, h); mesh(DG.cone(.06, .12, 8), DM.chrome, x, y, .37, h); mesh(DG.cz(.065, .065, .02, 10), M.glowRed, x, y, .33, h); }
    for (const s of [-1, 1]) mesh(DG.b(.03, .3, .4), DM.gun, s * .4, .06, -.05, h);
    mesh(DG.cy(.015, .015, .4, 5), DM.chrome, .25, .5, -.2, h); mesh(DG.b(.3, .05, .3), DM.hazard, -.12, .4, -.15, h);
    muzzle(h, .1, .5);
  },
  flak(c) {
    const { mesh, head, muzzle, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .35);
    mesh(DG.rb(.66, .48, .7, .05), P, 0, 0, 0, h);
    mesh(DG.rb(.74, .36, .06, .02), DM.gun, 0, .02, .37, h); // gun shield
    mesh(DG.rb(.2, .3, .4, .03), DM.gunDark, -.42, -.02, -.05, h); mesh(DG.b(.12, .06, .3), DM.brass, -.36, .14, .05, h); // ammo box and belt
    const r = dRecoil(c, h);
    for (const x of [-.15, .15]) {
      mesh(DG.cz(.1, .09, .55, 12), DM.gun, x, .06, .65, r);
      for (const z of [.5, .62, .74]) mesh(DG.tz(.1, .02, 12), DM.gunDark, x, .06, z, r);
      mesh(DG.rb(.2, .2, .14, .03), DM.chrome, x, .06, 1.08, r);
    }
    muzzle(h, .06, 1.2);
  },
  chain(c) {
    const { mesh, head, muzzle, out, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .37);
    mesh(DG.rb(.7, .5, .6, .06), P, 0, 0, 0, h);
    mesh(DG.cz(.2, .2, .3, 14), DM.gun, 0, .04, .38, h); // motor
    mesh(DG.rb(.22, .32, .42, .03), DM.gunDark, .46, -.04, -.02, h); for (let i = 0; i < 4; i++) mesh(DG.b(.1, .05, .06), DM.brass, .38, .14, -.12 + i * .08, h);
    const spin = new T.Group(); spin.position.set(0, .04, .78); h.add(spin);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mesh(DG.cz(.045, .045, 1.0, 8), DM.gunDark, Math.cos(a) * .12, Math.sin(a) * .12, 0, spin); }
    for (const z of [-.25, .1, .44]) mesh(DG.cz(.2, .2, .06, 14), DM.chrome, 0, 0, z, spin);
    mesh(DG.cz(.05, .05, 1.0, 8), DM.gun, 0, 0, 0, spin);
    out.spin = spin; muzzle(h, .04, 1.3);
  },
  nano(c) {
    const { mesh, head, muzzle, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .3);
    mesh(DG.rb(.55, .45, .65, .07), P, 0, 0, 0, h);
    for (const s of [-1, 1]) { mesh(DG.cy(.07, .07, .3, 10), DM.chrome, s * .2, .32, -.12, h); mesh(DG.cy(.05, .05, .22, 10), M.glowGreen, s * .2, .32, -.12, h); }
    mesh(DG.cz(.12, .26, .2, 18), DM.chrome, 0, .02, .42, h);
    mesh(DG.tz(.2, .035, 16), M.glowGreen, 0, .02, .55, h);
    mesh(DG.cz(.03, .03, .32, 8), DM.gun, 0, .02, .56, h); mesh(DG.sp(.06, 10), M.glowGreen, 0, .02, .72, h);
    muzzle(h, .02, .72);
  },
  arc(c) {
    const { mesh, head, muzzle, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .3);
    mesh(DG.rb(.5, .4, .7, .05), P, 0, 0, 0, h);
    for (const z of [-.15, .05, .25]) mesh(DG.tz(.27, .025, 14), M.tesla, 0, 0, z, h);
    const r = dRecoil(c, h);
    for (const x of [-.16, .16]) { mesh(DG.b(.07, .07, .7), DM.chrome, x, .05, .62, r); mesh(DG.sp(.05, 8), M.tesla, x, .05, .98, r); }
    mesh(DG.sp(.13, 12), M.tesla, 0, .05, .92, r); mesh(DG.tz(.16, .02, 14), DM.chrome, 0, .05, .92, r);
    muzzle(h, .05, .95);
  },
  mine(c) {
    const { mesh, head, muzzle, P } = c; dTurretBase(c); const h = head();
    mesh(DG.cz(.36, .38, .56, 14), P, 0, .02, .05, h);
    for (const z of [-.12, .1]) mesh(DG.tz(.39, .03, 18), DM.gun, 0, .02, z, h);
    mesh(DG.tz(.27, .06, 16), M.glowViolet, 0, .02, .34, h); mesh(DG.cz(.2, .2, .02, 14), DM.black, 0, .02, .33, h);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; mesh(DG.sp(.07, 8), M.glowViolet, Math.cos(a) * .14, .02 + Math.sin(a) * .14, .3, h); }
    mesh(DG.b(.36, .08, .3), DM.hazard, 0, .4, -.05, h);
    muzzle(h, .02, .45);
  },
  lancer(c) {
    const { mesh, head, muzzle, out, P } = c; dTurretBase(c); const h = head(); dYoke(c, h, .33);
    mesh(DG.rb(.56, .44, .92, .06), P, 0, 0, -.05, h);
    for (const s of [-1, 1]) mesh(DG.rb(.1, .3, .7, .03), DM.gun, s * .32, 0, -.1, h);
    mesh(DG.b(.4, .05, .5), DM.vent, 0, .24, -.15, h);
    const r = dRecoil(c, h);
    for (const x of [-.14, .14]) mesh(DG.b(.08, .12, 1.6), DM.chrome, x, .04, 1, r);
    mesh(DG.b(.38, .04, 1.4), DM.gunDark, 0, .12, .95, r);
    const glow = m2('lnGlow', () => new T.MeshStandardMaterial({ color: 0x102030, emissive: 0x9ff3ff, emissiveIntensity: .3 }));
    out.charge = []; for (const z of [.45, .85, 1.25, 1.65]) out.charge.push(mesh(DG.b(.38, .2, .08), glow, 0, .04, z, r));
    mesh(DG.b(.46, .26, .06), DM.gun, 0, .04, 1.82, r);
    muzzle(h, .04, 1.85);
  },
  tesla(c) {
    const { mesh, root, r: rr, P } = c;
    const g = new T.Group(); g.rotation.y = (rr % 4) * HALF_PI; root.add(g);
    mesh(DG.rb(.9, .5, .9, .05), DM.gunDark, 0, -.25, 0, g); mesh(DG.rb(.46, .66, .6, .05), P, 0, .08, -.12, g);
    mesh(GEO.tBlade, M.tesla, 0, .1, .9, g);
    mesh(DG.b(.15, .09, 1.35), DM.chrome, 0, .48, .78, g); mesh(DG.b(.15, .09, 1.35), DM.chrome, 0, -.28, .78, g);
    for (const z of [.5, .95, 1.4]) { mesh(DG.cone(.07, .2, 6), DM.chrome, 0, .6, z, g).rotation.x = -HALF_PI; mesh(DG.cone(.07, .2, 6), DM.chrome, 0, -.4, z, g).rotation.x = HALF_PI; }
    for (const y of [-.1, .2]) mesh(DG.cx(.06, .5, 8), M.tesla, 0, y, -.12, g);
  },
  // ---------- modules ----------
  _module(c, glow, coreGeo) {
    const { mesh, out, P } = c;
    mesh(DG.rb(.92, .7, .92, .07), P, 0, -.1, 0);
    mesh(DG.b(.7, .04, .7), DM.vent, 0, .26, 0);
    mesh(DG.cy(.36, .3, .3, 18), DM.gun, 0, .38, 0);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; mesh(DG.cy(.03, .03, .4, 6), DM.chrome, Math.cos(a) * .28, .55, Math.sin(a) * .28); }
    out.core = mesh(coreGeo, glow, 0, .6, 0);
    for (const s of [-1, 1]) mesh(DG.b(.94, .06, .1), glow, 0, -.1, s * .3);
    mesh(DG.b(.3, .06, .94), DM.hazard, 0, -.42, 0);
  },
};
for (const [t, gl, geo] of [['m_shield', () => M.glowCyan, () => g2('modOrb', () => new T.IcosahedronGeometry(.2, 1))], ['m_cloak', () => M.glowViolet, () => g2('modOrb', () => new T.IcosahedronGeometry(.2, 1))], ['m_blink', () => M.glowBlue, () => g2('modOrb', () => new T.IcosahedronGeometry(.2, 1))],
  ['m_emp', () => m2('empGlow', () => new T.MeshStandardMaterial({ color: 0x302a08, emissive: 0xffe14a, emissiveIntensity: 2.2 })), () => g2('modRing', () => new T.TorusGeometry(.24, .06, 8, 18).rotateX(HALF_PI))],
  ['m_power', () => M.glowGreen, () => g2('modCell', () => new T.CylinderGeometry(.16, .16, .5, 12))], ['m_disrupt', () => M.glowRed, () => g2('modOrb', () => new T.IcosahedronGeometry(.2, 1))]])
  DETAIL[t] = c => DETAIL._module(c, gl(), geo());
