const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { runtime, game } = require('./fixtures/assets/runtime-test.js');

const source = readFileSync(`${__dirname}/../putt-day-notcheats.user.js`, 'utf8');

async function load() {
  game.setState = update => { game.state = update(game.state); };
  game.state = { phase: 'aiming', shots: [], strokes: 0, pendingShot: null, teleport: null, lastLie: [0, -0.06, 0], result: null };
  const listeners = new Map();
  const divs = [];
  const message = {};
  const input = value => ({
    tagName: 'INPUT', value, selectionStart: 0, selectionEnd: 0, validationMessage: '',
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    focus() { context.document.activeElement = this; },
    setCustomValidity(message) { this.validationMessage = message; },
  });
  const form = {
    style: {},
    elements: { angle: input('000.00'), power: input('050.00') },
    addEventListener(type, fn) { this[type] = fn; },
    querySelector: selector => selector === 'output' ? message : null,
    requestSubmit() { this.submission = this.submit({ preventDefault() {} }); },
    contains(node) { return [this, ...Object.values(this.elements)].includes(node); },
    reportValidity() { return this.checkValidity(); },
    checkValidity() {
      return Object.values(this.elements).every(input => input.value !== '' && !input.validationMessage);
    },
  };
  const physics = { mass: 1, speed: 0, impulses: [], position: [0, 0, 0] };
  const memory = { buffer: new ArrayBuffer(16384) };
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
    rawrigidbodyset_rbLinvel: () => vector(physics.speed, 0, 0),
    rawrigidbodyset_rbMass: () => physics.mass,
    rawrigidbodyset_rbTranslation: () => vector(...physics.position),
    rawrigidbodyset_rbApplyImpulse(set, h, p, wake) {
      physics.impulses.push({ set, h, p, wake, value: Array.from(new Float32Array(memory.buffer, p + 4, 3)) });
    },
    rawrigidbodyset_rbSetTranslation() {},
    rawrigidbodyset_rbSetLinvel() {},
    rawrigidbodyset_rbSetAngvel() {},
  };
  class Instance { constructor() { this.exports = exports; } }
  class Element {
    setPointerCapture(id) { assert.notEqual(id, -1337, 'synthetic pointers cannot be captured'); }
    releasePointerCapture(id) { assert.notEqual(id, -1337, 'synthetic pointers cannot be released'); }
  }
  const origin = pathToFileURL(`${__dirname}/fixtures`).href;
  let frame;
  const context = {
    requestAnimationFrame(callback) { frame = callback; },
    EventTarget, Element,
    location: { origin },
    performance: { getEntriesByType: () => [{ name: `${origin}/assets/runtime-test.js` }] },
    PointerEvent: class { constructor(type, init) { Object.assign(this, { type }, init); } },
    KeyboardEvent: class {
      constructor(type, init) { Object.assign(this, { type }, init); }
      preventDefault() { this.defaultPrevented = true; }
      stopPropagation() {}
    },
    setInterval: fn => fn,
    clearInterval() {},
    console: { info() {} },
    WebAssembly: { Instance, instantiate: async () => new Instance() },
    document: {
      createElement: tag => {
        if (tag === 'form') return form;
        if (tag !== 'div') return { style: {} };
        const div = { style: {}, append(...children) { this.children = children; } };
        divs.push(div);
        return div;
      },
      documentElement: { append() {} },
      querySelector: selector => selector === 'canvas' ? canvas : null,
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const emit = (type, event) => Promise.all(listeners.get(type).map(listener => listener(event)));
  context.dispatchEvent = event => { event.target = context; context.keyDispatch = emit(event.type, event); };
  const raw = (await context.WebAssembly.instantiate()).exports;
  raw.rawrigidbodyset_rbSetLinvel(1, 1, vector(0, 0, 0), true);

  class Vector {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
    clone() { return new Vector(this.x, this.y, this.z); }
    project() { return this; }
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
  runtime.ballPos = new Vector();
  runtime.aim = { active: false, pull: new Vector(), power: 0 };
  game.allowed = true;
  const events = [];
  canvas.dispatchEvent = event => {
    events.push(event);
    emit(event.type, event);
    if (event.type === 'pointerdown' && game.allowed && game.state.phase === 'aiming') {
      assert.equal(event.isPrimary, true);
      assert.equal(event.button, 0);
      assert.equal(event.clientX, 50);
      assert.equal(event.clientY, 50);
      canvas.setPointerCapture(event.pointerId);
      game.state.phase = 'charging';
    } else if (event.type === 'pointerup' && game.state.phase === 'charging' && runtime.aim.active) {
      const pull = runtime.aim.pull;
      const length = Math.hypot(pull.x, pull.z);
      const shot = { dir: [-pull.x / length, -pull.z / length], power: runtime.aim.power };
      game.state.shots.push(shot);
      game.state.strokes++;
      game.state.pendingShot = shot;
      game.state.phase = 'rolling';
      canvas.releasePointerCapture(event.pointerId);
    } else if (event.type === 'pointercancel') {
      if (game.state.phase === 'charging') game.state.phase = 'aiming';
      runtime.aim.active = false;
    }
  };
  const state = { camera: { position: new Vector() }, gl: { domElement: canvas } };
  const observe = new Event('observe');
  observe.detail = { isScene: true, traverse() {}, __r3f: { root: { getState: () => state } } };
  context.__THREE_DEVTOOLS__.dispatchEvent(observe);
  const start = () => {
    emit('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 });
    canvas.setPointerCapture(1);
  };
  const move = x => emit('pointermove', { pointerId: 1, clientX: x, clientY: 50 });
  const end = type => emit(type, { pointerId: 1 });
  const shoot = (x, z, h = 1) => {
    game.state.strokes++;
    raw.rawrigidbodyset_rbApplyImpulse(1, h, vector(x, 0, z), true);
  };
  start();
  move(50);
  end('pointercancel');
  const submit = (angle, power) => {
    form.elements.angle.value = String(angle);
    form.elements.power.value = String(power);
    return form.submit({ preventDefault() {} });
  };
  const applyPending = () => {
    const shot = game.state.pendingShot;
    game.state.pendingShot = null;
    raw.rawrigidbodyset_rbApplyImpulse(1, 1,
      vector(shot.dir[0] * shot.power * 10 * physics.mass, 0, shot.dir[1] * shot.power * 10 * physics.mass), true);
    game.state.phase = 'aiming';
  };
  await frame();
  return { panel: divs[0], hud: divs[1], details: divs[2], emit, canvas, start, move, end, shoot, submit, applyPending, physics, events, message, form, context, state, frame: () => frame() };
}

test('editable aim stays between the last shot and stable-width position and camera rows', async () => {
  const { panel, hud, details, form, emit, canvas, start, move, end, shoot, state, frame, physics } = await load();
  assert.deepEqual(panel.children, [hud, form, details]);
  const assertShot = expected => {
    assert.equal(hud.textContent.length, 44);
    assert.equal(form.style.gridTemplateColumns, '10ch 34ch');
    assert.ok(details.textContent.split('\n').filter(Boolean).every(row => row.length === 44));
    assert.equal(hud.textContent.replace(/ +/g, ' '), expected.replace(/ +/g, ' '));
  };
  assertShot('shot 0: —');
  shoot(5, 0);
  start();
  move(100);
  assertShot('shot 1: 0.00° · 50.00%');
  assert.equal(form.elements.angle.value, '180.00');
  assert.equal(form.elements.power.value, '100.00');
  end('pointercancel');
  assertShot('shot 1: 0.00° · 50.00%');
  assert.equal(form.elements.angle.value, '180.00');
  shoot(0, -8);
  await emit('keydown', { key: 'z', target: canvas });
  assertShot('undo 2: 90.00° · 80.00%');
  assert.equal(form.elements.angle.value, '090.00');
  start();
  move(100);
  end('pointerup');
  shoot(5, 0);
  assertShot('shot 3: 0.00° · 50.00%');

  for (let i = 3; i < 10; i++) shoot(5, 0);
  const radians = 12.346 * Math.PI / 180;
  shoot(Math.cos(radians) * 3.4567, -Math.sin(radians) * 3.4567);
  assertShot('shot 11: 12.35° · 34.57%');
  state.camera.getWorldDirection = () => ({ x: 0, y: -1, z: -1 });
  for (const [distance, zoom] of [[4.4, '1.00×'], [2, '2.20×'], [12, '0.37×'], [0, '—']]) {
    state.camera.getWorldPosition = () => ({ x: 0, y: distance, z: 0 });
    frame();
    assert.equal(details.textContent.replace(/ +/g, ' '),
      `pos: 0.00x 0.00y 0.00z\ncamera: 90.0° · tilt 45.0° · zoom: ${zoom}`);
    assert.equal(form.elements.angle.value, '012.35', 'camera updates do not overwrite inputs');
  }
  let columns;
  for (const value of [1, 12, 123, -1, -12, -123]) {
    physics.position = [value, value, value];
    const heading = Math.abs(value) * Math.PI / 180;
    state.camera.getWorldDirection = () => ({ x: Math.cos(heading), y: Math.sign(value), z: -Math.sin(heading) });
    state.camera.getWorldPosition = () => ({ x: value, y: value + 4.4, z: value });
    frame();
    const rows = details.textContent.split('\n');
    assert.ok(rows.every(row => row.length === 44));
    const current = rows.map(row => Array.from(row.matchAll(/\./g), match => match.index));
    columns ??= current;
    assert.deepEqual(current, columns);
  }
  for (let i = 11; i < 100; i++) shoot(5, 0);
  assertShot('shot 100: 0.00° · 50.00%');
  await emit('keydown', { key: 'z', target: canvas });
  assertShot('undo 100: 0.00° · 50.00%');
  shoot(5, 0);
  assertShot('shot 101: 0.00° · 50.00%');
});

test('manual shots and drags fill the numeric controls while undo preserves edits', async () => {
  const { shoot, form, physics, start, move, end, emit, canvas } = await load();
  physics.mass = 2;
  form.elements.angle.setCustomValidity('Invalid angle');
  form.elements.power.setCustomValidity('Invalid power');
  for (const [angle, power] of [[90, 80], [123.456, 37.254], [359.999, 100]]) {
    const radians = angle * Math.PI / 180, impulse = power / 100 * 10 * physics.mass;
    shoot(Math.cos(radians) * impulse, -Math.sin(radians) * impulse);
    assert.equal(form.elements.angle.value, angle.toFixed(2).padStart(6, '0'));
    assert.equal(form.elements.power.value, power.toFixed(2).padStart(6, '0'));
    assert.equal(form.checkValidity(), true);
  }
  start();
  move(100);
  end('pointercancel');
  assert.equal(form.elements.angle.value, '180.00');
  assert.equal(form.elements.power.value, '100.00');
  form.elements.angle.value = '20';
  form.elements.power.value = '5';
  await emit('keydown', { key: 'z', target: canvas });
  shoot(0, -8, 2);
  assert.equal(Number(form.elements.angle.value), 20);
  assert.equal(Number(form.elements.power.value), 5);
});

test('numeric submit uses the game shot path once, preserves decimals and remains undoable', async () => {
  const { submit, applyPending, physics, events, message, hud, emit, canvas, form } = await load();
  physics.mass = 2;
  physics.speed = 0.3;
  for (const [angle, power] of [[0, 50], [90, 100], [180, 25], [270, 75], [360, 0.1], [123.45, 37.25]]) {
    const before = game.state.strokes;
    await Promise.all([submit(angle, power), submit(angle, power)]);
    assert.equal(message.textContent, '');
    assert.equal(game.state.strokes, before + 1);
    assert.equal(game.state.shots.length, before + 1);
    assert.deepEqual(events.slice(-3).map(event => event.type), ['pointerdown', 'pointerup', 'pointercancel']);
    const shot = game.state.pendingShot, radians = angle * Math.PI / 180;
    assert.ok(Math.abs(shot.dir[0] - Math.cos(radians)) < 1e-12);
    assert.ok(Math.abs(shot.dir[1] + Math.sin(radians)) < 1e-12);
    assert.equal(shot.power, power / 100);
    applyPending();
    assert.equal(Number(form.elements.angle.value), angle);
    assert.equal(Number(form.elements.power.value), power);
    const impulse = physics.impulses.at(-1);
    assert.ok(Math.abs(impulse.value[0] - shot.dir[0] * power / 100 * 20) < 1e-6);
    assert.ok(Math.abs(impulse.value[2] - shot.dir[1] * power / 100 * 20) < 1e-6);
    assert.ok(hud.textContent.startsWith(`shot ${before + 1}:`));
  }
  await emit('keydown', { key: 'z', target: canvas });
  assert.ok(hud.textContent.startsWith('undo 6:'));
  await submit(45, 20);
  applyPending();
  assert.equal(game.state.strokes, 7);
  assert.ok(hud.textContent.startsWith(`shot ${game.state.strokes}:`));
});

test('numeric editing previews the native aim without firing or taking over mouse aiming', async () => {
  const { form, context, emit, submit, events, physics } = await load();
  const { angle, power } = form.elements;
  context.document.activeElement = angle;
  angle.value = '90';
  power.value = '40';
  await form.focusin();
  assert.equal(runtime.aim.active, true);
  assert.equal(runtime.aim.power, 0.4);
  assert.ok(Math.abs(runtime.aim.pull.x) < 1e-12);
  assert.equal(runtime.aim.pull.z, 1);
  power.value = '65';
  await form.input();
  assert.equal(runtime.aim.power, 0.65);
  angle.value = '90.00';
  angle.setSelectionRange(3, 4);
  await form.keydown({ key: 'ArrowDown', target: angle, preventDefault() {}, stopPropagation() {} });
  assert.equal(Number(angle.value), 89.9);
  assert.ok(Math.abs(runtime.aim.pull.x + Math.cos(89.9 * Math.PI / 180)) < 1e-12);
  assert.equal(game.state.phase, 'aiming');
  assert.equal(game.state.strokes, 0);
  assert.equal(events.length, 0);
  assert.equal(physics.impulses.length, 0);
  form.focusout?.({ relatedTarget: power });
  assert.equal(runtime.aim.active, true);
  power.value = 'NaN';
  await form.input();
  assert.equal(runtime.aim.active, false);
  power.value = '50';
  await form.input();
  form.focusout?.({ relatedTarget: null });
  assert.equal(runtime.aim.active, true);
  const pending = form.input();
  emit('pointerdown', { target: { tagName: 'BUTTON' }, pointerId: 1 });
  await pending;
  assert.equal(runtime.aim.active, false, 'a late import must not restore a cancelled preview');
  game.state.phase = 'charging';
  runtime.aim.active = true;
  runtime.aim.power = 0.8;
  await form.input();
  assert.equal(runtime.aim.power, 0.8, 'mouse aiming owns its own preview');
  game.state.phase = 'aiming';
  await form.focusin();
  await submit(180, 60);
  assert.equal(runtime.aim.active, false);
  assert.equal(game.state.strokes, 1);
  assert.equal(game.state.pendingShot.power, 0.6);
  assert.equal(game.state.pendingShot.dir[0], -1);
});

test('numeric preview survives camera drags and camera shortcuts but stops when grabbing the ball', async () => {
  const { form, context, emit, canvas, start, end } = await load();
  const { angle, power } = form.elements;
  context.document.activeElement = angle;
  angle.value = '168.88';
  power.value = '42.25';
  await form.focusin();
  await emit('pointerdown', { target: canvas, pointerId: 7, clientX: 90, clientY: 90 });
  assert.equal(runtime.aim.active, true);
  context.document.activeElement = canvas;
  form.focusout?.({ relatedTarget: canvas });
  await emit('focusin', { target: canvas });
  assert.equal(runtime.aim.active, true);
  await form.change({ target: power });
  await emit('pointermove', { pointerId: 7, clientX: 95, clientY: 95 });
  await emit('pointerup', { pointerId: 7 });
  assert.equal(runtime.aim.active, true);
  assert.equal(runtime.aim.power, 0.4225);
  assert.equal(game.state.phase, 'aiming');
  assert.equal(game.state.strokes, 0);
  context.document.activeElement = angle;
  form.keydown({ key: 't', target: angle, preventDefault() {}, stopPropagation() {} });
  await context.keyDispatch;
  assert.equal(runtime.aim.active, true);
  const pending = form.input();
  start();
  assert.equal(runtime.aim.active, false, 'grabbing the ball must not reuse the numeric preview as a shot');
  await pending;
  assert.equal(runtime.aim.active, false, 'a late import must not restore the preview during a manual shot');
  end('pointercancel');
  assert.equal(game.state.pendingShot, null);
});

test('committed input edits show two decimals without changing incomplete values', async () => {
  const { form } = await load();
  for (const input of Object.values(form.elements)) {
    for (const [value, expected] of [['12.3', '012.30'], ['5', '005.00'], ['12.34', '012.34'], ['', '']]) {
      input.value = value;
      await form.change({ target: input });
      assert.equal(input.value, expected);
    }
  }
});

test('unfocused arrow keys adjust angle and power in whole units and preview without stealing focus', async () => {
  const { form, context, emit, canvas } = await load();
  const { angle, power } = form.elements;
  context.document.activeElement = canvas;
  const press = async (key, extra = {}) => {
    const event = {
      key, target: canvas, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      ...extra,
    };
    await emit('keydown', event);
    return event;
  };
  angle.value = '12.34';
  power.value = '37.25';
  assert.equal((await press('ArrowRight')).prevented, true);
  assert.equal(angle.value, '013.34');
  assert.equal((await press('ArrowUp')).stopped, true);
  assert.equal(power.value, '038.25');
  assert.equal(runtime.aim.active, true);
  assert.equal(runtime.aim.power, 0.3825);
  assert.equal(context.document.activeElement, canvas);
  await press('z');
  assert.equal(runtime.aim.active, false);
  await press('ArrowLeft');
  await press('ArrowDown', { repeat: true });
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { defaultPrevented: true }]) {
    assert.equal((await press('ArrowRight', extra)).prevented, false);
    assert.equal((await press('ArrowUp', extra)).prevented, false);
  }
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { isContentEditable: true }]) {
    assert.equal((await press('ArrowRight', { target })).prevented, false);
    assert.equal((await press('ArrowUp', { target })).prevented, false);
  }
  assert.equal(angle.value, '012.34');
  assert.equal(power.value, '037.25');
  assert.equal((await press('Tab')).prevented, false);
  angle.value = '360.00';
  power.value = '100.00';
  await press('ArrowRight');
  await press('ArrowUp');
  assert.equal(angle.value, '360.00');
  assert.equal(power.value, '100.00');
  angle.value = '0.00';
  power.value = '0.10';
  await press('ArrowLeft');
  await press('ArrowDown');
  assert.equal(angle.value, '000.00');
  assert.equal(power.value, '000.00');
  assert.equal(runtime.aim.active, false);
  await press('r');
  assert.equal(runtime.aim.active, false);
  power.value = '000.10';
  await press('ArrowRight');
  assert.equal(angle.value, '001.00');
  assert.equal(runtime.aim.active, true);
  await emit('focusin', { target: { tagName: 'INPUT' } });
  assert.equal(runtime.aim.active, false);
  context.document.activeElement = canvas;
  angle.value = '';
  power.value = 'invalid';
  await press('ArrowRight');
  await press('ArrowUp');
  assert.equal(angle.value, '');
  assert.equal(power.value, 'invalid');
});

