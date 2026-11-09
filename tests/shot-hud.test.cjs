const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { game } = require('./fixtures/assets/runtime-test.js');

const source = readFileSync(`${__dirname}/../putt-day-notcheats.user.js`, 'utf8');

test('shot and aim rows stay visible while aiming, cancelling and retrying after undo', async () => {
  game.state = { lastLie: [0, -0.06, 0] };
  const listeners = new Map();
  const hud = { style: {} };
  const memory = { buffer: new ArrayBuffer(4096) };
  let next = 0;
  const vector = (x, y, z) => {
    const p = next;
    next += 16;
    new Float32Array(memory.buffer, p + 4, 3).set([x, y, z]);
    return p;
  };
  const exports = {
    memory,
    rawvector_new: vector,
    __wbg_rawvector_free() {},
    rawrigidbodyset_rbLinvel: () => vector(0, 0, 0),
    rawrigidbodyset_rbMass: () => 1,
    rawrigidbodyset_rbTranslation: () => vector(0, 0, 0),
    rawrigidbodyset_rbApplyImpulse() {},
    rawrigidbodyset_rbSetTranslation() {},
    rawrigidbodyset_rbSetLinvel() {},
    rawrigidbodyset_rbSetAngvel() {},
  };
  class Instance { constructor() { this.exports = exports; } }
  class Element { setPointerCapture() {} }
  const origin = pathToFileURL(`${__dirname}/fixtures`).href;
  let frame;
  const context = {
    requestAnimationFrame(callback) { frame = callback; },
    EventTarget, Element,
    location: { origin },
    performance: { getEntriesByType: () => [{ name: `${origin}/assets/runtime-test.js` }] },
    WebAssembly: { Instance, instantiate: async () => new Instance() },
    document: { createElement: () => hud, documentElement: { append() {} } },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const emit = (type, event) => Promise.all(listeners.get(type).map(listener => listener(event)));
  const raw = (await context.WebAssembly.instantiate()).exports;
  raw.rawrigidbodyset_rbSetLinvel(1, 1, vector(0, 0, 0), true);

  class Vector {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    setFromMatrixPosition() { this.y = 10; return this; }
    unproject() { this.z = this.y; this.y = 0; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    normalize() {
      const length = Math.hypot(this.x, this.y, this.z);
      this.x /= length; this.y /= length; this.z /= length;
      return this;
    }
  }
  const canvas = new Element();
  canvas.tagName = 'CANVAS';
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const state = { camera: { position: new Vector() }, gl: { domElement: canvas } };
  const observe = new Event('observe');
  observe.detail = { isScene: true, __r3f: { root: { getState: () => state } } };
  context.__THREE_DEVTOOLS__.dispatchEvent(observe);
  const start = () => {
    emit('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 });
    canvas.setPointerCapture(1);
  };
  const move = x => emit('pointermove', { pointerId: 1, clientX: x, clientY: 50 });
  const end = type => emit(type, { pointerId: 1 });
  const shoot = (x, z) => raw.rawrigidbodyset_rbApplyImpulse(1, 1, vector(x, 0, z), true);

  start();
  move(50);
  assert.equal(hud.textContent, 'shot:         —\naim:          —');
  move(100);
  assert.equal(hud.textContent, 'shot:         —\naim:    180.00° · 100.00%');
  end('pointercancel');
  assert.equal(hud.textContent, 'shot:         —\naim:          —');

  shoot(5, 0);
  const first = 'shot 1:   0.00° ·  50.00%';
  const idle = '\naim:          —';
  assert.equal(hud.textContent, first + idle);
  start();
  move(50);
  assert.equal(hud.textContent, `${first}\naim:          —`);
  move(100);
  assert.equal(hud.textContent, `${first}\naim:    180.00° · 100.00%`);
  emit('pointerup', { pointerId: 2 });
  assert.equal(hud.textContent, `${first}\naim:    180.00° · 100.00%`);
  end('pointercancel');
  assert.equal(hud.textContent, first + idle);

  start();
  move(100);
  end('pointerup');
  assert.equal(hud.textContent, first + idle);
  shoot(0, -8);
  assert.equal(hud.textContent, 'shot 2:  90.00° ·  80.00%' + idle);
  await emit('keydown', { key: 'z', target: canvas });
  const undone = 'back to shot 2 spot — you hit  90.00° ·  80.00%';
  assert.equal(hud.textContent, `${undone}\n${'aim: '.padEnd('back to shot 2 spot — you hit '.length)}      —`);
  start();
  move(100);
  assert.equal(hud.textContent, `${undone}\n${'aim: '.padEnd('back to shot 2 spot — you hit '.length)}180.00° · 100.00%`);
  end('pointerup');
  shoot(5, 0);
  assert.equal(hud.textContent, 'shot 2:   0.00° ·  50.00%' + idle);

  const aligned = () => {
    const [previous, current] = hud.textContent.split('\n');
    for (const unit of ['°', '·', '%']) {
      assert.ok(previous.includes(unit));
      assert.equal(current.indexOf(unit), previous.indexOf(unit));
    }
  };
  for (let i = 0; i < 8; i++) shoot(5, 0);
  start();
  move(60);
  assert.ok(hud.textContent.startsWith('shot 10:'));
  aligned();
  move(57);
  aligned();
  move(100);
  aligned();
  end('pointerup');
  const radians = 12.346 * Math.PI / 180;
  shoot(Math.cos(radians) * 3.4567, -Math.sin(radians) * 3.4567);
  assert.equal(hud.textContent, 'shot 11:  12.35° ·  34.57%\naim:           —');

  context.document.querySelector = () => canvas;
  state.camera.getWorldDirection = () => ({ x: 0, y: -1, z: -1 });
  for (const [distance, zoom] of [[4.4, '1.00×'], [2, '2.20×'], [12, '0.37×'], [0, '—']]) {
    state.camera.getWorldPosition = () => ({ x: 0, y: distance, z: 0 });
    frame();
    assert.equal(hud.textContent.split('\n').at(-1), `camera: 90.0° · tilt 45.0° · zoom: ${zoom}`);
  }
});
