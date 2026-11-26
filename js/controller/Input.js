// Input.js — turns browser events into controller calls.
//
// Every button and peg click goes through here, so this file is the full
// list of "what the player can do". The controller decides if it is allowed.
// Phase 4 adds drag-and-drop and keyboard shortcuts here.

export class Input {
  /**
   * @param {Document} doc
   * @param {Board} board            gives us the three peg buttons
   * @param {GameController} controller
   */
  constructor(doc, board, controller) {
    const onClick = (id, action) => doc.getElementById(id).addEventListener('click', action);

    // Pegs (click, or Enter/Space because they are real <button>s).
    board.pegButtons.forEach((button, peg) => {
      button.addEventListener('click', () => controller.handlePegClick(peg));
    });

    // Welcome card: a <form>, so pressing Enter in the nickname box also starts.
    doc.getElementById('welcome-form').addEventListener('submit', (event) => {
      event.preventDefault();
      controller.start(doc.getElementById('nickname').value);
    });

    // Controls and difficulty.
    onClick('btn-hint', () => controller.hint());
    onClick('btn-undo', () => controller.undo());
    onClick('btn-restart', () => controller.restart());
    doc.querySelectorAll('[data-disks]').forEach((button) => {
      button.addEventListener('click', () => controller.setDifficulty(Number(button.dataset.disks)));
    });

    // Victory modal.
    onClick('btn-next-level', () => controller.nextLevel());
    onClick('btn-play-again', () => controller.playAgain());
    doc.getElementById('victory').addEventListener('close', () => controller.closeVictory());

    // Final summary: a brand-new challenge means a brand-new page (and clock).
    onClick('btn-new-challenge', () => doc.location.reload());
  }
}