test('focused arrows select digits and adjust their place, preserving selection across carries and limits', async () => {
  const { form, context } = await load();
  for (const input of Object.values(form.elements)) {
    const other = input === form.elements.angle ? form.elements.power : form.elements.angle;
    other.value = '50.00';
    context.document.activeElement = input;
    const press = async (key, extra = {}) => {
      const event = {
        key, target: input, prevented: false,
        preventDefault() { this.prevented = true; }, stopPropagation() {},
        ...extra,
      };
      await form.keydown(event);
      return event;
    };
    const selected = index => {
      assert.equal(input.selectionStart, index);
      assert.equal(input.selectionEnd, index + 1);
    };
    input.value = '12.34';
    input.setSelectionRange(1, 2);
    await press('ArrowRight');
    selected(4);
    await press('ArrowRight');
    selected(5);
    await press('ArrowUp');
    assert.equal(input.value, '012.35');
    selected(5);
    await press('ArrowLeft');
    await press('ArrowLeft');
    selected(2);
    await press('ArrowUp');
    assert.equal(input.value, '013.35');
    await press('ArrowDown', { repeat: true });
    assert.equal(input.value, '012.35');
    await press('ArrowLeft');
    selected(1);
    await press('ArrowUp');
    assert.equal(input.value, '022.35');
    for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }]) {
      assert.equal((await press('ArrowRight', extra)).prevented, false);
      assert.equal((await press('ArrowUp', extra)).prevented, false);
    }
    assert.equal(input.value, '022.35');
    selected(1);
    input.value = '9.99';
    input.setSelectionRange(3, 4);
    await press('ArrowUp');
    assert.equal(input.value, '010.00');
    selected(5);
    await press('ArrowDown');
    assert.equal(input.value, '009.99');
    selected(5);
    input.value = '9';
    input.setSelectionRange(0, 0);
    await press('ArrowUp');
    assert.equal(input.value, '010.00');
    selected(2);
    input.value = '.50';
    input.setSelectionRange(0, 0);
    await press('ArrowUp');
    assert.equal(input.value, '000.60');
    selected(4);
    const max = input === form.elements.angle ? '360.00' : '100.00';
    const min = '000.00';
    input.value = max;
    input.setSelectionRange(5, 6);
    await press('ArrowUp');
    assert.equal(input.value, max);
    selected(5);
    input.value = '000.10';
    input.setSelectionRange(4, 5);
    await press('ArrowDown');
    assert.equal(input.value, min);
    selected(4);
    for (const initial of ['0', '5']) {
      input.value = initial;
      input.setSelectionRange(0, 1);
      await press('ArrowLeft');
      selected(1);
      await press('ArrowUp');
      assert.equal(input.value, initial === '0' ? '010.00' : '015.00');
      selected(1);
      await press('ArrowLeft');
      selected(0);
      await press('ArrowUp');
      assert.equal(input.value, input === form.elements.power ? '100.00' : initial === '0' ? '110.00' : '115.00');
      selected(0);
    }
    for (const invalid of ['', '1e2', '12.345']) {
      input.value = invalid;
      await press('ArrowUp');
      assert.equal(input.value, invalid);
    }
    assert.equal(other.value, '50.00');
  }
});

