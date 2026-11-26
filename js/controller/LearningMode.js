// LearningMode.js — the step-by-step walkthrough of the optimal solution.
//
// It replays solveWithTrace(n) on its OWN GameState, so the player's game is
// never touched. Each step goes through the real stacks: Next = tryMove()
// (pop + push), Previous = undo(). It never calls Stats and never touches the
// challenge timer: pausing the demo only stops the demo.
//
// No DOM here. After every change it announces the new state with a
// 'learn:step' event; LearningPanel listens and draws it.

import { GameState } from '../model/GameState.js';
import { solveWithTrace, callStackAt } from '../model/Solver.js';
import { describeMove, pegLetter } from '../model/Rules.js';

export const AUTOPLAY_MS = 1200;      // one step every 1.2 s at 1× speed
export const SPEEDS = [0.5, 1, 2];
export const LEARN_DIFFICULTIES = [3, 4, 5];

export class LearningMode {
  #bus;
  #setTimeout;
  #clearTimeout;
  #game = null;    // the demo board (its own stacks)
  #trace = null;   // { moves, frames } from solveWithTrace(n)
  #timerId = null; // autoplay timer

  isOpen = false;
  diskCount = 3;
  /** Number of steps done: 0 … 2ⁿ − 1. */
  index = 0;
  speed = 1;
  playing = false;
  /** Set when the challenge time runs out: the demo stops for good. */
  locked = false;

  constructor({
    bus,
    setTimeout = (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout = (id) => globalThis.clearTimeout(id),
  }) {
    this.#bus = bus;
    this.#setTimeout = setTimeout;
    this.#clearTimeout = clearTimeout;
  }

  /** Total steps: 2ⁿ − 1. */
  get total() {
    return this.#trace.moves.length;
  }

  // ===================== Opening and closing =====================

  open(diskCount = 3) {
    this.isOpen = true;
    this.#load(diskCount);
  }

  close() {
    this.#stopAutoplay();
    this.isOpen = false;
    this.#publish();
  }

  /** Time is up: stop autoplay and refuse every demo control from now on. */
  lock() {
    this.#stopAutoplay();
    this.locked = true;
    if (this.isOpen) this.#publish();
  }

  // ===================== Controls =====================

  /** Apply the next move of the solution. */
  next() {
    if (this.locked || !this.isOpen) return;
    this.#stopAutoplay(); // pressing Next during autoplay pauses first
    this.#step();
  }

  /** Reverse the last move (works at the last step too: undo() has no "solved" rule). */
  previous() {
    if (this.locked || !this.isOpen) return;
    this.#stopAutoplay();
    if (this.index === 0) return;
    const move = this.#trace.moves[this.index - 1];
    this.#game.undo(); // pop from move.to, push back onto move.from
    this.index--;
    this.#publish({ disk: move.disk });
  }

  /** Autoplay: one step every 1.2 s ÷ speed. At the end, starts again from step 0. */
  play() {
    if (this.locked || !this.isOpen || this.playing) return;
    if (this.index >= this.total) this.#load(this.diskCount);
    this.playing = true;
    this.#publish();
    this.#scheduleNext();
  }

  /** Pause the DEMO only. The challenge clock is a different object and keeps running. */
  pause() {
    if (!this.playing) return;
    this.#stopAutoplay();
    this.#publish();
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(speed) {
    if (this.locked || !SPEEDS.includes(speed)) return;
    this.speed = speed;
    if (this.playing) {
      this.#clearTimeout(this.#timerId);
      this.#scheduleNext();
    }
    this.#publish();
  }

  /** Switch the demo to 3, 4 or 5 disks (back to step 0). */
  setDiskCount(diskCount) {
    if (this.locked || !LEARN_DIFFICULTIES.includes(diskCount)) return;
    this.#stopAutoplay();
    this.#load(diskCount);
  }

  /** Back to step 0 with the same number of disks. */
  reset() {
    if (this.locked) return;
    this.#stopAutoplay();
    this.#load(this.diskCount);
  }

  // ===================== What the panel shows =====================

  /** Everything the panel needs to draw the current step (plain data). */
  state() {
    const { moves, frames } = this.#trace;
    const lastIndex = this.index - 1; // the move just made (-1 = none yet)
    const lastMove = moves[lastIndex] ?? null;
    const nextMove = moves[this.index] ?? null;
    const callStack = callStackAt(frames, lastIndex);

    return {
      isOpen: this.isOpen,
      diskCount: this.diskCount,
      index: this.index,
      total: this.total,
      playing: this.playing,
      speed: this.speed,
      locked: this.locked,
      atStart: this.index === 0,
      atEnd: this.index === this.total,
      steps: moves.map((move) => `Move ${describeMove(move)}`),
      frames,
      snapshot: this.#game.snapshot(),
      lastMove,
      nextMove,
      /** e.g. "A.pop() → 1; C.push(1)" */
      stackOps: lastMove
        ? `${pegLetter(lastMove.from)}.pop() → ${lastMove.disk}; ${pegLetter(lastMove.to)}.push(${lastMove.disk})`
        : null,
      callStack,
      activeFrameId: callStack.at(-1)?.id ?? null,
      subTower: subTowerOf(callStack),
    };
  }

  // ===================== private =====================

  #load(diskCount) {
    this.diskCount = diskCount;
    this.#game = new GameState(null, diskCount); // null bus: the demo announces nothing to the game
    this.#trace = solveWithTrace(diskCount);
    this.index = 0;
    this.#publish();
  }

  #step() {
    if (this.index >= this.total) return false;
    const move = this.#trace.moves[this.index];
    this.#game.tryMove(move.from, move.to); // pop from move.from, push onto move.to
    this.index++;
    this.#publish({ disk: move.disk });
    return true;
  }

  #scheduleNext() {
    this.#timerId = this.#setTimeout(() => {
      this.#step();
      if (this.index >= this.total) {
        this.#stopAutoplay(); // autoplay stops at the end
        this.#publish();
      } else {
        this.#scheduleNext();
      }
    }, AUTOPLAY_MS / this.speed);
  }

  #stopAutoplay() {
    this.#clearTimeout(this.#timerId);
    this.#timerId = null;
    this.playing = false;
  }

  /** @param {{disk: number}|null} moved  the disk that just moved (to animate it) */
  #publish(moved = null) {
    this.#bus.emit('learn:step', { state: this.state(), moved });
  }
}

/**
 * The sub-tower being moved right now: the innermost call on the call stack
 * that moves 2 or more disks. (A call with n = 1 moves a single disk, which is
 * not a "tower".) Returns null before the first step.
 */
export function subTowerOf(callStack) {
  const frame = [...callStack].reverse().find((f) => f.n >= 2);
  if (!frame) return null;
  return { n: frame.n, from: frame.from, to: frame.to };
}
