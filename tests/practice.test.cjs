const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { game } = require('./fixtures/assets/runtime-test.js');

const source = readFileSync(`${__dirname}/../putt-day-notcheats.user.js`, 'utf8');
const origin = pathToFileURL(`${__dirname}/fixtures`).href;

function load() {
  const observed = [], requests = [], elements = [], events = [];
  game.state = { phase: 'aiming', strokes: 0, lastLie: [0, 0, 0], result: null, teleport: null };
  game.setState = update => {
    game.state = typeof update === 'function' ? update(game.state) : update;
    observed.push(game.state);
  };
  class Storage {
    constructor() { this.values = new Map([['golf.stats.v1', '{"v":1,"days":{"1":{"strokes":4}}}']]); }
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
  }
  class WebSocket {
    constructor(url) { this.url = url; this.sent = []; }
    send(data) { this.sent.push(data); }
  }
  class Element {
    constructor(tagName) { this.tagName = tagName; this.style = {}; this.listeners = {}; this.open = false; }
    setAttribute(key, value) { this[key] = value; }
    append() {}
    setPointerCapture() {}
    addEventListener(type, listener) { this.listeners[type] = listener; }
    showModal() { this.open = true; }
    close(value) {
      if (!this.open) return;
      this.open = false;
      if (value !== undefined) this.returnValue = value;
      this.listeners.close?.();
    }
  }
  class Instance { constructor() { this.exports = { rawrigidbodyset_rbApplyImpulse() {} }; } }
  let frame;
  const context = {
    URL, Request, DOMException, EventTarget, Element, Storage, WebSocket,
    localStorage: new Storage(), sessionStorage: new Storage(),
    location: { origin, href: `${origin}/play`, host: '' },
    performance: { getEntriesByType: () => [{ name: `${origin}/assets/runtime-test.js` }] },
    requestAnimationFrame(callback) { frame = callback; },
    WebAssembly: { Instance, instantiate: async () => new Instance(), instantiateStreaming: async () => ({ instance: new Instance(), module: {} }) },
    fetch: async (...args) => { requests.push(args); return { ok: true }; },
    addEventListener() {},
    dispatchEvent(event) { events.push(event); },
    KeyboardEvent: class { constructor(type, init) { Object.assign(this, { type }, init); } },
    document: {
      documentElement: { append() {} },
      querySelector: () => null,
      createElement(tag) {
        const element = new Element(tag);
        if (tag === 'form') {
          element.elements = { angle: { setCustomValidity() {} }, power: { setCustomValidity() {} } };
          element.querySelector = () => ({});
        }
        elements.push(element);
        return element;
      },
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  return { context, observed, requests, elements, events, frame: () => frame() };
}

// Seroval's object/array/primitive representation used by TanStack server functions.
function wireBody(data) {
  let id = 0;
  const encode = value => {
    if (value === null) return { t: 2, s: 0 };
    if (Array.isArray(value)) return { t: 9, i: id++, a: value.map(encode), o: 0 };
    if (typeof value === 'object') return {
      t: 10, i: id++, p: { k: Object.keys(value), v: Object.values(value).map(encode) }, o: 0,
    };
    return { t: typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : 2,
      s: typeof value === 'boolean' ? value ? 2 : 3 : value };
  };
  return JSON.stringify({ t: encode({ data }), f: 63, m: [] });
}

const blocked = { name: 'NotAllowedError' };

test('completion keeps the cup state but subscribers never see a result, across restarts and holes', async () => {
  const { context, observed, frame, elements, events } = load();
  await context.WebAssembly.instantiate();
  const setter = game.setState;
  for (const levelId of ['daily', 'community']) {
    game.setState(state => ({ ...state, phase: 'rolling', result: null, levelId }));
    await frame();
    const cup = [1, 2, 3];
    game.setState(state => ({ ...state, phase: 'holed', teleport: cup, result: { strokes: 1, levelId } }));
    assert.equal(game.state.phase, 'holed');
    assert.equal(game.state.result, null);
    assert.equal(game.state.teleport, cup, 'the native cup animation keeps its teleport');
    assert.ok(observed.every(state => state.result === null));
    await frame();
    const dialog = elements.find(element => element.tagName === 'dialog');
    assert.equal(dialog.open, true);
    assert.equal(dialog['aria-labelledby'], 'putt-notcheats-finish-title');
    assert.match(dialog.innerHTML, /Now do it without assists ;\)/);
    dialog.close('restart');
    assert.equal(events.at(-1).key, 'r');
    await frame();
    assert.equal(dialog.open, false, 'dismissed results stay dismissed until the next attempt');
  }
  await context.WebAssembly.instantiateStreaming();
  assert.equal(game.setState, setter, 'guard installation is idempotent');
  game.setState({ ...game.state, result: { strokes: 2 } });
  assert.equal(game.state.result, null, 'direct replacement updates are also sanitized');
});

test('assisted physics cannot start without a recognized completion store', async () => {
  const { context } = load();
  context.performance.getEntriesByType = () => [];
  await assert.rejects(context.WebAssembly.instantiate(), /game runtime not found/);
  await assert.rejects(context.WebAssembly.instantiateStreaming(), /game runtime not found/);
  context.performance.getEntriesByType = () => [{ name: `${origin}/assets/runtime-test.js` }];
  delete game.state.result;
  await assert.rejects(context.WebAssembly.instantiate(), /Cannot protect scores/);
  game.state.result = null;
  Object.defineProperty(game, 'setState', { writable: false });
  try {
    await assert.rejects(context.WebAssembly.instantiate(), /Cannot install the practice completion guard/);
  } finally {
    Object.defineProperty(game, 'setState', { writable: true });
  }
});

test('HTTP backup blocks scores, profile uploads and replay creation even without the state guard', async () => {
  const { context, requests } = load();
  context.location = new URL('https://putt.day/play');
  const payloads = [
    { n: 1, strokes: 2, cid: 'player' },
    { id: 'hole', cid: 'player', completed: true, strokes: 2 },
    { n: 1, strokes: 2, card: 'g', path: [0, 0], restarts: 0 },
    { groups: [{ code: 'abc' }], n: 1, strokes: 2, par: 3, streak: 1 },
    { days: { 1: { strokes: 2, par: 3, at: 1 } }, since: 0, cid: '' },
    { runs: [{ t: [0, 1, 2], e: [] }] },
    { n: 1, p: [0, 0], s: 2, t: [0, 1, 2], replay: true },
    { hole: 'custom', p: [0, 0], s: 2, t: [0, 1, 2] },
    { map: {}, p: [0, 0], s: 2, t: [0, 1, 2], replay: true },
  ];
  for (const data of payloads) {
    for (const body of [JSON.stringify({ data }), wireBody(data)]) {
      await assert.rejects(context.fetch('/_serverFn/hash', { method: 'POST', body }), blocked);
    }
  }
  const request = new Request('https://putt.day/_serverFn/hash', { method: 'POST', body: wireBody(payloads[0]) });
  await assert.rejects(context.fetch(request), blocked);
  assert.equal(request.bodyUsed, false, 'inspection does not consume the original Request');
  await assert.rejects(context.fetch('/_serverFn/hash', { method: 'POST', body: 'unknown format' }), blocked);
  assert.equal(requests.length, 0);
});

test('HTTP backup leaves assets, account reads, settings and existing replay reads alone', async () => {
  const { context, requests } = load();
  context.location = new URL('https://putt.day/play');
  const allowed = [
    ['/assets/runtime.js'], ['/replay/existing'],
    ['/_serverFn/read?payload=existing'],
    ['/_serverFn/hash', { method: 'POST', body: wireBody({ days: {}, since: 0, cid: '' }) }],
    ['/_serverFn/hash', { method: 'POST', body: wireBody({ ids: ['existing'] }) }],
    ['/_serverFn/hash', { method: 'POST', body: wireBody({ username: 'player' }) }],
    [new URL('https://putt.day/_serverFn/hash'), { method: 'POST', body: wireBody({ data: { settings: { sound: true } } }) }],
    ['https://example.com/_serverFn/hash', { method: 'POST', body: wireBody({ strokes: 1 }) }],
  ];
  for (const args of allowed) await context.fetch(...args);
  assert.equal(requests.length, allowed.length);
});

test('storage backup preserves saved scores and leaves settings and session storage writable', () => {
  const { context } = load();
  const saved = context.localStorage.getItem('golf.stats.v1');
  assert.throws(() => context.localStorage.setItem('golf.stats.v1', '{"days":{}}'), blocked);
  assert.equal(context.localStorage.getItem('golf.stats.v1'), saved);
  context.localStorage.setItem('theme', 'dark');
  assert.equal(context.localStorage.getItem('theme'), 'dark');
  context.sessionStorage.setItem('golf.stats.v1', 'unrelated');
  assert.equal(context.sessionStorage.getItem('golf.stats.v1'), 'unrelated');
});

test('multiplayer backup drops finish frames but preserves other traffic', () => {
  const { context } = load();
  context.location = new URL('https://putt.day/play');
  for (const path of ['/ws/day/1', '/ws/round/room', '/ws/party/room']) {
    const socket = new context.WebSocket(`wss://putt.day${path}`);
    socket.send('{"f":1,"s":2,"p":3}');
    assert.equal(socket.sent.length, 0);
    for (const message of ['{"t":"prog","st":2}', '{"t":"traj","p":[0,1,2]}', 'ping']) socket.send(message);
    assert.equal(socket.sent.length, 3);
  }
  const unrelated = new context.WebSocket('wss://example.com/ws');
  unrelated.send('{"f":1}');
  assert.equal(unrelated.sent.length, 1);
});
