// UIOverlay.js — everything around the board: timer, metrics, message bar,
// control buttons, move log and the "How it works" panel.

import { PEG_LETTERS } from '../model/Rules.js';
import { ChallengeTimer } from '../model/ChallengeTimer.js';
import { MessageBar } from './MessageBar.js';

export { DEFAULT_PROMPT } from './MessageBar.js';

const SUPERSCRIPT = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

export class UIOverlay {
  #doc;
  #el;
  #messages;

  constructor(doc = document) {
    this.#doc = doc;
    const byId = (id) => doc.getElementById(id);
    this.#el = {
      timer: byId('timer'),
      moves: byId('metric-moves'),
      minimum: byId('metric-minimum'),
      hints: byId('metric-hints'),
      solved: byId('metric-solved'),
      message: byId('message'),
      messageText: byId('message-text'),
      alert: byId('sr-alert'),
      log: byId('log'),
      logCount: byId('log-count'),
      howLast: byId('how-last'),
      howStacks: byId('how-stacks'),
      howMinimum: byId('how-minimum'),
      controlButtons: ['btn-hint', 'btn-undo', 'btn-restart'].map(byId),
      difficultyButtons: [...doc.querySelectorAll('[data-disks]')],
    };

    // The MessageBar decides WHAT to show (and handles warning priority);
    // this function is HOW one message is drawn.
    this.#messages = new MessageBar((text, type) => {
      this.#el.message.dataset.type = type;
      this.#el.messageText.textContent = text;
    });

    // Panels start closed on phones (to save space) and open on bigger screens.
    if (doc.defaultView.matchMedia('(min-width: 600px)').matches) {
      doc.querySelectorAll('.panel').forEach((panel) => { panel.open = true; });
    }
  }

  /**
   * Update everything from a model snapshot.
   * @param {object} snapshot
   * @param {object} extra
   * @param {{disk, from, to} | null} extra.lastMove  last valid move, for "How it works"
   * @param {boolean} extra.controlsEnabled           false before Start and after Time's up
   * @param {number} extra.puzzlesSolved
   */
  render(snapshot, { lastMove = null, controlsEnabled = true, puzzlesSolved = 0 } = {}) {
    const n = snapshot.diskCount;
    const power = `2${SUPERSCRIPT[n] ?? `^${n}`}`;

    this.#el.moves.textContent = String(snapshot.moveCount);
    this.#el.minimum.textContent = `${snapshot.minMoves} (${power} − 1)`;
    this.#el.hints.textContent = String(snapshot.hintsUsed);
    this.#el.solved.textContent = String(puzzlesSolved);

    for (const button of this.#el.controlButtons) button.disabled = !controlsEnabled;
    for (const button of this.#el.difficultyButtons) {
      button.disabled = !controlsEnabled;
      button.setAttribute('aria-pressed', String(Number(button.dataset.disks) === n));
    }

    this.#renderLog(snapshot.log);

    // "How it works": the last move as the two stack operations it really is.
    this.#el.howLast.textContent = lastMove
      ? `${PEG_LETTERS[lastMove.from]}.pop() → ${lastMove.disk}\n${PEG_LETTERS[lastMove.to]}.push(${lastMove.disk})`
      : 'Make a move to see the stack operations.';

    this.#el.howStacks.textContent = snapshot.pegs
      .map((disks, peg) => `${PEG_LETTERS[peg]}: [${disks.join(', ')}]`)
      .join('\n');

    this.#el.howMinimum.textContent =
      `Minimum for ${n} disks: ${power} − 1 = ${snapshot.minMoves} moves.`;
  }

  // ----- Timer -----

  /** Show the remaining time as mm:ss. */
  setTime(ms) {
    this.#el.timer.textContent = ChallengeTimer.format(ms);
  }

  /**
   * 'normal' | 'warn5' (orange) | 'warn1' (red, blinking, red page border).
   * Only colours and a fixed-position border change: nothing moves.
   */
  setTimerLevel(level) {
    this.#el.timer.dataset.level = level;
    this.#doc.body.classList.toggle('final-minute', level === 'warn1');
  }

  // ----- Messages -----

  /** @param {'info'|'error'|'hint'|'success'|'warning'} type  sets the colour */
  showMessage(text, type = 'info') {
    this.#messages.show(text, type);
  }

  clearMessage() {
    this.#messages.clear();
  }

  /** A timer warning that stays on screen for 4 s, even if interrupted. */
  showBanner(text, type = 'warning') {
    this.#messages.showBanner(text, type);
  }

  /** Read out urgent text to screen readers at once (aria-live="assertive"). */
  announce(text) {
    this.#el.alert.textContent = '';
    // A tiny delay makes screen readers treat the same text as new.
    setTimeout(() => { this.#el.alert.textContent = text; }, 50);
  }

  #renderLog(log) {
    const list = this.#el.log;
    this.#el.logCount.textContent = String(log.length);

    if (log.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'log--empty';
      empty.textContent = 'No moves yet.';
      list.replaceChildren(empty);
      return;
    }

    list.replaceChildren(...log.map((entry) => {
      const li = document.createElement('li');
      li.className = `log--${entry.type}`; // log--move, log--invalid, log--undo
      li.textContent = entry.text;
      return li;
    }));
    list.scrollTop = list.scrollHeight; // newest entry at the bottom stays in view
  }
}
