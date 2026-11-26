# CLAUDE.md — Tower of Hanoi: The 20-Minute Challenge!

University DSA assignment (Stacks / LIFO, recursion, O(2^n)). A browser game and teaching tool.
The student will present this code in a video, so code must be clean, well commented and easy to explain.
The full spec lives in `docs/` (plan + assignment PDF:
`docs/Assignment_ Tower of Hanoi - The 20-Minute Challenge! (With Detailed Grading Rubric).pdf`). If they conflict, tell the user.

## Points from the assignment PDF / rubric to keep in mind
- On first load, the board must already show 3 disks on Peg A (B and C empty). The welcome card is an overlay on top of the visible, locked board.
- TC-02 says "drag Disk 3 over Disk 1": an illegal drop must be blocked, leave the counter unchanged and add a red invalid log entry. Before Phase 4 (drag), TC-02 is tested with click-to-select; same expected result.
- The rubric deducts marks for "UI layout shifts during alerts": warnings, banners and the red border must never move the layout.
- Learning-mode step text matches the PDF: "Move Disk 1 from Peg A to Peg C".
- The technical report needs an architecture diagram, UI screenshots, an n = 3 call-stack tree and a test table with edge cases, so keep the UI easy to screenshot.

## How we work
- Build in phases (0–6). Do ONE phase at a time.
- Run tests with `npm test` (= `node --test "tests/*.test.js"`; on Node 22+ a bare `tests/` folder argument does not work).
- Start of each phase: show a short plan (files to create or change, key decisions) and WAIT for the user's OK.
- End of each phase: run `npm test`, summarise changes, list manual browser checks, then STOP until the user says "continue".
- Do not rewrite working code from an earlier phase unless the current phase needs it. If it does, say why.
- Comments explain the *ideas* (why a peg is a stack, why the recursion works, why the timer cannot pause), not just each line.

## Hard rules (never break)
1. Vanilla HTML + CSS + JS with ES modules. No frameworks, no runtime deps, no build step. Must run on GitHub Pages from the repo root with relative paths (`./js/main.js`).
2. `package.json` contains only name, version, `"type": "module"` and the `test` script. No dependencies, no npm packages.
3. Every peg is an instance of `Stack` with a private `#items` array. Game logic uses only `push`, `pop`, `peek`, `isEmpty`, `size`. `toArray()` is for the view's drawing only.
4. `js/model/` never touches the DOM, `window` or `document`. It talks to the UI only through `EventBus`, so it runs in Node tests.
5. `ChallengeTimer` (20 min) has NO pause method. Remaining = `endAt - Date.now()`. Hints, learning mode, restart and difficulty change never stop or reset it.
6. An invalid move never changes game state or the move counter.
7. All UI text is in clear, simple English.
8. Disk colours: 1 green `#1E9E4A`, 2 purple `#7B3FC4`, 3 red `#D62839`, 4 blue `#1F6FEB`, 5 orange `#F08C00`. Every disk also shows its number.
9. Move log format exactly: `Move 1: Disk 1 from Peg A to Peg C`.
10. Peg labels exactly: `Peg A — Source`, `Peg B — Spare`, `Peg C — Target`.

## File structure
- `js/model/`: Stack, Rules, GameState, Solver, ChallengeTimer, Stats, EventBus (no DOM).
- `js/controller/`: GameController (screen states, single input gate `#inputAllowed()`, Time's up sequence), Input (all browser events), AnimationQueue (Phase 4), LearningMode (Phase 5).
- `js/view/`: Board, UIOverlay, MessageBar (warning priority), Modals (welcome, victory, Time's up, summary), DebugPanel (?debug=1 only, dynamic import), LearningPanel (Phase 5), Sound (Phase 6).
- `tests/`: stack, rules, gamestate, solver, timer, stats, eventbus, controller, challenge, messagebar.
- Report test IDs used in test names: TC-01 empty source, TC-02 larger on smaller, TC-04 undo after 5 moves, TC-14 Hint, TC-16 difficulty change, TC-18 Restart.

## Conventions
- Pegs indexed 0, 1, 2 = A, B, C. Disks are integers: 1 = smallest, n = largest.
- Layers: `js/model/` (pure logic) → `js/controller/` (input, flow, animation) → `js/view/` (DOM rendering).
- "State changes first, the picture catches up": the model updates instantly, then animations show it.
- `js/view/DebugPanel.js` is loaded only when the URL has `?debug=1`.
- `localStorage` access is always wrapped in try/catch.
- Stats are updated only by explicit controller calls (`recordMove()`, `recordHint()`, ...). Learning-mode demo moves must NEVER call any Stats method (Phase 5).
- Where each disk is: `GameState.pegOf(disk)` (an O(1) table kept next to the stacks), never `toArray()` in game logic.
- No stray `console.log` in finished code.
- No layout shift: messages use the fixed-height message bar; warnings change colours only; overlays/borders are fixed layers. Verify with headless Chrome rect comparisons.
- The welcome card must never cover Peg A's disks (`Modals.fitWelcome()` collapses the rules if needed).

## Git
- Individual assignment: NEVER add Claude as co-author or contributor (no `Co-Authored-By` lines, no AI attribution in commits or PRs).
- Commit or push only when the user asks. The user creates the GitHub repo and connects the remote.
