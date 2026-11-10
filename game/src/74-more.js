// ================= WEAPON GROUPS · TEMPLATES · CONTROLS · GAMEPAD =================

// ---------- weapon groups ----------
// design.wg = [{ types: ['blaster','rail'], mode: 'together' | 'alt' }]; keys 1–n pick a group
function botGroups(b, d) {
  return (d && Array.isArray(d.wg) ? d.wg : []).slice(0, 4)
    .map(g => ({ types: (g.types || []).filter(t => WTYPES.includes(t) && t !== 'lancer' && b.guns[t] && b.guns[t].length), mode: g.mode === 'alt' ? 'alt' : 'together' }))
    .filter(g => g.types.length > 1);
}
function selectGroup(i) {
  const P = match && match.player; if (!P || !P.wg || !P.wg[i]) return;
  const g = P.wg[i]; P.wgIdx = i; P.input.group = g.types.slice(); P.input.groupMode = g.mode;
  P.input.weapon = g.types.find(t => P.guns[t].length) || g.types[0]; buildWeaponHud(); SFX.ui();
}
// mouse wheel / gamepad bumpers step through groups first, then single weapons
function cycleWeapon(dir) {
  const p = match.player; const avail = WTYPES.filter(t => p.guns[t].length);
  const entries = [...(p.wg || []).map((g, i) => ({ g: i })), ...avail.map(t => ({ t }))]; if (entries.length < 2) return;
  const cur = p.input.group && p.wgIdx >= 0 ? entries.findIndex(e => e.g === p.wgIdx) : entries.findIndex(e => e.t === p.input.weapon);
  const e = entries[(cur + dir + entries.length) % entries.length];
  if (e.g != null) selectGroup(e.g); else { p.input.weapon = e.t; p.input.group = null; p.wgIdx = -1; buildWeaponHud(); }
}
function groupHudHtml(p) {
  if (!p.wg || !p.wg.length) return '';
  return p.wg.map((g, i) => `<div class="wslot grp${p.wgIdx === i && p.input.group ? ' act' : ''}"><span class="k">${i + 1} · GROUP · ${g.mode === 'alt' ? 'TAKE TURNS' : 'TOGETHER'}</span><span class="n">${g.types.map(t => PARTS[t].name).join(' + ')}</span></div>`).join('');
}
function showWeaponGroups() {
  const have = WTYPES.filter(t => t !== 'lancer' && design.blocks.some(b => b.t === t));
  let groups = (design.wg || []).map(g => ({ types: g.types.filter(t => have.includes(t)), mode: g.mode === 'alt' ? 'alt' : 'together' }));
  const draw = () => {
    showOverlay(`<h2>Weapon groups</h2>
      <p>Fire several weapon types with one trigger. In battle, keys <b>1</b> to <b>${Math.max(1, groups.length)}</b> pick a group instead of a single weapon; the other number keys still pick single weapons and the mouse wheel steps through everything. <i>Together</i> fires every weapon in the group at its own rate. <i>Take turns</i> alternates between them.</p>
      ${have.length < 2 ? '<p class="warnline">Add at least two different weapon types to this bot to make a group.</p>' : ''}
      <div id="wgList">${groups.map((g, i) => `<div class="wgrow" data-i="${i}"><b>Group ${i + 1}</b><div class="wgt">${have.map(t => `<button data-t="${t}" class="${g.types.includes(t) ? 'sel' : ''}">${PARTS[t].name}</button>`).join('')}</div>
        <div class="seg"><button data-m="together" class="${g.mode !== 'alt' ? 'sel' : ''}">Together</button><button data-m="alt" class="${g.mode === 'alt' ? 'sel' : ''}">Take turns</button></div><button class="wgdel" title="Remove group">✕</button></div>`).join('')}</div>
      <div class="btns">${have.length >= 2 && groups.length < 4 ? '<button id="wgAdd">Add group</button>' : ''}<button class="primary" id="ovDone">Save</button><button id="ovCancel">Cancel</button></div>`);
    document.querySelectorAll('.wgrow').forEach(row => {
      const g = groups[+row.dataset.i];
      row.querySelectorAll('.wgt button').forEach(b => b.onclick = () => { const t = b.dataset.t; g.types = g.types.includes(t) ? g.types.filter(x => x !== t) : [...g.types, t]; draw(); });
      row.querySelectorAll('.seg button').forEach(b => b.onclick = () => { g.mode = b.dataset.m; draw(); });
      row.querySelector('.wgdel').onclick = () => { groups.splice(+row.dataset.i, 1); draw(); };
    });
    if ($('#wgAdd')) $('#wgAdd').onclick = () => { groups.push({ types: have.slice(0, 2), mode: 'together' }); draw(); };
    $('#ovCancel').onclick = hideOverlay;
    $('#ovDone').onclick = () => {
      const keep = groups.filter(g => g.types.length > 1);
      design.wg = keep.length ? keep : undefined; saveBays(); hideOverlay();
      toast(keep.length ? `${keep.length} weapon group${keep.length > 1 ? 's' : ''} saved. Keys 1–${keep.length} pick them in battle.` : 'Weapon groups cleared.');
    };
  };
  draw();
}

