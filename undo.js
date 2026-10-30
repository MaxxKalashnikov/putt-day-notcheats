(() => {
  const KEY = 'z';
  const MAX_SHOT_SPEED = 10, MIN_PULL = 0.12, MAX_PULL = 1.8;
  const stack = []; 
  let raw = null, hud = null;
  let ball = null;

  const read = p => Array.from(new Float32Array(raw.memory.buffer, p + 4, 3));
  const take = p => { const v = read(p); raw.__wbg_rawvector_free(p, 0); return v; };

  const angleOf = (x, z) => (Math.atan2(-z, x) * 180 / Math.PI + 360) % 360;
  const fmt = s => `${s.angle.toFixed(1)}° · ${(s.power * 100).toFixed(0)}%`;
  let status = '', where = '';
  function show(text) { status = text; render(); }
  function render() {
    if (typeof document === 'undefined') return;
    if (!hud) {
      hud = document.createElement('div');
      hud.style.cssText = 'position:fixed;top:8px;left:45%;z-index:2147483647;pointer-events:none;' +
        'font:13px/1.4 ui-monospace,monospace;color:#fff;background:#0009;padding:4px 8px;border-radius:6px;white-space:pre';
      document.documentElement.append(hud);
    }
    hud.textContent = [status, where].filter(Boolean).join('\n');
  }

  function tick() {
    try {
      if (ball && raw) {
        const [x, y, z] = take(raw.rawrigidbodyset_rbTranslation(ball.set, ball.h));
        const line = `pos: x ${x.toFixed(2)}  y ${y.toFixed(2)}  z ${z.toFixed(2)}`;
        if (line !== where) { where = line; render(); }
      }
    } catch {} 
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
        show(`shot ${stack.length}: ${fmt(shot)}`);
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

  function undo() {
    const s = stack.pop();
    if (!s || !raw) return;
    const [x, y, z] = s.pos;
    const zero = raw.rawvector_new(0, 0, 0);
    raw.rawrigidbodyset_rbSetTranslation(s.set, s.h, x, y, z, true);
    raw.rawrigidbodyset_rbSetLinvel(s.set, s.h, zero, true);
    raw.rawrigidbodyset_rbSetAngvel(s.set, s.h, zero, true);
    raw.__wbg_rawvector_free(zero, 0);
    show(`back to shot ${stack.length + 1} spot — you hit ${fmt(s)}`);
  }

  addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== KEY || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return;
    undo();
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
    if ((pull < MIN_PULL && drag < 24) || pull < 0.02) return show('aim: —');
    const power = Math.max(Math.min(pull, MAX_PULL) / MAX_PULL,
      Math.min(drag / (0.33 * Math.min(r.width, r.height)), 1)) ** 1.6;
    show(`aim: ${fmt({ angle: angleOf(-px, -pz), power })}`); 
  }, true);
  const end = e => { if (e.pointerId === aim?.id) aim = null; };
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
})();
