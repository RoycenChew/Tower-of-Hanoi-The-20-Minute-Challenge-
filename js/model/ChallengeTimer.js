// ChallengeTimer.js — the 20-minute challenge countdown.
//
// WHY THERE IS NO PAUSE: the assignment says the clock must run continuously,
// even during hints, Learning Mode, restarts and difficulty changes. The
// safest way to guarantee that is to make pausing IMPOSSIBLE: this class has
// no pause(), stop() or reset() method at all. Once started, the only way to
// get a fresh clock is to reload the page.
//
// WHY WE STORE AN END TIME: we never count down by subtracting 250 ms per
// tick. Browsers slow down or freeze timers in background tabs, so counting
// ticks would drift. Instead we remember the moment the challenge ends
// (endAt) and always compute  remaining = endAt − now.  Even after a long
// gap, the next tick shows the correct time.
//
// States: IDLE -> RUNNING -> EXPIRED (EXPIRED is final).

export const CHALLENGE_MS = 20 * 60 * 1000;
export const WARN5_MS = 5 * 60 * 1000;
export const WARN1_MS = 1 * 60 * 1000;
export const TICK_MS = 250;

export const TimerState = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  EXPIRED: 'EXPIRED',
});

export class ChallengeTimer {
  #bus;
  #now;
  #setInterval;
  #clearInterval;
  #durationMs;

  #state = TimerState.IDLE;
  #endAt = null;
  #intervalId = null;
  // Each warning fires at most once, even if a long gap skips past it.
  #fired = { warn5: false, warn1: false };

  /**
   * @param {EventBus|null} bus
   * @param {object} [options]  the clock and timer functions can be replaced
   *   by fakes in tests, so we can "fast-forward" 20 minutes instantly.
   */
  constructor(bus, {
    now = () => Date.now(),
    setInterval = (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval = (id) => globalThis.clearInterval(id),
    durationMs = CHALLENGE_MS,
  } = {}) {
    this.#bus = bus;
    this.#now = now;
    this.#setInterval = setInterval;
    this.#clearInterval = clearInterval;
    this.#durationMs = durationMs;
  }

  /** IDLE, RUNNING or EXPIRED. */
  get state() {
    return this.#state;
  }

  /** Start the countdown. Works only once; returns false if already started. */
  start() {
    if (this.#state !== TimerState.IDLE) return false;
    this.#endAt = this.#now() + this.#durationMs;
    this.#state = TimerState.RUNNING;
    this.#intervalId = this.#setInterval(() => this.#tick(), TICK_MS);
    this.#tick(); // show 20:00 straight away
    return true;
  }

  /** Milliseconds left: full duration before start, 0 after expiry. */
  remaining() {
    if (this.#state === TimerState.IDLE) return this.#durationMs;
    if (this.#state === TimerState.EXPIRED) return 0;
    return Math.max(0, this.#endAt - this.#now());
  }

  /**
   * Force a tick right now. The controller calls this when the tab becomes
   * visible again (visibilitychange), so the display and any missed warnings
   * update immediately instead of waiting for the next interval.
   */
  refresh() {
    this.#tick();
  }

  /** DEBUG ONLY (?debug=1): jump so that `ms` remain. */
  debugSetRemaining(ms) {
    if (this.#state !== TimerState.RUNNING) return;
    this.#endAt = this.#now() + ms;
    this.#tick();
  }

  /** Format milliseconds as mm:ss, rounding UP so 00:00 only shows at the real end. */
  static format(ms) {
    const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  // ----- private -----

  #tick() {
    if (this.#state !== TimerState.RUNNING) return;

    const ms = this.remaining();
    this.#emit('timer:tick', ms);

    // "<=" plus a fired flag: if the tab slept through 5:00 AND 1:00, the
    // first tick afterwards still fires both warnings, once each, in order.
    if (ms <= WARN5_MS && !this.#fired.warn5) {
      this.#fired.warn5 = true;
      this.#emit('timer:warn5', ms);
    }
    if (ms <= WARN1_MS && !this.#fired.warn1) {
      this.#fired.warn1 = true;
      this.#emit('timer:warn1', ms);
    }
    if (ms <= 0) {
      this.#expire();
    }
  }

  #expire() {
    this.#state = TimerState.EXPIRED; // final: nothing can leave this state
    this.#clearInterval(this.#intervalId);
    this.#intervalId = null;
    this.#emit('timer:expired', 0);
  }

  #emit(event, data) {
    this.#bus?.emit(event, data);
  }
}
