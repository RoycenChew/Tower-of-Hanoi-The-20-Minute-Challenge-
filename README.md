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
index.html            the page
css/                  base, layout, board and component styles
js/main.js            entry point: creates objects and wires events
js/model/             pure logic, no DOM (Stack, Rules, GameState, Solver, ChallengeTimer, Stats, EventBus)
js/controller/        game flow, input, animations, learning mode
js/view/              draws the board, panels, modals, debug panel, sounds
tests/                unit tests for the model (node --test)
docs/                 assignment brief and plan
```

## Author
_Your name and student ID here._