// ---------- bot templates ----------
const TEMPLATES = [
  { id: 'rover', arch: 'car', seed: 11, name: 'Rover', role: 'All-rounder', desc: 'Fast wheels and blasters. Forgiving and easy to drive.', beg: true, colors: { main: 9, acc: 1 } },
  { id: 'brick', arch: 'brawler', seed: 23, name: 'Brick', role: 'Brawler', desc: 'Thick armor up front. Gets close and trades hits.', beg: true, colors: { main: 3, acc: 0 } },
  { id: 'dart', arch: 'car', seed: 5, budget: .62, name: 'Dart', role: 'Scout', desc: 'Small and light, so it is the fastest bot here. Grab beacons and flank.', beg: true, colors: { main: 4, acc: 0 } },
  { id: 'hopper', sig: 'jet', arch: 'jumper', seed: 31, name: 'Hopper', role: 'Skirmisher', desc: 'Jump jets to hop over cover and onto ledges.', beg: true, colors: { main: 5, acc: 2 } },
  { id: 'glider', sig: 'hover', arch: 'hover', seed: 41, name: 'Glider', role: 'Hover', desc: 'Hover pads float over rough ground and can strafe.', colors: { main: 6, acc: 1 } },
  { id: 'longshot', sig: 'rail', arch: 'sniper', seed: 53, name: 'Longshot', role: 'Sniper', desc: 'Rail cannons. Stay back and pick off exposed blocks.', colors: { main: 12, acc: 4 } },
  { id: 'lobber', sig: 'mortar', arch: 'mortar', seed: 61, name: 'Lobber', role: 'Artillery', desc: 'Mortars arc over walls. Great at holding beacons.', colors: { main: 7, acc: 1 } },
  { id: 'scorch', sig: 'plasma', arch: 'plasma', seed: 71, name: 'Scorch', role: 'Splash', desc: 'Plasma bursts melt clusters of blocks.', colors: { main: 2, acc: 0 } },
  { id: 'warden', sig: 'tread', arch: 'tank', seed: 83, name: 'Warden', role: 'Tank', desc: 'Treads and heavy armor. Slow, very hard to kill.', colors: { main: 8, acc: 3 } },
  { id: 'patch', sig: 'nano', arch: 'medic', seed: 97, name: 'Patch', role: 'Support', desc: 'Nano healer that keeps teammates in the fight.', colors: { main: 1, acc: 9 } },
  { id: 'swarm', sig: 'seeker', arch: 'missile', seed: 101, name: 'Swarm', role: 'Lock-on', desc: 'Seeker missiles that chase their target.', colors: { main: 4, acc: 1 } },
  { id: 'buzz', sig: 'rotor', arch: 'heli', seed: 113, name: 'Buzz', role: 'Rotorcraft', desc: 'Rotors lift it above the fight.', colors: { main: 10, acc: 0 } },
  { id: 'flakker', sig: 'flak', arch: 'flak', seed: 127, name: 'Flakker', role: 'Anti-air', desc: 'Flak bursts shred flyers and hovers.', colors: { main: 11, acc: 2 } },
  { id: 'shredder', sig: 'chain', arch: 'chain', seed: 131, name: 'Shredder', role: 'Close range', desc: 'Chain guns spin up into a storm of rounds.', colors: { main: 0, acc: 5 } },
  { id: 'kite', sig: 'wing', arch: 'plane', seed: 149, name: 'Kite', role: 'Plane', desc: 'Wings and thrusters. Fast passes from above.', colors: { main: 13, acc: 1 } },
  { id: 'stalker', sig: 'leg', arch: 'walker', seed: 151, name: 'Stalker', role: 'Walker', desc: 'Mech legs climb steep slopes.', colors: { main: 14, acc: 2 } },
];
// builds a template for pilot level L; shapes above L become cubes, anything else locked rejects that seed
function buildTemplate(tp, L) {
  const own = !HEADLESS && L === level(), can = t => PARTS[t] && PARTS[t].lvl <= L && (!own || techHas(t));
  for (let s = 0; s < 6; s++) {
    let d;
    try { d = genDesign(mulberry32(tp.seed + s * 1000), Math.round((own ? ownCpuMax() : cpuMax(L)) * (tp.budget || .9)), tp.arch, tp.colors, own ? ownMaxTier() : maxTier(L)); } catch (e) { continue; }
    // locked shapes become cubes, locked guns become blasters, locked extras (blades, lamps…) are left off
    const blocks = d.blocks.filter(b => PARTS[b.t]).map(b => { const P = PARTS[b.t]; if (can(b.t)) return b; if (P.shape) return { ...b, t: 'cube', r: 0 }; if (WEAPONS[b.t] && can('blaster')) return { ...b, t: 'blaster' }; return null; }).filter(Boolean);
    if (tp.sig && !blocks.some(b => b.t === tp.sig)) continue;
    const out = { name: tp.name, v: 3, f: 'standard', blocks: blocks.map(b => ({ ...b })) };
    if (!designIssue(out, L, own)) return out;
  }
  return null;
}
const TPL_CACHE = new Map();
function templateFor(tp, L) {
  const k = tp.id + ':' + L + ':' + (HEADLESS ? 0 : Object.keys(techState().got).length); if (TPL_CACHE.has(k)) return TPL_CACHE.get(k);
  let d = buildTemplate(tp, L), need = L;
  if (!d) { need = 0; for (let l = L + 1; l <= 10 && !need; l++) if (buildTemplate(tp, l)) need = l; }
  const r = { d, need: d ? L : need || 99 }; TPL_CACHE.set(k, r); return r;
}
function tplCard(tp, L) {
  const { d, need } = templateFor(tp, L);
  if (!d) return `<div class="tcard locked"><div class="timg"></div><b>${tp.name}</b><small>${tp.role}</small><p>${tp.desc}</p><div class="tlock">${need < 99 ? 'Unlocks at pilot level ' + need : 'Not available yet'}</div></div>`;
  const s = computeStats(d.blocks), img = designThumb(d, 'tpl:' + tp.id + ':' + L);
  return `<div class="tcard" data-id="${tp.id}"><div class="timg">${img ? `<img src="${img}" alt="">` : ''}</div><b>${tp.name}</b><small>${tp.role}</small><p>${tp.desc}</p><div class="tstat num">${s.cpu} CPU · ${Math.round(s.hp / 100) / 10}k HP · ${d.blocks.length} blocks</div><button class="primary" data-load="${tp.id}">Use this bot</button></div>`;
}
function loadTemplate(id) {
  const tp = TEMPLATES.find(t => t.id === id); const { d } = templateFor(tp, level()); if (!d) return;
  if (state !== 'garage') toGarage();
  pushUndo(); gLoad(JSON.parse(JSON.stringify(d))); saveBays(); updateStats();
  hideOverlay(); toast(`${tp.name} loaded into this bay. Change anything you like, then hit Battle.`);
}
function showTemplates() {
  const L = level();
  showOverlay(`<h2>Bot templates</h2><p>Ready-made designs sized for your pilot level (${L}). Loading one replaces the bot in this bay; Undo brings yours back.</p>
    <div class="tgrid">${TEMPLATES.map(t => tplCard(t, L)).join('')}</div><div class="btns"><button class="primary" id="ovDone">Close</button></div>`, true);
  document.querySelectorAll('[data-load]').forEach(b => b.onclick = () => loadTemplate(b.dataset.load));
  $('#ovDone').onclick = hideOverlay;
}
// first garage visit: pick a beginner bot instead of staring at an empty bay
function needBeginnerPick() { return !HEADLESS && !store.get('sfa.pickedTpl', false) && !progress.matches; }
function showBeginnerPick(after) {
  const L = level(), list = TEMPLATES.filter(t => t.beg && templateFor(t, L).d);
  showOverlay(`<h2>Pick your first bot</h2><p>Every bot here is ready to fight. You can change any block later, and the garage tutorial shows you how.</p>
    <div class="tgrid">${list.map(t => tplCard(t, L)).join('')}</div>
    <div class="btns"><button id="begStarter">Keep the Starter Rig</button><button id="begEmpty">Start from an empty bay</button></div>`, true);
  const done = () => { store.set('sfa.pickedTpl', true); hideOverlay(); if (after) after(); };
  document.querySelectorAll('[data-load]').forEach(b => b.onclick = () => { loadTemplate(b.dataset.load); done(); });
  $('#begStarter').onclick = done;
  $('#begEmpty').onclick = () => { pushUndo(); gLoad({ name: 'My Bot', v: 3, blocks: [{ x: 0, y: 0, z: 0, t: 'seat', c: 9, r: 0 }] }); saveBays(); updateStats(); done(); };
}

