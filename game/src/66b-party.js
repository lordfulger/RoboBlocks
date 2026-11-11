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
    PARTY.seenInv.set(p.peer, v.t); showInvite(p, v);
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
  if (!$('#overlay').hidden && $('#lobbyPilots')) renderParty();
}
function showInvite(p, v) {
  const el = $('#partyInv'); el.hidden = false;
  el.querySelector('span').textContent = `${pilotTag(p.presence)} invites you to a party.`;
  el.querySelector('.ok').onclick = () => { NET.party = { id: v.pid, leader: p.peer }; PARTY.inv = null; el.hidden = true; lobbyPresence(); renderParty(); toast('Joined the party. You will follow the leader into games.'); };
  el.querySelector('.no').onclick = () => { el.hidden = true; };
  clearTimeout(PARTY.invT); PARTY.invT = setTimeout(() => { el.hidden = true; }, 30000);
}
function renderParty() {
  const el = $('#lobbyPilots'); if (!el) return;
  const others = NET.lobbyPeers.filter(p => !p.sameTab && p.presence && p.presence.bc && !p.presence.srv);
  const inParty = !!NET.party, lead = inParty && NET.party.leader === NET.me, mates = partyMembers().filter(p => !p.sameTab);
  let html = `<h3>PARTY</h3>`;
  html += inParty ? `<p>${lead ? 'You lead this party.' : 'Following ' + esc(pilotTag((NET.lobbyPeers.find(p => p.peer === NET.party.leader) || {}).presence)) + '.'} ${mates.length ? 'With ' + mates.map(p => esc(pilotTag(p.presence))).join(', ') + '.' : 'Nobody else yet.'} <button id="ptLeave">Leave party</button></p>` : '<p>Invite pilots below to play together. Members follow the leader into games and stay on the same team.</p>';
  html += `<h3>PILOTS ONLINE</h3><div class="glist">${others.length ? '' : '<p class="gempty">Nobody else is online.</p>'}</div>`;
  el.innerHTML = html; const list = el.querySelector('.glist');
  for (const p of others) {
    const r = document.createElement('div'); r.className = 'grow';
    const info = document.createElement('div'); const b = document.createElement('b'); b.textContent = pilotTag(p.presence);
    const s = document.createElement('span'); s.textContent = `Lv ${(p.presence.lv | 0) || 1}${p.presence.sv ? ' · in a game' : ' · in the menu'}${NET.party && p.presence.party === NET.party.id ? ' · in your party' : ''}`; info.append(b, s);
    const btn = document.createElement('button'); btn.textContent = NET.party && p.presence.party === NET.party.id ? 'In party' : 'Invite'; btn.disabled = NET.party && (p.presence.party === NET.party.id || NET.party.leader !== NET.me);
    btn.onclick = () => partyInvite(p.peer);
    const fb = document.createElement('button'); const fr = isFriendPeer(p); fb.textContent = fr ? 'Friend ✓' : 'Add friend'; fb.disabled = fr || !peerKey(p);
    fb.onclick = () => { addFriend(p); renderParty(); };
    r.append(info, fb, btn); list.appendChild(r);
  }
  if ($('#ptLeave')) $('#ptLeave').onclick = partyLeave;
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
