// challenge.test.js — the 20-minute challenge flow, with a FAKE clock:
// start, hint/undo/restart/difficulty, victory, warnings and the Time's up sequence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../js/model/EventBus.js';
import { GameState } from '../js/model/GameState.js';
import { Stats } from '../js/model/Stats.js';
import { solve } from '../js/model/Solver.js';
import { ChallengeTimer, TimerState, CHALLENGE_MS } from '../js/model/ChallengeTimer.js';
import {
  GameController, Screen, SUMMARY_DELAY_MS, PRESS_R_AGAIN, IDLE_NUDGE_MS, NUDGE,
} from '../js/controller/GameController.js';
import { AnimationQueue } from '../js/controller/AnimationQueue.js';
import { LearningMode } from '../js/controller/LearningMode.js';
import { Preferences } from '../js/controller/Preferences.js';

/** A fake localStorage backed by a Map. */
function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const MIN = 60 * 1000;
/** Let pending promise callbacks run (an animation that just finished, etc.). */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Everything real (model, stats, timer, controller) except the views, which
 * record what they were asked to do, and the clock, which we move by hand.
 *
 * Animations: by default every animation finishes at once. With
 * { realAnimations: true } the REAL AnimationQueue is used and each
 * animation waits until the test calls finishAnimation().
 */
function setup({ realAnimations = false, prefs = null } = {}) {
  let time = 1_000_000;
  let tick = null;           // the timer's interval callback
  const timeouts = [];       // setTimeout calls made by the controller
  const log = [];            // ordered record of view calls
  const running = [];        // animations waiting to be finished by the test
  const sounds = [];         // sound effects played, in order

  const bus = new EventBus();
  const game = new GameState(bus, 3);
  const stats = new Stats();
  const timer = new ChallengeTimer(bus, {
    now: () => time,
    setInterval: (fn) => { tick = fn; return 1; },
    clearInterval: () => { tick = null; },
  });

  const animation = (name, ...args) => {
    log.push([name, ...args]);
    if (!realAnimations) return Promise.resolve();
    return new Promise((resolve) => running.push(resolve));
  };
  const board = {
    lastRender: null,
    render(snapshot, { selectedPeg }) { this.lastRender = { snapshot, selectedPeg }; },
    shakePeg: (peg) => log.push(['shakePeg', peg]),
    shakeTopDisk: (peg) => log.push(['shakeTopDisk', peg]),
    highlightHint: (move) => log.push(['highlightHint', move]),
    finishAnimations: () => log.push(['finishAnimations']),
    measureTopDisk: (peg) => {
      log.push(['measureTopDisk', peg, controller.selectedPeg, game.moveCount]);
      return { peg }; // stands in for a DOMRect
    },
    animateMove: (disk, fromRect) => animation('animateMove', disk, fromRect),
    animateReturn: (peg, fromRect) => animation('animateReturn', peg, fromRect),
  };
  const ui = {
    message: null,
    messages: [],
    render() {},
    showMessage(text, type) { this.message = { text, type }; this.messages.push(text); },
    clearMessage() { this.message = { text: '', type: 'info' }; },
    showBanner: (text, type) => log.push(['showBanner', text, type]),
    announce: (text) => log.push(['announce', text]),
    setTime: () => {},
    setTimerLevel: (level) => log.push(['setTimerLevel', level]),
    pulseMoves: () => {},
  };
  const modals = {
    victory: null,
    summary: null,
    hideWelcome: () => log.push(['hideWelcome']),
    showWelcome: (note) => log.push(['showWelcome', note]),
    showVictory(info) { this.victory = info; log.push(['showVictory']); },
    closeAll() { this.victory = null; log.push(['closeAll']); },
    showTimeUp: () => log.push(['showTimeUp']),
    showSummary(summary, nickname, personal) { this.summary = { summary, nickname, personal }; log.push(['showSummary']); },
  };

  const queue = realAnimations
    ? new AnimationQueue()
    : { busy: false, add: (job) => Promise.resolve(job()).then(() => true), clear() {} };

  // Learning Mode with its own fake autoplay timers.
  const learnTimers = [];
  const learning = new LearningMode({
    bus,
    setTimeout: (fn, ms) => { learnTimers.push({ fn, ms, done: false }); return learnTimers.length; },
    clearTimeout: (id) => { if (learnTimers[id - 1]) learnTimers[id - 1].done = true; },
  });

  const controller = new GameController({
    bus, game, board, ui, modals, stats, timer, queue, learning, prefs,
    sound: { play: (name) => sounds.push(name) },
    now: () => time,
    setTimeout: (fn, ms) => { const t = { fn, ms, cancelled: false }; timeouts.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cancelled = true; },
    stopLearning: () => { log.push(['stopLearning']); learning.lock(); },
    cancelDrag: () => log.push(['cancelDrag']),
  });

  const advance = (ms) => { time += ms; tick?.(); };
  return {
    game, stats, timer, controller, ui, modals, log, timeouts, board, queue, running, learning, sounds,
    /** Move the clock forward and let the timer tick once. */
    advance,
    /**
     * Let the next Learning Mode autoplay step happen: REAL time passes (the
     * challenge clock ticks) and then the step runs. Returns false if none is waiting.
     */
    runLearnTimer() {
      const t = learnTimers.find((x) => !x.done);
      if (!t) return false;
      advance(t.ms);
      t.done = true;
      t.fn();
      return true;
    },
    /** Finish the oldest running animation and let the controller react. */
    async finishAnimation() { running.shift()?.(); await settle(); },
    click: (...pegs) => pegs.forEach((peg) => controller.handlePegClick(peg)),
    solveByClicks(n) { for (const m of solve(n)) controller.handlePegClick(m.from), controller.handlePegClick(m.to); },
  };
}

