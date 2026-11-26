// preferences.test.js — remembering settings must never break the game,
// even when storage is missing, blocked or full of broken data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Preferences } from '../js/controller/Preferences.js';

/** A fake localStorage backed by a Map. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('saves and loads values between "visits"', () => {
  const storage = fakeStorage();
  const first = new Preferences(storage);
  assert.equal(first.available, true);
  first.set('muted', true);
  first.set('nickname', 'Ming');

  const second = new Preferences(storage); // a new visit, same storage
  assert.equal(second.get('muted'), true);
  assert.equal(second.get('nickname'), 'Ming');
  assert.equal(second.get('projector', false), false, 'missing value -> fallback');
});

test('no storage at all (e.g. blocked): works, remembers nothing, not "available"', () => {
  const prefs = new Preferences(null);
  assert.equal(prefs.available, false);
  assert.equal(prefs.set('muted', true), false);
  assert.equal(prefs.get('muted'), true, 'still remembered for this visit');
});

test('storage that throws on every call never crashes the game', () => {
  const angry = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  let prefs;
  assert.doesNotThrow(() => { prefs = new Preferences(angry); });
  assert.doesNotThrow(() => prefs.set('muted', true));
  assert.equal(prefs.set('muted', true), false, 'reports that saving failed');
  assert.equal(prefs.get('nickname', ''), '');
});

test('broken or unexpected saved data is ignored', () => {
  for (const raw of ['{not json', '[1,2,3]', 'null', '42', '"text"']) {
    const prefs = new Preferences(fakeStorage({ 'hanoi-challenge:v1': raw }));
    assert.equal(prefs.get('muted', false), false, raw);
  }
});

test('in Node there is no localStorage: the default falls back safely', () => {
  const prefs = new Preferences();
  assert.equal(prefs.available, false);
});
