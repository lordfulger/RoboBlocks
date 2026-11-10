// ================= TOUCH CONTROLS =================
// Phones and tablets: a drive stick on the left, drag anywhere else to aim, and big action buttons.
const TCH = { on: false, throttle: 0, steer: 0, fire: false, up: false, down: false, stick: null, aim: null };
function touchEnable() {
  if (TCH.on || HEADLESS) return; TCH.on = true;
  try { noLock = true; } catch (e) { /* not declared yet at load; 70-match reads TCH.on */ }
  document.body.classList.add('touch');
}
function touchReset() { TCH.throttle = TCH.steer = 0; TCH.fire = TCH.up = TCH.down = false; TCH.stick = TCH.aim = null; $('#tKnob').style.transform = ''; }
(() => {
  if (HEADLESS) return;
  const pad = $('#touch'), base = $('#tStick'), knob = $('#tKnob');
  if (IS_TOUCH) touchEnable();
  addEventListener('touchstart', () => touchEnable(), { passive: true, capture: true });
  const R = () => base.offsetWidth * .42;
  const stickMove = e => {
    const r = base.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy; const L = Math.hypot(dx, dy), m = R();
    if (L > m) { dx *= m / L; dy *= m / L; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    TCH.throttle = clamp(-dy / m * 1.25, -1, 1); TCH.steer = clamp(-dx / m * 1.25, -1, 1);
    if (Math.abs(TCH.throttle) < .15) TCH.throttle = 0; if (Math.abs(TCH.steer) < .12) TCH.steer = 0;
  };
  base.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); base.setPointerCapture(e.pointerId); TCH.stick = e.pointerId; stickMove(e); });
  base.addEventListener('pointermove', e => { if (TCH.stick === e.pointerId) stickMove(e); });
  const stickEnd = e => { if (TCH.stick !== e.pointerId) return; TCH.stick = null; TCH.throttle = TCH.steer = 0; knob.style.transform = ''; };
  base.addEventListener('pointerup', stickEnd); base.addEventListener('pointercancel', stickEnd);
  // aim: drag on the battlefield
  pad.addEventListener('pointerdown', e => {
    if (e.target !== pad || state !== 'battle') return;
    e.preventDefault(); pad.setPointerCapture(e.pointerId);
    if (match && match.spectator) { cam.spect = nextSpect(e.clientX < innerWidth / 2 ? -1 : 1); return; }
    TCH.aim = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  pad.addEventListener('pointermove', e => {
    const a = TCH.aim; if (!a || a.id !== e.pointerId || paused) return;
    const s = .0052 * settings.sens;
    cam.yaw -= (e.clientX - a.x) * s; cam.pitch = clamp(cam.pitch - (e.clientY - a.y) * s * (settings.invertY ? -1 : 1), -.75, .7);
    a.x = e.clientX; a.y = e.clientY;
  });
  const aimEnd = e => { if (TCH.aim && TCH.aim.id === e.pointerId) TCH.aim = null; };
  pad.addEventListener('pointerup', aimEnd); pad.addEventListener('pointercancel', aimEnd);
  // buttons: hold for fire/up/down, tap for the rest
  const hold = (id, key) => {
    const b = $(id);
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); TCH[key] = true; b.classList.add('on'); });
    const up = () => { TCH[key] = false; b.classList.remove('on'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  };
  hold('#tFire', 'fire'); hold('#tUp', 'up'); hold('#tDown', 'down');
  const tap = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (state === 'battle' && match) fn(match.player); });
  tap('#tBoost', P => { if (!P.dead && !paused) P.input.dash = true; });
  tap('#tWpn', () => { if (!paused) { cycleWeapon(1); SFX.ui(); } });
  tap('#tPause', () => { if (!paused) showPause(); });
  tap('#tChat', () => chatOpen());
  tap('#tCall', () => { if ($('#callouts').hidden) showCallouts(); else $('#callouts').hidden = true; });
  tap('#tBoard', () => { const b = $('#board'); b.hidden = !b.hidden; if (!b.hidden) drawBoard(); });
})();