// ---------- Welcome / start ----------

test('before Start: every action is refused with NOT_STARTED and the timer is idle', () => {
  const { game, timer, controller, ui, click } = setup();
  const notStarted = { text: 'Click "Start Challenge" to begin.', type: 'error' };
  for (const action of [() => click(0), () => controller.hint(), () => controller.undo(),
    () => controller.restart(), () => controller.setDifficulty(4)]) {
    ui.message = null;
    action();
    assert.deepEqual(ui.message, notStarted);
  }
  assert.equal(game.moveCount, 0);
  assert.equal(game.diskCount, 3);
  assert.equal(game.hintsUsed, 0);
  assert.equal(timer.state, TimerState.IDLE);
  assert.equal(controller.screen, Screen.WELCOME);
});

test('Start Challenge: starts the timer once, hides the welcome card, uses the nickname', () => {
  const { timer, controller, log } = setup();
  controller.start('  Ming  ');
  assert.equal(timer.state, TimerState.RUNNING);
  assert.equal(controller.screen, Screen.PLAYING);
  assert.equal(controller.nickname, 'Ming');
  assert.ok(log.some(([name]) => name === 'hideWelcome'));

  const remaining = timer.remaining();
  controller.start('Again');
  assert.equal(controller.nickname, 'Ming', 'second start is ignored');
  assert.equal(timer.remaining(), remaining);
});

test('an empty nickname becomes "Player"', () => {
  const { controller } = setup();
  controller.start('   ');
  assert.equal(controller.nickname, 'Player');
});

// ---------- The timer never stops ----------

test('TC-14: Hint shows a suggestion, moves nothing, and the timer keeps running', () => {
  const { game, stats, timer, controller, ui, log, advance } = setup();
  controller.start();
  advance(3 * MIN);
  const before = timer.remaining();

  controller.hint();
  assert.deepEqual(ui.message, { text: 'Hint: Move Disk 1 from Peg A to Peg C', type: 'hint' });
  assert.deepEqual(log.at(-1), ['highlightHint', { disk: 1, from: 0, to: 2 }]);
  assert.deepEqual(game.snapshot().pegs, [[3, 2, 1], [], []], 'nothing moved');
  assert.equal(game.moveCount, 0);
  assert.equal(stats.totalHints, 1);

  assert.equal(timer.state, TimerState.RUNNING);
  assert.equal(timer.remaining(), before, 'hint did not touch the clock');
  advance(MIN);
  assert.equal(timer.remaining(), before - MIN, 'and it keeps counting down');
});

test('TC-16: changing difficulty resets the puzzle but never the timer', () => {
  const { game, stats, timer, controller, advance, click } = setup();
  controller.start();
  click(0, 2);
  advance(3 * MIN);
  const before = timer.remaining();

  controller.setDifficulty(4);
  assert.deepEqual(game.snapshot().pegs, [[4, 3, 2, 1], [], []]);
  assert.equal(game.minMoves(), 15);
  assert.equal(game.moveCount, 0);
  assert.equal(timer.state, TimerState.RUNNING);
  assert.equal(timer.remaining(), before);

  controller.setDifficulty(5);
  assert.equal(game.minMoves(), 31);
  assert.equal(timer.remaining(), before);
  advance(MIN);
  assert.equal(timer.remaining(), before - MIN);
  assert.equal(stats.totalMoves, 1, 'totals are kept');
});

test('TC-18: Restart Puzzle resets the board but never the timer', () => {
  const { game, stats, timer, controller, advance, click } = setup();
  controller.start();
  click(0, 2, 0, 1);
  advance(3 * MIN);
  const before = timer.remaining();

  controller.restart();
  assert.deepEqual(game.snapshot().pegs, [[3, 2, 1], [], []]);
  assert.equal(game.moveCount, 0);
  assert.equal(game.diskCount, 3);
  assert.equal(timer.state, TimerState.RUNNING);
  assert.equal(timer.remaining(), before);
  advance(MIN);
  assert.equal(timer.remaining(), before - MIN);
  assert.equal(stats.totalMoves, 2, 'totals are kept');
});

// ---------- Undo ----------

test('Undo reverses the last move and is counted; with no moves it is refused', () => {
  const { game, stats, controller, ui, click } = setup();
  controller.start();
  controller.undo();
  assert.deepEqual(ui.message, { text: 'Nothing to undo.', type: 'error' });
  assert.equal(stats.totalUndos, 0);
  assert.equal(stats.invalidAttempts, 0, '"Nothing to undo" is not an invalid move');

  click(0, 2);
  controller.undo();
  assert.deepEqual(game.snapshot().pegs, [[3, 2, 1], [], []]);
  assert.equal(game.moveCount, 0);
  assert.equal(stats.totalUndos, 1);
  assert.equal(stats.totalMoves, 1, 'undo does not subtract from total moves');
});

