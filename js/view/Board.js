// Board.js — draws the three pegs and their disks, and animates them.
//
// The view never decides anything. It receives a read-only snapshot from the
// model and draws exactly that. Reading the pegs with toArray() is allowed
// HERE, because drawing is the one job toArray() exists for.
//
// HOW A MOVE IS ANIMATED ("FLIP": First, Last, Invert, Play):
//   First  — before the move, the controller measures where the disk is.
//   Last   — the model moves the disk and the board is redrawn: the disk is
//            already in its NEW place.
//   Invert — we push the disk back to its OLD place with a transform.
//   Play   — we animate that transform back to zero: lift, slide, drop.
// Only `transform` is animated, which phones can do smoothly on the GPU.

import { PEG_NAMES, PEG_LETTERS } from '../model/Rules.js';

const SHAKE_MS = 300;
const HINT_MS = 3000;
const RETURN_MS = 150;

/** Gameplay moves: about 300 ms in total. */
export const GAME_TIMING = Object.freeze({ lift: 80, slide: 140, drop: 80 });
/** Learning Mode (Phase 5): slower, easier to follow. */
export const LEARN_TIMING = Object.freeze({ lift: 150, slide: 250, drop: 150 });

/** True when the player asked their device for less motion. */
export function reducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export class Board {
  #root;
  #hintTimer = null;
  #dragged = null; // the disk element being dragged

  /** @param {HTMLElement} root  the .board element containing three .peg buttons */
  constructor(root) {
    this.#root = root;
    /** The three peg buttons (index 0, 1, 2 = A, B, C). Input.js listens to them. */
    this.pegButtons = [...root.querySelectorAll('.peg')];
  }

  /** The .board element (Input.js listens to pointer events on it). */
  get element() {
    return this.#root;
  }

  /**
   * Draw the board.
   * @param {object} snapshot              from GameState.snapshot()
   * @param {{selectedPeg: number|null}} ui  which peg's top disk is lifted
   */
  render(snapshot, { selectedPeg = null } = {}) {
    this.#root.classList.toggle('has-selection', selectedPeg !== null);

    snapshot.pegs.forEach((disks, peg) => {
      const button = this.pegButtons[peg];
      const isSelected = peg === selectedPeg;

      // disks is bottom -> top, e.g. [3, 2, 1]; the last one is the top disk.
      const diskElements = disks.map((disk, position) =>
        makeDisk(disk, snapshot.diskCount, isSelected && position === disks.length - 1));
      button.querySelector('.disks').replaceChildren(...diskElements);

      button.classList.toggle('is-selected', isSelected);
      // Game pegs are buttons; the Learning Mode demo pegs are not clickable.
      if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(isSelected));
      button.setAttribute('aria-label', describePeg(peg, disks, isSelected));
    });
  }

  // ===================== Move animations =====================

  /** Where the top disk of a peg is on screen right now (the "First" of FLIP). */
  measureTopDisk(peg) {
    return this.#topDisk(peg)?.getBoundingClientRect() ?? null;
  }

  /** Where a given disk is drawn right now (used by the Learning Mode demo). */
  measureDisk(disk) {
    return this.#root.querySelector(`.disk[data-disk="${disk}"]`)?.getBoundingClientRect() ?? null;
  }

  /**
   * Animate `disk` from `fromRect` (its old place) to where it is drawn now:
   * lift -> slide -> drop. Resolves when done (at once with reduced motion).
   */
  async animateMove(disk, fromRect, timing = GAME_TIMING) {
    const el = this.#root.querySelector(`.disk[data-disk="${disk}"]`);
    if (!el || !fromRect || reducedMotion()) return;

    const to = el.getBoundingClientRect();
    const dx = fromRect.left - to.left;
    const dy = fromRect.top - to.top;
    // Travel height: the top of the peg area, above every rod.
    const airY = Math.min(dy, el.closest('.peg-area').getBoundingClientRect().top - to.top);

    const total = timing.lift + timing.slide + timing.drop;
    await this.#play(el, [
      { transform: `translate(${dx}px, ${dy}px)`, offset: 0, easing: 'ease-out' },
      { transform: `translate(${dx}px, ${airY}px)`, offset: timing.lift / total, easing: 'ease-in-out' },
      { transform: `translate(0px, ${airY}px)`, offset: (timing.lift + timing.slide) / total, easing: 'ease-in' },
      { transform: 'translate(0px, 0px)', offset: 1 },
    ], total);
  }

  /** Animate the top disk of `peg` back from `fromRect` (e.g. a cancelled drop). */
  async animateReturn(peg, fromRect) {
    const el = this.#topDisk(peg);
    if (!el || !fromRect || reducedMotion()) return;
    const to = el.getBoundingClientRect();
    await this.#play(el, [
      { transform: `translate(${fromRect.left - to.left}px, ${fromRect.top - to.top}px)` },
      { transform: 'translate(0px, 0px)' },
    ], RETURN_MS);
  }

  /**
   * Jump every running board animation to its end, so the screen shows the
   * real state at once (used when time runs out).
   */
  finishAnimations() {
    for (const animation of this.#root.getAnimations({ subtree: true })) {
      try {
        animation.finish();
      } catch {
        animation.cancel(); // an endless animation cannot "finish"; just stop it
      }
    }
  }

  async #play(el, keyframes, duration) {
    el.classList.add('is-moving'); // above the other pegs while it travels
    try {
      await el.animate(keyframes, { duration }).finished;
    } catch {
      // cancelled: fine, the model is already right
    } finally {
      el.classList.remove('is-moving');
    }
  }

  // ===================== Dragging =====================

  /** Start dragging the top disk of `peg`. Returns its current rectangle. */
  startDrag(peg) {
    this.#dragged = this.#topDisk(peg);
    this.#dragged?.classList.add('is-dragging');
    return this.#dragged?.getBoundingClientRect() ?? null;
  }

  /** Move the dragged disk by (dx, dy) pixels from where it started. */
  dragTo(dx, dy) {
    if (this.#dragged) this.#dragged.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Where the dragged disk is right now (the starting point of the drop animation). */
  dragRect() {
    return this.#dragged?.getBoundingClientRect() ?? null;
  }

  /**
   * Which peg column is under the point (x, y)? The WHOLE column counts as the
   * drop target, not just the thin rod. Returns null outside every peg.
   */
  pegAt(x, y) {
    const board = this.#root.getBoundingClientRect();
    if (y < board.top || y > board.bottom) return null;
    const index = this.pegButtons.findIndex((button) => {
      const r = button.getBoundingClientRect();
      return x >= r.left && x <= r.right;
    });
    return index === -1 ? null : index;
  }

  /** Outline the peg under the pointer: green = legal drop, red = not. null clears. */
  setDropHint(peg, legal) {
    this.pegButtons.forEach((button, i) => {
      const area = button.querySelector('.peg-area');
      area.classList.toggle('drop-ok', i === peg && legal);
      area.classList.toggle('drop-bad', i === peg && !legal);
    });
  }

  /** Put the dragged disk back under normal control (no transform, no hint). */
  clearDrag() {
    if (this.#dragged) {
      this.#dragged.style.transform = '';
      this.#dragged.classList.remove('is-dragging');
    }
    this.#dragged = null;
    this.setDropHint(null, false);
  }

  // ===================== Feedback =====================

  /**
   * Hint: the suggested disk and the target peg pulse blue for 3 seconds.
   * Nothing moves; this is only a highlight.
   */
  highlightHint({ from, to }) {
    clearTimeout(this.#hintTimer);
    this.#clearHint();
    this.#topDisk(from)?.classList.add('is-hint');
    this.pegButtons[to].querySelector('.peg-area').classList.add('is-hint-target');
    this.#hintTimer = setTimeout(() => this.#clearHint(), HINT_MS);
  }

  /** Shake a whole peg (e.g. clicking an empty peg as the source). */
  shakePeg(peg) {
    shake(this.pegButtons[peg].querySelector('.peg-area'));
  }

  /** Shake the top disk of a peg (e.g. after an invalid move). */
  shakeTopDisk(peg) {
    const topDisk = this.#topDisk(peg);
    if (topDisk) shake(topDisk);
  }

  #topDisk(peg) {
    return this.pegButtons[peg].querySelector('.disks').lastElementChild;
  }

  #clearHint() {
    this.#root.querySelectorAll('.is-hint, .is-hint-target')
      .forEach((el) => el.classList.remove('is-hint', 'is-hint-target'));
  }
}

