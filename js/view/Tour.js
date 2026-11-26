// Tour.js — a short guided tour for first-time players.
//
// Five steps, each pointing at the part of the screen it talks about: a
// "spotlight" (a hole in a dark layer) around that part, and a small card
// with the explanation. Back / Next / Skip tour. On the first visit the last
// step offers a practice puzzle. The "?" button in the top bar opens the
// tour again at any time.
//
// The tour only SHOWS things. It never touches the game or the timer: if it
// is opened during a challenge, the clock keeps running (and the card says so).

export const TOUR_STEPS = Object.freeze([
  {
    target: '#board',
    title: 'The goal',
    text: 'Move the whole tower from Peg A to Peg C. All the disks start on Peg A.',
  },
  {
    target: '#board',
    title: 'How to move',
    text: 'Tap a peg to pick up its top disk, then tap another peg to drop it there. You can also drag a disk.',
  },
  {
    target: '#board',
    title: 'The one rule',
    text: 'Only the top disk can move, and a bigger disk can never go on a smaller one. The game stops a wrong move and tells you why.',
  },
  {
    target: '.timer-chip',
    title: 'The clock',
    text: 'You have 20 minutes to solve as many puzzles as you can. The clock starts when you press Start Challenge, and it never pauses.',
  },
  {
    target: '.controls',
    title: 'Help is always here',
    text: 'Stuck? Hint shows the best next move. Undo takes a move back. Learning Mode shows how a computer solves the puzzle, step by step.',
  },
]);

export class Tour {
  #doc;
  #el;
  #index = 0;
  #offerPractice = false;
  #onOpen;
  #onClose;

  /**
   * @param {Document} doc
   * @param {object} handlers
   * @param {() => void} handlers.onOpen
   * @param {(choice: 'practice'|'done'|'skip') => void} handlers.onClose
   */
  constructor(doc, { onOpen = () => {}, onClose = () => {} } = {}) {
    this.#doc = doc;
    this.#onOpen = onOpen;
    this.#onClose = onClose;
    const byId = (id) => doc.getElementById(id);
    this.#el = {
      dialog: byId('tour'),
      spotlight: byId('tour-spotlight'),
      count: byId('tour-count'),
      title: byId('tour-title'),
      text: byId('tour-text'),
      note: byId('tour-note'),
      steps: byId('tour-steps'),
      choice: byId('tour-choice'),
      back: byId('btn-tour-back'),
      next: byId('btn-tour-next'),
    };

    this.#el.back.addEventListener('click', () => this.#show(this.#index - 1));
    this.#el.next.addEventListener('click', () => {
      if (this.#index < TOUR_STEPS.length - 1) this.#show(this.#index + 1);
      else this.#close('done');
    });
    byId('btn-tour-skip').addEventListener('click', () => this.#close('skip'));
    byId('btn-tour-practice').addEventListener('click', () => this.#close('practice'));
    byId('btn-tour-done').addEventListener('click', () => this.#close('done'));
    // Esc closes the tour (the same as "Skip tour").
    this.#el.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.#close('skip');
    });
    doc.defaultView.addEventListener('resize', () => {
      if (this.isOpen) this.#place();
    });
  }

  get isOpen() {
    return this.#el.dialog.open;
  }

  /**
   * @param {object} options
   * @param {boolean} options.offerPractice  last step offers a practice puzzle
   * @param {boolean} options.clockRunning   show "the clock keeps running"
   */
  start({ offerPractice = false, clockRunning = false } = {}) {
    if (this.isOpen) return;
    this.#offerPractice = offerPractice;
    this.#el.note.hidden = !clockRunning;
    this.#onOpen();
    this.#el.dialog.showModal();
    this.#show(0);
  }

  #show(index) {
    this.#index = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
    const step = TOUR_STEPS[this.#index];
    const last = this.#index === TOUR_STEPS.length - 1;

    this.#el.count.textContent = `Step ${this.#index + 1} of ${TOUR_STEPS.length}`;
    this.#el.title.textContent = step.title;
    this.#el.text.textContent = step.text;
    this.#el.back.disabled = this.#index === 0;
    this.#el.next.textContent = last ? 'Done' : 'Next';
    // Last step of the first visit: "Try a practice puzzle" or "go to the challenge".
    this.#el.choice.hidden = !(last && this.#offerPractice);
    this.#el.next.hidden = last && this.#offerPractice;
    this.#place();
    (this.#el.choice.hidden ? this.#el.next : this.#el.choice.querySelector('.btn')).focus();
  }

  /** Put the spotlight on the step's target and the card where it does not cover it. */
  #place() {
    const target = this.#doc.querySelector(TOUR_STEPS[this.#index].target);
    const r = target?.getBoundingClientRect();
    const { dialog, spotlight } = this.#el;

    if (!r || r.width === 0) { // target not on screen (e.g. in Learning Mode)
      spotlight.hidden = true;
      dialog.classList.remove('tour--top');
      return;
    }
    target.scrollIntoView({ block: 'nearest' });
    const box = target.getBoundingClientRect();
    const pad = 8;
    spotlight.hidden = false;
    spotlight.style.left = `${box.left - pad}px`;
    spotlight.style.top = `${box.top - pad}px`;
    spotlight.style.width = `${box.width + 2 * pad}px`;
    spotlight.style.height = `${box.height + 2 * pad}px`;
    // Card at the bottom, unless the target is mostly in the lower half.
    const lower = box.top + box.height / 2 > this.#doc.defaultView.innerHeight / 2;
    dialog.classList.toggle('tour--top', lower);
  }

  #close(choice) {
    this.#el.dialog.close();
    this.#el.spotlight.hidden = true;
    this.#onClose(choice);
  }
}