test('digit selection wraps between fields in both directions without changing values', async () => {
  const { form, context } = await load();
  const { angle, power } = form.elements;
  angle.value = '168.88';
  power.value = '042.25';
  const press = key => form.keydown({
    key, target: context.document.activeElement, preventDefault() {}, stopPropagation() {},
  });
  const selected = (input, start, end = start + 1) => {
    assert.equal(context.document.activeElement, input);
    assert.equal(input.selectionStart, start);
    assert.equal(input.selectionEnd, end);
  };
  for (const [key, positions] of [
    ['ArrowRight', [[angle, 1], [angle, 2], [angle, 4], [angle, 5], [power, 0], [power, 1], [power, 2], [power, 4], [power, 5], [angle, 0]]],
    ['ArrowLeft', [[power, 5], [power, 4], [power, 2], [power, 1], [power, 0], [angle, 5], [angle, 4], [angle, 2], [angle, 1], [angle, 0]]],
  ]) {
    angle.focus();
    angle.setSelectionRange(0, 1);
    for (const [input, index] of positions) {
      await press(key);
      selected(input, index);
      assert.equal(angle.value, '168.88');
      assert.equal(power.value, '042.25');
    }
  }
  await press('ArrowLeft');
  await press('ArrowUp');
  selected(power, 5);
  assert.equal(power.value, '042.26');
  assert.equal(angle.value, '168.88');
  power.value = '';
  angle.focus();
  angle.setSelectionRange(5, 6);
  await press('ArrowRight');
  selected(power, 0, 0);
  await press('ArrowRight');
  selected(angle, 0);
  await press('ArrowLeft');
  selected(power, 0, 0);
  await press('ArrowLeft');
  selected(angle, 5);
  assert.equal(power.value, '');
});

