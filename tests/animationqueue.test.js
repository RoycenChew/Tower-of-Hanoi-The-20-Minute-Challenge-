// animationqueue.test.js — animations run one at a time, and can be cleared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnimationQueue } from '../js/controller/AnimationQueue.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A job that finishes only when the test says so. */
function manualJob(log, name) {
  let finish;
  const job = () => {
    log.push(`start ${name}`);
    return new Promise((resolve) => { finish = () => { log.push(`end ${name}`); resolve(); }; });
  };
  return { job, finish: () => finish() };
}

test('jobs run one at a time, in order; busy is true until all are done', async () => {
  const q = new AnimationQueue();
  const log = [];
  const a = manualJob(log, 'a');
  const b = manualJob(log, 'b');
  assert.equal(q.busy, false);

  const doneA = q.add(a.job);
  const doneB = q.add(b.job);
  await settle();
  assert.deepEqual(log, ['start a'], 'b waits for a');
  assert.equal(q.busy, true);

  a.finish();
  assert.equal(await doneA, true);
  await settle();
  assert.deepEqual(log, ['start a', 'end a', 'start b']);
  assert.equal(q.busy, true);

  b.finish();
  assert.equal(await doneB, true);
  assert.equal(q.busy, false);
});

test('clear() drops waiting jobs and frees the queue at once', async () => {
  const q = new AnimationQueue();
  const log = [];
  const a = manualJob(log, 'a');
  const b = manualJob(log, 'b');
  const doneA = q.add(a.job);
  const doneB = q.add(b.job);
  await settle();

  q.clear();
  assert.equal(q.busy, false);
  assert.equal(await doneB, false, 'the waiting job never runs');
  a.finish(); // the cut-off job ends late...
  assert.equal(await doneA, false, '...and reports that it was cleared');
  await settle();
  assert.deepEqual(log, ['start a', 'end a']);

  // The queue still works afterwards.
  const c = manualJob(log, 'c');
  const doneC = q.add(c.job);
  await settle();
  c.finish();
  assert.equal(await doneC, true);
});

test('a failing job does not block the queue', async () => {
  const q = new AnimationQueue();
  const failed = q.add(async () => { throw new Error('animation broke'); });
  const next = q.add(async () => {});
  assert.equal(await failed, false);
  assert.equal(await next, true);
  assert.equal(q.busy, false);
});