// ---------- key rebinding ----------
function controlsHtml() {
  const k = a => keyLabel(KB(a));
  return `<div class="keys"><kbd>${k('forward')} ${k('left')} ${k('back')} ${k('right')}</kbd><span>Drive and steer</span><kbd>Mouse</kbd><span>Aim the camera and guns</span><kbd>Click</kbd><span>Fire the selected weapon or group</span><kbd>1 – 0, −</kbd><span>Pick a weapon; with weapon groups, 1–4 pick a group first</span><kbd>Wheel</kbd><span>Step through groups and weapons</span><kbd>${k('boost')}</kbd><span>Boost dash</span><kbd>${k('up')} / ${k('down')}</kbd><span>Jets, or climb and descend</span><kbd>${k('strafeL')} / ${k('strafeR')}</kbd><span>Strafe with hovers and rotors</span><kbd>${MODULE_TYPES.map(t => k('mod_' + t)).join(' ')}</kbd><span>Modules: ${MODULE_TYPES.map(t => MODULES[t].name).join(', ')}</span><kbd>${k('board')}</kbd><span>Scoreboard</span><kbd>${k('destruct')}</kbd><span>Self-destruct</span><kbd>Esc</kbd><span>Pause</span></div>`;
}
const RESERVED_KEYS = /^(Escape|Digit[0-9]|Minus|F[0-9]+|Backquote)$/;
function showControls(back) {
  const draw = () => {
    showOverlay(`<h2>Controls</h2><p>Click an action, then press the key you want. Esc cancels. Number keys stay on weapons.</p>
      <div class="kbgrid">${Object.keys(KEY_DEFAULTS).map(a => `<span>${KEY_NAMES[a]}</span><button data-a="${a}" class="${KB(a) !== KEY_DEFAULTS[a] ? 'changed' : ''}">${keyLabel(KB(a))}</button>`).join('')}</div>
      <h3>Gamepad</h3><p style="font-size:13px">${PAD.on ? 'Click an action, then press a button on the controller. Esc cancels.' : 'Connect a controller and press any button to rebind it here.'} Sticks: ${settings.padSwap ? 'left aims, right drives' : 'left drives, right aims'}.</p>
      <div class="kbgrid">${Object.keys(PAD_DEFAULTS).map(a => `<span>${PAD_NAMES[a]}</span><button data-p="${a}" class="${PB(a) !== PAD_DEFAULTS[a] ? 'changed' : ''}">${padLabel(PB(a))}</button>`).join('')}</div>
      <div class="srow"><span>Swap sticks</span><div class="seg" id="pSwap"><button data-k="0" class="${settings.padSwap ? '' : 'sel'}">Off</button><button data-k="1" class="${settings.padSwap ? 'sel' : ''}">On</button></div><span></span></div>
      <div class="srow"><label for="pSens">Stick aim speed</label><input type="range" id="pSens" min=".4" max="2.5" step=".05" value="${settings.padSens || 1}"><span class="num">${(settings.padSens || 1).toFixed(2)}×</span></div>
      <p style="font-size:13px">In menus the D-pad or left stick moves between buttons, A presses, B goes back.</p>
      <div class="btns"><button id="kbReset">Reset to defaults</button><button class="primary" id="ovDone">Done</button></div>`, true);
    document.querySelectorAll('.kbgrid button[data-a]').forEach(b => b.onclick = () => capture(b));
    document.querySelectorAll('.kbgrid button[data-p]').forEach(b => b.onclick = () => padCapture(b));
    document.querySelectorAll('#pSwap button').forEach(b => b.onclick = () => { settings.padSwap = b.dataset.k === '1'; saveSettings(); draw(); });
    $('#pSens').oninput = e => { settings.padSens = +e.target.value; e.target.nextElementSibling.textContent = settings.padSens.toFixed(2) + '×'; saveSettings(); };
    $('#kbReset').onclick = () => { settings.keys = {}; settings.pad = {}; settings.padSwap = false; settings.padSens = 1; saveSettings(); draw(); };
    $('#ovDone').onclick = () => { if (back) back(); else hideOverlay(); };
  };
  const padCapture = btn => {
    const a = btn.dataset.p; btn.textContent = 'Press a button…'; btn.classList.add('wait');
    const esc = e => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); PAD.capture = null; removeEventListener('keydown', esc, true); draw(); } };
    addEventListener('keydown', esc, true);
    PAD.capture = i => {
      removeEventListener('keydown', esc, true);
      settings.pad = Object.assign({}, settings.pad);
      const other = Object.keys(PAD_DEFAULTS).find(x => x !== a && PB(x) === i);
      if (other) settings.pad[other] = PB(a);
      settings.pad[a] = i;
      for (const x of Object.keys(settings.pad)) if (settings.pad[x] === PAD_DEFAULTS[x]) delete settings.pad[x];
      saveSettings(); if (other) toast(`${PAD_NAMES[other]} moved to ${padLabel(PB(other))}.`); SFX.ui(); draw();
    };
  };
  const capture = btn => {
    btn.textContent = 'Press a key…'; btn.classList.add('wait');
    const on = e => {
      e.preventDefault(); e.stopImmediatePropagation(); removeEventListener('keydown', on, true);
      if (e.code === 'Escape') { draw(); return; }
      if (RESERVED_KEYS.test(e.code)) { toast(`${keyLabel(e.code)} is reserved.`); draw(); return; }
      const a = btn.dataset.a; settings.keys = Object.assign({}, settings.keys);
      // swap with whatever already used that key
      const other = Object.keys(KEY_DEFAULTS).find(x => x !== a && KB(x) === e.code);
      if (other) settings.keys[other] = KB(a);
      settings.keys[a] = e.code;
      for (const x of Object.keys(settings.keys)) if (settings.keys[x] === KEY_DEFAULTS[x]) delete settings.keys[x];
      saveSettings(); if (other) toast(`${KEY_NAMES[other]} moved to ${keyLabel(KB(other))}.`); draw();
    };
    addEventListener('keydown', on, true);
  };
  draw();
}
function updateControlsHint() {
  const el = $('#controls'); if (!el) return; const k = a => keyLabel(KB(a));
  el.innerHTML = `<b>${k('forward')}${k('left')}${k('back')}${k('right')}</b> drive · <b>Mouse</b> aim · <b>Click</b> fire · <b>1–0</b> weapons · <b>${k('boost')}</b> boost · <b>${k('up')}/${k('down')}</b> up/down · <b>${k('strafeL')}/${k('strafeR')}</b> strafe · <b>${k('board')}</b> scores · <b>Esc</b> menu`;
}