test('text fields reject malformed numbers and excess precision before previewing or shooting', async () => {
  const { form, submit, events, context } = await load();
  for (const input of Object.values(form.elements)) {
    context.document.activeElement = input;
    for (const invalid of ['', ' ', '.', '1e2', '0x10', 'Infinity', '12x', '168.888']) {
      form.elements.angle.value = '0.00';
      form.elements.power.value = '50.00';
      input.value = invalid;
      await form.input();
      assert.notEqual(input.validationMessage, '');
      assert.equal(runtime.aim.active, false);
      await form.submit({ preventDefault() {} });
    }
  }
  assert.equal(events.length, 0);
  await submit('168.88', '.50');
  assert.equal(form.checkValidity(), true);
  assert.equal(game.state.strokes, 1);
});

test('Enter and Space shoot outside the fields without repeats or interfering with other controls', async () => {
  const { form, context, emit, canvas, applyPending } = await load();
  context.document.activeElement = canvas;
  const press = async (key, extra = {}) => {
    const event = {
      key, target: canvas, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      ...extra,
    };
    await emit('keydown', event);
    await form.submission;
    return event;
  };
  for (const key of ['Enter', ' ']) {
    const before = game.state.strokes;
    for (const extra of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { defaultPrevented: true }]) {
      assert.equal((await press(key, extra)).prevented, !!extra.repeat);
    }
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
      { isContentEditable: true }, { closest: () => ({}) }]) {
      assert.equal((await press(key, { target })).prevented, false);
    }
    assert.equal(game.state.strokes, before);
    form.elements.angle.value = '168.88';
    form.elements.power.value = '42.25';
    const event = await press(key);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    assert.equal(game.state.strokes, before + 1);
    assert.equal(game.state.pendingShot.power, 0.4225);
    assert.ok(Math.abs(game.state.pendingShot.dir[0] - Math.cos(168.88 * Math.PI / 180)) < 1e-12);
    assert.equal(context.document.activeElement, canvas);
    applyPending();
    await press(key, { repeat: true });
    assert.equal(game.state.strokes, before + 1);
  }
  form.elements.power.value = 'invalid';
  await press('Enter');
  await press(' ');
  assert.equal(game.state.strokes, 2);
  assert.equal(game.state.pendingShot, null);
});

