// Input.js — turns browser events into controller calls.
//
// Every way the player can act goes through here: clicks, drag-and-drop and
// the keyboard. This file never decides whether an action is allowed; the
// controller does that.

/** A press must move this far before it counts as a drag (less = a click). */
export const DRAG_THRESHOLD_PX = 6;

/**
 * Which keyboard shortcut does this key press mean? A pure function (no DOM
 * access), so it can be unit-tested.
 *
 * Shortcuts are IGNORED while typing in a text box, while a dialog is open
 * and while the welcome card is showing. In Learning Mode only the demo
 * keys work (Space, Left, Right); the game keys are switched off.
 *
 * @param {{key: string, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean,
 *          repeat?: boolean, target?: object}} event
 * @param {{dialogOpen?: boolean, welcomeVisible?: boolean, learning?: boolean}} context
 * @returns {null | {action: string, peg?: number}}
 */
export function shortcutFor(event, { dialogOpen = false, welcomeVisible = false, learning = false } = {}) {
  if (dialogOpen || welcomeVisible) return null;
  const target = event.target;
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
    return null;
  }
  if (event.altKey || event.metaKey || (event.ctrlKey && learning)) return null;

  if (learning) {
    if (event.key === ' ' && !event.repeat) return { action: 'learn-toggle' };
    if (event.key === 'ArrowLeft') return { action: 'learn-prev' };   // holding the key repeats
    if (event.key === 'ArrowRight') return { action: 'learn-next' };
    return null;
  }

  if (event.repeat) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey) {
    // Ctrl+Z is our only Ctrl shortcut; Ctrl+R etc. stay with the browser.
    return key === 'z' ? { action: 'undo' } : null;
  }
  switch (key) {
    case 'a': case '1': return { action: 'peg', peg: 0 };
    case 'b': case '2': return { action: 'peg', peg: 1 };
    case 'c': case '3': return { action: 'peg', peg: 2 };
    case 'escape': return { action: 'deselect' };
    case 'u': return { action: 'undo' };
    case 'h': return { action: 'hint' };
    case 'r': return { action: 'restart' };
    default: return null;
  }
}

export class Input {
  #doc;
  #board;
  #controller;
  #learning;
  /** The drag in progress: { pointerId, peg, disk, x0, y0, started } or null. */
  #drag = null;
  /** After a real drag, the browser still fires a "click"; swallow it once. */
  #suppressClick = false;

