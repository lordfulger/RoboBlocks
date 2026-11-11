'use strict';
// Shared replays: players upload a recorded battle (gzipped JSON, made by the game) and get a link that plays it.
// Files live in data/replays; the oldest are deleted once there are more than `keep`.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Replays {
  constructor(dir, { keep = 300, maxBytes = 6 * 1024 * 1024, log = () => { } } = {}) {
    this.dir = dir; this.keep = keep; this.maxBytes = maxBytes; this.log = log; this.rate = new Map();
    fs.mkdirSync(dir, { recursive: true });
  }
  file(id) { return /^[a-z0-9]{10}$/.test(id) ? path.join(this.dir, id + '.rbr') : null; }
  // POST /replay: body is the gzipped replay; answers { id }
  upload(req, res, ip) {
    const now = Date.now();
    if (now - (this.rate.get(ip) || 0) < 15000) { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end('{"e":"Wait a few seconds before sharing another replay."}'); return; }
    const len = +req.headers['content-length'] || 0;
    if (len > this.maxBytes) { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end('{"e":"That replay is too large to share."}'); req.destroy(); return; }
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > this.maxBytes) { req.destroy(); return; } parts.push(c); });
    req.on('end', () => {
      if (n > this.maxBytes) return;
      const body = Buffer.concat(parts);
      if (body.length < 20 || body[0] !== 0x1f || body[1] !== 0x8b) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"e":"Not a replay."}'); return; }
      this.rate.set(ip, now); if (this.rate.size > 5000) this.rate.clear();
      const id = crypto.randomBytes(8).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(10, '0').slice(0, 10);
      try { fs.writeFileSync(this.file(id), body); } catch (e) { this.log('replay save failed:', e.message); res.writeHead(500); res.end('{"e":"The server could not save it."}'); return; }
      this.prune();
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id }));
    });
    req.on('error', () => { });
  }
  // GET /replay/<id>
  serve(id, res) {
    const f = this.file(id); let b = null;
    try { if (f) b = fs.readFileSync(f); } catch (e) { }
    if (!b) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('That replay is gone.'); return; }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': b.length, 'Cache-Control': 'max-age=86400', 'Access-Control-Allow-Origin': '*' }); res.end(b);
  }
  prune() {
    try {
      const fsList = fs.readdirSync(this.dir).filter(f => f.endsWith('.rbr')).map(f => ({ f, t: fs.statSync(path.join(this.dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      for (const x of fsList.slice(this.keep)) fs.unlinkSync(path.join(this.dir, x.f));
    } catch (e) { }
  }
}
module.exports = { Replays };
