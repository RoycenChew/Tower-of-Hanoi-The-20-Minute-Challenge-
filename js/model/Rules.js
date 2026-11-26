// Rules.js — the rules of the puzzle, as a pure function.
//
// "Pure" means validateMove() only LOOKS at the pegs (with isEmpty and peek);
// it never changes them. So checking a move can never break the game, and the
// same input always gives the same answer — easy to test and to explain.
//
// All player-facing text lives here so the wording is consistent everywhere.

export const PEG_LETTERS = ['A', 'B', 'C'];
export const PEG_NAMES = ['Peg A — Source', 'Peg B — Spare', 'Peg C — Target'];

/** 0 -> "A", 1 -> "B", 2 -> "C" */
export function pegLetter(index) {
  return PEG_LETTERS[index];
}

/** 0 -> "Peg A — Source", ... */
export function pegName(index) {
  return PEG_NAMES[index];
}

/** Messages shown to the player for each rejection code. */
export const MESSAGES = Object.freeze({
  // Checked by validateMove():
  SAME_PEG: 'Choose a different peg as the target.',
  EMPTY_SOURCE: 'Source peg contains no disks.',
  // LARGER_ON_SMALLER uses real disk numbers, see largerOnSmallerMessage().
  // Checked by GameState:
  PUZZLE_SOLVED: 'This puzzle is already solved. Choose Next Level or Play Again.',
  NOTHING_TO_UNDO: 'Nothing to undo.',
  // Checked by the controller (later phases):
  NOT_STARTED: 'Click "Start Challenge" to begin.',
  TIME_UP: "Time's up! Moves are disabled.",
  BUSY: 'Please wait for the current move to finish.',
  TOP_ONLY: 'Only the top disk can be moved.',
});

/** e.g. "Disk 3 cannot go on top of smaller Disk 1." */
export function largerOnSmallerMessage(disk, topDisk) {
  return `Disk ${disk} cannot go on top of smaller Disk ${topDisk}.`;
}

/** {disk: 1, from: 0, to: 2} -> "Disk 1 from Peg A to Peg C" */
export function describeMove({ disk, from, to }) {
  return `Disk ${disk} from Peg ${pegLetter(from)} to Peg ${pegLetter(to)}`;
}

/**
 * Is moving the top disk of pegs[from] onto pegs[to] legal?
 *
 * @param {Stack[]} pegs  the three pegs (index 0, 1, 2 = A, B, C)
 * @returns {{ok: true, disk: number} | {ok: false, code: string, message: string}}
 */
export function validateMove(pegs, from, to) {
  if (!pegs[from] || !pegs[to]) {
    // Not a player mistake — a bug in the calling code.
    throw new RangeError(`Invalid peg index: from=${from}, to=${to}`);
  }

  // Rule: a move needs two different pegs.
  if (from === to) {
    return fail('SAME_PEG', MESSAGES.SAME_PEG);
  }

  // Rule: you cannot take a disk from an empty peg (it would be a stack underflow).
  if (pegs[from].isEmpty()) {
    return fail('EMPTY_SOURCE', MESSAGES.EMPTY_SOURCE);
  }

  // peek() shows us the top disks WITHOUT moving them.
  const disk = pegs[from].peek();
  const topOfTarget = pegs[to].peek(); // null when the target is empty

  // Rule: a larger disk may never sit on a smaller one.
  // (Bigger number = bigger disk.) An empty target accepts any disk.
  if (topOfTarget !== null && disk > topOfTarget) {
    return fail('LARGER_ON_SMALLER', largerOnSmallerMessage(disk, topOfTarget));
  }

  return { ok: true, disk };
}

function fail(code, message) {
  return { ok: false, code, message };
}
