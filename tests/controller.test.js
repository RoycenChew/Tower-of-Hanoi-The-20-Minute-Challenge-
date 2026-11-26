// controller.test.js — click-to-select rules, tested with fake views (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../js/model/EventBus.js';
import { GameState } from '../js/model/GameState.js';
import { solve } from '../js/model/Solver.js';
import { Stats } from '../js/model/Stats.js';
import { ChallengeTimer } from '../js/model/ChallengeTimer.js';
import { GameController } from '../js/controller/GameController.js';

/**
 * Build a STARTED controller with fake views that just record calls.
 * (The welcome / start flow itself is tested in challenge.test.js.)
 */
function setup(options = {}) {
  const bus = new EventBus();
  const game = new GameState(bus, 3);
  const calls = [];
  const board = {
    render: (snapshot, { selectedPeg }) => calls.push(['render', selectedPeg]),
    shakePeg: (peg) => calls.push(['shakePeg', peg]),
    shakeTopDisk: (peg) => calls.push(['shakeTopDisk', peg]),
    highlightHint: () => {},
    finishAnimations: () => {},
    measureTopDisk: () => null,
    animateMove: async () => {},
    animateReturn: async () => {},
  };
  // Runs each animation at once and is never busy (animation timing is tested in challenge.test.js).
  const queue = { busy: false, add: (job) => Promise.resolve(job()).then(() => true), clear() {} };
  const ui = {
    message: null,
    lastMove: undefined,
    render(snapshot, { lastMove }) { this.lastMove = lastMove; },
    showMessage(text, type) { this.message = { text, type }; },
    clearMessage() { this.message = { text: '', type: 'info' }; },
    showBanner() {},
    announce() {},
    setTime() {},
    setTimerLevel() {},
    pulseMoves() {},
  };
  const modals = { hideWelcome() {}, showVictory() {}, closeAll() {}, showTimeUp() {}, showSummary() {} };
  const timer = new ChallengeTimer(bus, { now: () => 0, setInterval: () => 1, clearInterval: () => {} });
  const controller = new GameController({
    bus, game, board, ui, modals, stats: new Stats(), timer, queue, now: () => 0, ...options,
  });
  controller.start();
  const click = (...pegs) => pegs.forEach((peg) => controller.handlePegClick(peg));
  return { game, controller, ui, calls, click };
}

const pegs = (game) => game.snapshot().pegs;

test('TC-01: clicking empty Peg B first: message, shake, nothing selected or counted', () => {
  const { game, controller, ui, calls, click } = setup();
  click(1);
  assert.deepEqual(ui.message, { text: 'Source peg contains no disks.', type: 'error' });
  assert.deepEqual(calls.at(-1), ['shakePeg', 1]);
  assert.equal(controller.selectedPeg, null);
  assert.equal(game.moveCount, 0);
  assert.deepEqual(game.log, [], 'a rejected selection is not logged');
});

test('clicking a peg with disks selects it and lifts its top disk', () => {
  const { controller, ui, calls, click } = setup();
  click(0);
  assert.equal(controller.selectedPeg, 0);
  assert.deepEqual(calls.at(-1), ['render', 0]);
  assert.match(ui.message.text, /^Disk 1 selected\./);
});

test('clicking the same peg twice deselects it', () => {
  const { game, controller, calls, click } = setup();
  click(0, 0);
  assert.equal(controller.selectedPeg, null);
  assert.deepEqual(calls.at(-1), ['render', null]);
  assert.equal(game.moveCount, 0);
});

test('two clicks on different pegs make a valid move, then deselect', () => {
  const { game, controller, ui, click } = setup();
  click(0, 2);
  assert.deepEqual(pegs(game), [[3, 2], [], [1]]);
  assert.equal(game.moveCount, 1);
  assert.equal(controller.selectedPeg, null);
  assert.deepEqual(ui.lastMove, { disk: 1, from: 0, to: 2 }, 'How it works gets the last move');
});

test('TC-02 (by clicking): Disk 3 onto Disk 1 is blocked, count unchanged, red log entry', () => {
  const { game, controller, ui, calls, click } = setup();
  click(0, 2, 0, 1, 2, 1); // Disk 1 -> C, Disk 2 -> B, Disk 1 -> B
  assert.deepEqual(pegs(game), [[3], [2, 1], []]);
  const before = pegs(game);

  click(0, 1); // Disk 3 onto Disk 1
  assert.deepEqual(ui.message, { text: 'Disk 3 cannot go on top of smaller Disk 1.', type: 'error' });
  assert.equal(game.moveCount, 3);
  assert.deepEqual(pegs(game), before);
  assert.deepEqual(game.log.at(-1), { type: 'invalid', text: 'Invalid: Disk 3 cannot go on top of smaller Disk 1.' });
  assert.deepEqual(calls.at(-1), ['shakeTopDisk', 0]);
  assert.equal(controller.selectedPeg, null, 'deselected after an invalid move');
});

test('solving by clicks shows a success message; further clicks are refused', () => {
  const { game, controller, ui, click } = setup();
  for (const m of solve(3)) click(m.from, m.to);
  assert.equal(game.solved, true);
  assert.deepEqual(ui.message, { text: 'Puzzle solved in 7 moves! The minimum is 7.', type: 'success' });

  click(2);
  assert.equal(controller.selectedPeg, null, 'cannot pick up a disk on a solved puzzle');
  assert.match(ui.message.text, /already solved/);
});

test('when locked (time is up), every click returns TIME_UP and changes nothing', () => {
  const { game, controller, ui, click } = setup();
  controller.locked = true;
  click(0, 2);
  assert.deepEqual(ui.message, { text: "Time's up! Moves are disabled.", type: 'error' });
  assert.equal(controller.selectedPeg, null);
  assert.equal(game.moveCount, 0);
});

test('while busy (animation playing), clicks return BUSY', () => {
  const busyQueue = { busy: true, add: () => Promise.resolve(true), clear() {} };
  const { controller, ui, click } = setup({ queue: busyQueue });
  click(0);
  assert.equal(ui.message.text, 'Please wait for the current move to finish.');
  assert.equal(controller.selectedPeg, null);
});
