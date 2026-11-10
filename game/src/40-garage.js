// ================= GARAGE =================
const BOUNDS = { x: 7, y: 11, z: 7 };
const garage = {
  scene: new T.Scene(), group: new T.Group(), blocks: new Map(),
  orbit: { theta: .75, phi: 1.05, r: 20, ty: 2.2 }, tool: 'cube', color: 9, rot: 0, tier: 1, mat: 'std', mirror: true, erase: false, paint: false, undo: [], last: null,
  ghost: null, ghostEdges: null, marks: [], raycaster: new T.Raycaster(), pointer: new T.Vector2(), hover: null,
};
function setupGarage() {
  const s = garage.scene;
  s.background = new T.Color(0x1a2026); s.fog = new T.Fog(0x1a2026, 45, 95);
  s.add(new T.HemisphereLight(0xd4e6ff, 0x2a2018, .55)); s.environment = studioEnv();
  const d = new T.DirectionalLight(0xfff1e0, 1.7); d.position.set(12, 24, 15); d.castShadow = true; d.shadow.mapSize.set(2048, 2048);
  Object.assign(d.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 70 }); d.shadow.bias = -.0005; s.add(d);
  const fill = new T.DirectionalLight(0x8fb4ff, .55); fill.position.set(-12, 8, -14); s.add(fill);
  const floor = new T.Mesh(new T.CircleGeometry(47, 64).rotateX(-HALF_PI), new T.MeshStandardMaterial({ color: 0x252c32, roughness: .92, metalness: .1 }));
  floor.position.y = -.82; floor.receiveShadow = true; s.add(floor); garage.floor = floor;
  const grid = new T.GridHelper(15, 15, 0x52626e, 0x34414b); grid.position.y = -.495; s.add(grid);
  const bounds = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(15, 12, 15)), new T.LineBasicMaterial({ color: 0x3c4a55, transparent: true, opacity: .45 }));
  bounds.position.set(0, 5.5, 0); s.add(bounds);
  const sh = new T.Shape(); sh.moveTo(-1.3, 0); sh.lineTo(1.3, 0); sh.lineTo(0, -1.8); sh.closePath();
  const arrow = new T.Mesh(new T.ShapeGeometry(sh).rotateX(-HALF_PI), new T.MeshBasicMaterial({ color: 0xff8a1f }));
  arrow.position.set(0, -.49, 8.6); arrow.scale.setScalar(.7); s.add(arrow);
  s.add(garage.group);
  garage.ghost = new T.Mesh(GEO.box, new T.MeshBasicMaterial({ color: 0x62e08f, transparent: true, opacity: .32, depthWrite: false }));
  garage.ghost.scale.setScalar(1.04);
  garage.ghostEdges = new T.LineSegments(edgesOf(GEO.box), new T.LineBasicMaterial({ color: 0x62e08f }));
  garage.ghost.add(garage.ghostEdges); garage.ghost.visible = false; s.add(garage.ghost);
  const dirArrow = new T.Mesh(new T.ConeGeometry(.22, .55, 10).rotateX(HALF_PI), new T.MeshBasicMaterial({ color: 0xff8a1f, depthTest: false, transparent: true }));
  dirArrow.renderOrder = 3; garage.dirPivot = new T.Group(); dirArrow.position.z = .85; garage.dirPivot.add(dirArrow); garage.ghost.add(garage.dirPivot);
  garage.mirrorGhost = garage.ghost.clone(); garage.mirrorGhost.material = garage.ghost.material.clone(); garage.mirrorGhost.material.opacity = .14; s.add(garage.mirrorGhost);
  garage.mirrorGhost.visible = false;
  garage.floorPlane = new T.Plane(new T.Vector3(0, 1, 0), .5);
  buildHangar(); hangarFloor(floor); applyHangarTheme();
}
function gAdd(b) {
  const k = ckey(b.x, b.y, b.z); if (garage.blocks.has(k)) return;
  const kk = isShape(b.t) ? (b.k || 1) : undefined;
  const mm = kk && b.m && b.m !== 'std' ? b.m : undefined;
  const p = makePart(b.t, b.c, b.r || 0, kk, design.f || 'standard', mm); p.root.position.set(b.x, b.y, b.z); p.root.userData.key = k;
  p.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const rec = { x: b.x, y: b.y, z: b.z, t: b.t, c: b.c, r: b.r || 0, obj: p.root }; if (kk) rec.k = kk; if (mm) rec.m = mm;
  garage.group.add(p.root); garage.blocks.set(k, rec);
}
function gRemove(k) { const b = garage.blocks.get(k); if (!b) return; garage.group.remove(b.obj); garage.blocks.delete(k); }
function gClear() { for (const k of [...garage.blocks.keys()]) gRemove(k); }
function gSerialize() { return { name: design.name || 'Bay ' + (bayIdx + 1), v: 3, f: design.f || 'standard', wg: design.wg || undefined, blocks: [...garage.blocks.values()].map(({ x, y, z, t, c, r, k, m }) => k ? (m ? { x, y, z, t, c, r, k, m } : { x, y, z, t, c, r, k }) : { x, y, z, t, c, r }) }; }
function gLoad(d) { migrateDesign(d); if (d.name && d.name !== 'Bot') design.name = d.name; design.f = d.f || 'standard'; design.wg = Array.isArray(d.wg) ? d.wg : undefined; gClear(); for (const b of d.blocks) if (PARTS[b.t]) gAdd(b); onDesignChanged(); if ($('#botName')) $('#botName').value = design.name; }
function onDesignChanged() { design = gSerialize(); saveBays(); updateStats(); if (WEAK.on) weakSpots(true); if (garage.layer != null) setLayer(garage.layer); if (garage.bal) drawBalance(); if ($('#bayTabs').children.length) { const t = $('#bay' + bayIdx); if (t) t.classList.toggle('empty', !design.blocks.length); } }
function pushUndo() { garage.undo.push(JSON.stringify(gSerialize().blocks)); if (garage.undo.length > 80) garage.undo.shift(); if (garage.redo) garage.redo.length = 0; }
function doUndo() { const s = garage.undo.pop(); if (!s) { toast('Nothing to undo.'); return; } if (garage.redo) garage.redo.push(JSON.stringify(gSerialize().blocks)); gClear(); for (const b of JSON.parse(s)) gAdd(b); onDesignChanged(); SFX.pop(); }
function usedCpu() { let c = 0; for (const b of garage.blocks.values()) c += partCpu(b); return c; }
function hasNeighbor(x, y, z, extra) {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const k = ckey(x + dx, y + dy, z + dz); if (garage.blocks.has(k) || (extra && extra === k)) return true;
  }
  return false;
}
function inBounds(p) { return Math.abs(p.x) <= BOUNDS.x && p.y >= 0 && p.y <= BOUNDS.y && Math.abs(p.z) <= BOUNDS.z; }
const toolRot = (t, r) => isShape(t) ? r : t === 'tesla' ? r % 4 : 0;
// mirror axis: 'x' copies left/right, 'z' copies front/back
const mirOff = b => garage.mirAxis === 'z' ? b.z !== 0 : b.x !== 0;
const mirPos = b => garage.mirAxis === 'z' ? { x: b.x, y: b.y, z: -b.z } : { x: -b.x, y: b.y, z: b.z };
function mirRot(t, r) { const m = mirrorR(t, r); if (garage.mirAxis !== 'z') return m; return PARTS[t].shape || t === 'tesla' ? (m & ~3) | (((m & 3) + 2) % 4) : 0; }
function placementPlan(p) {
  const t = garage.tool, P = PARTS[t];
  if (!inBounds(p)) return { ok: false, why: 'Outside the build area.' };
  if (garage.blocks.has(ckey(p.x, p.y, p.z))) return { ok: false, why: 'That cell is taken.' };
  if (P.lvl > level()) return { ok: false, why: `${P.name} unlocks at pilot level ${P.lvl}.` };
  if (partLocked(t)) return { ok: false, why: `${P.name} is earned with an achievement.` };
  if (!techHas(t)) return { ok: false, why: `${P.name}: unlock it in the Tech Tree.` };
  if (P.shape && !techHas('T' + garage.tier)) return { ok: false, why: `T${garage.tier} armor: unlock it in the Tech Tree.` };
  if (P.shape && TIERS[garage.tier].lvl > level()) return { ok: false, why: `${TIERS[garage.tier].name} armor unlocks at pilot level ${TIERS[garage.tier].lvl}.` };
  if (garage.blocks.size && !hasNeighbor(p.x, p.y, p.z)) return { ok: false, why: 'Blocks must touch your bot.' };
  const r0 = toolRot(t, garage.rot);
  const list = [{ x: p.x, y: p.y, z: p.z, t, c: garage.color, r: r0 }];
  if (P.shape) { list[0].k = garage.tier; if (garage.mat !== 'std') list[0].m = garage.mat; }
  if (P.shape && MATERIALS[garage.mat].lvl > level()) return { ok: false, why: `${MATERIALS[garage.mat].name} unlocks at pilot level ${MATERIALS[garage.mat].lvl}.` };
  if (P.shape && !matOpen(garage.mat)) return { ok: false, why: `${MATERIALS[garage.mat].name}: unlock it in the Tech Tree.` };
  if (garage.mirror && mirOff(p)) {
    const m = mirPos(p);
    if (inBounds(m) && !garage.blocks.has(ckey(m.x, m.y, m.z)) && hasNeighbor(m.x, m.y, m.z)) { const mb = { ...m, t, c: garage.color, r: mirRot(t, r0) }; if (P.shape) { mb.k = garage.tier; if (garage.mat !== 'std') mb.m = garage.mat; } list.push(mb); }
  }
  if (t === 'seat') {
    const seats = [...garage.blocks.values()].filter(b => b.t === 'seat').length;
    if (seats >= 1) return { ok: false, why: 'Only one Pilot Seat per bot.' };
    list.length = 1;
  }
  const one = partCpu(list[0]), cost = list.length * one;
  if (usedCpu() + cost > ownCpuMax()) {
    if (list.length === 2 && usedCpu() + one <= ownCpuMax()) list.length = 1;
    else return { ok: false, why: `Over the CPU budget (${ownCpuMax()}). Remove parts, level up or unlock CPU Cores in the Tech Tree.` };
  }
  return { ok: true, list };
}
function gPick(cx, cy) {
  const r = canvas.getBoundingClientRect();
  garage.pointer.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  garage.raycaster.setFromCamera(garage.pointer, camera);
  const hits = garage.raycaster.intersectObjects(garage.group.children, true);
  if (hits.length) {
    const h = hits[0]; let o = h.object; while (o && o.userData.key === undefined) o = o.parent;
    const b = o && garage.blocks.get(o.userData.key);
    if (b) {
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      let d = [0, 0, 0];
      if (ay >= ax && ay >= az) d = [0, Math.sign(n.y), 0]; else if (ax >= az) d = [Math.sign(n.x), 0, 0]; else d = [0, 0, Math.sign(n.z)];
      return { block: b, place: { x: b.x + d[0], y: b.y + d[1], z: b.z + d[2] } };
    }
  }
  const pt = new T.Vector3();
  if (garage.raycaster.ray.intersectPlane(garage.floorPlane, pt)) return { block: null, place: { x: Math.round(pt.x), y: 0, z: Math.round(pt.z) } };
  return null;
}
function updateGhost(cx, cy) {
  const g = garage.ghost, mg = garage.mirrorGhost; g.visible = mg.visible = false; garage.hover = null;
  if (cx == null) return;
  const pk = gPick(cx, cy); if (!pk) return;
  garage.hover = pk;
  if (garage.erase || garage.paint) {
    if (!pk.block) return;
    garage.dirPivot.visible = false;
    const b = pk.block; setGhostShape(g, b.t, b.r);
    g.position.set(b.x, b.y, b.z); setGhostColor(garage.erase ? 0xff5444 : 0xffcf3d); g.visible = true;
    const mp = mirPos(b), mb = garage.mirror && mirOff(b) && garage.blocks.get(ckey(mp.x, mp.y, mp.z));
    if (mb) { setGhostShape(mg, mb.t, mb.r); mg.position.set(mb.x, mb.y, mb.z); mg.visible = true; }
    return;
  }
  const plan = placementPlan(pk.place);
  const r0 = toolRot(garage.tool, garage.rot);
  setGhostShape(g, garage.tool, r0);
  garage.dirPivot.visible = garage.tool === 'tesla';
  g.position.set(pk.place.x, pk.place.y, pk.place.z); setGhostColor(plan.ok ? 0x62e08f : 0xff5444); g.visible = inBounds(pk.place);
  if (plan.ok && plan.list.length > 1) { setGhostShape(mg, garage.tool, plan.list[1].r); mg.position.set(plan.list[1].x, plan.list[1].y, plan.list[1].z); mg.visible = true; }
}
function setGhostShape(g, t, r) {
  const P = PARTS[t], geo = P.shape ? SHAPE_GEO[P.shape] : GEO.box;
  if (g.geometry !== geo) { g.geometry = geo; g.children[0].geometry = edgesOf(geo); }
  if (P.shape) applyRot(g, r); else g.rotation.set(0, t === 'tesla' ? (r % 4) * HALF_PI : 0, 0);
}
function refreshGhost() { if (garage.last) updateGhost(garage.last.x, garage.last.y); }
function gPaintAt(b) {
  if (isShape(b.t) && !tierOpen(garage.tier)) { toast(TIERS[garage.tier].lvl > level() ? `${TIERS[garage.tier].name} armor unlocks at pilot level ${TIERS[garage.tier].lvl}.` : `T${garage.tier} armor: unlock it in the Tech Tree.`); return; }
  const ks = [ckey(b.x, b.y, b.z)]; if (garage.mirror && mirOff(b)) { const m = mirPos(b); ks.push(ckey(m.x, m.y, m.z)); }
  const changes = []; let delta = 0;
  for (const k of ks) {
    const o = garage.blocks.get(k); if (!o) continue;
    const n = { x: o.x, y: o.y, z: o.z, t: o.t, c: garage.color, r: o.r }; if (isShape(o.t)) { n.k = garage.tier; if (garage.mat !== 'std') n.m = garage.mat; }
    delta += partCpu(n) - partCpu(o); changes.push([k, n]);
  }
  if (usedCpu() + delta > ownCpuMax()) { toast(`That upgrade needs ${delta} more CPU than you have left.`); return; }
  pushUndo(); for (const [k, n] of changes) { gRemove(k); gAdd(n); } onDesignChanged(); SFX.paint();
}
function setGhostColor(c) { for (const g of [garage.ghost, garage.mirrorGhost]) { g.material.color.setHex(c); g.children[0].material.color.setHex(c); } }
// shift+drag: keep placing wherever the cursor lands (one undo step for the whole row)
function rowPlace(cx, cy) {
  const pk = gPick(cx, cy); if (!pk) return; const k = ckey(pk.place.x, pk.place.y, pk.place.z); if (gDrag.last === k) return; gDrag.last = k;
  const plan = placementPlan(pk.place); if (!plan.ok) return;
  if (!gDrag.rowUndo) { pushUndo(); gDrag.rowUndo = true; }
  for (const b of plan.list) gAdd(b); onDesignChanged(); SFX.click(); updateGhost(cx, cy);
}
function gClickPlace(cx, cy) {
  const pk = gPick(cx, cy); if (!pk) return;
  if (garageToolClick(pk)) return;
  if (garage.erase) { if (pk.block) gEraseAt(pk.block); return; }
  if (garage.paint) { if (pk.block) { gPaintAt(pk.block); updateGhost(cx, cy); } return; }
  const plan = placementPlan(pk.place);
  if (!plan.ok) { toast(plan.why); SFX.error(); return; }
  pushUndo(); for (const b of plan.list) gAdd(b); onDesignChanged(); SFX.click(); updateGhost(cx, cy);
}
function gEraseAt(b) {
  pushUndo(); const ks = [ckey(b.x, b.y, b.z)];
  if (garage.mirror && mirOff(b)) { const m = mirPos(b); ks.push(ckey(m.x, m.y, m.z)); }
  for (const k of ks) gRemove(k); onDesignChanged(); SFX.pop();
}
function gRightClick(cx, cy) { const pk = gPick(cx, cy); if (pk && pk.block) { gEraseAt(pk.block); updateGhost(cx, cy); } }
function connectivity(list) {
  const map = new Map(); for (const b of list) map.set(ckey(b.x, b.y, b.z), b);
  const seat = list.find(b => b.t === 'seat'); const seen = new Set();
  if (seat) {
    const q = [seat]; seen.add(ckey(seat.x, seat.y, seat.z));
    while (q.length) { const b = q.pop(); for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const k = ckey(b.x + dx, b.y + dy, b.z + dz); if (map.has(k) && !seen.has(k)) { seen.add(k); q.push(map.get(k)); } } }
  }
  return list.filter(b => !seen.has(ckey(b.x, b.y, b.z)));
}
function validateDesign() {
  const list = [...garage.blocks.values()];
  const issue = designIssue(gSerialize(), level(), true); if (issue) return { ok: false, msg: issue };
  const lockedPart = list.find(b => partLocked(b.t)); if (lockedPart) return { ok: false, msg: `${PARTS[lockedPart.t].name} needs an achievement you have not earned yet.` };
  const loose = connectivity(list);
  if (loose.length) { markBlocks(loose); return { ok: false, msg: `${loose.length} block${loose.length > 1 ? 's are' : ' is'} not connected to the Pilot Seat. They are outlined in red.` }; }
  return { ok: true };
}
function markBlocks(list) {
  for (const m of garage.marks) garage.scene.remove(m); garage.marks = [];
  const mat = new T.LineBasicMaterial({ color: 0xff3a2a }); const geo = new T.EdgesGeometry(new T.BoxGeometry(1.1, 1.1, 1.1));
  for (const b of list) { const l = new T.LineSegments(geo, mat); l.position.set(b.x, b.y, b.z); garage.scene.add(l); garage.marks.push(l); }
  setTimeout(() => { for (const m of garage.marks) garage.scene.remove(m); garage.marks = []; }, 4000);
}
function updateGarageCamera(dt) {
  smoothGarageCamera(dt); const o = garage.cam;
  camera.position.set(o.tx + o.r * Math.sin(o.phi) * Math.sin(o.theta), o.ty + o.r * Math.cos(o.phi), o.tz + o.r * Math.sin(o.phi) * Math.cos(o.theta));
  camera.lookAt(o.tx, o.ty, o.tz);
}

