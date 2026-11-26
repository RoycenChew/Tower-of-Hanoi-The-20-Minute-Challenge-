// main.js — entry point. Creates the objects and connects them.
//
//   Model (pure logic)  --events-->  Controller  --calls-->  Views (DOM)
//          ^                              |
//          +---- tryMove / undo / hint ---+
//
// Nothing here contains game rules; it is only the wiring.

import { EventBus } from './model/EventBus.js';
import { GameState } from './model/GameState.js';
import { ChallengeTimer } from './model/ChallengeTimer.js';
import { Stats } from './model/Stats.js';
import { Board } from './view/Board.js';
import { UIOverlay } from './view/UIOverlay.js';
import { Modals } from './view/Modals.js';
import { LearningPanel } from './view/LearningPanel.js';
import { GameController } from './controller/GameController.js';
import { LearningMode } from './controller/LearningMode.js';
import { Input } from './controller/Input.js';

const bus = new EventBus();
const game = new GameState(bus, 3); // 3 disks on Peg A; B and C empty
const timer = new ChallengeTimer(bus);
const stats = new Stats();

const board = new Board(document.getElementById('board'));
const ui = new UIOverlay(document);
const modals = new Modals(document);

// Learning Mode: its own board and state; it talks to its panel via 'learn:step'.
const learning = new LearningMode({ bus });
new LearningPanel(document, bus);

const controller = new GameController({ bus, game, board, ui, modals, stats, timer, learning });
new Input(document, board, controller, learning);

// Draw the starting position straight away (locked under the welcome card),
// then make sure the card does not hide any of the disks.
controller.render();
modals.fitWelcome();

// Browsers slow down timers in background tabs. When the player comes back,
// tick at once so the clock (and any missed warning) is correct immediately.
// The model never touches `document`, so this browser event lives here.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') timer.refresh();
});

// Debug panel: only with ?debug=1. A dynamic import means the file is not
// even downloaded otherwise.
if (new URLSearchParams(location.search).get('debug') === '1') {
  const { mountDebugPanel } = await import('./view/DebugPanel.js');
  mountDebugPanel(document, timer);
}
