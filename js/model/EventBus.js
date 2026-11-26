// EventBus.js — a tiny publish/subscribe helper.
//
// WHY: the model (pegs, rules, timer) must never touch the DOM, so it cannot
// update the screen itself. Instead it *announces* what happened
// ("state:changed", "timer:tick", ...) and the UI listens. This one-way link is
// what lets the whole model run inside Node unit tests with no browser.
//
// Events used in this project:
//   state:changed, move:invalid, puzzle:solved,
//   timer:tick, timer:warn5, timer:warn1, timer:expired, learn:step

export class EventBus {
  // event name -> Set of listener functions
  #listeners = new Map();

  /**
   * Subscribe to an event.
   * @returns {Function} call it to unsubscribe (same as off()).
   */
  on(event, fn) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  /** Unsubscribe a listener. Does nothing if it was not subscribed. */
  off(event, fn) {
    this.#listeners.get(event)?.delete(fn);
  }

  /** Call every listener of `event` with `data`. */
  emit(event, data) {
    const set = this.#listeners.get(event);
    if (!set) return;
    // Iterate over a COPY (a snapshot taken right now). If a listener
    // subscribes or unsubscribes someone while we are looping, this emit still
    // reaches exactly the listeners that existed when it started — nobody is
    // skipped and nobody is called twice. Changes apply from the next emit.
    for (const fn of [...set]) {
      fn(data);
    }
  }
}