test('Enter/Space shoot and R/Z/T/E/W reach shortcuts from numeric fields without repeats or modifiers', async () => {
  const { form, context, hud, applyPending } = await load();
  let restarts = 0;
  const forwarded = [];
  context.addEventListener('keydown', event => {
    forwarded.push({ key: event.key, code: event.code });
    if (event.key === 'r' && event.target?.tagName !== 'INPUT') restarts++;
  });
  const press = (key, target, extra = {}) => {
    const event = {
      key, target, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      ...extra,
    };
    form.keydown(event);
    return event;
  };
  for (const input of Object.values(form.elements)) {
    context.document.activeElement = input;
    const shot = press(input === form.elements.angle ? 'Enter' : ' ', input);
    assert.equal(shot.prevented, true);
    assert.equal(shot.stopped, true);
    await form.submission;
    assert.equal(game.state.shots.length, restarts + 1);
    applyPending();
    const previous = hud.textContent;
    for (const extra of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }]) {
      for (const key of ['Enter', ' ', 'z', 'r', 't', 'e', 'w']) {
        assert.equal(press(key, input, extra).prevented, !!extra.repeat);
      }
    }
    assert.equal(hud.textContent, previous);
    assert.equal(game.state.shots.length, restarts + 1);
    assert.equal(press('z', input).stopped, true);
    await context.keyDispatch;
    assert.ok(hud.textContent.startsWith(`undo ${game.state.strokes}:`));
    assert.equal(press('r', input).stopped, true);
    const value = input.value;
    for (const key of ['t', 'e', 'w']) {
      const event = press(key, input, { code: `Key${key.toUpperCase()}` });
      assert.equal(event.prevented, true);
      assert.equal(event.stopped, true);
      await context.keyDispatch;
      assert.deepEqual(forwarded.at(-1), { key, code: `Key${key.toUpperCase()}` });
    }
    assert.equal(context.__edges.opts.mode, restarts === 1 ? 'wire' : 'crease');
    assert.equal(input.value, value);
    assert.equal(context.document.activeElement, input);
    assert.equal(press('q', input).prevented, false);
  }
  assert.equal(restarts, 2);
  assert.deepEqual(forwarded.map(event => event.key), ['z', 'r', 't', 'e', 'w', 'z', 'r', 't', 'e', 'w']);
});

test('invalid values, repeated Enter and game restrictions do not fire shots', async () => {
  const { submit, message, events, form, context } = await load();
  for (const [angle, power] of [[NaN, 50], [Infinity, 50], [-1, 50], [361, 50], [0, NaN], [0, 0], [0, 101]]) {
    await submit(angle, power);
  }
  assert.equal(events.length, 0);
  let prevented = false;
  form.keydown({ key: 'Enter', repeat: true, preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
  for (const phase of ['rolling', 'charging', 'holed', 'resetting']) {
    game.state.phase = phase;
    await submit(90, 50);
    assert.match(message.textContent, /ready/);
  }
  game.state.phase = 'aiming';
  game.state.teleport = [0, 0, 0];
  await submit(90, 50);
  assert.equal(events.length, 0);
  game.state.teleport = null;
  game.allowed = false;
  await submit(90, 50);
  assert.match(message.textContent, /not ready/);
  assert.equal(game.state.strokes, 0);
  assert.equal(game.state.pendingShot, null);
  game.allowed = true;
  context.performance.getEntriesByType = () => [];
  await submit(90, 50);
  assert.match(message.textContent, /Open a hole/);
  assert.equal(game.state.strokes, 0);
});
