// ================= TECH TREE =================
// Parts, armor tiers, materials and CPU upgrades sit on a hex map that grows out from START. A node can be
// unlocked when the node it grows from is unlocked, the pilot level is high enough, and you have the tech
// points. Points come from levelling up (and every 2,000 XP past level 10) and from achievements.
// Pilot level still gates every node, so other players can keep checking bots against the stamped level.
const TECH_START = ['cube', 'wedge', 'slab', 'seat', 'wheel', 'blaster', 'flag', 'T1', 'mat_std'];
const TECH_CPU = 25, TECH_CPU_LV = [2, 4, 5, 6, 8, 9, 10], TECH_CPU_MAX = TECH_CPU * TECH_CPU_LV.length;
const TECH_RANK_XP = 2000;
// upgrades: ranked nodes that improve your own bot (never other players'). Each rank needs a higher pilot level.
const TECH_UP = {
  bal: { name: 'Calibrated Barrels', lv: [3, 6, 9], wps: ['blaster', 'chain', 'rail', 'lancer'], dmg: .04, desc: r => `Blasters, chain guns, rails and Rail Lancers deal ${4 * r}% more damage.` },
  war: { name: 'Shaped Warheads', lv: [3, 6, 9], wps: ['mortar', 'plasma', 'flak', 'mine', 'seeker'], dmg: .04, splash: .04, desc: r => `Mortars, plasma, flak, gravity mines and seekers deal ${4 * r}% more damage over a ${4 * r}% wider blast.` },
  cap: { name: 'Overcharged Capacitors', lv: [4, 7, 10], wps: ['tesla', 'arc'], dmg: .05, desc: r => `Tesla blades and Arc Lances deal ${5 * r}% more damage.` },
  rel: { name: 'Autoloaders', lv: [5, 8], rel: .04, desc: r => `Every gun fires ${4 * r}% faster.` },
  heat: { name: 'Heat Sinks', lv: [4, 7], heat: .12, desc: r => `Rapid-fire guns build up ${12 * r}% less heat.` },
  fuel: { name: 'Fuel Cells', lv: [3, 6], fuel: .15, desc: r => `Jets burn ${15 * r}% less fuel.` },
  mod: { name: 'Module Chargers', lv: [5, 8], mod: .1, desc: r => `Modules recharge ${10 * r}% faster.` },
};
const upKey = id => { const m = /^u_([a-z]+)(\d)$/.exec(id); return m && TECH_UP[m[1]] ? [m[1], +m[2]] : null; };
// lines grow from a parent in a screen direction (x right, y down); see techLayout
const TECH_LINES = [
  { from: 'start', dir: [0, -1], ids: ['T2', 'T3', 'T4', 'cpu1', 'T5', 'T6', 'T7', 'cpu4', 'T8', 'T9', 'T10'] },
  { from: 'T2', dir: [-1, -.25], ids: ['pyr', 'inner', 'cyl'] },
  { from: 'T3', dir: [1, -.25], ids: ['mat_light', 'mat_heavy', 'mat_reactive', 'mat_energy'] },
  { from: 'T4', dir: [-1, -.25], ids: ['round', 'tetra', 'hwedge', 'plate', 'strut'] },
  { from: 'start', dir: [-1, .12], ids: ['hover', 'jet', 'balloon', 'rotor', 'prop', 'cpu2', 'wing', 'thruster'] },
  { from: 'start', dir: [-.55, .85], ids: ['tread', 'ski', 'insect', 'leg', 'sprint'] },
  { from: 'start', dir: [1, .12], ids: ['tesla', 'chain', 'mine', 'arc'] },
  { from: 'tesla', dir: [.8, -.6], ids: ['nano', 'rail', 'cpu3', 'lancer'] },
  { from: 'tesla', dir: [.55, .85], ids: ['mortar', 'plasma', 'flak', 'seeker'] },
  { from: 'start', dir: [.05, 1], ids: ['m_fly', 'm_shield', 'm_power', 'm_cloak', 'm_blink', 'cpu5', 'm_emp', 'm_disrupt'] },
  { from: 'm_shield', dir: [-.8, .6], ids: ['spike', 'shieldp', 'projector'] },
  { from: 'T10', dir: [0, -1], ids: ['cpu7'] },
  { from: 'm_disrupt', dir: [0, 1], ids: ['cpu6'] },
  { from: 'lancer', dir: [.4, -1], ids: ['u_bal1', 'u_bal2', 'u_bal3'] },
  { from: 'seeker', dir: [.6, .8], ids: ['u_war1', 'u_war2', 'u_war3'] },
  { from: 'arc', dir: [1, 0], ids: ['u_cap1', 'u_cap2', 'u_cap3'] },
  { from: 'arc', dir: [1, .6], ids: ['u_rel1', 'u_rel2', 'u_heat1', 'u_heat2'] },
  { from: 'thruster', dir: [-1, 0], ids: ['u_fuel1', 'u_fuel2'] },
  { from: 'm_disrupt', dir: [.8, .6], ids: ['u_mod1', 'u_mod2'] },
];
const TECH = {};
(function techBuild() {
  const kindOf = id => upKey(id) ? 'up' : /^T\d+$/.test(id) ? 'tier' : /^mat_/.test(id) ? 'mat' : /^cpu\d$/.test(id) ? 'cpu' : 'part';
  const lvlOf = id => { const k = kindOf(id); if (k === 'tier') return TIERS[+id.slice(1)].lvl; if (k === 'mat') return MATERIALS[id.slice(4)].lvl; if (k === 'cpu') return TECH_CPU_LV[+id.slice(3) - 1]; if (k === 'up') { const [u, r] = upKey(id); return TECH_UP[u].lv[r - 1]; } return PARTS[id].lvl; };
  // pointy-top hex grid in axial coordinates; pixel units where neighbouring cells are 1 apart
  const px = (q, r) => [q + r / 2, r * .866], NB = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const used = new Map([['0,0', 'start']]); TECH.start = { id: 'start', q: 0, r: 0 };
  for (const L of TECH_LINES) {
    const p0 = TECH[L.from], o = px(p0.q, p0.r), dl = Math.hypot(L.dir[0], L.dir[1]), D = [L.dir[0] / dl, L.dir[1] / dl];
    let parent = L.from;
    L.ids.forEach((id, i) => {
      const pp = TECH[parent], ideal = [o[0] + D[0] * (i + 1), o[1] + D[1] * (i + 1)];
      let best = null, bd = Infinity;
      for (const [dq, dr] of NB) { const q = pp.q + dq, r = pp.r + dr; if (used.has(q + ',' + r)) continue; const [x, y] = px(q, r), d = Math.hypot(x - ideal[0], y - ideal[1]); if (d < bd) { bd = d; best = [q, r]; } }
      if (!best) { for (let rad = 2; rad < 6 && !best; rad++) for (let dq = -rad; dq <= rad; dq++) for (let dr = -rad; dr <= rad; dr++) { const q = pp.q + dq, r = pp.r + dr; if (used.has(q + ',' + r)) continue; const [x, y] = px(q, r), d = Math.hypot(x - ideal[0], y - ideal[1]); if (d < bd) { bd = d; best = [q, r]; } } }
      used.set(best[0] + ',' + best[1], id);
      const kind = kindOf(id), lvl = lvlOf(id);
      TECH[id] = { id, kind, lvl, parent, q: best[0], r: best[1], cost: kind === 'cpu' ? 2 : kind === 'up' ? 2 + upKey(id)[1] : kind === 'tier' ? Math.ceil(lvl / 2) + 1 : Math.ceil(lvl / 2) };
      parent = id;
    });
  }
})();
const techName = id => { const n = TECH[id]; if (!n) return id; if (n.kind === 'tier') return `T${id.slice(1)} ${TIERS[+id.slice(1)].name} armor`; if (n.kind === 'mat') return MATERIALS[id.slice(4)].name; if (n.kind === 'cpu') return `CPU Core +${TECH_CPU}`; if (n.kind === 'up') { const [u, r] = upKey(id); return `${TECH_UP[u].name} ${['I', 'II', 'III'][r - 1]}`; } return PARTS[id].name; };
const techDesc = id => { const n = TECH[id]; if (!n) return ''; if (n.kind === 'tier') { const T0 = TIERS[+id.slice(1)]; return `Armor tier ${id.slice(1)}: ${T0.hp} health per cube, ${T0.cpu} CPU each.`; } if (n.kind === 'mat') return MATERIALS[id.slice(4)].desc; if (n.kind === 'cpu') return `Raises your CPU limit by ${TECH_CPU}, so you can fit more on every bot.`; if (n.kind === 'up') { const [u, r] = upKey(id); return TECH_UP[u].desc(r) + (r > 1 ? ' (total with the ranks before it)' : '') + ' Only your own bot gets it.'; } return PARTS[id].desc || ''; };
function techState() {
  if (!PROG.tech || typeof PROG.tech !== 'object' || !PROG.tech.got) {
    // pilots who played before the tree keep everything their level already gave them, free
    const got = {};
    if ((progress.xp || 0) > 0 || (progress.matches || 0) > 0) { const lv = level(); for (const id in TECH) if (id !== 'start' && TECH[id].lvl <= lv) got[id] = 'L'; }
    PROG.tech = { got, v: 1 }; try { progSave(); } catch (e) { }
  }
  return PROG.tech;
}
function techEarned(xp) {
  xp = xp == null ? progress.xp || 0 : xp; const lv = levelFromXp(xp);
  let p = 5; for (let l = 2; l <= lv; l++) p += l + 1;
  if (lv >= 10) p += 4 * Math.floor(Math.max(0, xp - xpForLevel(10)) / TECH_RANK_XP);
  return p + 3 * ACH.filter(a => achDone(a.id)).length;
}
const techRank = () => level() >= 10 ? Math.floor(Math.max(0, (progress.xp || 0) - xpForLevel(10)) / TECH_RANK_XP) : 0;
function techSpent() { const g = techState().got; let s = 0; for (const id in g) if (g[id] === 'B' && TECH[id]) s += TECH[id].cost; return s; }
const techAvail = () => techEarned() - techSpent();
function techHas(id) { if (HEADLESS || UNLOCK_ALL) return true; if (TECH_START.includes(id) || !TECH[id]) return true; return !!techState().got[id]; }
const techCpu = () => HEADLESS ? 0 : UNLOCK_ALL ? TECH_CPU_MAX : TECH_CPU * TECH_CPU_LV.filter((_, i) => techHas('cpu' + (i + 1))).length;
// upgrade ranks your bot has: 0 for AI, other players, simulations and replays
function upRank(b, u) { if (HEADLESS || !b || !b.isPlayer || b.remote || (match && match.replay)) return 0; const L = TECH_UP[u].lv; let r = 0; for (let i = 1; i <= L.length; i++) if (techHas('u_' + u + i)) r = i; else break; return r; }
function upDmg(b, type) { if (!b || !b.isPlayer) return 1; for (const u in TECH_UP) { const U = TECH_UP[u]; if (U.wps && U.wps.includes(type)) return 1 + U.dmg * upRank(b, u); } return 1; }
const upSplash = b => b && b.isPlayer ? 1 + TECH_UP.war.splash * upRank(b, 'war') : 1;
const upRel = b => b && b.isPlayer ? 1 - TECH_UP.rel.rel * upRank(b, 'rel') : 1;
const upHeat = b => b && b.isPlayer ? 1 - TECH_UP.heat.heat * upRank(b, 'heat') : 1;
const upFuel = b => b && b.isPlayer ? 1 - TECH_UP.fuel.fuel * upRank(b, 'fuel') : 1;
const upMod = b => b && b.isPlayer ? 1 - TECH_UP.mod.mod * upRank(b, 'mod') : 1;
const ownCpuMax = () => cpuMax(unlockLv()) + techCpu();
const partOpen = t => !!PARTS[t] && PARTS[t].lvl <= unlockLv() && !partLocked(t) && techHas(t);
const tierOpen = k => !!TIERS[k] && TIERS[k].lvl <= unlockLv() && techHas('T' + k);
const matOpen = m => !!MATERIALS[m] && MATERIALS[m].lvl <= unlockLv() && techHas('mat_' + m);
const ownMaxTier = () => { let k = 1; for (let i = 1; i < TIERS.length; i++) if (tierOpen(i)) k = i; return k; };
// why a part can't be used yet, or ''
function partWhy(t) { const P = PARTS[t]; if (!P) return 'Unknown part.'; if (P.lvl > unlockLv()) return `${P.name} unlocks at pilot level ${P.lvl}.`; if (partLocked(t)) return `${P.name}: unlock it with ${unlockName(P.ach)}.`; if (!techHas(t)) return `${P.name}: unlock it in the Tech Tree.`; return ''; }
function techStatus(id) {
  if (id === 'start') return 'own'; const n = TECH[id];
  if (techHas(id)) return 'own';
  if (!techHas(n.parent) && n.parent !== 'start') return 'far';
  if (n.lvl > unlockLv()) return 'level';
  return techAvail() >= n.cost ? 'ready' : 'poor';
}
function techBuy(id) {
  const st = techStatus(id); if (st !== 'ready') return false;
  techState().got[id] = 'B'; progSave(); if (typeof TPL_CACHE !== 'undefined') TPL_CACHE.clear();
  SFX.ready('tech'); return true;
}
function techReset() { const g = techState().got; for (const id of Object.keys(g)) if (g[id] === 'B') delete g[id]; progSave(); if (typeof TPL_CACHE !== 'undefined') TPL_CACHE.clear(); }
function techBadge() { const n = HEADLESS ? 0 : Math.max(0, techAvail()), ready = n > 0 && Object.keys(TECH).some(id => techStatus(id) === 'ready'); for (const el of document.querySelectorAll('.techN')) { el.textContent = ready ? n : ''; el.hidden = !ready; } }

