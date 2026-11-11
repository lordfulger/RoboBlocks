// ================= RENDERER =================
const renderer = HEADLESS ? { setPixelRatio() { }, setSize() { }, getPixelRatio: () => 1, render() { }, setRenderTarget() { }, setClearColor() { }, clear() { }, dispose() { }, shadowMap: {}, domElement: document.createElement('canvas') }
  : new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const pixelRatio = () => Math.min(devicePixelRatio, ultraQ() ? 2 : hiQ() ? 1.5 : 1);
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('#view').appendChild(renderer.domElement);
const canvas = renderer.domElement;
const camera = new T.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.resize(); });

const _sunP = new T.Vector3(), _sunD = new T.Vector3();
const GRADE_NONE = { sat: 1, con: 1, tS: [1, 1, 1], tH: [1, 1, 1] };
// ---------- post-processing: HDR scene -> bright pass -> two-level blur -> bloom composite + vignette ----------
const post = (() => {
  const mk = (samples) => new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: samples || 0, depthBuffer: !!samples });
  const sceneRT = mk(4), half = [mk(), mk()], quarter = [mk(), mk()], aoRT = [mk(), mk()], rayRT = [mk(), mk()];
  // the scene's depth, resolved from the multisampled buffer, feeds the ambient occlusion pass
  sceneRT.depthTexture = new T.DepthTexture(1, 1); sceneRT.depthTexture.type = T.UnsignedIntType;
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new T.Mesh(new T.PlaneGeometry(2, 2)), sc = new T.Scene();
  quad.frustumCulled = false; sc.add(quad);
  const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const base = { vertexShader: vs, depthTest: false, depthWrite: false };
  const brightMat = new T.ShaderMaterial({ ...base, uniforms: { tex: { value: null }, th: { value: 1.0 } },
    fragmentShader: 'uniform sampler2D tex; uniform float th; varying vec2 vUv; void main(){ vec3 c = texture2D(tex, vUv).rgb; float l = max(max(c.r, c.g), c.b); float k = smoothstep(th, th + 0.6, l); gl_FragColor = vec4(min(c * k, vec3(12.0)), 1.0); }' });
  const blurMat = new T.ShaderMaterial({ ...base, uniforms: { tex: { value: null }, dir: { value: new T.Vector2() } },
    fragmentShader: 'uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 c = texture2D(tex, vUv).rgb * 0.227; c += (texture2D(tex, vUv + dir * 1.385).rgb + texture2D(tex, vUv - dir * 1.385).rgb) * 0.316; c += (texture2D(tex, vUv + dir * 3.231).rgb + texture2D(tex, vUv - dir * 3.231).rgb) * 0.070; gl_FragColor = vec4(c, 1.0); }' });
  // Ambient occlusion: darkens creases, corners and the gaps between blocks. Works from the depth buffer at half
  // resolution: rebuild each pixel's view-space position, sample a small hemisphere around it, count what is in front.
  const aoMat = new T.ShaderMaterial({ ...base, uniforms: { dep: { value: null }, pInv: { value: new T.Matrix4() }, proj: { value: new T.Matrix4() }, rad: { value: .7 }, px: { value: new T.Vector2() } },
    fragmentShader: `uniform sampler2D dep; uniform mat4 pInv; uniform mat4 proj; uniform float rad; uniform vec2 px; varying vec2 vUv;
      vec3 vpos(vec2 uv){ float d = texture2D(dep, uv).x; vec4 p = pInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        float d0 = texture2D(dep, vUv).x; if (d0 >= 0.9999) { gl_FragColor = vec4(1.0); return; }
        vec3 P = vpos(vUv), dx = vpos(vUv + vec2(px.x, 0.0)) - P, dy = vpos(vUv + vec2(0.0, px.y)) - P; vec3 N = normalize(cross(dx, dy));
        float dist = -P.z, fade = 1.0 - smoothstep(35.0, 80.0, dist);
        if (fade <= 0.0) { gl_FragColor = vec4(1.0); return; }
        float r = rad * clamp(dist / 18.0, 0.8, 1.8), occ = 0.0;
        float a0 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831;
        vec3 rv = vec3(cos(a0), sin(a0), 0.0), Tg = normalize(rv - N * dot(rv, N)), Bg = cross(N, Tg);
        for (int i = 0; i < 12; i++) {
          float fi = float(i), s = (fi + 0.5) / 12.0, ph = fi * 2.39996;
          vec3 h = vec3(cos(ph) * sqrt(s), sin(ph) * sqrt(s), sqrt(1.0 - s));
          vec3 S = P + (Tg * h.x + Bg * h.y + N * h.z) * r * mix(0.2, 1.0, s * s);
          vec4 q = proj * vec4(S, 1.0); vec2 uv = q.xy / q.w * 0.5 + 0.5;
          float sz = vpos(uv).z;
          occ += (sz >= S.z + 0.03 * dist / 10.0 ? 1.0 : 0.0) * smoothstep(0.0, 1.0, r / max(0.001, abs(P.z - sz)));
        }
        occ *= fade;
        gl_FragColor = vec4(vec3(clamp(1.0 - occ / 12.0 * 1.3, 0.0, 1.0)), 1.0);
      }` });
  // light shafts: bright sky around the sun, blurred outward from the sun's spot on screen
  const rayMaskMat = new T.ShaderMaterial({ ...base, uniforms: { tex: { value: null }, dep: { value: null }, sun: { value: new T.Vector2() }, asp: { value: 1 } },
    fragmentShader: 'uniform sampler2D tex; uniform sampler2D dep; uniform vec2 sun; uniform float asp; varying vec2 vUv; void main(){ float sky = step(0.99995, texture2D(dep, vUv).x); vec2 d = (vUv - sun) * vec2(asp, 1.0); float k = exp(-dot(d, d) * 7.0); vec3 c = min(texture2D(tex, vUv).rgb, vec3(3.0)); gl_FragColor = vec4(c * sky * k, 1.0); }' });
  const rayBlurMat = new T.ShaderMaterial({ ...base, uniforms: { tex: { value: null }, sun: { value: new T.Vector2() }, len: { value: .6 } },
    fragmentShader: 'uniform sampler2D tex; uniform vec2 sun; uniform float len; varying vec2 vUv; void main(){ vec2 st = (vUv - sun) * len / 32.0; vec2 uv = vUv; vec3 c = vec3(0.0); float w = 1.0, tw = 0.0; for (int i = 0; i < 32; i++) { c += texture2D(tex, uv).rgb * w; tw += w; w *= 0.955; uv -= st; } gl_FragColor = vec4(c / tw * 2.2, 1.0); }' });
  // final composite: ambient occlusion, bloom, light shafts, colour grade (contrast, saturation, split toning), vignette, film grain
  const compMat = new T.ShaderMaterial({ ...base, uniforms: { tex: { value: null }, b1: { value: null }, b2: { value: null }, strength: { value: .55 }, vig: { value: .35 }, ao: { value: null }, aoK: { value: 0 },
      rays: { value: null }, raysK: { value: 0 }, raysCol: { value: new T.Color(1, 1, 1) }, sat: { value: 1 }, con: { value: 1 }, tS: { value: new T.Vector3(1, 1, 1) }, tH: { value: new T.Vector3(1, 1, 1) }, grain: { value: 0 }, time: { value: 0 } },
    fragmentShader: `uniform sampler2D tex; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D ao; uniform sampler2D rays; uniform float aoK; uniform float strength; uniform float vig; uniform float raysK; uniform vec3 raysCol;
      uniform float sat; uniform float con; uniform vec3 tS; uniform vec3 tH; uniform float grain; uniform float time; varying vec2 vUv;
      void main(){
        if (aoK > 1.5) { gl_FragColor = vec4(texture2D(ao, vUv).rrr, 1.0); return; }
        vec3 c = texture2D(tex, vUv).rgb * mix(1.0, texture2D(ao, vUv).r, aoK);
        c += (texture2D(b1, vUv).rgb * 0.6 + texture2D(b2, vUv).rgb * 0.9) * strength;
        if (raysK > 0.0) c += texture2D(rays, vUv).rgb * raysCol * raysK;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, sat);
        c *= mix(tS, tH, smoothstep(0.05, 0.9, l));
        c = max(vec3(0.0), (c - 0.18) * con + 0.18);
        float d = length(vUv - 0.5) * 1.35; c *= mix(1.0, smoothstep(1.15, 0.3, d), vig);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        if (grain > 0.0) { float n = fract(sin(dot(gl_FragCoord.xy + fract(time * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453); gl_FragColor.rgb += (n - 0.5) * grain; }
      }` });
  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(sc, cam); };
  let W = 1, H = 1;
  function resize() {
    W = Math.max(2, Math.floor(innerWidth * renderer.getPixelRatio())); H = Math.max(2, Math.floor(innerHeight * renderer.getPixelRatio()));
    sceneRT.setSize(W, H); for (const t of half) t.setSize(W >> 1, H >> 1); for (const t of quarter) t.setSize(W >> 2, H >> 2); for (const t of aoRT) t.setSize(W >> 1, H >> 1); for (const t of rayRT) t.setSize(W >> 2, H >> 2);
  }
  function blur(pair, w, h) {
    blurMat.uniforms.tex.value = pair[0].texture; blurMat.uniforms.dir.value.set(1 / w, 0); pass(blurMat, pair[1]);
    blurMat.uniforms.tex.value = pair[1].texture; blurMat.uniforms.dir.value.set(0, 1 / h); pass(blurMat, pair[0]);
  }
  function render(scene, cam3, opts = {}) {
    if (HEADLESS) return;
    renderMirrors(scene, cam3);
    if (!hiQ()) { renderer.setRenderTarget(null); renderer.render(scene, cam3); return; }
    renderer.setRenderTarget(sceneRT); renderer.render(scene, cam3);
    brightMat.uniforms.tex.value = sceneRT.texture; brightMat.uniforms.th.value = opts.threshold || 1.0; pass(brightMat, half[0]);
    blur(half, W >> 1, H >> 1);
    blurMat.uniforms.tex.value = half[0].texture; blurMat.uniforms.dir.value.set(0, 0); pass(blurMat, quarter[0]);
    blur(quarter, W >> 2, H >> 2); blur(quarter, W >> 2, H >> 2);
    const useAo = settings.ao !== false && opts.ao !== 0;
    if (useAo) {
      aoMat.uniforms.dep.value = sceneRT.depthTexture; aoMat.uniforms.pInv.value.copy(cam3.projectionMatrixInverse); aoMat.uniforms.proj.value.copy(cam3.projectionMatrix);
      aoMat.uniforms.rad.value = opts.aoRadius || .7; aoMat.uniforms.px.value.set(2 / W, 2 / H); pass(aoMat, aoRT[0]); blur(aoRT, W >> 1, H >> 1); blur(aoRT, W >> 1, H >> 1);
    }
    // light shafts (High and Ultra) when the sun is on screen or just off it
    let raysK = 0;
    if (opts.sun && opts.rays !== 0) {
      _sunP.copy(cam3.position).addScaledVector(opts.sun, 900).project(cam3);
      const sx = _sunP.x * .5 + .5, sy = _sunP.y * .5 + .5, facing = _sunP.z < 1 && cam3.getWorldDirection(_sunD).dot(opts.sun) > 0;
      const edge = Math.max(Math.abs(_sunP.x), Math.abs(_sunP.y));
      raysK = facing ? (opts.rays || .35) * (1 - smoothstep(1, 1.6, edge)) * (ultraQ() ? 1.25 : 1) : 0;
      if (raysK > .01) {
        rayMaskMat.uniforms.tex.value = sceneRT.texture; rayMaskMat.uniforms.dep.value = sceneRT.depthTexture; rayMaskMat.uniforms.sun.value.set(sx, sy); rayMaskMat.uniforms.asp.value = W / H; pass(rayMaskMat, rayRT[0]);
        rayBlurMat.uniforms.sun.value.set(sx, sy);
        rayBlurMat.uniforms.tex.value = rayRT[0].texture; rayBlurMat.uniforms.len.value = .7; pass(rayBlurMat, rayRT[1]);
        rayBlurMat.uniforms.tex.value = rayRT[1].texture; rayBlurMat.uniforms.len.value = .25; pass(rayBlurMat, rayRT[0]);
      } else raysK = 0;
    }
    post.raysK = raysK; compMat.uniforms.rays.value = rayRT[0].texture; compMat.uniforms.raysK.value = raysK; if (opts.sunCol) compMat.uniforms.raysCol.value.copy(opts.sunCol);
    const gr = opts.grade || GRADE_NONE; compMat.uniforms.sat.value = gr.sat; compMat.uniforms.con.value = gr.con; compMat.uniforms.tS.value.set(...gr.tS); compMat.uniforms.tH.value.set(...gr.tH);
    compMat.uniforms.grain.value = ultraQ() && opts.grain !== 0 ? (opts.grain || .028) : 0; compMat.uniforms.time.value = performance.now() / 1000;
    compMat.uniforms.ao.value = aoRT[0].texture; compMat.uniforms.aoK.value = useAo ? (window.__aoDebug ? 2 : opts.ao != null ? opts.ao : .85) : 0;
    compMat.uniforms.tex.value = sceneRT.texture; compMat.uniforms.b1.value = half[0].texture; compMat.uniforms.b2.value = quarter[0].texture;
    compMat.uniforms.strength.value = opts.bloom != null ? opts.bloom : .55; compMat.uniforms.vig.value = opts.vignette != null ? opts.vignette : .35;
    pass(compMat, null);
  }
  resize();
  return { render, resize };
})();
const pmrem = HEADLESS ? null : new T.PMREMGenerator(renderer);
function envFromScene(scene, far = 2000) { if (!pmrem) return null; const rt = pmrem.fromScene(scene, 0.02, 0.1, far); return rt.texture; }
function studioEnv() {
  const s = new T.Scene();
  const room = new T.Mesh(new T.BoxGeometry(40, 20, 40), new T.MeshBasicMaterial({ color: 0x23292e, side: T.BackSide })); room.position.y = 8; s.add(room);
  const panel = (w, h, x, y, z, ry, rx, col, k) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
  panel(14, 4, 0, 17.5, 0, 0, HALF_PI, 0xffffff, 3.2); panel(6, 10, -19.5, 8, 4, HALF_PI, 0, 0xcfe0ff, 1.6); panel(6, 10, 19.5, 8, -6, -HALF_PI, 0, 0xffd2a6, 1.4); panel(20, 2, 0, 3, -19.5, 0, 0, 0xff8a1f, 1.2);
  return envFromScene(s, 100);
}

