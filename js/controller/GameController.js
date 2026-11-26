// GameController.js — decides what a player action means and whether it is
// allowed, then asks the model to change and the views to redraw.
//
// The controller does not touch the DOM itself: it only calls methods on the
// model (GameState) and on the views (Board, UIOverlay) it was given. That
// keeps it testable in Node with fake views (tests/controller.test.js).

import { MESSAGES } from '../model/Rules.js';

/** Screen states (section 5.1). Phase 3 adds the moves between them. */
export const Screen = Object.freeze({
  WELCOME: 'WELCOME',
  PLAYING: 'PLAYING',
  LEARNING: 'LEARNING',
  VICTORY: 'VICTORY',
  TIME_UP: 'TIME_UP',
});

// TEMPORARY (Phase 2 only): allow moves before "Start Challenge" exists.
// Phase 3 sets this to false; nothing else in the controller has to change.
export const ALLOW_PLAY_WITHOUT_START = true;

export class GameController {
  #game;
  #board;
  #ui;
  #isBusy;
  #allowPlayWithoutStart;

  screen = Screen.WELCOME;
  /** null, or the peg (0/1/2) whose top disk is lifted. */
  selectedPeg = null;
  /** Set when time runs out (Phase 3). Every input is then refused. */
  locked = false;

  /**
   * @param {object} deps
   * @param {EventBus} deps.bus
   * @param {GameState} deps.game
   * @param {Board} deps.board
   * @param {UIOverlay} deps.ui
   * @param {() => boolean} [deps.isBusy]  true while an animation plays (Phase 4)
   * @param {boolean} [deps.allowPlayWithoutStart]
   */
  constructor({ bus, game, board, ui, isBusy = () => false, allowPlayWithoutStart = ALLOW_PLAY_WITHOUT_START }) {
    this.#game = game;
    this.#board = board;
    this.#ui = ui;
    this.#isBusy = isBusy;
    this.#allowPlayWithoutStart = allowPlayWithoutStart;

    // The model announces changes; the controller redraws.
    bus.on('state:changed', () => this.render());
    bus.on('move:invalid', ({ message }) => {
      this.render(); // the log gained an "Invalid" entry
      this.#ui.showMessage(message, 'error');
    });
  }

  /** Redraw the board and the panels from the model. */
  render() {
    const snapshot = this.#game.snapshot();
    this.#board.render(snapshot, { selectedPeg: this.selectedPeg });
    // The last valid move is simply the top of the undo history stack.
    this.#ui.render(snapshot, { lastMove: this.#game.history.peek() });
  }

  /**
   * Click-to-select (section 5.2): first click picks up a top disk,
   * second click puts it down on another peg.
   */
  handlePegClick(peg) {
    const blocked = this.#blockedReason();
    if (blocked) {
      this.#ui.showMessage(MESSAGES[blocked], blocked === 'BUSY' ? 'info' : 'error');
      return;
    }
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

  // ----- private -----

  /**
   * The single gate every input goes through. Returns a message code if
   * input is not allowed right now, or null if it is.
   * Order matters: Time's up beats everything else.
   */
  #blockedReason() {
    if (this.locked) return 'TIME_UP';
    if (this.screen === Screen.WELCOME && !this.#allowPlayWithoutStart) return 'NOT_STARTED';
    if (this.#isBusy()) return 'BUSY';
    return null;
  }

  #select(peg) {
    const stack = this.#game.pegs[peg];
    if (stack.isEmpty()) {
      // Rejected selection, not a move attempt: message + shake, nothing logged.
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
      this.#board.shakeTopDisk(from); // the disk "drops back" with a shake
      return;
    }
    if (result.solved) {
      const { moveCount } = this.#game;
      const min = this.#game.minMoves();
      this.#ui.showMessage(`Puzzle solved in ${moveCount} moves! The minimum is ${min}.`, 'success');
    } else {
      this.#ui.clearMessage();
    }
  }
}
