'use strict';
const $ = s => document.querySelector(s);
const L = window.launcher;
let busy = false;
const TEXT = {
  noserver: () => ['No game server set. Enter its address below, or press Play for AI battles.', ''],
  checking: () => ['Checking for updates…', ''],
  downloading: d => [`Downloading RoboBlocks ${d.target}… ${Math.round((d.progress || 0) * 100)}%`, ''],
  current: d => [`Up to date: RoboBlocks ${d.version}.`, 'good'],
  updated: d => [d.from ? `Updated from ${d.from} to ${d.version}.` : `RoboBlocks ${d.version} is installed.`, 'good'],
  offline: d => [`Can't reach the server: ${d.error || 'offline'} You can still play the version you have (${d.version}).`, 'bad'],
  error: d => [`Update failed: ${d.error}. Playing ${d.version} instead.`, 'bad'],
  idle: d => [`Ready: RoboBlocks ${d.version}.`, ''],
};
function show(d) {
  const [t, cls] = (TEXT[d.state] || TEXT.idle)(d);
  $('#status').textContent = t; $('#status').className = cls;
  busy = d.state === 'checking' || d.state === 'downloading';
  $('#play').disabled = busy; $('#check').disabled = busy;
  $('#prog').style.width = d.state === 'downloading' ? Math.round((d.progress || 0) * 100) + '%' : busy ? '15%' : d.state === 'offline' || d.state === 'error' ? '0' : '100%';
  if (d.version) $('#meta').dataset.game = d.version; meta();
}
function meta() { $('#meta').textContent = `Game ${$('#meta').dataset.game || '?'} · Launcher ${$('#meta').dataset.launcher || '?'}`; }
L.on('status', show);
const newsBox = n => {
  const box = $('#news'); box.textContent = '';
  const b = document.createElement('b'); b.textContent = `RoboBlocks ${n.version}`; box.appendChild(b);
  const ul = document.createElement('ul'); for (const line of n.notes.length ? n.notes : ['Bug fixes and improvements.']) { const li = document.createElement('li'); li.textContent = line; ul.appendChild(li); } box.appendChild(ul);
};
L.on('news', newsBox);
const selfBox = s => {
  const el = $('#self'); el.style.display = 'block'; el.textContent = '';
  if (s.state === 'ready') { el.append(`Launcher ${s.version} is ready. `); const a = document.createElement('a'); a.textContent = 'Restart to install'; a.onclick = () => L.installLauncherUpdate(); el.appendChild(a); }
  else el.textContent = `Downloading launcher ${s.version}…`;
};
L.on('self-update', selfBox);
$('#play').onclick = async () => { if (busy) return; $('#play').disabled = true; $('#status').textContent = 'Starting the game…'; await L.play(); setTimeout(() => { $('#play').disabled = false; }, 1500); };
$('#check').onclick = () => L.check();
const saveServer = async () => { const c = await L.setConfig({ server: $('#server').value }); $('#server').value = c.server.replace(/^http:\/\//, ''); };
$('#save').onclick = saveServer;
$('#server').addEventListener('keydown', e => { if (e.key === 'Enter') saveServer(); });
for (const [id, key] of [['#fullscreen', 'fullscreen'], ['#hide', 'hideLauncher'], ['#auto', 'autoPlay']]) $(id).onchange = e => L.setConfig({ [key]: e.target.checked });
addEventListener('keydown', e => { if (e.key === 'Enter' && document.activeElement !== $('#server') && !busy) $('#play').click(); });
(async () => {
  const s = await L.state();
  $('#server').value = (s.cfg.server || '').replace(/^http:\/\//, '');
  $('#fullscreen').checked = !!s.cfg.fullscreen; $('#hide').checked = s.cfg.hideLauncher !== false; $('#auto').checked = !!s.cfg.autoPlay;
  $('#meta').dataset.launcher = s.launcher; $('#meta').dataset.game = s.version; meta();
  if (s.last && s.last.status) show(s.last.status); else if (!s.cfg.server) show({ state: 'noserver', version: s.version });
  if (s.last && s.last.news) newsBox(s.last.news); if (s.last && s.last['self-update']) selfBox(s.last['self-update']);
})();
