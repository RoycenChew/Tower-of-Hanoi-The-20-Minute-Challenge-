// UIOverlay.js — everything around the board: timer, metrics, message bar,
// control buttons, personal record, move log and the "How it works" panel.

import { PEG_LETTERS } from '../model/Rules.js';
import { ChallengeTimer } from '../model/ChallengeTimer.js';
import { MessageBar } from './MessageBar.js';
import { reducedMotion } from './Board.js';

export { DEFAULT_PROMPT } from './MessageBar.js';

const SUPERSCRIPT = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

const TIMER_STATUS = { normal: 'Running', warn5: '5 min left', warn1: 'Final minute' };

/**
 * Draw the three stacks as boxes ("Stack A  [3, 2]  2 disks"). Used by the
 * game's "How it works" panel AND by Learning Mode. The stack that just
 * received a push() and the one that gave a pop() are marked.
 * (Reading the pegs as arrays is fine here: this is drawing, not game logic.)
 * @param {HTMLElement} container
 * @param {number[][]} pegs              bottom -> top, from a snapshot
 * @param {{from, to} | null} lastMove
 */
export function renderStackBoxes(container, pegs, lastMove = null) {
  const doc = container.ownerDocument;
  const line = (className, text) => {
    const p = doc.createElement('p');
    p.className = className;
    p.textContent = text;
    return p;
  };
  container.replaceChildren(...pegs.map((disks, peg) => {
    const box = doc.createElement('div');
    box.className = 'stackbox';
    box.classList.toggle('is-push', lastMove?.to === peg);
    box.classList.toggle('is-pop', lastMove?.from === peg);
    const size = disks.length === 0 ? 'empty' : `${disks.length} ${disks.length === 1 ? 'disk' : 'disks'}`;
    box.append(
      line('stackbox__name', `Stack ${PEG_LETTERS[peg]}`),
      line('stackbox__value', `[${disks.join(', ')}]`),
      line('stackbox__size', size),
    );
    return box;
  }));
}

export class UIOverlay {
  #doc;
  #el;
  #messages;

  constructor(doc = document) {
    this.#doc = doc;
    const byId = (id) => doc.getElementById(id);
    this.#el = {
      timer: byId('timer'),
      timerStatus: byId('timer-status'),
      moves: byId('metric-moves'),
      minimum: byId('metric-minimum'),
      minimumFormula: byId('metric-minimum-formula'),
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
      record: byId('record'),
      recordLevel: byId('record-level'),
      recordMoves: byId('record-moves'),
      recordTime: byId('record-time'),
      controlButtons: ['btn-hint', 'btn-undo', 'btn-restart', 'btn-learn'].map(byId),
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
   * @param {{fewestMoves, fastestMs} | null | undefined} extra.personalRecord
   *   best ever for this level; null = none yet; undefined = cannot be saved (hide it)
   */
  render(snapshot, { lastMove = null, controlsEnabled = true, puzzlesSolved = 0, personalRecord } = {}) {
    const n = snapshot.diskCount;
    const power = `2${SUPERSCRIPT[n] ?? `^${n}`}`;

    this.#el.moves.textContent = String(snapshot.moveCount);
    this.#el.minimum.textContent = String(snapshot.minMoves);
    this.#el.minimumFormula.textContent = `(${power} − 1)`;
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

    renderStackBoxes(this.#el.howStacks, snapshot.pegs, lastMove);

    this.#el.howMinimum.textContent =
      `Minimum for ${n} disks: ${power} − 1 = ${snapshot.minMoves} moves.`;

    this.#renderRecord(n, personalRecord);
  }

  /** Personal record widget: hidden when the browser cannot save bests. */
  #renderRecord(diskCount, record) {
    this.#el.record.hidden = record === undefined;
    if (record === undefined) return;
    this.#el.recordLevel.textContent = `${diskCount} disks`;
    this.#el.recordMoves.textContent = record ? `${record.fewestMoves} moves` : 'No record yet';
    this.#el.recordTime.textContent = record ? `Fastest ${ChallengeTimer.format(record.fastestMs)}` : '';
  }

  // ----- Top-bar tools -----

  /** Mute button: pressed = sound is off. */
  setMuted(muted) {
    const button = this.#doc.getElementById('btn-mute');
    button.setAttribute('aria-pressed', String(muted));
    button.title = muted ? 'Sound is off' : 'Mute sound';
  }

  /**
   * Projector Mode: bigger text, thicker lines, larger disks, and the
   * game-feel extras hidden (see layout.css). The teaching content stays.
   */
  setProjector(on) {
    this.#doc.documentElement.classList.toggle('projector', on);
    this.#doc.getElementById('btn-projector').setAttribute('aria-pressed', String(on));
  }

  /** A short "pop" of the Moves counter after a valid move (transform only). */
  pulseMoves() {
    if (reducedMotion()) return;
    this.#el.moves.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
      { duration: 250, easing: 'ease-out' },
    );
  }

  // ----- Timer -----

  /** Show the remaining time as mm:ss (and "Running" / "Time's up" in the status tag). */
  setTime(ms) {
    this.#el.timer.textContent = ChallengeTimer.format(ms);
    const level = this.#el.timer.dataset.level ?? 'normal';
    this.#el.timerStatus.textContent = ms <= 0 ? "Time's up" : TIMER_STATUS[level];
  }

  /**
   * 'normal' | 'warn5' (orange) | 'warn1' (red, blinking, red page border).
   * Only colours and a fixed-position border change: nothing moves.
   */
  setTimerLevel(level) {
    this.#el.timer.dataset.level = level;
    this.#el.timerStatus.textContent = TIMER_STATUS[level];
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

    list.replaceChildren(...log.map((entry, i) => {
      const li = document.createElement('li');
      li.className = `log--${entry.type}`; // log--move, log--invalid, log--undo
      li.classList.toggle('is-latest', i === log.length - 1);
      li.textContent = entry.text;
      return li;
    }));
    list.scrollTop = list.scrollHeight; // newest entry at the bottom stays in view
  }
}
