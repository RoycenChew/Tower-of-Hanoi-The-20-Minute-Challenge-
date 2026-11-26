// eventbus.test.js — on/off/emit, and safe unsubscribing during emit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../js/model/EventBus.js';

test('emit calls every listener with the data', () => {
  const bus = new EventBus();
  const got = [];
  bus.on('x', (d) => got.push(['a', d]));
  bus.on('x', (d) => got.push(['b', d]));
  bus.emit('x', 42);
  assert.deepEqual(got, [['a', 42], ['b', 42]]);
});

test('off and the returned unsubscribe function both remove a listener', () => {
  const bus = new EventBus();
  let calls = 0;
  const fn = () => calls++;
  const unsubscribe = bus.on('x', fn);
  unsubscribe();
  bus.emit('x');
  bus.on('x', fn);
  bus.off('x', fn);
  bus.emit('x');
  assert.equal(calls, 0);
});

test('emitting an event nobody listens to does nothing', () => {
  assert.doesNotThrow(() => new EventBus().emit('nobody'));
});

test('a listener that unsubscribes itself during emit does not make others get skipped', () => {
  const bus = new EventBus();
  const got = [];
  const unsubA = bus.on('x', () => { got.push('a'); unsubA(); });
  bus.on('x', () => got.push('b'));
  bus.on('x', () => got.push('c'));
  bus.emit('x');
  assert.deepEqual(got, ['a', 'b', 'c']);
  bus.emit('x');
  assert.deepEqual(got, ['a', 'b', 'c', 'b', 'c'], 'a is gone from the next emit');
});

test('a listener that unsubscribes ANOTHER listener during emit: that one still gets this emit', () => {
  const bus = new EventBus();
  const got = [];
  const b = () => got.push('b');
  bus.on('x', () => { got.push('a'); bus.off('x', b); });
  bus.on('x', b);
  bus.emit('x');
  assert.deepEqual(got, ['a', 'b'], 'emit uses a snapshot of the listeners');
  bus.emit('x');
  assert.deepEqual(got, ['a', 'b', 'a']);
});
