// ================= AUDIO =================
// Every sound is made in code, no files. One-shots are small synth patches rendered once into buffers when
// audio starts (OfflineAudioContext), then played with pitch and level variation, distance muffling and
// stereo position. Engines, beams and map ambience are live synth loops. Music is a generative score.
const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
const _sv = new T.Vector3(), _sr = new T.Vector3();

// ---------- patch toolkit for the offline renders ----------
const AK = {
  noiseData: null,
  noise(c) { const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate); if (!AK.noiseData || AK.noiseData.length !== len) { AK.noiseData = new Float32Array(len); for (let i = 0; i < len; i++) AK.noiseData[i] = Math.random() * 2 - 1; } b.copyToChannel(AK.noiseData, 0); return b; },
  env(g, t, a, peak, d, sus = .0001) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(Math.max(.0001, sus), t + a + d); },
  // oscillator voice: f -> f2 over the decay, optional FM
  osc(c, out, o) {
    const t = o.t || 0, dur = o.dur || .2, s = c.createOscillator(), g = c.createGain();
    s.type = o.type || 'sine'; s.frequency.setValueAtTime(o.f, t); if (o.f2) s.frequency.exponentialRampToValueAtTime(Math.max(15, o.f2), t + (o.glide || dur));
    if (o.detune) s.detune.value = o.detune;
    if (o.fm) { const m = c.createOscillator(), mg = c.createGain(); m.frequency.setValueAtTime(o.f * o.fm.ratio, t); if (o.f2) m.frequency.exponentialRampToValueAtTime(Math.max(15, o.f2 * o.fm.ratio), t + (o.glide || dur)); mg.gain.setValueAtTime(o.f * o.fm.index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, o.f * o.fm.index * (o.fm.end || .05)), t + dur); m.connect(mg); mg.connect(s.frequency); m.start(t); m.stop(t + dur + .05); }
    if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(s.frequency); l.start(t); l.stop(t + dur + .05); }
    AK.env(g, t, o.a || .003, o.g || .3, dur - (o.a || .003));
    let node = s; if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t); if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + dur); f.Q.value = o.q || 1; s.connect(f); node = f; }
    node.connect(g); g.connect(out); s.start(t); s.stop(t + dur + .05);
  },
  // filtered noise voice, with an optional sweep and stutter (for crackle)
  nz(c, out, o) {
    const t = o.t || 0, dur = o.dur || .2, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = AK.noise(c); f.type = o.ft || 'lowpass'; f.frequency.setValueAtTime(o.f || 2000, t);
    if (o.f2) { if (o.fmid) { f.frequency.exponentialRampToValueAtTime(o.fmid, t + dur * (o.mid || .35)); f.frequency.exponentialRampToValueAtTime(o.f2, t + dur); } else f.frequency.exponentialRampToValueAtTime(o.f2, t + dur); }
    f.Q.value = o.q || .8; AK.env(g, t, o.a || .002, o.g || .3, dur - (o.a || .002));
    let last = g;
    if (o.crackle) { const cg = c.createGain(); cg.gain.setValueAtTime(1, t); for (let x = t; x < t + dur; x += .012 + Math.random() * .03) cg.gain.setValueAtTime(Math.random() < o.crackle ? 1 : .08, x); g.connect(cg); last = cg; }
    s.connect(f); f.connect(g); last.connect(out); s.start(t, Math.random() * 1.2); s.stop(t + dur + .05);
  },
  drive(c, out, k) { const w = c.createWaveShaper(), n = 1024, cu = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; cu[i] = Math.tanh(x * k) / Math.tanh(k); } w.curve = cu; w.connect(out); return w; },
};
// One-shot recipes: [length in seconds, variants, patch(c, out, r)] where r is a 0..1 random per variant
const RECIPES = {
  // ---- weapons ----
  blaster: [.22, 4, (c, o, r) => { const d = AK.drive(c, o, 2); AK.osc(c, d, { type: 'square', f: 1250 + r * 300, f2: 260, dur: .16, g: .22, lp: 5000, lp2: 900 }); AK.osc(c, d, { type: 'sawtooth', f: 2400 + r * 400, f2: 500, dur: .09, g: .12, fm: { ratio: .5, index: 1.2 } }); AK.nz(c, o, { ft: 'highpass', f: 6000, dur: .035, g: .25 }); }],
  plasma: [.55, 3, (c, o, r) => { AK.osc(c, o, { f: 180, f2: 900 + r * 150, dur: .08, g: .35, glide: .07 }); AK.osc(c, o, { type: 'sawtooth', f: 880, f2: 90, dur: .42, g: .2, lp: 2600, lp2: 300, q: 6, t: .05, fm: { ratio: 1.5, index: 2, end: .1 } }); AK.nz(c, o, { ft: 'bandpass', f: 1600, f2: 300, dur: .35, g: .25, q: 2.5, t: .04 }); }],
  mortar: [.8, 3, (c, o, r) => { const d = AK.drive(c, o, 3); AK.osc(c, d, { f: 105 + r * 15, f2: 32, dur: .6, g: .9 }); AK.nz(c, o, { f: 600, f2: 90, dur: .45, g: .55 }); AK.nz(c, o, { ft: 'bandpass', f: 900, dur: .05, g: .4, q: 3 }); AK.osc(c, o, { type: 'triangle', f: 620, f2: 240, dur: .09, g: .18, t: .01 }); }],
  rail: [1.1, 3, (c, o, r) => { AK.osc(c, o, { type: 'sawtooth', f: 400, f2: 4200, dur: .11, g: .1, lp: 7000 }); AK.nz(c, o, { ft: 'highpass', f: 3500, dur: .06, g: .6, t: .1 }); AK.osc(c, o, { type: 'sawtooth', f: 3200 + r * 400, f2: 60, dur: .8, g: .22, t: .1, lp: 9000, lp2: 400 }); AK.osc(c, o, { f: 80, f2: 30, dur: .5, g: .6, t: .1 }); AK.nz(c, o, { f: 7000, f2: 250, dur: .7, g: .3, t: .1 }); }],
  seeker: [.95, 3, (c, o, r) => { AK.nz(c, o, { ft: 'bandpass', f: 300, fmid: 2600 + r * 500, f2: 700, mid: .25, dur: .9, g: .45, q: 1.6 }); AK.osc(c, o, { type: 'triangle', f: 300, f2: 1500, dur: .35, g: .1 }); AK.nz(c, o, { ft: 'bandpass', f: 1200, dur: .03, g: .35, q: 4 }); }],
  flak: [.5, 3, (c, o, r) => { const d = AK.drive(c, o, 2.5); AK.osc(c, d, { f: 170, f2: 55, dur: .28, g: .7 }); AK.nz(c, o, { f: 3600, f2: 400, dur: .2, g: .45 }); AK.osc(c, o, { f: 900 + r * 100, dur: .25, g: .08, fm: { ratio: 1.41, index: 3 } }); }],
  flakBurst: [.6, 3, (c, o, r) => { AK.nz(c, o, { f: 2800, f2: 300, dur: .45, g: .55, crackle: .6 }); AK.nz(c, o, { ft: 'highpass', f: 6000, dur: .1, g: .35 }); AK.osc(c, o, { f: 140, f2: 50, dur: .3, g: .4 }); }],
  chain: [.1, 5, (c, o, r) => { const d = AK.drive(c, o, 3); AK.osc(c, d, { type: 'square', f: 520 + r * 140, f2: 180, dur: .06, g: .25, lp: 3500 }); AK.nz(c, o, { ft: 'highpass', f: 4500, dur: .03, g: .4 }); AK.osc(c, o, { f: 110, f2: 60, dur: .06, g: .3 }); }],
  arc: [.4, 4, (c, o, r) => { AK.nz(c, o, { ft: 'bandpass', f: 3500 + r * 1500, f2: 1500, dur: .32, g: .6, q: 5, crackle: .45 }); AK.osc(c, o, { type: 'square', f: 1900, f2: 600, dur: .12, g: .09, fm: { ratio: 3.1, index: 4 } }); AK.osc(c, o, { type: 'sawtooth', f: 60, dur: .3, g: .12, lp: 400 }); }],
  zap: [.18, 4, (c, o, r) => { AK.nz(c, o, { ft: 'bandpass', f: 6000 + r * 2000, dur: .09, g: .45, q: 5, crackle: .5 }); AK.osc(c, o, { type: 'square', f: 2100, f2: 700, dur: .06, g: .08 }); }],
  mine: [.35, 2, (c, o, r) => { AK.osc(c, o, { f: 240, f2: 100, dur: .16, g: .5 }); AK.nz(c, o, { ft: 'bandpass', f: 1800, dur: .04, g: .4, q: 3 }); AK.osc(c, o, { type: 'square', f: 1800, dur: .05, g: .05, t: .22 }); AK.osc(c, o, { type: 'square', f: 2400, dur: .05, g: .05, t: .29 }); }],
  lancer: [1.6, 2, (c, o, r) => { const d = AK.drive(c, o, 4); AK.osc(c, d, { type: 'sawtooth', f: 160, f2: 38, dur: 1.2, g: .5, lp: 3000, lp2: 200 }); AK.nz(c, o, { f: 9000, f2: 180, dur: 1.4, g: .55 }); AK.osc(c, o, { f: 60, f2: 22, dur: 1.2, g: .9 }); AK.osc(c, o, { type: 'sawtooth', f: 5000, f2: 200, dur: .5, g: .15 }); }],
  // ---- impacts and destruction ----
  hit: [.09, 3, (c, o, r) => { AK.osc(c, o, { type: 'triangle', f: 2600 + r * 500, f2: 2000, dur: .05, g: .25 }); AK.osc(c, o, { f: 1300, dur: .06, g: .12 }); }],
  metal: [.3, 5, (c, o, r) => { AK.osc(c, o, { f: 500 + r * 500, dur: .26, g: .25, fm: { ratio: 2.76, index: 5, end: .02 } }); AK.nz(c, o, { ft: 'bandpass', f: 2500 + r * 1500, dur: .08, g: .35, q: 2 }); }],
  pop: [.35, 4, (c, o, r) => { AK.nz(c, o, { f: 1800, f2: 200, dur: .25, g: .5 }); AK.osc(c, o, { type: 'triangle', f: 340 + r * 80, f2: 90, dur: .15, g: .35 }); for (let i = 0; i < 4; i++) AK.osc(c, o, { f: 1500 + Math.random() * 2500, dur: .03, g: .08, t: .06 + Math.random() * .2, fm: { ratio: 2.3, index: 3 } }); }],
  boomS: [1.1, 4, (c, o, r) => { const d = AK.drive(c, o, 2.5); AK.nz(c, d, { f: 1600, f2: 80, dur: .9, g: .7 }); AK.osc(c, d, { f: 140 + r * 30, f2: 30, dur: .55, g: .8 }); AK.nz(c, o, { ft: 'highpass', f: 2500, dur: .5, g: .15, crackle: .5, t: .05 }); }],
  boomL: [2.6, 3, (c, o, r) => { const d = AK.drive(c, o, 3); AK.nz(c, d, { f: 1100, f2: 50, dur: 2.2, g: .85, a: .01 }); AK.osc(c, d, { f: 85 + r * 15, f2: 22, dur: 1.6, g: 1 }); AK.nz(c, o, { ft: 'highpass', f: 3200, dur: 1.6, g: .22, crackle: .55, t: .12 }); for (let i = 0; i < 8; i++) AK.osc(c, o, { f: 600 + Math.random() * 2400, dur: .05, g: .07, t: .3 + Math.random() * 1.2, fm: { ratio: 2.7, index: 4 } }); }],
  shieldHit: [.4, 3, (c, o, r) => { AK.osc(c, o, { f: 1100 + r * 300, f2: 700, dur: .3, g: .22, fm: { ratio: 1.5, index: 1.5 } }); AK.osc(c, o, { f: 1700 + r * 300, dur: .22, g: .1 }); AK.nz(c, o, { ft: 'highpass', f: 5000, dur: .15, g: .12 }); }],
  hurt: [.4, 3, (c, o, r) => { AK.osc(c, o, { f: 100, f2: 40, dur: .3, g: .6 }); AK.nz(c, o, { f: 900, f2: 120, dur: .2, g: .35, crackle: .6 }); AK.osc(c, o, { f: 600 + r * 200, dur: .2, g: .1, fm: { ratio: 2.76, index: 4 } }); }],
  // ---- movement events ----
  dash: [.65, 3, (c, o, r) => { AK.nz(c, o, { ft: 'bandpass', f: 400, fmid: 2800 + r * 400, f2: 500, mid: .3, dur: .6, g: .55, q: 1.3 }); AK.osc(c, o, { f: 160, f2: 640, dur: .3, g: .15 }); }],
  jet: [.2, 3, (c, o, r) => { AK.nz(c, o, { f: 1000 + r * 300, f2: 300, dur: .18, g: .3 }); }],
  flyStart: [1.2, 2, (c, o, r) => { AK.nz(c, o, { ft: 'bandpass', f: 1800, dur: .04, g: .5, q: 3 }); AK.nz(c, o, { f: 300, fmid: 1600, f2: 700, mid: .4, dur: 1.1, g: .7, a: .15 }); AK.osc(c, o, { f: 60, f2: 90, dur: 1, g: .4, a: .1 }); }],
  flyEnd: [.9, 2, (c, o, r) => { for (let i = 0; i < 5; i++) AK.nz(c, o, { f: 900 - i * 120, dur: .08, g: .35 - i * .05, t: i * .14 + Math.random() * .04 }); AK.osc(c, o, { type: 'triangle', f: 300, f2: 80, dur: .7, g: .1 }); }],
  land: [.35, 3, (c, o, r) => { AK.osc(c, o, { f: 110, f2: 38, dur: .25, g: .7 }); AK.nz(c, o, { f: 500, f2: 100, dur: .2, g: .4 }); AK.osc(c, o, { f: 700 + r * 300, dur: .15, g: .06, fm: { ratio: 2.76, index: 4 } }); }],
  step: [.25, 4, (c, o, r) => { AK.osc(c, o, { f: 85 + r * 20, f2: 40, dur: .16, g: .55 }); AK.osc(c, o, { f: 900 + r * 500, dur: .1, g: .07, fm: { ratio: 2.76, index: 3 }, t: .01 }); AK.osc(c, o, { type: 'sawtooth', f: 300, f2: 500, dur: .08, g: .03, lp: 1200 }); }],
  // ---- modules ----
  shieldUp: [.8, 2, (c, o, r) => { for (const [i, f] of [600, 900, 1200, 1800].entries()) AK.osc(c, o, { f, f2: f * 1.5, dur: .6, g: .08, t: i * .04, a: .05 }); AK.nz(c, o, { ft: 'highpass', f: 6000, dur: .5, g: .1, crackle: .4 }); }],
  cloak: [.8, 2, (c, o, r) => { AK.osc(c, o, { type: 'sawtooth', f: 1400, f2: 160, dur: .7, g: .14, lp: 3000, lp2: 300, q: 8 }); AK.nz(c, o, { ft: 'bandpass', f: 4000, f2: 300, dur: .6, g: .2, q: 6 }); }],
  blink: [.4, 3, (c, o, r) => { AK.osc(c, o, { f: 300, f2: 3200, dur: .12, g: .22 }); AK.osc(c, o, { f: 3200, f2: 400, dur: .16, g: .18, t: .12 }); AK.nz(c, o, { ft: 'highpass', f: 3000, dur: .25, g: .2 }); }],
  emp: [1.4, 2, (c, o, r) => { const d = AK.drive(c, o, 3); AK.osc(c, d, { type: 'sawtooth', f: 220, f2: 35, dur: 1, g: .4, lp: 2000, lp2: 150 }); AK.osc(c, o, { f: 55, dur: 1.2, g: .6, a: .02 }); AK.nz(c, o, { ft: 'highpass', f: 3500, dur: 1, g: .25, crackle: .5 }); }],
  power: [.7, 1, (c, o, r) => { [523, 659, 784, 1047].forEach((f, i) => AK.osc(c, o, { type: 'triangle', f, dur: .3, g: .14, t: i * .08 })); AK.nz(c, o, { ft: 'highpass', f: 7000, dur: .5, g: .06 }); }],
  disrupt: [.9, 2, (c, o, r) => { const d = AK.drive(c, o, 4); AK.osc(c, d, { type: 'square', f: 900, f2: 70, dur: .8, g: .2, vib: [24, 60] }); AK.nz(c, o, { ft: 'bandpass', f: 2000, f2: 200, dur: .7, g: .3, q: 3, crackle: .5 }); }],
  // ---- weapon state ----
  heatWarn: [.45, 1, (c, o) => { for (let i = 0; i < 3; i++) AK.osc(c, o, { type: 'square', f: 1480, dur: .07, g: .07, t: i * .12, lp: 3000 }); }],
  overheat: [1.6, 2, (c, o, r) => { AK.nz(c, o, { ft: 'highpass', f: 3500, f2: 1200, dur: 1.5, g: .4, a: .02 }); AK.osc(c, o, { type: 'square', f: 880, f2: 220, dur: .5, g: .1, lp: 2000 }); AK.osc(c, o, { f: 600, dur: .9, g: .06, fm: { ratio: 2.76, index: 2 }, t: .1 }); }],
  vented: [.5, 1, (c, o) => { AK.nz(c, o, { ft: 'highpass', f: 4000, dur: .18, g: .25 }); AK.osc(c, o, { type: 'triangle', f: 880, f2: 1320, dur: .18, g: .12, t: .12 }); }],
  ready: [.5, 1, (c, o) => { AK.osc(c, o, { f: 1319, dur: .18, g: .1, fm: { ratio: 3.5, index: .8 } }); AK.osc(c, o, { f: 1760, dur: .3, g: .1, t: .09, fm: { ratio: 3.5, index: .8 } }); }],
  readySoft: [.25, 1, (c, o) => { AK.osc(c, o, { f: 1046, dur: .16, g: .07, fm: { ratio: 2, index: .6 } }); }],
  lockOn: [.3, 1, (c, o) => { AK.osc(c, o, { type: 'square', f: 1760, dur: .08, g: .06, lp: 4000 }); AK.osc(c, o, { type: 'square', f: 1760, dur: .1, g: .06, t: .12, lp: 4000 }); }],
  lockTick: [.07, 1, (c, o) => { AK.osc(c, o, { type: 'square', f: 1320, dur: .04, g: .04, lp: 4000 }); }],
  // ---- game events ----
  kill: [.7, 1, (c, o) => { AK.osc(c, o, { type: 'triangle', f: 880, dur: .14, g: .2 }); AK.osc(c, o, { type: 'triangle', f: 1319, dur: .3, g: .2, t: .1 }); AK.osc(c, o, { f: 110, f2: 55, dur: .25, g: .4 }); }],
  spawn: [1.1, 1, (c, o) => { AK.osc(c, o, { f: 180, f2: 900, dur: .7, g: .15, a: .1 }); [392, 523, 784].forEach((f, i) => AK.osc(c, o, { type: 'triangle', f, dur: .5, g: .07, t: .35 + i * .06 })); AK.nz(c, o, { ft: 'highpass', f: 5000, dur: .6, g: .08, a: .2 }); }],
  capUs: [.8, 1, (c, o) => { [72, 76, 79, 84].forEach((m, i) => AK.osc(c, o, { type: 'triangle', f: mtof(m), dur: .3, g: .14, t: i * .08 })); }],
  capThem: [.8, 1, (c, o) => { [67, 63, 60, 55].forEach((m, i) => AK.osc(c, o, { type: 'sawtooth', f: mtof(m), dur: .3, g: .06, t: i * .09, lp: 1800 })); }],
  wave: [2.2, 1, (c, o) => { for (const [f, d] of [[110, -8], [110, 8], [165, 0], [55, 0]]) AK.osc(c, o, { type: 'sawtooth', f, dur: 1.9, g: .14, a: .35, detune: d, lp: 1400, lp2: 500 }); AK.osc(c, o, { f: 55, dur: 1.6, g: .4, a: .2 }); }],
  alarm: [.9, 1, (c, o) => { for (let i = 0; i < 2; i++) AK.osc(c, o, { type: 'square', f: 760, f2: 1140, dur: .3, g: .08, t: i * .38, lp: 2500 }); }],
  beep: [.15, 1, (c, o) => { AK.osc(c, o, { type: 'square', f: 988, dur: .1, g: .07, lp: 3000 }); }],
  // ---- interface and garage ----
  ui: [.12, 2, (c, o, r) => { AK.osc(c, o, { f: 900 + r * 100, f2: 1250, dur: .07, g: .12, fm: { ratio: 2, index: .5 } }); }],
  place: [.18, 4, (c, o, r) => { AK.osc(c, o, { f: 380 + r * 120, f2: 180, dur: .09, g: .25, fm: { ratio: 2.76, index: 2.5 } }); AK.nz(c, o, { ft: 'bandpass', f: 3000, dur: .03, g: .3, q: 3 }); AK.osc(c, o, { f: 90, dur: .06, g: .3 }); }],
  remove: [.25, 3, (c, o, r) => { AK.osc(c, o, { type: 'triangle', f: 320 + r * 60, f2: 110, dur: .12, g: .25 }); AK.nz(c, o, { f: 1400, f2: 300, dur: .14, g: .25 }); }],
  paint: [.3, 3, (c, o, r) => { AK.nz(c, o, { ft: 'bandpass', f: 5000 + r * 1500, f2: 3000, dur: .22, g: .35, q: 1.5, a: .02 }); AK.osc(c, o, { f: 1400, dur: .05, g: .04 }); }],
  error: [.35, 1, (c, o) => { AK.osc(c, o, { type: 'square', f: 220, dur: .12, g: .08, lp: 1500 }); AK.osc(c, o, { type: 'square', f: 165, dur: .16, g: .08, t: .13, lp: 1500 }); }],
  chat: [.2, 1, (c, o) => { AK.osc(c, o, { f: 1568, dur: .08, g: .06, fm: { ratio: 2, index: .4 } }); AK.osc(c, o, { f: 2093, dur: .1, g: .05, t: .06 }); }],
};