// ---------- the screen ----------
const TT = { sel: null, zoom: 1, x: 0, y: 0, back: null };
function techIcon(id) {
  const n = TECH[id]; if (!n) return '';
  if (n.kind === 'part' && ICONS[id]) return `<img alt="" src="${ICONS[id]}">`;
  if (n.kind === 'tier' && TIER_ICONS[+id.slice(1)]) return `<img alt="" src="${TIER_ICONS[+id.slice(1)]}">`;
  if (n.kind === 'mat') return TIER_ICONS[3] ? `<img alt="" class="mat-${id.slice(4)}" src="${TIER_ICONS[3]}">` : `<span class="tti mat-${id.slice(4)}">${MATERIALS[id.slice(4)].name.slice(0, 2).toUpperCase()}</span>`;
  if (n.kind === 'cpu') return `<span class="tti tcpu">+${TECH_CPU}</span>`;
  if (n.kind === 'up') { const [u, r] = upKey(id); return `<span class="tti tup">${{ bal: '⌖', war: '✸', cap: 'ϟ', rel: '»', heat: '❄', fuel: '⛽', mod: '◈' }[u]}<sup>${r}</sup></span>`; }
  return '';
}
function showTechTree(back) {
  TT.back = back || (state === 'garage' ? 'garage' : 'menu');
  let el = $('#techTree');
  if (!el) {
    el = document.createElement('div'); el.id = 'techTree';
    el.innerHTML = `<div class="tt-view"><div class="tt-map"><svg class="tt-lines"></svg><div class="tt-cells"></div></div></div>
      <div class="tt-side panel"><div class="tt-head"><b>TECH TREE</b><button id="ttClose" title="Close">✕</button></div>
        <div class="tt-pts"><span class="label">Tech points</span><b class="num" id="ttPts">0</b><small id="ttEarn"></small></div>
        <div id="ttCard" class="tt-card"></div>
        <div class="tt-legend"><span><i class="own"></i>Unlocked</span><span><i class="ready"></i>Can unlock</span><span><i class="level"></i>Needs a higher level</span><span><i class="far"></i>Unlock the node before it first</span></div>
        <div class="tt-btns"><button id="ttReset">Refund all</button><button id="ttCenter">Centre</button></div>
        <p class="tt-tip">Drag to look around, scroll or pinch to zoom. Points come from levelling up, every ${TECH_RANK_XP.toLocaleString()} XP past level 10, and achievements.</p></div>`;
    document.body.appendChild(el);
    const view = el.querySelector('.tt-view');
    let drag = null, pinch = null; const pts = new Map();
    view.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0 }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: TT.zoom }; } });
    addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; TT.zoom = clamp(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, .45, 1.8); techApplyView(); return; }
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved > 6) { TT.x += dx; TT.y += dy; techApplyView(); view.classList.add('dragging'); }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { setTimeout(() => view.classList.remove('dragging'), 0); TT.dragged = drag && drag.moved > 6; drag = null; } };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    view.addEventListener('wheel', e => { e.preventDefault(); const r = view.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, z0 = TT.zoom, z1 = clamp(z0 * Math.exp(-e.deltaY * .0015), .45, 1.8); TT.x = mx - (mx - TT.x) * z1 / z0; TT.y = my - (my - TT.y) * z1 / z0; TT.zoom = z1; techApplyView(); }, { passive: false });
    el.querySelector('#ttClose').onclick = hideTechTree;
    el.querySelector('#ttCenter').onclick = () => { techCentre(); };
    el.querySelector('#ttReset').onclick = e => { const b = e.currentTarget, s = techSpent(); if (!s) { toast('Nothing to refund.'); return; }
      if (!b.dataset.arm) { b.dataset.arm = 1; b.textContent = `Refund ${s} points?`; b.classList.add('warn'); setTimeout(() => { delete b.dataset.arm; b.textContent = 'Refund all'; b.classList.remove('warn'); }, 3500); return; }
      delete b.dataset.arm; b.textContent = 'Refund all'; b.classList.remove('warn'); techReset(); techRender(); toast(`${s} tech points refunded. Bots that used those parts will need changes.`); };
    addEventListener('keydown', e => { if (!$('#techTree') || $('#techTree').hidden) return; if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hideTechTree(); } }, true);
  }
  el.hidden = false; techRender(); techCentre(); SFX.ui();
}
function hideTechTree() { const el = $('#techTree'); if (el) el.hidden = true; techBadge(); if (state === 'garage') { buildPartsUI(); updateStats(); } else if (state === 'menu') buildPilotCard(); }
const TT_W = 92, TT_H = 80; // a cell is ~92px wide; rows are 3/4 of a hex height apart
const ttPos = n => [(n.q + n.r / 2) * TT_W, n.r * TT_H];
function techCentre() { const v = $('#techTree .tt-view'), r = v.getBoundingClientRect(); TT.zoom = innerWidth < 700 ? .7 : 1; TT.x = r.width / 2; TT.y = r.height * .55; techApplyView(); }
function techApplyView() { const m = $('#techTree .tt-map'); if (m) m.style.transform = `translate(${TT.x}px,${TT.y}px) scale(${TT.zoom})`; }
function techRender() {
  const el = $('#techTree'); if (!el) return;
  const cells = el.querySelector('.tt-cells'), svg = el.querySelector('.tt-lines');
  const ids = Object.keys(TECH); let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const id of ids) { const [x, y] = ttPos(TECH[id]); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  // background honeycomb
  let html = ''; const used = new Set(ids.map(id => TECH[id].q + ',' + TECH[id].r));
  for (let r = Math.floor(minY / TT_H) - 2; r <= Math.ceil(maxY / TT_H) + 2; r++) for (let q = Math.floor(minX / TT_W - r / 2) - 2; q <= Math.ceil(maxX / TT_W - r / 2) + 2; q++) { if (used.has(q + ',' + r)) continue; const [x, y] = ttPos({ q, r }); html += `<div class="tt-cell bg" style="left:${x}px;top:${y}px"></div>`; }
  let lines = '';
  for (const id of ids) {
    const n = TECH[id];
    if (n.parent) { const p = TECH[n.parent], [x1, y1] = ttPos(p), [x2, y2] = ttPos(n), on = techHas(id) && (n.parent === 'start' || techHas(n.parent)); lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${on ? 'on' : techStatus(id) === 'ready' ? 'ready' : ''}"/>`; }
    const [x, y] = ttPos(n);
    if (id === 'start') { html += `<button class="tt-cell node start" style="left:${x}px;top:${y}px" data-id="start"><span class="in"><b>START</b></span></button>`; continue; }
    const st = techStatus(id), starter = TECH_START.includes(id);
    html += `<button class="tt-cell node ${st}${TT.sel === id ? ' sel' : ''}" style="left:${x}px;top:${y}px" data-id="${id}" title="${esc(techName(id))}"><span class="in">${techIcon(id)}<span class="nm">${esc(n.kind === 'cpu' ? 'CPU Core' : n.kind === 'up' ? techName(id).replace(/^\S+ /, '') : techName(id).replace(/ armor$/, ''))}</span>${st === 'own' ? '' : st === 'level' ? `<span class="ct">LV ${n.lvl}</span>` : `<span class="ct">★ ${n.cost}</span>`}</span></button>`;
  }
  svg.setAttribute('viewBox', `${minX - 200} ${minY - 200} ${maxX - minX + 400} ${maxY - minY + 400}`);
  svg.style.left = (minX - 200) + 'px'; svg.style.top = (minY - 200) + 'px'; svg.setAttribute('width', maxX - minX + 400); svg.setAttribute('height', maxY - minY + 400);
  svg.innerHTML = lines; cells.innerHTML = html;
  cells.querySelectorAll('.node').forEach(b => {
    b.onclick = () => { if (TT.dragged) return; const id = b.dataset.id; if (TT.sel === id && techStatus(id) === 'ready') { techBuyUI(id); return; } TT.sel = id; techRender(); };
  });
  const avail = techAvail(), lv = level();
  $('#ttPts').textContent = avail;
  $('#ttEarn').textContent = `${techEarned()} earned · ${techSpent()} spent · level ${lv}${lv >= 10 ? ` rank ${techRank()}` : ''}`;
  techCard(); techBadge();
}
function techBuyUI(id) {
  if (!techBuy(id)) return;
  const n = TECH[id]; toast(`${techName(id)} unlocked.`);
  if (!HEADLESS) { const b = $(`#techTree .node[data-id="${id}"]`); if (b) b.classList.add('pulse'); }
  if (n.kind === 'tier') garage.tier = +id.slice(1);
  setTimeout(techRender, 220);
}
function techCard() {
  const c = $('#ttCard'), id = TT.sel; if (!c) return;
  if (!id || id === 'start') { c.innerHTML = `<p>Pick a node to see what it unlocks. Start parts: cube, wedge, slab, pilot seat, wheel, pulse blaster and flag.</p>`; return; }
  const n = TECH[id], st = techStatus(id), par = n.parent === 'start' ? 'START' : techName(n.parent);
  const why = { own: 'Unlocked.', ready: `Costs ${n.cost} tech point${n.cost > 1 ? 's' : ''}.`, poor: `Costs ${n.cost} tech points. You have ${techAvail()}.`, level: `Needs pilot level ${n.lvl}.`, far: `Unlock ${par} first.` }[st];
  const P = n.kind === 'part' ? PARTS[id] : null;
  c.innerHTML = `<div class="tt-ci">${techIcon(id)}</div><b>${esc(techName(id))}</b><small>${n.kind === 'part' ? esc(P.cat) + ' · ' + P.cpu + ' CPU · ' + P.hp + ' HP' : n.kind === 'tier' ? 'Armor tier' : n.kind === 'mat' ? 'Armor material' : n.kind === 'up' ? 'Bot upgrade' : 'Upgrade'} · level ${n.lvl}</small>
    <p>${esc(techDesc(id))}</p><p class="st ${st}">${why}${techState().got[id] === 'L' ? ' (kept from before the tech tree)' : ''}</p>
    ${st === 'ready' ? `<button class="primary" id="ttBuy">Unlock for ${n.cost} ★</button>` : ''}`;
  if ($('#ttBuy')) $('#ttBuy').onclick = () => techBuyUI(id);
}
Object.assign(window.__sfa, { TECH_UP, upRank, upDmg, TECH, techState, techEarned, techAvail, techBuy, techStatus, showTechTree, ownCpuMax });
Object.assign(window.__sfa, { SPLASH, mobility, Bot, WEAPONS, PARTS, TIERS, BAL, HEAT, TESLA, computeStats });
