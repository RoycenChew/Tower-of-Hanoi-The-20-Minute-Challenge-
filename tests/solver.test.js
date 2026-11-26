// solver.test.js — the recursive solution, the trace, and hints from any position.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, solveWithTrace, callStackAt } from '../js/model/Solver.js';
import { GameState } from '../js/model/GameState.js';
import { validateMove, describeMove } from '../js/model/Rules.js';

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('solve(3) gives exactly the 7 steps from the assignment', () => {
  assert.deepEqual(solve(3).map(describeMove), [
    'Disk 1 from Peg A to Peg C',
    'Disk 2 from Peg A to Peg B',
    'Disk 1 from Peg C to Peg B',
    'Disk 3 from Peg A to Peg C',
    'Disk 1 from Peg B to Peg A',
    'Disk 2 from Peg B to Peg C',
    'Disk 1 from Peg A to Peg C',
  ]);
});

test('solve(n) has 2ⁿ − 1 moves for n = 1 … 5', () => {
  for (let n = 1; n <= 5; n++) {
    assert.equal(solve(n).length, 2 ** n - 1, `n = ${n}`);
  }
  assert.deepEqual(solve(0), []);
});

test('replaying solve(n) on a GameState is always legal and ends solved', () => {
  for (let n = 1; n <= 5; n++) {
    const gs = new GameState(null, n);
    for (const m of solve(n)) {
      assert.equal(gs.tryMove(m.from, m.to).ok, true, `n = ${n}, ${describeMove(m)}`);
    }
    assert.equal(gs.solved, true);
    assert.equal(gs.moveCount, gs.minMoves());
  }
});

test('solveWithTrace gives the same moves plus one frame per move', () => {
  for (let n = 1; n <= 5; n++) {
    const { moves, frames } = solveWithTrace(n);
    assert.deepEqual(moves, solve(n));
    assert.equal(frames.length, 2 ** n - 1);
    // Every move index 0 … 2ⁿ − 2 belongs to exactly one frame, and that
    // frame's own move is the move of its largest disk.
    const indexes = frames.map((f) => f.moveIndex).sort((a, b) => a - b);
    assert.deepEqual(indexes, moves.map((_, i) => i));
    for (const f of frames) {
      assert.deepEqual(moves[f.moveIndex], { disk: f.n, from: f.from, to: f.to });
    }
  }
});

test('trace for n = 3: root hanoi(3, A→C) with children hanoi(2, A→B) and hanoi(2, B→C)', () => {
  const { frames } = solveWithTrace(3);
  const root = frames[0];
  assert.deepEqual(
    { n: root.n, from: root.from, to: root.to, via: root.via, parentId: root.parentId, depth: root.depth },
    { n: 3, from: 0, to: 2, via: 1, parentId: null, depth: 0 },
  );
  const children = frames.filter((f) => f.parentId === root.id);
  assert.deepEqual(children.map((f) => [f.n, f.from, f.to]), [[2, 0, 1], [2, 1, 2]]);
  assert.equal(frames.filter((f) => f.n === 1).length, 4);
});

test('call stack at step 3 is hanoi(3, A→C) → hanoi(2, A→B) → hanoi(1, C→B)', () => {
  const { frames } = solveWithTrace(3);
  const stack = callStackAt(frames, 2); // step 3 = move index 2
  assert.deepEqual(stack.map((f) => [f.n, f.from, f.to]), [[3, 0, 2], [2, 0, 1], [1, 2, 1]]);
  assert.deepEqual(callStackAt(frames, 99), []);
});

test('following hints from the start reproduces solve(n)', () => {
  for (let n = 1; n <= 5; n++) {
    const gs = new GameState(null, n);
    const followed = [];
    for (let hint = gs.hint(); hint; hint = gs.hint()) {
      followed.push(hint);
      gs.tryMove(hint.from, hint.to);
    }
    assert.deepEqual(followed, solve(n), `n = ${n}`);
    assert.equal(gs.solved, true);
  }
});

test('from 50 random legal positions, following hints always finishes legally', () => {
  const random = mulberry32(2026);
  for (let trial = 0; trial < 50; trial++) {
    const n = 3 + Math.floor(random() * 3); // 3, 4 or 5 disks
    const gs = new GameState(null, n);

    // Walk to a random legal position using only legal moves.
    const walk = Math.floor(random() * 80);
    for (let i = 0; i < walk && !gs.solved; i++) {
      const legal = [];
      for (let from = 0; from < 3; from++) {
        for (let to = 0; to < 3; to++) {
          if (validateMove(gs.pegs, from, to).ok) legal.push([from, to]);
        }
      }
      const [from, to] = legal[Math.floor(random() * legal.length)];
      gs.tryMove(from, to);
    }
    if (gs.solved) continue; // landed on the goal by chance; nothing to hint

    // Now follow hints only.
    let steps = 0;
    for (let hint = gs.hint(); hint; hint = gs.hint()) {
      const result = gs.tryMove(hint.from, hint.to);
      assert.equal(result.ok, true, `trial ${trial}: hint ${describeMove(hint)} was illegal`);
      steps++;
      assert.ok(steps <= 2 ** n - 1, `trial ${trial}: hints took too many steps`);
    }
    assert.equal(gs.solved, true, `trial ${trial}: not solved`);
  }
});
