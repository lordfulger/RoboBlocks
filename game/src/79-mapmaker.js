// ================= MAP MAKER =================
// A custom map is a stock land map (its sky, ground, foliage and sounds) with your own terrain settings and
// placed objects: hills and craters shape the ground; mesas, boulders, towers and walls block movement and shots.
// Positions are stored relative to the map (-1..1), so a map works at every map size. Custom maps are registered
// as extra MAPS entries ('c_' + a hash of the map), saved in this browser, shared as a text code, and sent with
// the game info in custom online games so every pilot builds the same map.
const CM_BASES = ['dust', 'frost', 'ash', 'city', 'moon'];
const CM_TOOLS = { hill: 'Hill', crater: 'Crater', mesa: 'Mesa', rock: 'Boulder', tower: 'Tower', wall: 'Wall', erase: 'Erase' };
const CM_MAX_PROPS = 150;
let CMAPS = store.get('sfa.cmaps', []); if (!Array.isArray(CMAPS)) CMAPS = [];
const cmHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
function cmapClean(d) {
  if (!d || typeof d !== 'object' || !CM_BASES.includes(d.base)) return null;
  const num = (v, lo, hi, def) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  const B = MAPS[d.base], r3 = v => Math.round(v * 1000) / 1000;
  const props = (Array.isArray(d.props) ? d.props : []).slice(0, CM_MAX_PROPS).filter(p => Array.isArray(p) && CM_TOOLS[p[0]] && p[0] !== 'erase')
    .map(p => p[0] === 'wall' ? ['wall', r3(num(p[1], -1, 1, 0)), r3(num(p[2], -1, 1, 0)), r3(num(p[3], -1, 1, 0)), r3(num(p[4], -1, 1, 0))] : [p[0], r3(num(p[1], -1, 1, 0)), r3(num(p[2], -1, 1, 0)), r3(num(p[3], .5, 2.5, 1))]);
  const c = { v: 1, base: d.base, name: String(d.name || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24) || 'Custom map', seed: num(d.seed, 1, 99999, B.seed) | 0,
    amp: num(d.amp, 0, 30, B.amp), mesas: num(d.mesas, 0, 60, B.mesas) | 0, rocks: num(d.rocks, 0, 400, B.rocks) | 0, fol: num(d.fol, 0, 2.5, 1),
    liq: B.liquid ? (d.liq === 'none' ? 'none' : 'base') : 'none', tod: (MAP_TOD[d.base] || []).includes(d.tod) ? d.tod : '', props };
  c.id = 'c_' + cmHash(JSON.stringify(c)).slice(0, 8);
  return c;
}
// make a custom map playable: returns its map id
function cmapRegister(d) {
  const c = cmapClean(d); if (!c) return null;
  if (MAPS[c.id] && MAPS[c.id].custom) return c.id;
  const B = MAPS[c.base];
  MAPS[c.id] = { ...B, name: c.name, blurb: `Custom map on ${B.name}${c.props.length ? `, ${c.props.length} objects` : ''}.`, seed: c.seed, amp: c.amp, mesas: c.mesas, rocks: c.rocks,
    foliage: c.fol, liquid: c.liq === 'none' ? null : B.liquid, base: c.base, custom: c };
  MAP_TOD[c.id] = c.tod ? [c.tod] : MAP_TOD[c.base];
  return c.id;
}
for (const e of CMAPS) if (e && e.def) cmapRegister(e.def);
const cmapIds = () => CMAPS.map(e => e && e.def ? cmapRegister(e.def) : null).filter(Boolean);
function cmapSaveAll() { store.set('sfa.cmaps', CMAPS.slice(0, 40)); }
// share codes: RBMAP1:<base64 of the JSON>
const cmapCode = d => 'RBMAP1:' + btoa(unescape(encodeURIComponent(JSON.stringify(cmapClean(d)))));
function cmapFromCode(s) { const m = /RBMAP1:([A-Za-z0-9+/=]+)/.exec(String(s || '')); if (!m) return null; try { return cmapClean(JSON.parse(decodeURIComponent(escape(atob(m[1]))))); } catch (e) { return null; } }

