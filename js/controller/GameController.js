// GameController.js — decides what a player action means and whether it is
// allowed, then asks the model to change and the views to redraw.
//
// The controller does not touch the DOM itself: it only calls methods on the
// model (GameState, Stats, ChallengeTimer) and on the views it was given.
// That keeps it testable in Node with fake views (tests/controller.test.js,
// tests/challenge.test.js).
//
// THE TIMER IS NEVER PAUSED: no action here (hint, undo, restart, difficulty,
// victory) calls anything on the timer except start() once. The timer only
// tells US things, through events (timer:tick, timer:warn5, ...).

import { MESSAGES, describeMove } from '../model/Rules.js';
import { solve } from '../model/Solver.js';

/** Screen states (section 5.1). */
export const Screen = Object.freeze({
  WELCOME: 'WELCOME',
  PLAYING: 'PLAYING',
  LEARNING: 'LEARNING',
  VICTORY: 'VICTORY',
  TIME_UP: 'TIME_UP',
});

export const DIFFICULTIES = [3, 4, 5];
export const SUMMARY_DELAY_MS = 1500; // "Time's up!" shows alone this long, then the summary

export class GameController {
  #game;
  #board;
  #ui;
  #modals;
  #stats;
  #timer;
  #isBusy;
  #now;
  #setTimeout;
  #stopLearning;
  #cancelDrag;

  /** When the current puzzle started (for "time for this puzzle"). */
  #puzzleStartedAt = null;

  screen = Screen.WELCOME;
  /** null, or the peg (0/1/2) whose top disk is lifted. */
  selectedPeg = null;
  /** Set the moment time runs out. Every input is then refused, forever. */
  locked = false;
  nickname = 'Player';