const SFX = {
  ctx: null, master: null, sfxBus: null, uiBus: null, musicBus: null, wet: null, noise: null, budget: 0, voices: 0, ends: [], eng: null, amb: null, laser: null, bank: {}, ready_: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const lim = c.createDynamicsCompressor(); lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 8; lim.attack.value = .003; lim.release.value = .2; lim.connect(c.destination);
      this.master = c.createGain(); this.master.connect(lim);
      // effects get their own glue compressor so explosions duck small sounds a little
      const glue = c.createDynamicsCompressor(); glue.threshold.value = -18; glue.ratio.value = 3; glue.attack.value = .01; glue.release.value = .25; glue.connect(this.master);
      this.sfxBus = c.createGain(); this.sfxBus.connect(glue);
      this.uiBus = c.createGain(); this.uiBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.connect(this.master);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
      // reverb: a short bright room plus a long dark tail
      const ir = c.createBuffer(2, c.sampleRate * 2.6, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < x.length; i++) { const k = i / x.length; lp = lp * .6 + (Math.random() * 2 - 1) * .4; x[i] = (i < c.sampleRate * .08 ? Math.random() * 2 - 1 : lp) * Math.pow(1 - k, 3) * (i < c.sampleRate * .08 ? .5 : 1); } }
      const verb = c.createConvolver(); verb.buffer = ir; this.wet = c.createGain(); this.wet.gain.value = .8; this.wet.connect(verb); verb.connect(this.master);
      this.apply(); Music.boot(); this.renderBank();
    } catch (e) { this.ctx = null; }
  },
  // renders every one-shot into buffers in the background, a few at a time
  async renderBank() {
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!Off) return;
    const sr = 32000;
    for (const [name, [len, vars, fn]] of Object.entries(RECIPES)) {
      const list = [];
      for (let v = 0; v < vars; v++) {
        try { const c = new Off(1, Math.ceil(sr * len), sr), out = c.createGain(); out.gain.value = .9; out.connect(c.destination); fn(c, out, vars > 1 ? v / (vars - 1) : .5); list.push(await c.startRendering()); }
        catch (e) { }
      }
      // even out levels: nothing clips, nothing is too faint to hear
      let pk = 0; for (const bf of list) { const d = bf.getChannelData(0); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
      const k = pk > 0 ? clamp(pk, .3, .95) / pk : 1; if (k !== 1) for (const bf of list) { const d = bf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] *= k; }
      if (list.length) this.bank[name] = list;
    }
    this.ready_ = true;
  },
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master * .75, t, .05);
    this.sfxBus.gain.setTargetAtTime(settings.sfx, t, .05); this.uiBus.gain.setTargetAtTime(settings.sfx * .9, t, .05);
    this.musicBus.gain.setTargetAtTime(settings.music * .5, t, .05);
  },
  vol(pos) { if (!pos) return 1; const d = camera.position.distanceTo(pos); return Math.pow(clamp(1 - d / 300, 0, 1), 1.6); },
  // voices are counted by when they end on the audio clock, so a suspended or busy page can't wedge the count
  ok() {
    if (!this.ctx || settings.master <= 0 || this.budget >= 28) return false;
    const now = this.ctx.currentTime; if (this.ends.length > 40) this.ends = this.ends.filter(t => t > now);
    this.voices = this.ends.length; return this.voices < 56;
  },
  // spatial output: stereo position, distance muffling and more reverb far away
  out(pos, wetAmt, ui) {
    const c = this.ctx, pan = c.createStereoPanner();
    let p = 0, dist = 0;
    if (pos) { _sv.copy(pos).sub(camera.position); dist = _sv.length(); _sr.setFromMatrixColumn(camera.matrixWorld, 0); p = clamp(_sv.normalize().dot(_sr), -1, 1) * .85; }
    pan.pan.value = p;
    let head = pan;
    if (pos && dist > 25) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clamp(16000 * Math.pow(25 / dist, 1.1), 900, 16000); f.connect(pan); head = f; }
    pan.connect(ui ? this.uiBus : this.sfxBus);
    const w = c.createGain(); w.gain.value = wetAmt != null ? wetAmt : (pos ? .1 + .5 * clamp(dist / 220, 0, 1) : .08); pan.connect(w); w.connect(this.wet);
    return head;
  },
  // plays a rendered sound; rate and gain get a little random variation so repeats don't sound identical
  play(name, pos, o = {}) {
    if (!this.ok()) return; const list = this.bank[name]; if (!list) return;
    const v = (o.g == null ? 1 : o.g) * this.vol(pos); if (v < .01) return;
    this.budget++; this.voices++;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = list[Math.random() * list.length | 0]; s.playbackRate.value = (o.rate || 1) * (1 + (o.jit == null ? .05 : o.jit) * (Math.random() * 2 - 1));
    g.gain.value = v; s.connect(g); g.connect(this.out(pos, o.wet, o.ui));
    const t0 = c.currentTime + (o.delay || 0); this.ends.push(t0 + s.buffer.duration / s.playbackRate.value); s.start(t0);
  },
  // simple live tone, for anything played before the bank has finished rendering
  tone(f1, f2, dur, type, gain, o = {}) {
    if (!this.ok() || gain < .003) return; this.budget++;
    const c = this.ctx, t = c.currentTime + (o.delay || 0), osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f1, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    osc.connect(g); g.connect(this.out(o.pos, o.wet, !o.pos)); osc.start(t); osc.stop(t + dur + .03);
  },
  // ---- weapons ----
  blaster(p) { this.play('blaster', p, { g: .55 }); },
  plasma(p) { this.play('plasma', p, { g: .7 }); },
  mortar(p) { this.play('mortar', p, { g: .8 }); },
  rail(p) { this.play('rail', p, { g: .75 }); },
  seeker(p) { this.play('seeker', p, { g: .6 }); },
  flak(p) { this.play('flak', p, { g: .65 }); },
  flakBurst(p) { this.play('flakBurst', p, { g: .6 }); },
  chain(p, spin) { this.play('chain', p, { g: .42, rate: .9 + (spin || 0) * .25 }); },
  arc(p) { this.play('arc', p, { g: .6 }); },
  zap(p) { this.play('zap', p, { g: .4 }); },
  mine(p) { this.play('mine', p, { g: .6 }); },
  lancer(p) { this.play('lancer', p, { g: .9, jit: .02 }); },
  // ---- impacts and events ----
  boom(p, big) { this.play(big ? 'boomL' : 'boomS', p, { g: big ? 1 : .75, jit: .08 }); },
  hit() { this.play('hit', null, { g: .45, ui: true }); },
  hurt() { this.play('hurt', null, { g: .6 }); },
  crunch(p) { this.play('metal', p, { g: .45, jit: .12 }); },
  shieldHit(p) { this.play('shieldHit', p, { g: .4 }); },
  dash(p) { this.play('dash', p, { g: .6 }); },
  jet(p) { this.play('jet', p, { g: .25, jit: .15 }); },
  step(p, g) { this.play('step', p, { g: g || .4, jit: .1 }); },
  land(p, g) { this.play('land', p, { g: g || .6 }); },
  flyStart(p, mine) { this.play('flyStart', p, { g: mine ? .7 : .55 }); },
  flyEnd(p) { this.play('flyEnd', p, { g: .5 }); },
  mod(t, p) { const n = { shield: 'shieldUp', cloak: 'cloak', blink: 'blink', emp: 'emp', power: 'power', disrupt: 'disrupt' }[t]; if (n) this.play(n, p, { g: .7 }); },
  heatWarn() { this.play('heatWarn', null, { ui: true, jit: 0 }); },
  overheat(p) { this.play('overheat', p, { g: p ? .45 : .7 }); },
  vented() { this.play('vented', null, { g: .7, ui: true }); },
  ready(t) { this.play(t === 'dash' ? 'readySoft' : 'ready', null, { ui: true, g: .7, jit: 0 }); },
  lock(on) { this.play(on ? 'lockOn' : 'lockTick', null, { ui: true, jit: 0 }); },
  kill() { this.play('kill', null, { ui: true, jit: 0 }); },
  capture(ours) { this.play(ours ? 'capUs' : 'capThem', null, { ui: true, jit: 0, wet: .35 }); },
  wave() { this.play('wave', null, { ui: true, jit: 0, wet: .4 }); },
  alarm() { this.play('alarm', null, { ui: true, jit: 0 }); },
  beep() { this.play('beep', null, { ui: true, jit: 0 }); },
  spawn() { this.play('spawn', null, { g: .8, jit: 0, wet: .4 }); },
  click() { if (this.bank.place) this.play('place', null, { ui: true, g: .7 }); else this.tone(520, 760, .05, 'triangle', .1); },
  pop() { if (this.bank.remove) this.play('remove', null, { ui: true, g: .7 }); else this.tone(300, 110, .08, 'triangle', .1); },
  paint() { this.play('paint', null, { ui: true, g: .6 }); },
  error() { this.play('error', null, { ui: true, jit: 0 }); },
  chat() { this.play('chat', null, { ui: true, jit: 0, g: .8 }); },
  ui() { if (this.bank.ui) this.play('ui', null, { ui: true, g: .6, jit: .03 }); else this.tone(880, 1100, .06, 'sine', .06); },

  // ---- the player's machine: one live synth with a layer for every way of moving ----
  loopNoise() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(0, Math.random() * 1.5); return s; },
  engineStart() {
    if (!this.ctx || this.eng) return;
    const c = this.ctx, e = this.eng = { L: {} }, out = e.out = c.createGain(); out.gain.value = 0; out.connect(this.sfxBus);
    const W = c.createGain(); W.gain.value = .12; out.connect(W); W.connect(this.wet);
    const layer = (name, build) => { const g = c.createGain(); g.gain.value = 0; g.connect(out); e.L[name] = Object.assign({ g }, build(g)); };
    const osc = (type, f, dest, gain = 1) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; const g = c.createGain(); g.gain.value = gain; o.connect(g); g.connect(dest); o.start(); return o; };
    const filt = (type, f, q, dest) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; x.connect(dest); return x; };
    const shaper = (k, dest) => { const w = c.createWaveShaper(), n = 512, cu = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; cu[i] = Math.tanh(x * k); } w.curve = cu; w.connect(dest); return w; };
    // combustion engine: two detuned saws and a sub, driven and low-passed
    layer('motor', g => { const f = filt('lowpass', 300, 3, g), sh = shaper(2.5, f); return { f, o1: osc('sawtooth', 40, sh, .6), o2: osc('sawtooth', 40.7, sh, .6), sub: osc('square', 20, sh, .5) }; });
    // tyres on dirt
    layer('tyre', g => { const f = filt('bandpass', 400, .9, g); this.loopNoise().connect(f); return { f }; });
    // tread clatter: noise chopped by a square wave whose rate follows speed
    layer('tread', g => { const f = filt('bandpass', 1200, 2, g), am = c.createGain(); am.gain.value = 0; this.loopNoise().connect(am); am.connect(f); const lfo = osc('square', 8, am.gain, .5); const off = c.createConstantSource ? c.createConstantSource() : null; if (off) { off.offset.value = .5; off.connect(am.gain); off.start(); } return { f, lfo }; });
    // hover pads: a humming pair with a wobble, plus an air hiss
    layer('hover', g => { const f = filt('lowpass', 900, 1, g); const o1 = osc('sine', 110, f, .7), o2 = osc('triangle', 221, f, .25), w = osc('sine', 3.2, o1.frequency, 3), hiss = filt('highpass', 2500, .7, g); const hg = c.createGain(); hg.gain.value = .25; this.loopNoise().connect(hg); hg.connect(hiss); return { f, o1, o2 }; });
    // rotor blades: low noise amplitude-modulated at the blade rate, plus a thump
    layer('rotor', g => { const f = filt('lowpass', 500, 1.2, g), am = c.createGain(); am.gain.value = .5; this.loopNoise().connect(am); am.connect(f); const lfo = osc('sine', 10, am.gain, .5), th = osc('sine', 45, g, .0); const thG = c.createGain(); thG.gain.value = 0; return { f, lfo, th }; });
    // turbine whine for thrusters, planes and space
    layer('turbine', g => { const f = filt('bandpass', 2000, 4, g); const o = osc('sawtooth', 600, f, .4), n = filt('lowpass', 1400, .7, g); const ng = c.createGain(); ng.gain.value = .5; this.loopNoise().connect(ng); ng.connect(n); return { f, o, n }; });
    // jump-jet roar
    layer('jets', g => { const f = filt('lowpass', 900, .8, g); this.loopNoise().connect(f); const sub = osc('sine', 52, g, .4); return { f }; });
    // servos for legs
    layer('servo', g => { const f = filt('bandpass', 700, 3, g); const o = osc('sawtooth', 300, f, .5); return { f, o }; });
    // skis scraping
    layer('ski', g => { const f = filt('highpass', 2500, .7, g); this.loopNoise().connect(f); return { f }; });
    // propeller buzz
    layer('prop', g => { const f = filt('lowpass', 800, 2, g); const o = osc('sawtooth', 70, f, .5); return { f, o }; });
    // Sky Booster rocket
    layer('rocket', g => { const f = filt('lowpass', 700, .9, g), sh = shaper(3, f); this.loopNoise().connect(sh); const sub = osc('sawtooth', 38, f, .3); const cr = filt('highpass', 4000, .7, g), cg = c.createGain(); cg.gain.value = .12; this.loopNoise().connect(cg); cg.connect(cr); return { f }; });
    // chain-gun barrels spinning
    layer('spin', g => { const f = filt('bandpass', 900, 5, g); const o = osc('sawtooth', 200, f, .6); return { f, o }; });
    // Rail Lancer charging
    layer('charge', g => { const o = osc('sawtooth', 200, g, .25), o2 = osc('sine', 400, g, .4), trem = osc('sine', 12, g.gain, 0); return { o, o2 }; });
    e.walkStep = 0; e.wasAir = false;
  },
  engineUpdate(b, on) {
    const e = this.eng; if (!e) return; const t = this.ctx.currentTime, k = .08, L = e.L;
    const live = on && b && !b.dead;
    e.out.gain.setTargetAtTime(live ? .2 : 0, t, .15);
    if (!live) return;
    const sp = Math.hypot(b.vel.x, b.vel.z), mode = b.mob.mode, thr = Math.abs(b.input.throttle), S = b.stats || {}, fly = b.flyT > 0;
    const set = (name, gain, fn) => { const l = L[name]; l.g.gain.setTargetAtTime(gain, t, k); if (fn && gain > .001) fn(l); };
    const ground = mode === 'wheel' || mode === 'tread' || mode === 'ski' || mode === 'leg';
    const grounded = !b.airborne;
    set('motor', mode === 'wheel' || mode === 'tread' ? .5 : fly ? .25 : 0, l => {
      const base = mode === 'tread' ? 28 : 36, rpm = base + sp * (mode === 'tread' ? 1.6 : 2.6) + thr * 10;
      l.o1.frequency.setTargetAtTime(rpm, t, k); l.o2.frequency.setTargetAtTime(rpm * 1.012, t, k); l.sub.frequency.setTargetAtTime(rpm / 2, t, k);
      l.f.frequency.setTargetAtTime(180 + sp * 22 + thr * 260, t, k);
    });
    set('tyre', mode === 'wheel' && grounded ? clamp(sp / 30, 0, .45) : 0, l => l.f.frequency.setTargetAtTime(250 + sp * 30, t, k));
    set('tread', mode === 'tread' && grounded ? clamp(.08 + sp / 25, 0, .55) : 0, l => { l.lfo.frequency.setTargetAtTime(3 + sp * 1.4, t, k); l.f.frequency.setTargetAtTime(700 + sp * 40, t, k); });
    set('hover', mode === 'hover' ? .35 : 0, l => { l.o1.frequency.setTargetAtTime(100 + sp * 3 + b.alt * 2, t, k); l.o2.frequency.setTargetAtTime(201 + sp * 6, t, k); l.f.frequency.setTargetAtTime(500 + sp * 30, t, k); });
    set('rotor', mode === 'rotor' ? .55 : 0, l => { l.lfo.frequency.setTargetAtTime(9 + sp * .25 + (b.input.up ? 4 : 0), t, k); l.f.frequency.setTargetAtTime(350 + sp * 10, t, k); });
    set('turbine', mode === 'plane' || mode === 'space' || (S.thrusters > 0 && thr > 0) ? .3 : 0, l => { l.o.frequency.setTargetAtTime(500 + sp * 30 + thr * 200, t, k); l.f.frequency.setTargetAtTime(1500 + sp * 60, t, k); });
    set('jets', b.jetting ? .55 : 0);
    set('servo', (mode === 'leg' || (S.insects || 0) + (S.sprints || 0) > 0) && sp > .5 ? clamp(sp / 20, .05, .25) : 0, l => { l.o.frequency.setTargetAtTime(240 + sp * 25, t, k); l.f.frequency.setTargetAtTime(600 + sp * 40, t, k); });
    set('ski', mode === 'ski' && grounded ? clamp(sp / 30, 0, .4) : 0, l => l.f.frequency.setTargetAtTime(1800 + sp * 50, t, k));
    set('prop', (S.props || 0) > 0 ? .1 + thr * .25 : 0, l => { l.o.frequency.setTargetAtTime(60 + thr * 90 + sp * 2, t, k); });
    set('rocket', fly ? .7 : 0, l => l.f.frequency.setTargetAtTime(600 + (b.input.up ? 500 : 0) + sp * 10, t, k));
    set('spin', b.spin > .02 ? b.spin * .22 : 0, l => { l.o.frequency.setTargetAtTime(120 + b.spin * 900, t, k); l.f.frequency.setTargetAtTime(400 + b.spin * 2400, t, k); });
    const ch = typeof b.charge === 'number' ? clamp(b.charge / WEAPONS.lancer.charge, 0, 1) : 0;
    set('charge', ch > 0 ? .08 + ch * .2 : 0, l => { l.o.frequency.setTargetAtTime(160 + ch * 900, t, .03); l.o2.frequency.setTargetAtTime(320 + ch * 1800, t, .03); });
    // footsteps and landings
    if (b.legs && b.legs.length && b.walk != null) { const st = Math.floor(b.walk / Math.PI); if (st !== e.walkStep) { e.walkStep = st; if (sp > 1) this.step(b.pos, .35 + clamp((b.mass || 100) / 400, 0, .4)); } }
    if (e.wasAir && grounded && !fly && b.vel.y <= .5 && ground) this.land(b.pos, .4 + clamp((e.fallV || 0) / 20, 0, .5));
    e.fallV = b.airborne ? Math.max(e.fallV || 0, -b.vel.y) : 0; e.wasAir = b.airborne;
  },
  // continuous beams: the Nano Mender's shimmer
  beamStart(kind) {
    if (!this.ctx) return; if (this.laser && this.laser.kind === kind) return; this.beamStop();
    const c = this.ctx, l = this.laser = { kind, nodes: [] };
    l.g = c.createGain(); l.g.gain.value = 0; l.g.connect(this.out(null, .3));
    for (const [f, type, gg] of [[660, 'sine', .5], [990, 'sine', .25], [1320, 'triangle', .12]]) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; const g = c.createGain(); g.gain.value = gg; o.connect(g); g.connect(l.g); o.start(); l.nodes.push(o); }
    const lfo = c.createOscillator(); lfo.frequency.value = 6; const lg = c.createGain(); lg.gain.value = 18; lfo.connect(lg); for (const o of l.nodes) lg.connect(o.frequency); lfo.start(); l.nodes.push(lfo);
    const n = this.loopNoise(), nf = c.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 7000; const ng = c.createGain(); ng.gain.value = .2; n.connect(nf); nf.connect(ng); ng.connect(l.g); l.nodes.push(n);
    l.g.gain.setTargetAtTime(.07, c.currentTime, .06);
  },
  beamStop() { const l = this.laser; if (!l) return; this.laser = null; const t = this.ctx.currentTime; l.g.gain.setTargetAtTime(0, t, .05); for (const n of l.nodes) n.stop(t + .3); },
  // ---- map ambience: a bed per map plus occasional events ----
  ambientStart(mapId) {
    this.ambientStop(); if (!this.ctx) return;
    const c = this.ctx, a = this.amb = { mapId, nodes: [], evT: 2 };
    a.g = c.createGain(); a.g.gain.value = 0; a.g.connect(this.sfxBus); const wet = c.createGain(); wet.gain.value = .3; a.g.connect(wet); wet.connect(this.wet);
    const bed = (type, f, q, gain, lfoF, lfoD) => { const n = this.loopNoise(), fl = c.createBiquadFilter(), g = c.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = gain; n.connect(fl); fl.connect(g); g.connect(a.g); a.nodes.push(n); if (lfoF) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = lfoF; lg.gain.value = lfoD; l.connect(lg); lg.connect(fl.frequency); l.start(); a.nodes.push(l); } };
    const hum = (f, gain) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.value = gain; o.connect(g); g.connect(a.g); o.start(); a.nodes.push(o); };
    if (mapId === 'dust') { bed('bandpass', 450, .9, .5, .07, 250); bed('highpass', 4000, .5, .08, .11, 1500); }
    else if (mapId === 'frost') { bed('bandpass', 900, 7, .5, .09, 400); bed('bandpass', 1500, 9, .25, .13, 600); bed('lowpass', 300, .7, .3); }
    else if (mapId === 'ash') { bed('lowpass', 140, 1, 1, .05, 50); hum(38, .25); bed('highpass', 3000, .5, .05); }
    else if (mapId === 'city') { bed('lowpass', 220, .8, .5, .04, 60); bed('bandpass', 700, 1, .15, .06, 300); hum(58, .06); }
    else if (mapId === 'moon') { hum(55, .12); hum(82.5, .05); bed('lowpass', 180, .7, .25); }
    else if (mapId === 'space') { hum(41, .14); hum(61.7, .07); bed('bandpass', 2500, 2, .06, .2, 1200); }
    else bed('bandpass', 450, 1, .4, .06, 300);
    a.g.gain.setTargetAtTime(mapId === 'ash' ? .3 : .16, c.currentTime, 1.5);
  },
  ambientTick(dt) {
    const a = this.amb; if (!a || !this.ctx) return; a.evT -= dt; if (a.evT > 0) return;
    a.evT = 2 + Math.random() * 6; const far = () => camera.position.clone().add(new T.Vector3(rand(-150, 150), rand(0, 30), rand(-150, 150)));
    const m = a.mapId;
    if (m === 'ash') { for (let i = 0; i < 3; i++) this.tone(rand(60, 120), 30, .25, 'sine', .08, { pos: far(), delay: i * rand(.05, .2) }); a.evT = 1 + Math.random() * 2; }
    else if (m === 'frost') this.tone(rand(180, 320), rand(90, 140), .5, 'triangle', .03, { pos: far() }); // ice creak
    else if (m === 'city') { if (Math.random() < .4) this.play('metal', far(), { g: .5, rate: .5 }); else this.tone(620, 780, 1.2, 'sine', .015, { pos: far() }); }
    else if (m === 'moon' || m === 'space') { for (let i = 0; i < 3; i++) this.tone(rand(1200, 2400), rand(1200, 2400), .06, 'square', .012, { delay: i * .09, wet: .6 }); }
    else if (m === 'dust') this.play('jet', far(), { g: .5, rate: .4 }); // a gust
  },
  ambientStop() { const a = this.amb; if (!a) return; this.amb = null; const t = this.ctx.currentTime; a.g.gain.setTargetAtTime(0, t, .3); for (const n of a.nodes) n.stop(t + 1.5); },
};

