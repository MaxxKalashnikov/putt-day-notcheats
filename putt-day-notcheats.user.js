// ==UserScript==
// @name         NOT cheats for putt.day
// @namespace    https://github.com/MaxxKalashnikov/putt-day-notcheats
// @version      1337.3.0
// @description  Adds shot, position, camera angle and zoom-distance indicators. Press Z to undo.
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
  let shotLabel = '', status = '', aiming = '', where = '', view = '';
  function show(label, shot) { shotLabel = label; status = fmt(shot); aiming = ''; render(); }
  function render() {
    if (typeof document === 'undefined') return;
    if (!hud) {
      hud = document.createElement('div');
      hud.style.cssText = 'position:fixed;top:8px;left:45%;z-index:2147483647;pointer-events:none;' +
        'font:13px/1.4 ui-monospace,monospace;color:#fff;background:#0009;padding:4px 8px;border-radius:6px;white-space:pre';
      document.documentElement.append(hud);
    }
    hud.textContent = [status && shotLabel + status,
      aiming && 'aim: '.padEnd(shotLabel.length) + aiming, where, view].filter(Boolean).join('\n');
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
        const distance = position ? Math.hypot(p.x - position[0], p.y - position[1], p.z - position[2]).toFixed(2) : '—';
        line = `camera: ${heading} · tilt ${tilt.toFixed(1)}°\nzoom distance: ${distance}`;
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
