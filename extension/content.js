/* The go-between: page-hook.js runs inside the Showdown page and can't use extension features,
 * so it posts finished battles here, and this passes them to background.js. */
(function () {
  'use strict';
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const d = ev.data; if (!d || d.source !== 'vgclab-hook' || (d.type !== 'battle-end' && d.type !== 'battle-start')) return;
    if (typeof d.room !== 'string' || typeof d.log !== 'string' || d.log.length > 2000000) return;
    try {
      if (d.type === 'battle-end') chrome.runtime.sendMessage({ type: 'battle-end', room: d.room, me: String(d.me || ''), log: d.log }, (res) => { void chrome.runtime.lastError; if (res && res.ask) afterGame(res); });
      else chrome.runtime.sendMessage({ type: 'battle-start', room: d.room, me: String(d.me || ''), log: d.log }, (res) => { void chrome.runtime.lastError; if (res && res.games && res.games.length) headsUp(res); });
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

  // ---------- after the game: a few quick questions, added to the game in VGC Lab ----------
  const BTN = 'background:#24252b;color:#ececef;border:1px solid #3a3b44;border-radius:999px;padding:4px 10px;font:12px/1.3 system-ui,sans-serif;cursor:pointer;margin:0 6px 6px 0;text-align:left';
  const ON = 'background:#2CC6CB;color:#0e1013;border-color:#2CC6CB;font-weight:600';
  function chip(text, value, group) {
    const c = el('button', '', text); c.type = 'button'; c.dataset.v = value; c.setAttribute('aria-pressed', 'false'); c.setAttribute('style', BTN);
    c.onclick = () => {
      const on = c.getAttribute('aria-pressed') !== 'true';
      if (on && group.max) { const picked = [...group.box.querySelectorAll('[aria-pressed=true]')]; if (picked.length >= group.max) { const first = picked[0]; first.setAttribute('aria-pressed', 'false'); first.setAttribute('style', BTN); } }
      c.setAttribute('aria-pressed', String(on)); c.setAttribute('style', on ? BTN + ';' + ON : BTN);
    };
    return c;
  }
  function label(text) { const l = el('div', '', text); l.setAttribute('style', 'font-weight:600;margin:10px 0 6px'); return l; }
  function afterGame(res) {
    const old = document.getElementById('vgclab-headsup'); if (old) old.remove();
    const bid = 'vgclab-after-' + res.id.replace(/[^a-z0-9-]/g, '');
    if (document.getElementById(bid)) return;
    const box = el('div'); box.id = bid; box.className = 'vgclab-after';
    const n = document.querySelectorAll('.vgclab-after').length;
    box.setAttribute('style', `position:fixed;top:${64 + n * 24}px;right:${16 + n * 24}px;z-index:2147483000;width:360px;max-width:calc(100vw - 32px);max-height:calc(100vh - 90px);overflow:auto;background:#17181c;color:#ececef;border:1px solid ${res.result === 'W' ? '#4CB782' : '#EB5757'};border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:13px/1.45 system-ui,sans-serif;padding:12px 14px`);
    const head = el('div'); head.setAttribute('style', 'display:flex;justify-content:space-between;align-items:baseline;gap:8px');
    const t = el('div'); t.append(el('b', '', res.result === 'W' ? 'Win' : 'Loss'), res.oppName ? ` vs ${res.oppName} · sent to VGC Lab` : ' · sent to VGC Lab');
    const x = el('button', '', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.setAttribute('style', 'background:none;border:0;color:#9a9aa2;font-size:18px;cursor:pointer;line-height:1');
    x.onclick = () => box.remove();
    head.append(t, x); box.append(head);
    const sub = el('div', '', 'Add a few details here and they go straight into that game.'); sub.setAttribute('style', 'color:#9a9aa2;font-size:12px'); box.append(sub);

    box.append(label('What style was their team?'));
    const sel = el('select'); sel.setAttribute('aria-label', 'Their style');
    sel.setAttribute('style', 'width:100%;background:#24252b;color:#ececef;border:1px solid #3a3b44;border-radius:6px;padding:6px;font:13px system-ui,sans-serif');
    sel.append(new Option('(not set)', ''));
    for (const a of res.archs) sel.append(new Option(a, a));
    box.append(sel);

    let tagBox = null;
    if (res.tags.length) {
      box.append(label('What went wrong?'));
      tagBox = el('div'); const g = { box: tagBox };
      for (const [id, l] of res.tags) tagBox.append(chip(l, id, g));
      box.append(tagBox);
    }
    let backBox = null;
    if (res.back.length && res.pick) {
      box.append(label(res.pick === 1 ? `One of the ${res.bring} you brought never came in. Which one stayed in the back?` : `${res.pick} of the ${res.bring} you brought never came in. Which ones stayed in the back?`));
      backBox = el('div'); const g = { box: backBox, max: res.pick };
      for (const n of res.back) backBox.append(chip(n, n, g));
      box.append(backBox);
    }
    box.append(label('Note (optional)'));
    const note = el('input'); note.type = 'text'; note.maxLength = 300; note.placeholder = 'Anything to remember';
    note.setAttribute('style', 'width:100%;box-sizing:border-box;background:#24252b;color:#ececef;border:1px solid #3a3b44;border-radius:6px;padding:6px;font:13px system-ui,sans-serif');
    box.append(note);

    const row = el('div'); row.setAttribute('style', 'display:flex;gap:8px;align-items:center;margin-top:12px');
    const save = el('button', '', 'Save to VGC Lab'); save.type = 'button';
    save.setAttribute('style', 'background:#2CC6CB;color:#0e1013;border:0;border-radius:6px;padding:7px 14px;font:600 13px system-ui,sans-serif;cursor:pointer');
    const skip = el('button', '', 'Skip'); skip.type = 'button'; skip.setAttribute('style', 'background:none;border:0;color:#9a9aa2;font:13px system-ui,sans-serif;cursor:pointer');
    skip.onclick = () => box.remove();
    const msg = el('span'); msg.setAttribute('style', 'font-size:12px;color:#9a9aa2');
    const picked = (b) => b ? [...b.querySelectorAll('[aria-pressed=true]')].map(c => c.dataset.v) : [];
    save.onclick = () => {
      save.disabled = true; msg.textContent = 'Saving…';
      try {
        chrome.runtime.sendMessage({ type: 'details', id: res.id, arch: sel.value, tags: picked(tagBox), back: picked(backBox), note: note.value }, (r) => {
          void chrome.runtime.lastError;
          if (r && r.ok) { msg.textContent = r.empty ? 'Nothing picked, so nothing changed.' : 'Added to the game in VGC Lab ✓'; msg.style.color = r.empty ? '#9a9aa2' : '#4CB782'; setTimeout(() => box.remove(), r.empty ? 2000 : 1600); }
          else { msg.textContent = 'Couldn\'t save. Try Send again in the extension menu.'; msg.style.color = '#EB5757'; save.disabled = false; }
        });
      } catch (e) { msg.textContent = 'The extension was reloaded. Refresh Showdown.'; msg.style.color = '#EB5757'; }
    };
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); e.stopPropagation(); });
    note.addEventListener('keypress', (e) => e.stopPropagation()); note.addEventListener('keyup', (e) => e.stopPropagation());
    row.append(save, skip, msg); box.append(row);
    document.body.appendChild(box);
  }
})();
