'use strict';
// Runs the real RoboBlocks game code inside a Node `vm` context with no screen, no audio and a
// do-nothing DOM. Each official server gets its own context: it joins the relay as the most
// senior peer and hosts that server (warmup, AI bots, scoring, map rotation) around the clock.
const vm = require('vm');
const path = require('path');
const THREE = require(path.join(__dirname, '..', 'vendor', 'three.cjs'));

// A stand-in for any DOM node: every property is another stand-in, every call is a no-op.
function stub(store = new Map()) {
  const fn = function () { return stub(); };
  return new Proxy(fn, {
    get(t, k) {
      if (store.has(k)) return store.get(k);
      switch (k) {
        case 'then': case 'toJSON': case Symbol.iterator: case 'nodeType': return undefined;
        case Symbol.toPrimitive: return () => 0;
        case 'length': return 0;
        case 'hidden': return true;
        case 'children': case 'childNodes': return [];
        case 'querySelectorAll': return () => [];
        case 'getContext': return () => ctx2d();
        case 'getBoundingClientRect': return () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 });
        case 'width': return 128;
        case 'height': return 128;
        case 'value': case 'textContent': case 'innerHTML': case 'innerText': case 'className': return '';
        case 'dataset': case 'style': { const s = stub(); store.set(k, s); return s; }
      }
      const s = stub(); store.set(k, s); return s;
    },
    set(t, k, v) { store.set(k, v); return true; },
    apply() { return stub(); },
    construct() { return stub(); },
  });
}
function ctx2d() {
  const grad = { addColorStop() { } };
  const c = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => null,
    measureText: () => ({ width: 0 }),
  };
  return new Proxy(c, { get(t, k) { if (k in t) return t[k]; return typeof k === 'string' ? () => { } : undefined; }, set(t, k, v) { t[k] = v; return true; } });
}
function makeDocument() {
  const byId = new Map();
  const createElement = tag => {
    const el = stub();
    if (String(tag).toLowerCase() === 'canvas') { el.width = 128; el.height = 128; el.getContext = () => ctx2d(); }
    return el;
  };
  const doc = {
    createElement, createElementNS: (ns, tag) => createElement(tag), createTextNode: () => stub(), createDocumentFragment: () => stub(),
    querySelector: sel => { if (!byId.has(sel)) byId.set(sel, stub()); return byId.get(sel); },
    querySelectorAll: () => [], getElementById: id => { if (!byId.has('#' + id)) byId.set('#' + id, stub()); return byId.get('#' + id); },
    addEventListener() { }, removeEventListener() { }, exitPointerLock() { },
    pointerLockElement: null, documentElement: stub(), body: stub(), head: stub(), fonts: undefined, hidden: false,
  };
  // anything else the game asks the document for is a harmless stand-in
  return new Proxy(doc, { get(t, k) { if (k in t) return t[k]; return typeof k === 'string' ? stub() : undefined; } });
}

function startHost({ code, server, aiLevel, idleMatches, relay, log, report }) {
  const ls = new Map();
  const ctx = {
    THREE, console: { log() { }, info() { }, warn() { }, debug() { }, error: (...a) => log(`[${server.id}] ${a.map(String).join(' ').slice(0, 300)}`) },
    setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, queueMicrotask, performance,
    requestAnimationFrame: cb => setTimeout(() => cb(performance.now()), 1000 / 30), cancelAnimationFrame: clearTimeout,
    document: makeDocument(), innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() { } }), addEventListener() { }, removeEventListener() { },
    location: { protocol: 'node:', host: 'localhost', href: 'node://roboblocks' }, navigator: { userAgent: 'RoboBlocks dedicated server' },
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    __BC_HEADLESS: true,
    __BC_SERVER: { id: server.id, aiLevel, idleMatches },
    __BC_REPORT: r => { try { report && report(JSON.parse(JSON.stringify(r))); } catch (e) { log(`[${server.id}] report failed: ${e.message}`); } },
    __BC_LOCAL_CONN: () => {
      const sock = { readyState: 1, onopen: null, onmessage: null, onclose: null, onerror: null, send: text => conn.onMessage(text), close() { conn.close(); } };
      const conn = relay.connect(msg => setImmediate(() => sock.onmessage && sock.onmessage({ data: JSON.stringify(msg) })), { local: true });
      setImmediate(() => sock.onopen && sock.onopen());
      return sock;
    },
  };
  vm.createContext(ctx);
  vm.runInContext('globalThis.window = globalThis; globalThis.self = globalThis;', ctx);
  try { vm.runInContext(code, ctx, { filename: 'roboblocks-game.js' }); }
  catch (e) { log(`[${server.id}] failed to start: ${e && e.stack || e}`); return null; }
  return {
    id: server.id,
    status() {
      try {
        const S = ctx.__sfa, g = S && S.NET.game, info = g && g.info, m = S && S.match;
        if (!info) return { phase: 'starting' };
        const humans = S.NET.slowPeers.filter(p => !p.sameTab && p.presence && p.presence.since).length;
        return { phase: info.phase, mode: info.mode, map: info.map, players: humans, bots: m ? S.world.bots.length : 0, score: info.score, timeLeft: info.tl, cd: Math.round(info.cd || 0) };
      } catch (e) { return { phase: 'error', error: String(e) }; }
    },
  };
}
module.exports = { startHost };
