/* Built-in help: glossary terms (tap a dotted word), the glossary page in
 * Study, and the first-time tour. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  VL.GLOSSARY = {
    bo3: ['Bo1 and Bo3', 'Best of 1: a single game decides it, like ranked ladder. Best of 3: first to win 2 games, used at tournaments. In Bo3 you can change your plan between games based on what you saw.'],
    preview: ['Team preview', 'Before the battle, both players see each other\'s 6 Pokémon. In VGC you then pick 4 of your 6 to bring, and choose which 2 lead.'],
    bring4: ['Bring 4', 'In VGC you register 6 Pokémon but only bring 4 into each game, chosen after seeing your opponent\'s 6 at team preview.'],
    lead: ['Lead', 'The two Pokémon you send out at the start of the battle. The other two stay in the back to switch in later.'],
    wincon: ['Win condition', 'The Pokémon or plan that actually wins you the game, like a strong attacker that sweeps once Trick Room is up. Protect it; don\'t trade it away early.'],
    speedcontrol: ['Speed control', 'Anything that changes who moves first: Tailwind, Trick Room, Icy Wind, Electroweb, paralysis, Choice Scarf. Most VGC games are won by whoever controls speed.'],
    tailwind: ['Tailwind', 'Doubles the Speed of your side for 4 turns, counting the turn you use it.'],
    trickroom: ['Trick Room', 'For 5 turns (counting the turn it\'s used), slower Pokémon move before faster ones. Priority moves still go first.'],
    spread: ['Spread move', 'A move that hits more than one Pokémon, like Heat Wave or Earthquake. It does 0.75× damage to each target when it hits more than one.'],
    stab: ['STAB', 'Same-Type Attack Bonus. A move matching the user\'s type does 1.5× damage.'],
    priority: ['Priority', 'Moves are sorted into brackets before Speed is checked. Fake Out (+3) and Protect (+4) go before normal moves; Trick Room (−7) goes last. Speed only decides order within a bracket.'],
    archetype: ['Archetype', 'A team\'s main style or game plan: Trick Room, Tailwind offense, weather (sun, rain, sand, snow), terrain, balance or hyper offense. Logging it shows which styles you struggle against.'],
    keyturn: ['Key turn', 'The turn where the game swung. Writing it down makes rewatching the replay much faster.'],
    regulation: ['Regulation', 'The ruleset that decides which Pokémon, items and mechanics are legal. VGC switches regulation every few months.'],
    format: ['Format', 'A specific ruleset in a specific game, like VGC 2026 Reg M-C in Pokémon Champions. The app keeps your stats separate for each one.'],
    cp: ['Championship Points (CP)', 'Points earned at official tournaments during a season. Your total decides who gets invited to the World Championships.'],
    day2: ['Day 2', 'Big tournaments play Swiss rounds on Day 1. Players with a good enough record move on to Day 2.'],
    topcut: ['Top cut', 'The single-elimination bracket (Top 8, Top 16 and so on) after the Swiss rounds.'],
    ots: ['Open team sheets', 'Both players see each other\'s full teams, including moves, items and abilities, before the match. Used at many official events.'],
    ladder: ['Ladder', 'Ranked online battles in the game. Your rating goes up when you win and down when you lose.'],
    gimmick: ['Battle gimmick', 'Each game\'s special mechanic: Mega Evolution (Gen 6–7 and Champions), Z-Moves (Gen 7), Dynamax (Gen 8) and Terastallization (Gen 9).'],
    mega: ['Mega Evolution', 'Once per battle, a Pokémon holding its Mega Stone transforms for the rest of the battle, with new stats and often a new ability.'],
    tera: ['Terastallization', 'Once per battle in Scarlet/Violet, a Pokémon changes its type to its Tera type for the rest of the battle.'],
    basestats: ['Base stats', 'Each species\' fixed stat numbers. Two Pokémon with the same investment: the one with higher base Speed is faster.'],
    statpoints: ['Stat Points and EVs', 'Points you put into stats. In Champions: 66 Stat Points, at most 32 in one stat, each worth 1 point at Level 50. In mainline games: 510 EVs, at most 252 in one stat.'],
    ivs: ['IVs', 'Hidden 0–31 values for each stat in mainline games. Champions has none; every Pokémon has perfect stats.'],
    nature: ['Nature', 'Raises one stat by 10% and lowers another by 10%. A Speed-boosting nature matters a lot for speed tiers.'],
    benchmark: ['Benchmark', 'A specific stat number chosen on purpose, like "just enough Speed to outspeed X" or "enough bulk to survive Y\'s attack."'],
    fakeout: ['Fake Out', 'A +3 priority attack that makes the target flinch. It only works on the user\'s first turn after switching in.'],
    protect: ['Protect', 'Blocks almost every move for one turn (+4 priority). Using it twice in a row will usually fail.'],
    redirection: ['Redirection', 'Follow Me and Rage Powder pull the opponents\' single-target moves onto the user for that turn, protecting its partner.'],
    intimidate: ['Intimidate', 'An ability that lowers both opponents\' Attack by 1 stage when the user switches in.'],
    chip: ['Chip damage', 'Small damage that adds up over turns: weather, burn, poison, Rocky Helmet and so on.'],
    ohko: ['OHKO and 2HKO', 'One-hit KO and two-hit KO: whether an attack knocks out the target in one hit or needs two.'],
    roll: ['Damage roll', 'Damage varies randomly between 85% and 100% of its maximum, so a "maybe KO" can go either way.'],
    rng: ['RNG', 'Random chance: crits, misses, speed ties, damage rolls, secondary effects. Tag it honestly, and check whether a safer play would have avoided the risk.'],
    calc: ['Damage calc', 'A damage calculator that shows exact damage ranges between two Pokémon. Pokémon Showdown\'s calc is the standard one.'],
    matchup: ['Matchup', 'How your team lines up against theirs. Some games are hard from team preview; your log shows which ones.'],
  };

  // ---------- term popover ----------
  const pop = $('pop');
  let popFor = null;
  function showTerm(el) {
    const g = VL.GLOSSARY[el.dataset.term]; if (!g) return;
    pop.innerHTML = `<b>${esc(g[0])}</b>${esc(g[1])}`;
    pop.hidden = false; popFor = el;
    const r = el.getBoundingClientRect(); const pw = Math.min(300, window.innerWidth - 24);
    pop.style.maxWidth = pw + 'px';
    let left = Math.min(Math.max(12, r.left), window.innerWidth - pw - 12);
    pop.style.left = left + 'px';
    const below = r.bottom + 8; const h = pop.offsetHeight;
    pop.style.top = (below + h > window.innerHeight - 12 ? Math.max(12, r.top - h - 8) : below) + 'px';
  }
  function hideTerm() { pop.hidden = true; popFor = null; }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.term');
    if (t) { e.preventDefault(); e.stopPropagation(); if (popFor === t) hideTerm(); else showTerm(t); return; }
    if (!e.target.closest('#pop')) hideTerm();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideTerm(); closeTour(); } });
  window.addEventListener('scroll', hideTerm, true);
  // make terms keyboard reachable
  const termObserver = new MutationObserver(() => document.querySelectorAll('.term:not([tabindex])').forEach(t => { t.tabIndex = 0; t.setAttribute('role', 'button'); }));
  termObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && document.activeElement.classList.contains('term')) { e.preventDefault(); showTerm(document.activeElement); } });

  // ---------- glossary page ----------
  VL.renderGlossary = function () {
    const q = ($('gl-q').value || '').toLowerCase();
    const rows = Object.entries(VL.GLOSSARY).sort((a, b) => a[1][0].localeCompare(b[1][0])).filter(([, g]) => !q || g[0].toLowerCase().includes(q) || g[1].toLowerCase().includes(q));
    $('gl-out').innerHTML = rows.map(([, g]) => `<div class="g"><b>${esc(g[0])}</b><p>${esc(g[1])}</p></div>`).join('') || '<p class="sub">No match.</p>';
  };
  $('gl-q').addEventListener('input', VL.renderGlossary);

  // ---------- tour ----------
  const STEPS = [
    ['Welcome to your training lab', `<p>This app turns playing into practice. Everything runs in one loop:</p>
      <ul><li><b>Play</b> your games with one focus in mind.</li><li><b>Log</b> each game in a minute.</li><li><b>Review</b> once a week to find what's costing you.</li><li><b>Study</b> a little every day so the basics are automatic.</li><li><b>Plan</b> against the threats you keep losing to.</li></ul>`],
    ['Log every game', `<p>Right after a game, open <b>Log a game</b>. Only Win or Loss is required, but the more you fill in, the smarter Review gets.</p>
      <p>The most useful parts: <b>their 6</b>, the <b>tags</b> for what lost the game, and one line on what you'd do differently.</p>`],
    ['Review once a week', `<p><b>Review</b> shows your win rate, rating, the mistakes that cost the most games, and the Pokémon you lose to.</p>
      <p>Every Sunday, copy the review prompt into Claude for a coach's read on your logs, then set next week's focus on <b>Today</b>.</p>`],
    ['Study a little every day', `<p><b>Study</b> has 10-question drills: type matchups, speed tiers, items, abilities, priority and mechanics. Questions you miss come back until you get them.</p>
      <p>It works for every VGC game back to 2009, and new games, Pokémon and items appear automatically each week.</p>`],
    ['Plan the long road', `<p><b>Notebook</b> holds your game plans against specific threats. <b>Formats</b> helps you learn each new regulation fast. <b>Roadmap</b> shows the path to Worlds and where you are on it.</p>
      <p>Dotted words like <span class="term" data-term="wincon">win condition</span> explain themselves when you tap them. You can rerun this tour from the menu anytime.</p>`],
  ];
  let step = 0;
  function renderTour() {
    $('tour-dots').innerHTML = STEPS.map((_, i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('');
    $('tour-title').textContent = STEPS[step][0];
    $('tour-body').innerHTML = STEPS[step][1];
    $('tour-back').hidden = step === 0;
    $('tour-next').textContent = step === STEPS.length - 1 ? 'Start training' : 'Next';
  }
  function openTour() { step = 0; renderTour(); $('tour').hidden = false; $('tour-next').focus(); }
  function closeTour() { if ($('tour').hidden) return; $('tour').hidden = true; try { localStorage.setItem('vgclab-toured', '1'); } catch (e) { /* ignore */ } }
  $('tour-next').onclick = () => { if (step < STEPS.length - 1) { step++; renderTour(); } else { closeTour(); location.hash = 'today'; } };
  $('tour-back').onclick = () => { if (step > 0) { step--; renderTour(); } };
  $('tour-skip').onclick = closeTour;
  $('tour').addEventListener('click', e => { if (e.target.id === 'tour') closeTour(); });
  document.querySelectorAll('[data-tour]').forEach(b => b.addEventListener('click', () => { VL.closeSheet && VL.closeSheet(); openTour(); }));
  VL.maybeTour = function () { let seen = '1'; try { seen = localStorage.getItem('vgclab-toured'); } catch (e) { /* ignore */ } if (!seen) openTour(); };
})();
