// ==UserScript==
// @name         NOT cheats for putt.day
// @namespace    https://github.com/MaxxKalashnikov/putt-day-notcheats
// @version      1337.5.0
// @description  Shot, position and camera indicators, plus mesh edges. Z: undo. E/W/X: edges/mode/x-ray.
// @author       MaxxKalashnikov
// @homepageURL  https://github.com/MaxxKalashnikov/putt-day-notcheats
// @source       https://github.com/MaxxKalashnikov/putt-day-notcheats
// @downloadURL  https://raw.githubusercontent.com/MaxxKalashnikov/putt-day-notcheats/master/putt-day-notcheats.user.js
// @updateURL    https://raw.githubusercontent.com/MaxxKalashnikov/putt-day-notcheats/master/putt-day-notcheats.user.js
// @match        https://putt.day/*
// @run-at       document-start
// @inject-into  page
// @sandbox      raw
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  const KEY = 'z';
  const MAX_SHOT_SPEED = 10, MIN_PULL = 0.12, MAX_PULL = 1.8, BALL_RADIUS = 0.06;
  const stack = []; 
  let raw = null, hud = null;
  let ball = null;

  const read = p => Array.from(new Float32Array(raw.memory.buffer, p + 4, 3));
  const take = p => { const v = read(p); raw.__wbg_rawvector_free(p, 0); return v; };

  const angleOf = (x, z) => (Math.atan2(-z, x) * 180 / Math.PI + 360) % 360;
  const fmt = s => `${s.angle.toFixed(2).padStart(6)}° · ${(s.power * 100).toFixed(2).padStart(6)}%`;
  let shotLabel = 'shot:   ', status = '', aiming = '', where = '', view = '';
  function show(label, shot) { shotLabel = label; status = fmt(shot); aiming = ''; render(); }
  function render() {
    if (typeof document === 'undefined') return;
    if (!hud) {
      hud = document.createElement('div');
      hud.style.cssText = 'position:fixed;top:8px;left:45%;z-index:2147483647;pointer-events:none;' +
        'font:13px/1.4 ui-monospace,monospace;color:#fff;background:#0009;padding:4px 8px;border-radius:6px;white-space:pre';
      document.documentElement.append(hud);
    }
    hud.textContent = [shotLabel + (status || '—'.padStart(7)),
      'aim: '.padEnd(shotLabel.length) + (aiming || '—'.padStart(7)), where, view].filter(Boolean).join('\n');
  }

  function tick() {
    let position = null;
    try {
      if (ball && raw) {
        position = take(raw.rawrigidbodyset_rbTranslation(ball.set, ball.h));
        const [x, y, z] = position;
        const line = `pos: x ${x.toFixed(2)}  y ${y.toFixed(2)}  z ${z.toFixed(2)}`;
        if (line !== where) { where = line; render(); }
      }
    } catch {}
    let line = '';
    try {
      const cam = stateFor(document.querySelector('canvas'))?.camera;
      if (cam) {
        const V = cam.position.constructor, d = cam.getWorldDirection(new V());
        const horizontal = Math.hypot(d.x, d.z);
        const heading = horizontal > 1e-6 ? `${angleOf(d.x, d.z).toFixed(1)}°` : '—';
        const tilt = Math.atan2(-d.y, horizontal) * 180 / Math.PI;
        // The game zooms by moving the camera, not by changing camera.zoom.
        const p = cam.getWorldPosition(new V());
        const distance = position ? Math.hypot(p.x - position[0], p.y - position[1], p.z - position[2]) : 0;
        const zoom = distance > 0 ? `${(4.4 / distance).toFixed(2)}×` : '—';
        line = `camera: ${heading} · tilt ${tilt.toFixed(1)}° · zoom: ${zoom}`;
      }
    } catch {}
    if (line !== view) { view = line; render(); }
    requestAnimationFrame(tick);
  }
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(tick);

  function hook(exports) {
    raw = exports;
    const ex = { ...exports };
    ex.rawrigidbodyset_rbApplyImpulse = (set, h, imp, wake) => {
      const speed = Math.hypot(...take(raw.rawrigidbodyset_rbLinvel(set, h)));
      const dv = Math.hypot(...read(imp)) / (raw.rawrigidbodyset_rbMass(set, h) || 1);
      if (speed < 0.2 && dv > 0.15) {
        if (stack.length && stack[0].set !== set) stack.length = 0; 
        const [ix, , iz] = read(imp);
        const shot = {
          set, h, pos: take(raw.rawrigidbodyset_rbTranslation(set, h)),
          angle: angleOf(ix, iz),
          power: dv / MAX_SHOT_SPEED,
        };
        stack.push(shot);
        show(`shot ${stack.length}: `, shot);
      }
      return exports.rawrigidbodyset_rbApplyImpulse(set, h, imp, wake);
    };
    ex.rawrigidbodyset_rbSetLinvel = (set, h, v, wake) => {
      ball = { set, h };
      return exports.rawrigidbodyset_rbSetLinvel(set, h, v, wake);
    };
    return ex;
  }

  const fake = inst => Object.create(WebAssembly.Instance.prototype, { exports: { value: hook(inst.exports) } });
  const wrap = r => {
    const i = r instanceof WebAssembly.Instance ? r : r.instance;
    if (!i.exports.rawrigidbodyset_rbApplyImpulse) return r; 
    return i === r ? fake(r) : { module: r.module, instance: fake(i) };
  };
  const inst = WebAssembly.instantiate, stream = WebAssembly.instantiateStreaming;
  WebAssembly.instantiate = (...a) => inst(...a).then(wrap);
  if (stream) WebAssembly.instantiateStreaming = (...a) => stream(...a).then(wrap);

  async function undo() {
    const s = stack.at(-1);
    if (!s || !raw) return;
    const url = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.startsWith(location.origin + '/assets/runtime-') && name.endsWith('.js'));
    if (!url) throw new Error('game runtime not found');
    const game = Object.values(await import(url)).find(value =>
      Array.isArray(value?.state?.lastLie) && typeof value.setState === 'function');
    if (!game) throw new Error('game return point unavailable');
    if (stack.at(-1) !== s) return;
    const [x, y, z] = s.pos;
    // OOB uses lastLie, whose height excludes the ball radius, not the rigid body's centre.
    game.setState(state => ({ ...state, lastLie: [x, y - BALL_RADIUS, z] }));
    const zero = raw.rawvector_new(0, 0, 0);
    raw.rawrigidbodyset_rbSetTranslation(s.set, s.h, x, y, z, true);
    raw.rawrigidbodyset_rbSetLinvel(s.set, s.h, zero, true);
    raw.rawrigidbodyset_rbSetAngvel(s.set, s.h, zero, true);
    raw.__wbg_rawvector_free(zero, 0);
    stack.pop();
    show(`back to shot ${stack.length + 1} spot — you hit `, s);
  }

  addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== KEY || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return;
    return undo().catch(error => {
      shotLabel = '';
      status = `undo failed: ${error.message}`;
      aiming = '';
      render();
    });
  });

  // --- live aim ---------------------------------------------------------------
  const scenes = [];
  const devtools = globalThis.__THREE_DEVTOOLS__ ??= new EventTarget();
  devtools.addEventListener('observe', e => {
    if (e.detail?.isScene) scenes.push(e.detail), scenes.length > 20 && scenes.shift();
  });
  const stateFor = canvas => {
    for (const s of scenes) {
      const st = s.__r3f?.root?.getState?.();
      if (st?.camera && st.gl?.domElement === canvas) return st;
    }
  };

  function hit(st, cx, cy, y) {
    const cam = st.camera, r = st.gl.domElement.getBoundingClientRect(), V = cam.position.constructor;
    const o = new V().setFromMatrixPosition(cam.matrixWorld);
    const d = new V((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5)
      .unproject(cam).sub(o).normalize();
    const t = (y - o.y) / d.y;
    return t > 0 ? [o.x + d.x * t, o.z + d.z * t] : null;
  }

  let down = null, aim = null;
  addEventListener('pointerdown', e => { down = e; }, true);
  const capture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id) {
    const st = this.tagName === 'CANVAS' && down?.pointerId === id && ball && raw && stateFor(this);
    if (st) {
      const y = take(raw.rawrigidbodyset_rbTranslation(ball.set, ball.h))[1];
      const start = hit(st, down.clientX, down.clientY, y);
      if (start) aim = { id, st, y, start, x0: down.clientX, y0: down.clientY };
    }
    return capture.call(this, id);
  };
  addEventListener('pointermove', e => {
    if (e.pointerId !== aim?.id) return;
    const now = hit(aim.st, e.clientX, e.clientY, aim.y);
    if (!now) return;
    const px = now[0] - aim.start[0], pz = now[1] - aim.start[1], pull = Math.hypot(px, pz);
    const r = aim.st.gl.domElement.getBoundingClientRect();
    const drag = Math.hypot(e.clientX - aim.x0, e.clientY - aim.y0);
    if ((pull < MIN_PULL && drag < 24) || pull < 0.02) {
      aiming = '—'.padStart(7);
    } else {
      const power = Math.max(Math.min(pull, MAX_PULL) / MAX_PULL,
        Math.min(drag / (0.33 * Math.min(r.width, r.height)), 1)) ** 1.6;
      aiming = fmt({ angle: angleOf(-px, -pz), power });
    }
    render();
  }, true);
  const end = e => {
    if (e.pointerId !== aim?.id) return;
    aim = null;
    aiming = '';
    render();
  };
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
})();