// ---------- Stats ----------

test('invalid moves are counted; clicking an empty peg as the source is not', () => {
  const { stats, controller, click } = setup();
  controller.start();
  click(1);              // empty source: not counted
  click(0, 2, 0, 2);     // Disk 1 -> C, then Disk 2 onto Disk 1: invalid
  assert.equal(stats.invalidAttempts, 1);
  assert.equal(stats.totalMoves, 1);
});

// ---------- Victory ----------

test('solving 3 disks: victory modal with "Next Level: 4 Disks"; the timer keeps running', async () => {
  const { game, stats, timer, controller, modals, advance, solveByClicks } = setup();
  controller.start();
  advance(MIN);
  controller.hint(); // 1 hint in this puzzle
  advance(30_000);
  solveByClicks(3);
  assert.equal(controller.screen, Screen.VICTORY, 'solved at once in the model');
  await settle(); // the modal waits until the last disk has landed

  assert.equal(controller.screen, Screen.VICTORY);
  assert.equal(modals.victory.nextLevel, 4);
  assert.equal(modals.victory.moves, 7);
  assert.equal(modals.victory.minimum, 7);
  assert.equal(modals.victory.stars, 3);
  assert.equal(modals.victory.perfect, true);
  assert.equal(modals.victory.hints, 1);
  assert.equal(modals.victory.score, 290); // 100 × 3 stars − 10 for the hint
  assert.equal(modals.victory.timeMs, 90_000);
  assert.equal(stats.puzzlesCompleted, 1);
  assert.equal(timer.state, TimerState.RUNNING);

  const before = timer.remaining();
  controller.nextLevel();
  assert.equal(game.diskCount, 4);
  assert.equal(controller.screen, Screen.PLAYING);
  assert.equal(modals.victory, null, 'victory modal closed');
  assert.equal(timer.remaining(), before);
});

test('after 5 disks there is no next level ("You cleared every level!")', async () => {
  const { controller, modals, solveByClicks } = setup();
  controller.start();
  controller.setDifficulty(5);
  solveByClicks(5);
  await settle();
  assert.equal(modals.victory.nextLevel, null);
  controller.playAgain();
  assert.equal(controller.screen, Screen.PLAYING);
});

test('a solved puzzle cannot be undone (it would count twice)', () => {
  const { game, stats, controller, solveByClicks } = setup();
  controller.start();
  solveByClicks(3);
  controller.closeVictory();
  controller.undo();
  assert.equal(game.solved, true);
  assert.equal(game.moveCount, 7);
  assert.equal(stats.totalUndos, 0);
});

// ---------- Warnings ----------

test('warn5 and warn1 fire once each: timer colour, banner and screen-reader alert', () => {
  const { controller, log, advance } = setup();
  controller.start();
  advance(CHALLENGE_MS - 5 * MIN); // exactly 5:00 left
  advance(250);
  advance(CHALLENGE_MS - (CHALLENGE_MS - 5 * MIN) - MIN - 250); // exactly 1:00 left
  advance(250);

  const relevant = log.filter(([name]) => ['setTimerLevel', 'showBanner', 'announce'].includes(name));
  assert.deepEqual(relevant, [
    ['setTimerLevel', 'warn5'],
    ['showBanner', '5 minutes remaining!', 'warning'],
    ['announce', '5 minutes remaining!'],
    ['setTimerLevel', 'warn1'],
    ['showBanner', 'Final minute!', 'error'],
    ['announce', 'Final minute!'],
  ]);
});

// ---------- Time's up (section 5.6) ----------

test("Time's up: the exact sequence, input refused at once, summary after 1.5 s", () => {
  const { game, stats, controller, ui, modals, log, timeouts, advance, click } = setup();
  controller.start('Ming');
  click(0, 2);           // 1 valid move
  controller.hint();     // 1 hint
  click(0);              // Disk 2 lifted...
  assert.equal(controller.selectedPeg, 0);
  log.length = 0;

  advance(CHALLENGE_MS); // ...when the clock hits 00:00

  // Steps 1-6, in this order.
  assert.equal(controller.locked, true);
  assert.equal(controller.screen, Screen.TIME_UP);
  assert.equal(controller.selectedPeg, null, 'the lifted disk is dropped back');
  // (The one big jump also fires warn5 and warn1 first, as designed; skip those here.)
  const steps = ['stopLearning', 'finishAnimations', 'cancelDrag', 'closeAll', 'showTimeUp'];
  assert.deepEqual(log.map(([name]) => name).filter((name) => steps.includes(name)), steps);
  assert.equal(modals.summary, null, 'the summary is NOT shown yet');

  // Input is refused immediately and changes nothing.
  const snapshot = game.snapshot();
  for (const action of [() => click(0, 1), () => controller.hint(), () => controller.undo(),
    () => controller.restart(), () => controller.setDifficulty(4), () => controller.nextLevel()]) {
    ui.message = null;
    action();
    assert.deepEqual(ui.message, { text: "Time's up! Moves are disabled.", type: 'error' });
  }
  assert.deepEqual(game.snapshot(), snapshot);

  // Step 7: the summary, 1.5 s later. (Other timeouts are the "stuck?" nudges.)
  const summaryTimers = timeouts.filter((t) => t.ms === SUMMARY_DELAY_MS);
  assert.equal(summaryTimers.length, 1);
  assert.ok(timeouts.filter((t) => t.ms === IDLE_NUDGE_MS).every((t) => t.cancelled), 'nudges cancelled at Time\'s up');
  summaryTimers[0].fn();
  assert.equal(modals.summary.nickname, 'Ming');
  assert.equal(modals.summary.summary.totalMoves, 1);
  assert.equal(modals.summary.summary.totalHints, 1);
  assert.equal(modals.summary.summary.puzzlesCompleted, 0);
  assert.deepEqual(modals.summary.summary, stats.summary());
});

