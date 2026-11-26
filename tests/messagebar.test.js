// messagebar.test.js — timer warnings get their full 4 seconds, even when an
// error interrupts them (fake clock, no real waiting).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageBar, DEFAULT_PROMPT } from '../js/view/MessageBar.js';

/** A fake clock with setTimeout; advance(ms) runs timeouts that come due, in order. */
function setup() {
  let time = 0;
  let nextId = 1;
  let timers = [];
  const shown = []; // [time, text, type]

  const bar = new MessageBar((text, type) => shown.push([time, text, type]), {
    now: () => time,
    setTimeout: (fn, ms) => { const id = nextId++; timers.push({ id, at: time + ms, fn }); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
  });

  function advance(ms) {
    const end = time + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      time = due.at;
      due.fn();
    }
    time = end;
  }

  const current = () => shown.at(-1);
  return { bar, shown, advance, current };
}

test('a normal message shows at once', () => {
  const { bar, current } = setup();
  bar.show('Disk 1 selected.', 'info');
  assert.deepEqual(current(), [0, 'Disk 1 selected.', 'info']);
  bar.clear();
  assert.deepEqual(current(), [0, DEFAULT_PROMPT, 'info']);
});

test('a banner shows for 4 s, then the bar returns to the latest normal message', () => {
  const { bar, advance, current } = setup();
  bar.show('Disk 1 selected.', 'info');
  bar.showBanner('5 minutes remaining!', 'warning');
  assert.deepEqual(current(), [0, '5 minutes remaining!', 'warning']);
  advance(3999);
  assert.equal(current()[1], '5 minutes remaining!');
  advance(1);
  assert.deepEqual(current(), [4000, 'Disk 1 selected.', 'info']);
});

test('an error during a banner shows at once; the banner returns 2 s later for its remaining time', () => {
  const { bar, advance, shown } = setup();
  bar.showBanner('5 minutes remaining!', 'warning');  // t = 0
  advance(1000);
  bar.show('Disk 3 cannot go on top of smaller Disk 1.', 'error'); // t = 1000: banner had 1 s
  advance(10_000);

  assert.deepEqual(shown, [
    [0, '5 minutes remaining!', 'warning'],
    [1000, 'Disk 3 cannot go on top of smaller Disk 1.', 'error'],
    [3000, '5 minutes remaining!', 'warning'], // back after 2 s...
    [6000, 'Disk 3 cannot go on top of smaller Disk 1.', 'error'], // ...for the 3 s it had left
  ]);
});

test('several interruptions: the banner waits for 2 s after the LAST one, still 4 s in total', () => {
  const { bar, advance, shown } = setup();
  bar.showBanner('Final minute!', 'error');
  advance(500);
  bar.show('Source peg contains no disks.', 'error');
  advance(1500);
  bar.show('Disk 2 selected.', 'info');
  advance(10_000);

  // Visible: 0–500 (0.5 s) + 4000–7500 (3.5 s) = 4 s.
  assert.deepEqual(shown.map(([t, text]) => [t, text]), [
    [0, 'Final minute!'],
    [500, 'Source peg contains no disks.'],
    [2000, 'Disk 2 selected.'],
    [4000, 'Final minute!'],
    [7500, 'Disk 2 selected.'],
  ]);
});

test('a new banner replaces an old one (warn1 replaces warn5)', () => {
  const { bar, advance, shown } = setup();
  bar.showBanner('5 minutes remaining!', 'warning');
  advance(1000);
  bar.showBanner('Final minute!', 'error');
  advance(10_000);
  assert.deepEqual(shown.map(([t, text]) => [t, text]), [
    [0, '5 minutes remaining!'],
    [1000, 'Final minute!'],
    [5000, DEFAULT_PROMPT],
  ]);
});
