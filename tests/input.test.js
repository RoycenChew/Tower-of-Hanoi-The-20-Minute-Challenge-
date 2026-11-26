// input.test.js — which key presses are shortcuts, and when they are ignored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortcutFor } from '../js/controller/Input.js';

const key = (k, extra = {}) => ({ key: k, target: { tagName: 'BODY' }, ...extra });

test('A/B/C and 1/2/3 select or drop on a peg', () => {
  assert.deepEqual(shortcutFor(key('a')), { action: 'peg', peg: 0 });
  assert.deepEqual(shortcutFor(key('B')), { action: 'peg', peg: 1 });
  assert.deepEqual(shortcutFor(key('c')), { action: 'peg', peg: 2 });
  assert.deepEqual(shortcutFor(key('1')), { action: 'peg', peg: 0 });
  assert.deepEqual(shortcutFor(key('2')), { action: 'peg', peg: 1 });
  assert.deepEqual(shortcutFor(key('3')), { action: 'peg', peg: 2 });
});

test('Esc, U, Ctrl+Z, H and R', () => {
  assert.deepEqual(shortcutFor(key('Escape')), { action: 'deselect' });
  assert.deepEqual(shortcutFor(key('u')), { action: 'undo' });
  assert.deepEqual(shortcutFor(key('z', { ctrlKey: true })), { action: 'undo' });
  assert.deepEqual(shortcutFor(key('h')), { action: 'hint' });
  assert.deepEqual(shortcutFor(key('r')), { action: 'restart' });
});

test('other keys and browser shortcuts are left alone', () => {
  assert.equal(shortcutFor(key('x')), null);
  assert.equal(shortcutFor(key('z')), null, 'plain Z is not undo');
  assert.equal(shortcutFor(key('r', { ctrlKey: true })), null, 'Ctrl+R still reloads');
  assert.equal(shortcutFor(key('a', { altKey: true })), null);
  assert.equal(shortcutFor(key('a', { metaKey: true })), null);
  assert.equal(shortcutFor(key('a', { repeat: true })), null, 'holding a key down does not repeat');
});

test('ignored while typing in the nickname box (or any text field)', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(shortcutFor(key('a', { target: { tagName } })), null, tagName);
  }
  assert.equal(shortcutFor(key('h', { target: { tagName: 'DIV', isContentEditable: true } })), null);
});

test('in Learning Mode: Space = play/pause, Left/Right = previous/next; game keys are off', () => {
  const learning = { learning: true };
  assert.deepEqual(shortcutFor(key(' '), learning), { action: 'learn-toggle' });
  assert.deepEqual(shortcutFor(key('ArrowLeft'), learning), { action: 'learn-prev' });
  assert.deepEqual(shortcutFor(key('ArrowRight'), learning), { action: 'learn-next' });
  assert.deepEqual(shortcutFor(key('ArrowRight', { repeat: true }), learning), { action: 'learn-next' }, 'holding the arrow steps on');
  for (const k of ['a', '1', 'h', 'r', 'u', 'Escape']) assert.equal(shortcutFor(key(k), learning), null, k);
  assert.equal(shortcutFor(key('z', { ctrlKey: true }), learning), null);
  assert.equal(shortcutFor(key(' ')), null, 'Space does nothing in the game itself');
});

test('ignored while a dialog is open or the welcome card is showing', () => {
  assert.equal(shortcutFor(key('a'), { dialogOpen: true }), null);
  assert.equal(shortcutFor(key('z', { ctrlKey: true }), { dialogOpen: true }), null);
  assert.equal(shortcutFor(key('a'), { welcomeVisible: true }), null);
});
