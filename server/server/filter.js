'use strict';
// Chat word filter, the same list the game uses. Stored ROT13 so the source reads clean.
const WORDS = 'shpx fuvg ovgpu phag nffubyr onfgneq qvpx pbpx chffl juber fyhg snt snttbg avttre avttn ergneq gjng jnaxre zbgureshpxre'
  .split(' ').map(w => w.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 84) % 26 + 97)));
let extra = [];
const build = () => new RegExp('(' + WORDS.concat(extra).map(w => w.replace(/[^a-z0-9]/gi, '').split('').map(c => c + '+').join('[^a-z0-9]?')).filter(Boolean).join('|') + ')', 'gi');
let RE = build();
function setExtraWords(list) { extra = (Array.isArray(list) ? list : []).map(String).filter(w => /^[a-z0-9]{3,30}$/i.test(w)); RE = build(); }
function filterText(s) { return String(s).replace(RE, m => '*'.repeat(Math.min(8, m.length))); }
// chat rings in presence: [seq, scope, text, x, z, calloutId, time]
function cleanChat(ring) {
  if (!Array.isArray(ring)) return null;
  return ring.slice(-6).filter(e => Array.isArray(e) && typeof e[0] === 'number').map(e => [e[0], e[1] === 't' ? 't' : 'a', filterText(String(e[2] || '').slice(0, 140)), Number.isFinite(e[3]) ? e[3] : null, Number.isFinite(e[4]) ? e[4] : null, Number.isInteger(e[5]) ? e[5] : null, Number.isFinite(e[6]) ? e[6] : 0]);
}
module.exports = { filterText, cleanChat, setExtraWords };
