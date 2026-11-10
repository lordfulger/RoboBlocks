// ================= GARAGE: PHOTO MODE, WEAK SPOTS =================
const PHOTO = { on: false, snap: false, lights: null };
function photoMode(on) {
  PHOTO.on = on; document.body.classList.toggle('photo', on);
  if (on) {
    if (WEAK.on) weakSpots(false);
    garage.ghost.visible = garage.mirrorGhost.visible = false;
    // studio lights: a warm key and a cool rim behind the bot
    const key = new T.SpotLight(0xffe2c0, 900, 80, .7, .6, 2); key.position.set(10, 14, 12);
    const rim = new T.DirectionalLight(0x7fc8ff, 2.2); rim.position.set(-8, 6, -12);
    PHOTO.lights = [key, rim]; for (const l of PHOTO.lights) garage.scene.add(l);
  } else if (PHOTO.lights) { for (const l of PHOTO.lights) garage.scene.remove(l); PHOTO.lights = null; }
}
function photoTick(dt) { if (PHOTO.on && !gDrag) garage.group.rotation.y += dt * .35; }
function photoAfterRender() {
  if (!PHOTO.snap) return; PHOTO.snap = false;
  let url; try { url = renderer.domElement.toDataURL('image/png'); } catch (e) { toast('Could not capture the picture.'); return; }
  const name = (cleanName(design.name || '') || 'bot').replace(/\s+/g, '-').toLowerCase() + '.png';
  showOverlay(`<h2>${esc(design.name || 'Your bot')}</h2><img id="phImg" alt="" style="width:100%;border:1px solid var(--line)"><div class="btns"><button class="primary" id="phSave">Save picture</button><button id="phBack">Back</button></div>`, true);
  $('#phImg').src = url; $('#phBack').onclick = () => hideOverlay();
  $('#phSave').onclick = async () => {
    try {
      const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      if (dl) { const blob = await (await fetch(url)).blob(); await dl.save({ filename: name, data: blob }); toast('Picture saved.'); return; }
    } catch (e) { if (e && e.code === 'declined') return; }
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
}
$('#btnPhoto').onclick = () => { SFX.ui(); photoMode(true); };
$('#phShot').onclick = () => { PHOTO.snap = true; SFX.ui(); };
$('#phDone').onclick = () => { photoMode(false); SFX.ui(); };
// ---------- weak spots: which blocks hold the most of your bot together ----------
// For every block we count how many others would fall off if it were destroyed. Red blocks are the ones
// to bury in armor; a long red chain is a single point of failure.
const WEAK = { on: false, im: null };
function weakSpots(on) {
  WEAK.on = on; $('#btnWeak').classList.toggle('on', on);
  if (WEAK.im) { garage.group.remove(WEAK.im); WEAK.im.dispose(); WEAK.im = null; }
  if (!on) { $('#weakKey').hidden = true; return; }
  const list = [...garage.blocks.values()], n = list.length; if (!n) { toast('Nothing to check yet.'); WEAK.on = false; $('#btnWeak').classList.remove('on'); return; }
  const im = new T.InstancedMesh(new T.BoxGeometry(1.04, 1.04, 1.04), new T.MeshBasicMaterial({ transparent: true, opacity: .55, depthWrite: false, toneMapped: false }), n);
  im.instanceColor = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const m4 = new T.Matrix4(), col = new T.Color(); let worst = 0;
  const lost = list.map(b => b.t === 'seat' ? n : connectivity(list.filter(x => x !== b)).length);
  list.forEach((b, i) => {
    const f = clamp(lost[i] / Math.max(6, n * .3), 0, 1); worst = Math.max(worst, b.t === 'seat' ? 0 : lost[i]);
    col.setHSL(.33 * (1 - f), .9, .5).multiplyScalar(f > .02 ? 1.4 : .6);
    m4.makeTranslation(b.x, b.y, b.z); im.setMatrixAt(i, m4); im.setColorAt(i, col);
  });
  im.renderOrder = 3; garage.group.add(im); WEAK.im = im;
  $('#weakKey').hidden = false; $('#weakKey').textContent = worst ? `Red blocks hold up to ${worst} others. Armor around them, or add a second path to the seat.` : 'No single block holds anything else up. Sturdy!';
}
$('#btnWeak').onclick = () => { SFX.ui(); weakSpots(!WEAK.on); };
// ---------- fill paint, colour picker, selection ----------
garage.tool2 = null; garage.sel = new Set(); garage.mods = {};
function setTool2(t) {
  garage.tool2 = garage.tool2 === t ? null : t;
  if (garage.tool2) { garage.erase = garage.paint = false; } syncToolButtons();
  if (garage.tool2) toast({ fill: 'Fill: click a block to repaint every touching block of the same color.', pick: 'Picker: click a block to copy its part, color and armor tier.', select: 'Select: click blocks to add or remove them, then move, copy or delete them.' }[garage.tool2]);
}
// returns true when a garage tool used the click
function garageToolClick(pk) {
  const pick = garage.tool2 === 'pick' || garage.mods.alt;
  if (pick && pk.block) {
    const b = pk.block; garage.color = b.c; if (b.k) garage.tier = b.k;
    if (partOpen(b.t)) selectTool(b.t);
    garage.tool2 = null; syncToolButtons(); buildSwatches(); buildPartsUI(); SFX.ui(); toast(`Picked ${PARTS[b.t].name}${b.k ? ' · ' + TIERS[b.k].name : ''}.`); return true;
  }
  if (garage.tool2 === 'fill' && pk.block) { fillPaint(pk.block); return true; }
  if (garage.tool2 === 'select') { if (pk.block) { const k = ckey(pk.block.x, pk.block.y, pk.block.z); if (garage.sel.has(k)) garage.sel.delete(k); else garage.sel.add(k); selDraw(); SFX.click(); } return true; }
  return false;
}
function fillPaint(start) {
  if (isShape(start.t) && !tierOpen(garage.tier)) { toast(TIERS[garage.tier].lvl > level() ? `${TIERS[garage.tier].name} armor unlocks at pilot level ${TIERS[garage.tier].lvl}.` : `T${garage.tier} armor: unlock it in the Tech Tree.`); return; }
  const c0 = start.c, seen = new Set([ckey(start.x, start.y, start.z)]), q = [start], hit = [];
  while (q.length) { const b = q.pop(); hit.push(b); for (const [dx, dy, dz] of NB) { const k = ckey(b.x + dx, b.y + dy, b.z + dz), n = garage.blocks.get(k); if (n && !seen.has(k) && n.c === c0) { seen.add(k); q.push(n); } } }
  pushUndo();
  for (const b of hit) { const k = ckey(b.x, b.y, b.z), n = { x: b.x, y: b.y, z: b.z, t: b.t, c: garage.color, r: b.r }; if (isShape(b.t)) n.k = garage.tier; gRemove(k); gAdd(n); }
  onDesignChanged(); SFX.paint(); toast(`Repainted ${hit.length} block${hit.length === 1 ? '' : 's'}.`);
}
let SELIM = null;
function selDraw() {
  if (SELIM) { garage.group.remove(SELIM); SELIM.dispose(); SELIM = null; }
  for (const k of [...garage.sel]) if (!garage.blocks.has(k)) garage.sel.delete(k);
  $('#selCount').textContent = garage.sel.size ? `${garage.sel.size} selected` : 'Click blocks to select';
  if (!garage.sel.size) return;
  SELIM = new T.InstancedMesh(new T.BoxGeometry(1.06, 1.06, 1.06), new T.MeshBasicMaterial({ color: new T.Color(0x5fe8ff).multiplyScalar(1.3), transparent: true, opacity: .38, depthWrite: false, toneMapped: false }), garage.sel.size);
  let i = 0; const m4 = new T.Matrix4(); for (const k of garage.sel) { const b = garage.blocks.get(k); m4.makeTranslation(b.x, b.y, b.z); SELIM.setMatrixAt(i++, m4); }
  SELIM.renderOrder = 3; garage.group.add(SELIM);
}
function selClear() { garage.sel.clear(); selDraw(); }
function selMove(dx, dy, dz, copy) {
  if (!garage.sel.size) { toast('Select some blocks first.'); return; }
  const list = [...garage.sel].map(k => garage.blocks.get(k));
  let ox = dx, oy = dy, oz = dz;
  if (copy) { // copy next to the selection along the chosen direction
    const span = a => Math.max(...list.map(b => b[a])) - Math.min(...list.map(b => b[a])) + 1;
    ox = dx * span('x'); oy = dy * span('y'); oz = dz * span('z'); if (!ox && !oy && !oz) ox = span('x');
  }
  const moved = list.map(b => ({ ...b, x: b.x + ox, y: b.y + oy, z: b.z + oz }));
  for (const m of moved) { const k = ckey(m.x, m.y, m.z); if (!inBounds(m) || (garage.blocks.has(k) && (copy || !garage.sel.has(k)))) { toast(copy ? 'No room for a copy there.' : 'Something is in the way.'); return; } }
  if (copy && moved.some(m => m.t === 'seat')) { toast('A bot can only have one Pilot Seat. Deselect it to copy.'); return; }
  pushUndo();
  if (!copy) for (const b of list) gRemove(ckey(b.x, b.y, b.z));
  for (const m of moved) { const n = { x: m.x, y: m.y, z: m.z, t: m.t, c: m.c, r: m.r }; if (m.k) n.k = m.k; gAdd(n); }
  garage.sel = new Set(moved.map(m => ckey(m.x, m.y, m.z))); selDraw(); onDesignChanged(); SFX.click();
}
function selDelete() { if (!garage.sel.size) return; pushUndo(); for (const k of garage.sel) gRemove(k); garage.sel.clear(); selDraw(); onDesignChanged(); SFX.pop(); }
$('#btnFill').onclick = () => setTool2('fill'); $('#btnPick').onclick = () => setTool2('pick'); $('#btnSel').onclick = () => setTool2('select');
document.querySelectorAll('#selBar [data-mv]').forEach(b => b.onclick = () => { const [x, y, z] = b.dataset.mv.split(',').map(Number); selMove(x, y, z, garage.selCopy); });
$('#selCopy').onclick = () => { garage.selCopy = !garage.selCopy; $('#selCopy').classList.toggle('on', garage.selCopy); toast(garage.selCopy ? 'Arrows now place a copy next to the selection.' : 'Arrows move the selection.'); };
$('#selDel').onclick = selDelete; $('#selNone').onclick = selClear;
// ---------- share codes: copy a bot as text, paste it anywhere ----------
function shareCode(d) { return 'RB1:' + (cleanName(d.name || '') || 'Bot').replace(/:/g, '') + ':' + encodeDesign(d); }
function parseShareCode(text) {
  const m = String(text || '').trim().match(/^(?:RB1|BC1):([^:]{0,24}):([~A-Za-z0-9_!-]{12,9000})$/); if (!m) return null;
  const d = decodeDesign(m[2]); if (!d.blocks.length) return null; d.name = cleanName(m[1]) || 'Shared bot'; return d;
}
function showShareCode() {
  const code = shareCode(gSerialize());
  showOverlay(`<h2>Share code</h2><p>Copy this code and send it to a friend. They paste it here to load your bot.</p>
    <textarea id="scOut" readonly rows="4" style="width:100%;font:12px monospace"></textarea>
    <div class="btns"><button class="primary" id="scCopy">Copy code</button></div>
    <h3>LOAD A CODE</h3><textarea id="scIn" rows="3" placeholder="Paste an RB1: code" style="width:100%;font:12px monospace"></textarea>
    <p id="scMsg" class="err" hidden></p>
    <div class="btns"><button id="scLoad">Load into this bay</button><button id="ovBack">Back</button></div>`, true);
  $('#scOut').value = code; for (const id of ['#scOut', '#scIn']) $(id).addEventListener('keydown', e => e.stopPropagation());
  $('#scCopy').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Code copied.'); } catch (e) { $('#scOut').select(); document.execCommand && document.execCommand('copy'); toast('Code selected: press Ctrl+C to copy.'); } };
  $('#scLoad').onclick = () => { const d = parseShareCode($('#scIn').value); if (!d) { $('#scMsg').hidden = false; $('#scMsg').textContent = 'That is not a RoboBlocks share code.'; return; } pushUndo(); gLoad(d); design = gSerialize(); saveBays(); buildBaysUI(); updateStats(); hideOverlay(); toast(`${d.name} loaded.`); };
  $('#ovBack').onclick = hideOverlay;
}
$('#btnCode').onclick = () => { SFX.ui(); showShareCode(); };
