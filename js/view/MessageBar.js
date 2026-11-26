// MessageBar.js — decides WHICH message the fixed-height message bar shows.
//
// Two kinds of message:
//   - normal messages (errors, hints, "Disk 1 selected...") replace each other;
//   - BANNERS (timer warnings: "5 minutes remaining!", "Final minute!") are
//     shown for a fixed time (4 s) and must not be lost.
//
// PRIORITY RULE: if an error or hint arrives while a banner is showing, the
// error is shown at once (the player needs to know why the move failed) and
// the banner's countdown PAUSES. About 2 s after the last interruption, the
// banner comes back for the time it still had left. So every warning gets
// its full 4 seconds on screen. When the banner ends, the bar goes back to
// the latest normal message.
//
// This class only decides what to show; the actual drawing is the `render`
// function it is given. The timer functions can be replaced in tests.

export const DEFAULT_PROMPT = 'Click a peg to pick up its top disk.';
export const BANNER_MS = 4000;
export const INTERRUPT_MS = 2000;

export class MessageBar {
  #render;
  #setTimeout;
  #clearTimeout;
  #now;

  /** The latest normal message (what the bar returns to after a banner). */
  #base = { text: DEFAULT_PROMPT, type: 'info' };
  /** The active banner, or null: { text, type, remainingMs }. */
  #banner = null;
  #bannerOnScreenSince = null; // null while the banner is hidden by an interruption
  #bannerTimer = null;
  #resumeTimer = null;

  /**
   * @param {(text: string, type: string) => void} render  draws one message
   */
  constructor(render, {
    setTimeout = (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout = (id) => globalThis.clearTimeout(id),
    now = () => Date.now(),
  } = {}) {
    this.#render = render;
    this.#setTimeout = setTimeout;
    this.#clearTimeout = clearTimeout;
    this.#now = now;
  }

  /** Show a normal message (type: info, error, hint, success, warning). */
  show(text, type = 'info') {
    this.#base = { text, type };

    if (this.#banner) {
      this.#pauseBanner();
      // Bring the banner back 2 s after the LATEST interruption.
      this.#clearTimeout(this.#resumeTimer);
      this.#resumeTimer = this.#setTimeout(() => this.#showBanner(), INTERRUPT_MS);
    }
    this.#render(text, type);
  }

  /** Back to the default instruction. */
  clear() {
    this.show(DEFAULT_PROMPT, 'info');
  }

  /** Show a timer warning for `durationMs` of on-screen time. A new banner replaces an old one. */
  showBanner(text, type = 'warning', durationMs = BANNER_MS) {
    this.#clearTimeout(this.#bannerTimer);
    this.#clearTimeout(this.#resumeTimer);
    this.#banner = { text, type, remainingMs: durationMs };
    this.#showBanner();
  }

  // ----- private -----

  #showBanner() {
    if (!this.#banner) return;
    this.#bannerOnScreenSince = this.#now();
    this.#render(this.#banner.text, this.#banner.type);
    this.#bannerTimer = this.#setTimeout(() => this.#endBanner(), this.#banner.remainingMs);
  }

  /** Stop the banner's countdown and remember how much time it has left. */
  #pauseBanner() {
    if (this.#bannerOnScreenSince === null) return; // already hidden
    const shownFor = this.#now() - this.#bannerOnScreenSince;
    this.#banner.remainingMs = Math.max(0, this.#banner.remainingMs - shownFor);
    this.#bannerOnScreenSince = null;
    this.#clearTimeout(this.#bannerTimer);
  }

  #endBanner() {
    this.#banner = null;
    this.#bannerOnScreenSince = null;
    this.#render(this.#base.text, this.#base.type);
  }
}
