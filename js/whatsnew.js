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
    ['modes-1', 'log', 'Climb or Testing', 'At the top of the form, pick <b>Climb</b> for your real ladder games or <b>Testing</b> when you\'re trying out a team. Testing games are marked Test in the list and kept out of your climb record, Today\'s rating and the weekly review. Review has a <b>Games</b> menu (Climb, Testing or Both) to look at either. The app remembers which one you picked last.'],
    ['snd-soft-1', 'games', 'New sounds', 'Every sound in the app is now a soft bell or marimba tone with a little room echo: a bright chime for right, a gentle low pair for wrong, a sparkle every 5 in a row and a warm chord at the end. In the <b>Test</b>, every answer makes the same soft pop, so the sound never gives away whether you were right.'],
    ['rp-info-1', 'replay', 'New: their Pokémon and Speed order', 'Under the board, <b>Their Pokémon</b> shows each opponent\'s base stats, what it revealed in this game (moves, item, ability, Mega), and what it usually runs. <b>Speed order</b> lists everyone who was brought, fastest first or <b>Under Trick Room</b>. Your Speed is exact if a saved team matches; theirs is the range it could be, plus the most common spread.'],
    ['mm-1', 'teams', 'New: Vs the meta', 'Team analysis now opens on <b>Vs the meta</b>: your team as you built it, tested against the 30 most used Pokémon. You get a score out of 100 (more common Pokémon count for more), and each one is sorted into <b>Problems</b> (nothing answers it), <b>Shaky</b> (only risky answers) or <b>Covered</b>, with who answers it and who it beats. Try the Speed buttons to see how Trick Room or Tailwind changes it, and tap <b>Find a counter →</b> on a problem.'],
    ['rules-1', 'teams', 'The builder knows the rules', 'Under your six slots, <b>Rules</b> lists the chosen format\'s rules. Red boxes appear if two Pokémon hold the same item, you have two of a Pokémon, a Pokémon or item isn\'t allowed in the format, or you have too many restricted legendaries. The item picker greys out items another Pokémon already holds, and filling in a common set picks a free item. With more than one Mega Stone, a note reminds you only one can Mega Evolve per battle.'],
    ['counters-tw-1', 'teams', 'Counters: Tailwind', 'Under <b>Speed</b> in Counters, <b>Your Tailwind</b> and <b>Their Tailwind</b> double one side\'s Speed, so you can see who still answers a threat when the opponent has Tailwind up. Counters also shows how many recent top-cut teams bring Tailwind and Trick Room.'],
    ['counters-1', 'teams', 'New: Counters', 'Team analysis → <b>Counters</b> finds Pokémon that answer the ones giving your team trouble. Your problems and shaky Pokémon from Vs the meta are picked to start; add any other with <b>+ Another Pokémon</b>, or tap <b>Find a counter →</b> in Vs the meta. Each suggestion shows the damage it does, the damage it takes and who moves first, with <b>Under Trick Room</b> for slow teams. <b>Add to slot</b> puts it on your team with its most common set.'],
    ['gamerate-1', 'games', 'Games are rated by your score now', 'Each game is rated once, from your points, so playing fast counts. The results show the number you <b>played like</b>, and your rating moves part of the way toward it. Easier modes have a ceiling: when you get close to it, the results tell you which mode to move up to.'],
    ['videos-1', 'videos', 'New: Videos', 'The latest videos from 20 competitive YouTube channels, sorted into Team ideas, Learn, Tournaments and Battles. Tap one to watch it here. When a team video links its team, <b>Open team in builder</b> copies it into your Team builder.'],
    ['natures-2', 'study', 'New: Nature flashcards', 'The <b>Natures</b> tab is now flashcards for the 12 natures teams actually use. Flip, then mark whether you knew it. Missed cards come back a few cards later. You can show the name or the effect first.'],
    ['readteam-1', 'study', 'New: Read a team', 'The <b>Read a team</b> drill shows real top-cut teams and asks what you\'d spot at team preview: their speed control, weather or terrain, who sets it up, and who has Fake Out.'],
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
