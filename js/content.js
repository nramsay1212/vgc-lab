/* Hand-written training content. Pokémon data comes from data/dex.json;
 * this file holds the parts that need a person to write them. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});

  // ---------- play style: doubles (VGC) or singles (Battle Stadium) ----------
  VL.style = function () {
    try { const p = VL.store && VL.store.get('meta', 'profile'); return p && p.style === 'singles' ? 'singles' : 'doubles'; } catch (e) { return 'doubles'; }
  };
  VL.isSingles = () => VL.style() === 'singles';
  const byStyle = (name, d, sg) => Object.defineProperty(VL, name, { configurable: true, enumerable: true, get: () => (VL.isSingles() ? sg : d) });

  const TAGS_D = [
    ['preview', 'Wrong bring or lead'],
    ['speed', 'Misjudged speed, Trick Room or Tailwind turns'],
    ['calc', 'Misjudged damage'],
    ['overpredict', 'Over-predicted (Protect, switch)'],
    ['predictable', 'Played too predictable'],
    ['mega', 'Gimmick timing (Mega, Tera, etc.)'],
    ['wincon', 'Traded away my win condition'],
    ['endgame', 'Endgame miscount'],
    ['info', 'Missed an item/ability reveal'],
    ['knowledge', 'Didn\'t know a mechanic or interaction'],
    ['tilt', 'Autopilot or tilt'],
    ['bo3', 'Didn\'t adapt from the last game (best of 3)'],
    ['luck', 'Bad luck (critical hit, miss, speed tie)'],
    ['matchup', 'Bad team matchup'],
  ];

  const SESSION_D = [
    { id: 'drill', t: 'Study drill or game', m: '5 min', d: 'One round in Study or one game in Games.' },
    { id: 'warm', t: 'Warm-up: calc 3 threats', m: '10 min', d: null },
    { id: 'ladder', t: 'Ladder block with your focus', m: '6–10 games', d: 'At <span class="term" data-term="preview">team preview</span>, say your <span class="term" data-term="bring4">bring-4</span>, your <span class="term" data-term="lead">lead</span>, and your <span class="term" data-term="wincon">win condition</span> before you lock in.' },
    { id: 'log', t: 'Log every game', m: '1 min each', d: 'Right after the game, while you still remember the turn it swung.' },
    { id: 'loss', t: 'Review one loss turn by turn', m: '20 min', d: 'Find the turn the game was lost. Write the play you\'d make now in that game\'s note.' },
    { id: 'study', t: 'Study top play', m: '15 min', d: 'Watch one top-cut set from a recent major event. Pause at team preview and call both players\' bring-4 and leads before they\'re shown.' },
    { id: 'bo3', t: 'Best-of-3 practice set', m: 'weekly', d: '<span class="term" data-term="bo3">Best of 3</span> against a friend or Discord partner. Adjust games 2 and 3 to what you saw in game 1.' },
    { id: 'weekly', t: 'Weekly review', m: 'Sunday', d: 'Copy the review prompt in the Review tab into Claude, add any new problem Pokémon to the notebook, and set next week\'s focus.' },
  ];

  const SKILLS_D = [
    { id: 'preview', name: 'Team preview and game plans', what: 'Choosing the right 4 and <span class="term" data-term="lead">lead</span> at <span class="term" data-term="preview">team preview</span>, and knowing your <span class="term" data-term="wincon">win condition</span> before turn 1.', drill: 'Before every game, say your bring-4, lead and win condition. Afterward, check whether the plan or the play lost it.', tags: ['preview', 'matchup'] },
    { id: 'speed', name: 'Speed control and turn order', what: 'Knowing who moves first under <span class="term" data-term="tailwind">Tailwind</span>, <span class="term" data-term="trickroom">Trick Room</span>, paralysis, Scarf and speed drops, and counting the turns left. Also called <span class="term" data-term="speedcontrol">speed control</span>.', drill: 'Study: Base Speed and Who moves first. Say the Tailwind or Trick Room turns left out loud each turn.', tags: ['speed'], study: ['basespeed', 'whofirst'] },
    { id: 'damage', name: 'Damage intuition', what: 'Knowing roughly what a hit does without a <span class="term" data-term="calc">damage calculator</span>: when something survives, when a <span class="term" data-term="spread">spread move</span> knocks something out, and when it comes down to the <span class="term" data-term="roll">damage roll</span>.', drill: 'Warm-up calcs on the Pokémon you lose to. Guess the % before checking.', tags: ['calc'], study: ['mechanics'] },
    { id: 'types', name: 'Type matchups', what: 'Instant recall of every attacking type into every typing, including dual types and immunities.', drill: 'Study: Type vs Pokémon and Find the weakness until you score 95%+.', tags: ['knowledge'], study: ['typemon', 'typebasic', 'weakness'] },
    { id: 'reads', name: 'Reads and risk', what: 'Deciding when to play safe and when to predict, based on what your opponent has to fear.', drill: 'In reviews, for each risky play ask: what did I lose if the read was wrong?', tags: ['overpredict', 'predictable'] },
    { id: 'resources', name: 'Resources and gimmick timing', what: 'When to use the <span class="term" data-term="gimmick">battle gimmick</span> (Mega, Tera, Dynamax), and protecting the Pokémon your <span class="term" data-term="wincon">win condition</span> needs.', drill: 'Before turn 1, decide which Pokémon is your win condition and what has to happen for it to win.', tags: ['mega', 'wincon'] },
    { id: 'endgame', name: 'Endgame counting', what: 'Counting HP, turns and speed to see a won or lost endgame two turns early.', drill: 'In close games, write down the endgame you expected and compare it to what happened.', tags: ['endgame'] },
    { id: 'info', name: 'Tracking information', what: 'Noticing revealed items, abilities, moves and speed orders, and using them.', drill: 'Keep a running note in best-of-3 sets: every item, ability and move each opponent revealed.', tags: ['info'] },
    { id: 'knowledge', name: 'Game knowledge', what: 'Items, abilities, priority and mechanics, so nothing surprises you.', drill: 'Study: Items, Abilities, Priority and Mechanics drills.', tags: ['knowledge'], study: ['items', 'abilities', 'priority', 'mechanics'] },
    { id: 'mental', name: 'Mental game', what: 'Playing your best game after a loss, a critical hit, or a long session.', drill: 'Stop a ladder block after 2 losses in a row tagged "autopilot or tilt".', tags: ['tilt'] },
    { id: 'adapt', name: 'Best-of-3 adaptation', what: 'Changing leads, targets and plans between games of a <span class="term" data-term="bo3">best of 3</span> based on what you learned.', drill: 'Weekly best-of-3 set. Between games, write one change and why.', tags: ['bo3'] },
    { id: 'formats', name: 'Learning new formats fast', what: 'Getting strong in a new regulation or game before everyone else does.', drill: 'Run the New format playbook in the Formats tab every time the format changes.', tags: [] },
  ];

  const MILESTONES_D = [
    ['m100', 'Log 100 games with tags'],
    ['mtypes', 'Score 95% or better on Type vs Pokémon'],
    ['mfmt3', 'Log games in 3 different formats'],
    ['mpeak', 'Match your best ever ladder finish in a new game'],
    ['mtop', 'Finish a ranked season in the top 500'],
    ['mcup', 'Top cut a League Cup'],
    ['mwin', 'Win a League Cup'],
    ['mday2', 'Make Day 2 at a Regional'],
    ['mrcut', 'Top cut a Regional'],
    ['minv', 'Earn a Worlds invite'],
    ['mwday2', 'Make Day 2 at Worlds'],
    ['mworlds', 'Top cut at Worlds'],
    ['mchamp', 'World Champion'],
  ];

  const STAGES_D = [
    { n: 'Foundations', ms: ['m100', 'mtypes'], d: 'Knowledge becomes automatic, and logging and reviewing become habits. Type matchups, speed tiers and common items should be instant.' },
    { n: 'Ladder consistency', ms: ['mfmt3', 'mpeak', 'mtop'], d: 'Finish high on ladder in several formats, not just one. Each new format, you should get strong faster than the last.' },
    { n: 'Local results', ms: ['mcup', 'mwin'], d: 'Best-of-3 experience at League Challenges and Cups. Learn to adapt between games and play well under pressure.' },
    { n: 'Major events', ms: ['mday2', 'mrcut'], d: 'Regionals and Internationals. Make Day 2, then top cut. This is where Championship Points add up.' },
    { n: 'Worlds qualification', ms: ['minv'], d: 'Earn an invite through a season of consistent results, or by winning a Regional.' },
    { n: 'Worlds contention', ms: ['mwday2', 'mworlds', 'mchamp'], d: 'Day 2 at Worlds, then top cut, then the title. Most champions got there after several Worlds runs.' },
  ];

  VL.EVENTS = [
    ['2026-12-02', 'Regulation M-C ends', 'Ranked and events move to the next ruleset. It hadn\'t been announced as of Nov 12.'],
    ['2026-12-05', 'Las Vegas Regional', 'Masters listed as sold out.'],
    ['2027-01-16', 'Atlanta Regional', 'Masters listed as sold out, so check for a waitlist.'],
    ['2027-02-06', 'Seattle Regional', ''],
    ['2027-02-19', 'Europe International (London)', ''],
    ['2027-02-27', 'San Antonio Regional', ''],
    ['2027-04-03', 'Toronto Regional', ''],
    ['2027-04-17', 'Milwaukee Regional', ''],
    ['2027-05-29', 'San Diego Regional', ''],
    ['2027-06-18', 'North America International (Chicago)', 'Biggest Championship Points event in North America.'],
    ['2027-08-13', 'World Championships (Singapore)', 'Aug 13–15.'],
  ];

  const PLAYBOOK_D = [
    ['rules', 'Read the full rules', 'Legal Pokémon and items, banned or restricted Pokémon, the battle gimmick, level, team size and timer.'],
    ['diff', 'List what changed', 'New Pokémon, items and moves, and what left. The Study tab updates to the new format automatically.'],
    ['recaps', 'Read your old recaps', 'What did you misjudge early last time? Avoid it now.'],
    ['speed', 'Learn the new speed tiers', 'Run Base Speed and Who moves first drills with this format selected, until you score 90%.'],
    ['arch', 'Map the archetypes', 'Which speed control and weather or terrain modes exist, and which top threats beat each one.'],
    ['try3', 'Play three archetypes', 'Use rentals or copied teams, about 10 games each, before you commit to one.'],
    ['watch', 'Study the first big event', 'Note the top-cut teams and leads, and write notebook cards for the 5 most common threats.'],
    ['commit', 'Pick a team and log 50 games', 'Don\'t switch until you have 50 logged games with it, so the review data means something.'],
  ];

  // ---------- singles versions (Battle Stadium Singles: bring 3 of 6) ----------
  const TAGS_S = [
    ['preview', 'Wrong bring-3 or lead'],
    ['speed', 'Misjudged speed or priority'],
    ['calc', 'Misjudged damage'],
    ['switch', 'Bad switch-in or lost momentum'],
    ['setup', 'Let them set up, or set up at the wrong time'],
    ['hazards', 'Hazards or chip damage'],
    ['overpredict', 'Over-predicted (switch, Protect)'],
    ['predictable', 'Played too predictable'],
    ['mega', 'Gimmick timing (Mega, Tera, etc.)'],
    ['wincon', 'Traded away my win condition'],
    ['endgame', 'Endgame miscount'],
    ['info', 'Missed an item/ability reveal'],
    ['knowledge', 'Didn\'t know a mechanic or interaction'],
    ['tilt', 'Autopilot or tilt'],
    ['luck', 'Bad luck (critical hit, miss, speed tie)'],
    ['matchup', 'Bad team matchup'],
  ];
  VL.ALLTAGS = [...TAGS_D, ...TAGS_S.filter(([id]) => !TAGS_D.some(([d]) => d === id))];

  const SESSION_S = [
    SESSION_D[0], SESSION_D[1],
    { id: 'ladder', t: 'Ladder block with your focus', m: '6–10 games', d: 'At <span class="term" data-term="preview">team preview</span>, say your <span class="term" data-term="bring3">bring-3</span>, your <span class="term" data-term="lead">lead</span>, and your <span class="term" data-term="wincon">win condition</span> before you lock in.' },
    SESSION_D[3], SESSION_D[4],
    { id: 'study', t: 'Study top play', m: '15 min', d: 'Watch a high-rated Battle Stadium Singles stream or replay. Pause at team preview and call both players\' bring-3 and leads before they\'re shown.' },
    { id: 'switch', t: 'Switch-in homework', m: 'weekly', d: 'Pick 3 Pokémon you fear on ladder. For each, write which of your Pokémon takes its strongest attack and what it does on the next turn.' },
    SESSION_D[7],
  ];

  const SKILLS_S = [
    { id: 'preview', name: 'Team preview and your 3', what: 'Choosing the right 3 and <span class="term" data-term="lead">lead</span> at <span class="term" data-term="preview">team preview</span>, and knowing your <span class="term" data-term="wincon">win condition</span> before turn 1.', drill: 'Before every game, say your bring-3, lead and win condition. Afterward, check whether the plan or the play lost it.', tags: ['preview', 'matchup'] },
    { id: 'speed', name: 'Speed tiers and priority', what: 'Knowing who moves first: speed tiers, Choice Scarf, paralysis, priority moves like Sucker Punch and Extreme Speed, and the occasional <span class="term" data-term="trickroom">Trick Room</span>.', drill: 'Study: Base Speed and Who moves first. Before each attack, say who moves first and why.', tags: ['speed'], study: ['basespeed', 'whofirst'] },
    { id: 'damage', name: 'Damage intuition', what: 'Knowing roughly what a hit does without a <span class="term" data-term="calc">damage calculator</span>: what survives, what takes two hits, and when it comes down to the <span class="term" data-term="roll">damage roll</span>.', drill: 'Warm-up calcs on the Pokémon you lose to. Guess the % before checking.', tags: ['calc'], study: ['mechanics'] },
    SKILLS_D[3],
    { id: 'switching', name: 'Switching and momentum', what: 'Knowing which of your Pokémon can take the hit that\'s coming, when to switch instead of attack, and using <span class="term" data-term="pivot">pivot moves</span> like U-turn and Volt Switch to keep the initiative.', drill: 'In reviews, mark every turn you switched. Was the switch-in safe, and did you get a free turn after it?', tags: ['switch', 'overpredict', 'predictable'] },
    { id: 'setup', name: 'Setting up and stopping sweepers', what: 'Spotting when a free turn lets you <span class="term" data-term="setup">set up</span> with Swords Dance, Dragon Dance or Nasty Plot, and always keeping an answer to the opponent\'s setup: priority, Haze, Roar, Encore or a faster attacker.', drill: 'At team preview, name the opponent\'s likeliest setup sweeper and the Pokémon you\'ll stop it with.', tags: ['setup', 'wincon'] },
    { id: 'hazards', name: 'Hazards and chip damage', what: '<span class="term" data-term="hazards">Entry hazards</span> like Stealth Rock and Spikes, when they\'re worth a turn in a 3-Pokémon game, and counting chip from hazards, Life Orb, Rocky Helmet and status.', drill: 'Study: Mechanics. In reviews, add up the chip each side took and ask whether it decided the game.', tags: ['hazards', 'endgame'], study: ['mechanics'] },
    { id: 'resources', name: 'Resources and gimmick timing', what: 'When to use the <span class="term" data-term="gimmick">battle gimmick</span> (Mega, Tera, Dynamax), and protecting the Pokémon your <span class="term" data-term="wincon">win condition</span> needs. With only 3 Pokémon, every one matters.', drill: 'Before turn 1, decide which Pokémon is your win condition and what has to happen for it to win.', tags: ['mega', 'wincon'] },
    { id: 'endgame', name: 'Endgame counting', what: 'Counting HP, speed and damage to see a won or lost endgame early. In 3-on-3 the endgame can start on turn 2.', drill: 'In close games, write down the endgame you expected and compare it to what happened.', tags: ['endgame'] },
    { id: 'info', name: 'Tracking information', what: 'Noticing revealed items, abilities, moves and speed (a surprise Choice Scarf, a Focus Sash) and using them.', drill: 'After every reveal, say out loud what it changes for the rest of the game.', tags: ['info'] },
    SKILLS_D[8], SKILLS_D[9], SKILLS_D[11],
  ];

  const MILESTONES_S = [
    ['m100', 'Log 100 games with tags'],
    ['mtypes', 'Score 95% or better on Type vs Pokémon'],
    ['mfmt3', 'Log games in 3 different formats'],
    ['mpeak', 'Match your best ever ladder finish in a new game'],
    ['mtop', 'Finish a ranked season in the top 500'],
    ['stop100', 'Finish a ranked season in the top 100'],
    ['sonline', 'Place well in an official online competition'],
    ['stop10', 'Finish a ranked season in the top 10'],
    ['srank1', 'Reach rank 1 on the ladder'],
  ];

  const STAGES_S = [
    STAGES_D[0], STAGES_D[1],
    { n: 'High ladder', ms: ['stop100', 'sonline'], d: 'Top 100 finishes and online competitions. Team preview reads and switching decide most games at this level.' },
    { n: 'The very top', ms: ['stop10', 'srank1'], d: 'Top 10 and rank 1. Consistency across a whole season is what gets you there.' },
  ];

  const PLAYBOOK_S = [
    ['rules', 'Read the full rules', 'Legal Pokémon and items, banned Pokémon, the battle gimmick, level, how many you bring (usually 3 of 6) and the timer.'],
    PLAYBOOK_D[1], PLAYBOOK_D[2], PLAYBOOK_D[3],
    ['arch', 'Map the archetypes', 'Which setup sweepers, Choice Scarf users, hazard setters and walls are popular, and which of them beat each other.'],
    ['try3', 'Play three styles', 'Offense, balance and something bulkier, about 10 games each, before you commit to one.'],
    ['watch', 'Study the top of the ladder', 'Watch high-rated players in the first week. Note the common bring-3 cores and write notebook cards for the 5 most common threats.'],
    PLAYBOOK_D[7],
  ];

  // plain questions for players who aren't sure which mistake it was; each "yes" ticks its tag
  const TAGQ_D = [
    ['matchup', 'At team preview, did it feel like you had almost no good way to win?'],
    ['preview', 'Once the game got going, did you wish you\'d brought or led with different Pokémon?'],
    ['speed', 'Did something move before you, or after you, when you didn\'t expect it? (Tailwind, Trick Room, priority moves, a faster set)'],
    ['calc', 'Did an attack do much more or much less damage than you thought it would?'],
    ['overpredict', 'Did you Protect, switch or target a slot expecting something that never happened?'],
    ['predictable', 'Did they seem to know exactly what you were going to do?'],
    ['mega', 'Did you Mega Evolve, Terastallize or use your gimmick on a bad turn, or save it too long?'],
    ['wincon', 'Did you lose the Pokémon you needed to win, earlier than you had to?'],
    ['endgame', 'Near the end, did you think you were winning and then run out of Pokémon or moves?'],
    ['info', 'Did their item or ability catch you out after they had already shown it?'],
    ['knowledge', 'Did something happen that you didn\'t know the game could do?'],
    ['tilt', 'Were you playing fast, frustrated or tired instead of thinking each turn through?'],
    ['bo3', 'In game 2 or 3, did you play the same way that lost the game before?'],
    ['luck', 'Did a critical hit, a miss or a speed tie decide it after you\'d made the right play?'],
  ];
  const TAGQ_S = [
    ['matchup', TAGQ_D[0][1]],
    ['preview', 'Once the game got going, did you wish you\'d brought or led with different Pokémon?'],
    ['speed', 'Did something move before you when you didn\'t expect it? (Choice Scarf, priority moves, a faster set)'],
    ['calc', TAGQ_D[3][1]],
    ['switch', 'Did a Pokémon you switched in take a huge hit, or did they keep getting free turns?'],
    ['setup', 'Did their Pokémon boost its stats and sweep, or did you boost at a bad time?'],
    ['hazards', 'Did Stealth Rock, Spikes or chip damage decide who survived?'],
    ['overpredict', 'Did you switch or attack expecting something that never happened?'],
    ['predictable', TAGQ_D[5][1]], ['mega', TAGQ_D[6][1]], ['wincon', TAGQ_D[7][1]], ['endgame', TAGQ_D[8][1]],
    ['info', TAGQ_D[9][1]], ['knowledge', TAGQ_D[10][1]], ['tilt', TAGQ_D[11][1]], ['luck', TAGQ_D[13][1]],
  ];

  byStyle('TAGS', TAGS_D, TAGS_S);
  byStyle('TAGQ', TAGQ_D, TAGQ_S);

  // Natures: each raises one stat by 10% and lowers another by 10% (HP is never touched).
  // Rows are the raised stat, columns the lowered one; where they meet on the diagonal the nature does nothing.
  const NSTATS = ['atk', 'def', 'spa', 'spd', 'spe'];
  const NSTAT_NAME = { atk: 'Attack', def: 'Defense', spa: 'Special Attack', spd: 'Special Defense', spe: 'Speed' };
  const NGRID = [
    ['Hardy', 'Lonely', 'Adamant', 'Naughty', 'Brave'],
    ['Bold', 'Docile', 'Impish', 'Lax', 'Relaxed'],
    ['Modest', 'Mild', 'Bashful', 'Rash', 'Quiet'],
    ['Calm', 'Gentle', 'Careful', 'Quirky', 'Sassy'],
    ['Timid', 'Hasty', 'Jolly', 'Naive', 'Serious'],
  ];
  const NATURES = [];
  NGRID.forEach((row, i) => row.forEach((n, j) => NATURES.push({ n, up: i === j ? null : NSTATS[i], down: i === j ? null : NSTATS[j] })));
  const natureOf = (name) => NATURES.find(x => x.n.toLowerCase() === String(name || '').toLowerCase()) || null;
  const natureText = (x) => !x || !x.up ? 'No effect on any stat' : `+${NSTAT_NAME[x.up]}, −${NSTAT_NAME[x.down]}`;
  // the jobs the common natures are picked for
  const NATURE_ROLES = [
    ['Jolly', 'A fast physical attacker that never uses special moves'],
    ['Adamant', 'A physical attacker that wants more power and already outspeeds what it needs to'],
    ['Timid', 'A fast special attacker that never uses physical moves'],
    ['Modest', 'A special attacker that wants more power and already outspeeds what it needs to'],
    ['Brave', 'A slow physical attacker for Trick Room'],
    ['Quiet', 'A slow special attacker for Trick Room'],
    ['Bold', 'A support that takes physical hits and never uses physical moves'],
    ['Calm', 'A support that takes special hits and never uses physical moves'],
    ['Impish', 'A Pokémon that takes physical hits and only uses physical moves'],
    ['Careful', 'A Pokémon that takes special hits and only uses physical moves'],
    ['Relaxed', 'A slow Trick Room setter that takes physical hits'],
    ['Sassy', 'A slow Trick Room setter that takes special hits'],
  ];
  // the whole chart, with one nature highlighted (and its row and column)
  function natureChart(highlight) {
    const h = natureOf(highlight); const ab = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
    return `<table class="natgrid"><thead><tr><th title="Rows: the stat raised. Columns: the stat lowered."><span class="mini">+ / −</span></th>${NSTATS.map(s => `<th class="${h && h.down === s ? 'hl' : ''}">−${ab[s]}</th>`).join('')}</tr></thead><tbody>${NGRID.map((row, i) => `<tr><th class="${h && h.up === NSTATS[i] ? 'hl' : ''}">+${ab[NSTATS[i]]}</th>${row.map((n, j) => `<td class="${i === j ? 'neutral' : ''} ${h && h.n === n ? 'on' : ''}">${n}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  Object.assign(VL, { NATURES, NSTAT_NAME, NATURE_ROLES, natureOf, natureText, natureChart });
  byStyle('SESSION', SESSION_D, SESSION_S);
  byStyle('SKILLS', SKILLS_D, SKILLS_S);
  byStyle('MILESTONES', MILESTONES_D, MILESTONES_S);
  byStyle('STAGES', STAGES_D, STAGES_S);
  byStyle('PLAYBOOK', PLAYBOOK_D, PLAYBOOK_S);

  /* Mechanics flashcards.
   * min: first generation the fact applies to. champ: 'only' = Champions only,
   * 'not' = mainline games but not Champions. Numbers follow Pokémon Showdown's
   * battle code. */
  VL.MECHANICS = [
    { q: 'A spread move hits two targets in doubles. How much damage does it do to each?', a: '0.75×', w: ['0.5×', '1×', '0.67×'], ex: 'Moves that hit more than one target (Heat Wave, Rock Slide, Earthquake) do 0.75× to each. If only one target is left, it does full damage.', min: 4 },
    { q: 'What is the same-type attack bonus?', a: '1.5×', w: ['1.2×', '1.3×', '2×'], ex: 'Using a move that matches one of your types gives 1.5×. Adaptability raises it to 2×.', min: 1 },
    { q: 'How much does a critical hit multiply damage in modern games?', a: '1.5×', w: ['2×', '1.25×', '3×'], ex: 'Since Generation 6, critical hits do 1.5×. Before that they did 2×.', min: 6 },
    { q: 'What does a critical hit ignore?', a: 'Reflect/Light Screen, the attacker\'s stat drops and the target\'s defense boosts', w: ['Type immunities', 'Protect and Wide Guard', 'Weather and terrain'], ex: 'A crit skips screens, any negative offensive stages on the attacker, and any positive defensive stages on the target.', min: 6 },
    { q: 'How many turns does Tailwind last?', a: '4 turns, counting the turn it\'s used', w: ['5 turns', '3 turns', '8 turns'], ex: 'Tailwind doubles your side\'s Speed for 4 turns, including the turn you set it. In practice that\'s 3 turns where you move first.', min: 5 },
    { q: 'How many turns does Trick Room last?', a: '5 turns, counting the turn it\'s used', w: ['4 turns', '3 turns', '8 turns'], ex: 'Trick Room lasts 5 turns including the turn it\'s set, so you get 4 turns of slow-first. Using it again while it\'s up ends it.', min: 4 },
    { q: 'What is Trick Room\'s priority?', a: '−7', w: ['0', '−6', '+1'], ex: 'Trick Room goes after almost everything. Prankster raises it to −6, which is still behind every normal move.', min: 4 },
    { q: 'What priority is Fake Out?', a: '+3', w: ['+1', '+2', '+4'], ex: 'Fake Out is +3 and flinches, but only on the user\'s first turn after switching in. It was +1 before Generation 5.', min: 5 },
    { q: 'What priority are Protect and Detect?', a: '+4', w: ['+3', '+5', '+2'], ex: 'Protect is +4, so it goes before Fake Out. Helping Hand (+5) is the main move above it. It was +3 before Generation 5.', min: 5 },
    { q: 'What priority are Follow Me and Rage Powder?', a: '+2', w: ['+1', '+3', '+4'], ex: 'Both redirect single-target moves to the user for the turn. They don\'t redirect spread moves. In Generation 5 both were +3.', min: 6 },
    { q: 'Which of these is NOT affected by Rage Powder?', a: 'A Grass-type attacker', w: ['A Fire-type attacker', 'A Dragon-type attacker', 'A Fairy-type attacker'], ex: 'Rage Powder is a powder move. Grass types, Overcoat and Safety Goggles ignore it. Follow Me has no such exceptions.', min: 6 },
    { q: 'What does Prankster do?', a: '+1 priority to status moves, but they fail against Dark-type opponents', w: ['+1 priority to all moves', 'Status moves can\'t miss', '+2 priority to status moves'], ex: 'Since Generation 7, a status move boosted by Prankster fails on a Dark-type target. It still works on allies and on your own side.', min: 7 },
    { q: 'What does Psychic Terrain do?', a: 'Blocks opponents\' priority moves on grounded Pokémon and boosts Psychic moves', w: ['Doubles Psychic damage', 'Prevents sleep', 'Halves Dragon damage'], ex: 'Grounded Pokémon in Psychic Terrain can\'t be hit by priority moves like Fake Out or Sucker Punch. Psychic moves from grounded users get 1.3× (1.5× in Generation 7).', min: 7 },
    { q: 'How much does terrain boost matching moves from grounded Pokémon?', a: '1.3×', w: ['1.5×', '1.2×', '2×'], ex: 'Electric, Grassy and Psychic Terrain boost matching moves by 1.3× since Generation 8. It was 1.5× in Generation 7.', min: 8 },
    { q: 'In sun, what happens to Fire and Water moves?', a: 'Fire 1.5×, Water 0.5×', w: ['Fire 2×, Water 0×', 'Fire 1.3×, Water 0.75×', 'Only Fire changes'], ex: 'Rain is the reverse: Water 1.5×, Fire 0.5×.', min: 3 },
    { q: 'How long does weather from a move or ability last?', a: '5 turns, 8 with the matching rock', w: ['Until switched out', '3 turns', '8 turns always'], ex: 'Heat Rock, Damp Rock, Smooth Rock and Icy Rock extend weather to 8 turns.', min: 6 },
    { q: 'What does sand do for Rock types?', a: '1.5× Special Defense', w: ['1.5× Defense', '1.2× Speed', 'Immunity to Water'], ex: 'Rock types get 1.5× Special Defense in sand. Non-Rock, Ground and Steel Pokémon take 1/16 chip at the end of each turn.', min: 4 },
    { q: 'What does snow do?', a: 'Ice types get 1.5× Defense, and there\'s no chip damage', w: ['Ice types get 1.5× Special Defense', 'Everyone takes 1/16 chip', 'Ice moves do 1.5×'], ex: 'Snow replaced hail in Generation 9. Blizzard can\'t miss in it.', min: 9 },
    { q: 'In doubles, how much do Reflect and Light Screen reduce damage?', a: 'About a third (0.67×)', w: ['Half (0.5×)', 'A quarter (0.75×)', 'They don\'t work in doubles'], ex: 'In singles screens halve damage. In doubles they multiply it by 2732/4096 (about 0.67×). They last 5 turns, 8 with Light Clay.', min: 5 },
    { q: 'What do Helping Hand\'s priority and boost add up to?', a: '+5 priority, 1.5× the ally\'s move', w: ['+4 priority, 2×', '+3 priority, 1.5×', '0 priority, 1.3×'], ex: 'Helping Hand has the highest priority of common doubles moves, so it boosts your ally even if the ally moves first.', min: 3 },
    { q: 'What does +1 in a stat multiply it by?', a: '1.5×', w: ['1.25×', '2×', '1.33×'], ex: 'Stages: +1 is 1.5×, +2 is 2×, +6 is 4×. −1 is 2/3×, −2 is 0.5×.', min: 3 },
    { q: 'What does −1 Speed (from Icy Wind) do to a Pokémon\'s Speed?', a: '2/3×', w: ['0.5×', '0.75×', '0.9×'], ex: 'One stage down is 2/3. Icy Wind and Electroweb drop both opponents by 1 stage.', min: 3 },
    { q: 'What does burn do?', a: 'Halves physical damage and does 1/16 max HP each turn', w: ['Halves special damage', '1/8 max HP each turn and no other effect', 'Lowers Speed by half'], ex: 'Burn halves the damage of physical moves unless the user has Guts. Since Generation 7 the chip is 1/16. Fire types can\'t be burned.', min: 7 },
    { q: 'How much does paralysis cut Speed in modern games?', a: 'Half', w: ['To a quarter', 'By a third', 'It doesn\'t affect Speed'], ex: 'Since Generation 7 paralysis halves Speed. It was a quarter before. Electric types can\'t be paralyzed.', min: 7 },
    { q: 'In Scarlet/Violet and earlier, what\'s the chance a paralyzed Pokémon can\'t move?', a: '25%', w: ['12.5%', '33%', '50%'], ex: 'Mainline games use 25% full paralysis. Pokémon Champions lowered it to 12.5%.', min: 3, champ: 'not' },
    { q: 'In Pokémon Champions, what\'s the chance a paralyzed Pokémon can\'t move?', a: '12.5% (1 in 8)', w: ['25%', '33%', '0%'], ex: 'Champions lowered full paralysis from 25% to 12.5%. Paralysis still halves Speed.', min: 9, champ: 'only' },
    { q: 'In Pokémon Champions, how long can sleep last?', a: 'At most 2 turns, with a 1 in 3 chance to wake on the second', w: ['1–3 turns, evenly', 'Exactly 2 turns', 'Up to 7 turns'], ex: 'Mainline sleep lasts 1–3 turns. Champions caps it at 2: a sleeping Pokémon usually misses 2 turns, and sometimes just 1.', min: 9, champ: 'only' },
    { q: 'In Pokémon Champions, how long can freeze last?', a: 'At most 2 turns, with a 25% thaw chance each turn', w: ['20% thaw chance with no cap', 'Exactly 3 turns', 'Until hit by a Fire move'], ex: 'Mainline freeze has a 20% thaw chance each turn and no cap. Champions thaws at 25% per turn and guarantees a thaw by the third turn.', min: 9, champ: 'only' },
    { q: 'How do Stat Points work in Pokémon Champions?', a: '66 total, up to 32 in one stat, each adds 1 at Level 50', w: ['510 effort values, 252 max per stat', '50 total, 25 max per stat', '66 total, no cap per stat'], ex: 'Champions replaces effort values with Stat Points and has no individual values, so every Pokémon has perfect stats. 32 Stat Points match 252 effort values.', min: 9, champ: 'only' },
    { q: 'What\'s the most power points (uses) any move can have in Pokémon Champions?', a: '20', w: ['32', '40', '64'], ex: 'Champions caps every move at 20 uses, which matters for long Protect-heavy games.', min: 9, champ: 'only' },
    { q: 'Using Protect twice in a row, what\'s the chance the second one works?', a: '1 in 3', w: ['1 in 2', 'Always', 'Never'], ex: 'Each consecutive successful Protect cuts the chance by 3×: 1/3, then 1/9. Using a different move resets it.', min: 6 },
    { q: 'What does Choice Scarf do?', a: '1.5× Speed, locked into the first move used', w: ['2× Speed, locked into one move', '1.5× Speed, no downside', '1.2× Speed and Attack'], ex: 'Choice Band and Choice Specs give 1.5× Attack or Sp. Atk with the same lock.', min: 4 },
    { q: 'What does Life Orb do?', a: '1.3× damage, user loses 1/10 max HP per attack', w: ['1.5× damage, 1/8 recoil', '1.2× damage, no recoil', '1.3× damage, 1/16 recoil'], ex: 'Sheer Force removes the recoil for moves with secondary effects.', min: 4 },
    { q: 'What does Assault Vest do?', a: '1.5× Special Defense, but no status moves', w: ['1.5× Defense', '1.5× Special Defense and immune to status', 'Blocks Intimidate'], ex: 'The holder can\'t select status moves like Protect, so it\'s for bulky attackers.', min: 6 },
    { q: 'When does a Sitrus Berry activate, and what does it heal?', a: 'At half HP or less; heals 1/4 max HP', w: ['At 1/4 HP; heals 1/2', 'At half HP; heals 1/3', 'End of turn; heals 1/16'], ex: 'Sitrus has healed 1/4 since Generation 4. Since Generation 8, pinch berries like Figy heal 1/3 at 1/4 HP or less.', min: 4 },
    { q: 'What breaks Focus Sash?', a: 'Multi-hit moves, or chip damage before the hit', w: ['Only critical hits', 'Being hit by a super effective move', 'Switching out'], ex: 'Sash only saves a Pokémon at full HP. Sand, a previous hit or the first hit of a multi-hit move takes it below full.', min: 4 },
    { q: 'What does Eviolite do?', a: '1.5× Defense and Special Defense for a Pokémon that can still evolve', w: ['1.5× all stats for a fully evolved Pokémon', '1.2× Defense only', 'Doubles HP'], ex: 'That\'s why Pokémon like Porygon2, Dusclops and Chansey see play.', min: 5 },
    { q: 'Two Pokémon have the exact same Speed. Who moves first?', a: 'Random, 50/50 each turn', w: ['The one that switched in first', 'The one with higher base Speed', 'The player who picked first'], ex: 'Speed ties are re-rolled each turn. This is why speed benchmarks often aim one point above a common number.', min: 1 },
    { q: 'When does a Pokémon use its Mega Evolved Speed?', a: 'On the same turn it Mega Evolves', w: ['From the next turn', 'Only after it moves', 'Never; Mega keeps the old Speed'], ex: 'Since Generation 7 (and in Champions), turn order uses the Mega form\'s Speed on the turn it evolves. In Generation 6 it used the old Speed for that turn.', min: 7 },
    { q: 'How many times can you Mega Evolve per battle?', a: 'Once', w: ['Once per Pokémon', 'Twice', 'Once every 3 turns'], ex: 'One Mega Evolution per battle, and it lasts until the Pokémon faints.', min: 6 },
    { q: 'What does Intimidate do?', a: 'Lowers the Attack of each opponent it faces by 1 when it switches in', w: ['Lowers each opponent\'s Attack by 2', 'Lowers Attack and Sp. Atk by 1', 'Makes opponents flinch'], ex: 'In doubles it hits both opponents. Defiant and Competitive punish it (+2 Attack or Sp. Atk). Since Generation 8, Inner Focus, Oblivious, Own Tempo and Scrappy block it.', min: 5},
    { q: 'Which ability blocks Intimidate in Generation 8 and later?', a: 'Inner Focus', w: ['Sturdy', 'Levitate', 'Swift Swim'], ex: 'Inner Focus, Oblivious, Own Tempo and Scrappy block Intimidate since Generation 8. Clear Body and similar abilities also block it.', min: 8 },
    { q: 'Which of these moves also hits your ally?', a: 'Earthquake', w: ['Rock Slide', 'Heat Wave', 'Dazzling Gleam'], ex: 'Earthquake, Surf, Discharge, Bulldoze and Explosion hit everything adjacent, including your ally. Rock Slide, Heat Wave and Dazzling Gleam hit only opponents.', min: 4 },
    { q: 'What does Wide Guard block?', a: 'Moves that hit more than one Pokémon, for your whole side', w: ['All moves on your side for one turn', 'Priority moves', 'Status moves'], ex: 'Wide Guard (+3) blocks spread moves like Heat Wave and Earthquake for both your Pokémon. Quick Guard (+3) blocks priority moves.', min: 5 },
    { q: 'What does Grassy Terrain do?', a: 'Heals grounded Pokémon 1/16 each turn and halves Earthquake', w: ['Boosts Grass moves 1.5× and blocks priority', 'Prevents sleep', 'Halves Dragon damage'], ex: 'It also boosts Grass moves from grounded users 1.3×, and gives Grassy Glide +1 priority.', min: 8 },
    { q: 'What does Misty Terrain do?', a: 'Grounded Pokémon can\'t get statused, and Dragon damage to them is halved', w: ['Blocks priority', 'Heals 1/16 each turn', 'Boosts Fairy moves 1.5×'], ex: 'Electric Terrain stops sleep for grounded Pokémon; Misty stops all non-volatile status.', min: 6 },
    { q: 'Which of these makes a Pokémon immune to Ground moves?', a: 'Air Balloon', w: ['Leftovers', 'Sitrus Berry', 'Safety Goggles'], ex: 'Flying types, Levitate and Air Balloon avoid Ground moves. The balloon pops when the holder is hit.', min: 5 },
    { q: 'When does Sucker Punch fail?', a: 'When the target isn\'t using an attacking move, or already moved', w: ['When the target is faster', 'When the target is Dark type', 'When used twice in a row'], ex: 'Sucker Punch (+1) needs the target to have chosen a damaging move it hasn\'t used yet.', min: 4 },
    { q: 'What priority is Extreme Speed?', a: '+2', w: ['+1', '+3', '+4'], ex: 'Extreme Speed is +2. Most other priority attacks (Aqua Jet, Sucker Punch, Bullet Punch) are +1.', min: 5 },
    { q: 'In Scarlet/Violet, what is the same-type attack bonus when you Terastallize into one of your original types?', a: '2×', w: ['1.5×', '2.5×', '1.2×'], ex: 'Tera into an original type raises that bonus to 2× (Adaptability makes it 2.25×). Tera into a new type gives 1.5× on it and keeps your original same-type bonus.', min: 9, champ: 'not' },
    { q: 'How does Dynamax work in Sword/Shield?', a: '3 turns, doubled HP, moves become Max Moves', w: ['5 turns, 1.5× HP', 'Until the Pokémon faints', '3 turns, doubled Attack'], ex: 'Once per battle. Max Moves set weather, terrain or stat changes, and Max Guard replaces Protect.', min: 8, max: 8 },
    // ---- harder cards (used by Hard and Expert tests) ----
    { hard: true, q: 'What does Unburden do?', a: 'Doubles the user\'s Speed once its held item is used up or lost', w: ['Doubles Speed as long as it holds an item', 'Raises Speed by 1 stage when it eats a berry', 'Doubles Speed after it knocks out a Pokémon'], ex: 'Unburden only activates when the item goes away (eaten, knocked off, used). Starting the battle with no item does nothing.', min: 4 },
    { hard: true, q: 'What does Weakness Policy do?', a: '+2 Attack and +2 Special Attack after being hit super effectively', w: ['+1 Attack and +1 Special Attack after any hit', '+2 Defense and +2 Special Defense after a super effective hit', 'Halves the first super effective hit'], ex: 'It is consumed when triggered. Opponents often avoid hitting the holder super effectively, or use a spread move to break it on purpose.', min: 6 },
    { hard: true, q: 'What does Clear Amulet do?', a: 'Stops other Pokémon from lowering the holder\'s stats, including Intimidate', w: ['Cures status conditions', 'Removes all stat drops at the end of the turn', 'Reflects stat drops back to the user'], ex: 'Clear Amulet works like the ability Clear Body, but as an item.', min: 9 },
    { hard: true, q: 'What does Covert Cloak do?', a: 'Blocks the added effects of opponents\' moves, like Fake Out\'s flinch', w: ['Blocks priority moves', 'Blocks spread damage', 'Hides the holder\'s item from the opponent'], ex: 'Added effects include flinches, stat drops from moves like Icy Wind, and burn or paralysis chances.', min: 9 },
    { hard: true, q: 'What does Safety Goggles do?', a: 'Immunity to powder moves like Spore and Rage Powder, and to weather damage', w: ['Immunity to being put to sleep from any source', 'Blocks Intimidate', 'Raises the accuracy of the holder\'s moves'], ex: 'Safety Goggles lets the holder ignore Rage Powder redirection and Spore. Grass types already have the same powder immunity.', min: 6 },
    { hard: true, q: 'Last Respects is used with 2 fainted teammates. What is its base power?', a: '150', w: ['100', '200', '75'], ex: 'Last Respects starts at 50 and gains 50 for every fainted Pokémon on the user\'s team.', min: 9 },
    { hard: true, q: 'What happens to Weather Ball in sun?', a: 'It becomes a 100 base power Fire-type move', w: ['It becomes a 50 base power Fire-type move', 'It doubles to 150 base power', 'It gets +1 priority'], ex: 'In any weather, Weather Ball doubles to 100 base power and takes the weather\'s type. With sun it\'s also boosted 1.5× as a Fire move.', min: 3 },
    { hard: true, q: 'What is Rock Slide\'s chance to make a target flinch?', a: '30%', w: ['10%', '20%', '50%'], ex: 'It rolls separately for each target, and only matters if the user moves before them.', min: 3 },
    { hard: true, q: 'Tailwind is up on your side and Trick Room is also up. What does Tailwind do for you?', a: 'It doubles your Speed, so you usually move later', w: ['Nothing, because Trick Room cancels Tailwind', 'It lets your side move first anyway', 'It halves your Speed'], ex: 'Trick Room reverses the order using the final Speed numbers, Tailwind included. Faster still means later.', min: 5 },
    { hard: true, q: 'Under Trick Room, what does Choice Scarf do for the holder?', a: 'It makes the holder move later', w: ['It makes the holder move first', 'Nothing, Scarf is ignored under Trick Room', 'It ends Trick Room early'], ex: 'Scarf raises Speed by 1.5×, and under Trick Room a higher Speed moves later.', min: 4 },
    { hard: true, q: 'A paralyzed Pokémon is under Trick Room. What does paralysis do to its turn order?', a: 'It now moves earlier, because it\'s slower', w: ['It now moves later', 'Nothing changes', 'It can never move first'], ex: 'Paralysis halves Speed, and Trick Room lets slower Pokémon go first.', min: 7 },
    { hard: true, q: 'What does Feint do to a Pokémon that is protecting?', a: 'Hits through and removes the Protect', w: ['It fails', 'It hits for half damage', 'It only breaks Wide Guard'], ex: 'Feint has +2 priority and lifts Protect, Detect, Wide Guard and Quick Guard for the turn.', min: 6 },
    { hard: true, q: 'Fake Out targets a grounded Pokémon in Psychic Terrain. What happens?', a: 'It fails', w: ['It hits but can\'t flinch', 'It works normally', 'It hits for half damage'], ex: 'Psychic Terrain blocks opponents\' priority moves against grounded Pokémon. Flying types and Levitate users aren\'t grounded.', min: 7 },
    { hard: true, q: 'One opponent protects from your Heat Wave. How much damage does the other opponent take?', a: '0.75×: the spread reduction still applies', w: ['Full damage', '0.5×', '1.5×'], ex: 'The spread reduction depends on how many targets the move aimed at, not how many it hit.', min: 5 },
    { hard: true, q: 'You Encore a Pokémon that just used Protect. What happens on its next turn?', a: 'It has to use Protect again, which will probably fail', w: ['It can choose any move', 'Encore fails against Protect', 'It loses its turn completely'], ex: 'Encore locks the target into its last move. A second Protect in a row only works 1 time in 3.', min: 6 },
    { hard: true, q: 'Intimidate hits a Pokémon with Mirror Armor. What happens?', a: 'The Attack drop bounces back to the Intimidate user', w: ['It\'s blocked with no other effect', 'Mirror Armor raises its own Attack', 'Nothing, Mirror Armor only stops moves'], ex: 'Mirror Armor reflects stat drops from other Pokémon, including Intimidate.', min: 8 },
    { hard: true, q: 'In rain, what is special about Thunder and Hurricane?', a: 'They never miss', w: ['They do 1.5× damage', 'They get +1 priority', 'They hit both opponents'], ex: 'In sun, Thunder and Hurricane drop to 50% accuracy instead.', min: 5 },
    { hard: true, q: 'What does Chlorophyll do in sun?', a: 'Doubles Speed', w: ['1.5× Speed', 'Raises Speed by 1 stage each turn', 'Heals 1/8 HP each turn'], ex: 'Swift Swim (rain), Sand Rush (sand) and Slush Rush (snow) work the same way.', min: 4 },
    { hard: true, q: 'Which of these moves can still hit a Pokémon behind Wide Guard?', a: 'A single-target move like Close Combat', w: ['Earthquake', 'Heat Wave', 'Rock Slide'], ex: 'Wide Guard only blocks moves that hit more than one Pokémon. Single-target moves go through.', min: 5 },
    { hard: true, q: 'Both opponents are at full HP. Your Focus Sash Pokémon is hit by a two-hit move like Dual Wingbeat. What happens?', a: 'The Sash can be broken by the first hit, and the second can knock it out', w: ['The Sash saves it from both hits', 'Multi-hit moves can\'t break a Sash', 'The Sash activates on the second hit only'], ex: 'Focus Sash only works when the Pokémon is at full HP as the hit lands, so the second hit isn\'t covered.', min: 5 },
    { q: 'What happens to Speed in Trick Room when two Pokémon tie?', a: 'Still a random 50/50', w: ['The faster one goes first', 'The slower one goes first', 'The one that set Trick Room goes first'], ex: 'Trick Room reverses the order but ties stay random.', min: 4 },
  ];
  // existing cards that belong in Hard and Expert tests too
  const HARD_Q = ['What does a critical hit ignore?', 'Which of these is NOT affected by Rage Powder?', 'What does Prankster do?', 'What does Psychic Terrain do?', 'How much does terrain boost', 'In doubles, how much do Reflect', 'Using Protect twice in a row', 'When does a Pokémon use its Mega Evolved Speed?', 'Which ability blocks Intimidate', 'What breaks Focus Sash?', 'When does Sucker Punch fail?', 'In Scarlet/Violet, what is the same-type attack bonus when you Terastallize', 'In Pokémon Champions, how long can sleep last?', 'In Pokémon Champions, how long can freeze last?', 'In Pokémon Champions, what\'s the chance a paralyzed Pokémon can\'t move?', 'What does Grassy Terrain do?', 'What does Misty Terrain do?'];
  VL.MECHANICS.forEach(c => { if (HARD_Q.some(h => c.q.startsWith(h))) c.hard = true; });
  // Cards that only matter in doubles are hidden in singles formats.
  const DBL_Q = ['A spread move hits two targets', 'What priority are Follow Me', 'Which of these is NOT affected by Rage Powder', 'In doubles, how much do Reflect', 'What do Helping Hand', 'Which of these moves also hits your ally', 'What does Wide Guard block', 'One opponent protects from your Heat Wave', 'Which of these moves can still hit a Pokémon behind Wide Guard', 'Both opponents are at full HP. Your Focus Sash'];
  VL.MECHANICS.forEach(c => { if (DBL_Q.some(h => c.q.startsWith(h))) c.dbl = 1; });
  // Singles cards go on the end so saved progress on existing cards keeps its place.
  VL.MECHANICS.push(
    { sgl: 1, q: 'How much HP does Stealth Rock take from a Pokémon that is 4× weak to Rock when it switches in?', a: 'Half (50%)', w: ['A quarter (25%)', 'An eighth (12.5%)', 'All of it'], ex: 'Stealth Rock does 1/8 of max HP times the Rock-type effectiveness: 3.125% at 0.25×, 6.25% at 0.5×, 12.5% neutral, 25% at 2× and 50% at 4×.', min: 4 },
    { sgl: 1, q: 'How much do 3 layers of Spikes take from a grounded Pokémon switching in?', a: 'A quarter of max HP', w: ['An eighth', 'A sixth', 'A third'], ex: '1 layer takes 1/8, 2 layers 1/6, 3 layers 1/4. Flying types, Levitate and Air Balloon avoid Spikes.', min: 3 },
    { sgl: 1, q: 'What do 2 layers of Toxic Spikes do?', a: 'Badly poison grounded Pokémon that switch in', w: ['Regular poison', 'Poison and lower Speed', 'Nothing more than 1 layer'], ex: '1 layer gives regular poison, 2 layers give bad poison. A grounded Poison type switching in clears them. Steel and Poison types can\'t be poisoned.', min: 4 },
    { sgl: 1, hard: true, q: 'How much damage does bad poison (from Toxic) do?', a: '1/16 of max HP the first turn, then 1/16 more each turn', w: ['1/8 every turn', '1/16 every turn', '1/4 every turn'], ex: 'Turn 1 is 1/16, turn 2 is 2/16, and so on. Switching out resets the counter. Regular poison is a flat 1/8.', min: 3 },
    { sgl: 1, q: 'What does Regenerator do?', a: 'Heals 1/3 of max HP when the Pokémon switches out', w: ['Heals 1/16 each turn', 'Heals 1/4 when it switches in', 'Heals 1/2 once it drops below half HP'], ex: 'That\'s why Regenerator Pokémon love pivoting with U-turn or switching often.', min: 5 },
    { sgl: 1, hard: true, q: 'Knock Off hits a target holding an item it can lose. What happens?', a: '1.5× damage, and the item is removed', w: ['2× damage', 'The item is removed, no extra damage', 'It gets +1 priority'], ex: 'Since Generation 6, Knock Off does 1.5× (97.5 power) when it can remove the item. Mega Stones and a few other items can\'t be knocked off.', min: 6 },
    { sgl: 1, hard: true, q: 'Since Generation 8, what does Rapid Spin do besides clearing hazards?', a: 'Raises the user\'s Speed by 1 stage', w: ['Heals 1/8 of max HP', 'Also removes the opponent\'s screens', 'Nothing else'], ex: 'It clears Stealth Rock, Spikes, Toxic Spikes, Sticky Web and binding moves from the user\'s side. It\'s a Normal move, so Ghost types are immune and block the spin.', min: 8 },
    { sgl: 1, hard: true, q: 'Since Generation 6, which hazards does Defog remove?', a: 'Hazards on both sides of the field', w: ['Only yours', 'Only the opponent\'s', 'None; it only clears weather'], ex: 'Defog also removes the target side\'s screens and lowers its evasion. Since Generation 8 it clears terrain too.', min: 6 },
    { sgl: 1, champ: 'not', q: 'What does Heavy-Duty Boots do?', a: 'The holder ignores entry hazards when it switches in', w: ['Halves hazard damage', 'Blocks Spikes only', 'Stops the holder being forced out'], ex: 'Pokémon weak to Rock, like Volcarona and Charizard, carry it so Stealth Rock doesn\'t chip them every switch. It isn\'t in Pokémon Champions.', min: 8 },
    { sgl: 1, q: 'Why are U-turn and Volt Switch so common in singles?', a: 'They deal damage, then switch the user out', w: ['They always move first', 'They can\'t miss and ignore Protect', 'They lower the target\'s Speed'], ex: 'Pivoting gets a safe Pokémon in after you see what the opponent did. Volt Switch fails into Ground types, so there\'s no switch.', min: 5 },
    { sgl: 1, q: 'What priority do Roar and Whirlwind have?', a: '−6, so they almost always move last', w: ['0', '+1', '−7'], ex: 'They force the target out to a random Pokémon, which removes stat boosts and makes it take hazard damage again.', min: 4 },
    { sgl: 1, q: 'How much HP does Substitute cost?', a: 'A quarter of max HP', w: ['A third', 'Half', 'An eighth'], ex: 'The substitute takes hits for the user and blocks most status moves. Sound moves and Infiltrator go through it since Generation 6.', min: 1 },
    { sgl: 1, q: 'How much does Leftovers heal each turn?', a: '1/16 of max HP', w: ['1/8', '1/10', '1/4'], ex: 'It heals at the end of every turn. Over a long singles game that adds up.', min: 2 },
    { sgl: 1, q: 'What does Sticky Web do?', a: 'Lowers the Speed of grounded Pokémon switching in by 1 stage', w: ['Traps Pokémon that switch in', 'Does 1/8 damage and lowers Speed', 'Lowers Speed by 2 stages'], ex: 'Only one layer. Flying types, Levitate and Air Balloon avoid it, and Defog or Rapid Spin clears it.', min: 6 },
    { sgl: 1, q: 'In singles, how much do Reflect and Light Screen reduce damage?', a: 'Half (0.5×)', w: ['About a third (0.67×)', 'A quarter (0.75×)', 'All of it for one turn'], ex: 'They last 5 turns, 8 with Light Clay. In doubles the cut is smaller (about 0.67×). Critical hits ignore screens.', min: 3 },
    { sgl: 1, hard: true, q: 'What does Magic Bounce do?', a: 'Reflects status moves like Stealth Rock and Toxic back at the user', w: ['Blocks all damage from hazards', 'Bounces back half of direct damage', 'Reflects only Taunt and Encore'], ex: 'Hazards, Toxic, Will-O-Wisp, Taunt and most other non-damaging moves aimed at it get sent back.', min: 5 },
    { sgl: 1, champ: 'not', q: 'What does Pursuit do if the target switches out?', a: 'It hits before the switch at double power', w: ['It fails', 'It hits the Pokémon coming in', 'It traps the target'], ex: 'Pursuit was removed in Generation 8, so it only matters in older singles formats.', min: 2, max: 7 },
    { sgl: 1, hard: true, q: 'A Pokémon at +2 Attack switches out. What happens to the boost?', a: 'It\'s lost', w: ['It stays for the rest of the battle', 'It drops to +1', 'It passes to the Pokémon coming in'], ex: 'Stat changes reset on switching, except through Baton Pass. That\'s why Roar, Whirlwind and Dragon Tail are good against setup sweepers.', min: 1 },
  );
})();
