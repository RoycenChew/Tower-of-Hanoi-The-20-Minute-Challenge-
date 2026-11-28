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
import { launchConfetti } from './Confetti.js';
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
      banner: byId('welcome-banner'),
      startButton: byId('btn-start'),
      locked: [byId('board'), doc.querySelector('.controls')],
      victory: byId('victory'),
      timeUp: byId('timeup'),
      summary: byId('summary'),
    };

    // While the welcome card is up, the board underneath is visible but
    // LOCKED: `inert` makes it unclickable and skips it when tabbing.
    this.#el.locked.forEach((el) => { el.inert = true; });

    // Rules: open on bigger screens; folded on phones, where the tour explains
    // them and the card must leave the board visible. fitWelcome() decides.
    this.#el.welcomeRules.open = this.#rulesOpenByDefault();
    this.#el.defaultNote = byId('welcome-note').innerHTML;
    this.#el.startButton.focus();

    // Victory: the ✕ button closes it.
    byId('btn-victory-close').addEventListener('click', () => this.#el.victory.close());

    // Time's up / Summary must not be closed with Esc.
    this.#el.summary.addEventListener('cancel', (event) => event.preventDefault());

    byId('btn-copy').addEventListener('click', () => this.#copyResult());
  }

  // ----- Welcome -----

  /**
   * Safety net: the starting position must stay visible. Called once the
   * board is drawn, and again when the window is resized or Projector Mode
   * changes. Starts from the normal layout, then makes the card shorter
   * step by step while it still covers the top disk of Peg A:
   *   1. hide the poster banner (decoration),  2. collapse the rules,
   *   3. compact card (tighter spacing; small phones).
   * The rules go late because beginners need them most.
   */
  fitWelcome() {
    if (this.#el.welcome.hidden) return;
    const welcome = this.#el.welcome;
    this.#el.welcomeRules.open = this.#rulesOpenByDefault();
    this.#el.banner.hidden = false;
    welcome.classList.remove('welcome--compact');
    if (this.#welcomeCoversDisks()) this.#el.banner.hidden = true;
    if (this.#welcomeCoversDisks()) this.#el.welcomeRules.open = false;
    if (this.#welcomeCoversDisks()) welcome.classList.add('welcome--compact');
  }

  /**
   * Show the welcome card again (after practice) with the board locked.
   * @param {string|null} note  a message for the player, or null for the usual note
   */
  showWelcome(note = null) {
    const noteEl = this.#doc.getElementById('welcome-note');
    if (note) noteEl.textContent = note;
    else noteEl.innerHTML = this.#el.defaultNote;
    this.#el.welcome.hidden = false;
    this.#el.locked.forEach((el) => { el.inert = true; });
    this.fitWelcome();
    this.#el.startButton.focus();
  }

  /**
   * Hide or show only the CARD (the board stays locked). Used by the guided
   * tour, so the spotlight can show the real board with its disks.
   */
  setWelcomeCardVisible(visible) {
    this.#el.welcome.hidden = !visible;
    if (visible) {
      this.fitWelcome();
      // Keyboard users land on "Start Challenge" again (focus was lost while the card was hidden).
      this.#el.startButton.focus();
    }
  }

  #rulesOpenByDefault() {
    return this.#doc.defaultView.matchMedia('(min-width: 600px)').matches;
  }

  #welcomeCoversDisks() {
    const topDisk = this.#doc.querySelector('#board .disks')?.lastElementChild;
    if (!topDisk) return false;
    const card = this.#el.welcome.firstElementChild;
    return card.getBoundingClientRect().bottom > topDisk.getBoundingClientRect().top;
  }

  hideWelcome() {
    this.#el.welcome.hidden = true;
    this.#el.locked.forEach((el) => { el.inert = false; });
  }

  // ----- Victory -----

  /**
   * @param {object} info  { diskCount, moves, minimum, stars, efficiency,
   *   perfect, score, timeMs, hints, nextLevel, personalBest }
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

    // Personal best (only when the browser can remember it).
    const best = byId('victory-best');
    best.textContent = personalBestText(n, info.personalBest);
    best.hidden = best.textContent === '';

    this.#el.victory.showModal();
    (info.nextLevel === null ? again : next).focus();
    launchConfetti(this.#el.victory); // inside the dialog, so it shows above the backdrop
  }

  /** Close the victory modal (if open). */
  closeAll() {
    if (this.#el.victory.open) this.#el.victory.close();
  }

  // ----- Time's up and the Final Summary -----

  showTimeUp() {
    this.#el.timeUp.hidden = false;
  }

  /**
   * @param {object} summary   Stats.summary()
   * @param {string} nickname
   * @param {{bests, newBestScore}|null} personal  null when nothing can be saved
   */
  showSummary(summary, nickname, personal = null) {
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

    // Best result per level (this challenge), and the best ever if saved.
    this.#doc.querySelector('.best-ever').hidden = !personal;
    byId('summary-best').replaceChildren(...DIFFICULTIES.map((n) => {
      const best = summary.bestByLevel[n];
      const ever = personal?.bests.levels[n];
      const row = this.#doc.createElement('tr');
      const cells = [
        `${n} disks`,
        best ? String(best.fewestMoves) : '—',
        best ? ChallengeTimer.format(best.fastestMs) : '—',
      ];
      if (personal) cells.push(ever ? `${ever.fewestMoves} moves, ${ChallengeTimer.format(ever.fastestMs)}` : '—');
      for (const text of cells) {
        const cell = this.#doc.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      return row;
    }));

    const bestScore = byId('summary-best-score');
    bestScore.hidden = !personal;
    if (personal) {
      bestScore.textContent = personal.newBestScore ? ' New best score!' : ` (your best: ${personal.bests.bestScore})`;
    }

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

/** The personal-best line in the victory modal ('' = show nothing). */
function personalBestText(n, improved) {
  if (!improved) return '';
  if (improved.first) return `First time clearing ${n} disks: personal best saved.`;
  if (improved.moves && improved.time) return `New personal best for ${n} disks: fewest moves and fastest time!`;
  if (improved.moves) return `New personal best for ${n} disks: fewest moves!`;
  if (improved.time) return `New personal best for ${n} disks: fastest time!`;
  return '';
}
