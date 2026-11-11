// ================= DAILY QUESTS, ACHIEVEMENTS, BADGES =================
// Three quests a day, the same for every pilot (picked from the date). Achievements are permanent and
// unlock cosmetics: badges next to your name, the Headlamp and Exhaust Stack parts, and two paint finishes.
const ACH = [
  { id: 'first_win', name: 'First Victory', desc: 'Win a battle.', badge: '★', test: L => L.wins >= 1 },
  { id: 'kills_100', name: 'Centurion', desc: 'Destroy 100 bots.', reward: 'Headlamp part', test: L => L.kills >= 100 },
  { id: 'kills_500', name: 'Wrecking Crew', desc: 'Destroy 500 bots.', badge: '☠', test: L => L.kills >= 500 },
  { id: 'dmg_1m', name: 'Million Damage', desc: 'Deal 1,000,000 damage in total.', reward: 'Carbon finish', test: L => L.dmg >= 1e6 },
  { id: 'medic', name: 'Field Medic', desc: 'Repair 50,000 armor on teammates.', badge: '✚', test: L => L.heal >= 50000 },
  { id: 'movers', name: 'All-Terrain', desc: 'Win with five kinds of movement (wheels, treads, legs, hovers, flying, skis).', reward: 'Exhaust Stack part', test: L => Object.keys(L.moverWins || {}).length >= 5 },
  { id: 'core', name: 'Core Breaker', desc: 'Win a Battle Arena by destroying the enemy reactor.', badge: '⚛', test: L => L.reactorWins >= 1 },
  { id: 'pit_king', name: 'King of the Pit', desc: 'Win a match of The Pit.', badge: '♛', test: L => L.pitWins >= 1 },
  { id: 'quests_10', name: 'Daily Grinder', desc: 'Complete 10 daily quests.', reward: 'Gold finish', test: L => L.questsDone >= 10 },
  { id: 'lv10', name: 'Top Pilot', desc: 'Reach pilot level 10.', badge: '⚡', test: () => level() >= 10 },
];
const QUESTS = [
  { id: 'win2', text: 'Win 2 battles', goal: 2, xp: 250, key: s => s.win ? 1 : 0 },
  { id: 'kill15', text: 'Destroy 15 bots', goal: 15, xp: 220, key: s => s.kills },
  { id: 'dmg40', text: 'Deal 40,000 damage', goal: 40000, xp: 200, key: s => s.dmg },
  { id: 'plasma', text: 'Deal 15,000 damage with plasma launchers', goal: 15000, xp: 220, key: s => s.dmgW.plasma || 0 },
  { id: 'rail', text: 'Deal 15,000 damage with rail weapons', goal: 15000, xp: 220, key: s => (s.dmgW.rail || 0) + (s.dmgW.lancer || 0) },
  { id: 'blaster', text: 'Destroy 6 bots with blasters or chain guns', goal: 6, xp: 200, key: s => (s.killsW.blaster || 0) + (s.killsW.chain || 0) },
  { id: 'hoverwin', text: 'Win a battle with a hover bot', goal: 1, xp: 260, key: s => s.win && s.move === 'hover' ? 1 : 0 },
  { id: 'flywin', text: 'Win a battle with a flying bot', goal: 1, xp: 280, key: s => s.win && (s.move === 'rotor' || s.move === 'plane') ? 1 : 0 },
  { id: 'heal', text: 'Repair 6,000 armor with Nano Menders', goal: 6000, xp: 230, key: s => s.heal },
  { id: 'caps', text: 'Capture 3 beacons in Battle Arena', goal: 3, xp: 230, key: s => s.caps },
  { id: 'mods', text: 'Use modules 10 times', goal: 10, xp: 180, key: s => s.mods },
  { id: 'pit', text: 'Destroy 8 bots in The Pit', goal: 8, xp: 240, key: s => s.mode === 'pit' ? s.kills : 0 },
  { id: 'city', text: 'Play 2 battles in Rustgate Ruins', goal: 2, xp: 160, key: s => s.map === 'city' ? 1 : 0 },
  { id: 'moon', text: 'Play 2 battles on the Lunar Outpost', goal: 2, xp: 160, key: s => s.map === 'moon' ? 1 : 0 },
];
const dayNo = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
function dailyQuestIds(day) { const r = mulberry32(day * 7919 + 13), pool = QUESTS.map(q => q.id); for (let i = pool.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; } return pool.slice(0, 3); }
const PROG = Object.assign({ life: {}, ach: {}, q: null, badge: '', clan: null }, store.get('sfa.prog', {}));
PROG.life = Object.assign({ kills: 0, dmg: 0, heal: 0, wins: 0, moverWins: {}, reactorWins: 0, pitWins: 0, questsDone: 0 }, PROG.life);
function progSave() { store.set('sfa.prog', PROG); cloudDirty(); }
function questsToday() {
  const d = dayNo();
  if (!PROG.q || PROG.q.day !== d) PROG.q = { day: d, list: dailyQuestIds(d).map(id => ({ id, n: 0, done: false })) };
  return PROG.q;
}
const achDone = id => !!PROG.ach[id];
const unlockName = id => /^bp_/.test(id) ? 'battle pass' : 'the ' + ((ACH.find(a => a.id === id) || {}).name || 'matching') + ' achievement';
const partLocked = t => { const p = PARTS[t]; return !UNLOCK_ALL && !!(p && p.ach && !achDone(p.ach)); };
const finishLocked = f => !UNLOCK_ALL && !!(f && f.ach && !achDone(f.ach));
const myBadge = () => PROG.badge && (ACH.some(a => a.badge === PROG.badge && achDone(a.id)) || passBadges().some(r => r.v === PROG.badge && achDone(r.id))) ? PROG.badge : '';
// per-match counters on the player's bot
function statInit(b) { b.qs = { kills: 0, dmg: 0, heal: 0, caps: 0, mods: 0, dmgW: {}, killsW: {} }; }
function statDamage(att, dealt) { if (!att || !att.qs || dealt <= 0) return; att.qs.dmg += dealt; const w = att.input.weapon; att.qs.dmgW[w] = (att.qs.dmgW[w] || 0) + dealt; }
function statKill(att) { if (!att || !att.qs) return; att.qs.kills++; const w = att.input.weapon; att.qs.killsW[w] = (att.qs.killsW[w] || 0) + 1; }
// called once per finished battle (not test drives)
async function progMatchEnd(p, r) {
  if (!p.qs) return [];
  const s = { ...p.qs, heal: p.healed || 0, win: r.result === 'win', mode: r.mode, map: r.map, move: p.mob ? p.mob.mode : '' }, L = PROG.life, notes = [];
  L.kills += s.kills; L.dmg += s.dmg; L.heal += s.heal;
  if (s.win) { L.wins++; const mv = s.move === 'plane' || s.move === 'rotor' ? 'fly' : s.move; if (mv && mv !== 'none') L.moverWins[mv] = 1; if (r.mode === 'pit') L.pitWins++; if (r.mode === 'arena' && match.rx && match.rx[1 - p.team] <= 0) L.reactorWins++; }
  const Q = questsToday(); let xp = 0;
  for (const q of Q.list) {
    if (q.done) continue; const def = QUESTS.find(x => x.id === q.id); if (!def) continue;
    q.n = Math.min(def.goal, q.n + def.key(s));
    if (q.n >= def.goal) { q.done = true; L.questsDone++; xp += def.xp; notes.push(`Quest complete: ${def.text} (+${def.xp} XP)`); }
  }
  for (const a of ACH) if (!achDone(a.id) && a.test(L)) { PROG.ach[a.id] = Date.now(); notes.push(`Achievement: ${a.name}${a.badge ? ` (badge ${a.badge})` : a.reward ? ` (unlocks ${a.reward})` : ''} · +3 tech points`); }
  if (xp) await questReward(xp, Q.day);
  notes.push(...bpAdd((r.xp || 0) + xp));
  progSave();
  return notes;
}
async function questReward(xp, day) {
  if (BE.kind === 'server' && BE.me) { try { const res = await beApi('quest.claim', { day, xp }); BE.onSignedIn(res.me); } catch (e) { toast(e.message); } return; }
  progress.xp += xp; if (!progress.remote) store.set('sfa.progress', progress);
  if (BE.kind === 'artifact' && BE.me) { BE.me.xp = progress.xp; try { await artSave(); } catch (e) { } }
}
function showQuests() {
  const Q = questsToday(), left = 86400000 - ((Date.now() - new Date().getTimezoneOffset() * 60000) % 86400000);
  const qrows = Q.list.map(q => { const def = QUESTS.find(x => x.id === q.id) || { text: q.id, goal: 1, xp: 0 }; const f = Math.min(1, q.n / def.goal); return `<div class="qrow${q.done ? ' done' : ''}"><div><b>${esc(def.text)}</b><span>${q.done ? 'Done' : `${fmtN(q.n)} / ${fmtN(def.goal)}`} · +${def.xp} XP</span></div><div class="bar"><i style="width:${f * 100}%"></i></div></div>`; }).join('');
  const arows = ACH.map(a => `<div class="arow${achDone(a.id) ? ' got' : ''}"><span class="ab">${a.badge || '◆'}</span><div><b>${esc(a.name)}</b><span>${esc(a.desc)}${a.reward ? ' Unlocks the ' + esc(a.reward) + '.' : a.badge ? ' Badge: ' + a.badge : ''}</span></div>${achDone(a.id) && a.badge ? `<button data-b="${a.badge}" class="${PROG.badge === a.badge ? 'on' : ''}">${PROG.badge === a.badge ? 'Wearing' : 'Wear'}</button>` : ''}</div>`).join('');
  showOverlay(`<h2>Quests & achievements</h2><h3>TODAY'S QUESTS · new ones in ${Math.floor(left / 3600000)} h ${Math.floor(left % 3600000 / 60000)} min</h3><div class="qlist">${qrows}</div>
    <h3>ACHIEVEMENTS · ${ACH.filter(a => achDone(a.id)).length} of ${ACH.length}</h3><div class="alist">${arows}</div>
    <p style="font-size:13px">Badges show next to your name in battle, chat and the lobby.</p><div class="btns"><button class="primary" id="ovBack">Back</button></div>`, true);
  $('#ovBack').onclick = backToMenu;
  document.querySelectorAll('.arow button').forEach(b => b.onclick = () => { PROG.badge = PROG.badge === b.dataset.b ? '' : b.dataset.b; progSave(); lobbyPresence(); showQuests(); });
}