// ================= TEXTURES / MATERIALS / GEOMETRY =================
function panelTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = mulberry32(kind === 'burnt' ? 9 : 1);
  g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 600; i++) { const v = 205 + r() * 40 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 128, r() * 128, 2, 2); }
  const heavy = kind === 'heavy';
  g.strokeStyle = '#7a7a7a'; g.lineWidth = heavy ? 16 : 9; g.strokeRect(0, 0, 128, 128);
  g.strokeStyle = '#f4f4f4'; g.lineWidth = 2; const o = heavy ? 11 : 7; g.strokeRect(o, o, 128 - o * 2, 128 - o * 2);
  if (heavy) {
    g.fillStyle = '#5c5c5c'; for (const [x, y] of [[24, 24], [104, 24], [24, 104], [104, 104]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
    g.strokeStyle = '#9a9a9a'; g.lineWidth = 5; g.beginPath(); g.moveTo(40, 64); g.lineTo(88, 64); g.moveTo(64, 40); g.lineTo(64, 88); g.stroke();
  }
  if (kind === 'burnt') {
    for (let i = 0; i < 9; i++) { const x = r() * 128, y = r() * 128, rad = 14 + r() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(20,14,10,.85)'); gr.addColorStop(1, 'rgba(20,14,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
    g.strokeStyle = 'rgba(15,10,8,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(20, 30); g.lineTo(55, 60); g.lineTo(48, 92); g.moveTo(55, 60); g.lineTo(100, 70); g.stroke();
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
const TEX = { panel: panelTexture('panel'), burnt: panelTexture('burnt') };
const matCache = new Map();
function tierTexture(k) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = mulberry32(20 + k);
  const dark = k === 7 || k === 10;
  g.fillStyle = dark ? (k === 10 ? '#4a4a4a' : '#7a7a7a') : '#dcdcdc'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 600; i++) { const v = (dark ? (k === 10 ? 60 : 100) : 205) + r() * 40 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 128, r() * 128, 2, 2); }
  const border = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.strokeRect(0, 0, 128, 128); };
  const inset = (o, col, w = 2) => { g.strokeStyle = col; g.lineWidth = w; g.strokeRect(o, o, 128 - o * 2, 128 - o * 2); };
  const bolt = (x, y, rad = 6) => { g.fillStyle = '#5a5a5a'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.fillStyle = '#c4c4c4'; g.beginPath(); g.arc(x - 1.5, y - 1.5, rad * .4, 0, 7); g.fill(); };
  if (k === 1) { border(9, '#7a7a7a'); inset(7, '#f4f4f4'); }
  if (k === 2) { border(14, '#727272'); inset(11, '#f2f2f2'); for (const [x, y] of [[24, 24], [104, 24], [24, 104], [104, 104], [64, 24], [64, 104], [24, 64], [104, 64]]) bolt(x, y, 5); }
  if (k === 3) { for (let y = 10; y < 118; y += 3) { const v = 190 + r() * 50 | 0; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(10, y); g.lineTo(118, y + (r() - .5) * 2); g.stroke(); } g.fillStyle = '#ebebeb'; g.fillRect(36, 36, 56, 56); g.strokeStyle = '#9a9a9a'; g.lineWidth = 3; g.strokeRect(36, 36, 56, 56); border(13, '#6e6e6e'); inset(10, '#f4f4f4'); }
  if (k === 4) { g.save(); g.beginPath(); g.rect(8, 8, 112, 112); g.clip(); g.strokeStyle = '#b6b6b6'; g.lineWidth = 7; for (let i = -128; i < 256; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); } g.restore(); border(12, '#6e6e6e'); inset(10, '#f4f4f4'); }
  if (k === 5) {
    g.strokeStyle = '#8a8a8a'; g.lineWidth = 3; const S = 13;
    for (let row = -1; row < 8; row++) for (let col = -1; col < 7; col++) {
      const cx = col * S * 1.732 + (row % 2 ? S * .866 : 0), cy = row * S * 1.5; g.beginPath();
      for (let a = 0; a < 6; a++) { const an = Math.PI / 3 * a + Math.PI / 6, px = cx + Math.cos(an) * S * .95, py = cy + Math.sin(an) * S * .95; a ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.closePath(); g.stroke();
    }
    border(12, '#6a6a6a'); inset(9, '#f0f0f0');
  }
  if (k === 6) { g.strokeStyle = '#666'; g.lineWidth = 6; g.beginPath(); g.moveTo(64, 6); g.lineTo(64, 122); g.moveTo(6, 64); g.lineTo(122, 64); g.stroke(); for (const [x, y] of [[35, 35], [93, 35], [35, 93], [93, 93]]) { g.fillStyle = '#eeeeee'; g.fillRect(x - 21, y - 21, 42, 42); bolt(x, y, 5); } border(10, '#5e5e5e'); inset(6, '#f6f6f6'); }
  if (k === 7) { for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { const on = ((x + y) / 8) % 2 === 0; const gr = g.createLinearGradient(x, y, on ? x + 8 : x, on ? y : y + 8); gr.addColorStop(0, '#585858'); gr.addColorStop(.5, '#a0a0a0'); gr.addColorStop(1, '#585858'); g.fillStyle = gr; g.fillRect(x, y, 8, 8); } border(8, '#333'); }
  if (k === 8) { const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, '#f2f2f2'); gr.addColorStop(1, '#c8c8c8'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#8c8c8c'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 8); g.lineTo(64, 120); g.moveTo(8, 64); g.lineTo(120, 64); g.stroke(); g.fillStyle = '#b0b0b0'; for (const [x, y] of [[36, 36], [92, 36], [36, 92], [92, 92]]) { g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 12, y); g.lineTo(x, y + 12); g.lineTo(x - 12, y); g.closePath(); g.fill(); } border(9, '#7c7c7c'); }
  if (k === 9) { g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#909090'; g.lineWidth = 2; for (let i = 16; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 4); g.lineTo(i, 124); g.moveTo(4, i); g.lineTo(124, i); g.stroke(); } for (let i = 0; i < 18; i++) { g.fillStyle = '#efefef'; g.fillRect((r() * 8 | 0) * 16 + 3, (r() * 8 | 0) * 16 + 3, 10, 10); } border(8, '#6c6c6c'); }
  if (k === 10) { g.strokeStyle = '#2a2a2a'; g.lineWidth = 3; for (let i = -128; i < 256; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke(); } border(10, '#1e1e1e'); inset(9, '#8a8a8a', 1.5); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
function glowTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  if (kind === 7) { g.lineWidth = 3; g.strokeRect(7, 7, 114, 114); for (const [x, y] of [[4, 4], [114, 4], [4, 114], [114, 114]]) g.fillRect(x, y, 10, 10); }
  if (kind === 8) { g.lineWidth = 3; g.beginPath(); g.moveTo(64, 10); g.lineTo(64, 118); g.moveTo(10, 64); g.lineTo(118, 64); g.stroke(); g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fill(); }
  if (kind === 9) { g.lineWidth = 1.5; for (let i = 16; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 6); g.lineTo(i, 122); g.moveTo(6, i); g.lineTo(122, i); g.stroke(); } g.lineWidth = 3; g.strokeRect(6, 6, 116, 116); }
  if (kind === 10) { g.lineWidth = 3; g.strokeRect(8, 8, 112, 112); g.beginPath(); g.moveTo(64, 24); g.lineTo(104, 64); g.lineTo(64, 104); g.lineTo(24, 64); g.closePath(); g.stroke(); g.beginPath(); g.arc(64, 64, 6, 0, 7); g.fill(); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
const TIER_TEX = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => k && tierTexture(k));
const TIER_GLOW = { 7: [glowTexture(7), 0x35e6ff, 1.4], 8: [glowTexture(8), 0xff8a2a, 1.6], 9: [glowTexture(9), 0xb07dff, 1.6], 10: [glowTexture(10), 0xffc845, 1.8] };
const TIER_LOOK = [null, [.62, .2], [.58, .3], [.48, .45], [.5, .3], [.45, .45], [.45, .4], [.35, .55], [.3, .2], [.28, .5], [.22, .75]];
// paint finishes (per bot): adjust a material's surface; FIN is the finish of the part being built
let FIN = 'standard';
function applyFinish(m, ci, fin) {
  if (fin === 'matte') { m.roughness = .92; m.metalness = .04; }
  else if (fin === 'gloss') { m.roughness = .14; m.metalness = Math.min(.3, m.metalness); }
  else if (fin === 'chrome') { m.roughness = .07; m.metalness = .96; m.color.lerp(new T.Color(0xffffff), .15); }
  else if (fin === 'carbon') { m.color.multiplyScalar(.35); m.roughness = .32; m.metalness = .45; }
  else if (fin === 'gold') { m.color.lerp(new T.Color(0xffc84a), .55); m.roughness = .18; m.metalness = .98; }
  else if (fin === 'neon') { m.emissive = new T.Color(COLORS[ci]); m.emissiveIntensity = .75; m.roughness = .4; }
  else if (fin === 'camo') { m.color.lerp(new T.Color(0x4a5a34), .45).multiplyScalar(.8); m.roughness = .95; m.metalness = .02; }
  else if (fin === 'frost') { m.color.lerp(new T.Color(0xd8f0ff), .5); m.roughness = .25; m.metalness = .3; m.emissive = new T.Color(0x3a6a8a); m.emissiveIntensity = .25; }
  else if (fin === 'magma') { m.color.multiplyScalar(.3); m.roughness = .7; m.emissive = new T.Color(0xff5a14); m.emissiveIntensity = .55; }
  else if (fin === 'holo') { const c = new T.Color(COLORS[ci]); m.color.lerp(new T.Color(0x9ffcff), .35); m.metalness = .85; m.roughness = .12; m.emissive = c.lerp(new T.Color(0xff6aff), .4); m.emissiveIntensity = .35; }
  return m;
}
const MAT_TEX = {};
function matTexture(kind) {
  if (MAT_TEX[kind] || HEADLESS) return MAT_TEX[kind] || null;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 128, 128);
  if (kind === 'heavy') { g.strokeStyle = '#6a6a6a'; g.lineWidth = 18; g.strokeRect(0, 0, 128, 128); g.fillStyle = '#5a5a5a'; for (const [x, y] of [[20, 20], [108, 20], [20, 108], [108, 108], [64, 20], [64, 108], [20, 64], [108, 64]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } g.fillStyle = '#9a9a9a'; g.fillRect(34, 56, 60, 16); }
  else if (kind === 'light') { g.strokeStyle = '#8a8a8a'; g.lineWidth = 6; g.strokeRect(0, 0, 128, 128); g.fillStyle = '#7a7a7a'; for (let y = 20; y < 120; y += 22) for (let x = 20; x < 120; x += 22) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } }
  else if (kind === 'reactive') { g.fillStyle = '#9c9c9c'; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#b8b8b8' : '#8e8e8e'; g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28); } g.strokeStyle = '#5a5a5a'; g.lineWidth = 6; g.strokeRect(0, 0, 128, 128); }
  else { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#7a7a7a'; g.lineWidth = 3; for (let i = -128; i < 256; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 128); g.stroke(); } g.lineWidth = 8; g.strokeRect(0, 0, 128, 128); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return MAT_TEX[kind] = t;
}
function applyMaterialLook(m, ci, mat) {
  const col = new T.Color(COLORS[ci]);
  if (mat === 'heavy') { m.map = matTexture('heavy'); m.color.copy(col).multiplyScalar(.78); m.metalness = Math.max(m.metalness, .65); m.roughness = Math.min(.6, m.roughness + .1); }
  else if (mat === 'light') { m.map = matTexture('light'); m.color.copy(col).lerp(new T.Color(0xffffff), .18); m.metalness = .35; m.roughness = .5; }
  else if (mat === 'reactive') { m.map = matTexture('reactive'); m.color.copy(col).multiplyScalar(.9); m.roughness = .75; m.metalness = .25; }
  else if (mat === 'energy') { m.map = matTexture('energy'); m.color.copy(col).multiplyScalar(.5); m.emissive = col.clone(); m.emissiveMap = matTexture('energy'); m.emissiveIntensity = 1.25; m.transparent = true; m.opacity = .72; m.roughness = .2; m.metalness = .1; }
  return m;
}
function tierMat(ci, k = 1, burnt = false, fin = FIN, mat = 'std') {
  const key = 't' + ci + '_' + k + (burnt ? 'b' : '') + fin + mat;
  if (!matCache.has(key) && mat !== 'std' && !burnt) { const m = tierMat(ci, k, false, fin).clone(); applyMaterialLook(m, ci, mat); matCache.set(key, m); }
  if (!matCache.has(key)) {
    const m = new T.MeshStandardMaterial({ color: burnt ? new T.Color(COLORS[ci]).multiplyScalar(.55) : COLORS[ci], map: burnt ? TEX.burnt : TIER_TEX[k], roughness: TIER_LOOK[k][0], metalness: TIER_LOOK[k][1] });
    const gl = TIER_GLOW[k];
    if (!burnt && fin !== 'standard') applyFinish(m, ci, fin);
    if (gl && !burnt) { m.emissive = new T.Color(gl[1]); m.emissiveMap = gl[0]; m.emissiveIntensity = gl[2]; }
    matCache.set(key, m);
  }
  return matCache.get(key);
}
function partMat(ci, kind = 'panel', fin = FIN) {
  const k = ci + kind + fin;
  if (!matCache.has(k)) matCache.set(k, applyFinish(new T.MeshStandardMaterial({ color: COLORS[ci], map: TEX[kind], roughness: .58, metalness: .22 }), ci, fin));
  return matCache.get(k);
}
const M = {
  dark: new T.MeshStandardMaterial({ color: 0x2b3238, roughness: .6, metalness: .55 }),
  rubber: new T.MeshStandardMaterial({ color: 0x1a1c1e, roughness: .95 }),
  glowCyan: new T.MeshStandardMaterial({ color: 0x0e3036, emissive: 0x35e6ff, emissiveIntensity: 1.7 }),
  glowOrange: new T.MeshStandardMaterial({ color: 0x40200a, emissive: 0xff8a1f, emissiveIntensity: 2 }),
  glowBlue: new T.MeshStandardMaterial({ color: 0x0a2040, emissive: 0x5aa8ff, emissiveIntensity: 2.2 }),
  glowViolet: new T.MeshStandardMaterial({ color: 0x2a1040, emissive: 0xc77dff, emissiveIntensity: 2.2 }),
  glowRed: new T.MeshStandardMaterial({ color: 0x400a10, emissive: 0xff3050, emissiveIntensity: 2.4 }),
  glowGreen: new T.MeshStandardMaterial({ color: 0x0a3018, emissive: 0x4dff8f, emissiveIntensity: 2.2 }),
  energy: new T.MeshStandardMaterial({ color: 0x0c3a4a, emissive: 0x5fe8ff, emissiveIntensity: 1.3, transparent: true, opacity: .55, roughness: .2, depthWrite: false }),
  steel: new T.MeshStandardMaterial({ color: 0x8a949c, roughness: .35, metalness: .8 }),
  tesla: new T.MeshStandardMaterial({ color: 0x103844, emissive: 0x8ff0ff, emissiveIntensity: 2.2, transparent: true, opacity: .88 }),
  flame: new T.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .85, blending: T.AdditiveBlending, depthWrite: false }),
};
function polyGeo(build) {
  const pos = [], uv = [];
  function tri(p, q, r, n, uvs = [[0, 0], [1, 0], [0, 1]]) {
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (c[0] * n[0] + c[1] * n[1] + c[2] * n[2] < 0) { [q, r] = [r, q]; uvs = [uvs[0], uvs[2], uvs[1]]; }
    pos.push(...p, ...q, ...r); uv.push(...uvs[0], ...uvs[1], ...uvs[2]);
  }
  const quad = (p, q, r, s, n) => { tri(p, q, r, n, [[0, 0], [1, 0], [1, 1]]); tri(p, r, s, n, [[0, 0], [1, 1], [0, 1]]); };
  build(tri, quad);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}
const a_ = -.5, b_ = .5;
const PV = { A: [a_, a_, a_], B: [b_, a_, a_], C: [b_, a_, b_], D: [a_, a_, b_], E: [a_, b_, a_], F: [b_, b_, a_], H: [a_, b_, b_] };
const makeWedge = () => polyGeo((tri, quad) => {
  const { A, B, C, D, E, F } = PV;
  quad(A, B, C, D, [0, -1, 0]); quad(A, B, F, E, [0, 0, -1]); quad(D, C, F, E, [0, 1, 1]);
  tri(A, D, E, [-1, 0, 0]); tri(B, C, F, [1, 0, 0]);
});
const makePyr = () => polyGeo((tri, quad) => {
  const { A, B, C, D, E } = PV;
  quad(A, B, C, D, [0, -1, 0]); tri(A, B, E, [0, 0, -1]); tri(A, D, E, [-1, 0, 0]); tri(B, C, E, [1, 1, 0]); tri(C, D, E, [0, 1, 1]);
});
const makeInner = () => polyGeo((tri, quad) => {
  const { A, B, C, D, E, F, H } = PV;
  quad(A, B, C, D, [0, -1, 0]); quad(A, B, F, E, [0, 0, -1]); quad(A, D, H, E, [-1, 0, 0]);
  tri(E, F, H, [0, 1, 0]); tri(D, C, H, [0, 0, 1]); tri(B, C, F, [1, 0, 0]); tri(F, H, C, [1, 1, 1]);
});
const makeTetra = () => polyGeo(tri => {
  const { A, B, D, E } = PV;
  tri(A, B, D, [0, -1, 0]); tri(A, B, E, [0, 0, -1]); tri(A, D, E, [-1, 0, 0]); tri(B, D, E, [1, 1, 1]);
});
function makeRound() {
  const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(1, 0); sh.absarc(0, 0, 1, 0, Math.PI / 2, false); sh.lineTo(0, 0);
  const g = new T.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 10 });
  g.translate(-.5, -.5, -.5); g.rotateY(-Math.PI / 2); return g;
}
const HALF_PI = Math.PI / 2;
const GEO = {
  box: new T.BoxGeometry(1, 1, 1), wedge: makeWedge(),
  seatCap: new T.BoxGeometry(1.02, .22, 1.02), seatWin: new T.BoxGeometry(.72, .3, .04), seatSide: new T.BoxGeometry(.04, .2, .6),
  tire: new T.CylinderGeometry(.56, .56, .5, 22).rotateZ(HALF_PI), hub: new T.CylinderGeometry(.3, .3, .56, 14).rotateZ(HALF_PI),
  spoke: new T.BoxGeometry(.58, .12, .86), axle: new T.BoxGeometry(.7, .34, .34),
  hoverTop: new T.BoxGeometry(1, .62, 1), hoverBase: new T.CylinderGeometry(.42, .5, .3, 18), hoverGlow: new T.CylinderGeometry(.37, .37, .06, 18),
  jetBody: new T.BoxGeometry(.9, .6, .9), nozzle: new T.CylinderGeometry(.3, .45, .5, 14), nozzleGlow: new T.CylinderGeometry(.28, .28, .04, 14),
  flame: new T.ConeGeometry(.32, 1.4, 12).rotateX(Math.PI),
  wbase: new T.BoxGeometry(.9, .36, .9),
  bBody: new T.BoxGeometry(.55, .42, .7), bBarrel: new T.CylinderGeometry(.08, .1, .85, 10).rotateX(HALF_PI), bTip: new T.CylinderGeometry(.11, .11, .08, 10).rotateX(HALF_PI),
  mBody: new T.BoxGeometry(.78, .56, .72), mBarrel: new T.CylinderGeometry(.21, .26, .8, 14).rotateX(HALF_PI), mRing: new T.CylinderGeometry(.24, .24, .06, 14).rotateX(HALF_PI),
  pBody: new T.BoxGeometry(.7, .5, .76), pBarrel: new T.CylinderGeometry(.16, .2, .72, 14).rotateX(HALF_PI), pRing: new T.CylinderGeometry(.22, .22, .07, 14).rotateX(HALF_PI),
  tBase: new T.BoxGeometry(.9, .5, .9), tMount: new T.BoxGeometry(.46, .66, .6), tBlade: new T.BoxGeometry(.07, .72, 1.5), tSpine: new T.BoxGeometry(.15, .09, 1.35), tTooth: new T.BoxGeometry(.1, .16, .16),
  pyr: makePyr(), inner: makeInner(), tetra: makeTetra(), round: makeRound(),
  slab: new T.BoxGeometry(1, .5, 1).translate(0, -.25, 0), plate: new T.BoxGeometry(1, .22, 1).translate(0, -.39, 0), strut: new T.BoxGeometry(.34, 1, .34),
  treadBelt: new T.BoxGeometry(.86, .94, 1.0), treadCleat: new T.BoxGeometry(.92, .1, .2), treadHub: new T.CylinderGeometry(.3, .3, .1, 12).rotateZ(HALF_PI),
  rotorMount: new T.BoxGeometry(.62, .42, .62), rotorMast: new T.CylinderGeometry(.08, .1, .6, 8), rotorHub: new T.CylinderGeometry(.18, .18, .12, 10), rotorBlade: new T.BoxGeometry(1.95, .04, .22),
  nBody: new T.BoxGeometry(.55, .45, .65), nDish: new T.CylinderGeometry(.2, .12, .16, 14).rotateX(HALF_PI), nCoil: new T.TorusGeometry(.16, .035, 6, 14),
  cBody: new T.BoxGeometry(.7, .5, .6), cBarrel: new T.CylinderGeometry(.045, .045, 1.0, 6).rotateX(HALF_PI), cRing: new T.CylinderGeometry(.2, .2, .08, 12).rotateX(HALF_PI),
  fBody: new T.BoxGeometry(.66, .5, .7), fBarrel: new T.CylinderGeometry(.08, .1, .9, 10).rotateX(HALF_PI), fBrake: new T.BoxGeometry(.18, .18, .12),
  kBody: new T.BoxGeometry(.74, .62, .66), kFace: new T.BoxGeometry(.62, .5, .04), kTube: new T.CylinderGeometry(.09, .09, .06, 10).rotateX(HALF_PI),
  legHip: new T.BoxGeometry(.8, .34, .7), legThigh: new T.BoxGeometry(.28, .5, .3), legShin: new T.BoxGeometry(.34, .5, .36), legFoot: new T.BoxGeometry(.6, .14, .8),
  wingPlate: new T.BoxGeometry(1, .12, 1), wingEdge: new T.BoxGeometry(1.02, .16, .12),
  thrBody: new T.BoxGeometry(.8, .7, .6), thrNozzle: new T.CylinderGeometry(.32, .26, .5, 14).rotateX(HALF_PI), thrRing: new T.CylinderGeometry(.27, .27, .05, 14).rotateX(HALF_PI), thrFlame: new T.ConeGeometry(.28, 1.6, 12).rotateX(-HALF_PI),
  shPost: new T.BoxGeometry(.14, 1, .14), shPane: new T.BoxGeometry(.94, .94, .94),
  flagPole: new T.CylinderGeometry(.04, .05, 2, 6), flagCloth: new T.BoxGeometry(.04, .55, .85),
  rBody: new T.BoxGeometry(.5, .42, .82), rRail: new T.BoxGeometry(.07, .1, 1.5), rCoil: new T.BoxGeometry(.38, .2, .06),
};
GEO.cyl = new T.CylinderGeometry(.5, .5, 1, 16);
GEO.hwedge = (() => { const g = new T.BufferGeometry(), p = [], h = -.5, t = 0; // a wedge half as tall: rises from the front edge to the back at half height
  const V = [[-.5, h, .5], [.5, h, .5], [.5, h, -.5], [-.5, h, -.5], [-.5, t, -.5], [.5, t, -.5]];
  const tri = (a, b, c) => p.push(...V[a], ...V[b], ...V[c]);
  tri(0, 2, 1); tri(0, 3, 2); tri(3, 4, 5); tri(3, 5, 2); tri(0, 1, 5); tri(0, 5, 4); tri(0, 4, 3); tri(1, 2, 5);
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); const uv = []; for (let i = 0; i < p.length / 3; i++) uv.push(p[i * 3] + .5, p[i * 3 + 2] + .5); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g; })();
const SHAPE_GEO = { box: GEO.box, wedge: GEO.wedge, pyr: GEO.pyr, inner: GEO.inner, tetra: GEO.tetra, round: GEO.round, slab: GEO.slab, plate: GEO.plate, strut: GEO.strut, cyl: GEO.cyl, hwedge: GEO.hwedge };
// guns can be mounted at any of the 24 block orientations (sideways, under the hull, facing back); their turret aims from the mount
const isMountable = t => !!(PARTS[t] && PARTS[t].weapon && t !== 'tesla');
const applyRot = (o, r) => o.rotation.set(((r >> 2) & 3) * HALF_PI, (r & 3) * HALF_PI, ((r >> 4) & 3) * HALF_PI, 'YXZ');
const ROT_M = []; for (let r = 0; r < 64; r++) ROT_M.push(new T.Matrix4().makeRotationFromEuler(new T.Euler(((r >> 2) & 3) * HALF_PI, (r & 3) * HALF_PI, ((r >> 4) & 3) * HALF_PI, 'YXZ')));
const ROT_MI = ROT_M.map(m => m.clone().transpose()); // inverses (pure rotations)
const SHAPE_VERTS = {};
for (const [k, g] of Object.entries(SHAPE_GEO)) { const seen = new Map(), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = new T.Vector3().fromBufferAttribute(p, i); seen.set(v.toArray().map(n => n.toFixed(3)).join(), v); } SHAPE_VERTS[k] = [...seen.values()]; }
const vkey = v => [v.x, v.y, v.z].map(n => (Math.round(n * 1000) / 1000 + 0).toFixed(3)).join(',');
function shapeSig(shape, r, mirror) { const out = new Set(); for (const v of SHAPE_VERTS[shape]) { const w = v.clone().applyMatrix4(ROT_M[r]); if (mirror) w.x = -w.x; out.add(vkey(w)); } return [...out].sort().join('|'); }
const mirrorCache = new Map();
function mirrorR(t, r) {
  if (t === 'tesla') return (4 - (r % 4)) % 4;
  if (isMountable(t)) { // a mirrored gun: the orientation whose matrix equals S·R·S (S flips x)
    const key = 'g' + r; if (mirrorCache.has(key)) return mirrorCache.get(key);
    const S = new T.Matrix4().makeScale(-1, 1, 1), want = S.clone().multiply(ROT_M[r]).multiply(S).elements; let res = r;
    for (let i = 0; i < 64; i++) if (ROT_M[i].elements.every((v, j) => Math.abs(v - want[j]) < 1e-6)) { res = i; break; }
    mirrorCache.set(key, res); return res;
  }
  const P = PARTS[t]; if (!P.shape) return 0;
  const key = t + ':' + r; if (mirrorCache.has(key)) return mirrorCache.get(key);
  const target = shapeSig(P.shape, r, true); let res = r;
  for (let i = 0; i < 64; i++) if (shapeSig(P.shape, i, false) === target) { res = i; break; }
  mirrorCache.set(key, res); return res;
}
const edgeCache = new Map();
const edgesOf = g => { if (!edgeCache.has(g)) edgeCache.set(g, new T.EdgesGeometry(g, 25)); return edgeCache.get(g); };
const G2 = {}; const g2 = (k, f) => G2[k] || (G2[k] = f());
const M2 = {}; const m2 = (k, f) => M2[k] || (M2[k] = f());
function makePart(t, ci, r = 0, k = 1, fin = 'standard', mat = 'std') {
  const out = makePartBase(t, ci, r, k, fin, mat);
  if (r && isMountable(t)) applyRot(out.root, r);
  return out;
}
function makePartBase(t, ci, r = 0, k = 1, fin = 'standard', mat = 'std') {
  FIN = fin;
  const root = new T.Group(); const out = { root };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = root) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const head = (y = .05) => { const h = new T.Group(); h.position.y = y; h.rotation.order = 'YXZ'; root.add(h); out.head = h; return h; };
  const muzzle = (h, y, z) => { const m = new T.Object3D(); m.position.set(0, y, z); h.add(m); out.muzzle = m; };
  if (PARTS[t] && PARTS[t].shape) { const sh = PARTS[t].shape, m = mesh(detailOn() && BEVEL_GEO[sh] || SHAPE_GEO[sh], tierMat(ci, k || 1, false, fin, mat || 'std')); applyRot(m, r); return out; }
  if (DETAIL[t] && detailOn()) { DETAIL[t]({ mesh, head, muzzle, root, out, ci, r, P: partMat(ci) }); return out; }
  switch (t) {
    case 'seat': {
      mesh(GEO.box, M.dark); mesh(GEO.seatCap, partMat(ci), 0, .42, 0);
      mesh(GEO.seatWin, M.glowCyan, 0, .08, .51); mesh(GEO.seatWin, M.glowCyan, 0, .08, -.51);
      mesh(GEO.seatSide, M.glowCyan, .51, .08, 0); mesh(GEO.seatSide, M.glowCyan, -.51, .08, 0); break;
    }
    case 'wheel': {
      mesh(GEO.axle, M.dark); const spin = new T.Group(); root.add(spin);
      mesh(GEO.tire, M.rubber, 0, 0, 0, spin); mesh(GEO.hub, partMat(ci), 0, 0, 0, spin); mesh(GEO.spoke, M.dark, 0, 0, 0, spin);
      out.wheel = spin; break;
    }
    case 'hover': mesh(GEO.hoverTop, partMat(ci), 0, .19, 0); mesh(GEO.hoverBase, M.dark, 0, -.24, 0); out.glow = mesh(GEO.hoverGlow, M.glowBlue, 0, -.42, 0); break;
    case 'jet': {
      mesh(GEO.jetBody, partMat(ci), 0, .2, 0); mesh(GEO.nozzle, M.dark, 0, -.25, 0); mesh(GEO.nozzleGlow, M.glowOrange, 0, -.48, 0);
      const f = mesh(GEO.flame, M.flame, 0, -1.2, 0); f.visible = false; out.flame = f; break;
    }
    case 'blaster': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(GEO.bBody, partMat(ci), 0, 0, 0, h); mesh(GEO.bBarrel, M.dark, 0, .04, .55, h); mesh(GEO.bTip, M.glowOrange, 0, .04, .98, h);
      muzzle(h, .04, 1.08); break;
    }
    case 'mortar': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(GEO.mBody, partMat(ci), 0, 0, 0, h); mesh(GEO.mBarrel, M.dark, 0, .08, .45, h); mesh(GEO.mRing, M.glowOrange, 0, .08, .84, h);
      muzzle(h, .08, .95); break;
    }
    case 'plasma': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(GEO.pBody, partMat(ci), 0, 0, 0, h); mesh(GEO.pBarrel, M.dark, 0, .05, .6, h);
      mesh(GEO.pRing, M.glowViolet, 0, .05, .45, h); mesh(GEO.pRing, M.glowViolet, 0, .05, .8, h);
      muzzle(h, .05, 1.0); break;
    }
    case 'tesla': {
      const g = new T.Group(); g.rotation.y = (r % 4) * HALF_PI; root.add(g);
      mesh(GEO.tBase, M.dark, 0, -.25, 0, g); mesh(GEO.tMount, partMat(ci), 0, .08, -.12, g);
      mesh(GEO.tBlade, M.tesla, 0, .1, .9, g);
      mesh(GEO.tSpine, M.dark, 0, .48, .78, g); mesh(GEO.tSpine, M.dark, 0, -.28, .78, g);
      for (const z of [.5, .95, 1.4]) { mesh(GEO.tTooth, M.dark, 0, .58, z, g); mesh(GEO.tTooth, M.dark, 0, -.38, z, g); }
      break;
    }
    case 'leg': {
      mesh(GEO.legHip, partMat(ci), 0, .3, 0);
      const g = new T.Group(); g.position.y = .2; root.add(g);
      mesh(GEO.legThigh, M.dark, 0, -.2, 0, g); mesh(GEO.legShin, partMat(ci), 0, -.55, .05, g); mesh(GEO.legFoot, M.dark, 0, -.78, .08, g);
      out.leg = g; break;
    }
    case 'wing': mesh(GEO.wingPlate, partMat(ci), 0, 0, 0); mesh(GEO.wingEdge, M.dark, 0, 0, .48); break;
    case 'thruster': {
      mesh(GEO.thrBody, partMat(ci), 0, 0, .1); mesh(GEO.thrNozzle, M.dark, 0, 0, -.38); mesh(GEO.thrRing, M.glowOrange, 0, 0, -.62);
      const f = mesh(GEO.thrFlame, M.flame, 0, 0, -1.4); f.visible = false; out.flame = f; out.thrust = true; break;
    }
    case 'shieldp': {
      mesh(GEO.shPane, M.energy);
      for (const [x, z] of [[-.43, -.43], [.43, -.43], [-.43, .43], [.43, .43]]) mesh(GEO.shPost, partMat(ci), x, 0, z);
      break;
    }
    case 'flag': {
      mesh(GEO.flagPole, M.steel, 0, .5, 0);
      const g = new T.Group(); g.position.set(0, 1.2, 0); root.add(g); mesh(GEO.flagCloth, partMat(ci), 0, 0, -.45, g);
      out.flag = g; break;
    }
    case 'tread': {
      mesh(GEO.treadBelt, M.rubber);
      for (const z of [-.36, 0, .36]) { mesh(GEO.treadCleat, M.dark, 0, .47, z); mesh(GEO.treadCleat, M.dark, 0, -.47, z); }
      const spin = new T.Group(); root.add(spin); mesh(GEO.treadHub, partMat(ci), .45, 0, 0, spin); mesh(GEO.treadHub, partMat(ci), -.45, 0, 0, spin); mesh(GEO.spoke, M.dark, 0, 0, 0, spin);
      out.wheel = spin; break;
    }
    case 'rotor': {
      mesh(GEO.rotorMount, M.dark, 0, -.29, 0); mesh(GEO.rotorMast, M.steel, 0, .0, 0);
      const spin = new T.Group(); spin.position.y = .32; root.add(spin);
      mesh(GEO.rotorHub, partMat(ci), 0, 0, 0, spin);
      for (let i = 0; i < 3; i++) { const b = mesh(GEO.rotorBlade, partMat(ci), 0, .02, 0, spin); b.rotation.y = i * Math.PI / 3; }
      out.rotor = spin; break;
    }
    case 'nano': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(GEO.nBody, partMat(ci), 0, 0, 0, h); mesh(GEO.nDish, M.steel, 0, .02, .4, h); mesh(GEO.nCoil, M.glowGreen, 0, .02, .5, h);
      muzzle(h, .02, .62); break;
    }
    case 'chain': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(GEO.cBody, partMat(ci), 0, 0, 0, h);
      const spin = new T.Group(); spin.position.set(0, .04, .75); h.add(spin);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mesh(GEO.cBarrel, M.dark, Math.cos(a) * .12, Math.sin(a) * .12, 0, spin); }
      mesh(GEO.cRing, M.steel, 0, 0, -.2, spin); mesh(GEO.cRing, M.steel, 0, 0, .42, spin);
      out.spin = spin; muzzle(h, .04, 1.3); break;
    }
    case 'flak': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(GEO.fBody, partMat(ci), 0, 0, 0, h);
      for (const x of [-.15, .15]) { mesh(GEO.fBarrel, M.dark, x, .06, .65, h); mesh(GEO.fBrake, M.steel, x, .06, 1.1, h); }
      muzzle(h, .06, 1.2); break;
    }
    case 'seeker': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(GEO.kBody, partMat(ci), 0, .06, 0, h); mesh(GEO.kFace, M.dark, 0, .06, .34, h);
      for (const x of [-.15, .15]) for (const y of [-.07, .19]) mesh(GEO.kTube, M.glowRed, x, y, .37, h);
      muzzle(h, .1, .5); break;
    }
    case 'lamp': {
      mesh(g2('lampBody', () => new T.BoxGeometry(.6, .4, .5)), partMat(ci), 0, -.2, -.05); mesh(g2('lampHood', () => new T.CylinderGeometry(.24, .3, .35, 14).rotateX(HALF_PI)), M.dark, 0, .08, .22);
      mesh(g2('lampGlass', () => new T.CircleGeometry(.22, 16)), m2('lampLit', () => new T.MeshBasicMaterial({ color: new T.Color(0xfff2c8).multiplyScalar(4), toneMapped: false })), 0, .08, .4);
      const cone = mesh(g2('lampCone', () => new T.ConeGeometry(1.6, 7, 18, 1, true).translate(0, -3.5, 0).rotateX(-HALF_PI)), m2('lampBeam', () => new T.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: .08, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })), 0, .08, .4); cone.castShadow = false; break;
    }
    case 'exhaust': {
      mesh(g2('exBase', () => new T.BoxGeometry(.7, .3, .7)), partMat(ci), 0, -.35, 0);
      for (const x of [-.18, .18]) mesh(g2('exPipe', () => new T.CylinderGeometry(.11, .13, 1.1, 10)), M.steel, x, .25, -.1);
      out.exhaust = true; break;
    }
    case 'antenna': {
      mesh(g2('anBase', () => new T.CylinderGeometry(.22, .28, .25, 10)), partMat(ci), 0, -.38, 0);
      mesh(g2('anWhip', () => new T.CylinderGeometry(.025, .04, 1.6, 6)), M.steel, 0, .45, 0);
      mesh(g2('anTip', () => new T.SphereGeometry(.09, 8, 6)), M.glowRed, 0, 1.27, 0); break;
    }
    case 'spoiler': {
      for (const x of [-.32, .32]) mesh(g2('spoStrut', () => new T.BoxGeometry(.08, .55, .12)), M.steel, x, -.2, 0);
      mesh(g2('spoWing', () => new T.BoxGeometry(1, .08, .5)), partMat(ci), 0, .12, -.05);
      for (const x of [-.5, .5]) mesh(g2('spoEnd', () => new T.BoxGeometry(.05, .26, .55)), M.dark, x, .18, -.05); break;
    }
    case 'spike': {
      mesh(g2('spBase', () => new T.BoxGeometry(.9, .9, .3)), partMat(ci), 0, 0, -.35);
      for (const [x, y] of [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25], [0, 0]]) mesh(g2('spCone', () => new T.ConeGeometry(.15, .75, 8).rotateX(HALF_PI)), M.steel, x, y, .15);
      break;
    }
    case 'projector': {
      mesh(g2('prBase', () => new T.CylinderGeometry(.45, .5, .5, 12)), partMat(ci), 0, -.25, 0); mesh(g2('prMast', () => new T.CylinderGeometry(.08, .1, .55, 8)), M.steel, 0, .2, 0);
      out.core = mesh(g2('prOrb', () => new T.IcosahedronGeometry(.24, 1)), M.energy, 0, .55, 0);
      for (let i = 0; i < 3; i++) { const f = mesh(g2('prFin', () => new T.BoxGeometry(.06, .35, .3)), M.glowCyan, Math.cos(i * 2.09) * .3, .05, Math.sin(i * 2.09) * .3); f.rotation.y = -i * 2.09; }
      break;
    }
    case 'ski': {
      mesh(g2('skiBoard', () => new T.BoxGeometry(.55, .1, 1.5)), partMat(ci), 0, -.42, .05);
      mesh(g2('skiTip', () => new T.BoxGeometry(.55, .1, .35).rotateX(-.55)), partMat(ci), 0, -.33, .86);
      mesh(g2('skiStrut', () => new T.BoxGeometry(.24, .7, .24)), M.dark, 0, -.02, 0); mesh(g2('skiMount', () => new T.BoxGeometry(.8, .25, .8)), partMat(ci), 0, .35, 0); break;
    }
    case 'insect': case 'sprint': {
      const ins = t === 'insect'; mesh(GEO.legHip, partMat(ci), 0, .3, 0);
      const g = new T.Group(); g.position.y = .2; root.add(g);
      if (ins) { const a = mesh(g2('insA', () => new T.BoxGeometry(.16, .55, .16).rotateX(.7)), M.dark, 0, -.05, .2, g); const b2 = mesh(g2('insB', () => new T.BoxGeometry(.13, .6, .13).rotateX(-.35)), partMat(ci), 0, -.5, .33, g); mesh(g2('insC', () => new T.ConeGeometry(.08, .22, 6).rotateX(Math.PI)), M.steel, 0, -.82, .26, g); }
      else { mesh(g2('spA', () => new T.BoxGeometry(.2, .55, .22).rotateX(-.25)), M.dark, 0, -.2, -.06, g); mesh(g2('spB', () => new T.BoxGeometry(.16, .5, .16).rotateX(.35)), partMat(ci), 0, -.6, -.02, g); mesh(g2('spFoot', () => new T.BoxGeometry(.3, .06, .5)), M.steel, 0, -.85, .1, g); }
      out.leg = g; break;
    }
    case 'prop': {
      mesh(g2('propBody', () => new T.CylinderGeometry(.3, .38, .8, 12).rotateX(HALF_PI)), partMat(ci), 0, 0, .05); mesh(g2('propCone', () => new T.ConeGeometry(.18, .35, 12).rotateX(HALF_PI)), M.steel, 0, 0, .6);
      const spin = new T.Group(); spin.position.z = .52; root.add(spin);
      for (let i = 0; i < 3; i++) { const b2 = mesh(g2('propBlade', () => new T.BoxGeometry(.12, .9, .04)), M.dark, 0, .38, 0, spin); const p = new T.Group(); p.rotation.z = i * Math.PI * 2 / 3; spin.add(p); p.add(b2); b2.position.y = .42; b2.rotation.y = .4; }
      out.prop = spin; out.thrust = true; break;
    }
    case 'balloon': {
      mesh(g2('balBasket', () => new T.BoxGeometry(.7, .3, .7)), M.dark, 0, -.35, 0); mesh(g2('balRope', () => new T.CylinderGeometry(.03, .03, .9, 4)), M.steel, 0, .1, 0);
      const bag = mesh(g2('balBag', () => new T.SphereGeometry(.72, 18, 12)), m2('balMat' + ci, () => new T.MeshStandardMaterial({ color: COLORS[ci], roughness: .45, metalness: .05, emissive: new T.Color(COLORS[ci]).multiplyScalar(.12) })), 0, .95, 0); bag.scale.set(1, 1.15, 1); break;
    }
    case 'arc': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(g2('arcBody', () => new T.BoxGeometry(.5, .4, .7)), partMat(ci), 0, 0, 0, h);
      for (const x of [-.16, .16]) mesh(g2('arcProng', () => new T.BoxGeometry(.07, .07, .7)), M.steel, x, .05, .62, h);
      mesh(g2('arcOrb', () => new T.SphereGeometry(.13, 12, 8)), M.tesla, 0, .05, .92, h); muzzle(h, .05, .95); break;
    }
    case 'mine': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(g2('mnBody', () => new T.CylinderGeometry(.34, .38, .55, 10).rotateX(HALF_PI)), partMat(ci), 0, .02, .05, h);
      mesh(g2('mnMouth', () => new T.TorusGeometry(.27, .06, 6, 14)), M.glowViolet, 0, .02, .34, h); muzzle(h, .02, .45); break;
    }
    case 'lancer': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(g2('lnBody', () => new T.BoxGeometry(.55, .42, .9)), partMat(ci), 0, 0, -.05, h);
      for (const x of [-.14, .14]) mesh(g2('lnRail', () => new T.BoxGeometry(.08, .12, 1.6)), M.dark, x, .04, 1, h);
      out.charge = []; for (const z of [.45, .85, 1.25, 1.65]) out.charge.push(mesh(g2('lnCoil', () => new T.BoxGeometry(.38, .2, .08)), m2('lnGlow', () => new T.MeshStandardMaterial({ color: 0x102030, emissive: 0x9ff3ff, emissiveIntensity: .3 })), 0, .04, z, h));
      muzzle(h, .04, 1.85); break;
    }
    case 'm_fly': {
      mesh(g2('flyBody', () => new T.CylinderGeometry(.34, .4, .8, 14)), partMat(ci), 0, .02, 0);
      mesh(g2('flyCap', () => new T.ConeGeometry(.34, .3, 14)), M.dark, 0, .56, 0);
      for (const x of [-.22, .22]) mesh(g2('flyNoz', () => new T.CylinderGeometry(.12, .17, .26, 10)), M.dark, x, -.48, 0);
      mesh(g2('flyBand', () => new T.TorusGeometry(.37, .05, 6, 18).rotateX(HALF_PI)), M.glowOrange, 0, -.16, 0);
      const f = mesh(GEO.flame, M.flame, 0, -1.25, 0); f.visible = false; out.flame = f; out.fly = true; break;
    }
    case 'm_shield': case 'm_cloak': case 'm_blink': case 'm_emp': case 'm_power': case 'm_disrupt': {
      const glow = { m_shield: M.glowCyan, m_cloak: M.glowViolet, m_blink: M.glowBlue, m_emp: m2('empGlow', () => new T.MeshStandardMaterial({ color: 0x302a08, emissive: 0xffe14a, emissiveIntensity: 2.2 })), m_power: M.glowGreen, m_disrupt: M.glowRed }[t];
      mesh(g2('modCase', () => new T.BoxGeometry(.92, .7, .92)), partMat(ci), 0, -.1, 0);
      mesh(g2('modTop', () => new T.CylinderGeometry(.3, .36, .3, 16)), M.dark, 0, .38, 0);
      const core = mesh(t === 'm_power' ? g2('modCell', () => new T.CylinderGeometry(.16, .16, .5, 12)) : t === 'm_emp' ? g2('modRing', () => new T.TorusGeometry(.24, .06, 8, 18).rotateX(HALF_PI)) : g2('modOrb', () => new T.IcosahedronGeometry(.2, 1)), glow, 0, .6, 0);
      for (const s of [-1, 1]) mesh(g2('modStripe', () => new T.BoxGeometry(.94, .06, .1)), glow, 0, -.1, s * .3);
      out.core = core; break;
    }
    case 'rail': {
      mesh(GEO.wbase, M.dark, 0, -.32, 0); const h = head();
      mesh(GEO.rBody, partMat(ci), 0, 0, 0, h); mesh(GEO.rRail, M.dark, .12, .03, .9, h); mesh(GEO.rRail, M.dark, -.12, .03, .9, h);
      for (const z of [.5, .95, 1.4]) mesh(GEO.rCoil, M.glowCyan, 0, .03, z, h);
      muzzle(h, .03, 1.7); break;
    }
  }
  return out;
}