  /**
   * @param {Document} doc
   * @param {object} parts
   * @param {Board} parts.board
   * @param {GameController} parts.controller
   * @param {LearningMode} parts.learning
   * @param {UIOverlay} parts.ui
   * @param {Modals} parts.modals
   * @param {Sound} parts.sound
   * @param {Preferences} parts.prefs
   */
  constructor(doc, { board, controller, learning, ui, modals, sound, prefs }) {
    this.#doc = doc;
    this.#board = board;
    this.#controller = controller;
    this.#learning = learning;
    const onClick = (id, action) => doc.getElementById(id).addEventListener('click', action);

    // ---- Pegs: click (or Enter/Space, because they are real <button>s) ----
    board.pegButtons.forEach((button, peg) => {
      button.addEventListener('click', () => controller.handlePegClick(peg));
    });

    // ---- Drag-and-drop (Pointer Events: mouse, pen and touch) ----
    const root = board.element;
    root.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    root.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    root.addEventListener('pointerup', (e) => this.#onPointerUp(e));
    root.addEventListener('pointercancel', (e) => this.#onPointerCancel(e));
    // On touch screens the browser first captures the pointer on the touched
    // DISK; when we move the capture to the board, the disk fires
    // lostpointercapture, which bubbles up here. Only the BOARD losing its
    // capture means the drag really ended.
    root.addEventListener('lostpointercapture', (e) => {
      if (e.target === root) this.#onPointerCancel(e);
    });
    root.addEventListener('click', (e) => {
      if (this.#suppressClick) {
        this.#suppressClick = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true); // capture phase: runs before the peg's own click listener

    // When time runs out mid-drag, the controller calls this.
    controller.setCancelDrag(() => this.cancelDrag());

    // ---- Welcome card: a <form>, so Enter in the nickname box also starts ----
    doc.getElementById('welcome-form').addEventListener('submit', (event) => {
      event.preventDefault();
      controller.start(doc.getElementById('nickname').value);
    });

    // ---- Controls and difficulty ----
    onClick('btn-hint', () => controller.hint());
    onClick('btn-undo', () => controller.undo());
    onClick('btn-restart', () => controller.restart());
    doc.querySelectorAll('[data-disks]').forEach((button) => {
      button.addEventListener('click', () => controller.setDifficulty(Number(button.dataset.disks)));
    });

    // ---- Victory modal ----
    onClick('btn-next-level', () => controller.nextLevel());
    onClick('btn-play-again', () => controller.playAgain());
    onClick('btn-see-optimal', () => controller.openLearning(controller.diskCount));
    doc.getElementById('victory').addEventListener('close', () => controller.closeVictory());

    // ---- Learning Mode ----
    onClick('btn-learn', () => controller.openLearning(3)); // the demo starts with 3 disks
    onClick('btn-back', () => controller.closeLearning());
    onClick('btn-learn-prev', () => learning.previous());
    onClick('btn-learn-next', () => learning.next());
    onClick('btn-learn-play', () => learning.togglePlay());
    onClick('btn-learn-reset', () => learning.reset());
    doc.querySelectorAll('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => learning.setSpeed(Number(button.dataset.speed)));
    });
    doc.querySelectorAll('[data-learn-disks]').forEach((button) => {
      button.addEventListener('click', () => learning.setDiskCount(Number(button.dataset.learnDisks)));
    });
    // Step list: one listener for all steps (they are re-drawn for 3, 4 or 5 disks).
    doc.getElementById('learn-steps').addEventListener('click', (event) => {
      const step = event.target.closest('[data-step]');
      if (step) learning.seek(Number(step.dataset.step));
    });

    // ---- Final summary: a brand-new challenge means a brand-new page (and clock) ----
    onClick('btn-new-challenge', () => doc.location.reload());

    // ---- Keyboard ----
    doc.addEventListener('keydown', (event) => this.#onKeyDown(event));

    // ---- Sound: browsers allow audio only after a click or key press ----
    const unlockAudio = () => sound.unlock();
    doc.addEventListener('pointerdown', unlockAudio, { capture: true });
    doc.addEventListener('keydown', unlockAudio, { capture: true });

    // ---- Top-bar tools (both choices are remembered) ----
    onClick('btn-mute', () => {
      sound.setMuted(!sound.muted);
      prefs.set('muted', sound.muted);
      ui.setMuted(sound.muted);
    });
    onClick('btn-projector', () => {
      const on = !doc.documentElement.classList.contains('projector');
      ui.setProjector(on);
      prefs.set('projector', on);
      modals.fitWelcome(); // bigger text: make sure the card still leaves the disks visible
    });

    // ---- Window width changes: re-check that the welcome card fits ----
    // (Only the WIDTH: phones fire "resize" when the address bar slides,
    // and that must not close rules the player has opened.)
    let width = doc.defaultView.innerWidth;
    doc.defaultView.addEventListener('resize', () => {
      if (doc.defaultView.innerWidth === width) return;
      width = doc.defaultView.innerWidth;
      modals.fitWelcome();
    });
  }

  /** Abort a drag: the disk goes back under normal control (no counting). */
  cancelDrag() {
    if (!this.#drag) return;
    const { pointerId, started } = this.#drag;
    this.#drag = null;
    if (started) {
      this.#board.clearDrag();
      if (this.#board.element.hasPointerCapture(pointerId)) {
        this.#board.element.releasePointerCapture(pointerId);
      }
    }
  }

  // ===================== Drag-and-drop =====================

  #onPointerDown(e) {
    this.#suppressClick = false;
    if (e.button !== 0 || this.#drag) return;
    const diskEl = e.target.closest('.disk');
    if (!diskEl) return; // pressing an empty part of a peg is just a click
    this.#drag = {
      pointerId: e.pointerId,
      peg: Number(diskEl.closest('.peg').dataset.peg),
      disk: Number(diskEl.dataset.disk),
      x0: e.clientX,
      y0: e.clientY,
      started: false,
    };
  }

  #onPointerMove(e) {
    const drag = this.#drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;

    if (!drag.started) {
      // Under 6 px it is still a click; the normal click handler will run.
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      // The controller checks "top disk only", Time's up, busy, ...
      if (!this.#controller.beginDrag(drag.peg, drag.disk)) {
        this.#drag = null;
        this.#suppressClick = true; // this press was a refused drag, not a click
        return;
      }
      drag.started = true;
      this.#suppressClick = true;
      // Capture: keep receiving this pointer's events even outside the board.
      this.#board.element.setPointerCapture(e.pointerId);
      this.#board.startDrag(drag.peg);
    }

    this.#board.dragTo(dx, dy);
    const target = this.#board.pegAt(e.clientX, e.clientY);
    if (target === null || target === drag.peg) {
      this.#board.setDropHint(null, false);
    } else {
      this.#board.setDropHint(target, this.#controller.previewDrop(drag.peg, target));
    }
  }

  #onPointerUp(e) {
    // The browser fires its "click" right after pointerup. If it fires none,
    // make sure the flag cannot eat a later, unrelated click (e.g. Enter key).
    if (this.#suppressClick) setTimeout(() => { this.#suppressClick = false; }, 0);

    const drag = this.#drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.#drag = null;
    if (!drag.started) return; // a click: handled by the peg's click listener

    const target = this.#board.pegAt(e.clientX, e.clientY);
    const dropRect = this.#board.dragRect();
    this.#board.clearDrag();
    if (target === null || target === drag.peg) {
      this.#controller.cancelDrop(drag.peg, dropRect); // back quietly, not counted
    } else {
      this.#controller.dropDisk(drag.peg, target, dropRect); // a real move attempt
    }
  }

  #onPointerCancel(e) {
    const drag = this.#drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.#drag = null;
    if (!drag.started) return;
    const dropRect = this.#board.dragRect();
    this.#board.clearDrag();
    this.#controller.cancelDrop(drag.peg, dropRect);
  }

  // ===================== Keyboard =====================

  #onKeyDown(event) {
    const shortcut = shortcutFor(event, {
      dialogOpen: this.#doc.querySelector('dialog[open]') !== null,
      welcomeVisible: !this.#doc.getElementById('welcome').hidden,
      learning: this.#learning.isOpen,
    });
    if (!shortcut) return;
    // Also stops Space from "clicking" the focused button a second time.
    event.preventDefault();

    const c = this.#controller;
    const learn = this.#learning;
    switch (shortcut.action) {
      case 'learn-toggle': learn.togglePlay(); break;
      case 'learn-prev': learn.previous(); break;
      case 'learn-next': learn.next(); break;
      case 'peg': c.handlePegClick(shortcut.peg); break;
      case 'deselect': c.cancelSelection(); break;
      case 'undo': c.undo(); break;
      case 'hint': c.hint(); break;
      case 'restart': c.requestRestartByKey(); break;
      default: break;
    }
  }
}
