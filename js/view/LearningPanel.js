// LearningPanel.js — draws Learning Mode: the demo board, the controls, the
// step list, the Stack panel, the Recursion panel and the theory cards.
//
// It listens for 'learn:step' (sent by LearningMode) and draws that state.
// It decides nothing about the walkthrough itself.

import { Board, LEARN_TIMING } from './Board.js';
import { renderStackBoxes } from './UIOverlay.js';
import { pegLetter } from '../model/Rules.js';

const SVG = 'http://www.w3.org/2000/svg';
const SUPERSCRIPT = { 3: '³', 4: '⁴', 5: '⁵' };

// Call tree drawing units (the SVG scales to fit its box).
const COL = 90;   // one column per move (a call sits in the column of its own move)
const ROW = 78;   // one row per recursion depth
const NODE_W = 80;
const NODE_H = 50;

/** "hanoi(3, A→C)" */
export function callLabel(frame) {
  return `hanoi(${frame.n}, ${pegLetter(frame.from)}→${pegLetter(frame.to)})`;
}

export class LearningPanel {
  #doc;
  #el;
  #board;
  #builtFor = null; // the disk count the step list and the tree were built for

  constructor(doc, bus) {
    this.#doc = doc;
    const byId = (id) => doc.getElementById(id);
    this.#el = {
      main: doc.querySelector('.main'),
      section: byId('learning'),
      prev: byId('btn-learn-prev'),
      next: byId('btn-learn-next'),
      play: byId('btn-learn-play'),
      playLabel: byId('btn-learn-play-label'),
      reset: byId('btn-learn-reset'),
      speedButtons: [...doc.querySelectorAll('[data-speed]')],
      diskButtons: [...doc.querySelectorAll('[data-learn-disks]')],
      stepCount: byId('learn-step-count'),
      progress: byId('learn-progress'),
      current: byId('learn-current'),
      steps: byId('learn-steps'),
      subTower: byId('learn-subtower'),
      ops: byId('learn-ops'),
      stacks: byId('learn-stacks'),
      callStack: byId('learn-callstack'),
      treeDetails: byId('learn-tree-details'),
      treeBox: byId('learn-tree'),
      side: doc.querySelector('.learning__panels'),
      tabs: [...doc.querySelectorAll('[role="tab"]')],
      theoryRows: [...doc.querySelectorAll('[data-theory-n]')],
      theoryN: byId('theory-current-n'),
    };
    this.#board = new Board(byId('learn-board'));

    // Phone tabs: Stack | Recursion (purely visual, so handled here).
    this.#el.tabs.forEach((tab) => tab.addEventListener('click', () => this.#selectTab(tab.dataset.tab)));

