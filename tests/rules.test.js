// rules.test.js — validateMove() accepts legal moves and rejects illegal ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stack } from '../js/model/Stack.js';
import { validateMove, describeMove } from '../js/model/Rules.js';

/** Build three pegs from arrays listed bottom -> top, e.g. [[3, 2, 1], [], []]. */
function makePegs(layout) {
  return layout.map((disks) => {
    const peg = new Stack();
    disks.forEach((d) => peg.push(d));
    return peg;
  });
}

test('SAME_PEG: source and target are the same peg', () => {
  const pegs = makePegs([[3, 2, 1], [], []]);
  assert.deepEqual(validateMove(pegs, 0, 0), {
    ok: false,
    code: 'SAME_PEG',
    message: 'Choose a different peg as the target.',
  });
});

test('EMPTY_SOURCE: the source peg has no disks', () => {
  const pegs = makePegs([[3, 2, 1], [], []]);
  assert.deepEqual(validateMove(pegs, 1, 2), {
    ok: false,
    code: 'EMPTY_SOURCE',
    message: 'Source peg contains no disks.',
  });
});

test('LARGER_ON_SMALLER: message uses the real disk numbers', () => {
  const pegs = makePegs([[3], [1], [2]]);
  assert.deepEqual(validateMove(pegs, 0, 1), {
    ok: false,
    code: 'LARGER_ON_SMALLER',
    message: 'Disk 3 cannot go on top of smaller Disk 1.',
  });
  assert.equal(validateMove(pegs, 2, 1).message, 'Disk 2 cannot go on top of smaller Disk 1.');
});

test('moving onto an empty peg is allowed', () => {
  const pegs = makePegs([[3, 2, 1], [], []]);
  assert.deepEqual(validateMove(pegs, 0, 2), { ok: true, disk: 1 });
});

test('moving onto a larger disk is allowed', () => {
  const pegs = makePegs([[3, 2], [], [1]]);
  // Disk 1 (top of C) onto Disk 2 (top of A)
  assert.deepEqual(validateMove(pegs, 2, 0), { ok: true, disk: 1 });
});

test('validateMove never changes the pegs', () => {
  const pegs = makePegs([[3, 2], [1], []]);
  validateMove(pegs, 0, 1); // invalid
  validateMove(pegs, 1, 2); // valid
  assert.deepEqual(pegs.map((p) => p.toArray()), [[3, 2], [1], []]);
});

test('an out-of-range peg index is a programming error', () => {
  const pegs = makePegs([[1], [], []]);
  assert.throws(() => validateMove(pegs, 0, 3), RangeError);
});

test('describeMove uses the exact log wording', () => {
  assert.equal(describeMove({ disk: 1, from: 0, to: 2 }), 'Disk 1 from Peg A to Peg C');
});