/** One disk element. --d and --n feed the width formula in board.css. */
function makeDisk(disk, diskCount, lifted) {
  const el = document.createElement('span');
  el.className = lifted ? 'disk is-lifted' : 'disk';
  el.dataset.disk = String(disk);
  el.style.setProperty('--d', disk);
  el.style.setProperty('--n', diskCount);
  el.textContent = String(disk);
  el.setAttribute('aria-hidden', 'true'); // the peg's aria-label already describes its disks
  return el;
}

/** e.g. "Peg A, Source, 3 disks, top disk 1" or "Peg B, Spare, empty". */
function describePeg(peg, disks, isSelected) {
  const role = PEG_NAMES[peg].split('— ')[1]; // "Source" / "Spare" / "Target"
  let text = `Peg ${PEG_LETTERS[peg]}, ${role}, `;
  if (disks.length === 0) {
    text += 'empty';
  } else {
    text += `${disks.length} ${disks.length === 1 ? 'disk' : 'disks'}, top disk ${disks.at(-1)}`;
  }
  return isSelected ? `${text}, selected` : text;
}

/**
 * Restart the shake animation on an element.
 * We remove the class with a timer (not 'animationend') so it is also
 * removed when reduced motion turns the animation off.
 */
function shake(el) {
  el.classList.remove('is-shaking');
  void el.offsetWidth; // force the browser to notice the removal, so the animation restarts
  el.classList.add('is-shaking');
  setTimeout(() => el.classList.remove('is-shaking'), SHAKE_MS);
}
