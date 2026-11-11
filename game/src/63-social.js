// ================= PROFILE, LEADERBOARDS, ROBOT SHOP, ADMIN (screens) =================
const fmtN = n => Math.round(+n || 0).toLocaleString();
const ago = t => { const s = (Date.now() - t) / 1000; return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
const backToMenu = () => { hideOverlay(); if (state === 'menu') buildPilotCard(); };
// two-step buttons instead of confirm() dialogs, which sandboxed pages may block
function armed(btn) { if (btn.dataset.armed) return true; const t = btn.textContent; btn.dataset.armed = '1'; btn.textContent = 'Sure?'; setTimeout(() => { delete btn.dataset.armed; btn.textContent = t; }, 3000); return false; }
function errBox(e) { return `<p class="err">${esc(e && e.message || e)}</p>`; }
// ---------- design thumbnails ----------
let THUMB = null; const THUMBS = new Map();
function designThumb(d, key) {
  if (THUMBS.has(key)) return THUMBS.get(key);
  let url = '';
  try {
    if (!THUMB) {
      const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(220, 150); r.setPixelRatio(1); r.toneMapping = T.ACESFilmicToneMapping;
      const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x334455, 1.4)); const dl = new T.DirectionalLight(0xffffff, 1.9); dl.position.set(4, 7, 5); sc.add(dl);
      THUMB = { r, sc, cam: new T.PerspectiveCamera(30, 220 / 150, .1, 400) };
    }
    const g = new T.Group(), box = new T.Box3();
    for (const b of d.blocks.slice(0, 700)) { if (!PARTS[b.t]) continue; const p = makePart(b.t, b.c, b.r || 0, isShape(b.t) ? (b.k || 1) : undefined, d.f || 'standard'); p.root.position.set(b.x, b.y, b.z); g.add(p.root); }
    box.setFromObject(g); const c = box.getCenter(new T.Vector3()), s = box.getSize(new T.Vector3()), R = Math.max(2, s.length() * .5);
    THUMB.sc.add(g); const dist = R / Math.sin(15 * Math.PI / 180) * .78;
    THUMB.cam.position.set(c.x + dist * .62, c.y + dist * .42, c.z + dist * .68); THUMB.cam.lookAt(c);
    THUMB.r.setClearColor(0x000000, 0); THUMB.r.clear(); THUMB.r.render(THUMB.sc, THUMB.cam); url = THUMB.r.domElement.toDataURL();
    THUMB.sc.remove(g); g.traverse(o => { if (o.isMesh && o.geometry && o.geometry.userData && o.geometry.userData.own) o.geometry.dispose(); });
  } catch (e) { url = ''; }
  THUMBS.set(key, url); return url;
}
// ---------- sign in (dedicated servers) ----------
function showAccount(after) {
  const go = after || backToMenu;
  if (BE.kind !== 'server') { go(); return; }
  if (BE.me) {
    showOverlay(`<h2>${esc(BE.me.name)}</h2><p>Signed in to this server. Your level, XP, rating and match history are saved here, so they follow you to any browser.</p>
      <div class="btns"><button class="primary" id="ovProf">Profile</button><button id="ovPw">Change password</button><button id="ovOut">Sign out</button><button id="ovBack">Back</button></div>`);
    $('#ovProf').onclick = () => showProfile(); $('#ovBack').onclick = go; $('#ovPw').onclick = () => showChangePassword(() => showAccount(after));
    $('#ovOut').onclick = async () => { try { await beApi('logout', { token: BE.token }); } catch (e) { } BE.onSignedOut(); toast('Signed out.'); go(); };
    return;
  }
  showOverlay(`<h2>Pilot account</h2>
    <p>An account on this server keeps your level and history safe, puts you on the leaderboards, and lets you play ranked servers and share robots in the shop. Without one you play as a guest and progress stays in this browser.</p>
    <div class="srow"><label for="acName">Pilot name</label><input id="acName" maxlength="16" autocomplete="username" spellcheck="false"><span></span></div>
    <div class="srow"><label for="acPw">Password</label><input id="acPw" type="password" maxlength="72" autocomplete="current-password"><span></span></div>
    <p id="acMsg" class="err" hidden></p>
    <p style="font-size:13px">A new account starts at level 1. Only XP earned on this server counts toward it.</p>
    <div class="btns"><button class="primary" id="acIn">Sign in</button><button id="acNew">Create account</button><button id="ovBack">Back</button></div>`);
  for (const id of ['#acName', '#acPw']) $(id).addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#acIn').click(); });
  const msg = t => { $('#acMsg').hidden = !t; $('#acMsg').textContent = t || ''; };
  const run = async op => {
    const name = $('#acName').value.trim(), pw = $('#acPw').value;
    if (!name || !pw) { msg('Enter a pilot name and a password.'); return; }
    msg(''); $('#acIn').disabled = $('#acNew').disabled = true;
    try { const r = await beApi(op, { name, pw }); BE.onSignedIn(r.me, r.token); toast(op === 'register' ? `Welcome, ${r.me.name}!` : `Signed in as ${r.me.name}.`); go(); }
    catch (e) { msg(e.message); $('#acIn').disabled = $('#acNew').disabled = false; }
  };
  $('#acIn').onclick = () => run('login'); $('#acNew').onclick = () => run('register'); $('#ovBack').onclick = go;
  setTimeout(() => $('#acName').focus(), 50);
}
// ---------- profile + history ----------
async function showProfile() {
  showOverlay('<h2>Profile</h2><p>Loading…</p>', true);
  let p; try { p = await beProfile(); } catch (e) { showOverlay('<h2>Profile</h2>' + errBox(e) + '<div class="btns"><button class="primary" id="ovBack">Back</button></div>', true); $('#ovBack').onclick = backToMenu; return; }
  const rk = rankOf(p.elo || 1200), kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : (p.kills || 0).toFixed(2);
  const where = BE.kind === 'server' ? (BE.me ? 'Saved on this server.' : 'Guest: saved in this browser only. Sign in to keep it on the server.') : 'Saved in this browser.';
  const rows = (p.history || []).map(h => `<tr><td>${esc(ago(h.t))}</td><td>${esc((MODES[h.mode] || { name: h.mode || '?' }).name)}${h.practice ? ' <small>practice</small>' : ''}</td><td>${esc((MAPS[h.map] || { name: h.map || '' }).name)}</td><td class="${h.result === 'win' ? 'win' : h.result === 'loss' ? 'lose' : ''}">${h.result === 'win' ? 'Victory' : h.result === 'loss' ? 'Defeat' : 'Draw'}</td><td class="num">${h.kills | 0} / ${h.deaths | 0}</td><td class="num">${fmtN(h.dmg)}</td><td class="num">+${fmtN(h.xp)}${h.elo ? ` <small>${h.elo > 0 ? '+' : ''}${h.elo}</small>` : ''}</td></tr>`).join('');
  showOverlay(`<h2>${esc(p.name || NET.name || 'Pilot')}</h2><p>${where}</p>
    <div class="grid stats6"><div><span class="label">Level</span><b class="num">${p.lv}</b></div><div><span class="label">XP</span><b class="num">${fmtN(p.xp)}</b></div><div><span class="label">Wins</span><b class="num">${p.wins} / ${p.matches}</b></div>
    <div><span class="label">Kills · K/D</span><b class="num">${fmtN(p.kills)} · ${kd}</b></div><div><span class="label">Damage</span><b class="num">${fmtN(p.dmg)}</b></div><div><span class="label">Rating</span><b class="num" style="color:${rk.col}">${fmtN(p.elo || 1200)} ${rk.name}</b></div></div>
    <h3>MATCH HISTORY</h3>
    ${rows ? `<div class="tscroll"><table class="tbl"><thead><tr><th>When</th><th>Mode</th><th>Map</th><th>Result</th><th>K / D</th><th>Damage</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>No battles yet. Your last 25 matches show up here.</p>'}
    <div class="btns">${BE.kind === 'server' ? `<button id="ovAcct">${BE.me ? 'Account' : 'Sign in'}</button>` : ''}<button class="primary" id="ovBack">Back</button></div>`, true);
  $('#ovBack').onclick = backToMenu; if ($('#ovAcct')) $('#ovAcct').onclick = () => showAccount(showProfile);
}
// ---------- leaderboards ----------
async function showLeaderboard(sort = 'xp') {
  const tabs = [['xp', 'Experience'], ['wins', 'Wins'], ['kills', 'Kills'], ['elo', 'Rating']];
  const head = `<h2>Leaderboards</h2><div class="seg tabs">${tabs.map(([k, n]) => `<button data-k="${k}" class="${k === sort ? 'sel' : ''}">${n}</button>`).join('')}</div>`;
  showOverlay(head + '<p>Loading…</p>', true);
  const wire = () => { document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showLeaderboard(b.dataset.k)); $('#ovBack').onclick = backToMenu; };
  let list;
  try { list = await beLeaderboard(sort); }
  catch (e) { showOverlay(head + errBox(e) + '<div class="btns"><button class="primary" id="ovBack">Back</button></div>', true); wire(); return; }
  const meName = BE.me && BE.me.name;
  const rows = list.map((r, i) => { const rk = rankOf(r.elo || 1200); return `<tr class="${r.me || (meName && r.name === meName) ? 'me' : ''}"><td class="num">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.lv}</td><td class="num">${fmtN(r.xp)}</td><td class="num">${r.wins}</td><td class="num">${fmtN(r.kills)}</td><td class="num" style="color:${rk.col}">${fmtN(r.elo || 1200)} <small>${rk.name}</small></td></tr>`; }).join('');
  showOverlay(head + (rows ? `<div class="tscroll"><table class="tbl"><thead><tr><th>#</th><th>Pilot</th><th>Lv</th><th>XP</th><th>Wins</th><th>Kills</th><th>Rating</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Nobody has finished a battle yet. Be the first.</p>')
    + `<p style="font-size:13px">${BE.kind === 'server' ? 'Rating changes only on ranked servers. ' : ''}Brackets: ${RANKS.map(r => `<span style="color:${r[2]}">${r[1]}</span>`).join(' · ')}</p><div class="btns"><button class="primary" id="ovBack">Back</button></div>`, true);
  wire();
}
// ---------- robot shop ----------
async function showShop(sort = 'top') {
  const tabs = [['top', 'Top rated'], ['new', 'Newest'], ['dl', 'Most downloaded'], ['mine', 'My robots']];
  const signedOut = BE.kind === 'server' && !BE.me;
  const head = `<h2>Robot Shop</h2><p>Share your designs and try other pilots' robots. Downloads go into your current garage bay (${esc(design.name || 'Bay ' + (bayIdx + 1))}).</p>
    <div class="seg tabs">${tabs.map(([k, n]) => `<button data-k="${k}" class="${k === sort ? 'sel' : ''}">${n}</button>`).join('')}</div>`;
  showOverlay(head + '<p>Loading…</p>', true);
  const foot = `<div class="btns"><button class="primary" id="shPub">Share current bay</button>${signedOut ? '<button id="ovAcct">Sign in</button>' : ''}<button id="ovBack">Back</button></div>`;
  const wire = () => {
    document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showShop(b.dataset.k));
    $('#ovBack').onclick = backToMenu; if ($('#ovAcct')) $('#ovAcct').onclick = () => showAccount(() => showShop(sort));
    $('#shPub').onclick = async () => {
      const d = gSerialize(), why = designIssue(d, level(), true);
      if (why) { toast('Only battle-ready bots can be shared: ' + why); return; }
      try { await beShopPublish(d); toast(`${d.name} is in the shop.`); showShop('mine'); } catch (e) { toast(e.message); }
    };
  };
  let list;
  try { list = await beShopList(sort); }
  catch (e) { showOverlay(head + errBox(e) + foot, true); wire(); return; }
  showOverlay(head + (list.length ? '<div class="shop" id="shopGrid"></div>' : `<p>${sort === 'mine' ? 'You have not shared a robot yet. Build one, then press Share current bay.' : 'The shop is empty. Share the first robot!'}</p>`) + foot, true);
  wire();
  const grid = $('#shopGrid'); if (!grid) return;
  for (const it of list) {
    let d; try { d = decodeDesign(it.d); } catch (e) { continue; } if (!d.blocks.length) continue;
    const card = document.createElement('div'); card.className = 'scard';
    const img = document.createElement('img'); img.alt = ''; img.width = 220; img.height = 150;
    const nm = document.createElement('b'); nm.textContent = it.name;
    const by = document.createElement('span'); by.className = 'by'; by.textContent = `by ${it.author} · ${ago(it.t)}`;
    const meta = document.createElement('span'); meta.className = 'meta'; const locked = it.lv > level();
    meta.textContent = `CPU ${it.cpu} · Lv ${it.lv}${locked ? ' (locked)' : ''} · ⬇ ${it.dl}`;
    const row = document.createElement('div'); row.className = 'srow2';
    const up = document.createElement('button'); up.textContent = `▲ ${it.score}`; up.className = it.my > 0 ? 'on' : ''; up.title = 'Good robot';
    const dn = document.createElement('button'); dn.textContent = '▼'; dn.className = it.my < 0 ? 'on' : ''; dn.title = 'Not good';
    const get = document.createElement('button'); get.className = 'primary'; get.textContent = 'Download';
    if (it.mine) { up.disabled = dn.disabled = true; }
    const vote = async v => { try { await beShopVote(it.key, it.my === v ? 0 : v); showShop(sort); } catch (e) { toast(e.message); } };
    up.onclick = () => vote(1); dn.onclick = () => vote(-1);
    get.onclick = async () => {
      try {
        const r = await beShopGet(it), nd = decodeDesign(r.d); nd.name = cleanName(r.name) || 'Shop robot';
        pushUndo(); gLoad(nd); design = gSerialize(); saveBays(); updateStats();
        toast(locked ? `${nd.name} loaded. Some parts unlock at level ${it.lv}; swap them out to deploy.` : `${nd.name} loaded into ${nd.name ? 'your current bay' : 'the bay'}.`);
        hideOverlay(); toGarage();
      } catch (e) { toast(e.message); }
    };
    row.append(up, dn, get);
    if (it.mine || BE.admin) { const del = document.createElement('button'); del.textContent = 'Delete'; del.onclick = async () => { if (!armed(del)) return; try { await beShopDelete(it); showShop(sort); } catch (e) { toast(e.message); } }; row.append(del); }
    card.append(img, nm, by, meta, row); grid.appendChild(card);
    setTimeout(() => { img.src = designThumb(d, it.key) || ''; }, 0);
  }
}
// ---------- admin ----------
async function showAdmin() {
  if (!BE.admin) return;
  showOverlay('<h2>Admin</h2><p>Loading…</p>', true);
  let players = [], bans = { names: [], ips: [] };
  try { [players, bans] = await Promise.all([beAdmin('players'), beAdmin('bans')]); }
  catch (e) { showOverlay('<h2>Admin</h2>' + errBox(e) + '<div class="btns"><button class="primary" id="ovBack">Back</button></div>', true); $('#ovBack').onclick = backToMenu; return; }
  const art = BE.kind === 'artifact';
  showOverlay(`<h2>Admin</h2>
    <h3>MESSAGE OF THE DAY</h3><div class="srow"><input id="adMotd" maxlength="300" placeholder="Shown at the top of the server list" style="grid-column:1/3"><button id="adMotdSet">Set</button></div>
    <h3>PILOTS ONLINE</h3><div class="glist" id="adPl"></div>
    <h3>BANS</h3><div class="glist" id="adBans"></div>
    ${art ? '<h3>BUG REPORTS AND FEEDBACK</h3><div class="glist" id="adReps"><p class="gempty">Loading…</p></div><p style="font-size:13px">Here, a kick blocks the pilot from multiplayer for 10 minutes and a ban until you lift it. Both take effect the next time they open the game.</p>' : '<p style="font-size:13px">Bug reports, error logs, match stats, balance and password resets are on the web admin page: <a href="/admin" target="_blank">/admin</a>. The server console has more: <code>help</code> lists every command.</p>'}
    <div class="btns"><button class="primary" id="ovBack">Back</button></div>`, true);
  $('#adMotd').value = NET.motd || ''; $('#adMotd').addEventListener('keydown', e => e.stopPropagation());
  $('#adMotdSet').onclick = async () => { try { await beAdmin('motd', { text: $('#adMotd').value }); NET.motd = $('#adMotd').value; toast('Message of the day updated.'); } catch (e) { toast(e.message); } };
  $('#ovBack').onclick = backToMenu;
  const pl = $('#adPl');
  if (!players.length) pl.innerHTML = '<p class="gempty">Nobody else is online.</p>';
  for (const p of players) {
    const r = document.createElement('div'); r.className = 'grow';
    const info = document.createElement('div'); const b = document.createElement('b'); b.textContent = (p.acct || p.name) + (p.admin ? ' (admin)' : p.acct ? '' : ' (guest)');
    const s = document.createElement('span'); s.textContent = `${p.sv ? 'in ' + p.sv : 'in the menu'}${p.ip ? ' · ' + p.ip : ''}`; info.append(b, s);
    const k = document.createElement('button'); k.textContent = 'Kick'; k.onclick = async () => { try { await beAdmin('kick', { id: p.id }); toast('Kicked.'); showAdmin(); } catch (e) { toast(e.message); } };
    const bn = document.createElement('button'); bn.textContent = 'Ban'; bn.onclick = async () => { if (!armed(bn)) return; try { await beAdmin('ban', { id: p.id }); toast('Banned.'); showAdmin(); } catch (e) { toast(e.message); } };
    if (p.admin) k.disabled = bn.disabled = true;
    r.append(info, k, bn); pl.appendChild(r);
  }
  if (art && $('#adReps')) BE.db.collection('reports').get().then(snap => {
    const items = []; for (const d of snap.docs) { const x = d.data() || {}; for (const k of ['bugs', 'players', 'feedback', 'errors']) for (const it of x[k] || []) items.push({ k, ...it }); }
    items.sort((a, b) => (b.t || 0) - (a.t || 0));
    const el = $('#adReps'); el.innerHTML = items.length ? '' : '<p class="gempty">Nothing reported yet.</p>';
    for (const it of items.slice(0, 60)) { const r = document.createElement('div'); r.className = 'grow'; const i = document.createElement('div'); const b = document.createElement('b'); b.textContent = { bugs: 'Bug', players: 'Player report', feedback: 'Feedback', errors: 'Error' }[it.k] + ' · ' + (it.who || 'Pilot'); const s = document.createElement('span'); s.textContent = (it.text || it.msg || (it.target ? it.target + ': ' + it.reason : '') || it.rating || '').slice(0, 300) + (it.info ? ' · ' + (it.info.version || '') + ' ' + (it.info.where || '') : ''); i.append(b, s); r.append(i); el.appendChild(r); }
  }).catch(() => { $('#adReps').innerHTML = '<p class="gempty">Could not load reports.</p>'; });
  const bl = $('#adBans'), all = bans.names.map(x => ['acct', x]).concat(bans.ips.map(x => ['ip', x]));
  if (!all.length) bl.innerHTML = '<p class="gempty">Nobody is banned.</p>';
  for (const [kind, x] of all) {
    const r = document.createElement('div'); r.className = 'grow';
    const info = document.createElement('div'); const b = document.createElement('b'); b.textContent = art ? 'Pilot ' + x.slice(0, 10) : x; const s = document.createElement('span'); s.textContent = kind === 'ip' ? 'address' : art ? 'account' : 'account'; info.append(b, s);
    const u = document.createElement('button'); u.textContent = 'Unban'; u.onclick = async () => { try { await beAdmin('unban', { x }); showAdmin(); } catch (e) { toast(e.message); } };
    r.append(info, u); bl.appendChild(r);
  }
}
// in-game admin shortcuts typed into chat: /kick name, /ban name, /motd text
function adminHelp() { return BE.admin ? ', /kick name, /ban name, /motd text' : ''; }
function adminCommand(cmd, rest) {
  if (!BE.admin || !['kick', 'ban', 'motd'].includes(cmd)) return false;
  const arg = rest.join(' ').trim();
  if (cmd === 'motd') { beAdmin('motd', { text: arg }).then(() => chatLocal('MOTD updated.'), e => chatLocal(e.message)); return true; }
  beAdmin('players').then(list => {
    const q = arg.toLowerCase(), p = list.find(x => (x.acct || '').toLowerCase() === q || x.name.toLowerCase() === q);
    if (!p) { chatLocal(`Nobody online called ${arg}.`); return; }
    return beAdmin(cmd, { id: p.id }).then(() => chatLocal(`${cmd === 'kick' ? 'Kicked' : 'Banned'} ${p.acct || p.name}.`));
  }).catch(e => chatLocal(e.message));
  return true;
}
