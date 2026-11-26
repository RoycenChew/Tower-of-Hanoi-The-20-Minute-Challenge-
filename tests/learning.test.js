// learning.test.js — the step-by-step walkthrough (fake timers, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../js/model/EventBus.js';
import { LearningMode, AUTOPLAY_MS, subTowerOf } from '../js/controller/LearningMode.js';
import { callLabel } from '../js/view/LearningPanel.js';

/** Fake setTimeout/clearTimeout: runNext() fires the oldest waiting timer. */
function fakeTimers() {
  let nextId = 0;
  const list = [];
  return {
    list,
    setTimeout: (fn, ms) => { list.push({ id: ++nextId, fn, ms, done: false }); return nextId; },
    clearTimeout: (id) => { const t = list.find((x) => x.id === id); if (t) t.done = true; },
    pending: () => list.filter((t) => !t.done),
    runNext() {
      const t = list.find((x) => !x.done);
      if (!t) return null;
      t.done = true;
      t.fn();
      return t.ms;
    },
  };
}

function setup(diskCount = 3) {
  const bus = new EventBus();
  const events = [];
  bus.on('learn:step', (e) => events.push(e));
  const timers = fakeTimers();
  const learning = new LearningMode({ bus, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  learning.open(diskCount);
  return { learning, events, timers, state: () => learning.state() };
}

const PDF_STEPS = [
  'Move Disk 1 from Peg A to Peg C',
  'Move Disk 2 from Peg A to Peg B',
  'Move Disk 1 from Peg C to Peg B',
  'Move Disk 3 from Peg A to Peg C',
  'Move Disk 1 from Peg B to Peg A',
  'Move Disk 2 from Peg B to Peg C',
  'Move Disk 1 from Peg A to Peg C',
];

test('opens at step 0 of 7 with the 7 steps from the assignment', () => {
  const { state } = setup();
  const s = state();
  assert.equal(s.isOpen, true);
  assert.equal(s.index, 0);
  assert.equal(s.total, 7);
  assert.deepEqual(s.steps, PDF_STEPS);
  assert.equal(s.atStart, true, 'Previous is disabled at step 0');
  assert.equal(s.atEnd, false);
  assert.deepEqual(s.snapshot.pegs, [[3, 2, 1], [], []]);
  assert.equal(s.nextMove.disk, 1);
});

test('Next walks through exactly the 7 PDF steps and is disabled at the end', () => {
  const { learning, state } = setup();
  const boards = [];
  for (let i = 0; i < 7; i++) {
    learning.next();
    boards.push(state().snapshot.pegs);
  }
  assert.deepEqual(boards, [
    [[3, 2], [], [1]],
    [[3], [2], [1]],
    [[3], [2, 1], []],
    [[], [2, 1], [3]],
    [[1], [2], [3]],
    [[1], [], [3, 2]],
    [[], [], [3, 2, 1]],
  ]);
  assert.equal(state().index, 7);
  assert.equal(state().atEnd, true, 'Next is disabled at the end');
  learning.next();
  assert.equal(state().index, 7, 'Next at the end does nothing');
});

test('at the FINAL (solved) step, Previous still goes back one step correctly', () => {
  const { learning, state } = setup();
  for (let i = 0; i < 6; i++) learning.next();
  const afterSix = state().snapshot.pegs;
  learning.next(); // step 7: the demo puzzle is now solved
  assert.equal(state().snapshot.solved, true);

  learning.previous();
  assert.equal(state().index, 6);
  assert.deepEqual(state().snapshot.pegs, afterSix);
  assert.equal(state().snapshot.solved, false);
});

test('Previous reverses steps and is disabled at step 0', () => {
  const { learning, state } = setup();
  learning.next();
  learning.next();
  learning.previous();
  assert.equal(state().index, 1);
  assert.deepEqual(state().snapshot.pegs, [[3, 2], [], [1]]);
  learning.previous();
  assert.equal(state().atStart, true);
  learning.previous();
  assert.equal(state().index, 0, 'Previous at step 0 does nothing');
  assert.deepEqual(state().snapshot.pegs, [[3, 2, 1], [], []]);
});

test('Stack panel: the step as pop()/push(), and the stacks bottom -> top', () => {
  const { learning, state } = setup();
  assert.equal(state().stackOps, null);
  learning.next();
  assert.equal(state().stackOps, 'A.pop() → 1; C.push(1)');
  learning.next();
  learning.next();
  assert.equal(state().stackOps, 'C.pop() → 1; B.push(1)');
  assert.deepEqual(state().snapshot.pegs, [[3], [2, 1], []]);
});

test('call stack at step 3 is hanoi(3, A→C) → hanoi(2, A→B) → hanoi(1, C→B)', () => {
  const { learning, state } = setup();
  assert.deepEqual(state().callStack, [], 'empty before the first step');
  for (let i = 0; i < 3; i++) learning.next();
  assert.deepEqual(state().callStack.map(callLabel), ['hanoi(3, A→C)', 'hanoi(2, A→B)', 'hanoi(1, C→B)']);
  assert.equal(state().activeFrameId, state().callStack.at(-1).id);
});

test('call tree for 3 disks has 7 nodes: hanoi(3), two hanoi(2), four hanoi(1)', () => {
  const { state } = setup();
  const labels = state().frames.map(callLabel);
  assert.equal(labels.length, 7);
  assert.equal(labels[0], 'hanoi(3, A→C)');
  assert.deepEqual(state().frames.filter((f) => f.n === 2).map(callLabel), ['hanoi(2, A→B)', 'hanoi(2, B→C)']);
  assert.equal(state().frames.filter((f) => f.n === 1).length, 4);
});

test('sub-tower being moved at each step', () => {
  const { learning, state } = setup();
  const seen = [state().subTower];
  for (let i = 0; i < 7; i++) {
    learning.next();
    seen.push(state().subTower);
  }
  const A = 0; const B = 1; const C = 2;
  assert.deepEqual(seen, [
    null,                           // before step 1
    { n: 2, from: A, to: B },       // step 1: inside "move 2 disks A -> B"
    { n: 2, from: A, to: B },       // step 2
    { n: 2, from: A, to: B },       // step 3
    { n: 3, from: A, to: C },       // step 4: the biggest disk, part of the whole tower
    { n: 2, from: B, to: C },       // steps 5-7: "move 2 disks B -> C"
    { n: 2, from: B, to: C },
    { n: 2, from: B, to: C },
  ]);
  assert.equal(subTowerOf([]), null);
});

test('autoplay: one step every 1.2 s, in order, and it stops at the end', () => {
  const { learning, timers, state } = setup();
  learning.play();
  assert.equal(state().playing, true);
  const delays = [];
  for (let ms = timers.runNext(); ms !== null; ms = timers.runNext()) delays.push(ms);
  assert.deepEqual(delays, Array(7).fill(AUTOPLAY_MS));
  assert.equal(state().index, 7);
  assert.equal(state().playing, false, 'autoplay stopped at the end');
  assert.deepEqual(state().snapshot.pegs, [[], [], [3, 2, 1]]);
});

test('speed changes the autoplay interval (0.5× = 2.4 s, 2× = 0.6 s)', () => {
  const { learning, timers } = setup();
  learning.setSpeed(2);
  learning.play();
  assert.equal(timers.pending()[0].ms, 600);
  learning.setSpeed(0.5); // while playing: re-scheduled at the new speed
  assert.equal(timers.pending().length, 1);
  assert.equal(timers.pending()[0].ms, 2400);
  learning.setSpeed(3); // not a valid speed: ignored
  assert.equal(learning.speed, 0.5);
});

test('Pause stops the demo; Next or Previous during autoplay pauses first', () => {
  const { learning, timers, state } = setup();
  learning.play();
  timers.runNext();
  learning.pause();
  assert.equal(state().playing, false);
  assert.equal(timers.pending().length, 0, 'no step is waiting');
  assert.equal(state().index, 1);

  learning.play();
  learning.next(); // during autoplay
  assert.equal(state().playing, false);
  assert.equal(state().index, 2, 'Next still takes its step');
  assert.equal(timers.pending().length, 0);

  learning.play();
  learning.previous();
  assert.equal(state().playing, false);
  assert.equal(state().index, 1);
});

test('Autoplay at the end starts again from step 0', () => {
  const { learning, state } = setup();
  for (let i = 0; i < 7; i++) learning.next();
  learning.play();
  assert.equal(state().index, 0);
  assert.equal(state().playing, true);
});

test('switching to 4 or 5 disks (or Reset) goes back to step 0 and pauses', () => {
  const { learning, state } = setup();
  learning.next();
  learning.play();
  learning.setDiskCount(4);
  assert.equal(state().diskCount, 4);
  assert.equal(state().total, 15);
  assert.equal(state().index, 0);
  assert.equal(state().playing, false);
  learning.setDiskCount(5);
  assert.equal(state().total, 31);
  learning.setDiskCount(6); // not offered: ignored
  assert.equal(state().diskCount, 5);
  learning.next();
  learning.reset();
  assert.equal(state().index, 0);
  assert.equal(state().diskCount, 5);
});

test('lock() (time is up) stops autoplay and ignores every demo control', () => {
  const { learning, timers, state } = setup();
  learning.play();
  learning.lock();
  assert.equal(state().playing, false);
  assert.equal(state().locked, true);
  assert.equal(timers.pending().length, 0);
  learning.next();
  learning.play();
  learning.setDiskCount(4);
  learning.reset();
  assert.equal(state().index, 0);
  assert.equal(state().diskCount, 3);
  assert.equal(state().playing, false);
});

test('every change is announced with learn:step; moves say which disk to animate', () => {
  const { learning, events } = setup();
  events.length = 0;
  learning.next();
  learning.previous();
  learning.play();
  assert.deepEqual(events.map((e) => e.moved), [{ disk: 1 }, { disk: 1 }, null]);
  learning.close();
  assert.equal(events.at(-1).state.isOpen, false);
});
