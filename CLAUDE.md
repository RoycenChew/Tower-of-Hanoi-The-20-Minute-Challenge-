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
- `js/controller/`: GameController (screen states, single input gate `#inputAllowed()`, Time's up sequence, drag API), Input (clicks, Pointer Events drag, keyboard; `shortcutFor()` is pure), AnimationQueue (one job at a time, `busy`, `clear()`), LearningMode (own GameState with a null bus, emits `learn:step`; no DOM).
- `js/view/`: Board (render + FLIP move/return animations + drag visuals), UIOverlay, MessageBar (warning priority), Modals (welcome, victory, Time's up, summary), Confetti, DebugPanel (?debug=1 only, dynamic import), LearningPanel (listens to `learn:step`), Sound (Phase 6).
- `tests/`: stack, rules, gamestate, solver, timer, stats, eventbus, controller, challenge, messagebar, animationqueue, input, learning.
- `docs/screenshots/`: report screenshots (committed). Regenerate with the headless Chrome check script if the UI changes.

## Learning Mode rules (Phase 5)
- Uses its OWN GameState; never calls Stats; never touches the timer. Pause stops only the demo.
- Next = `tryMove()` (pop + push), Previous = `undo()`. The "no undo after solving" rule lives ONLY in `GameController.undo()` (the real game), never in GameState, so Previous works at the final step.
- `index` = steps done (0 … 2ⁿ − 1); the highlighted step is the one just made.
- Sub-tower = innermost call on the call stack with n ≥ 2; its disks get a dashed outline + caption.
- Disabled until Start. Time's up calls `learning.lock()`. While Learning Mode is open, the game's difficulty buttons are hidden and game input is ignored.
- Report test IDs used in test names: TC-01 empty source, TC-02 larger on smaller, TC-04 undo after 5 moves, TC-14 Hint, TC-16 difficulty change, TC-18 Restart, TC-22 timeout during drag, TC-23 timeout during animation, TC-25 rapid clicks during animation.

## Animation and input rules (Phase 4)
- Gameplay move animation: `GAME_TIMING` lift 80 + slide 140 + drop 80 = 300 ms. Learning Mode uses `LEARN_TIMING` (550 ms).
- Animate only `transform` / `translate` / `opacity`.
- While an animation runs, input is refused with BUSY; "Please wait..." shows at most once per animation.
- The R shortcut needs two presses within 2 s; the Restart button is one click.
- `touch-action: none` on disks only. On touch, ignore `lostpointercapture` unless its target is the board itself (the disk's implicit capture is handed over when the drag starts).
- Reduced motion: no animation, moves still happen instantly.

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

## Phase 6 rules
- `Preferences.js` is the ONLY file that touches localStorage (key `hanoi-challenge:v1`), always in try/catch. If storage is unavailable, personal bests are not shown.
- Personal-best logic is pure (`normalizeBests`, `updateLevelBest`, `updateBestScore` in Stats.js).
- Sounds are called explicitly by the controller (move, invalid, win, warning). Learning Mode is silent. Audio unlocks on the first pointerdown/keydown.
- Projector Mode (`html.projector`): +25% text, thicker lines, larger disks. Hides ONLY `.extra` (stars, score, personal bests, copy result), the welcome rules and the nickname field. Never hide "How it works" or the move log (teaching content).
- 4K (>= 2560 px) raises the size caps and the content width (3200 px).
- Live URL is hard-coded in og:url / og:image / twitter:image and the README. Update them if the repo is renamed.

## Poster (assets/poster.png)
- Files: `poster.webp` (155 KB, full), `poster-banner.webp` (title crop for the welcome card), `og-image.jpg` (1200 × 630 link preview).
- Welcome banner sits in the card's left column at >= 1024 px; `fitWelcome()` collapses the rules, then hides the banner, if the card would cover a disk.
- NEVER use it as a gameplay background (its disk colours differ from the assignment's and would hurt contrast).
- Make `assets/poster.webp` (< 200 KB); keep the PNG only as a fallback.
- Open Graph + Twitter meta tags (og:title, og:description, og:image with the ABSOLUTE GitHub Pages URL) so shared links show the poster.
- Welcome card: show it as a banner only at >= 1024 px; hidden on phones; alt text; `loading="eager"` + width/height (no layout shift). The card must still never cover Peg A's disks.
- Never show the poster during gameplay or in Learning Mode.

## Phase 7 visual design rules
- Style from the user's mock-up (`docs/design/redesign.html`, git-ignored; it loads Tailwind from a CDN, never copy that): white cards with a hard dark bottom shadow (`--shadow*`), indigo accent `--primary #4338CA`, pressable buttons (2 px transform only), segmented pills (always ONE row), inline SVG icons from the `<symbol>` sprite at the top of index.html (no icon fonts).
- Fonts are self-hosted in `assets/fonts` (Epilogue headings, Manrope text, OFL). Timer uses the monospace stack so digits never change width.
- Never copy the mock-up's placeholder content (nav pages, ranks, streaks, fake footer), its wrong call tree, its changed wording, its tiny text or its endless animations.
- Learning Mode step list: each step is a `<button data-step>`; clicking calls `learning.seek(step)` (no animation, pauses autoplay, refused after Time's up, never touches Stats).
- `renderStackBoxes()` in UIOverlay.js draws the Stack A/B/C boxes for both the game and Learning Mode.

## Git
- Individual assignment: NEVER add Claude as co-author or contributor (no `Co-Authored-By` lines, no AI attribution in commits or PRs).
- Commit or push only when the user asks. The user creates the GitHub repo and connects the remote.
