// Sound.js — tiny sound effects made with the Web Audio API (no audio files).
//
// Each sound is a few short notes: an oscillator (the tone) through a gain
// node (the volume), with a quick fade in and out so it never clicks.
// Browsers only allow audio after the player has clicked or pressed a key,
// so unlock() is called on the first interaction.

/** Each note: frequency (Hz), start (s), length (s), wave shape, volume. */
const SOUNDS = {
  move: [{ f: 660, t: 0, d: 0.07, type: 'sine', v: 0.12 }],
  invalid: [
    { f: 160, t: 0, d: 0.12, type: 'square', v: 0.05 },
    { f: 120, t: 0.1, d: 0.16, type: 'square', v: 0.05 },
  ],
  win: [523.25, 659.25, 783.99, 1046.5].map((f, i) => ({ f, t: i * 0.09, d: 0.22, type: 'triangle', v: 0.14 })),
  warning: [
    { f: 880, t: 0, d: 0.16, type: 'triangle', v: 0.14 },
    { f: 660, t: 0.2, d: 0.22, type: 'triangle', v: 0.14 },
  ],
};

export class Sound {
  #context = null;
  #muted;

  constructor({ muted = false } = {}) {
    this.#muted = muted;
  }

  get muted() {
    return this.#muted;
  }

  setMuted(muted) {
    this.#muted = muted;
  }

  /** Create or wake up the audio engine. Must run inside a click or key press. */
  unlock() {
    const AudioEngine = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioEngine) return; // no Web Audio: the game simply stays silent
    try {
      this.#context ??= new AudioEngine();
      if (this.#context.state === 'suspended') this.#context.resume().catch(() => {});
    } catch {
      this.#context = null;
    }
  }

  /** @param {'move'|'invalid'|'win'|'warning'} name */
  play(name) {
    const ctx = this.#context;
    if (this.#muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
    for (const note of SOUNDS[name]) this.#tone(ctx, note);
  }

  #tone(ctx, { f, t, d, type, v }) {
    const start = ctx.currentTime + t;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = f;
    // Quick fade in, then fade out: no clicks.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(v, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + d + 0.02);
  }
}