// ---------- Garage UI ----------
function buildTiersUI() {
  const el = $('#tiers'); el.innerHTML = '';
  if (!tierOpen(garage.tier)) garage.tier = ownMaxTier();
  for (let k = 1; k < TIERS.length; k++) {
    const TI = TIERS[k], locked = !tierOpen(k);
    const b = document.createElement('button'); b.className = 'tier' + (garage.tier === k ? ' sel' : '') + (locked ? ' locked' : ''); b.id = 'tier' + k;
    b.title = `${TI.name}: ${TI.hp} HP and ${TI.cpu} CPU per cube` + (locked ? `. Unlocks at pilot level ${TI.lvl}.` : '');
    b.innerHTML = `<img alt="" src="${TIER_ICONS[k] || BLANK}"><span>T${k}</span>`;
    b.onclick = () => { if (locked) { toast(TI.lvl > level() ? `${TI.name} armor unlocks at pilot level ${TI.lvl}.` : `T${k} ${TI.name} armor: unlock it in the Tech Tree.`); return; } garage.tier = k; buildPartsUI(); refreshGhost(); };
    el.appendChild(b);
  }
  $('#tierName').textContent = TIERS[garage.tier].name;
  // material picker
  const mel = $('#mats'); if (mel) { mel.innerHTML = '';
    if (!MATERIALS[garage.mat] || !matOpen(garage.mat)) garage.mat = 'std';
    for (const id of MAT_CODES) { const M0 = MATERIALS[id], locked = !matOpen(id); const b = document.createElement('button'); b.className = 'mat' + (garage.mat === id ? ' sel' : '') + (locked ? ' locked' : ''); b.textContent = M0.name.split(' ')[0]; b.title = `${M0.name}: ${M0.desc} Health ×${M0.hp}, mass ×${M0.mass}, CPU ×${M0.cpu}.` + (locked ? (M0.lvl > level() ? ` Unlocks at pilot level ${M0.lvl}.` : ' Unlock it in the Tech Tree.') : ''); b.onclick = () => { if (locked) { toast(`${M0.name} unlocks at pilot level ${M0.lvl}.`); return; } garage.mat = id; buildTiersUI(); refreshGhost(); SFX.ui(); }; mel.appendChild(b); }
    $('#matName').textContent = MATERIALS[garage.mat].name; }
}
function buildPartsUI() {
  buildTiersUI(); buildRecent();
  const el = $('#partsList'); el.innerHTML = ''; let cat = '';
  for (const id of PART_ORDER) {
    const p = PARTS[id];
    if (p.cat !== cat) { cat = p.cat; const c = document.createElement('div'); c.className = 'cat'; c.textContent = cat; el.appendChild(c); }
    const achLock = partLocked(id), techLock = !achLock && p.lvl <= level() && !techHas(id), locked = p.lvl > level() || achLock || techLock;
    const btn = document.createElement('button');
    btn.className = 'part' + (garage.tool === id ? ' sel' : '') + (locked ? ' locked' : '');
    btn.id = 'part-' + id; btn.title = p.desc;
    btn.innerHTML = `<img alt="" src="${ICONS[id] || BLANK}"><span class="pn"></span><span class="pc num"></span>`;
    btn.querySelector('.pn').textContent = p.name;
    btn.querySelector('.pc').textContent = achLock ? '🔒' : techLock ? '★ ' + (TECH[id] ? TECH[id].cost : '') : locked ? 'Lv ' + p.lvl : (p.shape ? TIERS[garage.tier].cpu : p.cpu) + ' CPU';
    btn.onclick = () => { if (achLock) { toast(`${p.name}: unlock it with ${unlockName(p.ach)}.`); return; } if (techLock) { toast(`${p.name}: unlock it in the Tech Tree.`); showTechTree('garage'); TT.sel = id; techRender(); return; } if (locked) { toast(`${p.name} unlocks at pilot level ${p.lvl}.`); return; } selectTool(id); };
    el.appendChild(btn);
  }
  showPartDesc();
}
function showPartDesc() {
  const p = PARTS[garage.tool], TI = TIERS[garage.tier];
  $('#partDesc').textContent = p.shape ? `${p.desc} In ${TI.name}: ${partHp({ t: garage.tool, k: garage.tier })} HP, ${TI.cpu} CPU.` : p.desc;
}
function selectTool(id) {
  if (garage.tool !== id) noteRecent(id);
  garage.tool = id; garage.erase = garage.paint = false; garage.tool2 = null; syncToolButtons(); refreshGhost();
  document.querySelectorAll('.part').forEach(b => b.classList.toggle('sel', b.id === 'part-' + id));
  showPartDesc();
}
function buildSwatches() {
  const el = $('#swatches'); el.innerHTML = '';
  COLORS.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'sw' + (i === garage.color ? ' sel' : ''); b.id = 'sw' + i;
    b.style.background = '#' + c.toString(16).padStart(6, '0'); b.title = 'Paint color';
    b.onclick = () => { garage.color = i; document.querySelectorAll('.sw').forEach(s => s.classList.toggle('sel', s === b)); };
    el.appendChild(b);
  });
}
function syncToolButtons() {
  if ($('#btnPlace')) $('#btnPlace').classList.toggle('on', !garage.erase && !garage.paint && !garage.tool2);
  if ((garage.erase || garage.paint) && garage.tool2) garage.tool2 = null;
  for (const [id, k] of [['#btnFill', 'fill'], ['#btnPick', 'pick'], ['#btnSel', 'select']]) { const el = $(id); if (el) el.classList.toggle('on', garage.tool2 === k); }
  if ($('#selBar')) { $('#selBar').hidden = garage.tool2 !== 'select'; if (garage.tool2 !== 'select' && garage.sel && garage.sel.size) selClear(); }
  $('#btnMirror').classList.toggle('on', garage.mirror); $('#btnMirror span').textContent = garage.mirror ? (garage.mirAxis === 'z' ? 'Front/back' : 'Mirror') : 'No mirror'; $('#btnMirror i').textContent = garage.mirror ? (garage.mirAxis === 'z' ? '⇅' : '⇆') : '⇹';
  $('#btnErase').classList.toggle('on', garage.erase);
  $('#btnPaint').classList.toggle('on', garage.paint);
  const rotatable = isShape(garage.tool) || garage.tool === 'tesla';
  $('#btnRot').disabled = !rotatable; $('#btnTilt').disabled = $('#btnRoll').disabled = !isShape(garage.tool);
}
function updateStats() {
  const list = [...garage.blocks.values()]; const s = computeStats(list); const mob = mobility(s); const cm = ownCpuMax();
  $('#cpuVal').textContent = `${s.cpu} / ${cm}`;
  $('#cpuBar').classList.toggle('over', s.cpu > cm);
  $('#cpuBar i').style.width = Math.min(100, s.cpu / cm * 100) + '%';
  const lv = level(); $('#lvVal').textContent = lv;
  const a = xpForLevel(lv), b = xpForLevel(lv + 1);
  $('#xpBar i').style.width = (lv >= 10 ? 100 : (progress.xp - a) / (b - a) * 100) + '%';
  $('#xpBar').title = lv >= 10 ? 'Max level' : `${progress.xp - a} / ${b - a} XP to level ${lv + 1}`;
  $('#stBlocks').textContent = s.count;
  { const [sz, bal] = balanceText(); $('#stSize').textContent = sz; $('#stBal').textContent = bal; $('#stBal').style.color = bal.startsWith('Leans') ? 'var(--warn)' : ''; }
  $('#stMass').textContent = Math.round(s.mass);
  $('#stHp').textContent = s.hp.toLocaleString();
  $('#stSpeed').textContent = list.length ? fmtSpeed(mob.maxSpeed) : '—';
  const ts = tierScale(level());
  $('#stDps').textContent = Math.round(firepower(s.weapons) * ts) + ' dps';
  $('#rowMelee').hidden = !s.teslas; $('#stMelee').textContent = Math.round(s.teslas * TESLA_DPS * ts) + ' dps';
  $('#stTier').textContent = 'Mk ' + TIER_NAMES[level() - 1];
  $('#stWins').textContent = `${progress.wins} / ${progress.matches}`;
  const w = [];
  if (!list.length) w.push(['bad', 'Empty bot. Start with a Pilot Seat.']);
  else {
    if (s.seat !== 1) w.push(['bad', 'Needs a Pilot Seat.']);
    if (!hasWeapon(s)) w.push(['bad', 'No weapons.']);
    if (!s.wheels && !s.treads && !s.legs && !s.skis && !s.insects && !s.sprints && !s.hovers && !s.jets && !s.rotors && !(s.wings && (s.thrusters || s.props))) w.push(['bad', 'Cannot move. Add wheels, treads, legs, hover pads, rotors or wings and thrusters.']);
    else if (s.wings && mob.mode !== 'plane' && !s.rotors && !s.hovers) w.push(['', s.thrusters ? 'Not enough wings or thrusters to fly. Add more.' : 'Wings need thrusters to fly.']);
    else if (mob.mode === 'plane') w.push(['ok', `Plane: needs about ${fmtSpeed(18)} to stay airborne. Top speed ${fmtSpeed(mob.maxSpeed)}.`]);
    else if ((mob.mode === 'wheel' || mob.mode === 'tread' || mob.mode === 'leg') && mob.f < .7) w.push(['', 'Heavy for its wheels or treads. Add more to go faster.']);
    else if (mob.mode === 'none' && s.rotors) w.push(['', 'Too heavy to fly. Add rotors.']);
    else if (mob.mode === 'none' && s.hovers) w.push(['', 'Too heavy to hover. Add pads.']);
    else if (mob.mode === 'rotor') w.push(['ok', `Flyer: climbs to about ${Math.round(mob.maxAlt)} m.`]);
    if (s.cpu > cm) w.push(['bad', 'Over CPU budget.']);
    else { const iss = designIssue(gSerialize(), level(), true); if (iss && /level|Tech Tree/.test(iss)) w.push(['bad', iss]); }
    const loose = connectivity(list).length; if (loose && s.seat) w.push(['bad', `${loose} loose block${loose > 1 ? 's' : ''} not touching the bot.`]);
    if (!w.length) w.push(['ok', 'Battle ready.']);
  }
  $('#warns').innerHTML = ''; for (const [c, t] of w) { const d = document.createElement('div'); d.className = c; d.textContent = t; $('#warns').appendChild(d); }
}
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

