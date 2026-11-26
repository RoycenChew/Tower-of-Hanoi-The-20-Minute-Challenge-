// DebugPanel.js — testing helper. Loaded ONLY when the URL has ?debug=1
// (main.js uses a dynamic import, so without the parameter this file is
// never even downloaded).
//
// The buttons move the challenge clock forward so the 5:00 and 1:00
// warnings and the Time's up sequence can be tested without waiting
// 20 minutes. They call timer.debugSetRemaining(); there is still no way
// to pause the timer.

const JUMPS = [
  { label: 'Jump to 5:05', ms: 5 * 60 * 1000 + 5000 },
  { label: 'Jump to 1:05', ms: 1 * 60 * 1000 + 5000 },
  { label: 'Jump to 0:05', ms: 5000 },
];

/**
 * @param {Document} doc
 * @param {ChallengeTimer} timer
 */
export function mountDebugPanel(doc, timer) {
  const panel = doc.createElement('aside');
  panel.className = 'debug-panel';
  panel.setAttribute('aria-label', 'Debug');

  const title = doc.createElement('p');
  title.className = 'debug-panel__title';
  title.textContent = 'Debug (start the challenge first)';
  panel.append(title);

  for (const { label, ms } of JUMPS) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = label;
    button.addEventListener('click', () => timer.debugSetRemaining(ms));
    panel.append(button);
  }

  doc.body.append(panel);
}
