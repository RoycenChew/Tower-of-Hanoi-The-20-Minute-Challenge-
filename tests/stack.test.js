// stack.test.js — the Stack must behave as LIFO and guard its edges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stack } from '../js/model/Stack.js';

test('items come out in reverse order (Last In, First Out)', () => {
  const s = new Stack();
  s.push(3);
  s.push(2);
  s.push(1);
  assert.equal(s.pop(), 1);
  assert.equal(s.pop(), 2);
  assert.equal(s.pop(), 3);
});

test('pop on an empty stack throws "Stack underflow"', () => {
  const s = new Stack();
  assert.throws(() => s.pop(), { message: 'Stack underflow' });
});

test('peek returns the top without removing it, and null when empty', () => {
  const s = new Stack();
  assert.equal(s.peek(), null);
  s.push(5);
  s.push(4);
  assert.equal(s.peek(), 4);
  assert.equal(s.size(), 2, 'peek must not remove anything');
});

test('size and isEmpty track pushes and pops', () => {
  const s = new Stack();
  assert.equal(s.isEmpty(), true);
  assert.equal(s.size(), 0);
  s.push(1);
  s.push(2);
  assert.equal(s.isEmpty(), false);
  assert.equal(s.size(), 2);
  s.pop();
  s.pop();
  assert.equal(s.isEmpty(), true);
  assert.equal(s.size(), 0);
});

test('toArray returns a bottom -> top copy that cannot change the stack', () => {
  const s = new Stack();
  s.push(3);
  s.push(2);
  const copy = s.toArray();
  assert.deepEqual(copy, [3, 2]);
  copy.push(99);
  copy.length = 0;
  assert.deepEqual(s.toArray(), [3, 2]);
  assert.equal(s.size(), 2);
});

test('the items array is private', () => {
  const s = new Stack();
  s.push(1);
  assert.deepEqual(Object.keys(s), []);
  assert.equal(s.items, undefined);
});