    bus.on('learn:step', ({ state, moved }) => this.render(state, moved));
  }

  /**
   * @param {object} state  from LearningMode.state()
   * @param {{disk: number}|null} moved  the disk that just moved (animate it)
   */
  render(state, moved = null) {
    // Learning Mode replaces the game area; the top bar (and timer) stay.
    this.#el.main.hidden = state.isOpen;
    this.#el.section.hidden = !state.isOpen;
    this.#doc.body.classList.toggle('is-learning', state.isOpen);
    if (!state.isOpen) return;

    if (this.#builtFor !== state.diskCount) this.#build(state);

    this.#renderBoard(state, moved);
    this.#renderControls(state);
    this.#renderProgress(state);
    this.#renderStackPanel(state);
    this.#renderRecursion(state);
  }

  // ----- Demo board (with the 550 ms animation) -----

  #renderBoard(state, moved) {
    // FLIP: measure where the moving disk is drawn NOW, before redrawing.
    let fromRect = null;
    if (moved) {
      this.#board.finishAnimations(); // a quick Next finishes the previous step's animation
      fromRect = this.#board.measureDisk(moved.disk);
    }
    this.#board.render(state.snapshot);

    // Sub-tower: every disk of the sub-tower being moved gets a dashed outline.
    const k = state.subTower?.n ?? 0;
    this.#board.element.querySelectorAll('.disk').forEach((el) => {
      el.classList.toggle('in-subtower', Number(el.dataset.disk) <= k);
    });
    this.#el.subTower.textContent = subTowerCaption(state);

    if (moved && fromRect) {
      const s = state.speed;
      this.#board.animateMove(moved.disk, fromRect, {
        lift: LEARN_TIMING.lift / s, slide: LEARN_TIMING.slide / s, drop: LEARN_TIMING.drop / s,
      });
    }
  }

  #renderControls(state) {
    const { locked } = state;
    this.#el.prev.disabled = locked || state.atStart;
    this.#el.next.disabled = locked || state.atEnd;
    this.#el.play.disabled = locked;
    this.#el.reset.disabled = locked;
    this.#el.playLabel.textContent = state.playing ? 'Pause' : 'Autoplay';
    this.#el.play.setAttribute('aria-pressed', String(state.playing));
    for (const b of this.#el.speedButtons) {
      b.disabled = locked;
      b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === state.speed));
    }
    for (const b of this.#el.diskButtons) {
      b.disabled = locked;
      b.setAttribute('aria-pressed', String(Number(b.dataset.learnDisks) === state.diskCount));
    }
  }

  #renderProgress(state) {
    const { index, total, steps } = state;
    this.#el.stepCount.textContent = `Step ${index} of ${total}`;
    // transform only (cheap to animate), see board.css
    this.#el.progress.style.transform = `scaleX(${total ? index / total : 0})`;

    if (index === 0) {
      this.#el.current.textContent = `Next: ${steps[0]}`;
    } else if (state.atEnd) {
      this.#el.current.textContent =
        `Step ${index}: ${steps[index - 1]}. Solved in ${total} moves, the minimum 2${SUPERSCRIPT[state.diskCount]} − 1.`;
    } else {
      this.#el.current.textContent = `Step ${index}: ${steps[index - 1]}`;
    }

    // Step list: done steps greyed, the step just made highlighted.
    const items = this.#el.steps.children;
    for (let i = 0; i < items.length; i++) {
      items[i].firstElementChild.disabled = state.locked; // no jumping after Time's up
      items[i].classList.toggle('is-done', i < index - 1);
      items[i].classList.toggle('is-current', i === index - 1);
      if (i === index - 1) items[i].setAttribute('aria-current', 'step');
      else items[i].removeAttribute('aria-current');
    }
    // Keep the current step in view by scrolling the LIST only (never the page).
    const current = items[Math.max(0, index - 1)];
    if (current) {
      const list = this.#el.steps;
      list.scrollTop = current.offsetTop - list.clientHeight / 2 + current.clientHeight / 2;
    }

    this.#el.theoryRows.forEach((row) => {
      row.classList.toggle('is-current', Number(row.dataset.theoryN) === state.diskCount);
    });
    this.#el.theoryN.textContent = String(state.diskCount);
  }

  #renderStackPanel(state) {
    this.#el.ops.textContent = state.stackOps ?? 'No moves yet. Press Next to make the first move.';
    renderStackBoxes(this.#el.stacks, state.snapshot.pegs, state.lastMove);
  }

  // ----- Recursion: call stack + call tree -----

  #renderRecursion(state) {
    // Call stack, drawn as stacked blocks: the oldest call at the bottom,
    // the newest (running) call on top — a LIFO stack.
    const blocks = state.callStack.map((frame, i) => {
      const li = this.#doc.createElement('li');
      li.className = 'callstack__block';
      li.textContent = callLabel(frame);
      if (i === state.callStack.length - 1) {
        li.classList.add('is-top');
        li.append(this.#small(` ← moves Disk ${frame.n}`));
      }
      return li;
    });
    if (blocks.length === 0) {
      const li = this.#doc.createElement('li');
      li.className = 'callstack__empty';
      li.textContent = 'Empty. Press Next: the first call is hanoi(' +
        `${state.diskCount}, A→C).`;
      blocks.push(li);
    }
    this.#el.callStack.replaceChildren(...blocks);

    // Call tree: highlight the active call, its path to the root, and finished moves.
    const onPath = new Set(state.callStack.map((f) => f.id));
    this.#el.treeBox.querySelectorAll('.tree-node').forEach((node) => {
      const id = Number(node.dataset.id);
      const moveIndex = Number(node.dataset.moveIndex);
      node.classList.toggle('is-active', id === state.activeFrameId);
      node.classList.toggle('is-path', onPath.has(id) && id !== state.activeFrameId);
      node.classList.toggle('is-done', moveIndex < state.index && !onPath.has(id));
    });
    this.#el.treeBox.querySelectorAll('.tree-edge').forEach((edge) => {
      edge.classList.toggle('is-path', onPath.has(Number(edge.dataset.child)));
    });

    // Keep the active call in view inside the tree's own scroll box.
    const box = this.#el.treeBox;
    if (state.activeFrameId !== null && box.scrollWidth > box.clientWidth) {
      const active = state.frames[state.activeFrameId];
      const x = ((active.moveIndex + 0.5) / state.total) * box.scrollWidth;
      box.scrollLeft = x - box.clientWidth / 2;
    }
  }

  // ----- Built once per disk count -----

  #build(state) {
    this.#builtFor = state.diskCount;

    // Full step list. Each step is a button: clicking it jumps there
    // (Input.js calls learning.seek()). The dot shows which disk moves;
    // each call in the trace moves the disk with its own number n.
    const diskOfStep = [];
    for (const frame of state.frames) diskOfStep[frame.moveIndex] = frame.n;

    this.#el.steps.replaceChildren(...state.steps.map((text, i) => {
      const li = this.#doc.createElement('li');
      const button = this.#doc.createElement('button');
      button.type = 'button';
      button.className = 'step';
      button.dataset.step = String(i + 1); // step k = k moves done
      const num = this.#doc.createElement('span');
      num.className = 'step__num';
      num.textContent = `${i + 1}. `;
      const dot = this.#doc.createElement('span');
      dot.className = 'step__dot';
      dot.style.setProperty('--c', `var(--disk-${diskOfStep[i]})`);
      dot.setAttribute('aria-hidden', 'true');
      const label = this.#doc.createElement('span');
      label.textContent = text;
      button.append(num, dot, label);
      li.append(button);
      return li;
    }));

    // Call tree: open for 3 disks, collapsed for 4 and 5 (they get wide).
    this.#el.treeDetails.open = state.diskCount === 3;
    this.#el.treeBox.replaceChildren(buildTree(this.#doc, state.frames, state.diskCount));
  }

  #selectTab(name) {
    this.#el.side.dataset.tab = name;
    this.#el.tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.tab === name)));
  }

  #small(text) {
    const span = this.#doc.createElement('span');
    span.className = 'callstack__note';
    span.textContent = text;
    return span;
  }
}

