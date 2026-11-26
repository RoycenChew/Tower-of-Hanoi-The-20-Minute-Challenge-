// main.js — entry point. Creates the objects and connects them.
//
//   Model (pure logic)  --events-->  Controller  --calls-->  Views (DOM)
//          ^                              |
//          +-------- tryMove / undo ------+
//
// Nothing here contains game rules; it is only the wiring.

import { EventBus } from './model/EventBus.js';
import { GameState } from './model/GameState.js';
import { Board } from './view/Board.js';
import { UIOverlay } from './view/UIOverlay.js';
import { GameController } from './controller/GameController.js';
import { Input } from './controller/Input.js';

const bus = new EventBus();
const game = new GameState(bus, 3); // 3 disks on Peg A; B and C empty

const board = new Board(document.getElementById('board'));
const ui = new UIOverlay(document);
const controller = new GameController({ bus, game, board, ui });
new Input(board, controller);

// Draw the starting position straight away.
controller.render();
