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
//
// STATE FIRST, PICTURE SECOND: every move changes the model at once; the
// animation is queued afterwards and only shows what already happened.

import { MESSAGES, describeMove, validateMove } from '../model/Rules.js';
import { updateLevelBest, updateBestScore, normalizeBests } from '../model/Stats.js';
import { AnimationQueue } from './AnimationQueue.js';

/** Screen states (section 5.1), plus PRACTICE: an untimed, uncounted warm-up before Start. */
export const Screen = Object.freeze({
  WELCOME: 'WELCOME',
  PRACTICE: 'PRACTICE',
  PLAYING: 'PLAYING',
  LEARNING: 'LEARNING',
  VICTORY: 'VICTORY',
  TIME_UP: 'TIME_UP',
});

export const DIFFICULTIES = [3, 4, 5];
export const SUMMARY_DELAY_MS = 1500;  // "Time's up!" shows alone this long, then the summary
export const RESTART_KEY_WINDOW_MS = 2000; // R must be pressed twice within this time
export const PRESS_R_AGAIN = 'Press R again to restart.';

// Friendly nudges for beginners (shown in the message bar).
export const IDLE_NUDGE_MS = 20_000;      // no move for 20 seconds
export const MISTAKES_BEFORE_NUDGE = 3;   // 3 refused moves in a row
export const NUDGE = Object.freeze({
  STUCK: 'Stuck? Try the Hint button.',
  FIRST_MOVE: 'Nice! Keep going: move all the disks to Peg C.',
  PRACTICE_START: 'Practice: move all 3 disks to Peg C. This puzzle is not timed and not counted.',
  PRACTICE_DONE: 'Great practice! You are ready. Press Start Challenge when you want the clock to start.',
  PRACTICE_ONLY_3: 'Practice uses 3 disks. You can change the difficulty after you start the challenge.',
  LEARNING_LATER: 'Learning Mode unlocks after you start the challenge.',
});

export class GameController {
  #game;
  #board;
  #ui;
  #modals;
  #stats;
  #timer;
  #queue;
  #learning;
  #sound;
  #prefs;
  #now;
  #setTimeout;
  #clearTimeout;
  #stopLearning;
  #cancelDrag;

