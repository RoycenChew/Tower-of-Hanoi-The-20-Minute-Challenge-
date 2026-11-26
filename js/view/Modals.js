// Modals.js — the welcome card, the victory modal, the "Time's up!" overlay
// and the Final Summary.
//
// This file only SHOWS things. What the buttons do is decided by the
// controller; Input.js connects the buttons to it.
//
// Victory and Summary use the native <dialog> element: showModal() puts it
// above the page (so nothing underneath moves), traps keyboard focus inside
// and adds a backdrop, with no extra code.

import { ChallengeTimer } from '../model/ChallengeTimer.js';
import { shareText } from '../model/Stats.js';
const DIFFICULTIES = [3, 4, 5];
const SUPERSCRIPT = { 3: '³', 4: '⁴', 5: '⁵' };

export class Modals {
  #doc;
  #el;

  constructor(doc = document) {
    this.#doc = doc;
    const byId = (id) => doc.getElementById(id);
    this.#el = {
      welcome: byId('welcome'),
      welcomeRules: byId('welcome-rules'),
      startButton: byId('btn-start'),
      locked: [byId('board'), doc.querySelector('.controls')],
      victory: byId('victory'),
      timeUp: byId('timeup'),
      summary: byId('summary'),
    };

    // While the welcome card is up, the board underneath is visible but
    // LOCKED: `inert` makes it unclickable and skips it when tabbing.
    this.#el.locked.forEach((el) => { el.inert = true; });

    // Rules start collapsed on small phones so the card never hides the disks.
    this.#el.welcomeRules.open = doc.defaultView.matchMedia('(min-width: 600px)').matches;
    this.#el.startButton.focus();

    // Victory: the ✕ button closes it.
    byId('btn-victory-close').addEventListener('click', () => this.#el.victory.close());

    // Time's up / Summary must not be closed with Esc.
    this.#el.summary.addEventListener('cancel', (event) => event.preventDefault());

    byId('btn-copy').addEventListener('click', () => this.#copyResult());
  }

  // ----- Welcome -----

  /**
   * Safety net, called once the board is drawn: the starting position must
   * stay visible, so if the card would cover the top disk of Peg A on this
   * screen, collapse the rules to make the card shorter.
   */
  fitWelcome() {
    const topDisk = this.#doc.querySelector('.peg .disks')?.lastElementChild;
    if (!topDisk) return;
    const card = this.#el.welcome.firstElementChild;
    if (card.getBoundingClientRect().bottom > topDisk.getBoundingClientRect().top) {
      this.#el.welcomeRules.open = false;
    }
  }

  hideWelcome() {
    this.#el.welcome.hidden = true;
    this.#el.locked.forEach((el) => { el.inert = false; });
  }

  // ----- Victory -----

  /**
   * @param {object} info  { diskCount, moves, minimum, stars, efficiency,
   *   perfect, score, timeMs, hints, nextLevel, optimal }
   */
  showVictory(info) {
    const byId = (id) => this.#doc.getElementById(id);
    const n = info.diskCount;

    byId('victory-stars').textContent = '★'.repeat(info.stars) + '☆'.repeat(3 - info.stars);
    byId('victory-stars').setAttribute('aria-label', `${info.stars} out of 3 stars`);
    //   = non-breaking space, so "7 (2³ − 1)" never splits over two lines.
    byId('victory-moves').textContent =
      `You used ${info.moves} moves. The minimum is ${info.minimum} (2${SUPERSCRIPT[n]} − 1).`;
    byId('victory-efficiency').textContent = info.perfect
      ? 'Perfect! Optimal solution.'
      : `Efficiency: ${info.efficiency}% (minimum ÷ your moves)`;
    byId('victory-time').textContent = ChallengeTimer.format(info.timeMs);
    byId('victory-hints').textContent = String(info.hints);
    byId('victory-score').textContent = `+${info.score}`;

    // 3 or 4 disks: "Next Level" is the main button. After 5 disks: "Play Again".
    const next = byId('btn-next-level');
    const again = byId('btn-play-again');
    next.hidden = info.nextLevel === null;
    next.textContent = `Next Level: ${info.nextLevel} Disks`;
    byId('victory-all-cleared').hidden = info.nextLevel !== null;
    again.classList.toggle('btn--primary', info.nextLevel === null);

    // "See Optimal Solution" (a <details>): the 2ⁿ − 1 moves of solve(n).
    byId('victory-optimal-count').textContent = `${info.minimum} moves`;
    byId('victory-optimal').replaceChildren(...info.optimal.map((text) => {
      const li = this.#doc.createElement('li');
      li.textContent = `Move ${text}`;
      return li;
    }));
    byId('victory-optimal-details').open = false;

    this.#el.victory.showModal();
    (info.nextLevel === null ? again : next).focus();
  }

  /** Close the victory modal (if open). */
  closeAll() {
    if (this.#el.victory.open) this.#el.victory.close();
  }

  // ----- Time's up and the Final Summary -----

  showTimeUp() {
    this.#el.timeUp.hidden = false;
  }

  showSummary(summary, nickname) {
    const byId = (id) => this.#doc.getElementById(id);

    byId('summary-player').textContent = `Well played, ${nickname}!`;
    byId('summary-score').textContent = String(summary.score);
    byId('summary-puzzles').textContent = String(summary.puzzlesCompleted);
    byId('summary-moves').textContent = String(summary.totalMoves);
    byId('summary-hints').textContent = String(summary.totalHints);
    byId('summary-undos').textContent = String(summary.totalUndos);
    byId('summary-invalid').textContent = String(summary.invalidAttempts);

    // Levels cleared: 3 ✓  4 ✓  5 ✗
    const levels = byId('summary-levels');
    levels.textContent = DIFFICULTIES
      .map((n) => `${n} ${summary.levelsCleared.includes(n) ? '✓' : '✗'}`)
      .join('  ');
    const cleared = summary.levelsCleared;
    levels.setAttribute('aria-label', cleared.length
      ? `Cleared: ${cleared.join(', ')} disks`
      : 'No levels cleared');

    // Best result per level.
    byId('summary-best').replaceChildren(...DIFFICULTIES.map((n) => {
      const best = summary.bestByLevel[n];
      const row = this.#doc.createElement('tr');
      for (const text of [
        `${n} disks`,
        best ? String(best.fewestMoves) : '—',
        best ? ChallengeTimer.format(best.fastestMs) : '—',
      ]) {
        const cell = this.#doc.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      return row;
    }));

    const url = this.#doc.location.origin + this.#doc.location.pathname;
    this.#el.summary.dataset.share = shareText(summary, nickname, url);

    this.#el.summary.showModal();
    byId('btn-new-challenge').focus();
  }

  /** "Copy my result": clipboard if allowed, otherwise show the text to copy by hand. */
  async #copyResult() {
    const text = this.#el.summary.dataset.share;
    const status = this.#doc.getElementById('copy-status');
    const fallback = this.#doc.getElementById('copy-fallback');
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Copied! Paste it to your friends.';
    } catch {
      fallback.value = text;
      fallback.hidden = false;
      fallback.select();
      status.textContent = 'Copy the text below by hand.';
    }
  }
}