test("Time's up during the victory modal closes it first", async () => {
  const { controller, modals, log, advance, solveByClicks } = setup();
  controller.start();
  solveByClicks(3);
  await settle();
  assert.notEqual(modals.victory, null);
  log.length = 0;

  advance(CHALLENGE_MS);
  assert.equal(modals.victory, null, 'victory modal closed');
  const names = log.map(([name]) => name);
  assert.ok(names.indexOf('closeAll') < names.indexOf('showTimeUp'));
  assert.equal(controller.screen, Screen.TIME_UP);
  controller.closeVictory(); // the dialog's close event arrives later: must not leave TIME_UP
  assert.equal(controller.screen, Screen.TIME_UP);
});

test("Time's up happens only once, even if the timer reports it again", () => {
  const { controller, log, timeouts, advance } = setup();
  controller.start();
  advance(CHALLENGE_MS);
  controller.handleExpired();
  assert.equal(log.filter(([name]) => name === 'showTimeUp').length, 1);
  assert.equal(timeouts.filter((t) => t.ms === SUMMARY_DELAY_MS).length, 1);
});

// =====================================================================
// Phase 4: animations, drag-and-drop and keyboard restart.
// With { realAnimations: true } the REAL AnimationQueue is used and each
// animation waits until the test finishes it, so we can act "in the middle".
// =====================================================================

/** The board's last drawing must match the model exactly. */
function assertInSync(board, game) {
  assert.deepEqual(board.lastRender.snapshot, game.snapshot(), 'board and model out of sync');
}

test('a click move measures the disk while it is still lifted, before the model changes', () => {
  const { controller, log, click } = setup();
  controller.start();
  click(0, 2);
  // ['measureTopDisk', peg, selectedPeg at that moment, moveCount at that moment]
  assert.deepEqual(log.find(([name]) => name === 'measureTopDisk'), ['measureTopDisk', 0, 0, 0]);
  assert.deepEqual(log.find(([name]) => name === 'animateMove'), ['animateMove', 1, { peg: 0 }]);
});

test('TC-25: rapid clicks during an animation are all refused; "Please wait..." shows once', async () => {
  const { game, controller, ui, board, queue, click, finishAnimation } = setup({ realAnimations: true });
  controller.start();
  click(0, 2); // Disk 1 -> C: the model changes now, the animation runs
  assert.equal(game.moveCount, 1);
  assert.equal(queue.busy, true);
  const before = game.snapshot();

  ui.messages.length = 0;
  for (let i = 0; i < 20; i++) click(i % 3);
  controller.hint();
  controller.undo();
  controller.restart();

  assert.deepEqual(game.snapshot(), before, 'nothing changed during the animation');
  assert.equal(controller.selectedPeg, null);
  assert.deepEqual(ui.messages, ['Please wait for the current move to finish.'], 'shown once only');

  await finishAnimation();
  assert.equal(queue.busy, false);
  assertInSync(board, game);

  // The next click works, and a NEW animation may show the message once again.
  click(0, 1);
  assert.equal(game.moveCount, 2);
  ui.messages.length = 0;
  click(0);
  click(0);
  assert.deepEqual(ui.messages, ['Please wait for the current move to finish.']);
  await finishAnimation();
  assertInSync(board, game);
});

test('TC-23: time runs out DURING a move animation: the move counts and everything ends in sync', async () => {
  const { game, stats, controller, modals, ui, board, queue, log, running, advance, click } = setup({ realAnimations: true });
  controller.start();
  click(0, 2);
  assert.equal(queue.busy, true);

  advance(CHALLENGE_MS); // 00:00 while the disk is still flying
  assert.equal(controller.locked, true);
  assert.equal(queue.busy, false, 'the queue was cleared');
  assert.ok(log.some(([name]) => name === 'finishAnimations'));
  assert.equal(game.moveCount, 1, 'the move happened before 00:00, so it counts');
  assert.equal(stats.totalMoves, 1);

  running.shift()(); // the cut-off animation's promise settles late...
  await settle();
  assert.equal(modals.victory, null);
  assert.equal(ui.message.text, "Time's up! Moves are disabled.", '...and overwrites nothing');
  assertInSync(board, game);
});

