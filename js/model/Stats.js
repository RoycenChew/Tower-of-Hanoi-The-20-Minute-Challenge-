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
      bestByLevel: structuredClone(this.bestByLevel),
      score: this.score,
    };
  }
}
