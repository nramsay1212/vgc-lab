/* Layout options for trying out a simpler app: the same pages, organised four
 * ways. Picked from the switcher at the bottom of the screen or in Account,
 * backup & theme, and kept on this device. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'vgclab-layout', HIDE = 'vgclab-layout-bar';

  const LAYOUTS = [
    ['classic', 'Current', 'Every page listed in the menu, as it is now.'],
    ['hubs', 'Hubs', 'Six sections in the menu. Related pages become tabs along the top of each section.'],
    ['essentials', 'Essentials', 'The 8 pages most players use every day, with everything else tucked under All tools. Pages skip their long intros.'],
    ['coach', 'Coach', 'Today opens on the one thing to do next. The menu is sorted by when you use it, with a line saying what each page is for.'],
  ];
  const HUBS = [
    ['Home', ['today', 'news']],
    ['Play', ['log', 'companion', 'replay', 'review']],
    ['Practice', ['study', 'games', 'test', 'predict', 'sheets']],
    ['Meta and teams', ['meta', 'topteams', 'teams', 'teamcheck', 'calc']],
    ['Progress', ['progress', 'skills', 'roadmap']],
    ['Plan', ['tournaments', 'opponents', 'notebook', 'formats']],
  ];
  const CORE = ['today', 'log', 'companion', 'review', 'study', 'meta', 'teams', 'roadmap'];
  const COACH = [
    ['Before you play', [['today', 'Your plan for today'], ['study', 'Quick drills on what you miss'], ['meta', 'What people are using'], ['teams', 'Build your team'], ['teamcheck', 'Check any team for holes'], ['calc', 'Check a damage roll']]],
    ['While you play', [['companion', 'Timers and reveals next to your Switch'], ['log', 'Save the game in a minute']]],
    ['After you play', [['review', 'What keeps costing you games'], ['replay', 'Go through a game turn by turn'], ['skills', 'Rate yourself and pick a drill']]],
    ['Get sharper', [['games', 'Speed and damage games'], ['test', 'Find your weak spots'], ['predict', 'Guess bring and leads'], ['sheets', 'Plan against a real top team'], ['topteams', 'Teams that won events']]],
    ['Long term', [['progress', 'Your ratings over time'], ['roadmap', 'The path to Worlds'], ['tournaments', 'Events and Championship Points'], ['opponents', 'Players you meet again'], ['notebook', 'Plans for tough threats'], ['formats', 'Getting ready for a new format'], ['news', 'What changed in the game']]],
  ];

  // icons and names are read from the original menu, so every layout uses the same ones
  const nav = document.querySelector('.side .nav'); const sheet = $('sheet');
  const ORIG_NAV = nav.innerHTML;
  const sheetHead = sheet.querySelector('.sheet-head').outerHTML;
  const sheetTail = [...sheet.querySelectorAll('.navbtn, a[href="#settings"]')].map(x => x.outerHTML).join('');
  const ORIG_SHEET = sheet.innerHTML;
  const ICON = {}, NAME = {};
  nav.querySelectorAll('a[href^="#"]').forEach(a => { const t = a.getAttribute('href').slice(1); ICON[t] = (a.querySelector('svg') || {}).outerHTML || ''; NAME[t] = (a.querySelector('span') || a).textContent.trim(); });
  const link = (t, extra) => `<a href="#${t}">${ICON[t] || ''}<span>${esc(NAME[t] || t)}</span>${extra || ''}</a>`;

  let cur = 'classic';
  try { cur = localStorage.getItem(KEY) || 'classic'; } catch (e) { /* ignore */ }
  if (!LAYOUTS.some(l => l[0] === cur)) cur = 'classic';
  const lastInHub = {};

  function hubOf(tab) { return HUBS.find(h => h[1].includes(tab)); }

  function build() {
    document.body.classList.remove(...LAYOUTS.map(l => 'ly-' + l[0])); document.body.classList.add('ly-' + cur);
    if (cur === 'classic') { nav.innerHTML = ORIG_NAV; sheet.innerHTML = ORIG_SHEET; }
    if (cur === 'hubs') {
      nav.innerHTML = HUBS.map(([n, tabs]) => `<a href="#${tabs[0]}" data-hub="${esc(n)}">${ICON[tabs[0]]}<span>${esc(n)}</span><span class="hubcount">${tabs.length}</span></a>`).join('');
      sheet.innerHTML = sheetHead + HUBS.map(([n, tabs]) => `<div class="sheetgroup">${esc(n)}</div>` + tabs.map(t => link(t)).join('')).join('') + sheetTail;
    }
    if (cur === 'essentials') {
      const rest = Object.keys(NAME).filter(t => !CORE.includes(t) && t !== 'settings');
      nav.innerHTML = CORE.map(t => link(t)).join('') + `<details class="alltools"><summary>All tools <span class="hubcount">${rest.length}</span></summary>${rest.map(t => link(t)).join('')}</details>`;
      sheet.innerHTML = sheetHead + CORE.filter(t => !['today', 'log', 'companion', 'study'].includes(t)).map(t => link(t)).join('') + `<div class="sheetgroup">All tools</div>` + rest.map(t => link(t)).join('') + sheetTail;
    }
    if (cur === 'coach') {
      const html = COACH.map(([g, items]) => `<div class="navgroup">${esc(g)}</div>` + items.map(([t, d]) => link(t, `<small class="navdesc">${esc(d)}</small>`)).join('')).join('');
      nav.innerHTML = html;
      sheet.innerHTML = sheetHead + COACH.map(([g, items]) => `<div class="sheetgroup">${esc(g)}</div>` + items.map(([t, d]) => link(t, `<small class="navdesc">${esc(d)}</small>`)).join('')).join('') + sheetTail;
    }
    if (VL.news && VL.news.badge) VL.news.badge();
    mark(); bar();
  }

  // which menu entry is "here", the hub tabs along the top, and Coach's next step
  function mark() {
    const tab = (location.hash || '#today').slice(1) || 'today';
    let strip = $('hubtabs');
    if (cur === 'hubs') {
      const h = hubOf(tab);
      if (h) lastInHub[h[0]] = tab;
      nav.querySelectorAll('[data-hub]').forEach(a => {
        const hub = HUBS.find(x => x[0] === a.dataset.hub); a.setAttribute('href', '#' + (lastInHub[hub[0]] || hub[1][0]));
        if (h && hub[0] === h[0]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      if (!strip) { strip = document.createElement('nav'); strip.id = 'hubtabs'; strip.className = 'hubtabs'; strip.setAttribute('aria-label', 'Pages in this section'); document.querySelector('.wrap').prepend(strip); }
      strip.hidden = !h;
      if (h) strip.innerHTML = h[1].map(t => `<a href="#${t}" ${t === tab ? 'aria-current="page"' : ''}>${ICON[t]}<span>${esc(NAME[t])}</span></a>`).join('');
    } else if (strip) strip.hidden = true;
    if (cur === 'coach') upNext(tab);
    else if ($('upnext')) $('upnext').hidden = true;
  }

  // Coach: the first unfinished item of today's session, with a button straight to it
  const GO = { drill: ['study', 'Start a drill'], warm: ['calc', 'Open the calculator'], ladder: ['companion', 'Start a battle'], log: ['log', 'Log a game'], loss: ['replay', 'Review a replay'], study: ['topteams', 'See top teams'], bo3: ['tournaments', 'Log a set'], weekly: ['review', 'Open Review'] };
  function upNext(tab) {
    if (tab !== 'today') return;
    let box = $('upnext');
    if (!box) { box = document.createElement('div'); box.id = 'upnext'; box.className = 'card accent upnext'; const kp = document.querySelector('#p-today .tiles'); kp.parentNode.insertBefore(box, kp); }
    box.hidden = false;
    const items = VL.SESSION || []; if (!items.length || !VL.store) { box.innerHTML = ''; return; }
    const day = new Date(); const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const done = ((VL.store.get('days', key) || {}).done) || {};
    const left = items.filter(i => !done[i.id]); const n = items.length - left.length;
    const next = left[0];
    if (!next) { box.innerHTML = `<div class="card-head"><h3>You're done for today</h3><span class="sub">${n} of ${items.length}</span></div><p class="sub">Every item in today's session is ticked off. Rest, or play a few more games for fun.</p>`; return; }
    const go = GO[next.id] || ['today', 'Go'];
    box.innerHTML = `<div class="card-head"><h3>Up next</h3><span class="sub">Step ${n + 1} of ${items.length} today</span></div>
      <div class="upnext-main"><div><div class="upnext-t">${esc(next.t)} <span class="mini">${esc(next.m)}</span></div>${next.d ? `<p class="sub">${next.d}</p>` : ''}</div>
      <div class="row" style="gap:8px;flex:none"><button class="btn ghost small" data-un-done="${esc(next.id)}">Mark done</button><a class="btn" href="#${go[0]}">${esc(go[1])} →</a></div></div>
      <div class="upnext-dots">${items.map(i => `<i class="${done[i.id] ? 'd' : i === next ? 'c' : ''}" title="${esc(i.t)}"></i>`).join('')}</div>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-un-done]'); if (!b) return;
    const day = new Date(); const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const d = VL.store.get('days', key) || { done: {} };
    VL.store.put('days', key, { ...d, done: { ...(d.done || {}), [b.dataset.unDone]: true } });
    setTimeout(mark, 30);
  });

  // the switcher for comparing layouts
  function bar() {
    let el = $('lybar'); let hidden = false; try { hidden = localStorage.getItem(HIDE) === '1'; } catch (e) { /* ignore */ }
    if (hidden) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'lybar'; el.className = 'lybar'; document.body.appendChild(el); }
    const L = LAYOUTS.find(l => l[0] === cur);
    el.innerHTML = `<span class="mini">Trying layouts</span><div class="seg">${LAYOUTS.map(([id, n]) => `<button type="button" data-ly="${id}" aria-pressed="${id === cur}">${esc(n)}</button>`).join('')}</div><span class="lybar-d">${esc(L[2])}</span><button type="button" class="x" data-ly-hide aria-label="Hide the layout switcher" title="Hide (it stays in Account, backup & theme)">×</button>`;
  }
  function set(id) { cur = id; try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ } build(); fillSettings(); }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ly]'); if (b) { set(b.dataset.ly); return; }
    if (e.target.closest('[data-ly-hide]')) { try { localStorage.setItem(HIDE, '1'); } catch (x) { /* ignore */ } bar(); }
  });
  function fillSettings() {
    const box = $('ly-settings'); if (!box) return;
    box.innerHTML = LAYOUTS.map(([id, n, d]) => `<label class="ly-opt"><input type="radio" name="ly" value="${id}" ${id === cur ? 'checked' : ''}><span><b>${esc(n)}</b><span class="sub">${esc(d)}</span></span></label>`).join('') + `<button type="button" class="linkbtn" id="ly-showbar">Show the switcher at the bottom of the screen</button>`;
  }
  document.addEventListener('change', (e) => { if (e.target.name === 'ly') set(e.target.value); });
  document.addEventListener('click', (e) => { if (e.target.id === 'ly-showbar') { try { localStorage.removeItem(HIDE); } catch (x) { /* ignore */ } bar(); } });

  window.addEventListener('hashchange', () => setTimeout(mark, 0));
  if (VL.store && VL.store.onChange) VL.store.onChange(() => { if (cur === 'coach') mark(); });
  build(); fillSettings();
  VL.layout = { get: () => cur, set, mark };
})();
