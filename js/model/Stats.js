// Stats.js — totals for the whole 20-minute challenge, plus scoring.
//
// Stats are updated by EXPLICIT calls from the controller (recordMove(),
// recordHint(), ...), not by listening to events. That way there is exactly
// one visible line of code where each number goes up.
// Learning Mode demo moves must NEVER call these methods.

/** Base points per puzzle, by number of disks. */
export const BASE_SCORE = Object.freeze({ 3: 100, 4: 200, 5: 400 });
export const HINT_PENALTY = 10;

/**
 * Stars for one puzzle:
 *   3 stars = optimal (moves equal the minimum)
 *   2 stars = at most 1.5 × the minimum
 *   1 star  = solved, but with more moves
 */
export function starsFor(moves, minimum) {
  if (moves <= minimum) return 3;
  if (moves <= 1.5 * minimum) return 2;
  return 1;
}

/**
 * Rate one solved puzzle.
 * @returns {{minimum, stars, score, efficiency, perfect}}
 *   efficiency is a whole percentage: minimum ÷ moves (7 of 9 -> 78)
 */
export function ratePuzzle(diskCount, moves, hints) {
  const minimum = 2 ** diskCount - 1;
  const stars = starsFor(moves, minimum);
  const base = BASE_SCORE[diskCount] ?? 0;
  const score = Math.max(0, base * stars - HINT_PENALTY * hints); // never below 0
  const efficiency = Math.round((minimum / moves) * 100);
  return { minimum, stars, score, efficiency, perfect: moves === minimum };
}

// ---------------------------------------------------------------------
// Personal bests (kept between visits). These functions are PURE: they
// only compare numbers and return new objects. Saving them in the browser
// is done elsewhere (js/controller/Preferences.js), because the model
// never touches the browser.
//
// Shape: { levels: { 3: { fewestMoves, fastestMs }, ... }, bestScore }
// ---------------------------------------------------------------------

const isCount = (x) => Number.isFinite(x) && x >= 0;

/** Clean up saved data (it may be missing, old or edited by hand). */
export function normalizeBests(raw) {
  const bests = { levels: {}, bestScore: 0 };
  if (!raw || typeof raw !== 'object') return bests;
  for (const n of Object.keys(BASE_SCORE)) {
    const level = raw.levels?.[n];
    if (level && isCount(level.fewestMoves) && isCount(level.fastestMs)) {
      bests.levels[n] = { fewestMoves: level.fewestMoves, fastestMs: level.fastestMs };
    }
  }
  if (isCount(raw.bestScore)) bests.bestScore = raw.bestScore;
  return bests;
}

/**
 * Compare one solved puzzle with the saved bests for its level.
 * @returns {{ bests, improved: { first: boolean, moves: boolean, time: boolean } }}
 */
export function updateLevelBest(saved, diskCount, moves, timeMs) {
  const bests = normalizeBests(saved);
  const old = bests.levels[diskCount];
  const improved = {
    first: !old,
    moves: !old || moves < old.fewestMoves,
    time: !old || timeMs < old.fastestMs,
  };
  bests.levels[diskCount] = {
    fewestMoves: old ? Math.min(old.fewestMoves, moves) : moves,
    fastestMs: old ? Math.min(old.fastestMs, timeMs) : timeMs,
  };
  return { bests, improved };
}

/** Compare a challenge's total score with the best one ever. */
export function updateBestScore(saved, score) {
  const bests = normalizeBests(saved);
  const improved = score > bests.bestScore;
  if (improved) bests.bestScore = score;
  return { bests, improved };
}

/** "3", "3 and 4", "3, 4 and 5" */
function joinLevels(levels) {
  if (levels.length <= 1) return levels.join('');
  return `${levels.slice(0, -1).join(', ')} and ${levels[levels.length - 1]}`;
}

/**
 * The text for "Copy my result", e.g.
 * "Player scored 700 in Tower of Hanoi: The 20-Minute Challenge! Cleared 3 and 4 disks. Try it: <url>"
 */
export function shareText(summary, nickname, url) {
  const cleared = summary.levelsCleared.length
    ? `Cleared ${joinLevels(summary.levelsCleared)} disks.`
    : 'No levels cleared yet.';
  return `${nickname} scored ${summary.score} in Tower of Hanoi: The 20-Minute Challenge! ${cleared} Try it: ${url}`;
}

export class Stats {
  puzzlesCompleted = 0;
  levelsCleared = new Set(); // which of 3 / 4 / 5 disks were solved at least once
  totalMoves = 0;            // every valid move executed (undo does NOT subtract)
  totalHints = 0;
  totalUndos = 0;
  invalidAttempts = 0;
  bestByLevel = {};          // { 3: { fewestMoves, fastestMs }, ... }
  score = 0;

  recordMove() { this.totalMoves++; }
  recordHint() { this.totalHints++; }
  recordUndo() { this.totalUndos++; }
  recordInvalid() { this.invalidAttempts++; }

  /**
   * A puzzle was solved. (Its moves were already counted by recordMove.)
   * @returns the puzzle's rating plus its time, for the victory modal
   */
  recordSolved({ diskCount, moves, timeMs, hints }) {
    const rating = ratePuzzle(diskCount, moves, hints);

    this.puzzlesCompleted++;
    this.levelsCleared.add(diskCount);
    this.score += rating.score;

    const best = this.bestByLevel[diskCount];
    this.bestByLevel[diskCount] = best
      ? { fewestMoves: Math.min(best.fewestMoves, moves), fastestMs: Math.min(best.fastestMs, timeMs) }
      : { fewestMoves: moves, fastestMs: timeMs };

    return { ...rating, timeMs };
  }

  /** Plain object for the Final Summary modal. */
  summary() {
    return {
      puzzlesCompleted: this.puzzlesCompleted,
      levelsCleared: [...this.levelsCleared].sort((a, b) => a - b),
      totalMoves: this.totalMoves,
      totalHints: this.totalHints,
      totalUndos: this.totalUndos,
      invalidAttempts: this.invalidAttempts,
      bestByLevel: JSON.parse(JSON.stringify(this.bestByLevel)), // a deep copy
      score: this.score,
    };
  }
}