  /** When the current puzzle started (for "time for this puzzle"). */
  #puzzleStartedAt = null;
  /** "Please wait..." is shown at most once per animation. */
  #busyNoticeShown = false;
  /** When R was first pressed (keyboard restart needs two presses). */
  #restartArmedAt = null;
  /** Nudges: refused moves in a row, the "no move for 20 s" timer, first move done. */
  #mistakesInARow = 0;
  #idleTimer = null;
  #firstMoveDone = false;

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
   * @param {AnimationQueue} [deps.queue]    runs move animations one at a time
   * @param {LearningMode} [deps.learning]   the step-by-step walkthrough
   * @param {{play: Function}} [deps.sound]   sound effects (silent by default)
   * @param {Preferences} [deps.prefs]       remembered settings and personal bests
   * @param {() => void} [deps.stopLearning] stops Learning Mode when time runs out
   * @param {() => void} [deps.cancelDrag]   cancels a drag in progress (set by Input)
   */
  constructor({
    bus, game, board, ui, modals, stats, timer,
    queue = new AnimationQueue(),
    learning = null,
    sound = { play() {} },
    prefs = null,
    stopLearning = () => learning?.lock(),
    cancelDrag = () => {},
    now = () => Date.now(),
    setTimeout = (fn, ms) => {
      const id = globalThis.setTimeout(fn, ms);
      id?.unref?.(); // in Node tests, a waiting nudge must not keep the process alive
      return id;
    },
    clearTimeout = (id) => globalThis.clearTimeout(id),
  }) {
    this.#game = game;
    this.#board = board;
    this.#ui = ui;
    this.#modals = modals;
    this.#stats = stats;
    this.#timer = timer;
    this.#queue = queue;
    this.#learning = learning;
    this.#sound = sound;
    this.#prefs = prefs;
    this.#stopLearning = stopLearning;
    this.#cancelDrag = cancelDrag;
    this.#now = now;
    this.#setTimeout = setTimeout;
    this.#clearTimeout = clearTimeout;

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

  /** Number of disks in the current puzzle. */
  get diskCount() {
    return this.#game.diskCount;
  }

  /** A practice puzzle can be offered only before the challenge starts. */
  get canPractice() {
    return this.screen === Screen.WELCOME && !this.locked;
  }

  /** True once Start Challenge has been pressed (the clock is running or has run out). */
  get challengeStarted() {
    return this.screen !== Screen.WELCOME && this.screen !== Screen.PRACTICE;
  }

  /** Input.js registers how to cancel a drag (needed when time runs out). */
  setCancelDrag(fn) {
    this.#cancelDrag = fn;
  }

  /** Redraw the board and the panels from the model. */
  render() {
    const snapshot = this.#game.snapshot();
    this.#board.render(snapshot, { selectedPeg: this.selectedPeg });
    this.#ui.render(snapshot, {
      // The last valid move is simply the top of the undo history stack.
      lastMove: this.#game.history.peek(),
      controlsEnabled: !this.locked && this.screen !== Screen.WELCOME,
      // Practice is always 3 disks, and Learning Mode unlocks only after Start.
      challengeControlsEnabled: !this.locked && this.screen !== Screen.WELCOME && this.screen !== Screen.PRACTICE,
      practice: this.screen === Screen.PRACTICE,
      puzzlesSolved: this.#stats.puzzlesCompleted,
    });
  }

  // ===================== Challenge flow =====================

  /** "Start Challenge": start the one and only 20-minute clock. */
  start(nickname = '') {
    if (this.screen !== Screen.WELCOME) return; // works only once
    const typed = nickname.trim().slice(0, 20);
    this.nickname = typed || 'Player';
    this.#prefs?.set('nickname', typed); // pre-filled next time
    this.screen = Screen.PLAYING;
    this.#puzzleStartedAt = this.#now();
    this.#timer.start();
    this.#modals.hideWelcome();
    this.#ui.clearMessage();
    this.#firstMoveDone = false;
    this.#mistakesInARow = 0;
    this.render();
    this.#armIdleNudge();
  }

  // ===================== Practice (before Start) =====================

  /**
   * A 3-disk warm-up on the real board, BEFORE the challenge: the clock does
   * not start and nothing is counted (no Stats, no score, no personal bests).
   */
  startPractice() {
    if (!this.canPractice) return;
    this.screen = Screen.PRACTICE;
    this.selectedPeg = null;
    this.#firstMoveDone = false;
    this.#mistakesInARow = 0;
    this.#game.reset(3);
    this.#modals.hideWelcome(); // unlocks the board
    this.render();
    this.#ui.showMessage(NUDGE.PRACTICE_START, 'info');
    this.#armIdleNudge();
  }

  /** "Skip practice", or the practice puzzle was solved: back to the welcome card. */
  endPractice({ solved = false } = {}) {
    if (this.screen !== Screen.PRACTICE) return;
    this.#cancelIdleNudge();
    this.screen = Screen.WELCOME;
    this.selectedPeg = null;
    this.#game.reset(3); // the challenge starts from a fresh board
    this.render();
    this.#modals.showWelcome(solved ? NUDGE.PRACTICE_DONE : null);
    this.#ui.clearMessage();
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
    this.#cancelIdleNudge();
    // 2. Stop Learning Mode autoplay.
    this.#stopLearning();
    // 3. Empty the animation queue and finish running animations, so the
    //    board shows the real state at once.
    this.#queue.clear();
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
    const summary = this.#stats.summary();
    const personal = this.#saveBestScore(summary.score);
    this.#setTimeout(() => {
      this.#modals.showSummary(summary, this.nickname, personal);
    }, SUMMARY_DELAY_MS);
  }

  // ===================== Player actions: clicks =====================

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
      // Measure the disk while it is still LIFTED, so the animation starts
      // from where the player actually sees it.
      const from = this.selectedPeg;
      this.#makeMove(from, peg, this.#board.measureTopDisk(from), { dropped: false });
    }
  }

  /** Esc: put a lifted disk back down. */
  cancelSelection() {
    if (this.selectedPeg !== null) this.#deselect();
  }

  // ===================== Player actions: drag-and-drop =====================

  /**
   * A drag is starting on `disk` of `peg`. Allowed only for a TOP disk.
   * @returns {boolean} true if the drag may go on
   */
  beginDrag(peg, disk) {
    if (!this.#inputAllowed()) return false;
    if (this.#game.solved) {
      this.#ui.showMessage(MESSAGES.PUZZLE_SOLVED, 'info');
      return false;
    }
    // LIFO: only the disk that peek() returns can be taken off a peg.
    if (this.#game.pegs[peg].peek() !== disk) {
      this.#ui.showMessage(this.#mistake(MESSAGES.TOP_ONLY), 'error');
      this.#sound.play('invalid');
      return false;
    }
    if (this.selectedPeg !== null) {
      this.selectedPeg = null;
      this.render();
    }
    this.#ui.clearMessage();
    return true;
  }

  /** While dragging: would dropping on `to` be legal? (Only looks; changes nothing.) */
  previewDrop(from, to) {
    return validateMove(this.#game.pegs, from, to).ok;
  }

  /**
   * The disk was dropped on peg `to`. This is a REAL move attempt, exactly
   * like two clicks: an illegal drop is logged and counted as invalid.
   * @param {DOMRect|null} dropRect  where the disk was let go
   */
  dropDisk(from, to, dropRect) {
    if (!this.#inputAllowed()) {
      this.render(); // e.g. time ran out mid-drag: just show the real board
      return;
    }
    this.#makeMove(from, to, dropRect, { dropped: true });
  }

  /** Dropped outside every peg (or on its own peg): it goes back quietly, not counted. */
  cancelDrop(peg, dropRect) {
    this.render();
    if (this.locked) return;
    this.#animate(() => this.#board.animateReturn(peg, dropRect));
  }

  // ===================== Player actions: buttons and keys =====================

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
    if (this.#counting) this.#stats.recordHint();
    this.#mistakesInARow = 0;
    this.render();
    this.#board.highlightHint(move);
    this.#ui.showMessage(`Hint: Move ${describeMove(move)}`, 'hint');
  }

  /** Reverse the last valid move (animated). */
  undo() {
    if (!this.#inputAllowed()) return;
    if (this.#game.solved) {
      // A solved puzzle is finished and already counted; undoing it would let
      // the same puzzle be "solved" twice.
      this.#ui.showMessage(MESSAGES.PUZZLE_SOLVED, 'info');
      return;
    }
    this.selectedPeg = null;
    const last = this.#game.history.peek(); // the move about to be undone
    const fromRect = last ? this.#board.measureTopDisk(last.to) : null;
    const result = this.#game.undo(); // "Nothing to undo." arrives as move:invalid
    if (result.ok) {
      if (this.#counting) this.#stats.recordUndo();
      this.#sound.play('move');
      this.#ui.clearMessage();
      this.#animate(() => this.#board.animateMove(result.move.disk, fromRect));
    }
  }

  /** Same difficulty, fresh puzzle. The challenge clock keeps running. */
  restart() {
    if (!this.#inputAllowed()) return;
    this.#restartArmedAt = null;
    this.#newPuzzle(this.#game.diskCount);
  }

  /**
   * The R key restarts only when pressed TWICE within 2 seconds, so a stray
   * key press cannot wipe out a puzzle. (The Restart button is one click.)
   */
  requestRestartByKey() {
    if (!this.#inputAllowed()) return;
    const now = this.#now();
    if (this.#restartArmedAt !== null && now - this.#restartArmedAt <= RESTART_KEY_WINDOW_MS) {
      this.restart();
    } else {
      this.#restartArmedAt = now;
      this.#ui.showMessage(PRESS_R_AGAIN, 'info');
    }
  }

  /** Switch to 3, 4 or 5 disks. The challenge clock keeps running. */
  setDifficulty(diskCount) {
    if (!this.#inputAllowed()) return;
    if (this.screen === Screen.PRACTICE) {
      this.#ui.showMessage(NUDGE.PRACTICE_ONLY_3, 'info');
      return;
    }
    if (!DIFFICULTIES.includes(diskCount)) return;
    this.#newPuzzle(diskCount);
  }

  /** Victory modal: "Next Level: N Disks". */
  nextLevel() {
    if (!this.#inputAllowed() || this.screen === Screen.PRACTICE) return;
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

  // ===================== Learning Mode =====================

  /**
   * Open the step-by-step walkthrough. The player's game is left exactly as
   * it is (Learning Mode has its own board), and the challenge clock keeps
   * running: nothing here touches the timer.
   * @param {number} diskCount  3 by default; "See Optimal Solution" passes the solved puzzle's size
   */
  openLearning(diskCount = 3) {
    if (!this.#learning || !this.#inputAllowed()) return;
    if (this.screen === Screen.PRACTICE) {
      this.#ui.showMessage(NUDGE.LEARNING_LATER, 'info');
      return;
    }
    this.#cancelIdleNudge();
    this.selectedPeg = null;
    this.screen = Screen.LEARNING;
    this.#modals.closeAll(); // e.g. the victory modal, when opened from "See Optimal Solution"
    this.render();
    this.#learning.open(diskCount);
  }

  /** "Back to Game": the game board is shown again, untouched. */
  closeLearning() {
    if (this.screen !== Screen.LEARNING) return;
    this.#learning.close();
    this.screen = Screen.PLAYING;
    this.render();
    this.#ui.clearMessage();
    this.#armIdleNudge();
  }

  // ===================== private =====================

  /**
   * The single gate every input goes through. Shows the reason and returns
   * false if input is not allowed right now. Order matters: Time's up first.
   */
  #inputAllowed() {
    if (this.locked) {
      this.#ui.showMessage(MESSAGES.TIME_UP, 'error');
      return false;
    }
    if (this.screen === Screen.WELCOME) {
      this.#ui.showMessage(MESSAGES.NOT_STARTED, 'error');
      return false;
    }
    if (this.screen === Screen.LEARNING) {
      return false; // the game board is hidden; Learning Mode has its own controls
    }
    if (this.#queue.busy) {
      // Refused, but the message is shown only once per animation so it
      // does not flash on every rapid click.
      if (!this.#busyNoticeShown) {
        this.#busyNoticeShown = true;
        this.#ui.showMessage(MESSAGES.BUSY, 'info');
      }
      return false;
    }
    return true;
  }

  /**
   * Queue an animation. When it has finished, redraw from the model as a
   * safety net, then run `after` — unless time ran out meanwhile (the
   * Time's up sequence owns the screen from then on).
   */
  #animate(animation, after = () => {}) {
    this.#busyNoticeShown = false; // a new animation may show "Please wait..." once
    this.#queue.add(animation).then(() => {
      if (this.locked) return;
      this.render();
      after();
    });
  }

  #warn(level, text, type) {
    this.#ui.setTimerLevel(level);
    this.#ui.showBanner(text, type);
    this.#ui.announce(text); // screen readers hear it at once
    this.#sound.play('warning');
  }

  #select(peg) {
    const stack = this.#game.pegs[peg];
    if (stack.isEmpty()) {
      // Rejected selection, not a move attempt: message + shake, not logged or counted.
      this.#ui.showMessage(this.#mistake(MESSAGES.EMPTY_SOURCE), 'error');
      this.#board.shakePeg(peg);
      this.#sound.play('invalid');
      return;
    }
    this.#armIdleNudge(); // picking up a disk counts as doing something
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

  /**
   * One move attempt, from a click or a drop.
   * @param {DOMRect|null} fromRect  where the disk is drawn now (lifted or dropped)
   * @param {{dropped: boolean}} how  a failed drop animates back; a failed click shakes
   */
  #makeMove(from, to, fromRect, { dropped }) {
    // Deselect FIRST, so the redraw caused by the move shows no lifted disk.
    this.selectedPeg = null;

    // 1. The model validates and either moves (state:changed) or refuses
    //    (move:invalid). Our listeners redraw in both cases — instantly.
    const result = this.#game.tryMove(from, to);

    if (!result.ok) {
      if (this.#counting) this.#stats.recordInvalid();
      // The model already showed why the move was refused; after several
      // mistakes in a row, add a gentle pointer to the Hint button.
      if (this.#mistakesInARow + 1 >= MISTAKES_BEFORE_NUDGE) {
        this.#ui.showMessage(this.#mistake(result.message), 'error');
      } else {
        this.#mistake(result.message);
      }
      this.#sound.play('invalid');
      if (dropped) this.#animate(() => this.#board.animateReturn(from, fromRect));
      else this.#board.shakeTopDisk(from); // the disk "drops back" with a shake
      return;
    }

    if (this.#counting) this.#stats.recordMove();
    this.#mistakesInARow = 0;
    this.#sound.play('move');
    this.#ui.pulseMoves();

    if (this.screen === Screen.PRACTICE) {
      this.#afterPracticeMove(result, fromRect);
      return;
    }

    const victory = result.solved ? this.#recordSolved() : null;
    if (!victory) this.#encourage();

    // 2. The picture catches up: animate from the old place to the new one.
    //    The victory modal waits until the disk has landed.
    this.#animate(
      () => this.#board.animateMove(result.move.disk, fromRect),
      () => {
        if (victory && this.screen === Screen.VICTORY) {
          this.#modals.showVictory(victory);
          this.#sound.play('win');
        }
      },
    );
  }

  /** Practice: animate as usual; when solved, go back to the welcome card. Nothing is counted. */
  #afterPracticeMove(result, fromRect) {
    if (result.solved) {
      this.#cancelIdleNudge();
      this.#ui.showMessage('Solved! Well done.', 'success');
    } else {
      this.#encourage();
    }
    this.#animate(
      () => this.#board.animateMove(result.move.disk, fromRect),
      () => {
        if (result.solved && this.screen === Screen.PRACTICE) {
          this.#sound.play('win');
          this.endPractice({ solved: true });
        }
      },
    );
  }

  /** After a valid move: a word of encouragement the first time, otherwise the normal prompt. */
  #encourage() {
    if (!this.#firstMoveDone) {
      this.#firstMoveDone = true;
      this.#ui.showMessage(NUDGE.FIRST_MOVE, 'success');
    } else {
      this.#ui.clearMessage();
    }
    this.#armIdleNudge();
  }

  /** Practice moves are never counted in Stats. */
  get #counting() {
    return this.screen !== Screen.PRACTICE;
  }

  /**
   * One more refused move. Returns the message to show: after several in a
   * row, it ends with "Stuck? Try the Hint button."
   */
  #mistake(message) {
    this.#mistakesInARow++;
    return this.#mistakesInARow >= MISTAKES_BEFORE_NUDGE ? `${message} ${NUDGE.STUCK}` : message;
  }

  /**
   * (Re)start the "no move for 20 seconds" timer. When it fires it suggests
   * the Hint button once; it starts again only after the next move.
   */
  #armIdleNudge() {
    this.#cancelIdleNudge();
    if (!this.#nudgesActive()) return;
    this.#idleTimer = this.#setTimeout(() => {
      this.#idleTimer = null;
      if (this.#nudgesActive()) this.#ui.showMessage(NUDGE.STUCK, 'hint');
    }, IDLE_NUDGE_MS);
  }

  #cancelIdleNudge() {
    if (this.#idleTimer !== null) this.#clearTimeout(this.#idleTimer);
    this.#idleTimer = null;
  }

  /** Nudges only while actually playing a puzzle that is not solved yet. */
  #nudgesActive() {
    return !this.locked && !this.#game.solved
      && (this.screen === Screen.PLAYING || this.screen === Screen.PRACTICE);
  }

  /**
   * The puzzle is solved: count it NOW (the model already says so), even if
   * time runs out before the animation ends. Returns the victory modal data.
   */
  #recordSolved() {
    const game = this.#game;
    const n = game.diskCount;
    const timeMs = this.#now() - this.#puzzleStartedAt;
    const rating = this.#stats.recordSolved({
      diskCount: n,
      moves: game.moveCount,
      timeMs,
      hints: game.hintsUsed,
    });
    this.screen = Screen.VICTORY;
    this.#cancelIdleNudge();
    this.render(); // "Puzzles solved" metric
    this.#ui.showMessage(`Puzzle solved in ${game.moveCount} moves! The minimum is ${game.minMoves()}.`, 'success');
    return {
      ...rating,
      diskCount: n,
      moves: game.moveCount,
      hints: game.hintsUsed,
      nextLevel: n < 5 ? n + 1 : null, // null after 5 disks: every level cleared
      personalBest: this.#saveLevelBest(n, game.moveCount, timeMs),
    };
  }

  /**
   * Personal bests are kept between visits. Returns what improved, or null
   * when nothing can be saved (then the modal shows no personal-best line).
   */
  #saveLevelBest(diskCount, moves, timeMs) {
    if (!this.#prefs?.available) return null;
    const { bests, improved } = updateLevelBest(this.#prefs.get('bests'), diskCount, moves, timeMs);
    this.#prefs.set('bests', bests);
    return improved;
  }

  /** At Time's up: save the best total score; returns the bests for the summary (or null). */
  #saveBestScore(score) {
    if (!this.#prefs?.available) return null;
    const { bests, improved } = updateBestScore(this.#prefs.get('bests'), score);
    this.#prefs.set('bests', bests);
    return { bests: normalizeBests(bests), newBestScore: improved };
  }

  /** Fresh puzzle with n disks. Stats totals and the challenge clock are untouched. */
  #newPuzzle(n) {
    this.selectedPeg = null;
    if (this.screen !== Screen.PRACTICE) this.screen = Screen.PLAYING;
    this.#mistakesInARow = 0;
    this.#modals.closeAll();
    this.#game.reset(n); // emits state:changed -> render
    this.#puzzleStartedAt = this.#now();
    this.render();
    this.#ui.showMessage(`New puzzle: ${n} disks. Move them all to Peg C.`, 'info');
    this.#armIdleNudge();
  }
}
