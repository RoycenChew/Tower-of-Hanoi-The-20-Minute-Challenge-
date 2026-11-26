// Glossary.js — plain-English explanations for the computer-science words.
//
// Any <button data-term="stack"> on the page becomes a small "what does this
// mean?" button: tap it (or press Enter) and a one-sentence explanation
// appears next to it. Tap again, tap elsewhere, scroll or press Esc to close.
// This lets beginners read the game in plain words, while the proper terms
// stay visible for anyone who wants them.

export const GLOSSARY = Object.freeze({
  stack: 'A stack is a pile where you can only add or take the item on top, like a pile of plates.',
  lifo: 'Last In, First Out: the last disk put on a peg is the first one you can take off.',
  pop: 'pop() takes the top disk off a stack.',
  push: 'push() puts a disk on top of a stack.',
  minimum: '2ⁿ − 1 is the fewest moves possible with n disks: 7 for 3 disks, 15 for 4, 31 for 5.',
  recursion: 'Recursion means solving a problem by first solving a smaller copy of the same problem.',
  callstack: "The call stack is the computer's pile of unfinished jobs. The newest job is on top and finishes first.",
  subtower: 'A sub-tower is a group of smaller disks that is moved as if it were one piece.',
});

/** Turn every [data-term] button on the page into a glossary button. */
export function initGlossary(doc = document) {
  const win = doc.defaultView;
  let open = null; // { button, tip }

  doc.querySelectorAll('[data-term]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
    if (!button.title) button.title = 'What does this mean?';
  });

  function close({ focusButton = false } = {}) {
    if (!open) return;
    open.button.setAttribute('aria-expanded', 'false');
    open.button.removeAttribute('aria-describedby');
    open.tip.remove();
    if (focusButton) open.button.focus();
    open = null;
  }

  function show(button) {
    const tip = doc.createElement('span');
    tip.className = 'tip';
    tip.id = `tip-${button.dataset.term}`;
    tip.setAttribute('role', 'tooltip');
    tip.textContent = GLOSSARY[button.dataset.term] ?? '';
    doc.body.append(tip);

    // Fixed position next to the button, kept inside the screen (never
    // causes sideways scrolling). It closes on scroll instead of following.
    const r = button.getBoundingClientRect();
    const width = tip.offsetWidth;
    const left = Math.min(Math.max(8, r.left), win.innerWidth - width - 8);
    const below = r.bottom + 8 + tip.offsetHeight < win.innerHeight;
    tip.style.left = `${left}px`;
    tip.style.top = below ? `${r.bottom + 6}px` : `${Math.max(8, r.top - tip.offsetHeight - 6)}px`;

    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-describedby', tip.id);
    open = { button, tip };
  }

  doc.addEventListener('click', (event) => {
    const button = event.target.closest('[data-term]');
    if (!button) {
      if (open && !event.target.closest('.tip')) close();
      return;
    }
    const same = open?.button === button;
    close();
    if (!same) show(button);
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) close({ focusButton: true });
  }, true);
  win.addEventListener('scroll', () => close(), { passive: true });
  win.addEventListener('resize', () => close());
}
