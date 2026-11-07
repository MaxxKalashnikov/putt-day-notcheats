const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(`${__dirname}/../putt-day-notcheats.user.js`, 'utf8');

function load() {
  const listeners = [];
  const timers = new Set();
  const messages = [];
  const context = {
    EventTarget,
    Element: class { setPointerCapture() {} },
    WebAssembly: { instantiate() {} },
    console: { info: message => messages.push(message) },
    addEventListener: (type, listener) => {
      if (type === 'keydown') listeners.push(listener);
    },
    setInterval: fn => { timers.add(fn); return fn; },
    clearInterval: fn => timers.delete(fn),
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const press = (key, extra = {}) => {
    const event = {
      key, shiftKey: false, target: { tagName: 'CANVAS' },
      prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      ...extra,
    };
    for (const listener of listeners) listener(event);
    return event;
  };
  return { edges: context.__edges, timers, messages, press };
}

test('unmodified shortcuts control edges using keyboard-layout letters', () => {
  const { edges, timers, messages, press } = load();
  assert.equal(timers.size, 0);
  // A non-QWERTY layout can produce E from a different physical key.
  const event = press('e', { code: 'KeyZ' });
  assert.equal(timers.size, 1);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(edges.opts.mode, 'crease');
  press('W');
  assert.equal(edges.opts.mode, 'wire');
  press('W');
  assert.equal(edges.opts.mode, 'crease');
  press('X');
  assert.equal(messages.at(-1), '[edges] x-ray on');
  press('X');
  assert.equal(messages.at(-1), '[edges] x-ray off');
  press('E');
  assert.equal(timers.size, 0);
});

test('shortcuts ignore typing, repeats, composition and modifiers', () => {
  const { edges, timers, messages, press } = load();
  for (const extra of [
    { shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true },
    { repeat: true }, { isComposing: true },
    { target: { tagName: 'INPUT' } }, { target: { tagName: 'TEXTAREA' } },
    { target: { tagName: 'SELECT' } }, { target: { isContentEditable: true } },
  ]) {
    for (const key of ['W', 'E', 'X']) {
      const event = press(key, extra);
      assert.equal(event.prevented, false);
      assert.equal(event.stopped, false);
    }
  }
  assert.equal(press('Q').prevented, false);
  assert.equal(timers.size, 0);
  assert.equal(edges.opts.mode, 'crease');
  assert.equal(messages.length, 0);
});

test('mode and crease threshold can be selected while disabled', () => {
  const { edges, timers, press } = load();
  press('W');
  edges.setAngle(30);
  assert.equal(edges.opts.mode, 'wire');
  assert.equal(edges.opts.angle, 30);
  assert.equal(timers.size, 0);
  press('E');
  assert.equal(timers.size, 1);
  assert.equal(edges.opts.mode, 'wire');
  assert.equal(edges.opts.angle, 30);
});
