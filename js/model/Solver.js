// Solver.js — the recursive Tower of Hanoi algorithm.
//
// THE BIG IDEA: to move a tower of n disks from one peg to another, you do
// not need to think about all n disks at once. You only need to trust that
// moving a SMALLER tower (n − 1 disks) already works:
//   1) move the n − 1 smaller disks out of the way, onto the spare peg
//   2) move the largest disk to the target (it is now free, and the target is empty)
//   3) move the n − 1 smaller disks back on top of it
// Steps 1 and 3 are the same puzzle with one disk fewer — that is recursion.
// The base case (0 disks) needs no moves, so the recursion always stops.
//
// Number of moves: T(n) = 2·T(n − 1) + 1, T(0) = 0  =>  T(n) = 2ⁿ − 1.  Time: O(2ⁿ).

/**
 * Move n disks from `from` to `to`, using `via` as the spare peg.
 * Returns the list of moves, e.g. [{disk: 1, from: 0, to: 2}, ...].
 */
export function solve(n, from = 0, to = 2, via = 1, moves = []) {
  if (n === 0) return moves;            // base case
  solve(n - 1, from, via, to, moves);   // 1) move the n-1 smaller disks out of the way
  moves.push({ disk: n, from, to });    // 2) move the largest disk
  solve(n - 1, via, to, from, moves);   // 3) move the n-1 disks back on top
  return moves;
}

/**
 * Same algorithm as solve(), but it also records every recursive call
 * ("frame") so Learning Mode can draw the call tree and the call stack.
 *
 * Each call with n ≥ 1 makes exactly ONE move (step 2 above), so every frame
 * maps to exactly one move through `moveIndex`. Calls with n = 0 do nothing,
 * so they are not recorded. For n disks there are 2ⁿ − 1 frames.
 *
 * Frames are stored in the order the calls START (pre-order), and
 * `parentId` links each call to the call that made it.
 *
 * @returns {{
 *   moves: {disk, from, to}[],
 *   frames: {id, parentId, depth, n, from, to, via, moveIndex}[]
 * }}
 */
export function solveWithTrace(n, from = 0, to = 2, via = 1) {
  const moves = [];
  const frames = [];

  function hanoi(k, from, to, via, parentId, depth) {
    if (k === 0) return; // base case: nothing to move, no frame

    const frame = { id: frames.length, parentId, depth, n: k, from, to, via, moveIndex: -1 };
    frames.push(frame);

    hanoi(k - 1, from, via, to, frame.id, depth + 1); // 1) smaller tower out of the way
    frame.moveIndex = moves.length;                   // 2) this call's own move
    moves.push({ disk: k, from, to });
    hanoi(k - 1, via, to, from, frame.id, depth + 1); // 3) smaller tower back on top
  }

  hanoi(n, from, to, via, null, 0);
  return { moves, frames };
}

/**
 * The call stack at the moment move number `moveIndex` is made:
 * the list of calls that are "open", from the first call (bottom of the
 * call stack) to the call making the move (top of the call stack).
 *
 * The call stack is itself a LIFO stack: the most recent call is the first
 * to finish and return.
 *
 * @returns {object[]} frames, root first. Empty array if moveIndex is out of range.
 */
export function callStackAt(frames, moveIndex) {
  const active = frames.find((f) => f.moveIndex === moveIndex);
  if (!active) return [];

  const chain = [];
  for (let f = active; f !== undefined; f = frames[f.parentId]) {
    chain.push(f);
    if (f.parentId === null) break;
  }
  return chain.reverse();
}

/**
 * The best next move from ANY legal position (not only from the start).
 *
 * The player may have gone off the optimal path, so we cannot just read the
 * next line of solve(). Instead we ask the same recursive question from the
 * current position: "What must happen before disk k can reach the target?"
 *   - If disk k is already on the target, ignore it and solve for disks 1..k−1.
 *   - Otherwise disk k must go from its peg (src) to the target, so all the
 *     smaller disks must first be gathered on the third peg (aux).
 *     If that needs a move, do it first; if not, disk k can move now.
 *
 * @param {(disk: number) => number} pegOf  which peg (0/1/2) a disk is on
 * @param {number} k       consider disks 1..k
 * @param {number} target  the peg disks 1..k should end up on
 * @returns {{disk, from, to} | null}  null when disks 1..k are already on target
 */
export function nextHint(pegOf, k, target = 2) {
  if (k === 0) return null;                          // all disks 1..k already on target
  const src = pegOf(k);
  if (src === target) return nextHint(pegOf, k - 1, target);
  const aux = 3 - src - target;                      // the peg that is neither src nor target
  const m = nextHint(pegOf, k - 1, aux);             // first clear the smaller disks onto aux
  return m ?? { disk: k, from: src, to: target };    // then disk k can move
}