// ---------- what the props do to the world (used by buildHeights and setupArena) ----------
// world units per map unit: props scale with the map size
function cmapTerrain(M, half) {
  const c = M.custom; if (!c) return null; const u = half / 430, out = [];
  for (const p of c.props) {
    if (p[0] === 'hill') out.push({ x: p[1] * half, z: p[2] * half, r: 30 * p[3] * u, h: 13 * p[3] });
    else if (p[0] === 'crater') out.push({ x: p[1] * half, z: p[2] * half, r: 22 * p[3] * u, h: -9 * p[3], rim: 2.5 * p[3] });
  }
  return out.length ? out : null;
}
function cmapHeight(list, x, z) {
  let h = 0;
  for (const t of list) {
    const dx = x - t.x, dz = z - t.z, d2 = dx * dx + dz * dz, r2 = t.r * t.r; if (d2 > r2 * 4) continue;
    h += t.h * Math.exp(-d2 / (r2 * .45));
    if (t.rim) { const d = Math.sqrt(d2) / t.r; h += t.rim * Math.exp(-((d - 1.05) ** 2) / .06); }
  }
  return h;
}
function cmapBuildProps(s, M, rockMat, MESAS, BOULDERS, clearOf, groundMin) {
  const c = M.custom; if (!c) return; const half = world.half, u = half / 430;
  const conc = new T.MeshStandardMaterial({ color: 0x8c9196, roughness: .82, metalness: .15 }), trim = new T.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a1a, emissiveIntensity: .6, roughness: .5 });
  const own = m => { m.castShadow = m.receiveShadow = true; m.userData.own = true; s.add(m); return m; };
  c.props.forEach((p, i) => {
    if (p[0] === 'wall') {
      const x1 = p[1] * half, z1 = p[2] * half, x2 = p[3] * half, z2 = p[4] * half, L = Math.hypot(x2 - x1, z2 - z1); if (L < 3) return;
      const n = Math.max(1, Math.ceil(L / 2.5)), H = 7;
      for (let k = 0; k <= n; k++) { const x = x1 + (x2 - x1) * k / n, z = z1 + (z2 - z1) * k / n; if (!clearOf(x, z, 1)) continue; addObstacle({ x, z, r: 1.6, cr: 1.5, top: bedH(x, z) + H }); }
      // drawn as panels that follow the ground
      const segs = Math.max(1, Math.ceil(L / 12));
      for (let k = 0; k < segs; k++) {
        const ax = x1 + (x2 - x1) * k / segs, az = z1 + (z2 - z1) * k / segs, bx = x1 + (x2 - x1) * (k + 1) / segs, bz = z1 + (z2 - z1) * (k + 1) / segs, mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (!clearOf(mx, mz, 1)) continue;
        const sl = Math.hypot(bx - ax, bz - az), gy = Math.min(bedH(ax, az), bedH(bx, bz), bedH(mx, mz));
        const w = own(new T.Mesh(new T.BoxGeometry(2, H + 2, sl + .3), conc)); w.position.set(mx, gy + H / 2 - 1, mz); w.rotation.y = Math.atan2(bx - ax, bz - az);
        const t = own(new T.Mesh(new T.BoxGeometry(2.2, .35, sl + .3), trim)); t.position.set(mx, gy + H + .9, mz); t.rotation.y = w.rotation.y;
      }
      return;
    }
    const x = p[1] * half, z = p[2] * half, sc = p[3];
    if (p[0] === 'mesa') { const r = 13 * sc * u, h = 16 * sc; if (!clearOf(x, z, r)) return; const gy = groundMin(x, z, r); const m = own(new T.Mesh(MESAS[i % MESAS.length], rockMat[i % 2])); m.scale.set(r, h, r * .9); m.position.set(x, gy + h / 2 - 1, z); m.rotation.y = i * 1.7; addObstacle({ x, z, r, cr: r * .92, top: gy + h - 1 }); }
    else if (p[0] === 'rock') { const r = 5 * sc, h = 4.5 * sc; if (!clearOf(x, z, 0)) return; const gy = groundMin(x, z, r); const m = own(new T.Mesh(BOULDERS[i % BOULDERS.length], rockMat[i % 2])); m.scale.set(r, h, r); m.position.set(x, gy + h * .25, z); m.rotation.y = i * 2.3; addObstacle({ x, z, r, cr: r * .85, top: gy + h * 1.2 }); }
    else if (p[0] === 'tower') {
      const r = 4 * sc, h = 20 * sc; if (!clearOf(x, z, r)) return; const gy = groundMin(x, z, r);
      own(new T.Mesh(new T.CylinderGeometry(r * .8, r, h, 10), conc)).position.set(x, gy + h / 2 - 1, z);
      own(new T.Mesh(new T.CylinderGeometry(r * 1.15, r * 1.15, 1.2, 10), conc)).position.set(x, gy + h - .4, z);
      own(new T.Mesh(new T.CylinderGeometry(r * 1.17, r * 1.17, .3, 10), trim)).position.set(x, gy + h * .62, z);
      addObstacle({ x, z, r, cr: r * .95, top: gy + h });
    }
  });
}

