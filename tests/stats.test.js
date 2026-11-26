// stats.test.js — stars, score (hint penalty, 0 floor), efficiency and totals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Stats, starsFor, ratePuzzle, shareText, normalizeBests, updateLevelBest, updateBestScore,
} from '../js/model/Stats.js';

test('personal bests: the first solve of a level is saved as the best', () => {
  const { bests, improved } = updateLevelBest(null, 3, 9, 40_000);
  assert.deepEqual(improved, { first: true, moves: true, time: true });
  assert.deepEqual(bests.levels[3], { fewestMoves: 9, fastestMs: 40_000 });
});

test('personal bests: only real improvements count, each one separately', () => {
  let saved = updateLevelBest(null, 3, 9, 40_000).bests;
  let r = updateLevelBest(saved, 3, 7, 50_000); // fewer moves, slower
  assert.deepEqual(r.improved, { first: false, moves: true, time: false });
  assert.deepEqual(r.bests.levels[3], { fewestMoves: 7, fastestMs: 40_000 });
  saved = r.bests;
  r = updateLevelBest(saved, 3, 7, 40_000); // equal is not better
  assert.deepEqual(r.improved, { first: false, moves: false, time: false });
  r = updateLevelBest(saved, 4, 15, 60_000); // other levels are independent
  assert.equal(r.improved.first, true);
  assert.deepEqual(r.bests.levels[3], { fewestMoves: 7, fastestMs: 40_000 });
});

test('personal bests: best total score', () => {
  let r = updateBestScore(null, 700);
  assert.equal(r.improved, true);
  r = updateBestScore(r.bests, 300);
  assert.equal(r.improved, false);
  assert.equal(r.bests.bestScore, 700);
});

test('personal bests: corrupted saved data is cleaned up', () => {
  assert.deepEqual(normalizeBests('rubbish'), { levels: {}, bestScore: 0 });
  assert.deepEqual(normalizeBests({
    levels: { 3: { fewestMoves: 7, fastestMs: 1000 }, 4: { fewestMoves: 'x' }, 9: { fewestMoves: 1, fastestMs: 1 } },
    bestScore: -5,
  }), { levels: { 3: { fewestMoves: 7, fastestMs: 1000 } }, bestScore: 0 });
});

test('shareText for "Copy my result"', () => {
  const url = 'https://example.com/';
  const base = { score: 700 };
  assert.equal(
    shareText({ ...base, levelsCleared: [3, 4] }, 'Player', url),
    'Player scored 700 in Tower of Hanoi: The 20-Minute Challenge! Cleared 3 and 4 disks. Try it: https://example.com/',
  );
  assert.match(shareText({ ...base, levelsCleared: [3, 4, 5] }, 'Ming', url), /Cleared 3, 4 and 5 disks\./);
  assert.match(shareText({ ...base, levelsCleared: [3] }, 'Ming', url), /Cleared 3 disks\./);
  assert.match(shareText({ score: 0, levelsCleared: [] }, 'Ming', url), /No levels cleared yet\./);
});

test('stars: 3 = optimal, 2 = up to 1.5 × minimum, 1 = more', () => {
  assert.equal(starsFor(7, 7), 3);
  assert.equal(starsFor(10, 7), 2);  // 10 ≤ 10.5
  assert.equal(starsFor(11, 7), 1);
  assert.equal(starsFor(22, 15), 2); // 22 ≤ 22.5
  assert.equal(starsFor(23, 15), 1);
});

test('score = base × stars for each difficulty', () => {
  assert.equal(ratePuzzle(3, 7, 0).score, 300);
  assert.equal(ratePuzzle(4, 15, 0).score, 600);
  assert.equal(ratePuzzle(5, 31, 0).score, 1200);
  assert.equal(ratePuzzle(3, 9, 0).score, 200);  // 2 stars
  assert.equal(ratePuzzle(3, 20, 0).score, 100); // 1 star
});

test('each hint costs 10 points', () => {
  assert.equal(ratePuzzle(4, 15, 2).score, 580);
});

test('score never goes below 0', () => {
  assert.equal(ratePuzzle(3, 50, 20).score, 0); // 100 − 200 -> 0
});

test('efficiency = minimum ÷ moves as a whole percentage', () => {
  assert.equal(ratePuzzle(3, 9, 0).efficiency, 78);
  assert.equal(ratePuzzle(3, 7, 0).efficiency, 100);
  assert.equal(ratePuzzle(3, 7, 0).perfect, true);
  assert.equal(ratePuzzle(3, 9, 0).perfect, false);
});

test('Stats totals and bests across several puzzles', () => {
  const stats = new Stats();
  for (let i = 0; i < 9; i++) stats.recordMove();
  stats.recordUndo();
  stats.recordHint();
  stats.recordInvalid();
  stats.recordInvalid();
  const first = stats.recordSolved({ diskCount: 3, moves: 9, timeMs: 40_000, hints: 1 });
  assert.equal(first.score, 190); // 2 stars × 100 − 10
  assert.equal(first.timeMs, 40_000);

  for (let i = 0; i < 7; i++) stats.recordMove();
  stats.recordSolved({ diskCount: 3, moves: 7, timeMs: 55_000, hints: 0 });
  for (let i = 0; i < 15; i++) stats.recordMove();
  stats.recordSolved({ diskCount: 4, moves: 15, timeMs: 90_000, hints: 0 });

  assert.deepEqual(stats.summary(), {
    puzzlesCompleted: 3,
    levelsCleared: [3, 4],
    totalMoves: 31, // undo does not subtract
    totalHints: 1,
    totalUndos: 1,
    invalidAttempts: 2,
    bestByLevel: {
      3: { fewestMoves: 7, fastestMs: 40_000 },
      4: { fewestMoves: 15, fastestMs: 90_000 },
    },
    score: 190 + 300 + 600,
  });
});