// ================= PART ICONS =================
const ICONS = {}, TIER_ICONS = [];
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
function renderIcons() {
  if (HEADLESS) return;
  try {
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(80, 80); r.setPixelRatio(1); r.toneMapping = T.ACESFilmicToneMapping;
    const sc = new T.Scene();
    sc.add(new T.HemisphereLight(0xffffff, 0x334455, 1.3));
    const dl = new T.DirectionalLight(0xffffff, 1.8); dl.position.set(3, 5, 4); sc.add(dl);
    const cam = new T.PerspectiveCamera(32, 1, .1, 50);
    for (const id of PART_ORDER) {
      const p = makePart(id, id === 'seat' ? 2 : 5, isShape(id) && id !== 'strut' ? 0 : 0, 1); sc.add(p.root);
      const far = id === 'rail' ? 4.3 : 3.3;
      cam.position.set(far * .62, far * .55, far * .75); cam.lookAt(0, -0.05, id === 'rail' ? .5 : .15);
      r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam);
      ICONS[id] = r.domElement.toDataURL(); sc.remove(p.root);
    }
    cam.position.set(2.1, 1.8, 2.5); cam.lookAt(0, 0, 0);
    for (let k = 1; k < TIERS.length; k++) {
      const p = makePart('cube', 1, 0, k); sc.add(p.root); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam);
      TIER_ICONS[k] = r.domElement.toDataURL(); sc.remove(p.root);
    }
    r.dispose(); r.forceContextLoss();
  } catch (e) { /* icons are optional */ }
}

