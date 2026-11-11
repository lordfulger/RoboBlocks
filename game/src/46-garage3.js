// ================= GARAGE: HANGAR, CAMERA, LAYERS, BALANCE, REDO, PART SEARCH, BAYS, SHORTCUTS =================
// ---------- the hangar around the build pad ----------
function buildHangar() {
  if (HEADLESS) return;
  const s = garage.scene;
  s.fog = new T.Fog(0x141a1f, 55, 120); s.background = new T.Color(0x12171b);
  // walls: tall panels with light strips, an open back with the RoboBlocks sign
  const panelTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'), r = mulberry32(31);
    g.fillStyle = '#2a3238'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 900; i++) { const v = 38 + r() * 14 | 0; g.fillStyle = `rgb(${v},${v + 4},${v + 8})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
    g.strokeStyle = '#1a1f23'; g.lineWidth = 6; g.strokeRect(0, 0, 256, 256); g.strokeStyle = '#3a444c'; g.lineWidth = 2; g.strokeRect(10, 10, 236, 236);
    g.fillStyle = '#1d2327'; for (const [x, y] of [[22, 22], [234, 22], [22, 234], [234, 234]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; return t; })();
  const wallMat = new T.MeshStandardMaterial({ color: 0xffffff, map: panelTex, roughness: .7, metalness: .45 });
  panelTex.repeat.set(12, 3);
  const room = new T.Mesh(new T.CylinderGeometry(46, 46, 26, 12, 1, true), wallMat); room.material.side = T.BackSide; room.position.y = 12.5; s.add(room);
  const strip = new T.MeshBasicMaterial({ color: new T.Color(0xcfe4ff).multiplyScalar(2.4), toneMapped: false });
  for (let i = 0; i < 12; i++) { const a = (i + .5) / 12 * Math.PI * 2, m = new T.Mesh(new T.BoxGeometry(.5, 14, .3), strip); m.position.set(Math.sin(a) * 45.3, 9, Math.cos(a) * 45.3); m.rotation.y = a; s.add(m); }
  // ceiling light bars
  for (const x of [-14, 0, 14]) { const bar = new T.Mesh(new T.BoxGeometry(2.2, .3, 40), strip); bar.position.set(x, 24.5, 0); s.add(bar); }
  // sign on the back wall
  { const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d');
    // measured and shrunk to fit, so a fallback font (before the web font loads, or offline) never runs off the edges
    const draw = () => {
      g.clearRect(0, 0, c.width, c.height); g.textBaseline = 'middle'; let px = 120;
      const set = () => { g.font = `700 ${px}px "Chakra Petch", sans-serif`; return g.measureText('ROBO').width + 8 + g.measureText('BLOCKS').width; };
      let w = set(); if (w > c.width - 48) { px = Math.floor(px * (c.width - 48) / w); w = set(); }
      const x0 = (c.width - w) / 2, wr = g.measureText('ROBO').width;
      g.textAlign = 'left'; g.fillStyle = '#e9edf0'; g.fillText('ROBO', x0, 84); g.fillStyle = '#ff8a1f'; g.fillText('BLOCKS', x0 + wr + 8, 84);
    };
    draw();
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { draw(); t.needsUpdate = true; });
    const sign = new T.Mesh(new T.PlaneGeometry(26, 4), new T.MeshBasicMaterial({ map: t, transparent: true, color: new T.Color(1.6, 1.6, 1.6), toneMapped: false })); sign.position.set(0, 17, -44.5); s.add(sign); }
  // props: crates, a parts rack and a tool cart near the walls
  const crate = new T.MeshStandardMaterial({ color: 0x5b4632, roughness: .8 }), steel = new T.MeshStandardMaterial({ color: 0x59636b, roughness: .4, metalness: .8 }), hazard = new T.MeshStandardMaterial({ color: 0xd8a21f, roughness: .6 });
  const r = mulberry32(77);
  for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, d = 32 + r() * 9, k = 1.2 + r() * 1.6; const m = new T.Mesh(new T.BoxGeometry(k, k, k), r() < .3 ? hazard : crate); m.position.set(Math.sin(a) * d, -.5 + k / 2, Math.cos(a) * d); m.rotation.y = r() * 3; m.castShadow = m.receiveShadow = true; s.add(m); }
  for (const a of [.8, -2.2]) { const g = new T.Group(); g.position.set(Math.sin(a) * 40, -.5, Math.cos(a) * 40); g.rotation.y = a + Math.PI;
    for (const y of [0, 2.2, 4.4]) { const sh = new T.Mesh(new T.BoxGeometry(8, .2, 2), steel); sh.position.y = y + .6; g.add(sh); for (let j = 0; j < 4; j++) { const b = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ color: COLORS[(j * 3 + Math.round(y * 2)) % COLORS.length], roughness: .5, metalness: .3 })); b.position.set(-3 + j * 2, y + 1.2, 0); g.add(b); } }
    for (const x of [-4, 4]) { const p = new T.Mesh(new T.BoxGeometry(.2, 6, .2), steel); p.position.set(x, 3, -.9); g.add(p); }
    s.add(g); }
  // build pad: a raised turntable with a glowing rim
  const pad = new T.Mesh(new T.CylinderGeometry(11.5, 12, .3, 64), new T.MeshStandardMaterial({ color: 0x1e252b, roughness: .55, metalness: .6 })); pad.position.y = -.66; pad.receiveShadow = true; s.add(pad);
  const rim = new T.Mesh(new T.TorusGeometry(11.75, .07, 6, 96).rotateX(HALF_PI), new T.MeshBasicMaterial({ color: new T.Color(0xff8a1f).multiplyScalar(2.2), toneMapped: false })); rim.position.y = -.5; s.add(rim);
  garage.rim = rim;
}
// the shiny hangar floor reflects the bot
function hangarFloor(floor) {
  if (HEADLESS) return;
  floor.material = new T.MeshStandardMaterial({ color: 0x1b2126, roughness: .35, metalness: .55 });
  makeMirror(floor, { strength: .38, rough: .6, size: 512, every: 2, hide: [garage.ghost, garage.mirrorGhost] });
}
// ---------- smooth camera: orbit, pan, focus, preset views ----------
garage.cam = { theta: .75, phi: 1.05, r: 20, tx: 0, ty: 2.2, tz: 0 };
garage.orbit.tx = 0; garage.orbit.tz = 0;
function smoothGarageCamera(dt) {
  const o = garage.orbit, c = garage.cam, k = 1 - Math.exp(-12 * (dt || .016));
  c.theta += wrapA(o.theta - c.theta) * k; c.phi += (o.phi - c.phi) * k; c.r += (o.r - c.r) * k;
  c.tx += ((o.tx || 0) - c.tx) * k; c.ty += (o.ty - c.ty) * k; c.tz += ((o.tz || 0) - c.tz) * k;
}
function setView(v) {
  const o = garage.orbit;
  const V = { front: [0, 1.32], back: [Math.PI, 1.32], side: [HALF_PI, 1.32], top: [0, .06], iso: [.75, 1.05] }[v];
  if (v === 'reset') { o.theta = .75; o.phi = 1.05; o.r = 20; o.tx = 0; o.ty = 2.2; o.tz = 0; }
  else if (V) { o.theta = V[0]; o.phi = V[1]; }
  $('#viewMenu').hidden = true; SFX.ui();
}
function garagePan(dx, dy) {
  const o = garage.orbit, s = o.r * .0016;
  const rx = Math.cos(o.theta), rz = -Math.sin(o.theta); // camera right on the floor
  o.tx = clamp((o.tx || 0) - dx * s * rx, -10, 10); o.tz = clamp((o.tz || 0) - dx * s * rz, -10, 10); o.ty = clamp(o.ty + dy * s, -1, 14);
}
function focusBlock(b) { const o = garage.orbit; o.tx = b.x; o.ty = b.y; o.tz = b.z; o.r = Math.min(o.r, 12); SFX.ui(); }
// ---------- redo ----------
garage.redo = [];
function doRedo() { const s = garage.redo.pop(); if (!s) { toast('Nothing to redo.'); return; } garage.undo.push(JSON.stringify(gSerialize().blocks)); gClear(); for (const b of JSON.parse(s)) gAdd(b); onDesignChanged(); SFX.click(); }
// ---------- layer cutaway: hide everything above a layer to reach the inside ----------
garage.layer = null;
function setLayer(v) {
  garage.layer = v; const maxY = Math.max(0, ...[...garage.blocks.values()].map(b => b.y));
  if (v != null) garage.layer = clamp(v, 0, Math.max(maxY, 0));
  for (const b of garage.blocks.values()) { const show = garage.layer == null || b.y <= garage.layer; b.obj.traverse(o => o.layers.set(show ? 0 : 1)); }
  $('#layerBar').hidden = garage.layer == null; $('#btnLayer').classList.toggle('on', garage.layer != null);
  if (garage.layer != null) $('#layerVal').textContent = garage.layer;
  if (garage.layerPlane) garage.layerPlane.visible = garage.layer != null;
  if (garage.layer != null) { if (!garage.layerPlane) { garage.layerPlane = new T.Mesh(new T.PlaneGeometry(15, 15).rotateX(-HALF_PI), new T.MeshBasicMaterial({ color: 0x5fe8ff, transparent: true, opacity: .07, depthWrite: false, side: T.DoubleSide })); garage.scene.add(garage.layerPlane); } garage.layerPlane.position.y = garage.layer + .5; garage.layerPlane.visible = true; }
  refreshGhost();
}
// ---------- balance: center of mass over the footprint ----------
garage.bal = false;
function balanceInfo() {
  const list = [...garage.blocks.values()]; if (!list.length) return null;
  let m = 0, x = 0, y = 0, z = 0; for (const b of list) { const w = partMass(b); m += w; x += b.x * w; y += b.y * w; z += b.z * w; }
  const minX = Math.min(...list.map(b => b.x)), maxX = Math.max(...list.map(b => b.x)), minZ = Math.min(...list.map(b => b.z)), maxZ = Math.max(...list.map(b => b.z)), minY = Math.min(...list.map(b => b.y)), maxY = Math.max(...list.map(b => b.y));
  const com = { x: x / m, y: y / m, z: z / m }, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  return { com, off: { x: com.x - cx, z: com.z - cz }, size: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1] };
}
function drawBalance() {
  if (garage.balObj) { garage.group.remove(garage.balObj); garage.balObj = null; }
  if (!garage.bal) return; const B = balanceInfo(); if (!B) return;
  const g = new T.Group(), mat = new T.MeshBasicMaterial({ color: new T.Color(0xffd36a).multiplyScalar(1.6), depthTest: false, transparent: true, toneMapped: false });
  const ball = new T.Mesh(new T.SphereGeometry(.35, 16, 12), mat); ball.position.set(B.com.x, B.com.y, B.com.z); ball.renderOrder = 5; g.add(ball);
  const line = new T.Mesh(new T.CylinderGeometry(.04, .04, B.com.y + .5, 6), mat); line.position.set(B.com.x, (B.com.y - .5) / 2, B.com.z); line.renderOrder = 5; g.add(line);
  const dot = new T.Mesh(new T.RingGeometry(.3, .45, 24).rotateX(-HALF_PI), mat); dot.position.set(B.com.x, -.48, B.com.z); g.add(dot);
  garage.balObj = g; garage.group.add(g);
}
function balanceText() {
  const B = balanceInfo(); if (!B) return ['–', '–'];
  const f = (v, a, b) => Math.abs(v) < .6 ? '' : `${Math.abs(v).toFixed(1)} ${v > 0 ? a : b}`;
  const lean = [f(B.off.x, 'left', 'right'), f(B.off.z, 'forward', 'back')].filter(Boolean).join(', ');
  return [`${B.size[0]} × ${B.size[1]} × ${B.size[2]}`, lean ? 'Leans ' + lean : 'Centered'];
}
// ---------- part search, recently used, part info card ----------
garage.recent = store.get('sfa.recent', []);
function noteRecent(id) { garage.recent = [id].concat(garage.recent.filter(x => x !== id)).slice(0, 7); store.set('sfa.recent', garage.recent); buildRecent(); }
function buildRecent() {
  const el = $('#recentParts'); if (!el) return; el.innerHTML = '';
  for (const id of garage.recent) { if (!partOpen(id)) continue; const b = document.createElement('button'); b.title = PARTS[id].name; b.innerHTML = `<img alt="" src="${ICONS[id] || BLANK}">`; b.onclick = () => selectTool(id); b.onmouseenter = () => showPartCard(id, b); b.onmouseleave = hidePartCard; el.appendChild(b); }
}
function filterParts() {
  const q = $('#partSearch').value.trim().toLowerCase();
  let lastCat = null, catShown = false;
  for (const el of $('#partsList').children) {
    if (el.classList.contains('cat')) { lastCat = el; el.hidden = !!q; continue; }
    const id = el.id.replace('part-', ''), p = PARTS[id]; if (!p) continue;
    el.hidden = !!q && !(p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q) || (p.desc || '').toLowerCase().includes(q));
  }
}
function showPartCard(id, anchor) {
  const p = PARTS[id], card = $('#partCard'); if (!p || !card || innerWidth < 820) return;
  const t = TIERS[garage.tier], shape = !!p.shape;
  const hp = shape ? Math.round(t.hp * p.hpF) : p.hp, cpu = shape ? t.cpu : p.cpu, mass = shape ? +(t.mass * (p.massF || 1)).toFixed(2) : p.mass;
  const W = WEAPONS[id], dps = W && W.dmg ? Math.round(W.dmg / W.cd * tierScale(level())) : 0;
  const lock = partLocked(id) ? `Unlocked by ${unlockName(p.ach)}` : p.lvl > unlockLv() ? `Unlocks at pilot level ${p.lvl}` : !techHas(id) ? `Unlock it in the Tech Tree (${TECH[id] ? TECH[id].cost : '?'} points)` : '';
  card.innerHTML = `<div class="ph"><img alt="" src="${ICONS[id] || BLANK}"><div><b>${esc(p.name)}</b><div class="label">${esc(p.cat)}${shape ? ' · ' + esc(t.name) : ''}</div></div></div>
    <div class="kv"><span>CPU</span><span>${cpu}</span><span>Health</span><span>${hp}</span><span>Mass</span><span>${mass}</span>${dps ? `<span>Damage per second</span><span>${dps}</span>` : ''}${W && W.range ? `<span>Range</span><span>${W.range} m</span>` : ''}${p.module ? `<span>Key</span><span>${keyLabel(KB('mod_' + p.module))}</span><span>Energy</span><span>${MODULES[p.module].cost}</span>` : ''}</div>
    <p style="margin:0">${esc(p.desc || '')}</p>${lock ? `<p style="margin:0;color:var(--warn)">${esc(lock)}</p>` : ''}`;
  const r = anchor.getBoundingClientRect(); card.style.top = clamp(r.top - 20, 70, innerHeight - 260) + 'px'; card.hidden = false;
}
function hidePartCard() { const c = $('#partCard'); if (c) c.hidden = true; }
// ---------- bay manager ----------
function showBays() {
  $('#moreMenu').hidden = true; saveBays();
  const rows = bays.map((d, i) => { const n = d && d.blocks ? d.blocks.length : 0; return `<div class="bayCard${i === bayIdx ? ' cur' : ''}"><img data-i="${i}" alt="" width="220" height="150"><b>${esc(d && d.name || 'Bay ' + (i + 1))}</b><span>${n ? `${n} blocks · ${computeStats(d.blocks).cpu} CPU` : 'Empty'}</span>
    <div class="srow2"><button data-open="${i}" class="primary">${i === bayIdx ? 'Current' : 'Open'}</button><button data-dup="${i}" ${n ? '' : 'disabled'}>Duplicate</button><button data-clr="${i}" ${n ? '' : 'disabled'}>Clear</button></div></div>`; }).join('');
  showOverlay(`<h2>Garage bays</h2><p>Five bays, five bots. Duplicate a bay to try changes without losing the original.</p><div class="shop">${rows}</div><div class="btns"><button class="primary" id="ovBack">Done</button></div>`, true);
  $('#ovBack').onclick = hideOverlay;
  document.querySelectorAll('img[data-i]').forEach(img => { const d = bays[+img.dataset.i]; if (d && d.blocks && d.blocks.length) setTimeout(() => { img.src = designThumb(d, 'bay' + img.dataset.i + ':' + JSON.stringify(d.blocks).length + d.f + d.blocks.length) || ''; }, 0); });
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { switchBay(+b.dataset.open); hideOverlay(); });
  document.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => {
    const i = +b.dataset.dup, j = bays.findIndex((d, k) => k !== i && (!d || !d.blocks || !d.blocks.length));
    if (j < 0) { toast('No empty bay. Clear one first.'); return; }
    bays[j] = JSON.parse(JSON.stringify(bays[i])); bays[j].name = (cleanName(bays[i].name || '') || 'Bot').slice(0, 15) + ' copy';
    store.set('sfa.bays', bays); cloudDirty(); buildBaysUI(); toast(`Copied to bay ${j + 1}.`); showBays();
  });
  document.querySelectorAll('[data-clr]').forEach(b => b.onclick = () => {
    const i = +b.dataset.clr; if (!armed(b)) return;
    bays[i] = { name: 'Bay ' + (i + 1), v: 3, blocks: [] }; if (i === bayIdx) { design = bays[i]; gLoad(design); updateStats(); }
    store.set('sfa.bays', bays); cloudDirty(); buildBaysUI(); showBays();
  });
}
// ---------- shortcuts ----------
function showKeys() {
  $('#moreMenu').hidden = true;
  const K = [['Click', 'Place the selected part'], ['Shift + drag', 'Place a row of parts'], ['Right-click', 'Remove a block'], ['Drag', 'Orbit the camera'], ['Right-drag', 'Pan the camera'], ['Scroll', 'Zoom'], ['Double-click', 'Focus on a block'],
    ['R / T / F', 'Rotate, tilt, roll the next part'], ['B', 'Build'], ['P', 'Paint'], ['G', 'Fill paint'], ['E', 'Erase'], ['I, Alt+click or middle click', 'Pick a block\'s part, color and armor'], ['S', 'Select blocks, then arrows to move and Delete to remove'],
    ['M / Shift+M', 'Mirror on/off / mirror direction'], ['L', 'Layer cutaway; [ and ] move the layer'], ['C', 'Show the center of mass'], ['1 – 0', 'Quick-pick the first parts'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['?', 'This list']];
  showOverlay(`<h2>Garage shortcuts</h2><div class="keys">${K.map(([k, d]) => `<kbd>${esc(k)}</kbd><span>${esc(d)}</span>`).join('')}</div><div class="btns"><button class="primary" id="ovBack">Got it</button></div>`, true);
  $('#ovBack').onclick = hideOverlay;
}
// ---------- wiring ----------
(() => {
  if (HEADLESS) return;
  const menu = (btn, m) => { $(btn).onclick = e => { e.stopPropagation(); const open = $(m).hidden; for (const x of ['#viewMenu', '#moreMenu']) $(x).hidden = true; $(m).hidden = !open; if (open) { const r = $(btn).getBoundingClientRect(), el = $(m); el.style.bottom = (innerHeight - r.top + 8) + 'px'; el.style.left = Math.min(innerWidth - 190, Math.max(8, r.left + r.width / 2 - 85)) + 'px'; } }; };
  menu('#btnViews', '#viewMenu'); menu('#btnMore', '#moreMenu');
  addEventListener('pointerdown', e => { if (!e.target.closest || !e.target.closest('.tmenu, #btnViews, #btnMore')) for (const x of ['#viewMenu', '#moreMenu']) $(x).hidden = true; }, true);
  document.querySelectorAll('#viewMenu [data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('#btnPlace').onclick = () => { garage.erase = garage.paint = false; garage.tool2 = null; syncToolButtons(); SFX.ui(); };
  $('#btnRedo').onclick = doRedo;
  $('#btnLayer').onclick = () => { setLayer(garage.layer == null ? Math.max(0, ...[...garage.blocks.values()].map(b => b.y)) : null); SFX.ui(); };
  $('#layerUp').onclick = () => setLayer((garage.layer || 0) + 1); $('#layerDn').onclick = () => setLayer((garage.layer || 0) - 1); $('#layerOff').onclick = () => setLayer(null);
  $('#btnBal').onclick = () => { garage.bal = !garage.bal; $('#btnBal').classList.toggle('on', garage.bal); drawBalance(); SFX.ui(); };
  $('#btnBays').onclick = showBays; $('#btnKeys').onclick = showKeys; $('#btnTpl').onclick = showTemplates; $('#btnGroups').onclick = showWeaponGroups;
  for (const id of ['#btnCode', '#btnPhoto', '#btnStarter', '#btnClear', '#btnTpl', '#btnGroups']) $(id).addEventListener('click', () => { $('#moreMenu').hidden = true; });
  const ps = $('#partSearch'); ps.addEventListener('input', filterParts); ps.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { ps.value = ''; filterParts(); ps.blur(); } });
  $('#partsList').addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('.part'); if (b) showPartCard(b.id.replace('part-', ''), b); });
  $('#partsList').addEventListener('mouseleave', hidePartCard);
  canvas.addEventListener('dblclick', e => { if (state !== 'garage') return; const pk = gPick(e.clientX, e.clientY); if (pk && pk.block) focusBlock(pk.block); });
})();