// garage input
const gPtrs = new Map(); let gDrag = null, pinch = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  SFX.init();
  if (state !== 'garage') return;
  gPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (gPtrs.size === 2) { const [a, b] = [...gPtrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: garage.orbit.r }; if (gDrag) gDrag.moved = true; return; }
  gDrag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, b: e.button, moved: false, touch: e.pointerType === 'touch' }; garage.mods = { alt: e.altKey, shift: e.shiftKey };
  if (e.shiftKey && e.button === 0 && !garage.erase && !garage.paint && !garage.tool2 && !PHOTO.on) { gDrag.row = true; gDrag.moved = true; gDrag.rowUndo = false; rowPlace(e.clientX, e.clientY); }
});
canvas.addEventListener('pointermove', e => {
  if (state !== 'garage') return;
  if (gPtrs.has(e.pointerId)) gPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && gPtrs.size === 2) { const [a, b] = [...gPtrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); garage.orbit.r = clamp(pinch.r * pinch.d / Math.max(20, d), 7, 45); return; }
  if (gDrag) {
    if (gDrag.row) { rowPlace(e.clientX, e.clientY); return; }
    if (Math.hypot(e.clientX - gDrag.x, e.clientY - gDrag.y) > 6) gDrag.moved = true;
    if (gDrag.moved && (gDrag.b === 2 || gDrag.b === 1)) { garagePan(e.clientX - gDrag.lx, e.clientY - gDrag.ly); gDrag.lx = e.clientX; gDrag.ly = e.clientY; garage.ghost.visible = garage.mirrorGhost.visible = false; return; }
    if (gDrag.moved) {
      garage.orbit.theta -= (e.clientX - gDrag.lx) * .008;
      garage.orbit.phi = clamp(garage.orbit.phi - (e.clientY - gDrag.ly) * .008, .05, 1.52);
      garage.ghost.visible = garage.mirrorGhost.visible = false;
    }
    gDrag.lx = e.clientX; gDrag.ly = e.clientY;
    if (gDrag.moved) return;
  }
  if (e.pointerType !== 'touch') { garage.last = { x: e.clientX, y: e.clientY }; updateGhost(e.clientX, e.clientY); }
});
const endPtr = e => {
  if (state !== 'garage') return;
  gPtrs.delete(e.pointerId);
  if (gPtrs.size < 2) pinch = null;
  if (gDrag && gPtrs.size === 0) {
    if (!gDrag.moved && e.type === 'pointerup') { if (gDrag.b === 2) gRightClick(e.clientX, e.clientY); else if (gDrag.b === 0) gClickPlace(e.clientX, e.clientY); }
    gDrag = null;
  }
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', () => { if (state === 'garage' && !gDrag) { garage.ghost.visible = garage.mirrorGhost.visible = false; } });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (state === 'garage') { garage.orbit.r = clamp(garage.orbit.r * (1 + Math.sign(e.deltaY) * .08), 7, 45); }
  else if (state === 'battle' && match && match.player && !paused) { cycleWeapon(Math.sign(e.deltaY)); }
}, { passive: false });

