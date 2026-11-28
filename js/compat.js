// compat.js — help for older and in-app browsers (for example the browser
// inside WeChat, which on some phones uses an older engine).
//
// This is a CLASSIC script (not a module), loaded before the game, so it
// runs even where the game's newer JavaScript cannot.
//   1. Adds two small browser functions the game uses, if they are missing.
//   2. If the game still fails to start, shows a clear message instead of an
//      empty board, telling the player how to open a full browser.

(function () {
  'use strict';

  // ---- 1. Small polyfills ----
  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function () {
      this.textContent = '';
      this.append.apply(this, arguments);
    };
  }
  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
      configurable: true,
      writable: true,
      value: function (index) {
        var i = Math.trunc(index) || 0;
        if (i < 0) i += this.length;
        return this[i];
      },
    });
  }

  // ---- 2. "This browser cannot run the game" message ----
  var shown = false;
  function showProblem() {
    if (shown || document.documentElement.getAttribute('data-ready') === 'true') return;
    shown = true;
    var box = document.createElement('div');
    box.className = 'compat-warning';
    box.setAttribute('role', 'alert');
    var inWeChat = /MicroMessenger/i.test(navigator.userAgent);
    box.innerHTML =
      '<strong>This browser cannot run the game.</strong> ' +
      (inWeChat
        ? 'You are in WeChat: tap <b>···</b> at the top right and choose <b>Open in Browser</b>.'
        : 'Please open this page in an up-to-date Chrome, Safari, Edge or Firefox.');
    document.body.appendChild(box);
  }

  // A script error before the game has started, or no start after a few seconds.
  window.addEventListener('error', function () { setTimeout(showProblem, 0); });
  window.addEventListener('load', function () { setTimeout(showProblem, 4000); });
})();
