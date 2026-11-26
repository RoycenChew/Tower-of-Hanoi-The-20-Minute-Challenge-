// Confetti.js — a short burst of confetti when a puzzle is solved.
//
// Drawn on a <canvas> that is a fixed layer with pointer-events: none, so it
// never moves the page and never blocks a click. Skipped completely when the
// player asked for reduced motion.

const COLOURS = ['#1E9E4A', '#7B3FC4', '#D62839', '#1F6FEB', '#F08C00', '#FFC300'];
const DURATION_MS = 1600;
const COUNT = 120;

/**
 * @param {HTMLElement} container  where to put the canvas (e.g. the victory
 *   <dialog>, so the confetti shows above its backdrop)
 */
export function launchConfetti(container) {
  const win = container.ownerDocument.defaultView;
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = container.ownerDocument.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const ratio = win.devicePixelRatio || 1;
  const width = win.innerWidth;
  const height = win.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  container.append(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);

  const pieces = Array.from({ length: COUNT }, () => ({
    x: Math.random() * width,
    y: -20 - Math.random() * height * 0.3,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 3,
    spin: (Math.random() - 0.5) * 0.3,
    angle: Math.random() * Math.PI,
    size: 6 + Math.random() * 6,
    colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
  }));

  const start = win.performance.now();
  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS); // fade out at the end
    for (const p of pieces) {
      p.vy += 0.08; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.colour;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < DURATION_MS) win.requestAnimationFrame(frame);
    else canvas.remove();
  }
  win.requestAnimationFrame(frame);
}
