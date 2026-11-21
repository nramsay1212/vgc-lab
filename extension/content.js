/* The go-between: page-hook.js runs inside the Showdown page and can't use extension features,
 * so it posts finished battles here, and this passes them to background.js. */
(function () {
  'use strict';
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const d = ev.data; if (!d || d.source !== 'vgclab-hook' || (d.type !== 'battle-end' && d.type !== 'battle-start')) return;
    if (typeof d.room !== 'string' || typeof d.log !== 'string' || d.log.length > 2000000) return;
    try {
      if (d.type === 'battle-end') chrome.runtime.sendMessage({ type: 'battle-end', room: d.room, me: String(d.me || ''), log: d.log });
      else chrome.runtime.sendMessage({ type: 'battle-start', room: d.room, me: String(d.me || ''), log: d.log }, (res) => { if (res && res.games && res.games.length) headsUp(res); });
    } catch (e) { /* the extension was reloaded; refresh Showdown */ }
  });

  // ---------- opponent heads-up: a small box in the corner at team preview ----------
  function el(tag, cls, text) { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; }
  function headsUp(res) {
    let box = document.getElementById('vgclab-headsup'); if (box) box.remove();
    box = el('div'); box.id = 'vgclab-headsup';
    box.setAttribute('style', 'position:fixed;top:64px;right:16px;z-index:2147483000;width:330px;max-width:calc(100vw - 32px);background:#17181c;color:#ececef;border:1px solid #2CC6CB;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:13px/1.45 system-ui,sans-serif;padding:12px 14px');
    const head = el('div'); head.setAttribute('style', 'display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px');
    const w = res.games.filter(g => g.result === 'W').length, l = res.games.filter(g => g.result === 'L').length;
    const title = el('div'); const b = el('b', '', res.opp); title.append('You\'ve played ', b, ` ${res.games.length} time${res.games.length === 1 ? '' : 's'}`);
    const x = el('button', '', '×'); x.setAttribute('aria-label', 'Close'); x.setAttribute('style', 'background:none;border:0;color:#9a9aa2;font-size:18px;cursor:pointer;line-height:1');
    x.onclick = () => box.remove();
    head.append(title, x);
    const rec = el('div', '', `Your record: ${w}–${l}`); rec.setAttribute('style', `font-weight:600;color:${w >= l ? '#4CB782' : '#EB5757'};margin-bottom:6px`);
    box.append(head, rec);
    for (const g of res.games.slice(0, 3)) {
      const row = el('div'); row.setAttribute('style', 'border-top:1px solid #2b2c33;padding:6px 0');
      const when = el('div', '', `${new Date(g.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · you ${g.result === 'W' ? 'won' : 'lost'}${g.turns ? ` in ${g.turns} turns` : ''}`); when.setAttribute('style', 'color:#9a9aa2;font-size:12px');
      row.append(when);
      if (g.leads && g.leads.length) row.append(el('div', '', `Led: ${g.leads.join(' + ')}`));
      if (g.brought && g.brought.length) row.append(el('div', '', `Came in: ${g.brought.join(', ')}`));
      const same = g.preview && res.preview && g.preview.slice().sort().join() === res.preview.slice().sort().join();
      if (g.preview && g.preview.length) { const t = el('div', '', same ? 'Same six as today' : `Their six then: ${g.preview.join(', ')}`); t.setAttribute('style', 'color:#9a9aa2;font-size:12px'); row.append(t); }
      box.append(row);
    }
    const foot = el('div', '', 'VGC Lab · from games the extension has seen'); foot.setAttribute('style', 'color:#6b6b70;font-size:11px;margin-top:4px');
    box.append(foot);
    document.body.appendChild(box);
  }
})();