  /**
   * @param {object} deps
   * @param {EventBus} deps.bus
   * @param {GameState} deps.game
   * @param {Board} deps.board
   * @param {UIOverlay} deps.ui
   * @param {Modals} deps.modals
   * @param {Stats} deps.stats
   * @param {ChallengeTimer} deps.timer
   * @param {() => boolean} [deps.isBusy]   true while an animation plays (Phase 4)
   * @param {() => void} [deps.stopLearning] stops Learning Mode autoplay (Phase 5)
   * @param {() => void} [deps.cancelDrag]   cancels a drag in progress (Phase 4)
   */
  constructor({
    bus, game, board, ui, modals, stats, timer,
    isBusy = () => false,
    stopLearning = () => {},
    cancelDrag = () => {},
    now = () => Date.now(),
    setTimeout = (fn, ms) => globalThis.setTimeout(fn, ms),
  }) {
    this.#game = game;
    this.#board = board;
    this.#ui = ui;
    this.#modals = modals;
    this.#stats = stats;
    this.#timer = timer;
    this.#isBusy = isBusy;
    this.#stopLearning = stopLearning;
    this.#cancelDrag = cancelDrag;
    this.#now = now;
    this.#setTimeout = setTimeout;

    // The model announces changes; the controller redraws.
    bus.on('state:changed', () => this.render());
    bus.on('move:invalid', ({ message }) => {
      this.render(); // the log may have gained an "Invalid" entry
      this.#ui.showMessage(message, 'error');
    });

    // The timer announces time; the controller reacts. It never pauses it.
    bus.on('timer:tick', (ms) => this.#ui.setTime(ms));
    bus.on('timer:warn5', () => this.#warn('warn5', '5 minutes remaining!', 'warning'));
    bus.on('timer:warn1', () => this.#warn('warn1', 'Final minute!', 'error'));
    bus.on('timer:expired', () => this.handleExpired());
  }

  /** Redraw the board and the panels from the model. */
  render() {
    const snapshot = this.#game.snapshot();
    this.#board.render(snapshot, { selectedPeg: this.selectedPeg });
    this.#ui.render(snapshot, {
      // The last valid move is simply the top of the undo history stack.
      lastMove: this.#game.history.peek(),
      controlsEnabled: !this.locked && this.screen !== Screen.WELCOME,
      puzzlesSolved: this.#stats.puzzlesCompleted,
    });
  }

  // ===================== Challenge flow =====================

  /** "Start Challenge": start the one and only 20-minute clock. */
  start(nickname = '') {
    if (this.screen !== Screen.WELCOME) return; // works only once
    this.nickname = nickname.trim().slice(0, 20) || 'Player';
    this.screen = Screen.PLAYING;
    this.#puzzleStartedAt = this.#now();
    this.#timer.start();
    this.#modals.hideWelcome();
    this.#ui.clearMessage();
    this.render();
  }

  /**
   * Time is up (section 5.6). The ORDER matters: lock first, so that nothing
   * the player does from this moment can change the game, then clean up.
   */
  handleExpired() {
    if (this.locked) return;
    // 1. Lock: every input now returns TIME_UP.
    this.locked = true;
    this.screen = Screen.TIME_UP;
    // 2. Stop Learning Mode autoplay.
    this.#stopLearning();
    // 3. Finish any running animation, so the board shows the real state.
    this.#board.finishAnimations();
    // 4. Cancel a drag in progress, and drop a lifted disk back onto its peg.
    this.#cancelDrag();
    this.selectedPeg = null;
    // 5. Close any other modal (e.g. the victory modal).
    this.#modals.closeAll();
    this.render();
    this.#ui.showMessage(MESSAGES.TIME_UP, 'error');
    // 6. Full-screen "Time's up!".
    this.#modals.showTimeUp();
    // 7. After 1.5 s, the Final Summary.
    this.#setTimeout(() => {
      this.#modals.showSummary(this.#stats.summary(), this.nickname);
    }, SUMMARY_DELAY_MS);
  }

  // ===================== Player actions =====================

  /**
   * Click-to-select (section 5.2): first click picks up a top disk,
   * second click puts it down on another peg.
   */
  handlePegClick(peg) {
    if (!this.#inputAllowed()) return;
    if (this.#game.solved) {
      this.#ui.showMessage(MESSAGES.PUZZLE_SOLVED, 'info');
      return;
    }

    if (this.selectedPeg === null) {
      this.#select(peg);
    } else if (peg === this.selectedPeg) {
      this.#deselect();
    } else {
      this.#moveSelectedTo(peg);
    }
  }

  /** Suggest the best next move from the current position. Moves nothing. */
  hint() {
    if (!this.#inputAllowed()) return;
    this.selectedPeg = null;
    const move = this.#game.hint(); // null if the puzzle is solved
    if (!move) {
      this.render();
      this.#ui.showMessage(MESSAGES.PUZZLE_SOLVED, 'info');
      return;
    }
    this.#stats.recordHint();
    this.render();
    this.#board.highlightHint(move);
    this.#ui.showMessage(`Hint: Move ${describeMove(move)}`, 'hint');
  }

  /** Reverse the last valid move. */
  undo() {
    if (!this.#inputAllowed()) return;
    if (this.#game.solved) {
      // A solved puzzle is finished and already counted; undoing it would let
      // the same puzzle be "solved" twice.
      this.#ui.showMessage(MESSAGES.PUZZLE_SOLVED, 'info');
      return;
    }
    this.selectedPeg = null;
    const result = this.#game.undo(); // "Nothing to undo." arrives as move:invalid
    if (result.ok) {
      this.#stats.recordUndo();
      this.#ui.clearMessage();
    }
  }

  /** Same difficulty, fresh puzzle. The challenge clock keeps running. */
  restart() {
    if (!this.#inputAllowed()) return;
    this.#newPuzzle(this.#game.diskCount);
  }

  /** Switch to 3, 4 or 5 disks. The challenge clock keeps running. */
  setDifficulty(diskCount) {
    if (!this.#inputAllowed()) return;
    if (!DIFFICULTIES.includes(diskCount)) return;
    this.#newPuzzle(diskCount);
  }

  /** Victory modal: "Next Level: N Disks". */
  nextLevel() {
    if (!this.#inputAllowed()) return;
    this.#newPuzzle(Math.min(this.#game.diskCount + 1, 5));
  }

  /** Victory modal: "Play Again" (same difficulty). */
  playAgain() {
    this.restart();
  }

  /** The victory modal was closed (Esc or ✕): back to the solved board. */
  closeVictory() {
    if (this.screen === Screen.VICTORY) this.screen = Screen.PLAYING;
  }

  // ===================== private =====================

  /**
   * The single gate every input goes through. Shows the reason and returns
   * false if input is not allowed right now. Order matters: Time's up first.
   */
  #inputAllowed() {
    let blocked = null;
    if (this.locked) blocked = 'TIME_UP';
    else if (this.screen === Screen.WELCOME) blocked = 'NOT_STARTED';
    else if (this.#isBusy()) blocked = 'BUSY';

    if (blocked) {
      this.#ui.showMessage(MESSAGES[blocked], blocked === 'BUSY' ? 'info' : 'error');
      return false;
    }
    return true;
  }

  #warn(level, text, type) {
    this.#ui.setTimerLevel(level);
    this.#ui.showBanner(text, type);
    this.#ui.announce(text); // screen readers hear it at once
  }

  #select(peg) {
    const stack = this.#game.pegs[peg];
    if (stack.isEmpty()) {
      // Rejected selection, not a move attempt: message + shake, not logged or counted.
      this.#ui.showMessage(MESSAGES.EMPTY_SOURCE, 'error');
      this.#board.shakePeg(peg);
      return;
    }
    this.selectedPeg = peg;
    this.render();
    this.#ui.showMessage(
      `Disk ${stack.peek()} selected. Click another peg to move it there, or click the same peg to cancel.`,
      'info',
    );
  }

  #deselect() {
    this.selectedPeg = null;
    this.render();
    this.#ui.clearMessage();
  }

  #moveSelectedTo(to) {
    const from = this.selectedPeg;
    // Deselect FIRST, so the redraw caused by the move shows no lifted disk.
    this.selectedPeg = null;

    // The model validates and either moves (state:changed) or refuses
    // (move:invalid). Our listeners redraw in both cases.
    const result = this.#game.tryMove(from, to);

    if (!result.ok) {
      this.#stats.recordInvalid();
      this.#board.shakeTopDisk(from); // the disk "drops back" with a shake
      return;
    }
    this.#stats.recordMove();
    if (result.solved) {
      this.#onSolved();
    } else {
      this.#ui.clearMessage();
    }
  }

  #onSolved() {
    const game = this.#game;
    const n = game.diskCount;
    const rating = this.#stats.recordSolved({
      diskCount: n,
      moves: game.moveCount,
      timeMs: this.#now() - this.#puzzleStartedAt,
      hints: game.hintsUsed,
    });
    this.screen = Screen.VICTORY;
    this.render(); // "Puzzles solved" metric
    this.#ui.showMessage(`Puzzle solved in ${game.moveCount} moves! The minimum is ${game.minMoves()}.`, 'success');
    this.#modals.showVictory({
      ...rating,
      diskCount: n,
      moves: game.moveCount,
      hints: game.hintsUsed,
      nextLevel: n < 5 ? n + 1 : null, // null after 5 disks: every level cleared
      optimal: solve(n).map(describeMove),
    });
  }

  /** Fresh puzzle with n disks. Stats totals and the challenge clock are untouched. */
  #newPuzzle(n) {
    this.selectedPeg = null;
    this.screen = Screen.PLAYING;
    this.#modals.closeAll();
    this.#game.reset(n); // emits state:changed -> render
    this.#puzzleStartedAt = this.#now();
    this.render();
    this.#ui.showMessage(`New puzzle: ${n} disks. Move them all to Peg C.`, 'info');
  }
}
