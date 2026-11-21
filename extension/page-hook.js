/* Runs inside the Showdown page itself (the "main world"), before Showdown's own code.
 * It listens to the messages the Showdown server sends this page, which carry every line
 * of every battle you're in, and keeps each battle's lines. When a battle ends (and the
 * rating change has come in), it hands the whole battle log to content.js.
 * It never sends anything to the server and never clicks anything. */
(function () {
  'use strict';
  if (window.__vgclabHook) return; window.__vgclabHook = true;
  const rooms = {}; // room id -> { lines: [], ended: false, timer }
  let me = '';
  const done = new Set();

  function post(msg) { window.postMessage({ source: 'vgclab-hook', ...msg }, location.origin); }

  function finish(id) {
    const r = rooms[id]; if (!r || done.has(id)) return;
    done.add(id); clearTimeout(r.timer);
    const log = r.lines.join('\n');
    let user = me;
    if (!user) { // fall back to what Showdown's own page knows
      try { user = (window.app && window.app.user && window.app.user.get('name')) || (window.PS && window.PS.user && window.PS.user.name) || ''; } catch (e) { user = ''; }
    }
    post({ type: 'battle-end', room: id, me: user, log });
    delete rooms[id];
  }

  function onLine(id, line) {
    if (line.startsWith('|updateuser|')) {
      const f = line.split('|'); // |updateuser| Name|named|avatar|settings  (the name starts with a rank symbol or a space)
      const name = String(f[2] || '').replace(/^[^A-Za-z0-9]/, '').trim();
      if (name && f[3] !== '0') me = name;
      return;
    }
    if (!id.startsWith('battle-')) return;
    let r = rooms[id];
    if (line.startsWith('|init|battle')) { r = rooms[id] = { lines: [], ended: false, timer: null }; done.delete(id); return; } // joining sends the whole battle again
    if (!r) r = rooms[id] = { lines: [], ended: false, timer: null };
    r.lines.push(line);
    if (/^\|(win|tie)(\||$)/.test(line)) {
      r.ended = true;
      // the rating change arrives a moment after the win line
      r.timer = setTimeout(() => finish(id), 4000);
    } else if (r.ended && /^\|raw\|.*rating:/.test(line)) {
      clearTimeout(r.timer); r.timer = setTimeout(() => finish(id), 800);
    }
  }

  function onMessage(text) {
    if (typeof text !== 'string' || !text) return;
    let id = '';
    if (text.charAt(0) === '>') { const nl = text.indexOf('\n'); id = nl < 0 ? text.slice(1) : text.slice(1, nl); text = nl < 0 ? '' : text.slice(nl + 1); }
    for (const line of text.split('\n')) if (line) onLine(id.trim(), line);
    if (id && /^\|deinit/m.test(text) && rooms[id] && rooms[id].ended) finish(id); // you left the room early
  }

  function onFrame(ev) {
    const d = ev.data; if (typeof d !== 'string') return;
    try {
      // Showdown talks through SockJS, which wraps messages as a["...","..."]; a plain socket sends them bare
      if (d.charAt(0) === 'a' && d.charAt(1) === '[') { for (const m of JSON.parse(d.slice(1))) onMessage(m); }
      else if (d.length > 1 || (d !== 'o' && d !== 'h')) onMessage(d);
    } catch (e) { /* not a battle message */ }
  }

  // wrap the browser's WebSocket so each socket Showdown opens also reports its messages here
  const Native = window.WebSocket;
  if (Native) {
    const Wrapped = function (url, protocols) {
      const ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
      try { ws.addEventListener('message', onFrame); } catch (e) { /* leave the socket alone */ }
      return ws;
    };
    Wrapped.prototype = Native.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Wrapped[k] = Native[k];
    window.WebSocket = Wrapped;
  }

  // Backup for when the socket wasn't seen (for example the extension was turned on mid-battle):
  // every few seconds, look for finished battles in Showdown's own page and read their logs.
  setInterval(() => {
    try {
      const list = [];
      if (window.app && window.app.rooms) for (const [id, room] of Object.entries(window.app.rooms)) list.push([id, room]);
      if (window.PS && window.PS.rooms) for (const [id, room] of Object.entries(window.PS.rooms)) list.push([id, room]);
      for (const [id, room] of list) {
        if (!id.startsWith('battle-') || done.has(id) || rooms[id]) continue;
        const b = room && room.battle; if (!b || !b.ended || !Array.isArray(b.stepQueue)) continue;
        const log = b.stepQueue.join('\n'); if (!/^\|win\|/m.test(log)) continue;
        rooms[id] = { lines: b.stepQueue.slice(), ended: true, timer: null }; finish(id);
      }
    } catch (e) { /* the page changed shape; the socket path still works */ }
  }, 5000);

  post({ type: 'hook-ready' });
})();