test('TC-23: the SOLVING move cut off by 00:00 still counts, but no victory modal opens', async () => {
  const { game, stats, controller, modals, board, running, advance, click, finishAnimation } = setup({ realAnimations: true });
  controller.start();
  const moves = solve(3);
  for (const m of moves.slice(0, 6)) {
    click(m.from, m.to);
    await finishAnimation();
  }
  click(moves[6].from, moves[6].to); // the solving move: its animation is running
  assert.equal(game.solved, true);
  assert.equal(stats.puzzlesCompleted, 1, 'counted at once');

  advance(CHALLENGE_MS);
  running.shift()();
  await settle();
  assert.equal(modals.victory, null, "Time's up owns the screen");
  assert.equal(controller.screen, Screen.TIME_UP);
  assertInSync(board, game);
});

test('the victory modal waits until the solving move has finished animating', async () => {
  const { controller, modals, click, finishAnimation } = setup({ realAnimations: true });
  controller.start();
  const moves = solve(3);
  for (const m of moves.slice(0, 6)) {
    click(m.from, m.to);
    await finishAnimation();
  }
  click(moves[6].from, moves[6].to);
  assert.equal(modals.victory, null, 'not yet: the disk is still moving');
  await finishAnimation();
  assert.notEqual(modals.victory, null);
});

test('Undo is animated: the disk travels back from where it was', async () => {
  const { game, controller, log, click } = setup();
  controller.start();
  click(0, 2);
  await settle();
  log.length = 0;
  controller.undo();
  assert.deepEqual(log.filter(([name]) => name !== 'measureTopDisk'), [['animateMove', 1, { peg: 2 }]]);
  assert.equal(game.moveCount, 0);
});

// ---------- Drag-and-drop ----------

test('dragging a disk that is not on top: "Only the top disk can be moved." and nothing moves', () => {
  const { game, controller, ui } = setup();
  controller.start();
  assert.equal(controller.beginDrag(0, 3), false);
  assert.deepEqual(ui.message, { text: 'Only the top disk can be moved.', type: 'error' });
  assert.deepEqual(game.snapshot().pegs, [[3, 2, 1], [], []]);
  assert.equal(controller.beginDrag(0, 1), true, 'the top disk may be dragged');
});

test('previewDrop says whether a drop would be legal (and changes nothing)', () => {
  const { game, controller, click } = setup();
  controller.start();
  click(0, 2); // Disk 1 on C
  assert.equal(controller.previewDrop(0, 1), true);  // Disk 2 onto empty B
  assert.equal(controller.previewDrop(0, 2), false); // Disk 2 onto Disk 1
  assert.equal(game.moveCount, 1);
});

test('a legal drop is a normal move and animates from the drop point', () => {
  const { game, stats, controller, log } = setup();
  controller.start();
  assert.equal(controller.beginDrag(0, 1), true);
  controller.dropDisk(0, 2, { dropped: 'here' });
  assert.deepEqual(game.snapshot().pegs, [[3, 2], [], [1]]);
  assert.equal(stats.totalMoves, 1);
  assert.deepEqual(log.at(-1), ['animateMove', 1, { dropped: 'here' }]);
});

test('TC-02 (drag): Disk 3 dropped on Disk 1 is a real invalid move and animates back', () => {
  const { game, stats, controller, ui, log, click } = setup();
  controller.start();
  click(0, 2, 0, 1, 2, 1); // Peg A: [3], Peg B: [2, 1]
  const before = game.snapshot().pegs;

  assert.equal(controller.beginDrag(0, 3), true);
  controller.dropDisk(0, 1, { dropped: 'on B' });

  assert.deepEqual(ui.message, { text: 'Disk 3 cannot go on top of smaller Disk 1.', type: 'error' });
  assert.equal(game.moveCount, 3, 'counter unchanged');
  assert.deepEqual(game.snapshot().pegs, before);
  assert.deepEqual(game.log.at(-1), { type: 'invalid', text: 'Invalid: Disk 3 cannot go on top of smaller Disk 1.' });
  assert.equal(stats.invalidAttempts, 1, 'invalid attempt counted');
  assert.deepEqual(log.at(-1), ['animateReturn', 0, { dropped: 'on B' }]);
});

test('a drop outside every peg returns quietly: not logged, not counted', () => {
  const { game, stats, controller, log } = setup();
  controller.start();
  controller.beginDrag(0, 1);
  controller.cancelDrop(0, { dropped: 'outside' });
  assert.deepEqual(game.log, []);
  assert.equal(stats.invalidAttempts, 0);
  assert.equal(game.moveCount, 0);
  assert.deepEqual(log.at(-1), ['animateReturn', 0, { dropped: 'outside' }]);
});

test('TC-22: time runs out DURING a drag: drag cancelled, the late drop is refused', () => {
  const { game, stats, controller, ui, board, log, advance } = setup();
  controller.start();
  assert.equal(controller.beginDrag(0, 1), true); // finger is down, disk in the air

  advance(CHALLENGE_MS);
  assert.ok(log.some(([name]) => name === 'cancelDrag'), 'the drag was cancelled');

  controller.dropDisk(0, 2, null); // the finger lifts after 00:00
  controller.cancelDrop(0, null);
  assert.equal(ui.message.text, "Time's up! Moves are disabled.");
  assert.equal(game.moveCount, 0);
  assert.equal(stats.totalMoves, 0);
  assert.deepEqual(game.snapshot().pegs, [[3, 2, 1], [], []]);
  assertInSync(board, game);
});

