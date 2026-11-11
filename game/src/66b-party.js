// ================= PARTIES AND CLANS =================
// Party: invite pilots from the lobby. Members follow the leader into games and are kept on one team.
// Clans: a tag shown before your name, a clan page and a clan leaderboard.
const PARTY = { seenInv: new Map(), inv: null };
const pilotTag = pr => `${pr && pr.bd ? pr.bd + ' ' : ''}${pr && pr.clan ? '[' + String(pr.clan).replace(/[^A-Z0-9]/gi, '').slice(0, 5) + '] ' : ''}${cleanName(pr && pr.name) || 'Pilot'}`;
const myClan = () => BE.kind === 'server' ? (BE.me && BE.me.clan) || null : BE.kind === 'artifact' ? (PROG.clan || null) : null;
function partyMembers() { if (!NET.party) return []; return NET.lobbyPeers.filter(p => p.presence && p.presence.party === NET.party.id); }
function partyInvite(peer) {
  if (!NET.party) NET.party = { id: NET.me, leader: NET.me };
  if (NET.party.leader !== NET.me) { toast('Only the party leader can invite.'); return; }
  PARTY.inv = { to: peer, pid: NET.party.id, t: Date.now() }; lobbyPresence(); toast('Invite sent.');
}
function partyLeave() { NET.party = null; PARTY.inv = null; lobbyPresence(); renderParty(); toast('You left the party.'); }
// lobby peers changed: invites, leader moves, party upkeep
function partyTick() {
  if (HEADLESS) return;
  for (const p of NET.lobbyPeers) {
    const v = p.presence && p.presence.pinv;
    if (!v || v.to !== NET.me || p.sameTab || (PARTY.seenInv.get(p.peer) || 0) >= v.t || (NET.party && NET.party.id === v.pid)) continue;
    PARTY.seenInv.set(p.peer, v.t); (PARTY.pending || (PARTY.pending = new Map())).set(p.peer, v); if ($('#partyBody')) renderParty(); else showInvite(p, v);
  }
  if (NET.party && NET.party.leader !== NET.me) {
    const lead = NET.lobbyPeers.find(p => p.peer === NET.party.leader);
    if (!lead || !lead.presence || lead.presence.party !== NET.party.id) { NET.party = null; lobbyPresence(); toast('Your party leader left. The party is closed.'); }
    else {
      const sv = lead.presence.sv;
      if (sv && (!NET.game || NET.game.code !== sv) && !NET.joining && canDeploy()) {
        const server = SERVERS.find(s => s.id === sv);
        if (NET.game) netLeave();
        toast('Following your party leader.'); joinGame(sv, server || null, null);
      }
    }
  }
  if (!$('#overlay').hidden && $('#partyBody')) renderParty();
}
function showInvite(p, v) {
  const el = $('#partyInv'); el.hidden = false;
  el.querySelector('span').textContent = `${pilotTag(p.presence)} invites you to a party.`;
  el.querySelector('.ok').onclick = () => acceptInvite(p, v);
  el.querySelector('.no').onclick = () => { el.hidden = true; };
  clearTimeout(PARTY.invT); PARTY.invT = setTimeout(() => { el.hidden = true; }, 30000);
}
// ---------- Party menu: your name and friend code, your party, invites, and who you can invite ----------
async function showParty(back) {
  PARTY.back = back || null;
  showOverlay('<h2>Party</h2><p>Connecting…</p>', true);
  const room = await netInit();
  if (!room) { showOverlay(`<h2>Party</h2><p>Parties work when you are connected to a RoboBlocks server.</p><div class="btns"><button class="primary" id="ovBack">Back</button></div>`, true); $('#ovBack').onclick = () => { if (PARTY.back) PARTY.back(); else backToMenu(); }; return; }
  NET.me = myPeer();
  showOverlay(`<h2>Party</h2>
    <div class="srow"><label for="callsign">Your name</label><input id="callsign" maxlength="16" spellcheck="false"><span></span></div>
    ${myCodeHtml()}
    <div id="partyBody"></div>
    <p style="font-size:13px">Party members follow the leader into games and always play on the same team.</p>
    <div class="btns"><button class="primary" id="ovBack">Back</button><button id="ptFriends">Friends…</button></div>`, true);
  $('#callsign').value = NET.name;
  $('#callsign').addEventListener('keydown', e => e.stopPropagation());
  $('#callsign').addEventListener('change', () => { NET.name = cleanName($('#callsign').value) || NET.name; $('#callsign').value = NET.name; store.set('sfa.callsign', NET.name); lobbyPresence(); });
  wireMyCode();
  $('#ovBack').onclick = () => { if (PARTY.back) PARTY.back(); else backToMenu(); };
  $('#ptFriends').onclick = () => showFriends();
  renderParty();
}
function renderParty() {
  const el = $('#partyBody'); if (!el) return;
  const others = NET.lobbyPeers.filter(p => !p.sameTab && p.presence && p.presence.bc && !p.presence.srv);
  const inParty = !!NET.party, lead = inParty && NET.party.leader === NET.me, mates = partyMembers().filter(p => !p.sameTab);
  const where = p => p.presence.sv ? (SERVERS.find(x => x.id === p.presence.sv) || { name: 'a custom game' }).name : 'in the menu';
  // invites waiting for you (newest first), dropped once their sender leaves
  const pend = [...(PARTY.pending || new Map()).entries()].map(([peer, v]) => ({ p: NET.lobbyPeers.find(x => x.peer === peer), v })).filter(x => x.p && !(NET.party && NET.party.id === x.v.pid));
  let html = '<h3>YOUR PARTY</h3>';
  html += inParty ? `<div class="glist">${[{ me: true }, ...mates].map(m => `<div class="grow"><div><b>${m.me ? esc(NET.name) + ' (you)' : esc(pilotTag(m.presence))}</b><span>${(m.me ? lead : m.peer === NET.party.leader) ? '★ Leader' : 'Member'}</span></div></div>`).join('')}</div><div class="btns" style="justify-content:flex-start"><button id="ptLeave">Leave party</button></div>`
    : '<p class="gempty">You are not in a party. Invite someone below.</p>';
  if (pend.length) html += `<h3>INVITES</h3><div class="glist">${pend.map((x, i) => `<div class="grow"><div><b>${esc(pilotTag(x.p.presence))}</b><span>invited you to their party</span></div><button class="primary" data-acc="${i}">Join</button><button data-dec="${i}">No thanks</button></div>`).join('')}</div>`;
  const friends = others.filter(p => isFriendPeer(p)), rest = others.filter(p => !isFriendPeer(p));
  const row = (p, kind) => {
    const mine = NET.party && p.presence.party === NET.party.id, sent = PARTY.inv && PARTY.inv.to === p.peer && Date.now() - PARTY.inv.t < 60000;
    const canInvite = !mine && (!NET.party || lead);
    return `<div class="grow"><div><b>${esc(pilotTag(p.presence))}</b><span>Lv ${(p.presence.lv | 0) || 1} · ${esc(where(p))}</span></div>${kind === 'pilot' && !isFriendPeer(p) && peerKey(p) ? `<button data-addf="${p.peer}">Add friend</button>` : ''}<button class="${canInvite && !sent ? 'primary' : ''}" data-inv="${p.peer}" ${canInvite && !sent ? '' : 'disabled'}>${mine ? 'In your party' : sent ? 'Invited' : 'Invite'}</button></div>`;
  };
  html += `<h3>FRIENDS ONLINE</h3>${friends.length ? `<div class="glist">${friends.map(p => row(p, 'friend')).join('')}</div>` : '<p class="gempty">No friends online on this server.</p>'}`;
  html += `<h3>PILOTS ON THIS SERVER</h3>${rest.length ? `<div class="glist">${rest.slice(0, 40).map(p => row(p, 'pilot')).join('')}</div>` : '<p class="gempty">Nobody else is online.</p>'}`;
  el.innerHTML = html;
  if ($('#ptLeave')) $('#ptLeave').onclick = partyLeave;
  el.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => { partyInvite(b.dataset.inv); renderParty(); });
  el.querySelectorAll('[data-addf]').forEach(b => b.onclick = () => { const p = NET.lobbyPeers.find(x => x.peer === b.dataset.addf); if (p) addFriend(p); renderParty(); });
  el.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { const x = pend[+b.dataset.acc]; acceptInvite(x.p, x.v); });
  el.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { PARTY.pending.delete(pend[+b.dataset.dec].p.peer); renderParty(); });
}
function acceptInvite(p, v) {
  NET.party = { id: v.pid, leader: p.peer }; PARTY.inv = null; if (PARTY.pending) PARTY.pending.delete(p.peer); $('#partyInv').hidden = true; lobbyPresence(); renderParty();
  toast(`Joined ${pilotTag(p.presence)}'s party. You will follow them into games.`);
}
// hosts keep parties together: group pilots by party, then fill the smaller team group by group
function partyTeams(pilots, partyOf) {
  const groups = new Map(); for (const id of pilots) { const k = partyOf(id) || id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(id); }
  const out = {}, c = [0, 0];
  for (const g of [...groups.values()].sort((a, b) => b.length - a.length)) { const t = c[0] <= c[1] ? 0 : 1; for (const id of g) out[id] = t; c[t] += g.length; }
  return out;
}
// ---------- clans ----------
async function beClan(op, a) {
  if (BE.kind === 'server') { const r = await beApi('clan.' + op, a); if (op !== 'get' && op !== 'list') await beRefresh(); return r; }
  if (BE.kind !== 'artifact') throw new Error('Clans live on RoboBlocks servers. Open your server address to join one.');
  const db = BE.db;
  const all = async () => { const [cl, lb] = await Promise.all([db.collection('clans').get(), db.collection('lb').get()]); return { clans: cl.docs.map(d => ({ owner: d.id, ...(d.data() || {}) })).filter(c => c.tag), lb: lb.docs.map(d => ({ id: d.id, ...(d.data() || {}) })) }; };
  if (op === 'create') {
    const tag = String(a.tag || '').toUpperCase(); if (!/^[A-Z0-9]{2,5}$/.test(tag)) throw new Error('A clan tag is 2 to 5 letters or numbers.');
    const { clans } = await all(); if (clans.some(c => c.tag === tag && c.owner !== BE.uid)) throw new Error('That tag is taken.');
    await db.doc(`clans/${BE.uid}`).set({ tag, name: (String(a.name || '').trim().slice(0, 28)) || tag, t: Date.now() });
    PROG.clan = tag; progSave(); await artSave(); return { tag };
  }
  if (op === 'join') { const tag = String(a.tag || '').toUpperCase(); const { clans } = await all(); if (!clans.some(c => c.tag === tag)) throw new Error('No clan with that tag.'); PROG.clan = tag; progSave(); await artSave(); return { tag }; }
  if (op === 'leave') { const tag = PROG.clan; PROG.clan = null; progSave(); await artSave(); const own = await db.doc(`clans/${BE.uid}`).get(); if (own.exists && (own.data() || {}).tag === tag) await db.doc(`clans/${BE.uid}`).delete(); return {}; }
  const { clans, lb } = await all();
  const info = c => { const members = lb.filter(x => x.clan === c.tag && !artBanned(x.id)).map(x => ({ name: cleanName(x.cs) || 'Pilot', xp: x.xp | 0, lv: x.lv | 0, wins: x.wins | 0, kills: x.kills | 0 })).sort((x, y) => y.xp - x.xp); return { tag: c.tag, name: c.name, owner: (lb.find(x => x.id === c.owner) || {}).cs || 'Pilot', members, xp: members.reduce((s, m) => s + m.xp, 0), wins: members.reduce((s, m) => s + m.wins, 0), size: members.length }; };
  if (op === 'get') { const c = clans.find(x => x.tag === String(a.tag || '').toUpperCase()); if (!c) throw new Error('No clan with that tag.'); return info(c); }
  if (op === 'list') return clans.map(info).sort((x, y) => y.xp - x.xp).slice(0, 50);
  throw new Error('Not available here.');
}
async function showClans() {
  showOverlay('<h2>Clans</h2><p>Loading…</p>', true);
  const tag = myClan(); let mine = null, board = [];
  try { [mine, board] = await Promise.all([tag ? beClan('get', { tag }).catch(() => null) : null, beClan('list')]); }
  catch (e) { showOverlay('<h2>Clans</h2>' + errBox(e) + (BE.kind === 'server' && !BE.me ? '<p>Sign in to start or join a clan.</p>' : '') + '<div class="btns"><button class="primary" id="ovBack">Back</button></div>', true); $('#ovBack').onclick = backToMenu; return; }
  const needAcct = BE.kind === 'server' && !BE.me;
  const rows = board.map((c, i) => `<tr class="${c.tag === tag ? 'me' : ''}"><td class="num">${i + 1}</td><td><b>[${esc(c.tag)}]</b> ${esc(c.name)}</td><td class="num">${c.size}</td><td class="num">${fmtN(c.xp)}</td><td class="num">${fmtN(c.wins)}</td><td>${c.tag === tag ? '' : `<button data-join="${esc(c.tag)}" ${tag || needAcct ? 'disabled' : ''}>Join</button>`}</td></tr>`).join('');
  showOverlay(`<h2>Clans</h2>
    ${mine ? `<h3>[${esc(mine.tag)}] ${esc(mine.name)}</h3><p>Led by ${esc(mine.owner)} · ${mine.members.length} pilot${mine.members.length === 1 ? '' : 's'} · ${fmtN(mine.xp)} XP together</p>
      <div class="tscroll" style="max-height:24vh"><table class="tbl"><thead><tr><th>Pilot</th><th>Lv</th><th>XP</th><th>Wins</th><th>Kills</th></tr></thead><tbody>${mine.members.map(m => `<tr><td>${esc(m.name)}</td><td class="num">${m.lv}</td><td class="num">${fmtN(m.xp)}</td><td class="num">${m.wins}</td><td class="num">${fmtN(m.kills)}</td></tr>`).join('')}</tbody></table></div>
      <div class="btns"><button id="clLeave">Leave clan</button></div>`
    : needAcct ? '<p>Sign in to start or join a clan.</p>' : `<h3>START A CLAN</h3><div class="srow"><label for="clTag">Tag</label><input id="clTag" maxlength="5" placeholder="2–5 letters" style="text-transform:uppercase"><span></span></div>
      <div class="srow"><label for="clName">Name</label><input id="clName" maxlength="28"><button id="clMake">Start clan</button></div>`}
    <h3>CLAN LEADERBOARD</h3>${rows ? `<div class="tscroll" style="max-height:30vh"><table class="tbl"><thead><tr><th>#</th><th>Clan</th><th>Pilots</th><th>XP</th><th>Wins</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>No clans yet. Start the first one.</p>'}
    <div class="btns">${needAcct ? '<button id="ovAcct">Sign in</button>' : ''}<button class="primary" id="ovBack">Back</button></div>`, true);
  $('#ovBack').onclick = backToMenu; if ($('#ovAcct')) $('#ovAcct').onclick = () => showAccount(showClans);
  for (const id of ['#clTag', '#clName']) if ($(id)) $(id).addEventListener('keydown', e => e.stopPropagation());
  const run = async (op, a) => { try { await beClan(op, a); lobbyPresence(); showClans(); } catch (e) { toast(e.message); } };
  if ($('#clMake')) $('#clMake').onclick = () => run('create', { tag: $('#clTag').value, name: $('#clName').value });
  if ($('#clLeave')) $('#clLeave').onclick = () => { if (armed($('#clLeave'))) run('leave'); };
  document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => run('join', { tag: b.dataset.join }));
}