/** The caption above the demo board. */
function subTowerCaption(state) {
  const t = state.subTower;
  if (!t) return `The whole tower of ${state.diskCount} disks must go from A to C.`;
  const route = `${pegLetter(t.from)} → ${pegLetter(t.to)}`;
  return t.n === state.diskCount
    ? `Whole tower of ${t.n} disks: ${route}`
    : `Sub-tower of ${t.n} disks: ${route}`;
}

/**
 * The recursion call tree as an SVG. Each call is placed in the COLUMN of its
 * own move (so reading the tree left to right gives the moves in order) and
 * in the ROW of its depth.
 */
function buildTree(doc, frames, diskCount) {
  const total = frames.length;
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${total * COL} ${diskCount * ROW}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Recursion call tree for ${diskCount} disks: ${total} calls, one per move.`);
  svg.style.setProperty('--cols', total);

  const centre = (f) => ({ x: f.moveIndex * COL + COL / 2, y: f.depth * ROW + ROW / 2 });

  // Edges first, so the nodes are drawn on top of them.
  for (const f of frames) {
    if (f.parentId === null) continue;
    const a = centre(frames[f.parentId]);
    const b = centre(f);
    const line = doc.createElementNS(SVG, 'line');
    line.setAttribute('class', 'tree-edge');
    line.dataset.child = String(f.id);
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y + NODE_H / 2);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y - NODE_H / 2);
    svg.append(line);
  }

  for (const f of frames) {
    const { x, y } = centre(f);
    const g = doc.createElementNS(SVG, 'g');
    g.setAttribute('class', 'tree-node');
    g.dataset.id = String(f.id);
    g.dataset.moveIndex = String(f.moveIndex);

    const title = doc.createElementNS(SVG, 'title');
    title.textContent = `${callLabel(f)}: makes move ${f.moveIndex + 1} (Disk ${f.n})`;

    const rect = doc.createElementNS(SVG, 'rect');
    rect.setAttribute('x', x - NODE_W / 2); rect.setAttribute('y', y - NODE_H / 2);
    rect.setAttribute('width', NODE_W); rect.setAttribute('height', NODE_H);
    rect.setAttribute('rx', 8);

    // Two short lines so the label stays readable on a phone:
    //   hanoi(3)
    //   A→C
    const text = doc.createElementNS(SVG, 'text');
    text.setAttribute('x', x); text.setAttribute('y', y - 4);
    text.setAttribute('text-anchor', 'middle');
    const line1 = doc.createElementNS(SVG, 'tspan');
    line1.textContent = `hanoi(${f.n})`;
    const line2 = doc.createElementNS(SVG, 'tspan');
    line2.setAttribute('x', x); line2.setAttribute('dy', 19);
    line2.textContent = `${pegLetter(f.from)}→${pegLetter(f.to)}`;
    text.append(line1, line2);

    g.append(title, rect, text);
    svg.append(g);
  }
  return svg;
}