// ================= MUSIC =================
// Generative score: menu, garage, three battle themes (ground, space, horde) and win/lose stingers.
// Battle themes follow the fight: calm when nothing is near, full arrangement in a firefight.
const Music = {
  track: null, want: null, next: 0, step: 0, timer: 0, delay: null, gain: null, intensity: 0, heat: 0,
  TRACKS: {
    menu:   { bpm: 86,  swing: 0,   chords: [[50, 57, 60, 64, 69], [46, 53, 57, 62, 65], [43, 50, 55, 58, 62], [45, 52, 55, 61, 64]], parts: ['pad', 'bell', 'sub', 'air'] },
    garage: { bpm: 98,  swing: .12, chords: [[45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [48, 55, 59, 64, 67], [40, 47, 50, 55, 59]], parts: ['pad', 'pluck', 'fmbass', 'lofi', 'bell'] },
    battle: { bpm: 132, swing: 0,   chords: [[40, 47, 52, 55, 59], [36, 43, 48, 52, 55], [38, 45, 50, 54, 57], [35, 42, 47, 50, 54]], parts: ['drums', 'grit', 'arp', 'pad', 'lead', 'perc'] },
    space:  { bpm: 112, swing: 0,   chords: [[42, 49, 54, 57, 61], [38, 45, 50, 54, 57], [45, 52, 57, 61, 64], [40, 47, 52, 56, 59]], parts: ['pad', 'pulse', 'halfdrums', 'bell', 'arp'] },
    horde:  { bpm: 140, swing: 0,   chords: [[38, 45, 50, 53, 57], [34, 41, 46, 50, 53], [36, 43, 48, 51, 55], [33, 40, 45, 49, 52]], parts: ['drums', 'toms', 'grit', 'choir', 'lead', 'perc'] },
  },
  boot() {
    const c = SFX.ctx; if (!c || this.gain) return;
    this.gain = c.createGain(); this.gain.gain.value = 0; this.gain.connect(SFX.musicBus);
    const d = this.delay = c.createDelay(1.5), fb = c.createGain(), lp = c.createBiquadFilter();
    fb.gain.value = .3; lp.type = 'lowpass'; lp.frequency.value = 2800; d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.gain);
    this.verb = c.createGain(); this.verb.gain.value = .45; this.verb.connect(SFX.wet);
    this.bus = this.gain;
    if (this.want) this.play(this.want);
    this.timer = setInterval(() => this.tick(), 50);
  },
  pick(name) { if (name === 'battle' && typeof match !== 'undefined' && match) return match.mode === 'space' ? 'space' : match.mode === 'horde' ? 'horde' : 'battle'; return name; },
  play(name) {
    name = this.pick(name); if (this.want === name && (this.track === name || this.pending)) return; this.want = name; if (!this.gain) return;
    if (this.track === name && !this.pending) return;
    const c = SFX.ctx, t = c.currentTime, tok = this.tok = (this.tok || 0) + 1; this.pending = true;
    this.gain.gain.cancelScheduledValues(t); this.gain.gain.setTargetAtTime(0, t, .25);
    setTimeout(() => { if (tok !== this.tok) return; this.pending = false; this.track = name; this.step = 0; this.next = SFX.ctx.currentTime + .1; const T0 = this.TRACKS[name]; this.delay.delayTime.value = 60 / T0.bpm * .75; this.gain.gain.setTargetAtTime(1, SFX.ctx.currentTime, .6); }, 700);
  },
  // short tune at the end of a match, over a dipped soundtrack
  sting(win) {
    const c = SFX.ctx; if (!c || !this.gain) return; const t = c.currentTime + .05;
    this.gain.gain.setTargetAtTime(.15, t, .2); setTimeout(() => this.gain && this.gain.gain.setTargetAtTime(1, SFX.ctx.currentTime, 1.5), 3500);
    const notes = win ? [[60, 0], [64, .14], [67, .28], [72, .42]] : [[67, 0], [63, .2], [60, .4], [55, .6]];
    for (const [n, d] of notes) { this.v('sawtooth', n, t + d, .5, .06, { cut: 2600, detune: 6, verb: true, out: SFX.musicBus }); this.v('triangle', n + 12, t + d, .4, .05, { verb: true, out: SFX.musicBus }); }
    const ch = win ? [48, 55, 60, 64, 67] : [43, 50, 55, 58, 62];
    for (const n of ch) this.v('sawtooth', n, t + (win ? .56 : .8), 2.2, .035, { cut: 1800, attack: .05, release: 1.2, verb: true, detune: n % 2 ? 7 : -7, out: SFX.musicBus });
    this.drum('kick', t + (win ? .56 : .8), 1, SFX.musicBus);
  },
  // how busy the fight around the player is, 0..1
  combat() {
    if (typeof match === 'undefined' || !match || !match.player || state !== 'battle') return 0;
    const P = match.player; let near = 0; for (const b of world.bots) if (!b.dead && b.team !== P.team && b.pos.distanceToSquared(P.pos) < 90 * 90) near++;
    return clamp(near / 4 + hudFx.dmg * 1.5 + (P.input.fire ? .3 : 0) + (match.horde && match.horde.live ? .3 : 0), 0, 1);
  },
  tick() {
    const c = SFX.ctx; if (!c || !this.track || settings.music <= 0) return;
    this.heat = this.combat(); this.intensity += (this.heat - this.intensity) * (this.heat > this.intensity ? .08 : .01);
    const TR = this.TRACKS[this.track], sixteenth = 60 / TR.bpm / 4;
    while (this.next < c.currentTime + .25) { const sw = this.step % 2 ? sixteenth * TR.swing : 0; this.sched(TR, this.step, this.next + sw, sixteenth); this.step++; this.next += sixteenth; }
  },
  v(type, note, t, dur, gain, o = {}) {
    const c = SFX.ctx, osc = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    osc.type = type; osc.frequency.value = mtof(note); if (o.detune) osc.detune.value = o.detune;
    if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = mtof(note) * .006; l.connect(lg); lg.connect(osc.frequency); l.start(t + .15); l.stop(t + dur + .05); }
    if (o.fm) { const m = c.createOscillator(), mg = c.createGain(); m.frequency.value = mtof(note) * o.fm; mg.gain.setValueAtTime(mtof(note) * (o.fmi || 2), t); mg.gain.exponentialRampToValueAtTime(Math.max(1, mtof(note) * .05), t + dur); m.connect(mg); mg.connect(osc.frequency); m.start(t); m.stop(t + dur + .05); }
    f.type = 'lowpass'; f.frequency.setValueAtTime(o.cut || 2000, t); if (o.cutTo) f.frequency.exponentialRampToValueAtTime(o.cutTo, t + dur); f.Q.value = o.q || 1;
    const a = o.attack || .005, r = o.release || .08;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + a); g.gain.setValueAtTime(gain, t + Math.max(a, dur - r)); g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(f); f.connect(g); g.connect(o.out || this.bus); if (o.echo) g.connect(this.delay); if (o.verb) g.connect(this.verb);
    osc.start(t); osc.stop(t + dur + .05);
  },
  drum(kind, t, amt = 1, out) {
    const c = SFX.ctx, dest = out || this.bus;
    if (kind === 'kick') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + .12); g.gain.setValueAtTime(.9 * amt, t); g.gain.exponentialRampToValueAtTime(.001, t + .42); o.connect(g); g.connect(dest); o.start(t); o.stop(t + .45);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), cg = c.createGain(); s.buffer = SFX.noise; f.type = 'highpass'; f.frequency.value = 3000; cg.gain.setValueAtTime(.15 * amt, t); cg.gain.exponentialRampToValueAtTime(.001, t + .015); s.connect(f); f.connect(cg); cg.connect(dest); s.start(t, Math.random()); s.stop(t + .03); return; }
    if (kind === 'tom') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(amt > 1 ? 150 : 110, t); o.frequency.exponentialRampToValueAtTime(60, t + .25); g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .35); o.connect(g); g.connect(dest); g.connect(this.verb); o.start(t); o.stop(t + .4); return; }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = SFX.noise;
    const dur = kind === 'snare' ? .2 : kind === 'clap' ? .16 : kind === 'ohat' ? .22 : .04;
    f.type = kind === 'snare' || kind === 'clap' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 'snare' ? 1900 : kind === 'clap' ? 1300 : 8000; f.Q.value = kind === 'clap' ? 1.5 : .6;
    if (kind === 'clap') { g.gain.setValueAtTime(0, t); for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(.35 * amt, t + i * .012); g.gain.exponentialRampToValueAtTime(.05, t + i * .012 + .01); } g.gain.exponentialRampToValueAtTime(.001, t + dur); }
    else { g.gain.setValueAtTime((kind === 'snare' ? .42 : .12) * amt, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); }
    s.connect(f); f.connect(g); g.connect(dest); if (kind === 'snare' || kind === 'clap') g.connect(this.verb); s.start(t, Math.random()); s.stop(t + dur + .02);
    if (kind === 'snare') this.v('triangle', 54, t, .1, .14 * amt, { cut: 1000, out: dest });
  },
  sched(TR, i, t, st) {
    const bar = Math.floor(i / 16), s = i % 16, ch = TR.chords[bar % 4], sec = Math.floor(bar / 4) % 4, P = TR.parts, I = this.intensity;
    const has = p => P.includes(p);
    // pads: supersaw chords; choir: soft vowel-like stacks
    if (has('pad') && s === 0) for (const [j, n] of ch.slice(0, 4).entries()) for (const d of [-9, 0, 9]) this.v('sawtooth', n + 12, t, st * 16, .012, { detune: d + j, cut: 900 + I * 900, attack: .6, release: .8, verb: d === 0 });
    if (has('choir') && s === 0) for (const n of ch.slice(0, 4)) { this.v('triangle', n + 12, t, st * 16, .03, { attack: .8, release: 1, verb: true, vib: true, cut: 1400 }); this.v('sine', n + 24, t, st * 16, .015, { attack: .9, release: 1, verb: true }); }
    if (has('air') && s === 8 && bar % 2) this.v('sine', ch[4] + 24, t, st * 8, .02, { attack: .4, release: .6, verb: true, echo: true });
    if (has('sub') && s % 8 === 0) this.v('sine', ch[0] - 12, t, st * 8, .17, { attack: .15, release: .4, cut: 400 });
    // bell arpeggios
    if (has('bell') && (s % 4 === 2 || (sec >= 2 && s % 4 === 0))) this.v('sine', ch[(i / 2 | 0) % 5] + 24, t, st * 3, .045, { fm: 3.5, fmi: 1.2, echo: true, verb: true });
    if (has('pluck') && [0, 3, 6, 8, 10, 14].includes(s)) this.v('square', ch[[1, 2, 3, 2, 4, 3][[0, 3, 6, 8, 10, 14].indexOf(s)]] + 12, t, st * 1.6, .032, { cut: 2600, cutTo: 450, echo: true });
    if (has('fmbass') && [0, 6, 8, 11, 14].includes(s)) this.v('sine', ch[0] - 12 + (s === 14 ? 7 : 0), t, st * 2.6, .2, { fm: 1, fmi: 1.6, cut: 900 });
    if (has('pulse') && s % 2 === 0) this.v('sawtooth', ch[0] - 12, t, st * 1.4, .07 + I * .04, { cut: 500 + (s % 4) * 300 + I * 800, cutTo: 200, q: 5 });
    // gritty bass: 8ths with octave jumps; drops out for the breakdown
    if (has('grit') && sec !== 3 && s % 2 === 0) { const up = s % 8 === 6; this.v('sawtooth', ch[0] - 12 + (up ? 12 : 0), t, st * 1.7, .1, { cut: 1500 + I * 1200, cutTo: 170, q: 5 }); if (I > .5) this.v('square', ch[0] - 24, t, st * 1.5, .05, { cut: 300 }); }
    // drums: lighter when calm
    if (has('lofi')) { if (s === 0 || s === 10) this.drum('kick', t, .5); if (s === 4 || s === 12) this.drum('snare', t, .3); if (s % 2 === 0) this.drum('hat', t, .45); }
    if (has('halfdrums')) { if (s === 0) this.drum('kick', t, .8); if (s === 8) this.drum('clap', t, .8); if (s % 4 === 2) this.drum('hat', t, .6); if (I > .5 && s % 2 === 1) this.drum('hat', t, .35); }
    if (has('drums')) {
      const calm = I < .25 && sec !== 2;
      if (sec !== 3 && s % 4 === 0) this.drum('kick', t, calm ? .7 : 1);
      if (!calm && sec !== 3 && (s === 4 || s === 12)) this.drum(this.track === 'horde' ? 'clap' : 'snare', t);
      if (sec === 3 && bar % 4 === 3 && s >= 8) this.drum('snare', t, .3 + (s - 8) * .08);
      if (s % 2 === 1 || (sec === 2 && !calm)) this.drum(s % 4 === 2 ? 'ohat' : 'hat', t, calm ? .4 : 1);
    }
    if (has('toms') && I > .35 && bar % 2 === 1 && s >= 12) this.drum('tom', t, s % 2 ? 1 : 2);
    if (has('perc') && I > .6 && [3, 7, 11, 14].includes(s)) this.drum('clap', t, .3);
    if (has('arp') && (sec >= 1 || I > .5)) this.v('square', ch[[0, 1, 2, 3, 4, 3, 2, 1][s % 8]] + 24, t, st * .9, .022 + I * .012, { cut: 2600 + I * 1600, cutTo: 800, echo: true });
    // lead hook: plays in the middle sections, or whenever the fight is hot
    if (has('lead') && (sec === 1 || sec === 2 || I > .7)) {
      const motif = [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]], deg = [4, 3, 2, 3, 1, 0];
      const k = motif.findIndex(m => m[0] === s);
      if (k >= 0) this.v('sawtooth', ch[deg[(k + bar) % 6]] + 24, t, st * motif[k][1], .032, { cut: 2800, q: 2, attack: .02, echo: true, verb: true, detune: 5, vib: true });
    }
  },
};
