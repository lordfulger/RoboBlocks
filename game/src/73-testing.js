// ================= PLAYTEST TOOLS =================
// Bug reports (F8), automatic error capture, player reports, after-match ratings, the F3 overlay,
// graphics auto-detect, "what's new", update and reconnect notices, ping, and live balance from the server.
const ERR = [];
const PERF = { fr: [], fps: 0, ms: 0, show: false, autoT: 0, autoN: 0, autoSum: 0 };
// ---------- where reports go ----------
async function sendReport(kind, data) {
  if (BE.kind === 'server') return beApi('report.' + kind, { ...data, name: NET.name });
  if (BE.kind === 'artifact' && BE.db) {
    const ref = BE.db.doc(`reports/${BE.uid}`), snap = await ref.get(), d = snap.exists ? snap.data() || {} : {};
    const key = { bug: 'bugs', error: 'errors', player: 'players', feedback: 'feedback' }[kind], list = Array.isArray(d[key]) ? d[key] : [];
    list.unshift({ ...data, who: NET.name, t: Date.now() }); d[key] = list.slice(0, kind === 'error' ? 20 : 15);
    await ref.set(d); return {};
  }
  throw new Error('local');
}
// ---------- script errors ----------
function noteError(msg, stack, where) {
  if (HEADLESS) return;
  const m = String(msg || 'Unknown error').slice(0, 300); if (/ResizeObserver|Script error\.?$/.test(m)) return;
  ERR.push({ msg: m, where: String(where || state).slice(0, 80), t: Date.now() }); if (ERR.length > 20) ERR.shift();
  if (ERR.filter(e => e.msg === m).length > 1 || ERR.length > 15) return; // one send per kind of error
  sendReport('error', { msg: m, stack: String(stack || '').slice(0, 1200), where: `${state}${match ? ' ' + match.mode + '/' + match.mapId : ''}`, ver: BC_VERSION }).catch(() => { });
}
if (!HEADLESS) {
  addEventListener('error', e => noteError(e.message, e.error && e.error.stack, e.filename ? e.filename.split('/').pop() + ':' + e.lineno : ''));
  addEventListener('unhandledrejection', e => { const r = e.reason; noteError(r && r.message || String(r), r && r.stack, 'promise'); });
}
function debugInfo() {
  const m = match;
  return { version: BC_VERSION, where: state, mode: m ? m.mode : null, map: m ? m.mapId : world.mapId, time: world.tod, online: !!NET.game, server: NET.game ? NET.game.code : null, provider: BE.kind,
    browser: navigator.userAgent.slice(0, 180), screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, graphics: settings.quality, fps: PERF.fps, ping: NET.ping || null,
    bots: m ? world.bots.length : 0, level: level(), errors: ERR.slice(-8).map(e => e.msg + ' @ ' + e.where) };
}
// ---------- bug report ----------
function showBugReport() {
  const wasPaused = paused; if (state === 'battle' && match && !match.net) paused = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const info = debugInfo();
  showOverlay(`<h2>Report a bug</h2><p>What happened, and what did you expect? Steps to make it happen again help a lot.</p>
    <textarea id="brText" rows="5" maxlength="2000" style="width:100%" placeholder="e.g. My hover bot fell through the ice on Frostline after a boost."></textarea>
    <p style="font-size:12px;color:var(--muted)">Sent with: version ${esc(info.version)}, ${esc(info.where)}${info.mode ? ', ' + esc(info.mode) + ' on ' + esc(info.map) : ''}, your browser, frame rate${info.ping ? ', ping' : ''} and ${ERR.length} recent error message${ERR.length === 1 ? '' : 's'}.</p>
    <p id="brMsg" class="err" hidden></p>
    <div class="btns"><button class="primary" id="brSend">Send report</button><button id="brBack">Cancel</button></div>`, true);
  $('#brText').addEventListener('keydown', e => e.stopPropagation()); setTimeout(() => $('#brText').focus(), 50);
  const close = () => { hideOverlay(); paused = wasPaused; if (state === 'battle' && paused) showPause(); };
  $('#brBack').onclick = close;
  $('#brSend').onclick = async () => {
    const text = $('#brText').value.trim(); if (text.length < 5) { $('#brMsg').hidden = false; $('#brMsg').textContent = 'Please describe the problem in a few words.'; return; }
    try { await sendReport('bug', { text, info }); toast('Thanks! Your report was sent.'); close(); }
    catch (e) {
      if (e.message !== 'local') { $('#brMsg').hidden = false; $('#brMsg').textContent = e.message; return; }
      // offline: let them copy it
      const all = `RoboBlocks bug report\n${text}\n\n${JSON.stringify(info, null, 2)}`;
      showOverlay(`<h2>Report a bug</h2><p>This copy of the game is not connected to a server, so copy the report below and send it to whoever runs your game.</p><textarea id="brAll" rows="10" readonly style="width:100%;font:12px monospace"></textarea><div class="btns"><button class="primary" id="brCopy">Copy</button><button id="brBack">Close</button></div>`, true);
      $('#brAll').value = all; $('#brCopy').onclick = async () => { try { await navigator.clipboard.writeText(all); toast('Copied.'); } catch (err) { $('#brAll').select(); } }; $('#brBack').onclick = close;
    }
  };
}
// ---------- report a player ----------
function reportablePilots() {
  const out = [];
  if (match && match.net) for (const b of world.bots) if (b.human && b.remote) out.push({ name: b.name, where: `${match.mode}/${match.mapId}` });
  for (const p of NET.lobbyPeers || []) if (!p.sameTab && p.presence && p.presence.bc && !p.presence.srv && !out.some(o => o.name.endsWith(cleanName(p.presence.name)))) out.push({ name: cleanName(p.presence.name) || 'Pilot', where: 'lobby' });
  return out;
}
function showReportPlayer(prefill) {
  const list = reportablePilots(); if (document.pointerLockElement) document.exitPointerLock();
  if (!list.length && !prefill) { toast('There are no other pilots to report right now.'); return; }
  showOverlay(`<h2>Report a player</h2><p>Reports go to the people who run this game. Mute someone in chat with /mute name.</p>
    <div class="srow"><label for="rpWho">Pilot</label><select id="rpWho">${list.map(p => `<option>${esc(p.name)}</option>`).join('')}${prefill && !list.some(p => p.name === prefill) ? `<option selected>${esc(prefill)}</option>` : ''}</select><span></span></div>
    <div class="srow"><label for="rpWhy">Reason</label><select id="rpWhy"><option>Cheating</option><option>Abusive chat</option><option>Griefing or team-killing</option><option>Offensive name or bot</option><option>Other</option></select><span></span></div>
    <textarea id="rpText" rows="3" maxlength="500" style="width:100%" placeholder="What happened? (optional)"></textarea>
    <div class="btns"><button class="primary" id="rpSend">Send report</button><button id="rpBack">Cancel</button></div>`, true);
  if (prefill) $('#rpWho').value = prefill;
  $('#rpText').addEventListener('keydown', e => e.stopPropagation());
  const back = () => { hideOverlay(); if (state === 'battle' && paused) showPause(); };
  $('#rpBack').onclick = back;
  $('#rpSend').onclick = async () => {
    const target = $('#rpWho').value, w = list.find(p => p.name === target);
    try { await sendReport('player', { target, reason: $('#rpWhy').value + ($('#rpText').value.trim() ? ': ' + $('#rpText').value.trim() : ''), where: w ? w.where : '' }); toast('Report sent. Thank you.'); back(); }
    catch (e) { toast(e.message === "local" ? "Reports go to a RoboBlocks server. Open your server address to send one." : e.message); }
  };
}
// ---------- after-match rating (every fifth battle) ----------
function surveyHtml() {
  if (BE.kind === 'local' || !progress.matches || progress.matches % 5) return '';
  return `<div class="survey" id="survey"><span>How was that match?</span><button data-r="fun">Fun</button><button data-r="ok">OK</button><button data-r="bad">Frustrating</button><input id="svText" maxlength="600" placeholder="Anything to add? (optional)"></div>`;
}
function wireSurvey(mode, map) {
  const el = $('#survey'); if (!el) return;
  $('#svText').addEventListener('keydown', e => e.stopPropagation());
  el.querySelectorAll('button').forEach(b => b.onclick = async () => { try { await sendReport('feedback', { rating: b.dataset.r, text: $('#svText').value.trim(), mode, map }); el.innerHTML = '<span>Thanks for the feedback!</span>'; } catch (e) { el.innerHTML = '<span>' + esc(e.message === 'local' ? 'Thanks!' : e.message) + '</span>'; } });
}
// ---------- F3 overlay and graphics auto-detect ----------
function perfTick(dt) {
  if (HEADLESS) return;
  const now = performance.now(), real = Math.min(1, (now - (PERF.last || now)) / 1000) || dt; PERF.last = now; PERF.fr.push(real); // real time: the game clamps dt on slow frames if (PERF.fr.length > 60) PERF.fr.shift();
  const avg = PERF.fr.reduce((s, v) => s + v, 0) / PERF.fr.length; PERF.ms = avg * 1000; PERF.fps = Math.round(1 / Math.max(.001, avg));
  // first battle on High: if it runs under ~28 fps for a while, switch to Fast once
  if (state === 'battle' && hiQ() && !store.get('sfa.autoQ', false) && !paused) {
    PERF.autoT += real; if (PERF.autoT > 3) { PERF.autoN++; PERF.autoSum += real; }
    if (PERF.autoN >= 240 || PERF.autoSum >= 5) {
      store.set('sfa.autoQ', true);
      if (PERF.autoSum / PERF.autoN > 1 / 28) { const was = settings.quality; settings.quality = was === 'ultra' ? 'high' : 'low'; saveSettings(); applyQuality(); toast(`Graphics switched to ${was === 'ultra' ? 'High' : 'Fast'} for smoother play. You can change this in Settings.`); if (was === 'ultra') { store.set('sfa.autoQ', false); PERF.autoN = PERF.autoSum = PERF.autoT = 0; } }
    }
  }
  if (!PERF.show) return;
  PERF.uiT = (PERF.uiT || 0) - real; if (PERF.uiT > 0) return; PERF.uiT = .25;
  const ri = renderer.info && renderer.info.render || {};
  $('#perf').textContent = `${PERF.fps} fps · ${PERF.ms.toFixed(1)} ms\n${NET.ping ? 'ping ' + NET.ping + ' ms' : NET.game ? 'ping n/a' : 'offline'}\ndraw calls ${ri.calls || 0} · tris ${((ri.triangles || 0) / 1000).toFixed(0)}k\n${match ? world.bots.length + ' bots · ' + world.projs.length + ' shots · ' + (world.P ? world.P.n : 0) + ' particles' : state}\n${settings.quality === 'high' ? 'High' : 'Fast'}${settings.ao === false ? ' · no shadowing' : ''}${settings.reflections === false ? ' · no reflections' : ''} · v${BC_VERSION}`;
}
// ---------- what's new ----------
function showWhatsNew(force) {
  const seen = store.get('sfa.seenVer', '');
  if (!force && (seen === BC_VERSION || HEADLESS)) return;
  store.set('sfa.seenVer', BC_VERSION);
  if (!force && !seen && !progress.matches) return; // brand-new players get the tutorial instead
  const items = CHANGELOG.filter(([v]) => force || !seen || v > seen).slice(0, force ? 3 : 2);
  showOverlay(`<h2>What's new</h2>${items.map(([v, list]) => `<h3>VERSION ${esc(v)}</h3><ul class="news">${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}
    <p style="font-size:13px">Found a bug? Press <b>F8</b> anywhere.</p><div class="btns"><button class="primary" id="ovBack">Let's go</button></div>`, true);
  $('#ovBack').onclick = backToMenu;
}
// ---------- server notices: newer version, balance, connection ----------
function serverVersion(v) {
  NET.serverVersion = v;
  const el = $('#updBanner'); if (!el) return;
  el.hidden = !(v && v !== BC_VERSION && !HEADLESS);
  if (!el.hidden) { el.querySelector('span').textContent = HOST ? `RoboBlocks ${v} is out. Restart to update.` : `A newer version of RoboBlocks (${v}) is on this server.`; if (HOST) el.querySelector('button').textContent = 'Restart now'; }
}
const BASE_DMG = {}; for (const t of WTYPES) BASE_DMG[t] = { dmg: WEAPONS[t].dmg, heal: WEAPONS[t].heal }; BASE_DMG.tesla = { dmg: TESLA.dmg };
function applyBalance(b) {
  if (!b || typeof b !== 'object') return;
  const wd = b.weaponDamage || {};
  for (const t of WTYPES) { const k = Number.isFinite(+wd[t]) ? +wd[t] : 1; if (BASE_DMG[t].dmg != null) WEAPONS[t].dmg = BASE_DMG[t].dmg * k; if (BASE_DMG[t].heal != null) WEAPONS[t].heal = BASE_DMG[t].heal * k; }
  TESLA.dmg = BASE_DMG.tesla.dmg * (Number.isFinite(+wd.tesla) ? +wd.tesla : 1);
  BAL.weaponDamage = wd; BAL.xpRate = +b.xpRate || 1; BAL.cpuBonus = Math.round(+b.cpuBonus || 0); BAL.reactorHealth = +b.reactorHealth || 1; BAL.respawnSeconds = +b.respawnSeconds || 6;
  if (!HEADLESS && state === 'garage') updateStats();
}
function netBanner(lost) { const el = $('#netBanner'); if (el && !HEADLESS) { el.hidden = !lost; document.body.classList.toggle('netlost', !!lost); } }
// after a reconnect the relay gives us a new id, so rejoin the game we were in
NET.onReconnect = () => {
  netBanner(false); NET.me = myPeer();
  const g = NET.game; if (!g || HEADLESS) return;
  const { code, server, spec } = g, wasBattle = g.inBattle;
  netLeave(); if (wasBattle) leaveBattleView();
  toast('Reconnected. Rejoining your game…'); joinGame(code, server, null, spec, NET.lastPw);
};
// ---------- ping (dedicated servers) ----------
if (!HEADLESS) setInterval(async () => {
  if (BE.kind !== 'server' || !NET.room || !NET.room.api) return;
  const t0 = performance.now(); try { await NET.room.api('ping'); NET.ping = Math.round(performance.now() - t0); } catch (e) { }
}, 5000);
// ---------- password change ----------
function showChangePassword(back) {
  showOverlay(`<h2>Change password</h2>
    <div class="srow"><label for="cpOld">Current password</label><input id="cpOld" type="password" autocomplete="current-password"><span></span></div>
    <div class="srow"><label for="cpNew">New password</label><input id="cpNew" type="password" autocomplete="new-password" maxlength="72"><span></span></div>
    <p id="cpMsg" class="err" hidden></p><p style="font-size:13px">Forgot it? Ask an admin to reset it; they will give you a temporary one.</p>
    <div class="btns"><button class="primary" id="cpGo">Change</button><button id="cpBack">Back</button></div>`);
  for (const id of ['#cpOld', '#cpNew']) $(id).addEventListener('keydown', e => e.stopPropagation());
  $('#cpBack').onclick = back || backToMenu;
  $('#cpGo').onclick = async () => { try { const r = await beApi('account.changePw', { old: $('#cpOld').value, pw: $('#cpNew').value }); BE.token = r.token; store.set('sfa.token', r.token); toast('Password changed.'); (back || backToMenu)(); } catch (e) { $('#cpMsg').hidden = false; $('#cpMsg').textContent = e.message; } };
}
// ---------- wiring ----------
(() => {
  if (HEADLESS) return;
  addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'F8') { e.preventDefault(); showBugReport(); }
    if (e.code === 'F3') { e.preventDefault(); PERF.show = !PERF.show; $('#perf').hidden = !PERF.show; }
  }, true);
  $('#updBanner button').onclick = () => { if (HOST && HOST.restart) HOST.restart(); else location.reload(); };
  // the desktop app downloads updates in the background and says when one is ready
  if (HOST && HOST.onUpdate) HOST.onUpdate(v => { const el = $('#updBanner'); if (!el) return; el.hidden = false; el.querySelector('span').textContent = `RoboBlocks ${v} is downloaded. Restart to play it.`; el.querySelector('button').textContent = 'Restart now'; });
  $('#mBug').onclick = () => { SFX.ui(); showBugReport(); };
  $('#mNews').onclick = () => { SFX.ui(); showWhatsNew(true); };
})();
