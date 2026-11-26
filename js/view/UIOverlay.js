// UIOverlay.js — everything around the board: metrics, message bar,
// move log and the "How it works" panel.

import { PEG_LETTERS } from '../model/Rules.js';

export const DEFAULT_PROMPT = 'Click a peg to pick up its top disk.';

const SUPERSCRIPT = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

export class UIOverlay {
  #el;

  constructor(doc = document) {
    const byId = (id) => doc.getElementById(id);
    this.#el = {
      moves: byId('metric-moves'),
      minimum: byId('metric-minimum'),
      hints: byId('metric-hints'),
      message: byId('message'),
      messageText: byId('message-text'),
      log: byId('log'),
      logCount: byId('log-count'),
      howLast: byId('how-last'),
      howStacks: byId('how-stacks'),
      howMinimum: byId('how-minimum'),
    };

    // Panels start closed on phones (to save space) and open on bigger screens.
    if (doc.defaultView.matchMedia('(min-width: 600px)').matches) {
      doc.querySelectorAll('.panel').forEach((panel) => { panel.open = true; });
    }
  }

  /**
   * Update everything from a model snapshot.
   * @param {object} snapshot
   * @param {{lastMove: {disk, from, to} | null}} extra  last valid move, for "How it works"
   */
  render(snapshot, { lastMove = null } = {}) {
    const n = snapshot.diskCount;
    const power = `2${SUPERSCRIPT[n] ?? `^${n}`}`;

    this.#el.moves.textContent = String(snapshot.moveCount);
    this.#el.minimum.textContent = `${snapshot.minMoves} (${power} − 1)`;
    this.#el.hints.textContent = String(snapshot.hintsUsed);

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

  /**
   * Show a message in the fixed-height message bar.
   * @param {string} text
   * @param {'info'|'error'|'hint'|'success'|'warning'} type  sets the colour
   */
  showMessage(text, type = 'info') {
    this.#el.message.dataset.type = type;
    this.#el.messageText.textContent = text;
  }

  /** Back to the default instruction. */
  clearMessage() {
    this.showMessage(DEFAULT_PROMPT, 'info');
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
