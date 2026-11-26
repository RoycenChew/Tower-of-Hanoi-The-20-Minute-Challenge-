// timer.test.js — the 20-minute timer, tested with a fake clock (no real waiting).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChallengeTimer, TimerState, CHALLENGE_MS, TICK_MS } from '../js/model/ChallengeTimer.js';
import { EventBus } from '../js/model/EventBus.js';

/**
 * A fake clock. advance(ms) moves time forward WITHOUT ticking (like a
 * sleeping background tab); fire() runs the interval callback once.
 */
function fakeClock() {
  let time = 1_000_000;
  let callback = null;
  return {
    now: () => time,
    setInterval: (fn) => { callback = fn; return 1; },
    clearInterval: () => { callback = null; },
    advance(ms) { time += ms; },
    fire() { callback?.(); },
    get intervalRunning() { return callback !== null; },
  };
}

function setup() {
  const clock = fakeClock();
  const bus = new EventBus();
  const events = [];
  for (const name of ['timer:tick', 'timer:warn5', 'timer:warn1', 'timer:expired']) {
    bus.on(name, (ms) => events.push({ name, ms }));
  }
  const timer = new ChallengeTimer(bus, clock);
  const count = (name) => events.filter((e) => e.name === name).length;
  return { clock, timer, events, count };
}

test('before start: IDLE, 20:00 remaining', () => {
  const { timer } = setup();
  assert.equal(timer.state, TimerState.IDLE);
  assert.equal(timer.remaining(), CHALLENGE_MS);
  assert.equal(ChallengeTimer.format(timer.remaining()), '20:00');
});

test('start() ticks immediately with 20:00 and works only once', () => {
  const { clock, timer, events } = setup();
  assert.equal(timer.start(), true);
  assert.equal(timer.state, TimerState.RUNNING);
  assert.deepEqual(events, [{ name: 'timer:tick', ms: CHALLENGE_MS }]);

  clock.advance(10_000);
  assert.equal(timer.start(), false, 'second start is ignored');
  assert.equal(timer.remaining(), CHALLENGE_MS - 10_000, 'second start did not reset the clock');
});

test('format() rounds up: 20:00 at start, 00:00 only at the real end', () => {
  assert.equal(ChallengeTimer.format(1_200_000), '20:00');
  assert.equal(ChallengeTimer.format(1_199_001), '20:00');
  assert.equal(ChallengeTimer.format(61_000), '01:01');
  assert.equal(ChallengeTimer.format(59_999), '01:00');
  assert.equal(ChallengeTimer.format(1), '00:01');
  assert.equal(ChallengeTimer.format(0), '00:00');
  assert.equal(ChallengeTimer.format(-50), '00:00');
});

test('normal run: warn5, warn1 and expired each fire exactly once, in order', () => {
  const { clock, timer, events, count } = setup();
  timer.start();
  for (let t = 0; t < CHALLENGE_MS + 5_000; t += TICK_MS) {
    clock.advance(TICK_MS);
    clock.fire();
  }
  assert.equal(count('timer:warn5'), 1);
  assert.equal(count('timer:warn1'), 1);
  assert.equal(count('timer:expired'), 1);

  const order = events.filter((e) => e.name !== 'timer:tick').map((e) => e.name);
  assert.deepEqual(order, ['timer:warn5', 'timer:warn1', 'timer:expired']);
  assert.equal(events.find((e) => e.name === 'timer:warn5').ms, 5 * 60 * 1000);
  assert.equal(events.find((e) => e.name === 'timer:warn1').ms, 60 * 1000);
  assert.equal(timer.state, TimerState.EXPIRED);
  assert.equal(clock.intervalRunning, false, 'interval is cleared at expiry');
});

test('one huge jump (sleeping tab) fires all three events once each', () => {
  const { clock, timer, events, count } = setup();
  timer.start();
  clock.advance(25 * 60 * 1000);
  clock.fire();
  assert.equal(count('timer:warn5'), 1);
  assert.equal(count('timer:warn1'), 1);
  assert.equal(count('timer:expired'), 1);
  const order = events.filter((e) => e.name !== 'timer:tick').map((e) => e.name);
  assert.deepEqual(order, ['timer:warn5', 'timer:warn1', 'timer:expired']);
  assert.equal(timer.remaining(), 0);
});

test('after expiry nothing fires again, and the state stays EXPIRED', () => {
  const { clock, timer, events } = setup();
  timer.start();
  clock.advance(CHALLENGE_MS);
  clock.fire();
  const before = events.length;
  clock.advance(60_000);
  clock.fire();
  timer.refresh();
  timer.debugSetRemaining(10 * 60 * 1000);
  assert.equal(timer.start(), false);
  assert.equal(events.length, before);
  assert.equal(timer.state, TimerState.EXPIRED);
});

test('refresh() after a background gap shows the correct time at once', () => {
  const { clock, timer, events } = setup();
  timer.start();
  clock.advance(2 * 60 * 1000); // 2 minutes with no ticks at all
  timer.refresh();
  assert.equal(events.at(-1).name, 'timer:tick');
  assert.equal(events.at(-1).ms, 18 * 60 * 1000);
  assert.equal(ChallengeTimer.format(events.at(-1).ms), '18:00');
});

test('debugSetRemaining jumps the clock; warnings still fire once', () => {
  const { clock, timer, count } = setup();
  timer.start();
  timer.debugSetRemaining(5 * 60 * 1000 + 5_000); // 5:05
  assert.equal(count('timer:warn5'), 0);
  clock.advance(5_000);
  clock.fire();
  assert.equal(count('timer:warn5'), 1);
  timer.debugSetRemaining(5 * 60 * 1000 + 5_000); // jump back up: no repeat
  clock.advance(5_000);
  clock.fire();
  assert.equal(count('timer:warn5'), 1);
});

test('there is NO way to pause, stop or reset the timer', () => {
  const timer = new ChallengeTimer(null, fakeClock());
  for (const name of ['pause', 'stop', 'resume', 'reset']) {
    assert.equal(timer[name], undefined, `timer.${name} must not exist`);
  }
  const methods = Object.getOwnPropertyNames(ChallengeTimer.prototype).sort();
  assert.deepEqual(methods, ['constructor', 'debugSetRemaining', 'refresh', 'remaining', 'start', 'state']);
});
