/* The menu: six sections instead of one long list. Each section's pages show
 * as tabs along the top of the page, and a section opens on the page you used
 * last. The phone's More menu is grouped the same way. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LAST = 'vgclab-hub-last';

  const HUBS = [
    ['Home', ['today', 'news']],
    ['Play', ['log', 'companion', 'replay', 'review']],
    ['Practice', ['study', 'games', 'test', 'predict', 'sheets']],
    ['Meta and teams', ['meta', 'topteams', 'teams', 'teamcheck', 'calc']],
    ['Progress', ['progress', 'skills', 'roadmap']],
    ['Plan', ['tournaments', 'opponents', 'notebook', 'formats']],
  ];

  // icons and names come from the page list in index.html, so there's one place to change them
  const nav = document.querySelector('.side .nav'); const sheet = $('sheet');
  const ICON = {}, NAME = {};
  nav.querySelectorAll('a[href^="#"]').forEach(a => { const t = a.getAttribute('href').slice(1); ICON[t] = (a.querySelector('svg') || {}).outerHTML || ''; NAME[t] = (a.querySelector('span') || a).textContent.trim(); });
  const link = (t) => `<a href="#${t}">${ICON[t] || ''}<span>${esc(NAME[t] || t)}</span></a>`;
  let last = {}; try { last = JSON.parse(localStorage.getItem(LAST) || '{}') || {}; } catch (e) { last = {}; }

  nav.innerHTML = HUBS.map(([n, tabs]) => `<a href="#${tabs[0]}" data-hub="${esc(n)}">${ICON[tabs[0]]}<span>${esc(n)}</span><span class="hubcount">${tabs.length}</span></a>`).join('');
  const head = sheet.querySelector('.sheet-head').outerHTML;
  const tail = [...sheet.querySelectorAll('.navbtn, a[href="#settings"]')].map(x => x.outerHTML).join('');
  sheet.innerHTML = head + HUBS.map(([n, tabs]) => `<div class="sheetgroup">${esc(n)}</div>` + tabs.map(link).join('')).join('') + tail;

  const strip = document.createElement('nav');
  strip.id = 'hubtabs'; strip.className = 'hubtabs'; strip.setAttribute('aria-label', 'Pages in this section');
  document.querySelector('.wrap').prepend(strip);

  function mark() {
    const tab = (location.hash || '#today').slice(1) || 'today';
    const h = HUBS.find(x => x[1].includes(tab));
    if (h) { last[h[0]] = tab; try { localStorage.setItem(LAST, JSON.stringify(last)); } catch (e) { /* ignore */ } }
    nav.querySelectorAll('[data-hub]').forEach(a => {
      const hub = HUBS.find(x => x[0] === a.dataset.hub);
      a.setAttribute('href', '#' + (last[hub[0]] && hub[1].includes(last[hub[0]]) ? last[hub[0]] : hub[1][0]));
      if (h && hub[0] === h[0]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    strip.hidden = !h;
    if (h) strip.innerHTML = h[1].map(t => `<a href="#${t}" ${t === tab ? 'aria-current="page"' : ''}>${ICON[t]}<span>${esc(NAME[t])}</span></a>`).join('');
    if (VL.news && VL.news.badge) VL.news.badge();
  }
  // after the app's own routing has marked the page
  window.addEventListener('hashchange', () => setTimeout(mark, 0));
  mark();
  VL.hubs = { mark, list: HUBS };
})();
