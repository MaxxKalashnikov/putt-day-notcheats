const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { game } = require('./fixtures/assets/runtime-test.js');

const source = readFileSync(`${__dirname}/../putt-day-notcheats.user.js`, 'utf8');

async function load() {
  const physics = { position: [0, 0, 0] };
  game.state = { lastLie: [0, -0.06, 0], teleport: null, phase: 'aiming' };
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
    rawrigidbodyset_rbTranslation: () => vector(...physics.position),
    rawrigidbodyset_rbApplyImpulse() {},
    rawrigidbodyset_rbSetTranslation(set, h, x, y, z) { physics.position = [x, y, z]; },
    rawrigidbodyset_rbSetLinvel() {},
    rawrigidbodyset_rbSetAngvel() {},
  };
  class Instance { constructor() { this.exports = exports; } }
  class Element { setPointerCapture() {} }
  const origin = pathToFileURL(`${__dirname}/fixtures`).href;
  const context = {
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

  const canvas = { tagName: 'CANVAS' };
  const shoot = (x, z) => raw.rawrigidbodyset_rbApplyImpulse(1, 1, vector(x, 0, z), true);
  return { hud, emit, canvas, shoot, physics, context };
}

test('OOB after undo returns to the restored shot origin, not the previous landing', async () => {
  const { physics, shoot, emit, canvas } = await load();
  const origin = [1.5, 2, -4.25];
  physics.position = [...origin];
  game.state.lastLie = [origin[0], origin[1] - 0.06, origin[2]];
  shoot(5, 0);
  physics.position = [8, 3, 6];
  game.state.lastLie = [8, 3 - 0.06, 6];
  await emit('keydown', { key: 'z', target: canvas });
  assert.deepEqual(physics.position, origin, 'undo restores the physical ball');
  shoot(0, -5);
  game.setState(state => ({ ...state, phase: 'resetting', teleport: state.lastLie }));
  const [x, y, z] = game.state.teleport;
  physics.position = [x, y + 0.06, z];
  assert.deepEqual(physics.position, origin, 'OOB must use the same restored origin');
});

test('unavailable game state leaves the ball and undo history intact for retry', async () => {
  const { physics, shoot, emit, canvas, context, hud } = await load();
  physics.position = [1, 2, 3];
  shoot(5, 0);
  physics.position = [4, 5, 6];
  const resources = context.performance.getEntriesByType;
  context.performance.getEntriesByType = () => [];
  await emit('keydown', { key: 'z', target: canvas });
  assert.deepEqual(physics.position, [4, 5, 6]);
  assert.match(hud.textContent, /undo failed/);
  context.performance.getEntriesByType = resources;
  await emit('keydown', { key: 'z', target: canvas });
  assert.deepEqual(physics.position, [1, 2, 3]);
  assert.deepEqual(Array.from(game.state.lastLie), [1, 1.94, 3]);
  assert.match(hud.textContent, /back to shot 1 spot/);
});
