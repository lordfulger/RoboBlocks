// ================= LOADOUTS =================
// Your garage bays are your loadout. Pick which bot you deploy with on the setup screen, and while you are
// wrecked press 1–5 (or tap a card, or the gamepad's next/prev weapon buttons) to rebuild as a different bot.
// Online, the new design goes out with your presence and other players rebuild you with it when you respawn.
const LOADOUT = { bay: null, next: null, el: null, sig: '' };
const bayUsable = d => !!(d && Array.isArray(d.blocks) && d.blocks.length);
const bayCopy = (d, i) => { const c = JSON.parse(JSON.stringify(d)); migrateDesign(c); c.name = c.name || 'Bay ' + (i + 1); c.v = 3; c.f = c.f || 'standard'; return c; };
// why a bay cannot be used in this battle ('' when it can)
function loadoutIssue(d, mode) {
  if (!bayUsable(d)) return 'empty';
  const iss = designIssue(d, level(), true); if (iss) return iss;
  const locked = d.blocks.find(b => PARTS[b.t] && partLocked(b.t)); if (locked) return PARTS[locked.t].name + ' is locked';
  if (connectivity(d.blocks).length) return 'has loose blocks';
  if (mode === 'space' && !canFlyInSpace(computeStats(d.blocks))) return 'cannot fly in space';
  return '';
}
// the bays offered as a loadout: [{ i, d, why }]
function loadoutList(mode) { return bays.map((d, i) => bayUsable(d) ? { i, d, why: loadoutIssue(d, mode) } : null).filter(Boolean); }
// the bot you deploy with: the loadout pick if it is still usable, else the bay open in the garage
function deployDesign(mode) {
  if (mode === 'test') return gSerialize();
  const i = LOADOUT.bay;
  if (i != null && i !== bayIdx && bays[i] && !loadoutIssue(bays[i], mode)) return bayCopy(bays[i], i);
  return gSerialize();
}
const deployBay = mode => { if (mode === 'test') return bayIdx; const i = LOADOUT.bay; return i != null && i !== bayIdx && bays[i] && !loadoutIssue(bays[i], mode) ? i : bayIdx; };
// the design other players should see for you right now
function presenceDesign() { const P = match && match.net && match.player; return P && !match.spectator && P.design ? P.design : deployDesign(NET.game && NET.game.info ? NET.game.info.mode : null); }
// battle setup: the START WITH row
function loadoutOptsHtml(mode) {
  const list = loadoutList(mode); if (list.length < 2) return '';
  const cur = deployBay(mode);
  return `<h3>START WITH</h3><div class="opts" id="oLoad">${list.map(({ i, d, why }) => `<button class="opt${i === cur ? ' sel' : ''}" data-k="${i}"${why ? ' disabled' : ''}><b>${i + 1} · ${esc(cleanName(d.name || '') || 'Bay ' + (i + 1))}</b><span>${why ? esc(why) : `${d.blocks.length} blocks · ${Math.round(computeStats(d.blocks).cpu)} CPU`}</span></button>`).join('')}</div>`;
}
function wireLoadoutOpts() {
  document.querySelectorAll('#oLoad .opt').forEach(b => b.onclick = () => { if (b.disabled) return; LOADOUT.bay = +b.dataset.k; document.querySelectorAll('#oLoad .opt').forEach(x => x.classList.toggle('sel', x === b)); SFX.ui(); const t = $('#ovBox p b'); if (t) t.textContent = bays[LOADOUT.bay].name || 'your bot'; });
}
// while wrecked: choose the bot for the next respawn
function loadoutPick(i) {
  const P = match && match.player; if (!P || !P.dead || match.over || match.spectator || match.mode === 'test') return false;
  const d = bays[i]; if (!bayUsable(d)) return false;
  const why = loadoutIssue(d, match.mode); if (why) { toast(`${cleanName(d.name || '') || 'Bay ' + (i + 1)}: ${why}.`); SFX.deny ? SFX.deny() : SFX.ui(); return true; }
  LOADOUT.next = i; LOADOUT.bay = i; SFX.ui(); drawLoadoutBar(true);
  if (match.net) { P.pendingDesign = bayCopy(d, i); slowPresenceDesign(P.pendingDesign); }
  return true;
}
function loadoutCycle(dir) {
  const list = loadoutList(match && match.mode).filter(x => !x.why); if (list.length < 2) return;
  const P = match.player, cur = LOADOUT.next != null ? LOADOUT.next : P.bay != null ? P.bay : bayIdx;
  const k = list.findIndex(x => x.i === cur), n = list[((k < 0 ? 0 : k) + dir + list.length) % list.length];
  loadoutPick(n.i);
}
// on respawn: swap in the chosen design (returns true when the bot changed)
function applyLoadout(P) {
  const i = LOADOUT.next; LOADOUT.next = null;
  if (i == null || i === P.bay || !bays[i] || loadoutIssue(bays[i], match.mode)) { P.pendingDesign = null; return false; }
  P.design = P.pendingDesign || bayCopy(bays[i], i); P.pendingDesign = null; P.bay = i;
  return true;
}
// after a (re)spawn: weapon groups and HUD follow the bot you are in now
function resetPlayerWeapons(P) {
  P.input.weapon = WTYPES.find(t => P.guns[t].length) || 'blaster';
  P.wg = botGroups(P, P.design); P.wgIdx = -1; P.input.group = null;
  if (P.wg.length) { P.wgIdx = 0; P.input.group = P.wg[0].types.slice(); P.input.groupMode = P.wg[0].mode; }
  if (typeof updateControlsHint === 'function') updateControlsHint();
}
// the card row shown while wrecked
function drawLoadoutBar(force) {
  if (HEADLESS) return;
  const P = match && match.player, show = !!(P && P.dead && !match.over && !match.spectator && match.mode !== 'test' && P.respawnT !== Infinity && state === 'battle');
  if (!LOADOUT.el) {
    const el = document.createElement('div'); el.id = 'loadoutBar'; el.hidden = true; $('#hud').appendChild(el); LOADOUT.el = el;
    el.addEventListener('pointerdown', e => { const c = e.target.closest('[data-bay]'); if (c) { e.stopPropagation(); loadoutPick(+c.dataset.bay); } });
  }
  const el = LOADOUT.el; if (!show) { if (!el.hidden) el.hidden = true; LOADOUT.sig = ''; return; }
  const list = loadoutList(match.mode); if (list.length < 2) { el.hidden = true; return; }
  const cur = LOADOUT.next != null ? LOADOUT.next : P.bay != null ? P.bay : deployBay(match.mode), sig = cur + '|' + list.map(x => x.i + x.why).join(',');
  el.hidden = false; if (!force && sig === LOADOUT.sig) return; LOADOUT.sig = sig;
  el.innerHTML = `<div class="lh">REBUILD AS · press ${list.filter(x => !x.why).map(x => x.i + 1).join(' ')}${PAD.on ? ' or LB / RB' : ''}</div>` + list.map(({ i, d, why }) => `<div class="lc${i === cur ? ' sel' : ''}${why ? ' bad' : ''}" data-bay="${i}"><i>${i + 1}</i><b></b><span>${why ? esc(why) : Math.round(computeStats(d.blocks).cpu) + ' CPU'}</span></div>`).join('');
  el.querySelectorAll('.lc b').forEach((b, k) => b.textContent = cleanName(list[k].d.name || '') || 'Bay ' + (list[k].i + 1));
}
Object.assign(window.__sfa, { LOADOUT, loadoutPick, loadoutList, deployDesign, deployBay, drawLoadoutBar, get bays() { return bays; } });
Object.assign(window.__sfa, { post, cam });
