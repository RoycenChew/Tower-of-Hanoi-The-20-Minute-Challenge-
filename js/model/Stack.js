// Stack.js — the LIFO (Last In, First Out) data structure behind every peg.
//
// WHY A PEG IS A STACK: on a real Tower of Hanoi you can only touch the disk
// on TOP of a peg. The last disk placed on a peg is the first one you can take
// off again — that is exactly Last In, First Out. So each peg is a Stack:
//   - moving a disk  = pop() from the source peg, then push() onto the target
//   - checking a move = peek() at the top disks before moving anything
//
// The array is PRIVATE (#items). No other code can reach inside and grab a
// disk from the middle, so the LIFO rule is enforced by the language itself,
// not just by good behaviour.

export class Stack {
  // Bottom of the stack is index 0, top is the last index.
  #items = [];

  /** Put an item on top. O(1): Array.push adds at the end, nothing shifts. */
  push(item) {
    this.#items.push(item);
  }

  /**
   * Remove and return the top item. O(1): Array.pop removes from the end.
   * Popping an empty stack is a programming error, so we throw loudly
   * instead of silently returning undefined.
   */
  pop() {
    if (this.isEmpty()) {
      throw new Error('Stack underflow');
    }
    return this.#items.pop();
  }

  /** Look at the top item without removing it. O(1). Returns null if empty. */
  peek() {
    return this.isEmpty() ? null : this.#items[this.#items.length - 1];
  }

  /** O(1). */
  isEmpty() {
    return this.#items.length === 0;
  }

  /** Number of items. O(1). */
  size() {
    return this.#items.length;
  }

  /**
   * A COPY of the items, bottom -> top. O(k).
   * Used ONLY by the view to draw the pegs (and by tests to inspect them).
   * Game logic never uses it: it would let code "see through" the stack and
   * break the idea that only the top disk is reachable.
   */
  toArray() {
    return [...this.#items];
  }
}
