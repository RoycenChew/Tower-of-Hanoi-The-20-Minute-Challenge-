// Board.js — draws the three pegs and their disks.
//
// The view never decides anything. It receives a read-only snapshot from the
// model and draws exactly that. Reading the pegs with toArray() is allowed
// HERE, because drawing is the one job toArray() exists for.

import { PEG_NAMES, PEG_LETTERS } from '../model/Rules.js';

const SHAKE_MS = 300;

export class Board {
  #root;

  /** @param {HTMLElement} root  the .board element containing three .peg buttons */
  constructor(root) {
    this.#root = root;
    /** The three peg buttons (index 0, 1, 2 = A, B, C). Input.js listens to them. */
    this.pegButtons = [...root.querySelectorAll('.peg')];
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
      button.setAttribute('aria-pressed', String(isSelected));
      button.setAttribute('aria-label', describePeg(peg, disks, isSelected));
    });
  }

  /** Shake a whole peg (e.g. clicking an empty peg as the source). */
  shakePeg(peg) {
    shake(this.pegButtons[peg].querySelector('.peg-area'));
  }

  /** Shake the top disk of a peg (e.g. after an invalid move). */
  shakeTopDisk(peg) {
    const topDisk = this.pegButtons[peg].querySelector('.disks').lastElementChild;
    if (topDisk) shake(topDisk);
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