// Polygon/object edge overlay by Thea, adapted from version 1.1.
// https://discord.com/channels/1516982740975882350/1516982741466353817/1552671332486094909
// https://discord.com/channels/1516982740975882350/1516982741466353817/1552670961290182757
(() => {
  'use strict';

  // three.js dispatches `observe` on this target for every Scene/Renderer it
  // creates, so it must exist before the site's modules run (document-start).
  const hook = window.__THREE_DEVTOOLS__ || (window.__THREE_DEVTOOLS__ = new EventTarget());

  const scenes = new Set();
  const overlays = new Map(); // mesh -> overlay object
  const patched = new Map(); // original material -> previous polygonOffset settings
  const edgeCache = new WeakMap(); // source geometry -> { key, geo }
  const opts = {
    mode: 'crease', // 'crease': only edges where neighbouring faces meet at an angle; 'wire': every triangle
    angle: 15, // crease threshold in degrees
    boundaries: true, // in crease mode, also draw open edges that have only one face
  };
  let enabled = false;
  let xray = false;
  let timer = null;
  let BasicMaterial = null; // MeshBasicMaterial/LineBasicMaterial constructor, if the scene uses one
  let BaseGeometry = null; // plain BufferGeometry constructor

  hook.addEventListener('observe', (e) => {
    if (e.detail && e.detail.isScene) scenes.add(e.detail);
  });

  const colorFor = (obj) => {
    let h = 0;
    for (const c of obj.uuid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return (h % 360) / 360;
  };

  const pushBack = (mat) => {
    if (patched.has(mat)) return;
    patched.set(mat, [mat.polygonOffset, mat.polygonOffsetFactor, mat.polygonOffsetUnits]);
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 1;
    mat.polygonOffsetUnits = 1;
    mat.needsUpdate = true;
  };

  // The bundle doesn't expose three's classes, so borrow constructors from live objects.
  const findBasicMaterial = () => {
    if (BasicMaterial) return;
    for (const s of scenes) {
      s.traverse((obj) => {
        for (const m of [].concat(obj.material || [])) {
          if (!BasicMaterial && (m.isMeshBasicMaterial || m.isLineBasicMaterial)) BasicMaterial = m.constructor;
        }
      });
    }
  };

  const edgeMaterial = (src, hue, asLines) => {
    let m;
    if (BasicMaterial) {
      m = new BasicMaterial();
    } else {
      // Fallback: strip the original material down so missing attributes don't matter.
      m = src.clone();
      for (const k of ['map', 'alphaMap', 'aoMap', 'normalMap', 'bumpMap', 'emissiveMap', 'lightMap', 'envMap']) {
        if (k in m) m[k] = null;
      }
      m.vertexColors = false;
      if (m.emissive) m.emissive.setHSL(hue, 1, 0.5); // keep lit materials visible without normals
    }
    if (m.color) m.color.setHSL(hue, 1, 0.5);
    m.wireframe = !asLines;
    m.transparent = true;
    m.opacity = 1;
    m.depthTest = !xray;
    m.depthWrite = false;
    m.polygonOffset = false;
    m.userData.__edgeOverlay = true;
    return m;
  };

  const baseGeometry = (geometry) => {
    if (!BaseGeometry) {
      let C = geometry.constructor;
      while (C && new C().type !== 'BufferGeometry') C = Object.getPrototypeOf(C);
      BaseGeometry = C;
    }
    return BaseGeometry && new BaseGeometry();
  };

  const attributeCtor = (geometry) => {
    const plain = Object.values(geometry.attributes).find((a) => !a.isInterleavedBufferAttribute);
    return (plain || geometry.index || {}).constructor;
  };

  // Same idea as three's EdgesGeometry: weld vertices by position, keep an edge
  // when the two faces sharing it differ by more than the threshold angle.
  const creaseGeometry = (geometry) => {
    const pos = geometry.attributes.position;
    if (!pos) return null;
    const key = `${opts.angle}|${opts.boundaries}|${pos.version}|${geometry.index ? geometry.index.version : -1}`;
    const hit = edgeCache.get(geometry);
    if (hit && hit.key === key) return hit.geo;

    const Attr = attributeCtor(geometry);
    const geo = baseGeometry(geometry);
    if (!Attr || !geo) return null;

    const index = geometry.index;
    const count = index ? index.count : pos.count;
    const cosLimit = Math.cos((opts.angle * Math.PI) / 180);
    const precision = 1e4;

    const welded = new Map();
    const vid = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const k = `${Math.round(pos.getX(i) * precision)},${Math.round(pos.getY(i) * precision)},${Math.round(pos.getZ(i) * precision)}`;
      let id = welded.get(k);
      if (id === undefined) welded.set(k, (id = welded.size));
      vid[i] = id;
    }

    const open = new Map(); // edge key -> { n: face normal, i, j }
    const out = [];
    const emit = (i, j) => out.push(pos.getX(i), pos.getY(i), pos.getZ(i), pos.getX(j), pos.getY(j), pos.getZ(j));

    for (let t = 0; t + 2 < count; t += 3) {
      const v = index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2];
      const ax = pos.getX(v[1]) - pos.getX(v[0]), ay = pos.getY(v[1]) - pos.getY(v[0]), az = pos.getZ(v[1]) - pos.getZ(v[0]);
      const bx = pos.getX(v[2]) - pos.getX(v[0]), by = pos.getY(v[2]) - pos.getY(v[0]), bz = pos.getZ(v[2]) - pos.getZ(v[0]);
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      if (len === 0) continue; // degenerate triangle
      nx /= len; ny /= len; nz /= len;

      for (let e = 0; e < 3; e++) {
        const i = v[e], j = v[(e + 1) % 3];
        const a = vid[i], b = vid[j];
        if (a === b) continue;
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        const other = open.get(k);
        if (!other) {
          open.set(k, { n: [nx, ny, nz], i, j });
        } else {
          if (other.n[0] * nx + other.n[1] * ny + other.n[2] * nz <= cosLimit) emit(i, j);
          open.delete(k);
        }
      }
    }
    if (opts.boundaries) for (const { i, j } of open.values()) emit(i, j);

    geo.setAttribute('position', new Attr(new Float32Array(out), 3));
    edgeCache.set(geometry, { key, geo });
    return geo;
  };

  const addOverlay = (mesh) => {
    if (overlays.has(mesh) || mesh.userData.__edgeOverlay || mesh.isSkinnedMesh) return;
    const hue = colorFor(mesh);
    const mats = [].concat(mesh.material);
    const creases = opts.mode === 'crease';
    const edges = creases && creaseGeometry(mesh.geometry);
    if (creases && !edges) return;

    mats.forEach(pushBack);
    // clone(false) keeps geometry and, for InstancedMesh, the instance matrices.
    const o = mesh.clone(false);
    if (creases) {
      // WebGLRenderer picks the draw mode from these flags, so this draws GL_LINES.
      o.geometry = edges;
      o.isMesh = false;
      o.isLine = true;
      o.isLineSegments = true;
      o.material = edgeMaterial(mats[0], hue, true);
    } else {
      o.material = Array.isArray(mesh.material)
        ? mats.map((m) => edgeMaterial(m, hue, false))
        : edgeMaterial(mesh.material, hue, false);
    }
    o.position.set(0, 0, 0);
    o.quaternion.identity();
    o.scale.set(1, 1, 1);
    o.castShadow = o.receiveShadow = false;
    o.renderOrder = 999;
    o.raycast = () => {}; // don't steal the game's pointer picking
    o.userData.__edgeOverlay = true;
    mesh.add(o);
    overlays.set(mesh, o);
  };

  const removeOverlay = (mesh, o) => {
    mesh.remove(o);
    [].concat(o.material).forEach((m) => m.dispose());
    overlays.delete(mesh);
  };

  const scan = () => {
    findBasicMaterial();
    for (const s of scenes) s.traverse((obj) => obj.isMesh && addOverlay(obj));
    for (const [mesh, o] of overlays) {
      if (!mesh.parent) removeOverlay(mesh, o); // mesh left the scene
    }
  };

  const clear = () => {
    for (const [mesh, o] of overlays) removeOverlay(mesh, o);
    for (const [mat, [on, f, u]] of patched) {
      mat.polygonOffset = on;
      mat.polygonOffsetFactor = f;
      mat.polygonOffsetUnits = u;
      mat.needsUpdate = true;
    }
    patched.clear();
  };

  const log = () =>
    console.info(`[edges] ${enabled ? 'on' : 'off'}, ${opts.mode}${opts.mode === 'crease' ? ` ${opts.angle}°` : ''}, ` +
      `${scenes.size} scene(s), ${overlays.size} mesh(es)`);

  const toggle = () => {
    enabled = !enabled;
    clearInterval(timer);
    if (enabled) {
      scan();
      timer = setInterval(scan, 1000); // pick up meshes added later
    } else {
      clear();
    }
    log();
  };

  const rebuild = () => {
    if (!enabled) return log();
    clear();
    scan();
    log();
  };

  const toggleMode = () => {
    opts.mode = opts.mode === 'crease' ? 'wire' : 'crease';
    rebuild();
  };

  const setAngle = (deg) => {
    opts.angle = deg;
    rebuild();
  };

  const toggleXray = () => {
    xray = !xray;
    for (const o of overlays.values()) [].concat(o.material).forEach((m) => (m.depthTest = !xray));
    console.info(`[edges] x-ray ${xray ? 'on' : 'off'}`);
  };

  window.addEventListener('keydown', (e) => {
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.repeat || e.isComposing) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return;
    const key = e.key.toLowerCase();
    if (key === 'e') toggle();
    else if (key === 'w') toggleMode();
    else if (key === 'x') toggleXray();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  window.__edges = { toggle, toggleMode, toggleXray, setAngle, opts, rebuild, scenes, overlays };
})();