test('starting a drag while an animation runs is refused (BUSY)', () => {
  const { controller, click } = setup({ realAnimations: true });
  controller.start();
  click(0, 2);
  assert.equal(controller.beginDrag(0, 2), false);
});

// ---------- Keyboard ----------

test('R must be pressed twice within 2 s to restart', () => {
  const { game, controller, ui, advance, click } = setup();
  controller.start();
  click(0, 2);

  controller.requestRestartByKey();
  assert.deepEqual(ui.message, { text: PRESS_R_AGAIN, type: 'info' });
  assert.equal(game.moveCount, 1, 'first press does not restart');

  advance(2500); // too slow: this press only arms it again
  controller.requestRestartByKey();
  assert.equal(game.moveCount, 1);

  advance(1500); // second press within 2 s
  controller.requestRestartByKey();
  assert.equal(game.moveCount, 0);
  assert.deepEqual(game.snapshot().pegs, [[3, 2, 1], [], []]);
});

test('Esc puts a lifted disk back down', () => {
  const { controller, click } = setup();
  controller.start();
  click(0);
  assert.equal(controller.selectedPeg, 0);
  controller.cancelSelection();
  assert.equal(controller.selectedPeg, null);
});

// =====================================================================
// Phase 5: Learning Mode inside the challenge.
// =====================================================================

test('Learning Mode is locked before Start', () => {
  const { controller, learning, ui } = setup();
  controller.openLearning();
  assert.equal(learning.isOpen, false);
  assert.equal(controller.screen, Screen.WELCOME);
  assert.equal(ui.message.text, 'Click "Start Challenge" to begin.');
});

test('TC-05: Learning Mode autoplay plays in order while the 20-minute timer keeps running', () => {
  const { timer, controller, learning, advance, runLearnTimer } = setup();
  controller.start();
  advance(MIN);
  controller.openLearning();
  assert.equal(controller.screen, Screen.LEARNING);
  assert.equal(learning.diskCount, 3);

  const before = timer.remaining();
  learning.play();
  const boards = [];
  while (runLearnTimer()) boards.push(learning.state().snapshot.pegs);

  assert.equal(boards.length, 7, 'all 7 steps, in order');
  assert.deepEqual(boards.at(-1), [[], [], [3, 2, 1]]);
  assert.equal(learning.playing, false, 'autoplay stopped at the end');
  assert.equal(timer.state, TimerState.RUNNING);
  assert.equal(timer.remaining(), before - 7 * 1200, 'the challenge clock ran during autoplay');
});

test('TC-05: pausing (or stepping through) the demo never freezes the challenge timer', () => {
  const { timer, controller, learning, advance, runLearnTimer } = setup();
  controller.start();
  controller.openLearning();
  learning.play();
  runLearnTimer();
  learning.pause();
  const before = timer.remaining();
  advance(2 * MIN); // the demo is paused for 2 minutes...
  assert.equal(timer.remaining(), before - 2 * MIN, '...and the clock kept going');
  learning.next();
  learning.previous();
  advance(MIN);
  assert.equal(timer.remaining(), before - 3 * MIN);
  assert.equal(timer.state, TimerState.RUNNING);
});

test("Learning Mode never touches the player's game or the Stats", () => {
  const { game, stats, controller, learning, click, runLearnTimer } = setup();
  controller.start();
  click(0, 2, 0, 1); // the player's own game: 2 moves
  controller.hint();
  const gameBefore = game.snapshot();
  const statsBefore = stats.summary();

  controller.openLearning(5);
  learning.play();
  while (runLearnTimer()); // all 31 demo moves
  assert.equal(learning.index, 31);

  assert.deepEqual(game.snapshot(), gameBefore, 'game board untouched');
  assert.deepEqual(stats.summary(), statsBefore, 'no Stats method was called');

  controller.closeLearning();
  assert.equal(controller.screen, Screen.PLAYING);
  assert.equal(learning.isOpen, false);
  assert.deepEqual(game.snapshot(), gameBefore, 'Back to Game: exactly as it was');
  click(2, 1); // and the game goes on from there (Disk 1 onto Disk 2)
  assert.equal(game.moveCount, 3);
});

test('game input is ignored while Learning Mode is open', () => {
  const { game, controller, click } = setup();
  controller.start();
  controller.openLearning();
  click(0, 2);
  controller.hint();
  controller.restart();
  controller.setDifficulty(5);
  assert.equal(game.moveCount, 0);
  assert.equal(game.hintsUsed, 0);
  assert.equal(game.diskCount, 3);
});

test('"See Optimal Solution" opens Learning Mode with the solved puzzle\'s disk count', async () => {
  const { controller, learning, modals, solveByClicks } = setup();
  controller.start();
  controller.setDifficulty(4);
  solveByClicks(4);
  await settle();
  assert.notEqual(modals.victory, null);

  controller.openLearning(controller.diskCount);
  assert.equal(controller.screen, Screen.LEARNING);
  assert.equal(modals.victory, null, 'victory modal closed');
  assert.equal(learning.diskCount, 4);
  assert.equal(learning.total, 15);
  controller.closeVictory(); // the dialog's late close event must not change the screen
  assert.equal(controller.screen, Screen.LEARNING);
});