// ---------- the editor ----------
const MM = { d: null, key: null, tool: 'hill', size: 1, drag: null, grid: null, gridFor: '', hover: null };
const cmNew = base => ({ base: base || 'dust', name: 'My map', seed: 1 + (Math.random() * 99998 | 0), amp: MAPS[base || 'dust'].amp, mesas: Math.round(MAPS[base || 'dust'].mesas / 2), rocks: Math.round(MAPS[base || 'dust'].rocks / 2), fol: 1, liq: 'base', tod: '', props: [] });
function showMapMaker() {
  hideOverlay();
  let el = $('#mapMaker');
  if (!el) {
    el = document.createElement('div'); el.id = 'mapMaker'; el.hidden = true;
    el.innerHTML = `<div class="mm-view"><canvas id="mmCanvas"></canvas><div class="mm-tools" id="mmTools"></div><div class="mm-hint" id="mmHint"></div></div>
      <div class="mm-side panel"><div class="tt-head"><b>MAP MAKER</b><button id="mmClose" title="Close">✕</button></div><div id="mmSide"></div></div>`;
    document.body.appendChild(el);
    const cv = el.querySelector('#mmCanvas');
    const toMap = e => { const r = cv.getBoundingClientRect(), s = Math.min(r.width, r.height), ox = (r.width - s) / 2, oy = (r.height - s) / 2; return [clamp(((e.clientX - r.left - ox) / s) * 2 - 1, -1, 1), clamp(((e.clientY - r.top - oy) / s) * 2 - 1, -1, 1)]; };
    cv.addEventListener('pointerdown', e => { if (!MM.d) return; const [x, z] = toMap(e); cv.setPointerCapture(e.pointerId); MM.drag = { x, z, x2: x, z2: z }; if (MM.tool !== 'wall') { mmApply(x, z); MM.drag = MM.tool === 'erase' ? MM.drag : null; } mmDraw(); });
    cv.addEventListener('pointermove', e => { if (!MM.d) return; const [x, z] = toMap(e); MM.hover = [x, z]; if (MM.drag) { MM.drag.x2 = x; MM.drag.z2 = z; if (MM.tool === 'erase') mmApply(x, z); } mmDraw(); });
    cv.addEventListener('pointerup', () => { if (MM.drag && MM.tool === 'wall') { const D = MM.drag; if (Math.hypot(D.x2 - D.x, D.z2 - D.z) > .02) mmAdd(['wall', D.x, D.z, D.x2, D.z2]); } MM.drag = null; mmDraw(); });
    cv.addEventListener('pointerleave', () => { MM.hover = null; mmDraw(); });
    addEventListener('resize', () => { if (!el.hidden) mmDraw(); });
    el.querySelector('#mmClose').onclick = hideMapMaker;
    addEventListener('keydown', e => { if (el.hidden) return; if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hideMapMaker(); } else if (/^Digit[1-7]$/.test(e.code) && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) { MM.tool = Object.keys(CM_TOOLS)[+e.code.slice(5) - 1]; mmTools(); } }, true);
  }
  el.hidden = false; $('#menu').hidden = true;
  if (!MM.d) mmOpen(CMAPS[0] ? CMAPS[0].key : null);
  mmSide(); mmTools(); mmDraw(); SFX.ui();
}
function hideMapMaker() { const el = $('#mapMaker'); if (el) el.hidden = true; if (state === 'menu') { $('#menu').hidden = false; buildPilotCard(); } }
function mmOpen(key) {
  const e = key && CMAPS.find(x => x.key === key);
  MM.key = e ? e.key : null; MM.d = e ? JSON.parse(JSON.stringify(cmapClean(e.def))) : cmNew('dust'); MM.gridFor = '';
}
function mmAdd(p) { if (MM.d.props.length >= CM_MAX_PROPS) { toast(`A map can hold ${CM_MAX_PROPS} objects.`); return; } MM.d.props.push(p); MM.dirty = true; if (p[0] === 'hill' || p[0] === 'crater') MM.gridFor = ''; mmSideCount(); }
function mmApply(x, z) {
  if (MM.tool === 'erase') {
    let best = -1, bd = .045;
    MM.d.props.forEach((p, i) => { const d = p[0] === 'wall' ? segDist(x, z, p[1], p[2], p[3], p[4]) : Math.hypot(p[1] - x, p[2] - z); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { const p = MM.d.props.splice(best, 1)[0]; MM.dirty = true; if (p[0] === 'hill' || p[0] === 'crater') MM.gridFor = ''; mmSideCount(); }
    return;
  }
  mmAdd([MM.tool, Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000, MM.size]);
}
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
function mmTools() {
  const t = $('#mmTools'); if (!t) return;
  t.innerHTML = Object.entries(CM_TOOLS).map(([k, n], i) => `<button data-t="${k}" class="${MM.tool === k ? 'sel' : ''}" title="${n} (${i + 1})">${n}</button>`).join('') + `<label>Size <input type="range" id="mmSize" min=".5" max="2.5" step=".1" value="${MM.size}"></label>`;
  t.querySelectorAll('button').forEach(b => b.onclick = () => { MM.tool = b.dataset.t; mmTools(); SFX.ui(); });
  $('#mmSize').oninput = e => { MM.size = +e.target.value; };
  $('#mmHint').textContent = { hill: 'Click to raise a hill.', crater: 'Click to dig a crater.', mesa: 'Click to place a rock mesa.', rock: 'Click to place a boulder.', tower: 'Click to place a concrete tower.', wall: 'Drag to build a wall.', erase: 'Click or drag over objects to remove them.' }[MM.tool] + ' Nothing is built on the bases (blue and red) or the capture points (A, B, C).';
}
function mmSideCount() { const c = $('#mmCount'); if (c) c.textContent = `${MM.d.props.length} / ${CM_MAX_PROPS} objects`; }
function mmSide() {
  const d = MM.d, B = MAPS[d.base], el = $('#mmSide'); if (!el) return;
  const rng = (id, label, min, max, step, v) => `<div class="srow"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><span class="num" id="${id}V">${v}</span></div>`;
  el.innerHTML = `<div class="srow"><label for="mmName">Name</label><input id="mmName" maxlength="24" value="${esc(d.name)}"></div>
    <div class="srow"><label for="mmMaps">Saved maps</label><select id="mmMaps"><option value="">New map</option>${CMAPS.map(e => `<option value="${esc(e.key)}"${e.key === MM.key ? ' selected' : ''}>${esc(e.def.name)}</option>`).join('')}</select></div>
    <h3>WORLD</h3><div class="mm-bases">${CM_BASES.map(b => `<button data-b="${b}" class="${b === d.base ? 'sel' : ''}">${esc(MAPS[b].name)}</button>`).join('')}</div>
    <div class="srow"><label for="mmTod">Time of day</label><select id="mmTod"><option value="">Varies</option>${(MAP_TOD[d.base] || []).map(t => `<option${t === d.tod ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
    ${B.liquid ? `<div class="srow"><label for="mmLiq">${B.liquid.type === 'lava' ? 'Lava' : B.liquid.type === 'ice' ? 'Ice' : 'Water'}</label><select id="mmLiq"><option value="base"${d.liq !== 'none' ? ' selected' : ''}>On</option><option value="none"${d.liq === 'none' ? ' selected' : ''}>Off</option></select></div>` : ''}
    <h3>TERRAIN</h3>${rng('mmAmp', 'Hills', 0, 30, 1, d.amp)}${rng('mmMesas', 'Mesas', 0, 60, 1, d.mesas)}${rng('mmRocks', 'Boulders', 0, 400, 5, d.rocks)}${rng('mmFol', 'Plants', 0, 2.5, .1, d.fol)}
    <div class="btns"><button id="mmSeed">New terrain</button><button id="mmClear">Clear objects</button></div><p class="mm-count" id="mmCount"></p>
    <h3>PLAY AND SHARE</h3><div class="btns"><button class="primary" id="mmTest">Test battle</button><button id="mmSave">Save</button><button id="mmShare">Share code</button><button id="mmImport">Import code</button>${MM.key ? '<button id="mmDel">Delete</button>' : ''}</div>
    <p class="tt-tip">Saved maps show up in Battle setup and Host game. In an online custom game everyone gets your map automatically.</p>`;
  for (const id of ['#mmName']) $(id).addEventListener('keydown', e => e.stopPropagation());
  $('#mmName').oninput = e => { d.name = e.target.value; MM.dirty = true; };
  $('#mmMaps').onchange = e => { mmOpen(e.target.value || null); mmSide(); mmDraw(); };
  el.querySelectorAll('.mm-bases button').forEach(b => b.onclick = () => { const nb = b.dataset.b; if (nb === d.base) return; d.base = nb; d.tod = ''; d.liq = 'base'; d.amp = MAPS[nb].amp; MM.gridFor = ''; MM.dirty = true; mmSide(); mmDraw(); });
  $('#mmTod').onchange = e => { d.tod = e.target.value; MM.dirty = true; };
  if ($('#mmLiq')) $('#mmLiq').onchange = e => { d.liq = e.target.value; MM.gridFor = ''; MM.dirty = true; mmDraw(); };
  const slide = (id, key, regrid) => { $('#' + id).oninput = e => { d[key] = +e.target.value; $('#' + id + 'V').textContent = e.target.value; MM.dirty = true; if (regrid) { MM.gridFor = ''; clearTimeout(MM.rt); MM.rt = setTimeout(mmDraw, 120); } }; };
  slide('mmAmp', 'amp', true); slide('mmMesas', 'mesas'); slide('mmRocks', 'rocks'); slide('mmFol', 'fol');
  $('#mmSeed').onclick = () => { d.seed = 1 + (Math.random() * 99998 | 0); MM.gridFor = ''; MM.dirty = true; mmDraw(); };
  $('#mmClear').onclick = e => { if (!armed(e.currentTarget)) return; d.props = []; MM.gridFor = ''; MM.dirty = true; mmSideCount(); mmDraw(); };
  $('#mmSave').onclick = () => { mmSave(); toast(`${d.name} saved.`); mmSide(); };
  $('#mmTest').onclick = () => { const id = mmSave(); if (!id) return; const v = validateDesign(); if (!v.ok) { toast(v.msg); return; } $('#mapMaker').hidden = true; startBattle({ mode: 'tdm', map: id, n: 5, size: 'medium' }); };
  $('#mmShare').onclick = () => { const code = cmapCode(d); replayBox(`<b>Share ${esc(d.name)}</b><p>Send this code to a friend. They paste it into Map Maker, Import code.<input id="mmCode" readonly></p><div class="btns"><button class="primary" id="mmCopy">Copy code</button></div>`); $('#mmCode').value = code; $('#mmCode').onclick = e => e.target.select(); $('#mmCopy').onclick = async () => { try { await navigator.clipboard.writeText(code); $('#mmCopy').textContent = 'Copied'; } catch (e) { $('#mmCode').select(); document.execCommand('copy'); $('#mmCopy').textContent = 'Copied'; } }; };
  $('#mmImport').onclick = () => {
    replayBox(`<b>Import a map</b><p>Paste a map code (it starts with RBMAP1:).<textarea id="mmPaste" rows="4" style="width:100%;margin-top:8px;box-sizing:border-box"></textarea></p><div class="btns"><button class="primary" id="mmDoImport">Import</button></div>`);
    $('#mmPaste').addEventListener('keydown', e => e.stopPropagation());
    $('#mmDoImport').onclick = () => { const c = cmapFromCode($('#mmPaste').value); if (!c) { toast('That is not a map code.'); return; } MM.key = null; MM.d = c; MM.gridFor = ''; mmSave(); $('#shareBox').hidden = true; mmSide(); mmDraw(); toast(`${c.name} imported.`); };
  };
  if ($('#mmDel')) $('#mmDel').onclick = e => { if (!armed(e.currentTarget)) return; CMAPS = CMAPS.filter(x => x.key !== MM.key); cmapSaveAll(); mmOpen(CMAPS[0] ? CMAPS[0].key : null); mmSide(); mmDraw(); };
  mmSideCount();
}
function mmSave() {
  const c = cmapClean(MM.d); if (!c) return null;
  if (!MM.key) { MM.key = 'm' + Date.now().toString(36); CMAPS.unshift({ key: MM.key, def: c }); } else { const e = CMAPS.find(x => x.key === MM.key); if (e) e.def = c; else CMAPS.unshift({ key: MM.key, def: c }); }
  cmapSaveAll(); MM.dirty = false; return cmapRegister(c);
}
// top-down preview: the real height field of the map (medium size), coloured like its ground
function mmGrid() {
  const c = cmapClean(MM.d), sig = JSON.stringify([c.base, c.seed, c.amp, c.liq, c.props.filter(p => p[0] === 'hill' || p[0] === 'crater')]);
  if (MM.gridFor === sig && MM.grid) return MM.grid;
  const B = MAPS[c.base], M = { ...B, seed: c.seed, amp: c.amp, liquid: c.liq === 'none' ? null : B.liquid, custom: c, size: Math.round(B.size * MAP_SIZES.medium.k / 4) * 4 };
  const T0 = buildHeights(M), N = 160, img = new ImageData(N, N), lo = new T.Color(B.ground[0]), hi = new T.Color(B.ground[1]), rk = new T.Color(B.ground[2]), lq = M.liquid ? new T.Color(M.liquid.type === 'lava' ? 0xff5a1a : M.liquid.color || 0x3a6a8a) : null, tc = new T.Color();
  const at = (x, z) => { const fx = clamp((x + T0.half) / T0.cell, 0, T0.R), fz = clamp((z + T0.half) / T0.cell, 0, T0.R); return T0.H[Math.round(fz) * (T0.R + 1) + Math.round(fx)]; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ((i + .5) / N * 2 - 1) * T0.half, z = ((j + .5) / N * 2 - 1) * T0.half, h = at(x, z), sl = Math.abs(at(x + 4, z) - at(x - 4, z)) + Math.abs(at(x, z + 4) - at(x, z - 4));
    tc.copy(lo).lerp(hi, smoothstep(-6, 10, h)).lerp(rk, smoothstep(1.5, 5, sl) * .8);
    if (lq && h < M.liquid.y) tc.copy(lq).multiplyScalar(.75);
    const shade = clamp(1 + (at(x - 4, z - 4) - at(x + 4, z + 4)) * .03, .6, 1.35), k = (j * N + i) * 4;
    img.data[k] = clamp(tc.r * 255 * shade, 0, 255); img.data[k + 1] = clamp(tc.g * 255 * shade, 0, 255); img.data[k + 2] = clamp(tc.b * 255 * shade, 0, 255); img.data[k + 3] = 255;
  }
  const off = document.createElement('canvas'); off.width = off.height = N; off.getContext('2d').putImageData(img, 0, 0);
  MM.grid = { cv: off, half: T0.half, spawnZ: T0.spawnZ }; MM.gridFor = sig; return MM.grid;
}
function mmDraw() {
  const cv = $('#mmCanvas'); if (!cv || !MM.d || $('#mapMaker').hidden) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  const s = Math.min(r.width, r.height), ox = (r.width - s) / 2, oy = (r.height - s) / 2, G = mmGrid(), P = (x, z) => [ox + (x + 1) / 2 * s, oy + (z + 1) / 2 * s], u = 1 / G.half;
  g.imageSmoothingEnabled = true; g.drawImage(G.cv, ox, oy, s, s);
  // edge cliffs, bases and capture points
  const play = (G.half - 55) / G.half; g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([6, 6]); g.strokeRect(...P(-play, -play), play * s, play * s); g.setLineDash([]);
  for (const [sz, col] of [[-G.spawnZ, '#4fa3ff'], [G.spawnZ, '#ff5b4f']]) { const [x, y] = P(0, sz * u); g.beginPath(); g.arc(x, y, 50 * u * s / 2, 0, 7); g.fillStyle = col + '33'; g.fill(); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); }
  for (const cp of capturePoints(G.half)) { const [x, y] = P(cp.x * u, cp.z * u); g.beginPath(); g.arc(x, y, 30 * u * s / 2, 0, 7); g.strokeStyle = 'rgba(255,215,106,.8)'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = '#ffd76a'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText(cp.name, x, y + 4); }
  // objects
  const drawProp = (p, ghost) => {
    g.globalAlpha = ghost ? .55 : 1;
    if (p[0] === 'wall') { const [a, b] = P(p[1], p[2]), [c, d] = P(p[3], p[4]); g.strokeStyle = '#d8dde2'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); g.strokeStyle = '#ffa040'; g.lineWidth = 1.5; g.stroke(); }
    else {
      const [x, y] = P(p[1], p[2]), u0 = G.half / 430, wr = { hill: 30 * u0, crater: 22 * u0, mesa: 13 * u0, rock: 5, tower: 4 }[p[0]] * p[3], rad = wr / G.half * s / 2;
      g.beginPath(); g.arc(x, y, Math.max(3, rad), 0, 7);
      if (p[0] === 'hill') { g.strokeStyle = 'rgba(255,255,255,.7)'; g.setLineDash([3, 3]); g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); }
      else if (p[0] === 'crater') { g.strokeStyle = 'rgba(30,20,10,.8)'; g.setLineDash([3, 3]); g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = p[0] === 'tower' ? '#b8bec4' : p[0] === 'mesa' ? '#8a6f58' : '#9a8a78'; g.fill(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke(); }
    }
    g.globalAlpha = 1;
  };
  for (const p of MM.d.props) drawProp(p);
  if (MM.drag && MM.tool === 'wall') drawProp(['wall', MM.drag.x, MM.drag.z, MM.drag.x2, MM.drag.z2], true);
  else if (MM.hover && MM.tool !== 'erase' && MM.tool !== 'wall') drawProp([MM.tool, MM.hover[0], MM.hover[1], MM.size], true);
  else if (MM.hover && MM.tool === 'erase') { const [x, y] = P(MM.hover[0], MM.hover[1]); g.beginPath(); g.arc(x, y, .045 * s / 2, 0, 7); g.strokeStyle = '#ff6a5a'; g.lineWidth = 2; g.stroke(); }
}
$('#mMaps') && ($('#mMaps').onclick = () => { SFX.init(); SFX.ui(); showMapMaker(); });
Object.assign(window.__sfa, { MM, CMAPS: () => CMAPS, cmapClean, cmapRegister, cmapCode, cmapFromCode, showMapMaker, mmSave, mmDraw });