const bumpRot = (shift) => { const v = ((garage.rot >> shift) + 1) & 3; garage.rot = (garage.rot & ~(3 << shift)) | (v << shift); syncToolButtons(); refreshGhost(); };
$('#btnRot').onclick = () => bumpRot(0);
$('#btnTilt').onclick = () => bumpRot(2);
$('#btnRoll').onclick = () => bumpRot(4);
$('#btnPaint').onclick = () => { garage.paint = !garage.paint; if (garage.paint) garage.erase = false; syncToolButtons(); refreshGhost(); };
// Mirror cycles: left/right, front/back, off
$('#btnMirror').onclick = () => { if (!garage.mirror) { garage.mirror = true; garage.mirAxis = 'x'; } else if (garage.mirAxis !== 'z') garage.mirAxis = 'z'; else garage.mirror = false; syncToolButtons(); refreshGhost(); toast(garage.mirror ? (garage.mirAxis === 'z' ? 'Mirror: front and back' : 'Mirror: left and right') : 'Mirror off'); };
$('#btnErase').onclick = () => { garage.erase = !garage.erase; if (garage.erase) garage.paint = false; syncToolButtons(); refreshGhost(); };
$('#btnUndo').onclick = doUndo;
let clearArm = 0;
$('#btnClear').onclick = () => {
  if (Date.now() - clearArm > 2500) { clearArm = Date.now(); $('#btnClear').textContent = 'Confirm clear'; $('#btnClear').classList.add('on'); setTimeout(() => { $('#btnClear').textContent = 'Clear'; $('#btnClear').classList.remove('on'); }, 2500); return; }
  clearArm = 0; pushUndo(); gClear(); onDesignChanged(); $('#btnClear').textContent = 'Clear'; $('#btnClear').classList.remove('on'); toast('Cleared. Undo brings it back.');
};
$('#btnStarter').onclick = () => { pushUndo(); gLoad(presetStarter()); toast('Starter Rig loaded.'); };
$('#btnBattle').onclick = () => { SFX.init(); SFX.ui(); showSetup(); };
$('#btnTest').onclick = () => { SFX.init(); startBattle({ mode: 'test' }); };
$('#btnMenu').onclick = () => { SFX.ui(); toMenu(); };
// ---------- garage bays ----------
function buildBaysUI() {
  const el = $('#bayTabs'); el.innerHTML = '';
  for (let i = 0; i < BAY_COUNT; i++) {
    const b = document.createElement('button'); b.textContent = i + 1; b.id = 'bay' + i;
    b.className = (i === bayIdx ? 'sel' : '') + (bays[i] && bays[i].blocks.length ? '' : ' empty');
    b.title = bays[i] && bays[i].blocks.length ? bays[i].name : 'Empty bay';
    b.onclick = () => switchBay(i); el.appendChild(b);
  }
  $('#botName').value = design.name || 'Bay ' + (bayIdx + 1);
}
function switchBay(i) {
  if (i === bayIdx) return;
  saveBays(); bayIdx = i; store.set('sfa.bay', i); cloudDirty();
  design = bays[i] || { name: 'Bay ' + (i + 1), v: 3, blocks: [] };
  garage.undo = []; gLoad(design); buildBaysUI(); buildFinishUI(); SFX.ui();
  if (!design.blocks.length) toast('Empty bay. Start with a Pilot Seat, or press Starter.');
}
$('#botName').addEventListener('change', () => { design.name = $('#botName').value.trim().slice(0, 20) || 'Bay ' + (bayIdx + 1); $('#botName').value = design.name; saveBays(); buildBaysUI(); });
$('#botName').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });


// ---------- paint finish (whole bot) ----------
function buildFinishUI() {
  const sel = $('#finishSel'); if (!sel) return;
  sel.innerHTML = '';
  for (const f of FINISHES) { const o = document.createElement('option'); o.value = f.id; const al = finishLocked(f); o.textContent = al ? `${f.name} (${/^bp_/.test(f.ach) ? 'battle pass' : 'achievement'})` : f.lvl > level() ? `${f.name} (Lv ${f.lvl})` : f.name; o.disabled = f.lvl > level() || al; sel.appendChild(o); }
  sel.value = design.f || 'standard';
}
$('#finishSel').onchange = () => {
  const f = FINISHES.find(x => x.id === $('#finishSel').value); if (!f || f.lvl > level() || finishLocked(f)) return;
  pushUndo(); design.f = f.id; const d = gSerialize(); d.f = f.id; gLoad(d); SFX.click();
};
