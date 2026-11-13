/* Built-in help: glossary terms (tap a dotted word), the glossary page in
 * Study, and the first-time tour. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  VL.GLOSSARY = {
    bo3: ['Best of 1 and best of 3', 'Best of 1: a single game decides it, like ranked ladder. Best of 3: first to win 2 games, used at tournaments. In a best of 3 you can change your plan between games based on what you saw.'],
    preview: ['Team preview', 'Before the battle, both players see each other\'s 6 Pokémon. In doubles (VGC) you then pick 4 of your 6 and choose which 2 lead. In Battle Stadium Singles you pick 3 and choose 1 to lead.'],
    bring4: ['Bring 4', 'In VGC you register 6 Pokémon but only bring 4 into each game, chosen after seeing your opponent\'s 6 at team preview.'],
    lead: ['Lead', 'The Pokémon you send out at the start of the battle: 2 in doubles, 1 in singles. The rest stay in the back to switch in later.'],
    bring3: ['Bring 3', 'In Battle Stadium Singles you register 6 Pokémon but only bring 3 into each game, chosen after seeing your opponent\'s 6 at team preview.'],
    hazards: ['Entry hazards', 'Stealth Rock, Spikes, Toxic Spikes and Sticky Web. Once set, they hurt or slow every opposing Pokémon that switches in until they\'re cleared with Rapid Spin, Defog or Mortal Spin.'],
    pivot: ['Pivot', 'A move that attacks and then switches the user out, like U-turn, Volt Switch or Flip Turn. It lets you bring in the right Pokémon after seeing what the opponent did.'],
    setup: ['Setting up', 'Using a turn to boost your stats with moves like Swords Dance, Dragon Dance or Nasty Plot, then sweeping. Most singles games are won or lost around setup.'],
    wincon: ['Win condition', 'The Pokémon or plan that actually wins you the game, like a strong attacker that sweeps once Trick Room is up. Protect it; don\'t trade it away early.'],
    speedcontrol: ['Speed control', 'Anything that changes who moves first: Tailwind, Trick Room, Icy Wind, Electroweb, paralysis, Choice Scarf. Most VGC games are won by whoever controls speed.'],
    tailwind: ['Tailwind', 'Doubles the Speed of your side for 4 turns, counting the turn you use it.'],
    trickroom: ['Trick Room', 'For 5 turns (counting the turn it\'s used), slower Pokémon move before faster ones. Priority moves still go first.'],
    spread: ['Spread move', 'A move that hits more than one Pokémon, like Heat Wave or Earthquake. It does 0.75× damage to each target when it hits more than one.'],
    stab: ['Same-type attack bonus', 'Often called STAB. A move matching the user\'s type does 1.5× damage.'],
    priority: ['Priority', 'Moves are sorted into brackets before Speed is checked. Fake Out (+3) and Protect (+4) go before normal moves; Trick Room (−7) goes last. Speed only decides order within a bracket.'],
    archetype: ['Archetype', 'A team\'s main style or game plan: Trick Room, Tailwind offense, weather (sun, rain, sand, snow), terrain, balance or hyper offense. Logging it shows which styles you struggle against.'],
    keyturn: ['Key turn', 'The turn where the game swung. Writing it down makes rewatching the replay much faster.'],
    regulation: ['Regulation', 'The ruleset that decides which Pokémon, items and mechanics are legal. VGC switches regulation every few months.'],
    format: ['Format', 'A specific ruleset in a specific game, like VGC 2026 Reg M-C in Pokémon Champions. The app keeps your stats separate for each one.'],
    cp: ['Championship Points', 'Points earned at official tournaments during a season. Your total decides who gets invited to the World Championships.'],
    day2: ['Day 2', 'Big tournaments play Swiss rounds on Day 1. Players with a good enough record move on to Day 2.'],
    topcut: ['Top cut', 'The single-elimination bracket (Top 8, Top 16 and so on) after the Swiss rounds.'],
    ots: ['Open team sheets', 'Both players see each other\'s full teams, including moves, items and abilities, before the match. Used at many official events.'],
    ladder: ['Ladder', 'Ranked online battles in the game. Your rating goes up when you win and down when you lose.'],
    gimmick: ['Battle gimmick', 'Each game\'s special mechanic: Mega Evolution (Generations 6–7 and Champions), Z-Moves (Generation 7), Dynamax (Generation 8) and Terastallization (Generation 9).'],
    mega: ['Mega Evolution', 'Once per battle, a Pokémon holding its Mega Stone transforms for the rest of the battle, with new stats and often a new ability.'],
    tera: ['Terastallization', 'Once per battle in Scarlet/Violet, a Pokémon changes its type to its Tera type for the rest of the battle.'],
    basestats: ['Base stats', 'Each species\' fixed stat numbers. Two Pokémon with the same investment: the one with higher base Speed is faster.'],
    statpoints: ['Stat Points and effort values', 'Points you put into stats. In Champions: 66 Stat Points, at most 32 in one stat, each worth 1 point at Level 50. In older games: 510 effort values, at most 252 in one stat.'],
    ivs: ['Individual values', 'Hidden 0–31 values for each stat in mainline games. Champions has none; every Pokémon has perfect stats.'],
    nature: ['Nature', 'Raises one stat by 10% and lowers another by 10%. A Speed-boosting nature matters a lot for speed tiers.'],
    benchmark: ['Benchmark', 'A specific stat number chosen on purpose, like "just enough Speed to outspeed X" or "enough bulk to survive Y\'s attack."'],
    fakeout: ['Fake Out', 'A +3 priority attack that makes the target flinch. It only works on the user\'s first turn after switching in.'],
    protect: ['Protect', 'Blocks almost every move for one turn (+4 priority). Using it twice in a row will usually fail.'],
    redirection: ['Redirection', 'Follow Me and Rage Powder pull the opponents\' single-target moves onto the user for that turn, protecting its partner.'],
    intimidate: ['Intimidate', 'An ability that lowers both opponents\' Attack by 1 stage when the user switches in.'],
    chip: ['Chip damage', 'Small damage that adds up over turns: weather, burn, poison, Rocky Helmet and so on.'],
    ohko: ['One-hit and two-hit knockouts', 'Whether an attack knocks out the target in one hit or needs two.'],
    roll: ['Damage roll', 'Damage varies randomly between 85% and 100% of its maximum, so a possible knockout can go either way.'],
    rng: ['Luck', 'Random chance: critical hits, misses, speed ties, damage rolls, secondary effects. Tag it honestly, and check whether a safer play would have avoided the risk.'],
    calc: ['Damage calculator', 'A tool that shows exact damage ranges between two Pokémon. Pokémon Showdown\'s calc is the standard one.'],
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
    ['Welcome to your training lab', `<p>Toxicroak VGC Lab turns playing into practice. Everything runs in one loop:</p>
      <ul><li><b>Play</b> your games with one focus in mind.</li><li><b>Log</b> each game in a minute.</li><li><b>Review</b> once a week to find what's costing you.</li><li><b>Study and play the training games</b> a little every day so the basics are automatic.</li><li><b>Plan</b> against the threats you keep losing to.</li></ul>
      <p class="sub">This tour takes about a minute. You can rerun it from the menu anytime.</p>`],
    ['Doubles or singles?', `<p>Pick how you play. The app changes to match: formats, drills, team checks, skills and tips. You can switch anytime with the <b>I play</b> menu at the top.</p>
      <div class="opts" style="grid-template-columns:1fr 1fr;margin-top:6px"><button type="button" class="opt" data-tourstyle="doubles"><b>Doubles</b><br><span class="sub">VGC: bring 4, lead 2. Official tournaments and Worlds.</span></button><button type="button" class="opt" data-tourstyle="singles"><b>Singles</b><br><span class="sub">Battle Stadium: bring 3, lead 1. Ranked ladder.</span></button></div>`],
    ['Your account', `<p>Create an account with just a <b>username and password</b> to keep your data safe and use it on both your phone and computer. No email needed.</p>
      <p>When you sign up you get a <b>recovery code</b>. Save it: it's the only way to reset a forgotten password. Find your account under <b>Account, backup & theme</b>.</p>`],
    ['Train: every day', `<p><b>Today</b> has your daily checklist, your focus for the week and your current format.</p>
      <p><b>Log a game</b> right after each game (press <kbd>N</kbd> on a computer). Only Win or Loss is required; tags for what lost it make Review much smarter. Paste a Showdown replay link to fill it in automatically.</p>
      <p><b>Battle companion</b> runs alongside a live game: turn counters for Tailwind, Trick Room, weather, terrain and screens, plus the opponent's team.</p>`],
    ['See your progress', `<p><b>Review</b> shows your win rate, the mistakes that cost the most games, the Pokémon you lose to and which leads work.</p>
      <p><b>Games</b> are quick training games for speed tiers, damage guesses and turn order. <b>Test</b> checks everything you've studied, on Standard, Hard or Expert. Both feed your <b>ratings</b>, and <b>Progress</b> charts them over time so you can see real improvement.</p>`],
    ['Learn the game', `<p><b>Study</b> has short drills: type matchups, speed tiers, items, abilities, priority, mechanics and common sets. Questions you miss come back until you get them.</p>
      <p><b>Meta</b> shows what's popular this month. The <b>Damage calculator</b> runs real calcs. <b>Prediction practice</b> trains your team preview reads on top players. <b>Skills</b> shows your strengths and weaknesses, and <b>Formats</b> helps you learn a new regulation fast.</p>`],
    ['Plan ahead', `<p><b>Notebook</b> holds your game plans against specific threats. <b>Team checker</b> finds shared weaknesses and missing tools in a team. <b>Teams</b> stores the teams you use.</p>
      <p><b>Tournaments</b> tracks your events and Championship Points, <b>Opponents</b> keeps notes on players you meet, and <b>Roadmap</b> shows the path to the top and where you are on it.</p>`],
    ['Tips', `<ul><li>Dotted words like <span class="term" data-term="wincon">win condition</span> explain themselves when you tap them.</li><li>Every page has a <b>How to use this page</b> section near the top.</li><li>The app updates itself: new games, Pokémon and items appear automatically each week.</li><li>On a phone, add it to your home screen to use it like an app.</li></ul>`],
  ];
  let step = 0;
  const TOUR_KEY = 'vgclab-toured2'; // bump when the tour changes so everyone sees the new one once
  let styleChanged = false;
  function renderTour() {
    $('tour-dots').innerHTML = STEPS.map((_, i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('');
    $('tour-title').textContent = STEPS[step][0];
    $('tour-body').innerHTML = STEPS[step][1];
    $('tour-back').hidden = step === 0;
    $('tour-next').textContent = step === STEPS.length - 1 ? 'Start training' : 'Next';
    const st = VL.style ? VL.style() : 'doubles';
    $('tour-body').querySelectorAll('[data-tourstyle]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tourstyle === st)));
  }
  $('tour-body').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tourstyle]'); if (!b || !VL.setStyle) return;
    if (b.dataset.tourstyle !== VL.style()) { await VL.setStyle(b.dataset.tourstyle, { noReload: true }); styleChanged = true; }
    renderTour();
  });
  function openTour() { step = 0; renderTour(); $('tour').hidden = false; $('tour-next').focus(); }
  function closeTour() {
    if ($('tour').hidden) return; $('tour').hidden = true;
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* ignore */ }
    if (styleChanged) { styleChanged = false; location.reload(); }
  }
  $('tour-next').onclick = () => { if (step < STEPS.length - 1) { step++; renderTour(); } else { closeTour(); location.hash = 'today'; } };
  $('tour-back').onclick = () => { if (step > 0) { step--; renderTour(); } };
  $('tour-skip').onclick = closeTour;
  $('tour').addEventListener('click', e => { if (e.target.id === 'tour') closeTour(); });
  document.querySelectorAll('[data-tour]').forEach(b => b.addEventListener('click', () => { VL.closeSheet && VL.closeSheet(); openTour(); }));
  VL.maybeTour = function () { let seen = '1'; try { seen = localStorage.getItem(TOUR_KEY); } catch (e) { /* ignore */ } if (!seen) openTour(); };
})();
