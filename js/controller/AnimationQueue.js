// AnimationQueue.js — runs animations ONE AT A TIME.
//
// PRINCIPLE: "state changes first, the picture catches up".
// The model is updated instantly when a move is made. The animation that
// follows only SHOWS the disk travelling from its old place to its new one.
// So if an animation is cut short (time runs out, page hidden...), the model
// is still right and a final redraw puts the picture back in sync.
//
// A job is a function that returns a Promise (e.g. "animate Disk 1 to Peg C").
// While a job runs, `busy` is true and the controller refuses new moves.

export class AnimationQueue {
  #jobs = [];       // waiting jobs: { job, resolve }
  #running = false;
  #generation = 0;  // increases on clear(), so a job that was cut off is ignored

  /** True while a job is running or waiting. */
  get busy() {
    return this.#running || this.#jobs.length > 0;
  }

  /**
   * Add a job to the end of the queue.
   * @param {() => Promise} job
   * @returns {Promise<boolean>} true when the job ran to the end,
   *   false if it was cleared (or failed)
   */
  add(job) {
    return new Promise((resolve) => {
      this.#jobs.push({ job, resolve });
      this.#runNext();
    });
  }

  /** Drop every waiting job and forget the running one (used when time runs out). */
  clear() {
    const dropped = this.#jobs;
    this.#jobs = [];
    dropped.forEach(({ resolve }) => resolve(false));
    this.#generation++;
    this.#running = false;
  }

  async #runNext() {
    if (this.#running) return;
    const next = this.#jobs.shift();
    if (!next) return;

    this.#running = true;
    const generation = this.#generation;
    let ok = true;
    try {
      await next.job();
    } catch {
      ok = false; // a failed animation must never block the queue
    }

    if (generation !== this.#generation) {
      next.resolve(false); // clear() happened while this job ran
      return;
    }
    this.#running = false;
    next.resolve(ok);
    this.#runNext();
  }
}
