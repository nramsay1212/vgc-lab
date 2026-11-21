/* The go-between: page-hook.js runs inside the Showdown page and can't use extension features,
 * so it posts finished battles here, and this passes them to background.js. */
(function () {
  'use strict';
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const d = ev.data; if (!d || d.source !== 'vgclab-hook' || d.type !== 'battle-end') return;
    if (typeof d.room !== 'string' || typeof d.log !== 'string' || d.log.length > 2000000) return;
    try { chrome.runtime.sendMessage({ type: 'battle-end', room: d.room, me: String(d.me || ''), log: d.log }); } catch (e) { /* the extension was reloaded; refresh Showdown */ }
  });
})();
