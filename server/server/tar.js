'use strict';
// Minimal .tar.gz reader and writer (ustar, plus the pax and GNU long-name records git and GitHub use).
// Enough for packaging and updating the server without any npm modules.
const zlib = require('zlib');

const oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
function header(name, size, mtime, type) {
  const h = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) { // split at a slash: up to 155 bytes of folders, up to 100 bytes of name
    let cut = -1; for (let i = name.indexOf('/'); i > 0; i = name.indexOf('/', i + 1)) { if (i <= 155 && Buffer.byteLength(name.slice(i + 1)) <= 100) { cut = i; break; } }
    if (cut < 0) throw new Error('path too long for tar: ' + name);
    prefix = name.slice(0, cut); name = name.slice(cut + 1);
  }
  h.write(name, 0, 100); h.write(type === '5' ? '0000755\0' : '0000644\0', 100); h.write(oct(0, 8), 108); h.write(oct(0, 8), 116);
  h.write(oct(size, 12), 124); h.write(oct(Math.floor(mtime / 1000), 12), 136); h.write('        ', 148); h.write(type, 156);
  h.write('ustar\0', 257); h.write('00', 263); h.write(prefix, 345, 155);
  let sum = 0; for (let i = 0; i < 512; i++) sum += h[i]; h.write(oct(sum, 7) + ' ', 148, 8);
  return h;
}
// files: [{ path: 'dir/file', data: Buffer }] -> gzipped tar Buffer
function pack(files) {
  const parts = [], now = Date.now();
  for (const f of files) {
    parts.push(header(f.path, f.data.length, f.mtime || now, '0'), f.data);
    const pad = (512 - (f.data.length % 512)) % 512; if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts), { level: 9 });
}
// gzipped (or plain) tar Buffer -> Map(path -> Buffer) of regular files
function unpack(buf, maxBytes = 300 * 1024 * 1024) {
  const tar = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf, { maxOutputLength: maxBytes }) : buf;
  const out = new Map(); let off = 0, longName = null, paxPath = null;
  const str = (b, s, l) => { const x = b.subarray(s, s + l); const z = x.indexOf(0); return x.subarray(0, z < 0 ? l : z).toString('utf8'); };
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512); if (h.every(v => v === 0)) break;
    const size = parseInt(str(h, 124, 12).trim() || '0', 8) || 0, type = String.fromCharCode(h[156] || 48);
    let name = str(h, 0, 100); const prefix = str(h, 257, 6).startsWith('ustar') ? str(h, 345, 155) : ''; if (prefix) name = prefix + '/' + name;
    const data = tar.subarray(off + 512, off + 512 + size); off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = str(data, 0, data.length); continue; }
    if (type === 'x') { const m = data.toString('utf8').match(/\d+ path=([^\n]*)\n/); paxPath = m ? m[1] : null; continue; }
    if (type === 'g') continue;
    if (longName) { name = longName; longName = null; } if (paxPath) { name = paxPath; paxPath = null; }
    if (type !== '0' && type !== '\0' && type !== '7') continue;
    name = name.replace(/^\.\//, '');
    if (!name || name.includes('..') || name.startsWith('/')) continue;
    out.set(name, Buffer.from(data));
  }
  return out;
}
module.exports = { pack, unpack };
