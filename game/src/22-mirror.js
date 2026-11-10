// ================= PLANAR REFLECTIONS (ice, lava, the garage floor) =================
// A second camera mirrored under the surface renders the scene into a texture; the surface's material
// samples it with projective coordinates, blended by a Fresnel term. Oblique clipping drops anything
// below the surface, so lake beds don't show up upside down. Only on High graphics.
const MIRRORS = [];
function makeMirror(mesh, opts = {}) {
  if (HEADLESS) return null;
  const rt = new T.WebGLRenderTarget(opts.size || 512, opts.size || 512, { type: T.HalfFloatType });
  const m = { mesh, rt, cam: new T.PerspectiveCamera(), tm: new T.Matrix4(), strength: opts.strength || .5, rough: opts.rough || 0, every: opts.every || 2, n: 0, hide: opts.hide || [] };
  const mat = mesh.material;
  mat.onBeforeCompile = sh => {
    sh.uniforms.reflTex = { value: rt.texture }; sh.uniforms.reflMat = { value: m.tm }; sh.uniforms.reflK = { value: m.strength }; sh.uniforms.reflOn = { value: 1 };
    m.uni = sh.uniforms;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 reflMat; varying vec4 vReflUv; varying vec3 vReflW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = reflMat * modelMatrix * vec4(transformed, 1.0); vReflW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D reflTex; uniform float reflK; uniform float reflOn; varying vec4 vReflUv; varying vec3 vReflW;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (reflOn > 0.5) { vec3 Vd = normalize(cameraPosition - vReflW); float fr = 0.18 + 0.82 * pow(1.0 - max(Vd.y, 0.0), 4.0);
          vec2 ruv = vReflUv.xy / vReflUv.w; ruv += (normal.xz * ${(m.rough * .08).toFixed(3)});
          vec3 rc = texture2D(reflTex, ruv).rgb; gl_FragColor.rgb = mix(gl_FragColor.rgb, rc, clamp(reflK * fr, 0.0, 0.92)); }`);
  };
  mat.needsUpdate = true; MIRRORS.push(m); return m;
}
function clearMirrors(scene) { for (let i = MIRRORS.length - 1; i >= 0; i--) { const m = MIRRORS[i]; let s = m.mesh; while (s.parent) s = s.parent; if (!scene || s === scene) { m.rt.dispose(); MIRRORS.splice(i, 1); } } }
const _mN = new T.Vector3(0, 1, 0), _mP = new T.Vector3(), _mC = new T.Vector3(), _mR = new T.Matrix4(), _mL = new T.Vector3(), _mV = new T.Vector3(), _mT = new T.Vector3(), _mPl = new T.Plane(), _mQ = new T.Vector4(), _mCl = new T.Vector4();
function renderMirrors(scene, camera) {
  if (HEADLESS || !MIRRORS.length) return;
  const on = hiQ() && settings.reflections !== false;
  for (const m of MIRRORS) {
    let root = m.mesh; while (root.parent) root = root.parent; if (root !== scene) continue;
    if (m.uni) m.uni.reflOn.value = on ? 1 : 0; if (!on) continue;
    if (++m.n % m.every) continue;
    m.mesh.getWorldPosition(_mP); _mC.setFromMatrixPosition(camera.matrixWorld);
    _mV.subVectors(_mP, _mC); _mV.y = _mP.y - _mC.y; if (_mC.y < _mP.y + .05) { if (m.uni) m.uni.reflOn.value = 0; continue; }
    // mirror the camera under the plane y = _mP.y
    const vc = m.cam; vc.copy(camera); vc.position.set(_mC.x, 2 * _mP.y - _mC.y, _mC.z);
    _mR.extractRotation(camera.matrixWorld); _mL.set(0, 0, -1).applyMatrix4(_mR).add(_mC); _mT.copy(_mL); _mT.y = 2 * _mP.y - _mL.y;
    vc.up.set(0, 1, 0).applyMatrix4(_mR); vc.up.y = -vc.up.y; vc.lookAt(_mT); vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
    m.tm.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1); m.tm.multiply(vc.projectionMatrix); m.tm.multiply(vc.matrixWorldInverse);
    // oblique near plane = the mirror surface
    _mPl.setFromNormalAndCoplanarPoint(_mN, _mP); _mPl.applyMatrix4(vc.matrixWorldInverse);
    _mCl.set(_mPl.normal.x, _mPl.normal.y, _mPl.normal.z, _mPl.constant); const pm = vc.projectionMatrix.elements;
    _mQ.set((Math.sign(_mCl.x) + pm[8]) / pm[0], (Math.sign(_mCl.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    _mCl.multiplyScalar(2 / _mCl.dot(_mQ)); pm[2] = _mCl.x; pm[6] = _mCl.y; pm[10] = _mCl.z + 1 - .003; pm[14] = _mCl.w;
    m.mesh.visible = false; for (const h of m.hide) if (h) h.visible = false;
    const sa = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(m.rt); renderer.clear(); renderer.render(scene, vc); renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = sa; m.mesh.visible = true; for (const h of m.hide) if (h) h.visible = true;
  }
}