// ---------- gamepad ----------
const PAD = { on: false, throttle: 0, steer: 0, strafe: 0, fire: false, up: false, down: false, prev: [], navT: 0, board: false };
addEventListener('gamepadconnected', e => { if (HEADLESS) return; PAD.on = true; noLock = true; toast(`Controller connected${e.gamepad && e.gamepad.id ? ': ' + e.gamepad.id.replace(/\(.*\)/, '').trim().slice(0, 40) : ''}. Menus: D-pad and A.`); });
addEventListener('gamepaddisconnected', () => { PAD.on = false; PAD.throttle = PAD.steer = PAD.strafe = 0; PAD.fire = PAD.up = PAD.down = false; });
function padFocusables() {
  const root = !$('#overlay').hidden ? $('#overlay') : state === 'menu' ? $('#menu') : state === 'garage' ? $('#garage') : !$('#overlay').hidden ? $('#overlay') : null;
  if (!root) return [];
  return [...root.querySelectorAll('button, [data-load], input, select, a[href]')].filter(el => !el.disabled && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
}
function padMove(dx, dy) {
  const list = padFocusables(); if (!list.length) return;
  const cur = document.activeElement && list.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { list[0].focus(); list[0].classList.add('padfocus'); return; }
  const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bs = Infinity;
  for (const el of list) {
    if (el === cur) continue; const r = el.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
    const along = x * dx + y * dy, side = Math.abs(x * dy - y * dx); if (along <= 4) continue;
    const s = along + side * 2.2; if (s < bs) { bs = s; best = el; }
  }
  if (best) { cur.classList.remove('padfocus'); best.focus(); best.classList.add('padfocus'); best.scrollIntoView({ block: 'nearest' }); SFX.ui(); }
}
function padBack() {
  if (!$('#overlay').hidden) {
    const b = $('#ovCancel') || $('#ovBack') || [...$('#overlay').querySelectorAll('button')].find(x => /^(Back|Close|Cancel|Done|Resume|Got it)$/i.test(x.textContent.trim()));
    if (b) { b.click(); return; }
  }
  if (state === 'battle' && paused && typeof unpause === 'function') unpause();
}
// gamepad bindings: action -> button index in the standard layout
const PAD_DEFAULTS = { fire: 7, up: 0, down: 1, dash: 2, prev: 4, next: 5, mod1: 3, mod2: 6, mod3: 12, mod4: 13, strafeL: 14, strafeR: 15, board: 8, pause: 9, destruct: -1 };
const PAD_NAMES = { fire: 'Fire', up: 'Jets / climb', down: 'Descend', dash: 'Boost dash', prev: 'Previous weapon', next: 'Next weapon', mod1: 'Module 1', mod2: 'Module 2', mod3: 'Module 3', mod4: 'Module 4', strafeL: 'Strafe left', strafeR: 'Strafe right', board: 'Scoreboard', pause: 'Pause', destruct: 'Self-destruct' };
const PAD_BTN = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L-stick', 'R-stick', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'];
const PB = a => settings.pad && settings.pad[a] != null ? settings.pad[a] : PAD_DEFAULTS[a];
const padLabel = i => i < 0 || i == null ? '—' : PAD_BTN[i] || 'Button ' + i;
function padTick(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null; for (const g of pads) if (g && g.connected) { gp = g; break; }
  if (gp && PAD.capture) { const i = gp.buttons.findIndex((b, j) => (b.pressed || b.value > .5) && !PAD.prev[j]); if (i >= 0) { const cb = PAD.capture; PAD.capture = null; cb(i); } PAD.prev = gp.buttons.map(b => b.pressed || b.value > .5); return; }
  if (!gp) { if (PAD.on) { PAD.throttle = PAD.steer = PAD.strafe = 0; PAD.fire = PAD.up = PAD.down = false; } return; }
  PAD.on = true;
  const ax = i => { const v = gp.axes[i] || 0; return Math.abs(v) < .18 ? 0 : (v - Math.sign(v) * .18) / .82; };
  const btn = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > .5));
  const hit = i => btn(i) && !PAD.prev[i];
  const battle = state === 'battle' && match && !paused && $('#overlay').hidden;
  if (battle) {
    const P = match.player;
    const sw = settings.padSwap, mv = sw ? 2 : 0, am = sw ? 0 : 2, B = a => btn(PB(a)), H = a => hit(PB(a));
    PAD.throttle = -ax(mv + 1); PAD.steer = -ax(mv); PAD.strafe = (B('strafeL') ? 1 : 0) - (B('strafeR') ? 1 : 0);
    PAD.fire = B('fire'); PAD.up = B('up'); PAD.down = B('down');
    const s = 2.6 * settings.sens * (settings.padSens || 1); cam.yaw -= ax(am) * s * dt; cam.pitch = clamp(cam.pitch - ax(am + 1) * s * .7 * dt * (settings.invertY ? -1 : 1), -.75, .7);
    if (match.spectator) { if (H('up')) cam.spect = nextSpect(1); if (H('down')) cam.spect = nextSpect(-1); }
    else if (P && !P.dead && !match.over) {
      if (H('prev')) cycleWeapon(-1); if (H('next')) cycleWeapon(1);
      if (H('dash')) P.input.dash = true;
      const mods = MODULE_TYPES.filter(t => hasModule(P, t));
      ['mod1', 'mod2', 'mod3', 'mod4'].forEach((a, i) => { if (H(a) && mods[i]) P.input.mod = mods[i]; });
      if (H('destruct')) P.die();
    }
    const bd = B('board'); if (bd !== PAD.board) { PAD.board = bd; $('#board').hidden = !bd; if (bd) drawBoard(); }
    if (H('pause')) showPause();
  } else {
    PAD.throttle = PAD.steer = PAD.strafe = 0; PAD.fire = PAD.up = PAD.down = false;
    if (state === 'battle' && paused && hit(9) && typeof unpause === 'function') unpause();
    else {
      const dx = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0) || Math.sign(ax(0)), dy = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0) || Math.sign(ax(1));
      PAD.navT -= dt;
      if ((dx || dy) && PAD.navT <= 0) { padMove(dy ? 0 : dx, dy); PAD.navT = PAD.navHeld ? .14 : .38; PAD.navHeld = true; }
      if (!dx && !dy) { PAD.navT = 0; PAD.navHeld = false; }
      if (hit(0) && document.activeElement && document.activeElement !== document.body) document.activeElement.click();
      if (hit(1)) padBack();
      if (state === 'garage' && $('#overlay').hidden) { garage.orbit.theta -= ax(2) * dt * 2; garage.orbit.phi = clamp(garage.orbit.phi + ax(3) * dt * 1.5, .25, 1.5); }
    }
  }
  PAD.prev = gp.buttons.map(b => b.pressed || b.value > .5);
}
Object.assign(window.__sfa, { SFX, Music, PAD, PB, padTick, TEMPLATES, templateFor, showTemplates, showBeginnerPick, PAD, settings, selectGroup, showControls, showWeaponGroups, KB, getDesign: () => design, level });
