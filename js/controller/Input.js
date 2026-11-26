// Input.js — turns browser events into controller calls.
//
// Phase 2: clicks (and Enter/Space, because pegs are real <button>s).
// Phase 4 adds drag-and-drop and keyboard shortcuts here.

export class Input {
  /**
   * @param {Board} board            gives us the three peg buttons
   * @param {GameController} controller
   */
  constructor(board, controller) {
    board.pegButtons.forEach((button, peg) => {
      button.addEventListener('click', () => controller.handlePegClick(peg));
    });
  }
}
