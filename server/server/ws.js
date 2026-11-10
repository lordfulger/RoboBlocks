'use strict';
// Minimal RFC 6455 WebSocket server (text frames, ping/pong, close). No dependencies.
const crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class Socket {
  constructor(sock, maxPayload) {
    this.sock = sock; this.maxPayload = maxPayload; this.buf = Buffer.alloc(0); this.frags = [];
    this.open = true; this.onmessage = null; this.onclose = null;
    sock.setNoDelay(true);
    sock.on('data', d => this._data(d));
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }
  send(text) {
    if (!this.open) return;
    const payload = Buffer.from(text, 'utf8'), n = payload.length;
    let head;
    if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
    else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    head[0] = 0x81;
    try { this.sock.write(Buffer.concat([head, payload])); } catch (e) { this._closed(); }
  }
  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.alloc(4); b[0] = 0x88; b[1] = 2; b.writeUInt16BE(code, 2);
    try { this.sock.end(b); } catch (e) { }
    this._closed();
  }
  _closed() { if (!this.open) return; this.open = false; try { this.sock.destroy(); } catch (e) { } if (this.onclose) this.onclose(); }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open) {
      const b = this.buf; if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80; let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > BigInt(this.maxPayload)) return this.close(1009); len = Number(big); off = 10; }
      if (!masked) return this.close(1002); // clients must mask
      if (len > this.maxPayload) return this.close(1009);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 0x8) return this.close();
      if (op === 0x9) { const h = Buffer.from([0x8a, data.length]); try { this.sock.write(Buffer.concat([h, data])); } catch (e) { } continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        this.frags.push(data);
        if (this.frags.reduce((a, f) => a + f.length, 0) > this.maxPayload) return this.close(1009);
        if (fin) { const msg = Buffer.concat(this.frags).toString('utf8'); this.frags = []; if (this.onmessage) this.onmessage(msg); }
      }
    }
  }
}

function attach(httpServer, path, maxPayload, onConnection) {
  httpServer.on('upgrade', (req, sock) => {
    const url = (req.url || '').split('?')[0];
    const key = req.headers['sec-websocket-key'];
    if (url !== path || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    onConnection(new Socket(sock, maxPayload), req);
  });
}
module.exports = { attach };
