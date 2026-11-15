/* "New here" notes: the first time you open a page after something new was
 * added to it, a short box at the top explains what's new and how to use it.
 * "Got it" hides it for good (on this device). One note shows at a time per page.
 * To announce a new feature, add a line to NOTES: [id, page, title, text]. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const KEY = 'vgclab-seen-notes';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const NOTES = [
    ['videos-1', 'videos', 'New: Videos', 'The latest videos from 20 competitive YouTube channels, sorted into Team ideas, Learn, Tournaments and Battles. Tap one to watch it here. When a team video links its team, <b>Open team in builder</b> copies it into your Team builder.'],
    ['natures-1', 'study', 'New: Natures', 'The <b>Natures</b> tab has the full nature chart and which nature fits which job. The <b>Natures</b> drill quizzes you on what each one does.'],
    ['readteam-1', 'study', 'New: Read a team', 'The <b>Read a team</b> drill shows real top-cut teams and asks what you\'d spot at team preview: their speed control, weather or terrain, who sets it up, and who has Fake Out.'],
    ['naturerush-1', 'games', 'New: Nature Rush', '60 seconds of natures: what one does, or which one does it. It counts toward a Natures rating on Progress.'],
    ['damagewhy-1', 'games', 'Damage Guess explains itself now', 'Each round shows the move\'s type, category and power and the exact stats that meet. After you guess, <b>Why it does that much</b> walks through every multiplier.'],
    ['sound-1', 'games', 'Sounds', 'Right and wrong answers, streaks and new bests have little sounds. Turn them off with the <b>Sound</b> button above, or change the volume in Account, backup &amp; theme.'],
    ['battle-1', 'replay', 'A Showdown-style battle screen', 'Replays now show the battle like Showdown: their Pokémon at the top, yours at the bottom, with HP, status, stat changes, field effects and each team\'s party.'],
    ['meta-older-1', 'meta', 'Every format, and tournament numbers', 'The Format menu now has every older format back to VGC 2009, plus older rules Showdown no longer lists. <b>Numbers from → Tournament team sheets</b> shows what actually places at events instead of what\'s popular on ladder.'],
    ['compare-1', 'review', 'New: Compared with top players', 'Shows the Pokémon top players bring in your format, your record against each, and how your team\'s items and moves differ from theirs.'],
    ['companion-1', 'companion', 'Pick their team with the picker', 'Choose the format, then tap each slot to add their Pokémon with the same picker as the Team builder. Their likely teammates show first.'],
    ['titles-1', 'progress', 'Titles', 'The <b>Titles</b> card shows every rating title and how far you are from the next one.'],
    ['tagq-1', 'log', 'Not sure which mistake it was?', 'Under the mistake tags, <b>Not sure which it was?</b> asks plain questions and ticks the right tags for you. It opens by itself after a loss.'],
    ['seasons-1', 'topteams', 'Past seasons', 'The Event menu has every official event since 2023 by season, plus large online tournaments from now on.'],
  ];

  let seen = {}; try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* ignore */ } };

  function show() {
    document.querySelectorAll('.wn-note').forEach(n => n.remove());
    const tab = (location.hash || '#today').slice(1) || 'today';
    const note = NOTES.find(([id, page]) => page === tab && !seen[id]); if (!note) return;
    const panel = document.getElementById('p-' + tab); if (!panel || !panel.classList.contains('on')) return;
    const left = NOTES.filter(([id, page]) => page === tab && !seen[id]).length;
    const box = document.createElement('div'); box.className = 'card accent wn-note';
    box.innerHTML = `<div class="card-head"><h3>${esc(note[2])}</h3>${left > 1 ? `<span class="sub">${left - 1} more new thing${left > 2 ? 's' : ''} here</span>` : ''}</div><p>${note[3]}</p><div class="row" style="justify-content:flex-end"><button class="btn small" data-wn="${esc(note[0])}">Got it</button></div>`;
    const head = panel.querySelector('.page-head'); if (head) head.after(box); else panel.prepend(box);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-wn]'); if (!b) return; seen[b.dataset.wn] = Date.now(); save(); show(); });
  window.addEventListener('hashchange', () => setTimeout(show, 30));
  // a brand-new user gets the tour instead, so everything that exists today counts as seen for them
  if (!localStorage.getItem('vgclab-toured2') && !Object.keys(seen).length) { NOTES.forEach(([id]) => { seen[id] = 1; }); save(); }
  setTimeout(show, 300);
  VL.whatsNew = { show, notes: NOTES };
})();
