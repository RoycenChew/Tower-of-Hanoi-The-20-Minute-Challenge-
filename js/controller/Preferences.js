// Preferences.js — remembers small things between visits, in localStorage:
// sound on/off, Projector Mode, the nickname and personal bests.
//
// This is the ONLY file that touches localStorage. Every read and write is
// wrapped in try/catch, because storage can be missing or blocked (private
// browsing, full disk, strict privacy settings). If it fails, the game still
// works; it just cannot remember anything, and personal bests are not shown.

const KEY = 'hanoi-challenge:v1';

/** localStorage if it really works, otherwise null. */
function browserStorage() {
  try {
    const storage = globalThis.localStorage;
    const probe = `${KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export class Preferences {
  #storage;
  #data;

  /**
   * @param {Storage|null} [storage]  defaults to the browser's localStorage;
   *   tests pass a fake one (or one that throws)
   */
  constructor(storage = browserStorage()) {
    this.#storage = storage;
    this.#data = this.#read();
  }

  /** False when nothing can be saved (then personal bests are not shown). */
  get available() {
    return this.#storage !== null;
  }

  get(name, fallback = null) {
    return Object.hasOwn(this.#data, name) ? this.#data[name] : fallback;
  }

  /** Save one value. Returns false (and carries on) if saving failed. */
  set(name, value) {
    this.#data[name] = value;
    if (!this.#storage) return false;
    try {
      this.#storage.setItem(KEY, JSON.stringify(this.#data));
      return true;
    } catch {
      return false;
    }
  }

  #read() {
    if (!this.#storage) return {};
    try {
      const parsed = JSON.parse(this.#storage.getItem(KEY) ?? '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {}; // broken or old data: start fresh
    }
  }
}
