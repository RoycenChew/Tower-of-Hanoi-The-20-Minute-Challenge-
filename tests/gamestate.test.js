// gamestate.test.js — moves, invalid moves, undo, solving, hints and invariants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../js/model/GameState.js';
import { EventBus } from '../js/model/EventBus.js';
import { solve } from '../js/model/Solver.js';

/** Small seeded random generator, so "random" tests repeat exactly. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Record every event emitted on a bus. */
function recordEvents(bus, names) {
  const seen = [];
  for (const name of names) bus.on(name, (data) => seen.push({ name, data }));
  return seen;
}

const pegsOf = (gs) => gs.snapshot().pegs;

test('reset(3) puts disks 3, 2, 1 on Peg A and clears everything', () => {
  const gs = new GameState(null, 3);
  assert.deepEqual(pegsOf(gs), [[3, 2, 1], [], []]);
  assert.equal(gs.moveCount, 0);
  assert.equal(gs.hintsUsed, 0);
  assert.equal(gs.solved, false);
  assert.deepEqual(gs.log, []);
  assert.equal(gs.minMoves(), 7);
});

test('reset(4) puts 4 disks on Peg A; minimum becomes 15', () => {
  const gs = new GameState(null, 3);
  gs.tryMove(0, 2);
  gs.reset(4);
  assert.deepEqual(pegsOf(gs), [[4, 3, 2, 1], [], []]);
  assert.equal(gs.moveCount, 0);
  assert.equal(gs.minMoves(), 15);
  assert.equal(new GameState(null, 5).minMoves(), 31);
});

test('a valid move updates the pegs, counter and log', () => {
  const gs = new GameState(null, 3);
  const result = gs.tryMove(0, 2);
  assert.equal(result.ok, true);
  assert.deepEqual(result.move, { disk: 1, from: 0, to: 2 });
  assert.deepEqual(pegsOf(gs), [[3, 2], [], [1]]);
  assert.equal(gs.moveCount, 1);
  assert.deepEqual(gs.log.at(-1), { type: 'move', text: 'Move 1: Disk 1 from Peg A to Peg C' });
});

test('TC-02: an invalid move changes nothing except an "Invalid" log entry', () => {
  const bus = new EventBus();
  const events = recordEvents(bus, ['move:invalid', 'state:changed']);
  const gs = new GameState(bus, 3);
  gs.tryMove(0, 2); // Disk 1 -> C
  gs.tryMove(0, 1); // Disk 2 -> B
  events.length = 0;
  const before = pegsOf(gs);

  const result = gs.tryMove(1, 2); // Disk 2 onto Disk 1: illegal
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LARGER_ON_SMALLER');
  assert.equal(gs.moveCount, 2, 'counter must not change');
  assert.deepEqual(pegsOf(gs), before, 'pegs must not change');
  assert.deepEqual(gs.log.at(-1), {
    type: 'invalid',
    text: 'Invalid: Disk 2 cannot go on top of smaller Disk 1.',
  });
  assert.deepEqual(events, [{
    name: 'move:invalid',
    data: { code: 'LARGER_ON_SMALLER', message: 'Disk 2 cannot go on top of smaller Disk 1.', from: 1, to: 2 },
  }]);
});

test('TC-01: moving from an empty peg is blocked, counter unchanged', () => {
  const gs = new GameState(null, 3);
  const result = gs.tryMove(1, 2);
  assert.equal(result.code, 'EMPTY_SOURCE');
  assert.equal(result.message, 'Source peg contains no disks.');
  assert.equal(gs.moveCount, 0);
});

test('undo restores the pegs and the counter', () => {
  const gs = new GameState(null, 3);
  gs.tryMove(0, 2);
  const result = gs.undo();
  assert.equal(result.ok, true);
  assert.deepEqual(pegsOf(gs), [[3, 2, 1], [], []]);
  assert.equal(gs.moveCount, 0);
  assert.deepEqual(gs.log.at(-1), { type: 'undo', text: 'Undo: Disk 1 from Peg C back to Peg A' });
});

