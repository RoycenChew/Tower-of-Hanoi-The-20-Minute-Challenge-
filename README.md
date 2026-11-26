# Tower of Hanoi: The 20-Minute Challenge!

A browser game and teaching tool for a Data Structures & Algorithms course.
Solve the Tower of Hanoi with 3, 4 or 5 disks against a 20-minute clock, and use
Learning Mode to see how **stacks (LIFO)** and **recursion** solve the puzzle in
the minimum **2ⁿ − 1** moves.

**Live site:** <https://roycenchew.github.io/Tower-of-Hanoi-The-20-Minute-Challenge-/>

## Features
_To be completed in Phase 6._

## How to run locally

The game uses ES modules, which browsers do not load from `file://`.
Start a small local server in the project folder, then open the page:

```bash
python -m http.server 8765
```

Open <http://localhost:8765> in your browser.
(The VS Code **Live Server** extension also works.)

On Windows, if you see `PermissionError: [WinError 10013]`, the port is reserved by Windows
(check with `netsh interface ipv4 show excludedportrange protocol=tcp`). Pick another port, e.g. `python -m http.server 5500`.

Add `?debug=1` to the URL (<http://localhost:8765/?debug=1>) to show the timer debug panel.

## How to run the tests

Needs Node.js 22 or newer. There are no npm packages to install.

```bash
npm test
# or
node --test "tests/*.test.js"
```

## File structure

```
index.html                    the page
css/base.css                  colour variables (with contrast ratios), fonts, reset
css/layout.css                page regions, breakpoints, timer warning colours, red border
css/board.css                 pegs, disks, selection, hint pulse, shake
css/components.css            buttons, message bar, panels, welcome card, modals, debug panel
js/main.js                    entry point: creates objects and wires events

js/model/                     pure logic, no DOM (runs in Node tests)
  Stack.js                    the LIFO stack behind every peg
  Rules.js                    validateMove() and all player messages
  GameState.js                pegs, move counter, undo history, move log, hints
  Solver.js                   recursive solve(), solveWithTrace(), nextHint()
  ChallengeTimer.js           the 20-minute countdown (no pause method)
  Stats.js                    totals, stars, score, share text
  EventBus.js                 on / off / emit

js/controller/
  GameController.js           screen states, input gate, challenge flow, Time's up sequence
  Input.js                    browser events -> controller calls
  AnimationQueue.js           move animations (Phase 4)
  LearningMode.js             step-by-step walkthrough (Phase 5)

js/view/
  Board.js                    draws pegs and disks, hint highlight, shake
  UIOverlay.js                timer, metrics, move log, "How it works"
  MessageBar.js               message priority: timer warnings always get 4 s
  Modals.js                   welcome card, victory, Time's up, final summary
  DebugPanel.js               timer jumps, loaded only with ?debug=1
  LearningPanel.js            learning mode panel (Phase 5)
  Sound.js                    sound effects (Phase 6)

tests/                        unit tests (npm test)
  stack, rules, gamestate, solver, timer, stats, eventbus   model
  controller                  click-to-select rules
  challenge                   start, hint/undo/restart/difficulty, victory, Time's up
  messagebar                  warning priority
docs/                         assignment brief (kept local, not in git)
```

## Author
_Your name and student ID here._