test("TC-03: Time's up during Learning Mode autoplay halts it at once", () => {
  const { controller, learning, modals, advance, runLearnTimer } = setup();
  controller.start();
  controller.openLearning();
  learning.play();
  runLearnTimer();
  runLearnTimer();
  assert.equal(learning.index, 2);

  advance(CHALLENGE_MS);
  assert.equal(controller.screen, Screen.TIME_UP);
  assert.equal(learning.playing, false, 'autoplay halted');
  assert.equal(learning.locked, true);
  assert.equal(runLearnTimer(), false, 'no demo step is waiting');
  learning.next();
  learning.play();
  assert.equal(learning.index, 2, 'demo controls are refused');
  assert.equal(modals.summary, null); // the summary follows 1.5 s later, as usual
});

// =====================================================================
// Phase 6: sound effects, personal bests, remembered nickname.
// =====================================================================

test('sounds: move, invalid, win, and the two warnings, each at the right moment', async () => {
  const { controller, sounds, advance, click, solveByClicks } = setup();
  controller.start();
  click(1);          // empty source peg: error sound
  click(0, 2);       // valid move
  click(0, 2);       // Disk 2 onto Disk 1: invalid
  controller.undo(); // undo: soft move sound
  assert.deepEqual(sounds, ['invalid', 'move', 'invalid', 'move']);

  sounds.length = 0;
  controller.restart();
  solveByClicks(3);
  assert.equal(sounds.filter((s) => s === 'win').length, 0, 'no win sound before the disk lands');
  await settle();
  assert.equal(sounds.at(-1), 'win');
  assert.equal(sounds.filter((s) => s === 'move').length, 7);

  sounds.length = 0;
  advance(CHALLENGE_MS - 5 * 60 * 1000);
  advance(4 * 60 * 1000);
  assert.deepEqual(sounds, ['warning', 'warning'], 'warn5 and warn1');
});

test('sounds: no sound for refused input, and Learning Mode is silent', () => {
  const { controller, learning, sounds, click, runLearnTimer } = setup();
  click(0, 2); // before Start: refused
  assert.deepEqual(sounds, []);
  controller.start();
  controller.openLearning();
  learning.play();
  while (runLearnTimer());
  learning.previous();
  assert.deepEqual(sounds, [], 'demo moves make no sound');
});

test('dragging a non-top disk plays the error sound', () => {
  const { controller, sounds } = setup();
  controller.start();
  controller.beginDrag(0, 3);
  assert.deepEqual(sounds, ['invalid']);
});

test('the nickname is remembered for next time', () => {
  const prefs = new Preferences(fakeStorage());
  const { controller } = setup({ prefs });
  controller.start('  Ming ');
  assert.equal(prefs.get('nickname'), 'Ming');
});

test('personal bests: saved across challenges; shown in victory and summary', async () => {
  const storage = fakeStorage();

  // First visit: optimal 3-disk solve (7 moves, 300 points).
  let t = setup({ prefs: new Preferences(storage) });
  t.controller.start();
  t.solveByClicks(3);
  await settle();
  assert.deepEqual(t.modals.victory.personalBest, { first: true, moves: true, time: true });
  t.advance(CHALLENGE_MS);
  t.timeouts.at(-1).fn();
  assert.equal(t.modals.summary.personal.newBestScore, true);
  assert.equal(t.modals.summary.personal.bests.bestScore, 300);

  // Second visit (same storage): 8 moves, 200 points. Not better.
  t = setup({ prefs: new Preferences(storage) });
  t.controller.start();
  t.click(0, 1, 1, 2); // Disk 1 A->B->C: 2 moves for what one move does
  for (const m of solve(3).slice(1)) t.click(m.from, m.to);
  await settle();
  assert.equal(t.modals.victory.moves, 8);
  assert.equal(t.modals.victory.personalBest.first, false);
  assert.equal(t.modals.victory.personalBest.moves, false, '8 moves does not beat 7');
  t.advance(CHALLENGE_MS);
  t.timeouts.at(-1).fn();
  assert.equal(t.modals.summary.personal.newBestScore, false, '200 does not beat 300');
  assert.equal(t.modals.summary.personal.bests.bestScore, 300);
  assert.equal(t.modals.summary.personal.bests.levels[3].fewestMoves, 7);
});

test('personal bests are not shown when the browser cannot save them', async () => {
  const { controller, modals, advance, timeouts, solveByClicks } = setup({ prefs: new Preferences(null) });
  controller.start();
  solveByClicks(3);
  await settle();
  assert.equal(modals.victory.personalBest, null);
  advance(CHALLENGE_MS);
  timeouts.at(-1).fn();
  assert.equal(modals.summary.personal, null);
});

// =====================================================================
// Phase 8: practice puzzle and friendly nudges.
// =====================================================================

