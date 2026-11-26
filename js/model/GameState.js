// GameState.js — the state of ONE puzzle: three pegs, the move counter,
// the undo history and the move log.
//
// The model changes instantly and then announces it on the EventBus.
// The screen catches up afterwards (see AnimationQueue in a later phase).

import { Stack } from './Stack.js';
import { validateMove, describeMove, pegLetter, MESSAGES } from './Rules.js';
import { nextHint } from './Solver.js';

export class GameState {
  #bus;

  // diskPeg[d] = the peg (0/1/2) that disk d is on right now.
  // WHY: a hint needs to know where every disk is. Reading the pegs with
  // toArray() would let game logic look inside the stacks, which breaks the
  // LIFO idea. So we keep this small "where is each disk" table next to the
  // stacks and update it on every move and undo. Lookup is O(1).
  #diskPeg = [];

  /**
   * @param {EventBus|null} bus  where to announce changes (null = silent, for tests)
   * @param {number} diskCount   number of disks (the game uses 3, 4 or 5)
   */
  constructor(bus = null, diskCount = 3) {
    this.#bus = bus;
    this.reset(diskCount);
  }

  /** Start a fresh puzzle with n disks, all on Peg A. */
  reset(n) {
    if (!Number.isInteger(n) || n < 1) {
      throw new RangeError(`Disk count must be a positive integer, got ${n}`);
    }
    this.diskCount = n;
    this.pegs = [new Stack(), new Stack(), new Stack()];

    // Push the largest disk first so the smallest (Disk 1) ends up on top.
    this.#diskPeg = new Array(n + 1);
    for (let disk = n; disk >= 1; disk--) {
      this.pegs[0].push(disk);
      this.#diskPeg[disk] = 0;
    }

    this.moveCount = 0;
    // Undo history is ALSO a stack: the last move made is the first one undone.
    this.history = new Stack();
    this.log = [];
    this.hintsUsed = 0;
    this.solved = false;

    this.#emit('state:changed', this.snapshot());
  }

  /**
   * Try to move the top disk of peg `from` onto peg `to`.
   * A valid move changes the pegs, counter, history and log.
   * An invalid move changes NOTHING except adding an "Invalid" log entry.
   */
  tryMove(from, to) {
    // Guard: a solved puzzle is finished; no more moves on it.
    if (this.solved) return this.#reject('PUZZLE_SOLVED', MESSAGES.PUZZLE_SOLVED, from, to);

    const result = validateMove(this.pegs, from, to);
    if (!result.ok) {
      this.log.push({ type: 'invalid', text: `Invalid: ${result.message}` });
      return this.#reject(result.code, result.message, from, to);
    }

    // The move itself: two stack operations.
    const disk = this.#moveTopDisk(from, to);
    const move = { disk, from, to };

    this.moveCount++;
    this.history.push(move);
    this.log.push({ type: 'move', text: `Move ${this.moveCount}: ${describeMove(move)}` });
    this.solved = this.#isSolved();

    this.#emit('state:changed', this.snapshot());
    if (this.solved) {
      this.#emit('puzzle:solved', {
        diskCount: this.diskCount,
        moveCount: this.moveCount,
        minMoves: this.minMoves(),
        hintsUsed: this.hintsUsed,
      });
    }
    return { ok: true, move, solved: this.solved };
  }

  /** Reverse the last valid move. */
  undo() {
    if (this.history.isEmpty()) {
      // Not logged and not an "invalid attempt": the player did not try a move.
      return this.#reject('NOTHING_TO_UNDO', MESSAGES.NOTHING_TO_UNDO);
    }

    // LIFO again: the most recent move comes off the history first.
    // Its disk must be on top of its `to` peg, so we can simply move it back.
    const move = this.history.pop();
    this.#moveTopDisk(move.to, move.from);

    this.moveCount--;
    this.log.push({
      type: 'undo',
      text: `Undo: Disk ${move.disk} from Peg ${pegLetter(move.to)} back to Peg ${pegLetter(move.from)}`,
    });
    this.solved = this.#isSolved();

    this.#emit('state:changed', this.snapshot());
    return { ok: true, move };
  }

  /**
   * Suggest the best next move from the CURRENT position.
   * Moves nothing. Counts as a hint only if there is something to suggest.
   * @returns {{disk, from, to} | null}  null when the puzzle is already solved
   */
  hint() {
    const move = nextHint((disk) => this.#diskPeg[disk], this.diskCount);
    if (move) this.hintsUsed++;
    return move;
  }

  /** Which peg (0/1/2) disk `disk` is on. */
  pegOf(disk) {
    return this.#diskPeg[disk];
  }

  /** Minimum possible moves: 2ⁿ − 1. */
  minMoves() {
    return 2 ** this.diskCount - 1;
  }

  /** A frozen, plain copy of the state for the view to draw. */
  snapshot() {
    return Object.freeze({
      diskCount: this.diskCount,
      pegs: Object.freeze(this.pegs.map((peg) => Object.freeze(peg.toArray()))),
      moveCount: this.moveCount,
      minMoves: this.minMoves(),
      hintsUsed: this.hintsUsed,
      solved: this.solved,
      log: Object.freeze(this.log.map((entry) => Object.freeze({ ...entry }))),
    });
  }

  // ----- private helpers -----

  /** The ONLY place disks move: pop() from one peg, push() onto another. */
  #moveTopDisk(from, to) {
    const disk = this.pegs[from].pop();
    this.pegs[to].push(disk);
    this.#diskPeg[disk] = to;
    return disk;
  }

  /** Solved when every disk is on Peg C. */
  #isSolved() {
    return this.pegs[2].size() === this.diskCount;
  }

  #reject(code, message, from = null, to = null) {
    this.#emit('move:invalid', { code, message, from, to });
    return { ok: false, code, message };
  }

  #emit(event, data) {
    this.#bus?.emit(event, data);
  }
}