test('TC-04: after 5 moves + undo, the board equals the board after move 4', () => {
  const gs = new GameState(null, 3);
  const moves = solve(3);
  for (let i = 0; i < 4; i++) gs.tryMove(moves[i].from, moves[i].to);
  const afterFour = pegsOf(gs);

  gs.tryMove(moves[4].from, moves[4].to);
  assert.equal(gs.moveCount, 5);
  gs.undo();

  assert.deepEqual(pegsOf(gs), afterFour);
  assert.equal(gs.moveCount, 4);
});

test('the next move after an undo reuses the move number', () => {
  const gs = new GameState(null, 3);
  gs.tryMove(0, 2);
  gs.undo();
  gs.tryMove(0, 1);
  assert.equal(gs.log.at(-1).text, 'Move 1: Disk 1 from Peg A to Peg B');
});

test('undo with no history: "Nothing to undo.", not logged', () => {
  const bus = new EventBus();
  const events = recordEvents(bus, ['move:invalid']);
  const gs = new GameState(bus, 3);
  const result = gs.undo();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOTHING_TO_UNDO');
  assert.equal(result.message, 'Nothing to undo.');
  assert.deepEqual(gs.log, []);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.code, 'NOTHING_TO_UNDO');
});

test('solved becomes true after the optimal solution; puzzle:solved fires once', () => {
  const bus = new EventBus();
  const events = recordEvents(bus, ['puzzle:solved']);
  const gs = new GameState(bus, 3);
  for (const m of solve(3)) gs.tryMove(m.from, m.to);
  assert.equal(gs.solved, true);
  assert.deepEqual(pegsOf(gs), [[], [], [3, 2, 1]]);
  assert.equal(gs.moveCount, 7);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, { diskCount: 3, moveCount: 7, minMoves: 7, hintsUsed: 0 });
});

test('once solved, tryMove returns PUZZLE_SOLVED and changes nothing', () => {
  const gs = new GameState(null, 3);
  for (const m of solve(3)) gs.tryMove(m.from, m.to);
  const before = gs.snapshot();

  const result = gs.tryMove(2, 0); // would be a legal move on an unsolved board
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PUZZLE_SOLVED');
  assert.deepEqual(gs.snapshot(), before, 'pegs, counter, log and flags unchanged');
});

test('hint suggests a move, moves nothing, and counts it', () => {
  const gs = new GameState(null, 3);
  const hint = gs.hint();
  assert.deepEqual(hint, { disk: 1, from: 0, to: 2 });
  assert.equal(gs.hintsUsed, 1);
  assert.deepEqual(pegsOf(gs), [[3, 2, 1], [], []]);
  assert.equal(gs.moveCount, 0);
});

test('hint returns null and does NOT count when the puzzle is solved', () => {
  const gs = new GameState(null, 3);
  for (const m of solve(3)) gs.tryMove(m.from, m.to);
  assert.equal(gs.hint(), null);
  assert.equal(gs.hintsUsed, 0);
});

test('snapshot is frozen and separate from the live state', () => {
  const gs = new GameState(null, 3);
  const snap = gs.snapshot();
  assert.ok(Object.isFrozen(snap));
  assert.ok(Object.isFrozen(snap.pegs[0]));
  gs.tryMove(0, 2);
  assert.deepEqual(snap.pegs, [[3, 2, 1], [], []], 'old snapshot does not change');
});

test('diskPeg always matches the real stack contents (random moves and undos)', () => {
  const random = mulberry32(12345);
  const gs = new GameState(null, 5);

  for (let step = 0; step < 3000; step++) {
    if (random() < 0.3) {
      gs.undo();
    } else {
      // Random from/to: some will be invalid, which must also keep things consistent.
      gs.tryMove(Math.floor(random() * 3), Math.floor(random() * 3));
    }

    const pegs = gs.pegs.map((p) => p.toArray()); // toArray only inside the test
    for (let disk = 1; disk <= 5; disk++) {
      const actual = pegs.findIndex((arr) => arr.includes(disk));
      assert.equal(gs.pegOf(disk), actual, `step ${step}: Disk ${disk}`);
    }
    // Every disk exactly once, and every peg ordered largest at the bottom.
    assert.equal(pegs.flat().length, 5);
    for (const arr of pegs) {
      for (let i = 1; i < arr.length; i++) assert.ok(arr[i - 1] > arr[i], `step ${step}: bad order`);
    }
    assert.equal(gs.moveCount, gs.history.size());
  }
});