/** Run the newest waiting "no move for 20 s" timer (as if 20 s passed). */
function fireIdleNudge(timeouts) {
  const t = timeouts.filter((x) => x.ms === IDLE_NUDGE_MS && !x.cancelled).at(-1);
  if (!t) return false;
  t.cancelled = true;
  t.fn();
  return true;
}

test('practice: no clock, nothing counted, solving it returns to the welcome card', async () => {
  const { game, stats, timer, controller, modals, log, solveByClicks } = setup();
  modals.showWelcome = (note) => log.push(['showWelcome', note]);
  assert.equal(controller.canPractice, true);
  controller.startPractice();
  assert.equal(controller.screen, Screen.PRACTICE);
  assert.equal(game.diskCount, 3);
  assert.equal(timer.state, TimerState.IDLE, 'the challenge clock does not start');

  controller.hint();
  controller.handlePegClick(0); controller.handlePegClick(0); // select + deselect
  solveByClicks(3);
  assert.equal(game.solved, true);
  await settle();

  assert.deepEqual(stats.summary(), new Stats().summary(), 'no Stats at all: moves, hints, puzzles');
  assert.equal(modals.victory, null, 'no victory modal for practice');
  assert.equal(controller.screen, Screen.WELCOME);
  assert.deepEqual(log.at(-1), ['showWelcome', NUDGE.PRACTICE_DONE]);
  assert.deepEqual(game.snapshot().pegs, [[3, 2, 1], [], []], 'fresh board for the real challenge');
  assert.equal(game.moveCount, 0);

  controller.start('Ming'); // and the real challenge starts normally
  assert.equal(timer.state, TimerState.RUNNING);
  assert.equal(controller.screen, Screen.PLAYING);
});

test('practice can be skipped at any time', () => {
  const { game, timer, controller, modals, log, click } = setup();
  modals.showWelcome = (note) => log.push(['showWelcome', note]);
  controller.startPractice();
  click(0, 2);
  controller.endPractice();
  assert.equal(controller.screen, Screen.WELCOME);
  assert.deepEqual(log.at(-1), ['showWelcome', null]);
  assert.deepEqual(game.snapshot().pegs, [[3, 2, 1], [], []]);
  assert.equal(timer.state, TimerState.IDLE);
});

test('practice: always 3 disks, Learning Mode locked, not offered after Start', () => {
  const { game, controller, ui, learning } = setup();
  controller.startPractice();
  controller.setDifficulty(5);
  assert.equal(game.diskCount, 3);
  assert.equal(ui.message.text, NUDGE.PRACTICE_ONLY_3);
  controller.openLearning();
  assert.equal(learning.isOpen, false);
  assert.equal(ui.message.text, NUDGE.LEARNING_LATER);
  controller.restart();
  assert.equal(controller.screen, Screen.PRACTICE, 'Restart keeps practising');

  controller.endPractice();
  controller.start();
  assert.equal(controller.canPractice, false);
  controller.startPractice();
  assert.equal(controller.screen, Screen.PLAYING, 'no practice once the challenge runs');
});

test('nudge: the first valid move gets a word of encouragement', () => {
  const { controller, ui, click } = setup();
  controller.start();
  click(0, 2);
  assert.deepEqual(ui.message, { text: NUDGE.FIRST_MOVE, type: 'success' });
  click(0, 1);
  assert.notEqual(ui.message.text, NUDGE.FIRST_MOVE, 'only the first time');
});

test('nudge: after 3 refused moves in a row, point to the Hint button', () => {
  const { controller, ui, click } = setup();
  controller.start();
  click(1); // empty source peg: mistake 1
  assert.equal(ui.message.text, 'Source peg contains no disks.');
  click(0, 2, 0, 2); // Disk 1 -> C, then Disk 2 onto Disk 1: mistake 2? No: the valid move resets the count
  assert.equal(ui.message.text, 'Disk 2 cannot go on top of smaller Disk 1.');
  click(0, 2); // mistake 2
  click(0, 2); // mistake 3
  assert.equal(ui.message.text, `Disk 2 cannot go on top of smaller Disk 1. ${NUDGE.STUCK}`);
  assert.equal(ui.message.type, 'error');
});

test('nudge: 20 s without a move suggests the Hint button, once until the next move', () => {
  const { controller, ui, timeouts, click } = setup();
  controller.start();
  assert.equal(fireIdleNudge(timeouts), true);
  assert.deepEqual(ui.message, { text: NUDGE.STUCK, type: 'hint' });
  assert.equal(fireIdleNudge(timeouts), false, 'not again until the player moves');
  click(0, 2);
  assert.equal(fireIdleNudge(timeouts), true, 'a move starts the 20 s again');
});

test('nudge: none in Learning Mode, after a win, or after Time\'s up', async () => {
  const { controller, ui, timeouts, advance, solveByClicks } = setup();
  controller.start();
  controller.openLearning();
  ui.message = null;
  assert.equal(fireIdleNudge(timeouts), false, 'cancelled when Learning Mode opens');
  controller.closeLearning();
  solveByClicks(3);
  await settle();
  assert.equal(fireIdleNudge(timeouts), false, 'no nudge on a solved puzzle');
  controller.nextLevel();
  advance(CHALLENGE_MS);
  assert.equal(fireIdleNudge(timeouts), false, 'cancelled at Time\'s up');
});
