// ================= INTERACTIVE TUTORIAL =================
// A short checklist that watches what you do: build in the garage, then a guided test drive.
const IS_TOUCH = !HEADLESS && (('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches));
const TUT = Object.assign({ on: false, i: 0, done: false }, store.get('sfa.tut', {}));
TUT.n0 = 0; TUT.r0 = 0; TUT.drive = 0; TUT.flash = 0;
const tutSave = () => { store.set('sfa.tut', { on: TUT.on, i: TUT.i, done: TUT.done }); cloudDirty(); };
const TUT_STEPS = [
  { where: 'garage', text: () => `Pick a block in the parts list on the left, then ${IS_TOUCH ? 'tap' : 'click'} your bot to attach it. New blocks must touch the bot.`, start: () => { TUT.n0 = garage.blocks.size; }, done: () => garage.blocks.size > TUT.n0 },
  { where: 'garage', text: () => `${IS_TOUCH ? 'Tap Rotate' : 'Press R (or Rotate)'} to turn the next block. Tilt and Roll turn it the other ways. Mirror copies blocks to the other side.`, start: () => { TUT.r0 = garage.rot; }, done: () => garage.rot !== TUT.r0 },
  { where: 'garage', text: () => IS_TOUCH ? 'Tap Erase, then tap a block to remove it. Tap Erase again to go back to building.' : 'Right-click a block to remove it (or use Erase).', start: () => { TUT.n0 = garage.blocks.size; }, done: () => garage.blocks.size < TUT.n0 },
  { where: 'garage', text: () => 'A bot needs a Pilot Seat, at least one weapon, and wheels, treads, legs, hovers, rotors or wings. The panel on the right lists anything missing. Stuck? Press Starter. Then press Test drive.', done: () => state === 'battle' && match && match.mode === 'test' },
  { where: 'battle', text: () => IS_TOUCH ? 'Drive with the stick at the bottom left. Keep moving for a moment.' : 'Drive with W A S D. Keep moving for a moment.', done: () => TUT.drive > 1 },
  { where: 'battle', text: () => IS_TOUCH ? 'Drag on the right side of the screen to aim, then hold FIRE to shoot the red target bots.' : 'Aim with the mouse and click to fire at the red target bots.', done: () => match.player.dmgDealt > 0 },
  { where: 'battle', text: () => IS_TOUCH ? 'Tap BOOST for a quick dash.' : 'Press Shift for a quick boost dash.', done: () => match.player.dashCd > 0 },
  { where: 'battle', text: () => 'Destroy a target bot. Knock off the blocks that hold its seat, and the rest falls apart.', done: () => match.player.kills > 0 },
  { where: 'any', final: true, text: () => `Tutorial complete! ${IS_TOUCH ? 'Tap ❚❚' : 'Press Esc'}, go back to the menu and press Play for a real battle. Every match earns XP that unlocks new parts and armor tiers.` },
];
function tutStart() { TUT.on = true; TUT.i = 0; TUT.done = false; tutSave(); tutEnter(); }
function tutStop(finished) { TUT.on = false; TUT.done = true; tutSave(); $('#tut').hidden = true; if (finished) toast('Tutorial done. Good hunting!'); }
function tutEnter() { const s = TUT_STEPS[TUT.i]; if (!s) return; TUT.drive = 0; if (s.start) s.start(); $('#tutTxt').textContent = s.text(); $('#tutN').textContent = `Tutorial · ${Math.min(TUT.i + 1, TUT_STEPS.length)} of ${TUT_STEPS.length}`; $('#tutSkip').textContent = s.final ? 'Close' : 'Skip tutorial'; TUT.flash = .6; }
function tutTick(dt) {
  const el = $('#tut'); if (!el) return;
  if (!TUT.on) { if (!el.hidden) el.hidden = true; return; }
  let s = TUT_STEPS[TUT.i]; if (!s) { tutStop(true); return; }
  // jumped ahead to a test drive: the building steps count as done
  if (s.where === 'garage' && state === 'battle' && match && match.mode === 'test') { TUT.i = TUT_STEPS.findIndex(x => x.where === 'battle'); tutEnter(); s = TUT_STEPS[TUT.i]; }
  const here = s.where === 'any' || s.where === state;
  const show = here && !(state === 'battle' && match && (match.mode !== 'test' || paused && !s.final));
  el.hidden = !show; el.classList.toggle('inbattle', state === 'battle');
  if (state === 'battle' && match && match.mode !== 'test') return;
  if (!here || !s.done) return;
  if (s.where === 'battle' && match.player && !match.player.dead && Math.abs(match.player.input.throttle) > .2) TUT.drive += dt;
  if (s.done()) { TUT.i++; SFX.ui(); tutSave(); tutEnter(); }
  if (TUT.flash > 0) { TUT.flash -= dt; el.classList.toggle('flash', TUT.flash > 0); }
}
$('#tutSkip').onclick = () => tutStop(TUT_STEPS[TUT.i] && TUT_STEPS[TUT.i].final);
