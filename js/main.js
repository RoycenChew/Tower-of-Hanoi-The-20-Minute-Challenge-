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
import { Sound } from './view/Sound.js';
import { Tour } from './view/Tour.js';
import { initGlossary } from './view/Glossary.js';
import { GameController } from './controller/GameController.js';
import { LearningMode } from './controller/LearningMode.js';
import { Preferences } from './controller/Preferences.js';
import { Input } from './controller/Input.js';

// ---- Model ----
const bus = new EventBus();
const game = new GameState(bus, 3); // 3 disks on Peg A; B and C empty
const timer = new ChallengeTimer(bus);
const stats = new Stats();

// ---- Remembered settings (sound, Projector Mode, nickname, personal bests) ----
const prefs = new Preferences();
const sound = new Sound({ muted: prefs.get('muted', false) });

// ---- Views ----
const board = new Board(document.getElementById('board'));
const ui = new UIOverlay(document);
const modals = new Modals(document);
ui.setMuted(sound.muted);
ui.setProjector(prefs.get('projector', false));
document.getElementById('nickname').value = prefs.get('nickname', '');

// ---- Learning Mode: its own board and state; it talks to its panel via 'learn:step' ----
const learning = new LearningMode({ bus });
new LearningPanel(document, bus);

// ---- Controller and input ----
const controller = new GameController({ bus, game, board, ui, modals, stats, timer, learning, sound, prefs });

// ---- Guided tour and glossary (for beginners) ----
// While the tour runs before Start, the welcome card steps aside so the
// spotlight can show the real board. Afterwards: practice, or the card again.
const tour = new Tour(document, {
  onOpen: () => {
    if (controller.canPractice) modals.setWelcomeCardVisible(false);
  },
  onClose: (choice) => {
    prefs.set('tourSeen', true); // first-time players see it automatically only once
    if (choice === 'practice' && controller.canPractice) controller.startPractice();
    else if (controller.canPractice) modals.setWelcomeCardVisible(true);
  },
});
initGlossary(document);

new Input(document, { board, controller, learning, ui, modals, sound, prefs, tour });

// Draw the starting position straight away (locked under the welcome card),
// then make sure the card does not hide any of the disks.
controller.render();
modals.fitWelcome();

// First visit: start with the tour (it ends by offering a practice puzzle).
if (!prefs.get('tourSeen', false)) tour.start({ offerPractice: true });

// Browsers slow down timers in background tabs. When the player comes back,
// tick at once so the clock (and any missed warning) is correct immediately.
// The model never touches `document`, so this browser event lives here.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') timer.refresh();
});

// Debug panel: only with ?debug=1. A dynamic import means the file is not
// even downloaded otherwise.
// (No top-level "await": older browsers, e.g. some in-app browsers, cannot read it.)
if (new URLSearchParams(location.search).get('debug') === '1') {
  import('./view/DebugPanel.js').then(({ mountDebugPanel }) => mountDebugPanel(document, timer));
}

// Fonts arrive a moment after the page: check the welcome card again once they have.
document.fonts?.ready.then(() => modals.fitWelcome());

// Tell js/compat.js that the game started (so it shows no "browser too old" message).
document.documentElement.dataset.ready = 'true';
